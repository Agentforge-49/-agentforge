import crypto from 'node:crypto';
import { Router } from 'express';

import { decryptSecret } from '../lib/credential-vault.js';
import { supabase } from '../lib/supabase.js';
import { verifyWebhookSignature } from '../lib/webhook-signature.js';

const router = Router();
const buckets = new Map();

function rateLimited(key) {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [bucketKey, value] of buckets) {
      if (now - value.startedAt >= 60000) buckets.delete(bucketKey);
    }
  }
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= 60000) {
    buckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > 60;
}

router.post('/:path', async (req, res, next) => {
  try {
    const path = String(req.params.path || '');
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(path)) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    if (rateLimited(`${path}:${req.ip}`)) {
      return res.status(429).json({ error: 'Too many webhook requests' });
    }
    const { data: trigger, error } = await supabase
      .from('workflow_triggers')
      .select('*, workflow_trigger_secrets(*)')
      .eq('webhook_path', path)
      .eq('trigger_type', 'webhook')
      .single();
    if (error || !trigger || trigger.status !== 'active') {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    const encrypted = trigger.workflow_trigger_secrets?.[0]
      || trigger.workflow_trigger_secrets;
    if (!encrypted) return res.status(503).json({ error: 'Webhook unavailable' });
    const secret = decryptSecret(
      encrypted,
      `webhook:${trigger.user_id}:${trigger.id}`,
    );
    const timestamp = req.get('X-AgentForge-Timestamp') || '';
    const signature = req.get('X-AgentForge-Signature') || '';
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    if (!verifyWebhookSignature({ secret, timestamp, signature, rawBody })) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    const suppliedDelivery = req.get('X-AgentForge-Delivery');
    const delivery = suppliedDelivery && /^[A-Za-z0-9._:-]{1,120}$/.test(suppliedDelivery)
      ? suppliedDelivery
      : crypto.createHash('sha256').update(`${timestamp}:${signature}`).digest('hex');
    const input = typeof req.body?.input === 'string'
      ? req.body.input.trim()
      : JSON.stringify(req.body || {});
    const { data: fired, error: fireError } = await supabase.rpc('fire_workflow_trigger', {
      p_trigger_id: trigger.id,
      p_input: input,
      p_event_source: 'webhook',
      p_idempotency_key: delivery,
    });
    if (fireError) return res.status(400).json({ error: 'Webhook could not be accepted' });
    if (fired.error) return res.status(409).json({ error: 'Workflow is unavailable' });
    res.status(fired.deduplicated ? 200 : 202).json({
      accepted: true,
      deduplicated: fired.deduplicated,
      event_id: fired.event?.id,
      job_id: fired.job?.id || fired.event?.execution_job_id,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

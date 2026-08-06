import crypto from 'node:crypto';
import { Router } from 'express';

import { encryptSecret } from '../lib/credential-vault.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function publicWebhookUrl(req, path) {
  const configured = process.env.PUBLIC_API_URL?.replace(/\/$/, '');
  const base = configured || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/webhooks/${path}`;
}

function validateTrigger(body) {
  const errors = [];
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) errors.push('Trigger name must be between 1 and 100 characters');
  if (!['manual', 'webhook', 'schedule'].includes(body.trigger_type)) {
    errors.push('Trigger type must be manual, webhook, or schedule');
  }
  const workflowId = typeof body.workflow_id === 'string' ? body.workflow_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(workflowId)) errors.push('A workflow is required');
  let intervalMinutes = null;
  if (body.trigger_type === 'schedule') {
    intervalMinutes = Number(body.interval_minutes);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 43200) {
      errors.push('Schedule interval must be between 5 and 43,200 minutes');
    }
  }
  return {
    errors,
    value: {
      name,
      workflow_id: workflowId,
      trigger_type: body.trigger_type,
      interval_minutes: intervalMinutes,
    },
  };
}

async function ownedTrigger(id, userId) {
  const { data, error } = await supabase
    .from('workflow_triggers')
    .select('*, workflows(name, status)')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  return error ? null : data;
}

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('workflow_triggers')
      .select('*, workflows(name, status)')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(trigger => ({
      ...trigger,
      webhook_url: trigger.webhook_path
        ? publicWebhookUrl(req, trigger.webhook_path)
        : null,
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const validated = validateTrigger(req.body || {});
    if (validated.errors.length) {
      return res.status(400).json({ error: validated.errors[0], details: validated.errors });
    }
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, status')
      .eq('id', validated.value.workflow_id)
      .eq('user_id', req.userId)
      .single();
    if (workflowError || !workflow) return res.status(404).json({ error: 'Workflow not found' });
    if (workflow.status !== 'active') {
      return res.status(409).json({ error: 'Workflow must be active before adding a trigger' });
    }

    const id = crypto.randomUUID();
    const webhookPath = validated.value.trigger_type === 'webhook'
      ? crypto.randomBytes(18).toString('base64url')
      : null;
    const nextRunAt = validated.value.trigger_type === 'schedule'
      ? new Date(Date.now() + validated.value.interval_minutes * 60000).toISOString()
      : null;
    const insert = {
      id,
      user_id: req.userId,
      ...validated.value,
      webhook_path: webhookPath,
      next_run_at: nextRunAt,
      status: 'active',
    };
    const { data: trigger, error } = await supabase
      .from('workflow_triggers')
      .insert(insert)
      .select('*, workflows(name, status)')
      .single();
    if (error) throw error;

    let signingSecret = null;
    if (trigger.trigger_type === 'webhook') {
      try {
        signingSecret = crypto.randomBytes(32).toString('base64url');
        const encrypted = encryptSecret(
          signingSecret,
          `webhook:${req.userId}:${trigger.id}`,
        );
        const { error: secretError } = await supabase
          .from('workflow_trigger_secrets')
          .insert({
            trigger_id: trigger.id,
            user_id: req.userId,
            ciphertext: encrypted.ciphertext,
            initialization_vector: encrypted.initialization_vector,
            authentication_tag: encrypted.authentication_tag,
            key_version: encrypted.key_version,
          });
        if (secretError) throw secretError;
      } catch (secretError) {
        await supabase.from('workflow_triggers').delete().eq('id', trigger.id);
        throw secretError;
      }
    }
    return res.status(201).json({
      ...trigger,
      webhook_url: webhookPath ? publicWebhookUrl(req, webhookPath) : null,
      signing_secret: signingSecret,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/events', async (req, res, next) => {
  try {
    const trigger = await ownedTrigger(req.params.id, req.userId);
    if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
    const { data, error } = await supabase
      .from('trigger_events')
      .select('*')
      .eq('trigger_id', trigger.id)
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/fire', async (req, res, next) => {
  try {
    const trigger = await ownedTrigger(req.params.id, req.userId);
    if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
    if (trigger.trigger_type !== 'manual') {
      return res.status(409).json({ error: 'Only manual triggers can be fired here' });
    }
    const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
    const suppliedKey = req.get('Idempotency-Key') || req.body?.idempotency_key;
    const key = (typeof suppliedKey === 'string' ? suppliedKey : crypto.randomUUID())
      .trim()
      .slice(0, 160);
    if (!key) return res.status(400).json({ error: 'Idempotency key cannot be empty' });
    const { data, error } = await supabase.rpc('fire_workflow_trigger', {
      p_trigger_id: trigger.id,
      p_input: input,
      p_event_source: 'manual',
      p_idempotency_key: key,
    });
    if (error) return res.status(400).json({ error: error.message });
    if (data.error) return res.status(409).json(data);
    res.status(data.deduplicated ? 200 : 202).json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/bulk/:action(pause|resume)', async (req, res, next) => {
  try {
    const status = req.params.action === 'pause' ? 'paused' : 'active';
    const { error } = await supabase
      .from('workflow_triggers')
      .update({ status })
      .eq('user_id', req.userId)
      .neq('trigger_type', 'manual');
    if (error) throw error;
    const { data, error:listError } = await supabase
      .from('workflow_triggers')
      .select('*, workflows(name, status)')
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false });
    if (listError) throw listError;
    res.json((data || []).map(trigger => ({
      ...trigger,
      webhook_url:trigger.webhook_path ? publicWebhookUrl(req, trigger.webhook_path) : null,
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/:action(pause|resume)', async (req, res, next) => {
  try {
    const status = req.params.action === 'pause' ? 'paused' : 'active';
    const { data, error } = await supabase
      .from('workflow_triggers')
      .update({ status })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('*, workflows(name, status)')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Trigger not found' });
    res.json({
      ...data,
      webhook_url: data.webhook_path ? publicWebhookUrl(req, data.webhook_path) : null,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/rotate-secret', async (req, res, next) => {
  try {
    const trigger = await ownedTrigger(req.params.id, req.userId);
    if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
    if (trigger.trigger_type !== 'webhook') {
      return res.status(409).json({ error: 'Only webhook triggers have signing secrets' });
    }
    const signingSecret = crypto.randomBytes(32).toString('base64url');
    const encrypted = encryptSecret(
      signingSecret,
      `webhook:${req.userId}:${trigger.id}`,
    );
    const { error } = await supabase
      .from('workflow_trigger_secrets')
      .update({
        ciphertext: encrypted.ciphertext,
        initialization_vector: encrypted.initialization_vector,
        authentication_tag: encrypted.authentication_tag,
        key_version: encrypted.key_version,
        rotated_at: new Date().toISOString(),
      })
      .eq('trigger_id', trigger.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ signing_secret: signingSecret, rotated_at: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('workflow_triggers')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: 'Trigger not found' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;

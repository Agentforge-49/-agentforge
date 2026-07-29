import { Router } from 'express';

import { supabase } from '../lib/supabase.js';
import { getUsageSummary } from '../lib/usage.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function isAdmin(userId) {
  return new Set(
    String(process.env.ADMIN_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean),
  ).has(userId);
}

router.get('/', async (req, res, next) => {
  try {
    res.json(await getUsageSummary(req.userId));
  } catch (error) {
    next(error);
  }
});

router.put('/budget', async (req, res, next) => {
  try {
    const rawLimit = req.body?.monthly_cost_limit_usd;
    const limit = rawLimit === null || rawLimit === '' ? null : Number(rawLimit);
    const warningPercent = Number(req.body?.warning_percent ?? 80);
    const hardLimit = req.body?.hard_limit_enabled === true;
    if (limit !== null && (!Number.isFinite(limit) || limit < 0.01 || limit > 1_000_000)) {
      return res.status(400).json({ error:'Monthly budget must be blank or between $0.01 and $1,000,000' });
    }
    if (!Number.isInteger(warningPercent) || warningPercent < 1 || warningPercent > 100) {
      return res.status(400).json({ error:'Warning percentage must be between 1 and 100' });
    }
    if (hardLimit && limit === null) {
      return res.status(400).json({ error:'Set a monthly budget before enabling the hard limit' });
    }
    const { data, error } = await supabase
      .from('budget_policies')
      .upsert({
        user_id:req.userId,
        monthly_cost_limit_usd:limit,
        warning_percent:warningPercent,
        hard_limit_enabled:hardLimit,
        warning_acknowledged_at:null,
      }, { onConflict:'user_id' })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/budget/acknowledge', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('budget_policies')
      .update({ warning_acknowledged_at:new Date().toISOString() })
      .eq('user_id', req.userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Budget policy not found' });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/plan-request', async (req, res, next) => {
  try {
    const planKey = req.body?.plan_key;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!['pro', 'enterprise'].includes(planKey)) {
      return res.status(400).json({ error:'Choose Pro or Enterprise' });
    }
    if (note.length > 1000) return res.status(400).json({ error:'Note must be 1,000 characters or fewer' });
    const { data:pending } = await supabase
      .from('plan_change_requests')
      .select('id')
      .eq('user_id', req.userId)
      .eq('requested_plan_key', planKey)
      .eq('status', 'pending')
      .maybeSingle();
    if (pending) return res.status(409).json({ error:'A request for this plan is already pending' });
    const { data, error } = await supabase
      .from('plan_change_requests')
      .insert({
        user_id:req.userId,
        requested_plan_key:planKey,
        note:note || null,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/plan-request/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('plan_change_requests')
      .update({ status:'cancelled' })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Pending plan request not found' });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/overrides', async (req, res, next) => {
  try {
    if (!isAdmin(req.userId)) return res.status(403).json({ error:'Admin access required' });
    const [{ data:entitlements, error }, { data:audit, error:auditError }] = await Promise.all([
      supabase.from('user_entitlements')
        .select('*, profiles(username, full_name)')
        .order('updated_at', { ascending:false }).limit(200),
      supabase.from('entitlement_override_audit')
        .select('*').order('created_at', { ascending:false }).limit(200),
    ]);
    if (error || auditError) throw error || auditError;
    res.json({ entitlements:entitlements || [], audit:audit || [] });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/override', async (req, res, next) => {
  try {
    if (!isAdmin(req.userId)) return res.status(403).json({ error:'Admin access required' });
    const targetUserId = String(req.body?.user_id || '');
    const planKey = req.body?.plan_key;
    const status = req.body?.status || 'active';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const overrideLimits = req.body?.override_limits || {};
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
      return res.status(400).json({ error:'A valid target user is required' });
    }
    if (!['free', 'pro', 'enterprise'].includes(planKey)) {
      return res.status(400).json({ error:'Plan is invalid' });
    }
    if (!['active', 'trialing', 'grace', 'suspended', 'expired'].includes(status)) {
      return res.status(400).json({ error:'Entitlement status is invalid' });
    }
    if (reason.length < 3 || reason.length > 1000) {
      return res.status(400).json({ error:'Reason must be between 3 and 1,000 characters' });
    }
    if (!overrideLimits || typeof overrideLimits !== 'object' || Array.isArray(overrideLimits)) {
      return res.status(400).json({ error:'Override limits must be an object' });
    }
    const allowedLimits = new Set([
      'model_calls', 'tokens', 'estimated_cost_usd',
      'agents', 'workflows', 'marketplace_installs',
    ]);
    const cleanLimits = {};
    for (const [key, value] of Object.entries(overrideLimits)) {
      if (!allowedLimits.has(key) || !Number.isFinite(Number(value)) || Number(value) < 0) {
        return res.status(400).json({ error:`Invalid override limit: ${key}` });
      }
      cleanLimits[key] = Number(value);
    }
    const { data:previous, error:previousError } = await supabase
      .from('user_entitlements').select('*').eq('user_id', targetUserId).single();
    if (previousError || !previous) return res.status(404).json({ error:'Target entitlement not found' });
    const { data:updated, error:updateError } = await supabase
      .from('user_entitlements')
      .update({
        plan_key:planKey,
        status,
        source:'admin',
        override_limits:cleanLimits,
        effective_at:new Date().toISOString(),
        expires_at:req.body?.expires_at || null,
      })
      .eq('user_id', targetUserId)
      .select()
      .single();
    if (updateError) throw updateError;
    const { error:auditError } = await supabase
      .from('entitlement_override_audit')
      .insert({
        target_user_id:targetUserId,
        actor_user_id:req.userId,
        previous_entitlement:previous,
        new_entitlement:updated,
        reason,
      });
    if (auditError) {
      await supabase.from('user_entitlements').update({
        plan_key:previous.plan_key,
        status:previous.status,
        source:previous.source,
        override_limits:previous.override_limits,
        effective_at:previous.effective_at,
        expires_at:previous.expires_at,
      }).eq('user_id', targetUserId);
      throw auditError;
    }
    await supabase.rpc('refresh_legacy_usage_counters');
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router } from 'express';

import { getUsageSummary } from '../lib/usage.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [{ data:profile, error }, usage] = await Promise.all([
      supabase.from('profiles')
        .select('id, username, full_name, avatar_url, created_at, updated_at')
        .eq('id', req.userId)
        .single(),
      getUsageSummary(req.userId),
    ]);
    if (error) throw error;
    res.json({
      profile,
      email:req.user.email,
      usage:{
        plan:usage.plan?.name || usage.entitlement?.plan_key || 'Free',
        used:Number(usage.period?.model_calls || 0),
        limit:Number(usage.limits?.model_calls || 0),
        percentage:Number(usage.percentages?.model_calls || 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const fullName = typeof req.body?.full_name === 'string'
      ? req.body.full_name.trim() : '';
    if (fullName.length < 2 || fullName.length > 100) {
      return res.status(400).json({ error:'Full name must be 2 to 100 characters' });
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name:fullName })
      .eq('id', req.userId)
      .select('id, username, full_name, avatar_url, created_at, updated_at')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/account', async (req, res, next) => {
  try {
    if (req.body?.confirmation !== 'DELETE MY ACCOUNT') {
      return res.status(400).json({ error:'Type DELETE MY ACCOUNT to confirm' });
    }
    const { count, error:organizationError } = await supabase
      .from('organizations')
      .select('id', { count:'exact', head:true })
      .eq('owner_user_id', req.userId);
    if (organizationError) throw organizationError;
    if (count) {
      return res.status(409).json({
        error:'Delete or transfer every organization you own before deleting your account',
      });
    }
    const { error:purgeError } = await supabase.rpc(
      'purge_billing_sandbox_user',
      { p_user_id:req.userId },
    );
    if (purgeError) {
      return res.status(409).json({
        error:'This account has billing records that require support-assisted deletion',
      });
    }
    const { error } = await supabase.auth.admin.deleteUser(req.userId);
    if (error) {
      const accountError = new Error('Account deletion is blocked by retained audit records');
      accountError.status = 409;
      throw accountError;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;

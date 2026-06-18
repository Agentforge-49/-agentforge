import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/stats', async (req, res, next) => {
  try {
    const [total, active, runs, profile] = await Promise.all([
      supabase.from('agents').select('id', { count: 'exact', head: true }).eq('user_id', req.userId),
      supabase.from('agents').select('id', { count: 'exact', head: true }).eq('user_id', req.userId).eq('status', 'active'),
      supabase.from('agent_runs').select('id', { count: 'exact', head: true }).eq('user_id', req.userId),
      supabase.from('profiles').select('api_calls_used, api_calls_limit').eq('id', req.userId).single()
    ]);

    return res.status(200).json({
      total_agents: total.count || 0,
      active_agents: active.count || 0,
      total_runs: runs.count || 0,
      api_calls_used: profile.data?.api_calls_used || 0,
      api_calls_limit: profile.data?.api_calls_limit || 50
    });
  } catch (err) { next(err); }
});

export default router;

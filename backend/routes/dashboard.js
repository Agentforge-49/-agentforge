import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalAgentsRes,
      activeAgentsRes,
      totalRunsRes,
      profileRes,
      totalChainsRes,
      totalChainRunsRes
    ] = await Promise.all([
      supabase.from('agents').select('id', { count: 'exact', head: true }).eq('user_id', req.userId),
      supabase.from('agents').select('id', { count: 'exact', head: true }).eq('user_id', req.userId).eq('status', 'active'),
      supabase.from('agent_runs').select('id', { count: 'exact', head: true }).eq('user_id', req.userId),
      supabase.from('profiles').select('api_calls_used, api_calls_limit').eq('id', req.userId).single(),
      supabase.from('agent_chains').select('id', { count: 'exact', head: true }).eq('user_id', req.userId),
      supabase.from('chain_runs').select('id', { count: 'exact', head: true }).eq('user_id', req.userId)
    ]);

    if (totalAgentsRes.error) throw totalAgentsRes.error;
    if (activeAgentsRes.error) throw activeAgentsRes.error;
    if (totalRunsRes.error) throw totalRunsRes.error;
    if (profileRes.error) throw profileRes.error;
    if (totalChainsRes.error) throw totalChainsRes.error;
    if (totalChainRunsRes.error) throw totalChainRunsRes.error;

    return res.status(200).json({
      total_agents: totalAgentsRes.count || 0,
      active_agents: activeAgentsRes.count || 0,
      total_runs: totalRunsRes.count || 0,
      api_calls_used: profileRes.data ? profileRes.data.api_calls_used : 0,
      api_calls_limit: profileRes.data ? profileRes.data.api_calls_limit : 50,
      total_chains: totalChainsRes.count || 0,
      total_chain_runs: totalChainRunsRes.count || 0
    });
  } catch (err) {
    next(err);
  }
});

export default router;
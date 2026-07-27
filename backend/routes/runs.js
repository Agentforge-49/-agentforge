import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { data: runs, error } = await supabase
      .from('agent_runs')
      .select('*, agents (name), agent_versions (version_number)')
      .eq('user_id', req.userId)
      .order('started_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return res.status(200).json(runs.map(r => ({
      ...r,
      agent_name: r.agents?.name || 'Unknown',
      agent_version_number: r.agent_versions?.version_number || null,
      agents: undefined,
      agent_versions: undefined,
    })));
  } catch (err) { next(err); }
});

router.get('/agent/:id', async (req, res, next) => {
  try {
    const { data: check } = await supabase.from('agents').select('id').eq('id', req.params.id).eq('user_id', req.userId).single();
    if (!check) return res.status(404).json({ error: 'Agent not found' });
    const { data: runs, error } = await supabase
      .from('agent_runs')
      .select('*, agent_versions (version_number)')
      .eq('agent_id', req.params.id)
      .eq('user_id', req.userId)
      .order('started_at', { ascending: false });
    if (error) throw error;
    return res.status(200).json(runs.map(run => ({
      ...run,
      agent_version_number: run.agent_versions?.version_number || null,
      agent_versions: undefined,
    })));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data: run, error } = await supabase
      .from('agent_runs')
      .select('*, agents (name), agent_versions (version_number)')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (error || !run) return res.status(404).json({ error: 'Run trace not found' });
    return res.status(200).json({
      ...run,
      agent_name: run.agents?.name || 'Unknown',
      agent_version_number: run.agent_versions?.version_number || null,
      agents: undefined,
      agent_versions: undefined,
    });
  } catch (err) { next(err); }
});

export default router;

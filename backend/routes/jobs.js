import { Router } from 'express';

import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('execution_jobs')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data: job, error } = await supabase
      .from('execution_jobs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (error || !job) return res.status(404).json({ error: 'Job not found' });

    const table = job.job_type === 'agent_run' ? 'agent_runs' : 'workflow_runs';
    const { data: resource } = await supabase
      .from(table)
      .select('*')
      .eq('id', job.resource_id)
      .eq('user_id', req.userId)
      .single();
    return res.json({ ...job, resource });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const { data: job, error } = await supabase
      .from('execution_jobs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (error || !job) return res.status(404).json({ error: 'Job not found' });
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) {
      return res.status(409).json({ error: `Job is already ${job.status}` });
    }

    const queued = ['queued', 'retry_wait'].includes(job.status);
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('execution_jobs')
      .update({
        cancel_requested_at: now,
        ...(queued ? {
          status: 'cancelled',
          completed_at: now,
          error_message: 'Cancelled by user',
        } : {}),
      })
      .eq('id', job.id)
      .eq('user_id', req.userId)
      .select()
      .single();
    if (updateError) throw updateError;

    if (queued) {
      const table = job.job_type === 'agent_run' ? 'agent_runs' : 'workflow_runs';
      await supabase.from(table).update({
        status: 'cancelled',
        error_message: 'Cancelled by user',
        completed_at: now,
      }).eq('id', job.resource_id).eq('user_id', req.userId);
    }
    return res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;

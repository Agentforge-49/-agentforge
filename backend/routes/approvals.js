import { Router } from 'express';

import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status;
    let query = supabase
      .from('approval_requests')
      .select('*, workflows(name), workflow_runs(status, input_text), execution_jobs(status)')
      .eq('user_id', req.userId)
      .order('requested_at', { ascending:false })
      .limit(100);
    if (status && [
      'pending', 'approved', 'edited', 'rejected', 'expired', 'cancelled',
    ].includes(status)) {
      query = query.eq('status', status);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/decide', async (req, res, next) => {
  try {
    const decision = typeof req.body?.decision === 'string'
      ? req.body.decision.trim() : '';
    const editedInput = typeof req.body?.edited_input === 'string'
      ? req.body.edited_input : null;
    const note = typeof req.body?.note === 'string' ? req.body.note : null;
    const { data, error } = await supabase.rpc('resolve_workflow_approval', {
      p_approval_id:req.params.id,
      p_user_id:req.userId,
      p_decision:decision,
      p_edited_input:editedInput,
      p_note:note,
    });
    if (error) {
      const status = /not found/i.test(error.message) ? 404 : 409;
      return res.status(status).json({ error:error.message });
    }
    res.json(data);
  } catch (error) {
    next(error);
  }
});

export default router;

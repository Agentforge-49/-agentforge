import crypto from 'node:crypto';
import { Router } from 'express';

import { validateEvaluationCases } from '../lib/evaluations.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { assertUsageAllowance } from '../lib/usage.js';

const router = Router();
router.use(requireAuth);

function suiteInput(body) {
  const errors = [];
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const agentId = typeof body?.agent_id === 'string' ? body.agent_id.trim() : '';
  const threshold = Number(body?.gate_threshold ?? 80);
  if (!name || name.length > 100) errors.push('Suite name must be between 1 and 100 characters');
  if (description.length > 500) errors.push('Description must be 500 characters or fewer');
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) errors.push('A valid agent is required');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    errors.push('Gate threshold must be between 0 and 100');
  }
  const cases = validateEvaluationCases(body?.cases);
  errors.push(...cases.errors);
  return {
    errors,
    value:errors.length ? null : {
      name,
      description:description || null,
      agent_id:agentId,
      gate_threshold:threshold,
      cases:cases.value,
    },
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('evaluation_suites')
      .select(`
        *,
        agents(name, published_version_id),
        evaluation_cases(*),
        evaluation_runs(
          id, status, baseline_score, candidate_score, gate_passed,
          baseline_version_id, candidate_version_id, promoted_at, created_at
        )
      `)
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false });
    if (error) throw error;
    res.json((data || []).map(suite => ({
      ...suite,
      evaluation_cases:(suite.evaluation_cases || []).sort(
        (left, right) => left.created_at.localeCompare(right.created_at),
      ),
      evaluation_runs:(suite.evaluation_runs || []).sort(
        (left, right) => right.created_at.localeCompare(left.created_at),
      ),
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const validated = suiteInput(req.body);
    if (validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0], details:validated.errors });
    }
    const { data:agent, error:agentError } = await supabase
      .from('agents')
      .select('id')
      .eq('id', validated.value.agent_id)
      .eq('user_id', req.userId)
      .single();
    if (agentError || !agent) return res.status(404).json({ error:'Agent not found' });
    const { cases, ...suiteFields } = validated.value;
    const { data:suite, error } = await supabase
      .from('evaluation_suites')
      .insert({ user_id:req.userId, ...suiteFields })
      .select()
      .single();
    if (error) throw error;
    const { data:createdCases, error:caseError } = await supabase
      .from('evaluation_cases')
      .insert(cases.map(item => ({ ...item, suite_id:suite.id, user_id:req.userId })))
      .select();
    if (caseError) {
      await supabase.from('evaluation_suites').delete().eq('id', suite.id);
      throw caseError;
    }
    res.status(201).json({ ...suite, evaluation_cases:createdCases || [] });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('evaluation_suites')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error:'Evaluation suite not found' });
    res.json({ success:true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/run', async (req, res, next) => {
  try {
    const { count, error:countError } = await supabase
      .from('evaluation_cases')
      .select('id', { count:'exact', head:true })
      .eq('suite_id', req.params.id)
      .eq('user_id', req.userId);
    if (countError) throw countError;
    try {
      await assertUsageAllowance(req.userId, (count || 0) * 2);
    } catch (error) {
      return res.status(429).json({ error:error.message, allowance:error.allowance });
    }
    const key = req.get('Idempotency-Key') || req.body?.idempotency_key
      || `evaluation:${req.params.id}:${crypto.randomUUID()}`;
    const { data, error } = await supabase.rpc('enqueue_evaluation_run', {
      p_user_id:req.userId,
      p_suite_id:req.params.id,
      p_baseline_version_id:req.body?.baseline_version_id,
      p_candidate_version_id:req.body?.candidate_version_id,
      p_idempotency_key:key,
    });
    if (error) {
      const status = /not found/i.test(error.message) ? 404 : 409;
      return res.status(status).json({ error:error.message });
    }
    res.status(data.deduplicated ? 200 : 202).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/runs/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('evaluation_runs')
      .select(`
        *,
        evaluation_suites(name, agent_id),
        evaluation_results(
          *,
          evaluation_cases(name, input_text, expected_output, assertion_type, weight)
        ),
        baseline:agent_versions!evaluation_runs_baseline_version_id_fkey(
          id, version_number, model, change_summary
        ),
        candidate:agent_versions!evaluation_runs_candidate_version_id_fkey(
          id, version_number, model, change_summary
        )
      `)
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (error || !data) return res.status(404).json({ error:'Evaluation run not found' });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/runs/:id/promote', async (req, res, next) => {
  try {
    const { data:run, error } = await supabase
      .from('evaluation_runs')
      .select('*, evaluation_suites(agent_id)')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (error || !run) return res.status(404).json({ error:'Evaluation run not found' });
    if (run.status !== 'completed') {
      return res.status(409).json({ error:'Evaluation run is not complete' });
    }
    if (!run.gate_passed) {
      return res.status(409).json({ error:'Candidate did not pass the promotion gate' });
    }
    if (run.promoted_at) return res.status(409).json({ error:'Candidate was already promoted' });
    const { data:version, error:promotionError } = await supabase.rpc('rollback_agent_version', {
      p_agent_id:run.evaluation_suites.agent_id,
      p_user_id:req.userId,
      p_source_version_id:run.candidate_version_id,
      p_change_summary:`Promoted by evaluation gate ${run.id}`,
    });
    if (promotionError) throw promotionError;
    const { data:updated, error:updateError } = await supabase
      .from('evaluation_runs')
      .update({ promoted_version_id:version.id, promoted_at:new Date().toISOString() })
      .eq('id', run.id)
      .eq('user_id', req.userId)
      .select()
      .single();
    if (updateError) throw updateError;
    res.status(201).json({ run:updated, version });
  } catch (error) {
    next(error);
  }
});

export default router;

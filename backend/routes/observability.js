import crypto from 'node:crypto';
import { Router } from 'express';

import { redactTelemetry } from '../lib/observability.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const STATUSES = new Set([
  'queued', 'running', 'retry_wait', 'waiting_approval',
  'succeeded', 'failed', 'cancelled',
]);
const TYPES = new Set([
  'agent_run', 'workflow_run', 'evaluation_run', 'multi_agent_run',
]);

function applyFilters(query, req) {
  if (STATUSES.has(req.query.status)) query = query.eq('status', req.query.status);
  if (TYPES.has(req.query.type)) query = query.eq('run_type', req.query.type);
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    query = query.ilike('resource_name', `%${req.query.q.trim().slice(0, 100)}%`);
  }
  if (req.query.from && !Number.isNaN(Date.parse(req.query.from))) {
    query = query.gte('created_at', new Date(req.query.from).toISOString());
  }
  if (req.query.to && !Number.isNaN(Date.parse(req.query.to))) {
    query = query.lte('created_at', new Date(req.query.to).toISOString());
  }
  return query;
}

router.get('/metrics', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('run_observability')
      .select('status, tokens_used, estimated_cost_usd, duration_ms, created_at')
      .eq('user_id', req.userId)
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('created_at', { ascending:false })
      .limit(1000);
    if (error) throw error;
    const rows = data || [];
    const finished = rows.filter(row => Number.isFinite(row.duration_ms));
    const successful = rows.filter(row => row.status === 'succeeded').length;
    const failed = rows.filter(row => row.status === 'failed').length;
    const sortedDurations = finished.map(row => row.duration_ms).sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sortedDurations.length * 0.95) - 1);
    const byDay = new Map();
    for (const row of rows) {
      const day = row.created_at.slice(0, 10);
      const bucket = byDay.get(day) || { date:day, runs:0, failed:0, tokens:0, cost:0 };
      bucket.runs += 1;
      bucket.failed += row.status === 'failed' ? 1 : 0;
      bucket.tokens += row.tokens_used || 0;
      bucket.cost += Number(row.estimated_cost_usd) || 0;
      byDay.set(day, bucket);
    }
    res.json({
      period_days:30,
      runs:rows.length,
      successful,
      failed,
      success_rate:rows.length ? Number(((successful / rows.length) * 100).toFixed(1)) : 0,
      tokens:rows.reduce((sum, row) => sum + (row.tokens_used || 0), 0),
      estimated_cost_usd:Number(rows.reduce(
        (sum, row) => sum + (Number(row.estimated_cost_usd) || 0), 0,
      ).toFixed(6)),
      average_duration_ms:finished.length ? Math.round(
        finished.reduce((sum, row) => sum + row.duration_ms, 0) / finished.length,
      ) : 0,
      p95_duration_ms:sortedDurations[p95Index] || 0,
      daily:[...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(item => ({
        ...item,
        cost:Number(item.cost.toFixed(6)),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/export', async (req, res, next) => {
  try {
    let query = supabase
      .from('run_observability')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false })
      .limit(1000);
    query = applyFilters(query, req);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []).map(redactTelemetry);
    if (req.query.format !== 'csv') return res.json({ exported_at:new Date().toISOString(), runs:rows });
    const columns = [
      'execution_job_id', 'run_type', 'status', 'resource_name', 'model',
      'tokens_used', 'estimated_cost_usd', 'duration_ms', 'started_at',
      'completed_at', 'created_at',
    ];
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [
      columns.join(','),
      ...rows.map(row => columns.map(column => escape(row[column])).join(',')),
    ].join('\n');
    res.set({
      'Content-Type':'text/csv; charset=utf-8',
      'Content-Disposition':`attachment; filename="agentforge-runs-${Date.now()}.csv"`,
    }).send(csv);
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    let query = supabase
      .from('run_observability')
      .select('*', { count:'exact' })
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false })
      .range((page - 1) * limit, page * limit - 1);
    query = applyFilters(query, req);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ runs:(data || []).map(redactTelemetry), page, limit, total:count || 0 });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { data:summary, error } = await supabase
      .from('run_observability')
      .select('*')
      .eq('execution_job_id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (error || !summary) return res.status(404).json({ error:'Observed run not found' });
    const [{ data:job }, { data:events }] = await Promise.all([
      supabase.from('execution_jobs').select('*')
        .eq('id', req.params.id).eq('user_id', req.userId).single(),
      supabase.from('run_events').select('*')
        .eq('execution_job_id', req.params.id).eq('user_id', req.userId)
        .order('created_at').order('id'),
    ]);
    let resource = null;
    let steps = [];
    if (job?.job_type === 'agent_run') {
      const result = await supabase.from('agent_runs').select('*')
        .eq('id', job.resource_id).eq('user_id', req.userId).single();
      resource = result.data;
    } else if (job?.job_type === 'workflow_run') {
      const [runResult, stepResult] = await Promise.all([
        supabase.from('workflow_runs').select('*')
          .eq('id', job.resource_id).eq('user_id', req.userId).single(),
        supabase.from('workflow_step_runs').select('*')
          .eq('workflow_run_id', job.resource_id).eq('user_id', req.userId)
          .order('sequence_number'),
      ]);
      resource = runResult.data;
      steps = stepResult.data || [];
    } else if (job?.job_type === 'evaluation_run') {
      const result = await supabase.from('evaluation_runs')
        .select('*, evaluation_results(*, evaluation_cases(name, assertion_type, expected_output))')
        .eq('id', job.resource_id).eq('user_id', req.userId).single();
      resource = result.data;
    } else if (job?.job_type === 'multi_agent_run') {
      const [runResult, taskResult] = await Promise.all([
        supabase.from('multi_agent_runs').select('*')
          .eq('id', job.resource_id).eq('user_id', req.userId).single(),
        supabase.from('multi_agent_tasks').select('*, agents(name)')
          .eq('multi_agent_run_id', job.resource_id).eq('user_id', req.userId)
          .order('task_order'),
      ]);
      resource = runResult.data;
      steps = taskResult.data || [];
    }
    res.json(redactTelemetry({ summary, job, events:events || [], resource, steps }));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/replay', async (req, res, next) => {
  try {
    const { data:job, error } = await supabase
      .from('execution_jobs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (error || !job) return res.status(404).json({ error:'Run not found' });
    if (!['succeeded', 'failed', 'cancelled'].includes(job.status)) {
      return res.status(409).json({ error:'Only finished runs can be replayed' });
    }
    const key = `replay:${job.id}:${crypto.randomUUID()}`;
    let result;
    let rpcError;
    if (job.job_type === 'agent_run') {
      ({ data:result, error:rpcError } = await supabase.rpc('enqueue_agent_run', {
        p_user_id:req.userId,
        p_agent_id:job.payload.agent_id,
        p_message:job.payload.message,
        p_idempotency_key:key,
      }));
    } else if (job.job_type === 'workflow_run') {
      ({ data:result, error:rpcError } = await supabase.rpc('enqueue_workflow_run', {
        p_user_id:req.userId,
        p_workflow_id:job.payload.workflow_id,
        p_input:job.payload.input,
        p_idempotency_key:key,
      }));
    } else if (job.job_type === 'evaluation_run') {
      ({ data:result, error:rpcError } = await supabase.rpc('enqueue_evaluation_run', {
        p_user_id:req.userId,
        p_suite_id:job.payload.suite_id,
        p_baseline_version_id:job.payload.baseline_version_id,
        p_candidate_version_id:job.payload.candidate_version_id,
        p_idempotency_key:key,
      }));
    } else {
      ({ data:result, error:rpcError } = await supabase.rpc('enqueue_multi_agent_run', {
        p_user_id:req.userId,
        p_system_id:job.payload.system_id,
        p_input:job.payload.input,
        p_idempotency_key:key,
      }));
    }
    if (rpcError) return res.status(409).json({ error:rpcError.message });
    res.status(202).json({ ...result, replayed_from:job.id });
  } catch (error) {
    next(error);
  }
});

export default router;

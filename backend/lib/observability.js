import { supabase } from './supabase.js';

const SECRET_KEY = /(^|[_-])(authorization|cookie|password|secret|token|api[_-]?key|ciphertext|authentication[_-]?tag)($|[_-])/i;
const SECRET_VALUE = /(\bBearer\s+)[^\s",}]+|(\b(?:sk|xox|re)_[A-Za-z0-9_-]{8,})/gi;
const DEFAULT_COST_PER_MILLION = {
  'claude-sonnet-4-6':9,
  'claude-opus-4-6':45,
};

function safeRates() {
  try {
    return {
      ...DEFAULT_COST_PER_MILLION,
      ...JSON.parse(process.env.MODEL_COST_PER_MILLION_TOKENS || '{}'),
    };
  } catch {
    return DEFAULT_COST_PER_MILLION;
  }
}

function redactString(value) {
  return value
    .slice(0, 10000)
    .replace(SECRET_VALUE, (_match, bearer) => bearer ? `${bearer}[REDACTED]` : '[REDACTED]');
}

export function redactTelemetry(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) {
    return value.slice(0, 100).map(item => redactTelemetry(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).slice(0, 100).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) ? '[REDACTED]' : redactTelemetry(item, depth + 1),
      ]),
    );
  }
  return value;
}

export function estimateCostUsd(tokens, model) {
  const safeTokens = Math.max(0, Number(tokens) || 0);
  const rate = Math.max(0, Number(safeRates()[model]) || 0);
  return Number(((safeTokens / 1_000_000) * rate).toFixed(6));
}

export function structuredError(error) {
  const message = redactString(String(error?.message || 'Unknown execution error'));
  const code = String(error?.code || 'EXECUTION_ERROR').slice(0, 80);
  const lower = `${code} ${message}`.toLowerCase();
  let category = 'execution';
  if (lower.includes('cancel')) category = 'cancelled';
  else if (lower.includes('timeout') || lower.includes('exceeded')) category = 'timeout';
  else if (lower.includes('rate') || lower.includes('429')) category = 'rate_limit';
  else if (lower.includes('unauthorized') || lower.includes('credential') || lower.includes('401')) category = 'authentication';
  else if (lower.includes('network') || lower.includes('fetch') || lower.includes('dns')) category = 'network';
  else if (lower.includes('invalid') || lower.includes('required') || lower.includes('unsupported')) category = 'validation';
  return {
    code,
    category,
    message,
    retryable:['timeout', 'rate_limit', 'network'].includes(category),
  };
}

async function resourceDetails(job) {
  if (job.job_type === 'agent_run') {
    const { data:agent } = await supabase
      .from('agents')
      .select('name')
      .eq('id', job.payload?.agent_id)
      .eq('user_id', job.user_id)
      .single();
    const { data:version } = await supabase
      .from('agent_versions')
      .select('model')
      .eq('id', job.payload?.agent_version_id)
      .eq('user_id', job.user_id)
      .single();
    return { name:agent?.name || 'Agent run', model:version?.model || null };
  }
  if (job.job_type === 'workflow_run') {
    const { data:workflow } = await supabase
      .from('workflows')
      .select('name')
      .eq('id', job.payload?.workflow_id)
      .eq('user_id', job.user_id)
      .single();
    return { name:workflow?.name || 'Workflow run', model:null };
  }
  if (job.job_type === 'multi_agent_run') {
    const { data:system } = await supabase
      .from('multi_agent_systems')
      .select('name')
      .eq('id', job.payload?.system_id)
      .eq('user_id', job.user_id)
      .single();
    return { name:system?.name || 'Multi-agent run', model:null };
  }
  const { data:suite } = await supabase
    .from('evaluation_suites')
    .select('name')
    .eq('id', job.payload?.suite_id)
    .eq('user_id', job.user_id)
    .single();
  return { name:suite?.name || 'Evaluation run', model:null };
}

export async function recordRunEvent(job, event) {
  const payload = {
    execution_job_id:job.id,
    user_id:job.user_id,
    event_type:String(event.event_type || 'run.event').slice(0, 80),
    level:event.level || 'info',
    status:event.status || null,
    message:String(event.message || 'Run event').slice(0, 1000),
    node_id:event.node_id || null,
    attempt:Math.max(0, Number(job.attempt) || 0),
    duration_ms:event.duration_ms ?? null,
    tokens_used:Math.max(0, Number(event.tokens_used) || 0),
    estimated_cost_usd:Math.max(0, Number(event.estimated_cost_usd) || 0),
    data:redactTelemetry(event.data || {}),
  };
  const { error } = await supabase.from('run_events').insert(payload);
  if (error) console.error('Observability event error:', error.message);
}

export async function startRunObservability(job) {
  const details = await resourceDetails(job);
  const { error } = await supabase.from('run_observability').upsert({
    execution_job_id:job.id,
    user_id:job.user_id,
    run_type:job.job_type,
    status:'running',
    resource_name:details.name,
    model:details.model,
    started_at:job.started_at || new Date().toISOString(),
    completed_at:null,
    structured_error:null,
    created_at:job.created_at || new Date().toISOString(),
  }, { onConflict:'execution_job_id' });
  if (error) console.error('Observability summary error:', error.message);
  await recordRunEvent(job, {
    event_type:'run.started',
    status:'running',
    message:`${details.name} started`,
    data:{ run_type:job.job_type, worker_attempt:job.attempt },
  });
}

export async function finishRunObservability(job, {
  status,
  result = null,
  error = null,
  tokens = 0,
  model = null,
  estimatedCost = null,
} = {}) {
  const completedAt = status === 'waiting_approval' ? null : new Date().toISOString();
  const durationMs = job.started_at && completedAt
    ? Math.max(0, Date.parse(completedAt) - Date.parse(job.started_at))
    : null;
  const cost = estimatedCost === null
    ? estimateCostUsd(tokens, model)
    : Math.max(0, Number(estimatedCost) || 0);
  const structured = error ? structuredError(error) : null;
  const { error:updateError } = await supabase.from('run_observability').update({
    status,
    tokens_used:Math.max(0, Number(tokens) || 0),
    estimated_cost_usd:cost,
    duration_ms:durationMs,
    structured_error:structured,
    completed_at:completedAt,
  }).eq('execution_job_id', job.id).eq('user_id', job.user_id);
  if (updateError) console.error('Observability completion error:', updateError.message);
  await recordRunEvent(job, {
    event_type:status === 'waiting_approval' ? 'run.waiting_approval' : `run.${status}`,
    level:error ? 'error' : status === 'cancelled' ? 'warning' : 'info',
    status,
    message:error ? structured.message : `Run ${status.replace('_', ' ')}`,
    duration_ms:durationMs,
    tokens_used:tokens,
    estimated_cost_usd:cost,
    data:error ? { error:structured } : { result },
  });
}

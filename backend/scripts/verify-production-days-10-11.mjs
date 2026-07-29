import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const apiBase = process.env.PRODUCTION_API_URL || 'https://agentforge-api-yml4.onrender.com';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Supabase production configuration is missing');

const admin = createClient(supabaseUrl, serviceKey, {
  auth:{ persistSession:false, autoRefreshToken:false },
});
const testName = `production-days-10-11-${Date.now()}`;
const workflowIds = [];
const agentIds = [];
const suiteIds = [];
const runIds = [];
const jobIds = [];
let accessToken = null;
let report = null;

async function api(path, { method = 'GET', body, expectedStatus } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers:{
      Authorization:`Bearer ${accessToken}`,
      ...(body ? { 'Content-Type':'application/json' } : {}),
    },
    body:body ? JSON.stringify(body) : undefined,
    signal:AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (expectedStatus) {
    assert.equal(response.status, expectedStatus, `${method} ${path} returned ${response.status}`);
    return payload;
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${payload.error || 'unknown error'}`);
  }
  return payload;
}

async function authenticate() {
  const { data:profiles, error:profileError } = await admin.from('profiles').select('id').limit(100);
  if (profileError) throw profileError;
  const profileIds = new Set((profiles || []).map(profile => profile.id));
  const { data:userPage, error:userError } = await admin.auth.admin.listUsers({ page:1, perPage:100 });
  if (userError) throw userError;
  const user = userPage.users.find(item => item.email && profileIds.has(item.id));
  if (!user) throw new Error('No testable production user exists');
  const { data:link, error:linkError } = await admin.auth.admin.generateLink({
    type:'magiclink',
    email:user.email,
  });
  if (linkError) throw linkError;
  const authClient = createClient(supabaseUrl, serviceKey, {
    auth:{ persistSession:false, autoRefreshToken:false },
  });
  const { data:session, error:sessionError } = await authClient.auth.verifyOtp({
    token_hash:link.properties.hashed_token,
    type:'magiclink',
  });
  if (sessionError || !session.session?.access_token) {
    throw sessionError || new Error('Production session could not be created');
  }
  accessToken = session.session.access_token;
  return user;
}

async function waitFor(table, id, statuses, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await admin.from(table).select('*').eq('id', id).single();
    if (error) throw error;
    if (statuses.includes(data.status)) return data;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${table} ${id} did not reach ${statuses.join(' or ')}`);
}

async function remove(table, column, ids) {
  if (!ids.length) return;
  const { error } = await admin.from(table).delete().in(column, ids);
  if (error) throw error;
}

async function cleanup() {
  await remove('evaluation_suites', 'id', suiteIds);
  await remove('workflows', 'id', workflowIds);
  await remove('agents', 'id', agentIds);
  await remove('workflow_runs', 'id', runIds);
  await remove('execution_jobs', 'id', jobIds);
  const [{ count:workflowCount, error:workflowError }, {
    count:agentCount,
    error:agentError,
  }, { count:suiteCount, error:suiteError }] = await Promise.all([
    admin.from('workflows').select('id', { count:'exact', head:true }).eq('name', testName),
    admin.from('agents').select('id', { count:'exact', head:true }).eq('name', testName),
    admin.from('evaluation_suites').select('id', { count:'exact', head:true }).eq('name', testName),
  ]);
  if (workflowError || agentError || suiteError) throw workflowError || agentError || suiteError;
  assert.equal(workflowCount, 0);
  assert.equal(agentCount, 0);
  assert.equal(suiteCount, 0);
}

try {
  const user = await authenticate();

  const workflow = await api('/api/workflows', {
    method:'POST',
    body:{
      name:testName,
      description:'Temporary cost-free observability verification',
      nodes:[
        { id:'input', type:'input', label:'Input', config:{} },
        { id:'transform', type:'transform', label:'Uppercase', config:{ operation:'uppercase' } },
        { id:'output', type:'output', label:'Output', config:{} },
      ],
      edges:[
        { id:'one', source:'input', target:'transform' },
        { id:'two', source:'transform', target:'output' },
      ],
    },
  });
  workflowIds.push(workflow.id);
  await api(`/api/workflows/${workflow.id}/activate`, { method:'POST' });
  const first = await api(`/api/workflows/${workflow.id}/run`, {
    method:'POST',
    body:{ input:'observable run', idempotency_key:`${testName}-workflow` },
  });
  jobIds.push(first.job.id);
  runIds.push(first.run.id);
  await waitFor('execution_jobs', first.job.id, ['succeeded']);

  const observed = await api(`/api/observability?type=workflow_run&q=${encodeURIComponent(testName)}`);
  const firstSummary = observed.runs.find(item => item.execution_job_id === first.job.id);
  assert(firstSummary, 'Completed workflow was not indexed by observability');
  assert.equal(firstSummary.tokens_used, 0);
  assert.equal(Number(firstSummary.estimated_cost_usd), 0);
  const detail = await api(`/api/observability/${first.job.id}`);
  assert(detail.events.some(event => event.event_type === 'run.started'));
  assert(detail.events.some(event => event.event_type === 'workflow.step.completed'));
  assert(detail.events.some(event => event.event_type === 'run.succeeded'));
  assert.equal(detail.steps.length, 3);
  assert.equal(detail.resource.output.outputs[0].value, 'OBSERVABLE RUN');
  const metrics = await api('/api/observability/metrics');
  assert(metrics.runs >= 1);

  const exportResponse = await fetch(
    `${apiBase}/api/observability/export?format=csv&q=${encodeURIComponent(testName)}`,
    { headers:{ Authorization:`Bearer ${accessToken}` }, signal:AbortSignal.timeout(30000) },
  );
  assert.equal(exportResponse.status, 200);
  const csv = await exportResponse.text();
  assert(csv.includes(first.job.id));

  const replay = await api(`/api/observability/${first.job.id}/replay`, { method:'POST' });
  jobIds.push(replay.job.id);
  runIds.push(replay.run.id);
  await waitFor('execution_jobs', replay.job.id, ['succeeded']);
  const replayDetail = await api(`/api/observability/${replay.job.id}`);
  assert.equal(replayDetail.resource.output.outputs[0].value, 'OBSERVABLE RUN');

  const agent = await api('/api/agents', {
    method:'POST',
    body:{
      name:testName,
      description:'Temporary evaluation verification',
      category:'other',
      system_prompt:'Return the requested expected test phrase.',
      personality:'professional',
      model:'claude-sonnet-4-6',
      temperature:0,
      max_tokens:64,
      tool_slugs:[],
    },
  });
  agentIds.push(agent.id);
  const publishedOne = await api(`/api/agents/${agent.id}/publish`, {
    method:'POST',
    body:{ change_summary:'Evaluation baseline' },
  });
  await api(`/api/agents/${agent.id}`, {
    method:'PUT',
    body:{ system_prompt:'Return the exact requested expected phrase with no extra text.' },
  });
  const publishedTwo = await api(`/api/agents/${agent.id}/publish`, {
    method:'POST',
    body:{ change_summary:'Evaluation candidate' },
  });

  const suite = await api('/api/evaluations', {
    method:'POST',
    body:{
      name:testName,
      description:'Temporary evaluation API verification',
      agent_id:agent.id,
      gate_threshold:80,
      cases:[{
        name:'Exact greeting',
        input_text:'Say hello',
        expected_output:'hello',
        assertion_type:'exact',
        weight:1,
      }],
    },
  });
  suiteIds.push(suite.id);
  await api(`/api/evaluations/${suite.id}/run`, {
    method:'POST',
    body:{
      baseline_version_id:publishedOne.version.id,
      candidate_version_id:publishedOne.version.id,
    },
    expectedStatus:409,
  });

  const { data:fakeJob, error:jobError } = await admin
    .from('execution_jobs')
    .insert({
      user_id:user.id,
      job_type:'evaluation_run',
      status:'succeeded',
      payload:{
        suite_id:suite.id,
        agent_id:agent.id,
        baseline_version_id:publishedOne.version.id,
        candidate_version_id:publishedTwo.version.id,
      },
      result:{ verification:'cost-free fabricated scores' },
      completed_at:new Date().toISOString(),
    })
    .select()
    .single();
  if (jobError) throw jobError;
  jobIds.push(fakeJob.id);
  const { data:evaluationRun, error:runError } = await admin
    .from('evaluation_runs')
    .insert({
      suite_id:suite.id,
      user_id:user.id,
      execution_job_id:fakeJob.id,
      baseline_version_id:publishedOne.version.id,
      candidate_version_id:publishedTwo.version.id,
      status:'completed',
      gate_threshold:80,
      baseline_score:0,
      candidate_score:100,
      gate_passed:true,
      started_at:new Date().toISOString(),
      completed_at:new Date().toISOString(),
    })
    .select()
    .single();
  if (runError) throw runError;
  const evaluationCase = suite.evaluation_cases[0];
  const { error:resultError } = await admin.from('evaluation_results').insert([
    {
      evaluation_run_id:evaluationRun.id,
      case_id:evaluationCase.id,
      user_id:user.id,
      variant:'baseline',
      agent_version_id:publishedOne.version.id,
      actual_output:'different',
      score:0,
      passed:false,
    },
    {
      evaluation_run_id:evaluationRun.id,
      case_id:evaluationCase.id,
      user_id:user.id,
      variant:'candidate',
      agent_version_id:publishedTwo.version.id,
      actual_output:'hello',
      score:100,
      passed:true,
    },
  ]);
  if (resultError) throw resultError;
  const { error:jobUpdateError } = await admin
    .from('execution_jobs')
    .update({ resource_id:evaluationRun.id })
    .eq('id', fakeJob.id);
  if (jobUpdateError) throw jobUpdateError;
  const { error:summaryError } = await admin.from('run_observability').insert({
    execution_job_id:fakeJob.id,
    user_id:user.id,
    run_type:'evaluation_run',
    status:'succeeded',
    resource_name:testName,
    tokens_used:0,
    estimated_cost_usd:0,
    duration_ms:0,
    started_at:new Date().toISOString(),
    completed_at:new Date().toISOString(),
  });
  if (summaryError) throw summaryError;

  const evaluationDetail = await api(`/api/evaluations/runs/${evaluationRun.id}`);
  assert.equal(evaluationDetail.evaluation_results.length, 2);
  assert.equal(Number(evaluationDetail.candidate_score), 100);
  assert.equal(evaluationDetail.gate_passed, true);
  const promoted = await api(`/api/evaluations/runs/${evaluationRun.id}/promote`, {
    method:'POST',
  });
  assert.equal(promoted.version.source_version_id, publishedTwo.version.id);
  const versions = await api(`/api/agents/${agent.id}/versions`);
  assert.equal(versions.published_version_id, promoted.version.id);

  report = {
    passed:true,
    model_calls:0,
    live_timeline:true,
    structured_events:true,
    metrics:true,
    csv_export:true,
    replay:true,
    evaluation_dataset:true,
    invalid_comparison_blocked:true,
    side_by_side_results:true,
    promotion_gate:true,
    cleanup:true,
  };
} finally {
  await cleanup();
}

console.log(JSON.stringify(report));

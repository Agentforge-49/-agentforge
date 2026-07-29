import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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
const workflowIds = [];
const runIds = [];
const jobIds = [];
let credentialId = null;
let accessToken = null;
let report = null;
const testName = `production-days-8-9-${Date.now()}`;

async function api(path, { method = 'GET', body } = {}) {
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
  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${payload.error || 'unknown error'}`);
  }
  return payload;
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

function graph(credential) {
  return {
    nodes:[
      { id:'input', type:'input', label:'Input', config:{} },
      {
        id:'connector',
        type:'connector',
        label:'Vault-backed HTTP',
        config:{
          action:'http.request',
          credential_id:credential,
          parameters:{ url:'https://postman-echo.com/headers', method:'GET', headers:{} },
        },
      },
      {
        id:'approval',
        type:'approval',
        label:'Human review',
        config:{ instructions:'Review the connector result', timeout_minutes:5 },
      },
      {
        id:'transform',
        type:'transform',
        label:'Uppercase',
        config:{ operation:'uppercase' },
      },
      { id:'output', type:'output', label:'Output', config:{} },
    ],
    edges:[
      { id:'e1', source:'input', target:'connector' },
      { id:'e2', source:'connector', target:'approval' },
      { id:'e3', source:'approval', target:'transform' },
      { id:'e4', source:'transform', target:'output' },
    ],
  };
}

async function enqueue(workflowId, suffix) {
  const result = await api(`/api/workflows/${workflowId}/run`, {
    method:'POST',
    body:{ input:`integration-${suffix}`, idempotency_key:`${testName}-${suffix}` },
  });
  runIds.push(result.run.id);
  jobIds.push(result.job.id);
  return result;
}

async function pendingApproval(runId) {
  const { data, error } = await admin
    .from('approval_requests')
    .select('*')
    .eq('workflow_run_id', runId)
    .eq('status', 'pending')
    .single();
  if (error) throw error;
  return data;
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
}

async function cleanup() {
  if (runIds.length) {
    const operations = [
      admin.from('approval_requests').delete().in('workflow_run_id', runIds),
      admin.from('workflow_step_runs').delete().in('workflow_run_id', runIds),
      admin.from('workflow_runs').delete().in('id', runIds),
    ];
    for (const operation of operations) {
      const { error } = await operation;
      if (error) throw error;
    }
  }
  if (jobIds.length) {
    const { error } = await admin.from('execution_jobs').delete().in('id', jobIds);
    if (error) throw error;
  }
  if (workflowIds.length) {
    const { error } = await admin.from('workflows').delete().in('id', workflowIds);
    if (error) throw error;
  }
  if (credentialId) {
    const { error:logError } = await admin
      .from('credential_access_logs')
      .delete()
      .eq('credential_id', credentialId);
    if (logError) throw logError;
    const { error:credentialError } = await admin
      .from('vault_credentials')
      .delete()
      .eq('id', credentialId);
    if (credentialError) throw credentialError;
  }
  const { count:workflowCount, error:workflowError } = await admin
    .from('workflows')
    .select('id', { count:'exact', head:true })
    .eq('name', testName);
  if (workflowError) throw workflowError;
  const { count:credentialCount, error:credentialError } = await admin
    .from('vault_credentials')
    .select('id', { count:'exact', head:true })
    .eq('name', testName);
  if (credentialError) throw credentialError;
  assert.equal(workflowCount, 0, 'Temporary workflows were not cleaned up');
  assert.equal(credentialCount, 0, 'Temporary credential was not cleaned up');
}

try {
  await authenticate();

  const connectors = await api('/api/connectors');
  const actions = new Set(connectors.map(item => item.action));
  for (const action of [
    'http.request', 'email.send', 'slack.message', 'google_sheets.append',
    'google_drive.create_file', 'database.select', 'database.insert',
  ]) {
    assert(actions.has(action), `Connector catalog is missing ${action}`);
  }

  const secret = `agentforge-${crypto.randomBytes(20).toString('hex')}`;
  const credential = await api('/api/credentials', {
    method:'POST',
    body:{ name:testName, provider:'generic', secret, metadata:{ purpose:'production verification' } },
  });
  credentialId = credential.id;
  assert(!JSON.stringify(credential).includes(secret), 'Credential API exposed a plaintext secret');

  const workflow = await api('/api/workflows', {
    method:'POST',
    body:{ name:testName, description:'Temporary Days 8-9 production verification', ...graph(credentialId) },
  });
  workflowIds.push(workflow.id);
  await api(`/api/workflows/${workflow.id}/activate`, { method:'POST' });

  const editedRun = await enqueue(workflow.id, 'edit');
  await waitFor('execution_jobs', editedRun.job.id, ['waiting_approval']);
  const editedApproval = await pendingApproval(editedRun.run.id);
  const { data:beforeSteps, error:beforeError } = await admin
    .from('workflow_step_runs')
    .select('*')
    .eq('workflow_run_id', editedRun.run.id)
    .order('sequence_number');
  if (beforeError) throw beforeError;
  const connectorBefore = beforeSteps.filter(step => step.node_id === 'connector');
  assert.equal(connectorBefore.length, 1);
  assert.equal(connectorBefore[0].status, 'completed');
  const connectorOutput = JSON.stringify(connectorBefore[0].output);
  assert(!connectorOutput.includes(secret), 'Connector output exposed a vault secret');
  assert(connectorOutput.includes('[REDACTED]'), 'Connector output did not redact the echoed secret');

  await api(`/api/approvals/${editedApproval.id}/decide`, {
    method:'POST',
    body:{ decision:'edit', edited_input:'approved output', note:'Automated production verification' },
  });
  await waitFor('execution_jobs', editedRun.job.id, ['succeeded']);
  const completedRun = await waitFor('workflow_runs', editedRun.run.id, ['completed']);
  assert.equal(completedRun.output.outputs[0].value, 'APPROVED OUTPUT');
  const { data:afterSteps, error:afterError } = await admin
    .from('workflow_step_runs')
    .select('*')
    .eq('workflow_run_id', editedRun.run.id);
  if (afterError) throw afterError;
  assert.equal(afterSteps.filter(step => step.node_id === 'connector').length, 1);
  assert.equal(afterSteps.find(step => step.node_id === 'approval').status, 'completed');

  const rejectedRun = await enqueue(workflow.id, 'reject');
  await waitFor('execution_jobs', rejectedRun.job.id, ['waiting_approval']);
  const rejectedApproval = await pendingApproval(rejectedRun.run.id);
  await api(`/api/approvals/${rejectedApproval.id}/decide`, {
    method:'POST',
    body:{ decision:'reject', note:'Automated rejection verification' },
  });
  await waitFor('execution_jobs', rejectedRun.job.id, ['cancelled']);
  await waitFor('workflow_runs', rejectedRun.run.id, ['cancelled']);
  const { data:rejectedStep, error:rejectedError } = await admin
    .from('workflow_step_runs')
    .select('status')
    .eq('workflow_run_id', rejectedRun.run.id)
    .eq('node_id', 'approval')
    .single();
  if (rejectedError) throw rejectedError;
  assert.equal(rejectedStep.status, 'rejected');

  const expiredRun = await enqueue(workflow.id, 'expire');
  await waitFor('execution_jobs', expiredRun.job.id, ['waiting_approval']);
  const expiredApproval = await pendingApproval(expiredRun.run.id);
  const { error:expiryUpdateError } = await admin
    .from('approval_requests')
    .update({ expires_at:new Date(Date.now() - 1000).toISOString() })
    .eq('id', expiredApproval.id);
  if (expiryUpdateError) throw expiryUpdateError;
  const { error:expiryError } = await admin.rpc('expire_pending_approvals');
  if (expiryError) throw expiryError;
  await waitFor('execution_jobs', expiredRun.job.id, ['cancelled']);
  await waitFor('workflow_runs', expiredRun.run.id, ['cancelled']);
  const expired = await waitFor('approval_requests', expiredApproval.id, ['expired']);
  assert.equal(expired.status, 'expired');

  report = {
    passed:true,
    connector_catalog:actions.size,
    connector_secret_redaction:true,
    approval_edit_resume:true,
    connector_replayed:false,
    rejection:true,
    timeout:true,
    cleanup:true,
  };
} finally {
  await cleanup();
}

console.log(JSON.stringify(report));

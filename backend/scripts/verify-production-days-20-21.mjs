import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const useLocalServer = process.env.VERIFY_LOCAL_SERVER === 'true';
const apiBase = useLocalServer
  ? 'http://127.0.0.1:3102'
  : process.env.PRODUCTION_API_URL || 'https://agentforge-api-yml4.onrender.com';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Supabase production configuration is missing');

const admin = createClient(supabaseUrl, serviceKey, {
  auth:{ persistSession:false, autoRefreshToken:false },
});
const testName = `production-days-20-21-${Date.now()}`;
let userId = null;
let token = null;
let apiKeyId = null;
let rateKeyId = null;
let webhookId = null;
let snapshotId = null;
let localServer = null;
let localEngine = null;
let report = null;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function startLocalServer() {
  if (!useLocalServer) return;
  const backendDirectory = fileURLToPath(new URL('..', import.meta.url));
  const engineDirectory = fileURLToPath(new URL('../../engine/', import.meta.url));
  localEngine = spawn('python', ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8102'], {
    cwd:engineDirectory,
    env:{ ...process.env },
    stdio:['ignore', 'pipe', 'pipe'],
  });
  let engineStderr = '';
  localEngine.stderr.on('data', chunk => { engineStderr += chunk.toString(); });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (localEngine.exitCode !== null) {
      throw new Error(`Local engine exited early: ${engineStderr.slice(-1000)}`);
    }
    try {
      const response = await fetch('http://127.0.0.1:8102/health', {
        signal:AbortSignal.timeout(2000),
      });
      if (response.ok) break;
    } catch {
      // The local engine can take a moment to initialize.
    }
    if (attempt === 39) throw new Error(`Local engine did not become ready: ${engineStderr.slice(-1000)}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  localServer = spawn(process.execPath, ['server.js'], {
    cwd:backendDirectory,
    env:{
      ...process.env,
      PORT:'3102',
      BILLING_MODE:'test',
      AGENT_ENGINE_URL:'http://127.0.0.1:8102',
      CREDENTIAL_ENCRYPTION_KEY:process.env.CREDENTIAL_ENCRYPTION_KEY
        || crypto.randomBytes(32).toString('hex'),
    },
    stdio:['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  let stdout = '';
  localServer.stderr.on('data', chunk => { stderr += chunk.toString(); });
  localServer.stdout.on('data', chunk => { stdout += chunk.toString(); });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (localServer.exitCode !== null) {
      throw new Error(`Local server exited early: ${stderr.slice(-1000)}`);
    }
    try {
      const response = await fetch(`${apiBase}/api/launch`, {
        signal:AbortSignal.timeout(2000),
      });
      if (response.status === 401) return;
    } catch {
      // The server can take a moment to connect to its dependencies.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Local server did not become ready: ${(stderr || stdout).slice(-1000)}`);
}

async function request(path, {
  method = 'GET',
  authToken = token,
  developerKey,
  body,
  expectedStatus,
  raw = false,
} = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers:{
      ...(authToken ? { Authorization:`Bearer ${authToken}` } : {}),
      ...(developerKey ? { 'X-AgentForge-Key':developerKey } : {}),
      ...(body !== undefined ? { 'Content-Type':'application/json' } : {}),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
    signal:AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let payload = text;
  if (!raw) {
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${method} ${path} did not return JSON`);
    }
  }
  if (expectedStatus !== undefined) {
    assert.equal(response.status, expectedStatus,
      `${method} ${path} returned ${response.status}: ${text.slice(0, 300)}`);
  } else if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${text.slice(0, 300)}`);
  }
  return { payload, headers:response.headers, status:response.status };
}

async function cleanupStaleVerifiers() {
  const { data, error } = await admin.auth.admin.listUsers({ page:1, perPage:1000 });
  if (error) throw error;
  for (const user of data.users.filter(item => (
    item.email?.startsWith('production-days-20-21-')
  ))) {
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error) throw deleted.error;
  }
}

async function createVerifierUser() {
  const email = `${testName}@agentforge.test`;
  const password = `A1!${crypto.randomBytes(24).toString('base64url')}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm:true,
    user_metadata:{ full_name:'AgentForge Launch Verifier' },
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const client = createClient(supabaseUrl, serviceKey, {
    auth:{ persistSession:false, autoRefreshToken:false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) {
    throw signedIn.error || new Error('Verifier session failed');
  }
  token = signedIn.data.session.access_token;
}

async function cleanup() {
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
    const tables = [
      'developer_api_keys',
      'developer_webhook_subscriptions',
      'developer_api_request_logs',
      'recovery_snapshots',
      'recovery_verifications',
      'launch_readiness_runs',
      'user_onboarding_progress',
    ];
    for (const table of tables) {
      const column = table === 'user_onboarding_progress' ? 'user_id' : 'id';
      const check = await admin.from(table).select(column, { count:'exact', head:true })
        .eq('user_id', userId);
      if (check.error) throw check.error;
      assert.equal(check.count, 0, `${table} verifier rows were not removed`);
    }
  }
}

try {
  await startLocalServer();
  await cleanupStaleVerifiers();
  await createVerifierUser();

  const publicSpec = await request('/api/developer/openapi.json', { authToken:null });
  assert.equal(publicSpec.payload.openapi, '3.1.0');
  assert.ok(publicSpec.payload.paths['/agents/{id}/run']);

  await request('/api/v1/agents', {
    authToken:null,
    expectedStatus:401,
  });

  const developerSummary = await request('/api/developer');
  assert.ok(developerSummary.payload.scopes.includes('agents:read'));
  assert.ok(developerSummary.payload.webhook_event_types.includes('test.ping'));

  const createdKey = await request('/api/developer/keys', {
    method:'POST',
    body:{
      name:'Launch verifier',
      scopes:['agents:read', 'runs:read', 'usage:read', 'webhooks:write', 'status:read'],
      rate_limit_per_minute:600,
      expiry_days:1,
    },
    expectedStatus:201,
  });
  const developerKey = createdKey.payload.token;
  apiKeyId = createdKey.payload.key.id;
  assert.match(developerKey, /^afk_live_[A-Za-z0-9_-]{32,}$/);
  assert.equal(createdKey.payload.shown_once, true);
  assert.equal(JSON.stringify(createdKey.payload).includes('key_hash'), false);
  const storedKey = await admin.from('developer_api_keys').select('*').eq('id', apiKeyId).single();
  if (storedKey.error) throw storedKey.error;
  assert.equal(storedKey.data.key_hash, sha256(developerKey));
  assert.equal(JSON.stringify(storedKey.data).includes(developerKey), false);

  const status = await request('/api/v1/status', {
    authToken:null,
    developerKey,
  });
  assert.equal(status.payload.data.status, 'operational');
  assert.match(status.headers.get('x-request-id'), /^req_/);
  assert.equal(status.headers.get('x-ratelimit-limit'), '600');
  const agents = await request('/api/v1/agents?limit=2', {
    authToken:null,
    developerKey,
  });
  assert.deepEqual(agents.payload.data, []);
  await request('/api/v1/agents/00000000-0000-0000-0000-000000000000/run', {
    method:'POST',
    authToken:null,
    developerKey,
    body:{ message:'This must be rejected before execution.' },
    expectedStatus:403,
  });
  await request('/api/v1/usage', { authToken:null, developerKey });

  const createdRateKey = await request('/api/developer/keys', {
    method:'POST',
    body:{
      name:'Atomic rate verifier',
      scopes:['status:read'],
      rate_limit_per_minute:10,
      expiry_days:1,
    },
    expectedStatus:201,
  });
  const rateKey = createdRateKey.payload.token;
  rateKeyId = createdRateKey.payload.key.id;
  const rateResponses = await Promise.all(Array.from({ length:11 }, () => (
    fetch(`${apiBase}/api/v1/status`, {
      headers:{ 'X-AgentForge-Key':rateKey },
      signal:AbortSignal.timeout(30000),
    })
  )));
  assert.equal(rateResponses.filter(item => item.status === 200).length, 10);
  assert.equal(rateResponses.filter(item => item.status === 429).length, 1);
  const limitedResponse = rateResponses.find(item => item.status === 429);
  const limitedPayload = await limitedResponse.json();
  assert.equal(limitedPayload.error.code, 'rate_limit_exceeded');
  assert.equal(limitedResponse.headers.get('x-ratelimit-remaining'), '0');

  const createdWebhook = await request('/api/developer/webhooks', {
    method:'POST',
    body:{
      name:'Paused launch verifier',
      endpoint_url:'https://agentforge-api-yml4.onrender.com/health',
      event_types:['test.ping'],
      max_attempts:3,
    },
    expectedStatus:201,
  });
  webhookId = createdWebhook.payload.subscription.id;
  assert.match(createdWebhook.payload.signing_secret, /^afwh_/);
  assert.equal(createdWebhook.payload.shown_once, true);
  assert.equal(JSON.stringify(createdWebhook.payload).includes('signing_secret_hash'), false);
  const storedWebhook = await admin.from('developer_webhook_subscriptions')
    .select('*').eq('id', webhookId).single();
  if (storedWebhook.error) throw storedWebhook.error;
  assert.equal(
    storedWebhook.data.signing_secret_hash,
    sha256(createdWebhook.payload.signing_secret),
  );
  await request(`/api/developer/webhooks/${webhookId}`, {
    method:'PATCH',
    body:{ status:'paused' },
  });
  const webhookEvent = await request('/api/v1/webhook-events', {
    method:'POST',
    authToken:null,
    developerKey,
    body:{ type:'test.ping', message:'Safe paused production test' },
    expectedStatus:202,
  });
  assert.equal(webhookEvent.payload.data.deliveries_created, 0);

  await new Promise(resolve => setTimeout(resolve, 300));
  const audited = await request('/api/developer');
  assert.ok(audited.payload.request_logs.some(item => item.api_key_id === apiKeyId));
  assert.equal(JSON.stringify(audited.payload).includes(developerKey), false);
  assert.equal(JSON.stringify(audited.payload).includes(createdWebhook.payload.signing_secret), false);

  const onboarding = await request('/api/launch/onboarding', {
    method:'PUT',
    body:{ completed_steps:['profile', 'agent', 'workflow', 'guardrails', 'developer', 'recovery'] },
  });
  assert.equal(onboarding.payload.current_step, 'complete');

  const snapshot = await request('/api/launch/recovery-snapshots', {
    method:'POST',
    body:{},
    expectedStatus:201,
  });
  snapshotId = snapshot.payload.id;
  assert.equal(snapshot.payload.manifest, undefined);
  const downloaded = await request(
    `/api/launch/recovery-snapshots/${snapshotId}/download`,
    { raw:true },
  );
  const manifest = JSON.parse(downloaded.payload);
  assert.equal(manifest.secrets_excluded, true);
  assert.equal(manifest.owner_user_id, userId);
  assert.equal(downloaded.headers.get('cache-control'), 'no-store');
  assert.equal(
    downloaded.headers.get('x-agentforge-recovery-sha256'),
    sha256(canonicalJson(manifest)),
  );
  assert.equal(/password|ciphertext|initialization_vector|authentication_tag/i.test(
    JSON.stringify(manifest.resources),
  ), false);

  const verification = await request(
    `/api/launch/recovery-snapshots/${snapshotId}/verify`,
    { method:'POST', body:{} },
  );
  assert.equal(verification.payload.status, 'passed');
  assert.ok(verification.payload.checks.every(item => item.passed));

  const readiness = await request('/api/launch/readiness', {
    method:'POST',
    body:{ release_version:'roadmap-day-21-verifier' },
  });
  assert.notEqual(readiness.payload.status, 'failed');
  assert.ok(readiness.payload.checks
    .filter(item => item.critical)
    .every(item => item.passed));
  assert.equal(readiness.payload.checks.find(item => item.key === 'recovery').passed, true);
  assert.equal(readiness.payload.checks.find(item => item.key === 'onboarding').passed, true);

  const launchStatus = await request('/api/launch/status', { authToken:null });
  assert.equal(launchStatus.payload.status, 'operational');
  assert.ok(launchStatus.payload.components.every(item => item.status === 'operational'));

  await request(`/api/developer/keys/${rateKeyId}`, { method:'DELETE' });
  rateKeyId = null;
  await request(`/api/developer/keys/${apiKeyId}`, { method:'DELETE' });
  const revoked = await request('/api/v1/status', {
    authToken:null,
    developerKey,
    expectedStatus:401,
  });
  assert.equal(revoked.payload.error.code, 'api_key_revoked');

  report = {
    target:apiBase,
    verifier:testName,
    day_20:{
      openapi:'3.1.0',
      hashed_api_keys:true,
      scoped_access:true,
      atomic_rate_limit:true,
      request_audit:true,
      webhook_secret_hash:true,
      paused_delivery_count:webhookEvent.payload.data.deliveries_created,
    },
    day_21:{
      onboarding:onboarding.payload.current_step,
      recovery_verification:verification.payload.status,
      readiness_status:readiness.payload.status,
      readiness_score:readiness.payload.score,
      platform_status:launchStatus.payload.status,
    },
    model_calls:0,
    paid_actions:false,
  };
} finally {
  try {
    await cleanup();
  } finally {
    if (localServer && localServer.exitCode === null) {
      localServer.kill();
    }
    if (localEngine && localEngine.exitCode === null) {
      localEngine.kill();
    }
  }
}

console.log(JSON.stringify(report, null, 2));

import crypto from 'node:crypto';

import { getEngineHealth } from './engine.js';
import { supabase } from './supabase.js';

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function recoveryManifestHash(manifest) {
  return crypto.createHash('sha256').update(canonicalJson(manifest)).digest('hex');
}

export async function buildRecoveryManifest(userId) {
  const definitions = [
    ['agents', 'id, name, description, category, system_prompt, personality, model, temperature, max_tokens, status, latest_version_number, has_unpublished_changes, created_at, updated_at'],
    ['workflows', 'id, name, description, status, nodes, edges, version, created_at, updated_at'],
    ['agent_chains', 'id, name, description, agent_ids, branch_keyword, branch_agent_if_id, branch_agent_else_id, created_at, updated_at'],
    ['workflow_triggers', 'id, workflow_id, name, trigger_type, status, webhook_path, interval_minutes, next_run_at, created_at, updated_at'],
    ['knowledge_bases', 'id, name, description, retention_days, memory_enabled, created_at, updated_at'],
    ['multi_agent_systems', 'id, name, description, supervisor_agent_id, strategy, aggregation_strategy, supervisor_prompt, max_delegations, max_parallel, max_depth, timeout_seconds, status, created_at, updated_at'],
    ['evaluation_suites', 'id, agent_id, name, description, gate_threshold, created_at, updated_at'],
  ];
  const results = await Promise.all(definitions.map(async ([table, select]) => {
    const { data, error } = await supabase.from(table).select(select)
      .eq('user_id', userId).order('created_at');
    if (error) throw error;
    return [table, data || []];
  }));
  const resources = Object.fromEntries(results);
  const { data:memberships, error:membershipError } = await supabase
    .from('organization_members')
    .select('organization_id, role, status, joined_at')
    .eq('user_id', userId)
    .order('joined_at');
  if (membershipError) throw membershipError;
  resources.organization_memberships = memberships || [];
  const resourceCounts = Object.fromEntries(
    Object.entries(resources).map(([key, rows]) => [key, rows.length]),
  );
  const manifest = {
    format:'agentforge-recovery',
    schema_version:1,
    owner_user_id:userId,
    generated_at:new Date().toISOString(),
    secrets_excluded:true,
    excluded_resources:[
      'credential values',
      'webhook signing secrets',
      'API keys',
      'SCIM tokens',
      'billing provider secrets',
      'knowledge document contents',
      'conversation memory',
      'run inputs and outputs',
    ],
    resources,
    resource_counts:resourceCounts,
  };
  const serialized = canonicalJson(manifest);
  if (Buffer.byteLength(serialized) > 2_000_000) {
    const error = new Error('Recovery manifest exceeds the 2 MB safe export limit');
    error.status = 413;
    throw error;
  }
  return { manifest, hash:recoveryManifestHash(manifest), resourceCounts };
}

export function verifyRecoveryManifest(snapshot, userId) {
  const manifest = snapshot?.manifest;
  const checks = [];
  checks.push(check('format', manifest?.format === 'agentforge-recovery', 'Recovery format is recognized'));
  checks.push(check('schema', manifest?.schema_version === 1, 'Schema version 1 is supported'));
  checks.push(check('ownership', manifest?.owner_user_id === userId, 'Snapshot belongs to this account'));
  checks.push(check('secrets', manifest?.secrets_excluded === true, 'Secrets are explicitly excluded'));
  checks.push(check(
    'hash',
    recoveryManifestHash(manifest) === snapshot?.manifest_sha256,
    'Manifest SHA-256 matches the stored digest',
  ));
  const countsMatch = Object.entries(manifest?.resource_counts || {}).every(
    ([key, count]) => Array.isArray(manifest?.resources?.[key])
      && manifest.resources[key].length === Number(count),
  );
  checks.push(check('counts', countsMatch, 'Resource counts match manifest arrays'));
  checks.push(check(
    'sensitive_fields',
    !containsSensitiveField(manifest?.resources),
    'No credential or secret fields are present',
  ));
  return {
    status:checks.every(item => item.passed) ? 'passed' : 'failed',
    checks,
    hash:recoveryManifestHash(manifest),
  };
}

export async function getPlatformStatus() {
  const checkedAt = new Date().toISOString();
  const [database, engine] = await Promise.allSettled([
    supabase.from('profiles').select('id', { count:'exact', head:true }).limit(1),
    getEngineHealth(),
  ]);
  const databaseOk = database.status === 'fulfilled' && !database.value.error;
  const engineOk = engine.status === 'fulfilled' && engine.value?.status === 'ok';
  const components = [
    { key:'api', name:'AgentForge API', status:'operational' },
    { key:'database', name:'Database', status:databaseOk ? 'operational' : 'degraded' },
    { key:'engine', name:'Agent engine', status:engineOk ? 'operational' : 'degraded' },
  ];
  return {
    status:components.every(item => item.status === 'operational') ? 'operational' : 'degraded',
    checked_at:checkedAt,
    version:String(process.env.RENDER_GIT_COMMIT || 'current').slice(0, 12),
    components,
  };
}

export async function runLaunchReadiness(userId) {
  const [
    profile,
    agents,
    workflows,
    budget,
    onboarding,
    recovery,
    apiKeys,
    pendingApprovals,
    status,
  ] = await Promise.all([
    one('profiles', query => query.eq('id', userId)),
    count('agents', query => query.eq('user_id', userId).not('published_version_id', 'is', null)),
    count('workflows', query => query.eq('user_id', userId).eq('status', 'active')),
    one('budget_policies', query => query.eq('user_id', userId)),
    one('user_onboarding_progress', query => query.eq('user_id', userId)),
    latestVerification(userId),
    count('developer_api_keys', query => query.eq('user_id', userId).eq('status', 'active')),
    count('approval_requests', query => query.eq('user_id', userId).eq('status', 'pending')),
    getPlatformStatus(),
  ]);
  const environment = {
    supabase_configured:Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    engine_configured:Boolean(process.env.AGENT_ENGINE_URL),
    encryption_configured:Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY),
    frontend_configured:Boolean(process.env.FRONTEND_URL),
    billing_mode:String(process.env.BILLING_MODE || 'test'),
  };
  const checks = [
    readiness('platform', 'Platform components', status.status === 'operational', true,
      status.status === 'operational' ? 'API, database, and engine are operational' : 'A platform component is degraded'),
    readiness('authentication', 'Authenticated profile', Boolean(profile), true,
      profile ? 'User profile is available' : 'User profile is missing'),
    readiness('encryption', 'Credential encryption', environment.encryption_configured, true,
      environment.encryption_configured ? 'Encryption key is configured' : 'Encryption key is missing'),
    readiness('agent', 'Published agent', agents > 0, false,
      agents > 0 ? `${agents} published agent(s)` : 'Publish an agent before launch'),
    readiness('workflow', 'Active workflow', workflows > 0, false,
      workflows > 0 ? `${workflows} active workflow(s)` : 'Activate a workflow when automation is ready'),
    readiness('budget', 'Cost guardrail', Boolean(budget?.hard_limit_enabled), false,
      budget?.hard_limit_enabled ? 'Personal hard budget is enabled' : 'A hard budget is recommended'),
    readiness('recovery', 'Verified recovery snapshot', recovery?.status === 'passed', false,
      recovery?.status === 'passed' ? 'Latest recovery dry run passed' : 'Create and verify a recovery snapshot'),
    readiness('developer', 'Scoped API key', apiKeys > 0, false,
      apiKeys > 0 ? `${apiKeys} active scoped key(s)` : 'API keys are optional until external integration'),
    readiness('approvals', 'Pending approvals', pendingApprovals === 0, false,
      pendingApprovals === 0 ? 'No pending human approvals' : `${pendingApprovals} approval(s) need review`),
    readiness('onboarding', 'Guided onboarding', onboarding?.current_step === 'complete', false,
      onboarding?.current_step === 'complete' ? 'Onboarding is complete' : 'Finish or review the launch guide'),
  ];
  const criticalFailed = checks.some(item => item.critical && !item.passed);
  const passedWeight = checks.reduce((sum, item) => sum + (item.passed ? (item.critical ? 15 : 5) : 0), 0);
  const totalWeight = checks.reduce((sum, item) => sum + (item.critical ? 15 : 5), 0);
  const score = Math.round((passedWeight / totalWeight) * 100);
  const runStatus = criticalFailed ? 'failed'
    : checks.every(item => item.passed) ? 'passed' : 'warning';
  return { status:runStatus, score, checks, environment, platform:status };
}

async function one(table, configure) {
  const { data, error } = await configure(supabase.from(table).select('*')).maybeSingle();
  if (error) throw error;
  return data;
}

async function count(table, configure) {
  const { count:rowCount, error } = await configure(
    supabase.from(table).select('id', { count:'exact', head:true }),
  );
  if (error) throw error;
  return rowCount || 0;
}

async function latestVerification(userId) {
  const { data, error } = await supabase.from('recovery_verifications').select('*')
    .eq('user_id', userId).order('verified_at', { ascending:false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

function containsSensitiveField(value) {
  if (Array.isArray(value)) return value.some(containsSensitiveField);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => (
    /^(secret|password|ciphertext|initialization_vector|authentication_tag|api_key|token)$/i.test(key)
    || containsSensitiveField(item)
  ));
}

function check(key, passed, message) {
  return { key, passed:Boolean(passed), message };
}

function readiness(key, name, passed, critical, detail) {
  return { key, name, passed:Boolean(passed), critical:Boolean(critical), detail };
}

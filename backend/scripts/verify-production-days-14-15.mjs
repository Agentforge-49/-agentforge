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
const testName = `production-days-14-15-${Date.now()}`;
const listingIds = [];
const agentIds = [];
const workflowIds = [];
const planRequestIds = [];
const usageKeys = [];
let accessToken = null;
let userId = null;
let savedEntitlement = null;
let savedBudget = null;
let savedPeriod = null;
let savedProfile = null;
let mutableStateSaved = false;
let report = null;

async function api(path, { method = 'GET', body, expectedStatus } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers:{
      Authorization:`Bearer ${accessToken}`,
      ...(body !== undefined ? { 'Content-Type':'application/json' } : {}),
    },
    body:body !== undefined ? JSON.stringify(body) : undefined,
    signal:AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (expectedStatus !== undefined) {
    assert.equal(
      response.status,
      expectedStatus,
      `${method} ${path} returned ${response.status}: ${payload.error || 'unknown error'}`,
    );
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
  const { data:userPage, error:userError } = await admin.auth.admin.listUsers({
    page:1,
    perPage:100,
  });
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
  userId = user.id;
}

async function saveMutableState() {
  const month = new Date().toISOString().slice(0, 7) + '-01';
  const [
    entitlementResult,
    budgetResult,
    periodResult,
    profileResult,
  ] = await Promise.all([
    admin.from('user_entitlements').select('*').eq('user_id', userId).single(),
    admin.from('budget_policies').select('*').eq('user_id', userId).maybeSingle(),
    admin.from('usage_periods').select('*').eq('user_id', userId)
      .eq('period_start', month).maybeSingle(),
    admin.from('profiles').select('api_calls_used')
      .eq('id', userId).single(),
  ]);
  for (const result of [
    entitlementResult,
    budgetResult,
    periodResult,
    profileResult,
  ]) {
    if (result.error) throw result.error;
  }
  savedEntitlement = entitlementResult.data;
  savedBudget = budgetResult.data;
  savedPeriod = periodResult.data;
  savedProfile = profileResult.data;
  mutableStateSaved = true;
  const { error } = await admin.from('user_entitlements').update({
    status:'active',
    expires_at:null,
    override_limits:{
      ...(savedEntitlement.override_limits || {}),
      model_calls:100000,
      tokens:100000000,
      estimated_cost_usd:100000,
      agents:100000,
      workflows:100000,
      marketplace_installs:100000,
    },
  }).eq('user_id', userId);
  if (error) throw error;
}

async function remove(table, ids) {
  if (!ids.length) return;
  const { error } = await admin.from(table).delete().in('id', ids);
  if (error) throw error;
}

async function cleanup() {
  if (listingIds.length) {
    const usageDelete = await admin.from('usage_events').delete()
      .eq('user_id', userId).in('resource_id', listingIds);
    if (usageDelete.error) throw usageDelete.error;
    const installDelete = await admin.from('marketplace_installs').delete()
      .in('listing_id', listingIds);
    if (installDelete.error) throw installDelete.error;
    const reviewDelete = await admin.from('marketplace_reviews').delete()
      .in('listing_id', listingIds);
    if (reviewDelete.error) throw reviewDelete.error;
  }
  await remove('marketplace_listings', listingIds);
  await remove('plan_change_requests', planRequestIds);
  if (usageKeys.length) {
    const { error } = await admin.from('usage_events').delete()
      .eq('user_id', userId).in('idempotency_key', usageKeys);
    if (error) throw error;
  }
  await remove('workflows', workflowIds);
  await remove('agents', agentIds);

  if (mutableStateSaved && savedPeriod) {
    const restorable = { ...savedPeriod };
    delete restorable.id;
    const { error } = await admin.from('usage_periods').update(restorable)
      .eq('id', savedPeriod.id);
    if (error) throw error;
  }
  if (mutableStateSaved && savedProfile) {
    const { error } = await admin.from('profiles').update(savedProfile).eq('id', userId);
    if (error) throw error;
  }
  if (mutableStateSaved && savedBudget) {
    const { error } = await admin.from('budget_policies').upsert(savedBudget);
    if (error) throw error;
  } else if (mutableStateSaved) {
    const { error } = await admin.from('budget_policies').delete().eq('user_id', userId);
    if (error) throw error;
  }
  if (mutableStateSaved && savedEntitlement) {
    const { error } = await admin.from('user_entitlements').update({
      plan_key:savedEntitlement.plan_key,
      status:savedEntitlement.status,
      source:savedEntitlement.source,
      effective_at:savedEntitlement.effective_at,
      expires_at:savedEntitlement.expires_at,
      override_limits:savedEntitlement.override_limits,
      external_customer_id:savedEntitlement.external_customer_id,
      external_subscription_id:savedEntitlement.external_subscription_id,
    }).eq('user_id', userId);
    if (error) throw error;
  }

  const checks = await Promise.all([
    admin.from('marketplace_listings').select('id', { count:'exact', head:true })
      .in('id', listingIds.length ? listingIds : ['00000000-0000-0000-0000-000000000000']),
    admin.from('agents').select('id', { count:'exact', head:true }).like('name', `${testName}%`),
    admin.from('workflows').select('id', { count:'exact', head:true }).like('name', `${testName}%`),
  ]);
  for (const check of checks) {
    if (check.error) throw check.error;
    assert.equal(check.count, 0);
  }
}

try {
  await authenticate();
  await saveMutableState();

  const initialUsage = await api('/api/usage');
  assert.equal(initialUsage.entitlement.user_id, userId);
  assert.equal(initialUsage.plans.length, 3);
  assert(initialUsage.limits.model_calls > 0);

  const agent = await api('/api/agents', {
    method:'POST',
    body:{
      name:`${testName}-agent`,
      description:'Temporary agent used to verify immutable marketplace cloning.',
      category:'automation',
      system_prompt:'Return a concise deterministic verification response.',
      personality:'concise',
      model:'claude-sonnet-4-6',
      temperature:0,
      max_tokens:128,
      tool_slugs:[],
    },
  });
  agentIds.push(agent.id);
  const publishedAgent = await api(`/api/agents/${agent.id}/publish`, {
    method:'POST',
    body:{ change_summary:'Marketplace verification release' },
  });
  assert.equal(publishedAgent.agent.status, 'active');

  const workflowGraph = {
    nodes:[
      { id:'input', type:'input', label:'Input', position:{ x:0, y:0 }, config:{} },
      {
        id:'transform',
        type:'transform',
        label:'Uppercase',
        position:{ x:220, y:0 },
        config:{ operation:'uppercase' },
      },
      { id:'output', type:'output', label:'Output', position:{ x:440, y:0 }, config:{} },
    ],
    edges:[
      { id:'input-transform', source:'input', target:'transform', source_handle:'default' },
      { id:'transform-output', source:'transform', target:'output', source_handle:'default' },
    ],
  };
  const workflow = await api('/api/workflows', {
    method:'POST',
    body:{
      name:`${testName}-workflow`,
      description:'Temporary deterministic marketplace workflow.',
      ...workflowGraph,
    },
  });
  workflowIds.push(workflow.id);
  await api(`/api/workflows/${workflow.id}/activate`, { method:'POST' });

  const agentListingResult = await api('/api/marketplace/publish', {
    method:'POST',
    body:{
      name:`${testName} Agent`,
      summary:'A production-safe marketplace agent used to verify immutable publishing and cloning.',
      asset_type:'agent',
      category:'automation',
      resource_id:agent.id,
      tags:['verification', 'automation'],
      release_notes:'Initial verified release.',
      compatibility_min:1,
      compatibility_max:1,
    },
  });
  const agentListing = agentListingResult.listing;
  listingIds.push(agentListing.id);
  assert.equal(agentListingResult.version.version_number, 1);
  assert.equal(agentListing.verification_status, 'automated');
  assert.equal(agentListing.trust_signals.immutable_snapshot, true);

  const workflowListingResult = await api('/api/marketplace/publish', {
    method:'POST',
    body:{
      name:`${testName} Workflow`,
      summary:'A deterministic three-step workflow for safe marketplace cloning and version testing.',
      asset_type:'workflow',
      category:'automation',
      resource_id:workflow.id,
      tags:['verification', 'workflow'],
      release_notes:'Initial workflow release.',
      compatibility_min:1,
      compatibility_max:1,
    },
  });
  const workflowListing = workflowListingResult.listing;
  listingIds.push(workflowListing.id);

  const revised = await api(`/api/workflows/${workflow.id}`, {
    method:'PUT',
    body:{
      name:`${testName}-workflow`,
      description:'Temporary deterministic marketplace workflow version two.',
      ...workflowGraph,
    },
  });
  assert.equal(revised.version, 2);
  await api(`/api/workflows/${workflow.id}/activate`, { method:'POST' });
  const secondVersion = await api(`/api/marketplace/${workflowListing.id}/publish`, {
    method:'PUT',
    body:{
      name:`${testName} Workflow`,
      summary:'A deterministic three-step workflow with immutable version history and safe cloning.',
      resource_id:workflow.id,
      category:'automation',
      tags:['verification', 'workflow', 'versioned'],
      release_notes:'Second immutable workflow release.',
      compatibility_min:1,
      compatibility_max:1,
    },
  });
  assert.equal(secondVersion.version.version_number, 2);
  assert.notEqual(secondVersion.version.config_hash, workflowListingResult.version.config_hash);

  const search = await api(`/api/marketplace?q=${encodeURIComponent(testName)}&type=workflow&verified=true`);
  assert.equal(search.schema_version, 1);
  assert(search.listings.some(item => item.id === workflowListing.id && item.compatible));
  const mine = await api('/api/marketplace/mine');
  const mineWorkflow = mine.find(item => item.id === workflowListing.id);
  assert.equal(mineWorkflow.versions.length, 2);
  assert.deepEqual(mineWorkflow.versions.map(version => version.version_number), [2, 1]);

  const agentInstall = await api(`/api/marketplace/${agentListing.id}/install`, {
    method:'POST',
  });
  agentIds.push(agentInstall.resource.id);
  assert.equal(agentInstall.asset_type, 'agent');
  assert.equal(agentInstall.resource.status, 'draft');
  assert.equal(agentInstall.resource.system_prompt, 'Return a concise deterministic verification response.');

  const workflowInstall = await api(`/api/marketplace/${workflowListing.id}/install`, {
    method:'POST',
  });
  workflowIds.push(workflowInstall.resource.id);
  assert.equal(workflowInstall.asset_type, 'workflow');
  assert.equal(workflowInstall.resource.status, 'draft');
  assert.equal(workflowInstall.resource.nodes.length, 3);

  const review = await api(`/api/marketplace/${workflowListing.id}/review`, {
    method:'POST',
    body:{ rating:5, review_text:'Verified clone and immutable version history.' },
  });
  assert(review.review.id);
  assert.equal(Number(review.listing.rating_average), 5);
  await api(`/api/marketplace/${agentListing.id}/curate`, {
    method:'POST',
    body:{ featured:true },
    expectedStatus:403,
  });

  const usageKey = `${testName}-usage`;
  usageKeys.push(usageKey);
  const usageArguments = {
    p_user_id:userId,
    p_execution_job_id:null,
    p_resource_type:'adjustment',
    p_resource_id:null,
    p_model_calls:2,
    p_tokens:321,
    p_estimated_cost_usd:0.012345,
    p_idempotency_key:usageKey,
    p_metadata:{ verification:true },
  };
  const firstUsage = await admin.rpc('record_run_usage', usageArguments);
  const duplicateUsage = await admin.rpc('record_run_usage', usageArguments);
  if (firstUsage.error || duplicateUsage.error) throw firstUsage.error || duplicateUsage.error;
  assert.equal(firstUsage.data.id, duplicateUsage.data.id);

  const meteredUsage = await api('/api/usage');
  assert(meteredUsage.period.model_calls >= initialUsage.period.model_calls + 2);
  assert(Number(meteredUsage.period.tokens) >= Number(initialUsage.period.tokens) + 321);
  assert(meteredUsage.events.some(event => event.idempotency_key === usageKey));

  const budget = await api('/api/usage/budget', {
    method:'PUT',
    body:{ monthly_cost_limit_usd:0.01, warning_percent:50, hard_limit_enabled:true },
  });
  assert.equal(budget.hard_limit_enabled, true);
  const allowance = await admin.rpc('check_usage_allowance', {
    p_user_id:userId,
    p_requested_model_calls:1,
  });
  if (allowance.error) throw allowance.error;
  assert.equal(allowance.data.allowed, false);
  assert.match(allowance.data.reason, /budget/i);
  const acknowledged = await api('/api/usage/budget/acknowledge', { method:'POST' });
  assert(acknowledged.warning_acknowledged_at);

  const planRequest = await api('/api/usage/plan-request', {
    method:'POST',
    body:{ plan_key:'pro', note:'Cost-free production verification request.' },
  });
  planRequestIds.push(planRequest.id);
  assert.equal(planRequest.status, 'pending');
  const cancelled = await api(`/api/usage/plan-request/${planRequest.id}`, {
    method:'DELETE',
  });
  assert.equal(cancelled.status, 'cancelled');
  await api('/api/usage/admin/overrides', { expectedStatus:403 });

  await api(`/api/marketplace/${agentListing.id}/unlist`, { method:'POST' });
  const afterUnlist = await api(`/api/marketplace?q=${encodeURIComponent(testName)}`);
  assert(!afterUnlist.listings.some(item => item.id === agentListing.id));

  const tableChecks = await Promise.all([
    admin.from('plan_definitions').select('plan_key', { count:'exact' }),
    admin.from('user_entitlements').select('user_id', { count:'exact', head:true }),
    admin.from('marketplace_listing_versions').select('id', { count:'exact', head:true })
      .eq('listing_id', workflowListing.id),
    admin.from('marketplace_installs').select('id', { count:'exact', head:true })
      .in('listing_id', listingIds),
  ]);
  for (const check of tableChecks) if (check.error) throw check.error;
  assert.equal(tableChecks[0].count, 3);
  assert(tableChecks[1].count >= 1);
  assert.equal(tableChecks[2].count, 2);
  assert.equal(tableChecks[3].count, 2);

  report = {
    api:apiBase,
    marketplace:{
      listings_published:2,
      immutable_versions:3,
      safe_draft_clones:2,
      verified_reviews:1,
      search_and_filters:true,
    },
    usage:{
      plans:3,
      idempotent_ledger:true,
      budget_hard_stop:true,
      plan_request_lifecycle:true,
      admin_route_guarded:true,
    },
    model_calls:0,
  };
} finally {
  if (userId) await cleanup();
}

console.log(JSON.stringify(report, null, 2));

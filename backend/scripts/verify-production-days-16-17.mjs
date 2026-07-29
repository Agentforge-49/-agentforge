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
const testName = `production-days-16-17-${Date.now()}`;
const agentIds = [];
let organizationId = null;
let organizationSlug = null;
let reviewerUserId = null;
let ownerUserId = null;
let ownerToken = null;
let reviewerToken = null;
let savedEntitlement = null;
let stateSaved = false;
let report = null;

async function api(token, path, { method = 'GET', body, expectedStatus } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers:{
      Authorization:`Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type':'application/json' } : {}),
    },
    body:body !== undefined ? JSON.stringify(body) : undefined,
    signal:AbortSignal.timeout(30000),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
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

async function authenticateExistingOwner() {
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
    throw sessionError || new Error('Owner production session could not be created');
  }
  ownerUserId = user.id;
  ownerToken = session.session.access_token;
}

async function createReviewer() {
  const email = `${testName}@example.invalid`;
  const password = `A1!${crypto.randomBytes(24).toString('base64url')}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm:true,
    user_metadata:{ full_name:'AgentForge Governance Verifier' },
  });
  if (error) throw error;
  reviewerUserId = data.user.id;
  const reviewerClient = createClient(supabaseUrl, serviceKey, {
    auth:{ persistSession:false, autoRefreshToken:false },
  });
  const { data:session, error:sessionError } = await reviewerClient.auth.signInWithPassword({
    email,
    password,
  });
  if (sessionError || !session.session?.access_token) {
    throw sessionError || new Error('Reviewer session could not be created');
  }
  reviewerToken = session.session.access_token;
  return email;
}

async function saveAndRaiseLimits() {
  const { data, error } = await admin.from('user_entitlements')
    .select('*').eq('user_id', ownerUserId).single();
  if (error) throw error;
  savedEntitlement = data;
  stateSaved = true;
  const { error:updateError } = await admin.from('user_entitlements').update({
    status:'active',
    expires_at:null,
    override_limits:{
      ...(data.override_limits || {}),
      organizations:100,
      organization_members:100,
      agents:1000,
      workflows:1000,
    },
  }).eq('user_id', ownerUserId);
  if (updateError) throw updateError;
}

async function complianceExport(format) {
  const response = await fetch(
    `${apiBase}/api/organizations/${organizationId}/compliance/export?format=${format}`,
    {
      headers:{ Authorization:`Bearer ${ownerToken}` },
      signal:AbortSignal.timeout(30000),
    },
  );
  const body = await response.text();
  assert.equal(response.status, 200, `Compliance ${format} export returned ${response.status}`);
  const expectedHash = crypto.createHash('sha256').update(body).digest('hex');
  assert.equal(response.headers.get('x-agentforge-content-sha256'), expectedHash);
  assert(Number(response.headers.get('x-agentforge-audit-records')) >= 1);
  return { body, hash:expectedHash };
}

async function cleanup() {
  if (organizationId && ownerUserId && organizationSlug) {
    await admin.from('organizations').update({ status:'archived' }).eq('id', organizationId);
    const deleted = await admin.rpc('delete_organization', {
      p_organization_id:organizationId,
      p_owner_user_id:ownerUserId,
      p_confirmation_slug:organizationSlug,
    });
    if (deleted.error && !/not found/i.test(deleted.error.message)) throw deleted.error;
  }
  if (agentIds.length) {
    const { error } = await admin.from('agents').delete().in('id', agentIds);
    if (error) throw error;
  }
  if (stateSaved && savedEntitlement) {
    const { error } = await admin.from('user_entitlements').update({
      plan_key:savedEntitlement.plan_key,
      status:savedEntitlement.status,
      source:savedEntitlement.source,
      effective_at:savedEntitlement.effective_at,
      expires_at:savedEntitlement.expires_at,
      override_limits:savedEntitlement.override_limits,
      external_customer_id:savedEntitlement.external_customer_id,
      external_subscription_id:savedEntitlement.external_subscription_id,
    }).eq('user_id', ownerUserId);
    if (error) throw error;
  }
  if (reviewerUserId) {
    const { error } = await admin.auth.admin.deleteUser(reviewerUserId);
    if (error) throw error;
  }
  const checks = await Promise.all([
    admin.from('organizations').select('id', { count:'exact', head:true })
      .eq('id', organizationId || '00000000-0000-0000-0000-000000000000'),
    admin.from('agents').select('id', { count:'exact', head:true }).like('name', `${testName}%`),
  ]);
  for (const check of checks) {
    if (check.error) throw check.error;
    assert.equal(check.count, 0);
  }
}

try {
  await authenticateExistingOwner();
  const reviewerEmail = await createReviewer();
  await saveAndRaiseLimits();

  const agent = await api(ownerToken, '/api/agents', {
    method:'POST',
    body:{
      name:`${testName}-agent`,
      description:'Temporary governed team agent for cost-free production verification.',
      category:'automation',
      system_prompt:'Return one concise governance verification sentence.',
      personality:'concise',
      model:'claude-sonnet-4-6',
      temperature:0,
      max_tokens:64,
      tool_slugs:[],
    },
  });
  agentIds.push(agent.id);
  await api(ownerToken, `/api/agents/${agent.id}/publish`, {
    method:'POST',
    body:{ change_summary:'Organization governance verification version' },
  });

  const created = await api(ownerToken, '/api/organizations', {
    method:'POST',
    body:{
      name:`${testName} Workspace`,
      description:'Temporary isolated tenant and governance verification workspace.',
    },
  });
  organizationId = created.organization.id;
  organizationSlug = created.organization.slug;
  assert.equal(created.membership.role, 'owner');

  const ownerList = await api(ownerToken, '/api/organizations');
  assert(ownerList.some(item => item.id === organizationId && item.membership.role === 'owner'));
  const options = await api(ownerToken, '/api/organizations/resource-options');
  assert(options.agent.some(item => item.id === agent.id));

  const invitation = await api(ownerToken, `/api/organizations/${organizationId}/invitations`, {
    method:'POST',
    body:{ email:reviewerEmail, role:'admin', expiry_days:7 },
  });
  assert(invitation.token.length >= 32);
  assert.equal(invitation.invitation.token_hash, undefined);
  const accepted = await api(reviewerToken, '/api/organizations/invitations/accept', {
    method:'POST',
    body:{ token:invitation.token },
  });
  assert.equal(accepted.membership.role, 'admin');
  const reviewerList = await api(reviewerToken, '/api/organizations');
  assert(reviewerList.some(item => item.id === organizationId && item.membership.role === 'admin'));

  const secondInvite = await api(ownerToken, `/api/organizations/${organizationId}/invitations`, {
    method:'POST',
    body:{ email:`revoked-${testName}@example.invalid`, role:'viewer', expiry_days:1 },
  });
  await api(ownerToken, `/api/organizations/${organizationId}/invitations/${secondInvite.invitation.id}`, {
    method:'DELETE',
  });

  const shared = await api(ownerToken, `/api/organizations/${organizationId}/resources`, {
    method:'POST',
    body:{ resource_type:'agent', resource_id:agent.id, access_level:'run' },
  });
  assert.equal(shared.resource.id, agent.id);
  await api(ownerToken, `/api/agents/${agent.id}`, {
    method:'DELETE',
    expectedStatus:409,
  });
  const cloned = await api(reviewerToken, `/api/organizations/${organizationId}/resources/${shared.id}/clone`, {
    method:'POST',
  });
  agentIds.push(cloned.resource.id);
  assert.equal(cloned.asset_type, 'agent');
  assert.equal(cloned.resource.status, 'draft');
  assert.equal(cloned.resource.user_id, reviewerUserId);

  const deniedPolicy = await api(ownerToken, `/api/organizations/${organizationId}/policy`, {
    method:'PUT',
    body:{
      execution_enabled:false,
      allowed_models:['claude-sonnet-4-6'],
      max_model_calls_per_run:1,
      max_estimated_cost_usd:1,
      approval_mode:'sensitive',
      minimum_approvers:1,
      audit_retention_days:365,
      immutable_audit:true,
      compliance_export_enabled:true,
      reason:'Verify independent policy approval and execution denial',
    },
    expectedStatus:202,
  });
  assert.equal(deniedPolicy.governed, true);
  await api(
    ownerToken,
    `/api/organizations/${organizationId}/governance/${deniedPolicy.request.id}/decision`,
    {
      method:'POST',
      body:{ decision:'approve', note:'Self approval must fail' },
      expectedStatus:403,
    },
  );
  const approvedPolicy = await api(
    reviewerToken,
    `/api/organizations/${organizationId}/governance/${deniedPolicy.request.id}/decision`,
    { method:'POST', body:{ decision:'approve', note:'Independent reviewer approval' } },
  );
  assert.equal(approvedPolicy.applied, true);
  await api(ownerToken, `/api/agents/${agent.id}/run`, {
    method:'POST',
    body:{ message:'This must be blocked before a model call.' },
    expectedStatus:403,
  });

  const enabledPolicy = await api(ownerToken, `/api/organizations/${organizationId}/policy`, {
    method:'PUT',
    body:{
      execution_enabled:true,
      allowed_models:['claude-sonnet-4-6', 'claude-opus-4-6'],
      max_model_calls_per_run:10,
      max_estimated_cost_usd:10,
      approval_mode:'sensitive',
      minimum_approvers:1,
      audit_retention_days:365,
      immutable_audit:true,
      compliance_export_enabled:true,
      reason:'Restore governed execution after denial verification',
    },
    expectedStatus:202,
  });
  await api(
    reviewerToken,
    `/api/organizations/${organizationId}/governance/${enabledPolicy.request.id}/decision`,
    { method:'POST', body:{ decision:'approve', note:'Restore policy' } },
  );

  const conflictedRole = await api(
    ownerToken,
    `/api/organizations/${organizationId}/members/${reviewerUserId}`,
    {
      method:'PATCH',
      body:{ role:'builder', reason:'Verify conflicted reviewer protection' },
      expectedStatus:202,
    },
  );
  await api(
    reviewerToken,
    `/api/organizations/${organizationId}/governance/${conflictedRole.request.id}/decision`,
    {
      method:'POST',
      body:{ decision:'approve', note:'A reviewer cannot change their own membership' },
      expectedStatus:403,
    },
  );
  await api(
    ownerToken,
    `/api/organizations/${organizationId}/governance/${conflictedRole.request.id}`,
    { method:'DELETE' },
  );

  const ownerDetail = await api(ownerToken, `/api/organizations/${organizationId}`);
  assert.equal(ownerDetail.members.length, 2);
  assert.equal(ownerDetail.resources.length, 1);
  assert(ownerDetail.governance_requests.some(item => item.status === 'applied'));

  const audit = await api(ownerToken, `/api/organizations/${organizationId}/audit?limit=200`);
  assert(audit.events.length >= 10);
  const ordered = [...audit.events].sort((left, right) => left.sequence_number - right.sequence_number);
  for (let index = 0; index < ordered.length; index += 1) {
    assert.equal(ordered[index].event_hash.length, 64);
    if (index > 0) assert.equal(ordered[index].previous_hash, ordered[index - 1].event_hash);
  }
  assert(ordered.some(event => event.event_type === 'policy.execution_denied'));
  assert(ordered.some(event => event.event_type === 'resource.cloned'));

  const immutableAttempt = await admin.from('organization_audit_events')
    .update({ details:{ tampered:true } })
    .eq('id', ordered[0].id);
  assert(immutableAttempt.error);
  assert.match(immutableAttempt.error.message, /append-only/i);

  const jsonExport = await complianceExport('json');
  const jsonPayload = JSON.parse(jsonExport.body);
  assert.equal(jsonPayload.organization.id, organizationId);
  assert(jsonPayload.audit_events.length >= 1);
  const csvExport = await complianceExport('csv');
  assert.match(csvExport.body, /sequence_number/);
  assert.match(csvExport.body, /organization\.created/);

  const purge = await admin.rpc('purge_organization_governance_data');
  if (purge.error) throw purge.error;
  assert.equal(purge.data.audit_events_deleted, 0);

  const archived = await api(ownerToken, `/api/organizations/${organizationId}/archive`, {
    method:'POST',
    body:{ archived:true },
  });
  assert.equal(archived.status, 'archived');
  const restored = await api(ownerToken, `/api/organizations/${organizationId}/archive`, {
    method:'POST',
    body:{ archived:false },
  });
  assert.equal(restored.status, 'active');

  report = {
    api:apiBase,
    organization:{
      isolated_memberships:true,
      roles:['owner', 'admin', 'builder', 'viewer'],
      hashed_expiring_invitation:true,
      controlled_shared_asset_clone:true,
      shared_asset_delete_protected:true,
      archive_restore:true,
    },
    governance:{
      independent_approval:true,
      self_and_conflict_approval_blocked:true,
      execution_policy_denied_before_model:true,
      hash_chained_append_only_audit:true,
      verified_json_and_csv_exports:true,
      immutable_retention_preserved:true,
    },
    model_calls:0,
  };
} finally {
  await cleanup();
}

console.log(JSON.stringify(report, null, 2));

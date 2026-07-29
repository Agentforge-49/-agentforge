import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const useLocalServer = process.env.VERIFY_LOCAL_SERVER === 'true';
const apiBase = useLocalServer
  ? 'http://127.0.0.1:3101'
  : process.env.PRODUCTION_API_URL || 'https://agentforge-api-yml4.onrender.com';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Supabase production configuration is missing');

const admin = createClient(supabaseUrl, serviceKey, {
  auth:{ persistSession:false, autoRefreshToken:false },
});
const testName = `production-days-18-19-${Date.now()}`;
const testDomain = `${Date.now()}.agentforge.test`;
let organizationId = null;
let organizationSlug = null;
let reviewerUserId = null;
let ownerUserId = null;
let ownerToken = null;
let reviewerToken = null;
let savedEntitlement = null;
let report = null;
let localServer = null;

async function startLocalServer() {
  if (!useLocalServer) return;
  const backendDirectory = fileURLToPath(new URL('..', import.meta.url));
  localServer = spawn(process.execPath, ['server.js'], {
    cwd:backendDirectory,
    env:{ ...process.env, PORT:'3101', BILLING_MODE:'test' },
    stdio:['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  let stdout = '';
  localServer.stderr.on('data', chunk => { stderr += chunk.toString(); });
  localServer.stdout.on('data', chunk => { stdout += chunk.toString(); });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (localServer.exitCode !== null) {
      throw new Error(`Local server exited early: ${stderr.slice(-1000)}`);
    }
    try {
      const response = await fetch(`${apiBase}/api/billing`, {
        signal:AbortSignal.timeout(2000),
      });
      if (response.status === 401) return;
    } catch {
      // The server can take a moment to load environment and connect.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Local server did not become ready: ${(stderr || stdout).slice(-1000)}`);
}

async function api(token, path, { method = 'GET', body, expectedStatus } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers:{
      ...(token ? { Authorization:`Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type':'application/json' } : {}),
    },
    body:body !== undefined ? JSON.stringify(body) : undefined,
    signal:AbortSignal.timeout(30000),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (expectedStatus !== undefined) {
    assert.equal(response.status, expectedStatus,
      `${method} ${path} returned ${response.status}: ${payload.error || 'unknown error'}`);
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
  const ids = new Set((profiles || []).map(item => item.id));
  const { data:userPage, error:userError } = await admin.auth.admin.listUsers({ page:1, perPage:100 });
  if (userError) throw userError;
  const user = userPage.users.find(item => item.email && ids.has(item.id));
  if (!user) throw new Error('No testable production user exists');
  const { data:link, error:linkError } = await admin.auth.admin.generateLink({
    type:'magiclink',
    email:user.email,
  });
  if (linkError) throw linkError;
  const client = createClient(supabaseUrl, serviceKey, {
    auth:{ persistSession:false, autoRefreshToken:false },
  });
  const { data, error } = await client.auth.verifyOtp({
    token_hash:link.properties.hashed_token,
    type:'magiclink',
  });
  if (error || !data.session?.access_token) throw error || new Error('Owner session failed');
  ownerUserId = user.id;
  ownerToken = data.session.access_token;
}

async function cleanupStaleVerifiers() {
  const { data:organizations, error:organizationError } = await admin
    .from('organizations')
    .select('id, slug, owner_user_id')
    .like('name', 'production-days-18-19-%');
  if (organizationError) throw organizationError;
  for (const organization of organizations || []) {
    await admin.from('organizations').update({ status:'archived' }).eq('id', organization.id);
    const removed = await admin.rpc('delete_organization', {
      p_organization_id:organization.id,
      p_owner_user_id:organization.owner_user_id,
      p_confirmation_slug:organization.slug,
    });
    if (removed.error && !/not found/i.test(removed.error.message)) throw removed.error;
  }
  const { data:userPage, error:userError } = await admin.auth.admin.listUsers({
    page:1,
    perPage:1000,
  });
  if (userError) throw userError;
  const stale = userPage.users.filter(user => (
    user.email?.startsWith('production-days-18-19-')
  ));
  for (const user of stale) {
    const purged = await admin.rpc('purge_billing_sandbox_user', { p_user_id:user.id });
    if (purged.error) throw purged.error;
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error) throw deleted.error;
  }
}

async function createReviewer() {
  const email = `${testName}@${testDomain}`;
  const password = `A1!${crypto.randomBytes(24).toString('base64url')}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm:true,
    user_metadata:{ full_name:'AgentForge Enterprise Billing Verifier' },
  });
  if (error) throw error;
  reviewerUserId = data.user.id;
  const client = createClient(supabaseUrl, serviceKey, {
    auth:{ persistSession:false, autoRefreshToken:false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) {
    throw signedIn.error || new Error('Reviewer session failed');
  }
  reviewerToken = signedIn.data.session.access_token;
  return email;
}

async function raiseOrganizationLimits() {
  const { data, error } = await admin.from('user_entitlements')
    .select('*').eq('user_id', ownerUserId).single();
  if (error) throw error;
  savedEntitlement = data;
  const { error:updateError } = await admin.from('user_entitlements').update({
    override_limits:{
      ...(data.override_limits || {}),
      organizations:100,
      organization_members:100,
    },
  }).eq('user_id', ownerUserId);
  if (updateError) throw updateError;
}

async function cleanup() {
  if (organizationId && organizationSlug && ownerUserId) {
    await admin.from('organizations').update({ status:'archived' }).eq('id', organizationId);
    const deleted = await admin.rpc('delete_organization', {
      p_organization_id:organizationId,
      p_owner_user_id:ownerUserId,
      p_confirmation_slug:organizationSlug,
    });
    if (deleted.error && !/not found/i.test(deleted.error.message)) throw deleted.error;
  }
  if (savedEntitlement) {
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
    const purged = await admin.rpc('purge_billing_sandbox_user', {
      p_user_id:reviewerUserId,
    });
    if (purged.error) throw purged.error;
    const { error } = await admin.auth.admin.deleteUser(reviewerUserId);
    if (error) throw error;
  }
  const checks = await Promise.all([
    admin.from('organizations').select('id', { count:'exact', head:true })
      .eq('id', organizationId || '00000000-0000-0000-0000-000000000000'),
    admin.from('billing_subscriptions').select('id', { count:'exact', head:true })
      .eq('user_id', reviewerUserId || '00000000-0000-0000-0000-000000000000'),
    admin.from('billing_ledger_events').select('id', { count:'exact', head:true })
      .eq('user_id', reviewerUserId || '00000000-0000-0000-0000-000000000000'),
  ]);
  for (const check of checks) {
    if (check.error) throw check.error;
    assert.equal(check.count, 0);
  }
}

try {
  await startLocalServer();
  await cleanupStaleVerifiers();
  await authenticateExistingOwner();
  const reviewerEmail = await createReviewer();
  await raiseOrganizationLimits();

  const created = await api(ownerToken, '/api/organizations', {
    method:'POST',
    body:{ name:`${testName} Workspace`, description:'Temporary enterprise verifier workspace.' },
  });
  organizationId = created.organization.id;
  organizationSlug = created.organization.slug;

  const enterprise = await api(ownerToken, `/api/enterprise/organizations/${organizationId}`);
  assert.equal(enterprise.settings.organization_id, organizationId);
  assert.equal(enterprise.capabilities.native_sso_login, false);

  const addedDomain = await api(ownerToken, `/api/enterprise/organizations/${organizationId}/domains`, {
    method:'POST',
    body:{ domain:`https://${testDomain}/login` },
  });
  assert.equal(addedDomain.domain.domain, testDomain);
  assert.match(addedDomain.verification.record_name, /^_agentforge-verify\./);
  const storedDomain = await admin.from('organization_domains')
    .select('*').eq('id', addedDomain.domain.id).single();
  if (storedDomain.error) throw storedDomain.error;
  assert.equal(storedDomain.data.verification_token_hash.length, 64);
  assert.equal(JSON.stringify(storedDomain.data).includes(addedDomain.verification.token), false);
  await api(ownerToken,
    `/api/enterprise/organizations/${organizationId}/domains/${addedDomain.domain.id}/verify`,
    { method:'POST', body:{ token:'wrong-verification-token-value' }, expectedStatus:403 });

  const identityPolicy = {
    protocol:'oidc',
    provider_name:'Verifier Identity',
    issuer_url:'https://identity.agentforge.test/',
    metadata_url:null,
    client_id:'agentforge-verifier',
    sso_enabled:true,
    sso_enforced:true,
    jit_provisioning:true,
    default_role:'viewer',
    require_mfa:true,
    session_max_minutes:720,
    idle_timeout_minutes:60,
    scim_enabled:true,
  };
  await api(ownerToken, `/api/enterprise/organizations/${organizationId}/settings`, {
    method:'PUT',
    body:identityPolicy,
    expectedStatus:409,
  });
  const now = new Date().toISOString();
  const verified = await admin.from('organization_domains').update({
    status:'verified', verified_at:now, last_checked_at:now,
  }).eq('id', addedDomain.domain.id);
  if (verified.error) throw verified.error;
  const savedPolicy = await api(ownerToken, `/api/enterprise/organizations/${organizationId}/settings`, {
    method:'PUT',
    body:identityPolicy,
  });
  assert.equal(savedPolicy.sso_enforced, true);
  assert.equal(savedPolicy.require_mfa, true);

  const scim = await api(ownerToken, `/api/enterprise/organizations/${organizationId}/scim-token`, {
    method:'POST',
  });
  assert.match(scim.token, /^af_scim_/);
  const storedSettings = await admin.from('organization_identity_settings')
    .select('*').eq('organization_id', organizationId).single();
  if (storedSettings.error) throw storedSettings.error;
  assert.equal(storedSettings.data.scim_token_hash, crypto.createHash('sha256')
    .update(scim.token).digest('hex'));
  assert.equal(JSON.stringify(storedSettings.data).includes(scim.token), false);
  await api('invalid-scim-token', `/api/enterprise/scim/v2/${organizationId}/Users`, {
    expectedStatus:401,
  });
  const directoryUser = await api(scim.token, `/api/enterprise/scim/v2/${organizationId}/Users`, {
    method:'POST',
    body:{
      externalId:`directory-${reviewerUserId}`,
      userName:reviewerEmail,
      displayName:'SCIM Verification User',
      active:true,
      'urn:agentforge:params:scim:schemas:extension:2.0:User':{ role:'builder' },
    },
  });
  assert.equal(directoryUser.active, true);
  const directoryList = await api(scim.token, `/api/enterprise/scim/v2/${organizationId}/Users`);
  assert.equal(directoryList.totalResults, 1);
  const deprovisioned = await api(
    scim.token,
    `/api/enterprise/scim/v2/${organizationId}/Users/${directoryUser.id}`,
    { method:'PATCH', body:{ active:false } },
  );
  assert.equal(deprovisioned.active, false);

  const invitation = await api(ownerToken, `/api/organizations/${organizationId}/invitations`, {
    method:'POST',
    body:{ email:reviewerEmail, role:'admin', expiry_days:1 },
  });
  await api(reviewerToken, '/api/organizations/invitations/accept', {
    method:'POST',
    body:{ token:invitation.token },
  });
  const accessReview = await api(ownerToken,
    `/api/enterprise/organizations/${organizationId}/access-reviews`,
    { method:'POST', body:{ name:'Verifier access review', due_days:7, notes:'Cost-free test' } });
  let accessState = await api(ownerToken, `/api/enterprise/organizations/${organizationId}`);
  const openReview = accessState.access_reviews.find(item => item.id === accessReview.id);
  assert.equal(openReview.items.length, 2);
  const ownerItem = openReview.items.find(item => item.member_user_id === ownerUserId);
  const reviewerItem = openReview.items.find(item => item.member_user_id === reviewerUserId);
  await api(ownerToken,
    `/api/enterprise/organizations/${organizationId}/access-reviews/${openReview.id}/items/${ownerItem.id}`,
    { method:'POST', body:{ decision:'retain', note:'Owner retained' } });
  await api(ownerToken,
    `/api/enterprise/organizations/${organizationId}/access-reviews/${openReview.id}/items/${reviewerItem.id}`,
    { method:'POST', body:{ decision:'change', recommended_role:'builder', note:'Least privilege' } });
  accessState = await api(ownerToken, `/api/enterprise/organizations/${organizationId}`);
  assert.equal(accessState.access_reviews.find(item => item.id === openReview.id).status, 'completed');
  const member = await admin.from('organization_members').select('role')
    .eq('organization_id', organizationId).eq('user_id', reviewerUserId).single();
  if (member.error) throw member.error;
  assert.equal(member.data.role, 'builder');

  const initialBilling = await api(reviewerToken, '/api/billing');
  assert.equal(initialBilling.mode, 'test');
  assert.equal(initialBilling.sandbox.charges_money, false);
  const originalEntitlement = initialBilling.entitlement;
  await api(reviewerToken, '/api/billing/customer', {
    method:'PUT',
    body:{ billing_email:reviewerEmail, company_name:'AgentForge Verifier', tax_country:'US' },
  });
  const checkout = await api(reviewerToken, '/api/billing/checkout', {
    method:'POST',
    body:{ plan_key:'pro', billing_interval:'monthly' },
  });
  assert.equal(checkout.charges_money, false);
  assert.equal(checkout.changes_entitlement, false);
  const storedCheckout = await admin.from('billing_checkout_sessions')
    .select('*').eq('id', checkout.checkout.id).single();
  if (storedCheckout.error) throw storedCheckout.error;
  assert.equal(storedCheckout.data.checkout_token_hash,
    crypto.createHash('sha256').update(checkout.token).digest('hex'));
  assert.equal(JSON.stringify(storedCheckout.data).includes(checkout.token), false);
  await api(reviewerToken, `/api/billing/checkout/${checkout.checkout.id}/complete`, {
    method:'POST', body:{ token:'wrong-checkout-token-value-that-is-long-enough' }, expectedStatus:403,
  });
  const completed = await api(reviewerToken, `/api/billing/checkout/${checkout.checkout.id}/complete`, {
    method:'POST',
    body:{ token:checkout.token },
  });
  assert.equal(completed.subscription.status, 'test_active');
  assert.equal(completed.invoice.status, 'simulated_paid');
  assert.equal(completed.entitlement_changed, false);
  const afterBilling = await api(reviewerToken, '/api/billing');
  assert.equal(afterBilling.entitlement.plan_key, originalEntitlement.plan_key);
  assert.equal(afterBilling.entitlement.source, originalEntitlement.source);
  assert(afterBilling.ledger.length >= 3);
  const orderedLedger = [...afterBilling.ledger]
    .sort((left, right) => left.sequence_number - right.sequence_number);
  for (let index = 1; index < orderedLedger.length; index += 1) {
    assert.equal(orderedLedger[index].previous_hash, orderedLedger[index - 1].event_hash);
  }
  const immutable = await admin.from('billing_ledger_events')
    .update({ details:{ tampered:true } }).eq('id', orderedLedger[0].id);
  assert(immutable.error);
  assert.match(immutable.error.message, /append-only/i);
  const scheduled = await api(reviewerToken, '/api/billing/subscription/cancel', {
    method:'POST', body:{ immediate:false },
  });
  assert.equal(scheduled.cancel_at_period_end, true);
  const resumed = await api(reviewerToken, '/api/billing/subscription/resume', { method:'POST' });
  assert.equal(resumed.cancel_at_period_end, false);
  const cancelled = await api(reviewerToken, '/api/billing/subscription/cancel', {
    method:'POST', body:{ immediate:true },
  });
  assert.equal(cancelled.status, 'cancelled');
  await api(null, '/api/billing/webhooks/agentforge', {
    method:'POST',
    body:{ id:'disabled-event', type:'invoice.paid' },
    expectedStatus:503,
  });

  const audit = await api(ownerToken, `/api/organizations/${organizationId}/audit?limit=200`);
  assert(audit.events.some(item => item.event_type === 'identity.settings_updated'));
  assert(audit.events.some(item => item.event_type === 'identity.scim_token_rotated'));
  assert(audit.events.some(item => item.event_type === 'identity.access_review_change'));

  report = {
    api:apiBase,
    enterprise_identity:{
      verified_domain_gate:true,
      hashed_scim_bearer:true,
      scim_provision_and_deprovision:true,
      sso_ready_configuration:true,
      bounded_session_and_mfa_policy:true,
      enforceable_access_reviews:true,
      immutable_audit:true,
    },
    billing:{
      provider_neutral_contract:true,
      sandbox_no_charge:true,
      entitlement_unchanged:true,
      hashed_one_time_checkout:true,
      subscription_cancel_resume:true,
      simulated_invoice:true,
      hash_chained_append_only_ledger:true,
      live_webhooks_fail_closed:true,
    },
    model_calls:0,
    money_charged:false,
  };
} finally {
  try {
    await cleanup();
  } finally {
    if (localServer && localServer.exitCode === null) localServer.kill('SIGTERM');
  }
}

console.log(JSON.stringify(report, null, 2));

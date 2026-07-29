import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  createEnterpriseToken,
  hashEnterpriseToken,
  normalizeOrganizationDomain,
  validateIdentitySettings,
  verifyOrganizationDomainDns,
} from '../lib/enterprise.js';
import {
  hashBillingValue,
  validateCheckoutInput,
  verifyWebhookSignature,
} from '../lib/billing.js';

test('organization domains are normalized and unsafe hosts are rejected', () => {
  assert.equal(normalizeOrganizationDomain(' HTTPS://Login.Example.COM/path '), 'login.example.com');
  assert.throws(() => normalizeOrganizationDomain('localhost'), /registrable domain/);
  assert.throws(() => normalizeOrganizationDomain('https://bad_domain.test'), /registrable domain/);
});

test('enterprise tokens are random and persisted only through deterministic hashes', () => {
  const first = createEnterpriseToken();
  const second = createEnterpriseToken();
  assert.notEqual(first, second);
  assert.equal(hashEnterpriseToken(first), hashEnterpriseToken(first));
  assert.equal(hashEnterpriseToken(first).length, 64);
});

test('identity policy validates SSO and bounded session controls', () => {
  const value = validateIdentitySettings({
    protocol:'oidc',
    provider_name:'Example Identity',
    issuer_url:'https://identity.example.com/',
    metadata_url:'',
    client_id:'agentforge',
    sso_enabled:true,
    sso_enforced:false,
    jit_provisioning:true,
    default_role:'viewer',
    require_mfa:true,
    session_max_minutes:720,
    idle_timeout_minutes:60,
    scim_enabled:true,
  });
  assert.equal(value.issuer_url, 'https://identity.example.com/');
  assert.equal(value.require_mfa, true);
  assert.throws(() => validateIdentitySettings({
    ...value,
    session_max_minutes:30,
    idle_timeout_minutes:60,
  }), /cannot exceed/);
  assert.throws(() => validateIdentitySettings({
    ...value,
    issuer_url:null,
    metadata_url:null,
  }), /issuer URL or metadata URL/);
});

test('DNS domain verification requires the exact challenge value', async () => {
  const resolver = async host => {
    assert.equal(host, '_agentforge-verify.example.com');
    return [['agentforge-verification=', 'secret-token']];
  };
  assert.equal(await verifyOrganizationDomainDns('example.com', 'secret-token', resolver), true);
  await assert.rejects(
    verifyOrganizationDomainDns('example.com', 'other-token', resolver),
    /does not match/,
  );
});

test('checkout input permits only paid-plan contracts and supported intervals', () => {
  assert.deepEqual(validateCheckoutInput({
    plan_key:'pro',
    billing_interval:'monthly',
  }), { planKey:'pro', interval:'monthly' });
  assert.throws(() => validateCheckoutInput({
    plan_key:'free',
    billing_interval:'monthly',
  }), /Pro or Enterprise/);
  assert.throws(() => validateCheckoutInput({
    plan_key:'pro',
    billing_interval:'weekly',
  }), /monthly or annual/);
});

test('billing webhook signatures are verified with constant-time digest comparison', () => {
  const rawBody = Buffer.from('{"id":"event-1"}');
  const secret = 'unit-test-secret';
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  assert.equal(verifyWebhookSignature({ rawBody, signature, secret }), true);
  assert.equal(verifyWebhookSignature({ rawBody, signature:'00'.repeat(32), secret }), false);
  assert.equal(verifyWebhookSignature({ rawBody, signature:'bad', secret }), false);
  assert.equal(hashBillingValue(rawBody).length, 64);
});

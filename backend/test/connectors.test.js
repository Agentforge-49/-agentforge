import assert from 'node:assert/strict';
import test from 'node:test';

import {
  credentialAuthHeaders,
  CONNECTOR_DEFINITIONS,
  assertSafeConnectorUrl,
  buildAppConnectorRequest,
  renderConnectorParameters,
  validateConnectorConfig,
} from '../lib/connectors.js';

test('connector configuration requires supported actions and credentials', () => {
  const valid = validateConnectorConfig({
    action:'slack.message',
    credential_id:'11111111-1111-4111-8111-111111111111',
    parameters:{ channel:'C123', text:'{{input}}' },
  });
  assert.deepEqual(valid.errors, []);
  const invalid = validateConnectorConfig({
    action:'email.send',
    parameters:{},
  });
  assert.match(invalid.errors.join(' '), /requires a credential/);
  const email = CONNECTOR_DEFINITIONS.find(item => item.action === 'email.send');
  assert.deepEqual(email.providers, ['resend']);
});

test('universal connector supports common API authentication schemes', () => {
  const bearer = credentialAuthHeaders({ secret:'token-value', credential:{ metadata:{ auth_mode:'bearer' } } });
  assert.deepEqual(bearer, { Authorization:'Bearer token-value' });
  const header = credentialAuthHeaders({ secret:'api-key-value', credential:{ metadata:{ auth_mode:'header', header_name:'X-API-Key' } } });
  assert.deepEqual(header, { 'X-API-Key':'api-key-value' });
  const basic = credentialAuthHeaders({ secret:'user:password', credential:{ metadata:{ auth_mode:'basic' } } });
  assert.equal(basic.Authorization, `Basic ${Buffer.from('user:password').toString('base64')}`);
  assert.throws(
    () => credentialAuthHeaders({ secret:'value', credential:{ metadata:{ auth_mode:'header', header_name:'Authorization' } } }),
    /header name is invalid/,
  );
});

test('launch connector catalog exposes typed actions for major business apps', () => {
  const actions = new Set(CONNECTOR_DEFINITIONS.map(item => item.action));
  for (const action of [
    'github.issue.create', 'discord.message', 'notion.page.create',
    'airtable.record.create', 'hubspot.contact.create', 'salesforce.record.create',
    'stripe.customer.create', 'shopify.product.create', 'jira.issue.create',
    'linear.issue.create', 'twilio.message.send', 'zendesk.ticket.create',
  ]) assert(actions.has(action), `${action} should be available`);
  assert.equal(CONNECTOR_DEFINITIONS.length, 19);
});

test('typed app requests use fixed provider hosts and never put secrets in URLs', () => {
  const secret = 'launch-secret-value';
  const twilioAccountSid = `AC${'01'.repeat(16)}`;
  const requests = [
    buildAppConnectorRequest('github.issue.create', { owner:'agentforge', repository:'platform', title:'Launch' }, secret),
    buildAppConnectorRequest('discord.message', { channel_id:'1234567890', content:'Launch' }, secret),
    buildAppConnectorRequest('notion.page.create', { parent_page_id:'0123456789abcdef0123456789abcdef', title:'Launch' }, secret),
    buildAppConnectorRequest('airtable.record.create', { base_id:'app123456789', table_id:'tbl123456789', fields:{ Name:'Launch' } }, secret),
    buildAppConnectorRequest('hubspot.contact.create', { properties:{ email:'launch@example.com' } }, secret),
    buildAppConnectorRequest('salesforce.record.create', { instance:'agentforge', object:'Lead', fields:{ LastName:'Launch' } }, secret),
    buildAppConnectorRequest('stripe.customer.create', { email:'launch@example.com' }, secret),
    buildAppConnectorRequest('shopify.product.create', { store:'agentforge-demo', title:'Launch' }, secret),
    buildAppConnectorRequest('jira.issue.create', { site:'agentforge', email:'ops@example.com', project_key:'AF', summary:'Launch' }, secret),
    buildAppConnectorRequest('linear.issue.create', { team_id:'01234567-89ab-cdef-0123-456789abcdef', title:'Launch' }, secret),
    buildAppConnectorRequest('twilio.message.send', { account_sid:twilioAccountSid, to:'+15550000001', from:'+15550000002', body:'Launch' }, secret),
    buildAppConnectorRequest('zendesk.ticket.create', { subdomain:'agentforge', email:'ops@example.com', subject:'Launch', comment:'Ready' }, secret),
  ];
  assert.equal(requests.length, 12);
  for (const request of requests) {
    assert.equal(new URL(request.url).protocol, 'https:');
    assert(!request.url.includes(secret));
    assert.equal(request.options.method, 'POST');
    assert(!Object.values(request.options.headers).includes(undefined));
  }
});

test('typed app request validation rejects tenant and identifier injection', () => {
  assert.throws(
    () => buildAppConnectorRequest('shopify.product.create', { store:'evil.example.com', title:'No' }, 'secret-value'),
    /Shopify store is invalid/,
  );
  assert.throws(
    () => buildAppConnectorRequest('salesforce.record.create', { instance:'good/../../evil', object:'Lead', fields:{} }, 'secret-value'),
    /Salesforce instance is invalid/,
  );
});

test('connector templates render nested values without mutating input', () => {
  const parameters = {
    text:'Result: {{input}}',
    nested:{ values:['{{input}}'] },
  };
  const rendered = renderConnectorParameters(parameters, 'ready');
  assert.deepEqual(rendered, {
    text:'Result: ready',
    nested:{ values:['ready'] },
  });
  assert.equal(parameters.text, 'Result: {{input}}');
});

test('connector URL controls reject insecure and private destinations', async () => {
  await assert.rejects(
    () => assertSafeConnectorUrl('http://example.com'),
    /must use HTTPS/,
  );
  await assert.rejects(
    () => assertSafeConnectorUrl('https://127.0.0.1/internal'),
    /blocked network/,
  );
  await assert.rejects(
    () => assertSafeConnectorUrl('https://192.0.2.1/documentation-network'),
    /blocked network/,
  );
  await assert.rejects(
    () => assertSafeConnectorUrl('https://[::1]/internal'),
    /blocked network/,
  );
  await assert.rejects(
    () => assertSafeConnectorUrl('https://example.com', { allowedHostSuffix:'.supabase.co' }),
    /must use a .supabase.co host/,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONNECTOR_DEFINITIONS,
  assertSafeConnectorUrl,
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

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  connectLinkForApp,
  integrationBridgeConfig,
  normalizeIntegrationSlug,
} from '../lib/integration-bridge.js';

test('integration bridge reports configuration without exposing secrets', () => {
  const config = integrationBridgeConfig({
    PIPEDREAM_CLIENT_ID:'client-id',
    PIPEDREAM_CLIENT_SECRET:'top-secret',
    PIPEDREAM_PROJECT_ID:'proj_Abc123',
    PIPEDREAM_ENVIRONMENT:'production',
  });
  assert.equal(config.configured, true);
  assert.equal(config.environment, 'production');
  assert.equal(Object.hasOwn(config, 'accessToken'), false);
});

test('integration app slugs and hosted links are bounded', () => {
  assert.equal(normalizeIntegrationSlug('Google_Sheets'), 'google_sheets');
  assert.equal(normalizeIntegrationSlug('../unsafe'), null);
  const link = connectLinkForApp('https://pipedream.com/_static/connect.html?token=abc', 'google_sheets');
  assert.equal(new URL(link).searchParams.get('app'), 'google_sheets');
});

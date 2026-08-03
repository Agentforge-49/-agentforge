import test from 'node:test';
import assert from 'node:assert/strict';

import { validateAgentConfig, draftDefaults } from '../lib/agent-config.js';
import {
  MODEL_CATALOG,
  SUPPORTED_MODEL_IDS,
  modelProvider,
} from '../lib/model-catalog.js';
import {
  buildAuthorizationUrl,
  createOauthState,
  hashOauthNonce,
  oauthProviderStatus,
  refreshOauthAccessToken,
  verifyOauthState,
} from '../lib/oauth.js';

test('model catalog covers every supported provider', () => {
  assert.equal(SUPPORTED_MODEL_IDS.length, 6);
  assert.equal(modelProvider('claude-sonnet-4-6'), 'anthropic');
  assert.equal(modelProvider('gpt-5.6-terra'), 'openai');
  assert.equal(modelProvider('gemini-3.5-flash'), 'google');
  assert.equal(modelProvider('unknown'), null);
  assert.equal(MODEL_CATALOG['gpt-5.6-sol'].label, 'GPT-5.6 Sol');
});

test('agent validation accepts supported OpenAI and Google models', () => {
  for (const model of ['gpt-5.6-sol', 'gemini-3.5-flash']) {
    const { errors } = validateAgentConfig({
      ...draftDefaults({ name: 'Multi-model agent' }),
      system_prompt: 'Complete the requested task safely.',
      model,
    }, { forPublish: true });
    assert.deepEqual(errors, []);
  }
});

test('OAuth state is signed, expires, and rejects tampering', () => {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const state = createOauthState({
    userId: 'user-123',
    provider: 'google',
    nonce: 'nonce-123',
    expiresAt,
  });
  const parsed = verifyOauthState(state);
  assert.equal(parsed.sub, 'user-123');
  assert.equal(parsed.provider, 'google');
  assert.equal(parsed.nonce, 'nonce-123');
  assert.throws(() => verifyOauthState(`${state}x`), /invalid/i);
  assert.throws(() => createOauthState({
    userId: 'user-123',
    provider: 'google',
    nonce: 'nonce-123',
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  }) && verifyOauthState(createOauthState({
    userId: 'user-123',
    provider: 'google',
    nonce: 'nonce-123',
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  })), /expired/i);
  assert.equal(hashOauthNonce('nonce-123').length, 64);
});

test('Google authorization URL includes safe OAuth parameters', () => {
  const previousId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const previousSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'google-client-id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'google-client-secret';
  try {
    const url = new URL(buildAuthorizationUrl(
      'google',
      'signed-state',
      'https://api.example.com/api/oauth/callback/google',
    ));
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('client_id'), 'google-client-id');
    assert.equal(url.searchParams.get('state'), 'signed-state');
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.match(url.searchParams.get('scope'), /spreadsheets/);
    assert.equal(oauthProviderStatus('google').configured, true);
  } finally {
    if (previousId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = previousId;
    if (previousSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    else process.env.GOOGLE_OAUTH_CLIENT_SECRET = previousSecret;
  }
});

test('OAuth refresh exchanges a refresh token without exposing it in the URL', async () => {
  const previousId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const previousSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const previousFetch = globalThis.fetch;
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'google-client-id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'google-client-secret';
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url:String(url), options };
    return new Response(JSON.stringify({
      access_token:'fresh-access-token',
      expires_in:3600,
      token_type:'Bearer',
    }), { status:200, headers:{ 'Content-Type':'application/json' } });
  };
  try {
    const result = await refreshOauthAccessToken('google', 'stored-refresh-token');
    assert.equal(result.access_token, 'fresh-access-token');
    assert.equal(request.url, 'https://oauth2.googleapis.com/token');
    assert.doesNotMatch(request.url, /stored-refresh-token/);
    const body = new URLSearchParams(String(request.options.body));
    assert.equal(body.get('grant_type'), 'refresh_token');
    assert.equal(body.get('refresh_token'), 'stored-refresh-token');
    assert.equal(request.options.redirect, 'manual');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = previousId;
    if (previousSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    else process.env.GOOGLE_OAUTH_CLIENT_SECRET = previousSecret;
  }
});

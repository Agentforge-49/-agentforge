import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  createDeveloperApiKey,
  deliverDeveloperWebhook,
  deriveWebhookSecret,
  hashDeveloperSecret,
  signWebhookPayload,
  validateDeveloperKeyInput,
  validateWebhookInput,
} from '../lib/developer-platform.js';
import {
  canonicalJson,
  recoveryManifestHash,
  verifyRecoveryManifest,
} from '../lib/launch-readiness.js';

test('developer API keys are random, prefix-safe, and persisted only as hashes', () => {
  const first = createDeveloperApiKey();
  const second = createDeveloperApiKey();
  assert.match(first.raw, /^afk_live_[A-Za-z0-9_-]{32,}$/);
  assert.notEqual(first.raw, second.raw);
  assert.equal(first.hash, hashDeveloperSecret(first.raw));
  assert.equal(first.hash.length, 64);
  assert(first.raw.startsWith(first.prefix));
});

test('developer API key validation bounds scopes, rate, and expiry', () => {
  const result = validateDeveloperKeyInput({
    name:'Production integration',
    scopes:['agents:read', 'agents:run', 'agents:read'],
    rate_limit_per_minute:120,
    expiry_days:30,
  });
  assert.deepEqual(result.scopes, ['agents:read', 'agents:run']);
  assert.equal(result.rateLimit, 120);
  assert.throws(() => validateDeveloperKeyInput({
    name:'x',
    scopes:['root'],
    rate_limit_per_minute:1,
  }));
});

test('webhook configuration allows only bounded supported events', () => {
  const result = validateWebhookInput({
    name:'Run events',
    endpoint_url:'https://example.com/webhooks/agentforge',
    event_types:['agent.run.completed', 'agent.run.failed'],
    max_attempts:5,
  });
  assert.equal(result.eventTypes.length, 2);
  assert.throws(() => validateWebhookInput({
    name:'Bad events',
    endpoint_url:'https://example.com',
    event_types:['credential.created'],
    max_attempts:5,
  }), /supported/);
});

test('webhook secrets are deterministic per subscription and signed with timestamp', () => {
  const secret = deriveWebhookSecret('subscription-1', 'unit-master-key');
  assert.equal(secret, deriveWebhookSecret('subscription-1', 'unit-master-key'));
  assert.notEqual(secret, deriveWebhookSecret('subscription-2', 'unit-master-key'));
  const signed = signWebhookPayload({ ok:true }, secret, 12345);
  const expected = crypto.createHmac('sha256', secret)
    .update(`12345.${signed.body}`).digest('hex');
  assert.equal(signed.signature, `t=12345,v1=${expected}`);
});

test('webhook delivery emits a signed bounded request and accepts 2xx', async () => {
  const previousKey = process.env.DEVELOPER_WEBHOOK_SIGNING_KEY;
  process.env.DEVELOPER_WEBHOOK_SIGNING_KEY = 'unit-delivery-master-key';
  let captured;
  const result = await deliverDeveloperWebhook({
    subscription:{ id:'sub-1', endpoint_url:'https://hooks.example.com/agentforge' },
    event:{
      id:'event-1',
      event_type:'test.ping',
      occurred_at:'2026-07-29T00:00:00.000Z',
      payload:{ message:'hello' },
    },
    endpointValidator:async url => new URL(url),
    fetchImpl:async (url, options) => {
      captured = { url, options };
      return new Response(null, { status:204 });
    },
  });
  if (previousKey === undefined) delete process.env.DEVELOPER_WEBHOOK_SIGNING_KEY;
  else process.env.DEVELOPER_WEBHOOK_SIGNING_KEY = previousKey;
  assert.equal(result.delivered, true);
  assert.equal(captured.url, 'https://hooks.example.com/agentforge');
  assert.match(captured.options.headers['X-AgentForge-Signature'], /^t=\d+,v1=[0-9a-f]{64}$/);
  assert.equal(JSON.parse(captured.options.body).type, 'test.ping');
});

test('webhook delivery classifies retryable provider failures', async () => {
  const previousKey = process.env.DEVELOPER_WEBHOOK_SIGNING_KEY;
  process.env.DEVELOPER_WEBHOOK_SIGNING_KEY = 'unit-delivery-master-key';
  await assert.rejects(
    deliverDeveloperWebhook({
      subscription:{ id:'sub-2', endpoint_url:'https://hooks.example.com/agentforge' },
      event:{ id:'event-2', event_type:'test.ping', occurred_at:new Date().toISOString(), payload:{} },
      endpointValidator:async url => new URL(url),
      fetchImpl:async () => new Response('unavailable', { status:503 }),
    }),
    error => error.code === 'WEBHOOK_PROVIDER_ERROR' && error.status === 503,
  );
  if (previousKey === undefined) delete process.env.DEVELOPER_WEBHOOK_SIGNING_KEY;
  else process.env.DEVELOPER_WEBHOOK_SIGNING_KEY = previousKey;
});

test('canonical recovery hashing is stable across object key order', () => {
  assert.equal(canonicalJson({ b:2, a:1 }), canonicalJson({ a:1, b:2 }));
  assert.equal(recoveryManifestHash({ b:2, a:1 }), recoveryManifestHash({ a:1, b:2 }));
});

test('recovery verification detects hashes, ownership, counts, and sensitive fields', () => {
  const manifest = {
    format:'agentforge-recovery',
    schema_version:1,
    owner_user_id:'user-1',
    secrets_excluded:true,
    resources:{ agents:[{ id:'agent-1', max_tokens:100 }] },
    resource_counts:{ agents:1 },
  };
  const valid = verifyRecoveryManifest({
    manifest,
    manifest_sha256:recoveryManifestHash(manifest),
  }, 'user-1');
  assert.equal(valid.status, 'passed');

  const tampered = structuredClone(manifest);
  tampered.resources.agents[0].secret = 'not-allowed';
  const invalid = verifyRecoveryManifest({
    manifest:tampered,
    manifest_sha256:recoveryManifestHash(tampered),
  }, 'user-1');
  assert.equal(invalid.status, 'failed');
  assert.equal(invalid.checks.find(item => item.key === 'sensitive_fields').passed, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  signWebhook,
  verifyWebhookSignature,
} from '../lib/webhook-signature.js';

test('webhook signatures accept an authentic recent delivery', () => {
  const secret = 'webhook-secret-value';
  const timestamp = '1785340800';
  const rawBody = Buffer.from('{"input":"hello"}');
  const signature = `sha256=${signWebhook(secret, timestamp, rawBody)}`;
  assert.equal(verifyWebhookSignature({
    secret,
    timestamp,
    signature,
    rawBody,
    now: 1785340800 * 1000,
  }), true);
});

test('webhook signatures reject tampering and stale timestamps', () => {
  const secret = 'webhook-secret-value';
  const timestamp = '1785340800';
  const rawBody = Buffer.from('{"input":"hello"}');
  const signature = `sha256=${signWebhook(secret, timestamp, rawBody)}`;
  assert.equal(verifyWebhookSignature({
    secret,
    timestamp,
    signature,
    rawBody: Buffer.from('{"input":"changed"}'),
    now: 1785340800 * 1000,
  }), false);
  assert.equal(verifyWebhookSignature({
    secret,
    timestamp,
    signature,
    rawBody,
    now: (1785340800 + 301) * 1000,
  }), false);
});

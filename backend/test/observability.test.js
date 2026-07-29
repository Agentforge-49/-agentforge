import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimateCostUsd,
  redactTelemetry,
  structuredError,
} from '../lib/observability.js';

test('telemetry redacts secret keys and common credential values', () => {
  const redacted = redactTelemetry({
    authorization:'Bearer private-token',
    nested:{ api_key:'sk_example_123456789', safe:'visible' },
    message:'Request used Bearer secret-value',
  });
  assert.equal(redacted.authorization, '[REDACTED]');
  assert.equal(redacted.nested.api_key, '[REDACTED]');
  assert.equal(redacted.nested.safe, 'visible');
  assert.equal(redacted.message, 'Request used Bearer [REDACTED]');
});

test('cost estimates are deterministic and non-negative', () => {
  assert.equal(estimateCostUsd(1_000_000, 'claude-sonnet-4-6'), 9);
  assert.equal(estimateCostUsd(1000, 'unknown'), 0);
  assert.equal(estimateCostUsd(-1, 'claude-opus-4-6'), 0);
});

test('errors are categorized without exposing credentials', () => {
  const error = structuredError(new Error('Network timeout with Bearer private-value'));
  assert.equal(error.category, 'timeout');
  assert.equal(error.retryable, true);
  assert(!error.message.includes('private-value'));
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvedLimits } from '../lib/usage.js';

test('entitlement overrides replace only explicitly configured plan limits', () => {
  assert.deepEqual(resolvedLimits(
    { limits:{ model_calls:50, tokens:100000, agents:10 } },
    { override_limits:{ model_calls:75 } },
  ), { model_calls:75, tokens:100000, agents:10 });
});

test('missing plan data resolves to a safe empty limit set', () => {
  assert.deepEqual(resolvedLimits(null, null), {});
});

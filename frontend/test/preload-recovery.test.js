import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldReloadPreloadError } from '../src/lib/preload-recovery.js'

test('stale production bundles reload once outside the cooldown window', () => {
  assert.equal(shouldReloadPreloadError(null, 50_000), true)
  assert.equal(shouldReloadPreloadError('40000', 50_000), false)
  assert.equal(shouldReloadPreloadError('30000', 50_000), true)
})

test('invalid preload markers fail open to a safe recovery reload', () => {
  assert.equal(shouldReloadPreloadError('not-a-number', 50_000), true)
})

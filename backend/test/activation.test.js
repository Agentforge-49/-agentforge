import assert from 'node:assert/strict';
import test from 'node:test';

import { buildActivationSummary } from '../lib/activation.js';

test('activation summary exposes a safe next step without collecting content', () => {
  const result = buildActivationSummary({ profileCreatedAt:'2026-08-17T10:00:00.000Z' });

  assert.equal(result.completed, 1);
  assert.equal(result.percentage, 14);
  assert.equal(result.activated, false);
  assert.equal(result.current_stage.key, 'connection');
  assert.equal(result.privacy.content_collected, false);
  assert.equal(JSON.stringify(result).includes('prompt'), false);
});

test('activation summary reports a complete, successful launch path', () => {
  const result = buildActivationSummary({
    profileCreatedAt:'2026-08-17T10:00:00.000Z',
    firstRunAt:'2026-08-17T10:32:00.000Z',
    connections:2,
    publishedAgents:1,
    activeWorkflows:1,
    totalRuns:4,
    recentRunStatuses:['succeeded', 'succeeded', 'failed', 'running'],
    resolvedApprovals:1,
    pendingApprovals:2,
    qualitySuites:1,
    verifiedRecoveries:1,
  });

  assert.equal(result.percentage, 100);
  assert.equal(result.activated, true);
  assert.equal(result.current_stage, null);
  assert.equal(result.time_to_first_value_minutes, 32);
  assert.equal(result.signals.success_rate, 67);
  assert.equal(result.signals.pending_approvals, 2);
});

test('activation summary handles malformed values safely', () => {
  const result = buildActivationSummary({
    profileCreatedAt:'invalid',
    firstRunAt:'invalid',
    connections:-4,
    totalRuns:'not-a-number',
    recentRunStatuses:null,
  });

  assert.equal(result.completed, 0);
  assert.equal(result.time_to_first_value_minutes, null);
  assert.equal(result.signals.connections, 0);
  assert.equal(result.signals.success_rate, null);
});


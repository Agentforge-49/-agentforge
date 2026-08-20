import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { localCopilotAnswer, responseChunks, workflowProposalFor } from '../lib/copilot.js';
import { validateWorkspaceToolSteps } from '../lib/workspace-tools.js';

test('copilot workflow proposals remain approval-gated graph v2 previews', () => {
  const proposal = workflowProposalFor('Build a support intake workflow');
  assert.equal(proposal.action_type, 'workflow_draft');
  assert(proposal.preview.nodes.some(node => node.type === 'approval'));
  assert(proposal.preview.edges.every(edge => edge.mode === 'always'));
});

test('copilot local fallback is useful and does not claim a mutation', () => {
  const answer = localCopilotAnswer('Why did my workflow fail?', { recent_runs:{ failed:2 } });
  assert.match(answer, /Activity/);
  assert.match(answer, /2 failed runs/);
  assert.doesNotMatch(answer, /I fixed|I changed|I activated/);
  assert.equal(responseChunks('abcdefghij', 4).join(''), 'abcdefghij');
});

test('workspace tools accept safe deterministic steps and reject unsupported code', () => {
  assert.deepEqual(validateWorkspaceToolSteps([
    { type:'transform', config:{ operation:'template', template:'Result: {{input}}' } },
  ]).errors, []);
  assert.match(validateWorkspaceToolSteps([{ type:'javascript', config:{ code:'return input' } }]).errors[0], /unsupported/);
});

test('flagship migration keeps v1 workflows and adds owned immutable resources', () => {
  const migration = fs.readFileSync(new URL('../../supabase/migrations/20260819090000_flagship_platform.sql', import.meta.url), 'utf8');
  assert.match(migration, /schema_version integer not null default 1/);
  assert.match(migration, /create table public\.copilot_threads/);
  assert.match(migration, /create table public\.workspace_tool_versions/);
  assert.match(migration, /unique \(tool_id, version_number\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /grant execute.+service_role/s);
});

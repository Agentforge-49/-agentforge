import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { instantCopilotAnswer, localCopilotAnswer, responseChunks, workflowProposalFor } from '../lib/copilot.js';
import { validateWorkspaceToolSteps } from '../lib/workspace-tools.js';

test('copilot workflow proposals remain approval-gated graph v2 previews', () => {
  const proposal = workflowProposalFor('Build a support intake workflow with Slack', {
    agents:[{ id:'agent-1', name:'Support specialist', published:true }],
    connected_providers:['slack'],
  });
  assert.equal(proposal.action_type, 'workflow_draft');
  assert(proposal.preview.nodes.some(node => node.type === 'agent'));
  assert(proposal.preview.nodes.some(node => node.type === 'approval'));
  assert.equal(proposal.preview.requirements[0].connected, true);
  assert(proposal.preview.edges.every(edge => edge.mode === 'always'));
});

test('copilot answers safe workspace questions without a model round trip', () => {
  const answer = instantCopilotAnswer('Give me a workspace status overview', {
    agents:[{}], workflows:[{}, {}], connected_providers:['slack'],
    pending_approvals:1, recent_runs:{ failed:0 },
  });
  assert.match(answer, /1 agents/);
  assert.match(answer, /2 workflows/);
  assert.match(answer, /approval queue/);
  assert.equal(instantCopilotAnswer('Explain quantum mechanics'), null);
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

test('workspace bootstrap aliases the approval request timestamp contract', () => {
  const route = fs.readFileSync(new URL('../routes/bootstrap.js', import.meta.url), 'utf8');
  assert.match(route, /created_at:requested_at/);
  assert.match(route, /order\('requested_at'/);
  assert.doesNotMatch(route, /approval_requests'\)\.select\([^\n]*status, created_at,/);
});

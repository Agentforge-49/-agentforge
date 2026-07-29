import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateOutputs,
  parseSupervisorRoute,
  selectParallelMembers,
  selectRouterMember,
  taskSignature,
  validateMultiAgentSystem,
} from '../lib/multi-agent.js';

const members = [
  { agent_id:'00000000-0000-0000-0000-000000000001', position:0, route_keywords:['sales'] },
  { agent_id:'00000000-0000-0000-0000-000000000002', position:1, route_keywords:['code', 'debug'] },
  { agent_id:'00000000-0000-0000-0000-000000000003', position:2, route_keywords:['legal'] },
];

test('router selects the strongest keyword match and has a stable fallback', () => {
  assert.equal(selectRouterMember(members, 'Please debug this code').member.agent_id, members[1].agent_id);
  assert.equal(selectRouterMember(members, 'General question').member.agent_id, members[0].agent_id);
});

test('parallel routing respects both concurrency and delegation limits', () => {
  assert.equal(selectParallelMembers(members, 8, 2).length, 2);
  assert.equal(selectParallelMembers(members, 1, 8).length, 1);
});

test('task signatures are deterministic and distinguish purpose and depth', () => {
  const base = taskSignature(members[0].agent_id, ' Hello   World ', 0, 'work');
  assert.equal(base, taskSignature(members[0].agent_id, 'hello world', 0, 'work'));
  assert.notEqual(base, taskSignature(members[0].agent_id, 'hello world', 1, 'work'));
  assert.notEqual(base, taskSignature(members[0].agent_id, 'hello world', 0, 'route'));
  assert.equal(base.length, 64);
});

test('aggregation supports deterministic vote and attributed concatenation', () => {
  const outputs = [
    { agentName:'A', output:'Ship it' },
    { agentName:'B', output:'ship   it' },
    { agentName:'C', output:'Wait' },
  ];
  assert.equal(aggregateOutputs('vote', outputs), 'Ship it');
  assert.match(aggregateOutputs('concatenate', outputs), /Worker 2 \(B\)/);
});

test('supervisor routes are allowlisted and bounded', () => {
  const parsed = parseSupervisorRoute(JSON.stringify({
    selected_agent_ids:[members[1].agent_id, 'not-allowed', members[0].agent_id],
    instructions:{ [members[1].agent_id]:'Inspect the failure' },
  }), members, 4, 1);
  assert.deepEqual(parsed, [{
    agentId:members[1].agent_id,
    instructions:'Inspect the failure',
  }]);
});

test('supervisor routing requires a supervisor and enough delegations', () => {
  const result = validateMultiAgentSystem({
    name:'Research team',
    strategy:'supervisor',
    aggregation_strategy:'concatenate',
    max_delegations:1,
    max_parallel:2,
    max_depth:2,
    timeout_seconds:60,
    members:members.slice(0, 1).map(member => ({ agent_id:member.agent_id })),
  });
  assert.ok(result.errors.some(error => /supervisor agent/i.test(error)));
  assert.ok(result.errors.some(error => /at least 2 delegations/i.test(error)));
});

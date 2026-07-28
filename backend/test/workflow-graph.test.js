import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTransform,
  evaluateCondition,
  validateWorkflowGraph,
} from '../lib/workflow-graph.js';

const validNodes = [
  { id: 'input', type: 'input' },
  { id: 'agent', type: 'agent', config: { agent_id: 'agent-id' } },
  { id: 'output', type: 'output' },
];
const validEdges = [
  { id: 'one', source: 'input', target: 'agent' },
  { id: 'two', source: 'agent', target: 'output' },
];

test('validates and topologically orders a workflow graph', () => {
  const result = validateWorkflowGraph(validNodes, validEdges);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value.order, ['input', 'agent', 'output']);
});

test('rejects cycles and missing condition branches', () => {
  const result = validateWorkflowGraph([
    { id: 'input', type: 'input' },
    { id: 'decision', type: 'condition', config: { operator: 'contains', value: 'yes' } },
    { id: 'output', type: 'output' },
  ], [
    { source: 'input', target: 'decision' },
    { source: 'decision', target: 'output', source_handle: 'true' },
    { source: 'output', target: 'decision' },
  ]);
  assert.match(result.errors.join(' '), /true and false/);
  assert.match(result.errors.join(' '), /acyclic/);
});

test('applies deterministic transforms', () => {
  assert.equal(applyTransform(' hello ', { operation: 'trim' }), 'hello');
  assert.equal(applyTransform('hello', {
    operation: 'template',
    template: 'Result: {{input}}',
  }), 'Result: hello');
});

test('evaluates condition operators with optional case sensitivity', () => {
  assert.equal(evaluateCondition('Urgent refund', {
    operator: 'contains',
    value: 'urgent',
  }), true);
  assert.equal(evaluateCondition('YES', {
    operator: 'equals',
    value: 'yes',
    case_sensitive: true,
  }), false);
});

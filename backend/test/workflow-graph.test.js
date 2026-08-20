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

test('validates connector and approval nodes', () => {
  const nodes = [
    { id:'input', type:'input', config:{} },
    {
      id:'connector',
      type:'connector',
      config:{
        action:'http.request',
        credential_id:null,
        parameters:{ url:'https://example.com', method:'GET' },
      },
    },
    {
      id:'approval',
      type:'approval',
      config:{ instructions:'Review output', timeout_minutes:60 },
    },
    { id:'output', type:'output', config:{} },
  ];
  const edges = [
    { id:'e1', source:'input', target:'connector' },
    { id:'e2', source:'connector', target:'approval' },
    { id:'e3', source:'approval', target:'output' },
  ];
  assert.deepEqual(validateWorkflowGraph(nodes, edges).errors, []);
  nodes[2].config.timeout_minutes = 1;
  assert.match(validateWorkflowGraph(nodes, edges).errors.join(' '), /timeout/);
});

test('normalizes graph v2 edge modes without changing legacy semantics', () => {
  const result = validateWorkflowGraph(validNodes, validEdges);
  assert.equal(result.value.edges[0].mode, 'always');
  assert.equal(result.value.edges[0].target_handle, 'default');
  const branched = validateWorkflowGraph([
    { id:'input', type:'input' },
    { id:'decision', type:'condition', config:{ operator:'equals', value:'yes' } },
    { id:'yes', type:'output' }, { id:'no', type:'output' },
  ], [
    { source:'input', target:'decision' },
    { source:'decision', target:'yes', mode:'condition_true' },
    { source:'decision', target:'no', mode:'condition_false' },
  ]);
  assert.deepEqual(branched.errors, []);
});

test('validates reusable tool and trigger nodes in graph v2', () => {
  const result = validateWorkflowGraph([
    { id:'input', type:'input' },
    { id:'trigger', type:'trigger', config:{ trigger_type:'webhook' } },
    { id:'tool', type:'tool', config:{ tool_id:'tool-1' } },
    { id:'output', type:'output' },
  ], [
    { source:'input', target:'trigger' }, { source:'trigger', target:'tool' },
    { source:'tool', target:'output' },
  ]);
  assert.deepEqual(result.errors, []);
});

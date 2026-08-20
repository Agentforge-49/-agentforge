import assert from 'node:assert/strict'
import test from 'node:test'

import {
  graphSemanticsChanged,
  linearGraphFromNodes,
  workflowGraphForBuilder,
} from '../src/lib/workflow-compat.js'

const legacyNodes = [
  { id:'input', type:'input', config:{} },
  { id:'agent', type:'agent', config:{ agent_id:'agent-1' } },
  { id:'output', type:'output', config:{} },
]

test('legacy linear workflows open as graph v2 without changing execution order', () => {
  const graph = workflowGraphForBuilder({ schema_version:1, nodes:legacyNodes })
  assert.deepEqual(graph.edges.map(edge => [edge.source, edge.target, edge.mode]), [
    ['input', 'agent', 'always'],
    ['agent', 'output', 'always'],
  ])
  assert(graph.nodes.every(node => Number.isFinite(node.position.x)))
})

test('graph v2 workflows preserve branch and AI handoff semantics on open and resave', () => {
  const workflow = {
    schema_version:2,
    nodes:[
      { id:'input', type:'input', config:{}, position:{ x:0, y:0 } },
      { id:'decision', type:'condition', config:{ operator:'contains', value:'urgent' }, position:{ x:220, y:0 } },
      { id:'human', type:'approval', config:{ timeout_minutes:60 }, position:{ x:440, y:-80 } },
      { id:'ai', type:'agent', config:{ agent_id:'agent-1' }, position:{ x:440, y:80 } },
      { id:'output', type:'output', config:{}, position:{ x:660, y:0 } },
    ],
    edges:[
      { id:'e1', source:'input', target:'decision' },
      { id:'e2', source:'decision', target:'human', mode:'condition_true', source_handle:'true' },
      { id:'e3', source:'decision', target:'ai', mode:'condition_false', source_handle:'false' },
      { id:'e4', source:'human', target:'output' },
      { id:'e5', source:'ai', target:'output', mode:'ai_handoff' },
    ],
  }
  const opened = workflowGraphForBuilder(workflow)
  const resaved = workflowGraphForBuilder({ ...workflow, nodes:opened.nodes, edges:opened.edges })

  assert.deepEqual(resaved.edges, opened.edges)
  assert.equal(opened.nodes.find(node => node.id === 'decision').config.true_target, 'human')
  assert.equal(opened.nodes.find(node => node.id === 'decision').config.false_target, 'ai')
  assert.equal(resaved.edges.find(edge => edge.id === 'e5').mode, 'ai_handoff')
  assert.equal(graphSemanticsChanged(opened.nodes, resaved.nodes), false)
})

test('semantic node changes regenerate safe deterministic edges', () => {
  const original = linearGraphFromNodes(legacyNodes)
  const nextNodes = [original.nodes[0], { id:'approval', type:'approval', config:{ timeout_minutes:60 } }, ...original.nodes.slice(1)]
  assert.equal(graphSemanticsChanged(original.nodes, nextNodes), true)
  assert.deepEqual(linearGraphFromNodes(nextNodes).edges.map(edge => edge.target), ['approval', 'agent', 'output'])
})

const EDGE_MODES = new Set(['always', 'condition_true', 'condition_false', 'ai_handoff'])

function positionedNodes(nodes = []) {
  return nodes.map((node, index) => ({
    ...node,
    position:Number.isFinite(node?.position?.x) && Number.isFinite(node?.position?.y)
      ? node.position
      : { x:80 + index * 230, y:node?.type === 'condition' ? 150 : 90 },
  }))
}

function normalizedEdge(edge, index) {
  const sourceHandle = edge?.source_handle || 'default'
  const inferredMode = sourceHandle === 'true' ? 'condition_true'
    : sourceHandle === 'false' ? 'condition_false' : 'always'
  const mode = EDGE_MODES.has(edge?.mode) ? edge.mode : inferredMode
  return {
    id:edge?.id || `edge_${index + 1}`,
    source:edge?.source,
    target:edge?.target,
    source_handle:sourceHandle,
    target_handle:edge?.target_handle || 'default',
    mode,
  }
}

export function linearGraphFromNodes(nodes = []) {
  const positioned = positionedNodes(nodes)
  const edges = []
  positioned.forEach((node, index) => {
    if (index === positioned.length - 1) return
    if (node.type === 'condition') {
      const later = positioned.slice(index + 1)
      const fallback = later[0]?.id
      const trueTarget = later.some(item => item.id === node.config?.true_target)
        ? node.config.true_target : fallback
      const falseTarget = later.some(item => item.id === node.config?.false_target)
        ? node.config.false_target : fallback
      if (trueTarget) edges.push({ id:`${node.id}_true`, source:node.id, target:trueTarget, source_handle:'true', target_handle:'default', mode:'condition_true' })
      if (falseTarget) edges.push({ id:`${node.id}_false`, source:node.id, target:falseTarget, source_handle:'false', target_handle:'default', mode:'condition_false' })
    } else {
      const target = positioned[index + 1]
      edges.push({ id:`${node.id}_${target.id}`, source:node.id, target:target.id, source_handle:'default', target_handle:'default', mode:'always' })
    }
  })
  return { nodes:positioned, edges }
}

export function workflowGraphForBuilder(workflow, fallbackNodes = []) {
  const nodes = positionedNodes(workflow?.nodes?.length ? workflow.nodes : fallbackNodes)
  const ids = new Set(nodes.map(node => node.id))
  const savedEdges = Array.isArray(workflow?.edges)
    ? workflow.edges.map(normalizedEdge).filter(edge => ids.has(edge.source) && ids.has(edge.target))
    : []
  if (!savedEdges.length) return linearGraphFromNodes(nodes)

  const conditionTargets = new Map()
  for (const edge of savedEdges) {
    if (!conditionTargets.has(edge.source)) conditionTargets.set(edge.source, {})
    if (edge.mode === 'condition_true') conditionTargets.get(edge.source).true_target = edge.target
    if (edge.mode === 'condition_false') conditionTargets.get(edge.source).false_target = edge.target
  }
  return {
    nodes:nodes.map(node => conditionTargets.has(node.id)
      ? { ...node, config:{ ...(node.config || {}), ...conditionTargets.get(node.id) } }
      : node),
    edges:savedEdges,
  }
}

export function graphSemantics(nodes = []) {
  return nodes.map(node => ({
    id:node.id,
    type:node.type,
    true_target:node.type === 'condition' ? node.config?.true_target || '' : undefined,
    false_target:node.type === 'condition' ? node.config?.false_target || '' : undefined,
  }))
}

export function graphSemanticsChanged(previous = [], next = []) {
  return JSON.stringify(graphSemantics(previous)) !== JSON.stringify(graphSemantics(next))
}

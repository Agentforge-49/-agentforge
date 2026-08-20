import { validateConnectorConfig } from './connectors.js';

const NODE_TYPES = new Set([
  'input', 'trigger', 'agent', 'tool', 'connector', 'transform', 'condition',
  'approval', 'output',
]);
const EDGE_MODES = new Set(['always', 'condition_true', 'condition_false', 'ai_handoff']);
const TRANSFORMS = new Set(['trim', 'uppercase', 'lowercase', 'template']);
const CONDITIONS = new Set(['contains', 'not_contains', 'equals']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateWorkflowGraph(nodes, edges) {
  const errors = [];
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return { errors: ['Nodes and edges must be arrays'] };
  }
  if (nodes.length < 2 || nodes.length > 100) {
    errors.push('A workflow must contain between 2 and 100 nodes');
  }
  if (edges.length > 200) errors.push('A workflow may contain at most 200 edges');

  const ids = new Set();
  const normalizedNodes = nodes.map((node, index) => {
    const id = text(node?.id);
    const type = text(node?.type);
    if (!id || id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) {
      errors.push(`Node ${index + 1} has an invalid id`);
    } else if (ids.has(id)) {
      errors.push(`Duplicate node id: ${id}`);
    }
    ids.add(id);
    if (!NODE_TYPES.has(type)) errors.push(`Node ${id || index + 1} has an invalid type`);

    const config = node?.config && typeof node.config === 'object' ? node.config : {};
    if (type === 'agent' && !text(config.agent_id)) {
      errors.push(`Agent node ${id} must select an agent`);
    }
    if (type === 'tool' && !text(config.tool_id)) {
      errors.push(`Tool node ${id} must select a workspace tool`);
    }
    if (type === 'trigger' && !text(config.trigger_type)) {
      errors.push(`Trigger node ${id} must select a trigger type`);
    }
    if (type === 'transform' && !TRANSFORMS.has(config.operation)) {
      errors.push(`Transform node ${id} has an invalid operation`);
    }
    if (type === 'connector') {
      const connector = validateConnectorConfig(config);
      errors.push(...connector.errors.map(error => `Connector node ${id}: ${error}`));
    }
    if (type === 'condition') {
      if (!CONDITIONS.has(config.operator)) {
        errors.push(`Condition node ${id} has an invalid operator`);
      }
      if (!text(config.value)) errors.push(`Condition node ${id} needs a comparison value`);
    }
    if (type === 'approval') {
      const timeoutMinutes = Number(config.timeout_minutes);
      if (!Number.isInteger(timeoutMinutes) || timeoutMinutes < 5 || timeoutMinutes > 10080) {
        errors.push(`Approval node ${id} timeout must be between 5 and 10,080 minutes`);
      }
      if (config.instructions && (
        typeof config.instructions !== 'string' || config.instructions.length > 500
      )) {
        errors.push(`Approval node ${id} instructions must be 500 characters or fewer`);
      }
    }

    const position = node?.position || {};
    return {
      id,
      type,
      label: text(node?.label) || type || `Node ${index + 1}`,
      position: {
        x: Number.isFinite(position.x) ? position.x : index * 220,
        y: Number.isFinite(position.y) ? position.y : 100,
      },
      config,
    };
  });

  const inputCount = normalizedNodes.filter(node => node.type === 'input').length;
  const outputCount = normalizedNodes.filter(node => node.type === 'output').length;
  if (inputCount !== 1) errors.push('A workflow must contain exactly one input node');
  if (outputCount < 1) errors.push('A workflow must contain at least one output node');

  const edgeIds = new Set();
  const normalizedEdges = edges.map((edge, index) => {
    const source = text(edge?.source);
    const target = text(edge?.target);
    const sourceHandle = text(edge?.source_handle) || 'default';
    const targetHandle = text(edge?.target_handle) || 'default';
    const inferredMode = sourceHandle === 'true' ? 'condition_true'
      : sourceHandle === 'false' ? 'condition_false' : 'always';
    const mode = text(edge?.mode) || inferredMode;
    const id = text(edge?.id) || `edge_${index + 1}`;
    if (edgeIds.has(id)) errors.push(`Duplicate edge id: ${id}`);
    edgeIds.add(id);
    if (!ids.has(source) || !ids.has(target)) {
      errors.push(`Edge ${id} references a missing node`);
    }
    if (source === target) errors.push(`Edge ${id} cannot connect a node to itself`);
    if (!['default', 'true', 'false'].includes(sourceHandle)) {
      errors.push(`Edge ${id} has an invalid source handle`);
    }
    if (!EDGE_MODES.has(mode)) errors.push(`Edge ${id} has an invalid mode`);
    return {
      id, source, target, source_handle: sourceHandle, target_handle: targetHandle, mode,
    };
  });

  const nodeMap = new Map(normalizedNodes.map(node => [node.id, node]));
  for (const node of normalizedNodes.filter(item => item.type === 'condition')) {
    const handles = normalizedEdges
      .filter(edge => edge.source === node.id)
      .map(edge => edge.mode);
    if (!handles.includes('condition_true') || !handles.includes('condition_false')) {
      errors.push(`Condition node ${node.id} needs true and false outgoing edges`);
    }
  }

  const indegree = new Map(normalizedNodes.map(node => [node.id, 0]));
  const outgoing = new Map(normalizedNodes.map(node => [node.id, []]));
  for (const edge of normalizedEdges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
    indegree.set(edge.target, indegree.get(edge.target) + 1);
    outgoing.get(edge.source).push(edge.target);
  }
  const queue = normalizedNodes.filter(node => indegree.get(node.id) === 0).map(node => node.id);
  const orderedIds = [];
  while (queue.length) {
    const id = queue.shift();
    orderedIds.push(id);
    for (const target of outgoing.get(id) || []) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  if (orderedIds.length !== normalizedNodes.length) {
    errors.push('Workflow graph must be acyclic');
  }

  const inputNode = normalizedNodes.find(node => node.type === 'input');
  if (inputNode) {
    const reachable = new Set([inputNode.id]);
    for (const id of orderedIds) {
      if (!reachable.has(id)) continue;
      for (const target of outgoing.get(id) || []) reachable.add(target);
    }
    const unreachable = normalizedNodes.filter(node => !reachable.has(node.id));
    if (unreachable.length) {
      errors.push(`Unreachable nodes: ${unreachable.map(node => node.id).join(', ')}`);
    }
  }

  return {
    errors,
    value: errors.length ? undefined : {
      nodes: normalizedNodes,
      edges: normalizedEdges,
      order: orderedIds,
    },
  };
}

export function applyTransform(input, config = {}) {
  const value = String(input ?? '');
  if (config.operation === 'trim') return value.trim();
  if (config.operation === 'uppercase') return value.toUpperCase();
  if (config.operation === 'lowercase') return value.toLowerCase();
  if (config.operation === 'template') {
    return String(config.template || '{{input}}').split('{{input}}').join(value);
  }
  throw new Error(`Unsupported transform operation: ${config.operation}`);
}

export function evaluateCondition(input, config = {}) {
  const actual = String(input ?? '');
  const expected = String(config.value ?? '');
  const left = config.case_sensitive ? actual : actual.toLowerCase();
  const right = config.case_sensitive ? expected : expected.toLowerCase();
  if (config.operator === 'contains') return left.includes(right);
  if (config.operator === 'not_contains') return !left.includes(right);
  if (config.operator === 'equals') return left === right;
  throw new Error(`Unsupported condition operator: ${config.operator}`);
}

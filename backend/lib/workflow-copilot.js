import { CONNECTOR_DEFINITIONS, validateConnectorConfig } from './connectors.js';
import { validateWorkflowGraph } from './workflow-graph.js';

const STEP_TYPES = new Set(['agent', 'connector', 'transform', 'approval']);
const TRANSFORMS = new Set(['trim', 'uppercase', 'lowercase', 'template']);

function text(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeArray(value, limit = 8) {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function connectorDefaults(action) {
  if (action === 'http.request') return { url:'https://api.example.com', method:'GET' };
  if (action === 'email.send') return { to:'', from:'', subject:'', text:'{{input}}' };
  if (action === 'slack.message') return { channel:'', text:'{{input}}' };
  if (action === 'google_sheets.append') {
    return { spreadsheet_id:'', range:'Sheet1!A:A', values:['{{input}}'] };
  }
  if (action === 'google_drive.create_file') {
    return { name:'agentforge-output.txt', content:'{{input}}' };
  }
  if (action === 'database.select') return { table:'', select:'*', limit:25 };
  if (action === 'database.insert') return { table:'', row:{ value:'{{input}}' } };
  return {};
}

export function extractWorkflowJson(value) {
  const raw = String(value || '').trim();
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Copilot did not return a JSON workflow');
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    throw new Error('Copilot returned malformed workflow JSON');
  }
}

function normalizeParameters(action, parameters) {
  const supplied = parameters && typeof parameters === 'object' && !Array.isArray(parameters)
    ? parameters : {};
  return { ...connectorDefaults(action), ...supplied };
}

export function normalizeWorkflowPlan(plan, {
  agents = [],
  connectors = CONNECTOR_DEFINITIONS,
  credentials = [],
} = {}) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('Copilot workflow must be an object');
  }
  const agentIds = new Set(agents.map(agent => agent.id));
  const agentByName = new Map(agents.map(agent => [String(agent.name).toLowerCase(), agent.id]));
  const connectorMap = new Map(connectors.map(item => [item.action, item]));
  const credentialMap = new Map(credentials.map(item => [item.id, item]));
  const rawSteps = safeArray(plan.steps, 12);
  if (!rawSteps.length) throw new Error('Copilot workflow needs at least one step');

  const nodes = [{
    id:'input_1',
    type:'input',
    label:'Workflow input',
    config:{},
    position:{ x:80, y:100 },
  }];

  rawSteps.forEach((rawStep, index) => {
    const type = text(rawStep?.type, 30).toLowerCase();
    if (!STEP_TYPES.has(type)) {
      throw new Error(`Copilot step ${index + 1} has an unsupported type`);
    }
    const node = {
      id:`${type}_${index + 1}`,
      type,
      label:text(rawStep.label, 80) || `${type[0].toUpperCase()}${type.slice(1)} ${index + 1}`,
      config:{},
      position:{ x:310 + index * 230, y:100 },
    };
    if (type === 'agent') {
      const requestedId = text(rawStep.agent_id, 80);
      const resolvedId = agentIds.has(requestedId)
        ? requestedId
        : agentByName.get(text(rawStep.agent_name, 100).toLowerCase());
      if (!resolvedId) throw new Error(`Copilot step ${index + 1} must use a published agent`);
      node.config = { agent_id:resolvedId };
    } else if (type === 'connector') {
      const action = text(rawStep.action, 80);
      const definition = connectorMap.get(action);
      if (!definition) throw new Error(`Copilot step ${index + 1} uses an unavailable connector`);
      const requestedCredentialId = text(rawStep.credential_id, 80);
      const credential = credentialMap.get(requestedCredentialId);
      if (
        !definition.credential_optional
        && (!credential || !definition.providers?.includes(credential.provider))
      ) {
        throw new Error(`Copilot step ${index + 1} needs a compatible vault credential`);
      }
      node.config = {
        action,
        credential_id:credential?.id || null,
        parameters:normalizeParameters(action, rawStep.parameters),
      };
      const connectorValidation = validateConnectorConfig(node.config);
      if (connectorValidation.errors.length) throw new Error(connectorValidation.errors[0]);
    } else if (type === 'transform') {
      const operation = TRANSFORMS.has(rawStep.operation) ? rawStep.operation : 'template';
      node.config = {
        operation,
        template:text(rawStep.template, 2000) || '{{input}}',
      };
    } else {
      const timeout = Number(rawStep.timeout_minutes);
      node.config = {
        instructions:text(rawStep.instructions, 500) || 'Review this value before continuing.',
        timeout_minutes:Number.isInteger(timeout) && timeout >= 5 && timeout <= 10080 ? timeout : 60,
      };
    }
    nodes.push(node);
  });

  nodes.push({
    id:'output_1',
    type:'output',
    label:'Workflow output',
    config:{},
    position:{ x:310 + rawSteps.length * 230, y:100 },
  });
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id:`edge_${index + 1}`,
    source:node.id,
    target:nodes[index + 1].id,
    source_handle:'default',
  }));
  const graph = validateWorkflowGraph(nodes, edges);
  if (graph.errors.length) throw new Error(graph.errors[0]);

  return {
    name:text(plan.name, 100) || 'AI-generated workflow',
    description:text(plan.description, 500) || null,
    nodes:graph.value.nodes,
    edges:graph.value.edges,
    rationale:text(plan.rationale, 1000),
    assumptions:safeArray(plan.assumptions, 8).map(item => text(item, 240)).filter(Boolean),
  };
}

export function workflowCopilotPrompt({ agents = [], connectors = [], credentials = [] }) {
  const availableConnectors = connectors.map(definition => ({
    action:definition.action,
    name:definition.name,
    credential_optional:Boolean(definition.credential_optional),
    credential_options:credentials
      .filter(credential => definition.credential_optional
        || definition.providers?.includes(credential.provider))
      .map(credential => ({
        id:credential.id,
        name:credential.name,
        provider:credential.provider,
      })),
  })).filter(definition => definition.credential_optional || definition.credential_options.length);

  return `You are AgentForge Workflow Copilot. Convert the user's request into one safe, editable, linear workflow draft.

Return only one JSON object with this shape:
{"name":"under 100 chars","description":"under 500 chars","steps":[{"type":"agent|connector|transform|approval","label":"short label"}],"rationale":"short explanation","assumptions":["short assumption"]}

Rules:
- Use 1 to 12 steps. Do not include input or output steps; AgentForge adds those.
- Only use the exact agent IDs and connector actions below.
- Agent steps require agent_id.
- Connector steps require action, parameters, and a compatible credential_id unless credential_optional is true.
- Transform operations are trim, uppercase, lowercase, or template. Templates use {{input}}.
- Approval steps may use instructions and timeout_minutes from 5 to 10080.
- Prefer the smallest reliable workflow. Add approval before consequential external actions.
- Never include secrets, executable code, markdown, comments, or unsupported fields.

Published agents:
${JSON.stringify(agents.map(agent => ({
    id:agent.id,
    name:agent.name,
    description:agent.description || '',
    model:agent.model,
  })))}

Available connectors:
${JSON.stringify(availableConnectors)}`;
}

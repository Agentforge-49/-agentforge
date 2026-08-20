import { executeConnector, validateConnectorConfig } from './connectors.js';
import { applyTransform } from './workflow-graph.js';
import { supabase } from './supabase.js';

const STEP_TYPES = new Set(['transform', 'connector']);

export function validateWorkspaceToolSteps(steps) {
  const errors = [];
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 50) {
    return { errors:['A workspace tool needs between 1 and 50 steps'] };
  }
  const value = steps.map((step, index) => {
    const type = typeof step?.type === 'string' ? step.type.trim() : '';
    const config = step?.config && typeof step.config === 'object' ? step.config : {};
    if (!STEP_TYPES.has(type)) errors.push(`Step ${index + 1} has an unsupported type`);
    if (type === 'transform' && !['trim', 'uppercase', 'lowercase', 'template'].includes(config.operation)) {
      errors.push(`Step ${index + 1} has an invalid transform`);
    }
    if (type === 'connector') {
      const validated = validateConnectorConfig(config);
      errors.push(...validated.errors.map(error => `Step ${index + 1}: ${error}`));
    }
    return { id:String(step?.id || `step_${index + 1}`).slice(0, 80), type, config };
  });
  return { errors, value:errors.length ? undefined : value };
}

export async function loadWorkspaceTool(toolId, userId, versionId = null) {
  const { data:tool, error } = await supabase.from('workspace_tools').select('*')
    .eq('id', toolId).eq('user_id', userId).single();
  if (error || !tool || tool.status === 'archived') throw new Error('Workspace tool is unavailable');
  const selectedVersion = versionId || tool.current_version_id;
  if (!selectedVersion) throw new Error('Workspace tool has no active version');
  const { data:version, error:versionError } = await supabase.from('workspace_tool_versions')
    .select('*').eq('id', selectedVersion).eq('tool_id', tool.id).eq('user_id', userId).single();
  if (versionError || !version) throw new Error('Workspace tool version is unavailable');
  return { tool, version };
}

export async function executeWorkspaceTool(config, input, userId) {
  const { version } = await loadWorkspaceTool(config.tool_id, userId, config.version_id || null);
  const validated = validateWorkspaceToolSteps(version.steps);
  if (validated.errors.length) throw new Error(validated.errors[0]);
  let output = input;
  for (const step of validated.value) {
    output = step.type === 'transform'
      ? applyTransform(output, step.config)
      : await executeConnector(step.config, output, userId);
  }
  return output;
}

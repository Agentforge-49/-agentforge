import { getEngineHealth } from './engine.js';
import { supabase } from './supabase.js';

const CONTEXT_TTL_MS = 30_000;
const MODEL_TTL_MS = 30_000;
const contextCache = new Map();
let modelCache = { expiresAt:0, models:[] };

const MODEL_PRIORITY = ['gemini-3.5-flash', 'gpt-5.6-luna', 'claude-sonnet-4-6'];

function countResult(result) {
  if (result.error) throw result.error;
  return result.count || 0;
}

export async function fastestCopilotModel(requested = '') {
  if (Date.now() >= modelCache.expiresAt) {
    try {
      const health = await getEngineHealth();
      modelCache = {
        expiresAt:Date.now() + MODEL_TTL_MS,
        models:(health.supported_models || []).filter(item => item.available).map(item => item.id),
      };
    } catch {
      modelCache = { expiresAt:Date.now() + 5_000, models:[] };
    }
  }
  if (requested && modelCache.models.includes(requested)) return requested;
  return MODEL_PRIORITY.find(model => modelCache.models.includes(model))
    || modelCache.models[0]
    || 'claude-sonnet-4-6';
}

export async function loadCopilotContext(userId, { fresh = false } = {}) {
  const cached = contextCache.get(userId);
  if (!fresh && cached?.expiresAt > Date.now()) return cached.value;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [agents, workflows, triggers, pendingApprovals, recentRuns, credentials, oauth] = await Promise.all([
    supabase.from('agents').select('id, name, status, published_version_id')
      .eq('user_id', userId).order('updated_at', { ascending:false }).limit(20),
    supabase.from('workflows').select('id, name, status')
      .eq('user_id', userId).order('updated_at', { ascending:false }).limit(20),
    supabase.from('workflow_triggers').select('id', { count:'exact', head:true })
      .eq('user_id', userId).eq('status', 'active'),
    supabase.from('approval_requests').select('id', { count:'exact', head:true })
      .eq('user_id', userId).eq('status', 'pending'),
    supabase.from('run_observability').select('execution_job_id, status, duration_ms, estimated_cost_usd, structured_error, created_at')
      .eq('user_id', userId).gte('created_at', since).order('created_at', { ascending:false }).limit(50),
    supabase.from('vault_credentials').select('provider').eq('user_id', userId),
    supabase.from('oauth_connections').select('provider').eq('user_id', userId).eq('status', 'active'),
  ]);
  for (const result of [agents, workflows, recentRuns, credentials, oauth]) {
    if (result.error) throw result.error;
  }
  const runs = recentRuns.data || [];
  const providers = [...new Set([
    ...(credentials.data || []).map(item => item.provider),
    ...(oauth.data || []).map(item => item.provider),
  ])].filter(Boolean).sort();
  const value = {
    agents:(agents.data || []).map(item => ({
      id:item.id, name:item.name, status:item.status,
      published:Boolean(item.published_version_id),
    })),
    workflows:(workflows.data || []).map(item => ({ id:item.id, name:item.name, status:item.status })),
    active_triggers:countResult(triggers),
    pending_approvals:countResult(pendingApprovals),
    connected_providers:providers,
    recent_runs:{
      total:runs.length,
      succeeded:runs.filter(item => item.status === 'succeeded').length,
      failed:runs.filter(item => item.status === 'failed').length,
      latest_failure:runs.find(item => item.status === 'failed') || null,
    },
  };
  contextCache.set(userId, { expiresAt:Date.now() + CONTEXT_TTL_MS, value });
  return value;
}

export function copilotSystemPrompt(context) {
  return `You are AgentForge Copilot, an operations co-builder inside AgentForge.

Help non-technical operations teams understand the product, diagnose failed work, and design safe automations. Use the supplied safe workspace summary. Never request or reveal secrets. Never claim you saved, published, connected, approved, or executed anything. You may explain a draft proposal, but the user must explicitly apply it in the interface.

AgentForge supports focused agents, visual workflows, conditions, transforms, approvals, triggers, knowledge, evaluations, run history, multi-agent systems, 25 typed guided connectors, and 75 authenticated universal API/webhook connections.

Safe workspace summary:
${JSON.stringify(context)}

Answer in friendly plain text using at most 220 words. Lead with the useful answer. Use exact labels: Home, Build, Copilot, Activity, Apps, Templates, Quality, Knowledge, Team, Developer, and Settings. If the request needs an unavailable connection or model provider, say so clearly. Consequential external actions always require approval.`;
}

export function workflowProposalFor(message) {
  const request = String(message || '').trim();
  if (!/(automate|automation|workflow|build|create|make)/i.test(request)) return null;
  const nameSeed = request.replace(/^(please\s+)?(build|create|make|automate)\s+/i, '').trim();
  const name = (nameSeed || 'Copilot automation').replace(/[.!?]+$/, '').slice(0, 96);
  const nodes = [
    { id:'input', type:'input', label:'Input', position:{ x:0, y:120 }, config:{} },
    { id:'prepare', type:'transform', label:'Prepare work', position:{ x:240, y:120 }, config:{ operation:'template', template:'{{input}}' } },
    { id:'approval', type:'approval', label:'Human review', position:{ x:480, y:120 }, config:{ timeout_minutes:1440, instructions:'Review the prepared result before any external action.' } },
    { id:'output', type:'output', label:'Approved result', position:{ x:720, y:120 }, config:{} },
  ];
  const edges = [
    { id:'edge_input_prepare', source:'input', target:'prepare', source_handle:'default', target_handle:'default', mode:'always' },
    { id:'edge_prepare_approval', source:'prepare', target:'approval', source_handle:'default', target_handle:'default', mode:'always' },
    { id:'edge_approval_output', source:'approval', target:'output', source_handle:'default', target_handle:'default', mode:'always' },
  ];
  return {
    action_type:'workflow_draft',
    title:`Draft ${name}`.slice(0, 160),
    summary:'A reversible starter workflow with a mandatory human review. Open it in Build to add AI decisions and app actions.',
    preview:{
      name,
      description:request.slice(0, 500),
      nodes,
      edges,
      viewport:{ x:40, y:60, zoom:1 },
    },
  };
}

export function localCopilotAnswer(question, context = {}) {
  const value = String(question || '').toLowerCase();
  if (/(connect|credential|oauth|api key)/.test(value)) {
    return 'Open Apps, choose the service, and follow its connection checklist. Test the credential before inserting an action into a workflow. AgentForge never asks you to paste a secret into chat.';
  }
  if (/(fail|error|debug|not working)/.test(value)) {
    const failed = context.recent_runs?.failed || 0;
    return `Open Activity and select the latest failed run to inspect its node trace, retry count, and structured error. Your recent workspace summary shows ${failed} failed run${failed === 1 ? '' : 's'}. Fix the named dependency, then retry from Activity.`;
  }
  if (/(approval|approve|inbox)/.test(value)) {
    return `Open Activity, then review the approval queue. There ${context.pending_approvals === 1 ? 'is' : 'are'} ${context.pending_approvals || 0} pending approval${context.pending_approvals === 1 ? '' : 's'}. Review the input and impact before approving or rejecting.`;
  }
  if (/(workflow|build|automation)/.test(value)) {
    return 'Open Build to describe the outcome, review the generated graph, connect required apps, run a safe test, and activate only after every dependency is ready. I can prepare a draft proposal, but you decide whether to save it.';
  }
  return 'I could not reach the configured AI provider, but your work is safe. You can continue in Build, inspect runs in Activity, connect services in Apps, or retry this answer. Configure a supported model provider in Settings for open-ended Copilot questions.';
}

export function sseEvent(name, payload) {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function responseChunks(text, size = 72) {
  const value = String(text || '');
  const chunks = [];
  let cursor = 0;
  while (cursor < value.length) {
    let end = Math.min(value.length, cursor + size);
    if (end < value.length) {
      const nextSpace = value.lastIndexOf(' ', end);
      if (nextSpace > cursor + Math.floor(size / 2)) end = nextSpace + 1;
    }
    chunks.push(value.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}

export function clearCopilotContext(userId) {
  contextCache.delete(userId);
}

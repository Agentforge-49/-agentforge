import crypto from 'node:crypto';
import { Router } from 'express';

import { executeAgent } from '../lib/engine.js';
import { MODEL_CATALOG } from '../lib/model-catalog.js';
import { estimateCostUsd } from '../lib/observability.js';
import { plainAssistantText, siteAssistantPrompt, suggestedAssistantPath } from '../lib/site-assistant.js';
import { supabase } from '../lib/supabase.js';
import { assertUsageAllowance, getUsageSummary, recordUsage } from '../lib/usage.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

async function accountSummary(userId) {
  const [agents, activeAgents, workflows, activeWorkflows, triggers, credentials, oauth, approvals, usage] = await Promise.all([
    supabase.from('agents').select('id', { count:'exact', head:true }).eq('user_id', userId),
    supabase.from('agents').select('id', { count:'exact', head:true }).eq('user_id', userId).eq('status', 'active'),
    supabase.from('workflows').select('id', { count:'exact', head:true }).eq('user_id', userId),
    supabase.from('workflows').select('id', { count:'exact', head:true }).eq('user_id', userId).eq('status', 'active'),
    supabase.from('workflow_triggers').select('id, status, trigger_type').eq('user_id', userId),
    supabase.from('vault_credentials').select('provider, last_test_status').eq('user_id', userId),
    supabase.from('oauth_connections').select('provider, status').eq('user_id', userId),
    supabase.from('approval_requests').select('id', { count:'exact', head:true }).eq('user_id', userId).eq('status', 'pending'),
    getUsageSummary(userId),
  ]);
  const databaseErrors = [agents, activeAgents, workflows, activeWorkflows, triggers, credentials, oauth, approvals]
    .map(result => result.error).filter(Boolean);
  if (databaseErrors.length) throw databaseErrors[0];
  const providerNames = [...new Set([
    ...(credentials.data || []).map(item => item.provider),
    ...(oauth.data || []).filter(item => item.status === 'active').map(item => item.provider),
  ])].sort();
  return {
    agents:{ total:agents.count || 0, active:activeAgents.count || 0 },
    workflows:{ total:workflows.count || 0, active:activeWorkflows.count || 0 },
    triggers:{
      total:(triggers.data || []).length,
      active:(triggers.data || []).filter(item => item.status === 'active').length,
      types:[...new Set((triggers.data || []).map(item => item.trigger_type))],
    },
    connections:{ count:(credentials.data || []).length + (oauth.data || []).filter(item => item.status === 'active').length, providers:providerNames },
    pending_approvals:approvals.count || 0,
    plan:usage.plan?.plan_key || usage.entitlement?.plan_key || 'unknown',
    usage:{ model_calls:usage.period.model_calls, model_call_limit:usage.limits.model_calls || 0 },
  };
}

router.post('/chat', async (req, res, next) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (message.length < 2 || message.length > 1200) {
      return res.status(400).json({ error:'Ask a question between 2 and 1,200 characters' });
    }
    const model = String(req.body?.model || 'claude-sonnet-4-6');
    if (!MODEL_CATALOG[model]) return res.status(400).json({ error:'Assistant model is not supported' });
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
    const safeHistory = history.map(item => ({
      role:item?.role === 'assistant' ? 'assistant' : 'user',
      text:String(item?.text || '').trim().slice(0, 600),
    })).filter(item => item.text);
    const context = await accountSummary(req.userId);
    await assertUsageAllowance(req.userId, 1);
    const conversationalInput = [
      ...safeHistory.map(item => `${item.role.toUpperCase()}: ${item.text}`),
      `USER: ${message}`,
    ].join('\n');
    const result = await executeAgent({
      id:'site-assistant',
      name:'AgentForge Guide',
      system_prompt:siteAssistantPrompt(context),
      personality:'professional',
      model,
      temperature:0.2,
      max_tokens:650,
      enabled_tool_slugs:[],
    }, conversationalInput, { timeoutSeconds:45 });
    if (result.status !== 'completed' || !result.final_answer) {
      const error = new Error(result.error_message || 'Account-aware guidance is temporarily unavailable');
      error.status = result.error_code === 'PROVIDER_NOT_CONFIGURED' ? 503 : 502;
      throw error;
    }
    await recordUsage({
      userId:req.userId,
      resourceType:'adjustment',
      modelCalls:1,
      tokens:result.tokens_used || 0,
      estimatedCostUsd:estimateCostUsd(result.tokens_used, model),
      idempotencyKey:`site-assistant:${crypto.randomUUID()}`,
      metadata:{ operation:'account_guidance', model },
    });
    res.json({
      answer:plainAssistantText(result.final_answer).slice(0, 4000),
      suggested_path:suggestedAssistantPath(message),
      context:{
        active_agents:context.agents.active,
        active_workflows:context.workflows.active,
        active_triggers:context.triggers.active,
        connected_providers:context.connections.providers,
        pending_approvals:context.pending_approvals,
      },
      generation:{ model, provider:result.provider || MODEL_CATALOG[model].provider, tokens_used:result.tokens_used || 0 },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

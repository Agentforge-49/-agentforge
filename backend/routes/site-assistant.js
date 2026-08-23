import crypto from 'node:crypto';
import { Router } from 'express';

import { executeAgent } from '../lib/engine.js';
import { fastestCopilotModel, loadCopilotContext } from '../lib/copilot.js';
import { MODEL_CATALOG } from '../lib/model-catalog.js';
import { estimateCostUsd } from '../lib/observability.js';
import { plainAssistantText, siteAssistantPrompt, suggestedAssistantPath } from '../lib/site-assistant.js';
import { assertUsageAllowance, getUsageSummary, recordUsage } from '../lib/usage.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

async function accountSummary(userId) {
  const [context, usage] = await Promise.all([
    loadCopilotContext(userId),
    getUsageSummary(userId),
  ]);
  return {
    agents:{ total:context.agents.length, active:context.agents.filter(item => item.status === 'active').length },
    workflows:{ total:context.workflows.length, active:context.workflows.filter(item => item.status === 'active').length },
    triggers:{ active:context.active_triggers },
    connections:{ count:context.connected_providers.length, providers:context.connected_providers },
    pending_approvals:context.pending_approvals,
    recent_runs:context.recent_runs,
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
    const requestedModel = String(req.body?.model || '');
    if (requestedModel && !MODEL_CATALOG[requestedModel]) return res.status(400).json({ error:'Assistant model is not supported' });
    const model = await fastestCopilotModel(requestedModel);
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

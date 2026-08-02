import crypto from 'node:crypto';
import { Router } from 'express';

import { executeAgent } from '../lib/engine.js';
import { CONNECTOR_DEFINITIONS } from '../lib/connectors.js';
import { MODEL_CATALOG } from '../lib/model-catalog.js';
import { estimateCostUsd } from '../lib/observability.js';
import { supabase } from '../lib/supabase.js';
import { assertUsageAllowance, recordUsage } from '../lib/usage.js';
import {
  extractWorkflowJson,
  normalizeWorkflowPlan,
  workflowCopilotPrompt,
} from '../lib/workflow-copilot.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.post('/draft', async (req, res, next) => {
  try {
    const request = typeof req.body?.request === 'string' ? req.body.request.trim() : '';
    if (request.length < 10 || request.length > 2000) {
      return res.status(400).json({ error:'Describe the workflow in 10 to 2,000 characters' });
    }
    const model = String(req.body?.model || 'claude-sonnet-4-6');
    if (!MODEL_CATALOG[model]) return res.status(400).json({ error:'Model is not supported' });

    const [agentsResult, credentialsResult] = await Promise.all([
      supabase.from('agents')
        .select('id, name, description, model, status, published_version_id')
        .eq('user_id', req.userId)
        .eq('status', 'active')
        .not('published_version_id', 'is', null)
        .order('updated_at', { ascending:false })
        .limit(50),
      supabase.from('vault_credentials')
        .select('id, name, provider, last_test_status')
        .eq('user_id', req.userId)
        .order('created_at', { ascending:false })
        .limit(100),
    ]);
    if (agentsResult.error) throw agentsResult.error;
    if (credentialsResult.error) throw credentialsResult.error;
    const agents = agentsResult.data || [];
    const credentials = credentialsResult.data || [];
    await assertUsageAllowance(req.userId, 1);

    const result = await executeAgent({
      id:'workflow-copilot',
      name:'Workflow Copilot',
      system_prompt:workflowCopilotPrompt({
        agents,
        connectors:CONNECTOR_DEFINITIONS,
        credentials,
      }),
      personality:'professional',
      model,
      temperature:0.2,
      max_tokens:2500,
      enabled_tool_slugs:[],
    }, request, { timeoutSeconds:75 });

    if (result.status !== 'completed' || !result.final_answer) {
      const error = new Error(result.error_message || 'Workflow Copilot could not generate a draft');
      error.status = result.error_code === 'PROVIDER_NOT_CONFIGURED' ? 503 : 502;
      error.code = result.error_code || 'COPILOT_PROVIDER_ERROR';
      throw error;
    }

    const usageId = crypto.randomUUID();
    await recordUsage({
      userId:req.userId,
      resourceType:'workflow',
      modelCalls:1,
      tokens:result.tokens_used || 0,
      estimatedCostUsd:estimateCostUsd(result.tokens_used, model),
      idempotencyKey:`workflow-copilot:${usageId}`,
      metadata:{
        operation:'copilot_draft',
        model,
        provider:result.provider || MODEL_CATALOG[model].provider,
      },
    });

    let plan;
    try {
      plan = normalizeWorkflowPlan(extractWorkflowJson(result.final_answer), {
        agents,
        connectors:CONNECTOR_DEFINITIONS,
        credentials,
      });
    } catch (error) {
      error.status = 422;
      error.code = 'INVALID_COPILOT_DRAFT';
      throw error;
    }

    res.json({
      ...plan,
      generation:{
        model,
        provider:result.provider || MODEL_CATALOG[model].provider,
        tokens_used:result.tokens_used || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

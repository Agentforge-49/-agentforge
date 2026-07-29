import { Router } from 'express';

import { estimateCostUsd } from '../lib/observability.js';
import { enforceOrganizationExecutionPolicy } from '../lib/organizations.js';
import { getPlatformStatus } from '../lib/launch-readiness.js';
import { supabase } from '../lib/supabase.js';
import { assertUsageAllowance, getUsageSummary } from '../lib/usage.js';
import {
  apiError,
  requireDeveloperApiKey,
  requireDeveloperScope,
} from '../middleware/developer-auth.js';

const router = Router();
router.use(requireDeveloperApiKey);

router.get('/status', requireDeveloperScope('status:read'), async (req, res, next) => {
  try {
    respond(req, res, await getPlatformStatus());
  } catch (error) {
    next(error);
  }
});

router.get('/agents', requireDeveloperScope('agents:read'), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('agents')
      .select('id, name, description, category, model, status, latest_version_number, published_at, created_at, updated_at')
      .eq('user_id', req.userId).order('created_at', { ascending:false }).limit(limit(req));
    if (error) throw error;
    respond(req, res, data || []);
  } catch (error) {
    next(error);
  }
});

router.get('/agents/:id', requireDeveloperScope('agents:read'), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('agents')
      .select('id, name, description, category, model, temperature, max_tokens, status, latest_version_number, published_at, created_at, updated_at')
      .eq('id', req.params.id).eq('user_id', req.userId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json(apiError('not_found', 'Agent not found'));
    respond(req, res, data);
  } catch (error) {
    next(error);
  }
});

router.post('/agents/:id/run', requireDeveloperScope('agents:run'), async (req, res, next) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 50000) {
      return res.status(400).json(apiError('invalid_input', 'Message must be 1 to 50,000 characters'));
    }
    const { data:agent, error:agentError } = await supabase.from('agents')
      .select('id, model, max_tokens')
      .eq('id', req.params.id).eq('user_id', req.userId).maybeSingle();
    if (agentError) throw agentError;
    if (!agent) return res.status(404).json(apiError('not_found', 'Agent not found'));
    await enforceOrganizationExecutionPolicy({
      userId:req.userId,
      resourceType:'agent',
      resourceId:agent.id,
      modelCalls:1,
      models:[agent.model],
      estimatedCostUsd:estimateCostUsd(agent.max_tokens, agent.model),
    });
    await assertUsageAllowance(req.userId, 1);
    const { data, error } = await supabase.rpc('enqueue_agent_run', {
      p_user_id:req.userId,
      p_agent_id:agent.id,
      p_message:message,
      p_idempotency_key:idempotencyKey(req),
    });
    if (error) return res.status(apiRunErrorStatus(error.message))
      .json(apiError('run_rejected', error.message));
    respond(req, res, data, data?.deduplicated ? 200 : 202);
  } catch (error) {
    next(error);
  }
});

router.get('/workflows', requireDeveloperScope('workflows:read'), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('workflows')
      .select('id, name, description, status, version, created_at, updated_at')
      .eq('user_id', req.userId).order('created_at', { ascending:false }).limit(limit(req));
    if (error) throw error;
    respond(req, res, data || []);
  } catch (error) {
    next(error);
  }
});

router.get('/workflows/:id', requireDeveloperScope('workflows:read'), async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('workflows')
      .select('id, name, description, status, nodes, edges, version, created_at, updated_at')
      .eq('id', req.params.id).eq('user_id', req.userId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json(apiError('not_found', 'Workflow not found'));
    respond(req, res, data);
  } catch (error) {
    next(error);
  }
});

router.post('/workflows/:id/run', requireDeveloperScope('workflows:run'), async (req, res, next) => {
  try {
    const { data:workflow, error:workflowError } = await supabase.from('workflows')
      .select('*').eq('id', req.params.id).eq('user_id', req.userId).maybeSingle();
    if (workflowError) throw workflowError;
    if (!workflow) return res.status(404).json(apiError('not_found', 'Workflow not found'));
    const agentIds = [...new Set((workflow.nodes || [])
      .filter(node => node.type === 'agent' && node.config?.agent_id)
      .map(node => node.config.agent_id))];
    const { data:agents, error:agentError } = agentIds.length
      ? await supabase.from('agents').select('id, model, max_tokens')
        .eq('user_id', req.userId).in('id', agentIds)
      : { data:[], error:null };
    if (agentError) throw agentError;
    await enforceOrganizationExecutionPolicy({
      userId:req.userId,
      resourceType:'workflow',
      resourceId:workflow.id,
      modelCalls:agents?.length || 0,
      models:(agents || []).map(item => item.model),
      estimatedCostUsd:(agents || []).reduce(
        (total, item) => total + estimateCostUsd(item.max_tokens, item.model), 0,
      ),
    });
    if (agents?.length) await assertUsageAllowance(req.userId, agents.length);
    const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
    if (input.length > 50000) {
      return res.status(400).json(apiError('invalid_input', 'Workflow input must be 50,000 characters or fewer'));
    }
    const { data, error } = await supabase.rpc('enqueue_workflow_run', {
      p_user_id:req.userId,
      p_workflow_id:workflow.id,
      p_input:input,
      p_idempotency_key:idempotencyKey(req),
    });
    if (error) return res.status(apiRunErrorStatus(error.message))
      .json(apiError('run_rejected', error.message));
    respond(req, res, data, data?.deduplicated ? 200 : 202);
  } catch (error) {
    next(error);
  }
});

router.get('/runs', requireDeveloperScope('runs:read'), async (req, res, next) => {
  try {
    const take = limit(req);
    const [agents, workflows] = await Promise.all([
      supabase.from('agent_runs')
        .select('id, agent_id, status, tokens_used, duration_ms, started_at, completed_at')
        .eq('user_id', req.userId).order('started_at', { ascending:false }).limit(take),
      supabase.from('workflow_runs')
        .select('id, workflow_id, status, started_at, completed_at, created_at')
        .eq('user_id', req.userId).order('created_at', { ascending:false }).limit(take),
    ]);
    if (agents.error || workflows.error) throw agents.error || workflows.error;
    const rows = [
      ...(agents.data || []).map(item => ({ ...item, run_type:'agent' })),
      ...(workflows.data || []).map(item => ({ ...item, run_type:'workflow' })),
    ].sort((left, right) => new Date(right.started_at || right.created_at)
      - new Date(left.started_at || left.created_at)).slice(0, take);
    respond(req, res, rows);
  } catch (error) {
    next(error);
  }
});

router.get('/usage', requireDeveloperScope('usage:read'), async (req, res, next) => {
  try {
    const summary = await getUsageSummary(req.userId);
    respond(req, res, {
      plan:summary.plan,
      entitlement:summary.entitlement,
      period:summary.period,
      limits:summary.limits,
      percentages:summary.percentages,
      warnings:summary.warnings,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/webhook-events', requireDeveloperScope('webhooks:write'), async (req, res, next) => {
  try {
    if (req.body?.type !== 'test.ping') {
      return res.status(400).json(apiError('invalid_event', 'Only test.ping can be published directly'));
    }
    const { data, error } = await supabase.rpc('publish_developer_webhook_event', {
      p_user_id:req.userId,
      p_event_type:'test.ping',
      p_payload:{
        message:String(req.body?.message || 'Developer API webhook test').slice(0, 500),
        request_id:req.developerRequestId,
      },
    });
    if (error) throw error;
    respond(req, res, data, 202);
  } catch (error) {
    next(error);
  }
});

router.use((error, req, res, _next) => {
  const status = Number(error.status) || 500;
  const code = error.code === 'USAGE_LIMIT_REACHED' ? 'usage_limit_reached'
    : error.code === 'ORGANIZATION_POLICY_DENIED' ? 'organization_policy_denied'
      : status >= 500 ? 'internal_error' : 'request_failed';
  res.status(status).json(apiError(code, status >= 500
    ? 'The request could not be completed' : error.message));
});

function respond(req, res, data, status = 200) {
  res.status(status).json({
    data,
    meta:{ request_id:req.developerRequestId },
  });
}

function idempotencyKey(req) {
  return String(req.get('idempotency-key') || req.body?.idempotency_key || '').trim() || null;
}

function apiRunErrorStatus(message) {
  return /not found/i.test(message) ? 404
    : /active|published/i.test(message) ? 409
      : /limit/i.test(message) ? 429 : 400;
}

function limit(req) {
  const value = Number(req.query.limit);
  return Number.isInteger(value) && value >= 1 ? Math.min(value, 100) : 50;
}

export default router;

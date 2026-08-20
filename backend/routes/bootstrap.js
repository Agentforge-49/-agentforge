import { Router } from 'express';

import { fastestCopilotModel } from '../lib/copilot.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function count(table, userId, filters = [], column = 'id') {
  let query = supabase.from(table).select(column, { count:'exact', head:true }).eq('user_id', userId);
  for (const [column, value] of filters) query = query.eq(column, value);
  return query;
}

router.get('/', async (req, res, next) => {
  try {
    const [
      profile, agents, activeAgents, workflows, activeWorkflows, approvals, failedRuns,
      tools, apps, recentRuns, recentApprovals, model,
    ] = await Promise.all([
      supabase.from('profiles').select('full_name, api_calls_used, api_calls_limit, subscription_tier').eq('id', req.userId).single(),
      count('agents', req.userId), count('agents', req.userId, [['status', 'active']]),
      count('workflows', req.userId), count('workflows', req.userId, [['status', 'active']]),
      count('approval_requests', req.userId, [['status', 'pending']]),
      count('run_observability', req.userId, [['status', 'failed']], 'execution_job_id'),
      count('workspace_tools', req.userId, [['status', 'active']]),
      count('vault_credentials', req.userId),
      supabase.from('run_observability').select('execution_job_id, run_type, resource_name, status, duration_ms, estimated_cost_usd, created_at')
        .eq('user_id', req.userId).order('created_at', { ascending:false }).limit(8),
      supabase.from('approval_requests').select('id, workflow_id, node_id, status, created_at, expires_at')
        .eq('user_id', req.userId).eq('status', 'pending').order('created_at', { ascending:false }).limit(6),
      fastestCopilotModel().catch(() => null),
    ]);
    const results = [profile, agents, activeAgents, workflows, activeWorkflows, approvals, failedRuns, tools, apps, recentRuns, recentApprovals];
    const fatal = results.find(result => result.error);
    if (fatal) throw fatal.error;
    const readiness = {
      has_builder_resource:Boolean((workflows.count || 0) + (agents.count || 0)),
      has_connection:Boolean(apps.count),
      has_active_work:Boolean((activeWorkflows.count || 0) + (activeAgents.count || 0)),
    };
    res.setHeader('Cache-Control', 'private, max-age=15, stale-while-revalidate=45');
    res.json({
      user:{ name:profile.data?.full_name || null, plan:profile.data?.subscription_tier || 'free' },
      counts:{
        agents:agents.count || 0, active_agents:activeAgents.count || 0,
        workflows:workflows.count || 0, active_workflows:activeWorkflows.count || 0,
        approvals:approvals.count || 0, failed_runs:failedRuns.count || 0,
        workspace_tools:tools.count || 0, connected_apps:apps.count || 0,
      },
      usage:{ used:profile.data?.api_calls_used || 0, limit:profile.data?.api_calls_limit || 50 },
      readiness,
      recent_activity:recentRuns.data || [], approval_queue:recentApprovals.data || [],
      features:{
        copilot:{ available:Boolean(model), model, reason:model ? null : 'Configure a supported AI provider to use open-ended answers.' },
        billing:{ available:Boolean(process.env.STRIPE_SECRET_KEY), reason:process.env.STRIPE_SECRET_KEY ? null : 'Billing is not configured.' },
        oauth:{ available:Boolean(process.env.OAUTH_ENCRYPTION_KEY), reason:process.env.OAUTH_ENCRYPTION_KEY ? null : 'OAuth connections are not configured.' },
        realtime:{ available:true, fallback:'exponential_polling' },
        workspace_tools:{ available:true },
      },
      generated_at:new Date().toISOString(),
    });
  } catch (error) { next(error); }
});

export default router;

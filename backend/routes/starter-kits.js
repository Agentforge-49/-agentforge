import crypto from 'node:crypto';
import { Router } from 'express';

import { getStarterKit, listStarterKits, prepareStarterKit } from '../lib/starter-kits.js';
import { supabase } from '../lib/supabase.js';
import { getUsageSummary, recordUsage } from '../lib/usage.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

async function loadConnections(userId, ids) {
  if (!ids.length) return [];
  const [vaultResult, oauthResult] = await Promise.all([
    supabase.from('vault_credentials').select('id, name, provider, last_test_status')
      .eq('user_id', userId).in('id', ids),
    supabase.from('oauth_connections').select('id, provider, provider_account_name, status')
      .eq('user_id', userId).eq('status', 'active').in('id', ids),
  ]);
  if (vaultResult.error) throw vaultResult.error;
  if (oauthResult.error) throw oauthResult.error;
  return [
    ...(vaultResult.data || []).map(item => ({ ...item, source:'vault' })),
    ...(oauthResult.data || []).map(item => ({
      ...item,
      name:item.provider_account_name || `${item.provider} account`,
      source:'oauth',
    })),
  ];
}

async function enforceInstallLimits(userId, kit) {
  const summary = await getUsageSummary(userId);
  const [agentResult, workflowResult] = await Promise.all([
    supabase.from('agents').select('id', { count:'exact', head:true }).eq('user_id', userId),
    supabase.from('workflows').select('id', { count:'exact', head:true }).eq('user_id', userId),
  ]);
  if (agentResult.error) throw agentResult.error;
  if (workflowResult.error) throw workflowResult.error;
  if (summary.period.marketplace_installs >= Number(summary.limits.marketplace_installs || 0)) {
    const error = new Error('Monthly starter-kit install limit reached');
    error.status = 429;
    throw error;
  }
  if ((agentResult.count || 0) + kit.agents.length > Number(summary.limits.agents || 0)) {
    const error = new Error('This starter kit would exceed your agent limit');
    error.status = 429;
    throw error;
  }
  if ((workflowResult.count || 0) + 1 > Number(summary.limits.workflows || 0)) {
    const error = new Error('This starter kit would exceed your workflow limit');
    error.status = 429;
    throw error;
  }
}

router.get('/', (_req, res) => {
  res.json({ kits:listStarterKits() });
});

router.post('/:slug/install', async (req, res, next) => {
  const kit = getStarterKit(req.params.slug);
  if (!kit) return res.status(404).json({ error:'Starter kit not found' });

  const createdAgentIds = [];
  let createdWorkflowId = null;
  try {
    await enforceInstallLimits(req.userId, kit);
    const requestedConnections = kit.requirements.map(item => req.body?.connections?.[item.key]);
    const connections = await loadConnections(
      req.userId,
      requestedConnections.filter(value => typeof value === 'string'),
    );
    const connectionMap = new Map(connections.map(item => [item.id, item]));
    for (const requirement of kit.requirements) {
      const selected = connectionMap.get(req.body?.connections?.[requirement.key]);
      if (!selected || selected.provider !== requirement.provider) {
        return res.status(400).json({ error:`Select a connected ${requirement.label}` });
      }
    }

    const agentIds = {};
    for (const definition of kit.agents) {
      const { key, ...config } = definition;
      const { data:agent, error:agentError } = await supabase.from('agents').insert({
        user_id:req.userId,
        ...config,
        personality:'professional',
        status:'draft',
        has_unpublished_changes:true,
      }).select().single();
      if (agentError) throw agentError;
      createdAgentIds.push(agent.id);
      agentIds[key] = agent.id;
      const { error:publishError } = await supabase.rpc('publish_agent_version', {
        p_agent_id:agent.id,
        p_user_id:req.userId,
        p_change_summary:`Installed from AgentForge flagship kit: ${kit.name}`,
      });
      if (publishError) throw publishError;
    }

    const prepared = prepareStarterKit(kit.slug, {
      connections:req.body?.connections,
      settings:req.body?.settings,
      agentIds,
    });
    if (prepared.error) {
      const error = new Error(prepared.error);
      error.status = 400;
      throw error;
    }
    const { data:workflow, error:workflowError } = await supabase.from('workflows').insert({
      user_id:req.userId,
      ...prepared.value.workflow,
      status:'active',
    }).select().single();
    if (workflowError) throw workflowError;
    createdWorkflowId = workflow.id;

    await recordUsage({
      userId:req.userId,
      resourceType:'marketplace',
      resourceId:workflow.id,
      idempotencyKey:`starter-kit-install:${crypto.randomUUID()}`,
      metadata:{ starter_kit:kit.slug, agent_count:createdAgentIds.length },
    });

    return res.status(201).json({
      starter_kit:kit.slug,
      workflow,
      agents:createdAgentIds.map((id, index) => ({ id, key:kit.agents[index].key })),
      sample_input:kit.sample_input,
      next_path:`/workflows/${workflow.id}/edit`,
    });
  } catch (error) {
    if (createdWorkflowId) {
      await supabase.from('workflows').delete().eq('id', createdWorkflowId).eq('user_id', req.userId);
    }
    if (createdAgentIds.length) {
      await supabase.from('agents').delete().in('id', createdAgentIds).eq('user_id', req.userId);
    }
    next(error);
  }
});

export default router;

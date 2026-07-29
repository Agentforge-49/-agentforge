import crypto from 'node:crypto';
import { Router } from 'express';

import { validateMultiAgentSystem } from '../lib/multi-agent.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { assertUsageAllowance } from '../lib/usage.js';
import {
  assertOrganizationResourceDeletable,
  enforceOrganizationExecutionPolicy,
} from '../lib/organizations.js';
import { estimateCostUsd } from '../lib/observability.js';

const router = Router();
router.use(requireAuth);

const SYSTEM_SELECT = `
  *,
  supervisor:agents!multi_agent_supervisor_owner_fk(id, name, status, published_version_id),
  multi_agent_members(
    id, agent_id, role, route_keywords, position,
    agents(id, name, description, status, published_version_id)
  ),
  multi_agent_runs(
    id, status, input_text, output_text, delegation_count, maximum_depth,
    total_tokens, estimated_cost_usd, error_message, created_at, completed_at
  )
`;

function formatSystem(system) {
  return {
    ...system,
    members:(system.multi_agent_members || [])
      .sort((left, right) => left.position - right.position)
      .map(member => ({ ...member, agent:member.agents, agents:undefined })),
    runs:(system.multi_agent_runs || [])
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, 10),
    multi_agent_members:undefined,
    multi_agent_runs:undefined,
  };
}

async function loadSystem(id, userId, select = SYSTEM_SELECT) {
  const { data, error } = await supabase
    .from('multi_agent_systems')
    .select(select)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function validateAgents(userId, value) {
  const agentIds = [...new Set([
    ...(value.members || []).map(member => member.agent_id),
    ...(value.supervisor_agent_id ? [value.supervisor_agent_id] : []),
  ])];
  if (!agentIds.length) return null;
  const { data, error } = await supabase
    .from('agents')
    .select('id, status, published_version_id')
    .eq('user_id', userId)
    .in('id', agentIds);
  if (error) throw error;
  if ((data || []).length !== agentIds.length) return 'One or more selected agents were not found';
  if ((data || []).some(agent => agent.status !== 'active' || !agent.published_version_id)) {
    return 'Every selected agent must be active and published';
  }
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('multi_agent_systems')
      .select(SYSTEM_SELECT)
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false });
    if (error) throw error;
    res.json((data || []).map(formatSystem));
  } catch (error) {
    next(error);
  }
});

router.get('/runs/:runId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('multi_agent_runs')
      .select(`
        *,
        multi_agent_systems(name, strategy, aggregation_strategy),
        multi_agent_tasks(*, agents(name))
      `)
      .eq('id', req.params.runId)
      .eq('user_id', req.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Multi-agent run not found' });
    data.multi_agent_tasks = (data.multi_agent_tasks || [])
      .sort((left, right) => left.task_order - right.task_order);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  let createdId = null;
  try {
    const validated = validateMultiAgentSystem(req.body);
    if (validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0], details:validated.errors });
    }
    const agentError = await validateAgents(req.userId, validated.value);
    if (agentError) return res.status(400).json({ error:agentError });
    const { members, ...fields } = validated.value;
    const { data:system, error } = await supabase
      .from('multi_agent_systems')
      .insert({ user_id:req.userId, status:'draft', ...fields })
      .select()
      .single();
    if (error) throw error;
    createdId = system.id;
    const { error:memberError } = await supabase
      .from('multi_agent_members')
      .insert(members.map(member => ({
        ...member,
        system_id:system.id,
        user_id:req.userId,
      })));
    if (memberError) throw memberError;
    const created = await loadSystem(system.id, req.userId);
    res.status(201).json(formatSystem(created));
  } catch (error) {
    if (createdId) {
      await supabase.from('multi_agent_systems').delete().eq('id', createdId).eq('user_id', req.userId);
    }
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const current = await loadSystem(req.params.id, req.userId);
    if (!current) return res.status(404).json({ error:'Multi-agent system not found' });
    if (current.status === 'active') {
      return res.status(409).json({ error:'Pause the system before changing its configuration' });
    }
    const validated = validateMultiAgentSystem(req.body, { partial:true });
    if (validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0], details:validated.errors });
    }
    const merged = {
      strategy:validated.value.strategy ?? current.strategy,
      aggregation_strategy:validated.value.aggregation_strategy ?? current.aggregation_strategy,
      supervisor_agent_id:validated.value.supervisor_agent_id !== undefined
        ? validated.value.supervisor_agent_id : current.supervisor_agent_id,
      members:validated.value.members || current.multi_agent_members,
    };
    const mergedValidation = validateMultiAgentSystem({
      name:validated.value.name ?? current.name,
      description:validated.value.description ?? current.description,
      supervisor_prompt:validated.value.supervisor_prompt ?? current.supervisor_prompt,
      max_delegations:validated.value.max_delegations ?? current.max_delegations,
      max_parallel:validated.value.max_parallel ?? current.max_parallel,
      max_depth:validated.value.max_depth ?? current.max_depth,
      timeout_seconds:validated.value.timeout_seconds ?? current.timeout_seconds,
      ...merged,
    });
    if (mergedValidation.errors.length) {
      return res.status(400).json({ error:mergedValidation.errors[0], details:mergedValidation.errors });
    }
    const agentError = await validateAgents(req.userId, mergedValidation.value);
    if (agentError) return res.status(400).json({ error:agentError });
    const { members, ...fields } = validated.value;
    if (Object.keys(fields).length) {
      const { error } = await supabase
        .from('multi_agent_systems')
        .update(fields)
        .eq('id', current.id)
        .eq('user_id', req.userId);
      if (error) throw error;
    }
    if (members) {
      const { error:deleteError } = await supabase
        .from('multi_agent_members')
        .delete()
        .eq('system_id', current.id)
        .eq('user_id', req.userId);
      if (deleteError) throw deleteError;
      const { error:insertError } = await supabase
        .from('multi_agent_members')
        .insert(members.map(member => ({
          ...member,
          system_id:current.id,
          user_id:req.userId,
        })));
      if (insertError) throw insertError;
    }
    res.json(formatSystem(await loadSystem(current.id, req.userId)));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await assertOrganizationResourceDeletable('multi_agent', req.params.id, req.userId);
    const { data, error } = await supabase
      .from('multi_agent_systems')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error:'Multi-agent system not found' });
    res.json({ success:true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/activate', async (req, res, next) => {
  try {
    const system = await loadSystem(req.params.id, req.userId);
    if (!system) return res.status(404).json({ error:'Multi-agent system not found' });
    const validation = validateMultiAgentSystem({
      ...system,
      members:system.multi_agent_members,
    });
    if (validation.errors.length) {
      return res.status(400).json({ error:validation.errors[0], details:validation.errors });
    }
    const agentError = await validateAgents(req.userId, validation.value);
    if (agentError) return res.status(400).json({ error:agentError });
    const { data, error } = await supabase
      .from('multi_agent_systems')
      .update({ status:'active' })
      .eq('id', system.id)
      .eq('user_id', req.userId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/pause', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('multi_agent_systems')
      .update({ status:'paused' })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Multi-agent system not found' });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/run', async (req, res, next) => {
  try {
    const system = await loadSystem(req.params.id, req.userId, 'id, max_delegations');
    if (!system) return res.status(404).json({ error:'Multi-agent system not found' });
    const { data:memberRows, error:memberError } = await supabase
      .from('multi_agent_members').select('agent_id')
      .eq('system_id', system.id).eq('user_id', req.userId);
    if (memberError) throw memberError;
    const memberAgentIds = [...new Set((memberRows || []).map(member => member.agent_id))];
    const { data:memberAgents, error:agentError } = memberAgentIds.length
      ? await supabase.from('agents').select('id, model, max_tokens')
        .eq('user_id', req.userId).in('id', memberAgentIds)
      : { data:[], error:null };
    if (agentError) throw agentError;
    const highestCost = Math.max(
      0,
      ...(memberAgents || []).map(agent => estimateCostUsd(agent.max_tokens, agent.model)),
    );
    try {
      await enforceOrganizationExecutionPolicy({
        userId:req.userId,
        resourceType:'multi_agent',
        resourceId:system.id,
        modelCalls:system.max_delegations,
        models:(memberAgents || []).map(agent => agent.model),
        estimatedCostUsd:highestCost * system.max_delegations,
      });
    } catch (error) {
      if (error.code === 'ORGANIZATION_POLICY_DENIED') {
        return res.status(403).json({ error:error.message, policy:error.policy });
      }
      throw error;
    }
    try {
      await assertUsageAllowance(req.userId, system.max_delegations);
    } catch (error) {
      return res.status(429).json({ error:error.message, allowance:error.allowance });
    }
    const key = req.get('Idempotency-Key') || req.body?.idempotency_key
      || `multi-agent:${req.params.id}:${crypto.randomUUID()}`;
    const { data, error } = await supabase.rpc('enqueue_multi_agent_run', {
      p_user_id:req.userId,
      p_system_id:req.params.id,
      p_input:req.body?.input,
      p_idempotency_key:key,
    });
    if (error) {
      const message = error.message || 'Unable to queue multi-agent run';
      const status = /not found/i.test(message) ? 404
        : /must be active/i.test(message) ? 409 : 400;
      return res.status(status).json({ error:message });
    }
    res.status(data?.deduplicated ? 200 : 202).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/runs', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('multi_agent_runs')
      .select('*')
      .eq('system_id', req.params.id)
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false })
      .limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

export default router;

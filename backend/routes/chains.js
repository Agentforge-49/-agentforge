import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { executeAgent } from '../lib/engine.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Loads one agent plus its enabled tools, formatted exactly how the
// Python engine expects it. Used inside the chain-running loop below.
async function loadAgentConfig(agentId, userId) {
  const { data: agent, error } = await supabase
    .from('agents')
    .select(`*, agent_tools ( tools ( slug ) )`)
    .eq('id', agentId)
    .eq('user_id', userId)
    .single();

  if (error || !agent) return null;

  const enabled_tool_slugs = (agent.agent_tools || [])
    .map(at => at.tools?.slug)
    .filter(Boolean);

  return {
    id: agent.id,
    name: agent.name,
    system_prompt: agent.system_prompt || '',
    personality: agent.personality || 'professional',
    model: agent.model || 'claude-sonnet-4-6',
    temperature: agent.temperature ?? 0.7,
    max_tokens: agent.max_tokens || 1000,
    enabled_tool_slugs,
  };
}

async function validateOwnedAgents(agentIds, userId) {
  const uniqueIds = [...new Set(agentIds)];

  const { data: ownedAgents, error } = await supabase
    .from('agents')
    .select('id')
    .eq('user_id', userId)
    .in('id', uniqueIds);

  if (error) throw error;
  if ((ownedAgents || []).length !== uniqueIds.length) {
    return { error: 'Every chain agent must belong to your account' };
  }

  return { error: null };
}

// GET /api/chains  — list all chains the user has created
router.get('/', async (req, res, next) => {
  try {
    const { data: chains, error } = await supabase
      .from('agent_chains')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const allAgentIds = [...new Set(chains.flatMap(c => c.agent_ids))];
    let agentMap = {};
    if (allAgentIds.length > 0) {
      const { data: agents } = await supabase
        .from('agents')
        .select('id, name')
        .eq('user_id', req.userId)
        .in('id', allAgentIds);
      agentMap = Object.fromEntries((agents || []).map(a => [a.id, a.name]));
    }

    const result = chains.map(c => ({
      ...c,
      agent_names: c.agent_ids.map(id => agentMap[id] || 'Unknown agent'),
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/chains  — create a new chain
// body: { name, description, agent_ids: [uuid, uuid, ...] }
router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      description,
      agent_ids,
      branch_keyword,
      branch_agent_if_id,
      branch_agent_else_id,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Chain name is required' });
    if (!Array.isArray(agent_ids) || agent_ids.length < 2) {
      return res.status(400).json({ error: 'A chain needs at least 2 agents' });
    }
    if (agent_ids.length > 25) {
      return res.status(400).json({ error: 'A chain can contain at most 25 agents' });
    }
    if (new Set(agent_ids).size !== agent_ids.length) {
      return res.status(400).json({ error: 'A chain cannot contain duplicate agents' });
    }
    if ((branch_agent_if_id || branch_agent_else_id) && !branch_keyword?.trim()) {
      return res.status(400).json({ error: 'A branch keyword is required when branch agents are selected' });
    }

    const referencedAgentIds = [
      ...agent_ids,
      branch_agent_if_id,
      branch_agent_else_id,
    ].filter(Boolean);
    const validation = await validateOwnedAgents(referencedAgentIds, req.userId);
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }

    const { data: chain, error } = await supabase
      .from('agent_chains')
      .insert({
        user_id: req.userId,
        name: name.trim(),
        description,
        agent_ids,
        branch_keyword: branch_keyword?.trim() || null,
        branch_agent_if_id: branch_agent_if_id || null,
        branch_agent_else_id: branch_agent_else_id || null,
      })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json(chain);
  } catch (err) { next(err); }
});

// GET /api/chains/:id  — one chain with its agents in order
router.get('/:id', async (req, res, next) => {
  try {
    const { data: chain, error } = await supabase
      .from('agent_chains')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (error || !chain) return res.status(404).json({ error: 'Chain not found' });

    const { data: agents } = await supabase
      .from('agents')
      .select('id, name, description, category')
      .eq('user_id', req.userId)
      .in('id', chain.agent_ids);

    const orderedAgents = chain.agent_ids
      .map(id => agents.find(a => a.id === id))
      .filter(Boolean);

    res.json({ ...chain, agents: orderedAgents });
  } catch (err) { next(err); }
});

// DELETE /api/chains/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('agent_chains')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/chains/:id/run  — THE CORE FEATURE
// Runs each agent in order. Each agent's answer becomes the
// next agent's input automatically.
// body: { message }
router.post('/:id/run', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const { data: chain, error: chainError } = await supabase
      .from('agent_chains')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (chainError || !chain) return res.status(404).json({ error: 'Chain not found' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('api_calls_used, api_calls_limit')
      .eq('id', req.userId)
      .single();
    if (profile && profile.api_calls_used >= profile.api_calls_limit) {
      return res.status(429).json({ error: 'Monthly limit reached. Upgrade to Pro.' });
    }

    const steps = [];
    let currentInput   = message;   // starts as the user's message
    let totalTokens     = 0;
    let totalDuration   = 0;
    let chainStatus      = 'completed';
    let errorMessage     = null;

    for (const agentId of chain.agent_ids) {
      const agentConfig = await loadAgentConfig(agentId, req.userId);

      if (!agentConfig) {
        chainStatus  = 'failed';
        errorMessage = `Agent ${agentId} not found`;
        steps.push({ agent_id: agentId, status: 'failed', error: errorMessage });
        break;
      }

      let engineResult;
      try {
        engineResult = await executeAgent(agentConfig, currentInput);
      } catch (engineErr) {
        chainStatus  = 'failed';
        errorMessage = engineErr.message;
        steps.push({
          agent_id: agentId,
          agent_name: agentConfig.name,
          input: currentInput,
          status: 'failed',
          error: errorMessage,
        });
        break;
      }

      totalTokens   += engineResult.tokens_used  || 0;
      totalDuration += engineResult.duration_ms  || 0;

      steps.push({
        agent_id:    agentId,
        agent_name:  agentConfig.name,
        input:       currentInput,
        output:      engineResult.final_answer,
        tokens_used: engineResult.tokens_used,
        duration_ms: engineResult.duration_ms,
        status:      engineResult.status,
      });

      if (engineResult.status !== 'completed') {
        chainStatus  = 'failed';
        errorMessage = engineResult.error_message || 'Agent step failed';
        break;
      }

      // THE KEY LINE — this agent's output becomes the next agent's input
      currentInput = engineResult.final_answer;
    }

    const { data: chainRun, error: runError } = await supabase
      .from('chain_runs')
      .insert({
        chain_id:        chain.id,
        user_id:         req.userId,
        status:          chainStatus,
        initial_message: message,
        steps,
        total_tokens:      totalTokens,
        total_duration_ms: totalDuration,
        error_message:     errorMessage,
        completed_at:       new Date().toISOString(),
      })
      .select()
      .single();
    if (runError) throw runError;

    if (profile) {
      await supabase.rpc('increment_api_usage', {
        p_user_id: req.userId,
        p_amount: steps.length,
      });
    }

    res.json(chainRun);
  } catch (err) { next(err); }
});

// GET /api/chains/:id/runs  — past runs of one chain
router.get('/:id/runs', async (req, res, next) => {
  try {
    const { data: runs, error } = await supabase
      .from('chain_runs')
      .select('*')
      .eq('chain_id', req.params.id)
      .eq('user_id', req.userId)
      .order('started_at', { ascending: false });
    if (error) throw error;
    res.json(runs);
  } catch (err) { next(err); }
});

export default router;

import { Router } from 'express';
import fetch from 'node-fetch';
import { supabase } from '../lib/supabase.js';


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

// Runs a single agent through the engine and returns the raw result.
// Shared helper used by both the main chain loop and the new branch step.
async function runOneAgent(agentConfig, inputMessage) {
  const response = await fetch(`${process.env.AGENT_ENGINE_URL}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_config: agentConfig, user_message: inputMessage }),
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Engine error: ${t}`);
  }
  return response.json();
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
// body: { name, description, agent_ids: [uuid, uuid, ...],
//         branch_keyword?, branch_agent_if_id?, branch_agent_else_id? }
router.post('/', async (req, res, next) => {
  try {
    const {
      name, description, agent_ids,
      branch_keyword, branch_agent_if_id, branch_agent_else_id,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Chain name is required' });
    if (!Array.isArray(agent_ids) || agent_ids.length < 2) {
      return res.status(400).json({ error: 'A chain needs at least 2 agents' });
    }

    const { data: chain, error } = await supabase
      .from('agent_chains')
      .insert({
        user_id: req.userId,
        name,
        description,
        agent_ids,
        // NEW — Day 10 — optional branch fields. If not provided,
        // these are simply undefined and Postgres stores them as null.
        branch_keyword: branch_keyword || null,
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
// next agent's input automatically. If the chain has a branch
// condition set up, one extra agent runs at the end based on
// whether the final answer matched the keyword.
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

    // ── Main linear chain loop (unchanged from Day 7) ──────────────────────
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
        engineResult = await runOneAgent(agentConfig, currentInput);
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

      currentInput = engineResult.final_answer;
    }

    // ── NEW — Day 10 — optional branch step ─────────────────────────────────
    // Only runs if the main loop finished successfully AND the chain has
    // a branch keyword set AND at least one branch agent is configured.
    if (
      chainStatus === 'completed' &&
      chain.branch_keyword &&
      (chain.branch_agent_if_id || chain.branch_agent_else_id)
    ) {
      const matched = currentInput
        .toLowerCase()
        .includes(chain.branch_keyword.toLowerCase());

      const branchAgentId = matched
        ? chain.branch_agent_if_id
        : chain.branch_agent_else_id;

      if (branchAgentId) {
        const branchConfig = await loadAgentConfig(branchAgentId, req.userId);

        if (branchConfig) {
          try {
            const branchResult = await runOneAgent(branchConfig, currentInput);

            totalTokens   += branchResult.tokens_used || 0;
            totalDuration += branchResult.duration_ms || 0;

            steps.push({
              agent_id:        branchAgentId,
              agent_name:      branchConfig.name,
              input:           currentInput,
              output:          branchResult.final_answer,
              tokens_used:     branchResult.tokens_used,
              duration_ms:     branchResult.duration_ms,
              status:          branchResult.status,
              is_branch_step:  true,
              branch_matched:  matched,
            });

            if (branchResult.status === 'completed') {
              currentInput = branchResult.final_answer;
            } else {
              chainStatus  = 'failed';
              errorMessage = branchResult.error_message || 'Branch step failed';
            }
          } catch (branchErr) {
            chainStatus  = 'failed';
            errorMessage = branchErr.message;
            steps.push({
              agent_id:       branchAgentId,
              agent_name:     branchConfig.name,
              input:          currentInput,
              status:         'failed',
              error:          errorMessage,
              is_branch_step: true,
              branch_matched: matched,
            });
          }
        }
      }
      // If branchAgentId is null/undefined, we simply skip — no extra step.
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
      await supabase.from('profiles')
        .update({ api_calls_used: profile.api_calls_used + steps.length })
        .eq('id', req.userId);
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
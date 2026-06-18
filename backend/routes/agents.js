import { Router } from 'express';
import fetch from 'node-fetch';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/agents
router.get('/', async (req, res, next) => {
  try {
    const { data: agents, error } = await supabase
      .from('agents')
      .select(`*, agent_tools (tools (*))`)
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.status(200).json(agents.map(a => ({ ...a, tools: a.agent_tools.map(at => at.tools).filter(Boolean), agent_tools: undefined })));
  } catch (err) { next(err); }
});

// POST /api/agents
router.post('/', async (req, res, next) => {
  try {
    const { name, description, category, system_prompt, personality, model, temperature, max_tokens, tool_slugs } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { data: agent, error } = await supabase.from('agents').insert({
      user_id: req.userId, name, description, category: category || 'other', system_prompt: system_prompt || '',
      personality: personality || 'professional', model: model || 'claude-sonnet-4-6',
      temperature: temperature ?? 0.7, max_tokens: max_tokens ?? 1000, status: 'draft'
    }).select().single();
    if (error) throw error;

    let attachedTools = [];
    if (tool_slugs?.length > 0) {
      const { data: tools } = await supabase.from('tools').select('*').in('slug', tool_slugs);
      if (tools?.length > 0) {
        await supabase.from('agent_tools').insert(tools.map(t => ({ agent_id: agent.id, tool_id: t.id })));
        attachedTools = tools;
      }
    }
    return res.status(201).json({ ...agent, tools: attachedTools });
  } catch (err) { next(err); }
});

// GET /api/agents/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data: agent, error } = await supabase.from('agents').select(`*, agent_tools (tools (*))`).eq('id', req.params.id).eq('user_id', req.userId).single();
    if (error || !agent) return res.status(404).json({ error: 'Agent not found' });
    return res.status(200).json({ ...agent, tools: agent.agent_tools.map(at => at.tools).filter(Boolean), agent_tools: undefined });
  } catch (err) { next(err); }
});

// PUT /api/agents/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, category, system_prompt, personality, model, temperature, max_tokens, status, tool_slugs } = req.body;
    const { data: check } = await supabase.from('agents').select('id').eq('id', id).eq('user_id', req.userId).single();
    if (!check) return res.status(404).json({ error: 'Agent not found' });

    const { data: updated, error } = await supabase.from('agents').update({
      name, description, category, system_prompt, personality, model, temperature, max_tokens, status, updated_at: new Date().toISOString()
    }).eq('id', id).select().single();
    if (error) throw error;

    if (tool_slugs && Array.isArray(tool_slugs)) {
      await supabase.from('agent_tools').delete().eq('agent_id', id);
      if (tool_slugs.length > 0) {
        const { data: tools } = await supabase.from('tools').select('*').in('slug', tool_slugs);
        if (tools?.length > 0) await supabase.from('agent_tools').insert(tools.map(t => ({ agent_id: id, tool_id: t.id })));
      }
    }
    const { data: final } = await supabase.from('agents').select(`*, agent_tools (tools (*))`).eq('id', id).single();
    return res.status(200).json({ ...final, tools: final.agent_tools.map(at => at.tools).filter(Boolean), agent_tools: undefined });
  } catch (err) { next(err); }
});

// DELETE /api/agents/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.from('agents').delete().eq('id', req.params.id).eq('user_id', req.userId);
    if (error) return res.status(404).json({ error: 'Agent not found' });
    return res.status(200).json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/agents/:id/run
router.post('/:id/run', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const { data: agent } = await supabase.from('agents').select(`*, agent_tools (tools (*))`).eq('id', id).eq('user_id', req.userId).single();
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', req.userId).single();
    if (profile.api_calls_used >= profile.api_calls_limit) return res.status(429).json({ error: 'Monthly limit reached. Upgrade to Pro.' });

    const { data: run } = await supabase.from('agent_runs').insert({ agent_id: id, user_id: req.userId, status: 'running', input_text: message }).select().single();

    try {
      const response = await fetch(`${process.env.AGENT_ENGINE_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_config: { ...agent, tools: agent.agent_tools.map(at => at.tools) }, user_message: message })
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();

      const { data: finalRun } = await supabase.from('agent_runs').update({
        status: 'completed', output_text: result.final_answer, run_trace: result.run_trace || [],
        tokens_used: result.tokens_used || 0, duration_ms: result.duration_ms || 0, completed_at: new Date().toISOString()
      }).eq('id', run.id).select().single();

      await supabase.from('profiles')
        .update({ api_calls_used: profile.api_calls_used + 1 })
        .eq('id', req.userId);

      await supabase.from('agents')
        .update({ 
          run_count: (agent.run_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      return res.status(200).json(finalRun);
    } catch (err) {
      const { data: failedRun } = await supabase.from('agent_runs').update({ status: 'failed', error_message: err.message, completed_at: new Date().toISOString() }).eq('id', run.id).select().single();
      await supabase.from('profiles').update({ api_calls_used: profile.api_calls_used + 1 }).eq('id', req.userId);
      return res.status(200).json(failedRun);
    }
  } catch (err) { next(err); }
});

// GET /api/agents/:id/stats
router.get('/:id/stats', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify ownership and fetch agent metadata
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, run_count')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (agentError || !agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Pull historical analytics runs
    const { data: runs, error: runsError } = await supabase
      .from('agent_runs')
      .select('status, started_at, tokens_used, duration_ms')
      .eq('agent_id', id);

    if (runsError) throw runsError;

    // Base state payload structure for unexecuted or new agents
    if (!runs || runs.length === 0) {
      return res.status(200).json({
        run_count: agent.run_count || 0,
        last_run_at: null,
        success_rate: 0,
        avg_tokens: 0,
        avg_duration_ms: 0
      });
    }

    const totalRuns = runs.length;
    let completedRuns = 0;
    let totalTokens = 0;
    let totalDuration = 0;
    let lastRunAt = null;

    for (const run of runs) {
      if (run.status === 'completed') {
        completedRuns++;
      }
      totalTokens += run.tokens_used || 0;
      totalDuration += run.duration_ms || 0;

      const currentStartedAt = new Date(run.started_at);
      if (!lastRunAt || currentStartedAt > new Date(lastRunAt)) {
        lastRunAt = run.started_at;
      }
    }

    return res.status(200).json({
      run_count: agent.run_count || totalRuns,
      last_run_at: lastRunAt,
      success_rate: Math.round((completedRuns / totalRuns) * 100),
      avg_tokens: Math.round(totalTokens / totalRuns),
      avg_duration_ms: Math.round(totalDuration / totalRuns)
    });
  } catch (err) {
    next(err);
  }
});

export default router;
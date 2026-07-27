import { Router } from 'express';

import {
  draftDefaults,
  validateAgentConfig,
  validateToolSlugs,
} from '../lib/agent-config.js';
import { executeAgent } from '../lib/engine.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const AGENT_SELECT = '*, agent_tools (tools (*))';
const CONFIG_FIELDS = [
  'name',
  'description',
  'category',
  'system_prompt',
  'personality',
  'model',
  'temperature',
  'max_tokens',
];

function formatAgent(agent) {
  const tools = (agent.agent_tools || [])
    .map(item => item.tools)
    .filter(Boolean)
    .sort((left, right) => left.display_name.localeCompare(right.display_name));

  return {
    ...agent,
    tools,
    agent_tools: undefined,
  };
}

function validationError(res, errors) {
  return res.status(400).json({
    error: errors[0],
    details: errors,
  });
}

function normalizeChangeSummary(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const summary = value.trim();
  if (summary.length > 500) return undefined;
  return summary || null;
}

async function loadOwnedAgent(agentId, userId, select = AGENT_SELECT) {
  const { data, error } = await supabase
    .from('agents')
    .select(select)
    .eq('id', agentId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data;
}

async function loadAvailableTools(toolSlugs) {
  if (!toolSlugs?.length) return { tools: [], errors: [] };

  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .in('slug', toolSlugs);

  if (error) throw error;

  const tools = data || [];
  const foundSlugs = new Set(tools.map(tool => tool.slug));
  const missing = toolSlugs.filter(slug => !foundSlugs.has(slug));
  const unavailable = tools.filter(tool => !tool.is_available).map(tool => tool.slug);
  const errors = [];

  if (missing.length) errors.push(`Unknown tools: ${missing.join(', ')}`);
  if (unavailable.length) errors.push(`Unavailable tools: ${unavailable.join(', ')}`);

  return { tools, errors };
}

async function replaceAgentTools(agentId, tools) {
  const { error: deleteError } = await supabase
    .from('agent_tools')
    .delete()
    .eq('agent_id', agentId);
  if (deleteError) throw deleteError;

  if (!tools.length) return;

  const { error: insertError } = await supabase
    .from('agent_tools')
    .insert(tools.map(tool => ({ agent_id: agentId, tool_id: tool.id })));
  if (insertError) throw insertError;
}

async function getFormattedAgent(agentId, userId) {
  const agent = await loadOwnedAgent(agentId, userId);
  return agent ? formatAgent(agent) : null;
}

// GET /api/agents
router.get('/', async (req, res, next) => {
  try {
    const { data: agents, error } = await supabase
      .from('agents')
      .select(AGENT_SELECT)
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return res.status(200).json((agents || []).map(formatAgent));
  } catch (err) {
    next(err);
  }
});

// POST /api/agents
router.post('/', async (req, res, next) => {
  try {
    const configResult = validateAgentConfig(draftDefaults(req.body));
    const toolsResult = validateToolSlugs(req.body.tool_slugs ?? []);
    const errors = [...configResult.errors, ...toolsResult.errors];
    if (errors.length) return validationError(res, errors);

    const toolSelection = await loadAvailableTools(toolsResult.value);
    if (toolSelection.errors.length) return validationError(res, toolSelection.errors);

    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        user_id: req.userId,
        ...configResult.value,
        status: 'draft',
        has_unpublished_changes: true,
      })
      .select()
      .single();
    if (error) throw error;

    await replaceAgentTools(agent.id, toolSelection.tools);
    return res.status(201).json(await getFormattedAgent(agent.id, req.userId));
  } catch (err) {
    next(err);
  }
});

// GET /api/agents/:id/versions
router.get('/:id/versions', async (req, res, next) => {
  try {
    const agent = await loadOwnedAgent(
      req.params.id,
      req.userId,
      'id, published_version_id, latest_version_number',
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { data: versions, error } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('agent_id', agent.id)
      .eq('user_id', req.userId)
      .order('version_number', { ascending: false });
    if (error) throw error;

    return res.status(200).json({
      published_version_id: agent.published_version_id,
      latest_version_number: agent.latest_version_number,
      versions: versions || [],
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/agents/:id/publish
router.post('/:id/publish', async (req, res, next) => {
  try {
    const agent = await loadOwnedAgent(req.params.id, req.userId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const toolSlugs = (agent.agent_tools || [])
      .map(item => item.tools?.slug)
      .filter(Boolean);
    const configResult = validateAgentConfig(agent, { forPublish: true });
    const toolsResult = validateToolSlugs(toolSlugs);
    const errors = [...configResult.errors, ...toolsResult.errors];
    if (errors.length) return validationError(res, errors);

    const summary = normalizeChangeSummary(req.body?.change_summary);
    if (summary === undefined) {
      return validationError(res, ['Change summary must be 500 characters or fewer']);
    }

    const { data: version, error } = await supabase.rpc('publish_agent_version', {
      p_agent_id: agent.id,
      p_user_id: req.userId,
      p_change_summary: summary,
    });
    if (error) throw error;

    return res.status(201).json({
      agent: await getFormattedAgent(agent.id, req.userId),
      version,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/agents/:id/rollback
router.post('/:id/rollback', async (req, res, next) => {
  try {
    const agent = await loadOwnedAgent(
      req.params.id,
      req.userId,
      'id, published_version_id',
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!req.body?.version_id) {
      return validationError(res, ['version_id is required']);
    }
    if (req.body.version_id === agent.published_version_id) {
      return validationError(res, ['That version is already published']);
    }

    const summary = normalizeChangeSummary(req.body.change_summary);
    if (summary === undefined) {
      return validationError(res, ['Change summary must be 500 characters or fewer']);
    }

    const { data: version, error } = await supabase.rpc('rollback_agent_version', {
      p_agent_id: agent.id,
      p_user_id: req.userId,
      p_source_version_id: req.body.version_id,
      p_change_summary: summary,
    });
    if (error) {
      if (/version not found/i.test(error.message)) {
        return res.status(404).json({ error: 'Agent version not found' });
      }
      throw error;
    }

    return res.status(201).json({
      agent: await getFormattedAgent(agent.id, req.userId),
      version,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/agents/:id/pause
router.post('/:id/pause', async (req, res, next) => {
  try {
    const agent = await loadOwnedAgent(
      req.params.id,
      req.userId,
      'id, published_version_id',
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agent.published_version_id) {
      return res.status(409).json({ error: 'Publish the agent before pausing it' });
    }

    const { error } = await supabase
      .from('agents')
      .update({ status: 'paused' })
      .eq('id', agent.id)
      .eq('user_id', req.userId);
    if (error) throw error;

    return res.status(200).json(await getFormattedAgent(agent.id, req.userId));
  } catch (err) {
    next(err);
  }
});

// POST /api/agents/:id/resume
router.post('/:id/resume', async (req, res, next) => {
  try {
    const agent = await loadOwnedAgent(
      req.params.id,
      req.userId,
      'id, published_version_id',
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agent.published_version_id) {
      return res.status(409).json({ error: 'Publish the agent before activating it' });
    }

    const { error } = await supabase
      .from('agents')
      .update({ status: 'active' })
      .eq('id', agent.id)
      .eq('user_id', req.userId);
    if (error) throw error;

    return res.status(200).json(await getFormattedAgent(agent.id, req.userId));
  } catch (err) {
    next(err);
  }
});

// GET /api/agents/:id
router.get('/:id', async (req, res, next) => {
  try {
    const agent = await getFormattedAgent(req.params.id, req.userId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    return res.status(200).json(agent);
  } catch (err) {
    next(err);
  }
});

// PUT /api/agents/:id
router.put('/:id', async (req, res, next) => {
  try {
    const agent = await loadOwnedAgent(req.params.id, req.userId, 'id, status');
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const configInput = Object.fromEntries(
      CONFIG_FIELDS
        .filter(field => Object.prototype.hasOwnProperty.call(req.body, field))
        .map(field => [field, req.body[field]]),
    );
    const configResult = validateAgentConfig(configInput, { partial: true });
    const toolsResult = validateToolSlugs(req.body.tool_slugs);
    const errors = [...configResult.errors, ...toolsResult.errors];
    if (errors.length) return validationError(res, errors);
    if (!Object.keys(configResult.value).length && toolsResult.value === undefined) {
      return validationError(res, ['No editable agent fields were provided']);
    }

    let selectedTools;
    if (toolsResult.value !== undefined) {
      const toolSelection = await loadAvailableTools(toolsResult.value);
      if (toolSelection.errors.length) return validationError(res, toolSelection.errors);
      selectedTools = toolSelection.tools;
    }

    if (Object.keys(configResult.value).length) {
      const { error } = await supabase
        .from('agents')
        .update({
          ...configResult.value,
          has_unpublished_changes: true,
        })
        .eq('id', agent.id)
        .eq('user_id', req.userId);
      if (error) throw error;
    }

    if (selectedTools !== undefined) {
      await replaceAgentTools(agent.id, selectedTools);
      const { error } = await supabase
        .from('agents')
        .update({ has_unpublished_changes: true })
        .eq('id', agent.id)
        .eq('user_id', req.userId);
      if (error) throw error;
    }

    return res.status(200).json(await getFormattedAgent(agent.id, req.userId));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/agents/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agents')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: 'Agent not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/agents/:id/run
router.post('/:id/run', async (req, res, next) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return validationError(res, ['Message is required']);
    if (message.length > 50000) {
      return validationError(res, ['Message must be 50,000 characters or fewer']);
    }

    const agent = await loadOwnedAgent(
      req.params.id,
      req.userId,
      'id, status, published_version_id, run_count',
    );
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agent.published_version_id || agent.status === 'draft') {
      return res.status(409).json({ error: 'Publish the agent before running it' });
    }
    if (agent.status === 'paused') {
      return res.status(409).json({ error: 'Resume the agent before running it' });
    }

    const { data: version, error: versionError } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('id', agent.published_version_id)
      .eq('agent_id', agent.id)
      .eq('user_id', req.userId)
      .single();
    if (versionError || !version) {
      return res.status(409).json({ error: 'Published agent version is unavailable' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('api_calls_used, api_calls_limit')
      .eq('id', req.userId)
      .single();
    if (profileError) throw profileError;
    if (profile.api_calls_used >= profile.api_calls_limit) {
      return res.status(429).json({ error: 'Monthly limit reached. Upgrade to Pro.' });
    }

    const { data: run, error: runError } = await supabase
      .from('agent_runs')
      .insert({
        agent_id: agent.id,
        agent_version_id: version.id,
        user_id: req.userId,
        status: 'running',
        input_text: message,
      })
      .select()
      .single();
    if (runError) throw runError;

    try {
      const result = await executeAgent({
        ...version,
        id: agent.id,
        enabled_tool_slugs: version.tool_slugs || [],
      }, message);

      const { data: finalRun, error: finalError } = await supabase
        .from('agent_runs')
        .update({
          status: 'completed',
          output_text: result.final_answer,
          run_trace: result.run_trace || [],
          tokens_used: result.tokens_used || 0,
          duration_ms: result.duration_ms || 0,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)
        .eq('user_id', req.userId)
        .select()
        .single();
      if (finalError) throw finalError;

      await supabase.rpc('increment_api_usage', {
        p_user_id: req.userId,
        p_amount: 1,
      });
      await supabase
        .from('agents')
        .update({ run_count: (agent.run_count || 0) + 1 })
        .eq('id', agent.id)
        .eq('user_id', req.userId);

      return res.status(200).json({
        ...finalRun,
        agent_version_number: version.version_number,
      });
    } catch (err) {
      const { data: failedRun } = await supabase
        .from('agent_runs')
        .update({
          status: 'failed',
          error_message: err.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)
        .eq('user_id', req.userId)
        .select()
        .single();

      await supabase.rpc('increment_api_usage', {
        p_user_id: req.userId,
        p_amount: 1,
      });
      return res.status(200).json({
        ...failedRun,
        agent_version_number: version.version_number,
      });
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/agents/:id/stats
router.get('/:id/stats', async (req, res, next) => {
  try {
    const agent = await loadOwnedAgent(req.params.id, req.userId, 'id, run_count');
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { data: runs, error } = await supabase
      .from('agent_runs')
      .select('status, started_at, tokens_used, duration_ms')
      .eq('agent_id', agent.id)
      .eq('user_id', req.userId);
    if (error) throw error;

    if (!runs?.length) {
      return res.status(200).json({
        run_count: agent.run_count || 0,
        last_run_at: null,
        success_rate: 0,
        avg_tokens: 0,
        avg_duration_ms: 0,
      });
    }

    const completedRuns = runs.filter(run => run.status === 'completed').length;
    const totalTokens = runs.reduce((sum, run) => sum + (run.tokens_used || 0), 0);
    const totalDuration = runs.reduce((sum, run) => sum + (run.duration_ms || 0), 0);
    const lastRunAt = runs.reduce(
      (latest, run) => (!latest || run.started_at > latest ? run.started_at : latest),
      null,
    );

    return res.status(200).json({
      run_count: agent.run_count || runs.length,
      last_run_at: lastRunAt,
      success_rate: Math.round((completedRuns / runs.length) * 100),
      avg_tokens: Math.round(totalTokens / runs.length),
      avg_duration_ms: Math.round(totalDuration / runs.length),
    });
  } catch (err) {
    next(err);
  }
});

export default router;

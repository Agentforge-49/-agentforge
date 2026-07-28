import os from 'node:os';

import { executeAgent } from './engine.js';
import { supabase } from './supabase.js';
import {
  applyTransform,
  evaluateCondition,
  validateWorkflowGraph,
} from './workflow-graph.js';

const POLL_INTERVAL_MS = Number(process.env.JOB_POLL_INTERVAL_MS || 1500);
const WORKER_ID = `${os.hostname()}:${process.pid}`;

async function loadAgentVersion(agentId, userId, requestedVersionId = null) {
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, status, published_version_id')
    .eq('id', agentId)
    .eq('user_id', userId)
    .single();
  if (error || !agent || agent.status !== 'active' || !agent.published_version_id) {
    throw new Error(`Agent ${agentId} is unavailable, paused, or unpublished`);
  }
  const versionId = requestedVersionId || agent.published_version_id;
  const { data: version, error: versionError } = await supabase
    .from('agent_versions')
    .select('*')
    .eq('id', versionId)
    .eq('agent_id', agent.id)
    .eq('user_id', userId)
    .single();
  if (versionError || !version) throw new Error(`Agent version ${versionId} is unavailable`);
  return {
    ...version,
    id: agent.id,
    version_id: version.id,
    enabled_tool_slugs: version.tool_slugs || [],
  };
}

async function cancellationRequested(jobId) {
  const { data } = await supabase
    .from('execution_jobs')
    .select('cancel_requested_at, status')
    .eq('id', jobId)
    .single();
  return Boolean(data?.cancel_requested_at || data?.status === 'cancelled');
}

async function finishAgentRun(job, updates) {
  await supabase
    .from('agent_runs')
    .update(updates)
    .eq('id', job.resource_id)
    .eq('user_id', job.user_id);
}

async function processAgentRun(job) {
  const payload = job.payload || {};
  await finishAgentRun(job, {
    status: 'running',
    error_message: null,
    completed_at: null,
  });
  const version = await loadAgentVersion(
    payload.agent_id,
    job.user_id,
    payload.agent_version_id,
  );
  const result = await executeAgent(version, payload.message, {
    timeoutSeconds: job.timeout_seconds,
  });
  if (result.status !== 'completed') {
    throw new Error(result.error_message || `Engine returned ${result.status}`);
  }
  if (await cancellationRequested(job.id)) {
    await finishAgentRun(job, {
      status: 'cancelled',
      error_message: 'Cancelled by user',
      completed_at: new Date().toISOString(),
    });
    return { cancelled: true };
  }

  await finishAgentRun(job, {
    status: 'completed',
    output_text: result.final_answer,
    run_trace: result.run_trace || [],
    tokens_used: result.tokens_used || 0,
    duration_ms: result.duration_ms || 0,
    error_message: null,
    completed_at: new Date().toISOString(),
  });
  await supabase.rpc('increment_api_usage', {
    p_user_id: job.user_id,
    p_amount: 1,
  });
  await supabase.rpc('increment_agent_run_count', {
    p_agent_id: payload.agent_id,
    p_user_id: job.user_id,
  });
  return {
    run_id: job.resource_id,
    agent_version_id: version.version_id,
    agent_version_number: version.version_number,
  };
}

function incomingValue(nodeId, edges, selectedEdges, values, fallback) {
  const incoming = edges.filter(edge => edge.target === nodeId && selectedEdges.has(edge.id));
  if (!incoming.length) return fallback;
  return values.get(incoming[incoming.length - 1].source);
}

async function recordStep(runId, userId, node, sequence, input) {
  const { data, error } = await supabase
    .from('workflow_step_runs')
    .insert({
      workflow_run_id: runId,
      user_id: userId,
      node_id: node.id,
      node_type: node.type,
      sequence_number: sequence,
      status: 'running',
      input: { value: input },
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function completeStep(stepId, updates) {
  const { error } = await supabase
    .from('workflow_step_runs')
    .update({
      ...updates,
      completed_at: new Date().toISOString(),
    })
    .eq('id', stepId);
  if (error) throw error;
}

async function processWorkflowRun(job) {
  const payload = job.payload || {};
  const graph = validateWorkflowGraph(payload.nodes, payload.edges);
  if (graph.errors.length) throw new Error(graph.errors.join('; '));
  const { nodes, edges, order } = graph.value;
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const inputNode = nodes.find(node => node.type === 'input');
  const activeNodes = new Set([inputNode.id]);
  const selectedEdges = new Set();
  const values = new Map();
  let sequence = 0;
  let totalTokens = 0;

  if (job.attempt > 1) {
    await supabase
      .from('workflow_step_runs')
      .delete()
      .eq('workflow_run_id', job.resource_id)
      .eq('user_id', job.user_id);
  }
  await supabase
    .from('workflow_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.resource_id)
    .eq('user_id', job.user_id);

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId);
    sequence += 1;
    const input = node.type === 'input'
      ? payload.input
      : incomingValue(nodeId, edges, selectedEdges, values, payload.input);

    if (!activeNodes.has(nodeId)) {
      const step = await recordStep(job.resource_id, job.user_id, node, sequence, input);
      await completeStep(step.id, { status: 'skipped', output: null });
      continue;
    }
    if (await cancellationRequested(job.id)) {
      throw Object.assign(new Error('Cancelled by user'), { code: 'CANCELLED' });
    }

    const step = await recordStep(job.resource_id, job.user_id, node, sequence, input);
    const startedAt = Date.now();
    try {
      let output = input;
      let versionId = null;
      if (node.type === 'agent') {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('api_calls_used, api_calls_limit')
          .eq('id', job.user_id)
          .single();
        if (profileError) throw profileError;
        if (profile.api_calls_used >= profile.api_calls_limit) {
          throw new Error('Monthly API call limit reached');
        }
        const version = await loadAgentVersion(node.config.agent_id, job.user_id);
        const result = await executeAgent(version, String(input ?? ''), {
          timeoutSeconds: Math.min(job.timeout_seconds, 90),
        });
        if (result.status !== 'completed') {
          throw new Error(result.error_message || `Agent returned ${result.status}`);
        }
        output = result.final_answer;
        totalTokens += result.tokens_used || 0;
        versionId = version.version_id;
        await supabase.rpc('increment_api_usage', {
          p_user_id: job.user_id,
          p_amount: 1,
        });
        await supabase.rpc('increment_agent_run_count', {
          p_agent_id: node.config.agent_id,
          p_user_id: job.user_id,
        });
      } else if (node.type === 'transform') {
        output = applyTransform(input, node.config);
      } else if (node.type === 'condition') {
        output = evaluateCondition(input, node.config);
      }
      values.set(node.id, output);

      const outgoing = edges.filter(edge => edge.source === node.id);
      for (const edge of outgoing) {
        const selected = node.type !== 'condition'
          || edge.source_handle === String(Boolean(output));
        if (selected) {
          selectedEdges.add(edge.id);
          activeNodes.add(edge.target);
        }
      }
      await completeStep(step.id, {
        status: 'completed',
        output: { value: output },
        agent_version_id: versionId,
        duration_ms: Date.now() - startedAt,
      });
    } catch (error) {
      await completeStep(step.id, {
        status: 'failed',
        error_message: error.message,
        duration_ms: Date.now() - startedAt,
      });
      throw error;
    }
  }

  const outputNodes = nodes.filter(node => node.type === 'output' && activeNodes.has(node.id));
  const finalOutput = outputNodes.map(node => ({
    node_id: node.id,
    value: values.get(node.id),
  }));
  await supabase
    .from('workflow_runs')
    .update({
      status: 'completed',
      output: { outputs: finalOutput, total_tokens: totalTokens },
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.resource_id)
    .eq('user_id', job.user_id);
  return { workflow_run_id: job.resource_id, outputs: finalOutput, total_tokens: totalTokens };
}

async function markRetryOrFailure(job, error) {
  const cancelled = error.code === 'CANCELLED' || await cancellationRequested(job.id);
  if (cancelled) {
    await supabase.from('execution_jobs').update({
      status: 'cancelled',
      error_message: 'Cancelled by user',
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    }).eq('id', job.id);
    const table = job.job_type === 'agent_run' ? 'agent_runs' : 'workflow_runs';
    await supabase.from(table).update({
      status: 'cancelled',
      error_message: 'Cancelled by user',
      completed_at: new Date().toISOString(),
    }).eq('id', job.resource_id).eq('user_id', job.user_id);
    return;
  }

  const canRetry = job.attempt < job.max_attempts;
  if (canRetry) {
    const delaySeconds = Math.min(300, 5 * (2 ** Math.max(0, job.attempt - 1)));
    await supabase.from('execution_jobs').update({
      status: 'retry_wait',
      error_message: error.message.slice(0, 2000),
      run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      locked_at: null,
      locked_by: null,
    }).eq('id', job.id);
    const table = job.job_type === 'agent_run' ? 'agent_runs' : 'workflow_runs';
    await supabase.from(table).update({
      status: 'queued',
      error_message: `Retry ${job.attempt} failed: ${error.message}`.slice(0, 2000),
    }).eq('id', job.resource_id).eq('user_id', job.user_id);
    return;
  }

  await supabase.from('execution_jobs').update({
    status: 'failed',
    error_message: error.message.slice(0, 2000),
    completed_at: new Date().toISOString(),
    locked_at: null,
    locked_by: null,
  }).eq('id', job.id);
  const table = job.job_type === 'agent_run' ? 'agent_runs' : 'workflow_runs';
  await supabase.from(table).update({
    status: 'failed',
    error_message: error.message.slice(0, 2000),
    completed_at: new Date().toISOString(),
  }).eq('id', job.resource_id).eq('user_id', job.user_id);
  if (job.job_type === 'agent_run') {
    await supabase.rpc('increment_api_usage', {
      p_user_id: job.user_id,
      p_amount: 1,
    });
  }
}

export async function processNextJob() {
  const { data: job, error } = await supabase.rpc('claim_execution_job', {
    p_worker_id: WORKER_ID,
  });
  if (error) throw error;
  if (!job?.id) return false;

  try {
    const result = job.job_type === 'agent_run'
      ? await processAgentRun(job)
      : await processWorkflowRun(job);
    const cancelled = result?.cancelled;
    await supabase.from('execution_jobs').update({
      status: cancelled ? 'cancelled' : 'succeeded',
      result,
      error_message: cancelled ? 'Cancelled by user' : null,
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    }).eq('id', job.id);
  } catch (error) {
    await markRetryOrFailure(job, error);
  }
  return true;
}

export function startJobWorker() {
  let stopped = false;
  let working = false;
  const tick = async () => {
    if (stopped || working) return;
    working = true;
    try {
      while (!stopped && await processNextJob()) {
        // Drain immediately so queued work is not delayed by the next poll.
      }
    } catch (error) {
      console.error('Job worker error:', error.message);
    } finally {
      working = false;
    }
  };
  const recover = async () => {
    const { data: jobs, error } = await supabase.rpc('recover_stale_execution_jobs');
    if (error) throw error;
    for (const job of jobs || []) {
      const table = job.job_type === 'agent_run' ? 'agent_runs' : 'workflow_runs';
      await supabase.from(table).update({
        status: job.status === 'failed' ? 'failed' : 'queued',
        error_message: job.error_message,
        ...(job.status === 'failed'
          ? { completed_at: job.completed_at }
          : { completed_at: null }),
      }).eq('id', job.resource_id).eq('user_id', job.user_id);
    }
  };
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  timer.unref();
  recover().then(tick).catch(error => {
    console.error('Job recovery error:', error.message);
  });
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

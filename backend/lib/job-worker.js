import os from 'node:os';

import { executeConnector } from './connectors.js';
import { executeAgent } from './engine.js';
import {
  scoreEvaluationOutput,
  weightedEvaluationScore,
} from './evaluations.js';
import {
  estimateCostUsd,
  finishRunObservability,
  recordRunEvent,
  startRunObservability,
  structuredError,
} from './observability.js';
import {
  augmentPrompt,
  loadAgentKnowledge,
  recordAgentMemory,
} from './knowledge.js';
import { supabase } from './supabase.js';
import {
  applyTransform,
  evaluateCondition,
  validateWorkflowGraph,
} from './workflow-graph.js';
import { processMultiAgentRun } from './multi-agent-runner.js';
import { assertUsageAllowance, recordUsage } from './usage.js';

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
  await assertUsageAllowance(job.user_id, 1);
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
  const knowledge = await loadAgentKnowledge(
    payload.agent_id,
    job.user_id,
    payload.message,
    job.id,
  );
  const result = await executeAgent(version, augmentPrompt(payload.message, knowledge), {
    timeoutSeconds: job.timeout_seconds,
  });
  await recordUsage({
    userId:job.user_id,
    executionJobId:job.id,
    resourceType:'agent',
    resourceId:payload.agent_id,
    modelCalls:1,
    tokens:result.tokens_used || 0,
    estimatedCostUsd:estimateCostUsd(result.tokens_used || 0, version.model),
    idempotencyKey:`agent:${job.id}`,
    metadata:{ model:version.model, version_id:version.version_id, engine_status:result.status },
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
    citations:knowledge.citations,
    memory_context:knowledge.memory,
    tokens_used: result.tokens_used || 0,
    duration_ms: result.duration_ms || 0,
    error_message: null,
    completed_at: new Date().toISOString(),
  });
  await recordAgentMemory({
    agentId:payload.agent_id,
    userId:job.user_id,
    runId:job.resource_id,
    input:payload.message,
    output:result.final_answer,
    knowledgeBaseIds:knowledge.knowledgeBaseIds,
  });
  for (const [index, trace] of (result.run_trace || []).entries()) {
    await recordRunEvent(job, {
      event_type:'agent.trace',
      status:'completed',
      message:String(trace?.tool || trace?.name || `Agent trace ${index + 1}`),
      duration_ms:Number(trace?.duration_ms) || null,
      data:{ sequence:index + 1, trace },
    });
  }
  await supabase.rpc('increment_agent_run_count', {
    p_agent_id: payload.agent_id,
    p_user_id: job.user_id,
  });
  return {
    run_id: job.resource_id,
    agent_version_id: version.version_id,
    agent_version_number: version.version_number,
    tokens_used:result.tokens_used || 0,
    estimated_cost_usd:estimateCostUsd(result.tokens_used || 0, version.model),
    model:version.model,
    citations:knowledge.citations,
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

function serializeWorkflowState({
  activeNodes,
  selectedEdges,
  values,
  nextIndex,
  totalTokens,
  totalCost,
}) {
  return {
    active_nodes:[...activeNodes],
    selected_edges:[...selectedEdges],
    values:[...values.entries()],
    next_index:nextIndex,
    total_tokens:totalTokens,
    total_cost:totalCost,
  };
}

async function checkpointJob(jobId, payload, resumeState, { clearResolution = false } = {}) {
  const nextPayload = { ...payload, resume_state:resumeState };
  if (clearResolution) delete nextPayload.approval_resolution;
  const { error } = await supabase
    .from('execution_jobs')
    .update({ payload:nextPayload })
    .eq('id', jobId);
  if (error) throw error;
}

async function processWorkflowRun(job) {
  const payload = job.payload || {};
  const graph = validateWorkflowGraph(payload.nodes, payload.edges);
  if (graph.errors.length) throw new Error(graph.errors.join('; '));
  const { nodes, edges, order } = graph.value;
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const inputNode = nodes.find(node => node.type === 'input');
  const checkpoint = payload.resume_state || null;
  const activeNodes = new Set(checkpoint?.active_nodes || [inputNode.id]);
  const selectedEdges = new Set(checkpoint?.selected_edges || []);
  const values = new Map(checkpoint?.values || []);
  const startIndex = Number.isInteger(checkpoint?.next_index)
    ? checkpoint.next_index : 0;
  let totalTokens = Number(checkpoint?.total_tokens) || 0;
  let totalCost = Number(checkpoint?.total_cost) || 0;

  if (checkpoint) {
    let cleanup = supabase
      .from('workflow_step_runs')
      .delete()
      .eq('workflow_run_id', job.resource_id)
      .eq('user_id', job.user_id);
    cleanup = payload.approval_resolution
      ? cleanup.gt('sequence_number', startIndex + 1)
      : cleanup.gte('sequence_number', startIndex + 1);
    const { error } = await cleanup;
    if (error) throw error;
  } else if (job.attempt > 1) {
    const { error } = await supabase
      .from('workflow_step_runs')
      .delete()
      .eq('workflow_run_id', job.resource_id)
      .eq('user_id', job.user_id);
    if (error) throw error;
  }
  await supabase
    .from('workflow_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.resource_id)
    .eq('user_id', job.user_id);

  for (let index = startIndex; index < order.length; index += 1) {
    const nodeId = order[index];
    const node = nodeMap.get(nodeId);
    const sequence = index + 1;
    const input = node.type === 'input'
      ? payload.input
      : incomingValue(nodeId, edges, selectedEdges, values, payload.input);

    if (!activeNodes.has(nodeId)) {
      const step = await recordStep(job.resource_id, job.user_id, node, sequence, input);
      await completeStep(step.id, { status: 'skipped', output: null });
      await recordRunEvent(job, {
        event_type:'workflow.step.skipped',
        status:'skipped',
        message:`${node.label} skipped`,
        node_id:node.id,
        data:{ node_type:node.type, sequence },
      });
      continue;
    }
    if (await cancellationRequested(job.id)) {
      throw Object.assign(new Error('Cancelled by user'), { code: 'CANCELLED' });
    }

    const approvalResolution = payload.approval_resolution;
    if (node.type === 'approval' && approvalResolution?.node_id === node.id) {
      const { data: step, error: stepError } = await supabase
        .from('workflow_step_runs')
        .select('id')
        .eq('workflow_run_id', job.resource_id)
        .eq('user_id', job.user_id)
        .eq('node_id', node.id)
        .single();
      if (stepError || !step) throw new Error('Approval checkpoint is unavailable');
      const output = approvalResolution.output;
      values.set(node.id, output);
      for (const edge of edges.filter(edge => edge.source === node.id)) {
        selectedEdges.add(edge.id);
        activeNodes.add(edge.target);
      }
      await completeStep(step.id, {
        status:'completed',
        output:{ value:output, decision:approvalResolution.decision },
        error_message:null,
      });
      await recordRunEvent(job, {
        event_type:'workflow.approval.resolved',
        status:'completed',
        message:`${node.label} ${approvalResolution.decision}`,
        node_id:node.id,
        data:{ decision:approvalResolution.decision, approval_id:approvalResolution.approval_id },
      });
      const resumeState = serializeWorkflowState({
        activeNodes,
        selectedEdges,
        values,
        nextIndex:index + 1,
        totalTokens,
        totalCost,
      });
      await checkpointJob(job.id, payload, resumeState, { clearResolution:true });
      continue;
    }

    const step = await recordStep(job.resource_id, job.user_id, node, sequence, input);
    const startedAt = Date.now();
    await recordRunEvent(job, {
      event_type:'workflow.step.started',
      status:'running',
      message:`${node.label} started`,
      node_id:node.id,
      data:{ node_type:node.type, sequence, input },
    });
    try {
      let output = input;
      let versionId = null;
      let stepTokens = 0;
      let stepCost = 0;
      let citations = [];
      if (node.type === 'approval') {
        const timeoutMinutes = Number(node.config.timeout_minutes);
        const resumeState = serializeWorkflowState({
          activeNodes,
          selectedEdges,
          values,
          nextIndex:index,
          totalTokens,
          totalCost,
        });
        const expiresAt = new Date(Date.now() + timeoutMinutes * 60000).toISOString();
        const { data: approval, error: approvalError } = await supabase
          .from('approval_requests')
          .insert({
            user_id:job.user_id,
            workflow_id:payload.workflow_id,
            workflow_run_id:job.resource_id,
            execution_job_id:job.id,
            node_id:node.id,
            instructions:node.config.instructions || null,
            input:{ value:input },
            expires_at:expiresAt,
          })
          .select()
          .single();
        if (approvalError) throw approvalError;
        await checkpointJob(job.id, payload, resumeState);
        await supabase.from('workflow_step_runs').update({
          status:'waiting',
          output:null,
          completed_at:null,
          duration_ms:Date.now() - startedAt,
        }).eq('id', step.id);
        await supabase.from('workflow_runs').update({
          status:'waiting_approval',
          error_message:null,
        }).eq('id', job.resource_id).eq('user_id', job.user_id);
        await recordRunEvent(job, {
          event_type:'workflow.approval.requested',
          status:'waiting_approval',
          message:`${node.label} is waiting for approval`,
          node_id:node.id,
          duration_ms:Date.now() - startedAt,
          data:{ approval_id:approval.id, expires_at:expiresAt },
        });
        return {
          waiting_for_approval:true,
          approval_id:approval.id,
          workflow_run_id:job.resource_id,
          expires_at:expiresAt,
          total_tokens:totalTokens,
          estimated_cost_usd:totalCost,
        };
      } else if (node.type === 'agent') {
        await assertUsageAllowance(job.user_id, 1);
        const version = await loadAgentVersion(node.config.agent_id, job.user_id);
        const originalInput = String(input ?? '');
        const knowledge = await loadAgentKnowledge(
          node.config.agent_id,
          job.user_id,
          originalInput,
          job.id,
        );
        const result = await executeAgent(version, augmentPrompt(originalInput, knowledge), {
          timeoutSeconds: Math.min(job.timeout_seconds, 90),
        });
        stepTokens = result.tokens_used || 0;
        stepCost = estimateCostUsd(stepTokens, version.model);
        await recordUsage({
          userId:job.user_id,
          executionJobId:job.id,
          resourceType:'workflow',
          resourceId:payload.workflow_id,
          modelCalls:1,
          tokens:stepTokens,
          estimatedCostUsd:stepCost,
          idempotencyKey:`workflow:${job.id}:${node.id}`,
          metadata:{ node_id:node.id, agent_id:node.config.agent_id, model:version.model },
        });
        if (result.status !== 'completed') {
          throw new Error(result.error_message || `Agent returned ${result.status}`);
        }
        output = result.final_answer;
        totalTokens += stepTokens;
        totalCost += stepCost;
        versionId = version.version_id;
        citations = knowledge.citations;
        await recordAgentMemory({
          agentId:node.config.agent_id,
          userId:job.user_id,
          runId:null,
          input:originalInput,
          output:result.final_answer,
          knowledgeBaseIds:knowledge.knowledgeBaseIds,
        });
        await supabase.rpc('increment_agent_run_count', {
          p_agent_id: node.config.agent_id,
          p_user_id: job.user_id,
        });
      } else if (node.type === 'connector') {
        output = await executeConnector(node.config, input, job.user_id);
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
        output: { value: output, citations },
        agent_version_id: versionId,
        duration_ms: Date.now() - startedAt,
      });
      await recordRunEvent(job, {
        event_type:'workflow.step.completed',
        status:'completed',
        message:`${node.label} completed`,
        node_id:node.id,
        duration_ms:Date.now() - startedAt,
        tokens_used:stepTokens,
        estimated_cost_usd:stepCost,
        data:{ node_type:node.type, sequence, output, citations, agent_version_id:versionId },
      });
    } catch (error) {
      await completeStep(step.id, {
        status: 'failed',
        error_message: error.message,
        duration_ms: Date.now() - startedAt,
      });
      await recordRunEvent(job, {
        event_type:'workflow.step.failed',
        level:'error',
        status:'failed',
        message:`${node.label} failed`,
        node_id:node.id,
        duration_ms:Date.now() - startedAt,
        data:{ node_type:node.type, sequence, error:structuredError(error) },
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
      output: {
        outputs: finalOutput,
        total_tokens: totalTokens,
        estimated_cost_usd:totalCost,
      },
      completed_at: new Date().toISOString(),
    })
    .eq('id', job.resource_id)
    .eq('user_id', job.user_id);
  return {
    workflow_run_id:job.resource_id,
    outputs:finalOutput,
    total_tokens:totalTokens,
    estimated_cost_usd:totalCost,
  };
}

async function processEvaluationRun(job) {
  const payload = job.payload || {};
  const { data:evaluationRun, error:runError } = await supabase
    .from('evaluation_runs')
    .update({
      status:'running',
      error_message:null,
      started_at:new Date().toISOString(),
      completed_at:null,
    })
    .eq('id', job.resource_id)
    .eq('user_id', job.user_id)
    .select()
    .single();
  if (runError || !evaluationRun) throw runError || new Error('Evaluation run is unavailable');
  const { data:cases, error:caseError } = await supabase
    .from('evaluation_cases')
    .select('*')
    .eq('suite_id', payload.suite_id)
    .eq('user_id', job.user_id)
    .order('created_at');
  if (caseError) throw caseError;
  await assertUsageAllowance(job.user_id, (cases || []).length * 2);
  if (!cases?.length) throw new Error('Evaluation suite has no cases');

  const baseline = await loadAgentVersion(
    payload.agent_id,
    job.user_id,
    payload.baseline_version_id,
  );
  const candidate = await loadAgentVersion(
    payload.agent_id,
    job.user_id,
    payload.candidate_version_id,
  );
  const results = [];
  let totalTokens = 0;
  let totalCost = 0;
  for (const testCase of cases) {
    for (const [variant, version] of [['baseline', baseline], ['candidate', candidate]]) {
      if (await cancellationRequested(job.id)) {
        throw Object.assign(new Error('Cancelled by user'), { code:'CANCELLED' });
      }
      const startedAt = Date.now();
      await recordRunEvent(job, {
        event_type:'evaluation.case.started',
        status:'running',
        message:`${testCase.name} (${variant}) started`,
        data:{ case_id:testCase.id, variant, version_number:version.version_number },
      });
      let actualOutput = null;
      let score = 0;
      let passed = false;
      let tokens = 0;
      let cost = 0;
      let evaluationError = null;
      try {
        const engineResult = await executeAgent(version, testCase.input_text, {
          timeoutSeconds:Math.min(job.timeout_seconds, 120),
        });
        if (engineResult.status !== 'completed') {
          throw new Error(engineResult.error_message || `Engine returned ${engineResult.status}`);
        }
        actualOutput = String(engineResult.final_answer || '').slice(0, 50000);
        ({ score, passed } = scoreEvaluationOutput(
          actualOutput,
          testCase.expected_output,
          testCase.assertion_type,
        ));
        tokens = engineResult.tokens_used || 0;
        cost = estimateCostUsd(tokens, version.model);
      } catch (error) {
        evaluationError = structuredError(error);
      }
      await recordUsage({
        userId:job.user_id,
        executionJobId:job.id,
        resourceType:'evaluation',
        resourceId:evaluationRun.id,
        modelCalls:1,
        tokens,
        estimatedCostUsd:cost,
        idempotencyKey:`evaluation:${job.id}:${testCase.id}:${variant}`,
        metadata:{ case_id:testCase.id, variant, model:version.model },
      });
      totalTokens += tokens;
      totalCost += cost;
      const result = {
        evaluation_run_id:evaluationRun.id,
        case_id:testCase.id,
        user_id:job.user_id,
        variant,
        agent_version_id:version.version_id,
        actual_output:actualOutput,
        score,
        passed,
        tokens_used:tokens,
        duration_ms:Date.now() - startedAt,
        estimated_cost_usd:cost,
        error_message:evaluationError?.message || null,
      };
      const { error:resultError } = await supabase
        .from('evaluation_results')
        .upsert(result, { onConflict:'evaluation_run_id,case_id,variant' });
      if (resultError) throw resultError;
      results.push(result);
      await recordRunEvent(job, {
        event_type:'evaluation.case.completed',
        level:evaluationError ? 'error' : passed ? 'info' : 'warning',
        status:evaluationError ? 'failed' : 'completed',
        message:`${testCase.name} (${variant}) scored ${score}`,
        duration_ms:result.duration_ms,
        tokens_used:tokens,
        estimated_cost_usd:cost,
        data:{
          case_id:testCase.id,
          variant,
          score,
          passed,
          error:evaluationError,
          version_number:version.version_number,
        },
      });
    }
  }

  const baselineScore = weightedEvaluationScore(
    results.filter(result => result.variant === 'baseline'),
    cases,
  );
  const candidateScore = weightedEvaluationScore(
    results.filter(result => result.variant === 'candidate'),
    cases,
  );
  const gatePassed = candidateScore >= Number(evaluationRun.gate_threshold)
    && candidateScore >= baselineScore;
  const { error:updateError } = await supabase
    .from('evaluation_runs')
    .update({
      status:'completed',
      baseline_score:baselineScore,
      candidate_score:candidateScore,
      gate_passed:gatePassed,
      error_message:null,
      completed_at:new Date().toISOString(),
    })
    .eq('id', evaluationRun.id)
    .eq('user_id', job.user_id);
  if (updateError) throw updateError;
  return {
    evaluation_run_id:evaluationRun.id,
    baseline_score:baselineScore,
    candidate_score:candidateScore,
    gate_passed:gatePassed,
    total_tokens:totalTokens,
    estimated_cost_usd:Number(totalCost.toFixed(6)),
  };
}

function resourceTable(jobType) {
  if (jobType === 'agent_run') return 'agent_runs';
  if (jobType === 'workflow_run') return 'workflow_runs';
  if (jobType === 'multi_agent_run') return 'multi_agent_runs';
  return 'evaluation_runs';
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
    const table = resourceTable(job.job_type);
    await supabase.from(table).update({
      status: 'cancelled',
      error_message: 'Cancelled by user',
      completed_at: new Date().toISOString(),
    }).eq('id', job.resource_id).eq('user_id', job.user_id);
    return 'cancelled';
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
    const table = resourceTable(job.job_type);
    await supabase.from(table).update({
      status: 'queued',
      error_message: `Retry ${job.attempt} failed: ${error.message}`.slice(0, 2000),
    }).eq('id', job.resource_id).eq('user_id', job.user_id);
    return 'retry_wait';
  }

  await supabase.from('execution_jobs').update({
    status: 'failed',
    error_message: error.message.slice(0, 2000),
    completed_at: new Date().toISOString(),
    locked_at: null,
    locked_by: null,
  }).eq('id', job.id);
  const table = resourceTable(job.job_type);
  await supabase.from(table).update({
    status: 'failed',
    error_message: error.message.slice(0, 2000),
    completed_at: new Date().toISOString(),
  }).eq('id', job.resource_id).eq('user_id', job.user_id);
  return 'failed';
}

export async function processNextJob() {
  const { data: job, error } = await supabase.rpc('claim_execution_job', {
    p_worker_id: WORKER_ID,
  });
  if (error) throw error;
  if (!job?.id) return false;

  await startRunObservability(job);
  try {
    let result;
    if (job.job_type === 'agent_run') result = await processAgentRun(job);
    else if (job.job_type === 'workflow_run') result = await processWorkflowRun(job);
    else if (job.job_type === 'multi_agent_run') result = await processMultiAgentRun(job);
    else result = await processEvaluationRun(job);
    const cancelled = result?.cancelled;
    const waiting = result?.waiting_for_approval;
    const status = waiting ? 'waiting_approval' : cancelled ? 'cancelled' : 'succeeded';
    await supabase.from('execution_jobs').update({
      status,
      result,
      error_message: cancelled ? 'Cancelled by user' : null,
      completed_at: waiting ? null : new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    }).eq('id', job.id);
    await finishRunObservability(job, {
      status,
      result,
      tokens:result?.tokens_used || result?.total_tokens || 0,
      model:result?.model || null,
      estimatedCost:result?.estimated_cost_usd ?? null,
    });
  } catch (error) {
    const status = await markRetryOrFailure(job, error);
    await finishRunObservability(job, { status, error });
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
      const table = resourceTable(job.job_type);
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

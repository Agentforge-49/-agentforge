import { executeAgent } from './engine.js';
import { augmentPrompt, loadAgentKnowledge, recordAgentMemory } from './knowledge.js';
import {
  aggregateOutputs,
  parseSupervisorRoute,
  selectParallelMembers,
  selectRouterMember,
  taskSignature,
} from './multi-agent.js';
import { estimateCostUsd, recordRunEvent } from './observability.js';
import { supabase } from './supabase.js';
import { assertUsageAllowance, recordUsage } from './usage.js';

async function loadVersion(agentId, userId) {
  const { data:agent, error } = await supabase
    .from('agents')
    .select('id, name, status, published_version_id')
    .eq('id', agentId)
    .eq('user_id', userId)
    .single();
  if (error || !agent || agent.status !== 'active' || !agent.published_version_id) {
    throw new Error(`Agent ${agentId} is unavailable, paused, or unpublished`);
  }
  const { data:version, error:versionError } = await supabase
    .from('agent_versions')
    .select('*')
    .eq('id', agent.published_version_id)
    .eq('user_id', userId)
    .single();
  if (versionError || !version) throw new Error(`Agent version for ${agent.name} is unavailable`);
  return {
    ...version,
    id:agent.id,
    name:agent.name,
    version_id:version.id,
    enabled_tool_slugs:version.tool_slugs || [],
  };
}

async function isCancelled(jobId) {
  const { data } = await supabase
    .from('execution_jobs')
    .select('cancel_requested_at, status')
    .eq('id', jobId)
    .single();
  return Boolean(data?.cancel_requested_at || data?.status === 'cancelled');
}

function timeoutRemaining(deadline) {
  return Math.max(5, Math.floor((deadline - Date.now()) / 1000));
}

export async function processMultiAgentRun(job) {
  const { data:system, error:systemError } = await supabase
    .from('multi_agent_systems')
    .select(`
      *,
      multi_agent_members(
        agent_id, role, route_keywords, position,
        agents(name, status, published_version_id)
      )
    `)
    .eq('id', job.payload?.system_id)
    .eq('user_id', job.user_id)
    .single();
  if (systemError || !system) throw systemError || new Error('Multi-agent system is unavailable');
  if (system.status !== 'active') throw new Error('Multi-agent system was paused before execution');
  const members = (system.multi_agent_members || [])
    .filter(member => member.agents?.status === 'active' && member.agents?.published_version_id)
    .sort((left, right) => left.position - right.position);
  if (!members.length) throw new Error('Multi-agent system has no available workers');

  await assertUsageAllowance(job.user_id, system.max_delegations);

  const startedAt = Date.now();
  const deadline = startedAt + Math.min(job.timeout_seconds, system.timeout_seconds) * 1000;
  const state = {
    delegations:0,
    maximumDepth:0,
    tokens:0,
    cost:0,
    signatures:new Set(),
    taskOrder:0,
  };
  await supabase.from('multi_agent_runs').update({
    status:'running',
    error_message:null,
    started_at:new Date().toISOString(),
    completed_at:null,
  }).eq('id', job.resource_id).eq('user_id', job.user_id);

  const prepareTask = async (agentId, input, depth, reason, purpose, parentTaskId = null) => {
    if (await isCancelled(job.id)) {
      throw Object.assign(new Error('Cancelled by user'), { code:'CANCELLED' });
    }
    if (Date.now() >= deadline) {
      throw Object.assign(new Error('Multi-agent execution exceeded its deadline'), {
        code:'EXECUTION_TIMEOUT',
      });
    }
    if (depth > system.max_depth) throw new Error('Maximum delegation depth reached');
    if (state.delegations >= system.max_delegations) throw new Error('Delegation limit reached');
    const signature = taskSignature(agentId, input, depth, purpose);
    if (state.signatures.has(signature)) {
      throw Object.assign(new Error('Delegation loop prevented'), { code:'DELEGATION_LOOP' });
    }
    state.signatures.add(signature);
    state.delegations += 1;
    state.maximumDepth = Math.max(state.maximumDepth, depth);
    state.taskOrder += 1;
    const { data:task, error } = await supabase
      .from('multi_agent_tasks')
      .insert({
        multi_agent_run_id:job.resource_id,
        user_id:job.user_id,
        parent_task_id:parentTaskId,
        agent_id:agentId,
        task_order:state.taskOrder,
        depth,
        task_signature:signature,
        input_text:String(input).slice(0, 50000),
        routing_reason:String(reason || '').slice(0, 500) || null,
      })
      .select()
      .single();
    if (error) throw error;
    return task;
  };

  const runPrepared = async task => {
    const taskStart = Date.now();
    try {
      const version = await loadVersion(task.agent_id, job.user_id);
      const knowledge = await loadAgentKnowledge(
        task.agent_id,
        job.user_id,
        task.input_text,
        job.id,
      );
      const result = await executeAgent(version, augmentPrompt(task.input_text, knowledge), {
        timeoutSeconds:timeoutRemaining(deadline),
      });
      const tokens = Number(result.tokens_used) || 0;
      const cost = estimateCostUsd(tokens, version.model);
      await recordUsage({
        userId:job.user_id,
        executionJobId:job.id,
        resourceType:'multi_agent',
        resourceId:job.resource_id,
        modelCalls:1,
        tokens,
        estimatedCostUsd:cost,
        idempotencyKey:`multi-agent:${job.id}:${task.id}`,
        metadata:{
          task_id:task.id,
          agent_id:task.agent_id,
          depth:task.depth,
          model:version.model,
          engine_status:result.status,
        },
      });
      if (result.status !== 'completed') {
        throw new Error(result.error_message || `Agent returned ${result.status}`);
      }
      state.tokens += tokens;
      state.cost += cost;
      const { error:updateError } = await supabase.from('multi_agent_tasks').update({
        status:'completed',
        output_text:result.final_answer,
        tokens_used:tokens,
        estimated_cost_usd:cost,
        duration_ms:Date.now() - taskStart,
        completed_at:new Date().toISOString(),
      }).eq('id', task.id).eq('user_id', job.user_id);
      if (updateError) throw updateError;
      await recordAgentMemory({
        agentId:task.agent_id,
        userId:job.user_id,
        runId:null,
        input:task.input_text,
        output:result.final_answer,
        knowledgeBaseIds:knowledge.knowledgeBaseIds,
      });
      await supabase.rpc('increment_agent_run_count', {
        p_agent_id:task.agent_id,
        p_user_id:job.user_id,
      });
      await recordRunEvent(job, {
        event_type:'multi_agent.task.completed',
        status:'completed',
        message:`${version.name} completed delegated task`,
        duration_ms:Date.now() - taskStart,
        tokens_used:tokens,
        estimated_cost_usd:cost,
        data:{
          task_id:task.id,
          agent_id:task.agent_id,
          depth:task.depth,
          citations:knowledge.citations,
        },
      });
      return {
        taskId:task.id,
        agentId:task.agent_id,
        agentName:version.name,
        output:result.final_answer,
        tokens,
        cost,
      };
    } catch (error) {
      await supabase.from('multi_agent_tasks').update({
        status:error.code === 'CANCELLED' ? 'cancelled' : 'failed',
        error_message:String(error.message).slice(0, 2000),
        duration_ms:Date.now() - taskStart,
        completed_at:new Date().toISOString(),
      }).eq('id', task.id).eq('user_id', job.user_id);
      await recordRunEvent(job, {
        event_type:'multi_agent.task.failed',
        level:'error',
        status:'failed',
        message:String(error.message),
        duration_ms:Date.now() - taskStart,
        data:{ task_id:task.id, agent_id:task.agent_id, depth:task.depth },
      });
      throw error;
    }
  };

  const runBatch = async prepared => {
    const settled = await Promise.allSettled(prepared.map(runPrepared));
    const successes = settled.filter(item => item.status === 'fulfilled').map(item => item.value);
    if (!successes.length) {
      const failure = settled.find(item => item.status === 'rejected');
      throw failure?.reason || new Error('Every delegated task failed');
    }
    return successes;
  };

  let workerPlans = [];
  let supervisorRouteTask = null;
  if (system.strategy === 'router') {
    const selected = selectRouterMember(members, job.payload.input);
    workerPlans = [{ member:selected.member, input:job.payload.input, reason:selected.reason }];
  } else if (system.strategy === 'parallel') {
    workerPlans = selectParallelMembers(
      members,
      system.max_parallel,
      system.max_delegations,
    ).map(member => ({
      member,
      input:job.payload.input,
      reason:'Selected for bounded parallel execution',
    }));
  } else {
    supervisorRouteTask = await prepareTask(
      system.supervisor_agent_id,
      `${system.supervisor_prompt || 'Route this request to the best workers.'}

Return only JSON: {"selected_agent_ids":["uuid"],"instructions":{"uuid":"specific task"}}.
Choose at most ${Math.min(system.max_parallel, system.max_delegations - 1)} workers.
Available workers:
${members.map(member => `- ${member.agent_id}: ${member.agents?.name}; keywords=${member.route_keywords.join(', ')}`).join('\n')}

User request:
${job.payload.input}`,
      0,
      'Supervisor routing',
      'route',
    );
    const routing = await runPrepared(supervisorRouteTask);
    let selected = parseSupervisorRoute(
      routing.output,
      members,
      system.max_parallel,
      system.max_delegations - state.delegations,
    );
    if (!selected.length && state.delegations < system.max_delegations) {
      const fallback = selectRouterMember(members, job.payload.input);
      selected = [{ agentId:fallback.member.agent_id, instructions:null }];
    }
    workerPlans = selected.map(item => ({
      member:members.find(member => member.agent_id === item.agentId),
      input:item.instructions
        ? `${item.instructions}\n\nOriginal request:\n${job.payload.input}`
        : job.payload.input,
      reason:'Selected by supervisor',
    }));
  }

  const preparedWorkers = [];
  for (const plan of workerPlans) {
    if (!plan.member || state.delegations >= system.max_delegations) break;
    preparedWorkers.push(await prepareTask(
      plan.member.agent_id,
      plan.input,
      system.strategy === 'supervisor' ? 1 : 0,
      plan.reason,
      'work',
      supervisorRouteTask?.id || null,
    ));
  }
  const workerOutputs = await runBatch(preparedWorkers);
  let output;
  if (
    system.aggregation_strategy === 'supervisor'
    && system.supervisor_agent_id
    && state.delegations < system.max_delegations
    && state.maximumDepth < system.max_depth
  ) {
    const aggregationInput = `${system.supervisor_prompt || 'Synthesize the best final response.'}

Original request:
${job.payload.input}

Worker outputs:
${aggregateOutputs('concatenate', workerOutputs)}

Return one final answer.`;
    const aggregateTask = await prepareTask(
      system.supervisor_agent_id,
      aggregationInput,
      state.maximumDepth + 1,
      'Supervisor aggregation',
      'aggregate',
      supervisorRouteTask?.id || null,
    );
    output = (await runPrepared(aggregateTask)).output;
  } else {
    output = aggregateOutputs(system.aggregation_strategy, workerOutputs);
  }

  const completedAt = new Date().toISOString();
  const { error:updateError } = await supabase.from('multi_agent_runs').update({
    status:'completed',
    output_text:output,
    delegation_count:state.delegations,
    maximum_depth:state.maximumDepth,
    total_tokens:state.tokens,
    estimated_cost_usd:Number(state.cost.toFixed(6)),
    error_message:null,
    completed_at:completedAt,
  }).eq('id', job.resource_id).eq('user_id', job.user_id);
  if (updateError) throw updateError;
  return {
    multi_agent_run_id:job.resource_id,
    output,
    delegation_count:state.delegations,
    maximum_depth:state.maximumDepth,
    total_tokens:state.tokens,
    estimated_cost_usd:Number(state.cost.toFixed(6)),
  };
}

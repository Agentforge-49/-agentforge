import crypto from 'node:crypto';
import { Router } from 'express';

import {
  copilotSystemPrompt,
  fastestCopilotModel,
  instantCopilotAnswer,
  loadCopilotContext,
  localCopilotAnswer,
  responseChunks,
  sseEvent,
  workflowProposalFor,
} from '../lib/copilot.js';
import { executeAgent } from '../lib/engine.js';
import { MODEL_CATALOG } from '../lib/model-catalog.js';
import { estimateCostUsd } from '../lib/observability.js';
import { plainAssistantText } from '../lib/site-assistant.js';
import { supabase } from '../lib/supabase.js';
import { assertUsageAllowance, recordUsage } from '../lib/usage.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function cleanTitle(value, fallback = 'New conversation') {
  const title = typeof value === 'string' ? value.trim() : '';
  return (title || fallback).slice(0, 120);
}

async function ownedThread(id, userId) {
  const { data, error } = await supabase.from('copilot_threads').select('*')
    .eq('id', id).eq('user_id', userId).single();
  return error ? null : data;
}

async function chatAgentConfig(thread, userId) {
  if (thread.mode !== 'agent_chat' || !thread.agent_id) return null;
  const { data:agent, error } = await supabase.from('agents')
    .select('id, name, status, published_version_id').eq('id', thread.agent_id)
    .eq('user_id', userId).single();
  if (error || !agent || agent.status !== 'active' || !agent.published_version_id) {
    throw new Error('The selected agent is unavailable or unpublished');
  }
  const { data:version, error:versionError } = await supabase.from('agent_versions')
    .select('*').eq('id', agent.published_version_id).eq('agent_id', agent.id)
    .eq('user_id', userId).single();
  if (versionError || !version) throw new Error('The selected agent version is unavailable');
  return { ...version, id:agent.id, name:agent.name, enabled_tool_slugs:version.tool_slugs || [] };
}

router.get('/threads', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('copilot_threads')
      .select('id, title, mode, agent_id, status, created_at, updated_at')
      .eq('user_id', req.userId).order('updated_at', { ascending:false }).limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (error) { next(error); }
});

router.post('/threads', async (req, res, next) => {
  try {
    const mode = req.body?.mode === 'agent_chat' ? 'agent_chat' : 'copilot';
    const agentId = mode === 'agent_chat' ? String(req.body?.agent_id || '') : null;
    if (mode === 'agent_chat' && !agentId) return res.status(400).json({ error:'Choose an agent for agent chat' });
    if (agentId) {
      const { count, error } = await supabase.from('agents').select('id', { count:'exact', head:true })
        .eq('id', agentId).eq('user_id', req.userId);
      if (error) throw error;
      if (!count) return res.status(400).json({ error:'Agent is unavailable' });
    }
    const { data, error } = await supabase.from('copilot_threads').insert({
      user_id:req.userId, title:cleanTitle(req.body?.title), mode, agent_id:agentId,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

router.get('/threads/:id', async (req, res, next) => {
  try {
    const thread = await ownedThread(req.params.id, req.userId);
    if (!thread) return res.status(404).json({ error:'Conversation not found' });
    const [messages, proposals] = await Promise.all([
      supabase.from('copilot_messages').select('*').eq('thread_id', thread.id)
        .eq('user_id', req.userId).order('created_at', { ascending:true }).limit(300),
      supabase.from('copilot_action_proposals').select('*').eq('thread_id', thread.id)
        .eq('user_id', req.userId).order('created_at', { ascending:true }).limit(100),
    ]);
    if (messages.error) throw messages.error;
    if (proposals.error) throw proposals.error;
    res.json({ ...thread, messages:messages.data || [], proposals:proposals.data || [] });
  } catch (error) { next(error); }
});

router.patch('/threads/:id', async (req, res, next) => {
  try {
    const update = {};
    if (Object.hasOwn(req.body || {}, 'title')) update.title = cleanTitle(req.body.title);
    if (['active', 'archived'].includes(req.body?.status)) update.status = req.body.status;
    if (!Object.keys(update).length) return res.status(400).json({ error:'No supported changes supplied' });
    const { data, error } = await supabase.from('copilot_threads').update(update)
      .eq('id', req.params.id).eq('user_id', req.userId).select().single();
    if (error || !data) return res.status(404).json({ error:'Conversation not found' });
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/threads/:id/messages', async (req, res, next) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (message.length < 2 || message.length > 4000) {
    return res.status(400).json({ error:'Message must be between 2 and 4,000 characters' });
  }
  try {
    const thread = await ownedThread(req.params.id, req.userId);
    if (!thread) return res.status(404).json({ error:'Conversation not found' });
    const { data:userMessage, error:userError } = await supabase.from('copilot_messages').insert({
      thread_id:thread.id, user_id:req.userId, role:'user', content:message,
    }).select().single();
    if (userError) throw userError;
    if (thread.title === 'New conversation') {
      await supabase.from('copilot_threads').update({ title:cleanTitle(message) })
        .eq('id', thread.id).eq('user_id', req.userId);
    } else {
      await supabase.from('copilot_threads').update({ updated_at:new Date().toISOString() })
        .eq('id', thread.id).eq('user_id', req.userId);
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(sseEvent('meta', { thread_id:thread.id, message_id:userMessage.id, state:'understanding' }));

    const [context, historyResult, model, selectedAgent] = await Promise.all([
      loadCopilotContext(req.userId),
      supabase.from('copilot_messages').select('role, content').eq('thread_id', thread.id)
        .eq('user_id', req.userId).order('created_at', { ascending:false }).limit(12),
      fastestCopilotModel(req.body?.model),
      chatAgentConfig(thread, req.userId),
    ]);
    if (historyResult.error) throw historyResult.error;
    const instantAnswer = thread.mode === 'copilot' ? instantCopilotAnswer(message, context) : null;
    if (!instantAnswer) await assertUsageAllowance(req.userId, 1);
    const effectiveModel = instantAnswer ? 'agentforge-instant' : (selectedAgent?.model || model);
    res.write(sseEvent('meta', { state:'answering', model:effectiveModel, mode:thread.mode, route:instantAnswer ? 'workspace' : 'model' }));
    const history = (historyResult.data || []).reverse().map(item => `${item.role.toUpperCase()}: ${item.content}`).join('\n');
    let result;
    if (instantAnswer) {
      result = { status:'completed', final_answer:instantAnswer, provider:'agentforge', tokens_used:0 };
    } else {
      try {
        result = await executeAgent(selectedAgent || {
          id:'agentforge-copilot', name:'AgentForge Copilot',
          system_prompt:copilotSystemPrompt(context), personality:'direct and expert', model,
          temperature:0.2, max_tokens:1200, enabled_tool_slugs:[],
        }, history, { timeoutSeconds:45 });
      } catch (providerError) {
        result = { status:'failed', error_message:providerError.message, error_code:'COPILOT_PROVIDER_ERROR' };
      }
    }
    const usedFallback = result.status !== 'completed' || !result.final_answer;
    const answer = plainAssistantText(usedFallback
      ? localCopilotAnswer(message, context) : result.final_answer).slice(0, 6000);
    const { data:assistantMessage, error:assistantError } = await supabase.from('copilot_messages').insert({
      thread_id:thread.id, user_id:req.userId, role:'assistant', content:answer,
      generation:{ model:effectiveModel, provider:result.provider || MODEL_CATALOG[effectiveModel]?.provider, tokens_used:result.tokens_used || 0, fallback:usedFallback },
    }).select().single();
    if (assistantError) throw assistantError;
    if (!instantAnswer) {
      await recordUsage({
        userId:req.userId, resourceType:'adjustment', modelCalls:usedFallback ? 0 : 1,
        tokens:result.tokens_used || 0, estimatedCostUsd:estimateCostUsd(result.tokens_used, effectiveModel),
        idempotencyKey:`copilot:${userMessage.id}`, metadata:{ operation:thread.mode, model:effectiveModel, agent_id:selectedAgent?.id || null },
      });
    }
    for (const chunk of responseChunks(answer)) res.write(sseEvent('delta', { text:chunk }));

    let proposal = null;
    const proposed = thread.mode === 'copilot' ? workflowProposalFor(message, context) : null;
    if (proposed) {
      const inserted = await supabase.from('copilot_action_proposals').insert({
        ...proposed, thread_id:thread.id, message_id:assistantMessage.id, user_id:req.userId,
        idempotency_key:`copilot-proposal:${userMessage.id}`,
      }).select().single();
      if (inserted.error) throw inserted.error;
      proposal = inserted.data;
      res.write(sseEvent('proposal', proposal));
    }
    res.write(sseEvent('done', { message:assistantMessage, proposal, fallback:usedFallback }));
    res.end();
  } catch (error) {
    if (res.headersSent) {
      res.write(sseEvent('error', { error:error.message || 'Copilot is temporarily unavailable', code:error.code || 'COPILOT_ERROR' }));
      res.end();
      return;
    }
    next(error);
  }
});

router.post('/proposals/:id/apply', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('apply_copilot_workflow_proposal', {
      p_user_id:req.userId, p_proposal_id:req.params.id,
    });
    if (error) return res.status(/not found/i.test(error.message) ? 404 : 409).json({ error:error.message });
    if (data?.status === 'expired') return res.status(409).json({ error:'Proposal has expired' });
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/proposals/:id/reject', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('copilot_action_proposals')
      .update({ status:'rejected' }).eq('id', req.params.id).eq('user_id', req.userId)
      .eq('status', 'pending').select().single();
    if (error || !data) return res.status(404).json({ error:'Pending proposal not found' });
    res.json(data);
  } catch (error) { next(error); }
});

export default router;

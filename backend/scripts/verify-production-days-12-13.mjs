import assert from 'node:assert/strict';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { loadAgentKnowledge } from '../lib/knowledge.js';

dotenv.config();

const apiBase = process.env.PRODUCTION_API_URL || 'https://agentforge-api-yml4.onrender.com';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Supabase production configuration is missing');

const admin = createClient(supabaseUrl, serviceKey, {
  auth:{ persistSession:false, autoRefreshToken:false },
});
const testName = `production-days-12-13-${Date.now()}`;
const baseIds = [];
const systemIds = [];
const agentIds = [];
const jobIds = [];
let accessToken = null;
let report = null;

async function api(path, { method = 'GET', body, expectedStatus } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers:{
      Authorization:`Bearer ${accessToken}`,
      ...(body ? { 'Content-Type':'application/json' } : {}),
    },
    body:body ? JSON.stringify(body) : undefined,
    signal:AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({}));
  if (expectedStatus) {
    assert.equal(response.status, expectedStatus, `${method} ${path} returned ${response.status}`);
    return payload;
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${payload.error || 'unknown error'}`);
  }
  return payload;
}

async function authenticate() {
  const { data:profiles, error:profileError } = await admin.from('profiles').select('id').limit(100);
  if (profileError) throw profileError;
  const profileIds = new Set((profiles || []).map(profile => profile.id));
  const { data:userPage, error:userError } = await admin.auth.admin.listUsers({ page:1, perPage:100 });
  if (userError) throw userError;
  const user = userPage.users.find(item => item.email && profileIds.has(item.id));
  if (!user) throw new Error('No testable production user exists');
  const { data:link, error:linkError } = await admin.auth.admin.generateLink({
    type:'magiclink',
    email:user.email,
  });
  if (linkError) throw linkError;
  const authClient = createClient(supabaseUrl, serviceKey, {
    auth:{ persistSession:false, autoRefreshToken:false },
  });
  const { data:session, error:sessionError } = await authClient.auth.verifyOtp({
    token_hash:link.properties.hashed_token,
    type:'magiclink',
  });
  if (sessionError || !session.session?.access_token) {
    throw sessionError || new Error('Production session could not be created');
  }
  accessToken = session.session.access_token;
  return user;
}

async function remove(table, ids) {
  if (!ids.length) return;
  const { error } = await admin.from(table).delete().in('id', ids);
  if (error) throw error;
}

async function cleanup() {
  await remove('multi_agent_systems', systemIds);
  await remove('knowledge_bases', baseIds);
  await remove('execution_jobs', jobIds);
  await remove('agents', agentIds);
  const checks = await Promise.all([
    admin.from('knowledge_bases').select('id', { count:'exact', head:true }).eq('name', testName),
    admin.from('multi_agent_systems').select('id', { count:'exact', head:true }).eq('name', testName),
    admin.from('agents').select('id', { count:'exact', head:true }).like('name', `${testName}%`),
  ]);
  for (const check of checks) {
    if (check.error) throw check.error;
    assert.equal(check.count, 0);
  }
}

try {
  const user = await authenticate();
  const base = await api('/api/knowledge', {
    method:'POST',
    body:{
      name:testName,
      description:'Temporary cost-free knowledge verification',
      retention_days:30,
      memory_enabled:true,
    },
  });
  baseIds.push(base.id);
  const document = await api(`/api/knowledge/${base.id}/documents`, {
    method:'POST',
    body:{
      title:'AgentForge launch policy',
      content:'The AgentForge launch color is ultraviolet. Customer refunds complete in five business days.',
      source_type:'manual',
    },
  });
  assert.equal(document.status, 'ready');
  assert(document.chunk_count >= 1);
  const search = await api(`/api/knowledge/${base.id}/search`, {
    method:'POST',
    body:{ query:'What is the launch color?', top_k:5 },
  });
  assert(search.citations.length >= 1);
  assert.equal(search.citations[0].title, 'AgentForge launch policy');
  assert.match(search.context, /\[1\]/);

  const createPublishedAgent = async suffix => {
    const agent = await api('/api/agents', {
      method:'POST',
      body:{
        name:`${testName}-${suffix}`,
        description:'Temporary multi-agent verification worker',
        category:'other',
        system_prompt:'Respond concisely.',
        personality:'professional',
        model:'claude-sonnet-4-6',
        temperature:0,
        max_tokens:64,
        tool_slugs:[],
      },
    });
    agentIds.push(agent.id);
    await api(`/api/agents/${agent.id}/publish`, {
      method:'POST',
      body:{ change_summary:'Cost-free structure verification' },
    });
    return agent;
  };
  const workerOne = await createPublishedAgent('research');
  const workerTwo = await createPublishedAgent('support');
  await api(`/api/knowledge/${base.id}/bind-agent`, {
    method:'POST',
    body:{ agent_id:workerOne.id },
  });
  const bases = await api('/api/knowledge');
  const foundBase = bases.find(item => item.id === base.id);
  assert(foundBase?.bound_agents.some(agent => agent.id === workerOne.id));

  const { error:memoryError } = await admin.from('memory_entries').insert({
    knowledge_base_id:base.id,
    user_id:user.id,
    scope_type:'agent',
    scope_id:workerOne.id,
    role:'user',
    content:'Remember this temporary preference.',
  });
  if (memoryError) throw memoryError;
  const memory = await api(`/api/knowledge/${base.id}/memory`);
  assert.equal(memory.length, 1);
  const agentKnowledge = await loadAgentKnowledge(
    workerOne.id,
    user.id,
    'What is the launch color?',
  );
  assert(agentKnowledge.citations.length >= 1);
  assert.equal(agentKnowledge.memory.length, 1);
  await api(`/api/knowledge/${base.id}/memory`, { method:'DELETE' });
  assert.equal((await api(`/api/knowledge/${base.id}/memory`)).length, 0);

  const expiredHash = 'f'.repeat(64);
  const { error:expiredError } = await admin.from('knowledge_documents').insert({
    knowledge_base_id:base.id,
    user_id:user.id,
    title:'Expired test document',
    source_type:'manual',
    content_hash:expiredHash,
    character_count:10,
    status:'ready',
    expires_at:new Date(Date.now() - 60000).toISOString(),
  });
  if (expiredError) throw expiredError;
  const { data:purged, error:purgeError } = await admin.rpc('purge_expired_knowledge');
  if (purgeError) throw purgeError;
  assert(purged.documents_deleted >= 1);

  const system = await api('/api/multi-agents', {
    method:'POST',
    body:{
      name:testName,
      description:'Temporary bounded team verification',
      strategy:'router',
      aggregation_strategy:'concatenate',
      max_delegations:3,
      max_parallel:2,
      max_depth:2,
      timeout_seconds:60,
      members:[
        { agent_id:workerOne.id, route_keywords:['research', 'facts'] },
        { agent_id:workerTwo.id, route_keywords:['support', 'customer'] },
      ],
    },
  });
  systemIds.push(system.id);
  assert.equal(system.status, 'draft');
  assert.equal(system.members.length, 2);
  await api(`/api/multi-agents/${system.id}/activate`, { method:'POST' });
  const listed = await api('/api/multi-agents');
  const foundSystem = listed.find(item => item.id === system.id);
  assert.equal(foundSystem?.status, 'active');
  assert.equal(foundSystem?.members[0].route_keywords[0], 'research');
  await api(`/api/multi-agents/${system.id}/pause`, { method:'POST' });
  const blocked = await api(`/api/multi-agents/${system.id}/run`, {
    method:'POST',
    body:{ input:'This must not execute', idempotency_key:`${testName}-blocked` },
    expectedStatus:409,
  });
  assert.match(blocked.error, /active/i);

  const invalidSupervisor = await api('/api/multi-agents', {
    method:'POST',
    body:{
      name:`${testName}-invalid`,
      strategy:'supervisor',
      aggregation_strategy:'concatenate',
      max_delegations:1,
      members:[{ agent_id:workerOne.id }],
    },
    expectedStatus:400,
  });
  assert.match(invalidSupervisor.error, /supervisor|delegation/i);

  report = {
    user_id:user.id,
    knowledge:{
      documents:1,
      chunks:document.chunk_count,
      citations:search.citations.length,
      memory_controls:true,
      retention_purge:true,
    },
    multi_agent:{
      systems:1,
      workers:2,
      activation:true,
      paused_run_blocked:true,
      guardrail_validation:true,
      model_calls:0,
    },
  };
} finally {
  await cleanup();
}

console.log(JSON.stringify(report, null, 2));

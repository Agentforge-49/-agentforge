import { supabase } from './supabase.js';

const MAX_CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 150;

export function chunkDocument(rawContent, {
  maxChars = MAX_CHUNK_CHARS,
  overlap = CHUNK_OVERLAP,
} = {}) {
  const content = String(rawContent || '').replace(/\r\n/g, '\n').trim();
  if (!content) return [];
  if (maxChars < 200 || maxChars > 5000) throw new Error('Invalid chunk size');
  if (overlap < 0 || overlap >= maxChars) throw new Error('Invalid chunk overlap');

  const paragraphs = content.split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  const flush = () => {
    if (!current.trim()) return;
    chunks.push(current.trim());
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
      if (candidate.length <= maxChars) {
        current = candidate;
        continue;
      }
      flush();
      current = paragraph;
      continue;
    }

    flush();
    let cursor = 0;
    while (cursor < paragraph.length) {
      let end = Math.min(cursor + maxChars, paragraph.length);
      if (end < paragraph.length) {
        const boundary = Math.max(
          paragraph.lastIndexOf('. ', end),
          paragraph.lastIndexOf('! ', end),
          paragraph.lastIndexOf('? ', end),
          paragraph.lastIndexOf(' ', end),
        );
        if (boundary > cursor + Math.floor(maxChars * 0.55)) {
          end = Math.min(end, boundary + 1);
        }
      }
      chunks.push(paragraph.slice(cursor, end).trim());
      if (end >= paragraph.length) break;
      cursor = Math.max(end - overlap, cursor + 1);
    }
  }
  flush();
  if (chunks.length > 5000) throw new Error('Document produces more than 5,000 chunks');
  return chunks.map((contentValue, index) => ({
    chunk_index:index,
    content:contentValue,
    token_estimate:Math.ceil(contentValue.length / 4),
  }));
}

export function formatKnowledgeContext(citations = []) {
  return citations.map((citation, index) => {
    const number = citation.citation_number || index + 1;
    return `[${number}] ${citation.title}\n${citation.content}`;
  }).join('\n\n');
}

function lexicalScore(content, queryTerms) {
  const normalized = content.toLowerCase();
  return queryTerms.reduce((score, term) => {
    const matches = normalized.split(term).length - 1;
    return score + Math.min(matches, 5);
  }, 0);
}

function citationFromRow(row, index) {
  return {
    citation_number:index + 1,
    knowledge_base_id:row.knowledge_base_id,
    document_id:row.document_id,
    chunk_id:row.chunk_id || row.id,
    title:row.document_title || row.title || row.knowledge_documents?.title || 'Untitled document',
    source_uri:row.source_uri || row.knowledge_documents?.source_uri || null,
    content:row.content,
    excerpt:String(row.content || '').slice(0, 320),
    rank:Number(row.rank) || 0,
  };
}

export async function retrieveKnowledge(userId, knowledgeBaseIds, query, {
  topK = 6,
  executionJobId = null,
} = {}) {
  const cleanQuery = String(query || '').trim();
  const baseIds = [...new Set((knowledgeBaseIds || []).filter(Boolean))];
  const limit = Math.max(1, Math.min(Number(topK) || 6, 10));
  if (!cleanQuery || !baseIds.length) return { context:'', citations:[] };

  const { data:ownedBases, error:baseError } = await supabase
    .from('knowledge_bases')
    .select('id')
    .eq('user_id', userId)
    .in('id', baseIds);
  if (baseError) throw baseError;
  const ownedIds = (ownedBases || []).map(base => base.id);
  if (!ownedIds.length) return { context:'', citations:[] };

  const { data:ranked, error:searchError } = await supabase.rpc(
    'search_knowledge_chunks',
    {
      p_user_id:userId,
      p_knowledge_base_ids:ownedIds,
      p_query:cleanQuery,
      p_limit:limit,
    },
  );
  if (searchError) throw searchError;
  let rows = ranked || [];

  if (!rows.length) {
    const terms = cleanQuery.toLowerCase().match(/[a-z0-9]{2,}/g) || [];
    if (terms.length) {
      const { data:fallback, error:fallbackError } = await supabase
        .from('knowledge_chunks')
        .select('id, document_id, knowledge_base_id, content, knowledge_documents!inner(title, source_uri, status)')
        .eq('user_id', userId)
        .in('knowledge_base_id', ownedIds)
        .eq('knowledge_documents.status', 'ready')
        .limit(250);
      if (fallbackError) throw fallbackError;
      rows = (fallback || [])
        .map(row => ({ ...row, rank:lexicalScore(row.content, terms) }))
        .filter(row => row.rank > 0)
        .sort((left, right) => right.rank - left.rank)
        .slice(0, limit);
    }
  }

  const citations = rows.slice(0, limit).map(citationFromRow);
  const { error:eventError } = await supabase
    .from('knowledge_retrieval_events')
    .insert({
      knowledge_base_id:ownedIds[0],
      user_id:userId,
      execution_job_id:executionJobId,
      query:cleanQuery,
      result_count:citations.length,
      citation_ids:citations.map(item => item.chunk_id),
    });
  if (eventError) throw eventError;
  return { context:formatKnowledgeContext(citations), citations };
}

export async function loadAgentKnowledge(agentId, userId, query, executionJobId = null) {
  const { data:bindings, error:bindingError } = await supabase
    .from('agent_knowledge_bases')
    .select('knowledge_base_id, knowledge_bases!inner(memory_enabled)')
    .eq('agent_id', agentId)
    .eq('user_id', userId);
  if (bindingError) throw bindingError;
  const baseIds = (bindings || []).map(binding => binding.knowledge_base_id);
  const retrieval = await retrieveKnowledge(userId, baseIds, query, {
    topK:6,
    executionJobId,
  });
  const memoryBaseIds = (bindings || [])
    .filter(binding => binding.knowledge_bases?.memory_enabled)
    .map(binding => binding.knowledge_base_id);
  let memory = [];
  if (memoryBaseIds.length) {
    const { data, error } = await supabase
      .from('memory_entries')
      .select('id, knowledge_base_id, role, content, importance, created_at, expires_at')
      .eq('user_id', userId)
      .in('knowledge_base_id', memoryBaseIds)
      .or(`scope_type.eq.general,and(scope_type.eq.agent,scope_id.eq.${agentId})`)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('importance', { ascending:false })
      .order('created_at', { ascending:false })
      .limit(12);
    if (error) throw error;
    memory = (data || []).reverse();
  }
  return { ...retrieval, memory, knowledgeBaseIds:baseIds };
}

export function augmentPrompt(message, knowledge) {
  const sections = [];
  if (knowledge?.context) {
    sections.push(
      'Use the following retrieved knowledge when relevant. Cite it using [1], [2], and so on. '
      + 'Never invent citations.\n\n'
      + knowledge.context,
    );
  }
  if (knowledge?.memory?.length) {
    sections.push(
      'Relevant retained memory:\n'
      + knowledge.memory.map(item => `${item.role}: ${item.content}`).join('\n'),
    );
  }
  if (!sections.length) return String(message || '');
  return `${sections.join('\n\n')}\n\nCurrent request:\n${String(message || '')}`;
}

export async function recordAgentMemory({
  agentId,
  userId,
  runId,
  input,
  output,
  knowledgeBaseIds,
}) {
  if (!knowledgeBaseIds?.length) return;
  const { data:bases, error } = await supabase
    .from('knowledge_bases')
    .select('id, retention_days, memory_enabled')
    .eq('user_id', userId)
    .in('id', knowledgeBaseIds)
    .eq('memory_enabled', true);
  if (error) throw error;
  const entries = [];
  for (const base of bases || []) {
    const expiresAt = base.retention_days
      ? new Date(Date.now() + base.retention_days * 86400000).toISOString()
      : null;
    entries.push(
      {
        knowledge_base_id:base.id,
        user_id:userId,
        scope_type:'agent',
        scope_id:agentId,
        source_run_id:runId,
        role:'user',
        content:String(input).slice(0, 20000),
        expires_at:expiresAt,
      },
      {
        knowledge_base_id:base.id,
        user_id:userId,
        scope_type:'agent',
        scope_id:agentId,
        source_run_id:runId,
        role:'assistant',
        content:String(output).slice(0, 20000),
        expires_at:expiresAt,
      },
    );
  }
  if (entries.length) {
    const { error:insertError } = await supabase.from('memory_entries').insert(entries);
    if (insertError) throw insertError;
  }
}

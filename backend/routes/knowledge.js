import crypto from 'node:crypto';
import { Router } from 'express';

import { chunkDocument, retrieveKnowledge } from '../lib/knowledge.js';
import {
  extractKnowledgeFile,
  fetchRemoteKnowledgeSource,
} from '../lib/knowledge-sources.js';
import { assertOrganizationResourceDeletable } from '../lib/organizations.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function baseInput(body, partial = false) {
  const value = {};
  const errors = [];
  if (!partial || body?.name !== undefined) {
    value.name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!value.name || value.name.length > 100) {
      errors.push('Knowledge base name must be between 1 and 100 characters');
    }
  }
  if (!partial || body?.description !== undefined) {
    value.description = typeof body?.description === 'string'
      ? body.description.trim() || null : null;
    if (value.description && value.description.length > 500) {
      errors.push('Description must be 500 characters or fewer');
    }
  }
  if (!partial || body?.retention_days !== undefined) {
    value.retention_days = body?.retention_days === null || body?.retention_days === ''
      ? null : Number(body.retention_days);
    if (
      value.retention_days !== null
      && (!Number.isInteger(value.retention_days)
        || value.retention_days < 1
        || value.retention_days > 3650)
    ) errors.push('Retention must be blank or between 1 and 3,650 days');
  }
  if (!partial || body?.memory_enabled !== undefined) {
    value.memory_enabled = body?.memory_enabled === true;
  }
  return { value, errors };
}

async function ownedBase(id, userId) {
  const { data } = await supabase
    .from('knowledge_bases')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return data || null;
}

async function ownedSource(baseId, sourceId, userId) {
  const { data, error } = await supabase
    .from('knowledge_sources')
    .select('*')
    .eq('id', sourceId)
    .eq('knowledge_base_id', baseId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function documentFields(input = {}) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  const sourceUri = typeof input.sourceUri === 'string' ? input.sourceUri.trim() || null : null;
  const mimeType = typeof input.mimeType === 'string'
    ? input.mimeType.trim().slice(0, 100) || 'text/plain' : 'text/plain';
  if (!title || title.length > 200) throw httpError('Document title must be between 1 and 200 characters');
  if (!content || content.length > 1_000_000) {
    throw httpError('Document content must be between 1 and 1,000,000 characters');
  }
  if (sourceUri && sourceUri.length > 2000) throw httpError('Source URL must be 2,000 characters or fewer');
  return { title, content, sourceUri, mimeType };
}

async function storeKnowledgeDocument({ base, userId, sourceId = null, sourceType = 'manual', ...input }) {
  const fields = documentFields(input);
  const contentHash = crypto.createHash('sha256').update(fields.content).digest('hex');
  if (sourceId) {
    const { data:unchanged, error:unchangedError } = await supabase
      .from('knowledge_documents')
      .select('*')
      .eq('source_id', sourceId)
      .eq('user_id', userId)
      .eq('content_hash', contentHash)
      .eq('status', 'ready')
      .maybeSingle();
    if (unchangedError) throw unchangedError;
    if (unchanged) return { document:unchanged, changed:false };
  }
  const chunks = chunkDocument(fields.content);
  const expiresAt = base.retention_days
    ? new Date(Date.now() + base.retention_days * 86400000).toISOString()
    : null;
  let documentId = null;
  try {
    const { data:document, error } = await supabase
      .from('knowledge_documents')
      .insert({
        knowledge_base_id:base.id,
        user_id:userId,
        source_id:sourceId,
        title:fields.title,
        source_type:sourceType,
        source_uri:fields.sourceUri,
        mime_type:fields.mimeType,
        content_hash:contentHash,
        character_count:fields.content.length,
        status:'processing',
        expires_at:expiresAt,
      })
      .select()
      .single();
    if (error?.code === '23505') throw httpError('This exact document is already in the knowledge base', 409);
    if (error) throw error;
    documentId = document.id;
    const { error:chunkError } = await supabase
      .from('knowledge_chunks')
      .insert(chunks.map(chunk => ({
        document_id:document.id,
        knowledge_base_id:base.id,
        user_id:userId,
        ...chunk,
      })));
    if (chunkError) throw chunkError;
    const { data:ready, error:readyError } = await supabase
      .from('knowledge_documents')
      .update({ status:'ready', chunk_count:chunks.length, error_message:null })
      .eq('id', document.id)
      .eq('user_id', userId)
      .select()
      .single();
    if (readyError) throw readyError;
    if (sourceId) {
      const { error:deleteOldError } = await supabase
        .from('knowledge_documents')
        .delete()
        .eq('source_id', sourceId)
        .eq('user_id', userId)
        .neq('id', ready.id);
      if (deleteOldError) throw deleteOldError;
    }
    return { document:ready, changed:true };
  } catch (error) {
    if (documentId) {
      await supabase.from('knowledge_documents')
        .update({ status:'failed', error_message:String(error.message).slice(0, 1000) })
        .eq('id', documentId)
        .eq('user_id', userId);
    }
    throw error;
  }
}

function remoteSourceInput(body = {}) {
  const sourceType = ['website', 'google_drive', 'notion'].includes(body.source_type)
    ? body.source_type : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const configuration = body.configuration && typeof body.configuration === 'object'
    && !Array.isArray(body.configuration) ? body.configuration : {};
  if (!sourceType) throw httpError('Choose Website, Google Drive, or Notion');
  if (!name || name.length > 160) throw httpError('Source name must be between 1 and 160 characters');
  if (sourceType === 'website') {
    if (typeof configuration.url !== 'string' || !configuration.url.trim()) throw httpError('Website URL is required');
    return { sourceType, name, configuration:{ url:configuration.url.trim() } };
  }
  const credentialId = typeof configuration.credential_id === 'string'
    ? configuration.credential_id.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(credentialId)) throw httpError('Choose a valid app connection');
  if (sourceType === 'google_drive') {
    return { sourceType, name, configuration:{ credential_id:credentialId, file_id:String(configuration.file_id || '').trim() } };
  }
  return { sourceType, name, configuration:{ credential_id:credentialId, page_id:String(configuration.page_id || '').trim() } };
}

async function markSourceFailed(sourceId, userId, error) {
  await supabase.from('knowledge_sources').update({
    status:'failed',
    last_error:String(error.message || error).slice(0, 1000),
  }).eq('id', sourceId).eq('user_id', userId);
}

async function syncRemoteSource(source, base, userId) {
  const { error:syncingError } = await supabase.from('knowledge_sources')
    .update({ status:'syncing', last_error:null })
    .eq('id', source.id).eq('user_id', userId);
  if (syncingError) throw syncingError;
  try {
    const extracted = await fetchRemoteKnowledgeSource(source, userId);
    const stored = await storeKnowledgeDocument({
      base,
      userId,
      sourceId:source.id,
      sourceType:'url',
      title:extracted.title || source.name,
      content:extracted.text,
      sourceUri:extracted.sourceUri,
      mimeType:extracted.mimeType,
    });
    const configuration = {
      ...(source.configuration || {}),
      provider_metadata:extracted.providerMetadata || {},
    };
    const { data:ready, error } = await supabase.from('knowledge_sources').update({
      status:'ready',
      configuration,
      last_error:null,
      last_synced_at:new Date().toISOString(),
      last_document_id:stored.document.id,
      sync_count:Number(source.sync_count || 0) + 1,
    }).eq('id', source.id).eq('user_id', userId).select().single();
    if (error) throw error;
    return { source:ready, document:stored.document, changed:stored.changed };
  } catch (error) {
    await markSourceFailed(source.id, userId, error);
    throw error;
  }
}

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_bases')
      .select(`
        *,
        knowledge_documents(id, status, chunk_count, character_count, created_at),
        agent_knowledge_bases(agent_id, agents(name)),
        memory_entries(id)
      `)
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false });
    if (error) throw error;
    res.json((data || []).map(base => ({
      ...base,
      document_count:base.knowledge_documents?.length || 0,
      chunk_count:(base.knowledge_documents || [])
        .reduce((total, document) => total + document.chunk_count, 0),
      memory_count:base.memory_entries?.length || 0,
      bound_agents:(base.agent_knowledge_bases || []).map(binding => ({
        id:binding.agent_id,
        name:binding.agents?.name || 'Unknown agent',
      })),
      knowledge_documents:undefined,
      agent_knowledge_bases:undefined,
      memory_entries:undefined,
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const validated = baseInput(req.body);
    if (validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0], details:validated.errors });
    }
    const { data, error } = await supabase
      .from('knowledge_bases')
      .insert({ user_id:req.userId, ...validated.value })
      .select()
      .single();
    if (error?.code === '23505') return res.status(409).json({ error:'That name is already in use' });
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const validated = baseInput(req.body, true);
    if (validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0], details:validated.errors });
    }
    if (!Object.keys(validated.value).length) {
      return res.status(400).json({ error:'No valid changes were supplied' });
    }
    const { data, error } = await supabase
      .from('knowledge_bases')
      .update(validated.value)
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select()
      .maybeSingle();
    if (error?.code === '23505') return res.status(409).json({ error:'That name is already in use' });
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Knowledge base not found' });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await assertOrganizationResourceDeletable('knowledge_base', req.params.id, req.userId);
    const { data, error } = await supabase
      .from('knowledge_bases')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error:'Knowledge base not found' });
    res.json({ success:true });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/sources', async (req, res, next) => {
  try {
    if (!await ownedBase(req.params.id, req.userId)) {
      return res.status(404).json({ error:'Knowledge base not found' });
    }
    const { data, error } = await supabase.from('knowledge_sources')
      .select('*')
      .eq('knowledge_base_id', req.params.id)
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) { next(error); }
});

router.post('/:id/sources', async (req, res, next) => {
  let source = null;
  try {
    const base = await ownedBase(req.params.id, req.userId);
    if (!base) return res.status(404).json({ error:'Knowledge base not found' });
    const input = remoteSourceInput(req.body);
    const { data, error } = await supabase.from('knowledge_sources').insert({
      knowledge_base_id:base.id,
      user_id:req.userId,
      source_type:input.sourceType,
      name:input.name,
      configuration:input.configuration,
      status:'pending',
    }).select().single();
    if (error) throw error;
    source = data;
    const result = await syncRemoteSource(source, base, req.userId);
    res.status(201).json(result);
  } catch (error) {
    if (!source) return next(error);
    const { data:failed } = await supabase.from('knowledge_sources')
      .select('*').eq('id', source.id).eq('user_id', req.userId).maybeSingle();
    res.status(error.status && error.status < 500 ? error.status : 422).json({
      error:error.message || 'Source synchronization failed',
      source:failed || source,
    });
  }
});

router.post('/:id/sources/upload', async (req, res, next) => {
  let source = null;
  try {
    const base = await ownedBase(req.params.id, req.userId);
    if (!base) return res.status(404).json({ error:'Knowledge base not found' });
    let fileName = '';
    try { fileName = decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch { fileName = ''; }
    fileName = fileName.trim().slice(0, 160);
    const suppliedMime = String(req.headers['x-file-mime'] || 'application/octet-stream').trim().slice(0, 100);
    if (!fileName) throw httpError('File name is required');
    const extracted = await extractKnowledgeFile(req.body, { mimeType:suppliedMime, fileName });
    const sourceType = extracted.mimeType === 'application/pdf' ? 'pdf'
      : extracted.mimeType.includes('wordprocessingml') ? 'docx'
        : extracted.mimeType.includes('csv') || extracted.mimeType.includes('tab-separated') ? 'csv' : 'text';
    const { data, error } = await supabase.from('knowledge_sources').insert({
      knowledge_base_id:base.id,
      user_id:req.userId,
      source_type:sourceType,
      name:fileName,
      configuration:{ file_name:fileName, mime_type:extracted.mimeType, byte_size:req.body.length },
      status:'syncing',
    }).select().single();
    if (error) throw error;
    source = data;
    const stored = await storeKnowledgeDocument({
      base,
      userId:req.userId,
      sourceId:source.id,
      sourceType:'upload',
      title:fileName,
      content:extracted.text,
      sourceUri:null,
      mimeType:extracted.mimeType,
    });
    const { data:ready, error:readyError } = await supabase.from('knowledge_sources').update({
      status:'ready',
      last_error:null,
      last_synced_at:new Date().toISOString(),
      last_document_id:stored.document.id,
      sync_count:1,
      configuration:{
        ...source.configuration,
        pages:extracted.pages || null,
        warnings:extracted.warnings || [],
      },
    }).eq('id', source.id).eq('user_id', req.userId).select().single();
    if (readyError) throw readyError;
    res.status(201).json({ source:ready, document:stored.document, changed:true });
  } catch (error) {
    if (!source) {
      return res.status(error.status && error.status < 500 ? error.status : 422).json({
        error:error.message || 'File processing failed',
      });
    }
    await markSourceFailed(source.id, req.userId, error);
    res.status(error.status && error.status < 500 ? error.status : 422).json({ error:error.message });
  }
});

router.post('/:id/sources/:sourceId/sync', async (req, res, next) => {
  try {
    const base = await ownedBase(req.params.id, req.userId);
    if (!base) return res.status(404).json({ error:'Knowledge base not found' });
    const source = await ownedSource(base.id, req.params.sourceId, req.userId);
    if (!source) return res.status(404).json({ error:'Knowledge source not found' });
    if (!['website', 'google_drive', 'notion'].includes(source.source_type)) {
      return res.status(409).json({ error:'Upload a replacement file to refresh this source' });
    }
    if (source.status === 'syncing') return res.status(409).json({ error:'This source is already syncing' });
    res.json(await syncRemoteSource(source, base, req.userId));
  } catch (error) {
    res.status(error.status && error.status < 500 ? error.status : 422).json({
      error:error.message || 'Source synchronization failed',
    });
  }
});

router.delete('/:id/sources/:sourceId', async (req, res, next) => {
  try {
    const source = await ownedSource(req.params.id, req.params.sourceId, req.userId);
    if (!source) return res.status(404).json({ error:'Knowledge source not found' });
    const { error:documentError } = await supabase.from('knowledge_documents')
      .delete().eq('source_id', source.id).eq('user_id', req.userId);
    if (documentError) throw documentError;
    const { error } = await supabase.from('knowledge_sources')
      .delete().eq('id', source.id).eq('user_id', req.userId);
    if (error) throw error;
    res.json({ success:true });
  } catch (error) { next(error); }
});

router.get('/:id/documents', async (req, res, next) => {
  try {
    if (!await ownedBase(req.params.id, req.userId)) {
      return res.status(404).json({ error:'Knowledge base not found' });
    }
    const { data, error } = await supabase
      .from('knowledge_documents')
      .select('*')
      .eq('knowledge_base_id', req.params.id)
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/documents', async (req, res, next) => {
  try {
    const base = await ownedBase(req.params.id, req.userId);
    if (!base) return res.status(404).json({ error:'Knowledge base not found' });
    const sourceType = ['manual', 'upload', 'url'].includes(req.body?.source_type)
      ? req.body.source_type : 'manual';
    const stored = await storeKnowledgeDocument({
      base,
      userId:req.userId,
      sourceType,
      title:req.body?.title,
      content:req.body?.content,
      sourceUri:req.body?.source_uri,
      mimeType:req.body?.mime_type,
    });
    res.status(201).json(stored.document);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/documents/:documentId/preview', async (req, res, next) => {
  try {
    const { data:document, error } = await supabase.from('knowledge_documents')
      .select('id, title, source_type, source_uri, mime_type, character_count, chunk_count, status, error_message, updated_at')
      .eq('id', req.params.documentId)
      .eq('knowledge_base_id', req.params.id)
      .eq('user_id', req.userId)
      .maybeSingle();
    if (error) throw error;
    if (!document) return res.status(404).json({ error:'Document not found' });
    const { data:chunks, error:chunkError } = await supabase.from('knowledge_chunks')
      .select('id, chunk_index, content, token_estimate')
      .eq('document_id', document.id)
      .eq('user_id', req.userId)
      .order('chunk_index', { ascending:true })
      .limit(12);
    if (chunkError) throw chunkError;
    res.json({ document, chunks:chunks || [], truncated:document.chunk_count > 12 });
  } catch (error) { next(error); }
});

router.delete('/:id/documents/:documentId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_documents')
      .delete()
      .eq('id', req.params.documentId)
      .eq('knowledge_base_id', req.params.id)
      .eq('user_id', req.userId)
      .select('id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error:'Document not found' });
    res.json({ success:true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/search', async (req, res, next) => {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!query || query.length > 2000) {
      return res.status(400).json({ error:'Search query must be between 1 and 2,000 characters' });
    }
    const result = await retrieveKnowledge(req.userId, [req.params.id], query, {
      topK:req.body?.top_k,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/bind-agent', async (req, res, next) => {
  try {
    if (!await ownedBase(req.params.id, req.userId)) {
      return res.status(404).json({ error:'Knowledge base not found' });
    }
    const { data:agent } = await supabase
      .from('agents')
      .select('id')
      .eq('id', req.body?.agent_id)
      .eq('user_id', req.userId)
      .maybeSingle();
    if (!agent) return res.status(404).json({ error:'Agent not found' });
    const { data, error } = await supabase
      .from('agent_knowledge_bases')
      .upsert({
        agent_id:agent.id,
        knowledge_base_id:req.params.id,
        user_id:req.userId,
      }, { onConflict:'agent_id,knowledge_base_id' })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/bind-agent/:agentId', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('agent_knowledge_bases')
      .delete()
      .eq('knowledge_base_id', req.params.id)
      .eq('agent_id', req.params.agentId)
      .eq('user_id', req.userId)
      .select('agent_id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error:'Agent binding not found' });
    res.json({ success:true });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/memory', async (req, res, next) => {
  try {
    if (!await ownedBase(req.params.id, req.userId)) {
      return res.status(404).json({ error:'Knowledge base not found' });
    }
    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('knowledge_base_id', req.params.id)
      .eq('user_id', req.userId)
      .order('created_at', { ascending:false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/memory', async (req, res, next) => {
  try {
    if (!await ownedBase(req.params.id, req.userId)) {
      return res.status(404).json({ error:'Knowledge base not found' });
    }
    const { error } = await supabase
      .from('memory_entries')
      .delete()
      .eq('knowledge_base_id', req.params.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ success:true });
  } catch (error) {
    next(error);
  }
});

export default router;

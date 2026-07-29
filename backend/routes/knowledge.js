import crypto from 'node:crypto';
import { Router } from 'express';

import { chunkDocument, retrieveKnowledge } from '../lib/knowledge.js';
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
  let documentId = null;
  try {
    const base = await ownedBase(req.params.id, req.userId);
    if (!base) return res.status(404).json({ error:'Knowledge base not found' });
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    const sourceType = ['manual', 'upload', 'url'].includes(req.body?.source_type)
      ? req.body.source_type : 'manual';
    const sourceUri = typeof req.body?.source_uri === 'string'
      ? req.body.source_uri.trim() || null : null;
    const mimeType = typeof req.body?.mime_type === 'string'
      ? req.body.mime_type.trim().slice(0, 100) || 'text/plain' : 'text/plain';
    if (!title || title.length > 200) {
      return res.status(400).json({ error:'Document title must be between 1 and 200 characters' });
    }
    if (!content || content.length > 1_000_000) {
      return res.status(400).json({ error:'Document content must be between 1 and 1,000,000 characters' });
    }
    if (sourceUri && sourceUri.length > 2000) {
      return res.status(400).json({ error:'Source URL must be 2,000 characters or fewer' });
    }
    const chunks = chunkDocument(content);
    const expiresAt = base.retention_days
      ? new Date(Date.now() + base.retention_days * 86400000).toISOString()
      : null;
    const { data:document, error } = await supabase
      .from('knowledge_documents')
      .insert({
        knowledge_base_id:base.id,
        user_id:req.userId,
        title,
        source_type:sourceType,
        source_uri:sourceUri,
        mime_type:mimeType,
        content_hash:crypto.createHash('sha256').update(content).digest('hex'),
        character_count:content.length,
        status:'processing',
        expires_at:expiresAt,
      })
      .select()
      .single();
    if (error?.code === '23505') {
      return res.status(409).json({ error:'This exact document is already in the knowledge base' });
    }
    if (error) throw error;
    documentId = document.id;
    const { error:chunkError } = await supabase
      .from('knowledge_chunks')
      .insert(chunks.map(chunk => ({
        document_id:document.id,
        knowledge_base_id:base.id,
        user_id:req.userId,
        ...chunk,
      })));
    if (chunkError) throw chunkError;
    const { data:ready, error:readyError } = await supabase
      .from('knowledge_documents')
      .update({ status:'ready', chunk_count:chunks.length, error_message:null })
      .eq('id', document.id)
      .eq('user_id', req.userId)
      .select()
      .single();
    if (readyError) throw readyError;
    res.status(201).json(ready);
  } catch (error) {
    if (documentId) {
      await supabase
        .from('knowledge_documents')
        .update({ status:'failed', error_message:String(error.message).slice(0, 1000) })
        .eq('id', documentId)
        .eq('user_id', req.userId);
    }
    next(error);
  }
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

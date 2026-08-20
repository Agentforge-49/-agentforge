import { Router } from 'express';

import { supabase } from '../lib/supabase.js';
import { executeWorkspaceTool, validateWorkspaceToolSteps } from '../lib/workspace-tools.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function text(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function ownedTool(id, userId) {
  const { data, error } = await supabase.from('workspace_tools').select('*')
    .eq('id', id).eq('user_id', userId).single();
  return error ? null : data;
}

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('workspace_tools')
      .select('*, current_version:workspace_tool_versions!workspace_tools_current_version_fk(*)')
      .eq('user_id', req.userId).neq('status', 'archived').order('updated_at', { ascending:false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  let createdToolId = null;
  try {
    const name = text(req.body?.name, 100);
    const slug = text(req.body?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), 100);
    const validated = validateWorkspaceToolSteps(req.body?.steps);
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0] || 'Tool name or slug is invalid' });
    }
    const { data:tool, error } = await supabase.from('workspace_tools').insert({
      user_id:req.userId, name, slug, description:text(req.body?.description) || null,
    }).select().single();
    if (error) throw error;
    createdToolId = tool.id;
    const { data:version, error:versionError } = await supabase.from('workspace_tool_versions').insert({
      tool_id:tool.id, user_id:req.userId, version_number:1, steps:validated.value,
      input_schema:req.body?.input_schema || { type:'object', properties:{} },
      output_schema:req.body?.output_schema || { type:'object', properties:{} },
      test_fixture:req.body?.test_fixture || {}, change_summary:'Initial version',
    }).select().single();
    if (versionError) throw versionError;
    const { data:ready, error:updateError } = await supabase.from('workspace_tools')
      .update({ current_version_id:version.id }).eq('id', tool.id).eq('user_id', req.userId)
      .select().single();
    if (updateError) throw updateError;
    res.status(201).json({ ...ready, current_version:version });
  } catch (error) {
    if (createdToolId) await supabase.from('workspace_tools').delete()
      .eq('id', createdToolId).eq('user_id', req.userId);
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const tool = await ownedTool(req.params.id, req.userId);
    if (!tool) return res.status(404).json({ error:'Workspace tool not found' });
    const { data, error } = await supabase.from('workspace_tool_versions').select('*')
      .eq('tool_id', tool.id).eq('user_id', req.userId).order('version_number', { ascending:false });
    if (error) throw error;
    res.json({ ...tool, versions:data || [] });
  } catch (error) { next(error); }
});

router.post('/:id/versions', async (req, res, next) => {
  try {
    const tool = await ownedTool(req.params.id, req.userId);
    if (!tool) return res.status(404).json({ error:'Workspace tool not found' });
    const validated = validateWorkspaceToolSteps(req.body?.steps);
    if (validated.errors.length) return res.status(400).json({ error:validated.errors[0] });
    const { data:latest, error:latestError } = await supabase.from('workspace_tool_versions')
      .select('version_number').eq('tool_id', tool.id).eq('user_id', req.userId)
      .order('version_number', { ascending:false }).limit(1).single();
    if (latestError) throw latestError;
    const { data, error } = await supabase.from('workspace_tool_versions').insert({
      tool_id:tool.id, user_id:req.userId, version_number:latest.version_number + 1,
      steps:validated.value, input_schema:req.body?.input_schema || { type:'object', properties:{} },
      output_schema:req.body?.output_schema || { type:'object', properties:{} },
      test_fixture:req.body?.test_fixture || {}, change_summary:text(req.body?.change_summary) || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

router.post('/:id/activate', async (req, res, next) => {
  try {
    const tool = await ownedTool(req.params.id, req.userId);
    if (!tool) return res.status(404).json({ error:'Workspace tool not found' });
    const versionId = text(req.body?.version_id, 80) || tool.current_version_id;
    const { count, error:versionError } = await supabase.from('workspace_tool_versions')
      .select('id', { count:'exact', head:true }).eq('id', versionId).eq('tool_id', tool.id).eq('user_id', req.userId);
    if (versionError) throw versionError;
    if (!count) return res.status(400).json({ error:'Choose a valid tool version' });
    const { data, error } = await supabase.from('workspace_tools')
      .update({ status:'active', current_version_id:versionId }).eq('id', tool.id).eq('user_id', req.userId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (error) { next(error); }
});

router.post('/:id/test', async (req, res, next) => {
  try {
    const output = await executeWorkspaceTool({ tool_id:req.params.id, version_id:req.body?.version_id }, req.body?.input, req.userId);
    res.json({ status:'passed', output });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('workspace_tools').update({ status:'archived' })
      .eq('id', req.params.id).eq('user_id', req.userId).select('id').single();
    if (error || !data) return res.status(404).json({ error:'Workspace tool not found' });
    res.json({ success:true });
  } catch (error) { next(error); }
});

export default router;

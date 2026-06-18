import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('templates').select('*').order('is_featured', { ascending: false }).order('usage_count', { ascending: false });
    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) { next(err); }
});

router.post('/:id/use', requireAuth, async (req, res, next) => {
  try {
    const { data: template } = await supabase.from('templates').select('*').eq('id', req.params.id).single();
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const { data: agent, error } = await supabase.from('agents').insert({
      user_id: req.userId, name: `${template.name} Clone`, description: template.description, category: template.category,
      system_prompt: template.system_prompt, personality: template.personality, model: template.default_model, status: 'draft'
    }).select().single();
    if (error) throw error;

    let attachedTools = [];
    if (template.default_tool_slugs?.length > 0) {
      const { data: tools } = await supabase.from('tools').select('*').in('slug', template.default_tool_slugs);
      if (tools?.length > 0) {
        await supabase.from('agent_tools').insert(tools.map(t => ({ agent_id: agent.id, tool_id: t.id })));
        attachedTools = tools;
      }
    }
    await supabase.from('templates').update({ usage_count: template.usage_count + 1 }).eq('id', template.id);
    return res.status(201).json({ ...agent, tools: attachedTools });
  } catch (err) { next(err); }
});

export default router;
import crypto from 'node:crypto';
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { getUsageSummary, recordUsage } from '../lib/usage.js';
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
    const summary = await getUsageSummary(req.userId);
    if (summary.period.marketplace_installs >= Number(summary.limits.marketplace_installs || 0)) {
      return res.status(429).json({ error:'Monthly marketplace install limit reached' });
    }
    const { count, error:countError } = await supabase.from('agents')
      .select('id', { count:'exact', head:true }).eq('user_id', req.userId);
    if (countError) throw countError;
    if ((count || 0) >= Number(summary.limits.agents || 0)) {
      return res.status(429).json({ error:'Your agent limit is reached' });
    }

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
    await supabase.rpc('increment_template_usage', {
      p_template_id: template.id,
    });
    await recordUsage({
      userId:req.userId,
      resourceType:'marketplace',
      resourceId:template.id,
      modelCalls:0,
      tokens:0,
      estimatedCostUsd:0,
      idempotencyKey:`legacy-template-install:${crypto.randomUUID()}`,
      metadata:{ template_id:template.id, legacy:true },
    });
    return res.status(201).json({ ...agent, tools: attachedTools });
  } catch (err) { next(err); }
});

export default router;

import { Router } from 'express';

import { supabase } from '../lib/supabase.js';
import { validateWorkflowGraph } from '../lib/workflow-graph.js';
import { requireAuth } from '../middleware/auth.js';
import { assertUsageAllowance } from '../lib/usage.js';

const router = Router();
router.use(requireAuth);

function workflowInput(body, { partial = false } = {}) {
  const errors = [];
  const value = {};
  if (!partial || Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
      errors.push('Workflow name must be between 1 and 100 characters');
    } else value.name = body.name.trim();
  }
  if (Object.hasOwn(body, 'description')) {
    if (typeof body.description !== 'string' || body.description.length > 500) {
      errors.push('Description must be 500 characters or fewer');
    } else value.description = body.description.trim() || null;
  }
  if (!partial || Object.hasOwn(body, 'nodes') || Object.hasOwn(body, 'edges')) {
    const graph = validateWorkflowGraph(body.nodes, body.edges);
    errors.push(...graph.errors);
    if (graph.value) {
      value.nodes = graph.value.nodes;
      value.edges = graph.value.edges;
    }
  }
  return { errors, value };
}

async function ownedWorkflow(id, userId) {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  return error ? null : data;
}

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const validated = workflowInput(req.body);
    if (validated.errors.length) {
      return res.status(400).json({ error: validated.errors[0], details: validated.errors });
    }
    const { data, error } = await supabase
      .from('workflows')
      .insert({ user_id: req.userId, ...validated.value, status: 'draft' })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const workflow = await ownedWorkflow(req.params.id, req.userId);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    res.json(workflow);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const workflow = await ownedWorkflow(req.params.id, req.userId);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    const merged = {
      name: req.body.name ?? workflow.name,
      description: req.body.description ?? workflow.description ?? '',
      nodes: req.body.nodes ?? workflow.nodes,
      edges: req.body.edges ?? workflow.edges,
    };
    const validated = workflowInput(merged);
    if (validated.errors.length) {
      return res.status(400).json({ error: validated.errors[0], details: validated.errors });
    }
    const { data, error } = await supabase
      .from('workflows')
      .update({
        ...validated.value,
        status: 'draft',
        version: workflow.version + 1,
      })
      .eq('id', workflow.id)
      .eq('user_id', req.userId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select('id');
    if (error) throw error;
    if (!data?.length) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/activate', async (req, res, next) => {
  try {
    const workflow = await ownedWorkflow(req.params.id, req.userId);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    const graph = validateWorkflowGraph(workflow.nodes, workflow.edges);
    if (graph.errors.length) {
      return res.status(400).json({ error: graph.errors[0], details: graph.errors });
    }
    const { data, error } = await supabase
      .from('workflows')
      .update({ status: 'active' })
      .eq('id', workflow.id)
      .eq('user_id', req.userId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/pause', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('workflows')
      .update({ status: 'paused' })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ error: 'Workflow not found' });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/run', async (req, res, next) => {
  try {
    const workflow = await ownedWorkflow(req.params.id, req.userId);
    if (!workflow) return res.status(404).json({ error:'Workflow not found' });
    const requestedCalls = (workflow.nodes || []).filter(node => node.type === 'agent').length;
    if (requestedCalls > 0) {
      try {
        await assertUsageAllowance(req.userId, requestedCalls);
      } catch (error) {
        return res.status(429).json({ error:error.message, allowance:error.allowance });
      }
    }
    const input = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
    const key = req.get('Idempotency-Key') || req.body?.idempotency_key || null;
    const { data, error } = await supabase.rpc('enqueue_workflow_run', {
      p_user_id: req.userId,
      p_workflow_id: req.params.id,
      p_input: input,
      p_idempotency_key: key,
    });
    if (error) {
      const status = /not found/i.test(error.message) ? 404
        : /must be active/i.test(error.message) ? 409
          : 400;
      return res.status(status).json({ error: error.message });
    }
    res.status(data.deduplicated ? 200 : 202).json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/runs', async (req, res, next) => {
  try {
    const workflow = await ownedWorkflow(req.params.id, req.userId);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
    const { data, error } = await supabase
      .from('workflow_runs')
      .select('*, workflow_step_runs(*)')
      .eq('workflow_id', workflow.id)
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

export default router;

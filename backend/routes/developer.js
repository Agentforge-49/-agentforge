import crypto from 'node:crypto';
import { Router } from 'express';

import {
  DEVELOPER_SCOPES,
  DEVELOPER_WEBHOOK_EVENTS,
  assertSafeWebhookEndpoint,
  createDeveloperApiKey,
  deriveWebhookSecret,
  hashDeveloperSecret,
  validateDeveloperKeyInput,
  validateWebhookInput,
} from '../lib/developer-platform.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/openapi.json', (_req, res) => {
  res.json(openApiDocument());
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [keys, subscriptions, deliveries, logs] = await Promise.all([
      many('developer_api_keys', query => query.eq('user_id', req.userId)
        .order('created_at', { ascending:false }).limit(100)),
      many('developer_webhook_subscriptions', query => query.eq('user_id', req.userId)
        .order('created_at', { ascending:false }).limit(100)),
      many('developer_webhook_deliveries', query => query.eq('user_id', req.userId)
        .order('created_at', { ascending:false }).limit(100)),
      many('developer_api_request_logs', query => query.eq('user_id', req.userId)
        .order('occurred_at', { ascending:false }).limit(100)),
    ]);
    res.json({
      scopes:DEVELOPER_SCOPES,
      webhook_event_types:DEVELOPER_WEBHOOK_EVENTS,
      api_base:'/api/v1',
      openapi_url:'/api/developer/openapi.json',
      keys:keys.map(safeKey),
      webhook_subscriptions:subscriptions.map(safeSubscription),
      webhook_deliveries:deliveries,
      request_logs:logs,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/keys', async (req, res, next) => {
  try {
    const input = validateDeveloperKeyInput(req.body);
    const { count, error:countError } = await supabase
      .from('developer_api_keys')
      .select('id', { count:'exact', head:true })
      .eq('user_id', req.userId)
      .eq('status', 'active');
    if (countError) throw countError;
    if ((count || 0) >= 20) return res.status(429).json({ error:'Active API key limit reached' });
    const generated = createDeveloperApiKey();
    const { data, error } = await supabase
      .from('developer_api_keys')
      .insert({
        user_id:req.userId,
        name:input.name,
        key_prefix:generated.prefix,
        key_hash:generated.hash,
        scopes:input.scopes,
        rate_limit_per_minute:input.rateLimit,
        expires_at:input.expiryDays
          ? new Date(Date.now() + input.expiryDays * 86400000).toISOString() : null,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({
      key:safeKey(data),
      token:generated.raw,
      shown_once:true,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/keys/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('developer_api_keys')
      .update({ status:'revoked', revoked_at:new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Active API key not found' });
    res.json(safeKey(data));
  } catch (error) {
    next(error);
  }
});

router.post('/webhooks', async (req, res, next) => {
  try {
    const input = validateWebhookInput(req.body);
    await assertSafeWebhookEndpoint(input.endpointUrl);
    const { count, error:countError } = await supabase
      .from('developer_webhook_subscriptions')
      .select('id', { count:'exact', head:true })
      .eq('user_id', req.userId)
      .neq('status', 'revoked');
    if (countError) throw countError;
    if ((count || 0) >= 20) return res.status(429).json({ error:'Webhook subscription limit reached' });
    const id = crypto.randomUUID();
    const secret = deriveWebhookSecret(id);
    const { data, error } = await supabase
      .from('developer_webhook_subscriptions')
      .insert({
        id,
        user_id:req.userId,
        name:input.name,
        endpoint_url:input.endpointUrl,
        event_types:input.eventTypes,
        signing_secret_hash:hashDeveloperSecret(secret),
        secret_last_four:secret.slice(-4),
        max_attempts:input.maxAttempts,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({
      subscription:safeSubscription(data),
      signing_secret:secret,
      shown_once:true,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/webhooks/:id', async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!['active', 'paused'].includes(status)) {
      return res.status(400).json({ error:'Webhook status must be active or paused' });
    }
    const { data, error } = await supabase
      .from('developer_webhook_subscriptions')
      .update({ status, updated_at:new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .neq('status', 'revoked')
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Webhook subscription not found' });
    res.json(safeSubscription(data));
  } catch (error) {
    next(error);
  }
});

router.delete('/webhooks/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('developer_webhook_subscriptions')
      .update({ status:'revoked', updated_at:new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .neq('status', 'revoked')
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Webhook subscription not found' });
    res.json(safeSubscription(data));
  } catch (error) {
    next(error);
  }
});

router.post('/webhooks/test', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('publish_developer_webhook_event', {
      p_user_id:req.userId,
      p_event_type:'test.ping',
      p_payload:{
        message:'AgentForge webhook test',
        requested_at:new Date().toISOString(),
      },
    });
    if (error) throw error;
    res.status(202).json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/deliveries/:id/retry', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('developer_webhook_deliveries')
      .update({
        status:'pending',
        attempt:0,
        next_attempt_at:new Date().toISOString(),
        locked_at:null,
        error_code:null,
        updated_at:new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .eq('status', 'dead_letter')
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Dead-letter delivery not found' });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

async function many(table, configure) {
  const { data, error } = await configure(supabase.from(table).select('*'));
  if (error) throw error;
  return data || [];
}

function safeKey(item) {
  const { key_hash:ignored, ...safe } = item;
  void ignored;
  return safe;
}

function safeSubscription(item) {
  const { signing_secret_hash:ignored, ...safe } = item;
  void ignored;
  return safe;
}

function openApiDocument() {
  return {
    openapi:'3.1.0',
    info:{
      title:'AgentForge Developer API',
      version:'1.0.0',
      description:'Scoped, rate-limited API for AgentForge agents, workflows, runs, usage, and webhooks.',
    },
    servers:[{ url:'https://agentforge-api-yml4.onrender.com/api/v1' }],
    security:[{ AgentForgeApiKey:[] }],
    components:{
      securitySchemes:{
        AgentForgeApiKey:{
          type:'apiKey',
          in:'header',
          name:'X-AgentForge-Key',
          description:'Create a scoped key in the AgentForge Developer Platform.',
        },
      },
    },
    paths:{
      '/status':{ get:{ summary:'Platform status', tags:['Status'] } },
      '/agents':{ get:{ summary:'List agents', tags:['Agents'] } },
      '/agents/{id}':{ get:{ summary:'Get an agent', tags:['Agents'] } },
      '/agents/{id}/run':{ post:{ summary:'Queue an agent run', tags:['Agents'] } },
      '/workflows':{ get:{ summary:'List workflows', tags:['Workflows'] } },
      '/workflows/{id}':{ get:{ summary:'Get a workflow', tags:['Workflows'] } },
      '/workflows/{id}/run':{ post:{ summary:'Queue a workflow run', tags:['Workflows'] } },
      '/runs':{ get:{ summary:'List recent runs', tags:['Runs'] } },
      '/usage':{ get:{ summary:'Get current usage and limits', tags:['Usage'] } },
      '/webhook-events':{ post:{ summary:'Publish a test webhook event', tags:['Webhooks'] } },
    },
  };
}

export default router;

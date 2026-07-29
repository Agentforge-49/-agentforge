import { Router } from 'express';

import {
  BILLING_PROVIDERS,
  billingMode,
  createCheckoutToken,
  hashBillingValue,
  validateCheckoutInput,
  verifyWebhookSignature,
} from '../lib/billing.js';
import { redactTelemetry } from '../lib/observability.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/webhooks/:provider', async (req, res, next) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    if (!BILLING_PROVIDERS.has(provider)) {
      return res.status(404).json({ error:'Billing provider is not supported' });
    }
    const secret = process.env[`BILLING_${provider.toUpperCase()}_WEBHOOK_SECRET`]
      || process.env.BILLING_WEBHOOK_SECRET;
    if (!secret || billingMode() !== 'live') {
      return res.status(503).json({ error:'Live billing webhooks are disabled' });
    }
    const signature = req.get('x-agentforge-signature');
    const valid = verifyWebhookSignature({ rawBody:req.rawBody, signature, secret });
    if (!valid) return res.status(401).json({ error:'Webhook signature is invalid' });
    const eventId = String(req.body?.id || '').trim().slice(0, 255);
    const eventType = String(req.body?.type || '').trim().slice(0, 160);
    if (!eventId || !eventType) {
      return res.status(400).json({ error:'Webhook event id and type are required' });
    }
    const payloadHash = hashBillingValue(req.rawBody);
    const { data:event, error } = await supabase
      .from('billing_webhook_events')
      .insert({
        provider,
        provider_event_id:eventId,
        event_type:eventType,
        payload_sha256:payloadHash,
        signature_valid:true,
      })
      .select()
      .single();
    if (error?.code === '23505') return res.json({ received:true, duplicate:true });
    if (error) throw error;
    const userId = String(req.body?.data?.user_id || '');
    let status = 'ignored';
    if (uuid(userId)) {
      await supabase.rpc('record_billing_ledger_event', {
        p_user_id:userId,
        p_event_type:`webhook.${eventType}`,
        p_source_type:'webhook_event',
        p_source_id:event.id,
        p_details:redactTelemetry({
          provider,
          provider_event_id:eventId,
          payload_sha256:payloadHash,
        }),
      });
      status = 'processed';
    }
    await supabase.from('billing_webhook_events').update({
      status,
      processed_at:new Date().toISOString(),
    }).eq('id', event.id);
    res.json({ received:true, duplicate:false, status });
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const [plans, customer, subscriptions, invoices, checkouts, ledger, entitlement] =
      await Promise.all([
        queryMany('plan_definitions', query => query.eq('is_public', true).order('monthly_price_cents')),
        queryOne('billing_customers', query => query.eq('user_id', req.userId)),
        queryMany('billing_subscriptions', query => query.eq('user_id', req.userId)
          .order('created_at', { ascending:false }).limit(50)),
        queryMany('billing_invoices', query => query.eq('user_id', req.userId)
          .order('created_at', { ascending:false }).limit(100)),
        queryMany('billing_checkout_sessions', query => query.eq('user_id', req.userId)
          .order('created_at', { ascending:false }).limit(50)),
        queryMany('billing_ledger_events', query => query.eq('user_id', req.userId)
          .order('sequence_number', { ascending:false }).limit(100)),
        queryOne('user_entitlements', query => query.eq('user_id', req.userId)),
      ]);
    res.json({
      mode:billingMode(),
      live_checkout_enabled:billingMode() === 'live' && Boolean(process.env.BILLING_PROVIDER),
      sandbox:{
        enabled:billingMode() === 'test',
        changes_entitlement:false,
        charges_money:false,
      },
      plans,
      customer,
      subscriptions,
      current_subscription:subscriptions.find(item => (
        ['test_active', 'trialing', 'active', 'past_due', 'paused'].includes(item.status)
      )) || null,
      invoices,
      checkout_sessions:checkouts,
      ledger,
      entitlement,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/customer', async (req, res, next) => {
  try {
    const email = String(req.body?.billing_email || req.user?.email || '').trim().toLowerCase();
    const companyName = String(req.body?.company_name || '').trim();
    const taxCountry = String(req.body?.tax_country || '').trim().toUpperCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return res.status(400).json({ error:'A valid billing email is required' });
    }
    if (companyName.length > 200) {
      return res.status(400).json({ error:'Company name must be 200 characters or fewer' });
    }
    if (taxCountry && !/^[A-Z]{2}$/.test(taxCountry)) {
      return res.status(400).json({ error:'Tax country must be a two-letter country code' });
    }
    const { data, error } = await supabase
      .from('billing_customers')
      .upsert({
        user_id:req.userId,
        provider:billingMode() === 'test' ? 'test' : process.env.BILLING_PROVIDER || 'manual',
        billing_email:email,
        company_name:companyName || null,
        tax_country:taxCountry || null,
        test_mode:billingMode() !== 'live',
        updated_at:new Date().toISOString(),
      }, { onConflict:'user_id' })
      .select()
      .single();
    if (error) throw error;
    await ledger(req.userId, 'billing.customer_updated', 'customer', null, {
      email_domain:email.split('@')[1],
      has_company:Boolean(companyName),
      tax_country:taxCountry || null,
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/checkout', async (req, res, next) => {
  try {
    const { planKey, interval } = validateCheckoutInput(req.body);
    if (billingMode() !== 'test') {
      return res.status(503).json({
        error:'A live payment provider is not configured. No checkout was created.',
      });
    }
    const token = createCheckoutToken();
    const { data:plan, error:planError } = await supabase
      .from('plan_definitions')
      .select('*')
      .eq('plan_key', planKey)
      .eq('is_public', true)
      .single();
    if (planError) throw planError;
    const monthly = Number(plan.monthly_price_cents || 0);
    const amount = interval === 'annual' ? monthly * 12 : monthly;
    const { data, error } = await supabase
      .from('billing_checkout_sessions')
      .insert({
        user_id:req.userId,
        provider:'test',
        mode:'test',
        checkout_token_hash:hashBillingValue(token),
        plan_key:planKey,
        billing_interval:interval,
        amount_cents:amount,
        currency:plan.currency || 'USD',
        expires_at:new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    await ledger(req.userId, 'sandbox.checkout_created', 'checkout', data.id, {
      plan_key:planKey,
      billing_interval:interval,
      amount_cents:amount,
      entitlement_changed:false,
    });
    res.status(201).json({
      checkout:data,
      token,
      shown_once:true,
      sandbox:true,
      charges_money:false,
      changes_entitlement:false,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/checkout/:id/complete', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (token.length < 32) return res.status(400).json({ error:'Checkout token is required' });
    const { data, error } = await supabase.rpc('complete_test_checkout', {
      p_user_id:req.userId,
      p_checkout_id:req.params.id,
      p_checkout_token_hash:hashBillingValue(token),
    });
    if (error) {
      const status = /not found/i.test(error.message) ? 404
        : /invalid/i.test(error.message) ? 403 : 409;
      return res.status(status).json({ error:error.message });
    }
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/checkout/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('billing_checkout_sessions')
      .update({ status:'cancelled' })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .eq('status', 'open')
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Open checkout session not found' });
    await ledger(req.userId, 'sandbox.checkout_cancelled', 'checkout', data.id, {
      plan_key:data.plan_key,
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/subscription/cancel', async (req, res, next) => {
  try {
    const immediate = req.body?.immediate === true;
    const { data:current, error:currentError } = await supabase
      .from('billing_subscriptions')
      .select('*')
      .eq('user_id', req.userId)
      .in('status', ['test_active', 'trialing', 'active', 'past_due', 'paused'])
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return res.status(404).json({ error:'Current subscription not found' });
    if (current.mode === 'live' && !process.env.BILLING_PROVIDER) {
      return res.status(503).json({ error:'Live provider cancellation is unavailable' });
    }
    const patch = immediate
      ? { status:'cancelled', cancelled_at:new Date().toISOString(), cancel_at_period_end:false }
      : { cancel_at_period_end:true };
    const { data, error } = await supabase
      .from('billing_subscriptions')
      .update({ ...patch, updated_at:new Date().toISOString() })
      .eq('id', current.id)
      .eq('user_id', req.userId)
      .select()
      .single();
    if (error) throw error;
    await ledger(req.userId, immediate
      ? 'subscription.cancelled' : 'subscription.cancellation_scheduled',
    'subscription', data.id, { mode:data.mode, entitlement_changed:false });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/subscription/resume', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('billing_subscriptions')
      .update({ cancel_at_period_end:false, updated_at:new Date().toISOString() })
      .eq('user_id', req.userId)
      .eq('cancel_at_period_end', true)
      .in('status', ['test_active', 'trialing', 'active', 'past_due', 'paused'])
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Scheduled cancellation not found' });
    await ledger(req.userId, 'subscription.cancellation_reversed', 'subscription', data.id, {
      mode:data.mode,
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/invoices/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('billing_invoices')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Invoice not found' });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

async function queryOne(table, configure) {
  const { data, error } = await configure(supabase.from(table).select('*')).maybeSingle();
  if (error) throw error;
  return data;
}

async function queryMany(table, configure) {
  const { data, error } = await configure(supabase.from(table).select('*'));
  if (error) throw error;
  return data || [];
}

async function ledger(userId, eventType, sourceType, sourceId, details) {
  const { data, error } = await supabase.rpc('record_billing_ledger_event', {
    p_user_id:userId,
    p_event_type:eventType,
    p_source_type:sourceType,
    p_source_id:sourceId,
    p_details:redactTelemetry(details),
  });
  if (error) throw error;
  return data;
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

export default router;

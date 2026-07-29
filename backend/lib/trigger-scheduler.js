import crypto from 'node:crypto';

import { deliverDeveloperWebhook } from './developer-platform.js';
import { supabase } from './supabase.js';

const POLL_INTERVAL_MS = Number(process.env.TRIGGER_POLL_INTERVAL_MS || 30000);

export async function processNextScheduledTrigger() {
  const { data: trigger, error } = await supabase.rpc('claim_due_workflow_trigger');
  if (error) throw error;
  if (!trigger?.id) return false;

  const scheduledAt = trigger.last_fired_at || new Date().toISOString();
  const key = `schedule:${scheduledAt}`;
  const input = JSON.stringify({
    trigger_id: trigger.id,
    scheduled_at: scheduledAt,
  });
  const { data: fired, error: fireError } = await supabase.rpc('fire_workflow_trigger', {
    p_trigger_id: trigger.id,
    p_input: input,
    p_event_source: 'schedule',
    p_idempotency_key: key,
  });
  if (fireError || fired?.error) {
    console.error('Scheduled trigger failed:', fireError?.message || fired?.error || trigger.id);
  }
  return true;
}

export async function expirePendingApprovals() {
  const { data, error } = await supabase.rpc('expire_pending_approvals');
  if (error) throw error;
  return data || [];
}

export async function purgeExpiredKnowledge() {
  const { data, error } = await supabase.rpc('purge_expired_knowledge');
  if (error) throw error;
  return data || { documents_deleted:0, memories_deleted:0 };
}

export async function refreshUsageCounters() {
  const { data, error } = await supabase.rpc('refresh_legacy_usage_counters');
  if (error) throw error;
  return Number(data) || 0;
}

export async function purgeOrganizationGovernanceData() {
  const { data:expired, error:expiryError } = await supabase
    .from('governance_change_requests')
    .update({ status:'expired' })
    .eq('status', 'pending')
    .lte('expires_at', new Date().toISOString())
    .select('id, organization_id, change_type');
  if (expiryError) throw expiryError;
  for (const request of expired || []) {
    const { error:auditError } = await supabase.rpc('record_organization_audit', {
      p_organization_id:request.organization_id,
      p_actor_user_id:null,
      p_event_type:'governance.change_expired',
      p_target_type:'governance_request',
      p_target_id:request.id,
      p_details:{ change_type:request.change_type },
    });
    if (auditError) throw auditError;
  }
  const { data, error } = await supabase.rpc('purge_organization_governance_data');
  if (error) throw error;
  return {
    ...(data || {
      audit_events_deleted:0,
      invitations_deleted:0,
      exports_expired:0,
    }),
    governance_requests_expired:(expired || []).length,
  };
}

export async function expireBillingSandbox() {
  const { data, error } = await supabase.rpc('expire_billing_sandbox');
  if (error) throw error;
  return data || {
    checkout_sessions_expired:0,
    sandbox_subscriptions_closed:0,
  };
}

export async function processNextDeveloperWebhook() {
  const { data:delivery, error } = await supabase.rpc('claim_developer_webhook_delivery');
  if (error) throw error;
  if (!delivery?.id) return false;
  const [subscriptionResult, eventResult] = await Promise.all([
    supabase.from('developer_webhook_subscriptions').select('*')
      .eq('id', delivery.subscription_id).single(),
    supabase.from('developer_webhook_events').select('*')
      .eq('id', delivery.event_id).single(),
  ]);
  if (subscriptionResult.error || eventResult.error) {
    await failDeveloperWebhook(delivery, 'WEBHOOK_RESOURCE_UNAVAILABLE');
    return true;
  }
  if (subscriptionResult.data.status !== 'active') {
    await failDeveloperWebhook(delivery, 'WEBHOOK_SUBSCRIPTION_INACTIVE', true);
    return true;
  }
  try {
    const result = await deliverDeveloperWebhook({
      subscription:subscriptionResult.data,
      event:eventResult.data,
    });
    const now = new Date().toISOString();
    const { error:updateError } = await supabase.from('developer_webhook_deliveries').update({
      status:'delivered',
      response_status:result.status,
      response_sha256:result.responseSha256,
      duration_ms:result.durationMs,
      error_code:null,
      delivered_at:now,
      locked_at:null,
      updated_at:now,
    }).eq('id', delivery.id).eq('status', 'delivering');
    if (updateError) throw updateError;
    await supabase.from('developer_webhook_subscriptions').update({
      last_delivery_at:now,
      last_success_at:now,
      updated_at:now,
    }).eq('id', delivery.subscription_id);
  } catch (deliveryError) {
    await failDeveloperWebhook(
      delivery,
      String(deliveryError.code || 'WEBHOOK_DELIVERY_FAILED').slice(0, 100),
      false,
      deliveryError,
    );
  }
  return true;
}

async function failDeveloperWebhook(delivery, errorCode, terminal = false, deliveryError = null) {
  const exhausted = terminal || delivery.attempt >= delivery.max_attempts;
  const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, delivery.attempt - 1)));
  const now = new Date();
  const { error } = await supabase.from('developer_webhook_deliveries').update({
    status:exhausted ? 'dead_letter' : 'retry_wait',
    response_status:deliveryError?.status || null,
    response_sha256:deliveryError?.responseSha256 || null,
    duration_ms:Math.max(0, Number(deliveryError?.durationMs) || 0),
    error_code:errorCode,
    next_attempt_at:new Date(now.getTime() + delaySeconds * 1000).toISOString(),
    locked_at:null,
    updated_at:now.toISOString(),
  }).eq('id', delivery.id).eq('status', 'delivering');
  if (error) throw error;
  await supabase.from('developer_webhook_subscriptions').update({
    last_delivery_at:now.toISOString(),
    updated_at:now.toISOString(),
  }).eq('id', delivery.subscription_id);
}

export async function purgeDeveloperLaunchData() {
  const { data, error } = await supabase.rpc('purge_developer_launch_data');
  if (error) throw error;
  return data || {};
}

export function startTriggerScheduler() {
  let stopped = false;
  let working = false;
  const schedulerId = `${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
  const tick = async () => {
    if (stopped || working) return;
    working = true;
    try {
      await expirePendingApprovals();
      await purgeExpiredKnowledge();
      await refreshUsageCounters();
      await purgeOrganizationGovernanceData();
      await expireBillingSandbox();
      await purgeDeveloperLaunchData();
      for (let index = 0; index < 20 && !stopped; index += 1) {
        if (!await processNextDeveloperWebhook()) break;
      }
      while (!stopped && await processNextScheduledTrigger()) {
        // Drain every due schedule before waiting for the next polling interval.
      }
    } catch (error) {
      console.error(`Trigger scheduler ${schedulerId} error:`, error.message);
    } finally {
      working = false;
    }
  };
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  timer.unref();
  tick();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

import crypto from 'node:crypto';

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

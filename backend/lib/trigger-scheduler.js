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

export function startTriggerScheduler() {
  let stopped = false;
  let working = false;
  const schedulerId = `${process.pid}:${crypto.randomUUID().slice(0, 8)}`;
  const tick = async () => {
    if (stopped || working) return;
    working = true;
    try {
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

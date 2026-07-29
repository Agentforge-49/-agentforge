import { supabase } from './supabase.js';

export async function checkUsageAllowance(userId, requestedModelCalls = 1) {
  const { data, error } = await supabase.rpc('check_usage_allowance', {
    p_user_id:userId,
    p_requested_model_calls:Math.max(0, Number(requestedModelCalls) || 0),
  });
  if (error) throw error;
  return data;
}

export async function assertUsageAllowance(userId, requestedModelCalls = 1) {
  const allowance = await checkUsageAllowance(userId, requestedModelCalls);
  if (!allowance?.allowed) {
    const error = new Error(allowance?.reason || 'Usage limit reached');
    error.code = 'USAGE_LIMIT_REACHED';
    error.status = 429;
    error.allowance = allowance;
    throw error;
  }
  return allowance;
}

export async function recordUsage({
  userId,
  executionJobId = null,
  resourceType,
  resourceId = null,
  modelCalls = 0,
  tokens = 0,
  estimatedCostUsd = 0,
  idempotencyKey,
  metadata = {},
}) {
  const { data, error } = await supabase.rpc('record_run_usage', {
    p_user_id:userId,
    p_execution_job_id:executionJobId,
    p_resource_type:resourceType,
    p_resource_id:resourceId,
    p_model_calls:Math.max(0, Number(modelCalls) || 0),
    p_tokens:Math.max(0, Number(tokens) || 0),
    p_estimated_cost_usd:Math.max(0, Number(estimatedCostUsd) || 0),
    p_idempotency_key:String(idempotencyKey),
    p_metadata:metadata,
  });
  if (error) throw error;
  return data;
}

export function resolvedLimits(plan, entitlement) {
  return {
    ...(plan?.limits || {}),
    ...(entitlement?.override_limits || {}),
  };
}

export async function getUsageSummary(userId) {
  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  const [
    entitlementResult,
    periodResult,
    budgetResult,
    plansResult,
    eventsResult,
    requestsResult,
  ] = await Promise.all([
    supabase.from('user_entitlements').select('*').eq('user_id', userId).single(),
    supabase.from('usage_periods').select('*')
      .eq('user_id', userId).eq('period_start', periodStart.toISOString().slice(0, 10))
      .maybeSingle(),
    supabase.from('budget_policies').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('plan_definitions').select('*').eq('is_public', true)
      .order('monthly_price_cents', { ascending:true, nullsFirst:false }),
    supabase.from('usage_events').select('*').eq('user_id', userId)
      .gte('occurred_at', periodStart.toISOString())
      .order('occurred_at', { ascending:false }).limit(100),
    supabase.from('plan_change_requests').select('*').eq('user_id', userId)
      .order('created_at', { ascending:false }).limit(10),
  ]);
  const firstError = [
    entitlementResult.error,
    periodResult.error,
    budgetResult.error,
    plansResult.error,
    eventsResult.error,
    requestsResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;
  const entitlement = entitlementResult.data;
  const plans = plansResult.data || [];
  const plan = plans.find(item => item.plan_key === entitlement.plan_key);
  const limits = resolvedLimits(plan, entitlement);
  const period = periodResult.data || {
    period_start:periodStart.toISOString().slice(0, 10),
    period_end:new Date(Date.UTC(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth() + 1,
      1,
    )).toISOString().slice(0, 10),
    model_calls:0,
    tokens:0,
    estimated_cost_usd:0,
    agent_runs:0,
    workflow_steps:0,
    evaluation_calls:0,
    multi_agent_tasks:0,
    chain_steps:0,
    marketplace_installs:0,
  };
  const budget = budgetResult.data || {
    monthly_cost_limit_usd:null,
    warning_percent:80,
    hard_limit_enabled:false,
  };
  const callPercent = limits.model_calls
    ? Math.min(100, (period.model_calls / limits.model_calls) * 100) : 0;
  const tokenPercent = limits.tokens
    ? Math.min(100, (Number(period.tokens) / limits.tokens) * 100) : 0;
  const planCostPercent = limits.estimated_cost_usd
    ? Math.min(100, (Number(period.estimated_cost_usd) / limits.estimated_cost_usd) * 100) : 0;
  const personalCostPercent = budget.monthly_cost_limit_usd
    ? Math.min(100, (Number(period.estimated_cost_usd) / budget.monthly_cost_limit_usd) * 100) : 0;
  return {
    entitlement,
    plan,
    plans,
    limits,
    period,
    budget,
    percentages:{
      model_calls:Number(callPercent.toFixed(1)),
      tokens:Number(tokenPercent.toFixed(1)),
      plan_cost:Number(planCostPercent.toFixed(1)),
      personal_cost:Number(personalCostPercent.toFixed(1)),
    },
    warnings:{
      model_calls:callPercent >= budget.warning_percent,
      tokens:tokenPercent >= budget.warning_percent,
      plan_cost:planCostPercent >= budget.warning_percent,
      personal_cost:personalCostPercent >= budget.warning_percent,
    },
    events:eventsResult.data || [],
    plan_change_requests:requestsResult.data || [],
  };
}

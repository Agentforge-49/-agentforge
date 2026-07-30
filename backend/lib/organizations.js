import crypto from 'node:crypto';

import { redactTelemetry } from './observability.js';
import { supabase } from './supabase.js';
import { SUPPORTED_MODELS } from './model-catalog.js';

export const ORGANIZATION_ROLES = ['viewer', 'builder', 'admin', 'owner'];
export const ORGANIZATION_RESOURCE_TYPES = {
  agent:{
    table:'agents',
    label:'Agent',
    select:'id, name, description, status, user_id, created_at, updated_at',
  },
  workflow:{
    table:'workflows',
    label:'Workflow',
    select:'id, name, description, status, user_id, created_at, updated_at',
  },
  chain:{
    table:'agent_chains',
    label:'Chain',
    select:'id, name, description, user_id, created_at, updated_at',
  },
  knowledge_base:{
    table:'knowledge_bases',
    label:'Knowledge base',
    select:'id, name, description, user_id, created_at, updated_at',
  },
  multi_agent:{
    table:'multi_agent_systems',
    label:'Multi-agent system',
    select:'id, name, description, status, user_id, created_at, updated_at',
  },
  evaluation_suite:{
    table:'evaluation_suites',
    label:'Evaluation suite',
    select:'id, name, description, user_id, created_at, updated_at',
  },
};

const ROLE_RANK = new Map(ORGANIZATION_ROLES.map((role, index) => [role, index]));
const MODEL_ALLOWLIST = SUPPORTED_MODELS;

export function hasOrganizationRole(actual, required = 'viewer') {
  return (ROLE_RANK.get(actual) ?? -1) >= (ROLE_RANK.get(required) ?? Infinity);
}

export function organizationSlug(value, suffix = '') {
  const base = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'workspace';
  const cleanSuffix = String(suffix).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  return cleanSuffix ? `${base}-${cleanSuffix}` : base;
}

export function validateOrganizationInput(body, { partial = false } = {}) {
  const errors = [];
  const value = {};
  if (!partial || Object.hasOwn(body || {}, 'name')) {
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 100) {
      errors.push('Organization name must be between 2 and 100 characters');
    } else value.name = name;
  }
  if (!partial || Object.hasOwn(body || {}, 'description')) {
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    if (description.length > 500) {
      errors.push('Organization description must be 500 characters or fewer');
    } else value.description = description || null;
  }
  return { errors, value };
}

export function validateOrganizationPolicy(body) {
  const errors = [];
  const allowedModels = Array.isArray(body?.allowed_models)
    ? [...new Set(body.allowed_models.map(value => String(value).trim()).filter(Boolean))]
    : [];
  const maxCalls = Number(body?.max_model_calls_per_run);
  const rawCost = body?.max_estimated_cost_usd;
  const maxCost = rawCost === null || rawCost === '' ? null : Number(rawCost);
  const minimumApprovers = Number(body?.minimum_approvers);
  const retentionDays = Number(body?.audit_retention_days);
  if (!allowedModels.length || allowedModels.some(model => !MODEL_ALLOWLIST.has(model))) {
    errors.push('Choose at least one supported organization model');
  }
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 10000) {
    errors.push('Maximum model calls per run must be between 1 and 10,000');
  }
  if (maxCost !== null && (!Number.isFinite(maxCost) || maxCost < 0.0001 || maxCost > 1_000_000)) {
    errors.push('Maximum estimated run cost must be blank or between $0.0001 and $1,000,000');
  }
  if (!['none', 'sensitive', 'all_changes'].includes(body?.approval_mode)) {
    errors.push('Approval mode is invalid');
  }
  if (!Number.isInteger(minimumApprovers) || minimumApprovers < 1 || minimumApprovers > 5) {
    errors.push('Minimum approvers must be between 1 and 5');
  }
  if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 3650) {
    errors.push('Audit retention must be between 30 and 3,650 days');
  }
  return {
    errors,
    value:{
      execution_enabled:body?.execution_enabled === true,
      allowed_models:allowedModels,
      max_model_calls_per_run:maxCalls,
      max_estimated_cost_usd:maxCost,
      approval_mode:body?.approval_mode,
      minimum_approvers:minimumApprovers,
      audit_retention_days:retentionDays,
      immutable_audit:body?.immutable_audit !== false,
      compliance_export_enabled:body?.compliance_export_enabled !== false,
    },
  };
}

export async function getOrganizationMembership(organizationId, userId) {
  const { data, error } = await supabase
    .from('organization_members')
    .select('*, organizations(*)')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function requireOrganizationRole(organizationId, userId, required = 'viewer') {
  const membership = await getOrganizationMembership(organizationId, userId);
  if (!membership || !hasOrganizationRole(membership.role, required)) {
    const error = new Error(`${required[0].toUpperCase()}${required.slice(1)} organization access required`);
    error.status = 403;
    throw error;
  }
  if (membership.organizations?.status !== 'active' && required !== 'viewer') {
    const error = new Error('Organization is not active');
    error.status = 409;
    throw error;
  }
  return membership;
}

export function requestAuditContext(req, details = {}) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  const remote = forwarded || req.ip || '';
  const salt = process.env.AUDIT_IP_HASH_SALT
    || process.env.CREDENTIAL_ENCRYPTION_KEY
    || 'agentforge-audit-context';
  const ipHash = remote
    ? crypto.createHmac('sha256', salt).update(remote).digest('hex')
    : null;
  return redactTelemetry({
    ...details,
    request_id:String(req.get('x-request-id') || '').slice(0, 100) || null,
    ip_hash:ipHash,
    user_agent:String(req.get('user-agent') || '').slice(0, 240) || null,
  });
}

export async function recordOrganizationAudit({
  organizationId,
  actorUserId,
  eventType,
  targetType = null,
  targetId = null,
  details = {},
}) {
  const { data, error } = await supabase.rpc('record_organization_audit', {
    p_organization_id:organizationId,
    p_actor_user_id:actorUserId,
    p_event_type:eventType,
    p_target_type:targetType,
    p_target_id:targetId,
    p_details:redactTelemetry(details),
  });
  if (error) throw error;
  return data;
}

export async function loadOwnedOrganizationResource(resourceType, resourceId, userId) {
  const definition = ORGANIZATION_RESOURCE_TYPES[resourceType];
  if (!definition) return null;
  const { data, error } = await supabase
    .from(definition.table)
    .select('*')
    .eq('id', resourceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function assertOrganizationResourceDeletable(resourceType, resourceId, userId) {
  const definition = ORGANIZATION_RESOURCE_TYPES[resourceType];
  if (!definition) return;
  const { count:ownedCount, error:ownedError } = await supabase
    .from(definition.table)
    .select('id', { count:'exact', head:true })
    .eq('id', resourceId)
    .eq('user_id', userId);
  if (ownedError) throw ownedError;
  if ((ownedCount || 0) === 0) return;
  const { count, error } = await supabase
    .from('organization_resources')
    .select('id', { count:'exact', head:true })
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId);
  if (error) throw error;
  if ((count || 0) > 0) {
    const blocked = new Error('Unshare this resource from every organization before deleting it');
    blocked.status = 409;
    blocked.code = 'ORGANIZATION_RESOURCE_SHARED';
    throw blocked;
  }
}

export async function hydrateOrganizationResources(resources) {
  const grouped = new Map();
  for (const resource of resources || []) {
    if (!grouped.has(resource.resource_type)) grouped.set(resource.resource_type, []);
    grouped.get(resource.resource_type).push(resource.resource_id);
  }
  const details = new Map();
  await Promise.all([...grouped.entries()].map(async ([type, ids]) => {
    const definition = ORGANIZATION_RESOURCE_TYPES[type];
    if (!definition) return;
    const { data, error } = await supabase
      .from(definition.table)
      .select(definition.select)
      .in('id', ids);
    if (error) throw error;
    for (const item of data || []) details.set(`${type}:${item.id}`, item);
  }));
  return (resources || []).map(resource => ({
    ...resource,
    resource:details.get(`${resource.resource_type}:${resource.resource_id}`) || null,
  }));
}

export async function enforceOrganizationExecutionPolicy({
  userId,
  resourceType,
  resourceId,
  modelCalls = 1,
  models = [],
  estimatedCostUsd = 0,
}) {
  const { data:shares, error:shareError } = await supabase
    .from('organization_resources')
    .select('organization_id')
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId);
  if (shareError) throw shareError;
  if (!shares?.length) return { allowed:true, organizations:[] };
  const organizationIds = [...new Set(shares.map(share => share.organization_id))];
  const [{ data:organizations, error:organizationError }, { data:policies, error:policyError }] =
    await Promise.all([
      supabase.from('organizations').select('id, name, status').in('id', organizationIds),
      supabase.from('organization_policies').select('*').in('organization_id', organizationIds),
    ]);
  if (organizationError || policyError) throw organizationError || policyError;
  const activeIds = new Set(
    (organizations || []).filter(item => item.status === 'active').map(item => item.id),
  );
  const activePolicies = (policies || []).filter(policy => activeIds.has(policy.organization_id));
  for (const policy of activePolicies) {
    let reason = null;
    if (!policy.execution_enabled) reason = 'Organization execution is disabled';
    else if (modelCalls > policy.max_model_calls_per_run) {
      reason = `Organization policy allows at most ${policy.max_model_calls_per_run} model calls per run`;
    } else if (models.some(model => !(policy.allowed_models || []).includes(model))) {
      reason = 'A selected model is not allowed by organization policy';
    } else if (
      policy.max_estimated_cost_usd !== null
      && Number(estimatedCostUsd) > Number(policy.max_estimated_cost_usd)
    ) {
      reason = 'Estimated run cost exceeds organization policy';
    }
    if (reason) {
      await recordOrganizationAudit({
        organizationId:policy.organization_id,
        actorUserId:userId,
        eventType:'policy.execution_denied',
        targetType:resourceType,
        targetId:resourceId,
        details:{ reason, model_calls:modelCalls, models, estimated_cost_usd:estimatedCostUsd },
      });
      const error = new Error(reason);
      error.status = 403;
      error.code = 'ORGANIZATION_POLICY_DENIED';
      error.policy = {
        organization_id:policy.organization_id,
        model_calls:modelCalls,
        estimated_cost_usd:estimatedCostUsd,
      };
      throw error;
    }
  }
  return { allowed:true, organizations:activePolicies.map(policy => policy.organization_id) };
}

import crypto from 'node:crypto';
import { Router } from 'express';

import {
  getOrganizationMembership,
  hasOrganizationRole,
  hydrateOrganizationResources,
  loadOwnedOrganizationResource,
  ORGANIZATION_RESOURCE_TYPES,
  organizationSlug,
  recordOrganizationAudit,
  requestAuditContext,
  requireOrganizationRole,
  validateOrganizationInput,
  validateOrganizationPolicy,
} from '../lib/organizations.js';
import { supabase } from '../lib/supabase.js';
import { getUsageSummary } from '../lib/usage.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const SAFE_ROLES = new Set(['admin', 'builder', 'viewer']);
const CHANGE_TYPES = new Set(['member_role', 'member_remove', 'policy_update', 'resource_remove']);

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function positiveInteger(value, fallback, maximum = 200) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

async function memberProfiles(members) {
  const ids = [...new Set((members || []).map(member => member.user_id))];
  if (!ids.length) return members || [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .in('id', ids);
  if (error) throw error;
  const profiles = new Map((data || []).map(profile => [profile.id, profile]));
  return (members || []).map(member => ({ ...member, profile:profiles.get(member.user_id) || null }));
}

async function organizationSummary(organizationIds) {
  if (!organizationIds.length) return [];
  const [
    organizationsResult,
    policiesResult,
    membersResult,
    resourcesResult,
  ] = await Promise.all([
    supabase.from('organizations').select('*').in('id', organizationIds),
    supabase.from('organization_policies').select('*').in('organization_id', organizationIds),
    supabase.from('organization_members').select('organization_id, status').in('organization_id', organizationIds),
    supabase.from('organization_resources').select('organization_id').in('organization_id', organizationIds),
  ]);
  const firstError = [
    organizationsResult.error,
    policiesResult.error,
    membersResult.error,
    resourcesResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;
  const policies = new Map((policiesResult.data || []).map(item => [item.organization_id, item]));
  return (organizationsResult.data || []).map(organization => ({
    ...organization,
    policy:policies.get(organization.id) || null,
    member_count:(membersResult.data || []).filter(
      member => member.organization_id === organization.id && member.status === 'active',
    ).length,
    resource_count:(resourcesResult.data || []).filter(
      resource => resource.organization_id === organization.id,
    ).length,
  }));
}

async function createGovernanceRequest({
  organizationId,
  actorUserId,
  changeType,
  targetType,
  targetId = null,
  payload,
  reason,
  requiredApprovals,
  req,
}) {
  if (!CHANGE_TYPES.has(changeType)) throw new Error('Unsupported governance change');
  const { data, error } = await supabase
    .from('governance_change_requests')
    .insert({
      organization_id:organizationId,
      requested_by:actorUserId,
      change_type:changeType,
      target_type:targetType,
      target_id:targetId,
      payload,
      reason,
      required_approvals:requiredApprovals,
    })
    .select()
    .single();
  if (error) throw error;
  await recordOrganizationAudit({
    organizationId,
    actorUserId,
    eventType:'governance.change_requested',
    targetType:'governance_request',
    targetId:data.id,
    details:requestAuditContext(req, {
      change_type:changeType,
      target_type:targetType,
      reason,
      required_approvals:requiredApprovals,
    }),
  });
  return data;
}

async function governanceContext(organizationId, requesterId) {
  const [{ data:policy, error }, { count, error:countError }] = await Promise.all([
    supabase.from('organization_policies').select('*')
      .eq('organization_id', organizationId).single(),
    supabase.from('organization_members').select('id', { count:'exact', head:true })
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .in('role', ['owner', 'admin'])
      .neq('user_id', requesterId),
  ]);
  if (error || countError) throw error || countError;
  return {
    policy,
    availableReviewers:count || 0,
    canGovern:(count || 0) >= policy.minimum_approvers,
  };
}

function governanceRequired(policy, changeType) {
  if (policy.approval_mode === 'all_changes') return true;
  if (policy.approval_mode === 'sensitive') {
    return ['member_role', 'member_remove', 'policy_update', 'resource_remove'].includes(changeType);
  }
  return false;
}

router.get('/', async (req, res, next) => {
  try {
    const { data:memberships, error } = await supabase
      .from('organization_members')
      .select('*')
      .eq('user_id', req.userId)
      .eq('status', 'active')
      .order('joined_at', { ascending:false });
    if (error) throw error;
    const organizations = await organizationSummary(
      (memberships || []).map(item => item.organization_id),
    );
    const membershipMap = new Map((memberships || []).map(item => [item.organization_id, item]));
    res.json(organizations.map(item => ({
      ...item,
      membership:membershipMap.get(item.id),
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const validated = validateOrganizationInput(req.body);
    if (validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0], details:validated.errors });
    }
    const usage = await getUsageSummary(req.userId);
    const limit = Number(usage.limits.organizations || 0);
    const { count, error:countError } = await supabase
      .from('organizations')
      .select('id', { count:'exact', head:true })
      .eq('owner_user_id', req.userId)
      .neq('status', 'archived');
    if (countError) throw countError;
    if ((count || 0) >= limit) {
      return res.status(429).json({ error:'Your organization limit is reached' });
    }
    const slug = organizationSlug(validated.value.name, crypto.randomUUID().slice(0, 10));
    const { data, error } = await supabase.rpc('create_organization', {
      p_owner_user_id:req.userId,
      p_slug:slug,
      p_name:validated.value.name,
      p_description:validated.value.description,
    });
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/invitations/accept', async (req, res, next) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token.length < 32 || token.length > 256) {
      return res.status(400).json({ error:'A valid invitation token is required' });
    }
    const email = req.user?.email;
    if (!email) return res.status(400).json({ error:'The signed-in account has no email address' });
    const { data, error } = await supabase.rpc('accept_organization_invitation', {
      p_user_id:req.userId,
      p_user_email:email,
      p_token_hash:hashToken(token),
    });
    if (error) {
      const status = /match/i.test(error.message) ? 403 : 409;
      return res.status(status).json({ error:error.message });
    }
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/resource-options', async (req, res, next) => {
  try {
    const groups = await Promise.all(
      Object.entries(ORGANIZATION_RESOURCE_TYPES).map(async ([type, definition]) => {
        const { data, error } = await supabase
          .from(definition.table)
          .select(definition.select)
          .eq('user_id', req.userId)
          .order('created_at', { ascending:false })
          .limit(200);
        if (error) throw error;
        return [type, data || []];
      }),
    );
    res.json(Object.fromEntries(groups));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const membership = await requireOrganizationRole(req.params.id, req.userId, 'viewer');
    const [
      membersResult,
      resourcesResult,
      policyResult,
      requestsResult,
      invitationsResult,
      exportResult,
    ] = await Promise.all([
      supabase.from('organization_members').select('*')
        .eq('organization_id', req.params.id).order('joined_at'),
      supabase.from('organization_resources').select('*')
        .eq('organization_id', req.params.id).order('created_at', { ascending:false }),
      supabase.from('organization_policies').select('*')
        .eq('organization_id', req.params.id).single(),
      supabase.from('governance_change_requests')
        .select('*, decisions:governance_change_decisions(*)')
        .eq('organization_id', req.params.id).order('created_at', { ascending:false }).limit(100),
      hasOrganizationRole(membership.role, 'admin')
        ? supabase.from('organization_invitations').select('*')
          .eq('organization_id', req.params.id).order('created_at', { ascending:false }).limit(100)
        : Promise.resolve({ data:[], error:null }),
      hasOrganizationRole(membership.role, 'admin')
        ? supabase.from('compliance_exports').select('*')
          .eq('organization_id', req.params.id).order('created_at', { ascending:false }).limit(50)
        : Promise.resolve({ data:[], error:null }),
    ]);
    const firstError = [
      membersResult.error,
      resourcesResult.error,
      policyResult.error,
      requestsResult.error,
      invitationsResult.error,
      exportResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;
    res.json({
      organization:membership.organizations,
      membership,
      members:await memberProfiles(membersResult.data || []),
      resources:await hydrateOrganizationResources(resourcesResult.data || []),
      policy:policyResult.data,
      governance_requests:requestsResult.data || [],
      invitations:invitationsResult.data || [],
      compliance_exports:exportResult.data || [],
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const validated = validateOrganizationInput(req.body, { partial:true });
    if (validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0], details:validated.errors });
    }
    if (!Object.keys(validated.value).length) {
      return res.status(400).json({ error:'No organization changes were provided' });
    }
    const { data, error } = await supabase
      .from('organizations')
      .update(validated.value)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'organization.updated',
      targetType:'organization',
      targetId:req.params.id,
      details:requestAuditContext(req, { fields:Object.keys(validated.value) }),
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/archive', async (req, res, next) => {
  try {
    const membership = await getOrganizationMembership(req.params.id, req.userId);
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ error:'Owner organization access required' });
    }
    const nextStatus = req.body?.archived === false ? 'active' : 'archived';
    const { data, error } = await supabase
      .from('organizations')
      .update({ status:nextStatus })
      .eq('id', req.params.id)
      .eq('owner_user_id', req.userId)
      .select()
      .single();
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:nextStatus === 'archived' ? 'organization.archived' : 'organization.restored',
      targetType:'organization',
      targetId:req.params.id,
      details:requestAuditContext(req, { previous_status:membership.organizations.status }),
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const membership = await getOrganizationMembership(req.params.id, req.userId);
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ error:'Owner organization access required' });
    }
    const confirmationSlug = typeof req.body?.confirmation_slug === 'string'
      ? req.body.confirmation_slug.trim() : '';
    if (!confirmationSlug) {
      return res.status(400).json({ error:'Organization confirmation slug is required' });
    }
    const { data, error } = await supabase.rpc('delete_organization', {
      p_organization_id:req.params.id,
      p_owner_user_id:req.userId,
      p_confirmation_slug:confirmationSlug,
    });
    if (error) {
      const status = /archive/i.test(error.message) ? 409
        : /confirmation/i.test(error.message) ? 400 : 404;
      return res.status(status).json({ error:error.message });
    }
    res.json({ success:data === true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/invitations', async (req, res, next) => {
  try {
    const membership = await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const role = req.body?.role;
    const expiryDays = positiveInteger(req.body?.expiry_days, 7, 30);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error:'A valid invitation email is required' });
    }
    if (!SAFE_ROLES.has(role)) return res.status(400).json({ error:'Invitation role is invalid' });
    if (role === 'admin' && membership.role !== 'owner') {
      return res.status(403).json({ error:'Only the organization owner can invite administrators' });
    }
    const usage = await getUsageSummary(membership.organizations.owner_user_id);
    const memberLimit = Number(usage.limits.organization_members || 0);
    const [{ count, error:countError }, { count:pendingCount, error:pendingError }] =
      await Promise.all([
        supabase.from('organization_members')
          .select('id', { count:'exact', head:true })
          .eq('organization_id', req.params.id)
          .eq('status', 'active'),
        supabase.from('organization_invitations')
          .select('id', { count:'exact', head:true })
          .eq('organization_id', req.params.id)
          .is('accepted_at', null)
          .is('revoked_at', null)
          .gt('expires_at', new Date().toISOString()),
      ]);
    if (countError || pendingError) throw countError || pendingError;
    if ((count || 0) + (pendingCount || 0) >= memberLimit) {
      return res.status(429).json({ error:'This organization member limit is reached' });
    }
    const { error:expireError } = await supabase
      .from('organization_invitations')
      .update({ revoked_at:new Date().toISOString() })
      .eq('organization_id', req.params.id)
      .eq('email', email)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .lte('expires_at', new Date().toISOString());
    if (expireError) throw expireError;
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + expiryDays * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from('organization_invitations')
      .insert({
        organization_id:req.params.id,
        email,
        role,
        token_hash:hashToken(rawToken),
        invited_by:req.userId,
        expires_at:expiresAt,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error:'A pending invitation already exists for this email' });
      }
      throw error;
    }
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'invitation.created',
      targetType:'invitation',
      targetId:data.id,
      details:requestAuditContext(req, { email_hash:hashToken(email), role, expires_at:expiresAt }),
    });
    res.status(201).json({
      invitation:{ ...data, token_hash:undefined },
      token:rawToken,
      acceptance_path:`/organizations?invite=${encodeURIComponent(rawToken)}`,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/invitations/:invitationId', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const { data, error } = await supabase
      .from('organization_invitations')
      .update({ revoked_at:new Date().toISOString() })
      .eq('id', req.params.invitationId)
      .eq('organization_id', req.params.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Pending invitation not found' });
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'invitation.revoked',
      targetType:'invitation',
      targetId:data.id,
      details:requestAuditContext(req, { email_hash:hashToken(data.email) }),
    });
    res.json({ success:true });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/members/:userId', async (req, res, next) => {
  try {
    const actor = await requireOrganizationRole(req.params.id, req.userId, 'owner');
    const role = req.body?.role;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!SAFE_ROLES.has(role)) return res.status(400).json({ error:'Member role is invalid' });
    const { data:target, error:targetError } = await supabase
      .from('organization_members').select('*')
      .eq('organization_id', req.params.id)
      .eq('user_id', req.params.userId)
      .eq('status', 'active')
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.role === 'owner') {
      return res.status(404).json({ error:'Editable organization member not found' });
    }
    const governance = await governanceContext(req.params.id, req.userId);
    if (governanceRequired(governance.policy, 'member_role') && governance.canGovern) {
      if (reason.length < 3) return res.status(400).json({ error:'A reason is required for governed changes' });
      const request = await createGovernanceRequest({
        organizationId:req.params.id,
        actorUserId:req.userId,
        changeType:'member_role',
        targetType:'member',
        targetId:target.id,
        payload:{ user_id:target.user_id, role },
        reason,
        requiredApprovals:governance.policy.minimum_approvers,
        req,
      });
      return res.status(202).json({ governed:true, request });
    }
    const { data, error } = await supabase
      .from('organization_members')
      .update({ role })
      .eq('id', target.id)
      .select()
      .single();
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'member.role_changed',
      targetType:'member',
      targetId:target.id,
      details:requestAuditContext(req, {
        previous_role:target.role,
        role,
        governance_bypassed:governanceRequired(governance.policy, 'member_role'),
        actor_role:actor.role,
      }),
    });
    res.json({ governed:false, member:data });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const actor = await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const { data:target, error:targetError } = await supabase
      .from('organization_members').select('*')
      .eq('organization_id', req.params.id)
      .eq('user_id', req.params.userId)
      .eq('status', 'active')
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.role === 'owner') {
      return res.status(404).json({ error:'Removable organization member not found' });
    }
    if (actor.role !== 'owner' && target.role === 'admin') {
      return res.status(403).json({ error:'Only the owner can remove an administrator' });
    }
    const governance = await governanceContext(req.params.id, req.userId);
    if (governanceRequired(governance.policy, 'member_remove') && governance.canGovern) {
      if (reason.length < 3) return res.status(400).json({ error:'A reason is required for governed changes' });
      const request = await createGovernanceRequest({
        organizationId:req.params.id,
        actorUserId:req.userId,
        changeType:'member_remove',
        targetType:'member',
        targetId:target.id,
        payload:{ user_id:target.user_id },
        reason,
        requiredApprovals:governance.policy.minimum_approvers,
        req,
      });
      return res.status(202).json({ governed:true, request });
    }
    const { error } = await supabase.from('organization_members').delete().eq('id', target.id);
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'member.removed',
      targetType:'member',
      targetId:target.id,
      details:requestAuditContext(req, {
        removed_user_id:target.user_id,
        previous_role:target.role,
        governance_bypassed:governanceRequired(governance.policy, 'member_remove'),
      }),
    });
    res.json({ governed:false, success:true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/resources', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'builder');
    const resourceType = req.body?.resource_type;
    const resourceId = req.body?.resource_id;
    const accessLevel = req.body?.access_level || 'view';
    if (!ORGANIZATION_RESOURCE_TYPES[resourceType]) {
      return res.status(400).json({ error:'Shared resource type is invalid' });
    }
    if (!/^[0-9a-f-]{36}$/i.test(String(resourceId || ''))) {
      return res.status(400).json({ error:'A valid shared resource is required' });
    }
    if (!['view', 'run', 'edit'].includes(accessLevel)) {
      return res.status(400).json({ error:'Shared access level is invalid' });
    }
    const owned = await loadOwnedOrganizationResource(resourceType, resourceId, req.userId);
    if (!owned) return res.status(404).json({ error:'Owned resource not found' });
    const { data, error } = await supabase
      .from('organization_resources')
      .insert({
        organization_id:req.params.id,
        resource_type:resourceType,
        resource_id:resourceId,
        access_level:accessLevel,
        shared_by:req.userId,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error:'Resource is already shared' });
      throw error;
    }
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'resource.shared',
      targetType:resourceType,
      targetId:resourceId,
      details:requestAuditContext(req, { access_level:accessLevel, name:owned.name }),
    });
    res.status(201).json((await hydrateOrganizationResources([data]))[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/resources/:resourceShareId', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'builder');
    const { data:share, error:shareError } = await supabase
      .from('organization_resources').select('*')
      .eq('id', req.params.resourceShareId)
      .eq('organization_id', req.params.id)
      .maybeSingle();
    if (shareError) throw shareError;
    if (!share) return res.status(404).json({ error:'Shared resource not found' });
    const governance = await governanceContext(req.params.id, req.userId);
    if (governanceRequired(governance.policy, 'resource_remove') && governance.canGovern) {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (reason.length < 3) return res.status(400).json({ error:'A reason is required for governed changes' });
      const request = await createGovernanceRequest({
        organizationId:req.params.id,
        actorUserId:req.userId,
        changeType:'resource_remove',
        targetType:'resource',
        targetId:share.id,
        payload:{ resource_id:share.id },
        reason,
        requiredApprovals:governance.policy.minimum_approvers,
        req,
      });
      return res.status(202).json({ governed:true, request });
    }
    const { error } = await supabase.from('organization_resources').delete().eq('id', share.id);
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'resource.unshared',
      targetType:share.resource_type,
      targetId:share.resource_id,
      details:requestAuditContext(req, {
        governance_bypassed:governanceRequired(governance.policy, 'resource_remove'),
      }),
    });
    res.json({ governed:false, success:true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/resources/:resourceShareId/clone', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'builder');
    const { data:share, error } = await supabase
      .from('organization_resources').select('*')
      .eq('id', req.params.resourceShareId)
      .eq('organization_id', req.params.id)
      .in('access_level', ['run', 'edit'])
      .maybeSingle();
    if (error) throw error;
    if (!share) return res.status(404).json({ error:'Reusable shared resource not found' });
    let clone;
    if (share.resource_type === 'agent') {
      const { data:agent } = await supabase.from('agents').select('*')
        .eq('id', share.resource_id).maybeSingle();
      if (!agent?.published_version_id) {
        return res.status(409).json({ error:'Shared agent has no published version' });
      }
      const { data:version, error:versionError } = await supabase
        .from('agent_versions').select('*').eq('id', agent.published_version_id).single();
      if (versionError) throw versionError;
      const { data:created, error:createError } = await supabase.from('agents').insert({
        user_id:req.userId,
        name:`${version.name} Team Copy`.slice(0, 80),
        description:version.description,
        category:version.category,
        system_prompt:version.system_prompt,
        personality:version.personality,
        model:version.model,
        temperature:version.temperature,
        max_tokens:version.max_tokens,
        status:'draft',
        has_unpublished_changes:true,
      }).select().single();
      if (createError) throw createError;
      if (version.tool_slugs?.length) {
        const { data:tools, error:toolError } = await supabase.from('tools')
          .select('id, slug').in('slug', version.tool_slugs).eq('is_available', true);
        if (toolError) throw toolError;
        if (tools?.length) {
          const { error:attachError } = await supabase.from('agent_tools').insert(
            tools.map(tool => ({ agent_id:created.id, tool_id:tool.id })),
          );
          if (attachError) throw attachError;
        }
      }
      clone = { asset_type:'agent', resource:created };
    } else if (share.resource_type === 'workflow') {
      const { data:workflow, error:workflowError } = await supabase.from('workflows')
        .select('*').eq('id', share.resource_id).single();
      if (workflowError) throw workflowError;
      const { data:created, error:createError } = await supabase.from('workflows').insert({
        user_id:req.userId,
        name:`${workflow.name} Team Copy`.slice(0, 100),
        description:workflow.description,
        nodes:workflow.nodes,
        edges:workflow.edges,
        status:'draft',
        version:1,
      }).select().single();
      if (createError) throw createError;
      clone = { asset_type:'workflow', resource:created };
    } else {
      return res.status(409).json({
        error:'Only shared agents and workflows can currently be cloned',
      });
    }
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'resource.cloned',
      targetType:share.resource_type,
      targetId:share.resource_id,
      details:requestAuditContext(req, {
        cloned_resource_id:clone.resource.id,
        access_level:share.access_level,
      }),
    });
    res.status(201).json(clone);
  } catch (error) {
    next(error);
  }
});

router.put('/:id/policy', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const validated = validateOrganizationPolicy(req.body);
    if (validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0], details:validated.errors });
    }
    const governance = await governanceContext(req.params.id, req.userId);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (governanceRequired(governance.policy, 'policy_update') && governance.canGovern) {
      if (reason.length < 3) return res.status(400).json({ error:'A reason is required for governed changes' });
      const request = await createGovernanceRequest({
        organizationId:req.params.id,
        actorUserId:req.userId,
        changeType:'policy_update',
        targetType:'policy',
        targetId:null,
        payload:validated.value,
        reason,
        requiredApprovals:governance.policy.minimum_approvers,
        req,
      });
      return res.status(202).json({ governed:true, request });
    }
    const { data, error } = await supabase
      .from('organization_policies')
      .update({ ...validated.value, updated_by:req.userId })
      .eq('organization_id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'policy.updated',
      targetType:'policy',
      details:requestAuditContext(req, {
        fields:Object.keys(validated.value),
        governance_bypassed:governanceRequired(governance.policy, 'policy_update'),
      }),
    });
    res.json({ governed:false, policy:data });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/governance/:requestId/decision', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const decision = req.body?.decision;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error:'Decision must be approve or reject' });
    }
    const { data:request } = await supabase.from('governance_change_requests')
      .select('organization_id').eq('id', req.params.requestId).maybeSingle();
    if (!request || request.organization_id !== req.params.id) {
      return res.status(404).json({ error:'Governance request not found' });
    }
    const { data, error } = await supabase.rpc('decide_governance_change', {
      p_request_id:req.params.requestId,
      p_actor_user_id:req.userId,
      p_decision:decision,
      p_note:note,
    });
    if (error) {
      const status = /access|required|own|reviewer|themselves|conflict/i.test(error.message)
        ? 403 : 409;
      return res.status(status).json({ error:error.message });
    }
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/governance/:requestId', async (req, res, next) => {
  try {
    const membership = await requireOrganizationRole(req.params.id, req.userId, 'viewer');
    let query = supabase.from('governance_change_requests')
      .update({ status:'cancelled' })
      .eq('id', req.params.requestId)
      .eq('organization_id', req.params.id)
      .eq('status', 'pending');
    if (!hasOrganizationRole(membership.role, 'admin')) query = query.eq('requested_by', req.userId);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Pending governance request not found' });
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'governance.change_cancelled',
      targetType:'governance_request',
      targetId:data.id,
      details:requestAuditContext(req, { change_type:data.change_type }),
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/audit', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'viewer');
    const limit = positiveInteger(req.query.limit, 100, 200);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    let query = supabase.from('organization_audit_events')
      .select('*', { count:'exact' })
      .eq('organization_id', req.params.id)
      .order('sequence_number', { ascending:false })
      .range(offset, offset + limit - 1);
    if (req.query.event_type) query = query.eq('event_type', String(req.query.event_type));
    if (req.query.actor_user_id) query = query.eq('actor_user_id', String(req.query.actor_user_id));
    if (req.query.from) query = query.gte('occurred_at', String(req.query.from));
    if (req.query.to) query = query.lte('occurred_at', String(req.query.to));
    const { data, error, count } = await query;
    if (error) throw error;
    const { data:checkpoints, error:checkpointError } = await supabase
      .from('audit_retention_checkpoints').select('*')
      .eq('organization_id', req.params.id)
      .order('created_at', { ascending:false }).limit(20);
    if (checkpointError) throw checkpointError;
    res.json({ events:data || [], total:count || 0, checkpoints:checkpoints || [] });
  } catch (error) {
    next(error);
  }
});

function csvCell(value) {
  const string = value === null || value === undefined
    ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return `"${string.replaceAll('"', '""')}"`;
}

router.get('/:id/compliance/export', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const { data:policy, error:policyError } = await supabase.from('organization_policies')
      .select('*').eq('organization_id', req.params.id).single();
    if (policyError) throw policyError;
    if (!policy.compliance_export_enabled) {
      return res.status(403).json({ error:'Compliance exports are disabled by organization policy' });
    }
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    if ((from && Number.isNaN(from.valueOf())) || (to && Number.isNaN(to.valueOf()))) {
      return res.status(400).json({ error:'Export date range is invalid' });
    }
    let eventQuery = supabase.from('organization_audit_events').select('*')
      .eq('organization_id', req.params.id)
      .order('sequence_number')
      .limit(10000);
    if (from) eventQuery = eventQuery.gte('occurred_at', from.toISOString());
    if (to) eventQuery = eventQuery.lte('occurred_at', to.toISOString());
    const [
      organizationResult,
      membersResult,
      resourcesResult,
      eventsResult,
      checkpointsResult,
    ] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', req.params.id).single(),
      supabase.from('organization_members').select('*').eq('organization_id', req.params.id),
      supabase.from('organization_resources').select('*').eq('organization_id', req.params.id),
      eventQuery,
      supabase.from('audit_retention_checkpoints').select('*')
        .eq('organization_id', req.params.id).order('created_at'),
    ]);
    const firstError = [
      organizationResult.error,
      membersResult.error,
      resourcesResult.error,
      eventsResult.error,
      checkpointsResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;
    const events = eventsResult.data || [];
    const body = format === 'csv'
      ? [
        [
          'sequence_number', 'occurred_at', 'event_type', 'actor_user_id',
          'target_type', 'target_id', 'previous_hash', 'event_hash', 'details',
        ].map(csvCell).join(','),
        ...events.map(event => [
          event.sequence_number,
          event.occurred_at,
          event.event_type,
          event.actor_user_id,
          event.target_type,
          event.target_id,
          event.previous_hash,
          event.event_hash,
          event.details,
        ].map(csvCell).join(',')),
      ].join('\n')
      : JSON.stringify({
        schema_version:1,
        generated_at:new Date().toISOString(),
        organization:organizationResult.data,
        policy,
        members:membersResult.data || [],
        resources:await hydrateOrganizationResources(resourcesResult.data || []),
        audit_events:events,
        retention_checkpoints:checkpointsResult.data || [],
      }, null, 2);
    const contentHash = crypto.createHash('sha256').update(body).digest('hex');
    const { data:exportRecord, error:exportError } = await supabase
      .from('compliance_exports')
      .insert({
        organization_id:req.params.id,
        requested_by:req.userId,
        export_format:format,
        date_from:from?.toISOString() || null,
        date_to:to?.toISOString() || null,
        record_count:events.length,
        content_sha256:contentHash,
      })
      .select()
      .single();
    if (exportError) throw exportError;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'compliance.exported',
      targetType:'compliance_export',
      targetId:exportRecord.id,
      details:requestAuditContext(req, {
        format,
        record_count:events.length,
        content_sha256:contentHash,
      }),
    });
    res.set({
      'Content-Type':format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition':`attachment; filename="${organizationResult.data.slug}-compliance.${format}"`,
      'X-AgentForge-Content-SHA256':contentHash,
      'X-AgentForge-Audit-Records':String(events.length),
    });
    res.send(body);
  } catch (error) {
    next(error);
  }
});

export default router;

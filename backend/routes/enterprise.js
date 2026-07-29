import { Router } from 'express';

import {
  createEnterpriseToken,
  hashEnterpriseToken,
  normalizeOrganizationDomain,
  scimBearerToken,
  validateIdentitySettings,
  verifyOrganizationDomainDns,
} from '../lib/enterprise.js';
import {
  recordOrganizationAudit,
  requestAuditContext,
  requireOrganizationRole,
} from '../lib/organizations.js';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

async function requireScim(req, res, next) {
  try {
    const token = scimBearerToken(req);
    if (token.length < 32) return res.status(401).json(scimError('SCIM authentication required'));
    const { data:settings, error } = await supabase
      .from('organization_identity_settings')
      .select('organization_id, scim_enabled, scim_token_hash')
      .eq('organization_id', req.params.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (
      !settings?.scim_enabled
      || !settings.scim_token_hash
      || hashEnterpriseToken(token) !== settings.scim_token_hash
    ) {
      return res.status(401).json(scimError('SCIM token is invalid or disabled'));
    }
    req.scimSettings = settings;
    next();
  } catch (error) {
    next(error);
  }
}

router.get('/scim/v2/:organizationId/Users', requireScim, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('organization_directory_users')
      .select('*')
      .eq('organization_id', req.params.organizationId)
      .order('email');
    if (error) throw error;
    res.json({
      schemas:['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults:data?.length || 0,
      startIndex:1,
      itemsPerPage:data?.length || 0,
      Resources:(data || []).map(scimUser),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/scim/v2/:organizationId/Users', requireScim, async (req, res, next) => {
  try {
    const externalId = String(req.body?.externalId || req.body?.id || '').trim();
    const email = String(req.body?.userName || '').trim().toLowerCase();
    const displayName = String(req.body?.displayName || '').trim();
    const active = req.body?.active !== false;
    const requestedRole = req.body?.['urn:agentforge:params:scim:schemas:extension:2.0:User']
      ?.role || 'viewer';
    if (!externalId || externalId.length > 255) {
      return res.status(400).json(scimError('externalId is required', 'invalidValue'));
    }
    if (!validEmail(email)) {
      return res.status(400).json(scimError('A valid userName email is required', 'invalidValue'));
    }
    if (!['viewer', 'builder'].includes(requestedRole)) {
      return res.status(400).json(scimError('SCIM role must be viewer or builder', 'invalidValue'));
    }
    const domain = email.split('@')[1];
    const { data:verifiedDomain, error:domainError } = await supabase
      .from('organization_domains')
      .select('id')
      .eq('organization_id', req.params.organizationId)
      .eq('domain', domain)
      .eq('status', 'verified')
      .maybeSingle();
    if (domainError) throw domainError;
    if (!verifiedDomain) {
      return res.status(409).json(scimError('Email domain is not verified', 'uniqueness'));
    }
    const { data, error } = await supabase
      .from('organization_directory_users')
      .upsert({
        organization_id:req.params.organizationId,
        external_id:externalId,
        email,
        display_name:displayName.slice(0, 200) || null,
        requested_role:requestedRole,
        active,
        deprovisioned_at:active ? null : new Date().toISOString(),
        attributes:cleanScimAttributes(req.body),
        external_version:String(req.body?.meta?.version || '').slice(0, 200) || null,
        last_synced_at:new Date().toISOString(),
      }, { onConflict:'organization_id,external_id' })
      .select()
      .single();
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.organizationId,
      actorUserId:null,
      eventType:'identity.scim_user_provisioned',
      targetType:'directory_user',
      targetId:data.id,
      details:{ email_domain:domain, active, requested_role:requestedRole },
    });
    res.status(201).json(scimUser(data));
  } catch (error) {
    next(error);
  }
});

router.patch('/scim/v2/:organizationId/Users/:directoryUserId', requireScim, async (req, res, next) => {
  try {
    const patch = {};
    if (Object.hasOwn(req.body || {}, 'active')) {
      patch.active = req.body.active === true;
      patch.deprovisioned_at = patch.active ? null : new Date().toISOString();
    }
    if (typeof req.body?.displayName === 'string') {
      patch.display_name = req.body.displayName.trim().slice(0, 200) || null;
    }
    patch.last_synced_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('organization_directory_users')
      .update(patch)
      .eq('id', req.params.directoryUserId)
      .eq('organization_id', req.params.organizationId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json(scimError('Directory user not found'));
    await recordOrganizationAudit({
      organizationId:req.params.organizationId,
      actorUserId:null,
      eventType:data.active
        ? 'identity.scim_user_reactivated' : 'identity.scim_user_deprovisioned',
      targetType:'directory_user',
      targetId:data.id,
      details:{ active:data.active, email_domain:data.email.split('@')[1] },
    });
    res.json(scimUser(data));
  } catch (error) {
    next(error);
  }
});

router.use(requireAuth);

router.get('/organizations/:id', async (req, res, next) => {
  try {
    const membership = await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const [settings, domains, directory, reviews, items] = await Promise.all([
      tableOne('organization_identity_settings', req.params.id),
      tableMany('organization_domains', req.params.id, 'created_at'),
      tableMany('organization_directory_users', req.params.id, 'last_synced_at'),
      tableMany('organization_access_reviews', req.params.id, 'created_at'),
      tableMany('organization_access_review_items', req.params.id, 'created_at'),
    ]);
    const profileIds = [...new Set(items.map(item => item.member_user_id))];
    const profiles = profileIds.length
      ? await supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', profileIds)
      : { data:[], error:null };
    if (profiles.error) throw profiles.error;
    const profileMap = new Map((profiles.data || []).map(profile => [profile.id, profile]));
    res.json({
      membership,
      settings,
      domains,
      directory_users:directory,
      access_reviews:reviews.map(review => ({
        ...review,
        items:items
          .filter(item => item.review_id === review.id)
          .map(item => ({ ...item, profile:profileMap.get(item.member_user_id) || null })),
      })),
      capabilities:{
        dns_verification:true,
        sso_configuration:true,
        scim_v2:true,
        access_review_enforcement:true,
        native_sso_login:false,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/organizations/:id/domains', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'owner');
    const domain = normalizeOrganizationDomain(req.body?.domain);
    const token = createEnterpriseToken(24);
    const { data, error } = await supabase
      .from('organization_domains')
      .insert({
        organization_id:req.params.id,
        domain,
        verification_token_hash:hashEnterpriseToken(token),
        created_by:req.userId,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error:'This domain is already registered' });
      }
      throw error;
    }
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'identity.domain_added',
      targetType:'organization_domain',
      targetId:data.id,
      details:requestAuditContext(req, { domain }),
    });
    res.status(201).json({
      domain:data,
      verification:{
        record_type:'TXT',
        record_name:`_agentforge-verify.${domain}`,
        record_value:`agentforge-verification=${token}`,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/organizations/:id/domains/:domainId/verify', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'owner');
    const token = String(req.body?.token || '').trim();
    const { data:domain, error } = await supabase
      .from('organization_domains')
      .select('*')
      .eq('id', req.params.domainId)
      .eq('organization_id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!domain) return res.status(404).json({ error:'Organization domain not found' });
    if (token.length < 20 || hashEnterpriseToken(token) !== domain.verification_token_hash) {
      return res.status(403).json({ error:'Domain verification token is invalid' });
    }
    try {
      await verifyOrganizationDomainDns(domain.domain, token);
    } catch (verifyError) {
      await supabase.from('organization_domains').update({
        status:'failed',
        last_checked_at:new Date().toISOString(),
      }).eq('id', domain.id);
      throw verifyError;
    }
    const now = new Date().toISOString();
    const { data, error:updateError } = await supabase
      .from('organization_domains')
      .update({ status:'verified', verified_at:now, last_checked_at:now })
      .eq('id', domain.id)
      .select()
      .single();
    if (updateError) throw updateError;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'identity.domain_verified',
      targetType:'organization_domain',
      targetId:domain.id,
      details:requestAuditContext(req, { domain:domain.domain, method:'dns_txt' }),
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/organizations/:id/domains/:domainId', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'owner');
    const { data, error } = await supabase
      .from('organization_domains')
      .delete()
      .eq('id', req.params.domainId)
      .eq('organization_id', req.params.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Organization domain not found' });
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'identity.domain_removed',
      targetType:'organization_domain',
      targetId:data.id,
      details:requestAuditContext(req, { domain:data.domain }),
    });
    res.json({ success:true });
  } catch (error) {
    next(error);
  }
});

router.put('/organizations/:id/settings', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'owner');
    const settings = validateIdentitySettings(req.body);
    if (settings.sso_enforced) {
      const { count, error } = await supabase
        .from('organization_domains')
        .select('id', { count:'exact', head:true })
        .eq('organization_id', req.params.id)
        .eq('status', 'verified');
      if (error) throw error;
      if (!count) return res.status(409).json({ error:'Verify an organization domain before enforcing SSO' });
    }
    const { data, error } = await supabase
      .from('organization_identity_settings')
      .upsert({
        organization_id:req.params.id,
        ...settings,
        updated_by:req.userId,
        updated_at:new Date().toISOString(),
      }, { onConflict:'organization_id' })
      .select()
      .single();
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'identity.settings_updated',
      targetType:'identity_settings',
      targetId:req.params.id,
      details:requestAuditContext(req, {
        protocol:settings.protocol,
        sso_enabled:settings.sso_enabled,
        sso_enforced:settings.sso_enforced,
        require_mfa:settings.require_mfa,
        session_max_minutes:settings.session_max_minutes,
        idle_timeout_minutes:settings.idle_timeout_minutes,
        scim_enabled:settings.scim_enabled,
      }),
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/organizations/:id/scim-token', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'owner');
    const token = `af_scim_${createEnterpriseToken()}`;
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('organization_identity_settings')
      .upsert({
        organization_id:req.params.id,
        scim_enabled:true,
        scim_token_hash:hashEnterpriseToken(token),
        scim_token_last_four:token.slice(-4),
        scim_token_rotated_at:now,
        updated_by:req.userId,
        updated_at:now,
      }, { onConflict:'organization_id' })
      .select()
      .single();
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'identity.scim_token_rotated',
      targetType:'identity_settings',
      targetId:req.params.id,
      details:requestAuditContext(req, { last_four:token.slice(-4) }),
    });
    res.json({ settings:data, token, shown_once:true });
  } catch (error) {
    next(error);
  }
});

router.post('/organizations/:id/access-reviews', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const name = String(req.body?.name || '').trim();
    const dueDays = Number(req.body?.due_days);
    const notes = String(req.body?.notes || '').trim();
    if (name.length < 2 || name.length > 160) {
      return res.status(400).json({ error:'Review name must be between 2 and 160 characters' });
    }
    if (!Number.isInteger(dueDays) || dueDays < 1 || dueDays > 365) {
      return res.status(400).json({ error:'Review due date must be between 1 and 365 days' });
    }
    if (notes.length > 2000) return res.status(400).json({ error:'Notes must be 2,000 characters or fewer' });
    const { data, error } = await supabase.rpc('create_access_review', {
      p_organization_id:req.params.id,
      p_actor_user_id:req.userId,
      p_name:name,
      p_due_at:new Date(Date.now() + dueDays * 86400000).toISOString(),
      p_notes:notes,
    });
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'identity.access_review_started',
      targetType:'access_review',
      targetId:data.id,
      details:requestAuditContext(req, { name, due_days:dueDays }),
    });
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/organizations/:id/access-reviews/:reviewId/items/:itemId', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const decision = req.body?.decision;
    const recommendedRole = req.body?.recommended_role || null;
    const note = String(req.body?.note || '').trim();
    if (!['retain', 'change', 'revoke'].includes(decision)) {
      return res.status(400).json({ error:'Decision must be retain, change, or revoke' });
    }
    if (decision === 'change' && !['admin', 'builder', 'viewer'].includes(recommendedRole)) {
      return res.status(400).json({ error:'Choose a valid recommended role' });
    }
    if (note.length > 1000) return res.status(400).json({ error:'Decision note must be 1,000 characters or fewer' });
    const { data:item, error:itemError } = await supabase
      .from('organization_access_review_items')
      .select('*')
      .eq('id', req.params.itemId)
      .eq('review_id', req.params.reviewId)
      .eq('organization_id', req.params.id)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) return res.status(404).json({ error:'Access review item not found' });
    if (item.member_user_id === req.userId && decision !== 'retain') {
      return res.status(409).json({ error:'Reviewers cannot change or revoke their own access' });
    }
    if (item.snapshot_role === 'owner' && decision !== 'retain') {
      return res.status(409).json({ error:'Owner access cannot be changed by an access review' });
    }
    const { data, error } = await supabase.rpc('complete_access_review_item', {
      p_review_id:req.params.reviewId,
      p_item_id:req.params.itemId,
      p_actor_user_id:req.userId,
      p_decision:decision,
      p_recommended_role:recommendedRole,
      p_note:note,
    });
    if (error) throw error;
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:`identity.access_review_${decision}`,
      targetType:'organization_member',
      targetId:item.member_user_id,
      details:requestAuditContext(req, {
        review_id:req.params.reviewId,
        previous_role:item.snapshot_role,
        recommended_role:recommendedRole,
        note,
      }),
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.delete('/organizations/:id/access-reviews/:reviewId', async (req, res, next) => {
  try {
    await requireOrganizationRole(req.params.id, req.userId, 'admin');
    const { data, error } = await supabase
      .from('organization_access_reviews')
      .update({
        status:'cancelled',
        cancelled_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      })
      .eq('id', req.params.reviewId)
      .eq('organization_id', req.params.id)
      .eq('status', 'open')
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Open access review not found' });
    await recordOrganizationAudit({
      organizationId:req.params.id,
      actorUserId:req.userId,
      eventType:'identity.access_review_cancelled',
      targetType:'access_review',
      targetId:data.id,
      details:requestAuditContext(req),
    });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

async function tableOne(table, organizationId) {
  const { data, error } = await supabase
    .from(table).select('*').eq('organization_id', organizationId).maybeSingle();
  if (error) throw error;
  return data;
}

async function tableMany(table, organizationId, orderColumn) {
  const { data, error } = await supabase
    .from(table).select('*').eq('organization_id', organizationId)
    .order(orderColumn, { ascending:false }).limit(500);
  if (error) throw error;
  return data || [];
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320;
}

function cleanScimAttributes(body) {
  return {
    locale:String(body?.locale || '').slice(0, 40) || null,
    timezone:String(body?.timezone || '').slice(0, 80) || null,
    title:String(body?.title || '').slice(0, 160) || null,
    department:String(body?.department || '').slice(0, 160) || null,
  };
}

function scimUser(item) {
  return {
    schemas:[
      'urn:ietf:params:scim:schemas:core:2.0:User',
      'urn:agentforge:params:scim:schemas:extension:2.0:User',
    ],
    id:item.id,
    externalId:item.external_id,
    userName:item.email,
    displayName:item.display_name,
    active:item.active,
    'urn:agentforge:params:scim:schemas:extension:2.0:User':{
      role:item.requested_role,
      linkedUserId:item.linked_user_id,
    },
    meta:{
      resourceType:'User',
      created:item.provisioned_at,
      lastModified:item.last_synced_at,
      version:item.external_version,
    },
  };
}

function scimError(detail, scimType = 'invalidValue') {
  return {
    schemas:['urn:ietf:params:scim:api:messages:2.0:Error'],
    detail,
    scimType,
  };
}

export default router;

import crypto from 'node:crypto';
import { Router } from 'express';

import {
  isMarketplaceCompatible,
  marketplaceSlug,
  MARKETPLACE_SCHEMA_VERSION,
  validateMarketplaceMetadata,
} from '../lib/marketplace.js';
import { supabase } from '../lib/supabase.js';
import { getUsageSummary } from '../lib/usage.js';
import { validateWorkflowGraph } from '../lib/workflow-graph.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const LISTING_SELECT = `
  *,
  current_version:marketplace_listing_versions!marketplace_current_version_fk(
    id, version_number, schema_version, config_hash, release_notes,
    compatibility_notes, created_at
  ),
  marketplace_reviews(id, rating, review_text, created_at)
`;

function isAdmin(userId) {
  return new Set(
    String(process.env.ADMIN_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean),
  ).has(userId);
}

function legacyListing(template) {
  return {
    ...template,
    legacy:true,
    asset_type:'agent',
    summary:template.description || 'Curated AgentForge starter agent.',
    tags:template.default_tool_slugs || [],
    author_name:'AgentForge',
    verification_status:'curated',
    quality_score:template.is_featured ? 90 : 75,
    install_count:template.usage_count || 0,
    rating_average:0,
    rating_count:0,
    compatibility_min:1,
    compatibility_max:1,
    current_version:1,
    trust_signals:{
      curated:true,
      schema_validated:true,
      immutable_snapshot:true,
    },
  };
}

async function sourceSnapshot(userId, metadata) {
  if (metadata.asset_type === 'agent') {
    const { data:agent, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', metadata.resource_id)
      .eq('user_id', userId)
      .single();
    if (error || !agent) throw Object.assign(new Error('Agent not found'), { status:404 });
    if (agent.status !== 'active' || !agent.published_version_id) {
      throw Object.assign(
        new Error('Publish and activate the agent before listing it'),
        { status:409 },
      );
    }
    const { data:version, error:versionError } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('id', agent.published_version_id)
      .eq('user_id', userId)
      .single();
    if (versionError || !version) throw new Error('Published agent version is unavailable');
    return {
      name:metadata.name,
      description:agent.description,
      category:agent.category,
      system_prompt:version.system_prompt,
      personality:version.personality,
      model:version.model,
      temperature:version.temperature,
      max_tokens:version.max_tokens,
      tool_slugs:version.tool_slugs || [],
      source_version_id:version.id,
      source_version_number:version.version_number,
    };
  }
  const { data:workflow, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', metadata.resource_id)
    .eq('user_id', userId)
    .single();
  if (error || !workflow) throw Object.assign(new Error('Workflow not found'), { status:404 });
  if (workflow.status !== 'active') {
    throw Object.assign(
      new Error('Activate the workflow before listing it'),
      { status:409 },
    );
  }
  const graph = validateWorkflowGraph(workflow.nodes, workflow.edges);
  if (graph.errors.length) {
    throw Object.assign(new Error(graph.errors[0]), { status:400 });
  }
  return {
    name:metadata.name,
    description:workflow.description,
    nodes:graph.value.nodes,
    edges:graph.value.edges,
    source_version_number:workflow.version,
  };
}

async function authorName(req) {
  const { data } = await supabase
    .from('profiles')
    .select('full_name, username')
    .eq('id', req.userId)
    .single();
  return data?.full_name || data?.username || req.user?.email?.split('@')[0] || 'AgentForge creator';
}

function filterListings(listings, query) {
  let result = listings;
  if (query.type && ['agent', 'workflow'].includes(query.type)) {
    result = result.filter(item => item.asset_type === query.type);
  }
  if (query.category) {
    result = result.filter(item => item.category === String(query.category).toLowerCase());
  }
  if (query.verified === 'true') {
    result = result.filter(item => ['automated', 'curated'].includes(item.verification_status));
  }
  if (query.q?.trim()) {
    const term = query.q.trim().toLowerCase();
    result = result.filter(item => (
      item.name.toLowerCase().includes(term)
      || item.summary.toLowerCase().includes(term)
      || item.author_name.toLowerCase().includes(term)
      || (item.tags || []).some(tag => tag.includes(term))
    ));
  }
  const sort = query.sort || 'quality';
  return [...result].sort((left, right) => {
    if (sort === 'newest') {
      return String(right.published_at || right.created_at)
        .localeCompare(String(left.published_at || left.created_at));
    }
    if (sort === 'popular') return right.install_count - left.install_count;
    if (sort === 'rating') return Number(right.rating_average) - Number(left.rating_average);
    return right.quality_score - left.quality_score || right.install_count - left.install_count;
  });
}

router.get('/', async (req, res, next) => {
  try {
    const [{ data:listings, error }, { data:templates, error:templateError }, {
      data:installs,
      error:installError,
    }] = await Promise.all([
      supabase.from('marketplace_listings').select(LISTING_SELECT)
        .eq('status', 'published').order('quality_score', { ascending:false }).limit(200),
      supabase.from('templates').select('*').order('is_featured', { ascending:false })
        .order('usage_count', { ascending:false }),
      supabase.from('marketplace_installs').select('listing_id, listing_version_id')
        .eq('user_id', req.userId).order('created_at', { ascending:false }).limit(500),
    ]);
    if (error || templateError || installError) throw error || templateError || installError;
    const installed = new Map((installs || []).map(item => [item.listing_id, item.listing_version_id]));
    const modern = (listings || []).map(listing => ({
      ...listing,
      compatible:isMarketplaceCompatible(listing),
      installed_version_id:installed.get(listing.id) || null,
      reviews:(listing.marketplace_reviews || []).slice(0, 5),
      marketplace_reviews:undefined,
    }));
    const combined = [...modern, ...(templates || []).map(legacyListing)];
    res.json({
      schema_version:MARKETPLACE_SCHEMA_VERSION,
      listings:filterListings(combined, req.query),
      total:combined.length,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/mine', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select(`${LISTING_SELECT}, versions:marketplace_listing_versions!marketplace_listing_versions_listing_id_fkey(*)`)
      .eq('creator_user_id', req.userId)
      .order('created_at', { ascending:false });
    if (error) throw error;
    res.json((data || []).map(item => ({
      ...item,
      versions:(item.versions || [])
        .sort((left, right) => right.version_number - left.version_number),
    })));
  } catch (error) {
    next(error);
  }
});

router.post('/publish', async (req, res, next) => {
  try {
    const validated = validateMarketplaceMetadata(req.body);
    if (validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0], details:validated.errors });
    }
    const configuration = await sourceSnapshot(req.userId, validated.value);
    const author = await authorName(req);
    const suffix = crypto.randomUUID().slice(0, 8);
    const { data, error } = await supabase.rpc('publish_marketplace_listing', {
      p_user_id:req.userId,
      p_listing_id:null,
      p_slug:marketplaceSlug(validated.value.name, suffix),
      p_name:validated.value.name,
      p_summary:validated.value.summary,
      p_asset_type:validated.value.asset_type,
      p_category:validated.value.category,
      p_tags:validated.value.tags,
      p_author_name:author,
      p_source_resource_id:validated.value.resource_id,
      p_configuration:configuration,
      p_release_notes:validated.value.release_notes,
      p_compatibility_min:validated.value.compatibility_min,
      p_compatibility_max:validated.value.compatibility_max,
    });
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.put('/:id/publish', async (req, res, next) => {
  try {
    const { data:listing } = await supabase
      .from('marketplace_listings')
      .select('*')
      .eq('id', req.params.id)
      .eq('creator_user_id', req.userId)
      .single();
    if (!listing) return res.status(404).json({ error:'Marketplace listing not found' });
    const validated = validateMarketplaceMetadata({
      ...req.body,
      asset_type:listing.asset_type,
    });
    if (validated.errors.length) {
      return res.status(400).json({ error:validated.errors[0], details:validated.errors });
    }
    const configuration = await sourceSnapshot(req.userId, validated.value);
    const { data, error } = await supabase.rpc('publish_marketplace_listing', {
      p_user_id:req.userId,
      p_listing_id:listing.id,
      p_slug:listing.slug,
      p_name:validated.value.name,
      p_summary:validated.value.summary,
      p_asset_type:listing.asset_type,
      p_category:validated.value.category,
      p_tags:validated.value.tags,
      p_author_name:await authorName(req),
      p_source_resource_id:validated.value.resource_id,
      p_configuration:configuration,
      p_release_notes:validated.value.release_notes,
      p_compatibility_min:validated.value.compatibility_min,
      p_compatibility_max:validated.value.compatibility_max,
    });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/install', async (req, res, next) => {
  try {
    const summary = await getUsageSummary(req.userId);
    const limit = Number(summary.limits.marketplace_installs) || 0;
    if (summary.period.marketplace_installs >= limit) {
      return res.status(429).json({ error:'Monthly marketplace install limit reached' });
    }
    const { data:listing } = await supabase
      .from('marketplace_listings')
      .select('asset_type')
      .eq('id', req.params.id)
      .eq('status', 'published')
      .single();
    if (!listing) return res.status(404).json({ error:'Marketplace listing not found' });
    const resourceLimit = Number(
      listing.asset_type === 'agent' ? summary.limits.agents : summary.limits.workflows,
    ) || 0;
    const resourceTable = listing.asset_type === 'agent' ? 'agents' : 'workflows';
    const { count, error:countError } = await supabase.from(resourceTable)
      .select('id', { count:'exact', head:true }).eq('user_id', req.userId);
    if (countError) throw countError;
    if ((count || 0) >= resourceLimit) {
      return res.status(429).json({
        error:`Your ${listing.asset_type} limit is reached`,
      });
    }
    const { data, error } = await supabase.rpc('install_marketplace_listing', {
      p_user_id:req.userId,
      p_listing_id:req.params.id,
    });
    if (error) {
      const status = /not found/i.test(error.message) ? 404
        : /compatible/i.test(error.message) ? 409 : 400;
      return res.status(status).json({ error:error.message });
    }
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/review', async (req, res, next) => {
  try {
    const { data, error } = await supabase.rpc('review_marketplace_listing', {
      p_user_id:req.userId,
      p_listing_id:req.params.id,
      p_rating:Number(req.body?.rating),
      p_review_text:req.body?.review_text || null,
    });
    if (error) {
      const status = /install/i.test(error.message) ? 409 : 400;
      return res.status(status).json({ error:error.message });
    }
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/unlist', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .update({ status:'unlisted' })
      .eq('id', req.params.id)
      .eq('creator_user_id', req.userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Marketplace listing not found' });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/curate', async (req, res, next) => {
  try {
    if (!isAdmin(req.userId)) return res.status(403).json({ error:'Admin access required' });
    const featured = req.body?.featured === true;
    const { data, error } = await supabase
      .from('marketplace_listings')
      .update({
        verification_status:featured ? 'curated' : 'automated',
        quality_score:featured ? 100 : 80,
        trust_signals:{
          immutable_snapshot:true,
          ownership_checked:true,
          schema_validated:true,
          curated:featured,
        },
      })
      .eq('id', req.params.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error:'Marketplace listing not found' });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

export default router;

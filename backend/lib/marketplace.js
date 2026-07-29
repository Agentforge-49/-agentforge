export const MARKETPLACE_SCHEMA_VERSION = 1;
export const MARKETPLACE_CATEGORIES = [
  'research', 'writing', 'automation', 'support', 'data', 'sales', 'other',
];

export function normalizeMarketplaceTags(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values
    .map(item => String(item).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'))
    .map(item => item.replace(/-{2,}/g, '-').replace(/^-|-$/g, ''))
    .filter(item => item.length >= 2 && item.length <= 30))]
    .slice(0, 12);
}

export function marketplaceSlug(value, suffix = '') {
  const base = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'agentforge-template';
  return suffix ? `${base}-${suffix.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}` : base;
}

export function validateMarketplaceMetadata(body) {
  const errors = [];
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const summary = typeof body?.summary === 'string' ? body.summary.trim() : '';
  const assetType = body?.asset_type;
  const category = body?.category || 'other';
  const resourceId = typeof body?.resource_id === 'string' ? body.resource_id.trim() : '';
  const releaseNotes = typeof body?.release_notes === 'string'
    ? body.release_notes.trim() : '';
  const compatibilityMin = Number(body?.compatibility_min ?? MARKETPLACE_SCHEMA_VERSION);
  const compatibilityMax = Number(body?.compatibility_max ?? MARKETPLACE_SCHEMA_VERSION);
  if (!name || name.length > 100) errors.push('Listing name must be between 1 and 100 characters');
  if (summary.length < 20 || summary.length > 500) {
    errors.push('Summary must be between 20 and 500 characters');
  }
  if (!['agent', 'workflow'].includes(assetType)) errors.push('Asset type must be agent or workflow');
  if (!MARKETPLACE_CATEGORIES.includes(category)) errors.push('Marketplace category is invalid');
  if (!/^[0-9a-f-]{36}$/i.test(resourceId)) errors.push('A valid source resource is required');
  if (releaseNotes.length > 1000) errors.push('Release notes must be 1,000 characters or fewer');
  if (
    !Number.isInteger(compatibilityMin)
    || !Number.isInteger(compatibilityMax)
    || compatibilityMin < 1
    || compatibilityMax < compatibilityMin
  ) errors.push('Compatibility range is invalid');
  return {
    errors,
    value:{
      name,
      summary,
      asset_type:assetType,
      category,
      resource_id:resourceId,
      tags:normalizeMarketplaceTags(body?.tags),
      release_notes:releaseNotes || null,
      compatibility_min:compatibilityMin,
      compatibility_max:compatibilityMax,
    },
  };
}

export function isMarketplaceCompatible(listing) {
  return Number(listing.compatibility_min) <= MARKETPLACE_SCHEMA_VERSION
    && Number(listing.compatibility_max) >= MARKETPLACE_SCHEMA_VERSION;
}

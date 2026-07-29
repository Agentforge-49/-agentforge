import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isMarketplaceCompatible,
  marketplaceSlug,
  normalizeMarketplaceTags,
  validateMarketplaceMetadata,
} from '../lib/marketplace.js';

test('marketplace slugs and tags are stable and URL safe', () => {
  assert.equal(marketplaceSlug('  Customer Support + Sales! ', 'ABC-123'), 'customer-support-sales-abc123');
  assert.deepEqual(normalizeMarketplaceTags([
    'Customer Support',
    'customer--support',
    'Sales!',
    'x',
  ]), ['customer-support', 'sales']);
});

test('marketplace metadata validates publishing and compatibility bounds', () => {
  const valid = validateMarketplaceMetadata({
    name:'Support triage',
    summary:'Routes incoming customer messages to the right support specialist.',
    asset_type:'workflow',
    category:'support',
    resource_id:'00000000-0000-0000-0000-000000000001',
    tags:['support', 'routing'],
    compatibility_min:1,
    compatibility_max:2,
  });
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.value.tags.length, 2);
  const invalid = validateMarketplaceMetadata({
    name:'',
    summary:'short',
    asset_type:'secret',
    resource_id:'bad',
    compatibility_min:3,
    compatibility_max:1,
  });
  assert.ok(invalid.errors.length >= 4);
});

test('marketplace compatibility matches the current schema version', () => {
  assert.equal(isMarketplaceCompatible({ compatibility_min:1, compatibility_max:1 }), true);
  assert.equal(isMarketplaceCompatible({ compatibility_min:2, compatibility_max:3 }), false);
});

import assert from 'node:assert/strict'
import test from 'node:test'

import { INTEGRATION_CATALOG, INTEGRATION_COUNTS } from '../src/lib/integration-catalog.js'

test('integration catalog contains exactly 100 curated working paths', () => {
  assert.equal(INTEGRATION_COUNTS.catalog, 100)
  assert.equal(INTEGRATION_COUNTS.native, 17)
  assert.equal(INTEGRATION_COUNTS.universal, 83)
  assert.equal(INTEGRATION_COUNTS.catalog, INTEGRATION_COUNTS.native + INTEGRATION_COUNTS.universal)
  assert(INTEGRATION_CATALOG.every(app => ['native', 'universal'].includes(app.mode)))
  assert.equal(new Set(INTEGRATION_CATALOG.map(app => app.slug)).size, 100)
})

test('integration catalog includes major launch apps', () => {
  const names = new Set(INTEGRATION_CATALOG.map(app => app.name))
  for (const name of ['Salesforce', 'HubSpot', 'Slack', 'Microsoft Teams', 'Gmail', 'Notion', 'Stripe', 'Shopify']) {
    assert(names.has(name), `${name} should be discoverable`)
  }
})

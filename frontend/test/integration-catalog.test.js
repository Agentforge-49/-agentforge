import assert from 'node:assert/strict'
import test from 'node:test'

import { INTEGRATION_CATALOG, INTEGRATION_COUNTS } from '../src/lib/integration-catalog.js'

test('integration catalog exceeds the 500-app launch target with honest modes', () => {
  assert(INTEGRATION_COUNTS.catalog > 1000)
  assert(INTEGRATION_COUNTS.native >= 17)
  assert(INTEGRATION_COUNTS.bridge > 500)
  assert(INTEGRATION_CATALOG.every(app => ['native', 'oauth', 'bridge'].includes(app.mode)))
})

test('integration catalog includes major launch apps', () => {
  const names = new Set(INTEGRATION_CATALOG.map(app => app.name))
  for (const name of ['Salesforce', 'HubSpot', 'Slack', 'Microsoft Teams', 'Gmail', 'Notion', 'Stripe', 'Shopify']) {
    assert(names.has(name), `${name} should be discoverable`)
  }
})

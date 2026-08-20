import assert from 'node:assert/strict'
import test from 'node:test'

import { INTEGRATION_CATALOG, INTEGRATION_COUNTS } from '../src/lib/integration-catalog.js'
import { appLogoUrl } from '../src/lib/app-logo-sources.js'

test('integration catalog contains exactly 100 curated working paths', () => {
  assert.equal(INTEGRATION_COUNTS.catalog, 100)
  assert.equal(INTEGRATION_COUNTS.native, 25)
  assert.equal(INTEGRATION_COUNTS.universal, 75)
  assert.equal(INTEGRATION_COUNTS.catalog, INTEGRATION_COUNTS.native + INTEGRATION_COUNTS.universal)
  assert(INTEGRATION_CATALOG.every(app => ['native', 'universal'].includes(app.mode)))
  assert.equal(new Set(INTEGRATION_CATALOG.map(app => app.slug)).size, 100)
})

test('launch app logos resolve to stable brand assets', () => {
  for (const slug of ['salesforce', 'twilio', 'microsoft_teams', 'microsoft_outlook', 'onedrive', 'dynamics_365']) {
    assert.match(appLogoUrl(slug), /simple-icons@12\.4\.0/)
  }
  assert.match(appLogoUrl('monday'), /^https:\/\/cdn\.monday\.com\//)
  assert.match(appLogoUrl('freshdesk'), /^https:\/\/www\.google\.com\/s2\/favicons/)
  assert.match(appLogoUrl('stripe'), /^https:\/\/cdn\.simpleicons\.org\//)
})

test('integration catalog includes major launch apps', () => {
  const names = new Set(INTEGRATION_CATALOG.map(app => app.name))
  for (const name of ['Salesforce', 'HubSpot', 'Slack', 'Microsoft Teams', 'Gmail', 'Notion', 'Stripe', 'Shopify']) {
    assert(names.has(name), `${name} should be discoverable`)
  }
})

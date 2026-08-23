import assert from 'node:assert/strict'
import test from 'node:test'

import { appConnectionPath, connectionProviderForApp, isAppConnected } from '../src/lib/app-connections.js'
import { INTEGRATION_CATALOG } from '../src/lib/integration-catalog.js'

test('every curated app keeps its real identifier in the connection route', () => {
  for (const app of INTEGRATION_CATALOG) {
    const path = appConnectionPath(app)
    const query = new URLSearchParams(path.split('?')[1])
    assert.equal(query.get('app'), app.slug)
    assert.equal(query.get('mode'), app.mode)
    assert.notEqual(query.get('app'), 'custom_api')
  }
})

test('shared provider accounts mark every related app as connected', () => {
  assert.equal(connectionProviderForApp({ slug:'google_sheets' }), 'google')
  assert.equal(connectionProviderForApp({ slug:'microsoft_teams' }), 'microsoft')
  assert.equal(connectionProviderForApp({ slug:'slack' }), 'slack')
  assert.equal(isAppConnected({ slug:'gmail' }, new Set(['google'])), true)
  assert.equal(isAppConnected({ slug:'slack' }, new Set(['google'])), false)
})

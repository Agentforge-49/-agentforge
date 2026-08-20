import assert from 'node:assert/strict'
import test from 'node:test'

import { isWorkspaceNavActive, WORKSPACE_NAV_GROUPS } from '../src/lib/workspace-navigation.js'

const items = WORKSPACE_NAV_GROUPS.flatMap(group => group.items)

test('workspace navigation exposes the focused launch structure', () => {
  assert.deepEqual(items.map(item => item.label), [
    'Home', 'Build', 'Copilot', 'Activity', 'Apps', 'Templates',
    'Knowledge', 'Quality', 'Team', 'Developer', 'Settings',
  ])
  assert.equal(WORKSPACE_NAV_GROUPS.find(group => group.label === 'Advanced')?.advanced, true)
})

test('unfinished and overlapping surfaces are not primary navigation', () => {
  const destinations = items.map(item => item.to)
  for (const hidden of ['/chains', '/multi-agents', '/billing', '/enterprise-access', '/launch']) {
    assert.equal(destinations.includes(hidden), false)
  }
})

test('legacy builders remain represented by Studio', () => {
  const studio = items.find(item => item.to === '/studio')
  for (const path of ['/studio', '/support-operations', '/agents/example/edit', '/workflows/example/edit', '/chains/example/run', '/multi-agents']) {
    assert.equal(isWorkspaceNavActive(path, studio), true)
  }
  assert.equal(isWorkspaceNavActive('/approvals', studio), false)
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { filterWorkspaceCommands, WORKSPACE_COMMANDS } from '../src/lib/workspace-commands.js'

test('quick actions cover every launch-critical workspace job', () => {
  const destinations = WORKSPACE_COMMANDS.map(command => command.to)
  for (const destination of ['/studio', '/copilot', '/apps', '/marketplace', '/observability', '/approvals', '/knowledge', '/evaluations']) {
    assert.equal(destinations.includes(destination), true)
  }
})

test('quick actions search labels, descriptions, and beginner-friendly aliases', () => {
  assert.deepEqual(filterWorkspaceCommands('new workflow').map(command => command.id), ['create'])
  assert.deepEqual(filterWorkspaceCommands('human review').map(command => command.id), ['approvals'])
  assert.deepEqual(filterWorkspaceCommands('pdf citations').map(command => command.id), ['knowledge'])
  assert.deepEqual(filterWorkspaceCommands('does-not-exist'), [])
})

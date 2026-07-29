import assert from 'node:assert/strict'
import test from 'node:test'

import { renderNavLinkChildren } from '../src/lib/nav-link.js'

test('navigation render functions receive active state and produce visible content', () => {
  const result = renderNavLinkChildren(
    ({ isActive }) => `${isActive ? 'Active' : 'Inactive'} Dashboard`,
    true,
  )
  assert.equal(result, 'Active Dashboard')
})

test('navigation accepts ordinary children', () => {
  assert.equal(renderNavLinkChildren('Settings', false), 'Settings')
})

import assert from 'node:assert/strict'
import test from 'node:test'

import { renderNavLinkChildren, renderNavLinkProp } from '../src/lib/nav-link.js'

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

test('navigation resolves active class names and preserves ordinary values', () => {
  assert.equal(renderNavLinkProp(({ isActive }) => isActive ? 'active' : 'idle', true), 'active')
  assert.equal(renderNavLinkProp('nav-link', false), 'nav-link')
})

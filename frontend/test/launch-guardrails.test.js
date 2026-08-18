import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('authenticated API reads bypass stale browser caches', async () => {
  const source = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
  assert.match(source, /cache:\s*'no-store'/)
})

test('cost guardrail fields use functional state updates', async () => {
  const source = await readFile(new URL('../src/pages/UsagePlans.jsx', import.meta.url), 'utf8')
  const updates = source.match(/setBudget\(current\s*=>/g) || []
  assert.equal(updates.length, 3)
  assert.doesNotMatch(source, /setBudget\(\{\s*\.\.\.budget/)
})


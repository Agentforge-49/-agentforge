import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('command center keeps its loading boundary active during retries', () => {
  const source = fs.readFileSync(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8')
  assert.match(source, /setLoading\(true\)[\s\S]*getWorkspaceBootstrap/)
  assert.match(source, /loading \|\| \(!data && !error\)/)
})

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

test('cost guardrail submission reads the rendered form state', async () => {
  const source = await readFile(new URL('../src/pages/UsagePlans.jsx', import.meta.url), 'utf8')
  assert.match(source, /new FormData\(event\.currentTarget\)/)
  assert.match(source, /fields\.get\('hard_limit_enabled'\) === 'on'/)
  for (const name of ['monthly_cost_limit_usd', 'warning_percent', 'hard_limit_enabled']) {
    assert.match(source, new RegExp(`name=["']${name}["']`))
  }
})

test('credential vault submits rendered fields and uses functional updates', async () => {
  const source = await readFile(new URL('../src/pages/Credentials.jsx', import.meta.url), 'utf8')
  assert.match(source, /new FormData\(event\.currentTarget\)/)
  assert.match(source, /secret:String\(fields\.get\('secret'\)/)
  assert.doesNotMatch(source, /setForm\(\{\s*\.\.\.form/)
  for (const name of ['name', 'provider', 'secret', 'project_url', 'app_slug']) {
    assert.match(source, new RegExp(`name=["']${name}["']`))
  }
})

test('focused app setup keeps beginners on one connection path', async () => {
  const source = await readFile(new URL('../src/pages/Credentials.jsx', import.meta.url), 'utf8')
  assert.match(source, /focusedConnection/)
  assert.match(source, /Universal API connection/)
  assert.match(source, /type="hidden" name="provider" value="generic"/)
  assert.match(source, /After saving/)
})

test('launch metadata exposes canonical, social, manifest, and search contracts', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const manifest = await readFile(new URL('../public/site.webmanifest', import.meta.url), 'utf8')
  const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8')
  assert.match(html, /rel="canonical"/)
  assert.match(html, /property="og:title"/)
  assert.match(html, /rel="manifest"/)
  assert.equal(JSON.parse(manifest).name, 'AgentForge')
  assert.match(robots, /sitemap\.xml/i)
})

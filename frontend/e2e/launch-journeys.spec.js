import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { Buffer } from 'node:buffer'
import { authenticate, bootstrap, expectNoSeriousA11yViolations, mockBackend, session, supabaseBase } from './helpers.js'

test('signup creates a session and reaches the command center', async ({ page }) => {
  await mockBackend(page)
  await page.route(`${supabaseBase}/auth/v1/signup`, route => route.fulfill({
    status:200, contentType:'application/json', body:JSON.stringify(session),
  }))
  await page.goto('/signup')
  await page.getByLabel('Work email').fill('operator@example.com')
  await page.getByLabel('Password').fill('safe-password')
  await page.getByRole('button', { name:'Create free account' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name:/See what is moving/ })).toBeVisible()
})

test('Forge streams an answer and applies an explicit proposal', async ({ page }) => {
  await authenticate(page)
  const thread = { id:'thread-1', title:'Support automation', messages:[], proposals:[] }
  let sentMessage = ''
  await mockBackend(page, ({ request, url }) => {
    if (url.pathname === '/api/copilot/threads' && request.method() === 'GET') return { body:[thread] }
    if (url.pathname === '/api/copilot/threads/thread-1') return { body:thread }
    if (url.pathname.endsWith('/messages')) {
      sentMessage = request.postDataJSON().message
      return { sse:[
      'event: meta\ndata: {"state":"answering"}',
      'event: delta\ndata: {"text":"I prepared a safe workflow."}',
      'event: proposal\ndata: {"id":"proposal-1","message_id":"message-1","status":"pending","title":"Support triage","summary":"Triage then approve.","preview":{"nodes":[{"id":"a","label":"Triage"},{"id":"b","label":"Approve"}]}}',
      'event: done\ndata: {"message":{"id":"message-1","role":"assistant","content":"I prepared a safe workflow."}}',
      '',
      ].join('\n\n') }
    }
    if (url.pathname === '/api/copilot/proposals/proposal-1/apply') return { body:{ resource_type:'workflow', resource_id:'workflow-1' } }
  })
  await page.goto('/copilot')
  await expect(page.getByRole('navigation', { name:'Chat history' })).toBeVisible()
  await expect(page.getByLabel('Search chat history')).toBeVisible()
  await expect(page.getByRole('button', { name:'New chat' })).toBeVisible()
  await expect(page.getByRole('navigation', { name:'Chat history' }).getByText('Support automation')).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({ name:'support-notes.txt', mimeType:'text/plain', buffer:Buffer.from('VIP tickets require manager approval.') })
  await expect(page.getByText('support-notes.txt')).toBeVisible()
  const composer = page.getByPlaceholder(/Ask anything/)
  await expect(composer).toHaveAttribute('rows', '1')
  const initialComposerHeight = await composer.evaluate(element => element.getBoundingClientRect().height)
  await composer.fill('Build safe support triage\nKeep a person in control\nExplain every decision')
  const expandedComposerHeight = await composer.evaluate(element => element.getBoundingClientRect().height)
  expect(expandedComposerHeight).toBeGreaterThan(initialComposerHeight)
  const composerSurface = await page.locator('.copilot-input').evaluate(element => getComputedStyle(element).borderRadius)
  expect(Number.parseFloat(composerSurface)).toBeGreaterThanOrEqual(24)
  await page.getByRole('button', { name:'Send message' }).click()
  await expect.poll(() => sentMessage).toContain('VIP tickets require manager approval.')
  await expect(page.getByText('I prepared a safe workflow.')).toBeVisible()
  await expect(page.getByRole('heading', { name:'Support triage' })).toBeVisible()
  await page.getByRole('button', { name:/Approve & open draft/ }).click()
  await expect(page).toHaveURL(/\/workflows\/workflow-1\/edit$/)
})

test('workspace recovers cleanly from a temporary API failure', async ({ page }) => {
  await authenticate(page)
  let attempts = 0
  await mockBackend(page, ({ url }) => {
    if (url.pathname === '/api/workspace/bootstrap') {
      attempts += 1
      return attempts === 1 ? { status:503, body:{ error:'Temporary cold start' } } : { body:bootstrap }
    }
  })
  await page.goto('/dashboard')
  await expect(page.getByText('Command Center is unavailable')).toBeVisible()
  await page.getByRole('button', { name:'Try again' }).click()
  await expect(page.getByRole('heading', { name:/See what is moving/ })).toBeVisible()
})

test('quick actions turn a beginner goal into the right workspace destination', async ({ page }) => {
  await authenticate(page)
  await mockBackend(page)
  await page.goto('/dashboard')
  await page.getByRole('button', { name:/Quick actions/ }).click()
  await expect(page.getByRole('dialog', { name:'Quick actions' })).toBeVisible()
  await page.getByLabel('Search quick actions').fill('human review')
  await expect(page.getByRole('option', { name:/Review approvals/ })).toBeVisible()
  await page.getByRole('option', { name:/Review approvals/ }).click()
  await expect(page).toHaveURL(/\/approvals$/)
})

test('Home keeps Forge isolated in its dedicated workspace', async ({ page }) => {
  await authenticate(page)
  await mockBackend(page)
  await page.goto('/dashboard')
  await expect(page.getByText(/What result should your AI operation deliver/)).toHaveCount(0)
  await page.getByRole('link', { name:'Forge' }).click()
  await expect(page).toHaveURL(/\/copilot$/)
  await expect(page.getByRole('navigation', { name:'Chat history' })).toBeVisible()
})

test('empty Activity guides a new operator to a working next step', async ({ page }) => {
  await authenticate(page)
  await mockBackend(page, ({ url }) => {
    if (url.pathname === '/api/observability') return { body:{ runs:[] } }
    if (url.pathname === '/api/observability/metrics') return { body:{
      runs:0, success_rate:0, tokens:0, estimated_cost_usd:0,
      average_duration_ms:null, p95_duration_ms:null, daily:[],
    } }
  })
  await page.goto('/observability')
  await expect(page.getByText('Your first run will appear here.')).toBeVisible()
  await page.getByRole('button', { name:'Build an automation' }).click()
  await expect(page).toHaveURL(/\/studio$/)
})

test('visual builder saves, activates, runs, and stops at human approval', async ({ page }) => {
  await authenticate(page)
  let workflow
  await mockBackend(page, async ({ request, url }) => {
    if (url.pathname === '/api/workflows' && request.method() === 'POST') {
      const payload = request.postDataJSON()
      workflow = { ...payload, id:'workflow-1', status:'draft', version:1 }
      return { body:workflow }
    }
    if (url.pathname === '/api/workflows/workflow-1' && request.method() === 'GET') return { body:workflow }
    if (url.pathname === '/api/workflows/workflow-1/activate') {
      workflow = { ...workflow, status:'active', version:2 }
      return { body:workflow }
    }
    if (url.pathname === '/api/workflows/workflow-1/run') {
      return { body:{ job:{ id:'job-1', status:'waiting_approval', attempt:1 } } }
    }
  })
  await page.goto('/workflows/new')
  await expect(page.getByText('Ready to save.')).toBeVisible()
  const inputNode = page.getByRole('button', { name:'Input, input node' })
  const originalLeft = await inputNode.evaluate(element => element.style.left)
  await inputNode.focus()
  await inputNode.press('ArrowRight')
  await expect.poll(() => inputNode.evaluate(element => element.style.left)).not.toBe(originalLeft)
  await page.getByRole('button', { name:'Approval' }).click()
  await expect(page.getByText('Reviewer instructions')).toBeVisible()
  await page.locator('main input').first().fill('Governed support triage')
  await page.getByRole('button', { name:/Save draft/ }).click()
  await expect(page).toHaveURL(/\/workflows\/workflow-1\/edit$/)
  await page.getByRole('button', { name:'Activate' }).click()
  await page.getByPlaceholder('Enter workflow input').fill('New urgent ticket')
  await page.getByRole('button', { name:'Run', exact:true }).click()
  await expect(page.getByText(/Job status: waiting_approval/)).toBeVisible()
})

test('Connection Center recommends a small app plan and shows real readiness', async ({ page }) => {
  await authenticate(page)
  await mockBackend(page, ({ url }) => {
    if (url.pathname === '/api/credentials') return { body:[{ id:'credential-google', provider:'google', app_slug:'google_sheets', last_test_status:'passed' }] }
    if (url.pathname === '/api/oauth/connections') return { body:[{ id:'oauth-slack', provider:'slack', status:'active' }] }
  })
  await page.goto('/apps')
  await expect(page.getByRole('heading', { name:'Connect an outcome—not a wall of app logos.' })).toBeVisible()
  await expect(page.getByText('2/3 ready')).toBeVisible()
  await page.getByRole('tab', { name:'Sales operations' }).click()
  await expect(page.getByRole('heading', { name:'Sales operations', exact:true })).toBeVisible()
  await expect(page.getByRole('list', { name:'Connection setup steps' }).getByText('Choose')).toBeVisible()
  await expect(page.getByRole('button', { name:/Manage/ }).first()).toBeVisible()
})

test('universal app setup encrypts and tests a real credential path', async ({ page }) => {
  await authenticate(page)
  let credential = null
  await mockBackend(page, ({ request, url }) => {
    if (url.pathname === '/api/credentials' && request.method() === 'GET') return { body:credential ? [credential] : [] }
    if (url.pathname === '/api/credentials' && request.method() === 'POST') {
      const payload = request.postDataJSON()
      credential = { id:'credential-1', ...payload, masked_secret:'••••••••test', current_version:1, rotated_at:'2026-01-01T00:00:00Z', last_test_status:null }
      return { body:credential }
    }
    if (url.pathname === '/api/credentials/credential-1/test') {
      credential = { ...credential, last_test_status:'passed', last_tested_at:'2026-01-01T00:00:00Z' }
      return { body:{ message:'Credential connection verified.' } }
    }
  })
  await page.goto('/credentials?app=airtable&mode=universal')
  await expect(page.getByRole('heading', { name:'Airtable', exact:true })).toBeVisible()
  await page.getByLabel('Secret').fill('safe-test-token')
  await page.getByRole('button', { name:/Encrypt and store/ }).click()
  await expect(page.getByText(/plaintext was discarded/i)).toBeVisible()
  await page.getByRole('button', { name:'Test', exact:true }).click()
  await expect(page.getByText('Credential connection verified.')).toBeVisible()
})

test('approval inbox records a human decision', async ({ page }) => {
  await authenticate(page)
  let decided = false
  const approval = { id:'approval-1', status:'pending', created_at:'2026-01-01T00:00:00Z', expires_at:'2030-01-01T00:00:00Z', node_id:'approval-step', input:{ value:'T-42' }, workflows:{ name:'Support triage' } }
  await mockBackend(page, ({ request, url }) => {
    if (url.pathname === '/api/approvals' && request.method() === 'GET') return { body:decided ? [] : [approval] }
    if (url.pathname === '/api/approvals/approval-1/decide') { decided = true; return { body:{ ...approval, status:'approved' } } }
  })
  await page.goto('/approvals')
  await expect(page.getByText('Support triage')).toBeVisible()
  await page.getByRole('button', { name:/Approve/ }).click()
  await expect(page.getByText(/No pending decisions/)).toBeVisible()
})

test('public website demonstrates multiple operations and answers launch questions', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name:'Sales', exact:true }).click()
  const example = page.getByLabel('Interactive example AgentForge workflow')
  await expect(example.getByText('Lead qualification', { exact:true })).toBeVisible()
  await expect(example.getByText('Add approved lead', { exact:true })).toBeVisible()
  await expect(example.getByText('8/8', { exact:true })).toBeVisible()
  await page.getByText('Are all 100 app connections native?', { exact:true }).click()
  await expect(page.getByText(/Twenty-five launch apps have guided typed connectors/)).toBeVisible()
})

test('@a11y public and authenticated launch surfaces have no serious axe violations', async ({ page }) => {
  test.slow()
  const browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  await page.goto('/')
  await expectNoSeriousA11yViolations(page, AxeBuilder)
  await expect.poll(() => browserErrors).toEqual([])
  await authenticate(page)
  await mockBackend(page)
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name:/See what is moving/ })).toBeVisible()
  await expectNoSeriousA11yViolations(page, AxeBuilder)
})

test('@mobile mobile navigation exposes the complete primary workspace', async ({ page }) => {
  await authenticate(page)
  await mockBackend(page)
  await page.goto('/dashboard')
  await page.getByRole('button', { name:'Open navigation' }).click()
  await expect(page.getByRole('link', { name:'Forge' })).toBeVisible()
  await page.getByRole('link', { name:'Build' }).click()
  await expect(page).toHaveURL(/\/studio$/)
  await expect(page.getByRole('heading', { name:/Design every AI operation/ })).toBeVisible()
})

test('@mobile public website keeps its story and interactions usable on a phone', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name:/Build an AI workforce/ })).toBeVisible()
  await page.getByRole('button', { name:'Open menu' }).click()
  await expect(page.getByRole('navigation', { name:'Mobile navigation' })).toBeVisible()
  await page.getByRole('button', { name:'Close menu' }).click()
  await page.getByRole('tab', { name:'Operations', exact:true }).click()
  await expect(page.getByLabel('Interactive example AgentForge workflow').getByText('Update request record', { exact:true })).toBeVisible()
  await page.getByText('Can I start without paying?', { exact:true }).click()
  await expect(page.getByText(/free workspace is designed for building and proving/)).toBeVisible()
})

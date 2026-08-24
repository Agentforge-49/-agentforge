import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
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

test('Copilot streams an answer and applies an explicit proposal', async ({ page }) => {
  await authenticate(page)
  const thread = { id:'thread-1', title:'Support automation', messages:[], proposals:[] }
  await mockBackend(page, ({ request, url }) => {
    if (url.pathname === '/api/copilot/threads' && request.method() === 'GET') return { body:[thread] }
    if (url.pathname === '/api/copilot/threads/thread-1') return { body:thread }
    if (url.pathname.endsWith('/messages')) return { sse:[
      'event: meta\ndata: {"state":"answering"}',
      'event: delta\ndata: {"text":"I prepared a safe workflow."}',
      'event: proposal\ndata: {"id":"proposal-1","message_id":"message-1","status":"pending","title":"Support triage","summary":"Triage then approve.","preview":{"nodes":[{"id":"a","label":"Triage"},{"id":"b","label":"Approve"}]}}',
      'event: done\ndata: {"message":{"id":"message-1","role":"assistant","content":"I prepared a safe workflow."}}',
      '',
    ].join('\n\n') }
    if (url.pathname === '/api/copilot/proposals/proposal-1/apply') return { body:{ resource_type:'workflow', resource_id:'workflow-1' } }
  })
  await page.goto('/copilot')
  await page.getByPlaceholder(/Ask anything/).fill('Build safe support triage')
  await page.getByRole('button', { name:'Send message' }).click()
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

test('@a11y public and authenticated launch surfaces have no serious axe violations', async ({ page }) => {
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
  await expect(page.getByRole('link', { name:'Copilot' })).toBeVisible()
  await page.getByRole('link', { name:'Build' }).click()
  await expect(page).toHaveURL(/\/studio$/)
  await expect(page.getByRole('heading', { name:/Design every AI operation/ })).toBeVisible()
})

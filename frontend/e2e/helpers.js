import { expect } from '@playwright/test'

export const apiBase = 'http://127.0.0.1:3999'
export const supabaseBase = 'http://127.0.0.1:54321'

export const user = {
  id:'11111111-1111-4111-8111-111111111111',
  email:'operator@example.com',
  role:'authenticated',
  aud:'authenticated',
  app_metadata:{ provider:'email' },
  user_metadata:{},
  created_at:'2026-01-01T00:00:00.000Z',
}

export const session = {
  access_token:'e2e-access-token',
  refresh_token:'e2e-refresh-token',
  expires_at:4102444800,
  expires_in:3600,
  token_type:'bearer',
  user,
}

export const bootstrap = {
  counts:{ active_agents:1, active_workflows:2, approvals:1, failed_runs:0 },
  usage:{ used:7, limit:100 },
  user:{ plan:'free' },
  recent_activity:[],
  approval_queue:[{ id:'approval-1', created_at:'2026-01-01T00:00:00.000Z' }],
  readiness:{ has_builder_resource:true, has_connection:true, has_active_work:true },
}

export async function authenticate(page) {
  await page.addInitScript(({ storageKey, value }) => {
    localStorage.setItem(storageKey, JSON.stringify(value))
  }, { storageKey:'sb-127-auth-token', value:session })
}

function defaultPayload(pathname) {
  if (pathname === '/api/workspace/bootstrap') return bootstrap
  if (pathname === '/api/models') return [{ id:'gemini-2.5-flash', name:'Gemini Flash' }]
  if (pathname === '/api/connectors') return []
  if (pathname === '/api/oauth/providers') return []
  if (pathname === '/api/oauth/connections') return []
  if (pathname === '/api/credentials') return []
  if (pathname === '/api/agents') return []
  if (pathname === '/api/workflows') return []
  if (pathname === '/api/chains') return []
  if (pathname === '/api/multi-agents') return []
  if (pathname === '/api/copilot/threads') return []
  if (pathname.startsWith('/api/approvals')) return []
  return []
}

export async function mockBackend(page, resolve = () => undefined) {
  await page.route(`${apiBase}/api/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    const custom = await resolve({ request, url })
    if (custom === false) return route.abort()
    if (custom?.sse) return route.fulfill({ status:custom.status || 200, contentType:'text/event-stream', body:custom.sse })
    const status = custom?.status || 200
    const body = custom && Object.hasOwn(custom, 'body') ? custom.body : defaultPayload(url.pathname)
    return route.fulfill({ status, contentType:'application/json', body:JSON.stringify(body) })
  })
}

export async function expectNoSeriousA11yViolations(page, AxeBuilder) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact)),
    JSON.stringify(results.violations, null, 2)).toEqual([])
}

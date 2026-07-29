import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not logged in')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`
  }
}

async function request(method, path, body = null) {
  const headers = await getHeaders()
  const options  = { method, headers }
  if (body) options.body = JSON.stringify(body)

  const response = await fetch(`${API_URL}${path}`, options)

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `Error ${response.status}`)
  }
  return response.json()
}

// ── Agents ──────────────────────────────────────────────────────────────────
export const getAgents    = ()           => request('GET',    '/api/agents')
export const getAgent     = (id)         => request('GET',    `/api/agents/${id}`)
export const createAgent  = (data)       => request('POST',   '/api/agents', data)
export const updateAgent  = (id, data)   => request('PUT',    `/api/agents/${id}`, data)
export const deleteAgent  = (id)         => request('DELETE', `/api/agents/${id}`)
export const runAgent = (id, message, idempotencyKey) =>
  request('POST', `/api/agents/${id}/run`, {
    message,
    idempotency_key: idempotencyKey
  })
export const getAgentVersions = (id)     => request('GET',    `/api/agents/${id}/versions`)
export const publishAgent = (id, changeSummary = '') =>
  request('POST', `/api/agents/${id}/publish`, { change_summary: changeSummary })
export const rollbackAgent = (id, versionId, changeSummary = '') =>
  request('POST', `/api/agents/${id}/rollback`, {
    version_id: versionId,
    change_summary: changeSummary
  })
export const pauseAgent  = (id) => request('POST', `/api/agents/${id}/pause`)
export const resumeAgent = (id) => request('POST', `/api/agents/${id}/resume`)

// ── Runs ─────────────────────────────────────────────────────────────────────
export const getRuns      = ()    => request('GET', '/api/runs')
export const getRun       = (id)  => request('GET', `/api/runs/${id}`)
export const getAgentRuns = (id)  => request('GET', `/api/runs/agent/${id}`)
export const getJobs      = ()    => request('GET', '/api/jobs')
export const getJob       = (id)  => request('GET', `/api/jobs/${id}`)
export const cancelJob    = (id)  => request('POST', `/api/jobs/${id}/cancel`)

// ── Templates ────────────────────────────────────────────────────────────────
export const getTemplates  = ()   => request('GET',  '/api/templates')
export const useTemplate   = (id) => request('POST', `/api/templates/${id}/use`)

// ── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboardStats = () => request('GET', '/api/dashboard/stats')

// ── Chains (NEW — Day 7) ──────────────────────────────────────────────────────
export const getChains     = ()                  => request('GET',    '/api/chains')
export const getChain      = (id)                => request('GET',    `/api/chains/${id}`)
export const createChain   = (data)              => request('POST',   '/api/chains', data)
export const deleteChain   = (id)                => request('DELETE', `/api/chains/${id}`)
export const runChain      = (id, message)       => request('POST',   `/api/chains/${id}/run`, { message })
export const getChainRuns  = (id)                => request('GET',    `/api/chains/${id}/runs`)

// Workflows
export const getWorkflows = () => request('GET', '/api/workflows')
export const getWorkflow = (id) => request('GET', `/api/workflows/${id}`)
export const createWorkflow = (data) => request('POST', '/api/workflows', data)
export const updateWorkflow = (id, data) => request('PUT', `/api/workflows/${id}`, data)
export const deleteWorkflow = (id) => request('DELETE', `/api/workflows/${id}`)
export const activateWorkflow = (id) => request('POST', `/api/workflows/${id}/activate`)
export const pauseWorkflow = (id) => request('POST', `/api/workflows/${id}/pause`)
export const runWorkflow = (id, input, idempotencyKey) =>
  request('POST', `/api/workflows/${id}/run`, {
    input,
    idempotency_key: idempotencyKey
  })
export const getWorkflowRuns = (id) => request('GET', `/api/workflows/${id}/runs`)

// Triggers
export const getTriggers = () => request('GET', '/api/triggers')
export const createTrigger = (data) => request('POST', '/api/triggers', data)
export const deleteTrigger = (id) => request('DELETE', `/api/triggers/${id}`)
export const pauseTrigger = (id) => request('POST', `/api/triggers/${id}/pause`)
export const resumeTrigger = (id) => request('POST', `/api/triggers/${id}/resume`)
export const fireTrigger = (id, input, idempotencyKey) =>
  request('POST', `/api/triggers/${id}/fire`, {
    input,
    idempotency_key: idempotencyKey
  })
export const rotateTriggerSecret = (id) =>
  request('POST', `/api/triggers/${id}/rotate-secret`)
export const getTriggerEvents = (id) => request('GET', `/api/triggers/${id}/events`)

// Credential vault
export const getCredentials = () => request('GET', '/api/credentials')
export const createCredential = (data) => request('POST', '/api/credentials', data)
export const updateCredential = (id, data) => request('PUT', `/api/credentials/${id}`, data)
export const rotateCredential = (id, secret) =>
  request('POST', `/api/credentials/${id}/rotate`, { secret })
export const testCredential = (id) => request('POST', `/api/credentials/${id}/test`)
export const deleteCredential = (id) => request('DELETE', `/api/credentials/${id}`)
export const getCredentialAccessLogs = () => request('GET', '/api/credentials/access/logs')

// Connectors and approvals
export const getConnectors = () => request('GET', '/api/connectors')
export const getApprovals = (status = '') =>
  request('GET', `/api/approvals${status ? `?status=${encodeURIComponent(status)}` : ''}`)
export const decideApproval = (id, decision, editedInput = null, note = '') =>
  request('POST', `/api/approvals/${id}/decide`, {
    decision,
    edited_input: editedInput,
    note
  })

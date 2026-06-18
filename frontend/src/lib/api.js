import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Gets the logged-in user's auth token and builds request headers
async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not logged in')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`
  }
}

// Core request function — all API calls go through this
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
export const runAgent     = (id, message)=> request('POST',   `/api/agents/${id}/run`, { message })

// ── Runs ─────────────────────────────────────────────────────────────────────
export const getRuns      = ()    => request('GET', '/api/runs')
export const getRun       = (id)  => request('GET', `/api/runs/${id}`)
export const getAgentRuns = (id)  => request('GET', `/api/runs/agent/${id}`)

// ── Templates ────────────────────────────────────────────────────────────────
export const getTemplates  = ()   => request('GET',  '/api/templates')
export const useTemplate   = (id) => request('POST', `/api/templates/${id}/use`)

// ── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboardStats = () => request('GET', '/api/dashboard/stats')
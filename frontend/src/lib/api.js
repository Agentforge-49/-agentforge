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

// Observability
export const getObservabilityRuns = (filters = {}) => {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined),
  )
  return request('GET', `/api/observability${query.size ? `?${query}` : ''}`)
}
export const getObservabilityMetrics = () => request('GET', '/api/observability/metrics')
export const getObservedRun = (id) => request('GET', `/api/observability/${id}`)
export const replayObservedRun = (id) => request('POST', `/api/observability/${id}/replay`)
export async function downloadObservabilityCsv(filters = {}) {
  const query = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined),
    ),
    format:'csv',
  })
  const headers = await getHeaders()
  const response = await fetch(`${API_URL}/api/observability/export?${query}`, { headers })
  if (!response.ok) throw new Error('Run export failed')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `agentforge-runs-${Date.now()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// Evaluations
export const getEvaluationSuites = () => request('GET', '/api/evaluations')
export const createEvaluationSuite = (data) => request('POST', '/api/evaluations', data)
export const deleteEvaluationSuite = (id) => request('DELETE', `/api/evaluations/${id}`)
export const runEvaluationSuite = (id, baselineVersionId, candidateVersionId) =>
  request('POST', `/api/evaluations/${id}/run`, {
    baseline_version_id:baselineVersionId,
    candidate_version_id:candidateVersionId,
  })
export const getEvaluationRun = (id) => request('GET', `/api/evaluations/runs/${id}`)
export const promoteEvaluationRun = (id) =>
  request('POST', `/api/evaluations/runs/${id}/promote`)

// Knowledge and memory
export const getKnowledgeBases = () => request('GET', '/api/knowledge')
export const createKnowledgeBase = data => request('POST', '/api/knowledge', data)
export const updateKnowledgeBase = (id, data) => request('PUT', `/api/knowledge/${id}`, data)
export const deleteKnowledgeBase = id => request('DELETE', `/api/knowledge/${id}`)
export const getKnowledgeDocuments = id => request('GET', `/api/knowledge/${id}/documents`)
export const addKnowledgeDocument = (id, data) =>
  request('POST', `/api/knowledge/${id}/documents`, data)
export const deleteKnowledgeDocument = (id, documentId) =>
  request('DELETE', `/api/knowledge/${id}/documents/${documentId}`)
export const searchKnowledge = (id, query, topK = 6) =>
  request('POST', `/api/knowledge/${id}/search`, { query, top_k:topK })
export const bindKnowledgeAgent = (id, agentId) =>
  request('POST', `/api/knowledge/${id}/bind-agent`, { agent_id:agentId })
export const unbindKnowledgeAgent = (id, agentId) =>
  request('DELETE', `/api/knowledge/${id}/bind-agent/${agentId}`)
export const getKnowledgeMemory = id => request('GET', `/api/knowledge/${id}/memory`)
export const clearKnowledgeMemory = id => request('DELETE', `/api/knowledge/${id}/memory`)

// Multi-agent systems
export const getMultiAgentSystems = () => request('GET', '/api/multi-agents')
export const createMultiAgentSystem = data => request('POST', '/api/multi-agents', data)
export const updateMultiAgentSystem = (id, data) =>
  request('PUT', `/api/multi-agents/${id}`, data)
export const deleteMultiAgentSystem = id => request('DELETE', `/api/multi-agents/${id}`)
export const activateMultiAgentSystem = id => request('POST', `/api/multi-agents/${id}/activate`)
export const pauseMultiAgentSystem = id => request('POST', `/api/multi-agents/${id}/pause`)
export const runMultiAgentSystem = (id, input, idempotencyKey) =>
  request('POST', `/api/multi-agents/${id}/run`, {
    input,
    idempotency_key:idempotencyKey,
  })
export const getMultiAgentRun = id => request('GET', `/api/multi-agents/runs/${id}`)

// Marketplace
export const getMarketplaceListings = (filters = {}) => {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined),
  )
  return request('GET', `/api/marketplace${query.size ? `?${query}` : ''}`)
}
export const getMyMarketplaceListings = () => request('GET', '/api/marketplace/mine')
export const publishMarketplaceListing = data => request('POST', '/api/marketplace/publish', data)
export const updateMarketplaceListing = (id, data) =>
  request('PUT', `/api/marketplace/${id}/publish`, data)
export const installMarketplaceListing = id =>
  request('POST', `/api/marketplace/${id}/install`)
export const reviewMarketplaceListing = (id, rating, reviewText = '') =>
  request('POST', `/api/marketplace/${id}/review`, {
    rating,
    review_text:reviewText,
  })
export const unlistMarketplaceListing = id =>
  request('POST', `/api/marketplace/${id}/unlist`)

// Usage, budgets, and plans
export const getUsageSummary = () => request('GET', '/api/usage')
export const updateUsageBudget = data => request('PUT', '/api/usage/budget', data)
export const acknowledgeUsageBudget = () => request('POST', '/api/usage/budget/acknowledge')
export const requestPlanChange = (planKey, note = '') =>
  request('POST', '/api/usage/plan-request', { plan_key:planKey, note })
export const cancelPlanChangeRequest = id =>
  request('DELETE', `/api/usage/plan-request/${id}`)

// Organizations and governance
export const getOrganizations = () => request('GET', '/api/organizations')
export const createOrganization = data => request('POST', '/api/organizations', data)
export const getOrganization = id => request('GET', `/api/organizations/${id}`)
export const updateOrganization = (id, data) =>
  request('PATCH', `/api/organizations/${id}`, data)
export const archiveOrganization = (id, archived = true) =>
  request('POST', `/api/organizations/${id}/archive`, { archived })
export const deleteOrganization = (id, confirmationSlug) =>
  request('DELETE', `/api/organizations/${id}`, { confirmation_slug:confirmationSlug })
export const getOrganizationResourceOptions = () =>
  request('GET', '/api/organizations/resource-options')
export const inviteOrganizationMember = (id, data) =>
  request('POST', `/api/organizations/${id}/invitations`, data)
export const acceptOrganizationInvitation = token =>
  request('POST', '/api/organizations/invitations/accept', { token })
export const revokeOrganizationInvitation = (id, invitationId) =>
  request('DELETE', `/api/organizations/${id}/invitations/${invitationId}`)
export const updateOrganizationMember = (id, userId, data) =>
  request('PATCH', `/api/organizations/${id}/members/${userId}`, data)
export const removeOrganizationMember = (id, userId, reason) =>
  request('DELETE', `/api/organizations/${id}/members/${userId}`, { reason })
export const shareOrganizationResource = (id, data) =>
  request('POST', `/api/organizations/${id}/resources`, data)
export const unshareOrganizationResource = (id, shareId, reason) =>
  request('DELETE', `/api/organizations/${id}/resources/${shareId}`, { reason })
export const cloneOrganizationResource = (id, shareId) =>
  request('POST', `/api/organizations/${id}/resources/${shareId}/clone`)
export const updateOrganizationPolicy = (id, data) =>
  request('PUT', `/api/organizations/${id}/policy`, data)
export const decideGovernanceChange = (id, requestId, decision, note = '') =>
  request('POST', `/api/organizations/${id}/governance/${requestId}/decision`, {
    decision,
    note,
  })
export const cancelGovernanceChange = (id, requestId) =>
  request('DELETE', `/api/organizations/${id}/governance/${requestId}`)
export const getOrganizationAudit = (id, filters = {}) => {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined),
  )
  return request('GET', `/api/organizations/${id}/audit${query.size ? `?${query}` : ''}`)
}
export async function downloadComplianceExport(id, format = 'json', filters = {}) {
  const query = new URLSearchParams({
    format,
    ...Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined),
    ),
  })
  const headers = await getHeaders()
  const response = await fetch(
    `${API_URL}/api/organizations/${id}/compliance/export?${query}`,
    { headers },
  )
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error:'Export failed' }))
    throw new Error(payload.error || `Error ${response.status}`)
  }
  return {
    blob:await response.blob(),
    filename:(response.headers.get('Content-Disposition') || '')
      .match(/filename="([^"]+)"/)?.[1] || `agentforge-compliance.${format}`,
    sha256:response.headers.get('X-AgentForge-Content-SHA256'),
    recordCount:Number(response.headers.get('X-AgentForge-Audit-Records') || 0),
  }
}

// Enterprise identity and access
export const getEnterpriseAccess = organizationId =>
  request('GET', `/api/enterprise/organizations/${organizationId}`)
export const addOrganizationDomain = (organizationId, domain) =>
  request('POST', `/api/enterprise/organizations/${organizationId}/domains`, { domain })
export const verifyOrganizationDomain = (organizationId, domainId, token) =>
  request('POST', `/api/enterprise/organizations/${organizationId}/domains/${domainId}/verify`, {
    token,
  })
export const removeOrganizationDomain = (organizationId, domainId) =>
  request('DELETE', `/api/enterprise/organizations/${organizationId}/domains/${domainId}`)
export const updateIdentitySettings = (organizationId, data) =>
  request('PUT', `/api/enterprise/organizations/${organizationId}/settings`, data)
export const rotateScimToken = organizationId =>
  request('POST', `/api/enterprise/organizations/${organizationId}/scim-token`)
export const createAccessReview = (organizationId, data) =>
  request('POST', `/api/enterprise/organizations/${organizationId}/access-reviews`, data)
export const decideAccessReviewItem = (organizationId, reviewId, itemId, data) =>
  request(
    'POST',
    `/api/enterprise/organizations/${organizationId}/access-reviews/${reviewId}/items/${itemId}`,
    data,
  )
export const cancelAccessReview = (organizationId, reviewId) =>
  request('DELETE', `/api/enterprise/organizations/${organizationId}/access-reviews/${reviewId}`)

// Billing sandbox and provider-neutral lifecycle
export const getBillingSummary = () => request('GET', '/api/billing')
export const updateBillingCustomer = data => request('PUT', '/api/billing/customer', data)
export const createBillingCheckout = data => request('POST', '/api/billing/checkout', data)
export const completeBillingCheckout = (id, token) =>
  request('POST', `/api/billing/checkout/${id}/complete`, { token })
export const cancelBillingCheckout = id => request('DELETE', `/api/billing/checkout/${id}`)
export const cancelBillingSubscription = (immediate = false) =>
  request('POST', '/api/billing/subscription/cancel', { immediate })
export const resumeBillingSubscription = () =>
  request('POST', '/api/billing/subscription/resume')
export const getBillingInvoice = id => request('GET', `/api/billing/invoices/${id}`)

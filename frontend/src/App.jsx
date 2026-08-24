import { BrowserRouter, Routes, Route, Navigate } from './lib/router.jsx'
import { lazy, Suspense, useState, useEffect } from 'react'
import WorkspaceErrorBoundary from './components/WorkspaceErrorBoundary'
import Landing from './pages/Landing'
import Pricing from './pages/Pricing'
import Integrations from './pages/Integrations'
import TemplatesShowcase from './pages/TemplatesShowcase'

const MainLayout = lazy(() => import('./layouts/MainLayout'))
const SiteAssistant = lazy(() => import('./components/SiteAssistant'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Studio = lazy(() => import('./pages/Studio'))
const SupportOperations = lazy(() => import('./pages/SupportOperations'))
const CreateAgent = lazy(() => import('./pages/CreateAgent'))
const AgentRun = lazy(() => import('./pages/AgentRun'))
const AgentRunHistory = lazy(() => import('./pages/AgentRunHistory'))
const AgentVersions = lazy(() => import('./pages/AgentVersions'))
const Marketplace = lazy(() => import('./pages/Marketplace'))
const Chains = lazy(() => import('./pages/Chains'))
const CreateChain = lazy(() => import('./pages/CreateChain'))
const ChainRun = lazy(() => import('./pages/ChainRun'))
const ChainRunHistory = lazy(() => import('./pages/ChainRunHistory'))
const Workflows = lazy(() => import('./pages/Workflows'))
const WorkflowBuilder = lazy(() => import('./pages/WorkflowBuilder'))
const Triggers = lazy(() => import('./pages/Triggers'))
const Credentials = lazy(() => import('./pages/Credentials'))
const Approvals = lazy(() => import('./pages/Approvals'))
const Observability = lazy(() => import('./pages/Observability'))
const Evaluations = lazy(() => import('./pages/Evaluations'))
const Knowledge = lazy(() => import('./pages/Knowledge'))
const MultiAgents = lazy(() => import('./pages/MultiAgents'))
const UsagePlans = lazy(() => import('./pages/UsagePlans'))
const Organizations = lazy(() => import('./pages/Organizations'))
const EnterpriseAccess = lazy(() => import('./pages/EnterpriseAccess'))
const Billing = lazy(() => import('./pages/Billing'))
const DeveloperPlatform = lazy(() => import('./pages/DeveloperPlatform'))
const LaunchReadiness = lazy(() => import('./pages/LaunchReadiness'))
const AppsHub = lazy(() => import('./pages/AppsHub'))
const Settings = lazy(() => import('./pages/Settings'))
const Copilot = lazy(() => import('./pages/Copilot'))
const WorkspaceTools = lazy(() => import('./pages/WorkspaceTools'))
const PUBLIC_ROUTES = new Set(['/', '/pricing', '/integrations', '/templates', '/login', '/signup'])

function ProtectedRoute({ children, user }) {
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [assistantReady, setAssistantReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let subscription
    const initializeAuth = async () => {
      try {
        const { supabase } = await import('./lib/supabase')
        if (cancelled) return
        const { data:{ session } } = await supabase.auth.getSession()
        if (cancelled) return
        setUser(session?.user ?? null)
        ;({ data:{ subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          setUser(nextSession?.user ?? null)
        }))
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const isMarketingPage = ['/', '/pricing', '/integrations', '/templates'].includes(window.location.pathname)
    const timer = window.setTimeout(initializeAuth, isMarketingPage ? 1800 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setAssistantReady(true), 2200)
    return () => window.clearTimeout(timer)
  }, [])

  if (loading && !PUBLIC_ROUTES.has(window.location.pathname)) return (
    <div className="workspace-loading">
      <div className="workspace-loading-card"><span className="workspace-spinner" /> Loading AgentForge…</div>
    </div>
  )

  const protect = (Component) => (
    <ProtectedRoute user={user}>
      <Suspense fallback={<div className="workspace-loading"><div className="workspace-loading-card"><span className="workspace-spinner" /> Loading workspace…</div></div>}>
        <MainLayout user={user}>
          <WorkspaceErrorBoundary>
            <Component />
          </WorkspaceErrorBoundary>
        </MainLayout>
      </Suspense>
    </ProtectedRoute>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                  element={<Landing />} />
        <Route path="/pricing"           element={<Pricing />} />
        <Route path="/integrations"      element={<Integrations />} />
        <Route path="/templates"         element={<TemplatesShowcase />} />
        <Route path="/login"             element={<Suspense fallback={null}><Login setUser={setUser} /></Suspense>} />
        <Route path="/signup"            element={<Suspense fallback={null}><Signup setUser={setUser} /></Suspense>} />
        <Route path="/dashboard"         element={protect(Dashboard)} />
        <Route path="/studio"            element={protect(Studio)} />
        <Route path="/build"             element={<Navigate to="/studio" replace />} />
        <Route path="/copilot"           element={protect(Copilot)} />
        <Route path="/tools"             element={protect(WorkspaceTools)} />
        <Route path="/support-operations" element={protect(SupportOperations)} />
        <Route path="/agents/new"        element={protect(CreateAgent)} />
        <Route path="/agents/:id/edit"   element={protect(CreateAgent)} />
        <Route path="/agents/:id/versions" element={protect(AgentVersions)} />
        <Route path="/agents/:id/run"    element={protect(AgentRun)} />
        <Route path="/agents/:id/runs"   element={protect(AgentRunHistory)} />
        <Route path="/marketplace"       element={protect(Marketplace)} />
        <Route path="/apps"              element={protect(AppsHub)} />
        {/* NEW — Day 7 — Agent Chains */}
        <Route path="/chains"            element={protect(Chains)} />
        <Route path="/chains/new"        element={protect(CreateChain)} />
        <Route path="/chains/:id/run"    element={protect(ChainRun)} />
        <Route path="/chains/:id/runs" element={protect(ChainRunHistory)} />
        <Route path="/workflows"         element={protect(Workflows)} />
        <Route path="/workflows/new"     element={protect(WorkflowBuilder)} />
        <Route path="/workflows/:id/edit" element={protect(WorkflowBuilder)} />
        <Route path="/triggers"          element={protect(Triggers)} />
        <Route path="/credentials"       element={protect(Credentials)} />
        <Route path="/approvals"         element={protect(Approvals)} />
        <Route path="/observability"     element={protect(Observability)} />
        <Route path="/evaluations"       element={protect(Evaluations)} />
        <Route path="/knowledge"         element={protect(Knowledge)} />
        <Route path="/multi-agents"      element={protect(MultiAgents)} />
        <Route path="/usage"             element={protect(UsagePlans)} />
        <Route path="/organizations"     element={protect(Organizations)} />
        <Route path="/enterprise-access" element={protect(EnterpriseAccess)} />
        <Route path="/billing"           element={protect(Billing)} />
        <Route path="/developer"         element={protect(DeveloperPlatform)} />
        <Route path="/launch"            element={protect(LaunchReadiness)} />
        <Route path="/settings"          element={protect(Settings)} />
        <Route path="*"                  element={<Navigate to="/" replace />} />
      </Routes>
      {assistantReady && window.location.pathname !== '/copilot' && <Suspense fallback={null}><SiteAssistant user={user} /></Suspense>}
    </BrowserRouter>
  )
}

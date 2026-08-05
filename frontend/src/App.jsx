import { BrowserRouter, Routes, Route, Navigate } from './lib/router.jsx'
import { lazy, Suspense, useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import MainLayout from './layouts/MainLayout'
import WorkspaceErrorBoundary from './components/WorkspaceErrorBoundary'
import SiteAssistant from './components/SiteAssistant'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Landing from './pages/Landing'
import Pricing from './pages/Pricing'
import Integrations from './pages/Integrations'
import TemplatesShowcase from './pages/TemplatesShowcase'

const Dashboard = lazy(() => import('./pages/Dashboard'))
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
const Settings = lazy(() => import('./pages/Settings'))

function ProtectedRoute({ children, user }) {
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => setUser(session?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div className="workspace-loading">
      <div className="workspace-loading-card"><span className="workspace-spinner" /> Loading AgentForge…</div>
    </div>
  )

  const protect = (Component) => (
    <ProtectedRoute user={user}>
      <MainLayout user={user}>
        <WorkspaceErrorBoundary>
          <Suspense fallback={(
            <div className="workspace-loading">
              <div className="workspace-loading-card"><span className="workspace-spinner" /> Loading workspace…</div>
            </div>
          )}>
            <Component />
          </Suspense>
        </WorkspaceErrorBoundary>
      </MainLayout>
    </ProtectedRoute>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                  element={<Landing />} />
        <Route path="/pricing"           element={<Pricing />} />
        <Route path="/integrations"      element={<Integrations />} />
        <Route path="/templates"         element={<TemplatesShowcase />} />
        <Route path="/login"             element={<Login    setUser={setUser} />} />
        <Route path="/signup"            element={<Signup   setUser={setUser} />} />
        <Route path="/dashboard"         element={protect(Dashboard)} />
        <Route path="/agents/new"        element={protect(CreateAgent)} />
        <Route path="/agents/:id/edit"   element={protect(CreateAgent)} />
        <Route path="/agents/:id/versions" element={protect(AgentVersions)} />
        <Route path="/agents/:id/run"    element={protect(AgentRun)} />
        <Route path="/agents/:id/runs"   element={protect(AgentRunHistory)} />
        <Route path="/marketplace"       element={protect(Marketplace)} />
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
      <SiteAssistant user={user} />
    </BrowserRouter>
  )
}

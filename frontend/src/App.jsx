import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import MainLayout from './layouts/MainLayout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Landing from './pages/Landing'

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

function ProtectedRoute({ children, user }) {
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ background: '#0F1117', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px' }}>
      Loading...
    </div>
  )

  const protect = (Component) => (
    <ProtectedRoute user={user}>
      <MainLayout user={user}>
        <Suspense fallback={(
          <div style={{ color:'#8B8FA3', padding:24, textAlign:'center' }}>
            Loading workspace…
          </div>
        )}>
          <Component />
        </Suspense>
      </MainLayout>
    </ProtectedRoute>
  )

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                  element={<Landing />} />
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
        <Route path="*"                  element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

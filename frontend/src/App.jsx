import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import MainLayout from './layouts/MainLayout'
import Dashboard from './pages/Dashboard'
import CreateAgent from './pages/CreateAgent'
import AgentRun from './pages/AgentRun'
import AgentRunHistory from './pages/AgentRunHistory'
import AgentVersions from './pages/AgentVersions'
import Marketplace from './pages/Marketplace'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Landing from './pages/Landing'
import Chains from './pages/Chains'
import CreateChain from './pages/CreateChain'
import ChainRun from './pages/ChainRun'
import ChainRunHistory from './pages/ChainRunHistory'
import Workflows from './pages/Workflows'
import WorkflowBuilder from './pages/WorkflowBuilder'
import Triggers from './pages/Triggers'
import Credentials from './pages/Credentials'
import Approvals from './pages/Approvals'
import Observability from './pages/Observability'
import Evaluations from './pages/Evaluations'
import Knowledge from './pages/Knowledge'
import MultiAgents from './pages/MultiAgents'
import UsagePlans from './pages/UsagePlans'

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
        <Component />
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
        <Route path="*"                  element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

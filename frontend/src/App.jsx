import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import MainLayout from './layouts/MainLayout'
import Dashboard from './pages/Dashboard'
import CreateAgent from './pages/CreateAgent'
import AgentRun from './pages/AgentRun'
import AgentRunHistory from './pages/AgentRunHistory'
import Marketplace from './pages/Marketplace'
import Login from './pages/Login'
import Signup from "./pages/Signup";
import Landing from './pages/Landing'
function ProtectedRoute({ children, user }) {
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(null)
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
    <div style={{ background: '#0F1117', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '16px', fontFamily: 'system-ui' }}>
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
        <Route path="/"                element={<Landing />} />
        <Route path="/login"           element={<Login setUser={setUser} />} />
        <Route path="/signup"          element={<Signup setUser={setUser} />} />
        <Route path="/dashboard"       element={protect(Dashboard)} />
        <Route path="/agents/new"      element={protect(CreateAgent)} />
        <Route path="/agents/:id/run"  element={protect(AgentRun)} />
        <Route path="/agents/:id/runs" element={protect(AgentRunHistory)} />
        <Route path="/marketplace"     element={protect(Marketplace)} />
        <Route path="*"                element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

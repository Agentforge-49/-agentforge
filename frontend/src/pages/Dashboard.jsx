import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import AgentCard from '../components/AgentCard'
import { getAgents, getDashboardStats } from '../lib/api'

export default function Dashboard() {
  const navigate  = useNavigate()
  const [agents,  setAgents]  = useState([])
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError('')
        const [agentsData, statsData] = await Promise.all([
          getAgents(),
          getDashboardStats()
        ])
        setAgents(agentsData)
        setStats(statsData)
      } catch (err) {
        setError(err.message || 'Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 14 }}>
      <div style={{ width: 36, height: 36, border: '3px solid #2A2D3E', borderTop: '3px solid #7C3AED', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#9CA3AF', fontSize: 14 }}>Loading your agents...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ background: '#2D1515', border: '1px solid #EF4444', borderRadius: 12, padding: '20px 28px', textAlign: 'center', maxWidth: 400 }}>
        <p style={{ color: '#FCA5A5', fontSize: 15, marginBottom: 14 }}>⚠️ {error}</p>
        <button
          onClick={() => window.location.reload()}
          style={{ background: '#7C3AED', color: 'white', border: 'none', padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Try again
        </button>
      </div>
    </div>
  )

  const statCards = stats ? [
    { label: 'Total Agents',   value: stats.total_agents },
    { label: 'Active Agents',  value: stats.active_agents },
    { label: 'Total Runs',     value: stats.total_runs },
    { label: 'API Calls Used', value: `${stats.api_calls_used} / ${stats.api_calls_limit}` },
  ] : []

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>Dashboard</h1>
          <p style={{ color: '#9CA3AF', fontSize: 14 }}>Welcome back. Here are your agents.</p>
        </div>
        <button
          onClick={() => navigate('/agents/new')}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#7C3AED', color: 'white', border: 'none', padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
          <Plus size={15} /> Create Agent
        </button>
      </div>

      {/* ── Stats row ── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
          {statCards.map(s => (
            <div key={s.label} style={{ background: '#1A1D27', border: '1px solid #2A2D3E', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 600 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Agent grid ── */}
      <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 14 }}>My Agents</h2>

      {agents.length === 0 ? (
        // ── Empty state ──
        <div style={{ background: '#1A1D27', border: '1px dashed #2A2D3E', borderRadius: 16, padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <h3 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>No agents yet</h3>
          <p style={{ color: '#9CA3AF', fontSize: 14, marginBottom: 24 }}>Create your first AI agent to get started</p>
          <button
            onClick={() => navigate('/agents/new')}
            style={{ background: '#7C3AED', color: 'white', border: 'none', padding: '11px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
            Create your first agent
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 14 }}>
          {agents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
        </div>
      )}
    </div>
  )
}

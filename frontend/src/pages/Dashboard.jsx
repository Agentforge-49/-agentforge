import { useCallback, useEffect, useState } from 'react'
import {
  Activity, ArrowRight, Bot, KeyRound, Link2, Plus, Sparkles, Workflow,
} from 'lucide-react'

import AgentCard from '../components/AgentCard'
import { getAgents, getDashboardStats } from '../lib/api'
import { useNavigate } from '../lib/router.jsx'

const QUICK_ACTIONS = [
  { title:'Install a starter workflow', detail:'Launch support, lead, or research automation from a guided production pattern.', to:'/marketplace', icon:Sparkles },
  { title:'Build from scratch', detail:'Combine your own agents, logic, approvals, and connected apps.', to:'/workflows/new', icon:Workflow },
  { title:'Connect your tools', detail:'Add encrypted credentials or consent-based accounts.', to:'/credentials', icon:KeyRound },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [agentsData, statsData] = await Promise.all([getAgents(), getDashboardStats()])
      setAgents(agentsData)
      setStats(statsData)
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(loadData, 0)
    return () => clearTimeout(timer)
  }, [loadData])

  if (loading) return (
    <div className="workspace-loading">
      <div className="workspace-loading-card"><span className="workspace-spinner" /> Preparing your command center…</div>
    </div>
  )

  if (error) return (
    <div className="dashboard-error">
      <div className="dashboard-error-card">
        <strong>We could not load the dashboard</strong>
        <p>{error}</p>
        <button onClick={loadData}>Try again</button>
      </div>
    </div>
  )

  const statCards = [
    { label:'Total agents', value:stats?.total_agents ?? 0, icon:Bot, tone:'green' },
    { label:'Active agents', value:stats?.active_agents ?? 0, icon:Sparkles, tone:'mint' },
    { label:'Total runs', value:stats?.total_runs ?? 0, icon:Activity, tone:'blue' },
    { label:'API calls used', value:`${stats?.api_calls_used ?? 0} / ${stats?.api_calls_limit ?? 0}`, icon:Link2, tone:'amber' },
  ]

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <div className="dashboard-eyebrow"><Sparkles size={13} /> Agent operations workspace</div>
          <h1>Turn one support or operations process into dependable automation.</h1>
          <p>Start from an approval-gated workflow, connect the tools your team already uses, and inspect every run.</p>
        </div>
        <button className="dashboard-primary" onClick={() => navigate('/agents/new')}>
          <Plus size={16} /> Create agent
        </button>
      </section>

      <section className="dashboard-stats" aria-label="Workspace statistics">
        {statCards.map(({ label, value, icon:Icon, tone }) => (
          <article className="dashboard-stat" key={label}>
            <span className={`dashboard-stat-icon dashboard-stat-icon-${tone}`}><Icon size={17} /></span>
            <div><small>{label}</small><strong>{value}</strong></div>
          </article>
        ))}
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-heading">
          <div><span>Start here</span><h2>Move from idea to production</h2></div>
        </div>
        <div className="dashboard-actions">
          {QUICK_ACTIONS.map(({ title, detail, to, icon:Icon }, index) => (
            <button key={title} className="dashboard-action" onClick={() => navigate(to)}>
              <span className="dashboard-action-number">0{index + 1}</span>
              <span className="dashboard-action-icon"><Icon size={19} /></span>
              <strong>{title}</strong>
              <span>{detail}</span>
              <span className="dashboard-action-link">Open workspace <ArrowRight size={14} /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-heading dashboard-section-heading-row">
          <div><span>Your workforce</span><h2>Agents</h2></div>
          {agents.length > 0 && <button className="dashboard-secondary" onClick={() => navigate('/agents/new')}><Plus size={14} /> New agent</button>}
        </div>
        {agents.length === 0 ? (
          <div className="dashboard-empty">
            <div className="dashboard-empty-visual"><Bot size={28} /></div>
            <h3>Start with a working business outcome</h3>
            <p>Install a complete support, lead, or research workflow with a published agent, human approval, real delivery connection, and test input.</p>
            <button className="dashboard-primary" onClick={() => navigate('/marketplace')}>Choose a starter workflow <ArrowRight size={15} /></button>
          </div>
        ) : (
          <div className="dashboard-agent-grid">
            {agents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
          </div>
        )}
      </section>
    </div>
  )
}

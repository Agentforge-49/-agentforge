import { useCallback, useEffect, useState } from 'react'
import {
  Activity, ArrowRight, Bot, Check, Circle, Clock3, KeyRound, Link2, LockKeyhole,
  Plus, ShieldCheck, Sparkles, Workflow,
} from 'lucide-react'

import AgentCard from '../components/AgentCard'
import { getActivationSummary, getAgents, getDashboardStats } from '../lib/api'
import { useNavigate } from '../lib/router.jsx'

const QUICK_ACTIONS = [
  { title:'Install a starter workflow', detail:'Launch support, lead, or research automation from a guided production pattern.', to:'/marketplace', icon:Sparkles },
  { title:'Open the unified Studio', detail:'Combine agents, logic, approvals, and connected apps in one build workspace.', to:'/studio', icon:Workflow },
  { title:'Connect your tools', detail:'Add encrypted credentials or consent-based accounts.', to:'/apps', icon:KeyRound },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [stats, setStats] = useState(null)
  const [activation, setActivation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [agentsData, statsData, activationData] = await Promise.all([
        getAgents(), getDashboardStats(), getActivationSummary().catch(() => null),
      ])
      setAgents(agentsData)
      setStats(statsData)
      setActivation(activationData)
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
        <button className="dashboard-primary" onClick={() => navigate('/studio')}>
          <Plus size={16} /> Open Studio
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

      {activation && <section className="activation-path" aria-labelledby="activation-path-title">
        <div className="activation-path-head">
          <div>
            <span className="activation-path-kicker"><ShieldCheck size={13} /> Launch path</span>
            <h2 id="activation-path-title">Turn setup into a production-ready outcome</h2>
            <p>{activation.completed} of {activation.total} launch controls complete. Each signal is calculated from workspace metadata, never customer content.</p>
          </div>
          <div className="activation-path-score" aria-label={`${activation.percentage}% launch path complete`}>
            <strong>{activation.percentage}%</strong>
            <span>{activation.activated ? 'Activated' : 'In progress'}</span>
          </div>
        </div>
        <div className="activation-progress" role="progressbar" aria-label="Launch path progress"
          aria-valuemin="0" aria-valuemax="100" aria-valuenow={activation.percentage}>
          <span style={{ width:`${activation.percentage}%` }} />
        </div>
        <div className="activation-stages">
          {activation.stages.map((stage, index) => (
            <button type="button" key={stage.key} className={`activation-stage${stage.ready ? ' activation-stage-ready' : ''}`}
              onClick={() => navigate(stage.path)} aria-label={`${stage.label}: ${stage.ready ? 'complete' : 'not complete'}`}>
              <span className="activation-stage-status">{stage.ready ? <Check size={13} /> : <Circle size={13} />}</span>
              <span><small>0{index + 1}</small><strong>{stage.label}</strong></span>
            </button>
          ))}
        </div>
        <div className="activation-path-footer">
          <div>
            {activation.current_stage ? <><Clock3 size={14} /><span>Next: <strong>{activation.current_stage.label}</strong> — {activation.current_stage.detail}</span></>
              : <><Check size={14} /><span>Every activation control is complete. Run final release checks before launch.</span></>}
          </div>
          <button type="button" onClick={() => navigate('/launch')}>Open Release Center <ArrowRight size={14} /></button>
        </div>
        <div className="activation-privacy"><LockKeyhole size={12} /> {activation.privacy.note}</div>
      </section>}

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
          {agents.length > 0 && <button className="dashboard-secondary" onClick={() => navigate('/studio')}><Plus size={14} /> Open Studio</button>}
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

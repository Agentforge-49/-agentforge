import { Clock, Layers3, Pencil, PlayCircle } from 'lucide-react'
import { Link } from '../lib/router.jsx'

export default function AgentCard({ agent }) {
  if (!agent) return <div className="agent-card agent-card-empty">No agent data available.</div>

  const runnable = agent.status === 'active' && Boolean(agent.published_version_id)
  const statusTone = agent.status === 'paused' ? 'paused'
    : !agent.published_version_id ? 'draft'
      : agent.has_unpublished_changes ? 'changed' : 'published'
  const statusLabel = agent.status === 'paused' ? 'Paused'
    : !agent.published_version_id ? 'Draft'
      : agent.has_unpublished_changes
        ? `Published v${agent.latest_version_number} · Draft changes`
        : `Published v${agent.latest_version_number}`

  return (
    <article className="agent-card">
      <div className="agent-card-header">
        <div className={`agent-card-avatar agent-card-avatar-${agent.category || 'default'}`}>
          {agent.initials || agent.name?.slice(0, 2).toUpperCase() || 'AF'}
        </div>
        <div className="agent-card-identity">
          <h3>{agent.name}</h3>
          <p>{agent.description || 'Ready for a clear assignment.'}</p>
        </div>
      </div>

      <div className="agent-card-meta">
        <span className={`agent-status agent-status-${statusTone}`}>{statusLabel}</span>
        <span>{agent.run_count || 0} run{agent.run_count === 1 ? '' : 's'}</span>
      </div>

      <div className="agent-card-actions">
        <Link to={runnable ? `/agents/${agent.id}/run` : `/agents/${agent.id}/edit`} className="agent-card-primary">
          {runnable ? <><PlayCircle size={15} /> Run agent</> : <><Pencil size={15} /> {agent.status === 'paused' ? 'Paused' : 'Finish & publish'}</>}
        </Link>
        <Link to={`/agents/${agent.id}/edit`} className="agent-card-icon-button" title="Edit agent"><Pencil size={15} /></Link>
        <Link to={`/agents/${agent.id}/versions`} className="agent-card-icon-button" title="Version history"><Layers3 size={15} /></Link>
        <Link to={`/agents/${agent.id}/runs`} className="agent-card-icon-button" title="Run history"><Clock size={15} /></Link>
      </div>
    </article>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2, Clock3, Coins,
  GitBranch, MessageCircleMore, PlugZap, RefreshCw, ShieldCheck, Sparkles, Wrench,
} from 'lucide-react'

import { getWorkspaceBootstrap } from '../lib/api'
import { useNavigate } from '../lib/router.jsx'

const ROLE_VIEWS = {
  operations:{ label:'Internal operations', outcome:'Coordinate requests, approvals, and dependable delivery.' },
  support:{ label:'Support', outcome:'Triage customer issues and keep escalation decisions visible.' },
  sales:{ label:'Sales operations', outcome:'Prepare account work and route follow-ups without losing control.' },
}

const QUICK_OUTCOMES = [
  'Handle support requests safely',
  'Qualify and route new leads',
  'Review documents and collect approval',
]

function relativeTime(value) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function countLabel(count, singular) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [role, setRole] = useState('operations')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [outcome, setOutcome] = useState('')

  const load = useCallback(async (fresh = false) => {
    setLoading(true)
    try { setError(''); setData(await getWorkspaceBootstrap({ fresh })) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const readiness = useMemo(() => data ? Object.values(data.readiness).filter(Boolean).length : 0, [data])
  const openOutcome = value => {
    const prompt = String(value || outcome).trim()
    if (prompt) navigate(`/copilot?mode=build&prompt=${encodeURIComponent(prompt)}`)
  }
  if (loading || (!data && !error)) return <div className="workspace-loading"><div className="workspace-loading-card"><span className="workspace-spinner" /> Preparing your command center…</div></div>
  if (error) return <div className="dashboard-error"><div className="dashboard-error-card"><strong>Command Center is unavailable</strong><p>{error}</p><button onClick={() => load(true)}>Try again</button></div></div>

  const metrics = [
    { label:'Active work', value:(data.counts.active_agents + data.counts.active_workflows), detail:`${countLabel(data.counts.active_agents, 'agent')} · ${countLabel(data.counts.active_workflows, 'workflow')}`, icon:Activity, tone:'green' },
    { label:'Needs approval', value:data.counts.approvals, detail:'Human decisions waiting', icon:ShieldCheck, tone:'violet' },
    { label:'Failed runs', value:data.counts.failed_runs, detail:'Open Activity to recover', icon:AlertTriangle, tone:data.counts.failed_runs ? 'red' : 'green' },
    { label:'Usage', value:`${data.usage.used}/${data.usage.limit}`, detail:`${data.user.plan} workspace`, icon:Coins, tone:'amber' },
  ]

  return <div className="command-page">
    <section className="command-hero">
      <div><span className="command-eyebrow"><Sparkles size={13} /> Operations Command Center</span><h1>See what is moving, what needs you, and what to improve.</h1><p>{ROLE_VIEWS[role].outcome}</p></div>
      <div className="command-role-switch" aria-label="Command center role view">
        {Object.entries(ROLE_VIEWS).map(([key, view]) => <button key={key} className={role === key ? 'active' : ''} onClick={() => setRole(key)}>{view.label}</button>)}
      </div>
    </section>

    <section className="command-launchpad" aria-labelledby="outcome-launcher-title">
      <div className="command-launchpad-main">
        <span><MessageCircleMore size={13} /> Start here</span>
        <h2 id="outcome-launcher-title">What result should your AI operation deliver?</h2>
        <p>Use ordinary language. Copilot will turn it into steps, required apps, tests, and an approval point.</p>
        <div className="command-outcome-input"><textarea value={outcome} onChange={event => setOutcome(event.target.value)} placeholder="Example: When a customer emails us, classify the request, draft a reply, and ask me before sending it." rows="2" maxLength="1000" /><button disabled={!outcome.trim()} onClick={() => openOutcome()}>Design with Copilot <ArrowRight size={14} /></button></div>
        <div className="command-outcome-examples">{QUICK_OUTCOMES.map(item => <button key={item} onClick={() => openOutcome(item)}>{item}</button>)}</div>
      </div>
      <ol className="command-launchpad-steps"><li><span>1</span><div><strong>Describe the result</strong><small>No agent terminology required.</small></div></li><li><span>2</span><div><strong>Review the system</strong><small>See every step and connection.</small></div></li><li><span>3</span><div><strong>Test, approve, activate</strong><small>Nothing acts silently.</small></div></li></ol>
    </section>

    <section className="command-metrics" aria-label="Operational metrics">
      {metrics.map(({ label, value, detail, icon:Icon, tone }) => <article key={label} className={`command-metric command-tone-${tone}`}><span><Icon size={17} /></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>)}
    </section>

    <section className="command-main-grid">
      <article className="command-panel command-work">
        <header><div><span>Live work</span><h2>Recent activity</h2></div><button onClick={() => navigate('/observability')}>View all <ArrowRight size={13} /></button></header>
        <div className="command-list">
          {data.recent_activity.length ? data.recent_activity.map(run => <button key={run.execution_job_id} onClick={() => navigate('/observability')}>
            <span className={`command-run-status ${run.status}`}><Activity size={14} /></span><span><strong>{run.resource_name}</strong><small>{run.run_type.replaceAll('_', ' ')} · {relativeTime(run.created_at)}</small></span><em>{run.status}</em>
          </button>) : <div className="command-empty"><Clock3 size={21} /><strong>No runs yet</strong><p>Test a workflow in Build and its trace will appear here.</p><button onClick={() => navigate('/studio')}>Open Build</button></div>}
        </div>
      </article>

      <aside className="command-side">
        <article className="command-panel command-approvals"><header><div><span>Control point</span><h2>Approval queue</h2></div><strong>{data.counts.approvals}</strong></header>
          {data.approval_queue.length ? data.approval_queue.slice(0, 3).map(item => <button key={item.id} onClick={() => navigate('/approvals')}><ShieldCheck size={15} /><span><strong>Workflow decision</strong><small>Requested {relativeTime(item.created_at)}</small></span><ArrowRight size={13} /></button>) : <div className="command-small-empty"><CheckCircle2 size={18} /><span><strong>Queue is clear</strong><small>No decisions are waiting.</small></span></div>}
          <button className="command-panel-link" onClick={() => navigate('/approvals')}>Open approval queue <ArrowRight size={13} /></button>
        </article>
        <article className="command-panel command-readiness"><header><div><span>Workspace readiness</span><h2>{readiness}/3 foundations ready</h2></div><button onClick={() => load(true)} aria-label="Refresh readiness"><RefreshCw size={14} /></button></header>
          {[
            ['has_builder_resource','Build resource',GitBranch,'/studio'],['has_connection','App connection',PlugZap,'/apps'],['has_active_work','Active automation',Bot,'/studio'],
          ].map(([key,label,Icon,to]) => <button key={key} onClick={() => navigate(to)}><span className={data.readiness[key] ? 'ready' : ''}>{data.readiness[key] ? <CheckCircle2 size={14} /> : <Icon size={14} />}</span><strong>{label}</strong><small>{data.readiness[key] ? 'Ready' : 'Set up'}</small></button>)}
        </article>
      </aside>
    </section>

    <section className="command-next">
      <div><span><Wrench size={16} /></span><div><small>Recommended next step</small><h2>{data.counts.approvals ? 'Review the decisions waiting for you.' : data.counts.failed_runs ? 'Recover your latest failed run.' : 'Describe your next outcome to Copilot.'}</h2></div></div>
      <button onClick={() => navigate(data.counts.approvals ? '/approvals' : data.counts.failed_runs ? '/observability' : '/copilot')}>Continue <ArrowRight size={14} /></button>
    </section>
  </div>
}

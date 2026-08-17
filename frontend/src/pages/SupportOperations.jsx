import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowRight, CheckCircle2, Circle, Eye, FlaskConical,
  Headphones, KeyRound, PlayCircle, ShieldCheck, Sparkles,
} from 'lucide-react'

import FlagshipStarterKits from '../components/FlagshipStarterKits'
import {
  getApprovals, getCredentials, getEvaluationSuites, getOauthConnections,
  getObservabilityRuns, getWorkflows,
} from '../lib/api'
import { useNavigate } from '../lib/router.jsx'
import '../styles/SupportOperations.css'

export default function SupportOperations() {
  const navigate = useNavigate()
  const [data, setData] = useState({ workflows:[], connections:[], runs:[], approvals:[], suites:[] })
  const [loading, setLoading] = useState(true)
  const [warnings, setWarnings] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      getWorkflows(), getCredentials(), getOauthConnections(),
      getObservabilityRuns({ q:'Support triage', limit:50 }), getApprovals(''),
      getEvaluationSuites(),
    ])
    const value = index => results[index].status === 'fulfilled' ? results[index].value : null
    setData({
      workflows:value(0) || [],
      connections:[...(value(1) || []), ...(value(2) || [])],
      runs:value(3)?.runs || [],
      approvals:value(4) || [],
      suites:value(5) || [],
    })
    const labels = ['workflows', 'vault connections', 'OAuth connections', 'runs', 'approvals', 'quality suites']
    setWarnings(results.flatMap((result, index) => result.status === 'rejected' ? [`Could not load ${labels[index]}.`] : []))
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const state = useMemo(() => {
    const workflow = data.workflows.find(item => /support triage/i.test(item.name || ''))
    const observeOnly = /observe-only/i.test(workflow?.description || '')
    const slackReady = data.connections.some(item => item.provider === 'slack' && item.status !== 'revoked')
    const approvals = data.approvals.filter(item => /support triage/i.test(item.workflows?.name || ''))
    const suite = data.suites.find(item => /support triage release gate/i.test(item.name || ''))
    return { workflow, observeOnly, slackReady, approvals, suite, runs:data.runs }
  }, [data])

  const stages = [
    { label:'Safe starting mode', detail:state.observeOnly ? 'Observe-only: no external action' : state.slackReady ? 'Slack connection ready' : 'Observe now or connect Slack', ready:Boolean(state.observeOnly || state.slackReady), path:'/apps', icon:KeyRound },
    { label:'Support system', detail:state.workflow ? state.workflow.name : 'Install the guided support workflow', ready:Boolean(state.workflow), path:state.workflow ? `/workflows/${state.workflow.id}/edit` : '#install-support', icon:Headphones },
    { label:'Production evidence', detail:state.runs.length ? `${state.runs.length} observed support run${state.runs.length === 1 ? '' : 's'}` : 'Run the sample ticket and inspect the trace', ready:state.runs.length > 0, path:'/observability', icon:Activity },
    { label:'Release quality', detail:state.suite ? `${state.suite.evaluation_cases?.length || 3} seeded safety checks` : 'Create a measurable release gate', ready:Boolean(state.suite), path:'/evaluations', icon:FlaskConical },
  ]
  const completed = stages.filter(stage => stage.ready).length

  return (
    <div className="support-ops-page">
      <header className="support-ops-hero">
        <div>
          <div className="support-ops-eyebrow"><Sparkles size={13} /> Flagship solution</div>
          <h1>Launch a trustworthy support operation—not a chatbot demo.</h1>
          <p>Classify customer requests, draft bounded responses, require human judgment for external delivery, and promote autonomy only after the evidence is strong.</p>
          <div className="support-ops-hero-actions">
            <button type="button" onClick={() => document.querySelector('#install-support')?.scrollIntoView({ behavior:'smooth' })}>Configure support operation <ArrowRight size={14} /></button>
            <button className="secondary" type="button" onClick={() => navigate('/observability')}>Inspect runs</button>
          </div>
        </div>
        <div className="support-ops-score">
          <span>Launch progress</span><strong>{completed}/4</strong>
          <div><i style={{ width:`${completed * 25}%` }} /></div>
          <small>{loading ? 'Checking your workspace…' : completed === 4 ? 'Core operating loop is ready' : `${4 - completed} launch step${4 - completed === 1 ? '' : 's'} remaining`}</small>
        </div>
      </header>

      {warnings.length > 0 && <div className="support-ops-warning">{warnings.join(' ')} <button type="button" onClick={load}>Retry</button></div>}

      <section className="support-ops-stages" aria-label="Support operation launch stages">
        {stages.map(({ label, detail, ready, path, icon:Icon }, index) => (
          <button type="button" key={label} onClick={() => path.startsWith('#') ? document.querySelector(path)?.scrollIntoView({ behavior:'smooth' }) : navigate(path)}>
            <span className={`support-stage-state${ready ? ' ready' : ''}`}>{ready ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
            <span className="support-stage-icon"><Icon size={17} /></span>
            <span><small>Step {index + 1}</small><strong>{label}</strong><em>{detail}</em></span>
            <ArrowRight size={14} />
          </button>
        ))}
      </section>

      <section className="support-ops-section">
        <div className="support-ops-section-heading"><div><span>Progressive autonomy</span><h2>Earn the right to automate.</h2></div><p>AgentForge starts safely and makes the next level explicit. Fully autonomous delivery stays locked until Quality and real runs prove the system.</p></div>
        <div className="support-autonomy-ladder">
          <article className="available"><Eye size={20} /><small>Level 1</small><h3>Observe</h3><p>Classify and draft. Nothing leaves AgentForge.</p><strong>Available now</strong></article>
          <article className="recommended"><ShieldCheck size={20} /><small>Level 2</small><h3>Approval required</h3><p>A support lead reviews every Slack handoff.</p><strong>Recommended launch mode</strong></article>
          <article><PlayCircle size={20} /><small>Level 3</small><h3>Bounded autonomy</h3><p>Low-risk cases can move after policy and quality gates.</p><strong>Qualification required</strong></article>
          <article><Sparkles size={20} /><small>Level 4</small><h3>Autonomous</h3><p>Continuous monitoring, rollback, and exception routing.</p><strong>Locked</strong></article>
        </div>
      </section>

      <div id="install-support" className="support-ops-install">
        <FlagshipStarterKits
          onlySlug="support-triage-slack"
          heading={state.workflow ? 'Create another controlled support environment.' : 'Install the complete support operation.'}
          description="Choose observe-only or approval-required delivery. AgentForge creates the agent, workflow, version, sample input, and three-case quality gate together."
          onInstalled={load}
        />
      </div>
    </div>
  )
}

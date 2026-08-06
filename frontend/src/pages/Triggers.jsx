import { useEffect, useMemo, useState } from 'react'
import {
  Activity, CalendarClock, CheckCircle2, Clock3, Copy, History, Pause,
  Play, Plus, Radio, RefreshCw, ShieldCheck, Sparkles, Trash2, Webhook,
  X,
} from 'lucide-react'

import {
  bulkTriggerStatus,
  createTrigger,
  deleteTrigger,
  fireTrigger,
  getTriggerEvents,
  getTriggers,
  getWorkflows,
  pauseTrigger,
  resumeTrigger,
  rotateTriggerSecret,
} from '../lib/api'
import './Triggers.css'

const TYPES = {
  manual:{ label:'Manual', icon:Play, description:'Start a controlled run with an operator-provided input.' },
  webhook:{ label:'Signed webhook', icon:Webhook, description:'React to any app through an authenticated, deduplicated event endpoint.' },
  schedule:{ label:'Schedule', icon:Clock3, description:'Run reliably on an interval without keeping a browser open.' },
}

const PRESETS = [
  { name:'Manual test console', trigger_type:'manual', icon:Play, detail:'Best for testing and operator-run workflows.' },
  { name:'External app event', trigger_type:'webhook', icon:Webhook, detail:'Works with Zapier, Make, Pipedream, custom apps, and server events.' },
  { name:'Hourly operations check', trigger_type:'schedule', interval_minutes:60, icon:Clock3, detail:'Run a workflow every hour.' },
  { name:'Daily report', trigger_type:'schedule', interval_minutes:1440, icon:CalendarClock, detail:'Run once every 24 hours.' },
]

export default function Triggers() {
  const [triggers, setTriggers] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [form, setForm] = useState({ name:'', workflow_id:'', trigger_type:'webhook', interval_minutes:60 })
  const [revealed, setRevealed] = useState(null)
  const [historyState, setHistoryState] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')

  const load = async () => {
    const [triggerData, workflowData] = await Promise.all([getTriggers(), getWorkflows()])
    const activeWorkflows = workflowData.filter(item => item.status === 'active')
    setTriggers(triggerData)
    setWorkflows(activeWorkflows)
    setForm(current => ({ ...current, workflow_id:current.workflow_id || activeWorkflows[0]?.id || '' }))
  }

  useEffect(() => {
    Promise.all([getTriggers(), getWorkflows()])
      .then(([triggerData, workflowData]) => {
        const activeWorkflows = workflowData.filter(item => item.status === 'active')
        setTriggers(triggerData)
        setWorkflows(activeWorkflows)
        setForm(current => ({ ...current, workflow_id:current.workflow_id || activeWorkflows[0]?.id || '' }))
      })
      .catch(err => setError(err.message))
  }, [])

  const stats = useMemo(() => ({
    active:triggers.filter(item => item.status === 'active').length,
    paused:triggers.filter(item => item.status === 'paused').length,
    webhooks:triggers.filter(item => item.trigger_type === 'webhook').length,
    scheduled:triggers.filter(item => item.trigger_type === 'schedule').length,
    automaticActive:triggers.filter(item => item.trigger_type !== 'manual' && item.status === 'active').length,
    automaticPaused:triggers.filter(item => item.trigger_type !== 'manual' && item.status === 'paused').length,
  }), [triggers])

  const choosePreset = preset => {
    setForm(current => ({
      ...current,
      name:preset.name,
      trigger_type:preset.trigger_type,
      interval_minutes:preset.interval_minutes || current.interval_minutes,
    }))
    document.getElementById('trigger-builder')?.scrollIntoView({ behavior:'smooth', block:'start' })
  }

  const create = async event => {
    event.preventDefault()
    setBusy('create')
    setError('')
    setMessage('')
    try {
      const created = await createTrigger(form)
      const { signing_secret:signingSecret, ...safeTrigger } = created
      setTriggers(items => [safeTrigger, ...items])
      setForm(current => ({ ...current, name:'' }))
      setMessage(`${created.name} is active.`)
      if (signingSecret) setRevealed({ secret:signingSecret, url:created.webhook_url, title:created.name })
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  const toggle = async trigger => {
    setBusy(trigger.id)
    try {
      const updated = trigger.status === 'active' ? await pauseTrigger(trigger.id) : await resumeTrigger(trigger.id)
      setTriggers(items => items.map(item => item.id === updated.id ? updated : item))
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  const bulk = async action => {
    setBusy(`bulk-${action}`)
    setError('')
    try {
      const updated = await bulkTriggerStatus(action)
      setTriggers(updated)
      setMessage(action === 'pause' ? 'All automatic triggers are paused.' : 'All triggers are active.')
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  const fire = async trigger => {
    const input = window.prompt('Input for this workflow run:')
    if (!input?.trim()) return
    setBusy(trigger.id)
    try {
      const result = await fireTrigger(trigger.id, input.trim(), crypto.randomUUID())
      setMessage(`Run accepted. Job ${result.job?.id || result.event?.execution_job_id || ''}`)
      await load()
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  const rotate = async trigger => {
    if (!window.confirm('Rotate this signing secret? The old secret stops working immediately.')) return
    try {
      const result = await rotateTriggerSecret(trigger.id)
      setRevealed({ secret:result.signing_secret, url:trigger.webhook_url, title:trigger.name })
    } catch (err) { setError(err.message) }
  }

  const showHistory = async trigger => {
    setBusy(trigger.id)
    try { setHistoryState({ title:trigger.name, events:await getTriggerEvents(trigger.id) }) }
    catch (err) { setError(err.message) } finally { setBusy('') }
  }

  const remove = async trigger => {
    if (!window.confirm(`Delete trigger "${trigger.name}" and its event history?`)) return
    try {
      await deleteTrigger(trigger.id)
      setTriggers(items => items.filter(item => item.id !== trigger.id))
    } catch (err) { setError(err.message) }
  }

  const copy = async value => {
    await navigator.clipboard.writeText(value)
    setMessage('Copied securely to clipboard.')
  }

  return (
    <div className="trigger-console">
      <header className="trigger-hero">
        <div>
          <span><Radio size={13} /> Event operations</span>
          <h1>Start the right workflow at the right moment.</h1>
          <p>Use manual runs, signed app events, or durable schedules. Every delivery is traceable, deduplicated, pausable, and connected to an active workflow.</p>
        </div>
        <div className="trigger-hero-actions">
          <button type="button" onClick={() => bulk('pause')} disabled={!stats.automaticActive || busy}><Pause size={14} /> Pause automation</button>
          <button className="primary" type="button" onClick={() => bulk('resume')} disabled={!stats.automaticPaused || busy}><Play size={14} /> Resume automation</button>
        </div>
      </header>

      <section className="trigger-stats">
        <div><Activity size={18} /><strong>{stats.active}</strong><span>Active</span></div>
        <div><Pause size={18} /><strong>{stats.paused}</strong><span>Paused</span></div>
        <div><Webhook size={18} /><strong>{stats.webhooks}</strong><span>Signed endpoints</span></div>
        <div><Clock3 size={18} /><strong>{stats.scheduled}</strong><span>Schedules</span></div>
      </section>

      {error && <div className="trigger-alert trigger-alert--error">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
      {message && <div className="trigger-alert trigger-alert--success"><CheckCircle2 size={15} /> {message}<button onClick={() => setMessage('')}><X size={14} /></button></div>}

      <section className="trigger-presets">
        <div className="trigger-section-heading"><span>Fast setup</span><h2>Choose an event pattern.</h2></div>
        <div className="trigger-preset-grid">
          {PRESETS.map(preset => {
            const Icon = preset.icon
            return <button type="button" key={preset.name} onClick={() => choosePreset(preset)}><Icon size={19} /><strong>{preset.name}</strong><span>{preset.detail}</span><Plus size={14} /></button>
          })}
        </div>
      </section>

      <section className="trigger-builder" id="trigger-builder">
        <div className="trigger-builder-copy">
          <span><Sparkles size={13} /> Trigger builder</span>
          <h2>Configure one dependable entry point.</h2>
          <p>Multiple triggers can target the same workflow independently. Pause one without deleting its configuration.</p>
          <div className="trigger-safety-note"><ShieldCheck size={17} /><div><strong>Secure by default</strong><span>Webhook secrets are shown once, signatures expire, repeat deliveries deduplicate, and endpoints are rate limited.</span></div></div>
        </div>
        <form onSubmit={create}>
          <label>Trigger name<input required maxLength="100" value={form.name} onChange={event => setForm({ ...form, name:event.target.value })} placeholder="New support request" /></label>
          <label>Active workflow<select required value={form.workflow_id} onChange={event => setForm({ ...form, workflow_id:event.target.value })}><option value="">Select workflow</option>{workflows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Event type<select value={form.trigger_type} onChange={event => setForm({ ...form, trigger_type:event.target.value })}>{Object.entries(TYPES).map(([value,item]) => <option value={value} key={value}>{item.label}</option>)}</select></label>
          {form.trigger_type === 'schedule' && <label>Repeat every<select value={form.interval_minutes} onChange={event => setForm({ ...form, interval_minutes:Number(event.target.value) })}><option value="15">15 minutes</option><option value="60">1 hour</option><option value="360">6 hours</option><option value="1440">1 day</option><option value="10080">1 week</option><option value="43200">30 days</option></select></label>}
          <p className="trigger-type-help">{TYPES[form.trigger_type].description}</p>
          {!workflows.length && <p className="trigger-no-workflows">Activate a workflow before creating a trigger.</p>}
          <button className="trigger-create" disabled={busy === 'create' || !workflows.length}><Plus size={14} /> {busy === 'create' ? 'Creating...' : 'Create active trigger'}</button>
        </form>
      </section>

      {revealed && <section className="trigger-secret">
        <div><span><ShieldCheck size={14} /> One-time secret</span><h2>{revealed.title}</h2><p>Copy this signing secret now. AgentForge stores only an encrypted version and will not display it again.</p></div>
        <SecretRow label="Webhook URL" value={revealed.url} onCopy={copy} />
        <SecretRow label="Signing secret" value={revealed.secret} onCopy={copy} />
        <code>HMAC-SHA256(timestamp + "." + rawBody)</code>
        <button type="button" onClick={() => setRevealed(null)}>I saved it</button>
      </section>}

      <section className="trigger-list-section">
        <div className="trigger-section-heading"><span>Live control</span><h2>Your workflow entry points.</h2></div>
        {!triggers.length ? <div className="trigger-empty"><Radio size={27} /><h3>No triggers yet</h3><p>Choose a preset above to add the first entry point to an active workflow.</p></div> : (
          <div className="trigger-grid">{triggers.map(trigger => {
            const meta = TYPES[trigger.trigger_type]
            const Icon = meta.icon
            return <article key={trigger.id} className={trigger.status === 'paused' ? 'is-paused' : ''}>
              <div className="trigger-card-top"><span className="trigger-type-icon"><Icon size={17} /></span><div><small>{meta.label}</small><h3>{trigger.name}</h3><p>{trigger.workflows?.name}</p></div><span className={`trigger-state trigger-state--${trigger.status}`}>{trigger.status}</span></div>
              <div className="trigger-card-meta">
                {trigger.interval_minutes && <span><Clock3 size={12} /> Every {trigger.interval_minutes >= 1440 ? `${trigger.interval_minutes / 1440} day` : `${trigger.interval_minutes} min`}{trigger.interval_minutes > 1440 ? 's' : ''}</span>}
                {trigger.next_run_at && <span>Next {new Date(trigger.next_run_at).toLocaleString()}</span>}
                {trigger.last_fired_at && <span>Last {new Date(trigger.last_fired_at).toLocaleString()}</span>}
                {trigger.webhook_url && <button type="button" onClick={() => copy(trigger.webhook_url)}><Copy size={12} /> Copy endpoint</button>}
              </div>
              <div className="trigger-card-actions">
                {trigger.trigger_type === 'manual' && <button type="button" onClick={() => fire(trigger)} disabled={busy === trigger.id}><Play size={12} /> Run</button>}
                {trigger.trigger_type === 'webhook' && <button type="button" onClick={() => rotate(trigger)}><RefreshCw size={12} /> Rotate</button>}
                <button type="button" onClick={() => showHistory(trigger)} disabled={busy === trigger.id}><History size={12} /> History</button>
                <button type="button" onClick={() => toggle(trigger)} disabled={busy === trigger.id}>{trigger.status === 'active' ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Resume</>}</button>
                <button className="danger" type="button" onClick={() => remove(trigger)} aria-label={`Delete ${trigger.name}`}><Trash2 size={12} /></button>
              </div>
            </article>
          })}</div>
        )}
      </section>

      {historyState && <div className="trigger-history-backdrop"><section className="trigger-history" role="dialog" aria-label={`${historyState.title} history`}><header><div><span>Delivery history</span><h2>{historyState.title}</h2></div><button onClick={() => setHistoryState(null)}><X size={18} /></button></header><div className="trigger-history-table"><table><thead><tr><th>Time</th><th>Source</th><th>Status</th><th>Job</th></tr></thead><tbody>{historyState.events.map(event => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.event_source}</td><td>{event.status}</td><td><code>{event.execution_job_id || 'Not queued'}</code></td></tr>)}</tbody></table>{!historyState.events.length && <p>No deliveries recorded yet.</p>}</div></section></div>}
    </div>
  )
}

function SecretRow({ label, value, onCopy }) {
  return <div className="trigger-secret-row"><label>{label}</label><div><code>{value}</code><button type="button" onClick={() => onCopy(value)}><Copy size={13} /> Copy</button></div></div>
}

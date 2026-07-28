import { useEffect, useState } from 'react'
import { Clock3, Copy, History, Pause, Play, Plus, RefreshCw, Trash2, Webhook } from 'lucide-react'

import {
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

const TYPES = {
  manual: { label:'Manual', icon:Play, color:'#60A5FA' },
  webhook: { label:'Webhook', icon:Webhook, color:'#A78BFA' },
  schedule: { label:'Schedule', icon:Clock3, color:'#34D399' },
}

export default function Triggers() {
  const [triggers, setTriggers] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [form, setForm] = useState({ name:'', workflow_id:'', trigger_type:'manual', interval_minutes:60 })
  const [revealed, setRevealed] = useState(null)
  const [events, setEvents] = useState([])
  const [eventTitle, setEventTitle] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [triggerData, workflowData] = await Promise.all([getTriggers(), getWorkflows()])
    setTriggers(triggerData)
    setWorkflows(workflowData.filter(item => item.status === 'active'))
    setForm(current => ({
      ...current,
      workflow_id: current.workflow_id || workflowData.find(item => item.status === 'active')?.id || '',
    }))
  }

  useEffect(() => {
    Promise.all([getTriggers(), getWorkflows()])
      .then(([triggerData, workflowData]) => {
        setTriggers(triggerData)
        setWorkflows(workflowData.filter(item => item.status === 'active'))
        setForm(current => ({
          ...current,
          workflow_id: current.workflow_id
            || workflowData.find(item => item.status === 'active')?.id
            || '',
        }))
      })
      .catch(err => setError(err.message))
  }, [])

  const create = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const created = await createTrigger(form)
      const { signing_secret: signingSecret, ...safeTrigger } = created
      setTriggers(items => [safeTrigger, ...items])
      setForm(current => ({ ...current, name:'' }))
      if (signingSecret) {
        setRevealed({
          secret: signingSecret,
          url: created.webhook_url,
          title: created.name,
        })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async trigger => {
    try {
      const updated = trigger.status === 'active'
        ? await pauseTrigger(trigger.id)
        : await resumeTrigger(trigger.id)
      setTriggers(items => items.map(item => item.id === updated.id ? updated : item))
    } catch (err) {
      setError(err.message)
    }
  }

  const fire = async trigger => {
    const input = window.prompt('Input for this workflow run:')
    if (!input?.trim()) return
    try {
      const result = await fireTrigger(trigger.id, input.trim(), crypto.randomUUID())
      setMessage(`Trigger accepted. Job ${result.job?.id || result.event?.execution_job_id || ''}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const rotate = async trigger => {
    if (!window.confirm('Rotate this webhook signing secret? The old secret will stop working immediately.')) return
    try {
      const result = await rotateTriggerSecret(trigger.id)
      setRevealed({ secret:result.signing_secret, url:trigger.webhook_url, title:trigger.name })
    } catch (err) {
      setError(err.message)
    }
  }

  const history = async trigger => {
    try {
      setEvents(await getTriggerEvents(trigger.id))
      setEventTitle(trigger.name)
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async trigger => {
    if (!window.confirm(`Delete trigger "${trigger.name}" and its event history?`)) return
    try {
      await deleteTrigger(trigger.id)
      setTriggers(items => items.filter(item => item.id !== trigger.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const copy = async value => {
    await navigator.clipboard.writeText(value)
    setMessage('Copied to clipboard')
  }

  return (
    <div>
      <div style={{ marginBottom:22 }}>
        <h1 style={{ fontSize:24, fontWeight:600, marginBottom:5 }}>Workflow Triggers</h1>
        <p style={{ color:'#9CA3AF', fontSize:13 }}>Start workflows manually, through signed webhooks, or on a reliable schedule.</p>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {message && <div style={successBox}>{message}</div>}

      <form onSubmit={create} style={panel}>
        <div style={grid}>
          <div>
            <label style={label}>Trigger name</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name:e.target.value })}
              placeholder="Daily lead enrichment" style={input} />
          </div>
          <div>
            <label style={label}>Active workflow</label>
            <select required value={form.workflow_id} onChange={e => setForm({ ...form, workflow_id:e.target.value })} style={input}>
              <option value="">Select workflow</option>
              {workflows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Trigger type</label>
            <select value={form.trigger_type} onChange={e => setForm({ ...form, trigger_type:e.target.value })} style={input}>
              <option value="manual">Manual</option>
              <option value="webhook">Signed webhook</option>
              <option value="schedule">Schedule</option>
            </select>
          </div>
          {form.trigger_type === 'schedule' && <div>
            <label style={label}>Run every (minutes)</label>
            <input type="number" min="5" max="43200" value={form.interval_minutes}
              onChange={e => setForm({ ...form, interval_minutes:Number(e.target.value) })} style={input} />
          </div>}
        </div>
        {!workflows.length && <p style={{ color:'#FCD34D', fontSize:12, marginTop:12 }}>Activate a workflow before creating a trigger.</p>}
        <button disabled={busy || !workflows.length} style={primaryButton}><Plus size={14} /> Create trigger</button>
      </form>

      {revealed && <div style={{ ...panel, borderColor:'#7C3AED', marginTop:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
          <div>
            <h3 style={{ fontSize:15, marginBottom:5 }}>{revealed.title}: signing secret</h3>
            <p style={{ color:'#FCD34D', fontSize:12 }}>Copy this now. AgentForge will never display it again.</p>
          </div>
          <button onClick={() => setRevealed(null)} style={secondaryButton}>Done</button>
        </div>
        <SecretRow label="Webhook URL" value={revealed.url} onCopy={copy} />
        <SecretRow label="Signing secret" value={revealed.secret} onCopy={copy} />
        <p style={{ color:'#9CA3AF', fontSize:11, marginTop:12 }}>
          Sign the exact body as HMAC-SHA256 of timestamp + &quot;.&quot; + body. Send X-AgentForge-Timestamp,
          X-AgentForge-Signature: sha256=..., and a unique X-AgentForge-Delivery header.
        </p>
      </div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(330px,1fr))', gap:14, marginTop:18 }}>
        {triggers.map(trigger => {
          const meta = TYPES[trigger.trigger_type]
          const Icon = meta.icon
          return <div key={trigger.id} style={panel}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
              <div style={{ display:'flex', gap:10 }}>
                <div style={{ ...iconBox, color:meta.color }}><Icon size={17} /></div>
                <div>
                  <h3 style={{ fontSize:15 }}>{trigger.name}</h3>
                  <p style={{ color:'#8B8FA3', fontSize:11, marginTop:3 }}>{trigger.workflows?.name}</p>
                </div>
              </div>
              <span style={{ color:trigger.status === 'active' ? '#34D399' : '#FCD34D', fontSize:10, textTransform:'uppercase' }}>{trigger.status}</span>
            </div>
            <div style={{ color:'#9CA3AF', fontSize:12, marginTop:14, lineHeight:1.7 }}>
              <div>{meta.label}{trigger.interval_minutes ? ` · every ${trigger.interval_minutes} min` : ''}</div>
              {trigger.next_run_at && <div>Next: {new Date(trigger.next_run_at).toLocaleString()}</div>}
              {trigger.last_fired_at && <div>Last fired: {new Date(trigger.last_fired_at).toLocaleString()}</div>}
              {trigger.webhook_url && <button onClick={() => copy(trigger.webhook_url)} style={linkButton}><Copy size={12} /> Copy webhook URL</button>}
            </div>
            <div style={actions}>
              {trigger.trigger_type === 'manual' && <button onClick={() => fire(trigger)} style={secondaryButton}><Play size={12} /> Run</button>}
              {trigger.trigger_type === 'webhook' && <button onClick={() => rotate(trigger)} style={secondaryButton}><RefreshCw size={12} /> Rotate secret</button>}
              <button onClick={() => history(trigger)} style={secondaryButton}><History size={12} /> History</button>
              <button onClick={() => toggle(trigger)} style={secondaryButton}>{trigger.status === 'active' ? <Pause size={12} /> : <Play size={12} />}</button>
              <button onClick={() => remove(trigger)} style={dangerButton}><Trash2 size={12} /></button>
            </div>
          </div>
        })}
      </div>

      {eventTitle && <div style={{ ...panel, marginTop:18 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <h3 style={{ fontSize:15 }}>{eventTitle} history</h3>
          <button onClick={() => setEventTitle('')} style={secondaryButton}>Close</button>
        </div>
        <div style={{ overflowX:'auto', marginTop:12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr>{['Time','Source','Status','Job'].map(item => <th key={item} style={th}>{item}</th>)}</tr></thead>
            <tbody>{events.map(event => <tr key={event.id}>
              <td style={td}>{new Date(event.created_at).toLocaleString()}</td>
              <td style={td}>{event.event_source}</td>
              <td style={td}>{event.status}</td>
              <td style={td}>{event.execution_job_id || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>}
    </div>
  )
}

function SecretRow({ label: rowLabel, value, onCopy }) {
  return <div style={{ marginTop:12 }}>
    <label style={label}>{rowLabel}</label>
    <div style={{ display:'flex', gap:8 }}>
      <code style={{ ...input, flex:1, overflow:'auto', whiteSpace:'nowrap' }}>{value}</code>
      <button onClick={() => onCopy(value)} style={secondaryButton}><Copy size={13} /></button>
    </div>
  </div>
}

const panel = { background:'#171A23', border:'1px solid #292D3D', borderRadius:14, padding:18 }
const grid = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:12 }
const label = { display:'block', color:'#9CA3AF', fontSize:11, marginBottom:6 }
const input = { boxSizing:'border-box', width:'100%', background:'#101219', border:'1px solid #303447', borderRadius:8, color:'#E5E7EB', padding:'9px 10px', fontSize:12 }
const primaryButton = { display:'inline-flex', alignItems:'center', gap:6, background:'#7C3AED', color:'white', border:0, borderRadius:8, padding:'9px 13px', cursor:'pointer', marginTop:14 }
const secondaryButton = { display:'inline-flex', alignItems:'center', gap:5, background:'#202431', color:'#C7CAD4', border:'1px solid #34394D', borderRadius:7, padding:'7px 9px', cursor:'pointer', fontSize:11 }
const dangerButton = { ...secondaryButton, color:'#FCA5A5' }
const linkButton = { display:'inline-flex', alignItems:'center', gap:5, background:'transparent', border:0, color:'#A78BFA', padding:0, marginTop:4, cursor:'pointer', fontSize:11 }
const actions = { display:'flex', flexWrap:'wrap', gap:7, marginTop:14, paddingTop:12, borderTop:'1px solid #292D3D' }
const iconBox = { width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:9, background:'#222637' }
const errorBox = { background:'#2D1515', border:'1px solid #EF4444', borderRadius:9, padding:11, color:'#FCA5A5', fontSize:12, marginBottom:14 }
const successBox = { background:'#0B2A20', border:'1px solid #059669', borderRadius:9, padding:11, color:'#6EE7B7', fontSize:12, marginBottom:14 }
const th = { textAlign:'left', color:'#8B8FA3', borderBottom:'1px solid #303447', padding:'8px 6px' }
const td = { color:'#C7CAD4', borderBottom:'1px solid #222637', padding:'9px 6px' }

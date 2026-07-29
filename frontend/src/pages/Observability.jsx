import { useCallback, useEffect, useState } from 'react'
import { Activity, Clock3, Coins, Download, Play, RefreshCw, Search } from 'lucide-react'

import {
  downloadObservabilityCsv,
  getObservabilityMetrics,
  getObservabilityRuns,
  getObservedRun,
  replayObservedRun,
} from '../lib/api'

const STATUS_COLOR = {
  queued:'#9CA3AF',
  running:'#60A5FA',
  retry_wait:'#FBBF24',
  waiting_approval:'#C084FC',
  succeeded:'#34D399',
  failed:'#F87171',
  cancelled:'#9CA3AF',
}

const formatDuration = value => value === null || value === undefined
  ? '—' : value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`
const formatCost = value => `$${Number(value || 0).toFixed(6)}`
const formatType = value => String(value || '').replaceAll('_', ' ')

export default function Observability() {
  const [runs, setRuns] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const [runData, metricData] = await Promise.all([
        getObservabilityRuns({ status, type, q:query, limit:100 }),
        getObservabilityMetrics(),
      ])
      setRuns(runData.runs)
      setMetrics(metricData)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [query, status, type])

  useEffect(() => {
    const initial = setTimeout(load, 0)
    const timer = setInterval(load, 4000)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [load])

  const inspect = async id => {
    setBusy(id)
    try {
      setSelected(await getObservedRun(id))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const replay = async id => {
    setBusy(id)
    try {
      await replayObservedRun(id)
      await load()
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const cards = metrics ? [
    { label:'30-day runs', value:metrics.runs, icon:Activity },
    { label:'Success rate', value:`${metrics.success_rate}%`, icon:RefreshCw },
    { label:'Tokens', value:metrics.tokens.toLocaleString(), icon:Coins },
    { label:'Estimated cost', value:formatCost(metrics.estimated_cost_usd), icon:Coins },
    { label:'Average latency', value:formatDuration(metrics.average_duration_ms), icon:Clock3 },
    { label:'P95 latency', value:formatDuration(metrics.p95_duration_ms), icon:Clock3 },
  ] : []

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'start', gap:16, marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:600, marginBottom:5 }}>Observability</h1>
          <p style={{ color:'#9CA3AF', fontSize:13 }}>Live timelines, structured failures, usage, cost estimates, replay, and export.</p>
        </div>
        <button onClick={() => downloadObservabilityCsv({ status, type, q:query }).catch(err => setError(err.message))} style={secondaryButton}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,minmax(0,1fr))', gap:10, marginBottom:16 }}>
        {cards.map(({ label, value, icon:Icon }) => <div key={label} style={metricCard}>
          <div style={{ display:'flex', alignItems:'center', gap:6, color:'#8B8FA3', fontSize:10 }}><Icon size={12} />{label}</div>
          <div style={{ fontSize:19, fontWeight:600, marginTop:7 }}>{value}</div>
        </div>)}
      </div>

      {metrics?.daily?.length > 0 && <div style={{ ...panel, marginBottom:14 }}>
        <div style={{ color:'#9CA3AF', fontSize:11, marginBottom:10 }}>Run volume · last 30 days</div>
        <div style={{ height:54, display:'flex', alignItems:'end', gap:5 }}>
          {metrics.daily.map(day => {
            const max = Math.max(...metrics.daily.map(item => item.runs), 1)
            return <div key={day.date} title={`${day.date}: ${day.runs} runs`} style={{
              flex:1,
              minWidth:4,
              height:`${Math.max(8, (day.runs / max) * 100)}%`,
              background:day.failed ? 'linear-gradient(#F87171,#7C3AED)' : 'linear-gradient(#A78BFA,#6D28D9)',
              borderRadius:'3px 3px 1px 1px',
            }} />
          })}
        </div>
      </div>}

      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <div style={{ position:'relative', flex:1 }}>
          <Search size={13} style={{ position:'absolute', left:10, top:11, color:'#6B7280' }} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search run name"
            style={{ ...inputStyle, width:'100%', paddingLeft:30, boxSizing:'border-box' }} />
        </div>
        <select value={type} onChange={event => setType(event.target.value)} style={inputStyle}>
          <option value="">All run types</option>
          <option value="agent_run">Agent</option>
          <option value="workflow_run">Workflow</option>
          <option value="evaluation_run">Evaluation</option>
        </select>
        <select value={status} onChange={event => setStatus(event.target.value)} style={inputStyle}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLOR).map(item => <option key={item} value={item}>{formatType(item)}</option>)}
        </select>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:selected ? 'minmax(0,1.15fr) minmax(360px,.85fr)' : '1fr', gap:14 }}>
        <div style={{ ...panel, padding:0, overflow:'hidden' }}>
          <div style={tableHeader}>
            <span>Run</span><span>Status</span><span>Usage</span><span>Latency</span><span>Started</span>
          </div>
          {!runs.length ? <div style={emptyState}>No runs match these filters.</div> : runs.map(run =>
            <button key={run.execution_job_id} onClick={() => inspect(run.execution_job_id)} style={tableRow}>
              <span style={{ minWidth:0 }}>
                <strong style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{run.resource_name}</strong>
                <small style={{ color:'#6B7280', textTransform:'capitalize' }}>{formatType(run.run_type)}</small>
              </span>
              <span style={{ color:STATUS_COLOR[run.status], textTransform:'capitalize' }}>● {formatType(run.status)}</span>
              <span>{run.tokens_used.toLocaleString()} tok<br/><small style={{ color:'#6B7280' }}>{formatCost(run.estimated_cost_usd)}</small></span>
              <span>{formatDuration(run.duration_ms)}</span>
              <span>{new Date(run.created_at).toLocaleString()}</span>
            </button>)}
        </div>

        {selected && <div style={{ ...panel, alignSelf:'start', position:'sticky', top:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
            <div>
              <h2 style={{ fontSize:16 }}>{selected.summary.resource_name}</h2>
              <div style={{ color:STATUS_COLOR[selected.summary.status], fontSize:11, marginTop:4, textTransform:'capitalize' }}>
                {formatType(selected.summary.status)}
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={iconButton}>×</button>
          </div>

          {selected.summary.structured_error && <div style={{ ...errorBox, marginTop:12, marginBottom:0 }}>
            <strong>{selected.summary.structured_error.category}</strong>
            <div style={{ marginTop:4 }}>{selected.summary.structured_error.message}</div>
            <small>Retryable: {selected.summary.structured_error.retryable ? 'yes' : 'no'}</small>
          </div>}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:12 }}>
            <Mini label="Tokens" value={selected.summary.tokens_used.toLocaleString()} />
            <Mini label="Cost" value={formatCost(selected.summary.estimated_cost_usd)} />
            <Mini label="Duration" value={formatDuration(selected.summary.duration_ms)} />
          </div>

          <h3 style={sectionTitle}>Timeline</h3>
          <div style={{ maxHeight:390, overflow:'auto' }}>
            {(selected.events || []).map(event => <div key={event.id} style={eventRow}>
              <div style={{
                width:8, height:8, borderRadius:'50%', marginTop:4, flexShrink:0,
                background:event.level === 'error' ? '#F87171' : event.level === 'warning' ? '#FBBF24' : '#60A5FA',
              }} />
              <div style={{ minWidth:0 }}>
                <strong style={{ fontSize:11 }}>{event.message}</strong>
                <div style={{ color:'#6B7280', fontSize:9, marginTop:3 }}>
                  {new Date(event.created_at).toLocaleTimeString()} · {event.event_type}
                  {event.duration_ms !== null ? ` · ${formatDuration(event.duration_ms)}` : ''}
                </div>
              </div>
            </div>)}
          </div>

          {['succeeded', 'failed', 'cancelled'].includes(selected.summary.status) &&
            <button disabled={busy === selected.summary.execution_job_id}
              onClick={() => replay(selected.summary.execution_job_id)} style={{ ...primaryButton, marginTop:14 }}>
              <Play size={13} /> Replay with current active configuration
            </button>}
        </div>}
      </div>
    </div>
  )
}

function Mini({ label, value }) {
  return <div style={{ background:'#101219', borderRadius:8, padding:9 }}>
    <div style={{ color:'#6B7280', fontSize:9 }}>{label}</div>
    <div style={{ fontSize:12, marginTop:3 }}>{value}</div>
  </div>
}

const panel = { background:'#171A23', border:'1px solid #292D3D', borderRadius:13, padding:16 }
const metricCard = { ...panel, padding:13, minWidth:0 }
const inputStyle = { background:'#101219', border:'1px solid #303447', borderRadius:8, color:'#E5E7EB', padding:'9px 10px', fontSize:11 }
const buttonBase = { display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, borderRadius:8, padding:'9px 12px', cursor:'pointer', fontSize:11 }
const primaryButton = { ...buttonBase, background:'#6D28D9', border:'1px solid #8B5CF6', color:'white', width:'100%' }
const secondaryButton = { ...buttonBase, background:'#202431', border:'1px solid #34394D', color:'#D1D5DB' }
const iconButton = { background:'transparent', color:'#9CA3AF', border:'none', cursor:'pointer', fontSize:20 }
const errorBox = { background:'#2D1515', border:'1px solid #7F1D1D', borderRadius:9, padding:10, color:'#FCA5A5', fontSize:11, marginBottom:12 }
const tableHeader = { display:'grid', gridTemplateColumns:'2fr 1fr 1fr .8fr 1.4fr', gap:12, padding:'10px 14px', color:'#6B7280', fontSize:9, textTransform:'uppercase', borderBottom:'1px solid #292D3D' }
const tableRow = { display:'grid', gridTemplateColumns:'2fr 1fr 1fr .8fr 1.4fr', gap:12, alignItems:'center', width:'100%', textAlign:'left', background:'transparent', color:'#D1D5DB', border:'none', borderBottom:'1px solid #242735', padding:'12px 14px', cursor:'pointer', fontSize:10 }
const emptyState = { padding:48, textAlign:'center', color:'#6B7280', fontSize:12 }
const sectionTitle = { color:'#9CA3AF', fontSize:10, textTransform:'uppercase', margin:'16px 0 8px' }
const eventRow = { display:'flex', gap:9, padding:'8px 3px', borderBottom:'1px solid #242735' }

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2, Clock, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react'
import { getAgent, getAgentRuns } from '../lib/api'

const STATUS = {
  completed: { bg: '#065F46', color: '#34D399', label: 'Completed', icon: <CheckCircle2 size={13} /> },
  failed:    { bg: '#7F1D1D', color: '#FCA5A5', label: 'Failed',    icon: <XCircle    size={13} /> },
  running:   { bg: '#78350F', color: '#FCD34D', label: 'Running',   icon: <Loader2    size={13} /> },
}

const STEP_ICONS = {
  thinking:     '🧠',
  tool_call:    '🔧',
  tool_result:  '✅',
  final_answer: '💬',
  error:        '❌',
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)    return `${diff}s ago`
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

export default function AgentRunHistory() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [agent,    setAgent]    = useState(null)
  const [runs,     setRuns]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [expanded, setExpanded] = useState(null)
  const [filter,   setFilter]   = useState('All')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const [agentData, runsData] = await Promise.all([
          getAgent(id),
          getAgentRuns(id)
        ])
        setAgent(agentData)
        setRuns(runsData)
      } catch (err) {
        setError(err.message || 'Failed to load run history')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const filtered = filter === 'All' ? runs : runs.filter(r => r.status === filter.toLowerCase())

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'#9CA3AF', fontSize:14 }}>
      Loading run history...
    </div>
  )

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ background:'#2D1515', border:'1px solid #EF4444', borderRadius:12, padding:24, textAlign:'center' }}>
        <p style={{ color:'#FCA5A5', marginBottom:14 }}>⚠️ {error}</p>
        <button onClick={() => navigate('/dashboard')} style={{ background:'#7C3AED', color:'white', border:'none', padding:'8px 18px', borderRadius:8, cursor:'pointer' }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ color:'white', fontFamily:'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={() => navigate('/dashboard')}
          style={{ display:'flex', alignItems:'center', gap:5, background:'transparent', border:'1px solid #2A2D3E', color:'#9CA3AF', padding:'6px 14px', borderRadius:8, cursor:'pointer', fontSize:13 }}>
          <ArrowLeft size={13} /> Back
        </button>
        <div>
          <h1 style={{ fontSize:20, fontWeight:600 }}>{agent?.name} — Run History</h1>
          <p style={{ color:'#9CA3AF', fontSize:13, marginTop:2 }}>{runs.length} total runs</p>
        </div>
        <button onClick={() => navigate(`/agents/${id}/run`)}
          style={{ marginLeft:'auto', background:'#7C3AED', color:'white', border:'none', padding:'9px 18px', borderRadius:10, cursor:'pointer', fontSize:13, fontWeight:500 }}>
          ▶ Run Agent
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {['All', 'Completed', 'Failed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding:'6px 16px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight: filter===f ? 500 : 400, background: filter===f ? '#7C3AED' : '#1A1D27', color: filter===f ? 'white' : '#9CA3AF' }}>
            {f}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ background:'#1A1D27', border:'1px dashed #2A2D3E', borderRadius:16, padding:'60px 20px', textAlign:'center' }}>
          <p style={{ color:'#9CA3AF', fontSize:15, marginBottom:16 }}>No {filter === 'All' ? '' : filter.toLowerCase()} runs yet</p>
          <button onClick={() => navigate(`/agents/${id}/run`)}
            style={{ background:'#7C3AED', color:'white', border:'none', padding:'10px 22px', borderRadius:10, cursor:'pointer', fontSize:14 }}>
            Run this agent
          </button>
        </div>
      )}

      {/* Runs table */}
      {filtered.length > 0 && (
        <div style={{ background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:16, overflow:'hidden' }}>

          {/* Table header */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 3fr', gap:10, padding:'12px 18px', borderBottom:'1px solid #2A2D3E', fontSize:11, color:'#6B7280', textTransform:'uppercase', letterSpacing:'.4px' }}>
            <div>Time</div>
            <div>Status</div>
            <div>Duration</div>
            <div>Tokens</div>
            <div>Input</div>
          </div>

          {filtered.map((run, i) => {
            const s     = STATUS[run.status] || STATUS.failed
            const isExp = expanded === run.id
            const trace = Array.isArray(run.run_trace) ? run.run_trace : []

            return (
              <div key={run.id}>
                {/* Row */}
                <button onClick={() => setExpanded(isExp ? null : run.id)}
                  style={{ width:'100%', display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 3fr', gap:10, padding:'14px 18px', background:'transparent', border:'none', borderBottom: i < filtered.length-1 ? '1px solid #2A2D3E' : 'none', cursor:'pointer', textAlign:'left', color:'white', alignItems:'center' }}
                  onMouseEnter={e => e.currentTarget.style.background='#0F1117'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                >
                  <div>
                    <div style={{ fontSize:13 }}>{timeAgo(run.started_at)}</div>
                    <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{new Date(run.started_at).toLocaleTimeString()}</div>
                  </div>
                  <div>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:500, padding:'3px 8px', borderRadius:8, background: s.bg, color: s.color }}>
                      {s.icon} {s.label}
                    </span>
                  </div>
                  <div style={{ fontSize:13, color:'#9CA3AF' }}>
                    {run.duration_ms ? `${(run.duration_ms/1000).toFixed(1)}s` : '—'}
                  </div>
                  <div style={{ fontSize:13, color:'#9CA3AF' }}>
                    {run.tokens_used || '—'}
                  </div>
                  <div style={{ fontSize:12, color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>{(run.input_text || '').slice(0, 60)}{run.input_text?.length > 60 ? '...' : ''}</span>
                    {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExp && (
                  <div style={{ padding:'16px 18px', background:'#0F1117', borderBottom: i < filtered.length-1 ? '1px solid #2A2D3E' : 'none' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                      <div style={{ background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:10, padding:12 }}>
                        <div style={{ fontSize:11, color:'#6B7280', marginBottom:5, textTransform:'uppercase', letterSpacing:'.4px' }}>Input</div>
                        <div style={{ fontSize:13, lineHeight:1.6 }}>{run.input_text}</div>
                      </div>
                      <div style={{ background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:10, padding:12 }}>
                        <div style={{ fontSize:11, color:'#6B7280', marginBottom:5, textTransform:'uppercase', letterSpacing:'.4px' }}>Output</div>
                        <div style={{ fontSize:13, lineHeight:1.6, color: run.output_text ? 'white' : '#6B7280' }}>
                          {run.output_text || run.error_message || 'No output recorded'}
                        </div>
                      </div>
                    </div>

                    {trace.length > 0 && (
                      <div>
                        <div style={{ fontSize:11, color:'#6B7280', marginBottom:8, textTransform:'uppercase', letterSpacing:'.4px' }}>Execution Trace ({trace.length} steps)</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                          {trace.map((step, si) => (
                            <div key={si} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 12px', background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:8 }}>
                              <span style={{ fontSize:14, flexShrink:0 }}>{STEP_ICONS[step.type] || '•'}</span>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:11, color:'#6B7280', marginBottom:2 }}>Step {step.step_number} — {step.type}{step.tool_name ? `: ${step.tool_name}` : ''}</div>
                                <div style={{ fontSize:12, color:'#9CA3AF', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{step.content}</div>
                              </div>
                              <div style={{ fontSize:10, color:'#4B5563', flexShrink:0 }}>{step.duration_ms}ms</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate }       from 'react-router-dom'
import { Play, ChevronDown, ChevronUp, Bot, Zap, Search, Calculator, Brain, FileText, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { getAgent, runAgent } from '../lib/api'

// Icon for each trace step type
const STEP_ICONS = {
  thinking:     <Loader2    size={15} color="#A78BFA" style={{ animation: 'spin .8s linear infinite' }} />,
  tool_call:    <Zap        size={15} color="#FCD34D" />,
  tool_result:  <CheckCircle2 size={15} color="#34D399" />,
  final_answer: <CheckCircle2 size={15} color="#7C3AED" />,
  error:        <XCircle    size={15} color="#EF4444" />,
}

const TOOL_ICONS = {
  web_search: <Search    size={13} />,
  calculator: <Calculator size={13} />,
  memory:     <Brain     size={13} />,
  summarizer: <FileText  size={13} />,
  datetime:   <Clock     size={13} />,
}

// Friendly labels for trace step types
const STEP_LABELS = {
  thinking:     'Thinking',
  tool_call:    'Using tool',
  tool_result:  'Tool result',
  final_answer: 'Final answer',
  error:        'Error',
}

export default function AgentRun() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [agent,        setAgent]        = useState(null)
  const [loadingAgent, setLoadingAgent] = useState(true)
  const [agentError,   setAgentError]   = useState('')

  const [message,      setMessage]      = useState('')
  const [running,      setRunning]      = useState(false)
  const [runError,     setRunError]     = useState('')
  const [result,       setResult]       = useState(null)   // RunResult from engine
  const [showTrace,    setShowTrace]    = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  const bottomRef = useRef(null)

  // Load the agent details on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await getAgent(id)
        setAgent(data)
      } catch (err) {
        setAgentError(err.message || 'Could not load agent')
      } finally {
        setLoadingAgent(false)
      }
    }
    load()
  }, [id])

  // Scroll to bottom whenever trace updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [result])

  const handleRun = async () => {
    if (!message.trim()) return
    setRunning(true)
    setRunError('')
    setResult(null)
    try {
      const data = await runAgent(id, message.trim())
      setResult(data)
    } catch (err) {
      setRunError(err.message || 'Run failed. Please try again.')
    } finally {
      setRunning(false)
    }
  }

  // ── Agent loading state ────────────────────────────────────────────────────
  if (loadingAgent) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#9CA3AF', fontSize: 14 }}>
      Loading agent...
    </div>
  )

  if (agentError) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ background: '#2D1515', border: '1px solid #EF4444', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <p style={{ color: '#FCA5A5', marginBottom: 14 }}>⚠️ {agentError}</p>
        <button onClick={() => navigate('/dashboard')} style={{ background: '#7C3AED', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer' }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )

  const statusColors = { active: '#34D399', paused: '#FCD34D', draft: '#6B7280' }

  return (
    <div style={{ color: 'white', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/dashboard')} style={{ background: 'transparent', border: '1px solid #2A2D3E', color: '#9CA3AF', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          ← Back
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>{agent?.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColors[agent?.status] || '#6B7280', display: 'inline-block' }} />
            <span style={{ color: '#9CA3AF', fontSize: 12 }}>{agent?.description || 'No description'}</span>
          </div>
        </div>
      </div>

      {/* ── Two column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── LEFT: Input panel ── */}
        <div style={{ background: '#1A1D27', border: '1px solid #2A2D3E', borderRadius: 16, padding: 22 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 14 }}>Your message</h2>

          <textarea
            rows={10}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="What would you like your agent to do?&#10;&#10;Example: Research the latest AI trends and give me a summary with key points."
            style={{ width: '100%', background: '#0F1117', border: '1px solid #2A2D3E', borderRadius: 12, padding: 14, color: 'white', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'system-ui', lineHeight: 1.6, boxSizing: 'border-box' }}
          />

          <button
            onClick={handleRun}
            disabled={running || !message.trim()}
            style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: running || !message.trim() ? '#5B21B6' : '#7C3AED', color: 'white', border: 'none', padding: 13, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: running || !message.trim() ? 'not-allowed' : 'pointer', transition: 'background .15s' }}>
            {running
              ? <><Loader2 size={16} style={{ animation: 'spin .8s linear infinite' }} /> Running...</>
              : <><Play    size={16} /> Run Agent</>}
          </button>

          {runError && (
            <div style={{ marginTop: 12, background: '#2D1515', border: '1px solid #EF4444', borderRadius: 10, padding: '10px 14px', color: '#FCA5A5', fontSize: 13 }}>
              ⚠️ {runError}
            </div>
          )}

          {/* ── Settings toggle ── */}
          <button onClick={() => setShowSettings(!showSettings)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 13 }}>
            Run Settings {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showSettings && (
            <div style={{ marginTop: 12, padding: 14, background: '#0F1117', border: '1px solid #2A2D3E', borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>Model</div>
              <div style={{ fontSize: 13, color: 'white', marginBottom: 10 }}>{agent?.model || 'claude-sonnet-4-6'}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>Enabled Tools</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {agent?.tools?.length > 0
                  ? agent.tools.map(t => (
                    <span key={t.slug} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, background: '#1A1D27', border: '1px solid #2A2D3E', borderRadius: 6, padding: '3px 8px', color: '#9CA3AF' }}>
                      {TOOL_ICONS[t.slug]} {t.display_name}
                    </span>
                  ))
                  : <span style={{ fontSize: 12, color: '#6B7280' }}>No tools enabled</span>
                }
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Output panel ── */}
        <div style={{ background: '#1A1D27', border: '1px solid #2A2D3E', borderRadius: 16, padding: 22, minHeight: 480 }}>

          {/* Empty state */}
          {!running && !result && (
            <div style={{ height: '100%', minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12 }}>
              <Bot size={52} color="#374151" />
              <h3 style={{ fontSize: 16, fontWeight: 500, color: '#4B5563' }}>Run your agent to see results</h3>
              <p style={{ fontSize: 13, color: '#374151', maxWidth: 260, lineHeight: 1.5 }}>Type a message on the left and click Run Agent</p>
            </div>
          )}

          {/* Loading / streaming state */}
          {running && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <Loader2 size={16} color="#7C3AED" style={{ animation: 'spin .8s linear infinite' }} />
                <h2 style={{ fontSize: 15, fontWeight: 500 }}>Agent is working...</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['Thinking...', 'Searching for information...', 'Processing results...', 'Writing final answer...'].map((label, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#0F1117', border: '1px solid #2A2D3E', borderRadius: 10, animation: `fadeIn .4s ease ${i * 0.6}s both` }}>
                    <Loader2 size={14} color="#7C3AED" style={{ animation: 'spin .8s linear infinite', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#9CA3AF' }}>{label}</span>
                  </div>
                ))}
              </div>
              <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }`}</style>
            </div>
          )}

          {/* Completed state */}
          {result && !running && (
            <div>
              {/* Final answer */}
              <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>
                {result.status === 'completed' ? '✅ Final Answer' : result.status === 'failed' ? '❌ Run Failed' : '⏱️ Timed Out'}
              </h2>

              <div style={{ background: '#0F1117', border: '1px solid #2A2D3E', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 14, lineHeight: 1.8, color: result.status === 'completed' ? 'white' : '#FCA5A5', whiteSpace: 'pre-wrap' }}>
                {result.status === 'completed'
                  ? result.output_text || result.final_answer || 'No answer returned.'
                  : result.error_message || 'Something went wrong.'}
              </div>

              {/* Stats bar */}
              <div style={{ display: 'flex', gap: 16, padding: '10px 14px', background: '#0F1117', border: '1px solid #2A2D3E', borderRadius: 10, fontSize: 12, color: '#9CA3AF', marginBottom: 16, flexWrap: 'wrap' }}>
                <span>⏱ {((result.duration_ms || 0) / 1000).toFixed(1)}s</span>
                <span>🔤 {result.tokens_used || 0} tokens</span>
                <span>🤖 {agent?.model || 'claude-sonnet-4-6'}</span>
                <span style={{ color: result.status === 'completed' ? '#34D399' : '#EF4444' }}>
                  {result.status === 'completed' ? '✓ Completed' : result.status === 'timeout' ? '⏱ Timeout' : '✗ Failed'}
                </span>
              </div>

              {/* Execution trace */}
              {result.run_trace?.length > 0 && (
                <div style={{ border: '1px solid #2A2D3E', borderRadius: 12, overflow: 'hidden' }}>
                  <button onClick={() => setShowTrace(!showTrace)}
                    style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#0F1117', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                    <span>Execution Trace ({result.run_trace.length} steps)</span>
                    {showTrace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showTrace && (
                    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {result.run_trace.map((step, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', background: '#0F1117', border: '1px solid #1F2937', borderRadius: 8 }}>
                          <div style={{ marginTop: 1, flexShrink: 0 }}>{STEP_ICONS[step.type] || STEP_ICONS.thinking}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>
                              Step {step.step_number} — {STEP_LABELS[step.type] || step.type}
                              {step.tool_name && `: ${step.tool_name}`}
                            </div>
                            <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>
                              {step.content}
                            </div>
                          </div>
                          <div style={{ fontSize: 10, color: '#4B5563', flexShrink: 0 }}>{step.duration_ms}ms</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

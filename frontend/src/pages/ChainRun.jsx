import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, ArrowRight, ArrowDown, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { getChain, runChain } from '../lib/api'

export default function ChainRun() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [chain,       setChain]       = useState(null)
  const [loadingChain,setLoadingChain]= useState(true)
  const [chainError,  setChainError]  = useState('')

  const [message, setMessage] = useState('')
  const [running, setRunning] = useState(false)
  const [runError,setRunError]= useState('')
  const [result,  setResult]  = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await getChain(id)
        setChain(data)
      } catch (err) {
        setChainError(err.message || 'Could not load chain')
      } finally {
        setLoadingChain(false)
      }
    }
    load()
  }, [id])

  const handleRun = async () => {
    if (!message.trim()) return
    setRunning(true)
    setRunError('')
    setResult(null)
    try {
      const data = await runChain(id, message.trim())
      setResult(data)
    } catch (err) {
      setRunError(err.message || 'Chain run failed')
    } finally {
      setRunning(false)
    }
  }

  if (loadingChain) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'#9CA3AF', fontSize:14 }}>
      Loading chain...
    </div>
  )

  if (chainError) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ background:'#2D1515', border:'1px solid #EF4444', borderRadius:12, padding:24, textAlign:'center' }}>
        <p style={{ color:'#FCA5A5', marginBottom:14 }}>⚠️ {chainError}</p>
        <button onClick={() => navigate('/chains')} style={{ background:'#7C3AED', color:'white', border:'none', padding:'8px 18px', borderRadius:8, cursor:'pointer' }}>
          Back to Chains
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ color:'white', fontFamily:'system-ui, sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
        <button onClick={() => navigate('/chains')}
          style={{ background:'transparent', border:'1px solid #2A2D3E', color:'#9CA3AF', padding:'6px 14px', borderRadius:8, cursor:'pointer', fontSize:13 }}>
          ← Back
        </button>
        <h1 style={{ fontSize:20, fontWeight:600 }}>{chain?.name}</h1>
      </div>

      {/* Visual flow of agents in this chain */}
      <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:24, marginLeft:2 }}>
        {chain?.agents?.map((agent, i) => (
          <span key={agent.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, fontWeight:500, padding:'5px 12px', borderRadius:20, background:'#1A1D27', border:'1px solid #2A2D3E', color:'#C4B5FD' }}>
              {i + 1}. {agent.name}
            </span>
            {i < chain.agents.length - 1 && <ArrowRight size={14} color="#4B5563" />}
          </span>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>

        {/* LEFT — input */}
        <div style={{ background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:16, padding:22 }}>
          <h2 style={{ fontSize:15, fontWeight:500, marginBottom:14 }}>Starting message</h2>
          <textarea
            rows={8}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="This message goes to the FIRST agent. Its answer will automatically be sent to the next agent, and so on."
            style={{ width:'100%', background:'#0F1117', border:'1px solid #2A2D3E', borderRadius:12, padding:14, color:'white', fontSize:14, outline:'none', resize:'vertical', fontFamily:'system-ui', lineHeight:1.6, boxSizing:'border-box' }}
          />
          <button onClick={handleRun} disabled={running || !message.trim()}
            style={{ width:'100%', marginTop:12, display:'flex', alignItems:'center', justifyContent:'center', gap:8, background: running || !message.trim() ? '#5B21B6' : '#7C3AED', color:'white', border:'none', padding:13, borderRadius:12, fontSize:15, fontWeight:600, cursor: running || !message.trim() ? 'not-allowed' : 'pointer' }}>
            {running
              ? <><Loader2 size={16} style={{ animation:'spin .8s linear infinite' }} /> Running chain...</>
              : <><Play size={16} /> Run Chain</>}
          </button>
          {runError && (
            <div style={{ marginTop:12, background:'#2D1515', border:'1px solid #EF4444', borderRadius:10, padding:'10px 14px', color:'#FCA5A5', fontSize:13 }}>
              ⚠️ {runError}
            </div>
          )}
        </div>

        {/* RIGHT — sequential results */}
        <div style={{ background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:16, padding:22, minHeight:400 }}>

          {!running && !result && (
            <div style={{ height:'100%', minHeight:340, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', gap:10 }}>
              <div style={{ fontSize:44 }}>🔗</div>
              <h3 style={{ fontSize:15, fontWeight:500, color:'#4B5563' }}>Run the chain to see each step</h3>
              <p style={{ fontSize:12, color:'#374151', maxWidth:240 }}>Every agent's answer will appear here, one after another, in order.</p>
            </div>
          )}

          {running && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', minHeight:340, gap:14 }}>
              <Loader2 size={28} color="#7C3AED" style={{ animation:'spin .8s linear infinite' }} />
              <p style={{ fontSize:13, color:'#9CA3AF' }}>Running {chain?.agents?.length} agents in order — this can take a while...</p>
            </div>
          )}

          {result && !running && (
            <div>
              <h2 style={{ fontSize:15, fontWeight:500, marginBottom:14 }}>
                {result.status === 'completed' ? '✅ Chain Completed' : '❌ Chain Failed'}
              </h2>

              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
                {result.steps?.map((step, i) => (
                  <div key={i}>
                    <div style={{ background:'#0F1117', border:`1px solid ${step.status === 'failed' ? '#7F1D1D' : '#2A2D3E'}`, borderRadius:12, padding:14 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                        {step.status === 'failed'
                          ? <XCircle size={15} color="#FCA5A5" />
                          : <CheckCircle2 size={15} color="#34D399" />}
                        <span style={{ fontSize:13, fontWeight:600 }}>{i + 1}. {step.agent_name}</span>
                        {step.duration_ms !== undefined && (
                          <span style={{ fontSize:11, color:'#6B7280', marginLeft:'auto' }}>{(step.duration_ms/1000).toFixed(1)}s · {step.tokens_used || 0} tok</span>
                        )}
                      </div>
                      <p style={{ fontSize:13, lineHeight:1.7, color: step.status === 'failed' ? '#FCA5A5' : 'white', whiteSpace:'pre-wrap' }}>
                        {step.output || step.error || 'No output'}
                      </p>
                    </div>
                    {i < result.steps.length - 1 && (
                      <div style={{ display:'flex', justifyContent:'center', padding:'4px 0' }}>
                        <ArrowDown size={16} color="#4B5563" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:16, padding:'10px 14px', background:'#0F1117', border:'1px solid #2A2D3E', borderRadius:10, fontSize:12, color:'#9CA3AF', flexWrap:'wrap' }}>
                <span>⏱ {((result.total_duration_ms || 0)/1000).toFixed(1)}s total</span>
                <span>🔤 {result.total_tokens || 0} tokens total</span>
                <span>🔗 {result.steps?.length || 0} steps</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

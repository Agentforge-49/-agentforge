import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Link2, ArrowRight, Trash2 } from 'lucide-react'
import { getChains, deleteChain } from '../lib/api'

export default function Chains() {
  const navigate = useNavigate()

  const [chains,  setChains]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await getChains()
        setChains(data)
      } catch (err) {
        setError(err.message || 'Failed to load chains')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('Delete this chain? This cannot be undone.')) return
    try {
      await deleteChain(id)
      setChains(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'#9CA3AF', fontSize:14 }}>
      Loading your chains...
    </div>
  )

  return (
    <div style={{ color:'white', fontFamily:'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:600, marginBottom:4 }}>Agent Chains</h1>
          <p style={{ color:'#9CA3AF', fontSize:14 }}>Connect agents together — one agent's answer automatically feeds the next.</p>
        </div>
        <button onClick={() => navigate('/chains/new')}
          style={{ display:'flex', alignItems:'center', gap:7, background:'#7C3AED', color:'white', border:'none', padding:'10px 18px', borderRadius:10, cursor:'pointer', fontSize:14, fontWeight:500 }}>
          <Plus size={15} /> Create Chain
        </button>
      </div>

      {error && (
        <div style={{ background:'#2D1515', border:'1px solid #EF4444', borderRadius:10, padding:'12px 16px', color:'#FCA5A5', fontSize:13, marginBottom:16 }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {chains.length === 0 && !error && (
        <div style={{ background:'#1A1D27', border:'1px dashed #2A2D3E', borderRadius:16, padding:'60px 20px', textAlign:'center' }}>
          <Link2 size={42} color="#374151" style={{ marginBottom:16 }} />
          <h3 style={{ fontSize:17, fontWeight:500, marginBottom:8 }}>No chains yet</h3>
          <p style={{ color:'#9CA3AF', fontSize:13, marginBottom:24, maxWidth:340, margin:'0 auto 24px' }}>
            A chain connects 2 or more of your agents in order. The first agent's answer becomes the next agent's question — automatically.
          </p>
          <button onClick={() => navigate('/chains/new')}
            style={{ background:'#7C3AED', color:'white', border:'none', padding:'11px 24px', borderRadius:10, cursor:'pointer', fontSize:14, fontWeight:500 }}>
            Create your first chain
          </button>
        </div>
      )}

      {/* Chain list */}
      {chains.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
          {chains.map(chain => (
            <div key={chain.id}
              onClick={() => navigate(`/chains/${chain.id}/run`)}
              onMouseEnter={e => e.currentTarget.style.borderColor='#7C3AED'}
              onMouseLeave={e => e.currentTarget.style.borderColor='#2A2D3E'}
              style={{ background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:16, padding:18, cursor:'pointer', transition:'border-color .15s' }}>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <h3 style={{ fontSize:15, fontWeight:600 }}>{chain.name}</h3>
                <button onClick={(e) => handleDelete(chain.id, e)}
                  style={{ background:'transparent', border:'none', color:'#6B7280', cursor:'pointer', padding:4 }}>
                  <Trash2 size={14} />
                </button>
              </div>

              {chain.description && (
                <p style={{ fontSize:12, color:'#9CA3AF', marginBottom:14, lineHeight:1.5 }}>{chain.description}</p>
              )}

              <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', gap:6 }}>
                {chain.agent_names.map((name, i) => (
                  <span key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:11, fontWeight:500, padding:'4px 10px', borderRadius:8, background:'#0F1117', border:'1px solid #2A2D3E' }}>
                      {name}
                    </span>
                    {i < chain.agent_names.length - 1 && <ArrowRight size={12} color="#4B5563" />}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, X, Plus } from 'lucide-react'
import { getAgents, createChain } from '../lib/api'

export default function CreateChain() {
  const navigate = useNavigate()

  const [allAgents, setAllAgents] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [selected,    setSelected]    = useState([])   // ordered list of agent objects

  const [showBranch, setShowBranch] = useState(false)
  const [branchKeyword, setBranchKeyword] = useState('')
  const [branchAgentIf, setBranchAgentIf] = useState('')
  const [branchAgentElse, setBranchAgentElse] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await getAgents()
        setAllAgents(data)
      } catch (err) {
        setError(err.message || 'Failed to load your agents')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const addAgent = (agent) => {
    if (selected.find(a => a.id === agent.id)) return
    setSelected(prev => [...prev, agent])
  }

  const removeAgent = (id) => {
    setSelected(prev => prev.filter(a => a.id !== id))
  }

  const moveUp = (index) => {
    if (index === 0) return
    setSelected(prev => {
      const copy = [...prev]
      ;[copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]
      return copy
    })
  }

  const moveDown = (index) => {
    if (index === selected.length - 1) return
    setSelected(prev => {
      const copy = [...prev]
      ;[copy[index], copy[index + 1]] = [copy[index + 1], copy[index]]
      return copy
    })
  }

  const handleCreate = async () => {
    setError('')
    if (!name.trim()) { setError('Please give your chain a name'); return }
    if (selected.length < 2) { setError('A chain needs at least 2 agents'); return }

    setSaving(true)
    try {
      const payload = {
        name,
        description,
        agent_ids: selected.map(a => a.id),
      }

      if (branchKeyword.trim()) {
        payload.branch_keyword = branchKeyword
        payload.branch_agent_if_id = branchAgentIf || null
        payload.branch_agent_else_id = branchAgentElse || null
      }

      const chain = await createChain(payload)
      navigate(`/chains/${chain.id}/run`)
    } catch (err) {
      setError(err.message || 'Failed to create chain')
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%',
    background: '#0F1117',
    border: '1px solid #2A2D3E',
    borderRadius: 10,
    padding: '11px 14px',
    color: 'white',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'system-ui',
  }

  const selectStyle = {
    width: '100%',
    background: '#0F1117',
    border: '1px solid #2A2D3E',
    borderRadius: 10,
    padding: '11px 14px',
    color: 'white',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'system-ui',
    appearance: 'none',
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'#9CA3AF', fontSize:14 }}>
      Loading your agents...
    </div>
  )

  const availableAgents = allAgents.filter(a => !selected.find(s => s.id === a.id))

  return (
    <div style={{ maxWidth:760, margin:'0 auto', color:'white', fontFamily:'system-ui, sans-serif' }}>

      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:24, fontWeight:600, marginBottom:4 }}>Create a Chain</h1>
        <p style={{ color:'#9CA3AF', fontSize:14 }}>
          Pick 2 or more agents. The first agent&apos;s answer automatically becomes the next agent&apos;s question.
        </p>
      </div>

      {allAgents.length < 2 && (
        <div style={{ background:'#2D1515', border:'1px solid #EF4444', borderRadius:10, padding:'14px 18px', color:'#FCA5A5', fontSize:13, marginBottom:20 }}>
          ⚠️ You need at least 2 agents before you can build a chain. Go to the Dashboard and create another agent first.
        </div>
      )}

      <div style={{ background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:16, padding:24 }}>

        {/* Name + description */}
        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block', fontSize:13, color:'#9CA3AF', marginBottom:6 }}>Chain Name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Research then Write"
            style={inputStyle}
            onFocus={(e) => { e.target.style.border = '1px solid #7C3AED' }}
            onBlur={(e) => { e.target.style.border = '1px solid #2A2D3E' }}
          />
        </div>

        <div style={{ marginBottom:24 }}>
          <label style={{ display:'block', fontSize:13, color:'#9CA3AF', marginBottom:6 }}>Description (optional)</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does this chain do?"
            style={inputStyle}
            onFocus={(e) => { e.target.style.border = '1px solid #7C3AED' }}
            onBlur={(e) => { e.target.style.border = '1px solid #2A2D3E' }}
          />
        </div>

        {/* Selected agents — the order that will run */}
        <label style={{ display:'block', fontSize:13, color:'#9CA3AF', marginBottom:10 }}>
          Chain order ({selected.length} agent{selected.length !== 1 ? 's' : ''} selected)
        </label>

        {selected.length === 0 ? (
          <div style={{ background:'#0F1117', border:'1px dashed #2A2D3E', borderRadius:12, padding:'24px', textAlign:'center', color:'#6B7280', fontSize:13, marginBottom:20 }}>
            No agents added yet — click an agent below to add it
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
            {selected.map((agent, i) => (
              <div key={agent.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0F1117', border:'1px solid #7C3AED55', borderRadius:10, padding:'10px 14px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ width:22, height:22, borderRadius:'50%', background:'#7C3AED', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:600, flexShrink:0 }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize:13, fontWeight:500 }}>{agent.name}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <button
                      onClick={() => moveUp(i)}
                      disabled={i === 0}
                      style={{
                        background:'transparent',
                        border:'none',
                        color: i === 0 ? '#374151' : '#9CA3AF',
                        cursor: i === 0 ? 'default' : 'pointer',
                        fontSize:14,
                        padding:'2px 6px'
                      }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveDown(i)}
                      disabled={i === selected.length - 1}
                      style={{
                        background:'transparent',
                        border:'none',
                        color: i === selected.length - 1 ? '#374151' : '#9CA3AF',
                        cursor: i === selected.length - 1 ? 'default' : 'pointer',
                        fontSize:14,
                        padding:'2px 6px'
                      }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeAgent(agent.id)}
                      style={{ background:'transparent', border:'none', color:'#9CA3AF', cursor:'pointer', padding:'2px 6px' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                {i < selected.length - 1 && <ArrowRight size={15} color="#4B5563" style={{ flexShrink:0 }} />}
              </div>
            ))}
          </div>
        )}

        {/* Available agents to add */}
        {availableAgents.length > 0 && (
          <>
            <label style={{ display:'block', fontSize:13, color:'#9CA3AF', marginBottom:10 }}>Your agents — click to add</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:24 }}>
              {availableAgents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => addAgent(agent)}
                  style={{
                    display:'flex',
                    alignItems:'center',
                    gap:6,
                    background:'#0F1117',
                    border:'1px solid #2A2D3E',
                    borderRadius:10,
                    padding:'8px 14px',
                    color:'white',
                    cursor:'pointer',
                    fontSize:13
                  }}
                >
                  <Plus size={13} color="#7C3AED" /> {agent.name}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Branch condition */}
        <div style={{ marginBottom:24 }}>
          {!showBranch ? (
            <button
              type="button"
              onClick={() => setShowBranch(true)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: '#A78BFA',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 500,
              }}
            >
              <Plus size={14} />
              Add a branch condition
            </button>
          ) : (
            <div style={{ background:'#141823', border:'1px solid #2A2D3E', borderRadius:14, padding:18 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>Branch condition, optional</div>
                  <div style={{ color:'#9CA3AF', fontSize:13 }}>
                    Route the chain to different next agents depending on the last agent&apos;s answer.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowBranch(false)}
                  style={{
                    background:'transparent',
                    border:'none',
                    color:'#9CA3AF',
                    cursor:'pointer',
                    padding:4,
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'center'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div>
                  <label style={{ display:'block', fontSize:13, color:'#9CA3AF', marginBottom:6 }}>
                    If the last agent&apos;s answer contains this word or phrase
                  </label>
                  <input
                    value={branchKeyword}
                    onChange={e => setBranchKeyword(e.target.value)}
                    placeholder="e.g. refund, urgent, approved"
                    style={inputStyle}
                    onFocus={(e) => { e.target.style.border = '1px solid #7C3AED' }}
                    onBlur={(e) => { e.target.style.border = '1px solid #2A2D3E' }}
                  />
                </div>

                <div>
                  <label style={{ display:'block', fontSize:13, color:'#9CA3AF', marginBottom:6 }}>
                    Then run this agent next
                  </label>
                  <select
                    value={branchAgentIf}
                    onChange={e => setBranchAgentIf(e.target.value)}
                    style={selectStyle}
                    onFocus={(e) => { e.target.style.border = '1px solid #7C3AED' }}
                    onBlur={(e) => { e.target.style.border = '1px solid #2A2D3E' }}
                  >
                    <option value="" style={{ background:'#0F1117', color:'#9CA3AF' }}>
                      Select an agent (optional)
                    </option>
                    {allAgents.map(agent => (
                      <option key={agent.id} value={agent.id} style={{ background:'#0F1117', color:'white' }}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display:'block', fontSize:13, color:'#9CA3AF', marginBottom:6 }}>
                    Otherwise run this agent instead
                  </label>
                  <select
                    value={branchAgentElse}
                    onChange={e => setBranchAgentElse(e.target.value)}
                    style={selectStyle}
                    onFocus={(e) => { e.target.style.border = '1px solid #7C3AED' }}
                    onBlur={(e) => { e.target.style.border = '1px solid #2A2D3E' }}
                  >
                    <option value="" style={{ background:'#0F1117', color:'#9CA3AF' }}>
                      Select an agent (optional)
                    </option>
                    {allAgents.map(agent => (
                      <option key={agent.id} value={agent.id} style={{ background:'#0F1117', color:'white' }}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ background:'#2D1515', border:'1px solid #EF4444', borderRadius:10, padding:'10px 14px', color:'#FCA5A5', fontSize:13, marginBottom:16 }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={saving}
          style={{
            width:'100%',
            background: saving ? '#5B21B6' : '#7C3AED',
            color:'white',
            border:'none',
            padding:14,
            borderRadius:12,
            fontSize:15,
            fontWeight:600,
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? 'Creating chain...' : '🔗 Create Chain'}
        </button>
      </div>
    </div>
  )
}
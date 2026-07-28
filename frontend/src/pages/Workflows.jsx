import { useEffect, useState } from 'react'
import { GitBranch, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { deleteWorkflow, getWorkflows } from '../lib/api'

const STATUS = {
  draft: { color:'#9CA3AF', background:'#37415155' },
  active: { color:'#34D399', background:'#064E3B66' },
  paused: { color:'#FCD34D', background:'#78350F66' },
}

export default function Workflows() {
  const navigate = useNavigate()
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getWorkflows()
      .then(setWorkflows)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const remove = async (event, id) => {
    event.stopPropagation()
    if (!window.confirm('Delete this workflow and its run history?')) return
    try {
      await deleteWorkflow(id)
      setWorkflows(items => items.filter(item => item.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div style={{ color:'#9CA3AF', padding:30 }}>Loading workflows...</div>

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:600, marginBottom:4 }}>Workflows</h1>
          <p style={{ color:'#9CA3AF', fontSize:14 }}>Build reliable agent automations with conditions and data transforms.</p>
        </div>
        <button onClick={() => navigate('/workflows/new')} style={primaryButton}>
          <Plus size={15} /> New Workflow
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {!workflows.length ? (
        <div style={{ background:'#1A1D27', border:'1px dashed #2A2D3E', borderRadius:16, padding:60, textAlign:'center' }}>
          <GitBranch size={44} color="#4B5563" style={{ marginBottom:14 }} />
          <h2 style={{ fontSize:18, marginBottom:8 }}>Build your first workflow</h2>
          <p style={{ color:'#9CA3AF', fontSize:13, marginBottom:22 }}>Connect input, agents, transforms, decisions, and output on an editable graph.</p>
          <button onClick={() => navigate('/workflows/new')} style={primaryButton}>Create workflow</button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
          {workflows.map(workflow => (
            <div key={workflow.id} onClick={() => navigate(`/workflows/${workflow.id}/edit`)}
              style={{ background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:16, padding:18, cursor:'pointer' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <h3 style={{ fontSize:15 }}>{workflow.name}</h3>
                    <span style={{ ...STATUS[workflow.status], fontSize:10, textTransform:'uppercase', padding:'3px 7px', borderRadius:999 }}>
                      {workflow.status}
                    </span>
                  </div>
                  <p style={{ color:'#9CA3AF', fontSize:12, lineHeight:1.5 }}>{workflow.description || 'No description'}</p>
                </div>
                <button onClick={event => remove(event, workflow.id)} style={iconButton}><Trash2 size={14} /></button>
              </div>
              <div style={{ display:'flex', gap:14, marginTop:16, color:'#6B7280', fontSize:11 }}>
                <span>{workflow.nodes?.length || 0} nodes</span>
                <span>{workflow.edges?.length || 0} edges</span>
                <span>v{workflow.version}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const primaryButton = {
  display:'inline-flex', alignItems:'center', gap:7, background:'#7C3AED',
  color:'white', border:'none', padding:'10px 17px', borderRadius:10,
  cursor:'pointer', fontSize:13, fontWeight:600,
}
const iconButton = { background:'transparent', border:'none', color:'#6B7280', cursor:'pointer', padding:4 }
const errorBox = { background:'#2D1515', border:'1px solid #EF4444', borderRadius:10, padding:12, color:'#FCA5A5', fontSize:13, marginBottom:16 }

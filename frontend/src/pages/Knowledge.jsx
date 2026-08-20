import { useCallback, useEffect, useState } from 'react'
import { BookOpen, FileText, Link2, Plus, Search, Trash2 } from 'lucide-react'

import {
  addKnowledgeDocument,
  bindKnowledgeAgent,
  clearKnowledgeMemory,
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  getAgents,
  getKnowledgeBases,
  getKnowledgeDocuments,
  getKnowledgeMemory,
  searchKnowledge,
  unbindKnowledgeAgent,
} from '../lib/api'

const panel = {
  background:'#fff',
  border:'1px solid #dce7df',
  borderRadius:14,
  padding:18,
  boxShadow:'0 10px 30px rgba(20,48,36,.05)',
}
const inputStyle = {
  width:'100%',
  background:'#fff',
  border:'1px solid #c8d8ce',
  borderRadius:8,
  color:'#143024',
  padding:'10px 12px',
  boxSizing:'border-box',
}
const button = {
  border:0,
  borderRadius:8,
  padding:'9px 13px',
  background:'#0b7a53',
  color:'white',
  cursor:'pointer',
  display:'inline-flex',
  alignItems:'center',
  gap:7,
}

export default function Knowledge() {
  const [bases, setBases] = useState([])
  const [agents, setAgents] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [documents, setDocuments] = useState([])
  const [memory, setMemory] = useState([])
  const [form, setForm] = useState({
    name:'',
    description:'',
    retention_days:30,
    memory_enabled:true,
  })
  const [document, setDocument] = useState({ title:'', content:'', source_type:'manual' })
  const [search, setSearch] = useState('')
  const [citations, setCitations] = useState([])
  const [agentId, setAgentId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const [baseData, agentData] = await Promise.all([getKnowledgeBases(), getAgents()])
      setBases(baseData)
      setAgents(agentData)
      setSelectedId(current => current || baseData[0]?.id || '')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const loadDetails = useCallback(async id => {
    if (!id) {
      setDocuments([])
      setMemory([])
      return
    }
    try {
      const [documentData, memoryData] = await Promise.all([
        getKnowledgeDocuments(id),
        getKnowledgeMemory(id),
      ])
      setDocuments(documentData)
      setMemory(memoryData)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])
  useEffect(() => {
    const timer = setTimeout(() => loadDetails(selectedId), 0)
    return () => clearTimeout(timer)
  }, [selectedId, loadDetails])

  const selected = bases.find(base => base.id === selectedId)

  const run = async (key, action) => {
    setBusy(key)
    try {
      await action()
      setError('')
      await load()
      if (key !== 'delete-base') await loadDetails(selectedId)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const create = event => {
    event.preventDefault()
    run('create', async () => {
      const created = await createKnowledgeBase({
        ...form,
        retention_days:form.retention_days ? Number(form.retention_days) : null,
      })
      setForm({ name:'', description:'', retention_days:30, memory_enabled:true })
      setSelectedId(created.id)
    })
  }

  const addDocument = event => {
    event.preventDefault()
    run('document', async () => {
      await addKnowledgeDocument(selectedId, document)
      setDocument({ title:'', content:'', source_type:'manual' })
    })
  }

  const readFile = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    const content = await file.text()
    setDocument({ title:file.name, content, source_type:'upload', mime_type:file.type || 'text/plain' })
  }

  const executeSearch = async event => {
    event.preventDefault()
    setBusy('search')
    try {
      const result = await searchKnowledge(selectedId, search)
      setCitations(result.citations || [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div style={{ maxWidth:1200, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'end', marginBottom:22 }}>
        <div>
          <h1 style={{ fontSize:25, margin:'0 0 5px' }}>Knowledge & memory</h1>
          <p style={{ margin:0, color:'#607268', fontSize:13 }}>
            Ground agents in your documents with traceable citations and explicit retention.
          </p>
        </div>
      </div>
      {error && <div style={{ ...panel, borderColor:'#efb5af', color:'#a92c22', background:'#fff5f4', marginBottom:15 }}>{error}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'310px 1fr', gap:18 }}>
        <div>
          <form onSubmit={create} style={{ ...panel, marginBottom:14 }}>
            <h3 style={{ margin:'0 0 13px', fontSize:15 }}>New knowledge base</h3>
            <input style={inputStyle} placeholder="Name" value={form.name}
              onChange={event => setForm({ ...form, name:event.target.value })} />
            <textarea style={{ ...inputStyle, marginTop:9, minHeight:70 }} placeholder="Description"
              value={form.description}
              onChange={event => setForm({ ...form, description:event.target.value })} />
            <label style={{ display:'block', color:'#607268', fontSize:12, margin:'10px 0 5px' }}>
              Retention days (blank = forever)
            </label>
            <input style={inputStyle} type="number" min="1" max="3650"
              value={form.retention_days}
              onChange={event => setForm({ ...form, retention_days:event.target.value })} />
            <label style={{ display:'flex', gap:8, margin:'11px 0 14px', color:'#7049d7', fontSize:13 }}>
              <input type="checkbox" checked={form.memory_enabled}
                onChange={event => setForm({ ...form, memory_enabled:event.target.checked })} />
              Retain agent memory
            </label>
            <button style={button} disabled={busy === 'create'}><Plus size={15} /> Create</button>
          </form>

          <div style={panel}>
            <div style={{ color:'#607268', fontSize:11, textTransform:'uppercase', marginBottom:9 }}>Bases</div>
            {bases.map(base => (
              <button key={base.id} onClick={() => setSelectedId(base.id)} style={{
                width:'100%',
                textAlign:'left',
                border:'1px solid',
                borderColor:selectedId === base.id ? '#7049d7' : '#dce7df',
                background:selectedId === base.id ? '#f0ebff' : '#fff',
                color:'#143024',
                borderRadius:9,
                padding:11,
                marginBottom:7,
                cursor:'pointer',
              }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <BookOpen size={14} color="#7049d7" /> {base.name}
                </div>
                <div style={{ color:'#84938b', fontSize:11, marginTop:5 }}>
                  {base.document_count} docs · {base.chunk_count} chunks · {base.memory_count} memories
                </div>
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <div style={{ display:'grid', gap:14 }}>
            <div style={panel}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
                <div>
                  <h2 style={{ margin:0, fontSize:18 }}>{selected.name}</h2>
                  <p style={{ color:'#607268', fontSize:12 }}>{selected.description || 'No description'}</p>
                  <div style={{ color:'#7049d7', fontSize:12 }}>
                    Retention: {selected.retention_days ? `${selected.retention_days} days` : 'Forever'} ·
                    Memory {selected.memory_enabled ? 'enabled' : 'disabled'}
                  </div>
                </div>
                <button style={{ ...button, background:'#3F1D2B', color:'#FDA4AF' }}
                  onClick={() => run('delete-base', async () => {
                    await deleteKnowledgeBase(selected.id)
                    setSelectedId('')
                  })}>
                  <Trash2 size={14} /> Delete base
                </button>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <form onSubmit={addDocument} style={panel}>
                <h3 style={{ margin:'0 0 12px', fontSize:15 }}>Add document</h3>
                <input type="file" accept=".txt,.md,.csv,.json" onChange={readFile}
                  style={{ color:'#A1A1AA', fontSize:12, marginBottom:10 }} />
                <input style={inputStyle} placeholder="Document title" value={document.title}
                  onChange={event => setDocument({ ...document, title:event.target.value })} />
                <textarea style={{ ...inputStyle, minHeight:150, marginTop:9 }}
                  placeholder="Paste text or choose a file" value={document.content}
                  onChange={event => setDocument({ ...document, content:event.target.value, source_type:'manual' })} />
                <button style={{ ...button, marginTop:10 }} disabled={busy === 'document'}>
                  <FileText size={14} /> Process document
                </button>
              </form>

              <form onSubmit={executeSearch} style={panel}>
                <h3 style={{ margin:'0 0 12px', fontSize:15 }}>Test retrieval</h3>
                <textarea style={{ ...inputStyle, minHeight:75 }} placeholder="Ask about these documents"
                  value={search} onChange={event => setSearch(event.target.value)} />
                <button style={{ ...button, marginTop:10 }} disabled={busy === 'search'}>
                  <Search size={14} /> Search
                </button>
                <div style={{ marginTop:13, display:'grid', gap:8 }}>
                  {citations.map(citation => (
                    <div key={citation.chunk_id} style={{ background:'#f7faf7', border:'1px solid #e1e9e3', borderRadius:8, padding:10 }}>
                      <div style={{ color:'#C4B5FD', fontSize:12 }}>
                        [{citation.citation_number}] {citation.title}
                      </div>
                      <div style={{ color:'#A1A1AA', fontSize:12, marginTop:5 }}>{citation.excerpt}</div>
                    </div>
                  ))}
                </div>
              </form>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={panel}>
                <h3 style={{ margin:'0 0 12px', fontSize:15 }}>Documents</h3>
                {documents.map(item => (
                  <div key={item.id} style={{ display:'flex', gap:8, alignItems:'center', padding:'9px 0', borderBottom:'1px solid #e1e9e3' }}>
                    <FileText size={14} color="#7049d7" />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13 }}>{item.title}</div>
                      <div style={{ fontSize:11, color:'#71717A' }}>{item.chunk_count} chunks · {item.status}</div>
                    </div>
                    <button title="Delete document" style={{ background:'transparent', border:0, color:'#FB7185', cursor:'pointer' }}
                      onClick={() => run(item.id, () => deleteKnowledgeDocument(selected.id, item.id))}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {!documents.length && <p style={{ color:'#71717A', fontSize:12 }}>No documents yet.</p>}
              </div>

              <div style={panel}>
                <h3 style={{ margin:'0 0 12px', fontSize:15 }}>Agent binding & memory</h3>
                <div style={{ display:'flex', gap:8 }}>
                  <select style={inputStyle} value={agentId} onChange={event => setAgentId(event.target.value)}>
                    <option value="">Choose an agent</option>
                    {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                  <button type="button" style={button} disabled={!agentId}
                    onClick={() => run('bind', () => bindKnowledgeAgent(selected.id, agentId))}>
                    <Link2 size={14} /> Bind
                  </button>
                </div>
                {(selected.bound_agents || []).map(agent => (
                  <div key={agent.id} style={{ display:'flex', justifyContent:'space-between', marginTop:9, fontSize:12 }}>
                    <span>{agent.name}</span>
                    <button style={{ background:'transparent', border:0, color:'#FCA5A5', cursor:'pointer' }}
                      onClick={() => run(agent.id, () => unbindKnowledgeAgent(selected.id, agent.id))}>Unbind</button>
                  </div>
                ))}
                <div style={{ borderTop:'1px solid #e1e9e3', marginTop:14, paddingTop:12, display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'#A1A1AA', fontSize:12 }}>{memory.length} retained memory entries</span>
                  <button style={{ ...button, padding:'6px 9px', background:'#27272A' }}
                    onClick={() => run('clear', () => clearKnowledgeMemory(selected.id))}>Clear memory</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ ...panel, color:'#71717A', display:'grid', placeItems:'center', minHeight:250 }}>
            Create a knowledge base to begin.
          </div>
        )}
      </div>
    </div>
  )
}

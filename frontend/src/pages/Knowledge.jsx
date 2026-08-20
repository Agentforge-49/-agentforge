import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, BookOpen, CheckCircle2, FileText, Globe2, HardDrive,
  Link2, LoaderCircle, Plus, RefreshCw, Search, Sparkles, Trash2,
  Upload, X,
} from 'lucide-react'

import {
  bindKnowledgeAgent,
  clearKnowledgeMemory,
  createKnowledgeBase,
  createKnowledgeSource,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  deleteKnowledgeSource,
  getAgents,
  getCredentials,
  getKnowledgeBases,
  getKnowledgeDocumentPreview,
  getKnowledgeDocuments,
  getKnowledgeMemory,
  getKnowledgeSources,
  getOauthConnections,
  searchKnowledge,
  syncKnowledgeSource,
  unbindKnowledgeAgent,
  uploadKnowledgeSource,
} from '../lib/api'
import { useNavigate } from '../lib/router.jsx'
import './Knowledge.css'

const SOURCE_MODES = [
  ['upload', Upload, 'Upload'],
  ['text', FileText, 'Text'],
  ['website', Globe2, 'Website'],
  ['google_drive', HardDrive, 'Drive'],
  ['notion', BookOpen, 'Notion'],
]

const SOURCE_LABELS = {
  text:'Text', pdf:'PDF', docx:'DOCX', csv:'CSV', website:'Website',
  google_drive:'Google Drive', notion:'Notion',
}

function relativeTime(value) {
  if (!value) return 'Never synced'
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function connectionLabel(connection) {
  return connection.name || connection.provider_account_name || `${connection.provider} connection`
}

export default function Knowledge() {
  const navigate = useNavigate()
  const [bases, setBases] = useState([])
  const [agents, setAgents] = useState([])
  const [connections, setConnections] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [sources, setSources] = useState([])
  const [documents, setDocuments] = useState([])
  const [memory, setMemory] = useState([])
  const [baseForm, setBaseForm] = useState({ name:'', description:'', retention_days:30, memory_enabled:true })
  const [mode, setMode] = useState('upload')
  const [file, setFile] = useState(null)
  const [manual, setManual] = useState({ title:'', content:'' })
  const [remote, setRemote] = useState({ name:'', url:'', file_id:'', page_id:'', credential_id:'' })
  const [search, setSearch] = useState('')
  const [citations, setCitations] = useState([])
  const [agentId, setAgentId] = useState('')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [baseData, agentData, vaultData, oauthData] = await Promise.all([
        getKnowledgeBases(), getAgents(), getCredentials(), getOauthConnections(),
      ])
      setBases(baseData)
      setAgents(agentData)
      setConnections([
        ...vaultData.map(item => ({ ...item, source:'vault', app_slug:item.metadata?.app_slug || '' })),
        ...oauthData.filter(item => item.status === 'active').map(item => ({ ...item, source:'oauth' })),
      ])
      setSelectedId(current => baseData.some(item => item.id === current) ? current : baseData[0]?.id || '')
      setError('')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  const loadDetails = useCallback(async id => {
    if (!id) {
      setSources([]); setDocuments([]); setMemory([])
      return
    }
    try {
      const [sourceData, documentData, memoryData] = await Promise.all([
        getKnowledgeSources(id), getKnowledgeDocuments(id), getKnowledgeMemory(id),
      ])
      setSources(sourceData)
      setDocuments(documentData)
      setMemory(memoryData)
      setError('')
    } catch (err) { setError(err.message) }
  }, [])

  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer) }, [load])
  useEffect(() => { const timer = setTimeout(() => loadDetails(selectedId), 0); return () => clearTimeout(timer) }, [selectedId, loadDetails])

  const selected = bases.find(base => base.id === selectedId)
  const driveConnections = useMemo(() => connections.filter(item =>
    item.provider === 'google' || item.app_slug === 'google_drive'), [connections])
  const notionConnections = useMemo(() => connections.filter(item => item.app_slug === 'notion'), [connections])

  const run = async (key, action, success = '') => {
    setBusy(key); setNotice('')
    try {
      await action()
      setError('')
      if (success) setNotice(success)
      await Promise.all([load(), loadDetails(selectedId)])
    } catch (err) {
      setError(err.message)
      await loadDetails(selectedId).catch(() => {})
    } finally { setBusy('') }
  }

  const createBase = event => {
    event.preventDefault()
    run('create-base', async () => {
      const created = await createKnowledgeBase({
        ...baseForm,
        retention_days:baseForm.retention_days ? Number(baseForm.retention_days) : null,
      })
      setBaseForm({ name:'', description:'', retention_days:30, memory_enabled:true })
      setSelectedId(created.id)
    }, 'Knowledge base created.')
  }

  const addSource = event => {
    event.preventDefault()
    if (mode === 'upload') {
      if (!file) return setError('Choose a file first.')
      if (file.size > 5_000_000) return setError('Knowledge files must be 5 MB or smaller.')
      return run('add-source', async () => {
        await uploadKnowledgeSource(selectedId, file)
        setFile(null)
      }, 'File processed and ready for retrieval.')
    }
    if (mode === 'text') {
      return run('add-source', async () => {
        const name = /\.txt$/i.test(manual.title) ? manual.title : `${manual.title}.txt`
        await uploadKnowledgeSource(selectedId, new File([manual.content], name, { type:'text/plain' }))
        setManual({ title:'', content:'' })
      }, 'Text added and chunked.')
    }
    const configuration = mode === 'website' ? { url:remote.url }
      : mode === 'google_drive' ? { file_id:remote.file_id, credential_id:remote.credential_id }
        : { page_id:remote.page_id, credential_id:remote.credential_id }
    return run('add-source', async () => {
      await createKnowledgeSource(selectedId, {
        source_type:mode,
        name:remote.name || (mode === 'website' ? remote.url : `${SOURCE_LABELS[mode]} source`),
        configuration,
      })
      setRemote({ name:'', url:'', file_id:'', page_id:'', credential_id:'' })
    }, 'Source connected and synchronized.')
  }

  const executeSearch = event => {
    event.preventDefault()
    run('search', async () => {
      const result = await searchKnowledge(selectedId, search)
      setCitations(result.citations || [])
    })
  }

  const openPreview = async documentId => {
    setBusy(`preview-${documentId}`)
    try { setPreview(await getKnowledgeDocumentPreview(selectedId, documentId)); setError('') }
    catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  const eligibleConnections = mode === 'google_drive' ? driveConnections : notionConnections

  if (loading) return <div className="knowledge-loading"><LoaderCircle size={22} /> Preparing knowledge workspace…</div>

  return <div className="knowledge-page">
    <header className="knowledge-hero">
      <div><span><Sparkles size={13} /> Grounded AI</span><h1>Knowledge that stays visible, current, and cited.</h1><p>Upload real documents or synchronize approved sources. Preview every chunk before an agent uses it.</p></div>
      {selected && <div className="knowledge-hero__stats"><strong>{sources.length}</strong><small>sources</small><strong>{documents.reduce((sum, item) => sum + item.chunk_count, 0)}</strong><small>chunks</small></div>}
    </header>

    {error && <div className="knowledge-alert error"><AlertCircle size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
    {notice && <div className="knowledge-alert success"><CheckCircle2 size={17} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15} /></button></div>}

    <div className="knowledge-layout">
      <aside className="knowledge-sidebar">
        <form className="knowledge-card base-form" onSubmit={createBase}>
          <div className="knowledge-card__heading"><div><small>Workspace</small><h2>New knowledge base</h2></div><Plus size={17} /></div>
          <input placeholder="Base name" value={baseForm.name} required maxLength={100} onChange={event => setBaseForm({ ...baseForm, name:event.target.value })} />
          <textarea placeholder="What should agents learn here?" value={baseForm.description} maxLength={500} onChange={event => setBaseForm({ ...baseForm, description:event.target.value })} />
          <label><span>Retention days</span><input type="number" min="1" max="3650" value={baseForm.retention_days} onChange={event => setBaseForm({ ...baseForm, retention_days:event.target.value })} /></label>
          <label className="knowledge-check"><input type="checkbox" checked={baseForm.memory_enabled} onChange={event => setBaseForm({ ...baseForm, memory_enabled:event.target.checked })} /> Retain agent memory</label>
          <button className="knowledge-primary" disabled={busy === 'create-base'}>{busy === 'create-base' ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />} Create base</button>
        </form>
        <div className="knowledge-card base-list">
          <div className="knowledge-card__heading"><div><small>Your library</small><h2>Knowledge bases</h2></div><BookOpen size={17} /></div>
          {bases.map(base => <button key={base.id} className={selectedId === base.id ? 'active' : ''} onClick={() => setSelectedId(base.id)}><span><BookOpen size={15} /><strong>{base.name}</strong></span><small>{base.document_count} documents · {base.chunk_count} chunks</small></button>)}
          {!bases.length && <div className="knowledge-mini-empty">Create your first base to connect a source.</div>}
        </div>
      </aside>

      {selected ? <main className="knowledge-main">
        <section className="knowledge-card knowledge-summary">
          <div><small>Selected base</small><h2>{selected.name}</h2><p>{selected.description || 'Add documents and connect this base to an agent.'}</p><span>{selected.retention_days ? `${selected.retention_days}-day retention` : 'Retained until deleted'} · Memory {selected.memory_enabled ? 'on' : 'off'}</span></div>
          <button className="knowledge-danger" onClick={() => {
            if (window.confirm(`Delete ${selected.name} and all of its knowledge?`)) run('delete-base', async () => { await deleteKnowledgeBase(selected.id); setSelectedId('') }, 'Knowledge base deleted.')
          }}><Trash2 size={14} /> Delete base</button>
        </section>

        <section className="knowledge-card source-composer">
          <div className="knowledge-card__heading"><div><small>Ingestion</small><h2>Add or synchronize knowledge</h2></div><Upload size={17} /></div>
          <div className="source-tabs" role="tablist" aria-label="Knowledge source type">{SOURCE_MODES.map(([key, Icon, label]) => <button type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'active' : ''} key={key} onClick={() => { setMode(key); setError('') }}><Icon size={14} /> {label}</button>)}</div>
          <form onSubmit={addSource} className="source-form">
            {mode === 'upload' && <label className={`file-drop ${file ? 'ready' : ''}`}><input type="file" accept=".pdf,.docx,.csv,.tsv,.txt,.md,.json,.xml" onChange={event => setFile(event.target.files?.[0] || null)} /><Upload size={24} /><strong>{file ? file.name : 'Choose a knowledge file'}</strong><span>PDF, DOCX, CSV, TXT, Markdown, JSON, or XML · up to 5 MB</span></label>}
            {mode === 'text' && <div className="source-form__grid"><label><span>Document title</span><input value={manual.title} required maxLength={200} onChange={event => setManual({ ...manual, title:event.target.value })} /></label><label className="wide"><span>Approved text</span><textarea value={manual.content} required maxLength={1_000_000} placeholder="Paste policies, instructions, or reference material…" onChange={event => setManual({ ...manual, content:event.target.value })} /></label></div>}
            {mode === 'website' && <div className="source-form__grid"><label><span>Source name</span><input value={remote.name} maxLength={160} placeholder="Help center" onChange={event => setRemote({ ...remote, name:event.target.value })} /></label><label><span>Public HTTPS page</span><input type="url" required placeholder="https://example.com/help" value={remote.url} onChange={event => setRemote({ ...remote, url:event.target.value })} /></label><p className="wide source-help">AgentForge imports one public HTML or text page through its SSRF-protected fetcher. Redirects and private networks are rejected.</p></div>}
            {(mode === 'google_drive' || mode === 'notion') && <div className="source-form__grid"><label><span>Source name</span><input value={remote.name} maxLength={160} placeholder={SOURCE_LABELS[mode]} onChange={event => setRemote({ ...remote, name:event.target.value })} /></label><label><span>{mode === 'google_drive' ? 'File ID' : 'Page ID'}</span><input required value={mode === 'google_drive' ? remote.file_id : remote.page_id} onChange={event => setRemote({ ...remote, [mode === 'google_drive' ? 'file_id' : 'page_id']:event.target.value })} /></label><label className="wide"><span>Approved connection</span><select required value={remote.credential_id} onChange={event => setRemote({ ...remote, credential_id:event.target.value })}><option value="">Choose a connection</option>{eligibleConnections.map(item => <option key={item.id} value={item.id}>{connectionLabel(item)}</option>)}</select></label>{!eligibleConnections.length && <p className="wide source-help warning">No eligible connection is configured. <button type="button" onClick={() => navigate('/apps')}>Open Apps</button> to add one first.</p>}</div>}
            <button className="knowledge-primary" disabled={busy === 'add-source' || (mode === 'upload' && !file)}>{busy === 'add-source' ? <LoaderCircle className="spin" size={15} /> : mode === 'upload' ? <Upload size={15} /> : <RefreshCw size={15} />} {mode === 'upload' ? 'Process file' : mode === 'text' ? 'Add text' : 'Connect and sync'}</button>
          </form>
        </section>

        <div className="knowledge-two-column">
          <section className="knowledge-card source-list">
            <div className="knowledge-card__heading"><div><small>Source health</small><h2>Connected sources</h2></div><strong>{sources.length}</strong></div>
            {sources.map(source => <article key={source.id}><div className={`source-status ${source.status}`}>{source.status === 'ready' ? <CheckCircle2 size={15} /> : source.status === 'failed' ? <AlertCircle size={15} /> : <LoaderCircle className={source.status === 'syncing' ? 'spin' : ''} size={15} />}</div><div><strong>{source.name}</strong><span>{SOURCE_LABELS[source.source_type] || source.source_type} · {relativeTime(source.last_synced_at)} · {source.sync_count || 0} syncs</span>{source.last_error && <p>{source.last_error}</p>}</div><div className="source-actions">{['website','google_drive','notion'].includes(source.source_type) && <button title="Sync now" disabled={busy === source.id || source.status === 'syncing'} onClick={() => run(source.id, () => syncKnowledgeSource(selected.id, source.id), 'Source synchronized.')}><RefreshCw className={busy === source.id ? 'spin' : ''} size={14} /></button>}<button title="Delete source" onClick={() => run(`delete-${source.id}`, () => deleteKnowledgeSource(selected.id, source.id), 'Source deleted.')}><Trash2 size={14} /></button></div></article>)}
            {!sources.length && <div className="knowledge-empty"><Upload size={22} /><strong>No synchronized sources</strong><span>Add a file or approved app above.</span></div>}
          </section>

          <section className="knowledge-card retrieval-test">
            <div className="knowledge-card__heading"><div><small>Quality check</small><h2>Test retrieval</h2></div><Search size={17} /></div>
            <form onSubmit={executeSearch}><textarea placeholder="Ask a question these sources should answer…" value={search} required onChange={event => setSearch(event.target.value)} /><button className="knowledge-primary" disabled={busy === 'search'}>{busy === 'search' ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />} Search sources</button></form>
            <div className="citation-list">{citations.map(citation => <article key={citation.chunk_id}><span>[{citation.citation_number}] {citation.title}</span><p>{citation.excerpt}</p></article>)}{!citations.length && <div className="knowledge-mini-empty">Citation-backed results will appear here.</div>}</div>
          </section>
        </div>

        <div className="knowledge-two-column">
          <section className="knowledge-card document-list">
            <div className="knowledge-card__heading"><div><small>Indexed content</small><h2>Documents and chunk previews</h2></div><strong>{documents.length}</strong></div>
            {documents.map(item => <article key={item.id}><FileText size={16} /><div><strong>{item.title}</strong><span>{item.chunk_count} chunks · {item.character_count.toLocaleString()} characters · {item.status}</span></div><button onClick={() => openPreview(item.id)} disabled={busy === `preview-${item.id}`}>Preview</button><button title="Delete document" onClick={() => run(`document-${item.id}`, () => deleteKnowledgeDocument(selected.id, item.id), 'Document deleted.')}><Trash2 size={14} /></button></article>)}
            {!documents.length && <div className="knowledge-empty"><FileText size={22} /><strong>No indexed documents</strong><span>Processed source content will appear here.</span></div>}
          </section>

          <section className="knowledge-card agent-binding">
            <div className="knowledge-card__heading"><div><small>Agent access</small><h2>Bindings and memory</h2></div><Link2 size={17} /></div>
            <div className="binding-control"><select value={agentId} onChange={event => setAgentId(event.target.value)}><option value="">Choose a published agent</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><button className="knowledge-primary" disabled={!agentId || busy === 'bind'} onClick={() => run('bind', () => bindKnowledgeAgent(selected.id, agentId), 'Agent bound to this base.')}><Link2 size={14} /> Bind</button></div>
            <div className="bound-list">{(selected.bound_agents || []).map(agent => <div key={agent.id}><span>{agent.name}</span><button onClick={() => run(`unbind-${agent.id}`, () => unbindKnowledgeAgent(selected.id, agent.id), 'Agent unbound.')}>Unbind</button></div>)}{!selected.bound_agents?.length && <div className="knowledge-mini-empty">No agents use this base yet.</div>}</div>
            <footer><span>{memory.length} retained memory entries</span><button onClick={() => run('clear-memory', () => clearKnowledgeMemory(selected.id), 'Memory cleared.')}>Clear memory</button></footer>
          </section>
        </div>
      </main> : <main className="knowledge-card knowledge-welcome"><BookOpen size={28} /><h2>Create a knowledge base to begin.</h2><p>Separate support policies, sales material, and internal operations into focused libraries.</p></main>}
    </div>

    {preview && <div className="knowledge-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null) }}><section className="knowledge-modal" role="dialog" aria-modal="true" aria-label="Document chunk preview"><header><div><small>Chunk preview</small><h2>{preview.document.title}</h2><p>{preview.document.chunk_count} chunks · {preview.document.character_count.toLocaleString()} characters</p></div><button onClick={() => setPreview(null)} aria-label="Close preview"><X size={18} /></button></header><div>{preview.chunks.map(chunk => <article key={chunk.id}><span>Chunk {chunk.chunk_index + 1} · ~{chunk.token_estimate} tokens</span><p>{chunk.content}</p></article>)}{preview.truncated && <div className="knowledge-preview-note">Showing the first 12 chunks. Retrieval searches the complete document.</div>}</div></section></div>}
  </div>
}

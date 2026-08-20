import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, FlaskConical, Plus, Sparkles, Wrench } from 'lucide-react'

import { activateWorkspaceTool, createWorkspaceTool, getWorkspaceTools, testWorkspaceTool } from '../lib/api'

export default function WorkspaceTools() {
  const [tools, setTools] = useState([])
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('Result: {{input}}')
  const [testInput, setTestInput] = useState('Example input')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => getWorkspaceTools().then(setTools).catch(err => setMessage(err.message)), [])
  useEffect(() => { load() }, [load])

  const create = async event => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      await createWorkspaceTool({ name, description:'Reusable typed workspace transformation.', steps:[{ type:'transform', config:{ operation:'template', template } }], test_fixture:{ input:testInput } })
      setName(''); await load(); setMessage('Tool draft created. Test it before activation.')
    } catch (err) { setMessage(err.message) } finally { setBusy(false) }
  }
  const test = async tool => {
    try { const result = await testWorkspaceTool(tool.id, testInput); setMessage(`Test passed: ${String(result.output).slice(0, 160)}`) }
    catch (err) { setMessage(err.message) }
  }
  const activate = async tool => {
    try { await activateWorkspaceTool(tool.id, tool.current_version_id); await load(); setMessage(`${tool.name} is active.`) }
    catch (err) { setMessage(err.message) }
  }

  return <div className="workspace-tools-page">
    <header><div><span><Sparkles size={13}/> Reusable building blocks</span><h1>Workspace tools</h1><p>Create one tested operation, version it, and reuse it safely across workflows.</p></div></header>
    {message && <div className="workspace-tools-message">{message}</div>}
    <div className="workspace-tools-grid">
      <section className="workspace-tools-list"><h2>Your tools</h2>{tools.length ? tools.map(tool => <article key={tool.id}><span><Wrench size={17}/></span><div><strong>{tool.name}</strong><small>{tool.status} · version {tool.current_version?.version_number || 1}</small><p>{tool.description}</p></div><div><button onClick={() => test(tool)}><FlaskConical size={13}/> Test</button>{tool.status !== 'active' && <button onClick={() => activate(tool)}><CheckCircle2 size={13}/> Activate</button>}</div></article>) : <div className="workspace-tools-empty"><Wrench size={23}/><strong>No reusable tools yet</strong><p>Create a small tested transformation to begin.</p></div>}</section>
      <form className="workspace-tool-form" onSubmit={create}><span><Plus size={13}/> New tool</span><h2>Create a safe transformation</h2><label>Name<input required maxLength="100" value={name} onChange={event => setName(event.target.value)} placeholder="Format support summary"/></label><label>Template<textarea required value={template} onChange={event => setTemplate(event.target.value)} rows="4"/></label><label>Test input<input value={testInput} onChange={event => setTestInput(event.target.value)}/></label><p>Use {'{{input}}'} where the incoming value belongs. Connector steps can be added through the API after credentials are tested.</p><button disabled={busy}><Plus size={14}/> {busy ? 'Creating…' : 'Create draft'}</button></form>
    </div>
  </div>
}

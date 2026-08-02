import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  GitBranch,
  Play,
  Plug,
  Redo2,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from '../lib/router.jsx'

import {
  activateWorkflow,
  createWorkflow,
  generateWorkflowDraft,
  getAgents,
  getConnectors,
  getCredentials,
  getJob,
  getModels,
  getWorkflow,
  pauseWorkflow,
  runWorkflow,
  updateWorkflow,
} from '../lib/api'

const NODE_META = {
  input: { label:'Input', color:'#2563EB', icon:Type },
  agent: { label:'Agent', color:'#7C3AED', icon:Bot },
  connector: { label:'Connector', color:'#DB2777', icon:Plug },
  transform: { label:'Transform', color:'#0891B2', icon:Square },
  condition: { label:'Condition', color:'#D97706', icon:GitBranch },
  approval: { label:'Approval', color:'#EA580C', icon:ShieldCheck },
  output: { label:'Output', color:'#059669', icon:Play },
}

function connectorParameters(action) {
  if (action === 'http.request') return { url:'https://api.example.com', method:'GET' }
  if (action === 'email.send') return { to:'', from:'', subject:'', text:'{{input}}' }
  if (action === 'slack.message') return { channel:'', text:'{{input}}' }
  if (action === 'google_sheets.append') return { spreadsheet_id:'', range:'Sheet1!A:A', values:['{{input}}'] }
  if (action === 'google_drive.create_file') return { name:'agentforge-output.txt', content:'{{input}}' }
  if (action === 'database.select') return { table:'', select:'*', limit:25 }
  if (action === 'database.insert') return { table:'', row:{ value:'{{input}}' } }
  return {}
}

function makeNode(type) {
  const id = `${type}_${crypto.randomUUID().slice(0, 8)}`
  const configs = {
    input: {},
    agent: { agent_id:'' },
    connector: { action:'http.request', credential_id:null, parameters:connectorParameters('http.request') },
    transform: { operation:'trim', template:'{{input}}' },
    condition: { operator:'contains', value:'', case_sensitive:false },
    approval: { instructions:'Review this value before the workflow continues.', timeout_minutes:60 },
    output: {},
  }
  return { id, type, label:NODE_META[type].label, config:configs[type], position:{ x:0, y:0 } }
}

function graphFromNodes(nodes) {
  const positioned = nodes.map((node, index) => ({
    ...node,
    position: { x:80 + index * 230, y: node.type === 'condition' ? 150 : 90 },
  }))
  const edges = []
  positioned.forEach((node, index) => {
    if (index === positioned.length - 1) return
    if (node.type === 'condition') {
      const later = positioned.slice(index + 1)
      const fallback = later[0]?.id
      const trueTarget = later.some(item => item.id === node.config.true_target)
        ? node.config.true_target : fallback
      const falseTarget = later.some(item => item.id === node.config.false_target)
        ? node.config.false_target : fallback
      edges.push({ id:`${node.id}_true`, source:node.id, target:trueTarget, source_handle:'true' })
      edges.push({ id:`${node.id}_false`, source:node.id, target:falseTarget, source_handle:'false' })
    } else {
      edges.push({ id:`${node.id}_${positioned[index + 1].id}`, source:node.id, target:positioned[index + 1].id, source_handle:'default' })
    }
  })
  return { nodes:positioned, edges }
}

function workflowIssues(nodes, credentials, connectors) {
  const issues = []
  const credentialMap = new Map(credentials.map(item => [item.id, item]))
  const connectorMap = new Map(connectors.map(item => [item.action, item]))
  for (const node of nodes) {
    if (!node.label?.trim()) issues.push(`${node.type} node needs a label`)
    if (node.type === 'agent' && !node.config.agent_id) {
      issues.push(`${node.label || 'Agent'} needs a published agent`)
    }
    if (node.type === 'connector') {
      const definition = connectorMap.get(node.config.action)
      const credential = credentialMap.get(node.config.credential_id)
      if (!definition) issues.push(`${node.label || 'Connector'} needs a supported action`)
      else if (
        !definition.credential_optional
        && (!credential || !definition.providers?.includes(credential.provider))
      ) {
        issues.push(`${node.label || definition.name} needs a compatible credential`)
      }
    }
    if (node.type === 'condition') {
      if (!node.config.value?.trim()) issues.push(`${node.label || 'Condition'} needs a comparison value`)
      if (!node.config.true_target || !node.config.false_target) {
        issues.push(`${node.label || 'Condition'} needs explicit true and false paths`)
      }
    }
    if (node.type === 'approval') {
      const timeout = Number(node.config.timeout_minutes)
      if (!Number.isInteger(timeout) || timeout < 5 || timeout > 10080) {
        issues.push(`${node.label || 'Approval'} needs a valid timeout`)
      }
    }
  }
  return [...new Set(issues)]
}

export default function WorkflowBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)
  const [name, setName] = useState('Untitled workflow')
  const [description, setDescription] = useState('')
  const [nodes, setNodes] = useState([makeNode('input'), makeNode('output')])
  const [workflow, setWorkflow] = useState(null)
  const [agents, setAgents] = useState([])
  const [connectors, setConnectors] = useState([])
  const [credentials, setCredentials] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [runInput, setRunInput] = useState('')
  const [job, setJob] = useState(null)
  const [runResult, setRunResult] = useState(null)
  const [history, setHistory] = useState([])
  const [future, setFuture] = useState([])
  const [draggedId, setDraggedId] = useState('')
  const [copilotRequest, setCopilotRequest] = useState('')
  const [copilotModel, setCopilotModel] = useState('claude-sonnet-4-6')
  const [copilotBusy, setCopilotBusy] = useState(false)
  const [copilotResult, setCopilotResult] = useState(null)
  const [modelOptions, setModelOptions] = useState([])

  useEffect(() => {
    Promise.all([
      getAgents(),
      getConnectors(),
      getCredentials(),
      editing ? getWorkflow(id) : Promise.resolve(null),
      getModels().catch(() => ({ models:[] })),
    ]).then(([agentData, connectorData, credentialData, workflowData, modelData]) => {
      setAgents(agentData.filter(agent => agent.status === 'active' && agent.published_version_id))
      setConnectors(connectorData)
      setCredentials(credentialData)
      const availableModels = (modelData.models || []).filter(model => model.available)
      setModelOptions(availableModels)
      if (availableModels.length) {
        setCopilotModel(current => availableModels.some(model => model.id === current)
          ? current : availableModels[0].id)
      }
      if (workflowData) {
        setWorkflow(workflowData)
        setName(workflowData.name)
        setDescription(workflowData.description || '')
        setNodes(workflowData.nodes)
      }
    }).catch(err => setError(err.message))
  }, [editing, id])

  const graph = useMemo(() => graphFromNodes(nodes), [nodes])
  const selected = nodes.find(node => node.id === selectedId)
  const issues = useMemo(
    () => workflowIssues(nodes, credentials, connectors),
    [nodes, credentials, connectors],
  )

  const changeNodes = updater => {
    const next = typeof updater === 'function' ? updater(nodes) : updater
    if (next === nodes) return
    setHistory(items => [...items, nodes].slice(-30))
    setFuture([])
    setNodes(next)
  }

  const addNode = type => {
    const next = makeNode(type)
    changeNodes(items => [...items.slice(0, -1), next, items[items.length - 1]])
    setSelectedId(next.id)
  }
  const updateSelected = patch => {
    changeNodes(items => items.map(node => node.id === selectedId ? { ...node, ...patch } : node))
  }
  const updateConfig = patch => updateSelected({ config:{ ...selected.config, ...patch } })
  const removeSelected = () => {
    if (!selected || ['input', 'output'].includes(selected.type)) return
    changeNodes(items => items.filter(node => node.id !== selected.id))
    setSelectedId(null)
  }

  const undo = () => {
    if (!history.length) return
    const previous = history[history.length - 1]
    setFuture(items => [nodes, ...items].slice(0, 30))
    setHistory(items => items.slice(0, -1))
    setNodes(previous)
    setSelectedId(null)
  }

  const redo = () => {
    if (!future.length) return
    const next = future[0]
    setHistory(items => [...items, nodes].slice(-30))
    setFuture(items => items.slice(1))
    setNodes(next)
    setSelectedId(null)
  }

  const moveNode = (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return
    const source = nodes.find(node => node.id === sourceId)
    const target = nodes.find(node => node.id === targetId)
    if (!source || !target || ['input', 'output'].includes(source.type) || target.type === 'input') return
    const without = nodes.filter(node => node.id !== sourceId)
    const targetIndex = without.findIndex(node => node.id === targetId)
    const next = [...without]
    next.splice(targetIndex, 0, source)
    changeNodes(next)
  }

  const moveSelected = direction => {
    if (!selected || ['input', 'output'].includes(selected.type)) return
    const index = nodes.findIndex(node => node.id === selected.id)
    const targetIndex = direction < 0 ? index - 1 : index + 1
    if (targetIndex <= 0 || targetIndex >= nodes.length - 1) return
    const next = [...nodes]
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
    changeNodes(next)
  }

  const generateDraft = async () => {
    if (copilotRequest.trim().length < 10) {
      setError('Describe the workflow in at least 10 characters')
      return
    }
    setCopilotBusy(true)
    setError('')
    try {
      const draft = await generateWorkflowDraft(copilotRequest.trim(), copilotModel)
      changeNodes(draft.nodes)
      setName(draft.name)
      setDescription(draft.description || '')
      setCopilotResult(draft)
      setSelectedId(draft.nodes.find(node => !['input', 'output'].includes(node.type))?.id || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setCopilotBusy(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const payload = { name, description, nodes:graph.nodes, edges:graph.edges }
      const saved = editing
        ? await updateWorkflow(id, payload)
        : await createWorkflow(payload)
      setWorkflow(saved)
      if (!editing) navigate(`/workflows/${saved.id}/edit`, { replace:true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async () => {
    if (!workflow) return
    setBusy(true)
    try {
      const updated = workflow.status === 'active'
        ? await pauseWorkflow(workflow.id)
        : await activateWorkflow(workflow.id)
      setWorkflow(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const execute = async () => {
    if (!workflow || !runInput.trim()) return
    setBusy(true)
    setError('')
    setRunResult(null)
    try {
      const queued = await runWorkflow(workflow.id, runInput.trim(), crypto.randomUUID())
      let current = queued.job
      setJob(current)
      while (!['succeeded', 'failed', 'cancelled', 'waiting_approval'].includes(current.status)) {
        await new Promise(resolve => setTimeout(resolve, 1200))
        current = await getJob(current.id)
        setJob(current)
      }
      setRunResult(current.resource)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, marginBottom:18 }}>
        <div style={{ flex:1 }}>
          <input value={name} onChange={event => setName(event.target.value)} style={titleInput} />
          <input value={description} onChange={event => setDescription(event.target.value)}
            placeholder="Describe what this workflow accomplishes" style={descriptionInput} />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {workflow && <button onClick={toggleActive} disabled={busy} style={secondaryButton}>
            {workflow.status === 'active' ? 'Pause' : 'Activate'}
          </button>}
          <button onClick={save} disabled={busy} style={primaryButton}><Save size={14} /> Save draft</button>
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <section style={copilotPanel}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={copilotIcon}><Sparkles size={16} /></span>
              <h2 style={{ fontSize:15 }}>Workflow Copilot</h2>
              <span style={aiBadge}>AI draft</span>
            </div>
            <p style={{ color:'#8B8FA3', fontSize:12, marginTop:6 }}>
              Describe the outcome. Copilot assembles a safe draft from your published agents and configured connections.
            </p>
          </div>
          <select
            value={copilotModel}
            onChange={event => setCopilotModel(event.target.value)}
            style={{ ...inputStyle, width:220, margin:0 }}
            aria-label="Copilot model"
          >
            {modelOptions.length
              ? modelOptions.map(model => <option key={model.id} value={model.id}>{model.label}</option>)
              : <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>}
          </select>
        </div>
        <div style={{ display:'flex', alignItems:'stretch', gap:10, marginTop:14 }}>
          <textarea
            value={copilotRequest}
            onChange={event => setCopilotRequest(event.target.value)}
            placeholder="Example: Research a customer request, format a concise recommendation, require manager approval, then send it to Slack."
            maxLength={2000}
            style={{ ...inputStyle, minHeight:76, margin:0, resize:'vertical' }}
          />
          <button
            type="button"
            onClick={generateDraft}
            disabled={copilotBusy || copilotRequest.trim().length < 10}
            style={{ ...primaryButton, minWidth:142, justifyContent:'center', opacity:copilotBusy ? .7 : 1 }}
          >
            <Sparkles size={14} /> {copilotBusy ? 'Drafting…' : 'Generate draft'}
          </button>
        </div>
        {copilotResult && (
          <div style={copilotSummary}>
            <CheckCircle2 size={15} color="#34D399" />
            <span>
              Drafted {copilotResult.nodes.length} nodes with {copilotResult.generation.model}.
              {copilotResult.rationale ? ` ${copilotResult.rationale}` : ''}
            </span>
          </div>
        )}
      </section>

      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:12 }}>
        <span style={{ color:'#6B7280', fontSize:12, padding:'8px 0' }}>Add node:</span>
        {['agent', 'connector', 'transform', 'condition', 'approval'].map(type => {
          const MetaIcon = NODE_META[type].icon
          return <button key={type} onClick={() => addNode(type)} style={toolButton}>
            <MetaIcon size={13} /> {NODE_META[type].label}
          </button>
        })}
        <span style={{ width:1, background:'#2A2D3E', margin:'3px 2px' }} />
        <button type="button" onClick={undo} disabled={!history.length} style={{ ...toolButton, opacity:history.length ? 1 : .45 }}>
          <Undo2 size={13} /> Undo
        </button>
        <button type="button" onClick={redo} disabled={!future.length} style={{ ...toolButton, opacity:future.length ? 1 : .45 }}>
          <Redo2 size={13} /> Redo
        </button>
        {workflow && <span style={{ marginLeft:'auto', ...statusPill }}>{workflow.status} · v{workflow.version}</span>}
      </div>

      <div style={issues.length ? readinessWarning : readinessReady}>
        {issues.length ? (
          <>
            <ShieldCheck size={16} />
            <span><strong>{issues.length} item{issues.length === 1 ? '' : 's'} need attention.</strong> {issues.slice(0, 2).join(' · ')}</span>
          </>
        ) : (
          <><CheckCircle2 size={16} /><span><strong>Ready to save.</strong> Every node has the required configuration.</span></>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:selected ? '1fr 300px' : '1fr', gap:14 }}>
        <div style={canvas}>
          <div style={{ display:'flex', alignItems:'center', gap:16, minWidth:'max-content' }}>
            {nodes.map((node, index) => {
              const meta = NODE_META[node.type]
              const Icon = meta.icon
              const outgoing = graph.edges.filter(edge => edge.source === node.id)
              return (
                <div key={node.id} style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <button
                    onClick={() => setSelectedId(node.id)}
                    draggable={!['input', 'output'].includes(node.type)}
                    onDragStart={() => setDraggedId(node.id)}
                    onDragEnd={() => setDraggedId('')}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                      event.preventDefault()
                      moveNode(draggedId, node.id)
                      setDraggedId('')
                    }}
                    title={!['input', 'output'].includes(node.type) ? 'Drag to reorder' : undefined}
                    style={{
                      ...nodeCard,
                      borderColor:selectedId === node.id ? meta.color : '#2A2D3E',
                      boxShadow:selectedId === node.id ? `0 0 0 2px ${meta.color}33` : 'none',
                      opacity:draggedId === node.id ? .55 : 1,
                    }}
                  >
                    <span style={{ width:30, height:30, borderRadius:9, display:'grid', placeItems:'center', background:`${meta.color}33`, color:meta.color }}>
                      <Icon size={15} />
                    </span>
                    <span style={{ textAlign:'left' }}>
                      <strong style={{ display:'block', color:'white', fontSize:13 }}>{node.label}</strong>
                      <span style={{ color:'#6B7280', fontSize:10 }}>{node.type}</span>
                    </span>
                  </button>
                  {index < nodes.length - 1 && (
                    <div style={{ minWidth:64, textAlign:'center', color:'#6B7280', fontSize:10 }}>
                      {node.type === 'condition'
                        ? <><div style={{ color:'#34D399' }}>true →</div><div style={{ color:'#F87171' }}>false →</div></>
                        : <span>────→</span>}
                      {outgoing.length > 1 && <div>{outgoing.length} paths</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {selected && (
          <aside style={inspector}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <strong style={{ fontSize:14 }}>Node settings</strong>
              <button onClick={() => setSelectedId(null)} style={iconButton}><X size={15} /></button>
            </div>
            <label style={labelStyle}>Label</label>
            <input value={selected.label} onChange={event => updateSelected({ label:event.target.value })} style={inputStyle} />

            {!['input', 'output'].includes(selected.type) && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                <button type="button" onClick={() => moveSelected(-1)} style={secondaryButton}>
                  <ArrowLeft size={13} /> Move earlier
                </button>
                <button type="button" onClick={() => moveSelected(1)} style={secondaryButton}>
                  Move later <ArrowRight size={13} />
                </button>
              </div>
            )}

            {selected.type === 'agent' && <>
              <label style={labelStyle}>Published agent</label>
              <select value={selected.config.agent_id} onChange={event => updateConfig({ agent_id:event.target.value })} style={inputStyle}>
                <option value="">Select agent</option>
                {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </>}

            {selected.type === 'connector' && <>
              <label style={labelStyle}>Connector action</label>
              <select value={selected.config.action} onChange={event => {
                const action = event.target.value
                updateConfig({ action, credential_id:null, parameters:connectorParameters(action) })
              }} style={inputStyle}>
                {connectors.map(connector => <option key={connector.action} value={connector.action}>{connector.name}</option>)}
              </select>
              <label style={labelStyle}>Vault credential</label>
              <select value={selected.config.credential_id || ''} onChange={event => updateConfig({ credential_id:event.target.value || null })} style={inputStyle}>
                <option value="">{selected.config.action === 'http.request' ? 'No authentication' : 'Select credential'}</option>
                {credentials.map(credential => <option key={credential.id} value={credential.id}>{credential.name} · {credential.provider}</option>)}
              </select>
              <ConnectorFields node={selected} updateConfig={updateConfig} />
              <small style={{ color:'#6B7280' }}>Use {'{{input}}'} to insert the previous node&apos;s value.</small>
            </>}

            {selected.type === 'transform' && <>
              <label style={labelStyle}>Operation</label>
              <select value={selected.config.operation} onChange={event => updateConfig({ operation:event.target.value })} style={inputStyle}>
                <option value="trim">Trim whitespace</option>
                <option value="uppercase">Uppercase</option>
                <option value="lowercase">Lowercase</option>
                <option value="template">Template</option>
              </select>
              {selected.config.operation === 'template' && <>
                <label style={labelStyle}>Template</label>
                <textarea value={selected.config.template} onChange={event => updateConfig({ template:event.target.value })} style={{ ...inputStyle, minHeight:90 }} />
                <small style={{ color:'#6B7280' }}>Use {'{{input}}'} where the previous value belongs.</small>
              </>}
            </>}

            {selected.type === 'condition' && <>
              <label style={labelStyle}>Operator</label>
              <select value={selected.config.operator} onChange={event => updateConfig({ operator:event.target.value })} style={inputStyle}>
                <option value="contains">Contains</option>
                <option value="not_contains">Does not contain</option>
                <option value="equals">Equals</option>
              </select>
              <label style={labelStyle}>Value</label>
              <input value={selected.config.value} onChange={event => updateConfig({ value:event.target.value })} style={inputStyle} />
              <label style={labelStyle}>True path</label>
              <select value={selected.config.true_target || ''} onChange={event => updateConfig({ true_target:event.target.value })} style={inputStyle}>
                <option value="">Next node</option>
                {nodes.slice(nodes.findIndex(node => node.id === selected.id) + 1).map(node => <option key={node.id} value={node.id}>{node.label}</option>)}
              </select>
              <label style={labelStyle}>False path</label>
              <select value={selected.config.false_target || ''} onChange={event => updateConfig({ false_target:event.target.value })} style={inputStyle}>
                <option value="">Next node</option>
                {nodes.slice(nodes.findIndex(node => node.id === selected.id) + 1).map(node => <option key={node.id} value={node.id}>{node.label}</option>)}
              </select>
            </>}

            {selected.type === 'approval' && <>
              <label style={labelStyle}>Reviewer instructions</label>
              <textarea value={selected.config.instructions || ''} onChange={event => updateConfig({ instructions:event.target.value })}
                style={{ ...inputStyle, minHeight:86 }} />
              <label style={labelStyle}>Timeout (minutes)</label>
              <input type="number" min="5" max="10080" value={selected.config.timeout_minutes}
                onChange={event => updateConfig({ timeout_minutes:Number(event.target.value) })} style={inputStyle} />
              <small style={{ color:'#6B7280' }}>The durable run pauses here and resumes only after approval or editing.</small>
            </>}

            {!['input', 'output'].includes(selected.type) && (
              <button onClick={removeSelected} style={dangerButton}>Remove node</button>
            )}
          </aside>
        )}
      </div>

      {workflow?.status === 'active' && (
        <div style={{ ...inspector, marginTop:16 }}>
          <h2 style={{ fontSize:15, marginBottom:10 }}>Run workflow</h2>
          <div style={{ display:'flex', gap:8 }}>
            <input value={runInput} onChange={event => setRunInput(event.target.value)}
              placeholder="Enter workflow input" style={{ ...inputStyle, margin:0, flex:1 }} />
            <button onClick={execute} disabled={busy || !runInput.trim()} style={primaryButton}>
              <Play size={14} /> {busy ? 'Running...' : 'Run'}
            </button>
          </div>
          {job && <p style={{ color:job.status === 'waiting_approval' ? '#FCD34D' : '#9CA3AF', fontSize:12, marginTop:10 }}>
            Job status: {job.status} · attempt {job.attempt || 0}
            {job.status === 'waiting_approval' && ' · Open Approvals to continue'}
          </p>}
          {runResult && <pre style={resultBox}>{JSON.stringify(runResult.output || { error:runResult.error_message }, null, 2)}</pre>}
        </div>
      )}
    </div>
  )
}

function ConnectorFields({ node, updateConfig }) {
  const parameters = node.config.parameters || {}
  const updateParameters = patch => updateConfig({ parameters:{ ...parameters, ...patch } })
  const action = node.config.action
  if (action === 'http.request') return <>
    <Field label="URL" value={parameters.url || ''} onChange={value => updateParameters({ url:value })} />
    <label style={labelStyle}>Method</label>
    <select value={parameters.method || 'GET'} onChange={event => updateParameters({ method:event.target.value })} style={inputStyle}>
      {['GET','POST','PUT','PATCH','DELETE'].map(method => <option key={method}>{method}</option>)}
    </select>
    {parameters.method !== 'GET' && <Field label="Body" value={parameters.body || '{{input}}'} onChange={value => updateParameters({ body:value })} multiline />}
  </>
  if (action === 'email.send') return <>
    <Field label="To" value={parameters.to || ''} onChange={value => updateParameters({ to:value })} />
    <Field label="From" value={parameters.from || ''} onChange={value => updateParameters({ from:value })} />
    <Field label="Subject" value={parameters.subject || ''} onChange={value => updateParameters({ subject:value })} />
    <Field label="Message" value={parameters.text || ''} onChange={value => updateParameters({ text:value })} multiline />
  </>
  if (action === 'slack.message') return <>
    <Field label="Channel ID" value={parameters.channel || ''} onChange={value => updateParameters({ channel:value })} />
    <Field label="Message" value={parameters.text || ''} onChange={value => updateParameters({ text:value })} multiline />
  </>
  if (action === 'google_sheets.append') return <>
    <Field label="Spreadsheet ID" value={parameters.spreadsheet_id || ''} onChange={value => updateParameters({ spreadsheet_id:value })} />
    <Field label="Range" value={parameters.range || ''} onChange={value => updateParameters({ range:value })} />
    <Field label="Row value" value={parameters.values?.[0] || ''} onChange={value => updateParameters({ values:[value] })} />
  </>
  if (action === 'google_drive.create_file') return <>
    <Field label="File name" value={parameters.name || ''} onChange={value => updateParameters({ name:value })} />
    <Field label="Content" value={parameters.content || ''} onChange={value => updateParameters({ content:value })} multiline />
  </>
  if (action === 'database.select') return <>
    <Field label="Table" value={parameters.table || ''} onChange={value => updateParameters({ table:value })} />
    <Field label="Select columns" value={parameters.select || '*'} onChange={value => updateParameters({ select:value })} />
    <Field label="Limit" type="number" value={parameters.limit || 25} onChange={value => updateParameters({ limit:Number(value) })} />
  </>
  return <>
    <Field label="Table" value={parameters.table || ''} onChange={value => updateParameters({ table:value })} />
    <Field label="Column name" value={Object.keys(parameters.row || {})[0] || 'value'} onChange={value => {
      const currentValue = Object.values(parameters.row || {})[0] || '{{input}}'
      updateParameters({ row:{ [value]:currentValue } })
    }} />
    <Field label="Value" value={Object.values(parameters.row || {})[0] || '{{input}}'} onChange={value => {
      const column = Object.keys(parameters.row || {})[0] || 'value'
      updateParameters({ row:{ [column]:value } })
    }} />
  </>
}

function Field({ label, value, onChange, multiline = false, type = 'text' }) {
  return <>
    <label style={labelStyle}>{label}</label>
    {multiline
      ? <textarea value={value} onChange={event => onChange(event.target.value)} style={{ ...inputStyle, minHeight:74 }} />
      : <input type={type} value={value} onChange={event => onChange(event.target.value)} style={inputStyle} />}
  </>
}

const canvas = { background:'#11141C', border:'1px solid #2A2D3E', borderRadius:16, padding:28, overflowX:'auto', minHeight:260, display:'flex', alignItems:'center' }
const nodeCard = { minWidth:155, display:'flex', alignItems:'center', gap:10, background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:12, padding:12, cursor:'pointer' }
const inspector = { background:'#1A1D27', border:'1px solid #2A2D3E', borderRadius:14, padding:18 }
const inputStyle = { width:'100%', boxSizing:'border-box', background:'#0F1117', border:'1px solid #2A2D3E', color:'white', padding:'9px 11px', borderRadius:8, marginBottom:12, fontSize:12 }
const titleInput = { width:'100%', background:'transparent', border:'none', color:'white', fontSize:22, fontWeight:600, outline:'none' }
const descriptionInput = { width:'100%', background:'transparent', border:'none', color:'#9CA3AF', fontSize:13, outline:'none', marginTop:4 }
const labelStyle = { display:'block', color:'#9CA3AF', fontSize:11, marginBottom:5 }
const primaryButton = { display:'inline-flex', alignItems:'center', gap:6, background:'#7C3AED', border:'none', color:'white', borderRadius:9, padding:'9px 13px', cursor:'pointer', fontSize:12, fontWeight:600 }
const secondaryButton = { ...primaryButton, background:'#1F2937', border:'1px solid #374151' }
const toolButton = { ...secondaryButton, padding:'7px 11px' }
const dangerButton = { width:'100%', background:'#3F1518', border:'1px solid #7F1D1D', color:'#FCA5A5', borderRadius:8, padding:8, cursor:'pointer', marginTop:8 }
const iconButton = { background:'transparent', border:'none', color:'#9CA3AF', cursor:'pointer' }
const errorBox = { background:'#2D1515', border:'1px solid #EF4444', color:'#FCA5A5', padding:11, borderRadius:9, marginBottom:12, fontSize:12 }
const statusPill = { color:'#C4B5FD', background:'#4C1D9555', border:'1px solid #6D28D955', padding:'6px 10px', borderRadius:999, fontSize:11, textTransform:'uppercase' }
const resultBox = { marginTop:12, background:'#0F1117', border:'1px solid #2A2D3E', borderRadius:9, padding:12, color:'#D1D5DB', fontSize:11, overflow:'auto' }
const copilotPanel = { background:'linear-gradient(135deg,#151C22,#14261F)', border:'1px solid #24533D', borderRadius:16, padding:18, marginBottom:16 }
const copilotIcon = { width:32, height:32, display:'grid', placeItems:'center', borderRadius:9, color:'#6EE7B7', background:'#064E3B' }
const aiBadge = { color:'#A7F3D0', background:'#065F4655', border:'1px solid #05966966', borderRadius:999, padding:'4px 7px', fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em' }
const copilotSummary = { display:'flex', alignItems:'flex-start', gap:8, marginTop:12, paddingTop:12, borderTop:'1px solid #24533D', color:'#B6CFC2', fontSize:11, lineHeight:1.5 }
const readinessReady = { display:'flex', alignItems:'center', gap:8, color:'#A7F3D0', background:'#052E2455', border:'1px solid #065F46', borderRadius:9, padding:'9px 11px', marginBottom:12, fontSize:11 }
const readinessWarning = { ...readinessReady, color:'#FDE68A', background:'#42200655', borderColor:'#92400E' }

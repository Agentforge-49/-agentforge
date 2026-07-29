import { useCallback, useEffect, useState } from 'react'
import { Network, Pause, Play, Plus, Send, Trash2, Users } from 'lucide-react'

import {
  activateMultiAgentSystem,
  createMultiAgentSystem,
  deleteMultiAgentSystem,
  getAgents,
  getMultiAgentRun,
  getMultiAgentSystems,
  pauseMultiAgentSystem,
  runMultiAgentSystem,
} from '../lib/api'

const panel = {
  background:'#13151C',
  border:'1px solid #232633',
  borderRadius:14,
  padding:18,
}
const field = {
  width:'100%',
  boxSizing:'border-box',
  color:'#F4F4F5',
  background:'#0D0F15',
  border:'1px solid #2B2E3D',
  borderRadius:8,
  padding:'9px 11px',
}
const button = {
  border:0,
  borderRadius:8,
  padding:'9px 13px',
  background:'#7C3AED',
  color:'white',
  cursor:'pointer',
  display:'inline-flex',
  alignItems:'center',
  gap:7,
}

export default function MultiAgents() {
  const [systems, setSystems] = useState([])
  const [agents, setAgents] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState({
    name:'',
    description:'',
    strategy:'router',
    aggregation_strategy:'concatenate',
    supervisor_agent_id:'',
    max_delegations:6,
    max_parallel:3,
    max_depth:2,
    timeout_seconds:180,
    members:[],
  })
  const [input, setInput] = useState('')
  const [runDetail, setRunDetail] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const [systemData, agentData] = await Promise.all([
        getMultiAgentSystems(),
        getAgents(),
      ])
      setSystems(systemData)
      setAgents(agentData.filter(agent => agent.status === 'active' && agent.published_version_id))
      setSelectedId(current => current || systemData[0]?.id || '')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const initial = setTimeout(load, 0)
    const timer = setInterval(load, 5000)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [load])

  const selected = systems.find(system => system.id === selectedId)

  const updateMember = (agentId, checked) => {
    setForm(current => ({
      ...current,
      members:checked
        ? [...current.members, { agent_id:agentId, role:'worker', route_keywords:[] }]
        : current.members.filter(member => member.agent_id !== agentId),
    }))
  }

  const setKeywords = (agentId, value) => {
    setForm(current => ({
      ...current,
      members:current.members.map(member => member.agent_id === agentId
        ? { ...member, route_keywords:value.split(',').map(item => item.trim()).filter(Boolean) }
        : member),
    }))
  }

  const runAction = async (key, action) => {
    setBusy(key)
    try {
      await action()
      setError('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const create = event => {
    event.preventDefault()
    runAction('create', async () => {
      const created = await createMultiAgentSystem({
        ...form,
        supervisor_agent_id:form.supervisor_agent_id || null,
        max_delegations:Number(form.max_delegations),
        max_parallel:Number(form.max_parallel),
        max_depth:Number(form.max_depth),
        timeout_seconds:Number(form.timeout_seconds),
      })
      setSelectedId(created.id)
      setForm({
        name:'',
        description:'',
        strategy:'router',
        aggregation_strategy:'concatenate',
        supervisor_agent_id:'',
        max_delegations:6,
        max_parallel:3,
        max_depth:2,
        timeout_seconds:180,
        members:[],
      })
    })
  }

  const startRun = async event => {
    event.preventDefault()
    setBusy('run')
    try {
      const result = await runMultiAgentSystem(
        selected.id,
        input,
        `dashboard:${selected.id}:${crypto.randomUUID()}`,
      )
      setRunDetail({ ...(result.run || {}), tasks:[] })
      setInput('')
      setError('')
      const runId = result.run?.id
      if (runId) {
        const poll = setInterval(async () => {
          try {
            const detail = await getMultiAgentRun(runId)
            setRunDetail(detail)
            if (['completed', 'failed', 'cancelled'].includes(detail.status)) {
              clearInterval(poll)
              setBusy('')
              load()
            }
          } catch (err) {
            clearInterval(poll)
            setError(err.message)
            setBusy('')
          }
        }, 1500)
      }
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  return (
    <div style={{ maxWidth:1200, margin:'0 auto' }}>
      <div style={{ marginBottom:22 }}>
        <h1 style={{ fontSize:25, margin:'0 0 5px' }}>Multi-agent systems</h1>
        <p style={{ margin:0, color:'#8B8FA3', fontSize:13 }}>
          Route, parallelize, and supervise specialized agents with hard delegation and loop limits.
        </p>
      </div>
      {error && <div style={{ ...panel, borderColor:'#7F1D1D', color:'#FCA5A5', marginBottom:15 }}>{error}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'380px 1fr', gap:18 }}>
        <div>
          <form onSubmit={create} style={{ ...panel, marginBottom:14 }}>
            <h3 style={{ margin:'0 0 13px', fontSize:15 }}>Build a team</h3>
            <input style={field} placeholder="Team name" value={form.name}
              onChange={event => setForm({ ...form, name:event.target.value })} />
            <textarea style={{ ...field, marginTop:8, minHeight:60 }} placeholder="What this team handles"
              value={form.description}
              onChange={event => setForm({ ...form, description:event.target.value })} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8 }}>
              <select style={field} value={form.strategy}
                onChange={event => setForm({ ...form, strategy:event.target.value })}>
                <option value="router">Keyword router</option>
                <option value="parallel">Parallel workers</option>
                <option value="supervisor">AI supervisor</option>
              </select>
              <select style={field} value={form.aggregation_strategy}
                onChange={event => setForm({ ...form, aggregation_strategy:event.target.value })}>
                <option value="concatenate">Combine outputs</option>
                <option value="vote">Majority vote</option>
                <option value="supervisor">Supervisor synthesis</option>
              </select>
            </div>
            {(form.strategy === 'supervisor' || form.aggregation_strategy === 'supervisor') && (
              <select style={{ ...field, marginTop:8 }} value={form.supervisor_agent_id}
                onChange={event => setForm({ ...form, supervisor_agent_id:event.target.value })}>
                <option value="">Choose supervisor</option>
                {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6, marginTop:8 }}>
              {[
                ['max_delegations', 'Tasks', 1, 20],
                ['max_parallel', 'Parallel', 1, 8],
                ['max_depth', 'Depth', 1, 5],
                ['timeout_seconds', 'Seconds', 15, 900],
              ].map(([name, label, min, max]) => (
                <label key={name} style={{ fontSize:10, color:'#8B8FA3' }}>
                  {label}
                  <input style={{ ...field, marginTop:4, padding:'7px 5px' }} type="number"
                    min={min} max={max} value={form[name]}
                    onChange={event => setForm({ ...form, [name]:event.target.value })} />
                </label>
              ))}
            </div>
            <div style={{ color:'#8B8FA3', fontSize:11, textTransform:'uppercase', margin:'14px 0 7px' }}>Workers</div>
            {agents.map(agent => {
              const member = form.members.find(item => item.agent_id === agent.id)
              return (
                <div key={agent.id} style={{ background:'#0D0F15', borderRadius:8, padding:9, marginBottom:7 }}>
                  <label style={{ display:'flex', gap:8, fontSize:12 }}>
                    <input type="checkbox" checked={Boolean(member)}
                      onChange={event => updateMember(agent.id, event.target.checked)} />
                    {agent.name}
                  </label>
                  {member && (
                    <input style={{ ...field, marginTop:7, fontSize:11 }}
                      placeholder="Routing keywords: support, billing"
                      value={member.route_keywords.join(', ')}
                      onChange={event => setKeywords(agent.id, event.target.value)} />
                  )}
                </div>
              )
            })}
            {!agents.length && <p style={{ color:'#FCA5A5', fontSize:12 }}>Publish an active agent first.</p>}
            <button style={{ ...button, marginTop:8 }} disabled={busy === 'create' || !form.members.length}>
              <Plus size={14} /> Create draft
            </button>
          </form>

          <div style={panel}>
            <div style={{ color:'#8B8FA3', fontSize:11, textTransform:'uppercase', marginBottom:9 }}>Teams</div>
            {systems.map(system => (
              <button key={system.id} onClick={() => { setSelectedId(system.id); setRunDetail(null) }}
                style={{
                  width:'100%',
                  textAlign:'left',
                  color:'#F4F4F5',
                  background:selectedId === system.id ? 'rgba(124,58,237,.12)' : '#0D0F15',
                  border:`1px solid ${selectedId === system.id ? '#7C3AED' : '#232633'}`,
                  padding:11,
                  borderRadius:9,
                  marginBottom:7,
                  cursor:'pointer',
                }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span><Network size={13} style={{ marginRight:7 }} />{system.name}</span>
                  <span style={{ color:system.status === 'active' ? '#86EFAC' : '#A1A1AA', fontSize:10 }}>{system.status}</span>
                </div>
                <div style={{ color:'#71717A', fontSize:11, marginTop:5 }}>
                  {system.members.length} workers · {system.strategy}
                </div>
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <div style={{ display:'grid', gap:14, alignContent:'start' }}>
            <div style={panel}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
                <div>
                  <h2 style={{ margin:0, fontSize:19 }}>{selected.name}</h2>
                  <p style={{ color:'#8B8FA3', fontSize:12 }}>{selected.description || 'No description'}</p>
                  <div style={{ color:'#C4B5FD', fontSize:12 }}>
                    {selected.strategy} → {selected.aggregation_strategy} ·
                    limit {selected.max_delegations} tasks · {selected.max_parallel} parallel · depth {selected.max_depth}
                  </div>
                </div>
                <div style={{ display:'flex', gap:7, alignItems:'start' }}>
                  {selected.status === 'active' ? (
                    <button style={{ ...button, background:'#27272A' }}
                      onClick={() => runAction('status', () => pauseMultiAgentSystem(selected.id))}>
                      <Pause size={14} /> Pause
                    </button>
                  ) : (
                    <button style={button}
                      onClick={() => runAction('status', () => activateMultiAgentSystem(selected.id))}>
                      <Play size={14} /> Activate
                    </button>
                  )}
                  <button style={{ ...button, background:'#3F1D2B', color:'#FDA4AF' }}
                    onClick={() => runAction('delete', async () => {
                      await deleteMultiAgentSystem(selected.id)
                      setSelectedId('')
                    })}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
                {selected.members.map(member => (
                  <span key={member.id} style={{ background:'#0D0F15', border:'1px solid #2B2E3D', borderRadius:20, padding:'6px 10px', fontSize:12 }}>
                    <Users size={12} style={{ marginRight:5 }} /> {member.agent?.name}
                    {member.route_keywords.length ? ` · ${member.route_keywords.join(', ')}` : ''}
                  </span>
                ))}
              </div>
            </div>

            <form onSubmit={startRun} style={panel}>
              <h3 style={{ margin:'0 0 10px', fontSize:15 }}>Run the team</h3>
              <textarea style={{ ...field, minHeight:110 }} value={input}
                placeholder={selected.status === 'active' ? 'Give the team a task…' : 'Activate the team before running it'}
                onChange={event => setInput(event.target.value)} />
              <button style={{ ...button, marginTop:10 }} disabled={selected.status !== 'active' || busy === 'run'}>
                <Send size={14} /> {busy === 'run' ? 'Team is working…' : 'Start run'}
              </button>
            </form>

            {runDetail && (
              <div style={panel}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <h3 style={{ margin:0, fontSize:15 }}>Live run</h3>
                  <span style={{ color:runDetail.status === 'completed' ? '#86EFAC' : '#C4B5FD', fontSize:12 }}>
                    {runDetail.status}
                  </span>
                </div>
                {(runDetail.multi_agent_tasks || []).map(task => (
                  <div key={task.id} style={{ borderLeft:'2px solid #7C3AED', marginTop:12, paddingLeft:12 }}>
                    <div style={{ fontSize:12 }}>{task.agents?.name} · depth {task.depth} · {task.status}</div>
                    <div style={{ color:'#71717A', fontSize:11 }}>{task.routing_reason}</div>
                  </div>
                ))}
                {runDetail.output_text && (
                  <pre style={{ whiteSpace:'pre-wrap', background:'#0D0F15', borderRadius:9, padding:13, color:'#D4D4D8', fontFamily:'inherit', fontSize:13 }}>
                    {runDetail.output_text}
                  </pre>
                )}
                {runDetail.error_message && <p style={{ color:'#FCA5A5' }}>{runDetail.error_message}</p>}
              </div>
            )}

            <div style={panel}>
              <h3 style={{ margin:'0 0 10px', fontSize:15 }}>Recent runs</h3>
              {(selected.runs || []).map(run => (
                <button key={run.id} onClick={async () => setRunDetail(await getMultiAgentRun(run.id))}
                  style={{ width:'100%', display:'flex', justifyContent:'space-between', background:'transparent', color:'#D4D4D8', border:0, borderBottom:'1px solid #232633', padding:'10px 0', cursor:'pointer' }}>
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:420 }}>{run.input_text}</span>
                  <span style={{ color:'#8B8FA3' }}>{run.status} · {run.delegation_count} tasks</span>
                </button>
              ))}
              {!selected.runs?.length && <p style={{ color:'#71717A', fontSize:12 }}>No runs yet.</p>}
            </div>
          </div>
        ) : (
          <div style={{ ...panel, display:'grid', placeItems:'center', minHeight:250, color:'#71717A' }}>
            Create a team to begin.
          </div>
        )}
      </div>
    </div>
  )
}

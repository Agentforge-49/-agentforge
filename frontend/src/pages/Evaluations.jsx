import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, FlaskConical, GitCompareArrows, Plus, Rocket, Trash2, XCircle } from 'lucide-react'

import {
  createEvaluationSuite,
  deleteEvaluationSuite,
  getAgents,
  getAgentVersions,
  getEvaluationRun,
  getEvaluationSuites,
  promoteEvaluationRun,
  runEvaluationSuite,
} from '../lib/api'

const blankCase = () => ({
  name:'',
  input_text:'',
  expected_output:'',
  assertion_type:'contains',
  weight:1,
})

export default function Evaluations() {
  const [suites, setSuites] = useState([])
  const [agents, setAgents] = useState([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name:'',
    description:'',
    agent_id:'',
    gate_threshold:80,
    cases:[blankCase()],
  })
  const [comparison, setComparison] = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const [suiteData, agentData] = await Promise.all([
        getEvaluationSuites(),
        getAgents(),
      ])
      setSuites(suiteData)
      setAgents(agentData)
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

  const updateCase = (index, field, value) => {
    setForm(current => ({
      ...current,
      cases:current.cases.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]:value } : item),
    }))
  }

  const submit = async event => {
    event.preventDefault()
    setBusy('create')
    try {
      await createEvaluationSuite(form)
      setForm({
        name:'',
        description:'',
        agent_id:'',
        gate_threshold:80,
        cases:[blankCase()],
      })
      setCreating(false)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const prepareComparison = async suite => {
    setBusy(suite.id)
    try {
      const data = await getAgentVersions(suite.agent_id)
      if (data.versions.length < 2) throw new Error('Publish at least two agent versions to compare them')
      setComparison({
        suiteId:suite.id,
        versions:data.versions,
        baseline:data.versions[1].id,
        candidate:data.versions[0].id,
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const runComparison = async () => {
    setBusy(comparison.suiteId)
    try {
      const result = await runEvaluationSuite(
        comparison.suiteId,
        comparison.baseline,
        comparison.candidate,
      )
      setComparison(null)
      await load()
      setSelectedRun(await getEvaluationRun(result.run.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const inspectRun = async id => {
    setBusy(id)
    try {
      setSelectedRun(await getEvaluationRun(id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const promote = async id => {
    setBusy(id)
    try {
      await promoteEvaluationRun(id)
      setSelectedRun(await getEvaluationRun(id))
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const removeSuite = async id => {
    if (!window.confirm('Delete this evaluation suite and its run history?')) return
    setBusy(id)
    try {
      await deleteEvaluationSuite(id)
      if (selectedRun?.suite_id === id) setSelectedRun(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:600, marginBottom:5 }}>Evaluations</h1>
          <p style={{ color:'#9CA3AF', fontSize:13 }}>Compare immutable agent versions against weighted datasets before promotion.</p>
        </div>
        <button onClick={() => setCreating(value => !value)} style={primaryButton}>
          <Plus size={14} /> New suite
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {creating && <form onSubmit={submit} style={{ ...panel, marginBottom:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 150px', gap:10 }}>
          <Field label="Suite name">
            <input required value={form.name} onChange={event => setForm({ ...form, name:event.target.value })} style={inputStyle} />
          </Field>
          <Field label="Agent">
            <select required value={form.agent_id} onChange={event => setForm({ ...form, agent_id:event.target.value })} style={inputStyle}>
              <option value="">Choose an agent</option>
              {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </Field>
          <Field label="Gate threshold">
            <input type="number" min="0" max="100" value={form.gate_threshold}
              onChange={event => setForm({ ...form, gate_threshold:Number(event.target.value) })} style={inputStyle} />
          </Field>
        </div>
        <Field label="Description">
          <input value={form.description} onChange={event => setForm({ ...form, description:event.target.value })} style={inputStyle} />
        </Field>

        <div style={{ display:'flex', justifyContent:'space-between', marginTop:14, alignItems:'center' }}>
          <h3 style={{ fontSize:12 }}>Dataset cases</h3>
          <button type="button" onClick={() => setForm({ ...form, cases:[...form.cases, blankCase()] })} style={secondaryButton}>
            <Plus size={12} /> Add case
          </button>
        </div>
        <div style={{ display:'grid', gap:9, marginTop:9 }}>
          {form.cases.map((item, index) => <div key={index} style={caseEditor}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 150px 70px 30px', gap:7 }}>
              <input required placeholder="Case name" value={item.name}
                onChange={event => updateCase(index, 'name', event.target.value)} style={inputStyle} />
              <select value={item.assertion_type} onChange={event => updateCase(index, 'assertion_type', event.target.value)} style={inputStyle}>
                <option value="contains">Contains</option>
                <option value="exact">Exact match</option>
                <option value="not_contains">Must not contain</option>
                <option value="json_equals">JSON equals</option>
              </select>
              <input type="number" min="0.01" max="100" step="0.01" title="Weight" value={item.weight}
                onChange={event => updateCase(index, 'weight', Number(event.target.value))} style={inputStyle} />
              <button type="button" disabled={form.cases.length === 1}
                onClick={() => setForm({ ...form, cases:form.cases.filter((_, itemIndex) => itemIndex !== index) })}
                style={iconButton}><Trash2 size={13} /></button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginTop:7 }}>
              <textarea required placeholder="Input sent to both versions" value={item.input_text}
                onChange={event => updateCase(index, 'input_text', event.target.value)} style={textareaStyle} />
              <textarea required placeholder="Expected output" value={item.expected_output}
                onChange={event => updateCase(index, 'expected_output', event.target.value)} style={textareaStyle} />
            </div>
          </div>)}
        </div>
        <button disabled={busy === 'create'} type="submit" style={{ ...primaryButton, marginTop:12 }}>
          <FlaskConical size={13} /> Save evaluation suite
        </button>
      </form>}

      {!suites.length ? <div style={emptyState}>
        <FlaskConical size={40} color="#4B5563" />
        <h2 style={{ fontSize:16, marginTop:10 }}>No evaluation suites yet</h2>
        <p style={{ color:'#8B8FA3', fontSize:11, marginTop:5 }}>Create a reusable dataset to compare agent versions.</p>
      </div> : <div style={{ display:'grid', gridTemplateColumns:selectedRun ? 'minmax(0,1fr) minmax(400px,.9fr)' : '1fr', gap:14 }}>
        <div style={{ display:'grid', gap:11, alignSelf:'start' }}>
          {suites.map(suite => {
            const latest = suite.evaluation_runs?.[0]
            return <div key={suite.id} style={panel}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <h2 style={{ fontSize:15 }}>{suite.name}</h2>
                    <span style={badge}>{suite.evaluation_cases.length} cases</span>
                  </div>
                  <p style={{ color:'#8B8FA3', fontSize:11, marginTop:5 }}>
                    {suite.agents?.name} · gate {suite.gate_threshold}%
                  </p>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button disabled={busy === suite.id} onClick={() => prepareComparison(suite)} style={secondaryButton}>
                    <GitCompareArrows size={12} /> Compare
                  </button>
                  <button disabled={busy === suite.id} onClick={() => removeSuite(suite.id)} style={iconButton}><Trash2 size={13} /></button>
                </div>
              </div>
              {latest ? <button onClick={() => inspectRun(latest.id)} style={runRow}>
                <span style={{ textTransform:'capitalize' }}>{latest.status}</span>
                <span>Baseline {latest.baseline_score ?? '—'}%</span>
                <span>Candidate {latest.candidate_score ?? '—'}%</span>
                <span style={{ color:latest.gate_passed ? '#34D399' : latest.gate_passed === false ? '#F87171' : '#9CA3AF' }}>
                  {latest.gate_passed ? 'Gate passed' : latest.gate_passed === false ? 'Gate failed' : 'Pending'}
                </span>
              </button> : <div style={{ color:'#6B7280', fontSize:10, marginTop:12 }}>No comparison runs yet.</div>}
            </div>
          })}
        </div>

        {selectedRun && <RunDetails run={selectedRun} busy={busy} onClose={() => setSelectedRun(null)} onPromote={promote} />}
      </div>}

      {comparison && <div style={modalBackdrop}>
        <div style={{ ...panel, width:460 }}>
          <h2 style={{ fontSize:17 }}>Compare versions</h2>
          <p style={{ color:'#8B8FA3', fontSize:11, margin:'5px 0 14px' }}>Every case runs against both immutable configurations.</p>
          <Field label="Baseline version">
            <select value={comparison.baseline} onChange={event => setComparison({ ...comparison, baseline:event.target.value })} style={inputStyle}>
              {comparison.versions.map(version => <option key={version.id} value={version.id}>v{version.version_number} · {version.model}</option>)}
            </select>
          </Field>
          <Field label="Candidate version">
            <select value={comparison.candidate} onChange={event => setComparison({ ...comparison, candidate:event.target.value })} style={inputStyle}>
              {comparison.versions.map(version => <option key={version.id} value={version.id}>v{version.version_number} · {version.model}</option>)}
            </select>
          </Field>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button onClick={runComparison} style={primaryButton}><GitCompareArrows size={13} /> Run comparison</button>
            <button onClick={() => setComparison(null)} style={secondaryButton}>Cancel</button>
          </div>
        </div>
      </div>}
    </div>
  )
}

function RunDetails({ run, busy, onClose, onPromote }) {
  const grouped = new Map()
  for (const result of run.evaluation_results || []) {
    const item = grouped.get(result.case_id) || { testCase:result.evaluation_cases }
    item[result.variant] = result
    grouped.set(result.case_id, item)
  }
  return <div style={{ ...panel, position:'sticky', top:0, alignSelf:'start' }}>
    <div style={{ display:'flex', justifyContent:'space-between' }}>
      <div>
        <h2 style={{ fontSize:16 }}>{run.evaluation_suites?.name}</h2>
        <p style={{ color:'#8B8FA3', fontSize:10, marginTop:4, textTransform:'capitalize' }}>{run.status}</p>
      </div>
      <button onClick={onClose} style={iconButton}>×</button>
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
      <Score label={`Baseline v${run.baseline?.version_number ?? ''}`} value={run.baseline_score} />
      <Score label={`Candidate v${run.candidate?.version_number ?? ''}`} value={run.candidate_score} passed={run.gate_passed} />
    </div>
    <div style={{ maxHeight:430, overflow:'auto', marginTop:12 }}>
      {[...grouped.values()].map(item => <div key={item.testCase?.name} style={resultCard}>
        <strong style={{ fontSize:11 }}>{item.testCase?.name}</strong>
        <div style={{ color:'#6B7280', fontSize:9, marginTop:3 }}>{item.testCase?.assertion_type} · weight {item.testCase?.weight}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7, marginTop:8 }}>
          <Result variant="Baseline" result={item.baseline} />
          <Result variant="Candidate" result={item.candidate} />
        </div>
      </div>)}
    </div>
    {run.status === 'completed' && run.gate_passed && !run.promoted_at &&
      <button disabled={busy === run.id} onClick={() => onPromote(run.id)} style={{ ...primaryButton, width:'100%', marginTop:12 }}>
        <Rocket size={13} /> Promote candidate through gate
      </button>}
    {run.promoted_at && <div style={{ color:'#34D399', fontSize:11, marginTop:12 }}>
      <CheckCircle2 size={13} style={{ verticalAlign:'middle', marginRight:5 }} /> Candidate promoted
    </div>}
  </div>
}

function Score({ label, value, passed }) {
  return <div style={{ background:'#101219', borderRadius:9, padding:11 }}>
    <div style={{ color:'#8B8FA3', fontSize:9 }}>{label}</div>
    <div style={{ fontSize:24, fontWeight:600, color:passed === true ? '#34D399' : passed === false ? '#F87171' : 'white' }}>
      {value ?? '—'}{value !== null && value !== undefined ? '%' : ''}
    </div>
  </div>
}

function Result({ variant, result }) {
  if (!result) return <div style={{ ...resultBox, color:'#6B7280' }}>{variant}: pending</div>
  return <div style={resultBox}>
    <div style={{ color:result.passed ? '#34D399' : '#F87171', fontSize:10, display:'flex', alignItems:'center', gap:4 }}>
      {result.passed ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {variant} · {result.score}%
    </div>
    <div style={{ color:'#9CA3AF', fontSize:9, marginTop:5, whiteSpace:'pre-wrap', maxHeight:80, overflow:'auto' }}>
      {result.actual_output || result.error_message || 'No output'}
    </div>
  </div>
}

function Field({ label, children }) {
  return <label style={{ display:'grid', gap:5, color:'#8B8FA3', fontSize:10 }}>{label}{children}</label>
}

const panel = { background:'#171A23', border:'1px solid #292D3D', borderRadius:13, padding:16 }
const inputStyle = { width:'100%', boxSizing:'border-box', background:'#101219', border:'1px solid #303447', borderRadius:8, color:'#E5E7EB', padding:'9px 10px', fontSize:11 }
const textareaStyle = { ...inputStyle, minHeight:70, resize:'vertical' }
const caseEditor = { background:'#101219', border:'1px solid #292D3D', borderRadius:9, padding:9 }
const buttonBase = { display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, borderRadius:8, padding:'9px 12px', cursor:'pointer', fontSize:11 }
const primaryButton = { ...buttonBase, background:'#6D28D9', border:'1px solid #8B5CF6', color:'white' }
const secondaryButton = { ...buttonBase, background:'#202431', border:'1px solid #34394D', color:'#D1D5DB' }
const iconButton = { background:'transparent', border:'none', color:'#8B8FA3', cursor:'pointer', padding:7 }
const badge = { background:'#292D3D', borderRadius:999, color:'#A78BFA', padding:'3px 7px', fontSize:9 }
const errorBox = { background:'#2D1515', border:'1px solid #7F1D1D', borderRadius:9, padding:10, color:'#FCA5A5', fontSize:11, marginBottom:12 }
const emptyState = { ...panel, borderStyle:'dashed', textAlign:'center', padding:55 }
const runRow = { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, width:'100%', background:'#101219', border:'1px solid #292D3D', borderRadius:8, color:'#C7CAD4', padding:'10px', marginTop:12, cursor:'pointer', textAlign:'left', fontSize:10 }
const modalBackdrop = { position:'fixed', inset:0, background:'rgba(5,7,12,.78)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:20 }
const resultCard = { borderTop:'1px solid #292D3D', padding:'10px 0' }
const resultBox = { background:'#101219', borderRadius:8, padding:8, minWidth:0 }

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, ArrowRight, BrainCircuit, Check, CheckCircle2, Clipboard,
  CornerDownLeft, Database, GitBranch, MessageSquarePlus, Pencil, PlugZap,
  RotateCcw, Send, ShieldCheck, Sparkles, Square,
  Wrench, X, Zap,
} from 'lucide-react'

import BrandLogo from '../components/BrandLogo'
import {
  applyCopilotProposal, createCopilotThread, getAgents, getCopilotThread,
  getCopilotThreads, getWorkspaceBootstrap, rejectCopilotProposal,
  streamCopilotMessage,
} from '../lib/api'
import { useNavigate } from '../lib/router.jsx'
import './Copilot.css'

const MODES = [
  ['ask', BrainCircuit, 'Ask', 'Ask anything or understand the product'],
  ['build', GitBranch, 'Build', 'Design an approval-ready operation'],
  ['diagnose', Activity, 'Diagnose', 'Investigate a failed or slow run'],
  ['improve', Zap, 'Improve', 'Find quality, speed, and cost gains'],
]

const STARTERS = [
  { mode:'build', eyebrow:'BUILD AN OPERATION', text:'Design support triage from inbox to approved reply' },
  { mode:'diagnose', eyebrow:'RECOVER A RUN', text:'Find the cause of my latest failure and give me the fix' },
  { mode:'improve', eyebrow:'OPTIMIZE', text:'Review my workspace and recommend the highest-impact improvement' },
  { mode:'ask', eyebrow:'UNDERSTAND', text:'Explain what AgentForge can do for my business' },
]

function requestedPrompt() {
  const value = new URLSearchParams(window.location.search).get('prompt') || ''
  return value.slice(0, 4000)
}

function suggestedDestinations(content) {
  const value = String(content || '').toLowerCase()
  const choices = []
  if (/(fail|error|trace|retry|run)/.test(value)) choices.push(['Inspect Activity', '/observability'])
  if (/(connect|credential|oauth|integration|\bapp\b)/.test(value)) choices.push(['Open Apps', '/apps'])
  if (/(workflow|automation|canvas|\bbuild\b)/.test(value)) choices.push(['Open Build', '/studio'])
  if (/(knowledge|document|citation)/.test(value)) choices.push(['Open Knowledge', '/knowledge'])
  if (/(approval|approve|review queue)/.test(value)) choices.push(['Review approvals', '/approvals'])
  return choices.slice(0, 2)
}

export default function Copilot() {
  const navigate = useNavigate()
  const abortRef = useRef(null)
  const endRef = useRef(null)
  const composerRef = useRef(null)
  const [threads, setThreads] = useState([])
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [proposals, setProposals] = useState([])
  const [workspace, setWorkspace] = useState(null)
  const [input, setInput] = useState(requestedPrompt)
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).get('mode') === 'build' ? 'build' : 'ask')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [status, setStatus] = useState('')
  const [route, setRoute] = useState('')
  const [error, setError] = useState('')
  const [agents, setAgents] = useState([])
  const [agentId, setAgentId] = useState('')

  const loadThreads = useCallback(async () => {
    try {
      const data = await getCopilotThreads()
      setThreads(data)
      return data
    } catch (err) { setError(err.message); return [] }
  }, [])

  const openThread = useCallback(async id => {
    try {
      setError('')
      const data = await getCopilotThread(id)
      setThread(data)
      setMessages(data.messages || [])
      setProposals(data.proposals || [])
    } catch (err) { setError(err.message) }
  }, [])

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      loadThreads().then(items => { if (active && items[0]) openThread(items[0].id) })
      getAgents().then(items => { if (active) setAgents(items.filter(item => item.status === 'active' && item.published_version_id)) }).catch(() => {})
      getWorkspaceBootstrap().then(data => { if (active) setWorkspace(data) }).catch(() => {})
    }, 0)
    return () => { active = false; clearTimeout(timer); abortRef.current?.abort() }
  }, [loadThreads, openThread])

  useEffect(() => { endRef.current?.scrollIntoView({ block:'end', behavior:streaming ? 'smooth' : 'auto' }) }, [messages, proposals, streamText, streaming])

  const newThread = async () => {
    try {
      const created = await createCopilotThread({ title:'New conversation' })
      setThreads(current => [created, ...current])
      setThread(created); setMessages([]); setProposals([]); setError(''); setMode('ask')
    } catch (err) { setError(err.message) }
  }

  const newAgentChat = async () => {
    if (!agentId) return
    try {
      const selected = agents.find(item => item.id === agentId)
      const created = await createCopilotThread({ title:`Chat with ${selected?.name || 'agent'}`, mode:'agent_chat', agent_id:agentId })
      setThreads(current => [created, ...current]); setThread(created); setMessages([]); setProposals([]); setError('')
    } catch (err) { setError(err.message) }
  }

  const send = async value => {
    const message = String(value ?? input).trim()
    if (!message || streaming) return
    let activeThread = thread
    try {
      if (!activeThread) {
        activeThread = await createCopilotThread({ title:message.slice(0, 80) })
        setThread(activeThread)
        setThreads(current => [activeThread, ...current])
      }
      const optimistic = { id:`local-${crypto.randomUUID()}`, role:'user', content:message }
      setMessages(current => [...current, optimistic])
      setInput(''); setError(''); setStreamText(''); setStreaming(true); setRoute(''); setStatus('Reading the safe workspace summary…')
      const controller = new AbortController()
      abortRef.current = controller
      await streamCopilotMessage(activeThread.id, message, {
        signal:controller.signal,
        onEvent(name, payload) {
          if (name === 'meta') {
            setRoute(payload.route || '')
            setStatus(payload.route === 'workspace' ? 'Using verified workspace context…' : payload.state === 'answering' ? 'Reasoning through the request…' : 'Reading the safe workspace summary…')
          }
          if (name === 'delta') setStreamText(current => current + (payload.text || ''))
          if (name === 'proposal') setProposals(current => [...current, payload])
          if (name === 'done') {
            setMessages(current => [...current.filter(item => item.id !== optimistic.id), optimistic, payload.message])
            setStreamText('')
            setStatus(payload.fallback ? 'Provider fallback used—your workspace was not changed.' : '')
          }
          if (name === 'error') throw new Error(payload.error || 'Copilot stopped unexpectedly')
        },
      })
      await loadThreads()
    } catch (err) {
      if (err.name !== 'AbortError') setError(`${err.message}. Your work was not changed.`)
    } finally {
      setStreaming(false); abortRef.current = null
    }
  }

  const decideProposal = async (proposal, decision) => {
    try {
      setError('')
      if (decision === 'apply') {
        const result = await applyCopilotProposal(proposal.id)
        setProposals(current => current.map(item => item.id === proposal.id ? { ...item, status:'applied' } : item))
        if (result.resource_type === 'workflow') navigate(`/workflows/${result.resource_id}/edit`)
      } else {
        await rejectCopilotProposal(proposal.id)
        setProposals(current => current.map(item => item.id === proposal.id ? { ...item, status:'rejected' } : item))
      }
    } catch (err) { setError(err.message) }
  }

  const editMessage = content => {
    setInput(content)
    composerRef.current?.focus()
  }
  const retryMessage = index => {
    const previous = messages.slice(0, index).reverse().find(item => item.role === 'user')
    if (previous) send(previous.content)
  }
  const proposalFor = messageId => proposals.filter(item => item.message_id === messageId)
  const counts = workspace?.counts || {}
  const currentMode = MODES.find(item => item[0] === mode) || MODES[0]

  return <div className="copilot-shell copilot-shell-simple">
    <main className="copilot-conversation">
      <header className="copilot-header">
        <div><span><Sparkles size={13} /> AgentForge intelligence</span><h1>{thread?.title || 'Design, diagnose, and improve anything'}</h1></div>
        <div className="copilot-header-actions">
          <label><span className="sr-only">Open conversation</span><select aria-label="Open conversation" value={thread?.id || ''} onChange={event => event.target.value && openThread(event.target.value)}><option value="">Recent conversations</option>{threads.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <button onClick={newThread}><MessageSquarePlus size={14} /> New</button>
          <div className="copilot-header-status"><i /><span><strong>Connected</strong><small>{workspace?.features?.copilot?.model || 'Local guidance ready'}</small></span></div>
        </div>
      </header>
      {error && <div className="copilot-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}

      <section className="copilot-messages" aria-live="polite">
        {!messages.length && !streaming && <div className="copilot-welcome">
          <div className="copilot-welcome-mark"><BrandLogo size={58} showWordmark={false} /></div>
          <span>YOUR AI OPERATIONS PARTNER</span>
          <h2>Bring an outcome.<br />Leave with a working system.</h2>
          <p>Ask any question, inspect your workspace, diagnose a run, or describe a complete operation. Copilot answers directly and turns build requests into visible, approval-ready proposals.</p>
          <div className="copilot-starters">{STARTERS.map(starter => <button key={starter.text} onClick={() => { setMode(starter.mode); send(starter.text) }}><small>{starter.eyebrow}</small><strong>{starter.text}</strong><CornerDownLeft size={14} /></button>)}</div>
          <div className="copilot-safety-line"><Check size={13} /> Reads safe metadata <i /> <Check size={13} /> Never sees secrets <i /> <Check size={13} /> You approve every change</div>
        </div>}

        {messages.map((message, index) => <article key={message.id} className={`copilot-message copilot-message-${message.role}`}>
          <div className="copilot-message-avatar">{message.role === 'assistant' ? <BrandLogo size={23} showWordmark={false} /> : 'YOU'}</div>
          <div className="copilot-message-body"><div className="copilot-message-meta"><strong>{message.role === 'assistant' ? 'AgentForge Copilot' : 'You'}</strong>{message.generation?.model && <span>{message.generation.model === 'agentforge-instant' ? 'Instant workspace answer' : message.generation.model}</span>}</div><p>{message.content}</p>
            <div className="copilot-message-actions">
              {message.role === 'assistant' ? <><button onClick={() => navigator.clipboard.writeText(message.content)}><Clipboard size={12} /> Copy</button><button onClick={() => retryMessage(index)}><RotateCcw size={12} /> Retry</button></> : <button onClick={() => editMessage(message.content)}><Pencil size={12} /> Edit and resend</button>}
            </div>
            {message.role === 'assistant' && !!suggestedDestinations(message.content).length && <div className="copilot-message-shortcuts">{suggestedDestinations(message.content).map(([label, path]) => <button key={path} onClick={() => navigate(path)}>{label} <ArrowRight size={11} /></button>)}</div>}
            {proposalFor(message.id).map(proposal => <div className="copilot-proposal" key={proposal.id}>
              <div className="copilot-proposal-head"><span><GitBranch size={13} /> Executable proposal</span><small>Nothing saved yet</small></div>
              <h3>{proposal.title}</h3><p>{proposal.summary}</p>
              <div className="copilot-proposal-flow">{(proposal.preview?.nodes || []).map((node, nodeIndex) => <span key={node.id}><i>{nodeIndex + 1}</i>{node.label}{nodeIndex < proposal.preview.nodes.length - 1 ? <ArrowRight size={12} /> : null}</span>)}</div>
              {!!proposal.preview?.requirements?.length && <div className="copilot-proposal-requirements">{proposal.preview.requirements.map(item => <span key={item.provider} className={item.connected ? 'ready' : ''}>{item.connected ? <CheckCircle2 size={12} /> : <PlugZap size={12} />}{item.label}: {item.connected ? 'ready' : 'connect first'}</span>)}</div>}
              {proposal.status === 'pending' ? <div className="copilot-proposal-actions"><button onClick={() => decideProposal(proposal, 'apply')}>Approve & open draft in Build <ArrowRight size={13} /></button><button onClick={() => decideProposal(proposal, 'reject')}>Reject</button></div> : <small className="copilot-proposal-state">Proposal {proposal.status}</small>}
            </div>)}
          </div>
        </article>)}

        {streaming && <article className="copilot-message copilot-message-assistant"><div className="copilot-message-avatar"><BrandLogo size={23} showWordmark={false} /></div><div className="copilot-message-body"><div className="copilot-message-meta"><strong>AgentForge Copilot</strong><span>{route === 'workspace' ? 'Instant workspace route' : 'Reasoning'}</span></div><p>{streamText || status}</p><div className="copilot-typing"><i /><i /><i /></div></div></article>}
        <div ref={endRef} />
      </section>

      <footer className="copilot-composer">
        <div className="copilot-modes" role="tablist" aria-label="Copilot mode">{MODES.map(([key, Icon, label]) => <button key={key} role="tab" aria-selected={mode === key} className={mode === key ? 'active' : ''} onClick={() => setMode(key)}><Icon size={13} /> {label}</button>)}</div>
        {status && !streaming && <div className="copilot-status">{status}</div>}
        <div className="copilot-input"><div><span>{currentMode[2]} mode</span><textarea ref={composerRef} value={input} onChange={event => setInput(event.target.value)} placeholder={currentMode[3]} rows="2" maxLength="4000" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} /></div>{streaming ? <button className="copilot-stop" onClick={() => abortRef.current?.abort()} aria-label="Stop response"><Square size={15} /></button> : <button onClick={() => send()} disabled={!input.trim()} aria-label="Send message"><Send size={16} /></button>}</div>
        <p><ShieldCheck size={11} /> Copilot prepares. You preview, test, and approve before activation.</p>
      </footer>
    </main>

    <aside className="copilot-intelligence" aria-label="Workspace intelligence">
      <header><span>Live context</span><h2>Workspace intelligence</h2><p>Safe metadata Copilot can use right now.</p></header>
      <div className="copilot-intel-grid"><article><strong>{counts.active_agents ?? '—'}</strong><span>Active agents</span></article><article><strong>{counts.active_workflows ?? '—'}</strong><span>Live workflows</span></article><article><strong>{counts.connected_apps ?? '—'}</strong><span>Connected apps</span></article><article className={counts.failed_runs ? 'attention' : ''}><strong>{counts.failed_runs ?? '—'}</strong><span>Failed runs</span></article></div>
      <section className="copilot-intel-section"><span>Copilot can inspect</span>{[[Activity,'Run traces','/observability'],[ShieldCheck,'Approval queue','/approvals'],[PlugZap,'App readiness','/apps'],[Database,'Knowledge sources','/knowledge']].map(([Icon,label,path]) => <button key={label} onClick={() => navigate(path)}><Icon size={14} /><strong>{label}</strong><ArrowRight size={13} /></button>)}</section>
      <section className="copilot-intel-section"><span>Operating contract</span><div className="copilot-contract"><CheckCircle2 size={14} /><p><strong>Read before reasoning</strong><small>Uses current safe workspace context.</small></p></div><div className="copilot-contract"><Wrench size={14} /><p><strong>Draft before mutation</strong><small>Changes appear as proposals.</small></p></div><div className="copilot-contract"><ShieldCheck size={14} /><p><strong>Approval before action</strong><small>External execution stays gated.</small></p></div></section>
      {!!agents.length && <section className="copilot-agent-direct"><span>Talk to a published agent</span><select value={agentId} onChange={event => setAgentId(event.target.value)} aria-label="Choose agent for agent chat"><option value="">Choose an agent…</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><button disabled={!agentId} onClick={newAgentChat}>Start agent chat <ArrowRight size={13} /></button></section>}
      <button className="copilot-open-build" onClick={() => navigate('/studio')}>Open visual Build <ArrowRight size={14} /></button>
    </aside>
  </div>
}

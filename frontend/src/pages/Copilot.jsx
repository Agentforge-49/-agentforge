import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot, Check, Clipboard, CornerDownLeft, MessageSquarePlus, RotateCcw,
  Search, Send, Sparkles, Square, WandSparkles, X,
} from 'lucide-react'

import {
  applyCopilotProposal, createCopilotThread, getCopilotThread, getCopilotThreads,
  rejectCopilotProposal, streamCopilotMessage,
  getAgents,
} from '../lib/api'
import { useNavigate } from '../lib/router.jsx'
import './Copilot.css'

const STARTERS = [
  'Build a safe support triage workflow with human approval',
  'Why did my latest run fail?',
  'Show me how to connect an app and test it',
]

export default function Copilot() {
  const navigate = useNavigate()
  const abortRef = useRef(null)
  const [threads, setThreads] = useState([])
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [proposals, setProposals] = useState([])
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [status, setStatus] = useState('')
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
    }, 0)
    return () => { active = false; clearTimeout(timer); abortRef.current?.abort() }
  }, [loadThreads, openThread])

  const newThread = async () => {
    try {
      const created = await createCopilotThread({ title:'New conversation' })
      setThreads(current => [created, ...current])
      setThread(created); setMessages([]); setProposals([]); setError('')
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
      setInput(''); setError(''); setStreamText(''); setStreaming(true); setStatus('Understanding your workspace…')
      const controller = new AbortController()
      abortRef.current = controller
      await streamCopilotMessage(activeThread.id, message, {
        signal:controller.signal,
        onEvent(name, payload) {
          if (name === 'meta') setStatus(payload.state === 'answering' ? 'Preparing a safe answer…' : 'Understanding your workspace…')
          if (name === 'delta') setStreamText(current => current + (payload.text || ''))
          if (name === 'proposal') setProposals(current => [...current, payload])
          if (name === 'done') {
            setMessages(current => [...current.filter(item => item.id !== optimistic.id), optimistic, payload.message])
            setStreamText('')
            setStatus(payload.fallback ? 'Local fallback used—your work remains safe.' : '')
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

  const filtered = useMemo(() => threads.filter(item => item.title.toLowerCase().includes(query.toLowerCase())), [threads, query])
  const proposalFor = messageId => proposals.filter(item => item.message_id === messageId)

  return <div className="copilot-page">
    <aside className="copilot-history" aria-label="Conversation history">
      <button className="copilot-new" onClick={newThread}><MessageSquarePlus size={16} /> New conversation</button>
      <div className="copilot-agent-start"><select value={agentId} onChange={event => setAgentId(event.target.value)} aria-label="Choose agent for agent chat"><option value="">Agent chat…</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><button disabled={!agentId} onClick={newAgentChat}>Start</button></div>
      <label className="copilot-search"><Search size={14} /><span className="sr-only">Search conversations</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search conversations" /></label>
      <div className="copilot-thread-list">
        {filtered.map(item => <button key={item.id} className={thread?.id === item.id ? 'active' : ''} onClick={() => openThread(item.id)}>
          <span>{item.title}</span><small>{item.mode === 'agent_chat' ? 'Agent chat' : 'Copilot'}</small>
        </button>)}
        {!filtered.length && <p>No conversations yet.</p>}
      </div>
    </aside>

    <main className="copilot-conversation">
      <header className="copilot-header">
        <div><span><Sparkles size={13} /> Operations Copilot</span><h1>{thread?.title || 'Design, diagnose, and improve'}</h1></div>
        <div className="copilot-safety"><Check size={13} /> Draft → preview → approve</div>
      </header>
      {error && <div className="copilot-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
      <section className="copilot-messages" aria-live="polite">
        {!messages.length && !streaming && <div className="copilot-welcome">
          <div className="copilot-orb"><WandSparkles size={29} /></div>
          <h2>What outcome should we build?</h2>
          <p>I can inspect safe workspace metadata, explain failures, and prepare visible proposals. Nothing is saved or executed without your approval.</p>
          <div>{STARTERS.map(starter => <button key={starter} onClick={() => send(starter)}>{starter}<CornerDownLeft size={13} /></button>)}</div>
        </div>}
        {messages.map(message => <article key={message.id} className={`copilot-message copilot-message-${message.role}`}>
          <div className="copilot-message-avatar">{message.role === 'assistant' ? <Bot size={16} /> : 'You'}</div>
          <div><p>{message.content}</p>{message.role === 'assistant' && <button className="copilot-copy" onClick={() => navigator.clipboard.writeText(message.content)}><Clipboard size={12} /> Copy</button>}
          {proposalFor(message.id).map(proposal => <div className="copilot-proposal" key={proposal.id}>
            <span>Workflow proposal</span><h3>{proposal.title}</h3><p>{proposal.summary}</p>
            <div className="copilot-proposal-flow">{(proposal.preview?.nodes || []).map((node, index) => <span key={node.id}>{node.label}{index < proposal.preview.nodes.length - 1 ? ' →' : ''}</span>)}</div>
            {proposal.status === 'pending' ? <div><button onClick={() => decideProposal(proposal, 'apply')}>Approve & open draft</button><button onClick={() => decideProposal(proposal, 'reject')}>Reject</button></div> : <small>Proposal {proposal.status}</small>}
          </div>)}</div>
        </article>)}
        {streaming && <article className="copilot-message copilot-message-assistant"><div className="copilot-message-avatar"><Bot size={16} /></div><div><p>{streamText || status}</p><span className="copilot-typing" /></div></article>}
      </section>
      <footer className="copilot-composer">
        {status && !streaming && <div className="copilot-status">{status}</div>}
        <div><textarea value={input} onChange={event => setInput(event.target.value)} placeholder="Describe an outcome or ask about your workspace…" rows="2" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} />
        {streaming ? <button className="copilot-stop" onClick={() => abortRef.current?.abort()} aria-label="Stop response"><Square size={15} /></button> : <button onClick={() => send()} disabled={!input.trim()} aria-label="Send message"><Send size={16} /></button>}</div>
        <p><RotateCcw size={11} /> Copilot can make mistakes. Review proposals and test before activation.</p>
      </footer>
    </main>
  </div>
}

import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, Bot, CheckCircle2, MessageCircle, RotateCcw, Send,
  ShieldCheck, Sparkles, X,
} from 'lucide-react'

import { useLocation, useNavigate } from '../lib/router.jsx'
import { answerSiteQuestion, contextSuggestions } from '../lib/site-assistant-knowledge.js'
import { askWorkspaceGuide } from '../lib/api'
import './SiteAssistant.css'

const INITIAL_MESSAGE = {
  role:'assistant',
  answer:{
    title:'Hi, I am the AgentForge Guide.',
    text:'Tell me what you want to automate and I will recommend a workflow, explain the platform, or take you to the right place.',
    bullets:[],
    actions:[],
    followUps:[],
  },
}

export default function SiteAssistant({ user }) {
  const navigate = useNavigate()
  const [location] = useLocation()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([INITIAL_MESSAGE])
  const [thinking, setThinking] = useState(false)
  const inputRef = useRef(null)
  const endRef = useRef(null)
  const replyTimer = useRef(null)
  const signedIn = Boolean(user)
  const suggestions = contextSuggestions(location, signedIn)

  useEffect(() => {
    const openGuide = () => setOpen(true)
    window.addEventListener('agentforge:open-guide', openGuide)
    return () => window.removeEventListener('agentforge:open-guide', openGuide)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    const onKeyDown = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' })
  }, [messages, thinking, open])

  useEffect(() => () => window.clearTimeout(replyTimer.current), [])

  const ask = async question => {
    const clean = String(question || '').trim().slice(0, 500)
    if (!clean || thinking) return
    setMessages(current => [...current, { role:'user', text:clean }])
    setInput('')
    setThinking(true)
    const localAnswer = answerSiteQuestion(clean, { path:location, signedIn })
    const wantsWorkflow = signedIn && /(build|create|make|automate|automation|workflow)/i.test(clean)
    const draftAction = wantsWorkflow
      ? [{ label:'Generate this workflow draft', path:`/workflows/new?copilot=${encodeURIComponent(clean)}` }]
      : []
    if (!signedIn) {
      replyTimer.current = window.setTimeout(() => {
        setMessages(current => [...current, { role:'assistant', answer:{ ...localAnswer, actions:[...draftAction, ...(localAnswer.actions || [])] } }])
        setThinking(false)
      }, 380)
      return
    }
    try {
      const history = messages.slice(-6).map(item => ({
        role:item.role,
        text:item.role === 'user' ? item.text : `${item.answer.title}. ${item.answer.text}`,
      }))
      const result = await askWorkspaceGuide(clean, history)
      const contextBits = [
        `${result.context.active_agents} active agents`,
        `${result.context.active_workflows} active workflows`,
        `${result.context.active_triggers} active triggers`,
      ]
      setMessages(current => [...current, {
        role:'assistant',
        answer:{
          title:'Account-aware recommendation',
          text:result.answer,
          bullets:[`Workspace context: ${contextBits.join(', ')}.`],
          actions:[...draftAction, { label:'Open recommended page', path:result.suggested_path }, ...localAnswer.actions].filter((item, index, all) => all.findIndex(candidate => candidate.path === item.path) === index),
          followUps:localAnswer.followUps,
        },
      }])
    } catch {
      setMessages(current => [...current, { role:'assistant', answer:{ ...localAnswer, title:`${localAnswer.title} (safe fallback)`, actions:[...draftAction, ...(localAnswer.actions || [])] } }])
    } finally {
      setThinking(false)
    }
  }

  const followAction = action => {
    setOpen(false)
    if (action.path.startsWith('/#')) {
      window.location.assign(action.path)
      return
    }
    navigate(action.path)
  }

  const reset = () => {
    window.clearTimeout(replyTimer.current)
    setThinking(false)
    setMessages([INITIAL_MESSAGE])
    setInput('')
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className={`site-assistant${open ? ' site-assistant--open' : ''}`}>
      {open && (
        <section className="site-assistant-panel" role="dialog" aria-label="AgentForge product guide" aria-modal="false">
          <header className="site-assistant-header">
            <div className="site-assistant-avatar"><Bot size={20} /></div>
            <div>
              <strong>AgentForge Guide</strong>
              <span><i /> Product help, grounded in AgentForge</span>
            </div>
            <button type="button" onClick={reset} aria-label="Clear conversation" title="Clear conversation"><RotateCcw size={16} /></button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close guide"><X size={18} /></button>
          </header>

          <div className="site-assistant-context">
            <ShieldCheck size={14} /> The guide can prepare workflow drafts. It cannot see secrets, publish, or run external actions.
          </div>

          <div className="site-assistant-messages" aria-live="polite">
            {messages.map((message, index) => message.role === 'user' ? (
              <div className="site-assistant-user-message" key={`${message.text}-${index}`}>{message.text}</div>
            ) : (
              <article className="site-assistant-answer" key={`${message.answer.title}-${index}`}>
                <div className="site-assistant-answer-icon"><Sparkles size={14} /></div>
                <div>
                  <strong>{message.answer.title}</strong>
                  <p>{message.answer.text}</p>
                  {message.answer.bullets?.length > 0 && (
                    <ul>{message.answer.bullets.map(item => <li key={item}><CheckCircle2 size={13} /> <span>{item}</span></li>)}</ul>
                  )}
                  {message.answer.actions?.length > 0 && (
                    <div className="site-assistant-actions">
                      {message.answer.actions.map(action => (
                        <button type="button" key={action.path} onClick={() => followAction(action)}>
                          {action.label} <ArrowRight size={13} />
                        </button>
                      ))}
                    </div>
                  )}
                  {message.answer.followUps?.length > 0 && (
                    <div className="site-assistant-followups">
                      {message.answer.followUps.map(item => <button type="button" key={item} onClick={() => ask(item)}>{item}</button>)}
                    </div>
                  )}
                </div>
              </article>
            ))}
            {thinking && <div className="site-assistant-thinking" aria-label="AgentForge Guide is preparing an answer"><i /><i /><i /></div>}
            <div ref={endRef} />
          </div>

          {messages.length === 1 && (
            <div className="site-assistant-suggestions">
              <span>Popular questions</span>
              {suggestions.map(item => <button type="button" key={item} onClick={() => ask(item)}>{item}</button>)}
            </div>
          )}

          <form className="site-assistant-composer" onSubmit={event => { event.preventDefault(); ask(input) }}>
            <label htmlFor="site-assistant-input">Ask AgentForge</label>
            <div>
              <input id="site-assistant-input" ref={inputRef} value={input} maxLength={500}
                onChange={event => setInput(event.target.value)} placeholder="What should I automate first?" />
              <button type="submit" disabled={!input.trim() || thinking} aria-label="Send question"><Send size={16} /></button>
            </div>
          </form>
        </section>
      )}

      <button className="site-assistant-launcher" type="button" onClick={() => setOpen(current => !current)}
        aria-label={open ? 'Close AgentForge Guide' : 'Open AgentForge Guide'} aria-expanded={open}>
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        <span>{open ? 'Close' : 'Ask AgentForge'}</span>
        {!open && <i />}
      </button>
    </div>
  )
}

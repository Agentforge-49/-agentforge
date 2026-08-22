import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, BookOpen, FlaskConical, Home, LayoutTemplate, PlugZap,
  Search, Settings, ShieldCheck, Sparkles, WandSparkles, X,
} from 'lucide-react'

import { filterWorkspaceCommands } from '../lib/workspace-commands.js'

const ICONS = {
  activity:Activity, book:BookOpen, flask:FlaskConical, home:Home,
  layout:LayoutTemplate, plug:PlugZap, settings:Settings,
  shield:ShieldCheck, sparkles:Sparkles, wand:WandSparkles,
}

export default function WorkspaceCommandPalette({ open, onClose, onNavigate }) {
  if (!open) return null
  return <OpenCommandPalette onClose={onClose} onNavigate={onNavigate} />
}

function OpenCommandPalette({ onClose, onNavigate }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const results = useMemo(() => filterWorkspaceCommands(query), [query])

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const choose = command => {
    if (!command) return
    onClose()
    onNavigate(command.to)
  }

  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, results.length - 1)); return }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)); return }
    if (event.key === 'Enter') { event.preventDefault(); choose(results[activeIndex]) }
  }

  const grouped = results.reduce((groups, command, index) => {
    const bucket = groups.find(group => group.label === command.group)
    const item = { command, index }
    if (bucket) bucket.items.push(item)
    else groups.push({ label:command.group, items:[item] })
    return groups
  }, [])

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Quick actions" onKeyDown={onKeyDown}>
        <div className="command-palette-search">
          <Search size={19} />
          <input ref={inputRef} value={query} onChange={event => { setQuery(event.target.value); setActiveIndex(0) }} placeholder="What do you want to do?" aria-label="Search quick actions" />
          <kbd>Esc</kbd>
          <button type="button" onClick={onClose} aria-label="Close quick actions"><X size={17} /></button>
        </div>

        <div className="command-palette-results" role="listbox" aria-label="Available actions">
          {grouped.map(group => <div className="command-palette-group" key={group.label}>
            <span>{group.label}</span>
            {group.items.map(({ command, index }) => {
              const Icon = ICONS[command.icon]
              return <button
                type="button"
                key={command.id}
                className={activeIndex === index ? 'active' : ''}
                role="option"
                aria-selected={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(command)}
              >
                <i><Icon size={17} /></i>
                <span><strong>{command.label}</strong><small>{command.description}</small></span>
                <em>Open</em>
              </button>
            })}
          </div>)}
          {!results.length && <div className="command-palette-empty"><Search size={22} /><strong>No matching action</strong><p>Try “connect”, “approval”, “test”, or “create”.</p></div>}
        </div>

        <footer><span><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>↵</kbd> Open</span><span>Search all core jobs—not technical page names.</span></footer>
      </section>
    </div>
  )
}

import { Activity, ArrowRight, FlaskConical, ShieldCheck } from 'lucide-react'

import { Link, useLocation } from '../lib/router.jsx'
import '../styles/Operations.css'

const AREAS = [
  { key:'runs', to:'/observability', label:'Runs', detail:'Inspect execution', icon:Activity },
  { key:'inbox', to:'/approvals', label:'Inbox', detail:'Apply judgment', icon:ShieldCheck },
  { key:'quality', to:'/evaluations', label:'Quality', detail:'Verify and release', icon:FlaskConical },
]

export default function OperationsHeader({ area, title, description, actions }) {
  const [location] = useLocation()
  return (
    <header className="operations-header">
      <div className="operations-header-top">
        <div><span>Operate</span><h1>{title}</h1><p>{description}</p></div>
        {actions && <div className="operations-header-actions">{actions}</div>}
      </div>
      <nav className="operations-loop" aria-label="AgentForge operating loop">
        {AREAS.map((item, index) => {
          const Icon = item.icon
          const active = area === item.key || location === item.to
          return (
            <div className="operations-loop-step" key={item.key}>
              <Link to={item.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                <span><Icon size={15} /></span><div><strong>{item.label}</strong><small>{item.detail}</small></div>
              </Link>
              {index < AREAS.length - 1 && <ArrowRight size={13} />}
            </div>
          )
        })}
      </nav>
    </header>
  )
}

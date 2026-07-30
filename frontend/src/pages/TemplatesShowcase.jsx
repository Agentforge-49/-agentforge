import { ArrowRight, Bot, Headphones, MailCheck, Search, ShieldCheck, ShoppingBag, Sparkles } from 'lucide-react'
import MarketingLayout from '../components/MarketingLayout'
import { useNavigate } from '../lib/router.jsx'
import './TemplatesShowcase.css'

const TEMPLATES = [
  { icon: Headphones, category: 'Customer operations', title: 'Support request triage', text: 'Classify an incoming request, ground the response, route risk, and request approval before sensitive actions.', capabilities: ['Webhook', 'Knowledge', 'Approval'] },
  { icon: Search, category: 'Research', title: 'Cited research brief', text: 'Collect public evidence, synthesize findings, preserve sources, and deliver a structured decision brief.', capabilities: ['Web research', 'Multi-agent', 'Evaluation'] },
  { icon: MailCheck, category: 'Revenue', title: 'Lead qualification', text: 'Enrich a new lead, apply deterministic qualification rules, draft outreach, and wait for human approval.', capabilities: ['HTTP', 'Condition', 'Email'] },
  { icon: ShoppingBag, category: 'Commerce', title: 'Order exception resolver', text: 'Inspect order context, identify the exception path, coordinate systems, and escalate uncertain cases.', capabilities: ['Connector', 'Routing', 'Audit'] },
  { icon: ShieldCheck, category: 'IT & security', title: 'Access request review', text: 'Validate policy, collect missing context, route privileged access for approval, and record the decision.', capabilities: ['Policy', 'Approval', 'Audit'] },
  { icon: Bot, category: 'Agent operations', title: 'Specialist agent team', text: 'Route tasks to research, analysis, and writing specialists, then aggregate the strongest result.', capabilities: ['Supervisor', 'Parallel agents', 'Trace'] },
]

export default function TemplatesShowcase() {
  const navigate = useNavigate()
  return (
    <MarketingLayout>
      <section className="marketing-hero">
        <div className="landing-container">
          <span className="section-kicker">Production-minded starting points</span>
          <h1>Start from a proven pattern. <span>Make it yours.</span></h1>
          <p>Explore practical automation blueprints designed around clear inputs, controlled decisions, measurable outputs, and human oversight.</p>
          <div className="marketing-hero__actions"><button className="button button--primary button--large" type="button" onClick={() => navigate('/signup')}>Open the template marketplace <ArrowRight size={17} /></button></div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="landing-container">
          <div className="marketing-heading"><span className="section-kicker">Blueprint library</span><h2>Useful patterns for the work your team repeats.</h2><p>These blueprints map to AgentForge’s real agents, workflows, approvals, connectors, and run traces.</p></div>
          <div className="marketing-grid">
            {TEMPLATES.map(({ icon: Icon, category, title, text, capabilities }) => (
              <article className="marketing-card template-card" key={title}>
                <div className="marketing-card__topline"><div className="marketing-card__icon"><Icon size={21} /></div><span className="marketing-badge">{category}</span></div>
                <h3>{title}</h3><p>{text}</p>
                <div className="template-card__tags">{capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-section--tint">
        <div className="landing-container">
          <div className="marketing-heading"><span className="section-kicker">A better template contract</span><h2>More than a prompt copied into a box.</h2></div>
          <div className="marketing-grid">
            <article className="marketing-card"><div className="marketing-card__icon"><Sparkles size={21} /></div><h3>Editable by default</h3><p>Change the model, instructions, tools, limits, and approval rules before publishing.</p></article>
            <article className="marketing-card"><div className="marketing-card__icon"><ShieldCheck size={21} /></div><h3>Safe to test</h3><p>Run privately, inspect the trace, evaluate expected behavior, and publish a version when ready.</p></article>
            <article className="marketing-card"><div className="marketing-card__icon"><Bot size={21} /></div><h3>Ready to compose</h3><p>Use an agent alone, inside a deterministic workflow, or as one specialist in a larger team.</p></article>
          </div>
        </div>
      </section>

      <section className="marketing-cta"><div className="landing-container marketing-cta__panel"><div><h2>Build once. Improve every run.</h2><p>Turn a strong blueprint into your own production system.</p></div><button className="button button--light button--large" type="button" onClick={() => navigate('/signup')}>Start from a template <ArrowRight size={17} /></button></div></section>
    </MarketingLayout>
  )
}

import { ArrowRight, Check, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import MarketingLayout from '../components/MarketingLayout'
import { useNavigate } from '../lib/router.jsx'
import './Pricing.css'

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    suffix: 'forever',
    description: 'For builders proving an idea and testing dependable automations.',
    features: ['50 model calls and 100K tokens each month', 'Up to 10 agents and 20 workflows', 'Knowledge, approvals, run traces, and marketplace access', 'No credit card required'],
    action: 'Start building',
  },
  {
    name: 'Pro',
    price: 'Launch access',
    suffix: 'approved in your workspace',
    description: 'For individual builders moving production workloads onto AgentForge.',
    features: ['500 model calls and 2M tokens each month', 'Up to 100 agents and 250 workflows', 'Priority workers and advanced evaluations', 'Multi-model execution and higher limits'],
    action: 'Request Pro access',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    suffix: 'capacity and controls',
    description: 'For teams that need governed automation across departments.',
    features: ['Organization roles, policies, and audit logs', 'SSO, domain verification, and session controls', 'Custom entitlements and production capacity', 'Developer APIs, webhooks, and governance'],
    action: 'Create a workspace',
  },
]

const PRINCIPLES = [
  { icon: Sparkles, title: 'Start without friction', text: 'Build and validate a real workflow before deciding how far to scale.' },
  { icon: Zap, title: 'Usage you can see', text: 'Model calls, tokens, estimated cost, and limits stay visible in the product.' },
  { icon: ShieldCheck, title: 'Controls grow with you', text: 'Move from personal builds to roles, policies, approvals, SSO, and auditability.' },
]

export default function Pricing() {
  const navigate = useNavigate()
  return (
    <MarketingLayout>
      <section className="marketing-hero">
        <div className="landing-container">
          <span className="section-kicker">Simple launch plans</span>
          <h1>Build for free. <span>Scale with control.</span></h1>
          <p>Start with the complete AgentForge building experience, then move to higher limits and team governance when your workflows are ready.</p>
        </div>
      </section>

      <section className="marketing-section pricing-section">
        <div className="landing-container pricing-grid">
          {PLANS.map((plan) => (
            <article className={`pricing-card${plan.featured ? ' pricing-card--featured' : ''}`} key={plan.name}>
              {plan.featured && <span className="pricing-card__flag">Recommended</span>}
              <span className="pricing-card__name">{plan.name}</span>
              <div className="pricing-card__price">{plan.price}</div>
              <span className="pricing-card__suffix">{plan.suffix}</span>
              <p>{plan.description}</p>
              <ul className="marketing-checks">
                {plan.features.map((feature) => <li key={feature}><Check size={17} /> {feature}</li>)}
              </ul>
              <button className={`button ${plan.featured ? 'button--primary' : 'button--secondary'}`} type="button" onClick={() => navigate('/signup')}>
                {plan.action} <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </div>
        <p className="pricing-note">Pro and Enterprise launch access is currently reviewed inside AgentForge. No paid checkout is required during this phase.</p>
      </section>

      <section className="marketing-section marketing-section--tint">
        <div className="landing-container">
          <div className="marketing-heading">
            <span className="section-kicker">Designed for responsible scale</span>
            <h2>A clear path from first run to production operations.</h2>
          </div>
          <div className="marketing-grid">
            {PRINCIPLES.map(({ icon: Icon, title, text }) => (
              <article className="marketing-card" key={title}><div className="marketing-card__icon"><Icon size={21} /></div><h3>{title}</h3><p>{text}</p></article>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}

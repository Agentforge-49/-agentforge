import {
  Activity,
  ArrowRight,
  Bot,
  Braces,
  Check,
  ChevronRight,
  CircleCheck,
  Database,
  GitBranch,
  KeyRound,
  Menu,
  Network,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import BrandLogo from '../components/BrandLogo'
import { useNavigate } from '../lib/router.jsx'
import './Landing.css'

const CAPABILITIES = [
  {
    icon: Bot,
    eyebrow: 'Build',
    title: 'Agents that understand the assignment',
    description:
      'Define goals, tools, knowledge, guardrails, and output contracts in one focused workspace.',
  },
  {
    icon: Workflow,
    eyebrow: 'Orchestrate',
    title: 'One canvas for every kind of work',
    description:
      'Blend deterministic logic, AI decisions, human approvals, and multi-agent collaboration.',
  },
  {
    icon: Activity,
    eyebrow: 'Operate',
    title: 'See what happened—and why',
    description:
      'Trace every run, inspect every handoff, replay failures, and measure quality, speed, and cost.',
  },
]

const PLATFORM_FEATURES = [
  { icon: Network, label: 'Multi-agent systems' },
  { icon: Database, label: 'Grounded knowledge' },
  { icon: Users, label: 'Human approvals' },
  { icon: KeyRound, label: 'Encrypted credentials' },
  { icon: Braces, label: 'Developer APIs' },
  { icon: ShieldCheck, label: 'Policies and audit' },
]

const WORKFLOW_STEPS = [
  { icon: Zap, label: 'New request', detail: 'Webhook trigger', status: 'Ready' },
  { icon: Database, label: 'Find context', detail: 'Knowledge search', status: '12 sources' },
  { icon: Bot, label: 'Research agent', detail: 'Analyze and decide', status: 'Running' },
  { icon: Users, label: 'Manager review', detail: 'Approval checkpoint', status: 'Required' },
]

const USE_CASES = [
  'Customer operations',
  'Revenue workflows',
  'IT and security',
  'Research and reporting',
]

export default function Landing() {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const goTo = (path) => {
    setMobileOpen(false)
    navigate(path)
  }

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-container landing-nav__inner">
          <button className="brand-button" type="button" onClick={() => goTo('/')} aria-label="AgentForge home">
            <BrandLogo size={38} />
          </button>

          <nav className="desktop-nav" aria-label="Primary navigation">
            <a href="#platform">Platform</a>
            <a href="#workflow">How it works</a>
            <a href="#security">Security</a>
            <a href="#use-cases">Use cases</a>
          </nav>

          <div className="landing-nav__actions">
            <button className="button button--ghost nav-signin" type="button" onClick={() => goTo('/login')}>
              Sign in
            </button>
            <button className="button button--primary nav-cta" type="button" onClick={() => goTo('/signup')}>
              Start building
              <ArrowRight size={16} />
            </button>
            <button
              className="mobile-menu-button"
              type="button"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="mobile-nav" aria-label="Mobile navigation">
            <a href="#platform" onClick={() => setMobileOpen(false)}>Platform</a>
            <a href="#workflow" onClick={() => setMobileOpen(false)}>How it works</a>
            <a href="#security" onClick={() => setMobileOpen(false)}>Security</a>
            <a href="#use-cases" onClick={() => setMobileOpen(false)}>Use cases</a>
            <button type="button" onClick={() => goTo('/login')}>Sign in</button>
            <button className="button button--primary" type="button" onClick={() => goTo('/signup')}>
              Start building
            </button>
          </nav>
        )}
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-grid-pattern" aria-hidden="true" />
          <div className="landing-container hero-layout">
            <div className="hero-copy">
              <div className="eyebrow-pill">
                <Sparkles size={14} />
                The operating system for agentic work
              </div>
              <h1>
                Build AI agents that do more than <span>just talk.</span>
              </h1>
              <p className="hero-lede">
                Design, connect, test, and govern reliable AI workflows from one
                workspace—then deploy them wherever work happens.
              </p>
              <div className="hero-actions">
                <button className="button button--primary button--large" type="button" onClick={() => goTo('/signup')}>
                  Build your first agent
                  <ArrowRight size={18} />
                </button>
                <a className="button button--secondary button--large" href="#workflow">
                  <Play size={17} fill="currentColor" />
                  See how it works
                </a>
              </div>
              <div className="hero-proof">
                <span><Check size={15} /> No credit card required</span>
                <span><Check size={15} /> Human approval built in</span>
                <span><Check size={15} /> Publish when you are ready</span>
              </div>
            </div>

            <div className="product-preview" aria-label="AgentForge workflow preview">
              <div className="product-preview__topbar">
                <div className="preview-window-controls" aria-hidden="true">
                  <span /><span /><span />
                </div>
                <span className="preview-title">Customer request triage</span>
                <span className="preview-status"><span /> Live</span>
              </div>
              <div className="product-preview__body">
                <aside className="preview-sidebar" aria-hidden="true">
                  <BrandLogo size={28} showWordmark={false} />
                  <span className="preview-sidebar__active"><Workflow size={16} /></span>
                  <span><Bot size={16} /></span>
                  <span><Database size={16} /></span>
                  <span><Activity size={16} /></span>
                </aside>
                <div className="workflow-preview">
                  <div className="workflow-preview__heading">
                    <div>
                      <span className="preview-kicker">Workflow</span>
                      <h2>Resolve customer requests</h2>
                    </div>
                    <button type="button" tabIndex="-1"><Play size={14} fill="currentColor" /> Run</button>
                  </div>
                  <div className="workflow-chain">
                    {WORKFLOW_STEPS.map(({ icon: Icon, label, detail, status }, index) => (
                      <div className="workflow-node-wrap" key={label}>
                        <div className={`workflow-node workflow-node--${index + 1}`}>
                          <div className="workflow-node__icon"><Icon size={17} /></div>
                          <div>
                            <strong>{label}</strong>
                            <span>{detail}</span>
                          </div>
                          <small>{status}</small>
                        </div>
                        {index < WORKFLOW_STEPS.length - 1 && (
                          <div className="workflow-connector" aria-hidden="true">
                            <span />
                            <ChevronRight size={14} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="run-summary">
                    <span className="run-summary__icon"><CircleCheck size={17} /></span>
                    <div>
                      <strong>Production controls are active</strong>
                      <span>Retries, audit trail, budget policy, and approval rules</span>
                    </div>
                    <div className="run-summary__metric">
                      <strong>4 / 4</strong>
                      <span>Controls on</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="trust-strip" aria-label="Platform highlights">
          <div className="landing-container trust-strip__inner">
            <span>Built for real operations</span>
            <div>
              <span><ShieldCheck size={17} /> Governed</span>
              <span><Activity size={17} /> Observable</span>
              <span><GitBranch size={17} /> Versioned</span>
              <span><Users size={17} /> Human-aware</span>
            </div>
          </div>
        </section>

        <section className="section" id="platform">
          <div className="landing-container">
            <div className="section-heading">
              <span className="section-kicker">One connected platform</span>
              <h2>Everything you need to move from idea to dependable automation.</h2>
              <p>
                AgentForge brings agent design, workflow orchestration, quality,
                and governance into one coherent system.
              </p>
            </div>

            <div className="capability-grid">
              {CAPABILITIES.map(({ icon: Icon, eyebrow, title, description }, index) => (
                <article className="capability-card" key={title}>
                  <div className="capability-card__number">0{index + 1}</div>
                  <div className="capability-card__icon"><Icon size={22} /></div>
                  <span>{eyebrow}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <a href="#workflow">Explore {eyebrow.toLowerCase()} <ArrowRight size={15} /></a>
                </article>
              ))}
            </div>

            <div className="feature-rail">
              {PLATFORM_FEATURES.map(({ icon: Icon, label }) => (
                <div key={label}><Icon size={19} /><span>{label}</span></div>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--tint" id="workflow">
          <div className="landing-container split-section">
            <div className="split-section__copy">
              <span className="section-kicker">Control without complexity</span>
              <h2>Let agents reason. Keep the workflow in control.</h2>
              <p>
                Use AI where judgment matters and deterministic steps where
                consistency matters. Add a human whenever a decision deserves one.
              </p>
              <ul className="check-list">
                <li><CircleCheck size={19} /> Visual workflows with conditions and handoffs</li>
                <li><CircleCheck size={19} /> Durable runs with retries and checkpoints</li>
                <li><CircleCheck size={19} /> Multi-agent routing and parallel execution</li>
                <li><CircleCheck size={19} /> Approval gates before sensitive actions</li>
              </ul>
              <button className="text-link" type="button" onClick={() => goTo('/signup')}>
                Start with a workflow <ArrowRight size={16} />
              </button>
            </div>

            <div className="logic-card">
              <div className="logic-card__header">
                <span>Decision path</span>
                <small>Every action explained</small>
              </div>
              <div className="logic-line">
                <span className="logic-line__dot"><Zap size={15} /></span>
                <div><strong>Request received</strong><small>Trigger validates the payload</small></div>
              </div>
              <div className="logic-line">
                <span className="logic-line__dot"><Bot size={15} /></span>
                <div><strong>Agent classifies intent</strong><small>Confidence: 94% · 3 sources cited</small></div>
              </div>
              <div className="logic-branch">
                <div><span>Low risk</span><strong>Resolve automatically</strong></div>
                <div className="logic-branch__active"><span>Needs judgment</span><strong>Request approval</strong></div>
              </div>
              <div className="logic-result">
                <CircleCheck size={19} />
                <div><strong>Complete and auditable</strong><small>Decision, context, and approval stored together</small></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section security-section" id="security">
          <div className="landing-container security-panel">
            <div className="security-panel__mark"><ShieldCheck size={28} /></div>
            <div className="security-panel__copy">
              <span className="section-kicker">Governance from the first run</span>
              <h2>Move fast without losing control.</h2>
              <p>
                Credentials stay encrypted, risky actions can require approval,
                and every important change is recorded in an audit trail.
              </p>
            </div>
            <div className="security-stats">
              <div><strong>Role-based</strong><span>Workspace access</span></div>
              <div><strong>Encrypted</strong><span>Stored credentials</span></div>
              <div><strong>Versioned</strong><span>Production changes</span></div>
            </div>
          </div>
        </section>

        <section className="section" id="use-cases">
          <div className="landing-container">
            <div className="use-case-layout">
              <div className="section-heading section-heading--left">
                <span className="section-kicker">Built for the work between tools</span>
                <h2>Start with one workflow. Expand into an AI workforce.</h2>
              </div>
              <div className="use-case-list">
                {USE_CASES.map((item, index) => (
                  <button type="button" key={item} onClick={() => goTo('/signup')}>
                    <span>0{index + 1}</span>
                    <strong>{item}</strong>
                    <ArrowRight size={18} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div className="landing-container cta-panel">
            <div>
              <span className="section-kicker section-kicker--light">Forge the way work gets done</span>
              <h2>Your first reliable AI workflow starts here.</h2>
              <p>Build for free. Test safely. Publish when you are ready.</p>
            </div>
            <button className="button button--light button--large" type="button" onClick={() => goTo('/signup')}>
              Start building
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer__top">
          <div>
            <BrandLogo size={38} />
            <p>Reliable AI agents for real work.</p>
          </div>
          <div className="landing-footer__links">
            <div><strong>Product</strong><a href="#platform">Platform</a><a href="#workflow">Workflows</a><a href="#security">Security</a></div>
            <div><strong>Start</strong><button type="button" onClick={() => goTo('/signup')}>Create account</button><button type="button" onClick={() => goTo('/login')}>Sign in</button></div>
          </div>
        </div>
        <div className="landing-container landing-footer__bottom">
          <span>© 2026 AgentForge</span>
          <span>Built for dependable automation.</span>
        </div>
      </footer>
    </div>
  )
}

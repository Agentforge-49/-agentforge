import { useState } from 'react'
import {
  ArrowRight, Bot, Check, CheckCircle2, ChevronRight, CircleDot, Menu,
  MessageCircleMore, Play, ShieldCheck, Sparkles, Workflow, X, Zap,
} from 'lucide-react'

import AppLogo from '../components/AppLogo.jsx'
import BrandLogo from '../components/BrandLogo'
import { LANDING_FEATURED_APPS } from '../lib/landing-apps.js'
import { useNavigate } from '../lib/router.jsx'
import './Landing.css'

const OUTCOMES = [
  ['Support triage', 'Classify requests, draft replies, and ask a person before Slack delivery.'],
  ['Lead qualification', 'Score inbound leads and write approved results to Google Sheets.'],
  ['Research delivery', 'Turn supplied evidence into a reviewed brief and deliver it safely.'],
]

const STEPS = [
  [MessageCircleMore, 'Describe the result', 'Say what comes in, what decision is needed, and where the approved result should go.'],
  [Workflow, 'Review the workflow', 'AgentForge creates the steps, connection requirements, tests, and approval point for you.'],
  [Play, 'Test, then turn it on', 'Run with safe sample data, inspect every step, and publish only when the result is reliable.'],
]

export default function Landing() {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const goTo = path => { setMobileOpen(false); navigate(path) }
  const openGuide = () => window.dispatchEvent(new Event('agentforge:open-guide'))

  return (
    <div className="landing landing-v2">
      <header className="landing-nav">
        <div className="landing-container landing-nav__inner">
          <button className="brand-button" type="button" onClick={() => goTo('/')} aria-label="AgentForge home"><BrandLogo size={38} /></button>
          <nav className="desktop-nav" aria-label="Primary navigation">
            <a href="#how-it-works">How it works</a>
            <button type="button" onClick={() => goTo('/integrations')}>Apps</button>
            <button type="button" onClick={() => goTo('/templates')}>Templates</button>
            <button type="button" onClick={() => goTo('/pricing')}>Pricing</button>
          </nav>
          <div className="landing-nav__actions">
            <button className="button button--ghost nav-signin" type="button" onClick={() => goTo('/login')}>Sign in</button>
            <button className="button button--primary nav-cta" type="button" onClick={() => goTo('/signup')}>Build free <ArrowRight size={16} /></button>
            <button className="mobile-menu-button" type="button" aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}>{mobileOpen ? <X size={22} /> : <Menu size={22} />}</button>
          </div>
        </div>
        {mobileOpen && <nav className="mobile-nav" aria-label="Mobile navigation"><a href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</a><button type="button" onClick={() => goTo('/integrations')}>Apps</button><button type="button" onClick={() => goTo('/templates')}>Templates</button><button type="button" onClick={() => goTo('/pricing')}>Pricing</button><button type="button" onClick={() => goTo('/login')}>Sign in</button><button className="button button--primary" type="button" onClick={() => goTo('/signup')}>Build free</button></nav>}
      </header>

      <main>
        <section className="lf-hero">
          <div className="landing-container lf-hero__grid">
            <div className="lf-hero__copy">
              <div className="lf-eyebrow"><span><Sparkles size={13} /></span> AI automation you can understand and control</div>
              <h1>Describe the work.<br /><em>AgentForge builds the workflow.</em></h1>
              <p>Connect your apps, add an AI decision, and keep a human in control—without learning a complicated automation platform first.</p>
              <div className="lf-hero__actions">
                <button className="button button--primary button--large" type="button" onClick={() => goTo('/signup')}>Build your first workflow <ArrowRight size={17} /></button>
                <button className="lf-ask-button" type="button" onClick={openGuide}><MessageCircleMore size={17} /> Ask the guide</button>
              </div>
              <div className="lf-hero__proof"><span><Check size={14} /> Free to start</span><span><Check size={14} /> No credit card</span><span><Check size={14} /> Approval before action</span></div>
            </div>

            <div className="lf-workbench" aria-label="Example AgentForge workflow">
              <div className="lf-workbench__bar"><span><i /><i /><i /></span><b>Customer support triage</b><small>Draft</small></div>
              <div className="lf-prompt"><div><Sparkles size={16} /></div><p>“When a customer asks for help, classify the issue, draft a reply, and send it to Slack after I approve it.”</p></div>
              <div className="lf-flow">
                <div className="lf-flow__step"><span><Zap size={16} /></span><div><small>WHEN</small><strong>New support request</strong></div><CheckCircle2 size={16} /></div>
                <div className="lf-flow__line" />
                <div className="lf-flow__step lf-flow__step--ai"><span><Bot size={16} /></span><div><small>AI DECIDES</small><strong>Priority, category, reply</strong></div><b>AI</b></div>
                <div className="lf-flow__line" />
                <div className="lf-flow__step"><span><ShieldCheck size={16} /></span><div><small>REVIEW</small><strong>You approve the result</strong></div><CircleDot size={15} /></div>
                <div className="lf-flow__line" />
                <div className="lf-flow__step"><AppLogo slug="slack" name="Slack" size={34} /><div><small>THEN</small><strong>Send to Slack</strong></div><CheckCircle2 size={16} /></div>
              </div>
              <div className="lf-workbench__footer"><span><ShieldCheck size={14} /> External action is approval-gated</span><button type="button" onClick={() => goTo('/signup')}>Use this template <ChevronRight size={14} /></button></div>
            </div>
          </div>
        </section>

        <section className="lf-apps" aria-label="Popular app connections">
          <div className="landing-container">
            <p>Works with the tools your team already uses</p>
            <div className="lf-apps__row">{LANDING_FEATURED_APPS.map(([slug, name]) => <div key={slug}><AppLogo slug={slug} name={name} size={38} /><span>{name}</span></div>)}</div>
            <button type="button" onClick={() => goTo('/integrations')}>See 17 native connectors and 1,000+ API-compatible apps <ArrowRight size={14} /></button>
          </div>
        </section>

        <section className="lf-section" id="how-it-works">
          <div className="landing-container">
            <div className="lf-heading"><span>Simple by design</span><h2>From idea to a safe workflow in three steps.</h2><p>You never need to understand agents, chains, triggers, or model routing before you start.</p></div>
            <div className="lf-steps">{STEPS.map(([Icon, title, text], index) => <article key={title}><b>0{index + 1}</b><span><Icon size={20} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
          </div>
        </section>

        <section className="lf-section lf-section--soft">
          <div className="landing-container lf-outcomes">
            <div className="lf-heading lf-heading--left"><span>Start with a real result</span><h2>Three complete workflows. Pick one and make it yours.</h2><p>Each starter includes the agent instructions, workflow steps, approval gate, connection checklist, and quality tests.</p><button className="button button--primary" type="button" onClick={() => goTo('/templates')}>Explore templates <ArrowRight size={15} /></button></div>
            <div className="lf-outcome-list">{OUTCOMES.map(([title, text], index) => <button type="button" key={title} onClick={() => goTo('/templates')}><span>0{index + 1}</span><div><strong>{title}</strong><p>{text}</p></div><ArrowRight size={17} /></button>)}</div>
          </div>
        </section>

        <section className="lf-trust">
          <div className="landing-container lf-trust__panel">
            <div><span><ShieldCheck size={18} /></span><small>Control is built in</small><h2>AI can think. You decide when it acts.</h2><p>Test privately, inspect every run, require approval, and keep credentials encrypted outside prompts.</p></div>
            <ul><li><CheckCircle2 size={17} /> Human approval gates</li><li><CheckCircle2 size={17} /> Visible run history</li><li><CheckCircle2 size={17} /> Encrypted connections</li><li><CheckCircle2 size={17} /> Versioned production changes</li></ul>
          </div>
        </section>

        <section className="lf-final"><div className="landing-container"><div><span>Start small. Prove it. Scale it.</span><h2>What should AgentForge automate for you?</h2><p>Build free, test with sample data, and publish when you are ready.</p></div><div><button className="button button--light button--large" type="button" onClick={() => goTo('/signup')}>Build my first workflow <ArrowRight size={17} /></button><button type="button" onClick={openGuide}>Ask a question</button></div></div></section>
      </main>

      <footer className="landing-footer"><div className="landing-container landing-footer__top"><div><BrandLogo size={38} /><p>Understandable AI automation for real work.</p></div><div className="landing-footer__links"><div><strong>Product</strong><a href="#how-it-works">How it works</a><button type="button" onClick={() => goTo('/integrations')}>Apps</button><button type="button" onClick={() => goTo('/templates')}>Templates</button></div><div><strong>Start</strong><button type="button" onClick={() => goTo('/pricing')}>Pricing</button><button type="button" onClick={() => goTo('/signup')}>Create account</button><button type="button" onClick={() => goTo('/login')}>Sign in</button></div></div></div><div className="landing-container landing-footer__bottom"><span>© 2026 AgentForge</span><span>Built for dependable automation.</span></div></footer>
    </div>
  )
}

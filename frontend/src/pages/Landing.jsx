import { useState } from 'react'
import {
  Activity, ArrowRight, Bot, Check, CheckCircle2, ChevronRight, CircleDot,
  Command, Gauge, GitBranch, Menu, MessageCircleMore, Play, PlugZap, ShieldCheck,
  Sparkles, TestTube2, Workflow, X, Zap,
} from 'lucide-react'

import AppLogo from '../components/AppLogo.jsx'
import BrandLogo from '../components/BrandLogo'
import SpatialOperationsScene from '../components/SpatialOperationsScene.jsx'
import { LANDING_FEATURED_APPS } from '../lib/landing-apps.js'
import { useNavigate } from '../lib/router.jsx'
import './Landing.css'

const OUTCOMES = [
  ['Support triage', 'Classify requests, draft replies, and ask a person before Slack delivery.'],
  ['Lead qualification', 'Score inbound leads and write approved results to Google Sheets.'],
  ['Research delivery', 'Turn supplied evidence into a reviewed brief and deliver it safely.'],
]

const STEPS = [
  [MessageCircleMore, 'Describe the result', 'Say what comes in, what decision is needed, and where the approved result should go.', 'Outcome understood', ['Input: support request', 'Decision: priority + reply', 'Delivery: Slack after approval']],
  [Workflow, 'Review the system', 'AgentForge creates the steps, connection requirements, tests, and approval point for you.', 'System designed', ['4 connected steps', '1 human approval gate', '2 app connections required']],
  [Play, 'Prove it, then activate', 'Run with safe sample data, inspect every step, and publish only when the result is reliable.', 'Ready for activation', ['12/12 checks passed', 'No external action during test', 'Complete run trace saved']],
]

const PLATFORM_CAPABILITIES = [
  [Sparkles, 'Forge', 'Ask anything or describe an outcome in plain language. Get a useful answer or a visible plan, never a hidden action.', 'Ask → draft → preview → approve'],
  [GitBranch, 'Visual Build', 'See triggers, AI decisions, conditions, tools, approvals, and failure paths together.', 'Graph-based workflow'],
  [ShieldCheck, 'Human Control', 'Hold sensitive actions for review and preserve an evidence trail for every decision.', 'Approval-first execution'],
  [Activity, 'Live Operations', 'Follow active work, diagnose failures, compare quality, and improve with real traces.', 'Runs, cost, latency, quality'],
]

const ROLE_DEMOS = {
  support:{ label:'Support', title:'Triage every request with a visible safety gate.', flow:['New request','Classify risk','Draft reply','Lead approval','Send'], metrics:['24 sample tasks','92% demo pass rate','3 awaiting review'] },
  sales:{ label:'Sales operations', title:'Turn account context into consistent next steps.', flow:['New lead','Research context','Score fit','Manager approval','Prepare follow-up'], metrics:['18 sample leads','4 review flags','2 connections'] },
  operations:{ label:'Internal operations', title:'Route work, collect approvals, and prove completion.', flow:['Request','Route owner','Prepare work','Operator approval','Report outcome'], metrics:['31 sample requests','6 active workflows','1 recovery needed'] },
}

const HERO_SCENARIOS = {
  support:{
    label:'Support', title:'Customer support triage', tests:'12/12',
    prompt:'When a customer asks for help, classify the issue, draft a reply, and send it to Slack after I approve it.',
    trigger:'New support request', decision:'Priority, category, reply', review:'You approve the reply', app:'slack', appName:'Slack', action:'Send to Slack',
  },
  sales:{
    label:'Sales', title:'Lead qualification', tests:'8/8',
    prompt:'When a new lead arrives, research the supplied account details, score fit, and add the approved result to Google Sheets.',
    trigger:'New qualified lead', decision:'Fit, evidence, next step', review:'Manager approves the score', app:'google_sheets', appName:'Google Sheets', action:'Add approved lead',
  },
  operations:{
    label:'Operations', title:'Internal request routing', tests:'10/10',
    prompt:'When an internal request arrives, identify the owner, prepare the handoff, and update Notion only after an operator approves it.',
    trigger:'New internal request', decision:'Owner, risk, handoff', review:'Operator approves routing', app:'notion', appName:'Notion', action:'Update request record',
  },
}

const FAQS = [
  ['Do I need to understand agents or workflow architecture?', 'No. Start by describing the result in ordinary language. Forge prepares a visible draft with steps, apps, tests, and approval points that you can edit before anything is activated.'],
  ['Can Forge take actions without asking me?', 'Not silently. Forge can answer questions and prepare proposals, but publishing, activation, and consequential external actions stay behind explicit preview and approval controls.'],
  ['Are all 100 app connections native?', 'Twenty-five launch apps have guided typed connectors. The remaining seventy-five use authenticated HTTP actions or signed webhooks, with the same encrypted credential vault and run history. Every catalog entry labels its connection path honestly.'],
  ['How do I know an automation works before launch?', 'Run it with safe sample input, inspect every node and output, review the saved trace, and add evaluation cases. Publish a version only after the behavior meets your release gate.'],
  ['Can I start without paying?', 'Yes. The free workspace is designed for building and proving an operation, and no credit card is required. Higher-capacity plans are launch-access requests rather than an automatic paid checkout.'],
]

export default function Landing() {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [role, setRole] = useState('support')
  const [journeyStep, setJourneyStep] = useState(0)
  const [heroScenario, setHeroScenario] = useState('support')
  const heroDemo = HERO_SCENARIOS[heroScenario]
  const goTo = path => { setMobileOpen(false); navigate(path) }

  return (
    <div className="landing landing-v2">
      <header className="landing-nav">
        <div className="landing-container landing-nav__inner">
          <button className="brand-button" type="button" onClick={() => goTo('/')} aria-label="AgentForge home"><BrandLogo size={38} /></button>
          <nav className="desktop-nav" aria-label="Primary navigation">
            <a href="#platform">Product</a>
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
        {mobileOpen && <nav className="mobile-nav" aria-label="Mobile navigation"><a href="#platform" onClick={() => setMobileOpen(false)}>Product</a><a href="#how-it-works" onClick={() => setMobileOpen(false)}>How it works</a><button type="button" onClick={() => goTo('/integrations')}>Apps</button><button type="button" onClick={() => goTo('/templates')}>Templates</button><button type="button" onClick={() => goTo('/pricing')}>Pricing</button><button type="button" onClick={() => goTo('/login')}>Sign in</button><button className="button button--primary" type="button" onClick={() => goTo('/signup')}>Build free</button></nav>}
      </header>

      <main>
        <section className="lf-hero">
          <div className="landing-container lf-hero__grid">
            <div className="lf-hero__copy">
              <div className="lf-eyebrow"><span><Sparkles size={13} /></span> The control plane for agentic operations</div>
              <h1>Build an AI workforce you can <em>see, test, and trust.</em></h1>
              <p>Tell Forge the outcome. AgentForge designs the agents and workflow, connects the right systems, proves the behavior, and keeps every consequential action under human control.</p>
              <div className="lf-hero__actions">
                <button className="button button--primary button--large" type="button" onClick={() => goTo('/signup')}>Design your first operation <ArrowRight size={17} /></button>
                <button className="lf-ask-button" type="button" onClick={() => goTo('/signup')}><MessageCircleMore size={17} /> Meet Forge</button>
              </div>
              <div className="lf-hero__proof"><span><Check size={14} /> Free to start</span><span><Check size={14} /> No credit card</span><span><Check size={14} /> Approval before action</span></div>
            </div>

            <div className="lf-workbench-stage">
              <div className="lf-workbench-switcher" role="tablist" aria-label="Example operation">
                <span>Illustrative</span>
                {Object.entries(HERO_SCENARIOS).map(([key, scenario]) => <button key={key} type="button" role="tab" aria-selected={heroScenario === key} className={heroScenario === key ? 'active' : ''} onClick={() => setHeroScenario(key)}>{scenario.label}</button>)}
              </div>
              <div
                className="lf-workbench"
                aria-label="Interactive example AgentForge workflow"
                onPointerMove={event => {
                  if (event.pointerType !== 'mouse') return
                  const bounds = event.currentTarget.getBoundingClientRect()
                  event.currentTarget.style.setProperty('--tilt-x', `${((event.clientY - bounds.top) / bounds.height - .5) * -3}deg`)
                  event.currentTarget.style.setProperty('--tilt-y', `${((event.clientX - bounds.left) / bounds.width - .5) * 4}deg`)
                }}
                onPointerLeave={event => { event.currentTarget.style.setProperty('--tilt-x', '1deg'); event.currentTarget.style.setProperty('--tilt-y', '-2deg') }}
              >
              <div className="lf-orbit lf-orbit--quality"><TestTube2 size={13} /><span><strong>{heroDemo.tests}</strong> tests passed</span></div>
              <div className="lf-orbit lf-orbit--live"><i /> Live trace ready</div>
              <div className="lf-workbench__bar"><span><i /><i /><i /></span><b>{heroDemo.title}</b><small>Draft</small></div>
              <div className="lf-demo-content" key={heroScenario}>
              <div className="lf-prompt"><div><Sparkles size={16} /></div><p>“{heroDemo.prompt}”</p></div>
              <div className="lf-flow">
                <div className="lf-flow__step"><span><Zap size={16} /></span><div><small>WHEN</small><strong>{heroDemo.trigger}</strong></div><CheckCircle2 size={16} /></div>
                <div className="lf-flow__line" />
                <div className="lf-flow__step lf-flow__step--ai"><span><Bot size={16} /></span><div><small>AI DECIDES</small><strong>{heroDemo.decision}</strong></div><b>AI</b></div>
                <div className="lf-flow__line" />
                <div className="lf-flow__step"><span><ShieldCheck size={16} /></span><div><small>REVIEW</small><strong>{heroDemo.review}</strong></div><CircleDot size={15} /></div>
                <div className="lf-flow__line" />
                <div className="lf-flow__step"><AppLogo slug={heroDemo.app} name={heroDemo.appName} size={34} /><div><small>THEN</small><strong>{heroDemo.action}</strong></div><CheckCircle2 size={16} /></div>
              </div>
              </div>
                <div className="lf-workbench__footer"><span><ShieldCheck size={14} /> External action is approval-gated</span><button type="button" onClick={() => goTo('/signup')}>Use this template <ChevronRight size={14} /></button></div>
              </div>
            </div>
          </div>
          <div className="landing-container lf-hero__signal" aria-label="AgentForge operating loop"><span><Command size={14} /> Describe</span><i /><span><PlugZap size={14} /> Connect</span><i /><span><Gauge size={14} /> Prove</span><i /><span><ShieldCheck size={14} /> Approve</span><i /><span><Activity size={14} /> Operate</span></div>
        </section>

        <section className="lf-spatial" id="spatial" aria-labelledby="spatial-title">
          <div className="landing-container lf-spatial__grid">
            <div className="lf-spatial__copy">
              <span><Sparkles size={13} /> Spatial operations map</span>
              <h2 id="spatial-title">See the whole AI operation—not another flat list of bots.</h2>
              <p>The live 3D system represents agents, tools, approvals, and app actions as one connected operation. Move your pointer across the scene to inspect its depth.</p>
              <ul><li><CheckCircle2 size={15} /><span><strong>Green signals</strong> show reasoning and tool handoffs.</span></li><li><ShieldCheck size={15} /><span><strong>Violet gates</strong> show human control points.</span></li><li><Activity size={15} /><span><strong>Every connection</strong> maps back to a visible run trace.</span></li></ul>
              <button type="button" onClick={() => goTo('/signup')}>Build an operation <ArrowRight size={15} /></button>
            </div>
            <div className="lf-spatial__stage">
              <SpatialOperationsScene />
              <div className="lf-spatial__status"><i /> Live system model <span>Illustrative</span></div>
              <article className="lf-spatial__card lf-spatial__card--agent"><Sparkles size={15} /><div><small>REASON</small><strong>Support specialist</strong></div><span>AI</span></article>
              <article className="lf-spatial__card lf-spatial__card--approval"><ShieldCheck size={15} /><div><small>CONTROL</small><strong>Operator approval</strong></div><span>Gate</span></article>
              <article className="lf-spatial__card lf-spatial__card--trace"><Activity size={15} /><div><small>OBSERVE</small><strong>Trace complete</strong></div><span>1.2s</span></article>
            </div>
          </div>
        </section>

        <section className="lf-role-demo" aria-labelledby="role-demo-title"><div className="landing-container"><div className="lf-heading"><span>Product evidence</span><h2 id="role-demo-title">See the operation, not a vague AI promise.</h2><p>This interactive preview uses illustrative sample data—not customer or production metrics.</p></div><div className="lf-role-tabs" role="tablist">{Object.entries(ROLE_DEMOS).map(([key,item]) => <button key={key} role="tab" aria-selected={role === key} className={role === key ? 'active' : ''} onClick={() => setRole(key)}>{item.label}</button>)}</div><div className="lf-role-scene"><div className="lf-role-scene__copy"><small>Illustrative workspace preview</small><h3>{ROLE_DEMOS[role].title}</h3><div className="lf-role-metrics">{ROLE_DEMOS[role].metrics.map(metric => <span key={metric}>{metric}</span>)}</div></div><div className="lf-role-flow">{ROLE_DEMOS[role].flow.map((step,index) => <div key={step}><span>{index === 1 ? <Sparkles size={14}/> : index === 3 ? <ShieldCheck size={14}/> : <CheckCircle2 size={14}/>}</span><strong>{step}</strong>{index < ROLE_DEMOS[role].flow.length - 1 && <i/>}</div>)}</div></div></div></section>

        <section className="lf-platform" id="platform">
          <div className="landing-container">
            <div className="lf-heading"><span>One connected operating system</span><h2>Everything between the idea and the result.</h2><p>AgentForge gives operators one understandable place to design, control, run, and improve AI work.</p></div>
            <div className="lf-platform__grid">{PLATFORM_CAPABILITIES.map(([Icon, title, text, detail], index) => <article key={title} className={index === 0 ? 'featured' : ''}><div><span><Icon size={19} /></span><small>0{index + 1}</small></div><h3>{title}</h3><p>{text}</p><footer><CheckCircle2 size={13} /> {detail}</footer></article>)}</div>
          </div>
        </section>

        <section className="lf-apps" aria-label="Popular app connections">
          <div className="landing-container">
            <p>Works with the tools your team already uses</p>
            <div className="lf-apps__row">{LANDING_FEATURED_APPS.map(([slug, name]) => <div key={slug}><AppLogo slug={slug} name={name} size={38} /><span>{name}</span></div>)}</div>
            <button type="button" onClick={() => goTo('/integrations')}>See all 100 working app connections <ArrowRight size={14} /></button>
          </div>
        </section>

        <section className="lf-section" id="how-it-works">
          <div className="landing-container">
            <div className="lf-heading"><span>Simple by design</span><h2>From idea to a safe workflow in three clear decisions.</h2><p>You never need to understand agents, chains, triggers, or model routing before you start.</p></div>
            <div className="lf-journey">
              <div className="lf-journey__steps" role="tablist" aria-label="How AgentForge works">{STEPS.map(([Icon, title, text], index) => <button type="button" role="tab" aria-selected={journeyStep === index} className={journeyStep === index ? 'active' : ''} onClick={() => setJourneyStep(index)} key={title}><b>0{index + 1}</b><span><Icon size={18} /></span><div><h3>{title}</h3><p>{text}</p></div><ChevronRight size={17} /></button>)}</div>
              <div className="lf-journey__preview" role="tabpanel"><header><span><CheckCircle2 size={13} /> {STEPS[journeyStep][3]}</span><small>Interactive product preview</small></header><div className="lf-journey__window"><div><Sparkles size={17} /><span><small>FORGE</small><strong>{STEPS[journeyStep][1]}</strong></span></div>{STEPS[journeyStep][4].map((line, index) => <p key={line}><span>{index + 1}</span>{line}<Check size={14} /></p>)}</div><footer><ShieldCheck size={14} /> Nothing is published or executed without your approval.</footer></div>
            </div>
          </div>
        </section>

        <section className="lf-section lf-section--soft">
          <div className="landing-container lf-outcomes">
            <div className="lf-heading lf-heading--left"><span>Start with a real result</span><h2>Twelve complete workflows. Pick one and make it yours.</h2><p>Each starter includes the agent instructions, workflow steps, approval gate, connection checklist, and quality tests. These are three featured examples.</p><button className="button button--primary" type="button" onClick={() => goTo('/templates')}>Explore templates <ArrowRight size={15} /></button></div>
            <div className="lf-outcome-list">{OUTCOMES.map(([title, text], index) => <button type="button" key={title} onClick={() => goTo('/templates')}><span>0{index + 1}</span><div><strong>{title}</strong><p>{text}</p></div><ArrowRight size={17} /></button>)}</div>
          </div>
        </section>

        <section className="lf-trust">
          <div className="landing-container lf-trust__panel">
            <div><span><ShieldCheck size={18} /></span><small>Control is built in</small><h2>AI can think. You decide when it acts.</h2><p>Test privately, inspect every run, require approval, and keep credentials encrypted outside prompts.</p></div>
            <ul><li><CheckCircle2 size={17} /> Human approval gates</li><li><CheckCircle2 size={17} /> Visible run history</li><li><CheckCircle2 size={17} /> Encrypted connections</li><li><CheckCircle2 size={17} /> Versioned production changes</li></ul>
          </div>
        </section>

        <section className="lf-faq" aria-labelledby="faq-title">
          <div className="landing-container lf-faq__grid">
            <div className="lf-faq__intro"><span>Clear before you build</span><h2 id="faq-title">Questions a serious operator should ask.</h2><p>Understand how AgentForge connects, tests, and controls work before you create an account.</p><button type="button" onClick={() => goTo('/signup')}>Start with Forge <ArrowRight size={15} /></button></div>
            <div className="lf-faq__list">{FAQS.map(([question, answer], index) => <details key={question} open={index === 0}><summary><span>{question}</span><i><ChevronRight size={17} /></i></summary><p>{answer}</p></details>)}</div>
          </div>
        </section>

        <section className="lf-final"><div className="landing-container"><div><span>Start small. Prove it. Scale it.</span><h2>What should AgentForge automate for you?</h2><p>Build free, test with sample data, and publish when you are ready.</p></div><div><button className="button button--light button--large" type="button" onClick={() => goTo('/signup')}>Build my first workflow <ArrowRight size={17} /></button><button type="button" onClick={() => goTo('/signup')}>Ask Forge</button></div></div></section>
      </main>

      <footer className="landing-footer"><div className="landing-container landing-footer__top"><div><BrandLogo size={38} /><p>Understandable AI automation for real work.</p></div><div className="landing-footer__links"><div><strong>Product</strong><a href="#how-it-works">How it works</a><button type="button" onClick={() => goTo('/integrations')}>Apps</button><button type="button" onClick={() => goTo('/templates')}>Templates</button></div><div><strong>Start</strong><button type="button" onClick={() => goTo('/pricing')}>Pricing</button><button type="button" onClick={() => goTo('/signup')}>Create account</button><button type="button" onClick={() => goTo('/login')}>Sign in</button></div></div></div><div className="landing-container landing-footer__bottom"><span>© 2026 AgentForge</span><span>Built for dependable automation.</span></div></footer>
    </div>
  )
}

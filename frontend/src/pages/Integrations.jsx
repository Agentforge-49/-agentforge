import { ArrowRight, Bot, Braces, CalendarDays, Database, GitBranch, Mail, MessageSquare, Network, Sheet } from 'lucide-react'
import MarketingLayout from '../components/MarketingLayout'
import AppDirectory from '../components/AppDirectory'
import { useNavigate } from '../lib/router.jsx'

const INTEGRATIONS = [
  { icon: Braces, name: 'HTTP & webhooks', text: 'Call public APIs and start workflows from signed webhook events.', status: 'Live' },
  { icon: Database, name: 'Supabase', text: 'Use AgentForge’s production data, authentication, and durable run records.', status: 'Live' },
  { icon: Sheet, name: 'Google Sheets', text: 'Append approved workflow results to a selected spreadsheet using secured credentials.', status: 'Live with credential' },
  { icon: Database, name: 'Google Drive', text: 'Create report files from approved workflow output.', status: 'Live with credential' },
  { icon: Mail, name: 'Resend', text: 'Send transactional email steps from governed workflows.', status: 'Live' },
  { icon: MessageSquare, name: 'Slack', text: 'Message actions are live; workspace OAuth is ready for provider configuration.', status: 'Setup required' },
  { icon: GitBranch, name: 'GitHub', text: 'Least-privilege account OAuth is ready; repository permissions can be added per workflow later.', status: 'Setup required' },
  { icon: CalendarDays, name: 'Google Workspace OAuth', text: 'Consent-based Drive, Sheets, and Calendar access is ready for cloud credentials.', status: 'Setup required' },
  { icon: Bot, name: 'Claude, GPT & Gemini', text: 'Route one agent contract across Anthropic, OpenAI, and Google model providers.', status: 'Provider key required' },
]

const LAYERS = [
  { icon: Network, title: 'Connect', text: 'Use a typed connector, encrypted credential, or signed webhook instead of scattering secrets through workflows.' },
  { icon: Bot, title: 'Reason', text: 'Choose the right model per agent while preserving the same tool contract, trace, and safety controls.' },
  { icon: Braces, title: 'Extend', text: 'Add your own APIs through HTTP actions, developer keys, and outbound webhook subscriptions.' },
]

export default function Integrations() {
  const navigate = useNavigate()
  return (
    <MarketingLayout>
      <section className="marketing-hero">
        <div className="landing-container">
          <span className="section-kicker">Connected by design</span>
          <h1>Bring agents to the tools where <span>work already happens.</span></h1>
          <p>Connect data, communication, model providers, and internal APIs while keeping credentials encrypted and every action visible.</p>
          <div className="marketing-hero__actions"><button className="button button--primary button--large" type="button" onClick={() => navigate('/signup')}>Start connecting <ArrowRight size={17} /></button></div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="landing-container">
          <div className="marketing-heading">
            <span className="section-kicker">Integration catalog</span>
            <h2>Production connections, with honest readiness labels.</h2>
            <p>“Live” integrations work with credentials you add in the vault. OAuth foundations activate after provider apps are configured.</p>
          </div>
          <div className="marketing-grid">
            {INTEGRATIONS.map(({ icon: Icon, name, text, status }) => (
              <article className="marketing-card" key={name}>
                <div className="marketing-card__topline"><div className="marketing-card__icon"><Icon size={21} /></div><span className={`marketing-badge${status.startsWith('Live') ? '' : ' marketing-badge--setup'}`}>{status}</span></div>
                <h3>{name}</h3><p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-section--tint">
        <div className="landing-container">
          <div className="marketing-heading">
            <span className="section-kicker">Expanded app ecosystem</span>
            <h2>Find the app first. Then choose the right connection path.</h2>
            <p>Choose from 100 curated apps with real connection paths. Native actions are typed; every other app uses the authenticated universal API or signed webhooks.</p>
          </div>
          <AppDirectory />
        </div>
      </section>

      <section className="marketing-section">
        <div className="landing-container">
          <div className="marketing-heading"><span className="section-kicker">One controlled connection layer</span><h2>Integrations should be secure, observable, and reusable.</h2></div>
          <div className="marketing-grid">
            {LAYERS.map(({ icon: Icon, title, text }) => <article className="marketing-card" key={title}><div className="marketing-card__icon"><Icon size={21} /></div><h3>{title}</h3><p>{text}</p></article>)}
          </div>
        </div>
      </section>

      <section className="marketing-cta"><div className="landing-container marketing-cta__panel"><div><h2>Turn connected tools into dependable work.</h2><p>Build your first governed workflow for free.</p></div><button className="button button--light button--large" type="button" onClick={() => navigate('/signup')}>Build a workflow <ArrowRight size={17} /></button></div></section>
    </MarketingLayout>
  )
}

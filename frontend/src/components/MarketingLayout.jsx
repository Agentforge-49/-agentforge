import { ArrowRight, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from '../lib/router.jsx'
import BrandLogo from './BrandLogo'
import '../pages/Landing.css'
import './MarketingLayout.css'

const NAV_ITEMS = [
  { label: 'Platform', path: '/#platform' },
  { label: 'Integrations', path: '/integrations' },
  { label: 'Templates', path: '/templates' },
  { label: 'Pricing', path: '/pricing' },
]

export default function MarketingLayout({ children }) {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const goTo = (path) => {
    setMobileOpen(false)
    if (path.startsWith('/#')) {
      window.location.assign(path)
      return
    }
    navigate(path)
  }

  return (
    <div className="landing marketing">
      <header className="landing-nav">
        <div className="landing-container landing-nav__inner">
          <button className="brand-button" type="button" onClick={() => goTo('/')} aria-label="AgentForge home">
            <BrandLogo size={38} />
          </button>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => (
              <button type="button" key={item.path} onClick={() => goTo(item.path)}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="landing-nav__actions">
            <button className="button button--ghost nav-signin" type="button" onClick={() => goTo('/login')}>
              Sign in
            </button>
            <button className="button button--primary nav-cta" type="button" onClick={() => goTo('/signup')}>
              Start building <ArrowRight size={16} />
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
            {NAV_ITEMS.map((item) => (
              <button type="button" key={item.path} onClick={() => goTo(item.path)}>
                {item.label}
              </button>
            ))}
            <button type="button" onClick={() => goTo('/login')}>Sign in</button>
            <button className="button button--primary" type="button" onClick={() => goTo('/signup')}>
              Start building
            </button>
          </nav>
        )}
      </header>

      <main>{children}</main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer__top">
          <div>
            <BrandLogo size={38} />
            <p>Reliable AI agents for real work.</p>
          </div>
          <div className="landing-footer__links">
            <div>
              <strong>Product</strong>
              <button type="button" onClick={() => goTo('/#platform')}>Platform</button>
              <button type="button" onClick={() => goTo('/integrations')}>Integrations</button>
              <button type="button" onClick={() => goTo('/templates')}>Templates</button>
            </div>
            <div>
              <strong>Company</strong>
              <button type="button" onClick={() => goTo('/pricing')}>Pricing</button>
              <button type="button" onClick={() => goTo('/signup')}>Create account</button>
              <button type="button" onClick={() => goTo('/login')}>Sign in</button>
            </div>
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

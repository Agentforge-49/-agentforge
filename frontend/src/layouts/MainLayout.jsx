import { useState } from 'react'
import { Link, useLocation, useNavigate } from '../lib/router.jsx'
import { Activity, BookOpen, Building2, Cable, ChevronDown, Code2, FlaskConical, LayoutDashboard, LogOut, Menu, PanelsTopLeft, Settings, ShieldCheck, Sparkles, Store, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { isWorkspaceNavActive, WORKSPACE_NAV_GROUPS } from '../lib/workspace-navigation.js'
import BrandLogo from '../components/BrandLogo'
import '../styles/Workspace.css'

const ICONS = {
  apps:Cable, developer:Code2, home:LayoutDashboard, inbox:ShieldCheck,
  knowledge:BookOpen, quality:FlaskConical, runs:Activity, settings:Settings,
  studio:PanelsTopLeft, team:Building2, templates:Store,
}

export default function MainLayout({ children, user }) {
  const navigate = useNavigate()
  const [location] = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = (user?.email || 'U').slice(0, 2).toUpperCase()

  return (
    <div className="workspace-shell">
      <a className="workspace-skip-link" href="#workspace-content">Skip to workspace content</a>

      <header className="workspace-mobile-header">
        <button className="workspace-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <BrandLogo size={29} wordmarkColor="#143024" />
      </header>

      {mobileOpen && <button className="workspace-overlay" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

      <aside className={`workspace-sidebar${mobileOpen ? ' workspace-sidebar-open' : ''}`}>

        <div className="workspace-brand">
          <div className="workspace-brand-row">
            <BrandLogo size={32} wordmarkColor="#143024" />
            <button className="workspace-close-button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
          </div>
          <div className="workspace-badge"><Sparkles size={11} /> Personal workspace</div>
        </div>

        <nav className="workspace-nav">
          {WORKSPACE_NAV_GROUPS.map(group => {
            const containsActive = group.items.some(item => isWorkspaceNavActive(location, item))
            if (group.advanced && !advancedOpen && !containsActive) return (
              <button className="workspace-advanced-toggle" type="button" key={group.label} onClick={() => setAdvancedOpen(true)} aria-expanded="false">
                <Settings size={16.5} /> Advanced <ChevronDown size={14} />
              </button>
            )
            return (
            <div className="workspace-nav-group" key={group.label}>
              <div className="workspace-nav-label">{group.label}{group.advanced && <button type="button" onClick={() => setAdvancedOpen(false)} aria-label="Collapse advanced navigation"><ChevronDown size={12} /></button>}</div>
              {group.items.map(item => {
                const Icon = ICONS[item.icon]
                const isActive = isWorkspaceNavActive(location, item)
                return (
                  <Link key={item.to} to={item.to} onClick={() => setMobileOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`workspace-nav-link${isActive ? ' workspace-nav-link-active' : ''}`}>
                    {isActive && <span className="workspace-nav-marker" />}
                    <Icon size={16.5} /> {item.label}
                  </Link>
                )
              })}
            </div>
          )})}
        </nav>

        <div className="workspace-account">
          <div className="workspace-account-profile">
            <div className="workspace-avatar">{initials}</div>
            <span className="workspace-email">{user?.email}</span>
          </div>
          <button onClick={logout} className="workspace-signout">
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      <main className="workspace-main" id="workspace-content" tabIndex="-1">
        {children}
      </main>
    </div>
  )
}

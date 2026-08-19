import { Cable, KeyRound, Sparkles, Webhook } from 'lucide-react'

import AppDirectory from '../components/AppDirectory'

export default function AppsHub() {
  return (
    <div>
      <header style={{ marginBottom:20 }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:6, color:'#11814c', fontSize:10, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase' }}><Sparkles size={13} /> App ecosystem</div>
        <h1 style={{ margin:'7px 0 5px', color:'#143024', fontSize:25 }}>Connect the systems where work already happens.</h1>
        <p style={{ maxWidth:780, margin:0, color:'#667b6e', fontSize:12, lineHeight:1.6 }}>Choose from 100 curated apps. Every one works through a typed native action or the authenticated universal API and signed-webhook path.</p>
      </header>
      <div className="apps-hub-feature-grid">
        {[
          [Cable,'Native actions','Deeply validated actions for AgentForge-owned connectors.'],
          [Webhook,'Universal events','Start any workflow through rate-limited, signed, deduplicated webhooks.'],
          [KeyRound,'Authenticated API','Bearer tokens, API-key headers, and Basic authentication stay encrypted in the vault.'],
        ].map(([Icon,title,text]) => <article key={title} style={{ padding:14, border:'1px solid #d9e8df', borderRadius:13, background:'#fff' }}><Icon size={18} color="#11814c" /><strong style={{ display:'block', margin:'8px 0 4px', color:'#143024', fontSize:12 }}>{title}</strong><span style={{ color:'#667b6e', fontSize:9.5, lineHeight:1.45 }}>{text}</span></article>)}
      </div>
      <AppDirectory workspace />
    </div>
  )
}

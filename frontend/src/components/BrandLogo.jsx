export default function BrandLogo({
  size = 38,
  showWordmark = true,
  wordmarkColor = '#10231b',
  className = '',
}) {
  const gradientId = `forge-gradient-${String(size).replace(/\W/g, '')}`
  const glowId = `forge-glow-${String(size).replace(/\W/g, '')}`
  return (
    <span className={className} style={{ display:'inline-flex', alignItems:'center', gap:Math.max(9, Math.round(size * .26)), color:wordmarkColor }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flex:'0 0 auto', filter:'drop-shadow(0 7px 12px rgba(5,92,52,.18))' }}>
        <defs>
          <linearGradient id={gradientId} x1="7" y1="5" x2="41" y2="43" gradientUnits="userSpaceOnUse">
            <stop stopColor="#14B86A" />
            <stop offset=".52" stopColor="#087A4B" />
            <stop offset="1" stopColor="#04492D" />
          </linearGradient>
          <radialGradient id={glowId} cx="0" cy="0" r="1" gradientTransform="translate(34 11) rotate(131) scale(19)">
            <stop stopColor="#C8FFE0" stopOpacity=".75" />
            <stop offset="1" stopColor="#C8FFE0" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d="M24 2.8 42 13.2v21.6L24 45.2 6 34.8V13.2L24 2.8Z" fill={`url(#${gradientId})`} />
        <path d="M24 2.8 42 13.2 24 23.6 6 13.2 24 2.8Z" fill={`url(#${glowId})`} />
        <path d="m24 8.6 12.9 7.5v15L24 38.6l-12.9-7.5v-15L24 8.6Z" stroke="rgba(255,255,255,.2)" strokeWidth="1.2" />
        <path d="M14.2 31.9 21.1 14h5.8l7 17.9h-5l-1.25-3.55h-7.5l-1.3 3.55h-4.65Zm7.35-7.55h4.72l-2.34-6.6-2.38 6.6Z" fill="white" />
        <path d="M28.2 14h7.2v4h-5.75l-1.45-4Zm1.5 7.1h4.7v3.9h-3.25l-1.45-3.9Z" fill="#BDFAD9" />
        <circle cx="39.1" cy="8.8" r="3.4" fill="#D9FFE9" stroke="white" strokeWidth="1.3" />
        <path d="m37.7 8.8.9.9 1.8-2" stroke="#087A4B" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showWordmark && <span style={{ display:'inline-flex', alignItems:'baseline', fontSize:Math.max(16, Math.round(size * .47)), fontWeight:780, letterSpacing:'-.048em', lineHeight:1, whiteSpace:'nowrap' }}><span>Agent</span><span style={{ color:'#087A4B' }}>Forge</span></span>}
    </span>
  )
}

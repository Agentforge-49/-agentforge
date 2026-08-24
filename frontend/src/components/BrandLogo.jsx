/** AgentForge's professional emerald lightning identity. */
export default function BrandLogo({
  size = 38,
  showWordmark = true,
  wordmarkColor = '#10231b',
  className = '',
}) {
  return (
    <span
      className={`agentforge-brand ${className}`.trim()}
      style={{ display:'inline-flex', alignItems:'center', gap:Math.max(9, Math.round(size * .28)), color:wordmarkColor }}
    >
      <svg
        className="agentforge-brand__mark"
        width={size}
        height={size}
        viewBox="0 0 40 40"
        xmlns="http://www.w3.org/2000/svg"
        role={showWordmark ? 'presentation' : 'img'}
        aria-label={showWordmark ? undefined : 'AgentForge'}
        style={{ flex:'0 0 auto' }}
      >
        <defs>
          <linearGradient id="agentforge-bolt" x1="9" y1="5" x2="29" y2="35" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6EF0AE" />
            <stop offset="1" stopColor="#12B76A" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="#071E15" />
        <rect x=".75" y=".75" width="38.5" height="38.5" rx="10.25" fill="none" stroke="#2DD886" strokeOpacity=".38" strokeWidth="1.5" />
        <path d="M23.3 4.8 9.8 23.2h9.1l-2.1 12 13.4-18.4h-9.1l2.2-12Z" fill="url(#agentforge-bolt)" />
        <path d="m22.1 9.9-7.5 10.2h7.7l-1.1 6.4 4.2-5.8h-7.8l4.5-10.8Z" fill="#E7FFF3" fillOpacity=".62" />
      </svg>
      {showWordmark && <span className="agentforge-brand__wordmark" style={{ color:wordmarkColor, fontSize:Math.max(16, Math.round(size * .47)), fontWeight:700, letterSpacing:'-.045em', lineHeight:1, whiteSpace:'nowrap' }}>AgentForge</span>}
    </span>
  )
}

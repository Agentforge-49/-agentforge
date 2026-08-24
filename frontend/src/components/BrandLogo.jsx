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
            <stop stopColor="#087A4B" />
            <stop offset="1" stopColor="#32D98B" />
          </linearGradient>
        </defs>
        <path d="M24.2 2.7 7.1 24.1h11.2L15.6 38l17.3-21.8H21.6l2.6-13.5Z" fill="url(#agentforge-bolt)" stroke="#087A4B" strokeWidth=".65" strokeLinejoin="round" />
        <path d="m22 8.6-9.4 11.8h9.8l-1.4 7.1 6.4-8.1h-9.7L22 8.6Z" fill="#DFFFF0" fillOpacity=".7" />
      </svg>
      {showWordmark && <span className="agentforge-brand__wordmark" style={{ color:wordmarkColor, fontSize:Math.max(16, Math.round(size * .47)), fontWeight:700, letterSpacing:'-.045em', lineHeight:1, whiteSpace:'nowrap' }}>AgentForge</span>}
    </span>
  )
}

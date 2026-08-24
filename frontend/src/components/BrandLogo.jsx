/** The original Claude-built AgentForge identity, restored in green. */
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
        <rect width="40" height="40" rx="10" fill="#087A4B" />
        <rect x="1" y="1" width="38" height="38" rx="9" fill="none" stroke="#32D58B" strokeOpacity=".5" />
        <text x="20" y="25.2" fill="white" fontFamily="Arial, Helvetica, sans-serif" fontSize="12.5" fontWeight="800" textAnchor="middle" letterSpacing="-.7">AF</text>
      </svg>
      {showWordmark && <span className="agentforge-brand__wordmark" style={{ color:wordmarkColor, fontSize:Math.max(16, Math.round(size * .47)), fontWeight:700, letterSpacing:'-.045em', lineHeight:1, whiteSpace:'nowrap' }}>AgentForge</span>}
    </span>
  )
}

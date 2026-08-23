import { useId } from 'react'

/** AgentForge signal mark: one controlled rail turns many inputs into forward motion. */
export default function BrandLogo({
  size = 38,
  showWordmark = true,
  wordmarkColor = '#10231b',
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  const railId = `agentforge-rail-${uid}`

  return (
    <span className={`agentforge-brand ${className}`.trim()} style={{ display:'inline-flex', alignItems:'center', gap:Math.max(9, Math.round(size * .22)), color:wordmarkColor }}>
      <svg
        className="agentforge-brand__mark"
        width={Math.round(size * 1.12)}
        height={size}
        viewBox="0 0 56 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role={showWordmark ? 'presentation' : 'img'}
        aria-label={showWordmark ? undefined : 'AgentForge'}
        style={{ flex:'0 0 auto' }}
      >
        <defs>
          <linearGradient id={railId} x1="8" y1="42" x2="45" y2="6" gradientUnits="userSpaceOnUse">
            <stop stopColor="#092A1D" />
            <stop offset=".58" stopColor="#087A4E" />
            <stop offset="1" stopColor="#20CD7B" />
          </linearGradient>
        </defs>
        <path d="M10 42V13.5C10 9.9 12.9 7 16.5 7H44" stroke={`url(#${railId})`} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 25H35.5" stroke={`url(#${railId})`} strokeWidth="7" strokeLinecap="round" />
        <circle cx="44" cy="7" r="5" fill="#1FD07C" stroke="white" strokeWidth="2.2" />
        <circle cx="35.5" cy="25" r="5" fill="#0A7D50" stroke="white" strokeWidth="2.2" />
        <path d="m47.5 16.2 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" fill="#7655D9" />
      </svg>

      {showWordmark && (
        <span className="agentforge-brand__wordmark" style={{ fontSize:Math.max(16, Math.round(size * .47)), color:wordmarkColor, fontWeight:850, letterSpacing:'-.052em', lineHeight:1, whiteSpace:'nowrap' }}>
          AgentForge
        </span>
      )}
    </span>
  )
}

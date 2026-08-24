import { useId } from 'react'

/**
 * The Forge Gate: six independent facets converge around one protected outcome.
 * It is intentionally angular, compact, and recognizable without the wordmark.
 */
export default function BrandLogo({
  size = 38,
  showWordmark = true,
  wordmarkColor = '#0b1f17',
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  const emeraldId = `forge-emerald-${uid}`
  const inkId = `forge-ink-${uid}`

  return (
    <span
      className={`agentforge-brand ${className}`.trim()}
      style={{ display:'inline-flex', alignItems:'center', gap:Math.max(10, Math.round(size * .24)), color:wordmarkColor }}
    >
      <svg
        className="agentforge-brand__mark"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role={showWordmark ? 'presentation' : 'img'}
        aria-label={showWordmark ? undefined : 'AgentForge'}
        style={{ flex:'0 0 auto' }}
      >
        <defs>
          <linearGradient id={emeraldId} x1="13" y1="51" x2="52" y2="12" gradientUnits="userSpaceOnUse">
            <stop stopColor="#08724A" />
            <stop offset="1" stopColor="#24D787" />
          </linearGradient>
          <linearGradient id={inkId} x1="17" y1="8" x2="47" y2="57" gradientUnits="userSpaceOnUse">
            <stop stopColor="#071C14" />
            <stop offset="1" stopColor="#173D2D" />
          </linearGradient>
        </defs>

        <path d="M32 3 57 17.5 45 24.5 32 17 19 24.5 7 17.5 32 3Z" fill={`url(#${inkId})`} />
        <path d="m57 17.5-.2 29L44.6 39.4 44.7 24.6 57 17.5Z" fill={`url(#${emeraldId})`} />
        <path d="m56.8 46.5-24.9 14.3V46.7l12.7-7.3 12.2 7.1Z" fill="#0B6B48" />
        <path d="M31.9 60.8 7 46.5l12.2-7.1 12.7 7.3v14.1Z" fill={`url(#${inkId})`} />
        <path d="m7 46.5.2-29 12.1 7.1-.1 14.8L7 46.5Z" fill="#0E8B5A" />
        <path d="m19.3 24.6 12.7-7.4 12.7 7.4-.1 14.8-12.7 7.3-12.7-7.3.1-14.8Z" fill="#F7FBF9" />
        <path d="m32 24.2 7 4v8l-7 4-7-4v-8l7-4Z" fill={`url(#${emeraldId})`} />
        <path d="M32 27.7v9" stroke="#F7FBF9" strokeWidth="2.2" strokeLinecap="square" />
      </svg>

      {showWordmark && (
        <span className="agentforge-brand__wordmark" style={{ display:'inline-flex', alignItems:'baseline', color:wordmarkColor, lineHeight:1, whiteSpace:'nowrap' }}>
          <span style={{ fontSize:Math.max(16, Math.round(size * .46)), fontWeight:670, letterSpacing:'-.045em' }}>Agent</span>
          <span style={{ fontSize:Math.max(16, Math.round(size * .46)), fontWeight:900, letterSpacing:'-.055em' }}>Forge</span>
        </span>
      )}
    </span>
  )
}

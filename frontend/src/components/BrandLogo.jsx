import { useId } from 'react'

/**
 * AgentForge's forged-flow mark.
 *
 * The continuous white path represents an outcome moving through a controlled
 * workflow. The violet spark is intentionally small: AI accelerates the work,
 * while the emerald system and the operator remain in control.
 */
export default function BrandLogo({
  size = 38,
  showWordmark = true,
  wordmarkColor = '#10231b',
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  const surfaceId = `agentforge-surface-${uid}`
  const glowId = `agentforge-glow-${uid}`

  return (
    <span
      className={`agentforge-brand ${className}`.trim()}
      style={{ display:'inline-flex', alignItems:'center', gap:Math.max(9, Math.round(size * .24)), color:wordmarkColor }}
    >
      <svg
        className="agentforge-brand__mark"
        width={size}
        height={size}
        viewBox="0 0 52 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role={showWordmark ? 'presentation' : 'img'}
        aria-label={showWordmark ? undefined : 'AgentForge'}
        style={{ flex:'0 0 auto', filter:'drop-shadow(0 9px 16px rgba(4,92,55,.22))' }}
      >
        <defs>
          <linearGradient id={surfaceId} x1="8" y1="4" x2="45" y2="49" gradientUnits="userSpaceOnUse">
            <stop stopColor="#21D881" />
            <stop offset=".48" stopColor="#07814E" />
            <stop offset="1" stopColor="#073A28" />
          </linearGradient>
          <radialGradient id={glowId} cx="0" cy="0" r="1" gradientTransform="translate(38 10) rotate(128) scale(26)">
            <stop stopColor="#B59BFF" stopOpacity=".8" />
            <stop offset="1" stopColor="#7049D7" stopOpacity="0" />
          </radialGradient>
        </defs>

        <path d="M9.7 7.8C14.1 3.5 36.8 2.9 42.3 7.7c5.4 4.8 6.2 27.8 1 35.4-4.8 7-28.2 7.1-35.1 1.3-6.6-5.5-5.2-30.1 1.5-36.6Z" fill={`url(#${surfaceId})`} />
        <path d="M9.7 7.8C14.1 3.5 36.8 2.9 42.3 7.7c5.4 4.8 6.2 27.8 1 35.4-4.8 7-28.2 7.1-35.1 1.3-6.6-5.5-5.2-30.1 1.5-36.6Z" fill={`url(#${glowId})`} />
        <path d="M11.8 9.8c4-3.6 24.1-4.1 28.9.1" stroke="white" strokeOpacity=".24" strokeWidth="1.2" strokeLinecap="round" />

        <path d="M14.2 35.7 22.8 17c1.3-2.8 5.2-2.8 6.5 0l8.5 18.7" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18.3 29h15.5" stroke="#C7FFE0" strokeWidth="4.1" strokeLinecap="round" />
        <path d="m31.5 26.1 3.2 2.9-3.2 2.9" stroke="#073A28" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />

        <circle cx="14.2" cy="35.7" r="2.9" fill="#E5FFF0" stroke="white" strokeWidth="1.2" />
        <circle cx="37.8" cy="35.7" r="2.9" fill="#E5FFF0" stroke="white" strokeWidth="1.2" />
        <path d="m38.9 8.2 1.2 3.1 3.1 1.2-3.1 1.2-1.2 3.1-1.2-3.1-3.1-1.2 3.1-1.2 1.2-3.1Z" fill="#D8CCFF" stroke="white" strokeWidth=".8" strokeLinejoin="round" />
      </svg>

      {showWordmark && (
        <span
          className="agentforge-brand__wordmark"
          style={{ display:'inline-flex', alignItems:'baseline', fontSize:Math.max(16, Math.round(size * .47)), fontWeight:850, letterSpacing:'-.055em', lineHeight:1, whiteSpace:'nowrap' }}
        >
          <span>Agent</span><span style={{ color:'#07814E' }}>Forge</span>
        </span>
      )}
    </span>
  )
}

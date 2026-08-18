import { useId } from 'react'

export default function BrandLogo({
  size = 38,
  showWordmark = true,
  wordmarkColor = '#10231b',
  className = '',
}) {
  const gradientId = `agentforge-mark-${useId().replace(/:/g, '')}`
  return (
    <span className={className} style={{ display:'inline-flex', alignItems:'center', gap:Math.max(9, Math.round(size * .24)), color:wordmarkColor }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flex:'0 0 auto', filter:'drop-shadow(0 8px 15px rgba(5,92,52,.2))' }}>
        <defs>
          <linearGradient id={gradientId} x1="8" y1="5" x2="41" y2="43" gradientUnits="userSpaceOnUse">
            <stop stopColor="#19C875" />
            <stop offset=".55" stopColor="#07814E" />
            <stop offset="1" stopColor="#03482C" />
          </linearGradient>
        </defs>
        <path d="M24 2.8 42.4 13.4v21.2L24 45.2 5.6 34.6V13.4L24 2.8Z" fill={`url(#${gradientId})`} />
        <path d="M24 7.2 38.5 15.6v16.8L24 40.8 9.5 32.4V15.6L24 7.2Z" stroke="white" strokeOpacity=".2" strokeWidth="1.2" />
        <path d="M15.2 31.8 22 14.7h4l6.8 17.1h-4.5l-1.4-3.9h-6.3l-1.4 3.9h-4Zm6.7-7.7h3.8L23.8 19l-1.9 5.1Z" fill="white" />
        <path d="M28.6 14.7h7v3.8h-5.5l-1.5-3.8Zm1.8 6.8h4.1v3.7h-2.7l-1.4-3.7Z" fill="#BFF9D7" />
        <circle cx="38.4" cy="9.2" r="3.5" fill="#E0FFEC" stroke="white" strokeWidth="1.2" />
        <path d="m36.9 9.2 1 1 2-2.2" stroke="#07814E" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showWordmark && (
        <span style={{ display:'inline-flex', alignItems:'baseline', fontSize:Math.max(16, Math.round(size * .47)), fontWeight:820, letterSpacing:'-.052em', lineHeight:1, whiteSpace:'nowrap' }}>
          <span>Agent</span><span style={{ color:'#07814E' }}>Forge</span>
        </span>
      )}
    </span>
  )
}

export default function BrandLogo({
  size = 38,
  showWordmark = true,
  wordmarkColor = '#10231b',
  className = '',
}) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.max(9, Math.round(size * 0.28)),
        color: wordmarkColor,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flex: '0 0 auto' }}
      >
        <rect width="40" height="40" rx="12" fill="#087A4B" />
        <path
          d="M11.2 27.7 17.6 12h4.8l6.4 15.7h-4.5l-1.1-3.1h-6.5l-1.1 3.1h-4.4Zm6.8-6.8h4l-2-5.7-2 5.7Z"
          fill="white"
        />
        <circle cx="29.4" cy="10.6" r="2.5" fill="#BDFAD9" />
        <path
          d="M27.7 12.4 24.9 15"
          stroke="#BDFAD9"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>

      {showWordmark && (
        <span
          style={{
            fontSize: Math.max(16, Math.round(size * 0.48)),
            fontWeight: 750,
            letterSpacing: '-0.045em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          AgentForge
        </span>
      )}
    </span>
  )
}

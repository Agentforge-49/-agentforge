import React from 'react';
import { useNavigate } from 'react-router-dom';

const Landing = () => {
  const navigate = useNavigate();

  const styles = {
    page: {
      minHeight: '100vh',
      background:
        'radial-gradient(circle at top, rgba(124,58,237,0.08), transparent 28%), #0B0D12',
      color: '#FFFFFF',
      fontFamily:
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex',
      flexDirection: 'column',
    },

    nav: {
      width: '100%',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      backdropFilter: 'blur(10px)',
      position: 'sticky',
      top: 0,
      zIndex: 20,
      background: 'rgba(11, 13, 18, 0.82)',
    },

    navInner: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '18px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '20px',
    },

    brand: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      cursor: 'pointer',
      userSelect: 'none',
    },

    logo: {
      width: '34px',
      height: '34px',
      borderRadius: '10px',
      background:
        'linear-gradient(135deg, rgba(124,58,237,1) 0%, rgba(139,92,246,1) 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#FFFFFF',
      fontSize: '13px',
      fontWeight: 800,
      letterSpacing: '-0.02em',
      boxShadow: '0 10px 30px rgba(124,58,237,0.35)',
      flexShrink: 0,
    },

    wordmark: {
      fontSize: '18px',
      fontWeight: 700,
      letterSpacing: '-0.03em',
      color: '#F8FAFC',
    },

    navActions: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexShrink: 0,
    },

    textButton: {
      background: 'transparent',
      border: 'none',
      color: 'rgba(255,255,255,0.78)',
      fontSize: '14px',
      fontWeight: 600,
      padding: '10px 12px',
      cursor: 'pointer',
      transition: 'color 0.2s ease, opacity 0.2s ease',
    },

    primaryButton: {
      background: '#7C3AED',
      border: '1px solid rgba(124,58,237,0.95)',
      color: '#FFFFFF',
      fontSize: '14px',
      fontWeight: 700,
      padding: '12px 18px',
      borderRadius: '12px',
      cursor: 'pointer',
      transition:
        'transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
      boxShadow: '0 14px 40px rgba(124,58,237,0.35)',
      whiteSpace: 'nowrap',
    },

    secondaryButton: {
      background: 'transparent',
      border: '1px solid rgba(255,255,255,0.14)',
      color: '#FFFFFF',
      fontSize: '15px',
      fontWeight: 700,
      padding: '14px 22px',
      borderRadius: '14px',
      cursor: 'pointer',
      transition:
        'transform 0.2s ease, border-color 0.2s ease, background 0.2s ease',
      whiteSpace: 'nowrap',
    },

    main: {
      flex: 1,
      width: '100%',
    },

    heroSection: {
      position: 'relative',
      overflow: 'hidden',
      padding: '96px 24px 64px',
    },

    heroInner: {
      maxWidth: '1200px',
      margin: '0 auto',
      position: 'relative',
      zIndex: 1,
    },

    heroContent: {
      maxWidth: '860px',
      position: 'relative',
      zIndex: 2,
    },

    glow: {
      position: 'absolute',
      top: '-40px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '540px',
      height: '300px',
      borderRadius: '999px',
      background: 'rgba(124,58,237,0.32)',
      filter: 'blur(80px)',
      zIndex: -1,
      pointerEvents: 'none',
    },

    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderRadius: '999px',
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.03)',
      color: 'rgba(255,255,255,0.74)',
      fontSize: '13px',
      fontWeight: 600,
      marginBottom: '24px',
    },

    badgeDot: {
      width: '8px',
      height: '8px',
      borderRadius: '999px',
      background: '#7C3AED',
      boxShadow: '0 0 18px rgba(124,58,237,0.85)',
      flexShrink: 0,
    },

    heroTitle: {
      margin: 0,
      fontSize: 'clamp(40px, 7vw, 56px)',
      lineHeight: 1.02,
      letterSpacing: '-0.055em',
      fontWeight: 800,
      color: '#FFFFFF',
      maxWidth: '900px',
    },

    heroSubtitle: {
      marginTop: '24px',
      marginBottom: 0,
      fontSize: 'clamp(17px, 2.2vw, 20px)',
      lineHeight: 1.7,
      color: 'rgba(255,255,255,0.66)',
      maxWidth: '720px',
      fontWeight: 400,
    },

    heroActions: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      marginTop: '34px',
      flexWrap: 'wrap',
    },

    featuresSection: {
      padding: '32px 24px 90px',
    },

    featuresInner: {
      maxWidth: '1200px',
      margin: '0 auto',
    },

    featuresGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: '20px',
    },

    card: {
      position: 'relative',
      background:
        'linear-gradient(180deg, rgba(26,29,39,0.95) 0%, rgba(18,20,28,0.98) 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '22px',
      padding: '28px',
      minHeight: '240px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
      transition:
        'transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease',
      overflow: 'hidden',
    },

    cardGlow: {
      position: 'absolute',
      top: '-60px',
      right: '-40px',
      width: '160px',
      height: '160px',
      borderRadius: '999px',
      background: 'rgba(124,58,237,0.12)',
      filter: 'blur(40px)',
      pointerEvents: 'none',
    },

    iconWrap: {
      width: '52px',
      height: '52px',
      borderRadius: '16px',
      background: 'rgba(124,58,237,0.12)',
      border: '1px solid rgba(124,58,237,0.28)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '20px',
      color: '#C4B5FD',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
    },

    cardTitle: {
      margin: 0,
      fontSize: '22px',
      lineHeight: 1.2,
      letterSpacing: '-0.03em',
      color: '#FFFFFF',
      fontWeight: 700,
    },

    cardDescription: {
      marginTop: '14px',
      marginBottom: 0,
      color: 'rgba(255,255,255,0.68)',
      fontSize: '15px',
      lineHeight: 1.75,
      maxWidth: '95%',
    },

    footer: {
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '24px',
      textAlign: 'center',
      color: 'rgba(255,255,255,0.45)',
      fontSize: '13px',
      letterSpacing: '0.01em',
    },
  };

  const iconCommon = {
    width: 24,
    height: 24,
    stroke: 'currentColor',
    strokeWidth: 1.9,
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  const RobotIcon = () => (
    <svg viewBox="0 0 24 24" style={iconCommon} aria-hidden="true">
      <path d="M12 3v3" />
      <path d="M8 6h8" />
      <rect x="4" y="8" width="16" height="10" rx="4" />
      <path d="M9 18v2" />
      <path d="M15 18v2" />
      <path d="M7 12h.01" />
      <path d="M17 12h.01" />
      <path d="M8.5 15c1 .8 2.2 1.2 3.5 1.2s2.5-.4 3.5-1.2" />
      <path d="M4 12H2" />
      <path d="M22 12h-2" />
    </svg>
  );

  const LinkIcon = () => (
    <svg viewBox="0 0 24 24" style={iconCommon} aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.7 5.23" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07l1.41-1.41" />
    </svg>
  );

  const RocketIcon = () => (
    <svg viewBox="0 0 24 24" style={iconCommon} aria-hidden="true">
      <path d="M4.5 19.5c2.5-.2 4.2-1 5.7-2.5" />
      <path d="M8 16l-2.5 2.5" />
      <path d="M13 11l-4 4" />
      <path d="M14 10c3.4-3.4 4.7-6.9 5-9 0 0-5.6.4-9 3.8L7 8l9 9 3-3z" />
      <circle cx="15.5" cy="8.5" r="1.2" />
    </svg>
  );

  const featureCards = [
    {
      title: 'Build agents in minutes',
      description:
        'Turn a plain-language task into a working AI agent fast—define the goal, set inputs, and launch without touching code.',
      icon: <RobotIcon />,
    },
    {
      title: 'Chain them together',
      description:
        'Connect agents so one output becomes the next input. Research, transform, summarize, and route work automatically.',
      icon: <LinkIcon />,
    },
    {
      title: 'Deploy without code',
      description:
        'Publish workflows instantly with a polished runtime and no infrastructure overhead, servers, or DevOps setup.',
      icon: <RocketIcon />,
    },
  ];

  return (
    <div style={styles.page}>
      <header style={styles.nav}>
        <div style={styles.navInner}>
          <div style={styles.brand} onClick={() => navigate('/')}>
            <div style={styles.logo}>AF</div>
            <div style={styles.wordmark}>AgentForge</div>
          </div>

          <div style={styles.navActions}>
            <button
              type="button"
              style={styles.textButton}
              onClick={() => navigate('/login')}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#FFFFFF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.78)';
              }}
            >
              Sign in
            </button>

            <button
              type="button"
              style={styles.primaryButton}
              onClick={() => navigate('/signup')}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow =
                  '0 18px 46px rgba(124,58,237,0.45)';
                e.currentTarget.style.background = '#8B5CF6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow =
                  '0 14px 40px rgba(124,58,237,0.35)';
                e.currentTarget.style.background = '#7C3AED';
              }}
            >
              Get started
            </button>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        <section style={styles.heroSection}>
          <div style={styles.heroInner}>
            <div style={styles.heroContent}>
              <div style={styles.glow} />

              <div style={styles.badge}>
                <span style={styles.badgeDot} />
                No-code AI agents for real work
              </div>

              <h1 style={styles.heroTitle}>
                Build AI workers in minutes, not workflows in weeks
              </h1>

              <p style={styles.heroSubtitle}>
                AgentForge lets anyone create AI agents, connect them into
                multi-step systems, and ship powerful automations without
                writing code. From research and content generation to internal
                ops and customer workflows, your AI team starts here.
              </p>

              <div style={styles.heroActions}>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={() => navigate('/signup')}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow =
                      '0 18px 46px rgba(124,58,237,0.45)';
                    e.currentTarget.style.background = '#8B5CF6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow =
                      '0 14px 40px rgba(124,58,237,0.35)';
                    e.currentTarget.style.background = '#7C3AED';
                  }}
                >
                  Get Started Free
                </button>

                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => navigate('/login')}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.borderColor =
                      'rgba(124,58,237,0.55)';
                    e.currentTarget.style.background =
                      'rgba(124,58,237,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor =
                      'rgba(255,255,255,0.14)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  Sign In
                </button>
              </div>
            </div>
          </div>
        </section>

        <section style={styles.featuresSection}>
          <div style={styles.featuresInner}>
            <div style={styles.featuresGrid}>
              {featureCards.map((card) => (
                <div
                  key={card.title}
                  style={styles.card}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.borderColor =
                      'rgba(124,58,237,0.45)';
                    e.currentTarget.style.boxShadow =
                      '0 24px 70px rgba(0,0,0,0.35)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor =
                      'rgba(255,255,255,0.08)';
                    e.currentTarget.style.boxShadow =
                      '0 20px 60px rgba(0,0,0,0.28)';
                  }}
                >
                  <div style={styles.cardGlow} />
                  <div style={styles.iconWrap}>{card.icon}</div>
                  <h3 style={styles.cardTitle}>{card.title}</h3>
                  <p style={styles.cardDescription}>{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer style={styles.footer}>(c) 2026 AgentForge</footer>
    </div>
  );
};

export default Landing;
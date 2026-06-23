// src/styles/theme.js

const theme = {
  colors: {
    bgBase: "#0A0D14",
    bgSurface: "#111827",
    bgSurfaceHover: "#161F32",
    border: "rgba(255, 255, 255, 0.08)",
    borderHover: "rgba(255, 255, 255, 0.16)",
    textPrimary: "#F8FAFC",
    textSecondary: "#94A3B8",
    textTertiary: "#64748B",
    accent: "#7C3AED",
    accentHover: "#8B5CF6",
    accentGlow: "rgba(124, 58, 237, 0.35)",
    success: "#34D399",
    successBg: "rgba(16, 185, 129, 0.16)",
    danger: "#F87171",
    dangerBg: "rgba(239, 68, 68, 0.16)",
    warning: "#FBBF24",
    warningBg: "rgba(245, 158, 11, 0.16)",
  },

  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
    pill: "999px",
  },

  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    xxl: "32px",
  },

  font: {
    family: "'Inter', -apple-system, system-ui, sans-serif",
    sizes: {
      xs: "11px",
      sm: "12px",
      base: "14px",
      md: "15px",
      lg: "18px",
      xl: "22px",
      xxl: "28px",
    },
  },

  shadow: {
    sm: "0 10px 30px rgba(0, 0, 0, 0.28)",
    glow: "0 0 20px rgba(124, 58, 237, 0.35)",
  },

  transition: "all 0.15s ease",
};

export default theme;
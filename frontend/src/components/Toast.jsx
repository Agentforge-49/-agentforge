// src/components/Toast.jsx

import { useEffect, useState } from "react";

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const hideToast = () => {
    setToast(null);
  };

  return [toast, showToast, hideToast];
}

export default function Toast({
  message,
  type = "success",
  onClose,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const enterTimer = setTimeout(() => {
      setVisible(true);
    }, 10);

    const closeTimer = setTimeout(() => {
      handleClose();
    }, 3500);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(closeTimer);
    };
  }, []);

  const handleClose = () => {
    setVisible(false);

    setTimeout(() => {
      onClose?.();
    }, 250);
  };

  const config = {
    success: {
      border: "#34D399",
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          style={{ flexShrink: 0 }}
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="#34D399"
            strokeWidth="2"
          />
          <path
            d="M8 12L11 15L16 9"
            stroke="#34D399"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    error: {
      border: "#F87171",
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          style={{ flexShrink: 0 }}
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="#F87171"
            strokeWidth="2"
          />
          <path
            d="M9 9L15 15M15 9L9 15"
            stroke="#F87171"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    info: {
      border: "#A78BFA",
      icon: (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          style={{ flexShrink: 0 }}
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="#A78BFA"
            strokeWidth="2"
          />
          <path
            d="M12 11V16"
            stroke="#A78BFA"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="8" r="1.2" fill="#A78BFA" />
        </svg>
      ),
    },
  };

  const current = config[type] || config.success;

  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        zIndex: 999,
        minWidth: "320px",
        maxWidth: "420px",
        background: "#1A1D27",
        borderLeft: `4px solid ${current.border}`,
        borderRadius: "12px",
        padding: "14px 18px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        color: "#FFFFFF",
        fontSize: "14px",
        transition: "all 0.25s ease",
        transform: visible
          ? "translateX(0)"
          : "translateX(100%)",
        opacity: visible ? 1 : 0,
      }}
    >
      {current.icon}

      <div
        style={{
          flex: 1,
          lineHeight: "1.5",
          paddingRight: "16px",
        }}
      >
        {message}
      </div>

      <button
        onClick={handleClose}
        aria-label="Close toast"
        style={{
          background: "transparent",
          border: "none",
          color: "#9CA3AF",
          cursor: "pointer",
          fontSize: "16px",
          lineHeight: 1,
          padding: 0,
          margin: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
const SKELETON_ANIMATION_NAME = "agentforgeSkeletonShimmer";

let hasInjectedSkeletonStyles = false;

function injectSkeletonStyles() {
  if (typeof document === "undefined" || hasInjectedSkeletonStyles) return;

  const existing = document.getElementById("agentforge-skeleton-styles");
  if (existing) {
    hasInjectedSkeletonStyles = true;
    return;
  }

  const styleTag = document.createElement("style");
  styleTag.id = "agentforge-skeleton-styles";
  styleTag.textContent = `
    @keyframes ${SKELETON_ANIMATION_NAME} {
      0% {
        background-position: -200% 0;
      }
      100% {
        background-position: 200% 0;
      }
    }
  `;
  document.head.appendChild(styleTag);
  hasInjectedSkeletonStyles = true;
}

export default function Skeleton({
  width = "100%",
  height = "16px",
  borderRadius = "8px",
  style = {},
}) {
  injectSkeletonStyles();

  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius,
        background:
          "linear-gradient(90deg, #EDF3EF 0%, #DCE8E1 35%, #F8FBF9 50%, #DCE8E1 65%, #EDF3EF 100%)",
        backgroundSize: "200% 100%",
        animation: `${SKELETON_ANIMATION_NAME} 1.5s linear infinite`,
        ...style,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "200px",
        backgroundColor: "#FFFFFF",
        border: "1px solid #DCE7DF",
        borderRadius: "14px",
        padding: "18px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        gap: "14px",
        boxSizing: "border-box",
      }}
    >
      <Skeleton width="72%" height="24px" borderRadius="10px" />
      <Skeleton width="58%" height="16px" borderRadius="8px" />
      <div style={{ flex: 1 }} />
      <Skeleton width="34%" height="14px" borderRadius="999px" />
    </div>
  );
}

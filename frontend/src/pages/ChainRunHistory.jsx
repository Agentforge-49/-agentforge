// src/pages/ChainRunHistory.jsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { getChain, getChainRuns } from "../lib/api";

const COLORS = {
  background: "#0F1117",
  card: "#1A1D27",
  border: "#2A2D3E",
  purple: "#7C3AED",
  text: "#F9FAFB",
  muted: "#9CA3AF",
  greenBg: "#065F46",
  greenText: "#34D399",
  redBg: "#7F1D1D",
  redText: "#FCA5A5",
};

function formatRelativeTime(dateString) {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = Math.max(0, now - then);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return "—";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

function statusStyles(status) {
  if (status === "completed") {
    return {
      backgroundColor: COLORS.greenBg,
      color: COLORS.greenText,
      label: "Completed",
    };
  }

  return {
    backgroundColor: COLORS.redBg,
    color: COLORS.redText,
    label: "Failed",
  };
}

function RunStatusIcon({ status }) {
  if (status === "completed") {
    return (
      <div
        style={{
          width: 34,
          height: 34,
          minWidth: 34,
          borderRadius: 999,
          backgroundColor: COLORS.greenBg,
          color: COLORS.greenText,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `1px solid ${COLORS.greenText}22`,
        }}
      >
        <Check size={18} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: 34,
        height: 34,
        minWidth: 34,
        borderRadius: 999,
        backgroundColor: COLORS.redBg,
        color: COLORS.redText,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1px solid ${COLORS.redText}22`,
      }}
    >
      <X size={18} />
    </div>
  );
}

function StepCard({ step, index, isLast }) {
  const completed = step.status === "completed";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          backgroundColor: "#141824",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 30,
                height: 30,
                minWidth: 30,
                borderRadius: 999,
                backgroundColor: COLORS.purple,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {index + 1}
            </div>

            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: COLORS.text,
                }}
              >
                {step.agent_name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.muted,
                  marginTop: 4,
                }}
              >
                Step {index + 1} in chain
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: completed ? COLORS.greenBg : COLORS.redBg,
                color: completed ? COLORS.greenText : COLORS.redText,
              }}
            >
              {completed ? "Completed" : "Failed"}
            </div>

            <div
              style={{
                fontSize: 12,
                color: COLORS.muted,
              }}
            >
              {formatDuration(step.duration_ms)} • {step.tokens_used ?? 0} tokens
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: COLORS.muted,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 8,
              }}
            >
              Input
            </div>
            <div
              style={{
                backgroundColor: COLORS.background,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: 12,
                color: COLORS.text,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {step.input || "No input recorded."}
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: COLORS.muted,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 8,
              }}
            >
              Output
            </div>
            <div
              style={{
                backgroundColor: COLORS.background,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: 12,
                color: COLORS.text,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {step.output || "No output recorded."}
            </div>
          </div>
        </div>
      </div>

      {!isLast && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: COLORS.muted,
            paddingBottom: 2,
          }}
        >
          <ChevronDown size={18} />
        </div>
      )}
    </div>
  );
}

export default function ChainRunHistory() {
  const navigate = useNavigate();
  const { id: chainId } = useParams();

  const [chain, setChain] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedRuns, setExpandedRuns] = useState({});

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [chainResponse, runsResponse] = await Promise.all([
        getChain(chainId),
        getChainRuns(chainId),
      ]);

      setChain(chainResponse || null);

      const sortedRuns = Array.isArray(runsResponse)
        ? [...runsResponse].sort(
            (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
          )
        : [];

      setRuns(sortedRuns);
    } catch (err) {
      setError(
        err?.message || "Something went wrong while loading chain run history."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [chainId]);

  const runCountLabel = useMemo(() => {
    const count = runs.length;
    return `${count} run${count === 1 ? "" : "s"} total`;
  }, [runs.length]);

  const toggleRun = (runId) => {
    setExpandedRuns((prev) => ({
      ...prev,
      [runId]: !prev[runId],
    }));
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: COLORS.background,
          color: COLORS.text,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            fontSize: 16,
            color: COLORS.muted,
          }}
        >
          Loading run history...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: COLORS.background,
          color: COLORS.text,
          fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
          }}
        >
          <button
            onClick={() => navigate("/chains")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              backgroundColor: "transparent",
              color: COLORS.muted,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: "10px 14px",
              cursor: "pointer",
              marginBottom: 20,
            }}
          >
            <ArrowLeft size={16} />
            Back to Chains
          </button>

          <div
            style={{
              backgroundColor: "#2A1115",
              border: "1px solid #7F1D1D",
              color: COLORS.redText,
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              Failed to load run history
            </div>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: "transparent",
                color: COLORS.redText,
                border: `1px solid ${COLORS.redText}`,
                borderRadius: 10,
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: COLORS.background,
        color: COLORS.text,
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            marginBottom: 24,
          }}
        >
          <button
            onClick={() => navigate("/chains")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              backgroundColor: "transparent",
              color: COLORS.muted,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: "10px 14px",
              cursor: "pointer",
              marginBottom: 18,
              transition: "border-color 150ms ease, color 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = COLORS.purple;
              e.currentTarget.style.color = COLORS.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = COLORS.border;
              e.currentTarget.style.color = COLORS.muted;
            }}
          >
            <ArrowLeft size={16} />
            Back to Chains
          </button>

          <div
            style={{
              backgroundColor: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 16,
              padding: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 30,
                    lineHeight: 1.2,
                    fontWeight: 800,
                    color: COLORS.text,
                  }}
                >
                  {chain?.name || "Chain Run History"}
                </h1>

                <div
                  style={{
                    marginTop: 8,
                    color: COLORS.muted,
                    fontSize: 14,
                  }}
                >
                  {runCountLabel}
                </div>

                {chain?.description ? (
                  <div
                    style={{
                      marginTop: 12,
                      color: COLORS.muted,
                      fontSize: 14,
                      lineHeight: 1.6,
                      maxWidth: 720,
                    }}
                  >
                    {chain.description}
                  </div>
                ) : null}
              </div>

              {Array.isArray(chain?.agents) && chain.agents.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignSelf: "center",
                  }}
                >
                  {chain.agents.map((agent, index) => (
                    <div
                      key={agent.id || `${agent.name}-${index}`}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        backgroundColor: "#141824",
                        border: `1px solid ${COLORS.border}`,
                        color: COLORS.text,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {agent.name}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {runs.length === 0 ? (
          <div
            style={{
              backgroundColor: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 16,
              padding: "56px 24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: COLORS.text,
                marginBottom: 10,
              }}
            >
              No runs yet
            </div>
            <div
              style={{
                fontSize: 14,
                color: COLORS.muted,
                marginBottom: 24,
              }}
            >
              This chain hasn’t been run yet. Start a run to see the full step-by-step history here.
            </div>
            <button
              onClick={() => navigate(`/chains/${chainId}/run`)}
              style={{
                backgroundColor: COLORS.purple,
                color: "#FFFFFF",
                border: "none",
                borderRadius: 12,
                padding: "12px 18px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Run this chain
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 16,
            }}
          >
            {runs.map((run, index) => {
              const expanded = !!expandedRuns[run.id];
              const status = statusStyles(run.status);

              return (
                <div
                  key={run.id}
                  style={{
                    backgroundColor: COLORS.card,
                    border: `1px solid ${expanded ? COLORS.purple : COLORS.border}`,
                    borderRadius: 16,
                    overflow: "hidden",
                    transition: "border-color 150ms ease, transform 150ms ease",
                  }}
                >
                  <button
                    onClick={() => toggleRun(run.id)}
                    style={{
                      width: "100%",
                      backgroundColor: "transparent",
                      border: "none",
                      color: "inherit",
                      cursor: "pointer",
                      padding: 20,
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.parentElement.style.borderColor = COLORS.purple;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.parentElement.style.borderColor = expanded
                        ? COLORS.purple
                        : COLORS.border;
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <RunStatusIcon status={run.status} />

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                              marginBottom: 8,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: COLORS.text,
                              }}
                            >
                              Run #{runs.length - index}
                            </div>

                            <div
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 700,
                                backgroundColor: status.backgroundColor,
                                color: status.color,
                              }}
                            >
                              {status.label}
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 16,
                              flexWrap: "wrap",
                              color: COLORS.muted,
                              fontSize: 13,
                            }}
                          >
                            <span>{formatRelativeTime(run.started_at)}</span>
                            <span>{formatDuration(run.total_duration_ms)}</span>
                            <span>{run.total_tokens ?? 0} tokens</span>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          color: COLORS.muted,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: COLORS.muted,
                          }}
                        >
                          {expanded ? "Hide details" : "View details"}
                        </div>
                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>
                  </button>

                  {expanded && (
                    <div
                      style={{
                        borderTop: `1px solid ${COLORS.border}`,
                        padding: 20,
                        paddingTop: 18,
                      }}
                    >
                      <div
                        style={{
                          marginBottom: 20,
                          backgroundColor: "#141824",
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 14,
                          padding: 16,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: COLORS.muted,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginBottom: 8,
                          }}
                        >
                          Starting message
                        </div>
                        <div
                          style={{
                            color: COLORS.text,
                            fontSize: 14,
                            lineHeight: 1.7,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {run.initial_message || "No starting message recorded."}
                        </div>
                      </div>

                      {run.status === "failed" && run.error_message ? (
                        <div
                          style={{
                            marginBottom: 20,
                            backgroundColor: "#2A1115",
                            border: "1px solid #7F1D1D",
                            borderRadius: 14,
                            padding: 16,
                            color: COLORS.redText,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              marginBottom: 8,
                            }}
                          >
                            Error
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              lineHeight: 1.6,
                            }}
                          >
                            {run.error_message}
                          </div>
                        </div>
                      ) : null}

                      <div
                        style={{
                          marginBottom: 20,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: COLORS.text,
                            marginBottom: 14,
                          }}
                        >
                          Chain steps
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          {(run.steps || []).map((step, stepIndex) => (
                            <StepCard
                              key={`${run.id}-${stepIndex}-${step.agent_name}`}
                              step={step}
                              index={stepIndex}
                              isLast={stepIndex === run.steps.length - 1}
                            />
                          ))}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            backgroundColor: "#141824",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 12,
                            padding: "12px 14px",
                            color: COLORS.text,
                            fontSize: 13,
                          }}
                        >
                          <span style={{ color: COLORS.muted }}>Total duration:</span>{" "}
                          <strong>{formatDuration(run.total_duration_ms)}</strong>
                        </div>

                        <div
                          style={{
                            backgroundColor: "#141824",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 12,
                            padding: "12px 14px",
                            color: COLORS.text,
                            fontSize: 13,
                          }}
                        >
                          <span style={{ color: COLORS.muted }}>Total tokens:</span>{" "}
                          <strong>{run.total_tokens ?? 0}</strong>
                        </div>

                        <div
                          style={{
                            backgroundColor: "#141824",
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: 12,
                            padding: "12px 14px",
                            color: COLORS.text,
                            fontSize: 13,
                          }}
                        >
                          <span style={{ color: COLORS.muted }}>Started:</span>{" "}
                          <strong>{new Date(run.started_at).toLocaleString()}</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
// src/pages/Settings.jsx

import { useState } from "react";

export default function Settings() {
  const [fullName, setFullName] = useState("Seyar Faqiri");
  const [saved, setSaved] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState("");

  const apiUsed = 42;
  const apiLimit = 50;
  const percentage = (apiUsed / apiLimit) * 100;

  const handleSave = () => {
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 2500);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0F1117",
        color: "#FFFFFF",
        fontFamily: "system-ui, sans-serif",
        padding: "32px",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <h1
          style={{
            fontSize: "32px",
            fontWeight: 700,
            marginBottom: "24px",
          }}
        >
          Settings
        </h1>

        {/* PROFILE */}
        <div
          style={{
            backgroundColor: "#1A1D27",
            border: "1px solid #2A2D3E",
            borderRadius: "16px",
            padding: "24px",
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 600,
              marginBottom: "20px",
            }}
          >
            Profile
          </h2>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  color: "#9CA3AF",
                  fontSize: "14px",
                }}
              >
                Email Address
              </label>

              <input
                type="email"
                value="seyar@agentforge.ai"
                readOnly
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #2A2D3E",
                  backgroundColor: "#11151E",
                  color: "#6B7280",
                  outline: "none",
                  boxSizing: "border-box",
                  cursor: "not-allowed",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  color: "#9CA3AF",
                  fontSize: "14px",
                }}
              >
                Full Name
              </label>

              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #2A2D3E",
                  backgroundColor: "#0F1117",
                  color: "#FFFFFF",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <button
                onClick={handleSave}
                style={{
                  backgroundColor: "#7C3AED",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "10px",
                  padding: "12px 20px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Save Changes
              </button>

              {saved && (
                <span
                  style={{
                    marginLeft: "12px",
                    color: "#22C55E",
                    fontSize: "14px",
                  }}
                >
                  Settings saved successfully
                </span>
              )}
            </div>
          </div>
        </div>

        {/* USAGE */}
        <div
          style={{
            backgroundColor: "#1A1D27",
            border: "1px solid #2A2D3E",
            borderRadius: "16px",
            padding: "24px",
            marginBottom: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 600,
              marginBottom: "20px",
            }}
          >
            Usage
          </h2>

          <div
            style={{
              marginBottom: "12px",
              color: "#FFFFFF",
              fontWeight: 500,
            }}
          >
            42 of 50 calls used this month
          </div>

          <div
            style={{
              width: "100%",
              height: "12px",
              backgroundColor: "#0F1117",
              borderRadius: "999px",
              overflow: "hidden",
              border: "1px solid #2A2D3E",
            }}
          >
            <div
              style={{
                width: `${percentage}%`,
                height: "100%",
                backgroundColor: "#7C3AED",
                transition: "width 0.3s ease",
              }}
            />
          </div>

          <p
            style={{
              color: "#9CA3AF",
              marginTop: "16px",
              marginBottom: "16px",
            }}
          >
            Upgrade to Pro for 500 calls/month
          </p>

          <button
            style={{
              backgroundColor: "transparent",
              color: "#7C3AED",
              border: "1px solid #7C3AED",
              borderRadius: "10px",
              padding: "12px 20px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Upgrade to Pro
          </button>
        </div>

        {/* DANGER ZONE */}
        <div
          style={{
            backgroundColor: "#1A1D27",
            border: "1px solid #2A2D3E",
            borderRadius: "16px",
            padding: "24px",
          }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "#EF4444",
              marginBottom: "20px",
            }}
          >
            Danger Zone
          </h2>

          {!showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                backgroundColor: "transparent",
                color: "#EF4444",
                border: "1px solid #EF4444",
                borderRadius: "10px",
                padding: "12px 20px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Delete Account
            </button>
          )}

          {showDeleteConfirm && (
            <div>
              <p
                style={{
                  color: "#FFFFFF",
                  marginBottom: "12px",
                }}
              >
                Are you sure? Type DELETE to confirm
              </p>

              <input
                type="text"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="Type DELETE"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1px solid #2A2D3E",
                  backgroundColor: "#0F1117",
                  color: "#FFFFFF",
                  marginBottom: "16px",
                  boxSizing: "border-box",
                }}
              />

              <button
                disabled={deleteText !== "DELETE"}
                style={{
                  backgroundColor:
                    deleteText === "DELETE"
                      ? "#DC2626"
                      : "transparent",
                  color:
                    deleteText === "DELETE"
                      ? "#FFFFFF"
                      : "#6B7280",
                  border:
                    deleteText === "DELETE"
                      ? "1px solid #DC2626"
                      : "1px solid #374151",
                  borderRadius: "10px",
                  padding: "12px 20px",
                  cursor:
                    deleteText === "DELETE"
                      ? "pointer"
                      : "not-allowed",
                  fontWeight: 600,
                }}
              >
                Permanently Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
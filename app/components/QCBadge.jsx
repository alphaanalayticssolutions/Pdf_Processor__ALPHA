"use client";

import { useState } from "react";

const STATUS_CONFIG = {
  PASS:    { emoji: "✅", label: "QC Pass",    bg: "#dcfce7", color: "#166534", border: "#86efac" },
  WARNING: { emoji: "⚠️", label: "QC Warning", bg: "#fef9c3", color: "#713f12", border: "#fde047" },
  FAIL:    { emoji: "❌", label: "QC Fail",    bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5" },
};

function ModalSection({ title, items, textColor, bgColor }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: "20px" }}>
      <p style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: 600, color: textColor }}>{title}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: "13px", color: "#374151", background: bgColor, borderRadius: "6px", padding: "8px 12px", marginBottom: "6px", lineHeight: "1.5" }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function QCBadge({ toolName, toolOutput, metadata }) {
  const [qcResult, setQcResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState(null);

  async function handleRunQC() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/qc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName, toolOutput, metadata }),
      });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      setQcResult(data);
      setModalOpen(true);
    } catch (err) {
      setError("QC check failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const cfg = qcResult ? STATUS_CONFIG[qcResult.status] : null;

  return (
    <>
      <div style={{ marginTop: "12px" }}>
        {!qcResult && !loading && (
          <button onClick={handleRunQC}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
            🔍 Run QC Check
          </button>
        )}

        {loading && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "999px", background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", fontSize: "13px", fontWeight: 500 }}>
            🔄 Running QC…
          </span>
        )}

        {qcResult && !loading && cfg && (
          <button onClick={() => setModalOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 16px", borderRadius: "999px", background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
            {cfg.emoji} {cfg.label} — Score: {qcResult.score}/100
          </button>
        )}

        {error && <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#dc2626" }}>{error}</p>}
      </div>

      {modalOpen && qcResult && cfg && (
        <>
          <div onClick={() => setModalOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1000, background: "#ffffff", borderRadius: "16px", padding: "28px", width: "90%", maxWidth: "520px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 600, color: "#111827" }}>QC Report — {toolName}</h2>
              <button onClick={() => setModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#9ca3af", lineHeight: 1, padding: "0 4px" }}>×</button>
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px", borderRadius: "12px", background: cfg.bg, border: `1px solid ${cfg.border}`, marginBottom: "24px" }}>
              <span style={{ fontSize: "32px", lineHeight: 1 }}>{cfg.emoji}</span>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 700, color: cfg.color }}>
                  {qcResult.status} — Score {qcResult.score} / 100
                </p>
                <p style={{ margin: 0, fontSize: "13px", color: cfg.color, opacity: 0.85, lineHeight: 1.5 }}>
                  {qcResult.summary}
                </p>
              </div>
            </div>

            <ModalSection title="❌ Issues" items={qcResult.issues} textColor="#dc2626" bgColor="#fef2f2" />
            <ModalSection title="⚠️ Warnings" items={qcResult.warnings} textColor="#d97706" bgColor="#fffbeb" />
            <ModalSection title="💡 Recommendations" items={qcResult.recommendations} textColor="#2563eb" bgColor="#eff6ff" />

            {qcResult.issues?.length === 0 && qcResult.warnings?.length === 0 && (
              <p style={{ margin: 0, padding: "14px", borderRadius: "8px", background: "#dcfce7", color: "#166534", fontSize: "14px" }}>
                ✅ No issues found. Output looks clean!
              </p>
            )}

            <div style={{ marginTop: "24px", textAlign: "right" }}>
              <button onClick={() => setModalOpen(false)}
                style={{ padding: "8px 20px", borderRadius: "8px", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#374151", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
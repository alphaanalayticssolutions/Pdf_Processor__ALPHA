"use client";

import { useState } from "react";

const STATUS_CONFIG = {
  PASS:    { emoji: "✅", label: "QC Pass",    bg: "#dcfce7", color: "#166534", border: "#86efac", barColor: "#16a34a" },
  WARNING: { emoji: "⚠️", label: "QC Warning", bg: "#fef9c3", color: "#713f12", border: "#fde047", barColor: "#ca8a04" },
  FAIL:    { emoji: "❌", label: "QC Fail",    bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5", barColor: "#dc2626" },
};

const TOOL_LABELS = {
  "extraction-bank":      "Bank Extraction",
  "extraction-invoice":   "Invoice Extraction",
  "transaction-analysis": "Transaction Analysis",
  "tracker":              "Statement Tracker",
  "categorisation":       "Categorisation",
  "bates-stamp":          "Bates Stamping",
  "splitter":             "PDF Splitter",
  "desc-categoriser":     "Description Categoriser",
};

const SEV_COLORS = {
  Critical: { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626" },
  Major:    { bg: "#fff7ed", color: "#9a3412", dot: "#f97316" },
  Minor:    { bg: "#fef9c3", color: "#713f12", dot: "#ca8a04" },
};

function ScoreBar({ score, color }) {
  return (
    <div style={{ height: "6px", borderRadius: "3px", background: "#e5e7eb", overflow: "hidden", marginTop: "6px" }}>
      <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: "3px", transition: "width 0.6s ease" }} />
    </div>
  );
}

function Section({ title, items, textColor, bgColor, icon }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: "18px" }}>
      <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 600, color: textColor }}>
        {icon} {title} ({items.length})
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontSize: "13px", color: "#374151", background: bgColor, borderRadius: "6px", padding: "8px 12px", marginBottom: "5px", lineHeight: "1.5", borderLeft: `3px solid ${textColor}` }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Score breakdown panel — shows top 3 things that hurt the score
function ScoreBreakdown({ breakdown }) {
  if (!breakdown || breakdown.length === 0) return null;
  return (
    <div style={{ marginBottom: "20px" }}>
      <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 600, color: "#374151" }}>
        📉 Score impact — top issues
      </p>
      {breakdown.map((item, i) => {
        const sc = SEV_COLORS[item.severity] || SEV_COLORS.Minor;
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 12px", background: sc.bg, borderRadius: "6px", marginBottom: "5px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: sc.dot, flexShrink: 0, marginTop: "4px" }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: sc.color, textTransform: "uppercase", letterSpacing: "0.05em", marginRight: "6px" }}>{item.severity}</span>
              <span style={{ fontSize: "12px", color: "#374151", lineHeight: 1.4 }}>{item.label}</span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 700, color: sc.color, flexShrink: 0 }}>−{item.impact} pts</span>
          </div>
        );
      })}
    </div>
  );
}

export default function QCBadge({ toolName, toolOutput, metadata }) {
  const [qcResult, setQcResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState(null);
  const [hasRun, setHasRun] = useState(false);

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
      setHasRun(true);
      setModalOpen(true);
    } catch (err) {
      setError("QC check failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const cfg = qcResult ? STATUS_CONFIG[qcResult.status] : null;
  const toolLabel = TOOL_LABELS[toolName] || toolName;

  return (
    <>
      {/* ── INLINE BADGE ── */}
      <div style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {!hasRun && !loading && (
          <button
            onClick={handleRunQC}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#f9fafb", color: "#374151", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = "#1a3c6e"; e.currentTarget.style.color = "#1a3c6e"; e.currentTarget.style.background = "#f0f4ff"; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.color = "#374151"; e.currentTarget.style.background = "#f9fafb"; }}
          >
            🔍 Run QC Check
          </button>
        )}

        {loading && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 18px", borderRadius: "8px", background: "#f3f4f6", border: "1px solid #e5e7eb", fontSize: "13px", color: "#6b7280", fontWeight: 500 }}>
            <span style={{ animation: "qc-spin 1s linear infinite", display: "inline-block" }}>⟳</span>
            Running QC…
            <style>{`@keyframes qc-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {hasRun && !loading && cfg && (
          <button
            onClick={() => setModalOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 18px", borderRadius: "8px", background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}`, fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
          >
            {cfg.emoji} {cfg.label} — {qcResult.score}/100
            <span style={{ fontSize: "11px", opacity: 0.7, fontWeight: 500 }}>View report →</span>
          </button>
        )}

        {hasRun && !loading && (
          <button onClick={handleRunQC} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}>
            Re-run
          </button>
        )}

        {error && <p style={{ margin: 0, fontSize: "13px", color: "#dc2626" }}>⚠ {error}</p>}
      </div>

      {/* ── MODAL ── */}
      {modalOpen && qcResult && cfg && (
        <>
          <div onClick={() => setModalOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 998 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 999, background: "#ffffff", borderRadius: "16px", padding: "28px 28px 24px", width: "min(540px, 92vw)", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 30px 80px rgba(0,0,0,0.28)" }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: "11px", fontWeight: 600, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase" }}>QC Report</p>
                <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#111827" }}>{toolLabel}</h2>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#9ca3af", lineHeight: 1, padding: "0 4px", marginTop: "-2px" }}>×</button>
            </div>

            {/* Score card */}
            <div style={{ padding: "16px 18px", borderRadius: "12px", background: cfg.bg, border: `1.5px solid ${cfg.border}`, marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <span style={{ fontSize: "28px", lineHeight: 1 }}>{cfg.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                    <span style={{ fontSize: "20px", fontWeight: 800, color: cfg.color }}>{qcResult.score}</span>
                    <span style={{ fontSize: "13px", color: cfg.color, opacity: 0.7 }}>/100</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: cfg.color, marginLeft: "4px" }}>{cfg.label}</span>
                  </div>
                  <ScoreBar score={qcResult.score} color={cfg.barColor} />
                </div>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: "13px", color: cfg.color, lineHeight: 1.6, opacity: 0.9 }}>{qcResult.summary}</p>
            </div>

            {/* Meta pills */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
              {[
                { label: `${qcResult.meta?.ruleIssueCount ?? 0} rule issues`,   color: (qcResult.meta?.ruleIssueCount ?? 0) > 0 ? "#dc2626" : "#16a34a" },
                { label: `${qcResult.meta?.ruleWarningCount ?? 0} warnings`,    color: (qcResult.meta?.ruleWarningCount ?? 0) > 0 ? "#ca8a04" : "#16a34a" },
                { label: `AI score: ${qcResult.meta?.aiScore ?? "—"}`,          color: "#374151" },
              ].map((pill, i) => (
                <span key={i} style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", background: "#f3f4f6", color: pill.color }}>{pill.label}</span>
              ))}
            </div>

            {/* Score breakdown — explainability */}
            <ScoreBreakdown breakdown={qcResult.scoreBreakdown} />

            {/* Issues / Warnings / Recommendations */}
            <Section title="Issues"          items={qcResult.issues}          textColor="#dc2626" bgColor="#fef2f2" icon="❌" />
            <Section title="Warnings"        items={qcResult.warnings}        textColor="#d97706" bgColor="#fffbeb" icon="⚠️" />
            <Section title="Recommendations" items={qcResult.recommendations} textColor="#2563eb" bgColor="#eff6ff" icon="💡" />

            {qcResult.issues?.length === 0 && qcResult.warnings?.length === 0 && (
              <div style={{ padding: "14px 16px", borderRadius: "8px", background: "#dcfce7", color: "#166534", fontSize: "14px", fontWeight: 500 }}>
                ✅ No issues found. Output looks clean and ready to use.
              </div>
            )}

            {/* Footer */}
            <div style={{ marginTop: "22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#d1d5db" }}>
                {qcResult.meta?.timestamp ? new Date(qcResult.meta.timestamp).toLocaleTimeString() : ""}
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={handleRunQC} disabled={loading} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #e5e7eb", background: "#f9fafb", color: "#374151", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                  ↺ Re-run
                </button>
                <button onClick={() => setModalOpen(false)} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#1a3c6e", color: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>

          </div>
        </>
      )}
    </>
  );
}
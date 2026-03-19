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

const RISK_CONFIG = {
  low:    { emoji: "🟢", label: "Low — Data reliable",          bg: "#dcfce7", color: "#166534", border: "#86efac" },
  medium: { emoji: "🟡", label: "Medium — Usable with caution", bg: "#fef9c3", color: "#713f12", border: "#fde047" },
  high:   { emoji: "🔴", label: "High — Not reliable",          bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5" },
};

const CHECK_ICON = { pass: "✅", warn: "⚠️", fail: "❌" };

// ── Table base styles ──────────────────────────────────────────
const thStyle = {
  padding: "7px 10px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: "11px",
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
  background: "#f9fafb",
};
const tdStyle = {
  padding: "7px 10px",
  fontSize: "12px",
  color: "#374151",
  lineHeight: 1.5,
  borderBottom: "1px solid #f3f4f6",
  verticalAlign: "top",
};

// ── Bank QC Section Components ─────────────────────────────────

function SectionHeader({ emoji, title, badge }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px" }}>
      <span style={{ fontSize: "13px" }}>{emoji}</span>
      <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#111827", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </p>
      {badge && (
        <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "10px", background: "#f3f4f6", color: "#6b7280" }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ── Renders detail text — splits category breakdown onto its own line ──
function DetailCell({ text, status }) {
  const isFail = status === "fail";
  const isWarn = status === "warn";
  const color  = isFail ? "#b91c1c" : isWarn ? "#92400e" : "#16a34a";
  const weight = isFail ? 600 : 400;

  if (!text) return <td style={{ ...tdStyle, color, fontWeight: weight }}>—</td>;

  // Split at ". Category breakdown:" so it renders on a new line
  const catSplit = text.indexOf(". Category breakdown:");
  if (catSplit === -1) {
    return (
      <td style={{ ...tdStyle, color, fontWeight: weight }}>
        {text}
      </td>
    );
  }

  const mainText  = text.slice(0, catSplit);
  const catText   = text.slice(catSplit + 2); // skip the ". "

  return (
    <td style={{ ...tdStyle, color, fontWeight: weight }}>
      <div>{mainText}</div>
      <div style={{ marginTop: "4px", color: "#6b7280", fontWeight: 400, fontSize: "11px", fontStyle: "italic" }}>
        {catText}
      </div>
    </td>
  );
}

function ValidationTable({ table }) {
  if (!table?.length) return null;
  return (
    <div style={{ marginBottom: "22px" }}>
      <SectionHeader emoji="📋" title="Core Validation" badge="Section 1" />
      <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid #e5e7eb" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "36%" }} />
            <col style={{ width: "44px" }} />
            <col /> {/* Details: fills remaining space, wraps */}
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>Check</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
              <th style={thStyle}>Details</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row, i) => {
              const isFail = row.status === "fail";
              const isWarn = row.status === "warn";
              return (
                <tr key={i} style={{ background: isFail ? "#fff8f8" : isWarn ? "#fffdf0" : "#fff" }}>
                  <td style={{ ...tdStyle, fontWeight: 500, color: "#374151" }}>{row.check}</td>
                  <td style={{ ...tdStyle, textAlign: "center", fontSize: "14px" }}>{CHECK_ICON[row.status] || "⚠️"}</td>
                  <DetailCell text={row.details} status={row.status} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionIssuesTable({ issues }) {
  if (!issues?.length) {
    return (
      <div style={{ marginBottom: "22px" }}>
        <SectionHeader emoji="🔢" title="Transaction-Level Issues" badge="Section 2" />
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: "12px", color: "#15803d" }}>
          ✅ No critical calculation issues detected in extracted transactions
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: "22px" }}>
      <SectionHeader emoji="🔢" title="Transaction-Level Issues" badge={`Section 2 — ${issues.length} issue${issues.length !== 1 ? "s" : ""}`} />
      <div style={{ borderRadius: "8px", overflow: "hidden", border: "1px solid #fecaca" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: "44px" }}>Row</th>
              <th style={{ ...thStyle, width: "90px" }}>Date</th>
              <th style={thStyle}>Issue</th>
              <th style={{ ...thStyle, width: "110px" }}>Expected</th>
              <th style={{ ...thStyle, width: "110px" }}>Extracted</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff8f8" : "#fff" }}>
                <td style={{ ...tdStyle, color: "#9ca3af", textAlign: "center" }}>{row.row ?? "—"}</td>
                <td style={{ ...tdStyle, color: "#6b7280", whiteSpace: "nowrap" }}>{row.date ?? "—"}</td>
                <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 600 }}>{row.issueType}</td>
                <td style={{ ...tdStyle, color: "#16a34a", fontFamily: "monospace", fontSize: "11px" }}>{row.expected}</td>
                <td style={{ ...tdStyle, color: "#dc2626", fontFamily: "monospace", fontSize: "11px" }}>{row.extracted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PatternInsights({ insights }) {
  if (!insights?.length) return null;
  return (
    <div style={{ marginBottom: "22px" }}>
      <SectionHeader emoji="⚠️" title="Pattern & Risk Insights" badge="Section 3" />
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {insights.map((insight, i) => (
          <li key={i} style={{
            display: "flex",
            gap: "8px",
            fontSize: "12px",
            color: "#78350f",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderLeft: "3px solid #f59e0b",
            padding: "8px 12px",
            borderRadius: "0 6px 6px 0",
            marginBottom: "5px",
            lineHeight: 1.55,
          }}>
            <span style={{ flexShrink: 0, marginTop: "1px", color: "#d97706" }}>›</span>
            {insight}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RiskLevel({ level, explanation }) {
  const cfg = RISK_CONFIG[level] || RISK_CONFIG.medium;
  return (
    <div style={{ marginBottom: "22px" }}>
      <SectionHeader emoji="🚨" title="Risk Level" badge="Section 4" />
      <div style={{ padding: "14px 16px", borderRadius: "8px", background: cfg.bg, border: `1.5px solid ${cfg.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: explanation ? "6px" : 0 }}>
          <span style={{ fontSize: "18px", lineHeight: 1 }}>{cfg.emoji}</span>
          <span style={{ fontSize: "14px", fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
        </div>
        {explanation && (
          <p style={{ margin: 0, fontSize: "12px", color: cfg.color, lineHeight: 1.6, paddingLeft: "26px", opacity: 0.9 }}>
            {explanation}
          </p>
        )}
      </div>
    </div>
  );
}

function BankRecommendations({ recommendations }) {
  if (!recommendations?.length) return null;
  return (
    <div style={{ marginBottom: "22px" }}>
      <SectionHeader emoji="💡" title="Recommendations" badge="Section 5" />
      <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {recommendations.map((rec, i) => (
          <li key={i} style={{
            display: "flex",
            gap: "10px",
            fontSize: "12px",
            color: "#1e3a5f",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            padding: "8px 12px",
            borderRadius: "6px",
            marginBottom: "5px",
            lineHeight: 1.55,
          }}>
            <span style={{ flexShrink: 0, fontWeight: 700, color: "#2563eb", minWidth: "16px" }}>{i + 1}.</span>
            {rec}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Shared Components ──────────────────────────────────────────

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

// ── Main Component ─────────────────────────────────────────────

export default function QCBadge({ toolName, toolOutput, metadata }) {
  const [qcResult,   setQcResult]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [error,      setError]      = useState(null);
  const [hasRun,     setHasRun]     = useState(false);

  async function handleRunQC() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/qc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName,
          toolOutput,
          metadata: {
            reconciliation: metadata?.reconciliation ?? null,
            ...(metadata || {}),
          },
        }),
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

  const cfg        = qcResult ? STATUS_CONFIG[qcResult.status] : null;
  const toolLabel  = TOOL_LABELS[toolName] || toolName;
  const isBank     = toolName === "extraction-bank";
  const bankReport = qcResult?.bankQcReport;

  return (
    <>
      {/* ── INLINE BADGE ── */}
      <div style={{ marginTop: "14px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {!hasRun && !loading && (
          <button
            onClick={handleRunQC}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 18px", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "#f9fafb", color: "#374151", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = "#1a3c6e"; e.currentTarget.style.color = "#1a3c6e"; e.currentTarget.style.background = "#f0f4ff"; }}
            onMouseOut={(e)  => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.color = "#374151"; e.currentTarget.style.background = "#f9fafb"; }}
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
          <div style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 999,
            background: "#ffffff",
            borderRadius: "16px",
            padding: "28px 28px 24px",
            width: "min(680px, 94vw)",   // slightly wider to accommodate detail text
            maxHeight: "86vh",
            overflowY: "auto",
            boxShadow: "0 30px 80px rgba(0,0,0,0.28)",
          }}>

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
                { label: `${qcResult.meta?.ruleIssueCount ?? 0} rule issues`,   color: (qcResult.meta?.ruleIssueCount ?? 0)   > 0 ? "#dc2626" : "#16a34a" },
                { label: `${qcResult.meta?.ruleWarningCount ?? 0} warnings`,    color: (qcResult.meta?.ruleWarningCount ?? 0) > 0 ? "#ca8a04" : "#16a34a" },
                { label: `AI score: ${qcResult.meta?.aiScore ?? "—"}`,          color: "#374151" },
              ].map((pill, i) => (
                <span key={i} style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "20px", background: "#f3f4f6", color: pill.color }}>{pill.label}</span>
              ))}
            </div>

            {/* Score breakdown */}
            <ScoreBreakdown breakdown={qcResult.scoreBreakdown} />

            {/* ── BANK EXTRACTION ONLY: 5 structured sections ── */}
            {isBank && bankReport && (
              <>
                <ValidationTable        table={bankReport.validationTable} />
                <TransactionIssuesTable issues={bankReport.transactionIssues} />
                <PatternInsights        insights={bankReport.patternInsights} />
                <RiskLevel              level={bankReport.riskLevel} explanation={bankReport.riskExplanation} />
                <BankRecommendations    recommendations={bankReport.recommendations} />
                <div style={{ borderTop: "1px solid #e5e7eb", margin: "6px 0 18px" }} />
              </>
            )}

            {/* ── AI Extraction Verification ── */}
            {isBank && (
              <p style={{ margin: "0 0 14px", fontSize: "11px", fontWeight: 600, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                AI Extraction Verification
              </p>
            )}

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
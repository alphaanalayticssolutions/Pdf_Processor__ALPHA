// /app/api/agent/qc/route.js

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const client = new Anthropic();

// ─────────────────────────────────────────────────────────────
// LAYER 1: Rule-Based Checks
// Fast, free, deterministic. No AI cost.
// ─────────────────────────────────────────────────────────────
function runRuleChecks(toolName, toolOutput) {
  const issues = [];
  const warnings = [];

  // ── 1. EXTRACTION ──
  if (toolName === "extraction") {
    const transactions = toolOutput.transactions || [];
    const summary = toolOutput.summary || {};
    const metadata = toolOutput.metadata || {};

    // Balance math check
    const { openingBalance, closingBalance, totalCredits, totalDebits } = summary;
    if (
      openingBalance !== undefined &&
      closingBalance !== undefined &&
      totalCredits !== undefined &&
      totalDebits !== undefined
    ) {
      const expected = openingBalance + totalCredits - totalDebits;
      const diff = Math.abs(expected - closingBalance);
      if (diff > 1) {
        issues.push(`Balance mismatch: expected $${expected.toFixed(2)}, got $${closingBalance.toFixed(2)} (difference: $${diff.toFixed(2)})`);
      }
    }

    // Missing descriptions
    const missingDesc = transactions.filter((t) => !t.description || t.description.trim() === "");
    if (missingDesc.length > 0) {
      warnings.push(`${missingDesc.length} transaction(s) have missing descriptions`);
    }

    // Zero amount transactions
    const zeroTx = transactions.filter(
      (t) =>
        (t.debit === 0 || t.debit === null || t.debit === undefined) &&
        (t.credit === 0 || t.credit === null || t.credit === undefined)
    );
    if (zeroTx.length > 0) {
      issues.push(`${zeroTx.length} transaction(s) have zero amounts for both debit and credit`);
    }

    // Duplicate transactions
    const seen = new Map();
    let duplicateCount = 0;
    transactions.forEach((t) => {
      const key = `${t.date}-${t.debit}-${t.credit}-${t.description}`;
      if (seen.has(key)) duplicateCount++;
      else seen.set(key, true);
    });
    if (duplicateCount > 0) {
      warnings.push(`${duplicateCount} possible duplicate transaction(s) detected (same date, amount, description)`);
    }

    // Page coverage
    const pageCount = metadata.pageCount;
    if (pageCount && transactions.length < pageCount * 5) {
      warnings.push(`Low transaction count: ${transactions.length} transactions for ${pageCount} pages — possible extraction gap`);
    }

    // Suspiciously round amounts (possible placeholder values)
    const roundAmounts = transactions.filter((t) => {
      const amt = t.debit || t.credit || 0;
      return amt > 0 && amt % 1000 === 0 && amt > 10000;
    });
    if (roundAmounts.length > 3) {
      warnings.push(`${roundAmounts.length} transactions have suspiciously round amounts (multiples of $1000) — verify these are real`);
    }
  }

  // ── 2. PDF SPLITTER ──
  if (toolName === "splitter") {
    const splits = toolOutput.splits || [];
    const totalPages = toolOutput.totalPages || 0;

    if (splits.length === 0) {
      issues.push("No split points detected. PDF may not have been processed correctly.");
    }

    const unnamedSplits = splits.filter((s) => !s.name || s.name.trim() === "");
    if (unnamedSplits.length > 0) {
      warnings.push(`${unnamedSplits.length} split(s) have no name assigned`);
    }

    const emptySplits = splits.filter((s) => (s.pageCount || s.pages || 0) === 0);
    if (emptySplits.length > 0) {
      issues.push(`${emptySplits.length} split(s) have zero pages — possible split error`);
    }

    const splitPageTotal = splits.reduce((sum, s) => sum + (s.pageCount || s.pages || 0), 0);
    if (totalPages > 0 && Math.abs(splitPageTotal - totalPages) > 2) {
      warnings.push(`Page count mismatch: splits account for ${splitPageTotal} pages but PDF has ${totalPages} pages`);
    }
  }

  // ── 3. CATEGORISATION ──
  if (toolName === "categorisation") {
    const files = toolOutput.files || [];

    if (files.length === 0) {
      issues.push("No files found in categorisation output.");
    } else {
      // Low confidence check
      const lowConfidence = files.filter(
        (f) => f.confidence !== undefined && f.confidence < 0.5
      );
      const lowPercent = (lowConfidence.length / files.length) * 100;
      if (lowPercent > 20) {
        warnings.push(`${lowPercent.toFixed(0)}% of files have low confidence scores (threshold: 20%)`);
      }

      // Miscellaneous overflow
      const miscFiles = files.filter(
        (f) => f.folder && f.folder.toLowerCase().includes("miscellaneous")
      );
      const miscPercent = (miscFiles.length / files.length) * 100;
      if (miscPercent > 10) {
        warnings.push(`${miscPercent.toFixed(0)}% of files placed in Miscellaneous folder (threshold: 10%)`);
      }

      // No folder assigned
      const noFolder = files.filter((f) => !f.folder || f.folder.trim() === "");
      if (noFolder.length > 0) {
        issues.push(`${noFolder.length} file(s) have no folder assigned`);
      }

      // Check confidence field format — HIGH/MEDIUM/LOW vs numeric
      const lowConfidenceStr = files.filter(
        (f) => f.confidence === "LOW"
      );
      const lowStrPercent = (lowConfidenceStr.length / files.length) * 100;
      if (lowStrPercent > 20) {
        warnings.push(`${lowStrPercent.toFixed(0)}% of files marked LOW confidence by AI categoriser`);
      }
    }
  }

  // ── 4. BATES STAMP ──
  if (toolName === "bates-stamp") {
    const files = toolOutput.files || [];
    const stamped = toolOutput.stampedCount || 0;
    const total = toolOutput.totalFiles || files.length;

    if (total > 0 && stamped < total) {
      const unstamped = total - stamped;
      warnings.push(`${unstamped} file(s) out of ${total} were not stamped`);
    }

    const batesNumbers = files.map((f) => f.batesNumber || f.startBates).filter(Boolean);
    const uniqueBates = new Set(batesNumbers);
    if (uniqueBates.size < batesNumbers.length) {
      issues.push("Duplicate Bates numbers detected — numbering may be incorrect");
    }

    const nums = batesNumbers
      .map((b) => parseInt(b.replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i - 1] > 1) {
        warnings.push(`Gap in Bates sequence between ${nums[i - 1]} and ${nums[i]}`);
        break;
      }
    }
  }

  // ── 5. TRACKER ──
  if (toolName === "tracker") {
    const gaps = toolOutput.gaps || 0;
    const totalMonths = toolOutput.totalMonths || 0;
    const totalAccounts = toolOutput.totalAccounts || 0;

    if (totalMonths === 0) {
      issues.push("Tracker has no months of data — output may be empty");
    } else {
      const gapPercent = (gaps / totalMonths) * 100;
      if (gapPercent > 30) {
        issues.push(`High gap rate: ${gaps} missing months out of ${totalMonths} total (${gapPercent.toFixed(0)}%)`);
      } else if (gaps > 0) {
        warnings.push(`${gaps} gap(s) found in tracker — marked as (?) — statements missing for these periods`);
      }
    }

    if (totalAccounts === 0) {
      issues.push("No accounts found in tracker output");
    }
  }

  // ── 6. DESCRIPTION CATEGORISER ──
  if (toolName === "desc-categoriser") {
    const descriptions = toolOutput.descriptions || [];
    const total = descriptions.length;

    if (total === 0) {
      issues.push("No descriptions found in output");
    } else {
      const uncategorised = descriptions.filter(
        (d) =>
          !d.category ||
          d.category.trim() === "" ||
          d.category.toLowerCase() === "uncategorised" ||
          d.category.toLowerCase() === "uncategorized" ||
          d.category.toLowerCase() === "other"
      );
      const uncatPercent = (uncategorised.length / total) * 100;
      if (uncatPercent > 15) {
        warnings.push(`${uncatPercent.toFixed(0)}% of descriptions are uncategorised (threshold: 15%)`);
      }

      const lowConf = descriptions.filter(
        (d) => d.confidence !== undefined && d.confidence < 0.4
      );
      if (lowConf.length > 0) {
        warnings.push(`${lowConf.length} description(s) have very low categorisation confidence`);
      }
    }
  }

  // ── 7. TRANSACTION ANALYSIS ──
  if (toolName === "transaction-analysis") {
    const accounts = toolOutput.accounts || [];
    const flaggedTransfers = toolOutput.flaggedTransfers || [];
    const fileCount = toolOutput.fileCount || 0;

    if (accounts.length === 0 && fileCount === 0) {
      warnings.push("No structured account data returned — QC running on file metadata only");
    }

    accounts.forEach((acc) => {
      if (acc.maxMonthTx && acc.avgMonthTx && acc.avgMonthTx > 0) {
        if (acc.maxMonthTx > acc.avgMonthTx * 10) {
          warnings.push(`Account "${acc.name}" spike detected: ${acc.maxMonthTx} transactions in one month vs avg ${acc.avgMonthTx}`);
        }
      }

      if (acc.monthlyData && Array.isArray(acc.monthlyData)) {
        const nonZeroMonths = acc.monthlyData.filter((m) => m.count > 0);
        if (nonZeroMonths.length > 2) {
          const firstActive = acc.monthlyData.indexOf(nonZeroMonths[0]);
          const lastActive = acc.monthlyData.indexOf(nonZeroMonths[nonZeroMonths.length - 1]);
          const middleMonths = acc.monthlyData.slice(firstActive, lastActive + 1);
          const zeroMiddle = middleMonths.filter((m) => m.count === 0);
          if (zeroMiddle.length > 0) {
            warnings.push(`Account "${acc.name}" has ${zeroMiddle.length} month(s) with zero activity in middle of active period`);
          }
        }
      }
    });

    if (flaggedTransfers.length > 0) {
      warnings.push(`${flaggedTransfers.length} suspicious interbank transfer(s) flagged for review`);
    }
  }

  return { issues, warnings };
}

// ─────────────────────────────────────────────────────────────
// LAYER 2: AI Deep Analysis
// Professional-grade forensic financial QC prompt.
// ─────────────────────────────────────────────────────────────
async function runAIAnalysis(toolName, toolOutput, ruleIssues, ruleWarnings) {
  const outputSample = JSON.stringify(toolOutput).slice(0, 4000);

  // Tool-specific context for the AI
  const toolContext = {
    "extraction": `You are reviewing bank statement extraction output.
Key checks:
- Do opening balance + total credits - total debits = closing balance?
- Are transaction dates sequential with no impossible jumps?
- Are there any transactions with amounts that seem like OCR errors (e.g. $1,234,567 when others are under $10,000)?
- Are descriptions meaningful or do they look truncated/garbled?
- Is the transaction count reasonable for the number of pages?
- Are debit/credit columns consistent (not swapped)?`,

    "splitter": `You are reviewing PDF document splitting output.
Key checks:
- Does the number of splits make sense for the document type?
- Are split names meaningful and correctly assigned?
- Are page ranges contiguous with no gaps or overlaps?
- Does the total page count across splits match the original PDF?`,

    "categorisation": `You are reviewing legal document categorisation output.
Key checks:
- Are documents assigned to the correct legal category based on their names?
- Are there documents in wrong folders (e.g. a bank statement in Court Filings)?
- Is the confidence distribution reasonable?
- Are too many documents in Miscellaneous (catch-all) folder?`,

    "bates-stamp": `You are reviewing Bates stamp numbering output.
Key checks:
- Is the Bates sequence continuous with no gaps or duplicates?
- Were all PDFs in the batch processed?
- Are any files skipped that should not have been?
- Is the prefix format consistent across all stamped files?`,

    "tracker": `You are reviewing a bank/credit card statement tracker output.
Key checks:
- Are there gaps (?) in months that should have data?
- Is the date range continuous and reasonable?
- Are bank account names normalized consistently?
- Are all accounts from the input files represented in the tracker?`,

    "desc-categoriser": `You are reviewing transaction description categorisation output.
Key checks:
- Are business expense descriptions categorised correctly?
- Are there descriptions that seem miscategorised (e.g. "APPLE.COM/BILL" as Food instead of Software)?
- Is the category distribution reasonable for a business?
- Are any high-frequency descriptions getting wrong categories?`,

    "transaction-analysis": `You are reviewing a transaction pattern analysis output.
Key checks:
- Are there accounts with unusually high or low transaction volumes?
- Are there months with zero activity that look suspicious?
- Do the file names and metadata suggest the analysis covered all uploaded files?
- Are there any data quality indicators suggesting the pivot was built incorrectly?`,
  };

  const context = toolContext[toolName] || "You are reviewing document processing tool output for quality issues.";

  const systemPrompt = `You are a senior forensic financial analyst and document QC specialist.
You work for a legal services firm that processes financial documents for litigation and compliance cases.
All documents are international — primarily USD-denominated financial records.
Transaction types include: wire transfers, ACH payments, checks, credit card charges, bank fees, interest, forex.

Your role is to identify quality issues that automated rule checks cannot detect:
- Logical inconsistencies in financial data
- Patterns suggesting extraction errors or OCR failures  
- Data completeness problems
- Anomalies that a human reviewer would flag
- Issues that could cause problems in legal proceedings

${context}

SCORING CRITERIA — be precise and consistent:
90-100: Clean output, no significant issues, ready for legal use
75-89:  Minor issues present, usable but warrants review before submission
55-74:  Multiple issues, requires correction before use
30-54:  Significant quality problems, re-run recommended
0-29:   Output is unreliable, do not use without full manual review

CRITICAL RULES:
- Only flag issues you can actually see evidence of in the data
- Do not invent problems that aren't there
- Be specific — name accounts, dates, amounts when flagging issues
- Keep each issue/warning to one clear sentence
- Recommendations must be actionable, not generic

Return ONLY valid JSON. No markdown. No text before or after.
Exact structure required:
{
  "aiScore": <integer 0-100>,
  "aiIssues": ["<specific serious issue with evidence>"],
  "aiWarnings": ["<specific minor concern with evidence>"],
  "aiRecommendations": ["<specific actionable step>"],
  "aiSummary": "<2-3 sentence professional assessment of output quality and readiness for use>"
}`;

  const userPrompt = `TOOL: ${toolName}

RULE-BASED CHECKS ALREADY FOUND:
Issues: ${JSON.stringify(ruleIssues)}
Warnings: ${JSON.stringify(ruleWarnings)}

TOOL OUTPUT DATA (first 4000 characters):
${outputSample}

Perform a deep quality analysis. Look beyond the rule checks above.
Focus on issues that matter for legal document processing accuracy.
If the data looks clean and complete, say so — do not manufacture concerns.
Score honestly based on what you can actually see in the output.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText = response.content[0].text.trim();

  // Strip any accidental markdown fences
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  return parsed;
}

// ─────────────────────────────────────────────────────────────
// SCORE CALCULATOR
// ─────────────────────────────────────────────────────────────
function calculateFinalScore(ruleIssues, ruleWarnings, aiScore) {
  let ruleScore = 100;
  ruleScore -= ruleIssues.length * 15;
  ruleScore -= ruleWarnings.length * 5;
  ruleScore = Math.max(0, ruleScore);

  // 60% rule-based weight, 40% AI weight
  const blended = ruleScore * 0.6 + aiScore * 0.4;
  return Math.max(0, Math.min(100, Math.round(blended)));
}

function getStatus(score) {
  if (score >= 90) return "PASS";
  if (score >= 70) return "WARNING";
  return "FAIL";
}

// ─────────────────────────────────────────────────────────────
// MAIN POST HANDLER
// ─────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json();
    const { toolName, toolOutput, metadata } = body;

    if (!toolName || !toolOutput) {
      return NextResponse.json(
        { error: "Both toolName and toolOutput are required" },
        { status: 400 }
      );
    }

    // Layer 1: Rule checks — instant
    const { issues: ruleIssues, warnings: ruleWarnings } = runRuleChecks(
      toolName,
      { ...toolOutput, metadata }
    );

    // Layer 2: AI analysis — with proper fallback
    let aiResult = {
      aiScore: 75,
      aiIssues: [],
      aiWarnings: [],
      aiRecommendations: ["Re-run QC once AI analysis is available for deeper insights."],
      aiSummary: "AI deep analysis could not complete. Rule-based checks were applied. Results reflect automated checks only.",
    };

    try {
      aiResult = await runAIAnalysis(toolName, toolOutput, ruleIssues, ruleWarnings);
    } catch (aiError) {
      console.error("QC AI analysis failed:", aiError.message);
      // Log what actually failed for debugging
      console.error("Tool:", toolName, "| Output keys:", Object.keys(toolOutput || {}));
    }

    const finalScore = calculateFinalScore(ruleIssues, ruleWarnings, aiResult.aiScore);
    const status = getStatus(finalScore);

    const allIssues = [...ruleIssues, ...(aiResult.aiIssues || [])];
    const allWarnings = [...ruleWarnings, ...(aiResult.aiWarnings || [])];

    return NextResponse.json({
      status,
      score: finalScore,
      issues: allIssues,
      warnings: allWarnings,
      recommendations: aiResult.aiRecommendations || [],
      summary: aiResult.aiSummary,
      meta: {
        toolName,
        ruleIssueCount: ruleIssues.length,
        ruleWarningCount: ruleWarnings.length,
        aiScore: aiResult.aiScore,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (err) {
    console.error("QC Agent critical error:", err.message);
    return NextResponse.json({
      status: "WARNING",
      score: 50,
      issues: [],
      warnings: ["QC Agent encountered an unexpected error. Manual review recommended."],
      recommendations: ["Check server logs for QC Agent error details."],
      summary: "QC could not complete due to a system error. Please review output manually before use.",
    });
  }
}
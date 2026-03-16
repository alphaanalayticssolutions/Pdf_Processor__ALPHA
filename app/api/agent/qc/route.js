// /app/api/agent/qc/route.js

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const client = new Anthropic();

// ─────────────────────────────────────────────────────────────
// LAYER 1: Rule-Based Checks
// ─────────────────────────────────────────────────────────────
function runRuleChecks(toolName, toolOutput) {
  const issues = [];
  const warnings = [];

  // ── 1. EXTRACTION ──
  if (toolName === "extraction") {
    const transactions = toolOutput.transactions || [];
    const summary = toolOutput.summary || {};
    const metadata = toolOutput.metadata || {};

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
        issues.push(`Balance mismatch: expected ${expected.toFixed(2)}, got ${closingBalance.toFixed(2)} (difference: ${diff.toFixed(2)})`);
      }
    }

    const missingDesc = transactions.filter((t) => !t.description || t.description.trim() === "");
    if (missingDesc.length > 0) {
      warnings.push(`${missingDesc.length} transaction(s) have missing descriptions`);
    }

    const zeroTx = transactions.filter(
      (t) =>
        (t.debit === 0 || t.debit === null || t.debit === undefined) &&
        (t.credit === 0 || t.credit === null || t.credit === undefined)
    );
    if (zeroTx.length > 0) {
      issues.push(`${zeroTx.length} transaction(s) have zero amounts for both debit and credit`);
    }

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

    const pageCount = metadata.pageCount;
    if (pageCount && transactions.length < pageCount * 5) {
      warnings.push(`Low transaction count: ${transactions.length} transactions for ${pageCount} pages. Some pages may not have been extracted.`);
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
      warnings.push(`${unnamedSplits.length} split(s) have no name assigned.`);
    }

    const emptySplits = splits.filter((s) => s.pageCount === 0 || s.pages === 0);
    if (emptySplits.length > 0) {
      issues.push(`${emptySplits.length} split(s) have zero pages — possible split error.`);
    }

    const splitPageTotal = splits.reduce((sum, s) => sum + (s.pageCount || s.pages || 0), 0);
    if (totalPages > 0 && Math.abs(splitPageTotal - totalPages) > 2) {
      warnings.push(`Page count mismatch: splits account for ${splitPageTotal} pages but PDF has ${totalPages} pages.`);
    }
  }

  // ── 3. CATEGORISATION ──
  if (toolName === "categorisation") {
    const files = toolOutput.files || [];

    if (files.length > 0) {
      const lowConfidence = files.filter((f) => f.confidence !== undefined && f.confidence < 0.5);
      const lowPercent = (lowConfidence.length / files.length) * 100;
      if (lowPercent > 20) {
        warnings.push(`${lowPercent.toFixed(0)}% of files have low confidence scores (above 20% threshold)`);
      }

      const miscFiles = files.filter((f) => f.folder && f.folder.toLowerCase().includes("miscellaneous"));
      const miscPercent = (miscFiles.length / files.length) * 100;
      if (miscPercent > 10) {
        warnings.push(`${miscPercent.toFixed(0)}% of files placed in Miscellaneous folder (above 10% threshold)`);
      }

      const noFolder = files.filter((f) => !f.folder || f.folder.trim() === "");
      if (noFolder.length > 0) {
        issues.push(`${noFolder.length} file(s) have no folder assigned.`);
      }
    } else {
      issues.push("No files found in categorisation output.");
    }
  }

  // ── 4. BATES STAMP ──
  if (toolName === "bates-stamp") {
    const files = toolOutput.files || [];
    const stamped = toolOutput.stampedCount || 0;
    const total = toolOutput.totalFiles || files.length;

    if (total > 0 && stamped < total) {
      const unstamped = total - stamped;
      warnings.push(`${unstamped} file(s) out of ${total} were not stamped.`);
    }

    const batesNumbers = files.map((f) => f.batesNumber || f.startBates).filter(Boolean);
    const uniqueBates = new Set(batesNumbers);
    if (uniqueBates.size < batesNumbers.length) {
      issues.push("Duplicate Bates numbers detected. Numbering may be incorrect.");
    }

    const nums = batesNumbers
      .map((b) => parseInt(b.replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i - 1] > 1) {
        warnings.push(`Gap detected in Bates sequence between ${nums[i - 1]} and ${nums[i]}.`);
        break;
      }
    }
  }

  // ── 5. TRACKER ──
  if (toolName === "tracker") {
    const gaps = toolOutput.gaps || 0;
    const totalMonths = toolOutput.totalMonths || 1;
    const gapPercent = (gaps / totalMonths) * 100;

    if (totalMonths === 0) {
      issues.push("Tracker has no months of data. Output may be empty.");
    } else if (gapPercent > 30) {
      issues.push(`High gap rate: ${gaps} missing months out of ${totalMonths} total months (${gapPercent.toFixed(0)}%)`);
    } else if (gaps > 0) {
      warnings.push(`${gaps} gap(s) found in tracker — marked as (?) in output`);
    }
  }

  // ── 6. DESCRIPTION CATEGORISER ──
  if (toolName === "desc-categoriser") {
    const descriptions = toolOutput.descriptions || [];
    const total = descriptions.length;

    if (total === 0) {
      issues.push("No descriptions found in output.");
    }

    const uncategorised = descriptions.filter(
      (d) => !d.category || d.category.trim() === "" || d.category.toLowerCase() === "uncategorised"
    );
    const uncatPercent = total > 0 ? (uncategorised.length / total) * 100 : 0;
    if (uncatPercent > 15) {
      warnings.push(`${uncatPercent.toFixed(0)}% of descriptions are uncategorised (above 15% threshold).`);
    }

    const lowConf = descriptions.filter((d) => d.confidence !== undefined && d.confidence < 0.4);
    if (lowConf.length > 0) {
      warnings.push(`${lowConf.length} description(s) have very low categorisation confidence.`);
    }
  }

  // ── 7. TRANSACTION ANALYSIS ──
  if (toolName === "transaction-analysis") {
    const accounts = toolOutput.accounts || [];
    const flaggedTransfers = toolOutput.flaggedTransfers || [];

    if (accounts.length === 0) {
      issues.push("No accounts found in transaction analysis output.");
    }

    accounts.forEach((acc) => {
      if (acc.maxMonthTx && acc.avgMonthTx && acc.avgMonthTx > 0) {
        if (acc.maxMonthTx > acc.avgMonthTx * 10) {
          warnings.push(`Account "${acc.name}" has a suspicious spike: ${acc.maxMonthTx} transactions in one month vs average of ${acc.avgMonthTx}`);
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
            warnings.push(`Account "${acc.name}" has ${zeroMiddle.length} month(s) with zero activity in the middle of its active period.`);
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
// ─────────────────────────────────────────────────────────────
async function runAIAnalysis(toolName, toolOutput, ruleIssues, ruleWarnings) {
  const outputSample = JSON.stringify(toolOutput).slice(0, 3000);

  const systemPrompt = `You are a QC inspector for a legal financial document processing system in India.

Your task is to analyze tool output and detect quality issues that rule-based checks might miss.

Focus on:
- Financial inconsistencies
- Balance mismatches
- Missing transactions
- Duplicate transactions
- Unusual gaps in dates
- Extraction errors

Scoring guideline:
90-100 = Excellent output, no issues
70-89 = Minor warnings only
40-69 = Multiple issues found
0-39 = Major errors, re-run recommended

These documents are Indian bank or credit card statements.
Common transaction types include UPI, NEFT, RTGS, IMPS, ATM withdrawals, POS card payments.

Return ONLY valid JSON. No markdown. No explanation text before or after.
Return exactly this structure:
{
  "aiScore": <number between 0 and 100>,
  "aiIssues": ["<serious issue>"],
  "aiWarnings": ["<minor concern>"],
  "aiRecommendations": ["<actionable recommendation>"],
  "aiSummary": "<2 to 3 sentence plain English summary>"
}`;

  const userPrompt = `Tool name: ${toolName}

Issues already found by rule checks: ${JSON.stringify(ruleIssues)}
Warnings already found by rule checks: ${JSON.stringify(ruleWarnings)}

Here is the tool output to inspect:
${outputSample}

Check for:
1. Balance mismatches between opening, closing, credits and debits
2. Missing or incomplete transactions
3. Suspicious amounts or unusual patterns
4. Duplicate transactions
5. Unusual gaps in dates
6. Any extraction errors or data quality problems
7. Anything unusual for Indian bank statements (UPI, NEFT, RTGS, IMPS, ATM, POS)`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText = response.content[0].text.trim();
  const parsed = JSON.parse(rawText);
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

    const { issues: ruleIssues, warnings: ruleWarnings } = runRuleChecks(
      toolName,
      { ...toolOutput, metadata }
    );

    let aiResult = {
      aiScore: 80,
      aiIssues: [],
      aiWarnings: [],
      aiRecommendations: [],
      aiSummary: "AI analysis could not complete. Rule-based checks were applied.",
    };

    try {
      aiResult = await runAIAnalysis(toolName, toolOutput, ruleIssues, ruleWarnings);
    } catch (aiError) {
      console.error("AI analysis failed, using fallback:", aiError.message);
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
    });

  } catch (err) {
    console.error("QC Agent error:", err.message);
    return NextResponse.json({
      status: "WARNING",
      score: 50,
      issues: [],
      warnings: ["QC Agent encountered an unexpected error. Please review output manually."],
      recommendations: ["Check server logs for details."],
      summary: "QC could not complete due to an error. Manual review recommended.",
    });
  }
}
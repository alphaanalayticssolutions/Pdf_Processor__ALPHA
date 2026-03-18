// /app/api/agent/qc/route.js

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const client = new Anthropic();

// ─────────────────────────────────────────────────────────────
// SEVERITY LEVELS
// ─────────────────────────────────────────────────────────────
const SEV = {
  CRITICAL: { label: "Critical", deduct: 25 },
  MAJOR:    { label: "Major",    deduct: 10 },
  MINOR:    { label: "Minor",    deduct: 3  },
};

function issue(msg, sev = SEV.MAJOR)   { return { msg, sev, type: "issue" }; }
function warning(msg, sev = SEV.MINOR) { return { msg, sev, type: "warning" }; }

// ─────────────────────────────────────────────────────────────
// PER-TOOL CONFIG
// ruleWeight + aiWeight = 1.0
// cap = max total rule deduction (prevents one bad rule nuking score)
// passAt = minimum score for PASS
// ─────────────────────────────────────────────────────────────
const TOOL_CONFIG = {
  "extraction-bank":      { ruleWeight: 0.70, aiWeight: 0.30, cap: 40, passAt: 88 },
  "extraction-invoice":   { ruleWeight: 0.70, aiWeight: 0.30, cap: 40, passAt: 88 },
  "transaction-analysis": { ruleWeight: 0.65, aiWeight: 0.35, cap: 40, passAt: 88 },
  "tracker":              { ruleWeight: 0.65, aiWeight: 0.35, cap: 35, passAt: 88 },
  "categorisation":       { ruleWeight: 0.40, aiWeight: 0.60, cap: 35, passAt: 88 },
  "bates-stamp":          { ruleWeight: 0.75, aiWeight: 0.25, cap: 45, passAt: 92 },
  "splitter":             { ruleWeight: 0.65, aiWeight: 0.35, cap: 35, passAt: 88 },
  "desc-categoriser":     { ruleWeight: 0.40, aiWeight: 0.60, cap: 30, passAt: 88 },
};

// ─────────────────────────────────────────────────────────────
// DOMAIN EXPERT PROMPTS
// ─────────────────────────────────────────────────────────────
const DOMAIN_PROMPTS = {
  "extraction-bank": `
You are a forensic accountant with 20 years supporting financial fraud litigation.

WHAT YOU KNOW:

OCR errors easy to miss:
- "7" misread as "1": $7,500 → $1,500 — balance math may still pass if running balance also wrong
- Comma misread as decimal: $1,234 → $1.234
- Running balance printed as a transaction — shows as massive credit
- Two transactions on same line merged — amount doubled, description garbled
- Dollar sign absorbed into description — amount shows as 0
- Date OCR: "01/06" could be Jan 6 or Jun 1 depending on bank format

Fraud patterns (flag for attorney review, not accusation):
- Round-dollar transfers just below $10K reporting thresholds (structuring)
- Daily ATM withdrawals at maximum limit for consecutive days
- Large deposits followed immediately by large transfers out (pass-through)
- Same vendor paid multiple times in a short window
- Zero debits on a business account — possible column swap or unusual account type

Statement integrity for legal use:
- Closing balance of Jan MUST equal opening balance of Feb
- Transaction count < 5 per page on dense business account = missing pages
- Gaps > 10 days in active business account = likely missing pages, not real inactivity
`,

  "extraction-invoice": `
You are an AP fraud auditor who has investigated invoice fraud at 50+ companies.

WHAT YOU KNOW:

Invoice fraud patterns:
- Sequential invoice numbers from same vendor within days (duplicate billing)
- Amounts just below approval thresholds ($4,999 when limit is $5,000)
- Invoice date on a weekend or holiday for a B2B vendor
- Due date before invoice date — impossible
- Invoice dated in the future — OCR error or pre-dated document
- Tax amount not matching any standard rate

OCR extraction errors:
- "Invoice #" prefix in invoice number field
- Vendor address extracted as vendor name
- PO number confused with invoice number
- Total extracted from subtotal line (misses tax)

Vendor normalization:
- "IBM Inc." and "IBM LLC" are likely the same entity — flag if same vendor appears with variants
`,

  "transaction-analysis": `
You are a financial forensics analyst building pivot analyses for litigation.

WHAT MATTERS:

Coverage gaps attorneys will challenge:
- Account A sends $50K to Account B but Account B not in analysis — transfer vanishes
- Zero-transaction months in active period = possibly missing statements (but verify first — some accounts are genuinely low-volume)
- Date range shorter than case period = discovery gap

Context before flagging:
- AmEx and credit card accounts often start mid-period when the card was opened — this is NOT dormancy
- Construction/real estate entities may have 1-2 tx/month legitimately
- External payments (AmEx, vendors, wire transfers out) will not have counterparts in the dataset — this is expected, not a red flag
- Only flag unmatched transfers if the counterparty SHOULD be in the dataset (e.g. transfers between company accounts)

Suspicious patterns:
- One account with 10x volume of others
- Activity stopping on exact same date across multiple accounts (coordinated closure)
- Round-number transactions dominating ($5K, $10K consistently)
- 6+ consecutive zero months IN THE MIDDLE of an active period (not at the start/end)

Data integrity:
- Overlapping date ranges for same account = double-counted transactions
- Account names differing by one character = phantom duplicates
`,

  "tracker": `
You are a legal discovery compliance specialist. Gaps in your tracker are gaps in the production.

WHAT YOU KNOW:

Gap patterns:
- Single missing month = one PDF not uploaded
- 3+ consecutive missing = full quarter missing
- All accounts missing same month = that folder never processed

Account naming problems:
- "Chase 2281" and "Chase Business 2281" = same account
- "AmEx" vs "American Express" vs "AMEX" = 3 phantom accounts
- Leading zeros: "0003000" vs "3000"
`,

  "categorisation": `
You are a senior paralegal who has organized 500+ legal document productions.

HARD RULES — always flag regardless of AI confidence:
- Bank statements in Court Filings folder = wrong
- Contracts in Bank Statements folder = wrong
- Attorney letters in any non-Correspondence folder = privilege risk

SOFT OBSERVATIONS:
- If Miscellaneous is the largest folder, categorization failed
- ALL HIGH confidence on 100+ files = AI rubber-stamping, not reasoning
- Tax documents in Correspondence = forensic accountants won't find them
`,

  "bates-stamp": `
You are a litigation support director. Bates errors are the most legally consequential mistakes in production.

NON-NEGOTIABLE:
- Any gap in sequence = document may have been withheld — opposing counsel WILL notice
- Gap of 1 is MORE suspicious than gap of 100 — looks intentional
- Duplicate numbers = two documents share one identifier — corrupts entire production
- Prefix changing mid-batch = inconsistent production

PAGE COUNT:
- 50-page PDF getting 48 Bates numbers = 2 pages unnumbered = production defect
- Zero-page PDFs stamped = corrupt file in production
`,

  "splitter": `
You are a document processing specialist. Bad splits cascade into extraction errors and Bates gaps.

WHAT TO LOOK FOR:
- "Document_1", "Part_2" names = AI could not identify statement period
- One split with 80% of pages = split point was missed
- 1-2 page splits = likely cover page separated from statement
- All splits same page count = AI split on page count not content
- Total pages across splits ≠ total input pages = pages lost or duplicated
`,

  "desc-categoriser": `
You are a forensic accountant categorizing business transactions for litigation analysis.

HIGH-STAKES ERRORS:
- WIRE TRANSFER → Utilities = hides fund movements
- ADP/PAYCHEX/GUSTO/RIPPLING → not Payroll = understates labor costs
- LOAN PAYMENT → Transfer = hides debt obligations
- INTERCOMPANY TRANSFER must be its own category

COMMON AI MISTAKES:
- APPLE.COM/BILL → Food (wrong — it's Software/Subscriptions)
- AMAZON WEB SERVICES → Shopping (wrong — it's Cloud/Software)
- PAYPAL *VENDOR NAME → Transfer (wrong — vendor name is right there)
- SQ * = Square payments → Sales Revenue if incoming, Vendor Payment if outgoing
`,
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function isValidDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

function isFutureDate(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) > new Date();
}

// ─────────────────────────────────────────────────────────────
// LAYER 1: Rule Checks
// ─────────────────────────────────────────────────────────────
function runRuleChecks(toolName, toolOutput) {
  const findings = [];

  // ── BANK EXTRACTION ──────────────────────────────────────────
  if (toolName === "extraction-bank") {
    const statements = toolOutput.statements || [];
    const allTransactions = toolOutput.transactions || [];

    if (statements.length === 0 && allTransactions.length === 0) {
      findings.push(issue("No data returned — extraction may have failed silently", SEV.CRITICAL));
      return findings;
    }

    // Per-statement balance math
    statements.forEach((stmt) => {
      const { file, openingBalance, closingBalance, totalDebits, totalCredits } = stmt;
      if (openingBalance == null || closingBalance == null) {
        findings.push(warning(`${file}: opening or closing balance missing — cannot verify math`, SEV.MAJOR));
        return;
      }
      const expected = +(openingBalance + totalCredits - totalDebits).toFixed(2);
      const actual = +closingBalance.toFixed(2);
      const diff = Math.abs(expected - actual);
      if (diff > 1) {
        findings.push(issue(
          `${file}: balance mismatch — expected $${expected.toFixed(2)}, got $${actual.toFixed(2)} (off by $${diff.toFixed(2)})`,
          SEV.CRITICAL
        ));
      } else if (diff > 0.01) {
        findings.push(warning(`${file}: rounding difference of $${diff.toFixed(2)} — verify cents`, SEV.MINOR));
      }
    });

    // Cross-statement continuity
    const sorted = [...statements].sort((a, b) => new Date(a.periodStart) - new Date(b.periodStart));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.closingBalance != null && curr.openingBalance != null) {
        const gap = Math.abs(prev.closingBalance - curr.openingBalance);
        if (gap > 1) {
          findings.push(issue(
            `Balance gap: ${prev.file} closes $${prev.closingBalance.toFixed(2)} but ${curr.file} opens $${curr.openingBalance.toFixed(2)} — $${gap.toFixed(2)} unaccounted`,
            SEV.CRITICAL
          ));
        }
      }
    }

    // Running balance errors
    (toolOutput.runningBalanceErrors || []).forEach((e) => {
      findings.push(issue(`${e.file} row ${e.row}: running balance error — expected $${e.expected}, found $${e.found}`, SEV.MAJOR));
    });

    // Column swap detection
    const swapSuspects = statements.filter(
      (s) => s.totalCredits > 0 && s.totalDebits === 0 && s.transactionCount > 5
    );
    if (swapSuspects.length > 0) {
      findings.push(issue(
        `${swapSuspects.map((s) => s.file).join(", ")}: credits present but zero debits — possible column swap (verify account type)`,
        SEV.MAJOR
      ));
    }

    // Date gaps
    (toolOutput.dateGaps || []).forEach((g) => {
      findings.push(warning(`${g.file}: ${g.dayGap}-day gap (${g.from} → ${g.to}) — verify no missing pages`, SEV.MINOR));
    });

    // Invalid dates — OCR mangled
    const invalidDates = allTransactions.filter((t) => t.date && !isValidDate(t.date));
    if (invalidDates.length > 0) {
      findings.push(issue(`${invalidDates.length} transaction(s) have invalid dates — OCR may have mangled the date field`, SEV.MAJOR));
    }

    // Amount outliers
    (toolOutput.amountOutliers || []).forEach((o) => {
      findings.push(warning(`${o.file}: $${o.amount} on ${o.date} is ${o.times}× the median — possible OCR error`, SEV.MINOR));
    });

    // Missing descriptions
    const missingDesc = allTransactions.filter((t) => !t.description?.trim()).length;
    if (missingDesc > 0) findings.push(warning(`${missingDesc} transaction(s) have no description`, SEV.MINOR));

    // Duplicate transactions
    const seen = new Map();
    let dupes = 0;
    allTransactions.forEach((t) => {
      const key = `${t.date}-${t.debit}-${t.credit}-${t.description?.trim()}`;
      if (seen.has(key)) dupes++;
      else seen.set(key, true);
    });
    if (dupes > 0) findings.push(warning(`${dupes} possible duplicate transaction(s) — same date, amount, description`, SEV.MINOR));
  }

  // ── INVOICE EXTRACTION ───────────────────────────────────────
  if (toolName === "extraction-invoice") {
    const invoices = toolOutput.invoices || [];
    const summary = toolOutput.summary || {};

    if (invoices.length === 0) {
      findings.push(issue("No invoices extracted — check if PDFs are valid invoice documents", SEV.CRITICAL));
      return findings;
    }

    // Tax math check
    let taxErrors = 0;
    invoices.forEach((inv) => {
      if (inv.subtotal != null && inv.tax != null && inv.total != null) {
        const expected = +(inv.subtotal + inv.tax).toFixed(2);
        if (Math.abs(expected - inv.total) > 0.05) taxErrors++;
      }
    });
    if (taxErrors > 0) findings.push(issue(`${taxErrors} invoice(s): subtotal + tax ≠ total — extraction or OCR error`, SEV.MAJOR));

    // Duplicate invoice numbers
    const invoiceNums = invoices.map((i) => i.invoiceNumber).filter(Boolean);
    const uniqueNums = new Set(invoiceNums);
    if (uniqueNums.size < invoiceNums.length) {
      findings.push(issue(`${invoiceNums.length - uniqueNums.size} duplicate invoice number(s) — same invoice extracted twice?`, SEV.MAJOR));
    }

    // Future-dated invoices
    const futureDated = invoices.filter((inv) => inv.invoiceDate && isFutureDate(inv.invoiceDate));
    if (futureDated.length > 0) {
      findings.push(issue(`${futureDated.length} invoice(s) are future-dated — OCR error or pre-dated document`, SEV.MAJOR));
    }

    // Invalid dates
    const invalidDates = invoices.filter((inv) => inv.invoiceDate && !isValidDate(inv.invoiceDate));
    if (invalidDates.length > 0) {
      findings.push(issue(`${invalidDates.length} invoice(s) have invalid dates — OCR may have mangled the date field`, SEV.MAJOR));
    }

    // Amount outliers
    const amounts = invoices.map((i) => i.total).filter((a) => a > 0).sort((a, b) => a - b);
    if (amounts.length > 3) {
      const median = amounts[Math.floor(amounts.length / 2)];
      const outliers = amounts.filter((a) => a > median * 50 || a < median / 50);
      if (outliers.length > 0) {
        findings.push(warning(`${outliers.length} invoice amount(s) are extreme outliers vs median $${median.toFixed(2)} — verify OCR`, SEV.MINOR));
      }
    }

    // Missing fields
    const missingTotal  = invoices.filter((i) => i.total == null).length;
    const missingVendor = invoices.filter((i) => !i.vendorName?.trim()).length;
    const missingDate   = invoices.filter((i) => !i.invoiceDate?.trim()).length;
    if (missingTotal > 0)  findings.push(issue(`${missingTotal} invoice(s) missing total amount`, SEV.MAJOR));
    if (missingVendor > 0) findings.push(warning(`${missingVendor} invoice(s) missing vendor name`, SEV.MINOR));
    if (missingDate > 0)   findings.push(warning(`${missingDate} invoice(s) missing invoice date`, SEV.MINOR));

    // Failure rate
    const failRate = ((summary.errorCount || 0) / (summary.totalFiles || 1)) * 100;
    if (failRate > 20) findings.push(issue(`${failRate.toFixed(0)}% of invoices failed extraction — check PDF quality`, SEV.MAJOR));
    else if (failRate > 5) findings.push(warning(`${failRate.toFixed(0)}% of invoices failed extraction`, SEV.MINOR));
  }

  // ── TRANSACTION ANALYSIS ─────────────────────────────────────
  if (toolName === "transaction-analysis") {
    const accounts = toolOutput.accounts || [];
    const flaggedTransfers = toolOutput.flaggedTransfers || [];
    const fileCount = toolOutput.fileCount || 0;

    if (fileCount === 0) {
      findings.push(issue("No files were processed — check input format", SEV.CRITICAL));
      return findings;
    }

    accounts.forEach((acc) => {
      if (!acc.monthlyData?.length) return;

      // Spike detection
      const counts = acc.monthlyData.map((m) => m.count).filter((c) => c > 0);
      if (counts.length > 2) {
        const avg = counts.reduce((s, c) => s + c, 0) / counts.length;
        acc.monthlyData.filter((m) => m.count > avg * 5).forEach((s) => {
          findings.push(warning(
            `"${acc.name}": ${s.month} has ${s.count} transactions vs avg ${avg.toFixed(0)} — investigate spike`,
            SEV.MINOR
          ));
        });
      }

      // ── FIXED: Dormancy check ──────────────────────────────────
      // Only flag 6+ consecutive zero months IN THE MIDDLE of an active period.
      // Do NOT flag accounts that simply start late (e.g. a card opened mid-period).
      const nonZeroIndices = acc.monthlyData
        .map((m, i) => (m.count > 0 ? i : -1))
        .filter((i) => i !== -1);

      if (nonZeroIndices.length >= 2) {
        const first = nonZeroIndices[0];
        const last  = nonZeroIndices[nonZeroIndices.length - 1];
        // Look only at months between first and last active month
        const middleSlice = acc.monthlyData.slice(first, last + 1);
        let gapRun = 0;
        let longestGap = 0;
        middleSlice.forEach((m) => {
          if (m.count === 0) {
            gapRun++;
            if (gapRun > longestGap) longestGap = gapRun;
          } else {
            gapRun = 0;
          }
        });
        // Only flag if there's a gap of 6+ consecutive zero months mid-period
        if (longestGap >= 6) {
          findings.push(warning(
            `"${acc.name}": ${longestGap} consecutive zero-activity months mid-period — verify statements are complete for this period`,
            SEV.MINOR
          ));
        }
      }

      // Zero-activity gaps (shorter gaps — still worth listing per month)
      if (nonZeroIndices.length >= 2) {
        const first = nonZeroIndices[0];
        const last  = nonZeroIndices[nonZeroIndices.length - 1];
        const gaps  = acc.monthlyData
          .slice(first, last + 1)
          .filter((m) => m.count === 0)
          .map((m) => m.month);
        if (gaps.length > 0 && gaps.length < 6) {
          // Only show smaller gaps (6+ already caught above)
          findings.push(warning(
            `"${acc.name}": no activity in ${gaps.slice(0, 6).join(", ")}${gaps.length > 6 ? ` +${gaps.length - 6} more` : ""} — missing statements?`,
            SEV.MINOR
          ));
        }
      }
    });

    // ── FIXED: Interbank unmatched — softer framing ────────────
    // These are typically external payments (AmEx, vendors, wire out) —
    // not necessarily missing accounts within the dataset.
    if (flaggedTransfers.length > 0) {
      findings.push(warning(
        `${flaggedTransfers.length} outgoing transfer(s) have no matching inbound in this dataset — likely external payments (vendors, credit cards, third parties). Review if any counterparty should be in scope.`,
        SEV.MINOR
      ));
    }

    // Very low total transactions
    const totalTx = accounts.reduce((s, a) => s + (a.totalTransactions || 0), 0);
    if (fileCount > 0 && totalTx < fileCount * 5) {
      findings.push(warning(
        `Only ${totalTx} total transactions across ${fileCount} files — verify input files are correct`,
        SEV.MINOR
      ));
    }
  }

  // ── STATEMENT TRACKER ────────────────────────────────────────
  if (toolName === "tracker") {
    const gaps          = toolOutput.gaps || 0;
    const totalMonths   = toolOutput.totalMonths || 0;
    const totalAccounts = (toolOutput.totalBankAccounts || 0) + (toolOutput.totalCreditCards || 0);
    const missingMonths = toolOutput.missingMonths || [];
    const duplicateAccounts = toolOutput.duplicateAccounts || [];

    if (totalAccounts === 0) {
      findings.push(issue("No accounts found in tracker — check input Excel schema", SEV.CRITICAL));
      return findings;
    }
    if (totalMonths === 0) {
      findings.push(issue("Tracker has no months of data — output may be empty", SEV.CRITICAL));
      return findings;
    }

    const gapRate = (gaps / totalMonths) * 100;
    if (gapRate > 30) {
      findings.push(issue(`High gap rate: ${gaps} missing months out of ${totalMonths} (${gapRate.toFixed(0)}%)`, SEV.MAJOR));
    } else if (gaps > 0) {
      const monthStr = missingMonths.length > 0
        ? `Missing: ${missingMonths.slice(0, 6).join(", ")}${missingMonths.length > 6 ? ` +${missingMonths.length - 6} more` : ""}`
        : `${gaps} gap(s) in tracker`;
      findings.push(warning(monthStr, SEV.MINOR));
    }

    if (duplicateAccounts.length > 0) {
      findings.push(warning(
        `Possible duplicate accounts: ${duplicateAccounts.join(", ")} — same account, different name format?`,
        SEV.MINOR
      ));
    }

    if (totalMonths < 3) {
      findings.push(warning(`Only ${totalMonths} months covered — is this the full requested date range?`, SEV.MINOR));
    }
  }

  // ── CATEGORISATION ──────────────────────────────────────────
  if (toolName === "categorisation") {
    const files = toolOutput.files || [];
    if (files.length === 0) {
      findings.push(issue("No files categorised", SEV.CRITICAL));
      return findings;
    }

    const normalized = files.map((f) => ({
      ...f,
      confidenceFloat: typeof f.confidence === "string"
        ? f.confidence === "HIGH" ? 0.9 : f.confidence === "MEDIUM" ? 0.5 : 0.2
        : (f.confidence ?? 0.5),
    }));

    // HARD RULE — bank statement in wrong folder
    const bankInWrongFolder = files.filter(
      (f) => f.file?.toLowerCase().includes("bank") &&
             f.folder && !f.folder.toLowerCase().includes("bank")
    );
    if (bankInWrongFolder.length > 0) {
      findings.push(issue(
        `${bankInWrongFolder.length} file(s) with "bank" in name placed outside Bank Statements folder — verify classification`,
        SEV.CRITICAL
      ));
    }

    // Semantic mismatches from API route
    (toolOutput.semanticMismatches || []).forEach((m) => {
      findings.push(warning(`"${m.file}" → ${m.folder} but name suggests ${m.suggestedFolder}`, SEV.MINOR));
    });

    // Low confidence rate
    const lowConf = normalized.filter((f) => f.confidenceFloat < 0.5);
    const lowPct  = (lowConf.length / files.length) * 100;
    if (lowPct > 25) findings.push(issue(`${lowPct.toFixed(0)}% of files have low confidence`, SEV.MAJOR));
    else if (lowPct > 10) findings.push(warning(`${lowPct.toFixed(0)}% of files have low confidence`, SEV.MINOR));

    // All-HIGH suspicious
    if (normalized.every((f) => f.confidenceFloat >= 0.9) && files.length > 20) {
      findings.push(warning(
        `All ${files.length} files scored HIGH confidence — possible AI overconfidence, spot-check manually`,
        SEV.MINOR
      ));
    }

    // Miscellaneous overflow
    const misc    = files.filter((f) => f.folder?.toLowerCase().includes("miscellaneous"));
    const miscPct = (misc.length / files.length) * 100;
    if (miscPct > 15) findings.push(issue(`${miscPct.toFixed(0)}% of files in Miscellaneous`, SEV.MAJOR));
    else if (miscPct > 5) findings.push(warning(`${miscPct.toFixed(0)}% of files in Miscellaneous`, SEV.MINOR));

    const noFolder = files.filter((f) => !f.folder?.trim()).length;
    if (noFolder > 0) findings.push(issue(`${noFolder} file(s) have no folder assigned`, SEV.MAJOR));
  }

  // ── BATES STAMPING ──────────────────────────────────────────
  if (toolName === "bates-stamp") {
    const files            = toolOutput.files || [];
    const stampedCount     = toolOutput.stampedCount || 0;
    const totalFiles       = toolOutput.totalFiles || files.length;
    const totalInputPages  = toolOutput.totalInputPages || 0;
    const totalStampedPages = toolOutput.totalStampedPages || 0;

    if (totalFiles > 0 && stampedCount < totalFiles) {
      findings.push(issue(`${totalFiles - stampedCount} of ${totalFiles} file(s) were not stamped`, SEV.MAJOR));
    }

    // Duplicate Bates numbers
    const batesNumbers = files.map((f) => f.batesNumber || f.startBates).filter(Boolean);
    const unique = new Set(batesNumbers);
    if (unique.size < batesNumbers.length) {
      findings.push(issue("Duplicate Bates numbers detected — numbering is incorrect, do not produce", SEV.CRITICAL));
    }

    // Sequence gaps
    const nums = batesNumbers
      .map((b) => parseInt(b.replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    const gapsFound = [];
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i - 1] > 1) {
        gapsFound.push({ from: nums[i - 1], to: nums[i], size: nums[i] - nums[i - 1] - 1 });
      }
    }
    if (gapsFound.length > 0) {
      const worstGap = gapsFound.sort((a, b) => a.size - b.size)[0];
      const sev  = worstGap.size === 1 ? SEV.CRITICAL : SEV.MAJOR;
      const note = worstGap.size === 1 ? " (gap of 1 — looks intentional)" : "";
      findings.push(issue(
        `Bates gap(s): ${gapsFound.slice(0, 3).map((g) => `${g.from}→${g.to}`).join(", ")}${gapsFound.length > 3 ? " ..." : ""}${note}`,
        sev
      ));
    }

    // Prefix consistency
    const prefixes = [...new Set(batesNumbers.map((b) => b.replace(/\d+$/, "")))];
    if (prefixes.length > 1) {
      findings.push(issue(`Inconsistent Bates prefix: ${prefixes.join(", ")}`, SEV.MAJOR));
    }

    // Page count match
    if (totalInputPages > 0 && totalStampedPages > 0 && totalStampedPages !== totalInputPages) {
      findings.push(issue(
        `Page count mismatch: ${totalStampedPages} stamped vs ${totalInputPages} input pages`,
        SEV.MAJOR
      ));
    }

    const zeroPage = files.filter((f) => (f.pages || f.pageCount || 0) === 0).length;
    if (zeroPage > 0) findings.push(warning(`${zeroPage} stamped file(s) have 0 pages — corrupt or empty`, SEV.MINOR));
  }

  // ── PDF SPLITTER ─────────────────────────────────────────────
  if (toolName === "splitter") {
    const splits     = toolOutput.splits || [];
    const totalPages = toolOutput.totalPages || 0;

    if (splits.length === 0) {
      findings.push(issue("No splits produced", SEV.CRITICAL));
      return findings;
    }

    const splitTotal = splits.reduce((s, sp) => s + (sp.pageCount || sp.pages || 0), 0);
    if (totalPages > 0 && Math.abs(splitTotal - totalPages) > 2) {
      findings.push(issue(`Page count mismatch: splits account for ${splitTotal} of ${totalPages} pages`, SEV.MAJOR));
    }

    const unnamed = splits.filter((s) => !s.name?.trim()).length;
    if (unnamed > 0) findings.push(warning(`${unnamed} split(s) have no name`, SEV.MINOR));

    const generic = splits.filter((s) =>
      /^(document|part|file|split)[_\s\d]+$/i.test(s.name?.trim() || "")
    ).length;
    if (generic > splits.length * 0.5) {
      findings.push(warning(`${generic} splits have generic auto-generated names — AI naming may have failed`, SEV.MINOR));
    }

    if (splits.length > 1 && splitTotal > 0) {
      const maxPages = Math.max(...splits.map((s) => s.pageCount || s.pages || 0));
      const maxPct   = (maxPages / splitTotal) * 100;
      if (maxPct > 75) {
        const big = splits.find((s) => (s.pageCount || s.pages || 0) === maxPages);
        findings.push(warning(`"${big?.name}" has ${maxPct.toFixed(0)}% of all pages — split may be unbalanced`, SEV.MINOR));
      }
    }

    const empty = splits.filter((s) => (s.pageCount || s.pages || 0) === 0).length;
    if (empty > 0) findings.push(issue(`${empty} split(s) have 0 pages`, SEV.MAJOR));
  }

  // ── DESCRIPTION CATEGORISER ──────────────────────────────────
  if (toolName === "desc-categoriser") {
    const descriptions = toolOutput.descriptions || [];
    const total = descriptions.length;

    if (total === 0) {
      findings.push(issue("No descriptions found in output", SEV.CRITICAL));
      return findings;
    }

    const uncategorised = descriptions.filter((d) =>
      !d.category?.trim() ||
      ["uncategorised", "uncategorized", "other", "unknown"].includes(d.category.toLowerCase())
    ).length;
    if ((uncategorised / total) * 100 > 15) {
      findings.push(warning(`${((uncategorised / total) * 100).toFixed(0)}% of descriptions uncategorised`, SEV.MINOR));
    }

    // Inconsistency: same description, different categories
    const freqMap = {};
    descriptions.forEach((d) => {
      const key = d.description?.toLowerCase().trim();
      if (!key) return;
      if (!freqMap[key]) freqMap[key] = { cats: new Set(), count: 0 };
      freqMap[key].cats.add(d.category);
      freqMap[key].count++;
    });
    const inconsistent = Object.entries(freqMap).filter(([, v]) => v.count > 3 && v.cats.size > 1);
    if (inconsistent.length > 0) {
      findings.push(warning(
        `${inconsistent.length} description(s) appear multiple times with different categories`,
        SEV.MINOR
      ));
    }

    (toolOutput.semanticMismatches || []).forEach((m) => {
      findings.push(warning(`"${m.description}" → "${m.assigned}" but likely should be "${m.expected}"`, SEV.MINOR));
    });

    const lowConf = descriptions.filter((d) => d.confidence != null && d.confidence < 0.4).length;
    if (lowConf > 0) findings.push(warning(`${lowConf} description(s) have very low confidence`, SEV.MINOR));
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────
// FACTS SUMMARY — readable structured summary for AI
// ─────────────────────────────────────────────────────────────
function buildFactsSummary(toolName, toolOutput) {
  try {
    if (toolName === "extraction-bank") {
      const stmts = toolOutput.statements || [];
      const lines = [
        `Total statements: ${stmts.length}`,
        `Total transactions: ${toolOutput.transactions?.length || 0}`,
      ];
      stmts.forEach((s) => {
        lines.push(
          `  ${s.file}: ${s.transactionCount} tx | Opening $${s.openingBalance?.toFixed(2) ?? "?"} → Closing $${s.closingBalance?.toFixed(2) ?? "?"} | Debits $${s.totalDebits?.toFixed(2) ?? "?"} Credits $${s.totalCredits?.toFixed(2) ?? "?"}`
        );
      });
      if (toolOutput.dateGaps?.length > 0)
        lines.push(`Date gaps: ${toolOutput.dateGaps.map((g) => `${g.file} ${g.from}→${g.to} (${g.dayGap}d)`).join(", ")}`);
      return lines.join("\n");
    }

    if (toolName === "extraction-invoice") {
      const invs    = toolOutput.invoices || [];
      const amounts = invs.map((i) => i.total).filter((a) => a > 0).sort((a, b) => a - b);
      const median  = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
      return [
        `Total invoices: ${invs.length}`,
        `Success: ${toolOutput.summary?.successCount || 0} | Failed: ${toolOutput.summary?.errorCount || 0}`,
        `Amount range: $${amounts[0]?.toFixed(2) || 0} – $${amounts[amounts.length - 1]?.toFixed(2) || 0} | Median: $${median.toFixed(2)}`,
        `Vendors: ${[...new Set(invs.map((i) => i.vendorName).filter(Boolean))].slice(0, 6).join(", ")}`,
      ].join("\n");
    }

    if (toolName === "transaction-analysis") {
      const accs = toolOutput.accounts || [];
      return [
        `Files: ${toolOutput.fileCount || 0} | Accounts: ${accs.length}`,
        ...accs.map((a) => {
          const active = a.monthlyData?.filter((m) => m.count > 0).length || 0;
          return `  ${a.name}: ${a.totalTransactions || 0} tx, ${active} active months`;
        }),
        `Flagged transfers (external/unmatched): ${toolOutput.flaggedTransfers?.length || 0}`,
      ].join("\n");
    }

    if (toolName === "tracker") {
      return [
        `Bank accounts: ${toolOutput.totalBankAccounts || 0} | Credit cards: ${toolOutput.totalCreditCards || 0}`,
        `Months: ${toolOutput.totalMonths || 0} | Gaps: ${toolOutput.gaps || 0}`,
        toolOutput.missingMonths?.length
          ? `Missing: ${toolOutput.missingMonths.slice(0, 8).join(", ")}`
          : "No missing months",
      ].filter(Boolean).join("\n");
    }

    if (toolName === "categorisation") {
      const files   = toolOutput.files || [];
      const folders = {};
      files.forEach((f) => { folders[f.folder] = (folders[f.folder] || 0) + 1; });
      const top = Object.entries(folders).sort((a, b) => b[1] - a[1]).slice(0, 7);
      return [
        `Total: ${files.length} files`,
        `Distribution: ${top.map(([f, c]) => `${f.split("_").slice(1).join(" ")} (${c})`).join(", ")}`,
      ].join("\n");
    }

    if (toolName === "bates-stamp") {
      const files = toolOutput.files || [];
      const nums  = files.map((f) => f.batesNumber || f.startBates).filter(Boolean);
      return [
        `Stamped: ${toolOutput.stampedCount || 0} / ${toolOutput.totalFiles || 0} files`,
        `Range: ${nums[0] || "?"} → ${nums[nums.length - 1] || "?"}`,
        `Pages: ${toolOutput.totalStampedPages || "?"} stamped vs ${toolOutput.totalInputPages || "?"} input`,
      ].join("\n");
    }

    if (toolName === "splitter") {
      const splits = toolOutput.splits || [];
      return [
        `Splits: ${splits.length} | Total pages: ${toolOutput.totalPages || 0}`,
        ...splits.map((s) => `  "${s.name}": ${s.pageCount || s.pages || 0} pages`),
      ].join("\n");
    }

    if (toolName === "desc-categoriser") {
      const descs = toolOutput.descriptions || [];
      const cats  = {};
      descs.forEach((d) => { cats[d.category] = (cats[d.category] || 0) + 1; });
      const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return [
        `Total: ${descs.length} descriptions`,
        `Categories: ${top.map(([c, n]) => `${c} (${n})`).join(", ")}`,
      ].join("\n");
    }

    return JSON.stringify(toolOutput).slice(0, 2000);
  } catch {
    return JSON.stringify(toolOutput).slice(0, 2000);
  }
}

// ─────────────────────────────────────────────────────────────
// LAYER 2: AI Analysis
// ─────────────────────────────────────────────────────────────
async function runAIAnalysis(toolName, toolOutput, ruleFindings) {
  const domainKnowledge = DOMAIN_PROMPTS[toolName] || "";
  const factsSummary    = buildFactsSummary(toolName, toolOutput);
  const ruleIssues      = ruleFindings.filter((f) => f.type === "issue").map((f) => `[${f.sev.label}] ${f.msg}`);
  const ruleWarnings    = ruleFindings.filter((f) => f.type === "warning").map((f) => f.msg);

  const systemPrompt = `${domainKnowledge}

YOUR TASK:
Rule checks have already caught basic errors. Find what they missed using your domain expertise.
Think like opposing counsel trying to find problems — then check if those problems actually exist in the data.

IMPORTANT CONTEXT FOR TRANSACTION ANALYSIS:
- Accounts that start late in the dataset are NOT dormant — they simply opened later. Do not flag them as suspicious.
- External payments (AmEx, vendors, wire transfers out) will not have counterparts in the dataset. This is normal.
- Only flag patterns that are genuinely anomalous given the account type and business context.

SCORING:
90-100: Clean, court-ready.
75-89:  Minor issues, usable with spot-check.
55-74:  Real problems, requires correction.
30-54:  Significant errors, re-run needed.
0-29:   Unreliable, do not use.

RULES:
- Be SPECIFIC — name the file, account, date, or amount when flagging
- If data looks clean, score it high. Do not manufacture concerns.
- Summary must be written for an attorney or senior analyst, not a developer.

Return ONLY valid JSON, no markdown:
{
  "aiScore": <0-100>,
  "aiIssues": ["<specific issue with evidence>"],
  "aiWarnings": ["<specific warning with evidence>"],
  "aiRecommendations": ["<specific actionable step>"],
  "aiSummary": "<2-3 sentence professional assessment>"
}`;

  const userPrompt = `TOOL: ${toolName}

RULE CHECKS FOUND:
Issues (${ruleIssues.length}): ${ruleIssues.length > 0 ? ruleIssues.join(" | ") : "none"}
Warnings (${ruleWarnings.length}): ${ruleWarnings.length > 0 ? ruleWarnings.join(" | ") : "none"}

DATA:
${factsSummary}

What did the rules miss?`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0].text.trim().replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

// ─────────────────────────────────────────────────────────────
// SCORE CALCULATOR
// ─────────────────────────────────────────────────────────────
function calculateScore(toolName, ruleFindings, aiScore) {
  const cfg = TOOL_CONFIG[toolName] || { ruleWeight: 0.60, aiWeight: 0.40, cap: 40, passAt: 88 };

  const totalDeduct  = ruleFindings.reduce((sum, f) => sum + f.sev.deduct, 0);
  const cappedDeduct = Math.min(totalDeduct, cfg.cap);
  const ruleScore    = Math.max(0, 100 - cappedDeduct);

  const blended = ruleScore * cfg.ruleWeight + aiScore * cfg.aiWeight;
  return Math.max(0, Math.min(100, Math.round(blended)));
}

function getStatus(toolName, score) {
  const cfg = TOOL_CONFIG[toolName] || { passAt: 88 };
  if (score >= cfg.passAt) return "PASS";
  if (score >= 65) return "WARNING";
  return "FAIL";
}

// ─────────────────────────────────────────────────────────────
// EXPLAINABILITY — top score-impact items
// ─────────────────────────────────────────────────────────────
function buildScoreBreakdown(ruleFindings) {
  const sorted = [...ruleFindings].sort((a, b) => b.sev.deduct - a.sev.deduct).slice(0, 3);
  return sorted.map((f) => ({
    label:    f.msg,
    impact:   f.sev.deduct,
    severity: f.sev.label,
    type:     f.type,
  }));
}

// ─────────────────────────────────────────────────────────────
// MAIN POST HANDLER
// ─────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json();
    const { toolName, toolOutput, metadata } = body;

    if (!toolName || !toolOutput) {
      return NextResponse.json({ error: "Both toolName and toolOutput are required" }, { status: 400 });
    }

    const enriched = { ...toolOutput, ...(metadata || {}) };

    // Layer 1 — rule checks
    const ruleFindings = runRuleChecks(toolName, enriched);
    const ruleIssues   = ruleFindings.filter((f) => f.type === "issue").map((f) => f.msg);
    const ruleWarnings = ruleFindings.filter((f) => f.type === "warning").map((f) => f.msg);

    // Layer 2 — AI analysis
    let aiResult = {
      aiScore: 70,
      aiIssues: [],
      aiWarnings: [],
      aiRecommendations: ["Re-run QC once AI analysis is available."],
      aiSummary: "AI analysis unavailable. Rule-based checks applied only.",
    };
    try {
      aiResult = await runAIAnalysis(toolName, toolOutput, ruleFindings);
    } catch (err) {
      console.error("QC AI failed:", err.message, "| Tool:", toolName);
    }

    const finalScore   = calculateScore(toolName, ruleFindings, aiResult.aiScore);
    const status       = getStatus(toolName, finalScore);
    const breakdown    = buildScoreBreakdown(ruleFindings);

    return NextResponse.json({
      status,
      score:           finalScore,
      issues:          [...ruleIssues,   ...(aiResult.aiIssues   || [])],
      warnings:        [...ruleWarnings, ...(aiResult.aiWarnings  || [])],
      recommendations: aiResult.aiRecommendations || [],
      summary:         aiResult.aiSummary,
      scoreBreakdown:  breakdown,
      meta: {
        toolName,
        ruleIssueCount:   ruleIssues.length,
        ruleWarningCount: ruleWarnings.length,
        aiScore:          aiResult.aiScore,
        timestamp:        new Date().toISOString(),
      },
    });

  } catch (err) {
    console.error("QC critical error:", err.message);
    return NextResponse.json({
      status:          "WARNING",
      score:           50,
      issues:          [],
      warnings:        ["QC encountered an unexpected error. Manual review recommended."],
      recommendations: ["Check server logs for error details."],
      summary:         "QC could not complete due to a system error.",
      scoreBreakdown:  [],
    });
  }
}
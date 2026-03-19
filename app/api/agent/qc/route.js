// /app/api/agent/qc/route.js

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const client = new Anthropic();

const SEV = {
  CRITICAL: { label: "Critical", deduct: 25 },
  MAJOR:    { label: "Major",    deduct: 10 },
  MINOR:    { label: "Minor",    deduct: 3  },
};
function issue(msg, sev = SEV.MAJOR)   { return { msg, sev, type: "issue" }; }
function warning(msg, sev = SEV.MINOR) { return { msg, sev, type: "warning" }; }

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

const DOMAIN_PROMPTS = {
  "extraction-bank": `
You are a forensic accountant with 20 years supporting financial fraud litigation.

OCR errors easy to miss:
- "7" misread as "1": $7,500 → $1,500
- Comma misread as decimal: $1,234 → $1.234
- Running balance printed as a transaction — shows as massive credit
- Redacted account numbers in description — transaction may have been silently skipped
- Amount column physically blacked out — transaction extracted with $0 amount

Fraud patterns (flag for attorney review, not accusation):
- Round-dollar transfers just below $10K reporting thresholds (structuring)
- Daily ATM withdrawals at maximum limit for consecutive days
- Large deposits followed immediately by large transfers out (pass-through)
- Same vendor paid multiple times in a short window

Statement integrity:
- Closing balance of Jan MUST equal opening balance of Feb
- Gaps > 10 days in active business account = likely missing pages
`,
  "extraction-invoice": `
You are an AP fraud auditor who has investigated invoice fraud at 50+ companies.
Invoice fraud patterns:
- Sequential invoice numbers from same vendor within days
- Amounts just below approval thresholds
- Invoice date on a weekend or holiday for a B2B vendor
- Due date before invoice date — impossible
`,
  "transaction-analysis": `
You are a financial forensics analyst building pivot analyses for litigation.
Context before flagging:
- AmEx and credit card accounts often start mid-period — this is NOT dormancy
- External payments will not have counterparts in the dataset — this is expected
- Only flag unmatched transfers if the counterparty SHOULD be in the dataset
`,
  "tracker": `
You are a legal discovery compliance specialist.
Gap patterns:
- Single missing month = one PDF not uploaded
- 3+ consecutive missing = full quarter missing
- All accounts missing same month = that folder never processed
`,
  "categorisation": `
You are a senior paralegal who has organized 500+ legal document productions.
HARD RULES:
- Bank statements in Court Filings folder = wrong
- Contracts in Bank Statements folder = wrong
- Attorney letters in any non-Correspondence folder = privilege risk
`,
  "bates-stamp": `
You are a litigation support director.
NON-NEGOTIABLE:
- Any gap in sequence = document may have been withheld
- Gap of 1 is MORE suspicious than gap of 100 — looks intentional
- Duplicate numbers = corrupts entire production
`,
  "splitter": `
You are a document processing specialist.
Watch for:
- One split with 80% of pages = split point was missed
- All splits same page count = AI split on count not content
- Total pages across splits ≠ total input pages = pages lost
`,
  "desc-categoriser": `
You are a forensic accountant categorizing business transactions.
HIGH-STAKES ERRORS:
- WIRE TRANSFER → Utilities = hides fund movements
- ADP/PAYCHEX/GUSTO → not Payroll = understates labor costs
- LOAN PAYMENT → Transfer = hides debt obligations
`,
};

function isValidDate(d) { if (!d) return false; return !isNaN(new Date(d).getTime()); }
function isFutureDate(d) { if (!d) return false; return new Date(d) > new Date(); }

// ─────────────────────────────────────────────────────────────
// RULE CHECKS
// ─────────────────────────────────────────────────────────────
function runRuleChecks(toolName, toolOutput) {
  const findings = [];

  if (toolName === "extraction-bank") {
    const statements      = toolOutput.statements   || [];
    const allTransactions = toolOutput.transactions || [];

    if (statements.length === 0 && allTransactions.length === 0) {
      findings.push(issue("No data returned — extraction may have failed silently", SEV.CRITICAL));
      return findings;
    }

    // Balance math per statement
    statements.forEach((stmt) => {
      const { file, openingBalance, closingBalance, totalDebits, totalCredits } = stmt;
      if (openingBalance == null || closingBalance == null) {
        findings.push(warning(`${file}: opening or closing balance missing`, SEV.MAJOR));
        return;
      }
      const expected = +(openingBalance + totalCredits - totalDebits).toFixed(2);
      const diff     = Math.abs(expected - closingBalance);
      if (diff > 1) {
        findings.push(issue(`${file}: balance mismatch — expected $${expected.toFixed(2)}, got $${closingBalance.toFixed(2)} (off by $${diff.toFixed(2)})`, SEV.CRITICAL));
      } else if (diff > 0.01) {
        findings.push(warning(`${file}: rounding difference $${diff.toFixed(2)} — verify cents`, SEV.MINOR));
      }
    });

    // Cross-statement continuity
    const sorted = [...statements].sort((a, b) => new Date(a.periodStart) - new Date(b.periodStart));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i-1], curr = sorted[i];
      if (prev.closingBalance != null && curr.openingBalance != null) {
        const gap = Math.abs(prev.closingBalance - curr.openingBalance);
        if (gap > 1) findings.push(issue(`Balance gap: ${prev.file} closes $${prev.closingBalance.toFixed(2)} but ${curr.file} opens $${curr.openingBalance.toFixed(2)} — $${gap.toFixed(2)} unaccounted`, SEV.CRITICAL));
      }
    }

    // Running balance errors — only when math fails
    const badMathSet = new Set(
      statements.filter((s) => {
        if (s.openingBalance == null || s.closingBalance == null || s.totalDebits == null || s.totalCredits == null) return false;
        return Math.abs(s.openingBalance + s.totalCredits - s.totalDebits - s.closingBalance) > 1;
      }).map((s) => s.file)
    );
    (toolOutput.runningBalanceErrors || []).forEach((e) => {
      if (badMathSet.has(e.file)) findings.push(issue(`${e.file} row ${e.row}: running balance error — expected $${e.expected}, found $${e.found}`, SEV.MAJOR));
    });

    // Column swap
    const swapSuspects = statements.filter((s) => s.totalCredits > 0 && s.totalDebits === 0 && s.transactionCount > 5);
    if (swapSuspects.length > 0) findings.push(issue(`${swapSuspects.map(s => s.file).join(", ")}: credits present but zero debits — possible column swap`, SEV.MAJOR));

    // Date gaps
    (toolOutput.dateGaps || []).forEach((g) => findings.push(warning(`${g.file}: ${g.dayGap}-day gap (${g.from} → ${g.to}) — verify no missing pages`, SEV.MINOR)));

    // Invalid dates
    const invalidDates = allTransactions.filter((t) => t.date && !isValidDate(t.date));
    if (invalidDates.length > 0) findings.push(issue(`${invalidDates.length} transaction(s) have invalid dates`, SEV.MAJOR));

    // Amount outliers — debit only, no checks (already filtered in buildBankQcData)
    (toolOutput.amountOutliers || []).forEach((o) => findings.push(warning(`${o.file}: debit $${o.amount} on ${o.date} is ${o.times}× the median — possible OCR error (extra zero?)`, SEV.MINOR)));

    // Missing descriptions
    const missingDesc = allTransactions.filter((t) => !t.description?.trim()).length;
    if (missingDesc > 0) findings.push(warning(`${missingDesc} transaction(s) have no description`, SEV.MINOR));

    // Duplicates
    const seen = new Map(); let dupes = 0;
    allTransactions.forEach((t) => {
      const key = `${t.date}-${t.debit}-${t.credit}-${t.description?.trim()}`;
      if (seen.has(key)) dupes++; else seen.set(key, true);
    });
    if (dupes > 0) findings.push(warning(`${dupes} possible duplicate transaction(s) — same date, amount, description`, SEV.MINOR));
  }

  if (toolName === "extraction-invoice") {
    const invoices = toolOutput.invoices || [], summary = toolOutput.summary || {};
    if (invoices.length === 0) { findings.push(issue("No invoices extracted", SEV.CRITICAL)); return findings; }
    let taxErrors = 0;
    invoices.forEach((inv) => { if (inv.subtotal != null && inv.tax != null && inv.total != null && Math.abs(inv.subtotal + inv.tax - inv.total) > 0.05) taxErrors++; });
    if (taxErrors > 0) findings.push(issue(`${taxErrors} invoice(s): subtotal + tax ≠ total`, SEV.MAJOR));
    const invoiceNums = invoices.map((i) => i.invoiceNumber).filter(Boolean);
    if (new Set(invoiceNums).size < invoiceNums.length) findings.push(issue(`${invoiceNums.length - new Set(invoiceNums).size} duplicate invoice number(s)`, SEV.MAJOR));
    const futureDated = invoices.filter((inv) => inv.invoiceDate && isFutureDate(inv.invoiceDate));
    if (futureDated.length > 0) findings.push(issue(`${futureDated.length} invoice(s) are future-dated`, SEV.MAJOR));
    const invalidDates = invoices.filter((inv) => inv.invoiceDate && !isValidDate(inv.invoiceDate));
    if (invalidDates.length > 0) findings.push(issue(`${invalidDates.length} invoice(s) have invalid dates`, SEV.MAJOR));
    const amounts = invoices.map((i) => i.total).filter((a) => a > 0).sort((a, b) => a - b);
    if (amounts.length > 3) { const median = amounts[Math.floor(amounts.length/2)]; const outliers = amounts.filter((a) => a > median*50 || a < median/50); if (outliers.length > 0) findings.push(warning(`${outliers.length} invoice amount(s) extreme outliers vs median $${median.toFixed(2)}`, SEV.MINOR)); }
    if (invoices.filter((i) => i.total == null).length > 0) findings.push(issue(`${invoices.filter((i) => i.total==null).length} invoice(s) missing total`, SEV.MAJOR));
    if (invoices.filter((i) => !i.vendorName?.trim()).length > 0) findings.push(warning(`${invoices.filter((i) => !i.vendorName?.trim()).length} invoice(s) missing vendor name`, SEV.MINOR));
    const failRate = ((summary.errorCount||0)/(summary.totalFiles||1))*100;
    if (failRate > 20) findings.push(issue(`${failRate.toFixed(0)}% of invoices failed extraction`, SEV.MAJOR));
    else if (failRate > 5) findings.push(warning(`${failRate.toFixed(0)}% of invoices failed extraction`, SEV.MINOR));
  }

  if (toolName === "transaction-analysis") {
    const accounts = toolOutput.accounts||[], flaggedTransfers = toolOutput.flaggedTransfers||[], fileCount = toolOutput.fileCount||0;
    if (fileCount === 0) { findings.push(issue("No files processed", SEV.CRITICAL)); return findings; }
    accounts.forEach((acc) => {
      if (!acc.monthlyData?.length) return;
      const counts = acc.monthlyData.map((m) => m.count).filter((c) => c > 0);
      if (counts.length > 2) { const avg = counts.reduce((s,c)=>s+c,0)/counts.length; acc.monthlyData.filter((m)=>m.count>avg*5).forEach((s)=>findings.push(warning(`"${acc.name}": ${s.month} has ${s.count} tx vs avg ${avg.toFixed(0)} — spike`, SEV.MINOR))); }
      const nonZeroIdx = acc.monthlyData.map((m,i)=>(m.count>0?i:-1)).filter((i)=>i!==-1);
      if (nonZeroIdx.length >= 2) {
        const first = nonZeroIdx[0], last = nonZeroIdx[nonZeroIdx.length-1];
        const mid = acc.monthlyData.slice(first, last+1);
        let gapRun=0, longest=0;
        mid.forEach((m)=>{ if(m.count===0){gapRun++;if(gapRun>longest)longest=gapRun;}else gapRun=0; });
        if (longest >= 6) findings.push(warning(`"${acc.name}": ${longest} zero-activity months mid-period`, SEV.MINOR));
        const gaps = mid.filter((m)=>m.count===0).map((m)=>m.month);
        if (gaps.length > 0 && gaps.length < 6) findings.push(warning(`"${acc.name}": no activity in ${gaps.slice(0,6).join(", ")} — missing statements?`, SEV.MINOR));
      }
    });
    if (flaggedTransfers.length > 0) findings.push(warning(`${flaggedTransfers.length} outgoing transfer(s) unmatched — likely external payments`, SEV.MINOR));
    const totalTx = accounts.reduce((s,a)=>s+(a.totalTransactions||0),0);
    if (fileCount > 0 && totalTx < fileCount*5) findings.push(warning(`Only ${totalTx} total transactions across ${fileCount} files — verify input`, SEV.MINOR));
  }

  if (toolName === "tracker") {
    const gaps=toolOutput.gaps||0, totalMonths=toolOutput.totalMonths||0, totalAccounts=(toolOutput.totalBankAccounts||0)+(toolOutput.totalCreditCards||0);
    const missingMonths=toolOutput.missingMonths||[], duplicateAccounts=toolOutput.duplicateAccounts||[];
    if (totalAccounts===0){findings.push(issue("No accounts found in tracker",SEV.CRITICAL));return findings;}
    if (totalMonths===0){findings.push(issue("Tracker has no months of data",SEV.CRITICAL));return findings;}
    const gapRate=(gaps/totalMonths)*100;
    if (gapRate>30) findings.push(issue(`High gap rate: ${gaps}/${totalMonths} months missing (${gapRate.toFixed(0)}%)`,SEV.MAJOR));
    else if (gaps>0) findings.push(warning(missingMonths.length>0?`Missing: ${missingMonths.slice(0,6).join(", ")}${missingMonths.length>6?` +${missingMonths.length-6} more`:""}`:`${gaps} gap(s) in tracker`,SEV.MINOR));
    if (duplicateAccounts.length>0) findings.push(warning(`Possible duplicate accounts: ${duplicateAccounts.join(", ")}`,SEV.MINOR));
    if (totalMonths<3) findings.push(warning(`Only ${totalMonths} months covered`,SEV.MINOR));
  }

  if (toolName === "categorisation") {
    const files=toolOutput.files||[];
    if (files.length===0){findings.push(issue("No files categorised",SEV.CRITICAL));return findings;}
    const normalized=files.map((f)=>({...f,confidenceFloat:typeof f.confidence==="string"?f.confidence==="HIGH"?0.9:f.confidence==="MEDIUM"?0.5:0.2:(f.confidence??0.5)}));
    const bankWrong=files.filter((f)=>f.file?.toLowerCase().includes("bank")&&f.folder&&!f.folder.toLowerCase().includes("bank"));
    if (bankWrong.length>0) findings.push(issue(`${bankWrong.length} file(s) with "bank" in name outside Bank Statements folder`,SEV.CRITICAL));
    (toolOutput.semanticMismatches||[]).forEach((m)=>findings.push(warning(`"${m.file}" → ${m.folder} but name suggests ${m.suggestedFolder}`,SEV.MINOR)));
    const lowPct=(normalized.filter((f)=>f.confidenceFloat<0.5).length/files.length)*100;
    if (lowPct>25) findings.push(issue(`${lowPct.toFixed(0)}% low confidence`,SEV.MAJOR)); else if (lowPct>10) findings.push(warning(`${lowPct.toFixed(0)}% low confidence`,SEV.MINOR));
    if (normalized.every((f)=>f.confidenceFloat>=0.9)&&files.length>20) findings.push(warning(`All ${files.length} files HIGH confidence — spot-check manually`,SEV.MINOR));
    const miscPct=(files.filter((f)=>f.folder?.toLowerCase().includes("miscellaneous")).length/files.length)*100;
    if (miscPct>15) findings.push(issue(`${miscPct.toFixed(0)}% in Miscellaneous`,SEV.MAJOR)); else if (miscPct>5) findings.push(warning(`${miscPct.toFixed(0)}% in Miscellaneous`,SEV.MINOR));
    const noFolder=files.filter((f)=>!f.folder?.trim()).length;
    if (noFolder>0) findings.push(issue(`${noFolder} file(s) have no folder assigned`,SEV.MAJOR));
  }

  if (toolName === "bates-stamp") {
    const files=toolOutput.files||[], stampedCount=toolOutput.stampedCount||0, totalFiles=toolOutput.totalFiles||files.length;
    const totalInputPages=toolOutput.totalInputPages||0, totalStampedPages=toolOutput.totalStampedPages||0;
    if (totalFiles>0&&stampedCount<totalFiles) findings.push(issue(`${totalFiles-stampedCount}/${totalFiles} files not stamped`,SEV.MAJOR));
    const batesNums=files.map((f)=>f.batesNumber||f.startBates).filter(Boolean);
    if (new Set(batesNums).size<batesNums.length) findings.push(issue("Duplicate Bates numbers — do not produce",SEV.CRITICAL));
    const nums=batesNums.map((b)=>parseInt(b.replace(/\D/g,""),10)).filter((n)=>!isNaN(n)).sort((a,b)=>a-b);
    const gapsFound=[];
    for (let i=1;i<nums.length;i++) if(nums[i]-nums[i-1]>1) gapsFound.push({from:nums[i-1],to:nums[i],size:nums[i]-nums[i-1]-1});
    if (gapsFound.length>0){const worst=gapsFound.sort((a,b)=>a.size-b.size)[0];findings.push(issue(`Bates gap(s): ${gapsFound.slice(0,3).map((g)=>`${g.from}→${g.to}`).join(", ")}${worst.size===1?" (gap of 1 — looks intentional)":""}`,worst.size===1?SEV.CRITICAL:SEV.MAJOR));}
    const prefixes=[...new Set(batesNums.map((b)=>b.replace(/\d+$/,"")))];
    if (prefixes.length>1) findings.push(issue(`Inconsistent Bates prefix: ${prefixes.join(", ")}`,SEV.MAJOR));
    if (totalInputPages>0&&totalStampedPages>0&&totalStampedPages!==totalInputPages) findings.push(issue(`Page count mismatch: ${totalStampedPages} stamped vs ${totalInputPages} input`,SEV.MAJOR));
    const zeroPage=files.filter((f)=>(f.pages||f.pageCount||0)===0).length;
    if (zeroPage>0) findings.push(warning(`${zeroPage} stamped file(s) have 0 pages`,SEV.MINOR));
  }

  if (toolName === "splitter") {
    const splits=toolOutput.splits||[], totalPages=toolOutput.totalPages||0;
    if (splits.length===0){findings.push(issue("No splits produced",SEV.CRITICAL));return findings;}
    const splitTotal=splits.reduce((s,sp)=>s+(sp.pageCount||sp.pages||0),0);
    if (totalPages>0&&Math.abs(splitTotal-totalPages)>2) findings.push(issue(`Page mismatch: ${splitTotal} of ${totalPages} pages accounted for`,SEV.MAJOR));
    const unnamed=splits.filter((s)=>!s.name?.trim()).length;
    if (unnamed>0) findings.push(warning(`${unnamed} split(s) have no name`,SEV.MINOR));
    const generic=splits.filter((s)=>/^(document|part|file|split)[_\s\d]+$/i.test(s.name?.trim()||"")).length;
    if (generic>splits.length*0.5) findings.push(warning(`${generic} splits have generic names`,SEV.MINOR));
    if (splits.length>1&&splitTotal>0){const maxPages=Math.max(...splits.map((s)=>s.pageCount||s.pages||0));if((maxPages/splitTotal)*100>75){const big=splits.find((s)=>(s.pageCount||s.pages||0)===maxPages);findings.push(warning(`"${big?.name}" has ${((maxPages/splitTotal)*100).toFixed(0)}% of pages — unbalanced`,SEV.MINOR));}}
    if (splits.filter((s)=>(s.pageCount||s.pages||0)===0).length>0) findings.push(issue(`${splits.filter((s)=>(s.pageCount||s.pages||0)===0).length} split(s) have 0 pages`,SEV.MAJOR));
  }

  if (toolName === "desc-categoriser") {
    const descriptions=toolOutput.descriptions||[], total=descriptions.length;
    if (total===0){findings.push(issue("No descriptions found",SEV.CRITICAL));return findings;}
    const uncategorised=descriptions.filter((d)=>!d.category?.trim()||["uncategorised","uncategorized","other","unknown"].includes(d.category.toLowerCase())).length;
    if ((uncategorised/total)*100>15) findings.push(warning(`${((uncategorised/total)*100).toFixed(0)}% uncategorised`,SEV.MINOR));
    const freqMap={};
    descriptions.forEach((d)=>{const key=d.description?.toLowerCase().trim();if(!key)return;if(!freqMap[key])freqMap[key]={cats:new Set(),count:0};freqMap[key].cats.add(d.category);freqMap[key].count++;});
    const inconsistent=Object.entries(freqMap).filter(([,v])=>v.count>3&&v.cats.size>1);
    if (inconsistent.length>0) findings.push(warning(`${inconsistent.length} description(s) with inconsistent categories`,SEV.MINOR));
    (toolOutput.semanticMismatches||[]).forEach((m)=>findings.push(warning(`"${m.description}" → "${m.assigned}" but likely "${m.expected}"`,SEV.MINOR)));
    const lowConf=descriptions.filter((d)=>d.confidence!=null&&d.confidence<0.4).length;
    if (lowConf>0) findings.push(warning(`${lowConf} description(s) very low confidence`,SEV.MINOR));
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────
// FACTS SUMMARY
// ─────────────────────────────────────────────────────────────
function buildFactsSummary(toolName, toolOutput) {
  try {
    if (toolName === "extraction-bank") {
      const stmts = toolOutput.statements || [];
      const lines = [`Total statements: ${stmts.length}`, `Total transactions: ${toolOutput.transactions?.length||0}`];
      stmts.forEach((s) => lines.push(`  ${s.file}: ${s.transactionCount} tx | Opening $${s.openingBalance?.toFixed(2)??"?"} → Closing $${s.closingBalance?.toFixed(2)??"?"} | Debits $${s.totalDebits?.toFixed(2)??"?"} Credits $${s.totalCredits?.toFixed(2)??"?"}`));
      if (toolOutput.dateGaps?.length>0) lines.push(`Date gaps: ${toolOutput.dateGaps.map((g)=>`${g.file} ${g.from}→${g.to} (${g.dayGap}d)`).join(", ")}`);
      return lines.join("\n");
    }
    if (toolName === "extraction-invoice") {
      const invs=toolOutput.invoices||[], amounts=invs.map((i)=>i.total).filter((a)=>a>0).sort((a,b)=>a-b), median=amounts.length?amounts[Math.floor(amounts.length/2)]:0;
      return [`Total invoices: ${invs.length}`,`Success: ${toolOutput.summary?.successCount||0} | Failed: ${toolOutput.summary?.errorCount||0}`,`Amount range: $${amounts[0]?.toFixed(2)||0} – $${amounts[amounts.length-1]?.toFixed(2)||0} | Median: $${median.toFixed(2)}`,`Vendors: ${[...new Set(invs.map((i)=>i.vendorName).filter(Boolean))].slice(0,6).join(", ")}`].join("\n");
    }
    if (toolName === "transaction-analysis") {
      const accs=toolOutput.accounts||[];
      return [`Files: ${toolOutput.fileCount||0} | Accounts: ${accs.length}`,...accs.map((a)=>`  ${a.name}: ${a.totalTransactions||0} tx, ${a.monthlyData?.filter((m)=>m.count>0).length||0} active months`),`Flagged transfers: ${toolOutput.flaggedTransfers?.length||0}`].join("\n");
    }
    if (toolName === "tracker") return [`Bank accounts: ${toolOutput.totalBankAccounts||0} | Credit cards: ${toolOutput.totalCreditCards||0}`,`Months: ${toolOutput.totalMonths||0} | Gaps: ${toolOutput.gaps||0}`,toolOutput.missingMonths?.length?`Missing: ${toolOutput.missingMonths.slice(0,8).join(", ")}`:"No missing months"].filter(Boolean).join("\n");
    if (toolName === "categorisation") { const files=toolOutput.files||[], folders={}; files.forEach((f)=>{folders[f.folder]=(folders[f.folder]||0)+1;}); return [`Total: ${files.length} files`,`Distribution: ${Object.entries(folders).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([f,c])=>`${f.split("_").slice(1).join(" ")} (${c})`).join(", ")}`].join("\n"); }
    if (toolName === "bates-stamp") { const files=toolOutput.files||[], nums=files.map((f)=>f.batesNumber||f.startBates).filter(Boolean); return [`Stamped: ${toolOutput.stampedCount||0} / ${toolOutput.totalFiles||0} files`,`Range: ${nums[0]||"?"} → ${nums[nums.length-1]||"?"}`,`Pages: ${toolOutput.totalStampedPages||"?"} stamped vs ${toolOutput.totalInputPages||"?"} input`].join("\n"); }
    if (toolName === "splitter") { const splits=toolOutput.splits||[]; return [`Splits: ${splits.length} | Total pages: ${toolOutput.totalPages||0}`,...splits.map((s)=>`  "${s.name}": ${s.pageCount||s.pages||0} pages`)].join("\n"); }
    if (toolName === "desc-categoriser") { const descs=toolOutput.descriptions||[], cats={}; descs.forEach((d)=>{cats[d.category]=(cats[d.category]||0)+1;}); return [`Total: ${descs.length} descriptions`,`Categories: ${Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([c,n])=>`${c} (${n})`).join(", ")}`].join("\n"); }
    return JSON.stringify(toolOutput).slice(0, 2000);
  } catch { return JSON.stringify(toolOutput).slice(0, 2000); }
}

// ─────────────────────────────────────────────────────────────
// AI ANALYSIS
// ─────────────────────────────────────────────────────────────
async function runAIAnalysis(toolName, toolOutput, ruleFindings) {
  const domainKnowledge = DOMAIN_PROMPTS[toolName] || "";
  const factsSummary    = buildFactsSummary(toolName, toolOutput);
  const ruleIssues      = ruleFindings.filter((f) => f.type === "issue").map((f) => `[${f.sev.label}] ${f.msg}`);
  const ruleWarnings    = ruleFindings.filter((f) => f.type === "warning").map((f) => f.msg);

  const systemPrompt = `${domainKnowledge}

YOUR TASK: Find what rule checks missed using domain expertise.

IMPORTANT — DO NOT FLAG THESE:
- Large credits/deposits on a business account are NOT OCR errors.
- Accounts starting late are NOT dormant.
- External payments have no counterparts in dataset — expected.
- A statement with very few transactions (1-5) is NOT automatically suspicious. Some accounts (LLC holding, escrow, special-purpose) genuinely have minimal activity. ONLY flag if balance math also fails.
- If opening + credits - debits = closing balance exactly, extraction is COMPLETE regardless of transaction count.
- Zero deposits in a month is normal for disbursement/holding accounts.
- A $500 balance mismatch where the PDF has a physically redacted transaction amount is a SOURCE DOCUMENT issue, not an extraction error. Note it as such.

SCORING: 90-100 clean, 75-89 minor issues, 55-74 real problems, 30-54 re-run needed, 0-29 unreliable.
Be SPECIFIC. If data looks clean, score it high. Summary for attorney or senior analyst.

Return ONLY valid JSON, no markdown:
{"aiScore":<0-100>,"aiIssues":["..."],"aiWarnings":["..."],"aiRecommendations":["..."],"aiSummary":"..."}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5", max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: `TOOL: ${toolName}\nIssues (${ruleIssues.length}): ${ruleIssues.join(" | ")||"none"}\nWarnings (${ruleWarnings.length}): ${ruleWarnings.join(" | ")||"none"}\nDATA:\n${factsSummary}\nWhat did the rules miss?` }],
  });

  const raw = response.content[0].text.trim().replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

// ─────────────────────────────────────────────────────────────
// BANK QC REPORT
// ─────────────────────────────────────────────────────────────
async function runBankQcReport(toolOutput) {
  const statements           = toolOutput.statements           || [];
  const transactions         = toolOutput.transactions         || [];
  const reconciliation       = toolOutput.reconciliation       || [];
  const runningBalanceErrors = toolOutput.runningBalanceErrors || [];
  const dateGaps             = toolOutput.dateGaps             || [];
  const amountOutliers       = toolOutput.amountOutliers       || [];

  const seen = new Map(); let dupeCount = 0;
  transactions.forEach((t) => { const key=`${t.date}-${t.debit}-${t.credit}-${t.description?.trim()}`; if(seen.has(key))dupeCount++;else seen.set(key,true); });

  const totalCreditsSum = +statements.reduce((s, st) => s + (st.totalCredits || 0), 0).toFixed(2);
  const totalDebitsSum  = +statements.reduce((s, st) => s + (st.totalDebits  || 0), 0).toFixed(2);

  // Deterministic signals — two paths for likelyMissingTx
  const computedSignals = statements.map((s) => {
    const rec = reconciliation.find((r) => r.file === s.file) || {};
    const balanceMismatch = s.openingBalance != null && s.closingBalance != null && s.totalDebits != null && s.totalCredits != null
      ? Math.abs(s.openingBalance + s.totalCredits - s.totalDebits - s.closingBalance) > 1 : null;
    const reconcAvailable = rec.pdfDebits != null || rec.pdfCredits != null;
    const debitMismatch   = rec.pdfDebits  != null ? Math.abs(rec.pdfDebits  - (rec.rowDebits  || 0)) > 1 : null;
    const creditMismatch  = rec.pdfCredits != null ? Math.abs(rec.pdfCredits - (rec.rowCredits || 0)) > 1 : null;
    const debitDiff       = rec.pdfDebits  != null ? +Math.abs(rec.pdfDebits  - (rec.rowDebits  || 0)).toFixed(2) : null;
    const creditDiff      = rec.pdfCredits != null ? +Math.abs(rec.pdfCredits - (rec.rowCredits || 0)).toFixed(2) : null;
    // Path A: PDF data available — use diff > $100
    // Path B: PDF data unavailable — fall back to balance math
    const likelyMissingTx = reconcAvailable
      ? (debitMismatch || creditMismatch) && Math.max(debitDiff ?? 0, creditDiff ?? 0) > 100
      : balanceMismatch === true;
    return { file: s.file, balanceMismatch, debitMismatch, creditMismatch, debitDiff, creditDiff, likelyMissingTx, reconcAvailable };
  });

  const context = {
    statements: statements.map((s) => ({ file: s.file, opening: s.openingBalance, closing: s.closingBalance, extractedDebits: s.totalDebits, extractedCredits: s.totalCredits, txCount: s.transactionCount })),
    reconciliation: reconciliation.map((r) => ({ file: r.file, pdfDebits: r.pdfDebits, pdfCredits: r.pdfCredits, rowDebits: r.rowDebits, rowCredits: r.rowCredits, debitsMatch: r.debitsMatch, creditsMatch: r.creditsMatch, debitLabel: r.debitLabel, creditLabel: r.creditLabel, error: r.error || null })),
    runningBalanceErrors: runningBalanceErrors.slice(0, 15),
    dateGaps, amountOutliers: amountOutliers.slice(0, 8),
    duplicateCount: dupeCount, totalTransactions: transactions.length,
    totalCreditsSum, totalDebitsSum, computedSignals,
  };

  const prompt = `You are a forensic accountant reviewing bank statement extraction quality for a legal case.

EXTRACTION DATA:
${JSON.stringify(context)}

MANDATORY — use computedSignals directly, do NOT override:
- likelyMissingTx: true  → "Missing Transactions" = fail
- likelyMissingTx: false → "Missing Transactions" = pass
- debitMismatch: true    → "Total Debits" = fail, show debitDiff
- creditMismatch: true   → "Total Credits" = fail, show creditDiff
- balanceMismatch: true  → "Closing Balance Integrity" = fail
- reconcAvailable: false → note "PDF summary unavailable" in Credits/Debits rows

Return ONLY this JSON, no markdown:
{
  "validationTable": [
    {"check": "Total Credits (PDF vs Extracted)",        "status": "pass|warn|fail", "details": "..."},
    {"check": "Total Debits (PDF vs Extracted)",         "status": "pass|warn|fail", "details": "..."},
    {"check": "Net Change (Opening + Credits - Debits)", "status": "pass|warn|fail", "details": "Opening $X + Credits $Y - Debits $Z = Expected $A, Closing $B — match/mismatch"},
    {"check": "Closing Balance Integrity",               "status": "pass|warn|fail", "details": "..."},
    {"check": "Running Balance Integrity",               "status": "pass|warn|fail", "details": "X errors / No errors"},
    {"check": "Missing Transactions",                    "status": "pass|warn|fail", "details": "..."},
    {"check": "Duplicate Transactions",                  "status": "pass|warn|fail", "details": "X found / None"},
    {"check": "Date Coverage",                           "status": "pass|warn|fail", "details": "Full/Limited — detail"}
  ],
  "transactionIssues": [],
  "patternInsights": ["..."],
  "riskLevel": "low|medium|high",
  "riskExplanation": "...",
  "recommendations": ["..."]
}

Rules:
- Exactly 8 rows in the order above
- Row 3 is Net Change — bank accounts are NOT double-entry books
- Credits that match PDF deposit totals are NOT OCR errors
- transactionIssues: from runningBalanceErrors only, max 15, empty [] if none
- patternInsights: 4–6 bullets citing actual amounts
- riskLevel: low = all pass, medium = 1-2 minor, high = balance mismatch or missing transactions
- recommendations: 3–5 specific steps based on actual issues`;

  let response;
  try {
    response = await client.messages.create({ model: "claude-sonnet-4-5", max_tokens: 2000, messages: [{ role: "user", content: prompt }] });
  } catch (apiErr) { throw new Error(`Bank QC Claude API call failed: ${apiErr.message}`); }

  const raw = response.content[0]?.text?.trim().replace(/```json|```/g, "").trim();
  if (!raw) throw new Error("Bank QC: empty response");

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error(`Bank QC: invalid JSON — ${e.message}`); }

  return validateBankQcReport(parsed);
}

function validateBankQcReport(report) {
  if (!report || typeof report !== "object") return null;
  const hasTable    = Array.isArray(report.validationTable)   && report.validationTable.length  > 0;
  const hasIssues   = Array.isArray(report.transactionIssues);
  const hasInsights = Array.isArray(report.patternInsights)   && report.patternInsights.length  > 0;
  const hasRisk     = ["low", "medium", "high"].includes(report.riskLevel);
  const hasRecs     = Array.isArray(report.recommendations)   && report.recommendations.length  > 0;
  if (!hasTable || !hasIssues || !hasInsights || !hasRisk || !hasRecs) {
    console.error("Bank QC schema validation failed:", { hasTable, hasIssues, hasInsights, hasRisk, hasRecs });
    return null;
  }
  const validStatuses = new Set(["pass", "warn", "fail"]);
  report.validationTable = report.validationTable.map((row) => ({ check: String(row.check??"—"), status: validStatuses.has(row.status)?row.status:"warn", details: String(row.details??"—") }));
  report.transactionIssues = report.transactionIssues.map((row) => ({ row: row.row??null, date: row.date??"—", issueType: String(row.issueType??"Unknown"), expected: String(row.expected??"—"), extracted: String(row.extracted??"—") }));
  return report;
}

function calculateScore(toolName, ruleFindings, aiScore) {
  const cfg = TOOL_CONFIG[toolName] || { ruleWeight: 0.60, aiWeight: 0.40, cap: 40, passAt: 88 };
  const cappedDeduct = Math.min(ruleFindings.reduce((sum, f) => sum + f.sev.deduct, 0), cfg.cap);
  return Math.max(0, Math.min(100, Math.round((100 - cappedDeduct) * cfg.ruleWeight + aiScore * cfg.aiWeight)));
}

function getStatus(toolName, score) {
  const cfg = TOOL_CONFIG[toolName] || { passAt: 88 };
  return score >= cfg.passAt ? "PASS" : score >= 65 ? "WARNING" : "FAIL";
}

function buildScoreBreakdown(ruleFindings) {
  return [...ruleFindings].sort((a, b) => b.sev.deduct - a.sev.deduct).slice(0, 3).map((f) => ({ label: f.msg, impact: f.sev.deduct, severity: f.sev.label, type: f.type }));
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

    // Merge metadata — but NEVER let null metadata overwrite reconciliation
    // that was embedded in qcData by the extraction route
    const enriched = { ...toolOutput, ...(metadata || {}) };
    if (!enriched.reconciliation?.length && toolOutput.reconciliation?.length) {
      enriched.reconciliation = toolOutput.reconciliation;
    }

    const ruleFindings = runRuleChecks(toolName, enriched);
    const ruleIssues   = ruleFindings.filter((f) => f.type === "issue").map((f) => f.msg);
    const ruleWarnings = ruleFindings.filter((f) => f.type === "warning").map((f) => f.msg);

    const aiDefault = { aiScore: 70, aiIssues: [], aiWarnings: [], aiRecommendations: ["Re-run QC once AI analysis is available."], aiSummary: "AI analysis unavailable. Rule-based checks applied only." };

    const [aiResult, bankQcReport] = await Promise.all([
      runAIAnalysis(toolName, toolOutput, ruleFindings).catch((err) => { console.error("QC AI failed:", err.message); return aiDefault; }),
      toolName === "extraction-bank"
        ? runBankQcReport(enriched).catch((err) => { console.error("Bank QC report failed:", err.message); return null; })
        : Promise.resolve(null),
    ]);

    const finalScore = calculateScore(toolName, ruleFindings, aiResult.aiScore);
    const status     = getStatus(toolName, finalScore);

    return NextResponse.json({
      status,
      score:           finalScore,
      issues:          [...ruleIssues,   ...(aiResult.aiIssues   || [])],
      warnings:        [...ruleWarnings, ...(aiResult.aiWarnings  || [])],
      recommendations: aiResult.aiRecommendations || [],
      summary:         aiResult.aiSummary,
      scoreBreakdown:  buildScoreBreakdown(ruleFindings),
      bankQcReport,
      meta: { toolName, ruleIssueCount: ruleIssues.length, ruleWarningCount: ruleWarnings.length, aiScore: aiResult.aiScore, timestamp: new Date().toISOString() },
    });

  } catch (err) {
    console.error("QC critical error:", err.message);
    return NextResponse.json({ status: "WARNING", score: 50, issues: [], warnings: ["QC encountered an unexpected error."], recommendations: ["Check server logs."], summary: "QC could not complete.", scoreBreakdown: [], bankQcReport: null });
  }
}
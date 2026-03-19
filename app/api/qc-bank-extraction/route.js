// /app/api/qc-bank-extraction/route.js
// Step 9 — QC Bank Extraction
// Validates Excel extraction against source PDFs.
// PDFs = Ground Truth. Excel = Data to validate.
// Rule-based validation. Claude used only to read PDF summaries.

export const maxDuration = 300;
export const dynamic    = 'force-dynamic';

import Anthropic from '@anthropic-ai/sdk';
import ExcelJS   from 'exceljs';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── PDF SUMMARY READER ────────────────────────────────────────
async function readPDFSummary(base64PDF, fileName) {
  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64PDF } },
          {
            type: 'text',
            text: `Read this bank statement PDF and extract summary data.
Find: Balance Summary, Checking Summary, or Account Summary section.

Return ONLY this JSON, nothing else:
{
  "bankName": "",
  "accountHolder": "",
  "accountNumber": "",
  "statementPeriod": "",
  "openingBalance": 0,
  "closingBalance": 0,
  "totalCredits": 0,
  "totalDebits": 0,
  "transactionCount": 0,
  "debitCategories": [{"label": "", "amount": 0}],
  "creditCategories": [{"label": "", "amount": 0}]
}

Rules:
- openingBalance: Beginning Balance
- closingBalance: Ending Balance
- totalDebits: sum of ALL debit/withdrawal categories INCLUDING service charges and fees
- totalCredits: sum of ALL credit/deposit categories
- transactionCount: total number of transactions shown in summary (Instances/Count column)
- debitCategories: each line item from debits section with label and amount (positive numbers)
- creditCategories: each line item from credits section
- Return ONLY valid JSON, no markdown`
          }
        ]
      }]
    });

    const raw  = response.content[0].text.trim().replace(/```json|```/g, '').trim();
    const data = JSON.parse(raw);
    return { ...data, fileName, error: null };
  } catch (err) {
    return {
      fileName, error: err.message,
      bankName: '', accountHolder: '', accountNumber: '',
      statementPeriod: '', openingBalance: null, closingBalance: null,
      totalCredits: null, totalDebits: null, transactionCount: null,
      debitCategories: [], creditCategories: [],
    };
  }
}

// ── EXCEL READER ──────────────────────────────────────────────
async function readExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // Find the transactions sheet — prefer "All Transactions", fallback to first sheet
  let ws = wb.getWorksheet('All Transactions') || wb.worksheets[0];
  if (!ws) return { transactions: [], columns: {}, error: 'No worksheet found' };

  // Read headers from row 1
  const headers = {};
  ws.getRow(1).eachCell((cell, col) => {
    const val = String(cell.value || '').trim().toLowerCase();
    headers[col] = val;
  });

  // Map column names to indices — support both our format and generic formats
  const colMap = {};
  Object.entries(headers).forEach(([col, name]) => {
    const n = name.toLowerCase();
    if (n.includes('file name') || n === 'file')                                  colMap.fileName    = +col;
    if (n === 'date' || n.includes('trans') && n.includes('date'))                colMap.date        = +col;
    if (n === 'description' || n.includes('narrat') || n.includes('particular'))  colMap.description = +col;
    if (n.includes('debit') && !n.includes('credit'))                             colMap.debit       = +col;
    if (n.includes('credit') && !n.includes('debit'))                             colMap.credit      = +col;
    if (n === 'amount' || n.includes('amount'))                                   colMap.amount      = +col;
    if (n.includes('balance') && !n.includes('open') && !n.includes('clos'))      colMap.balance     = +col;
    if (n.includes('check') && n.includes('no'))                                  colMap.checkNo     = +col;
    if (n.includes('opening') || n.includes('open bal'))                          colMap.openBal     = +col;
    if (n.includes('closing') || n.includes('close bal'))                         colMap.closeBal    = +col;
    if (n.includes('bank'))                                                        colMap.bank        = +col;
    if (n.includes('account') && n.includes('holder'))                            colMap.holder      = +col;
    if (n.includes('account') && n.includes('number'))                            colMap.accountNo   = +col;
    if (n.includes('period') || n.includes('statement'))                          colMap.period      = +col;
    if (n === 'month')                                                             colMap.month       = +col;
  });

  const transactions = [];
  const maxRow = ws.rowCount;

  for (let r = 2; r <= maxRow; r++) {
    const row = ws.getRow(r);
    const get = (col) => col ? (row.getCell(col).value ?? '') : '';
    const getNum = (col) => col ? (parseFloat(row.getCell(col).value) || 0) : 0;

    // Skip completely empty rows
    const allEmpty = !get(colMap.date) && !get(colMap.description) &&
                     !getNum(colMap.debit) && !getNum(colMap.credit) && !getNum(colMap.amount);
    if (allEmpty) continue;

    let debit  = getNum(colMap.debit);
    let credit = getNum(colMap.credit);

    // Generic: single Amount column — positive = credit, negative = debit
    if (!colMap.debit && !colMap.credit && colMap.amount) {
      const amt = parseFloat(get(colMap.amount)) || 0;
      if (amt < 0) debit = Math.abs(amt);
      else          credit = amt;
    }

    transactions.push({
      fileName:    String(get(colMap.fileName) || '').trim(),
      date:        String(get(colMap.date)        || '').trim(),
      description: String(get(colMap.description) || '').trim(),
      checkNo:     String(get(colMap.checkNo)     || '').trim(),
      debit,
      credit,
      balance:     getNum(colMap.balance),
      openBal:     getNum(colMap.openBal),
      closeBal:    getNum(colMap.closeBal),
      bank:        String(get(colMap.bank)     || '').trim(),
      holder:      String(get(colMap.holder)   || '').trim(),
      accountNo:   String(get(colMap.accountNo)|| '').trim(),
      period:      String(get(colMap.period)   || '').trim(),
      rowNum:      r,
    });
  }

  return { transactions, colMap, sheetName: ws.name, error: null };
}

// ── VALIDATION ENGINE ─────────────────────────────────────────
function runValidations(pdfSummaries, excelData) {
  const results = [];

  pdfSummaries.forEach((pdf) => {
    if (pdf.error) {
      results.push({ file: pdf.fileName, error: pdf.error, checks: [] });
      return;
    }

    // Get Excel transactions for this PDF
    // Match by: (1) fileName column exact, (2) fileName column contains PDF name, (3) all rows if only 1 PDF
    const pdfBaseName = pdf.fileName.replace(/\.pdf$/i, '').toLowerCase();
    let txs = excelData.transactions.filter(t => {
      if (!t.fileName) return false;
      const fn = t.fileName.toLowerCase();
      return fn === pdf.fileName.toLowerCase() ||
             fn.includes(pdfBaseName) ||
             pdfBaseName.includes(fn.replace(/\.xlsx?$/i, ''));
    });

    // Fallback: if no fileName column or no match, use all transactions (single file scenario)
    if (txs.length === 0 && pdfSummaries.length === 1) {
      txs = excelData.transactions;
    }

    const excelDebits  = +txs.reduce((s, t) => s + (t.debit  || 0), 0).toFixed(2);
    const excelCredits = +txs.reduce((s, t) => s + (t.credit || 0), 0).toFixed(2);
    const txCount      = txs.length;

    // Opening/closing from first/last row with data
    const txsWithBal  = txs.filter(t => t.balance > 0);
    const firstBal    = txsWithBal[0]?.balance || 0;
    const lastBal     = txsWithBal[txsWithBal.length - 1]?.balance || 0;

    // Also try openBal/closeBal columns if present
    const openBalRow  = txs.find(t => t.openBal > 0);
    const closeBalRow = txs[txs.length - 1];

    const checks = [];

    // 1. Total Credits
    const creditDiff = pdf.totalCredits != null ? +Math.abs(pdf.totalCredits - excelCredits).toFixed(2) : null;
    checks.push({
      type:     'Total Credits (PDF vs Excel)',
      status:   creditDiff === null ? 'warn' :
                creditDiff < 1     ? 'pass'  : 'fail',
      pdfVal:   pdf.totalCredits != null ? `$${pdf.totalCredits.toFixed(2)}` : 'N/A',
      excelVal: `$${excelCredits.toFixed(2)}`,
      diff:     creditDiff != null ? `$${creditDiff.toFixed(2)}` : null,
      detail:   creditDiff === null ? 'PDF summary unavailable' :
                creditDiff < 1     ? `Match ✓` :
                `Off by $${creditDiff.toFixed(2)}`,
    });

    // 2. Total Debits
    const debitDiff = pdf.totalDebits != null ? +Math.abs(pdf.totalDebits - excelDebits).toFixed(2) : null;
    checks.push({
      type:     'Total Debits (PDF vs Excel)',
      status:   debitDiff === null ? 'warn' :
                debitDiff < 1     ? 'pass'  : 'fail',
      pdfVal:   pdf.totalDebits != null ? `$${pdf.totalDebits.toFixed(2)}` : 'N/A',
      excelVal: `$${excelDebits.toFixed(2)}`,
      diff:     debitDiff != null ? `$${debitDiff.toFixed(2)}` : null,
      detail:   debitDiff === null ? 'PDF summary unavailable' :
                debitDiff < 1     ? 'Match ✓' :
                `Off by $${debitDiff.toFixed(2)}`,
    });

    // 3. Opening Balance
    const excelOpen  = openBalRow?.openBal || firstBal || 0;
    const openDiff   = pdf.openingBalance != null && excelOpen > 0
      ? +Math.abs(pdf.openingBalance - excelOpen).toFixed(2) : null;
    checks.push({
      type:     'Opening Balance Match',
      status:   openDiff === null ? 'warn' : openDiff < 1 ? 'pass' : 'fail',
      pdfVal:   pdf.openingBalance != null ? `$${pdf.openingBalance.toFixed(2)}` : 'N/A',
      excelVal: excelOpen > 0 ? `$${excelOpen.toFixed(2)}` : 'Not found',
      diff:     openDiff != null ? `$${openDiff.toFixed(2)}` : null,
      detail:   openDiff === null ? 'Cannot verify — balance column not found' :
                openDiff < 1     ? 'Match ✓' : `Mismatch $${openDiff.toFixed(2)}`,
    });

    // 4. Closing Balance — math check
    const mathClose = pdf.openingBalance != null
      ? +(pdf.openingBalance + excelCredits - excelDebits).toFixed(2) : null;
    const closeDiff = pdf.closingBalance != null && mathClose != null
      ? +Math.abs(pdf.closingBalance - mathClose).toFixed(2) : null;
    checks.push({
      type:     'Closing Balance Match',
      status:   closeDiff === null ? 'warn' : closeDiff < 1 ? 'pass' : 'fail',
      pdfVal:   pdf.closingBalance != null ? `$${pdf.closingBalance.toFixed(2)}` : 'N/A',
      excelVal: mathClose != null ? `$${mathClose.toFixed(2)}` : 'N/A',
      diff:     closeDiff != null ? `$${closeDiff.toFixed(2)}` : null,
      detail:   closeDiff === null ? 'Cannot compute — balances missing' :
                closeDiff < 1     ? `Match ✓ (Opening $${pdf.openingBalance.toFixed(2)} + Credits - Debits = $${mathClose.toFixed(2)})` :
                `Mismatch — expected $${pdf.closingBalance.toFixed(2)}, computed $${mathClose.toFixed(2)}`,
    });

    // 5. Running Balance Integrity
    const runErrors = [];
    if (txsWithBal.length > 1) {
      let running = pdf.openingBalance || txsWithBal[0].balance + txsWithBal[0].debit - txsWithBal[0].credit;
      txsWithBal.slice(0, 50).forEach((t, i) => {
        running = +(running + t.credit - t.debit).toFixed(2);
        if (Math.abs(running - t.balance) > 1) {
          runErrors.push({ row: t.rowNum, date: t.date, expected: running.toFixed(2), found: t.balance.toFixed(2) });
          running = t.balance; // resync
        }
      });
    }
    checks.push({
      type:     'Running Balance Integrity',
      status:   txsWithBal.length === 0 ? 'warn' : runErrors.length === 0 ? 'pass' : 'fail',
      pdfVal:   '—',
      excelVal: txsWithBal.length === 0 ? 'No balance column' : `${runErrors.length} error(s)`,
      diff:     null,
      detail:   txsWithBal.length === 0 ? 'Balance column not found in Excel' :
                runErrors.length === 0  ? 'No errors ✓' :
                `${runErrors.length} row(s) with balance mismatch`,
      errors:   runErrors.slice(0, 5),
    });

    // 6. Transaction Count Match
    const countDiff = pdf.transactionCount != null ? Math.abs(pdf.transactionCount - txCount) : null;
    checks.push({
      type:     'Transaction Count Match',
      status:   countDiff === null ? 'warn' : countDiff === 0 ? 'pass' : countDiff <= 2 ? 'warn' : 'fail',
      pdfVal:   pdf.transactionCount != null ? `${pdf.transactionCount}` : 'N/A',
      excelVal: `${txCount}`,
      diff:     countDiff != null ? `${countDiff}` : null,
      detail:   countDiff === null ? 'PDF count not found' :
                countDiff === 0   ? 'Match ✓' :
                `${countDiff} transaction(s) difference`,
    });

    // 7. Missing Transactions
    const missingLikely = (debitDiff != null && debitDiff > 1) || (creditDiff != null && creditDiff > 1);
    const missingPossible = countDiff != null && countDiff > 0;
    checks.push({
      type:     'Missing Transactions',
      status:   missingLikely ? 'fail' : missingPossible ? 'warn' : 'pass',
      pdfVal:   '—',
      excelVal: '—',
      diff:     null,
      detail:   missingLikely  ? `Likely — total mismatch detected (debits off $${debitDiff?.toFixed(2) || 0}, credits off $${creditDiff?.toFixed(2) || 0})` :
                missingPossible ? `Possible — count differs by ${countDiff}` :
                'None detected ✓',
    });

    // 8. Duplicates
    const seen = new Map(); const dupes = [];
    txs.forEach((t) => {
      const key = `${t.date}|${t.debit}|${t.credit}|${t.description?.trim()}`;
      if (seen.has(key)) dupes.push({ date: t.date, description: t.description, amount: t.debit || t.credit, rowNum: t.rowNum });
      else seen.set(key, t.rowNum);
    });
    checks.push({
      type:     'Duplicate Transactions',
      status:   dupes.length === 0 ? 'pass' : 'warn',
      pdfVal:   '—',
      excelVal: `${dupes.length} found`,
      diff:     null,
      detail:   dupes.length === 0 ? 'None detected ✓' : `${dupes.length} possible duplicate(s)`,
      dupes:    dupes.slice(0, 5),
    });

    // 9. Date Coverage
    const dates = txs.map(t => new Date(t.date)).filter(d => !isNaN(d.getTime())).sort((a, b) => a - b);
    const dateGaps = [];
    for (let i = 1; i < dates.length; i++) {
      const gap = Math.round((dates[i] - dates[i-1]) / 86400000);
      if (gap > 7) dateGaps.push({ from: dates[i-1].toDateString(), to: dates[i].toDateString(), days: gap });
    }
    checks.push({
      type:     'Date Coverage',
      status:   dateGaps.length === 0 ? 'pass' : dateGaps.some(g => g.days > 14) ? 'fail' : 'warn',
      pdfVal:   pdf.statementPeriod || '—',
      excelVal: dates.length > 0 ? `${dates[0].toDateString()} → ${dates[dates.length-1].toDateString()}` : 'N/A',
      diff:     null,
      detail:   dateGaps.length === 0 ? 'Full coverage ✓' : `${dateGaps.length} gap(s) — longest: ${Math.max(...dateGaps.map(g=>g.days))} days`,
      gaps:     dateGaps.slice(0, 3),
    });

    // Category-level breakdown
    const categoryChecks = [];
    if (pdf.debitCategories?.length > 0) {
      pdf.debitCategories.forEach((cat) => {
        const label = (cat.label || '').toLowerCase();
        let extracted = 0;
        if (label.includes('check')) {
          extracted = txs.filter(t => t.checkNo).reduce((s, t) => s + t.debit, 0);
        } else if (label.includes('atm') || label.includes('debit card')) {
          extracted = txs.filter(t => !t.checkNo && /card purchase|atm|non-chase atm|recurring card/i.test(t.description)).reduce((s, t) => s + t.debit, 0);
        } else if (label.includes('electronic') || label.includes('transfer')) {
          extracted = txs.filter(t => !t.checkNo && !/card purchase|atm|non-chase atm|fee|maintenance|owner withdrawal/i.test(t.description)).reduce((s, t) => s + t.debit, 0);
        } else if (label.includes('fee') || label.includes('charge') || label.includes('service')) {
          extracted = txs.filter(t => /fee|maintenance|service charge/i.test(t.description)).reduce((s, t) => s + t.debit, 0);
        } else if (label.includes('withdrawal') || label.includes('debit')) {
          extracted = txs.reduce((s, t) => s + t.debit, 0);
        }
        const diff = +Math.abs(cat.amount - extracted).toFixed(2);
        if (diff > 1) {
          categoryChecks.push({ label: cat.label, pdfAmount: cat.amount, extracted: +extracted.toFixed(2), diff });
        }
      });
    }

    // Transaction-level issues
    const txIssues = [
      ...runErrors.map(e => ({
        date: e.date, description: 'Running balance error',
        issue: 'Balance Mismatch', expected: `$${e.expected}`, extracted: `$${e.found}`,
      })),
      ...dupes.map(d => ({
        date: d.date, description: d.description?.slice(0, 50),
        issue: 'Possible Duplicate', expected: 'Unique', extracted: `$${d.amount?.toFixed(2)}`,
      })),
    ];

    // Pattern analysis
    const patterns = [];
    const amounts = txs.map(t => t.debit || t.credit).filter(a => a > 0).sort((a,b) => a - b);
    if (amounts.length > 3) {
      const median = amounts[Math.floor(amounts.length / 2)];
      const outliers = amounts.filter(a => a > median * 20);
      if (outliers.length > 0) patterns.push(`${outliers.length} large debit(s) > 20× median ($${median.toFixed(2)}) — verify OCR accuracy`);
    }
    if (txs.filter(t => !t.description?.trim()).length > 0) {
      patterns.push(`${txs.filter(t => !t.description?.trim()).length} transaction(s) missing description`);
    }
    if (dateGaps.some(g => g.days > 10)) patterns.push(`Gap >10 days detected — possible missing pages`);
    if (debitDiff > 0 && countDiff === 0) patterns.push('Amount mismatch with same row count → likely OCR error, not missing transaction');
    if (debitDiff > 0 && countDiff > 0) patterns.push('Both amount and count mismatch → likely missing transaction(s)');
    if (txs.filter(t => t.credit === 0 && t.debit === 0).length > 0) {
      patterns.push(`${txs.filter(t => t.credit === 0 && t.debit === 0).length} row(s) with zero amounts — check extraction`);
    }

    // Risk level
    const failCount = checks.filter(c => c.status === 'fail').length;
    const warnCount = checks.filter(c => c.status === 'warn').length;
    const riskLevel = failCount >= 2 ? 'high' : failCount === 1 ? 'medium' : warnCount > 2 ? 'medium' : 'low';

    // Insights
    const insights = [];
    if (closeDiff != null && closeDiff < 1) insights.push(`Balance math is perfect — opening $${pdf.openingBalance?.toFixed(2)} + credits - debits = closing $${pdf.closingBalance?.toFixed(2)}`);
    if (debitDiff != null && debitDiff > 1) insights.push(`Total debits off by $${debitDiff.toFixed(2)} — ${debitDiff > 0 && countDiff === 0 ? 'likely OCR error' : 'possible missing transaction(s)'}`);
    if (creditDiff != null && creditDiff > 1) insights.push(`Total credits off by $${creditDiff.toFixed(2)} — verify deposit extraction`);
    if (debitDiff < 1 && creditDiff < 1) insights.push('All PDF summary totals reconcile with Excel extraction ✓');
    if (dupes.length > 0) insights.push(`${dupes.length} possible duplicate transaction(s) require manual review`);
    if (runErrors.length > 0) insights.push(`${runErrors.length} running balance error(s) — may cascade from one root cause`);
    if (dateGaps.length > 0) insights.push(`${dateGaps.length} date gap(s) — verify PDF has no missing pages`);

    // Recommendations
    const recs = [];
    if (debitDiff > 1 || creditDiff > 1) recs.push('Re-run extraction focusing on amount columns — verify no decimal shifts or column misreads');
    if (runErrors.length > 0) recs.push(`Review rows ${runErrors.map(e => e.row).join(', ')} in Excel against PDF for balance errors`);
    if (dupes.length > 0) recs.push('Verify duplicate transactions in source PDF — confirm if real repeated transactions or extraction artifact');
    if (dateGaps.some(g => g.days > 7)) recs.push('Manually review PDF pages in gap periods to confirm no transactions were missed');
    if (categoryChecks.length > 0) recs.push(`Category mismatch in: ${categoryChecks.map(c => c.label).join(', ')} — verify category assignment`);
    if (recs.length === 0) recs.push('Spot-check 5–10 random transactions against source PDF to confirm OCR accuracy');
    recs.push('Cross-reference with adjacent month statements to verify opening/closing balance continuity');

    results.push({
      file:           pdf.fileName,
      bankName:       pdf.bankName,
      accountHolder:  pdf.accountHolder,
      accountNumber:  pdf.accountNumber,
      statementPeriod: pdf.statementPeriod,
      transactionRows: txCount,
      excelDebits, excelCredits,
      pdfDebits:      pdf.totalDebits,
      pdfCredits:     pdf.totalCredits,
      checks,
      categoryChecks,
      txIssues,
      patterns,
      riskLevel,
      insights,
      recommendations: recs,
    });
  });

  return results;
}

// ── MAIN HANDLER ──────────────────────────────────────────────
export async function POST(request) {
  try {
    const formData = request.formData ? await request.formData() : null;
    if (!formData) return Response.json({ error: 'FormData required' }, { status: 400 });

    const excelFiles = formData.getAll('excels').filter(f => f.size > 0);
    const pdfFiles   = formData.getAll('pdfs').filter(f => f.size > 0);

    if (excelFiles.length === 0) return Response.json({ error: 'No Excel file uploaded' },   { status: 400 });
    if (pdfFiles.length   === 0) return Response.json({ error: 'No PDF file(s) uploaded' },  { status: 400 });

    // Read all Excels — merge transactions
    let allTransactions = [];
    let colMap = {};
    let sheetName = '';
    for (const f of excelFiles) {
      const buffer = Buffer.from(await f.arrayBuffer());
      const result = await readExcel(buffer);
      if (result.error) return Response.json({ error: result.error }, { status: 400 });
      allTransactions = allTransactions.concat(result.transactions);
      colMap    = result.colMap;
      sheetName = result.sheetName;
    }

    // Read all PDFs in parallel
    const pdfSummaries = await Promise.all(
      pdfFiles.map(async (f) => {
        const base64 = Buffer.from(await f.arrayBuffer()).toString('base64');
        return readPDFSummary(base64, f.name);
      })
    );

    // Run validations
    const reportResults = runValidations(pdfSummaries, { transactions: allTransactions, colMap });

    // Overall summary
    const totalFails = reportResults.flatMap(r => r.checks).filter(c => c.status === 'fail').length;
    const totalWarns = reportResults.flatMap(r => r.checks).filter(c => c.status === 'warn').length;
    const overallRisk = totalFails >= 3 ? 'high' : totalFails >= 1 ? 'medium' : totalWarns > 3 ? 'medium' : 'low';

    return Response.json({
      success:      true,
      totalPDFs:    pdfFiles.length,
      totalExcels:  excelFiles.length,
      totalRows:    allTransactions.length,
      overallRisk,
      totalFails,
      totalWarns,
      results:      reportResults,
    });

  } catch (err) {
    console.error('QC Bank Extraction error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
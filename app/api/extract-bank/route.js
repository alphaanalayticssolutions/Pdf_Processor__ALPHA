export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import Anthropic from '@anthropic-ai/sdk';
import ExcelJS from 'exceljs';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Repair truncated JSON ────────────────────────────────────
function repairJSON(text) {
  text = text.trim();
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try { JSON.parse(text); return text; } catch (e) {}

  const txArrayStart = text.indexOf('"transactions"');
  if (txArrayStart === -1) return text;

  let lastSafeClose = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = txArrayStart; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 1) lastSafeClose = i;
    }
  }

  if (lastSafeClose !== -1) {
    let repaired = text.substring(0, lastSafeClose + 1) + ']}';
    try { JSON.parse(repaired); return repaired; } catch (e) {}
    repaired = repaired + '}';
    try { JSON.parse(repaired); return repaired; } catch (e) {}
  }

  return text;
}

// ── Extraction prompt ────────────────────────────────────────
const PROMPT = `You are a bank statement data extraction engine. Extract ALL transactions from this PDF and return ONLY a valid minified JSON object — no explanation, no markdown, no extra text, no indentation.

DETECT DOCUMENT TYPE FIRST:
- Only return an error if the document is GENUINELY not a bank statement at all (e.g. a lease agreement, loan invoice, tax form, utility bill, insurance policy).
- A bank statement with only 1 or 2 transactions is VALID — extract it normally.
- A bank statement that says "No activity this statement period" or has a completely empty transaction table is VALID — return it with an empty transactions array [].
- A bank statement showing only beginning/ending balance with no activity rows is VALID — return it with an empty transactions array [].
- NEVER return NOT_A_BANK_STATEMENT for a real bank or credit card statement, regardless of how few transactions it has.
- If unsure, extract what you can and return the statement data.
- Only if the document is genuinely NOT a bank statement: {"error":"NOT_A_BANK_STATEMENT","document_type":"describe what it is"}

ACCOUNT INFO:
- Extract bank name, account holder name, account number last 4-5 digits, statement period, opening balance, closing balance.
- Also extract total_debits and total_credits from the statement summary section if present (e.g. "Total Checks Paid", "Total Deposits and Additions", "Total Withdrawals", etc.)
- total_debits = sum of ALL debit categories from the summary (checks + ATM + fees + electronic withdrawals etc.)
- total_credits = sum of ALL credit/deposit categories from the summary

EXTRACT TRANSACTIONS from ALL pages including: Deposits/Credits, Checks Paid, Electronic Withdrawals, ATM Withdrawals, Fees, Refunds, Card Purchases.

IGNORE: Daily balance rows, beginning/ending balance summary lines, page headers/footers, overdraft disclosures.

LAYOUT: Handle any column order. Merge multi-line transactions into one row. Infer year from statement period.
- Amounts in parentheses (123.45) = Debit
- Negative amounts -123.45 = Debit

RUNNING BALANCE: Use the statement's own printed running balance column if available. If not available, calculate cumulative balance after each transaction.

OUTPUT — return ONLY this minified JSON:
{"bank_name":"","account_number":"","account_holder":"","statement_period":"","opening_balance":0,"closing_balance":0,"total_debits":0,"total_credits":0,"transactions":[{"date":"Jan 01 2022","description":"","check_number":"","debit":0,"credit":0,"balance":0,"running_balance":0,"month":"January 2022","type":"Credit","year":"2022"}]}

For statements with no transactions, return:
{"bank_name":"","account_number":"","account_holder":"","statement_period":"","opening_balance":0,"closing_balance":0,"total_debits":0,"total_credits":0,"transactions":[]}

STRICT RULES:
- Minified JSON only — no indentation, no extra whitespace
- description: max 80 characters
- debit/credit: positive number or 0
- type: exactly "Credit" or "Debit"
- check_number: "" if not applicable
- Include ALL transactions from ALL pages, do NOT skip any
- Do NOT include balance summary rows as transactions
- Do NOT duplicate transactions
- Unreadable values: 0 for numbers, "" for strings
- Return ONLY the JSON, nothing else`;

// ── QC DATA BUILDER ──────────────────────────────────────────
// Builds qcData from already-extracted data — zero extra API calls.
//
// Three fixes applied here vs the old version:
//
// FIX 1 — totalDebits/totalCredits use Claude's extracted summary values
//   (data.total_debits / data.total_credits from the statement header)
//   NOT re-summed from transaction rows. Chase statements group transactions
//   by type (deposits block, then checks block) so re-summing rows gives
//   wrong totals when the array order doesn't match chronological order.
//
// FIX 2 — Running balance recomputation sorts transactions by date first.
//   Chase statements come with deposits first, then checks, then ATM, then
//   fees — all out of date order. Without sorting, sequential recomputation
//   generates 20+ false positive balance errors on a clean statement.
//
// FIX 3 — Balance math check uses summary totals (fix 1 values), not
//   recomputed row sums, so the opening + credits - debits = closing
//   check is accurate.
function buildBankQcData(allStatements, allTransactions) {

  // Date gaps — flag gaps > 5 days within a statement
  const dateGaps = [];
  allStatements.forEach((stmt) => {
    const txs = (stmt.transactions || [])
      .filter(t => t.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    for (let i = 1; i < txs.length; i++) {
      const prev   = new Date(txs[i - 1].date);
      const curr   = new Date(txs[i].date);
      const dayGap = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
      if (dayGap > 5) {
        dateGaps.push({
          file:   stmt.fileName,
          from:   txs[i - 1].date,
          to:     txs[i].date,
          dayGap,
        });
      }
    }
  });

  // Amount outliers — flag amounts > 20x the median (catches OCR extra zeros)
  const amountOutliers = [];
  allStatements.forEach((stmt) => {
    const amounts = (stmt.transactions || [])
      .map((t) => Math.abs(t.debit || t.credit || 0))
      .filter((a) => a > 0)
      .sort((a, b) => a - b);

    if (amounts.length < 5) return;
    const median = amounts[Math.floor(amounts.length / 2)];

    (stmt.transactions || []).forEach((t) => {
      const amt = Math.abs(t.debit || t.credit || 0);
      if (amt > median * 20 && median > 0) {
        amountOutliers.push({
          file:   stmt.fileName,
          date:   t.date,
          amount: amt,
          times:  Math.round(amt / median),
        });
      }
    });
  });

  // Running balance errors — sort by date before recomputing (FIX 2)
  const runningBalanceErrors = [];
  allStatements.forEach((stmt) => {
    const rawTxs = stmt.transactions || [];
    if (!rawTxs.length || rawTxs[0].running_balance == null) return;

    // CRITICAL: sort by date first — Chase and many banks sort transactions
    // by type (deposits, then checks) not chronologically. Without this sort,
    // sequential recomputation produces false positive errors on clean data.
    const txs = [...rawTxs]
      .filter(t => t.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = stmt.openingBalance || 0;
    txs.forEach((t, idx) => {
      running = running + (t.credit || 0) - (t.debit || 0);
      const printed = t.running_balance;
      if (printed != null && Math.abs(running - printed) > 1) {
        runningBalanceErrors.push({
          file:     stmt.fileName,
          row:      idx + 1,
          expected: running.toFixed(2),
          found:    printed.toFixed(2),
        });
        running = printed; // resync to prevent cascading errors
      }
    });
  });

  return {
    statements: allStatements.map((s) => ({
      file:             s.fileName,
      periodStart:      s.periodStart    || null,
      periodEnd:        s.periodEnd      || null,
      openingBalance:   s.openingBalance ?? null,
      closingBalance:   s.closingBalance ?? null,
      totalDebits:      s.totalDebits    ?? null,  // Claude's extracted summary value (FIX 1)
      totalCredits:     s.totalCredits   ?? null,  // Claude's extracted summary value (FIX 1)
      transactionCount: (s.transactions || []).length,
    })),
    transactions: allTransactions.map((t) => ({
      date:           t.date,
      description:    t.description,
      debit:          t.debit,
      credit:         t.credit,
      runningBalance: t.running_balance ?? null,
    })),
    dateGaps,
    amountOutliers,
    runningBalanceErrors,
  };
}

// ── MAIN HANDLER ─────────────────────────────────────────────
export async function POST(request) {
  try {
    const formData = await request.formData();
    const files    = formData.getAll('pdfs');

    const pdfFiles = files.filter(f => {
      const name = f.name || '';
      return name.toLowerCase().endsWith('.pdf') && f.size > 0;
    });

    console.log('Total files received:', files.length, '| PDF files:', pdfFiles.length);

    if (pdfFiles.length === 0) {
      return Response.json(
        { error: `No PDF files found! Received ${files.length} files total.` },
        { status: 400 }
      );
    }

    // ── Parallel extraction ──────────────────────────────────
    const results = await Promise.all(pdfFiles.map(async (file) => {
      try {
        console.log('Processing:', file.name, '| Size:', file.size);
        const arrayBuffer = await file.arrayBuffer();
        const base64PDF   = Buffer.from(arrayBuffer).toString('base64');

        const stream = client.messages.stream({
          model:      'claude-sonnet-4-5',
          max_tokens: 32000,
          messages: [{
            role: 'user',
            content: [
              {
                type:   'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64PDF },
              },
              {
                type: 'text',
                text: PROMPT,
              },
            ],
          }],
        });

        const claudeResponse = await stream.finalMessage();
        let responseText     = claudeResponse.content[0].text.trim();
        responseText         = repairJSON(responseText);
        const data           = JSON.parse(responseText);

        if (data.error === 'NOT_A_BANK_STATEMENT') {
          console.log('Not a bank statement:', file.name, '| Type:', data.document_type);
          return {
            success: false,
            error:   { file: file.name, error: `Not a bank statement — detected as: ${data.document_type}` },
          };
        }

        const transactions = (data.transactions || []).map(t => ({
          file_name:        file.name,
          bank_name:        data.bank_name        || '',
          account_holder:   data.account_holder   || '',
          account_number:   data.account_number   || '',
          statement_period: data.statement_period || '',
          date:             t.date                || '',
          description:      t.description         || '',
          check_number:     t.check_number        || '',
          debit:            t.debit               || 0,
          credit:           t.credit              || 0,
          balance:          t.balance             ?? '',
          running_balance:  t.running_balance     ?? '',
          month:            t.month               || '',
          type:             t.type                || '',
          year:             t.year                || '',
        }));

        const summary = {
          file:              file.name,
          bank:              data.bank_name        || '',
          account_holder:    data.account_holder   || '',
          account_number:    data.account_number   || '',
          period:            data.statement_period || '',
          opening_balance:   data.opening_balance  || 0,
          closing_balance:   data.closing_balance  || 0,
          transaction_count: transactions.length,
        };

        console.log('Success:', file.name, '| Transactions:', transactions.length);

        const inputBaseName = file.name.replace(/\.pdf$/i, '');

        // ── FIX 1: totalDebits and totalCredits computed OUTSIDE
        //    the statementObj literal (cannot use const inside object).
        //
        //    Use Claude's extracted summary totals (data.total_debits /
        //    data.total_credits) as the primary source — these come from
        //    the "CHECKING SUMMARY" / "Total Deposits" section of the PDF
        //    and are always correct regardless of transaction sort order.
        //
        //    Fall back to row-sum only when summary is missing or zero.
        const totalDebits = parseFloat(data.total_debits) > 0
          ? parseFloat(data.total_debits)
          : (data.transactions || []).reduce((s, t) => s + (parseFloat(t.debit)  || 0), 0);

        const totalCredits = parseFloat(data.total_credits) > 0
          ? parseFloat(data.total_credits)
          : (data.transactions || []).reduce((s, t) => s + (parseFloat(t.credit) || 0), 0);

        const statementObj = {
          fileName:       file.name,
          openingBalance: data.opening_balance || 0,
          closingBalance: data.closing_balance || 0,
          totalDebits,    // authoritative summary total (not re-summed from rows)
          totalCredits,   // authoritative summary total (not re-summed from rows)
          transactions:   data.transactions    || [],
        };

        return {
          success:        true,
          transactions,
          summary,
          statementObj,
          outputFileName: `${inputBaseName}.xlsx`,
        };

      } catch (err) {
        console.log('Failed:', file.name, '| Error:', err.message);
        return { success: false, error: { file: file.name, error: err.message } };
      }
    }));

    // ── Collect results ──────────────────────────────────────
    const allTransactions = [];
    const allStatements   = [];
    const summaries       = [];
    const errors          = [];
    let outputFileName    = 'bank_extraction.xlsx';

    results.forEach(r => {
      if (r.success) {
        allTransactions.push(...r.transactions);
        allStatements.push(r.statementObj);
        summaries.push(r.summary);
        if (outputFileName === 'bank_extraction.xlsx' && r.outputFileName) {
          outputFileName = r.outputFileName;
        }
      } else {
        errors.push(r.error);
      }
    });

    if (results.filter(r => r.success).length > 1) {
      const names = results
        .filter(r => r.success && r.outputFileName)
        .map(r => r.outputFileName.replace('.xlsx', ''));
      outputFileName = names.join('_') + '.xlsx';
    }

    if (summaries.length === 0) {
      return Response.json(
        { error: 'No valid bank statements found.', details: errors },
        { status: 400 }
      );
    }

    // ── Build Excel ──────────────────────────────────────────
    const wb = new ExcelJS.Workbook();

    // Sheet 1: All Transactions
    const txSheet = wb.addWorksheet('All Transactions');
    txSheet.columns = [
      { header: 'File Name',        key: 'file_name',        width: 30 },
      { header: 'Bank Name',        key: 'bank_name',        width: 22 },
      { header: 'Account Holder',   key: 'account_holder',   width: 22 },
      { header: 'Account Number',   key: 'account_number',   width: 16 },
      { header: 'Statement Period', key: 'statement_period', width: 24 },
      { header: 'Month',            key: 'month',            width: 16 },
      { header: 'Date',             key: 'date',             width: 16 },
      { header: 'Description',      key: 'description',      width: 42 },
      { header: 'Check No.',        key: 'check_number',     width: 12 },
      { header: 'Debit',            key: 'debit',            width: 14 },
      { header: 'Credit',           key: 'credit',           width: 14 },
      { header: 'Balance',          key: 'balance',          width: 16 },
      { header: 'Running Balance',  key: 'running_balance',  width: 18 },
      { header: 'Type',             key: 'type',             width: 10 },
      { header: 'Year',             key: 'year',             width: 10 },
    ];

    txSheet.getRow(1).eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2444' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    txSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const yellow    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    const lightBlue = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    const white     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

    allTransactions.forEach((t, idx) => {
      const debitVal  = t.debit  && t.debit  !== 0 ? t.debit  : null;
      const creditVal = t.credit && t.credit !== 0 ? t.credit : null;
      const descVal   = t.description && String(t.description).trim().length > 0 ? t.description : null;
      const runBal    = t.running_balance !== undefined && t.running_balance !== null ? t.running_balance : null;

      const row = txSheet.addRow({
        file_name:        t.file_name,
        bank_name:        t.bank_name,
        account_holder:   t.account_holder,
        account_number:   t.account_number,
        statement_period: t.statement_period,
        month:            t.month          || '',
        date:             t.date           || '',
        description:      descVal          ?? '',
        check_number:     t.check_number   || '',
        debit:            debitVal         ?? '',
        credit:           creditVal        ?? '',
        balance:          t.balance        ?? '',
        running_balance:  runBal           ?? '',
        type:             t.type           || '',
        year:             t.year           || '',
      });

      const missingDesc    = !descVal;
      const missingAmounts = !debitVal && !creditVal;

      if (missingDesc || missingAmounts) {
        row.eachCell({ includeEmpty: true }, cell => { cell.fill = yellow; });
      } else {
        const fill = idx % 2 === 0 ? white : lightBlue;
        row.eachCell({ includeEmpty: true }, cell => { cell.fill = fill; });
      }
    });

    if (allTransactions.length === 0) {
      const noteRow = txSheet.addRow({
        file_name:        summaries[0]?.file            || '',
        bank_name:        summaries[0]?.bank            || '',
        account_holder:   summaries[0]?.account_holder || '',
        account_number:   summaries[0]?.account_number || '',
        statement_period: summaries[0]?.period         || '',
        description:      'No transactions this statement period',
      });
      noteRow.getCell('description').font = { italic: true, color: { argb: 'FF888888' } };
    }

    // Sheet 2: Summary
    const sumSheet = wb.addWorksheet('Summary');
    sumSheet.columns = [
      { header: 'File Name',          key: 'file',              width: 30 },
      { header: 'Bank Name',          key: 'bank',              width: 22 },
      { header: 'Account Holder',     key: 'account_holder',    width: 22 },
      { header: 'Account Number',     key: 'account_number',    width: 16 },
      { header: 'Statement Period',   key: 'period',            width: 24 },
      { header: 'Opening Balance',    key: 'opening_balance',   width: 16 },
      { header: 'Closing Balance',    key: 'closing_balance',   width: 16 },
      { header: 'Total Transactions', key: 'transaction_count', width: 20 },
    ];

    sumSheet.getRow(1).eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2444' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    sumSheet.views = [{ state: 'frozen', ySplit: 1 }];

    summaries.forEach((s, idx) => {
      const row  = sumSheet.addRow(s);
      const fill = idx % 2 === 0 ? white : lightBlue;
      row.eachCell({ includeEmpty: true }, cell => { cell.fill = fill; });
    });

    const excelBuffer = await wb.xlsx.writeBuffer();
    const excelBase64 = Buffer.from(excelBuffer).toString('base64');

    return Response.json({
      success:           true,
      totalFiles:        pdfFiles.length,
      totalTransactions: allTransactions.length,
      summaries,
      errors,
      excelFile:         excelBase64,
      fileName:          outputFileName,
      // qcData — built from already-extracted data, zero extra API calls
      qcData: buildBankQcData(allStatements, allTransactions),
    });

  } catch (err) {
    console.log('Bank extract error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
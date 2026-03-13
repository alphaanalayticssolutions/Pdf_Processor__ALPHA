// app/api/transaction-analysis/route.js
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── PROMPTS ───────────────────────────────────────────────────────────────────

const COLUMN_DETECTION_PROMPT = `You are a data analyst assistant. I will give you the column headers from a transaction dataset.
Your job is to identify which column corresponds to each required field.

Required fields:
1. account_col — The column that holds the Account ID or Account Number (e.g. "Account ID", "AccountNumber", "acc_id", "account_no", "Acct #")
2. date_col — The column that holds the Transaction Date (e.g. "Date", "Transaction Date", "txn_date", "Trans Date", "Posted Date")
3. amount_col — (Optional) The column that holds the transaction amount (e.g. "Amount", "Transaction Amount", "Debit", "Credit", "txn_amount") — return null if not found
4. txn_id_col — (Optional) The column that holds the Transaction ID (e.g. "Transaction ID", "txn_id", "Reference", "Ref No") — return null if not found

Column headers provided: {HEADERS}

Respond ONLY with a valid JSON object in this exact format, no explanation, no markdown:
{
  "account_col": "<exact column name or null>",
  "date_col": "<exact column name or null>",
  "amount_col": "<exact column name or null>",
  "txn_id_col": "<exact column name or null>"
}

If you cannot confidently identify a required field (account_col or date_col), return null for that field.`;


const INSIGHTS_PROMPT = `You are a financial data analyst. I will give you a transaction pivot table summary.
Your job is to analyze it and write a clear, concise insight report.

Pivot Data:
- Date Range: {DATE_RANGE}
- Total Accounts: {TOTAL_ACCOUNTS}
- Total Months: {TOTAL_MONTHS}
- Grand Total Transactions: {GRAND_TOTAL}
- Per-Account Summary (account → [month: count, ...]):
{ACCOUNT_SUMMARY}
- Monthly Totals (month → total transactions across all accounts):
{MONTHLY_TOTALS}

Write a structured insight report covering:
1. **Overall Activity** — High-level summary of volume, date range, and scale
2. **Top Accounts** — Which accounts had the highest transaction volume and when
3. **Peak Months** — Which months had the most activity across all accounts and why that might be
4. **Low Activity / Gaps** — Accounts or months with zero or very low transactions — flag anything suspicious
5. **Patterns & Anomalies** — Any unusual spikes, drops, or patterns worth flagging (e.g. one account suddenly 10x in a month)
6. **Recommendations** — 2-3 actionable recommendations based on this data

Format using clear section headers. Be specific — use actual account names, month names, and numbers from the data. Keep it professional but readable. Do not repeat the raw data back — synthesize insights.`;

// ─── CSV PARSER ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  const headers = splitCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCSVLine(lines[i]);
    if (vals.every(v => !v)) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

// ─── DATE PARSER ───────────────────────────────────────────────────────────────
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    return isNaN(d) ? null : d;
  }
  const s = String(val).trim();
  const native = new Date(s);
  if (!isNaN(native)) return native;
  const parts = s.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    if (a > 1000) return new Date(a, b - 1, c);
    if (c > 1000) return new Date(c, a - 1, b);
  }
  return null;
}

// ─── MONTH-YEAR SORT KEY ───────────────────────────────────────────────────────
function monthYearSortKey(label) {
  const d = new Date(`01 ${label}`);
  return isNaN(d) ? 0 : d.getTime();
}

// ─── HEATMAP COLOR ─────────────────────────────────────────────────────────────
function heatmapARGB(value, max) {
  if (max === 0 || value === 0) return 'FFFFFFFF';
  const ratio = value / max;
  const r = Math.round(255 - ratio * (255 - 31));
  const g = Math.round(255 - ratio * (255 - 56));
  const b = Math.round(255 - ratio * (255 - 100));
  const hex = n => n.toString(16).padStart(2, '0').toUpperCase();
  return `FF${hex(r)}${hex(g)}${hex(b)}`;
}

// ─── CLAUDE: COLUMN DETECTION ─────────────────────────────────────────────────
async function detectColumnsWithClaude(headers) {
  const prompt = COLUMN_DETECTION_PROMPT.replace('{HEADERS}', JSON.stringify(headers));
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = msg.content[0]?.text?.trim() || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ─── CLAUDE: AI INSIGHTS ──────────────────────────────────────────────────────
async function generateInsightsWithClaude(pivot, monthYears, accounts, grandTotal) {
  const accountSummary = accounts.map(acc => {
    const entries = monthYears
      .map(my => `${my}: ${pivot[acc][my] || 0}`)
      .filter(e => !e.endsWith(': 0'))
      .join(', ');
    const total = monthYears.reduce((s, my) => s + (pivot[acc][my] || 0), 0);
    return `  ${acc} (total: ${total}) → ${entries || 'no activity'}`;
  }).join('\n');

  const monthlyTotals = monthYears.map(my => {
    const total = accounts.reduce((s, acc) => s + (pivot[acc][my] || 0), 0);
    return `  ${my}: ${total}`;
  }).join('\n');

  const prompt = INSIGHTS_PROMPT
    .replace('{DATE_RANGE}', `${monthYears[0]} to ${monthYears[monthYears.length - 1]}`)
    .replace('{TOTAL_ACCOUNTS}', accounts.length)
    .replace('{TOTAL_MONTHS}', monthYears.length)
    .replace('{GRAND_TOTAL}', grandTotal)
    .replace('{ACCOUNT_SUMMARY}', accountSummary)
    .replace('{MONTHLY_TOTALS}', monthlyTotals);

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0]?.text?.trim() || 'No insights generated.';
}

// ─── BUILD EXCEL ──────────────────────────────────────────────────────────────
async function buildExcel(pivot, monthYears, accounts, insights, grandTotal) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Alpha Analytics Solutions';
  wb.created = new Date();

  // ── TAB 1: Account Transaction Heatmap ──────────────────────────────────────
  const ws = wb.addWorksheet('Account Transaction Heatmap');
  const totalCols = 1 + monthYears.length + 1;

  let maxCount = 0;
  for (const acc of accounts)
    for (const my of monthYears)
      if ((pivot[acc][my] || 0) > maxCount) maxCount = pivot[acc][my] || 0;

  ws.addRow(['Account ID / Number', ...monthYears, 'Total']);
  const hdr = ws.getRow(1);
  hdr.height = 32;
  hdr.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
    cell.font      = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = { top: { style: 'thin', color: { argb: 'FFB0B0B0' } }, bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } }, left: { style: 'thin', color: { argb: 'FFB0B0B0' } }, right: { style: 'thin', color: { argb: 'FFB0B0B0' } } };
  });
  hdr.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  accounts.forEach((acc, accIdx) => {
    let rowTotal = 0;
    const rowVals = [acc];
    monthYears.forEach(my => { const cnt = pivot[acc][my] || 0; rowVals.push(cnt); rowTotal += cnt; });
    rowVals.push(rowTotal);

    const r = ws.addRow(rowVals);
    r.height = 20;
    r.eachCell((cell, colNum) => {
      const isAccCol   = colNum === 1;
      const isTotalCol = colNum === totalCols;
      const count      = isAccCol ? null : (isTotalCol ? rowTotal : (pivot[acc][monthYears[colNum - 2]] || 0));

      if (!isAccCol && !isTotalCol) {
        const ratio = count / (maxCount || 1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: heatmapARGB(count, maxCount) } };
        cell.font = { name: 'Arial', size: 10, color: { argb: ratio > 0.5 ? 'FFFFFFFF' : 'FF000000' }, bold: count > 0 };
      } else if (isTotalCol) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
        cell.font = { name: 'Arial', size: 10, bold: true };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accIdx % 2 === 0 ? 'FFFFFFFF' : 'FFDCE6F1' } };
        cell.font = { name: 'Arial', size: 10, bold: true };
      }
      cell.alignment = { horizontal: isAccCol ? 'left' : 'center', vertical: 'middle' };
      cell.border    = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
    });
  });

  const totalRowVals = ['TOTAL'];
  monthYears.forEach(my => {
    totalRowVals.push(accounts.reduce((s, acc) => s + (pivot[acc][my] || 0), 0));
  });
  totalRowVals.push(grandTotal);
  const totalRow = ws.addRow(totalRowVals);
  totalRow.height = 24;
  totalRow.eachCell((cell, colNum) => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    cell.font      = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: colNum === 1 ? 'left' : 'center', vertical: 'middle' };
    cell.border    = { top: { style: 'medium', color: { argb: 'FF002060' } }, bottom: { style: 'medium', color: { argb: 'FF002060' } }, left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } } };
  });

  ws.addRow([]);
  const legendRow = ws.addRow(['🎨 Heatmap: White = 0 transactions  →  Dark Navy = Highest volume']);
  legendRow.getCell(1).font      = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF666666' } };
  legendRow.getCell(1).alignment = { horizontal: 'left' };
  ws.mergeCells(legendRow.number, 1, legendRow.number, Math.min(totalCols, 6));

  ws.getColumn(1).width = 30;
  for (let c = 2; c <= monthYears.length + 1; c++) ws.getColumn(c).width = 13;
  ws.getColumn(monthYears.length + 2).width = 10;
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1, activeCell: 'B2' }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: totalCols } };

  // ── TAB 2: AI Insights ──────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('AI Insights');

  ws2.mergeCells('A1:G1');
  const titleCell = ws2.getCell('A1');
  titleCell.value     = '🤖 AI Transaction Insights — Powered by Claude';
  titleCell.font      = { name: 'Arial', bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws2.getRow(1).height = 40;

  ws2.mergeCells('A2:G2');
  const subCell = ws2.getCell('A2');
  subCell.value     = `Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}  |  ${accounts.length} Accounts  |  ${monthYears.length} Months  |  ${grandTotal} Total Transactions`;
  subCell.font      = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF444444' } };
  subCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws2.getRow(2).height = 22;

  ws2.addRow([]);

  const lines = insights.split('\n');
  let rowIdx = 4;
  for (const line of lines) {
    ws2.mergeCells(`A${rowIdx}:G${rowIdx}`);
    const cell = ws2.getCell(`A${rowIdx}`);
    const isHeader = /^\*\*(.+)\*\*/.test(line.trim()) || /^#{1,3}\s/.test(line.trim()) || /^\d+\.\s\*\*/.test(line.trim());
    const cleanLine = line.replace(/\*\*/g, '').replace(/^#{1,3}\s/, '').trim();
    cell.value     = cleanLine;
    cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left', indent: isHeader ? 0 : 1 };

    if (isHeader && cleanLine) {
      cell.font = { name: 'Arial', bold: true, size: 12, color: { argb: 'FF002060' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
      ws2.getRow(rowIdx).height = 22;
    } else if (cleanLine === '') {
      ws2.getRow(rowIdx).height = 8;
    } else {
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF333333' } };
      ws2.getRow(rowIdx).height = 18;
    }
    rowIdx++;
  }

  rowIdx += 2;
  ws2.mergeCells(`A${rowIdx}:G${rowIdx}`);
  const footerCell = ws2.getCell(`A${rowIdx}`);
  footerCell.value     = 'Analysis generated by Claude AI (Anthropic) • Alpha Analytics Solutions';
  footerCell.font      = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF999999' } };
  footerCell.alignment = { horizontal: 'center' };

  ws2.getColumn('A').width = 100;

  return wb;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rows = [];

    if (fileName.endsWith('.csv')) {
      rows = parseCSV(buffer.toString('utf-8'));
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const inWb = new ExcelJS.Workbook();
      await inWb.xlsx.load(buffer);
      const inSheet = inWb.worksheets[0];
      const headers = [];
      inSheet.getRow(1).eachCell({ includeEmpty: false }, cell => {
        headers.push(String(cell.value ?? '').trim());
      });
      inSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const obj = {};
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          const h = headers[colNum - 1];
          if (h) obj[h] = cell.value;
        });
        if (Object.values(obj).some(v => v !== null && v !== '')) rows.push(obj);
      });
    } else {
      return NextResponse.json({ error: 'Unsupported format. Upload CSV or Excel (.xlsx).' }, { status: 400 });
    }

    if (rows.length === 0) return NextResponse.json({ error: 'No data found in the uploaded file.' }, { status: 400 });

    const headers = Object.keys(rows[0]);

    // ── Claude Call 1: Detect columns ─────────────────────────────────────────
    let colMap;
    try {
      colMap = await detectColumnsWithClaude(headers);
    } catch (e) {
      return NextResponse.json({ error: `Claude column detection failed: ${e.message}` }, { status: 500 });
    }

    if (!colMap.account_col) return NextResponse.json({ error: 'Claude could not identify an Account ID / Account Number column. Please check your column headers.' }, { status: 400 });
    if (!colMap.date_col)    return NextResponse.json({ error: 'Claude could not identify a Transaction Date column. Please check your column headers.' }, { status: 400 });

    // ── Build pivot ───────────────────────────────────────────────────────────
    const pivot = {};
    const monthYearSet = new Set();

    for (const row of rows) {
      const account = String(row[colMap.account_col] ?? '').trim();
      if (!account) continue;
      const date = parseDate(row[colMap.date_col]);
      if (!date) continue;
      const label = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      monthYearSet.add(label);
      if (!pivot[account]) pivot[account] = {};
      pivot[account][label] = (pivot[account][label] || 0) + 1;
    }

    if (Object.keys(pivot).length === 0) {
      return NextResponse.json({ error: 'No valid transactions found after parsing.' }, { status: 400 });
    }

    const monthYears = [...monthYearSet].sort((a, b) => monthYearSortKey(a) - monthYearSortKey(b));
    const accounts   = Object.keys(pivot).sort();
    const grandTotal = accounts.reduce((s, acc) => s + monthYears.reduce((t, my) => t + (pivot[acc][my] || 0), 0), 0);

    // ── Claude Call 2: Generate insights ──────────────────────────────────────
    let insights = '';
    try {
      insights = await generateInsightsWithClaude(pivot, monthYears, accounts, grandTotal);
    } catch (e) {
      insights = `AI insights could not be generated: ${e.message}\n\nThe heatmap pivot in Tab 1 is complete and accurate.`;
    }

    // ── Build & return Excel ──────────────────────────────────────────────────
    const wb = await buildExcel(pivot, monthYears, accounts, insights, grandTotal);
    const outBuffer = await wb.xlsx.writeBuffer();

    return new NextResponse(outBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Transaction_Analysis.xlsx"'
      }
    });

  } catch (err) {
    console.error('[transaction-analysis]', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}

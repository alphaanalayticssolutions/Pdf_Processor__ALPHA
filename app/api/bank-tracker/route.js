import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── STEP 1: Read raw rows from uploaded Excel ─────────────────────────────
// Auto-detects header row (handles title rows like "Combined Transactions")
async function readExcelRows(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  let sheet = wb.getWorksheet('All Transactions');
  if (!sheet) sheet = wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in Excel file');

  // ── Auto-detect header row (scan first 5 rows) ──
  const KNOWN_HEADERS = ['MONTH', 'YEAR', 'BANK NAME', 'BANK', 'ACCOUNT NUMBER',
    'ACCOUNT NO', 'ACCOUNT HOLDER', 'DATE', 'DESCRIPTION', 'DEBIT', 'CREDIT'];

  let headerRowNumber = null;
  let headerMap = null;
  let bestScore = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 5) return;
    let score = 0;
    const candidate = {};
    row.eachCell((cell, colNumber) => {
      const val = cell.value?.toString().trim().toUpperCase();
      if (val && KNOWN_HEADERS.includes(val)) {
        score++;
        candidate[val] = colNumber;
      }
    });
    if (score > bestScore) {
      bestScore = score;
      headerRowNumber = rowNumber;
      headerMap = candidate;
    }
  });

  if (!headerMap || bestScore === 0) {
    throw new Error('Could not find header row. Make sure the Excel has columns like Month, Year, Bank Name, Account Number, Account Holder.');
  }

  console.log(`Header found at row ${headerRowNumber} with score ${bestScore}:`, Object.keys(headerMap));

  // ── Read data rows ──
  const rawRows = [];

  const get = (row, keys) => {
    for (const key of keys) {
      const col = headerMap[key];
      if (col) {
        const val = row.getCell(col).value;
        if (val !== null && val !== undefined && val !== '') return val?.toString().trim();
      }
    }
    return null;
  };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const month   = get(row, ['MONTH']);
    const year    = get(row, ['YEAR']);
    const bank    = get(row, ['BANK NAME', 'BANK']);
    const account = get(row, ['ACCOUNT NUMBER', 'ACCOUNT NO', 'ACCOUNT#']);
    const holder  = get(row, ['ACCOUNT HOLDER', 'HOLDER', 'ACCOUNT HOLDER NAME']);

    if (!month && !bank && !account) return;

    rawRows.push({ month, year, bank, account, holder });
  });

  console.log(`readExcelRows: headerRow=${headerRowNumber}, dataRows=${rawRows.length}`);
  return rawRows;
}

// ─── STEP 2A: Group raw rows by account locally ────────────────────────────
function groupRowsByAccount(rawRows) {
  const groups = {};

  for (const r of rawRows) {
    if (!r.account && !r.bank) continue;
    const acctKey = `${r.account || 'Unknown'}|${r.bank || 'Unknown'}`;

    if (!groups[acctKey]) {
      groups[acctKey] = {
        account: r.account || 'Unknown',
        bank: r.bank || 'Unknown',
        holder: r.holder || 'Unknown',
        monthSet: new Set(),
      };
    }

    if (r.holder && groups[acctKey].holder === 'Unknown') {
      groups[acctKey].holder = r.holder;
    }

    if (r.month && r.year) {
      groups[acctKey].monthSet.add(`${r.month} ${r.year}`);
    } else if (r.month) {
      groups[acctKey].monthSet.add(r.month);
    }
  }

  return Object.values(groups).map(g => ({
    rawAccount: g.account,
    rawBank: g.bank,
    holder: g.holder,
    months: Array.from(g.monthSet),
  }));
}

// ─── STEP 2B: Claude Haiku normalizes ONLY bank names & account holders ──────
// Months are NEVER touched by AI — they come directly from groupRowsByAccount
// This prevents AI hallucination from cross-contaminating months across accounts
async function normalizeWithAI(rawRows, fileName) {
  // First group locally — this is the source of truth for months
  const accountGroups = groupRowsByAccount(rawRows);
  console.log(`groupRowsByAccount: ${accountGroups.length} distinct account groups in ${fileName}`);

  if (accountGroups.length === 0) return [];

  // Build name-only payload — no months sent to AI at all
  const namePayload = accountGroups.map((g, i) => ({
    idx: i,
    rawAccount: g.rawAccount,
    rawBank: g.rawBank,
    holder: g.holder,
  }));

  try {
    const prompt = `You are given a list of bank accounts. Normalize ONLY the bank name and account holder name.
Return ONLY a valid JSON array, nothing else. No markdown, no explanation.

Return format (one entry per input, same order, same idx):
[
  { "idx": 0, "accountNumber": "****3000", "accountHolder": "2034 Superior LLC", "bankName": "Countryside Bank" }
]

Rules:
- Normalize bank names to clean readable form:
  "JPMorgan Chase Bank" / "Chase Bank" / "CHASE" → "Chase Bank"
  "Hinsdale Bank & Trust Company" / "Hinsdale Bank & Trust" / "Hinsdale Bank" → "Hinsdale Bank & Trust"
- Account number: last 4 digits only with **** prefix. e.g. "3000" → "****3000"
- Account holder: Title Case
- DO NOT merge, reorder, or drop any entries — return exactly ${namePayload.length} entries
- If any field missing use "Unknown"

Input (${namePayload.length} accounts):
${JSON.stringify(namePayload)}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const normalized = JSON.parse(clean);

    // Merge AI-normalized names back with locally-computed months
    // idx ensures each account gets its own correct months — no cross-contamination
    return normalized.map(n => ({
      accountNumber: n.accountNumber,
      accountHolder: n.accountHolder,
      bankName: n.bankName,
      months: accountGroups[n.idx]?.months || [],  // months come from local grouping ONLY
    }));

  } catch (err) {
    console.log('AI normalization failed for', fileName, ':', err.message);
    // Fallback: raw names, local months
    return accountGroups.map(g => ({
      accountNumber: g.rawAccount ? `****${String(g.rawAccount).slice(-4)}` : 'Unknown',
      accountHolder: g.holder || 'Unknown',
      bankName: g.rawBank || 'Unknown',
      months: g.months,
    }));
  }
}

// ─── MAIN POST HANDLER ─────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('excels');
    const excelFiles = files.filter(
      f => (f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')) && f.size > 0
    );

    console.log('Tracker - Excel files received:', excelFiles.length);

    if (excelFiles.length === 0) {
      return Response.json({ error: 'No Excel files found!' }, { status: 400 });
    }

    const accountMap = {};
    const errors = [];
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Process all Excel files in parallel
    await Promise.all(
      excelFiles.map(async (file) => {
        try {
          const arrayBuffer = await file.arrayBuffer();

          console.log('Reading Excel:', file.name);
          const rawRows = await readExcelRows(arrayBuffer);

          if (rawRows.length === 0) {
            errors.push({ file: file.name, error: 'No data rows found in Excel' });
            return;
          }

          console.log('Normalizing with AI:', file.name, '| rows:', rawRows.length);
          const accounts = await normalizeWithAI(rawRows, file.name);

          console.log('Accounts from', file.name, ':', accounts.length);

          // accounts is now an ARRAY — loop through each account
          for (const info of accounts) {
            const key = `${info.accountNumber}__${info.bankName}`;

            if (!accountMap[key]) {
              accountMap[key] = {
                account: info.accountNumber,
                holder: info.accountHolder,
                bank: info.bankName,
                files: new Set(),
                months: new Set(),
              };
            }
            accountMap[key].files.add(file.name);
            if (info.months && Array.isArray(info.months)) {
              info.months.forEach(m => accountMap[key].months.add(m));
            }
          }

        } catch (err) {
          console.log('Failed:', file.name, err.message);
          errors.push({ file: file.name, error: err.message });
        }
      })
    );

    if (Object.keys(accountMap).length === 0) {
      return Response.json({ error: 'No accounts could be extracted from Excel files.' }, { status: 400 });
    }

    // ─── Collect & sort all months ────────────────────────────────────────
    const allMonthSet = new Set();
    Object.values(accountMap).forEach(v => v.months.forEach(m => allMonthSet.add(m)));

    const sortedMonths = Array.from(allMonthSet).sort((a, b) => {
      const [ma, ya] = a.split(' ');
      const [mb, yb] = b.split(' ');
      if (ya !== yb) return parseInt(ya) - parseInt(yb);
      return monthOrder.indexOf(ma) - monthOrder.indexOf(mb);
    });

    // Group months by year
    const yearGroups = {};
    sortedMonths.forEach(m => {
      const yr = m.split(' ')[1];
      if (!yearGroups[yr]) yearGroups[yr] = [];
      yearGroups[yr].push(m);
    });

    // ─── Build output tracker Excel ───────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    const tracker = wb.addWorksheet('Tracker');
    const fixedCols = ['Sno', 'Account Number', 'Account Holder', 'Bank', 'File Name'];

    // ── Row 1: Year headers ──
    const yearRow = tracker.addRow([]);
    fixedCols.forEach((_, i) => {
      const cell = yearRow.getCell(i + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
    });

    let colOffset = fixedCols.length + 1;
    Object.entries(yearGroups).forEach(([year, months]) => {
      const cell = yearRow.getCell(colOffset);
      cell.value = parseInt(year);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c6e' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFffffff' } },
        left: { style: 'thin', color: { argb: 'FFffffff' } },
        bottom: { style: 'thin', color: { argb: 'FFffffff' } },
        right: { style: 'thin', color: { argb: 'FFffffff' } },
      };
      if (months.length > 1) {
        tracker.mergeCells(1, colOffset, 1, colOffset + months.length - 1);
      }
      colOffset += months.length;
    });

    // ── Row 2: Column headers ──
    const headerRow = tracker.addRow([]);
    fixedCols.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFffffff' } },
        left: { style: 'thin', color: { argb: 'FFffffff' } },
        bottom: { style: 'thin', color: { argb: 'FFffffff' } },
        right: { style: 'thin', color: { argb: 'FFffffff' } },
      };
    });

    sortedMonths.forEach((m, i) => {
      const cell = headerRow.getCell(fixedCols.length + 1 + i);
      cell.value = m.split(' ')[0];
      cell.font = { bold: true, color: { argb: 'FF333333' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFcccccc' } },
        left: { style: 'thin', color: { argb: 'FFcccccc' } },
        bottom: { style: 'thin', color: { argb: 'FFcccccc' } },
        right: { style: 'thin', color: { argb: 'FFcccccc' } },
      };
    });

    // ── Data rows ──
    Object.entries(accountMap).forEach(([key, info], idx) => {
      const isEven = idx % 2 === 0;
      const rowBg = isEven ? 'FFDCE6F1' : 'FFFFFFFF';

      const rowData = [
        idx + 1,
        info.account,
        info.holder,
        info.bank,
        Array.from(info.files).join(', '),
      ];
      sortedMonths.forEach(m => rowData.push(info.months.has(m) ? 'X' : ''));

      const row = tracker.addRow(rowData);
      row.height = 18;

      fixedCols.forEach((_, i) => {
        const cell = row.getCell(i + 1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFcccccc' } },
          left: { style: 'thin', color: { argb: 'FFcccccc' } },
          bottom: { style: 'thin', color: { argb: 'FFcccccc' } },
          right: { style: 'thin', color: { argb: 'FFcccccc' } },
        };
        cell.alignment = { vertical: 'middle' };
      });

      sortedMonths.forEach((m, i) => {
        const cell = row.getCell(fixedCols.length + 1 + i);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFcccccc' } },
          left: { style: 'thin', color: { argb: 'FFcccccc' } },
          bottom: { style: 'thin', color: { argb: 'FFcccccc' } },
          right: { style: 'thin', color: { argb: 'FFcccccc' } },
        };
        if (info.months.has(m)) {
          cell.font = { bold: true, color: { argb: 'FF002060' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe8f0fe' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }
      });
    });

    // ── Column widths ──
    tracker.getColumn(1).width = 6;
    tracker.getColumn(2).width = 18;
    tracker.getColumn(3).width = 24;
    tracker.getColumn(4).width = 22;
    tracker.getColumn(5).width = 38;
    for (let i = fixedCols.length + 1; i <= fixedCols.length + sortedMonths.length; i++) {
      tracker.getColumn(i).width = 8;
    }

    tracker.views = [{ state: 'frozen', xSplit: 5, ySplit: 2 }];

    const excelBuffer = await wb.xlsx.writeBuffer();
    const excelBase64 = Buffer.from(excelBuffer).toString('base64');

    return Response.json({
      success: true,
      totalAccounts: Object.keys(accountMap).length,
      totalMonths: sortedMonths.length,
      errors,
      excelFile: excelBase64,
    });

  } catch (err) {
    console.log('Tracker error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
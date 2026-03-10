import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── STEP 1: Read raw rows from uploaded Excel using ExcelJS ───────────────
async function readExcelRows(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  // Try 'All Transactions' sheet first, fallback to first sheet
  let sheet = wb.getWorksheet('All Transactions');
  if (!sheet) sheet = wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in Excel file');

  const rawRows = [];
  let headerRow = null;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      // Capture header for dynamic column mapping
      headerRow = {};
      row.eachCell((cell, colNumber) => {
        const val = cell.value?.toString().trim().toUpperCase();
        if (val) headerRow[val] = colNumber;
      });
      return;
    }

    if (!headerRow) return;

    // Dynamic column lookup — handles any column order
    const get = (keys) => {
      for (const key of keys) {
        const col = headerRow[key];
        if (col) {
          const val = row.getCell(col).value;
          if (val !== null && val !== undefined && val !== '') return val?.toString().trim();
        }
      }
      return null;
    };

    const month    = get(['MONTH']);
    const year     = get(['YEAR']);
    const bank     = get(['BANK NAME', 'BANK']);
    const account  = get(['ACCOUNT NUMBER', 'ACCOUNT NO', 'ACCOUNT#']);
    const holder   = get(['ACCOUNT HOLDER', 'HOLDER', 'ACCOUNT HOLDER NAME']);

    // Skip completely empty rows
    if (!month && !bank && !account) return;

    rawRows.push({ month, year, bank, account, holder });
  });

  return rawRows;
}

// ─── STEP 2: Send raw rows to Claude Haiku for normalization ───────────────
async function normalizeWithAI(rawRows, fileName) {
  try {
    // Deduplicate before sending to AI — no point sending 500 identical rows
    const seen = new Set();
    const uniqueRows = rawRows.filter(r => {
      const key = `${r.account}|${r.bank}|${r.month}|${r.year}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const prompt = `You are given raw transaction data extracted from a bank statement Excel file.
Analyze the rows and return ONLY valid JSON, nothing else. No markdown, no explanation.

Return this structure:
{
  "accountNumber": "masked as ****1234 (last 4 digits), or full if not maskable",
  "accountHolder": "Full Name of account holder",
  "bankName": "Clean normalized bank name (e.g. 'CHASE BANK NA' → 'Chase Bank', 'JPMORGAN' → 'JPMorgan Chase')",
  "months": ["Jan 2024", "Feb 2024"]
}

Rules:
- Normalize bank names to clean readable form
- Combine month + year fields into "MMM YYYY" format (e.g. month="Jan", year="2024" → "Jan 2024")
- If month already contains year (e.g. "January 2024"), convert to "Jan 2024"
- Account number: mask all but last 4 digits as ****XXXX
- Deduplicate months — no repeats
- If any field is missing or unclear, use "Unknown"
- Return ONE JSON object representing the account in this file

Raw data (${uniqueRows.length} unique rows):
${JSON.stringify(uniqueRows, null, 0)}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
      ],
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);

  } catch (err) {
    console.log('AI normalization failed for', fileName, ':', err.message);
    return {
      accountNumber: 'Unknown',
      accountHolder: 'Unknown',
      bankName: 'Unknown',
      months: [],
    };
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

          console.log('Sending to AI for normalization:', file.name, '| rows:', rawRows.length);
          const info = await normalizeWithAI(rawRows, file.name);

          console.log('Normalized:', info.accountNumber, '|', info.bankName, '| Months:', info.months.length);

          const key = `${info.accountNumber}__${info.bankName}`;

          // Thread-safe-ish update (JS is single-threaded, so this is fine)
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
          info.months.forEach(m => accountMap[key].months.add(m));

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
      if (ya !== yb) return parseInt(ya) - parseInt(yb); // oldest year first
      return monthOrder.indexOf(ma) - monthOrder.indexOf(mb); // Jan → Dec
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

    // Dark navy fill for fixed cols in year row
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
      cell.value = m.split(' ')[0]; // just "Jan", "Feb" etc
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
      const rowBg = isEven ? 'FFDCE6F1' : 'FFFFFFFF'; // alternating light blue / white

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

      // Style fixed cols
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

      // Style month cols
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
    tracker.getColumn(1).width = 6;   // Sno
    tracker.getColumn(2).width = 18;  // Account Number
    tracker.getColumn(3).width = 24;  // Account Holder
    tracker.getColumn(4).width = 22;  // Bank
    tracker.getColumn(5).width = 38;  // File Name
    for (let i = fixedCols.length + 1; i <= fixedCols.length + sortedMonths.length; i++) {
      tracker.getColumn(i).width = 8;
    }

    // Freeze panes — freeze first 2 rows + first 5 cols
    tracker.views = [{ state: 'frozen', xSplit: 5, ySplit: 2 }];

    // ── Serialize & return ──
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
import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
  jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
};

// ─── Parse a statement period string → Set of "MMM YYYY" strings ─────────────
// Strategy: extract actual date tokens IN ORDER from the string, so each month
// is always paired with the year that sits right next to it in the text.
// This correctly handles:
//   "Dec 30 2017 - Jan 31 2018"           → {Dec 2017, Jan 2018}
//   "December 31, 2020 - January 31, 2021" → {Dec 2020, Jan 2021}
//   "06/29/2019 - 07/31/2019"              → {Jun 2019, Jul 2019}
//   "08/31/20 - 09/30/20"                  → {Aug 2020, Sep 2020}
//   "August 31, 2021"                      → {Aug 2021}
function parsePeriodToMonths(periodStr) {
  const months = new Set();
  if (!periodStr || periodStr === 'None' || periodStr === 'null') return months;

  const s = periodStr.trim();
  const found = []; // ordered list of [monthIndex, year] pairs as they appear in string

  // ── Strategy: scan string left-to-right, extract (month, year) pairs in order ──

  // Pass 1: Named months — match "MonthName [day,] YYYY" in one shot so year is adjacent
  // Handles: "Dec 30 2017", "December 31, 2020", "August 31, 2021", "Jan 2019"
  const namedRe = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b[,\s]*\d{0,2}[,\s]*\b(20\d{2}|\d{2})\b/gi;
  let m;
  const namedMatches = [];
  while ((m = namedRe.exec(s)) !== null) {
    const mi = MONTH_NAMES[m[1].toLowerCase()];
    let yr = parseInt(m[2]);
    if (yr < 100) yr += 2000;
    if (mi !== undefined && yr >= 2000 && yr <= 2035) {
      namedMatches.push({ idx: m.index, pair: [mi, yr] });
    }
  }

  // Pass 2: Numeric dates — MM/DD/YYYY or MM-DD-YYYY or MM/DD/YY
  const numRe = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
  const numMatches = [];
  while ((m = numRe.exec(s)) !== null) {
    let yr = parseInt(m[3]);
    if (yr < 100) yr += 2000;
    const mi = parseInt(m[1]) - 1; // MM/DD/YYYY
    if (mi >= 0 && mi <= 11 && yr >= 2000 && yr <= 2035) {
      numMatches.push({ idx: m.index, pair: [mi, yr] });
    }
  }

  // Merge and sort by position in string — preserves left-to-right order
  const allMatches = [...namedMatches, ...numMatches]
    .sort((a, b) => a.idx - b.idx)
    .map(x => x.pair);

  // Deduplicate consecutive identical pairs
  for (const pair of allMatches) {
    const last = found[found.length - 1];
    if (!last || last[0] !== pair[0] || last[1] !== pair[1]) {
      found.push(pair);
    }
  }

  if (found.length === 0) return months;

  // Take first and last pair as start/end of the period
  const [startM, startY] = found[0];
  const [endM, endY] = found[found.length - 1];

  // Sanity check: end should not be before start, and range should be <= 12 months
  const startTotal = startY * 12 + startM;
  const endTotal   = endY * 12 + endM;
  const rangeSize  = endTotal - startTotal;

  if (rangeSize < 0 || rangeSize > 12) {
    // Something parsed wrong — just mark the individual months found, no fill
    for (const [mi, yr] of found) {
      months.add(`${MONTH_ORDER[mi]} ${yr}`);
    }
    return months;
  }

  // Fill every month from start to end
  let curM = startM, curY = startY;
  while (curY < endY || (curY === endY && curM <= endM)) {
    months.add(`${MONTH_ORDER[curM]} ${curY}`);
    curM++;
    if (curM === 12) { curM = 0; curY++; }
  }

  return months;
}

// ─── STEP 1: Read raw rows from uploaded Excel ─────────────────────────────
async function readExcelRows(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  let sheet = wb.getWorksheet('All Transactions');
  if (!sheet) sheet = wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in Excel file');

  // Auto-detect header row (scan first 5 rows)
  const KNOWN_HEADERS = ['MONTH', 'YEAR', 'BANK NAME', 'BANK', 'ACCOUNT NUMBER',
    'ACCOUNT NO', 'ACCOUNT HOLDER', 'DATE', 'DESCRIPTION', 'DEBIT', 'CREDIT',
    'STATEMENT PERIOD'];

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

  console.log(`Header found at row ${headerRowNumber}, score ${bestScore}:`, Object.keys(headerMap));

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
    const bank    = get(row, ['BANK NAME', 'BANK']);
    const account = get(row, ['ACCOUNT NUMBER', 'ACCOUNT NO', 'ACCOUNT#']);
    const holder  = get(row, ['ACCOUNT HOLDER', 'HOLDER', 'ACCOUNT HOLDER NAME']);
    const period  = get(row, ['STATEMENT PERIOD']);
    const month   = get(row, ['MONTH']);
    const year    = get(row, ['YEAR']);
    if (!account && !bank) return;
    rawRows.push({ bank, account, holder, period, month, year });
  });

  console.log(`readExcelRows: headerRow=${headerRowNumber}, dataRows=${rawRows.length}`);
  return rawRows;
}

// ─── STEP 2A: Group by account number only (ignore bank name spelling) ────────
// Same account number = same entity even if bank was renamed
// Uses Statement Period to determine which months are covered
// Falls back to Month+Year columns if no period available
function groupRowsByAccount(rawRows) {
  // key = account number only (not bank) — merges Countryside/Hinsdale same account
  const groups = {};

  for (const r of rawRows) {
    if (!r.account) continue;
    const acctKey = r.account;

    if (!groups[acctKey]) {
      groups[acctKey] = {
        account: r.account,
        banks: new Set(),        // all bank names seen (for display)
        holder: 'Unknown',
        monthSet: new Set(),     // months covered by statements
        periodsSeen: new Set(),  // avoid re-parsing same period string
      };
    }

    const g = groups[acctKey];
    if (r.bank) g.banks.add(r.bank);
    if (r.holder && g.holder === 'Unknown') g.holder = r.holder;

    // PRIMARY: use Statement Period to get covered months
    // Statement Period = the actual PDF statement that was received
    // This is the ONLY source of truth — transaction Month/Year is NOT used
    // Reason: a transaction existing in Month X does NOT mean we have the statement for X
    // And a statement period with zero transactions still means the statement was received
    if (r.period && !g.periodsSeen.has(r.period)) {
      g.periodsSeen.add(r.period);
      const covered = parsePeriodToMonths(r.period);
      covered.forEach(m => g.monthSet.add(m));
    }
    // NOTE: No fallback to Month+Year — if a row has no Statement Period,
    // we simply don't know if we have that statement or not → stays blank/gap
  }

  return Object.values(groups).map(g => {
    // Pick the most recent / most complete bank name for display
    const banksArr = Array.from(g.banks);
    const rawBank = banksArr.sort((a, b) => b.length - a.length)[0] || 'Unknown';
    return {
      rawAccount: g.account,
      rawBank,
      holder: g.holder,
      months: Array.from(g.monthSet),
    };
  });
}

// ─── STEP 2B: AI normalizes bank name + holder only ────────────────────────
async function normalizeWithAI(rawRows, fileName) {
  const accountGroups = groupRowsByAccount(rawRows);
  console.log(`groupRowsByAccount: ${accountGroups.length} accounts in ${fileName}`);
  if (accountGroups.length === 0) return [];

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
[{ "idx": 0, "accountNumber": "****3000", "accountHolder": "2034 Superior LLC", "bankName": "Countryside Bank" }]

Rules:
- Normalize bank names: "JPMorgan Chase Bank"/"Chase Bank"/"CHASE" → "Chase Bank"
  "Hinsdale Bank & Trust Company"/"Hinsdale Bank & Trust"/"Hinsdale Bank" → "Hinsdale Bank & Trust"
- Account number: last 4 digits with **** prefix. "3000" → "****3000"
- Account holder: Title Case
- Return exactly ${namePayload.length} entries, same order, DO NOT merge or drop any
- Missing field → "Unknown"

Input: ${JSON.stringify(namePayload)}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const normalized = JSON.parse(clean);

    // months always come from local grouping — never from AI
    return normalized.map(n => ({
      accountNumber: n.accountNumber,
      accountHolder: n.accountHolder,
      bankName: n.bankName,
      months: accountGroups[n.idx]?.months || [],
    }));

  } catch (err) {
    console.log('AI normalization failed for', fileName, ':', err.message);
    return accountGroups.map(g => ({
      accountNumber: g.rawAccount ? `****${String(g.rawAccount).slice(-4)}` : 'Unknown',
      accountHolder: g.holder || 'Unknown',
      bankName: g.rawBank || 'Unknown',
      months: g.months,
    }));
  }
}

// ─── Helper: get all months between first and last in a set ──────────────────
function getFullRange(monthSet) {
  if (monthSet.size === 0) return [];
  const sorted = Array.from(monthSet).sort((a, b) => {
    const [ma, ya] = a.split(' ');
    const [mb, yb] = b.split(' ');
    if (ya !== yb) return parseInt(ya) - parseInt(yb);
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
  });
  const [firstM, firstY] = sorted[0].split(' ');
  const [lastM, lastY] = sorted[sorted.length - 1].split(' ');
  const range = [];
  let curM = MONTH_ORDER.indexOf(firstM), curY = parseInt(firstY);
  const endM = MONTH_ORDER.indexOf(lastM), endY = parseInt(lastY);
  while (curY < endY || (curY === endY && curM <= endM)) {
    range.push(`${MONTH_ORDER[curM]} ${curY}`);
    curM++;
    if (curM === 12) { curM = 0; curY++; }
  }
  return range;
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

    // accountMap keyed by account number only — merges across bank name variants
    const accountMap = {};
    const errors = [];

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

          const accounts = await normalizeWithAI(rawRows, file.name);
          console.log('Accounts from', file.name, ':', accounts.length);

          for (const info of accounts) {
            // Key by account number only — so same account merges across bank name changes
            const key = info.accountNumber;

            if (!accountMap[key]) {
              accountMap[key] = {
                account: info.accountNumber,
                holder: info.accountHolder,
                bank: info.bankName,
                files: new Set(),
                months: new Set(),
              };
            }
            // Keep most complete bank name
            if (info.bankName.length > accountMap[key].bank.length) {
              accountMap[key].bank = info.bankName;
            }
            accountMap[key].files.add(file.name);
            info.months.forEach(m => accountMap[key].months.add(m));
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

    // ─── Build complete timeline (all months across all accounts) ────────────
    const allMonthSet = new Set();
    Object.values(accountMap).forEach(v => v.months.forEach(m => allMonthSet.add(m)));

    const sortedMonths = Array.from(allMonthSet).sort((a, b) => {
      const [ma, ya] = a.split(' ');
      const [mb, yb] = b.split(' ');
      if (ya !== yb) return parseInt(ya) - parseInt(yb);
      return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
    });

    // Group months by year for header row
    const yearGroups = {};
    sortedMonths.forEach(m => {
      const yr = m.split(' ')[1];
      if (!yearGroups[yr]) yearGroups[yr] = [];
      yearGroups[yr].push(m);
    });

    // ─── Build output Excel ───────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    const tracker = wb.addWorksheet('Tracker');
    const fixedCols = ['Sno', 'Account Number', 'Account Holder', 'Bank', 'File Name'];
    const thinWhite = { style: 'thin', color: { argb: 'FFffffff' } };
    const thinGray  = { style: 'thin', color: { argb: 'FFcccccc' } };

    // ── Row 1: Year headers ──
    const yearRow = tracker.addRow([]);
    fixedCols.forEach((_, i) => {
      const cell = yearRow.getCell(i + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002060' } };
      cell.border = { top: thinWhite, left: thinWhite, bottom: thinWhite, right: thinWhite };
    });

    let colOffset = fixedCols.length + 1;
    Object.entries(yearGroups).forEach(([year, months]) => {
      const cell = yearRow.getCell(colOffset);
      cell.value = parseInt(year);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c6e' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thinWhite, left: thinWhite, bottom: thinWhite, right: thinWhite };
      if (months.length > 1) tracker.mergeCells(1, colOffset, 1, colOffset + months.length - 1);
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
      cell.border = { top: thinWhite, left: thinWhite, bottom: thinWhite, right: thinWhite };
    });
    sortedMonths.forEach((m, i) => {
      const cell = headerRow.getCell(fixedCols.length + 1 + i);
      cell.value = m.split(' ')[0];
      cell.font = { bold: true, color: { argb: 'FF333333' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };
    });

    // ── Data rows ──
    Object.entries(accountMap).forEach(([key, info], idx) => {
      const isEven = idx % 2 === 0;
      const rowBg = isEven ? 'FFDCE6F1' : 'FFFFFFFF';

      // Compute full range for this account to detect gaps
      const fullRange = getFullRange(info.months);
      const gapSet = new Set(fullRange.filter(m => !info.months.has(m)));

      const rowData = [
        idx + 1,
        info.account,
        info.holder,
        info.bank,
        Array.from(info.files).join(', '),
      ];
      sortedMonths.forEach(m => {
        if (info.months.has(m)) rowData.push('✓');
        else if (gapSet.has(m)) rowData.push('?');  // gap in middle = suspicious missing
        else rowData.push('');                        // outside this account's range = truly N/A
      });

      const row = tracker.addRow(rowData);
      row.height = 18;

      fixedCols.forEach((_, i) => {
        const cell = row.getCell(i + 1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };
        cell.alignment = { vertical: 'middle' };
      });

      sortedMonths.forEach((m, i) => {
        const cell = row.getCell(fixedCols.length + 1 + i);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };

        if (info.months.has(m)) {
          // ✓ = statement present
          cell.value = '✓';
          cell.font = { bold: true, color: { argb: 'FF1B5E20' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
        } else if (gapSet.has(m)) {
          // ? = gap in the middle — potentially fraudulently omitted
          cell.value = '?';
          cell.font = { bold: true, color: { argb: 'FFC62828' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
        } else {
          // blank = outside this account's date range — N/A
          cell.value = '';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }
      });
    });

    // ── Column widths & freeze ──
    tracker.getColumn(1).width = 6;
    tracker.getColumn(2).width = 18;
    tracker.getColumn(3).width = 24;
    tracker.getColumn(4).width = 24;
    tracker.getColumn(5).width = 38;
    for (let i = fixedCols.length + 1; i <= fixedCols.length + sortedMonths.length; i++) {
      tracker.getColumn(i).width = 7;
    }
    tracker.views = [{ state: 'frozen', xSplit: 5, ySplit: 2 }];

    // ── Legend row at bottom ──
    tracker.addRow([]); // spacer
    const legendRow = tracker.addRow([]);
    legendRow.height = 20;

    // "LEGEND:" label
    const l1 = legendRow.getCell(2);
    l1.value = 'LEGEND:';
    l1.font = { bold: true, size: 10, font: 'Arial' };

    // ✓ sample cell
    const l2 = legendRow.getCell(3);
    l2.value = '✓';
    l2.font = { bold: true, color: { argb: 'FF1B5E20' }, size: 11 };
    l2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    l2.alignment = { horizontal: 'center', vertical: 'middle' };
    l2.border = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };

    const l3 = legendRow.getCell(4);
    l3.value = '= Statement present';
    l3.font = { size: 10, color: { argb: 'FF1B5E20' } };

    // ? sample cell
    const l4 = legendRow.getCell(5);
    l4.value = '?';
    l4.font = { bold: true, color: { argb: 'FFC62828' }, size: 11 };
    l4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
    l4.alignment = { horizontal: 'center', vertical: 'middle' };
    l4.border = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };

    const l5 = legendRow.getCell(6);
    l5.value = '= MISSING — request from opposition';
    l5.font = { bold: true, size: 10, color: { argb: 'FFC62828' } };

    const excelBuffer = await wb.xlsx.writeBuffer();
    const excelBase64 = Buffer.from(excelBuffer).toString('base64');

    // Count gaps across all accounts
    let totalGaps = 0;
    Object.values(accountMap).forEach(info => {
      const fullRange = getFullRange(info.months);
      totalGaps += fullRange.filter(m => !info.months.has(m)).length;
    });

    return Response.json({
      success: true,
      totalAccounts: Object.keys(accountMap).length,
      totalMonths: sortedMonths.length,
      totalGaps,
      errors,
      excelFile: excelBase64,
    });

  } catch (err) {
    console.log('Tracker error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
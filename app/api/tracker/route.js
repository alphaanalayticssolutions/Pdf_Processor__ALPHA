// app/api/tracker/route.js

import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES = {
  january:0, february:1, march:2, april:3, may:4, june:5,
  july:6, august:7, september:8, october:9, november:10, december:11,
  jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
};

// ─── Parse statement period → Set of "MMM YYYY" ────────────────────────────
function parsePeriodToMonths(periodStr) {
  const months = new Set();
  if (!periodStr || periodStr === 'None' || periodStr === 'null') return months;

  const s = periodStr.trim();
  const found = [];

  const namedRe = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b[,\s]*\d{0,2}[,\s]*\b(20\d{2}|\d{2})\b/gi;
  let m;
  const namedMatches = [];
  while ((m = namedRe.exec(s)) !== null) {
    const mi = MONTH_NAMES[m[1].toLowerCase()];
    let yr = parseInt(m[2]);
    if (yr < 100) yr += 2000;
    if (mi !== undefined && yr >= 2000 && yr <= 2035)
      namedMatches.push({ idx: m.index, pair: [mi, yr] });
  }

  const numRe = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
  const numMatches = [];
  while ((m = numRe.exec(s)) !== null) {
    let yr = parseInt(m[3]);
    if (yr < 100) yr += 2000;
    const mi = parseInt(m[1]) - 1;
    if (mi >= 0 && mi <= 11 && yr >= 2000 && yr <= 2035)
      numMatches.push({ idx: m.index, pair: [mi, yr] });
  }

  const allMatches = [...namedMatches, ...numMatches]
    .sort((a, b) => a.idx - b.idx)
    .map(x => x.pair);

  for (const pair of allMatches) {
    const last = found[found.length - 1];
    if (!last || last[0] !== pair[0] || last[1] !== pair[1]) found.push(pair);
  }

  if (found.length === 0) return months;

  const [startM, startY] = found[0];
  const [endM, endY] = found[found.length - 1];
  const rangeSize = (endY * 12 + endM) - (startY * 12 + startM);

  if (rangeSize < 0 || rangeSize > 12) {
    for (const [mi, yr] of found) months.add(`${MONTH_ORDER[mi]} ${yr}`);
    return months;
  }

  let curM = startM, curY = startY;
  while (curY < endY || (curY === endY && curM <= endM)) {
    months.add(`${MONTH_ORDER[curM]} ${curY}`);
    curM++;
    if (curM === 12) { curM = 0; curY++; }
  }
  return months;
}

// ─── Canonical institution — banks + card issuers ─────────────────────────
function canonicalInstitution(name) {
  const b = (name || '').trim().toLowerCase();
  if (b.includes('countryside'))                              return 'Countryside Bank';
  if (b.includes('hinsdale'))                                return 'Hinsdale Bank & Trust';
  if (b.includes('chase') || b.includes('jpmorgan'))         return 'Chase';
  if (b.includes('bank of america') || b.includes('bofa'))   return 'Bank of America';
  if (b.includes('wells fargo'))                             return 'Wells Fargo';
  if (b.includes('us bank') || b.includes('usbank'))         return 'US Bank';
  if (b.includes('amex') || b.includes('american express'))  return 'American Express';
  if (b.includes('citi') || b.includes('citibank'))          return 'Citi';
  if (b.includes('discover'))                                return 'Discover';
  if (b.includes('capital one') || b.includes('capitalone')) return 'Capital One';
  if (b.includes('synchrony'))                               return 'Synchrony';
  if (b.includes('barclays') || b.includes('barclaycard'))   return 'Barclays';
  return (name || 'Unknown').trim();
}

// ─── STEP 1: Read raw rows — file-level bank vs credit card detection ──────
// One Excel file = one type only (bank OR credit card, never mixed)
async function readExcelRows(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  let sheet = wb.getWorksheet('All Transactions');
  if (!sheet) sheet = wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in Excel file');

  const KNOWN_HEADERS = [
    // Bank headers
    'BANK NAME', 'BANK', 'ACCOUNT NUMBER', 'ACCOUNT NO', 'ACCOUNT#', 'ACCOUNT HOLDER',
    // Credit card headers
    'CARD ISSUER', 'ISSUER', 'CARD NUMBER', 'CARD NO', 'CARD#', 'CARD HOLDER', 'CARDHOLDER',
    // Shared
    'STATEMENT PERIOD', 'PERIOD', 'MONTH', 'YEAR',
  ];

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
    throw new Error('Could not find header row. Expected columns like Bank Name / Card Issuer, Account Number / Card Number, Statement Period.');
  }

  // ── Detect file type ONCE from headers ──
  // Credit card file: has card-specific headers but no bank headers
  const hasBankHeaders = !!(headerMap['BANK NAME'] || headerMap['BANK']);
  const hasCardHeaders = !!(headerMap['CARD ISSUER'] || headerMap['ISSUER'] || headerMap['CARD NUMBER'] || headerMap['CARD NO']);
  const fileType = (hasCardHeaders && !hasBankHeaders) ? 'credit_card' : 'bank';

  console.log(`Header at row ${headerRowNumber}, fileType=${fileType}:`, Object.keys(headerMap));

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

  const rawRows = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    let institution, accountNumber, holder;

    if (fileType === 'credit_card') {
      // Credit card file — prefer card headers
      institution   = get(row, ['CARD ISSUER', 'ISSUER', 'BANK NAME', 'BANK']);
      accountNumber = get(row, ['CARD NUMBER', 'CARD NO', 'CARD#', 'ACCOUNT NUMBER', 'ACCOUNT NO']);
      holder        = get(row, ['CARD HOLDER', 'CARDHOLDER', 'ACCOUNT HOLDER']);
    } else {
      // Bank file — prefer bank headers
      institution   = get(row, ['BANK NAME', 'BANK', 'CARD ISSUER', 'ISSUER']);
      accountNumber = get(row, ['ACCOUNT NUMBER', 'ACCOUNT NO', 'ACCOUNT#', 'CARD NUMBER', 'CARD NO']);
      holder        = get(row, ['ACCOUNT HOLDER', 'CARD HOLDER', 'CARDHOLDER']);
    }

    const period = get(row, ['STATEMENT PERIOD', 'PERIOD']);

    if (!accountNumber && !institution) return;

    // Every row in this file gets the same fileType
    rawRows.push({ type: fileType, institution, accountNumber, holder, period });
  });

  console.log(`readExcelRows: ${rawRows.length} rows, type=${fileType}`);
  return rawRows;
}

// ─── STEP 2A: Group rows by accountNumber + institution + type ─────────────
function groupRows(rawRows) {
  const groups = {};
  const insertionOrder = [];

  for (const r of rawRows) {
    if (!r.accountNumber && !r.institution) continue;
    const instKey = canonicalInstitution(r.institution);
    const key = `${r.type}__${r.accountNumber || 'Unknown'}__${instKey}`;

    if (!groups[key]) {
      groups[key] = {
        type: r.type,
        accountNumber: r.accountNumber || 'Unknown',
        institution: instKey,
        holder: 'Unknown',
        monthSet: new Set(),
        periodsSeen: new Set(),
      };
      insertionOrder.push(key);
    }

    const g = groups[key];
    if (r.holder && g.holder === 'Unknown') g.holder = r.holder;

    if (r.period && !g.periodsSeen.has(r.period)) {
      g.periodsSeen.add(r.period);
      parsePeriodToMonths(r.period).forEach(m => g.monthSet.add(m));
    }
  }

  return insertionOrder.map(key => {
    const g = groups[key];
    return {
      type: g.type,
      rawAccount: g.accountNumber,
      rawInstitution: g.institution,
      holder: g.holder,
      months: Array.from(g.monthSet),
    };
  });
}

// ─── STEP 2B: AI normalizes holder + institution ───────────────────────────
async function normalizeWithAI(rawRows, fileName) {
  const groups = groupRows(rawRows);
  console.log(`groupRows: ${groups.length} entries in ${fileName}`);
  if (groups.length === 0) return [];

  const payload = groups.map((g, i) => ({
    idx: i,
    type: g.type,
    rawAccount: g.rawAccount,
    rawInstitution: g.rawInstitution,
    holder: g.holder,
  }));

  try {
    const prompt = `You are given a list of financial accounts. Each entry is either a bank account (type="bank") or a credit card (type="credit_card").
Normalize the account/card number, holder name, and institution name.
Return ONLY a valid JSON array, nothing else. No markdown, no explanation.

Return format (same order, same idx):
[{ "idx": 0, "type": "bank", "accountNumber": "****3000", "holder": "2034 Superior LLC", "institution": "Countryside Bank" }]

Rules:
- accountNumber: last 4 digits only, with **** prefix. "5-13009" → "****3009", "XXXX3000" → "****3000", "3000" → "****3000". Strip all non-digit chars first, then take last 4.
- holder: Title Case. Fix typos. "2034 SUPERIOR LLC" → "2034 Superior LLC", "RDLD BUILD LLC" → "RDLD Build LLC"
- institution:
    - type=bank: official bank name. "HINSDALE BK" → "Hinsdale Bank & Trust", "COUNTRYSIDE" → "Countryside Bank". Keep Countryside and Hinsdale SEPARATE — do NOT merge them.
    - type=credit_card: official card issuer. "AMEX" → "American Express", "CITI" → "Citi", "CHASE CC" → "Chase"
- type: copy exactly as given, do NOT change
- Return exactly ${payload.length} entries, same order, do NOT merge or drop any
- Missing field → "Unknown"

Input: ${JSON.stringify(payload)}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const normalized = JSON.parse(clean);

    return normalized.map(n => ({
      type: n.type,
      accountNumber: n.accountNumber,
      holder: n.holder,
      institution: n.institution,
      months: groups[n.idx]?.months || [],
    }));

  } catch (err) {
    console.log('AI normalization failed for', fileName, ':', err.message);
    // Pure JS fallback — no AI needed
    return groups.map(g => ({
      type: g.type,
      accountNumber: g.rawAccount
        ? `****${String(g.rawAccount).replace(/\D/g, '').slice(-4)}`
        : 'Unknown',
      holder: g.holder || 'Unknown',
      institution: canonicalInstitution(g.rawInstitution),
      months: g.months,
    }));
  }
}

// ─── Helper: fill every month between first and last ──────────────────────
function getFullRange(monthSet) {
  if (monthSet.size === 0) return [];
  const sorted = Array.from(monthSet).sort((a, b) => {
    const [ma, ya] = a.split(' ');
    const [mb, yb] = b.split(' ');
    if (ya !== yb) return parseInt(ya) - parseInt(yb);
    return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
  });
  const [firstM, firstY] = sorted[0].split(' ');
  const [lastM, lastY]   = sorted[sorted.length - 1].split(' ');
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

// ─── MAIN POST HANDLER ────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('excels');
    const excelFiles = files.filter(
      f => (f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')) && f.size > 0
    );

    console.log('Tracker - files received:', excelFiles.length);
    if (excelFiles.length === 0) {
      return Response.json({ error: 'No Excel files found!' }, { status: 400 });
    }

    // entryMap keyed by type + accountNumber + institution
    const entryMap = {};
    const entryMapOrder = [];
    const errors = [];

    await Promise.all(
      excelFiles.map(async (file) => {
        try {
          const arrayBuffer = await file.arrayBuffer();
          console.log('Reading:', file.name);
          const rawRows = await readExcelRows(arrayBuffer);

          if (rawRows.length === 0) {
            errors.push({ file: file.name, error: 'No data rows found' });
            return;
          }

          const entries = await normalizeWithAI(rawRows, file.name);
          console.log('Entries from', file.name, ':', entries.length);

          for (const info of entries) {
            const key = `${info.type}__${info.accountNumber}__${info.institution}`;

            if (!entryMap[key]) {
              entryMap[key] = {
                type: info.type,
                accountNumber: info.accountNumber,
                holder: info.holder,
                institution: info.institution,
                files: new Set(),
                months: new Set(),
              };
              entryMapOrder.push(key);
            }
            entryMap[key].files.add(file.name);
            info.months.forEach(m => entryMap[key].months.add(m));
          }

        } catch (err) {
          console.log('Failed:', file.name, err.message);
          errors.push({ file: file.name, error: err.message });
        }
      })
    );

    if (Object.keys(entryMap).length === 0) {
      return Response.json({ error: 'No accounts/cards could be extracted.' }, { status: 400 });
    }

    // ─── Build complete timeline ─────────────────────────────────────────
    const allMonthSet = new Set();
    Object.values(entryMap).forEach(v => {
      v.months.forEach(m => allMonthSet.add(m));
      getFullRange(v.months).forEach(m => allMonthSet.add(m));
    });

    const sortedMonths = Array.from(allMonthSet).sort((a, b) => {
      const [ma, ya] = a.split(' ');
      const [mb, yb] = b.split(' ');
      if (ya !== yb) return parseInt(ya) - parseInt(yb);
      return MONTH_ORDER.indexOf(ma) - MONTH_ORDER.indexOf(mb);
    });

    const yearGroups = {};
    sortedMonths.forEach(m => {
      const yr = m.split(' ')[1];
      if (!yearGroups[yr]) yearGroups[yr] = [];
      yearGroups[yr].push(m);
    });

    // ─── Build output Excel ──────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    const tracker = wb.addWorksheet('Tracker');

    const fixedCols = ['Sno', 'Type', 'Account / Card No.', 'Holder', 'Institution', 'File Name'];
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

    // ── Data rows — bank first, then credit card; within each by account ──
    const sortedKeys = entryMapOrder.slice().sort((a, b) => {
      const ia = entryMap[a], ib = entryMap[b];
      // Banks before credit cards
      if (ia.type !== ib.type) return ia.type === 'bank' ? -1 : 1;
      if (ia.accountNumber !== ib.accountNumber) return ia.accountNumber.localeCompare(ib.accountNumber);
      const earliest = (info) => {
        const ms = Array.from(info.months);
        if (!ms.length) return '9999-99';
        return ms.map(m => {
          const [mo, yr] = m.split(' ');
          return `${yr}-${String(MONTH_ORDER.indexOf(mo) + 1).padStart(2, '0')}`;
        }).sort()[0];
      };
      return earliest(ia).localeCompare(earliest(ib));
    });

    sortedKeys.forEach((key, idx) => {
      const info = entryMap[key];
      const isEven = idx % 2 === 0;
      const rowBg = isEven ? 'FFDCE6F1' : 'FFFFFFFF';

      const fullRange = getFullRange(info.months);
      const gapSet = new Set(fullRange.filter(m => !info.months.has(m)));

      const typeLabel = info.type === 'credit_card' ? 'Credit Card' : 'Bank';

      const rowData = [
        idx + 1,
        typeLabel,
        info.accountNumber,
        info.holder,
        info.institution,
        Array.from(info.files).join(', '),
      ];
      sortedMonths.forEach(m => {
        if (info.months.has(m))  rowData.push('✓');
        else if (gapSet.has(m))  rowData.push('?');
        else                     rowData.push('');
      });

      const row = tracker.addRow(rowData);
      row.height = 18;

      fixedCols.forEach((_, i) => {
        const cell = row.getCell(i + 1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };
        cell.alignment = { vertical: 'middle' };
      });

      // Type cell — navy for Bank, purple for Credit Card
      const typeCell = row.getCell(2);
      typeCell.font = {
        bold: true,
        color: { argb: info.type === 'credit_card' ? 'FF6A0DAD' : 'FF002060' },
      };
      typeCell.alignment = { horizontal: 'center', vertical: 'middle' };

      sortedMonths.forEach((m, i) => {
        const cell = row.getCell(fixedCols.length + 1 + i);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };

        if (info.months.has(m)) {
          cell.value = '✓';
          cell.font = { bold: true, color: { argb: 'FF1B5E20' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
        } else if (gapSet.has(m)) {
          cell.value = '?';
          cell.font = { bold: true, color: { argb: 'FFC62828' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
        } else {
          cell.value = '';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        }
      });
    });

    // ── Column widths & freeze ──
    tracker.getColumn(1).width = 6;   // Sno
    tracker.getColumn(2).width = 13;  // Type
    tracker.getColumn(3).width = 18;  // Account/Card No
    tracker.getColumn(4).width = 26;  // Holder
    tracker.getColumn(5).width = 24;  // Institution
    tracker.getColumn(6).width = 38;  // File Name
    for (let i = fixedCols.length + 1; i <= fixedCols.length + sortedMonths.length; i++) {
      tracker.getColumn(i).width = 7;
    }
    tracker.views = [{ state: 'frozen', xSplit: 6, ySplit: 2 }];

    // ── Legend ──
    tracker.addRow([]);
    const legendRow = tracker.addRow([]);
    legendRow.height = 20;

    legendRow.getCell(2).value = 'LEGEND:';
    legendRow.getCell(2).font = { bold: true, size: 10 };

    const lCheck = legendRow.getCell(3);
    lCheck.value = '✓';
    lCheck.font = { bold: true, color: { argb: 'FF1B5E20' }, size: 11 };
    lCheck.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    lCheck.alignment = { horizontal: 'center', vertical: 'middle' };
    lCheck.border = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };

    legendRow.getCell(4).value = '= Statement present';
    legendRow.getCell(4).font = { size: 10, color: { argb: 'FF1B5E20' } };

    const lQ = legendRow.getCell(5);
    lQ.value = '?';
    lQ.font = { bold: true, color: { argb: 'FFC62828' }, size: 11 };
    lQ.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
    lQ.alignment = { horizontal: 'center', vertical: 'middle' };
    lQ.border = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };

    legendRow.getCell(6).value = '= MISSING — request from opposition';
    legendRow.getCell(6).font = { bold: true, size: 10, color: { argb: 'FFC62828' } };

    const excelBuffer = await wb.xlsx.writeBuffer();
    const excelBase64 = Buffer.from(excelBuffer).toString('base64');

    // Count gaps + split totals by type
    let totalGaps = 0;
    Object.values(entryMap).forEach(info => {
      totalGaps += getFullRange(info.months).filter(m => !info.months.has(m)).length;
    });

    const totalBankAccounts = Object.values(entryMap).filter(v => v.type === 'bank').length;
    const totalCreditCards  = Object.values(entryMap).filter(v => v.type === 'credit_card').length;

    return Response.json({
      success: true,
      totalAccounts: Object.keys(entryMap).length,
      totalBankAccounts,
      totalCreditCards,
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
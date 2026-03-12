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
  const startTotal = startY * 12 + startM;
  const endTotal   = endY * 12 + endM;
  const rangeSize  = endTotal - startTotal;

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

// ─── CHANGE 1: canonicalBank now also handles card issuers ────────────────
function canonicalBank(bankName) {
  const b = (bankName || '').trim().toLowerCase();
  // Banks
  if (b.includes('countryside'))                              return 'Countryside Bank';
  if (b.includes('hinsdale'))                                return 'Hinsdale Bank & Trust';
  if (b.includes('chase') || b.includes('jpmorgan'))         return 'Chase';
  if (b.includes('bank of america') || b.includes('bofa'))   return 'Bank of America';
  if (b.includes('wells fargo'))                             return 'Wells Fargo';
  if (b.includes('us bank') || b.includes('usbank'))         return 'US Bank';
  // Card issuers — NEW
  if (b.includes('amex') || b.includes('american express'))  return 'American Express';
  if (b.includes('citi') || b.includes('citibank'))          return 'Citi';
  if (b.includes('discover'))                                return 'Discover';
  if (b.includes('capital one') || b.includes('capitalone')) return 'Capital One';
  if (b.includes('synchrony'))                               return 'Synchrony';
  if (b.includes('barclays') || b.includes('barclaycard'))   return 'Barclays';
  return (bankName || 'Unknown').trim();
}

// ─── CHANGE 2: readExcelRows now reads card headers too ───────────────────
async function readExcelRows(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  let sheet = wb.getWorksheet('All Transactions');
  if (!sheet) sheet = wb.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in Excel file');

  const KNOWN_HEADERS = [
    'MONTH', 'YEAR', 'BANK NAME', 'BANK', 'ACCOUNT NUMBER', 'ACCOUNT NO', 'ACCOUNT HOLDER',
    'DATE', 'DESCRIPTION', 'DEBIT', 'CREDIT', 'STATEMENT PERIOD',
    // NEW — credit card headers
    'CARD ISSUER', 'ISSUER', 'CARD NUMBER', 'CARD NO', 'CARD#', 'CARD HOLDER', 'CARDHOLDER',
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
    throw new Error('Could not find header row. Make sure the Excel has columns like Bank Name / Card Issuer, Account Number / Card Number, Account Holder.');
  }

  // NEW — detect file type once, apply to all rows
  const hasBankHeaders = !!(headerMap['BANK NAME'] || headerMap['BANK']);
  const hasCardHeaders = !!(headerMap['CARD ISSUER'] || headerMap['ISSUER'] || headerMap['CARD NUMBER'] || headerMap['CARD NO']);
  const fileType = (hasCardHeaders && !hasBankHeaders) ? 'credit_card' : 'bank';

  console.log(`Header found at row ${headerRowNumber}, fileType=${fileType}:`, Object.keys(headerMap));

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

    let bank, account, holder;

    // NEW — read from correct columns based on file type
    if (fileType === 'credit_card') {
      bank    = get(row, ['CARD ISSUER', 'ISSUER']);
      account = get(row, ['CARD NUMBER', 'CARD NO', 'CARD#']);
      holder  = get(row, ['CARD HOLDER', 'CARDHOLDER']);
    } else {
      bank    = get(row, ['BANK NAME', 'BANK']);
      account = get(row, ['ACCOUNT NUMBER', 'ACCOUNT NO', 'ACCOUNT#']);
      holder  = get(row, ['ACCOUNT HOLDER', 'HOLDER', 'ACCOUNT HOLDER NAME']);
    }

    const period = get(row, ['STATEMENT PERIOD']);
    const month  = get(row, ['MONTH']);
    const year   = get(row, ['YEAR']);

    if (!account && !bank) return;
    rawRows.push({ bank, account, holder, period, month, year });
  });

  console.log(`readExcelRows: headerRow=${headerRowNumber}, dataRows=${rawRows.length}`);
  return rawRows;
}

// ─── groupRowsByAccount — exactly same as original ────────────────────────
function groupRowsByAccount(rawRows) {
  const groups = {};
  const insertionOrder = [];
  const MO_LIST = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  for (const r of rawRows) {
    if (!r.account) continue;
    const bankKey = canonicalBank(r.bank);
    const acctKey = `${r.account}__${bankKey}`;

    if (!groups[acctKey]) {
      groups[acctKey] = {
        account: r.account,
        bank: bankKey,
        holder: 'Unknown',
        monthSet: new Set(),
        periodsSeen: new Set(),
      };
      insertionOrder.push(acctKey);
    }

    const g = groups[acctKey];
    if (r.holder && g.holder === 'Unknown') g.holder = r.holder;

    if (r.period && !g.periodsSeen.has(r.period)) {
      g.periodsSeen.add(r.period);
      parsePeriodToMonths(r.period).forEach(m => g.monthSet.add(m));
    }
  }

  const firstMonth = (g) => {
    const ms = Array.from(g.monthSet);
    if (!ms.length) return '9999-99';
    return ms.map(m => {
      const parts = m.split(' ');
      return `${parts[1]}-${String(MO_LIST.indexOf(parts[0])+1).padStart(2,'0')}`;
    }).sort()[0];
  };

  insertionOrder.sort((a, b) => {
    const ga = groups[a], gb = groups[b];
    if (ga.account !== gb.account) return ga.account.localeCompare(gb.account);
    return firstMonth(ga).localeCompare(firstMonth(gb));
  });

  return insertionOrder.map(key => {
    const g = groups[key];
    return { rawAccount: g.account, rawBank: g.bank, holder: g.holder, months: Array.from(g.monthSet) };
  });
}

// ─── CHANGE 3: AI prompt now handles both bank + card issuer normalization ─
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
    const prompt = `You are given a list of financial accounts — could be bank accounts or credit cards.
Normalize the account/card number, holder name, and bank/issuer name.
Return ONLY a valid JSON array, nothing else. No markdown, no explanation.

Return format (one entry per input, same order, same idx):
[{ "idx": 0, "accountNumber": "****3000", "accountHolder": "2034 Superior LLC", "bankName": "Countryside Bank" }]

Rules:
- accountNumber: last 4 digits with **** prefix. Strip all non-digit chars first. "5-13009" → "****3009", "XXXX3000" → "****3000", "3000" → "****3000"
- accountHolder: Title Case. Fix typos. "2034 SUPERIOR LLC" → "2034 Superior LLC", "RDLD BUILD LLC" → "RDLD Build LLC"
- bankName: clean official name.
    - Banks: "HINSDALE BK" → "Hinsdale Bank & Trust", "COUNTRYSIDE" → "Countryside Bank". Keep Countryside and Hinsdale SEPARATE — do NOT merge them.
    - Card issuers: "AMEX" → "American Express", "CITI" → "Citi", "CHASE CC" → "Chase"
    - If already clean, copy exactly as given — do NOT change or invent
- Return exactly ${namePayload.length} entries, same order, DO NOT merge or drop any
- Missing field → "Unknown"

Input: ${JSON.stringify(namePayload)}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const normalized = JSON.parse(clean);

    return normalized.map(n => ({
      accountNumber: n.accountNumber,
      accountHolder: n.accountHolder,
      bankName: n.bankName,
      months: accountGroups[n.idx]?.months || [],
    }));

  } catch (err) {
    console.log('AI normalization failed for', fileName, ':', err.message);
    return accountGroups.map(g => ({
      accountNumber: g.rawAccount ? `****${String(g.rawAccount).replace(/\D/g, '').slice(-4)}` : 'Unknown',
      accountHolder: g.holder || 'Unknown',
      bankName: g.rawBank || 'Unknown',
      months: g.months,
    }));
  }
}

// ─── getFullRange — exactly same as original ──────────────────────────────
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

// ─── MAIN POST HANDLER — exactly same as original ─────────────────────────
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
    const accountMapOrder = [];
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
            const key = `${info.accountNumber}__${info.bankName}`;

            if (!accountMap[key]) {
              accountMap[key] = {
                account: info.accountNumber,
                holder: info.accountHolder,
                bank: info.bankName,
                files: new Set(),
                months: new Set(),
              };
              accountMapOrder.push(key);
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

    const allMonthSet = new Set();
    Object.values(accountMap).forEach(v => {
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

    // ─── Build output Excel — exactly same as original ───────────────────
    const wb = new ExcelJS.Workbook();
    const tracker = wb.addWorksheet('Tracker');
    const fixedCols = ['Sno', 'Account Number', 'Account Holder', 'Bank', 'File Name'];
    const thinWhite = { style: 'thin', color: { argb: 'FFffffff' } };
    const thinGray  = { style: 'thin', color: { argb: 'FFcccccc' } };

    // Row 1: Year headers
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

    // Row 2: Column headers
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

    // Data rows
    const sortedAccountKeys = accountMapOrder.slice().sort((a, b) => {
      const ia = accountMap[a], ib = accountMap[b];
      if (ia.account !== ib.account) return ia.account.localeCompare(ib.account);
      const earliest = (info) => {
        const ms = Array.from(info.months);
        if (!ms.length) return '9999-99';
        return ms.map(m => {
          const [mo, yr] = m.split(' ');
          return `${yr}-${String(MONTH_ORDER.indexOf(mo)+1).padStart(2,'0')}`;
        }).sort()[0];
      };
      return earliest(ia).localeCompare(earliest(ib));
    });

    sortedAccountKeys.forEach((key, idx) => {
      const info = accountMap[key];
      const isEven = idx % 2 === 0;
      const rowBg = isEven ? 'FFDCE6F1' : 'FFFFFFFF';

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
        else if (gapSet.has(m)) rowData.push('?');
        else rowData.push('');
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

    tracker.getColumn(1).width = 6;
    tracker.getColumn(2).width = 18;
    tracker.getColumn(3).width = 24;
    tracker.getColumn(4).width = 24;
    tracker.getColumn(5).width = 38;
    for (let i = fixedCols.length + 1; i <= fixedCols.length + sortedMonths.length; i++) {
      tracker.getColumn(i).width = 7;
    }
    tracker.views = [{ state: 'frozen', xSplit: 5, ySplit: 2 }];

    tracker.addRow([]);
    const legendRow = tracker.addRow([]);
    legendRow.height = 20;

    const l1 = legendRow.getCell(2);
    l1.value = 'LEGEND:';
    l1.font = { bold: true, size: 10 };

    const l2 = legendRow.getCell(3);
    l2.value = '✓';
    l2.font = { bold: true, color: { argb: 'FF1B5E20' }, size: 11 };
    l2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    l2.alignment = { horizontal: 'center', vertical: 'middle' };
    l2.border = { top: thinGray, left: thinGray, bottom: thinGray, right: thinGray };

    const l3 = legendRow.getCell(4);
    l3.value = '= Statement present';
    l3.font = { size: 10, color: { argb: 'FF1B5E20' } };

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
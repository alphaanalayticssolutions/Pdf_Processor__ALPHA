import ExcelJS from 'exceljs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractBankInfoWithAI(base64PDF, fileName) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64PDF,
              },
            },
            {
              type: 'text',
              text: `Extract the following from this bank statement PDF and respond ONLY with valid JSON, nothing else:
{
  "accountNumber": "last 4 digits masked like ****1234, or full if not maskable",
  "accountHolder": "full name of account holder",
  "bankName": "name of the bank",
  "months": ["Jan 2022", "Feb 2022"] 
}

For months: include every month this statement covers (from transaction dates or statement period). Format each as "MMM YYYY" e.g. "Jan 2022".
If any field is not found, use "Unknown".`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].text.trim();
    // Strip markdown code fences if present
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.log('AI extraction failed for', fileName, ':', err.message);
    return {
      accountNumber: 'Unknown',
      accountHolder: 'Unknown',
      bankName: 'Unknown',
      months: [],
    };
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('pdfs');
    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf') && f.size > 0);

    console.log('Tracker - PDF files received:', pdfFiles.length);

    if (pdfFiles.length === 0) {
      return Response.json({ error: 'No PDF files found!' }, { status: 400 });
    }

    const accountMap = {};
    const errors = [];
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (const file of pdfFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64PDF = Buffer.from(arrayBuffer).toString('base64');

        console.log('Processing with AI:', file.name);
        const info = await extractBankInfoWithAI(base64PDF, file.name);

        console.log('Extracted:', info.accountNumber, '|', info.bankName, '| Months:', info.months.length);

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
        info.months.forEach(m => accountMap[key].months.add(m));

      } catch (err) {
        console.log('Failed:', file.name, err.message);
        errors.push({ file: file.name, error: err.message });
      }
    }

    if (Object.keys(accountMap).length === 0) {
      return Response.json({ error: 'No accounts could be extracted from PDFs.' }, { status: 400 });
    }

    // Collect and sort all months across all accounts
    const allMonthSet = new Set();
    Object.values(accountMap).forEach(v => v.months.forEach(m => allMonthSet.add(m)));

    const sortedMonths = Array.from(allMonthSet).sort((a, b) => {
      const [ma, ya] = a.split(' ');
      const [mb, yb] = b.split(' ');
      if (yb !== ya) return parseInt(yb) - parseInt(ya); // newest year first
      return monthOrder.indexOf(mb) - monthOrder.indexOf(ma); // Dec → Jan within year
    });

    // Group months by year
    const yearGroups = {};
    sortedMonths.forEach(m => {
      const yr = m.split(' ')[1];
      if (!yearGroups[yr]) yearGroups[yr] = [];
      yearGroups[yr].push(m);
    });

    // Build Excel
    const wb = new ExcelJS.Workbook();
    const tracker = wb.addWorksheet('Tracker');
    const fixedCols = ['Sno', 'Account Number', 'Account Holder', 'Bank', 'File Name'];

    // Row 1: Year headers
    const yearRow = tracker.addRow([]);
    fixedCols.forEach((_, i) => {
      yearRow.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2444' } };
    });

    let colOffset = fixedCols.length + 1;
    Object.entries(yearGroups).forEach(([year, months]) => {
      const cell = yearRow.getCell(colOffset);
      cell.value = parseInt(year);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c6e' } };
      cell.alignment = { horizontal: 'center' };
      if (months.length > 1) tracker.mergeCells(1, colOffset, 1, colOffset + months.length - 1);
      colOffset += months.length;
    });

    // Row 2: Column headers
    const headerRow = tracker.addRow([]);
    fixedCols.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2444' } };
      cell.alignment = { horizontal: 'center' };
    });
    sortedMonths.forEach((m, i) => {
      const cell = headerRow.getCell(fixedCols.length + 1 + i);
      cell.value = m.split(' ')[0]; // just "Jan", "Feb" etc
      cell.font = { bold: true, color: { argb: 'FF333333' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Data rows
    Object.entries(accountMap).forEach(([key, info], idx) => {
      const rowData = [
        idx + 1,
        info.account,
        info.holder,
        info.bank,
        Array.from(info.files).join(', '),
      ];
      sortedMonths.forEach(m => rowData.push(info.months.has(m) ? 'X' : ''));

      const row = tracker.addRow(rowData);

      // Style X cells
      sortedMonths.forEach((m, i) => {
        const cell = row.getCell(fixedCols.length + 1 + i);
        if (info.months.has(m)) {
          cell.font = { bold: true, color: { argb: 'FF0F2444' } };
          cell.alignment = { horizontal: 'center' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFe8f0fe' } };
        }
      });

      // Alternating row bg for fixed cols
      if (idx % 2 === 0) {
        fixedCols.forEach((_, i) => {
          tracker.getRow(idx + 3).getCell(i + 1).fill = {
            type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf7f8fc' },
          };
        });
      }
    });

    // Column widths
    tracker.getColumn(1).width = 6;
    tracker.getColumn(2).width = 16;
    tracker.getColumn(3).width = 22;
    tracker.getColumn(4).width = 20;
    tracker.getColumn(5).width = 35;
    for (let i = fixedCols.length + 1; i <= fixedCols.length + sortedMonths.length; i++) {
      tracker.getColumn(i).width = 8;
    }

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
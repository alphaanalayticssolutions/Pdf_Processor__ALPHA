import Anthropic from '@anthropic-ai/sdk';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── QC DATA BUILDER ──────────────────────────────────────────────────────────
function buildInvoiceQcData(extractedInvoices, totalFiles, successCount, errorCount) {
  return {
    invoices: (extractedInvoices || []).map((inv) => ({
      file:          inv.fileName        || null,
      invoiceNumber: inv['Invoice Number'] || inv.invoiceNumber || null,
      invoiceDate:   inv['Invoice Date']   || inv.invoiceDate   || null,
      vendorName:    inv['Vendor Name']    || inv.vendorName    || null,
      customerName:  inv['Customer Name']  || inv.customerName  || null,
      // Parse numeric amounts — Claude returns them as strings
      subtotal: parseFloat(String(inv['Subtotal'] || inv.subtotal || '').replace(/[$,]/g, '')) || null,
      tax:      parseFloat(String(inv['Tax']      || inv.tax      || '').replace(/[$,]/g, '')) || null,
      total:    parseFloat(String(inv['Total Amount'] || inv['Amount'] || inv.total || '').replace(/[$,]/g, '')) || null,
    })),
    summary: {
      totalFiles,
      successCount,
      errorCount,
    },
  };
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('pdfs');
    const fieldsRaw = formData.get('fields') || '';

    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) return Response.json({ error: 'No PDF files found!' }, { status: 400 });
    if (!fieldsRaw.trim()) return Response.json({ error: 'Please specify fields to extract!' }, { status: 400 });

    const fields = fieldsRaw.split(',').map(f => f.trim()).filter(Boolean);

    const results      = [];
    const errors       = [];
    const invoicesForQC = []; // track for qcData

    for (const file of pdfFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64PDF = Buffer.from(arrayBuffer).toString('base64');

        const claudeResponse = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64PDF },
              },
              {
                type: 'text',
                text: `Extract the following fields from this invoice document:
${fields.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Reply ONLY with a JSON object where keys are the field names and values are the extracted data.
If a field is not found, use null.
Do not include any explanation — only the JSON object.

Example format:
{
  "Invoice Date": "01/01/2024",
  "Amount": "5000",
  "Customer": "ABC Ltd"
}`
              }
            ]
          }]
        });

        let extracted = {};
        try {
          const raw = claudeResponse.content[0].text.trim();
          const cleaned = raw.replace(/```json|```/g, '').trim();
          extracted = JSON.parse(cleaned);
        } catch {
          fields.forEach(f => extracted[f] = 'Extraction failed');
        }

        results.push({ fileName: file.name, ...extracted, status: 'Success' });
        // Store for qcData
        invoicesForQC.push({ fileName: file.name, ...extracted });

      } catch (err) {
        errors.push(file.name);
        const row = { fileName: file.name, status: 'Failed' };
        fields.forEach(f => row[f] = 'Error');
        results.push(row);
      }
    }

    const successCount = results.filter(r => r.status === 'Success').length;
    const errorCount   = errors.length;

    // ── Build Excel ──
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Extracted Data');

    const headers = ['File Name', ...fields, 'Status'];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 11 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C6E' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    headerRow.height = 25;

    results.forEach((result, idx) => {
      const rowData = [result.fileName, ...fields.map(f => result[f] ?? ''), result.status];
      const row = sheet.addRow(rowData);
      const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FF';
      row.eachCell(cell => {
        cell.font      = { name: 'Arial', size: 10 };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        cell.border    = { top: { style: 'thin', color: { argb: 'FFEEEEEE' } }, left: { style: 'thin', color: { argb: 'FFEEEEEE' } }, bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } }, right: { style: 'thin', color: { argb: 'FFEEEEEE' } } };
        if (cell.value === 'Failed' || cell.value === 'Error') {
          cell.font = { name: 'Arial', size: 10, color: { argb: 'FFC53030' }, bold: true };
        }
        if (cell.value === 'Success') {
          cell.font = { name: 'Arial', size: 10, color: { argb: 'FF276749' }, bold: true };
        }
      });
      row.height = 20;
    });

    sheet.columns.forEach((col, i) => { col.width = i === 0 ? 30 : 22; });

    const buffer = await workbook.xlsx.writeBuffer();
    const excelBase64 = Buffer.from(buffer).toString('base64');

    return Response.json({
      success:      true,
      totalFiles:   pdfFiles.length,
      successCount,
      errorCount,
      fields,
      excelFile:    excelBase64,
      // ── QC DATA ──
      qcData: buildInvoiceQcData(invoicesForQC, pdfFiles.length, successCount, errorCount),
    });

  } catch (err) {
    console.log('Extract invoice error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
import Anthropic from '@anthropic-ai/sdk';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('pdfs');
    const fieldsRaw = formData.get('fields') || '';

    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) return Response.json({ error: 'No PDF files found!' }, { status: 400 });
    if (!fieldsRaw.trim()) return Response.json({ error: 'Please specify fields to extract!' }, { status: 400 });

    // Parse fields from comma separated string
    const fields = fieldsRaw.split(',').map(f => f.trim()).filter(Boolean);

    const results = [];
    const errors = [];

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
          // If JSON parse fails, mark all fields as extraction failed
          fields.forEach(f => extracted[f] = 'Extraction failed');
        }

        results.push({
          fileName: file.name,
          ...extracted,
          status: 'Success'
        });

      } catch (err) {
        errors.push(file.name);
        const row = { fileName: file.name, status: 'Failed' };
        fields.forEach(f => row[f] = 'Error');
        results.push(row);
      }
    }

    // Build Excel file
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Extracted Data');

    // Header row
    const headers = ['File Name', ...fields, 'Status'];
    sheet.addRow(headers);

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C6E' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    headerRow.height = 25;

    // Data rows
    results.forEach((result, idx) => {
      const rowData = [result.fileName, ...fields.map(f => result[f] ?? ''), result.status];
      const row = sheet.addRow(rowData);
      const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FF';
      row.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFEEEEEE' } },
          left: { style: 'thin', color: { argb: 'FFEEEEEE' } },
          bottom: { style: 'thin', color: { argb: 'FFEEEEEE' } },
          right: { style: 'thin', color: { argb: 'FFEEEEEE' } }
        };
        // Color status cell
        if (cell.value === 'Failed' || cell.value === 'Error') {
          cell.font = { name: 'Arial', size: 10, color: { argb: 'FFC53030' }, bold: true };
        }
        if (cell.value === 'Success') {
          cell.font = { name: 'Arial', size: 10, color: { argb: 'FF276749' }, bold: true };
        }
      });
      row.height = 20;
    });

    // Auto column widths
    sheet.columns.forEach((col, i) => {
      col.width = i === 0 ? 30 : 22;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const excelBase64 = Buffer.from(buffer).toString('base64');

    return Response.json({
      success: true,
      totalFiles: pdfFiles.length,
      successCount: results.filter(r => r.status === 'Success').length,
      errorCount: errors.length,
      fields,
      excelFile: excelBase64,
    });

  } catch (err) {
    console.log('Extract invoice error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
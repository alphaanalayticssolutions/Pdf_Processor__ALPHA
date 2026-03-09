import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('pdf');
    const docType = formData.get('docType') || 'auto';
    const splitMode = formData.get('splitMode') || 'ai';
    const splitPagesRaw = formData.get('splitPages') || '';
    const splitNamesRaw = formData.get('splitNames') || '';

    if (!file) return Response.json({ error: 'No PDF file found!' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const totalPages = pdfDoc.getPageCount();
    const base64PDF = Buffer.from(arrayBuffer).toString('base64');

    let splitPoints = [];
    let splitNames = [];
    let aiExplanation = '';

    if (splitMode === 'ai') {

      const docTypeInstruction =
        docType === 'auto'
          ? 'Automatically detect the document type (bank statement, invoice, tax filing, or other legal document).'
          : `The document type is: ${docType}.`;

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
              text: `I have uploaded a PDF file that needs to be split into multiple files based on its natural document boundaries.

${docTypeInstruction}
Total pages in this PDF: ${totalPages}

Your task:
- Carefully analyze the PDF to identify where one document or section ends and the next begins.
- For bank statements: split where one month/account ends and the next begins.
- For invoices: split where one invoice ends and the next begins.
- For tax filings: split by section, quarter, or filing type.
- For other legal documents: split by logical document boundaries (e.g., separate agreements, exhibits, or filings).

Each split file should be named descriptively based on its content (e.g., "April_2024", "Invoice_001", "Q1_Tax_2023", "Exhibit_A").

Reply in EXACTLY this format with no extra text:
SPLIT_PAGES: 4,7,9
NAMES: April_2024,May_2024,June_2024
EXPLANATION: Brief reason for these split points

Rules:
- SPLIT_PAGES = the LAST page number of each section (do NOT include ${totalPages} as it is always the last page)
- If the entire PDF is one document with no splits needed, reply: SPLIT_PAGES: none
- NAMES = one name per section including the final section (total names = total split sections)
- Names should be meaningful, use underscores instead of spaces
- No spaces after commas`
            }
          ]
        }]
      });

      const reply = claudeResponse.content[0].text.trim();
      console.log('Claude split reply:', reply);

      const pagesMatch = reply.match(/SPLIT_PAGES:\s*([^\n]+)/);
      const namesMatch = reply.match(/NAMES:\s*([^\n]+)/);
      const explMatch = reply.match(/EXPLANATION:\s*([^\n]+)/);

      if (pagesMatch && pagesMatch[1].trim() !== 'none') {
        splitPoints = pagesMatch[1].split(',').map(p => parseInt(p.trim())).filter(n => !isNaN(n));
      }
      if (namesMatch) {
        splitNames = namesMatch[1].split(',').map(n => n.trim());
      }
      if (explMatch) {
        aiExplanation = explMatch[1].trim();
      }

    } else {
      // Manual mode
      if (splitPagesRaw.trim()) {
        splitPoints = splitPagesRaw.split(',').map(p => parseInt(p.trim())).filter(n => !isNaN(n));
      }
      if (splitNamesRaw.trim()) {
        splitNames = splitNamesRaw.split(',').map(n => n.trim());
      }

      // If names not provided — ask Claude to name them
      if (splitNames.length === 0 && splitPoints.length > 0) {
        const nameResponse = await client.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64PDF },
              },
              {
                type: 'text',
                text: `I have uploaded a PDF that is being split at the following page boundaries: ${splitPoints.join(', ')}. Total pages: ${totalPages}.

Please provide a meaningful file name for each section based on the content visible on those pages.
Names should be descriptive (e.g., April_2024, Invoice_001, Exhibit_A) and use underscores instead of spaces.

Reply with ONLY comma-separated names for all ${splitPoints.length + 1} sections, like:
April_2024,May_2024,June_2024`
              }
            ]
          }]
        });

        const nameReply = nameResponse.content[0].text.trim();
        splitNames = nameReply.split(',').map(n => n.trim());
      }
    }

    // Build page ranges
    const ranges = [];
    let start = 1;

    for (let i = 0; i < splitPoints.length; i++) {
      ranges.push({ start, end: splitPoints[i], name: splitNames[i] || `Part_${i + 1}` });
      start = splitPoints[i] + 1;
    }
    // Last section
    ranges.push({ start, end: totalPages, name: splitNames[splitPoints.length] || `Part_${splitPoints.length + 1}` });

    // Create split PDFs
    const zip = new JSZip();
    const documents = [];

    for (const range of ranges) {
      const newPdf = await PDFDocument.create();
      const pageIndices = [];
      for (let p = range.start - 1; p < range.end; p++) pageIndices.push(p);

      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach(page => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();
      const fileName = `${range.name}.pdf`;

      zip.file(fileName, pdfBytes);
      documents.push({ name: fileName, pages: range.end - range.start + 1 });
    }

    const zipBytes = await zip.generateAsync({ type: 'nodebuffer' });
    const zipBase64 = zipBytes.toString('base64');

    return Response.json({
      success: true,
      splitCount: documents.length,
      documents,
      aiExplanation,
      zipFile: zipBase64,
    });

  } catch (err) {
    console.log('Split error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
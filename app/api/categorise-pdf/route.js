import Anthropic from '@anthropic-ai/sdk';
import JSZip from 'jszip';

// Increase body size limit for this API route (Next.js App Router)
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// All 20 legal categories
const FOLDER_TAXONOMY = [
  '01_Bank_Statements',
  '02_Financial_Records',
  '03_Tax_Documents',
  '04_Invoices_And_Receipts',
  '05_Contracts',
  '06_Legal_Agreements',
  '07_Corporate_Documents',
  '08_Correspondence',
  '09_Court_Filings',
  '10_Employment_Records',
  '11_Real_Estate_Documents',
  '12_Insurance_Documents',
  '13_Intellectual_Property',
  '14_Regulatory_And_Compliance',
  '15_Loan_And_Credit',
  '16_Client_And_Customer_Records',
  '17_Payment_Records',
  '18_Digital_And_Electronic_Evidence',
  '19_Expert_Reports_And_Appraisals',
  '20_Miscellaneous_Uncategorized',
];

const CATEGORIZATION_PROMPT = `You are an expert legal document analyst and paralegal AI assistant with deep knowledge of legal case management, financial document structures, corporate records, and regulatory filings.

TASK: Read this document carefully and categorize it into the correct folder from the taxonomy below.

FOLDER TAXONOMY (use ONLY these exact folder names):
01_Bank_Statements — Monthly/annual bank statements, transaction histories, wire transfer confirmations, ACH records, overdraft notices
02_Financial_Records — P&L statements, balance sheets, cash flow, general ledger, accounts payable/receivable, audit reports
03_Tax_Documents — Federal/state tax returns (1040, 1120, 1065), W-2, 1099, K-1, IRS notices, tax transcripts, FBAR
04_Invoices_And_Receipts — Vendor invoices, purchase orders, payment receipts, billing statements, credit memos
05_Contracts — Service agreements, vendor contracts, employment contracts, SaaS/licensing agreements, partnership contracts
06_Legal_Agreements — MOUs, LOIs, NDAs, settlement agreements, consent decrees, promissory notes, guarantees
07_Corporate_Documents — Articles of incorporation, bylaws, operating agreements, board resolutions, meeting minutes, shareholder agreements, cap tables
08_Correspondence — Emails, demand letters, cease & desist, notices of breach, termination notices, certified mail receipts
09_Court_Filings — Complaints, answers, motions, briefs, orders, judgments, subpoenas, affidavits, deposition transcripts
10_Employment_Records — Offer letters, pay stubs, W-2s, termination letters, performance reviews, HR policies
11_Real_Estate_Documents — Deeds, title reports, mortgage docs, lease agreements, closing disclosures, property appraisals
12_Insurance_Documents — Insurance policies, certificates of insurance, claims, EOBs, endorsements, cancellation notices
13_Intellectual_Property — Patent filings, trademark registrations, copyright registrations, IP license/assignment agreements
14_Regulatory_And_Compliance — SEC filings (10-K, 8-K, S-1), FINRA reports, government permits, licenses, EPA/OSHA filings
15_Loan_And_Credit — Loan agreements, promissory notes, lines of credit, UCC filings, forbearance agreements, lien releases
16_Client_And_Customer_Records — Client lists, CRM exports, KYC/AML docs, onboarding forms, engagement letters, retainer agreements
17_Payment_Records — Wire transfer confirmations, ACH records, check copies, payment schedules, crypto transaction logs, escrow statements
18_Digital_And_Electronic_Evidence — Metadata reports, forensic imaging, email server logs, chat/SMS exports, social media records, audit logs
19_Expert_Reports_And_Appraisals — Expert witness reports, forensic accounting, business valuations, damage assessments, medical/technical expert opinions
20_Miscellaneous_Uncategorized — Documents that do not fit any defined category

CATEGORIZATION RULES:
1. READ the full content before categorizing — do not rely only on filename
2. IDENTIFY document type by: headers, titles, form numbers, logos, signatures, date formats, key phrases
3. ASSIGN to the MOST SPECIFIC folder. Do NOT use 20_Miscellaneous unless truly no other folder fits
4. If document spans multiple categories, assign to PRIMARY purpose
5. For confidence: HIGH = clear match, MEDIUM = reasonable match, LOW = best guess

Return ONLY a JSON object in this exact format, no extra text:
{
  "original_filename": "<filename>",
  "suggested_filename": "<YYYY-MM-DD>_<DocumentType>_<Party>_<ShortDesc>",
  "assigned_folder": "<exact folder name from taxonomy>",
  "document_type": "<specific document type>",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "key_identifiers_found": ["<identifier1>", "<identifier2>"],
  "parties_involved": ["<party1>", "<party2>"],
  "document_date": "<YYYY-MM-DD or null>",
  "financial_amount": "<amount or null>",
  "notes": "<any flags, ambiguities, or reasons for LOW/MEDIUM confidence>"
}`;

// ─── File type helpers ───────────────────────────────────────────────

function getFileType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const types = {
    // PDFs
    pdf: 'pdf',
    // Images
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image',
    webp: 'image', tiff: 'image', tif: 'image', bmp: 'image', heic: 'image',
    // Word
    docx: 'word', doc: 'word',
    // Excel
    xlsx: 'excel', xls: 'excel', csv: 'excel',
    // PowerPoint
    pptx: 'powerpoint', ppt: 'powerpoint',
    // Text
    txt: 'text', rtf: 'text', md: 'text',
    // Email
    eml: 'email', msg: 'email',
  };
  return types[ext] || 'unknown';
}

function getImageMediaType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    tiff: 'image/tiff', tif: 'image/tiff',
    bmp: 'image/bmp',
    heic: 'image/heic',
  };
  return map[ext] || 'image/jpeg';
}

// Convert DOCX buffer to plain text using mammoth
async function docxToText(arrayBuffer) {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
    return result.value || '';
  } catch {
    return '';
  }
}

// Convert Excel/CSV buffer to plain text
async function excelToText(arrayBuffer, filename) {
  try {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'csv') {
      return Buffer.from(arrayBuffer).toString('utf-8').slice(0, 3000);
    }
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' });
    let text = '';
    for (const sheetName of workbook.SheetNames.slice(0, 3)) {
      const sheet = workbook.Sheets[sheetName];
      text += `Sheet: ${sheetName}\n`;
      text += XLSX.utils.sheet_to_csv(sheet).slice(0, 1500) + '\n\n';
    }
    return text;
  } catch {
    return '';
  }
}

// Build Claude message content based on file type
async function buildClaudeContent(file, arrayBuffer, base64Data, fileType, filename) {
  const promptText = CATEGORIZATION_PROMPT + `\n\nFilename: "${filename}"\n\nCategorize this document now.`;

  if (fileType === 'pdf') {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } },
      { type: 'text', text: promptText }
    ];
  }

  if (fileType === 'image') {
    return [
      { type: 'image', source: { type: 'base64', media_type: getImageMediaType(filename), data: base64Data } },
      { type: 'text', text: promptText }
    ];
  }

  if (fileType === 'word') {
    const text = await docxToText(arrayBuffer);
    if (text) {
      return [{ type: 'text', text: `Document content:\n\n${text.slice(0, 4000)}\n\n${promptText}` }];
    }
  }

  if (fileType === 'excel') {
    const text = await excelToText(arrayBuffer, filename);
    if (text) {
      return [{ type: 'text', text: `Spreadsheet content:\n\n${text}\n\n${promptText}` }];
    }
  }

  if (fileType === 'text' || fileType === 'email') {
    const text = Buffer.from(arrayBuffer).toString('utf-8').slice(0, 4000);
    return [{ type: 'text', text: `Document content:\n\n${text}\n\n${promptText}` }];
  }

  // Fallback — just use filename as hint
  return [{ type: 'text', text: `I cannot read the content of this file directly. Based on the filename only:\n\nFilename: "${filename}"\n\n${promptText}` }];
}

// ─── Main POST handler ───────────────────────────────────────────────

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files'); // Changed from 'pdfs' to 'files'

    // Filter out hidden/system files
    const validFiles = files.filter(f => f.name && !f.name.startsWith('.') && f.size > 0);
    if (validFiles.length === 0) {
      return Response.json({ error: 'No valid files found!' }, { status: 400 });
    }

    const zip = new JSZip();
    const categoryMap = {};
    const categorizationResults = [];
    const errors = [];
    const skipped = [];

    for (const file of validFiles) {
      const fileType = getFileType(file.name);

      // Skip truly unsupported types (executables, zip, etc)
      if (fileType === 'unknown') {
        skipped.push({ file: file.name, reason: 'Unsupported file type' });
        // Still add to Miscellaneous
        const arrayBuffer = await file.arrayBuffer();
        zip.folder('20_Miscellaneous_Uncategorized').file(file.name, arrayBuffer);
        if (!categoryMap['20_Miscellaneous_Uncategorized']) categoryMap['20_Miscellaneous_Uncategorized'] = 0;
        categoryMap['20_Miscellaneous_Uncategorized']++;
        categorizationResults.push({
          original_filename: file.name,
          file_type: fileType,
          assigned_folder: '20_Miscellaneous_Uncategorized',
          document_type: 'Unknown',
          confidence: 'LOW',
          notes: 'Unsupported file type — placed in Miscellaneous'
        });
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');

        const messageContent = await buildClaudeContent(file, arrayBuffer, base64Data, fileType, file.name);

        const claudeResponse = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{ role: 'user', content: messageContent }]
        });

        let responseText = claudeResponse.content[0].text.trim();
        responseText = responseText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

        let result;
        try {
          result = JSON.parse(responseText);
        } catch {
          result = {
            original_filename: file.name,
            suggested_filename: file.name,
            assigned_folder: '20_Miscellaneous_Uncategorized',
            document_type: 'Unknown',
            confidence: 'LOW',
            key_identifiers_found: [],
            parties_involved: [],
            document_date: null,
            financial_amount: null,
            notes: 'AI response parse failed — manual review needed'
          };
        }

        // Validate folder name
        if (!FOLDER_TAXONOMY.includes(result.assigned_folder)) {
          result.assigned_folder = '20_Miscellaneous_Uncategorized';
          result.notes = (result.notes || '') + ' | Invalid folder — moved to Miscellaneous';
        }

        result.original_filename = file.name;
        result.file_type = fileType.toUpperCase();
        categorizationResults.push(result);

        zip.folder(result.assigned_folder).file(file.name, arrayBuffer);
        if (!categoryMap[result.assigned_folder]) categoryMap[result.assigned_folder] = 0;
        categoryMap[result.assigned_folder]++;

      } catch (err) {
        console.error(`Error processing ${file.name}:`, err.message);
        errors.push({ file: file.name, error: err.message });

        try {
          const arrayBuffer = await file.arrayBuffer();
          zip.folder('20_Miscellaneous_Uncategorized').file(file.name, arrayBuffer);
        } catch {}

        if (!categoryMap['20_Miscellaneous_Uncategorized']) categoryMap['20_Miscellaneous_Uncategorized'] = 0;
        categoryMap['20_Miscellaneous_Uncategorized']++;

        categorizationResults.push({
          original_filename: file.name,
          file_type: fileType.toUpperCase(),
          assigned_folder: '20_Miscellaneous_Uncategorized',
          document_type: 'Error',
          confidence: 'LOW',
          notes: `Processing error: ${err.message}`
        });
      }
    }

    const zipBytes = await zip.generateAsync({ type: 'nodebuffer' });
    const zipBase64 = zipBytes.toString('base64');

    const categories = Object.entries(categoryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const highConfidence = categorizationResults.filter(r => r.confidence === 'HIGH').length;
    const mediumConfidence = categorizationResults.filter(r => r.confidence === 'MEDIUM').length;
    const lowConfidence = categorizationResults.filter(r => r.confidence === 'LOW').length;

    return Response.json({
      success: true,
      totalFiles: validFiles.length,
      categoryCount: Object.keys(categoryMap).length,
      categories,
      categorizationResults,
      confidenceSummary: { high: highConfidence, medium: mediumConfidence, low: lowConfidence },
      skipped,
      errors,
      zipFile: zipBase64,
    });

  } catch (err) {
    console.error('Categorise error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
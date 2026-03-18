import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function isPDF(filename) {
  return filename.toLowerCase().endsWith('.pdf');
}

function getTimestamp() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');
  return { label: `${date}_${time}` };
}

function getStampCoordinates(position, page, font, batesNumber, fontSize, cornerPct) {
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(batesNumber, fontSize);
  const margin = Math.min(width, height) * cornerPct;

  let x, y;
  if (position === 'bottom-right') {
    x = width - margin - textWidth;
    y = margin;
  } else if (position === 'bottom-left') {
    x = margin;
    y = margin;
  } else if (position === 'top-right') {
    x = width - margin - textWidth;
    y = height - margin - fontSize;
  } else if (position === 'top-left') {
    x = margin;
    y = height - margin - fontSize;
  } else {
    x = (width / 2) - (textWidth / 2);
    y = margin;
  }

  x = Math.max(5, Math.min(x, width - textWidth - 5));
  y = Math.max(5, Math.min(y, height - fontSize - 5));
  return { x, y };
}

function buildClaudePrompt(cornerPct) {
  const pctDisplay = Math.round(cornerPct * 100);
  return `You are analyzing the FIRST PAGE of a legal PDF document for Bates stamp placement.

DEFINITION — CORNER ZONE:
Each corner zone is the rectangular area covering:
  - The outer ${pctDisplay}% of the page WIDTH from that side edge, AND
  - The outer ${pctDisplay}% of the page HEIGHT from that top or bottom edge.
Example for US Letter (612 × 792 pt): each corner zone = ${Math.round(612 * cornerPct)} pt wide × ${Math.round(792 * cornerPct)} pt tall.
Example for A4 (595 × 842 pt): each corner zone = ${Math.round(595 * cornerPct)} pt wide × ${Math.round(842 * cornerPct)} pt tall.

TASK: Check each corner zone for ANY visible content (text, numbers, watermarks, logos, stamps, lines, or any marks).

Answer in EXACTLY this format — no extra explanation:

CORNER_STATUS:
  bottom-right: [empty OR has-text]
  bottom-left: [empty OR has-text]
  top-right: [empty OR has-text]
  top-left: [empty OR has-text]
BATES_STAMP: [yes OR no]
BATES_LOCATION: [bottom-right OR bottom-left OR top-right OR top-left OR none]
SCANNED: [yes OR no]

Rules:
- "has-text" = ANY visible content in that corner zone (page numbers, headers, footers, watermarks, etc.)
- "empty" = absolutely nothing visible in that corner zone
- BATES_STAMP "yes" = a structured code like "ABC-000001" or "DOC-123456" is present. Regular page numbers ("1", "Page 1 of 5") are NOT Bates stamps.
- BATES_LOCATION = where the Bates stamp is, or "none" if no Bates stamp
- SCANNED "yes" = page is a scanned image with no selectable text layer`;
}

function parseClaudeResponse(reply) {
  const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
  const corners = {};
  for (const pos of positions) {
    const match = reply.match(new RegExp(`${pos}:\\s*(empty|has-text)`, 'i'));
    corners[pos] = match ? match[1].toLowerCase() : 'empty';
  }
  const batesMatch    = reply.match(/BATES_STAMP:\s*(yes|no)/i);
  const batesLocMatch = reply.match(/BATES_LOCATION:\s*([\w-]+)/i);
  const scannedMatch  = reply.match(/SCANNED:\s*(yes|no)/i);
  return {
    corners,
    hasBates:      batesMatch    ? batesMatch[1].toLowerCase() === 'yes' : false,
    batesLocation: batesLocMatch ? batesLocMatch[1].toLowerCase() : 'none',
    isScanned:     scannedMatch  ? scannedMatch[1].toLowerCase() === 'yes' : false,
  };
}

function chooseBestPosition(corners) {
  const priority = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
  for (const pos of priority) {
    if (corners[pos] === 'empty') return { position: pos, usedFallback: false };
  }
  return { position: 'center-bottom', usedFallback: true };
}

function classifyClaudeError(errMessage) {
  const msg = errMessage || '';
  if (msg.includes('password protected') || msg.includes('encrypted')) {
    return { type: 'Password Protected PDF', reason: 'PDF is password-protected. Claude cannot analyze encrypted files.', skipStamping: true };
  }
  if (msg.includes('empty response') || msg.includes("reading 'text'") || msg.includes('Cannot read properties of undefined')) {
    return { type: 'AI Empty Response', reason: 'Claude returned an unexpected empty response. Stamped at default position (bottom-right).', skipStamping: false };
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return { type: 'AI Timeout', reason: 'Claude took too long to analyze this PDF (large or complex file). Stamped at default position.', skipStamping: false };
  }
  if (msg.includes('rate_limit') || msg.includes('429')) {
    return { type: 'AI Rate Limit', reason: 'Too many files sent at once. Try again with fewer files. Stamped at default position.', skipStamping: false };
  }
  if (msg.includes('overloaded') || msg.includes('529')) {
    return { type: 'AI Overloaded', reason: 'Claude API temporarily overloaded. Try again shortly. Stamped at default position.', skipStamping: false };
  }
  if (msg.includes('too large') || msg.includes('413')) {
    return { type: 'PDF Too Large for AI', reason: 'PDF too large for Claude to analyze. Stamped at default position.', skipStamping: false };
  }
  return { type: 'AI Analysis Failed', reason: `Claude could not analyze this file. Error: ${msg}`, skipStamping: false };
}

async function tryDecryptPDF(arrayBuffer, password) {
  try {
    const pdfDoc = await PDFDocument.load(arrayBuffer, {
      password,
      ignoreEncryption: false,
    });
    return { success: true, pdfDoc };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getStampColor(colorName) {
  if (colorName === 'red') return rgb(0.8, 0, 0);
  return rgb(0, 0, 0);
}

function getStampFont(fontName) {
  if (fontName === 'Courier') return StandardFonts.Courier;
  if (fontName === 'Times') return StandardFonts.TimesRoman;
  return StandardFonts.Helvetica;
}

async function buildErrorReport(errorRows, timestamp) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Alpha Analytics - Bates Stamp Tool';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Error Report');
  sheet.columns = [
    { header: 'File Name',            key: 'fileName',    width: 40 },
    { header: 'Error Type',           key: 'errorType',   width: 30 },
    { header: 'Reason / Description', key: 'description', width: 65 },
    { header: 'Action Taken',         key: 'action',      width: 40 },
    { header: 'Timestamp',            key: 'timestamp',   width: 22 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  headerRow.height = 22;

  errorRows.forEach((row, idx) => {
    const dataRow = sheet.addRow(row);
    const bg = idx % 2 === 0 ? 'FFF5F5F5' : 'FFFFFFFF';
    dataRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    });
    dataRow.height = 18;
  });

  sheet.addRow([]);
  const summary = sheet.addRow([`Total entries: ${errorRows.length}`, '', '', '', `Report generated: ${timestamp}`]);
  summary.getCell(1).font = { bold: true, italic: true, name: 'Arial', size: 10 };
  summary.getCell(5).font = { bold: true, italic: true, name: 'Arial', size: 10 };

  return await workbook.xlsx.writeBuffer();
}

export async function POST(request) {
  try {
    const formData   = await request.formData();
    const files      = formData.getAll('pdfs');
    const prefix     = formData.get('prefix') || 'DOC-';
    const startNumber = parseInt(formData.get('startNumber')) || 1;
    const padLength  = parseInt(formData.get('padLength')) || 6;
    const password   = formData.get('password') || '';
    const cornerPct  = Math.min(0.15, Math.max(0.05,
                         parseFloat(formData.get('cornerPct')) || 0.10));
    const fontSize   = Math.min(16, Math.max(6,
                         parseInt(formData.get('fontSize')) || 10));
    const stampColor = formData.get('stampColor') || 'black';
    const stampFont  = formData.get('stampFont') || 'Helvetica';

    const { label: timestamp } = getTimestamp();

    const pdfFiles     = [];
    const skippedFiles = [];

    for (const file of files) {
      if (isPDF(file.name)) pdfFiles.push(file);
      else skippedFiles.push(file.name);
    }

    if (pdfFiles.length === 0) {
      return Response.json({ error: 'No PDF files found!' }, { status: 400 });
    }

    let currentNumber         = startNumber;
    const zip                 = new JSZip();
    const errorRows           = [];
    const scannedPDFs         = [];
    const fallbackFiles       = [];
    const cornerAdjustedFiles = [];
    const aiFailedFiles       = [];
    const passwordFiles       = [];
    // ── NEW: track processed file details for QC ─────────────────────────
    const processedFiles      = [];
    let processedCount        = 0;
    let skippedCount          = 0;
    let totalStampedPages     = 0;

    for (const file of pdfFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();

        let pdfDoc;
        let wasDecrypted = false;

        try {
          pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

          if (pdfDoc.isEncrypted && password) {
            const decryptResult = await tryDecryptPDF(arrayBuffer, password);
            if (decryptResult.success) {
              pdfDoc = decryptResult.pdfDoc;
              wasDecrypted = true;
            } else {
              passwordFiles.push(file.name);
              skippedCount++;
              errorRows.push({
                fileName:    file.name,
                errorType:   'Wrong Password',
                description: `The password provided did not unlock this PDF. Error: ${decryptResult.error}`,
                action:      'File skipped. Check the password and re-upload.',
                timestamp,
              });
              continue;
            }
          } else if (pdfDoc.isEncrypted && !password) {
            passwordFiles.push(file.name);
            skippedCount++;
            errorRows.push({
              fileName:    file.name,
              errorType:   'Password Protected — No Password Given',
              description: 'This PDF is password-protected. No password was provided in the UI.',
              action:      'File skipped. Enter the PDF password in the stamping form and re-upload.',
              timestamp,
            });
            continue;
          }
        } catch {
          skippedCount++;
          errorRows.push({
            fileName:    file.name,
            errorType:   'Corrupt / Unreadable',
            description: 'PDF could not be parsed or loaded.',
            action:      'File skipped. Bates number sequence preserved.',
            timestamp,
          });
          continue;
        }

        const fontEnum = getStampFont(stampFont);
        const font     = await pdfDoc.embedFont(fontEnum);
        const pages    = pdfDoc.getPages();
        const color    = getStampColor(stampColor);

        // ── FIX: build base64 from DECRYPTED bytes when password was used ─
        // Previously always used the original encrypted arrayBuffer, which
        // caused Claude to receive unreadable encrypted bytes and fall back
        // to default bottom-right stamping on every password-unlocked PDF.
        let base64PDF;
        if (wasDecrypted) {
          // Save the unlocked PDF to a clean buffer for Claude's analysis
          const decryptedBytes = await pdfDoc.save();
          base64PDF = Buffer.from(decryptedBytes).toString('base64');
        } else {
          base64PDF = Buffer.from(arrayBuffer).toString('base64');
        }

        let stampPosition = 'bottom-right';
        let shouldStamp   = true;

        try {
          const claudeResponse = await client.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64PDF } },
                { type: 'text', text: buildClaudePrompt(cornerPct) },
              ],
            }],
          });

          if (!claudeResponse.content?.[0]?.text) {
            throw new Error("Claude returned an empty response (reading 'text')");
          }

          const reply = claudeResponse.content[0].text.trim();
          console.log(`[${file.name}] Claude:`, reply);

          const { corners, hasBates, batesLocation, isScanned } = parseClaudeResponse(reply);

          if (hasBates) {
            skippedCount++;
            errorRows.push({
              fileName:    file.name,
              errorType:   'Already Bates Stamped',
              description: `Bates-style stamp detected (found at: ${batesLocation}).`,
              action:      'Entire file skipped to prevent double stamping.',
              timestamp,
            });
            shouldStamp = false;
            continue;
          }

          if (isScanned) {
            scannedPDFs.push(file.name);
            errorRows.push({
              fileName:    file.name,
              errorType:   'Scanned PDF — Image Only',
              description: 'No selectable text layer detected. Claude used visual corner analysis.',
              action:      'Stamped successfully using detected corner position.',
              timestamp,
            });
          }

          const { position, usedFallback } = chooseBestPosition(corners);
          stampPosition = position;

          if (usedFallback) {
            fallbackFiles.push(file.name);
            errorRows.push({
              fileName:    file.name,
              errorType:   'All Corners Occupied — Center Bottom Used',
              description: `All 4 corner zones (outer ${Math.round(cornerPct * 100)}% × ${Math.round(cornerPct * 100)}%) contain existing text.`,
              action:      'Stamp placed at center-bottom to avoid overwriting content.',
              timestamp,
            });
          } else {
            const occupiedCorners = Object.entries(corners).filter(([, v]) => v === 'has-text').map(([k]) => k);
            if (occupiedCorners.length > 0) {
              cornerAdjustedFiles.push({ name: file.name, occupiedCorners: occupiedCorners.join(', '), stampedAt: stampPosition });
              errorRows.push({
                fileName:    file.name,
                errorType:   'Corner Adjusted (Info)',
                description: `Corners with existing text: ${occupiedCorners.join(', ')}. First empty corner selected.`,
                action:      `Stamp placed at: ${stampPosition}.`,
                timestamp,
              });
            }
          }

        } catch (claudeErr) {
          const { type, reason, skipStamping } = classifyClaudeError(claudeErr.message);

          if (skipStamping) {
            passwordFiles.push(file.name);
            skippedCount++;
            errorRows.push({
              fileName:    file.name,
              errorType:   type,
              description: reason,
              action:      'File skipped. Cannot safely stamp password-protected PDFs.',
              timestamp,
            });
            shouldStamp = false;
            continue;
          } else {
            aiFailedFiles.push({ name: file.name, reason, type });
            errorRows.push({
              fileName:    file.name,
              errorType:   type,
              description: reason,
              action:      'Stamped at default position: bottom-right. Review placement manually.',
              timestamp,
            });
          }
        }

        if (!shouldStamp) continue;

        // ── Stamp every page ──────────────────────────────────────────────
        const firstBatesNumber = prefix + String(currentNumber).padStart(padLength, '0');

        for (let p = 0; p < pages.length; p++) {
          const page        = pages[p];
          const batesNumber = prefix + String(currentNumber + p).padStart(padLength, '0');
          const { x, y }   = getStampCoordinates(stampPosition, page, font, batesNumber, fontSize, cornerPct);
          // Draw white background box so stamp is always readable over existing content
          const textWidth  = font.widthOfTextAtSize(batesNumber, fontSize);
          const padX = 2;
          const padY = 2;
          page.drawRectangle({
            x:      x - padX,
            y:      y - padY,
            width:  textWidth + padX * 2,
            height: fontSize  + padY * 2,
            color:  rgb(1, 1, 1),
            opacity: 1,
          });
          page.drawText(batesNumber, { x, y, size: fontSize, font, color });
        }

        currentNumber += pages.length;
        totalStampedPages += pages.length;

        const stampedBytes = await pdfDoc.save();

        const pathParts     = file.name.replace(/\\/g, '/').split('/');
        const originalName  = pathParts.pop();
        const folderPath    = pathParts.join('/');
        const stampedName   = folderPath
          ? `${folderPath}/stamped_${originalName}`
          : `stamped_${originalName}`;

        zip.file(stampedName, stampedBytes);
        processedCount++;

        // ── NEW: record file details for QC badge ─────────────────────────
        processedFiles.push({
          name:       file.name,
          pageCount:  pages.length,
          batesStart: firstBatesNumber,
          batesEnd:   prefix + String(currentNumber - 1).padStart(padLength, '0'),
          position:   stampPosition,
        });

      } catch (fileErr) {
        skippedCount++;
        errorRows.push({
          fileName:    file.name,
          errorType:   'Unexpected Error',
          description: fileErr.message,
          action:      'File skipped.',
          timestamp,
        });
      }
    }

    skippedFiles.forEach((name) => {
      skippedCount++;
      errorRows.push({
        fileName:    name,
        errorType:   'Non-PDF File',
        description: 'Only PDF files are accepted for Bates stamping.',
        action:      'File skipped.',
        timestamp,
      });
    });

    if (errorRows.length > 0) {
      const reportBuffer = await buildErrorReport(errorRows, timestamp);
      zip.file(`error_report_${timestamp}.xlsx`, reportBuffer);
    }

    const zipBytes  = await zip.generateAsync({ type: 'nodebuffer' });
    const zipBase64 = zipBytes.toString('base64');

    return Response.json({
      success:              true,
      zipFile:              zipBase64,
      processedCount,
      skippedCount,
      totalFiles:           pdfFiles.length,
      totalStampedPages,          // NEW
      processedFiles,             // NEW — used by QC badge in frontend
      skippedFiles,
      scannedPDFs,
      fallbackFiles,
      cornerAdjustedFiles,
      aiFailedFiles,
      passwordFiles,
      errorCount:           errorRows.length,
      hasErrorReport:       errorRows.length > 0,
    });

  } catch (err) {
    console.error('Main error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
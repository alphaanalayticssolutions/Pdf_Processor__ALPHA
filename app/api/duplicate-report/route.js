import * as XLSX from 'xlsx';

export async function POST(request) {
  try {
    const { fileData, hashMap, duplicateCount, duplicates } = await request.json();

    if (!fileData || fileData.length === 0) {
      return Response.json({ error: 'No file data received!' }, { status: 400 });
    }

    const excelRows = fileData.map(f => {
      const isDuplicate = hashMap[f.hash].length > 1;
      return {
        'File Name': f.fileName,
        'Hash (SHA-256)': f.hash,
        'File Size (KB)': f.sizeKB,
        'Status': isDuplicate ? 'DUPLICATE' : 'UNIQUE',
        'Duplicate Group': isDuplicate ? `Group: ${f.hash.substring(0, 8)}` : '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    worksheet['!cols'] = [{ wch: 40 }, { wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 20 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Duplicate Report');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const excelBase64 = Buffer.from(excelBuffer).toString('base64');

    return Response.json({
      success: true,
      totalFiles: fileData.length,
      uniqueFiles: Object.keys(hashMap).length,
      duplicateCount,
      duplicates,
      excelFile: excelBase64,
    });

  } catch (err) {
    console.log('Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
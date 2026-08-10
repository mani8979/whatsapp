import ExcelJS from 'exceljs';
import path from 'path';

async function verifyWorkbook() {
  const filePath = path.resolve('./exports_test/test_export.xlsx');
  console.log('=========================================');
  console.log('   PROGRAMMATIC EXCELJS VISUAL AUDIT     ');
  console.log('=========================================\n');
  console.log(`Loading workbook: ${filePath}...`);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.getWorksheet('All Contacts');
  if (!worksheet) {
    console.error('❌ ERROR: "All Contacts" worksheet not found!');
    process.exit(1);
  }

  const results = [];
  const logResult = (name, passed, detail = '') => {
    results.push({ name, passed, detail });
    console.log(`${passed ? '✅' : '❌'} ${name} ${detail ? `(${detail})` : ''}`);
  };

  // 1. Verify Metadata
  try {
    const expected = {
      title: 'WhatsApp Contacts Export',
      subject: 'CRM Export',
      company: 'Open Source',
      category: 'Contacts',
      keywords: 'WhatsApp, CRM, Contacts'
    };
    let metaPassed = true;
    let mismatch = '';
    
    // ExcelJS maps author/creator to creator
    if (workbook.creator !== 'WhatsApp Contact Export System') {
      metaPassed = false;
      mismatch += `creator: ${workbook.creator} `;
    }

    for (const [k, v] of Object.entries(expected)) {
      if (workbook[k] !== v) {
        metaPassed = false;
        mismatch += `${k}: ${workbook[k]} `;
      }
    }

    logResult('Workbook Metadata', metaPassed, mismatch ? `Mismatches: ${mismatch}` : 'All properties match');
  } catch (e) {
    logResult('Workbook Metadata', false, e.message);
  }

  // 2. Verify Hidden Worksheet
  try {
    const tech = workbook.getWorksheet('Technical Data');
    if (!tech) {
      logResult('Hidden Worksheet', false, 'Technical Data sheet is missing');
    } else if (tech.state !== 'hidden') {
      logResult('Hidden Worksheet', false, `Sheet exists but state is "${tech.state}" (Expected: hidden)`);
    } else {
      logResult('Hidden Worksheet', true, 'Technical Data hidden successfully');
    }
  } catch (e) {
    logResult('Hidden Worksheet', false, e.message);
  }

  // 3. Verify Merged Cells
  try {
    const expectedMerges = [
      'A1:S1',
      'A2:S2',
      'A3:S3',
      'A4:C4',
      'E4:G4',
      'I4:K4',
      'M4:O4'
    ];
    // Read worksheet merged regions list
    const actualMerges = worksheet.model.merges || [];
    let mergesPassed = true;
    const missing = [];
    
    expectedMerges.forEach(range => {
      if (!actualMerges.includes(range)) {
        mergesPassed = false;
        missing.push(range);
      }
    });

    logResult('Merged Regions', mergesPassed, mergesPassed ? 'All 7 headers/cards merged' : `Missing: ${missing.join(', ')}`);
  } catch (e) {
    logResult('Merged Regions', false, e.message);
  }

  // 4. Verify Row 1 Title Banner
  try {
    const row1 = worksheet.getRow(1);
    const a1 = worksheet.getCell('A1');
    const heightOk = row1.height === 40;
    const fontOk = a1.font?.size === 18 && a1.font?.bold === true && a1.font?.color?.argb === 'FFFFFF';
    const fillOk = a1.fill?.fgColor?.argb === '0B8C65';
    const textOk = String(a1.value).startsWith('WaVault | All Contacts •');
    
    const passed = heightOk && fontOk && fillOk && textOk;
    logResult('Row 1 Title Banner', passed, `Height: ${row1.height}, Fill: ${a1.fill?.fgColor?.argb}, Font: ${a1.font?.size}pt`);
  } catch (e) {
    logResult('Row 1 Title Banner', false, e.message);
  }

  // 5. Verify Row 2 Subtitle Metadata
  try {
    const a2 = worksheet.getCell('A2');
    const fillOk = a2.fill?.fgColor?.argb === 'F5F5F5';
    const fontOk = a2.font?.italic === true;
    logResult('Row 2 Metadata Banner', fillOk && fontOk, `Fill: ${a2.fill?.fgColor?.argb}, Italic: ${a2.font?.italic}`);
  } catch (e) {
    logResult('Row 2 Metadata Banner', false, e.message);
  }

  // 6. Verify Row 3 Alert Banner
  try {
    const a3 = worksheet.getCell('A3');
    const fillOk = a3.fill?.fgColor?.argb === 'FFFDF0';
    logResult('Row 3 Alert Banner', fillOk, `Fill: ${a3.fill?.fgColor?.argb}`);
  } catch (e) {
    logResult('Row 3 Alert Banner', false, e.message);
  }

  // 7. Verify Statistics Cards
  try {
    const cards = ['A4', 'E4', 'I4', 'M4'];
    let cardsPassed = true;
    cards.forEach(c => {
      const cell = worksheet.getCell(c);
      if (!cell.value) cardsPassed = false;
    });
    logResult('Statistics Cards Values', cardsPassed, cardsPassed ? 'All 4 cards have values' : 'Some cards are empty');
  } catch (e) {
    logResult('Statistics Cards Values', false, e.message);
  }

  // 8. Verify Table Headers Row (Row 6)
  try {
    const r6 = worksheet.getRow(6);
    let headersCount = 0;
    const headerTexts = [];
    for (let c = 1; c <= 19; c++) {
      const val = r6.getCell(c).value;
      if (val) {
        headersCount++;
        headerTexts.push(val);
      }
    }
    const colorOk = r6.getCell(1).fill?.fgColor?.argb === 'D9EAD3';
    const passed = headersCount === 19 && colorOk;
    logResult('Table Headers (Row 6)', passed, `Found ${headersCount}/19 headers. Fill Color: ${r6.getCell(1).fill?.fgColor?.argb}`);
  } catch (e) {
    logResult('Table Headers (Row 6)', false, e.message);
  }

  // 9. Verify Freeze Pane Split Views
  try {
    const view = worksheet.views && worksheet.views[0];
    const paneOk = view && view.state === 'frozen' && view.xSplit === 1 && view.ySplit === 6;
    logResult('Freeze Pane', !!paneOk, view ? `xSplit: ${view.xSplit}, ySplit: ${view.ySplit}` : 'Missing view model');
  } catch (e) {
    logResult('Freeze Pane', false, e.message);
  }

  // 10. Verify Alternate Zebra Stripe Row Colors
  try {
    const fill7 = worksheet.getCell('A7').fill?.fgColor?.argb;
    const fill8 = worksheet.getCell('A8').fill?.fgColor?.argb;
    const zebraOk = fill7 !== fill8;
    logResult('Alternate Zebra Rows', zebraOk, `Row 7: ${fill7}, Row 8: ${fill8}`);
  } catch (e) {
    logResult('Alternate Zebra Rows', false, e.message);
  }

  // 11. Verify Borders Around Data Cells
  try {
    const border = worksheet.getCell('A7').border;
    const bordersOk = border && border.top && border.bottom && border.left && border.right;
    logResult('Borders Around Cells', !!bordersOk, bordersOk ? 'Borders exist on all 4 sides' : 'Missing borders');
  } catch (e) {
    logResult('Borders Around Cells', false, e.message);
  }

  // 12. Verify Column Autowidths Config
  try {
    let widthsOk = true;
    for (let colNum = 1; colNum <= 19; colNum++) {
      const col = worksheet.getColumn(colNum);
      if (!col.width || col.width < 10) widthsOk = false;
    }
    logResult('Column Widths', widthsOk, 'Dynamic widths mapped successfully');
  } catch (e) {
    logResult('Column Widths', false, e.message);
  }

  // 13. Verify Hyperlinks in Chat column (Col 9 / Col I)
  try {
    const chatCell = worksheet.getCell('I7');
    const hasLink = chatCell.value && chatCell.value.hyperlink;
    logResult('WhatsApp Start Chat Link', !!hasLink, chatCell.value ? `Hyperlink: ${chatCell.value.hyperlink}` : 'Empty cell value');
  } catch (e) {
    logResult('WhatsApp Start Chat Link', false, e.message);
  }

  // 14. Verify AutoFilter Setting
  try {
    const filter = worksheet.autoFilter;
    const filterOk = filter && typeof filter === 'string' && filter.startsWith('A6:');
    logResult('AutoFilter Range', !!filterOk, filter ? `Range: ${filter}` : 'Disabled');
  } catch (e) {
    logResult('AutoFilter Range', false, e.message);
  }

  // 15. Verify Footer Notes
  try {
    const footerRow = worksheet.getRow(worksheet.rowCount);
    const footerText = footerRow.getCell(1).value;
    const footerOk = footerText && footerText.includes('Generated by') && footerText.includes('Timestamp');
    logResult('Workbook Footer Summary', !!footerOk, footerText ? `Text: "${footerText.substring(0, 50)}..."` : 'Missing footer cell');
  } catch (e) {
    logResult('Workbook Footer Summary', false, e.message);
  }

  // 16. Verify Contact Data Integrity (No Unknowns, No Missing Names)
  try {
    let unknownCount = 0;
    let emptyCount = 0;
    
    // Row 7 is the first data row. Footer is at rowCount. Stop before footer.
    for (let rNum = 7; rNum <= worksheet.rowCount - 2; rNum++) {
      const row = worksheet.getRow(rNum);
      const name = row.getCell(1).value;
      
      if (!name) {
        emptyCount++;
      } else if (String(name).toLowerCase() === 'unknown') {
        unknownCount++;
      }
    }
    
    const passed = (unknownCount === 0) && (emptyCount === 0);
    logResult('Contact Data Integrity', passed, `Unknown Names: ${unknownCount}, Empty Names: ${emptyCount}`);
  } catch (e) {
    logResult('Contact Data Integrity', false, e.message);
  }

  console.log('\n=========================================');
  console.log('             SUMMARY REPORT              ');
  console.log('=========================================');
  
  let passedCount = 0;
  results.forEach(res => {
    if (res.passed) passedCount++;
    const statusText = res.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${statusText.padEnd(9)} | ${res.name}`);
  });

  const pct = Math.round((passedCount / results.length) * 100);
  console.log('=========================================');
  console.log(`OVERALL SCORE: ${pct}% (${passedCount} / ${results.length} checks passed)`);
  console.log('=========================================');

  if (pct < 100) {
    process.exit(1);
  }
}

verifyWorkbook().catch(err => {
  console.error('Audit failed with fatal error:', err);
  process.exit(1);
});

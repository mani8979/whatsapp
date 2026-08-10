import ExcelJS from 'exceljs';
import BaseExporter from './BaseExporter.js';

function formatDate(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return [year, month, day].join('-');
}

function formatTime(date) {
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return [hours, minutes, seconds].join(':');
}

export class ExcelExporter extends BaseExporter {
  async prepare(filePath) {
    // ExcelJS writes the full workbook synchronously to the file at the end
  }

  /**
   * Generates a WaVault-style visual Excel workbook using ExcelJS.
   * @param {Array<Object>} contacts list of contacts
   * @param {string} filePath Path to save the Excel file
   * @param {Object} stats Statistics object for the hidden technical sheet
   */
  async export(contacts, filePath, stats = {}) {
    console.log('  [ExcelExporter] Started');
    console.log('  [ExcelExporter] Creating workbook');
    const now = new Date();
    const workbook = new ExcelJS.Workbook();
    
    // 1. Setup Document properties
    workbook.creator = 'WhatsApp Contact Export System';
    workbook.lastModifiedBy = 'WhatsApp Contact Export System';
    workbook.created = now;
    workbook.modified = now;
    workbook.title = 'WhatsApp Contacts Export';
    workbook.subject = 'CRM Export';
    workbook.author = 'WhatsApp Contact Export System';
    workbook.company = 'Open Source';
    workbook.manager = 'System';
    workbook.category = 'Contacts';
    workbook.keywords = 'WhatsApp, CRM, Contacts';

    // 2. Add main worksheet
    const worksheet = workbook.addWorksheet('All Contacts', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 6, topLeftCell: 'B7', activePane: 'bottomRight' }] // Freeze Row 6 and Column A
    });

    // 3. Define columns configurations (19 columns)
    const columnsConfig = [
      { header: 'Name', key: 'name' },
      { header: 'First Name', key: 'firstName' },
      { header: 'Last Name', key: 'lastName' },
      { header: 'Phone', key: 'phone' },
      { header: 'E.164 (CRM)', key: 'e164' },
      { header: 'WhatsApp ID', key: 'whatsappId' },
      { header: 'Saved Status', key: 'savedStatus' },
      { header: 'Action', key: 'action' },
      { header: 'Start Chat', key: 'startChat' },
      { header: 'Notes', key: 'notes' },
      { header: 'Account Type', key: 'accountType' },
      { header: 'Business', key: 'business' },
      { header: 'Verified', key: 'verified' },
      { header: 'Country', key: 'country' },
      { header: 'Country Code', key: 'countryCode' },
      { header: 'National Number', key: 'nationalNumber' },
      { header: 'Labels', key: 'labels' },
      { header: 'Last Updated', key: 'lastUpdated' },
      { header: 'Hash', key: 'hash' }
    ];
    worksheet.columns = columnsConfig.map(col => ({ key: col.key }));

    // --- ROW 1: Large Merged Green Header ---
    worksheet.mergeCells('A1:S1');
    const titleCell = worksheet.getCell('A1');
    const isUnknown = stats.exportType === 'unknown';
    titleCell.value = isUnknown
      ? `WaVault | Unknown Contacts • ${contacts.length} Leads (${contacts.length} unlocked • 0 locked)`
      : `WaVault | All Contacts • ${contacts.length} Leads (${contacts.length} unlocked • 0 locked)`;
    titleCell.font = { name: 'Aptos Narrow', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0B8C65' } // Deep green matching WaVault
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(1).height = 40;

    // --- ROW 2: Subtitle Metadata ---
    worksheet.mergeCells('A2:S2');
    const metaCell = worksheet.getCell('A2');
    const dateStr = formatDate(now);
    const timeStr = formatTime(now);
    metaCell.value = `Exported using WhatsApp Contact Export System • Date: ${dateStr} • Time: ${timeStr} • Version: 1.0.0`;
    metaCell.font = { name: 'Aptos Narrow', size: 10, italic: true, color: { argb: 'FF5F6368' } };
    metaCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF5F5F5' }
    };
    metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(2).height = 25;

    // --- ROW 3: Light Yellow Alert Banner ---
    worksheet.mergeCells('A3:S3');
    const alertCell = worksheet.getCell('A3');
    alertCell.value = 'Export generated successfully. Only saved contacts are included.';
    alertCell.font = { name: 'Aptos Narrow', size: 10, color: { argb: 'FF5C5C00' }, bold: true };
    alertCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFDF0' } // Very light yellow background
    };
    alertCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(3).height = 22;

    // --- ROW 4: Statistics Cards ---
    const businessCount = contacts.filter(c => c.isBusiness).length;
    const personalCount = contacts.length - businessCount;

    // Card 1: To Call (Cols A-C)
    worksheet.mergeCells('A4:C4');
    const card1 = worksheet.getCell('A4');
    card1.value = `📞 To Call: ${contacts.length}`;
    card1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EA' } };
    card1.font = { name: 'Aptos Narrow', size: 11, bold: true, color: { argb: 'FF137333' } };
    card1.alignment = { vertical: 'middle', horizontal: 'center' };
    card1.border = {
      top: { style: 'thin', color: { argb: 'FFCEEAD6' } },
      left: { style: 'thin', color: { argb: 'FFCEEAD6' } },
      bottom: { style: 'thin', color: { argb: 'FFCEEAD6' } },
      right: { style: 'thin', color: { argb: 'FFCEEAD6' } }
    };

    // Card 2: Saved (Cols E-G)
    worksheet.mergeCells('E4:G4');
    const card2 = worksheet.getCell('E4');
    card2.value = isUnknown ? `✔ Unknown Contacts: ${contacts.length}` : `✔ Saved Contacts: ${contacts.length}`;
    card2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    card2.font = { name: 'Aptos Narrow', size: 11, bold: true, color: { argb: 'FF1A73E8' } };
    card2.alignment = { vertical: 'middle', horizontal: 'center' };
    card2.border = {
      top: { style: 'thin', color: { argb: 'FFD2E3FC' } },
      left: { style: 'thin', color: { argb: 'FFD2E3FC' } },
      bottom: { style: 'thin', color: { argb: 'FFD2E3FC' } },
      right: { style: 'thin', color: { argb: 'FFD2E3FC' } }
    };

    // Card 3: Business (Cols I-K)
    worksheet.mergeCells('I4:K4');
    const card3 = worksheet.getCell('I4');
    card3.value = `🏢 Business Accounts: ${businessCount}`;
    card3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E5' } };
    card3.font = { name: 'Aptos Narrow', size: 11, bold: true, color: { argb: 'FFB06000' } };
    card3.alignment = { vertical: 'middle', horizontal: 'center' };
    card3.border = {
      top: { style: 'thin', color: { argb: 'FFFFE0B2' } },
      left: { style: 'thin', color: { argb: 'FFFFE0B2' } },
      bottom: { style: 'thin', color: { argb: 'FFFFE0B2' } },
      right: { style: 'thin', color: { argb: 'FFFFE0B2' } }
    };

    // Card 4: Personal (Cols M-O)
    worksheet.mergeCells('M4:O4');
    const card4 = worksheet.getCell('M4');
    card4.value = `👤 Personal Accounts: ${personalCount}`;
    card4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F3F3' } };
    card4.font = { name: 'Aptos Narrow', size: 11, bold: true, color: { argb: 'FF5F6368' } };
    card4.alignment = { vertical: 'middle', horizontal: 'center' };
    card4.border = {
      top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
    };

    worksheet.getRow(4).height = 28;

    // --- ROW 5: Spacing ---
    worksheet.getRow(5).height = 10;

    // --- ROW 6: Table Headers ---
    const headerRow = worksheet.getRow(6);
    headerRow.height = 28;
    for (let cNum = 1; cNum <= columnsConfig.length; cNum++) {
      const cell = headerRow.getCell(cNum);
      cell.value = columnsConfig[cNum - 1].header;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9EAD3' } // soft light green background
      };
      cell.font = { name: 'Aptos Narrow', size: 11, bold: true, color: { argb: 'FF385723' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB2B2B2' } },
        left: { style: 'thin', color: { argb: 'FFB2B2B2' } },
        bottom: { style: 'thin', color: { argb: 'FFB2B2B2' } },
        right: { style: 'thin', color: { argb: 'FFB2B2B2' } }
      };
    }

    // --- ROW 7+: Data Rows ---
    contacts.forEach((c, idx) => {
      const rowNumber = idx + 7;
      
      const names = (c.displayName || '').split(/\s+/);
      const firstName = c.shortName || names[0] || '';
      const lastName = names.slice(1).join(' ') || '';
      
      // Country: OM Oman, IN India, US United States
      const countryCode = c.countryCode || 'UNKNOWN';
      const countryDisplay = countryCode !== 'UNKNOWN' ? `${countryCode} ${c.country}` : c.country;

      const row = worksheet.addRow([
        c.displayName,
        firstName,
        lastName,
        c.phoneNumber,
        c.e164,
        c.whatsappId,
        c.isMyContact ? 'Saved' : 'Unsaved',
        '📞 To Call',
        '', // Start Chat link placeholder
        c.isMyContact ? '✔ Saved' : '✔ Unsaved',
        c.isBusiness ? '🏢 Business' : '👤 Personal',
        c.isBusiness ? 'Yes' : 'No',
        c.isVerified ? 'Yes' : 'No',
        countryDisplay,
        c.countryCode,
        c.nationalNumber,
        c.labels || '',
        c.lastUpdated ? new Date(c.lastUpdated) : '',
        c.hash
      ]);

      row.height = 22; // Height 22 as requested

      // Styling parameters
      const fillType = (rowNumber % 2 === 0) ? 'FFF8F9FA' : 'FFFFFFFF';
      const dataBorder = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
      };

      for (let col = 1; col <= columnsConfig.length; col++) {
        const cell = row.getCell(col);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillType } };
        cell.border = dataBorder;
        cell.font = { name: 'Aptos Narrow', size: 10 };
        
        // Alignment overrides
        if (col === 9) {
          // Hyperlink Start Chat Col
          cell.value = {
            text: 'Open Chat',
            hyperlink: `https://wa.me/${c.e164.replace('+', '')}`
          };
          cell.font = { name: 'Aptos Narrow', size: 10, color: { argb: 'FF1A73E8' }, underline: true };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else if ([4, 5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 18].includes(col)) {
          // Center align statistics/flags/phones
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }

        // Apply text formatting for phone/ID columns to prevent formula parsing or scientific notation
        if ([4, 5, 6, 17].includes(col) && cell.value !== undefined && cell.value !== null) {
          cell.value = String(cell.value);
          cell.numFmt = '@';
        }

        // Apply Date formatting in Excel
        if (col === 18 && cell.value) {
          cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
        }
      }
    });

    // --- FOOTER BLOCK ---
    // Place footer two rows below last contact row
    const footerRowNumber = worksheet.rowCount + 2;
    worksheet.mergeCells(`A${footerRowNumber}:S${footerRowNumber}`);
    const footerCell = worksheet.getCell(`A${footerRowNumber}`);
    const durationSec = (stats.durationMs / 1000).toFixed(1);
    
    footerCell.value = `Generated by WhatsApp Contact Export System • Timestamp: ${now.toISOString()} • Export Duration: ${durationSec}s`;
    footerCell.font = { name: 'Aptos Narrow', size: 9, italic: true, color: { argb: 'FF7F7F7F' } };
    footerCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    worksheet.getRow(footerRowNumber).height = 20;

    // 4. Configure dynamic column auto-widths (ignoring headers/alerts 1 to 5 to prevent merge stretching)
    worksheet.columns.forEach((column) => {
      let maxLen = 15;
      column.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.row <= 5) return;
        let val = cell.value;
        if (val && typeof val === 'object' && val.text) {
          val = val.text;
        }
        const len = val ? String(val).length : 0;
        if (len > maxLen) {
          maxLen = len;
        }
      });
      column.width = Math.min(Math.max(maxLen + 3, 15), 35);
    });

    // 5. Apply filters covering the header row and data rows
    worksheet.autoFilter = {
      from: 'A6',
      to: `S${worksheet.rowCount - 2}` // Stop before the footer row
    };

    // 6. Build Hidden Technical Data Sheet
    const techSheet = workbook.addWorksheet('Technical Data', {
      state: 'hidden'
    });

    const techAoa = [
      ['Technical System Metadata'],
      ['Export Time', now.toISOString()],
      ['CLI Parameters', stats.cliParameters || process.argv.slice(2).join(' ')],
      ['Hash', stats.dbHash || 'N/A'],
      ['Execution Time', `${durationSec}s`],
      ['Duplicates', stats.duplicatesRemoved || 0],
      ['Version', '1.0.0'],
      ['Database Revision', '1.0.0'],
      ['SQLite File', 'storage/contacts.db']
    ];

    techAoa.forEach(rowVal => {
      techSheet.addRow(rowVal);
    });
    techSheet.columns = [{ width: 35 }, { width: 35 }];

    // 7. Write output to disk
    console.log(`  [ExcelExporter] Writing workbook to: ${filePath}`);
    await workbook.xlsx.writeFile(filePath);
    console.log('  [ExcelExporter] Finished');
  }
}
export default ExcelExporter;

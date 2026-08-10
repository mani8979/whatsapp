import fs from 'fs-extra';
import BaseExporter from './BaseExporter.js';

/**
 * Escapes a cell value for CSV output according to RFC 4180.
 * Wraps values in double quotes if they contain commas, quotes, or newlines,
 * and escapes double quotes by doubling them.
 * 
 * @param {*} val 
 * @returns {string} Escaped cell string
 */
function escapeCSVCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export class CsvExporter extends BaseExporter {
  async prepare(filePath) {
    // Handled synchronously in export
  }

  /**
   * Generates a flat CSV file with correct escaping and 11 CRM columns.
   * @param {Array<Object>} contacts Flat list of contacts
   * @param {string} filePath Path to save the CSV file
   */
  async export(contacts, filePath) {
    const headers = [
      'Name',
      'First Name',
      'Last Name',
      'Phone',
      'E.164 (CRM)',
      'Saved Status',
      'Action',
      'Start Chat',
      'Notes',
      'Account Type',
      'Country'
    ];

    const dataRows = contacts.map(c => {
      const countryDisplay = c.countryCode ? `${c.countryCode} ${c.country}` : c.country;
      return [
        c.displayName,
        c.firstName,
        c.lastName,
        c.phoneNumber,
        c.e164,
        'Saved',
        '📞 To Call',
        `https://wa.me/${c.e164.replace('+', '')}`,
        '✔ Saved',
        c.isBusiness ? '🏢 Business' : '👤 Personal',
        countryDisplay
      ];
    });

    const headerLine = headers.map(escapeCSVCell).join(',');
    const bodyLines = dataRows.map(row => row.map(escapeCSVCell).join(','));
    const csvContent = [headerLine, ...bodyLines].join('\n');
    
    await fs.writeFile(filePath, csvContent, 'utf8');
  }
}
export default CsvExporter;

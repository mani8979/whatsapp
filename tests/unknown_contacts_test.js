/**
 * UNKNOWN CONTACTS PIPELINE VERIFICATION TEST
 * ===========================================
 * Verifies that the new "Export Unknown Contacts" feature works end-to-end:
 * 1. Filter logic in isUnknownContact() and collectUnknownContacts()
 * 2. Normalization logic in normalizeUnknownContact() including name fallbacks
 * 3. ExcelExporter dynamic labeling (title and Card 2 text)
 * 4. Spec-compliant 8-digit ARGB format validation
 */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs-extra';
import { isUnknownContact, collectUnknownContacts } from '../src/services/contactCollector.js';
import { normalizeUnknownContact } from '../src/services/contactNormalizer.js';
import { exportData } from '../src/services/exportService.js';
import { getConfig } from '../src/config/config.js';
import logger from '../src/utils/logger.js';
import { initDb, closeDb } from '../src/storage/sqlite.js';

const OUT_PATH = path.resolve('./exports_test/unknown_contacts_test_export.xlsx');

const hr = (t = '') => {
  const b = '─'.repeat(60);
  console.log(`\n${b}`);
  if (t) console.log(`  ${t}`);
  console.log(b);
};

// 1. Mock contacts representing different categories
const mockRawContacts = [
  {
    // SAVED contact (should be filtered out)
    id: { _serialized: '919876543210@c.us', user: '919876543210', server: 'c.us' },
    number: '919876543210',
    name: 'Mani Babu',
    isMyContact: true,
    isWAContact: true,
  },
  {
    // Group chat (should be filtered out)
    id: { _serialized: '12036304@g.us', user: '12036304', server: 'g.us' },
    isGroup: true,
    isUser: false,
    isMyContact: false,
    isWAContact: true,
  },
  {
    // UNKNOWN contact with pushname
    id: { _serialized: '96891234567@c.us', user: '96891234567', server: 'c.us' },
    number: '91234567',
    pushname: 'Oman Friend',
    isMyContact: false,
    isWAContact: true,
    isBusiness: true,
  },
  {
    // UNKNOWN contact with NO name at all (should resolve to 'Unknown')
    id: { _serialized: '15550199@c.us', user: '15550199', server: 'c.us' },
    number: '15550199',
    isMyContact: false,
    isWAContact: true,
  }
];

// Mock WhatsApp Client Instance
const mockClient = {
  getContacts: async () => mockRawContacts
};

async function main() {
  hr('UNKNOWN CONTACTS FEATURE TEST');

  const config = getConfig({ account: 'test_unknown', silent: true });
  await logger.init(config);
  await initDb();

  // ── Step 1: Test collector filter logic ──────────────────────────
  hr('STEP 1 — collector filter logic');
  const checked = mockRawContacts.map(c => ({
    jid: c.id._serialized,
    isMyContact: c.isMyContact,
    isSaved: !c.isMyContact && c.id.server === 'c.us' && !c.isGroup,
    isUnknownFilter: isUnknownContact(c)
  }));
  console.log(JSON.stringify(checked, null, 2));

  // Ensure collectUnknownContacts returns only the 2 unknown contacts
  const collected = await collectUnknownContacts(mockClient, config);
  console.log(`\n  Raw contacts size: ${mockRawContacts.length}`);
  console.log(`  Collected unknown: ${collected.length}`);
  if (collected.length !== 2) {
    console.error('❌ FAIL: Expected exactly 2 unknown contacts');
    process.exit(1);
  }
  console.log('  ✅ Filter logic PASSED');

  // ── Step 2: Test normalizer name priority & fallback ─────────────
  hr('STEP 2 — normalizer priority & fallback');
  const normalized = collected.map(c => normalizeUnknownContact(c, config)).filter(Boolean);

  console.log(JSON.stringify(normalized, null, 2));

  if (normalized[0].displayName !== 'Oman Friend') {
    console.error(`❌ FAIL: Expected pushname "Oman Friend", got: ${normalized[0].displayName}`);
    process.exit(1);
  }
  if (normalized[1].displayName !== 'Unknown') {
    console.error(`❌ FAIL: Expected fallback "Unknown", got: ${normalized[1].displayName}`);
    process.exit(1);
  }
  console.log('  ✅ Normalizer logic PASSED');

  // ── Step 3: Run exportData and verify workbook elements ──────────
  hr('STEP 3 — Excel export & verification');
  await fs.ensureDir(path.dirname(OUT_PATH));
  const stats = {
    durationMs: 450,
    totalScanned: mockRawContacts.length,
    savedCount: normalized.length,
    businessCount: normalized.filter(c => c.isBusiness).length,
    personalCount: normalized.filter(c => !c.isBusiness).length,
    duplicatesRemoved: 0,
    invalidCount: 0,
    countriesCount: 2,
    incremental: false,
    exportType: 'unknown' // Trigger dynamic labels
  };

  await exportData(normalized, OUT_PATH, 'xlsx', stats, config);

  // Read back and inspect
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(OUT_PATH);
  const ws = workbook.getWorksheet('All Contacts');
  if (!ws) {
    console.error('❌ FAIL: Worksheet not found');
    process.exit(1);
  }

  // 1. Verify Dynamic Title Banner
  const titleVal = ws.getCell('A1').value;
  console.log(`\n  Title: "${titleVal}"`);
  if (!titleVal.includes('Unknown Contacts • 2 Leads')) {
    console.error(`❌ FAIL: Expected "Unknown Contacts" in title, got: ${titleVal}`);
    process.exit(1);
  }

  // 2. Verify Card 2 text
  const card2Val = ws.getCell('E4').value;
  console.log(`  Card 2: "${card2Val}"`);
  if (card2Val !== '✔ Unknown Contacts: 2') {
    console.error(`❌ FAIL: Expected "✔ Unknown Contacts: 2", got: ${card2Val}`);
    process.exit(1);
  }

  // 3. Verify Fallback "Unknown" in Data Row 2
  const nameColVal = ws.getCell('A8').value;
  console.log(`  Row 8 Col 1: "${nameColVal}"`);
  if (nameColVal !== 'Unknown') {
    console.error(`❌ FAIL: Expected display name to be fallback "Unknown", got: ${nameColVal}`);
    process.exit(1);
  }

  // 4. Verify 8-digit ARGB values
  const fills = [
    ws.getCell('A1').fill?.fgColor?.argb,
    ws.getCell('A1').font?.color?.argb,
    ws.getCell('E4').fill?.fgColor?.argb,
    ws.getCell('A6').fill?.fgColor?.argb,
  ];
  let fillsOk = true;
  fills.forEach(f => {
    if (!f || f.length !== 8) fillsOk = false;
  });
  console.log(`  ARGB fills: ${JSON.stringify(fills)}`);
  if (!fillsOk) {
    console.error('❌ FAIL: Some fills are not 8-digit ARGB format');
    process.exit(1);
  }

  // Cleanup
  await fs.remove(path.resolve('./exports_test'));
  await closeDb();
  console.log('\n  ✅ E2E Excel workbook inspections PASSED!');
  hr('TEST RUN SUCCESSFUL');
}

main().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});

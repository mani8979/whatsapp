import assert from 'assert';
import path from 'path';
import fs from 'fs-extra';
import { getConfig } from '../src/config/config.js';
import { initDb, closeDb, getContact } from '../src/storage/sqlite.js';
import { getExportHistory } from '../src/storage/history.js';
import { validateContact } from '../src/services/contactValidator.js';
import { normalizeContact } from '../src/services/contactNormalizer.js';
import { removeDuplicates } from '../src/services/duplicateRemover.js';
import { syncIncremental } from '../src/services/incrementalSync.js';
import { exportData } from '../src/services/exportService.js';
import logger from '../src/utils/logger.js';

async function runTests() {
  // Clean up any leftovers from previous failed test runs
  await fs.remove(path.resolve('./storage'));
  await fs.remove(path.resolve('./exports_test'));

  console.log('=========================================');
  console.log('       RUNNING PIPELINE UNIT TESTS       ');
  console.log('=========================================\n');

  // Test 1: Configuration Resolve
  console.log('Test 1: Resolving Configuration...');
  const config = getConfig({
    account: 'test_env',
    format: 'xlsx',
    silent: true,
    verbose: false,
    overwrite: true,
    output: './exports_test',
    sessionPath: './sessions_test'
  });

  assert.strictEqual(config.account, 'test_env');
  assert.strictEqual(config.silent, true);
  assert.strictEqual(config.overwrite, true);
  assert.ok(config.sessionPath.endsWith('sessions_test\\test_env') || config.sessionPath.endsWith('sessions_test/test_env'));
  console.log('  ✓ Config resolved correctly.');

  // Initialize logger
  await logger.init(config);

  // Test 2: Database Initialization and schema bootstrapping
  console.log('\nTest 2: Initializing SQLite Database...');
  await initDb();
  console.log('  ✓ SQLite initialized and schema loaded.');

  // Test 3: Contact Validation
  console.log('\nTest 3: Contact Validation...');
  const mockRawValid = {
    id: { _serialized: '919876543210@c.us', user: '919876543210', server: 'c.us' },
    number: '919876543210',
    name: 'Mani Babu',
    pushname: 'Mani',
    isMyContact: true,
    isGroup: false,
    isUser: true,
    isWAContact: true
  };
  
  const mockRawInvalidJid = {
    id: { _serialized: 'invalid_jid@g.us', user: 'invalid_jid', server: 'g.us' },
    isMyContact: true
  };

  const validationValid = validateContact(mockRawValid);
  const validationInvalid = validateContact(mockRawInvalidJid);

  assert.strictEqual(validationValid.status, 'Valid');
  assert.strictEqual(validationInvalid.status, 'Error');
  console.log('  ✓ Contact Validator correctly flags status.');

  // Test 4: Contact Normalization
  console.log('\nTest 4: Contact Normalization (Name resolve and Oman fallback)...');
  
  // Oman number without country code
  const mockOmanRaw = {
    id: { _serialized: '96891234567@c.us', user: '96891234567', server: 'c.us' },
    number: '91234567', // local number
    name: 'Oman Friend',
    isMyContact: true,
    isBusiness: true
  };
  
  const normalized = normalizeContact(mockOmanRaw, config);
  assert.ok(normalized);
  assert.strictEqual(normalized.displayName, 'Oman Friend');
  assert.strictEqual(normalized.firstName, 'Oman');
  assert.strictEqual(normalized.lastName, 'Friend');
  assert.strictEqual(normalized.phoneNumber, '+968 9123 4567');
  assert.strictEqual(normalized.e164, '+96891234567');
  assert.strictEqual(normalized.country, 'Oman');
  assert.strictEqual(normalized.isBusiness, true);
  console.log('  ✓ Normalizer resolved priority names and parsed Oman prefix.');

  // Test 5: Deduplication
  console.log('\nTest 5: Contact Deduplication...');
  const mockList = [
    { jid: '1@c.us', phoneNumber: '+1 555-555-5555', e164: '+15555555555', displayName: 'One' },
    { jid: '1@c.us', phoneNumber: '+1 555-555-5555', e164: '+15555555555', displayName: 'One duplicate JID' },
    { jid: '2@c.us', phoneNumber: '+1 555-555-5555', e164: '+15555555555', displayName: 'Two duplicate phone' },
    { jid: '3@c.us', phoneNumber: '+1 555-555-6666', e164: '+15555556666', displayName: 'Three' }
  ];

  const unique = removeDuplicates(mockList);
  assert.strictEqual(unique.length, 2);
  assert.strictEqual(unique[0].displayName, 'One');
  assert.strictEqual(unique[1].displayName, 'Three');
  console.log('  ✓ Deduplicator removes overlapping phones and JIDs.');

  // Test 6: Incremental Sync
  console.log('\nTest 6: Database Incremental Sync...');
  const testContact = {
    jid: '9999999999@c.us',
    phoneNumber: '+999 99999999',
    e164: '+9999999999',
    displayName: 'Test Sync User',
    country: 'Unknown',
    countryCode: 'XX',
    isBusiness: false,
    isBlocked: false,
    labels: ''
  };

  // Sync first time (should be added)
  const sync1 = await syncIncremental([testContact], config);
  assert.strictEqual(sync1.added, 1);
  
  // Verify it exists in SQLite
  const dbRecord1 = await getContact(testContact.jid);
  assert.ok(dbRecord1);
  assert.strictEqual(dbRecord1.name, 'Test Sync User');
  console.log('  Debug: dbRecord1 from SQLite:', dbRecord1);

  // Sync second time without changes (should be unchanged)
  const sync2 = await syncIncremental([testContact], config);
  assert.strictEqual(sync2.unchanged, 1);
  assert.strictEqual(sync2.added, 0);

  // Modify user name and sync third time (should detect modification)
  const testContactModified = { ...testContact, displayName: 'Test Sync User (Modified Name)' };
  
  const { calculateContactHash } = await import('../src/utils/hash.js');
  console.log('  Debug: Hash 1 (original):', calculateContactHash(testContact));
  console.log('  Debug: Hash 2 (modified):', calculateContactHash(testContactModified));
  console.log('  Debug: DB Hash:', dbRecord1.hash);
  
  const sync3 = await syncIncremental([testContactModified], config);
  console.log('  Debug: sync3 results:', sync3);
  assert.strictEqual(sync3.modified, 1);
  
  // Verify update in SQLite
  const dbRecord2 = await getContact(testContact.jid);
  assert.strictEqual(dbRecord2.name, 'Test Sync User (Modified Name)');
  console.log('  ✓ Incremental Sync detects new, modified, and identical hashes in database.');

  // Test 7: Exporter plugin routing and backup creation
  console.log('\nTest 7: Exporting to file formats (XLSX, CSV, JSON)...');
  const contactsToExport = [normalized, testContactModified];
  const stats = {
    durationMs: 400,
    totalScanned: 10,
    savedCount: contactsToExport.length,
    businessCount: 1,
    personalCount: 1,
    duplicatesRemoved: 1,
    invalidCount: 0,
    countriesCount: 2,
    incremental: false
  };

  const outputDir = path.resolve(config.exportsDir);
  const xlsxPath = path.join(outputDir, 'test_export.xlsx');
  const csvPath = path.join(outputDir, 'test_export.csv');
  const jsonPath = path.join(outputDir, 'test_export.json');

  // Write files
  await exportData(contactsToExport, xlsxPath, 'xlsx', stats, config);
  await exportData(contactsToExport, csvPath, 'csv', stats, config);
  await exportData(contactsToExport, jsonPath, 'json', stats, config);

  assert.ok(fs.existsSync(xlsxPath));
  assert.ok(fs.existsSync(csvPath));
  assert.ok(fs.existsSync(jsonPath));
  console.log('  ✓ Exporters generated file outputs.');

  // Test 8: Export History Log
  console.log('\nTest 8: Reading Export History...');
  const { addHistoryRecord } = await import('../src/storage/history.js');
  await addHistoryRecord({
    filename: 'test_export.xlsx',
    contactsCount: 2,
    fileSizeBytes: 1024,
    durationMs: 400,
    cliParameters: '--xlsx',
    status: 'Success'
  });
  
  const history = await getExportHistory(5);
  assert.ok(history.length > 0);
  assert.strictEqual(history[0].filename, 'test_export.xlsx');
  assert.strictEqual(history[0].status, 'Success');
  console.log('  ✓ History logs logged and retrieved from SQLite.');

  // Clean up
  console.log('\nCleaning test files...');
  await closeDb();
  await fs.remove(outputDir);
  // Remove temporary storage folder
  await fs.remove(path.resolve('./storage'));
  console.log('  ✓ Cleanup complete.');

  console.log('\n=========================================');
  console.log('      ALL PIPELINE TESTS PASSED OK       ');
  console.log('=========================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST RUN CRASHED:', err);
  process.exit(1);
});

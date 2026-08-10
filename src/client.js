import path from 'path';
import fs from 'fs-extra';
import { getConfig } from './config/config.js';
import { createWhatsappClient } from './client/whatsappClient.js';
import { collectSavedContacts } from './services/contactCollector.js';
import { validateContact } from './services/contactValidator.js';
import { normalizeContact } from './services/contactNormalizer.js';
import { removeDuplicates } from './services/duplicateRemover.js';
import { syncIncremental } from './services/incrementalSync.js';
import { exportData } from './services/exportService.js';
import { initDb, closeDb } from './storage/sqlite.js';
import { addHistoryRecord } from './storage/history.js';
import eventBus from './utils/eventBus.js';
import logger from './utils/logger.js';
import { drawProgressBar } from './utils/progress.js';
import qrcodeTerminal from 'qrcode-terminal';

// CLI Help Manual
function printHelp() {
  console.log(`
WhatsApp Saved Contacts Exporter CLI (WaVault Enterprise Edition)

Goal:
  Fetches, normalizes, deduplicates, and exports saved WhatsApp contacts to 
  Excel (.xlsx), CSV, or JSON formats using SQLite and pipeline streams.

Usage:
  node src/client.js [options]

Options:
  --account=NAME       Select a isolated WhatsApp session account (e.g. marketing, sales)
  --incremental        Only export contacts added or modified since the last export run
  --country=ISO        Filter contacts by country code (e.g. IN, US, OM)
  --fallback-country   ISO-2 fallback country code when parsing local phone formats (default: OM)
  --business-only      Only export business accounts
  --personal-only      Only export personal accounts
  --exclude-business   Skip business accounts
  --exclude-empty-name Skip contacts with empty display names
  --name-search=TEXT   Search for specific text string in names
  --sort=name          Sort contacts alphabetically by Name
  --sort=country       Sort contacts alphabetically by Country
  --limit=NUMBER       Limit number of contacts to export
  --offset=NUMBER      Skip a number of contacts before exporting
  --csv                Export in CSV format
  --json               Export in JSON format
  --xlsx               Export in Excel format (default)
  --output=DIR         Customize the output directory (default: ./exports)
  --session-path=PATH  Customize the session directory (default: ./sessions)
  --dry-run            Simulate sync process and display stats without writing report file
  --overwrite          Overwrite existing exports instead of creating backups
  --verbose            Display detailed debug logging in console
  --silent             Suppress progress bar and console log prints
  --help, -h           Show this manual
`);
}

async function run() {
  const startTime = Date.now();

  // 1. Resolve configurations
  const args = process.argv.slice(2);
  const cliArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('--account=')) {
      cliArgs.account = arg.split('=')[1];
    } else if (arg === '--account') {
      cliArgs.account = args[++i];
    } else if (arg === '--incremental') {
      cliArgs.incremental = true;
    } else if (arg.startsWith('--country=')) {
      cliArgs.country = arg.split('=')[1].toUpperCase();
    } else if (arg === '--country') {
      cliArgs.country = args[++i]?.toUpperCase();
    } else if (arg.startsWith('--fallback-country=')) {
      cliArgs.fallbackCountry = arg.split('=')[1].toUpperCase();
    } else if (arg === '--fallback-country') {
      cliArgs.fallbackCountry = args[++i]?.toUpperCase();
    } else if (arg === '--business-only') {
      cliArgs.businessOnly = true;
    } else if (arg === '--personal-only') {
      cliArgs.personalOnly = true;
    } else if (arg === '--exclude-business') {
      cliArgs.excludeBusiness = true;
    } else if (arg === '--exclude-empty-name') {
      cliArgs.excludeEmptyName = true;
    } else if (arg.startsWith('--name-search=')) {
      cliArgs.nameSearch = arg.split('=')[1];
    } else if (arg === '--name-search') {
      cliArgs.nameSearch = args[++i];
    } else if (arg.startsWith('--sort=')) {
      cliArgs.sort = arg.split('=')[1].toLowerCase();
    } else if (arg === '--sort') {
      cliArgs.sort = args[++i]?.toLowerCase();
    } else if (arg.startsWith('--limit=')) {
      cliArgs.limit = args[i].split('=')[1];
    } else if (arg === '--limit') {
      cliArgs.limit = args[++i];
    } else if (arg.startsWith('--offset=')) {
      cliArgs.offset = args[i].split('=')[1];
    } else if (arg === '--offset') {
      cliArgs.offset = args[++i];
    } else if (arg === '--csv') {
      cliArgs.format = 'csv';
    } else if (arg === '--json') {
      cliArgs.format = 'json';
    } else if (arg === '--xlsx') {
      cliArgs.format = 'xlsx';
    } else if (arg.startsWith('--output=')) {
      cliArgs.output = arg.split('=')[1];
    } else if (arg === '--output') {
      cliArgs.output = args[++i];
    } else if (arg.startsWith('--session-path=')) {
      cliArgs.sessionPath = arg.split('=')[1];
    } else if (arg === '--session-path') {
      cliArgs.sessionPath = args[++i];
    } else if (arg === '--dry-run') {
      cliArgs.dryRun = true;
    } else if (arg === '--overwrite') {
      cliArgs.overwrite = true;
    } else if (arg === '--verbose') {
      cliArgs.verbose = true;
    } else if (arg === '--silent') {
      cliArgs.silent = true;
    }
  }

  const config = getConfig(cliArgs);

  // Initialize logger first
  await logger.init(config);

  // 2. Initialize database
  try {
    await initDb();
  } catch (dbErr) {
    logger.error('Failed to open/initialize SQLite database', dbErr);
    process.exit(1);
  }

  // 3. Load resume checkpoints if they exist
  const checkpointPath = path.join(config.exportsDir, '.export_state.json');
  const cachePath = path.join(config.exportsDir, '.export_cache.json');

  let processedContacts = [];
  const processedJids = new Set();

  if (fs.existsSync(checkpointPath) && fs.existsSync(cachePath)) {
    try {
      processedContacts = await fs.readJson(cachePath);
      processedContacts.forEach(c => processedJids.add(c.jid));
      logger.info(`Found interrupted progress. Loaded ${processedContacts.length} contacts from cache checkpoint.`);
    } catch (e) {
      logger.error('Failed to read checkpoint cache, resetting clean state.', e);
    }
  }

  // 4. Bind Event Bus subscribers to display outputs
  eventBus.on('client:qr', (qr) => {
    if (config.silent) return;
    console.log('\n======================================================');
    console.log('SCAN THIS QR CODE TO LOG INTO WHATSAPP:');
    qrcodeTerminal.generate(qr, { small: true });
    console.log('======================================================\n');
  });

  eventBus.on('client:authenticated', () => {
    logger.info('Connected');
  });

  eventBus.on('collector:progress', ({ current, total }) => {
    drawProgressBar(current, total, 'Syncing from WhatsApp Web...', config.silent);
  });

  let duplicatesRemovedCount = 0;
  eventBus.on('deduplicator:duplicate', () => {
    duplicatesRemovedCount++;
  });

  // Track client initialized state for exit cleanups
  let client = null;
  const cleanup = async () => {
    logger.info('Shutting down Exporter Client process...');
    if (client) {
      try {
        await client.destroy();
      } catch (err) {
        // Safe discard
      }
    }
    await closeDb();
    process.exit(0);
  };

  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);

  // 5. Connect WhatsApp Client
  try {
    client = createWhatsappClient(config);
    await client.initialize();
  } catch (err) {
    logger.error('WhatsApp browser connection failed to initialize', err);
    await closeDb();
    process.exit(1);
  }

  eventBus.once('client:ready', async () => {
    logger.info('Fetching contacts list...');

    try {
      // Step A: Collect Raw contacts
      const rawSavedContacts = await collectSavedContacts(client, config);

      const totalRawCount = rawSavedContacts.length;
      let invalidCount = 0;
      let nameWarningsCount = 0;

      // Ensure target exports dir exists to write checkpoints
      await fs.ensureDir(config.exportsDir);

      // Step B: Loop to Validate & Normalize
      for (let i = 0; i < totalRawCount; i++) {
        const contact = rawSavedContacts[i];
        const jid = contact.id?._serialized;

        // Skip if already resumed
        if (processedJids.has(jid)) {
          continue;
        }

        // Draw normalization progress
        if (!config.silent && (i % 25 === 0 || i === totalRawCount - 1)) {
          drawProgressBar(i + 1, totalRawCount, 'Normalizing contact records...');
        }

        // Validate
        const validation = validateContact(contact);
        if (validation.status === 'Error') {
          invalidCount++;
          logger.debug(`Validation Skip: ${validation.reason} | JID: ${jid}`);
          continue;
        }
        if (validation.status === 'Warning') {
          nameWarningsCount++;
          if (config.excludeEmptyName) {
            logger.debug(`Empty Name Skip: Excluding contact ${jid}`);
            continue;
          }
        }

        // Normalize
        const normalized = normalizeContact(contact, config);
        if (normalized) {
          processedContacts.push(normalized);
          processedJids.add(jid);

          // Update Checkpoint State
          try {
            await fs.writeJson(cachePath, processedContacts);
            await fs.writeJson(checkpointPath, {
              inProgress: true,
              totalRawCount,
              processedCount: processedContacts.length,
              timestamp: Date.now()
            });
          } catch (checkpointErr) {
            // Log checkpoint write warnings but don't stop
            logger.debug(`Checkpoint save failure: ${checkpointErr.message}`);
          }
        }

        if (i % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      // Step C: Deduplicate
      const uniqueContacts = removeDuplicates(processedContacts);

      // Step D: Incremental sync database checks
      const syncResults = await syncIncremental(uniqueContacts, config);
      let exportContacts = syncResults.exportList;

      // Step E: CLI Filters (Business accounts / countries etc.)
      if (config.businessOnly) {
        exportContacts = exportContacts.filter(c => c.isBusiness);
      }
      if (config.personalOnly) {
        exportContacts = exportContacts.filter(c => !c.isBusiness);
      }
      if (config.excludeBusiness) {
        exportContacts = exportContacts.filter(c => !c.isBusiness);
      }
      if (cliArgs.country) {
        exportContacts = exportContacts.filter(c => c.countryCode === cliArgs.country);
      }
      if (cliArgs.nameSearch) {
        const pattern = cliArgs.nameSearch.toLowerCase();
        exportContacts = exportContacts.filter(c =>
          c.displayName.toLowerCase().includes(pattern) ||
          c.pushName.toLowerCase().includes(pattern) ||
          c.shortName.toLowerCase().includes(pattern)
        );
      }

      // Sort
      if (config.sort === 'name') {
        exportContacts.sort((a, b) => a.displayName.localeCompare(b.displayName));
      } else if (config.sort === 'country') {
        exportContacts.sort((a, b) => a.country.localeCompare(b.country));
      }

      // Pagination Limits/Offsets
      if (config.offset > 0) {
        exportContacts = exportContacts.slice(config.offset);
      }
      if (config.limit !== null && config.limit > 0) {
        exportContacts = exportContacts.slice(0, config.limit);
      }

      // Step F: Export targets
      const format = config.format || 'xlsx';
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '_');
      const timeStr = now.toTimeString().substring(0, 5).replace(/:/g, '_');
      const ext = format === 'json' ? 'json' : (format === 'csv' ? 'csv' : 'xlsx');

      const filename = `Contacts_WaVault_Export_${dateStr}_${timeStr}.${ext}`;
      const filePath = path.join(config.exportsDir, filename);

      const durationMs = Date.now() - startTime;

      // Calculate basic statistics
      const businessCount = exportContacts.filter(c => c.isBusiness).length;
      const personalCount = exportContacts.length - businessCount;
      const countries = new Set(exportContacts.map(c => c.country).filter(Boolean));

      const stats = {
        durationMs,
        totalScanned: totalRawCount,
        savedCount: exportContacts.length,
        businessCount,
        personalCount,
        duplicatesRemoved: duplicatesRemovedCount,
        invalidCount,
        countriesCount: countries.size,
        incremental: config.incremental
      };

      let fileSizeBytes = 0;
      if (!config.dryRun) {
        logger.info(`Exporting ${format.toUpperCase()}...`);
        fileSizeBytes = await exportData(exportContacts, filePath, format, stats, config);

        // Log auditing records to History DB
        await addHistoryRecord({
          filename,
          contactsCount: exportContacts.length,
          fileSizeBytes,
          durationMs,
          cliParameters: process.argv.slice(2).join(' '),
          status: 'Success'
        });

        // Write report.json statistics summary
        const reportPath = path.join(config.exportsDir, 'report.json');
        const peakMemory = `${Math.round(process.memoryUsage().rss / (1024 * 1024))} MB`;

        const report = {
          total: totalRawCount,
          saved: exportContacts.length,
          duplicates: duplicatesRemovedCount,
          business: businessCount,
          personal: personalCount,
          countries: countries.size,
          executionTime: `${(durationMs / 1000).toFixed(1)} sec`,
          memoryPeak: peakMemory,
          filename,
          timestamp: now.toISOString()
        };
        await fs.writeJson(reportPath, report, { spaces: 2 });
      } else {
        logger.info('Dry run active: skipped document write.');
      }

      // Cleanup checkpoint states on successful completion
      await fs.remove(checkpointPath).catch(() => { });
      await fs.remove(cachePath).catch(() => { });

      // Display beautiful final stats block in command line
      const seconds = (durationMs / 1000).toFixed(1);
      const sizeFormatted = fileSizeBytes > 1024 * 1024
        ? `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${(fileSizeBytes / 1024).toFixed(1)} KB`;

      console.log('\n=========================================');
      console.log('           EXPORT COMPLETED');
      console.log('=========================================');
      console.log(`Saved Contacts     : ${exportContacts.length}`);
      console.log(`Business Accounts  : ${businessCount}`);
      console.log(`Personal Accounts  : ${personalCount}`);
      console.log(`Duplicates Removed : ${duplicatesRemovedCount}`);
      console.log(`Invalid Numbers    : ${invalidCount}`);
      console.log(`Unique Countries   : ${countries.size}`);
      console.log(`Execution Time     : ${seconds}s`);
      if (!config.dryRun) {
        console.log(`File Size          : ${sizeFormatted}`);
        console.log(`File Name          : ${filename}`);
        console.log(`Output Path        : ${filePath}`);
      }
      console.log('=========================================\n');
      console.log('Done.');

      // Safely close connection and exit CLI
      await client.destroy();
      await closeDb();
      process.exit(0);
    } catch (exportErr) {
      logger.error('Export execution pipeline crash occurred', exportErr);

      // Update History db with Failure record
      try {
        await addHistoryRecord({
          filename: 'N/A',
          contactsCount: 0,
          fileSizeBytes: 0,
          durationMs: Date.now() - startTime,
          cliParameters: process.argv.slice(2).join(' '),
          status: `Failed: ${exportErr.message}`
        });
      } catch (dbErr) {
        // Suppress SQLite error logging in terminal crashes
      }

      if (client) {
        try {
          await client.destroy();
        } catch (e) {
          // Suppress client shutdown error
        }
      }
      await closeDb();
      process.exit(1);
    }
  });
}

run().catch((err) => {
  console.error(`Fatal crash: ${err.message}`);
  process.exit(1);
});

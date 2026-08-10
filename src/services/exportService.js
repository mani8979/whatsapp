import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';
import eventBus from '../utils/eventBus.js';
import ExcelExporter from '../exporters/ExcelExporter.js';
import CsvExporter from '../exporters/CsvExporter.js';
import JsonExporter from '../exporters/JsonExporter.js';
import { markAsExported } from '../storage/sqlite.js';

/**
 * Routes contact exports to appropriate formatting plugins, handles file backups
 * to avoid data loss, and posts success signals to SQLite.
 * 
 * @param {Array<Object>} contacts Contacts to export
 * @param {string} filePath Target output path
 * @param {string} format Format style (xlsx, csv, json)
 * @param {Object} stats Execution statistics for metadata sheets
 * @param {Object} config Resolution configuration
 * @returns {Promise<number>} Size of the written file in bytes
 */
export async function exportData(contacts, filePath, format, stats, config) {
  eventBus.emit('export:started', { filePath, format });

  // Ensure parent directory exists
  await fs.ensureDir(path.dirname(filePath));

  // 1. Automatic backups if target file already exists
  if (fs.existsSync(filePath) && !config.overwrite) {
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '_');
    const backupPath = path.join(dir, `${base}_backup_${timestamp}${ext}`);
    
    try {
      await fs.copy(filePath, backupPath);
      logger.info(`Existing report backed up to: ${backupPath}`);
    } catch (backupErr) {
      logger.error(`Backup creation failed: ${backupErr.message}`);
    }
  }

  // 2. Resolve exporter plugin instance
  let exporter;
  switch (format.toLowerCase()) {
    case 'xlsx':
      exporter = new ExcelExporter();
      break;
    case 'csv':
      exporter = new CsvExporter();
      break;
    case 'json':
      exporter = new JsonExporter();
      break;
    default:
      throw new Error(`Unsupported exporter plugin format: ${format}`);
  }

  // 3. Perform export
  await exporter.prepare(filePath);
  await exporter.export(contacts, filePath, stats);
  await exporter.finish();

  // 4. Update file stats
  const fileStats = await fs.stat(filePath);
  const fileSize = fileStats.size;

  // 5. Update SQLite: Mark exported contacts lastExported timestamps
  const exportedJids = contacts.map(c => c.jid);
  if (exportedJids.length > 0) {
    await markAsExported(exportedJids, Date.now());
  }

  eventBus.emit('export:completed', { filePath, fileSize });
  return fileSize;
}

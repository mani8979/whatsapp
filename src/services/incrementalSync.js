import { getContact, saveContact, initDb } from '../storage/sqlite.js';
import { calculateContactHash } from '../utils/hash.js';
import eventBus from '../utils/eventBus.js';

/**
 * Performs incremental synchronization against the SQLite contacts database.
 * Computes MD5 signatures to detect modifications, updates stale records,
 * and compiles the list of contacts for exporting.
 * 
 * @param {Array<Object>} contacts Deduplicated normalized contacts
 * @param {Object} config Resolution configuration
 * @returns {Promise<Object>} Summary of sync operations and export target list
 */
export async function syncIncremental(contacts, config) {
  eventBus.emit('sync:started');
  
  // Guarantee active SQLite connection
  await initDb();

  const timestamp = Date.now();
  const results = {
    total: contacts.length,
    added: 0,
    modified: 0,
    unchanged: 0,
    exportList: []
  };

  for (const c of contacts) {
    const dbContact = await getContact(c.jid);
    const currentHash = calculateContactHash(c);

    if (!dbContact) {
      // New Contact: Insert record and add to export
      results.added++;
      await saveContact(c, currentHash, timestamp);
      results.exportList.push(c);
      eventBus.emit('sync:new', c);
    } else if (dbContact.hash !== currentHash) {
      // Stale Contact: Update record and add to export
      results.modified++;
      await saveContact(c, currentHash, timestamp);
      results.exportList.push(c);
      eventBus.emit('sync:modified', c);
    } else {
      // Match Found: No edits detected
      results.unchanged++;
      if (!config.incremental) {
        // If not in incremental mode, export all records anyway
        results.exportList.push(c);
      }
      eventBus.emit('sync:unchanged', c);
    }
  }

  eventBus.emit('sync:completed', results);
  return results;
}

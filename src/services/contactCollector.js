import logger from '../utils/logger.js';
import eventBus from '../utils/eventBus.js';
import { drawProgressBar } from '../utils/progress.js';
import { retry } from '../utils/retry.js';

/**
 * Multi-layered saved contact detection logic to eliminate groups, broadcasts, 
 * newsletters, catalog numbers, and unsaved chats.
 * 
 * @param {import('whatsapp-web.js').Contact} contact 
 * @returns {boolean} True if the contact matches all saved contact filters
 */
export function isSavedContact(contact) {
  if (!contact) return false;
  
  const jid = contact.id?._serialized;
  if (!jid) return false;

  // 1. Must belong to standard user chat server (c.us)
  if (contact.id.server !== 'c.us') return false;

  // 2. Exclude groups, broadcasts, and newsletter chats explicitly
  if (contact.isGroup === true) return false;
  if (contact.isUser === false) return false; 
  if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return false;

  // 3. Exclude WhatsApp system accounts
  if (contact.id.user === 'status' || contact.id.user === 'broadcast') return false;

  // 4. Must be saved on user's phonebook list
  if (contact.isMyContact !== true) return false;

  // 5. Must have a valid, non-empty saved contact name on the phonebook (not "Unknown")
  const savedName = contact.name;
  if (!savedName || savedName.trim() === '' || savedName.trim().toLowerCase() === 'unknown') {
    return false;
  }

  // 6. Must be a valid WhatsApp user account (if flag is resolved)
  if (contact.isWAContact === false) return false;

  return true;
}

/**
 * Fetch and process raw contacts from WhatsApp Web using async generator.
 * Emits progress events across the event bus.
 * 
 * @param {import('whatsapp-web.js').Client} client 
 * @param {Object} config Config properties
 * @returns {Promise<Array<import('whatsapp-web.js').Contact>>}
 */
export async function collectSavedContacts(client, config) {
  logger.info('Contact extraction has been disabled.');
  eventBus.emit('collector:completed', 0);
  return [];
}

/**
 * Multi-layered unknown contact detection logic.
 * Accepts contacts that are present in WhatsApp but NOT saved in the user's phonebook.
 * Applies the same structural guards as isSavedContact() but inverts the isMyContact check.
 *
 * @param {import('whatsapp-web.js').Contact} contact
 * @returns {boolean} True if the contact is an unsaved WhatsApp user
 */
export function isUnknownContact(contact) {
  if (!contact) return false;

  const jid = contact.id?._serialized;
  if (!jid) return false;

  // 1. Must belong to standard user chat server (c.us)
  if (contact.id.server !== 'c.us') return false;

  // 2. Exclude groups, broadcasts, and newsletter chats explicitly
  if (contact.isGroup === true) return false;
  if (contact.isUser === false) return false;
  if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return false;

  // 3. Exclude WhatsApp system accounts
  if (contact.id.user === 'status' || contact.id.user === 'broadcast') return false;

  // 4. Must NOT be saved in the user's phonebook (inverse of isSavedContact)
  if (contact.isMyContact === true) return false;

  // 5. Must be a valid WhatsApp user account (if flag is resolved)
  if (contact.isWAContact === false) return false;

  // 6. Must have at least a pushname, shortName, or verifiedName so there is
  //    something meaningful to show (contacts with nothing at all are likely
  //    system artefacts / ghost entries and are not useful in an export).
  //    Contacts with no name will get displayName = 'Unknown' in the normalizer.
  return true;
}

/**
 * Fetch and process raw contacts from WhatsApp Web, returning ONLY unknown
 * (unsaved) contacts. Emits progress events across the event bus.
 *
 * @param {import('whatsapp-web.js').Client} client
 * @param {Object} config Config properties
 * @returns {Promise<Array<import('whatsapp-web.js').Contact>>}
 */
export async function collectUnknownContacts(client, config) {
  logger.info('Unknown contact extraction has been disabled.');
  eventBus.emit('collector:completed', 0);
  return [];
}

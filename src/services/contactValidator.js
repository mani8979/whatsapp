import { isValidJid } from '../utils/phone.js';

/**
 * Validates raw WhatsApp contact records before normalization.
 * Filters out unsaved and unknown name accounts.
 * 
 * @param {import('whatsapp-web.js').Contact} contact Raw contact object
 * @returns {Object} Validation result { status: 'Valid'|'Warning'|'Error', reason: string }
 */
export function validateContact(contact) {
  if (!contact) {
    return { status: 'Error', reason: 'Null or undefined contact entry' };
  }

  const jid = contact.id?._serialized;
  if (!jid) {
    return { status: 'Error', reason: 'Missing JID identifier' };
  }

  // 1. Check JID structure
  if (!isValidJid(jid)) {
    return { status: 'Error', reason: `Malformed JID format: ${jid}` };
  }

  // 2. Check phone number user string
  const number = contact.number || contact.id.user;
  if (!number || number.trim() === '') {
    return { status: 'Error', reason: 'Empty phone number digits' };
  }

  // 3. Name check - Must have a valid saved name on the phonebook (cannot be empty or "Unknown")
  const savedName = contact.name;
  if (!savedName || savedName.trim() === '' || savedName.trim().toLowerCase() === 'unknown') {
    return { status: 'Error', reason: 'Missing, empty, or Unknown saved contact name' };
  }

  return { status: 'Valid', reason: '' };
}
export default validateContact;

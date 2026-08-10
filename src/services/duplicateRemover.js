import eventBus from '../utils/eventBus.js';

/**
 * Deduplicates contacts across multiple fields: JID, formatted phone, and E164 string.
 * This guarantees that similar entries are collapsed into a single entity.
 * 
 * @param {Array<Object>} contacts Normalized contacts array
 * @returns {Array<Object>} Unique contacts
 */
export function removeDuplicates(contacts) {
  eventBus.emit('deduplicator:started');

  const unique = [];
  const seenJids = new Set();
  const seenPhones = new Set();
  const seenE164s = new Set();

  for (const c of contacts) {
    const jid = c.jid;
    const phone = c.phoneNumber;
    const e164 = c.e164;

    const isDuplicate = (
      seenJids.has(jid) ||
      (phone && seenPhones.has(phone)) ||
      (e164 && seenE164s.has(e164))
    );

    if (isDuplicate) {
      eventBus.emit('deduplicator:duplicate', c);
      continue;
    }

    seenJids.add(jid);
    if (phone) seenPhones.add(phone);
    if (e164) seenE164s.add(e164);

    unique.push(c);
  }

  eventBus.emit('deduplicator:completed', {
    original: contacts.length,
    unique: unique.length,
    duplicatesRemoved: contacts.length - unique.length
  });

  return unique;
}

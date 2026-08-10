import crypto from 'crypto';

/**
 * Calculates a stable MD5 hash of contact data fields to detect changes.
 * Sorts key fields to ensure consistent hashes for identical data.
 * 
 * @param {Object} contact Normalized contact properties
 * @returns {string} Calculated MD5 hash hex string
 */
export function calculateContactHash(contact) {
  if (!contact) return '';

  const signature = {
    jid: contact.jid || '',
    name: contact.displayName || '',
    phone: contact.phoneNumber || '',
    e164: contact.e164 || '',
    country: contact.country || '',
    isBusiness: contact.isBusiness ? 1 : 0,
    isBlocked: contact.isBlocked ? 1 : 0,
    labels: contact.labels || ''
  };

  return crypto
    .createHash('md5')
    .update(JSON.stringify(signature))
    .digest('hex');
}

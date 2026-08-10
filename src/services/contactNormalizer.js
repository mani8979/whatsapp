import { normalizePhone } from '../utils/phone.js';
import { getCountryName } from '../utils/country.js';
import eventBus from '../utils/eventBus.js';

/**
 * Normalises a raw WhatsApp contact object into a clean structured profile.
 * Applies name priority resolution matching WhatsApp client:
 * Saved Contact Name -> Push Name -> Short Name -> Verified Business Name
 * If all are empty or resolve to "Unknown", the contact is skipped.
 * 
 * @param {Object} contact Raw contact from WhatsApp Web
 * @param {Object} config resolved configuration settings
 * @returns {Object|null} Normalized contact record
 */
export function normalizeContact(contact, config) {
  if (!contact || !contact.id) return null;
  
  const jid = contact.id._serialized;
  const rawNumber = contact.number || contact.id.user;
  
  // Normalize phone details
  const phoneData = normalizePhone(rawNumber, jid, config.fallbackCountry);
  if (!phoneData) {
    eventBus.emit('normalizer:error', { jid, reason: 'Failed phone normalization' });
    return null;
  }

  // Resolve display name prioritizing phonebook name
  const resolvedName = (
    contact.name ||
    contact.pushname ||
    contact.shortName ||
    contact.verifiedName ||
    ''
  ).trim();

  // Strict skip check
  if (!resolvedName || resolvedName.toLowerCase() === 'unknown') {
    eventBus.emit('normalizer:error', { jid, reason: 'Empty or Unknown resolved name' });
    return null;
  }

  // First & Last Name splitting
  const nameParts = resolvedName.split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const country = getCountryName(phoneData.countryCode);

  // Labels list if available
  const labels = Array.isArray(contact.labels)
    ? contact.labels.map(l => typeof l === 'object' ? (l.name || JSON.stringify(l)) : l).join(', ')
    : '';

  const normalized = {
    displayName: resolvedName,
    firstName,
    lastName,
    pushName: contact.pushname || '',
    shortName: contact.shortName || firstName,
    phoneNumber: phoneData.phone,
    e164: phoneData.e164,
    country,
    countryCode: phoneData.countryCode,
    nationalNumber: phoneData.nationalNumber,
    isBusiness: !!contact.isBusiness,
    isEnterprise: !!contact.isEnterprise,
    isVerified: !!contact.isVerified,
    isMyContact: !!contact.isMyContact,
    isBlocked: !!contact.isBlocked,
    labels,
    lastUpdated: Date.now(),
    whatsappId: contact.id.user,
    jid: jid
  };

  eventBus.emit('normalizer:normalized', normalized);
  return normalized;
}
export default normalizeContact;

/**
 * Normalises a raw WhatsApp unknown (unsaved) contact into a clean structured profile.
 * Unlike normalizeContact(), this function ACCEPTS contacts with no saved name,
 * substituting 'Unknown' as the display name instead of returning null.
 *
 * Name resolution priority:
 *   pushname → shortName → verifiedName → 'Unknown'
 *
 * @param {Object} contact Raw contact from WhatsApp Web
 * @param {Object} config  Resolved configuration settings
 * @returns {Object|null} Normalized contact record, or null if phone is invalid
 */
export function normalizeUnknownContact(contact, config) {
  if (!contact || !contact.id) return null;

  const jid = contact.id._serialized;
  const rawNumber = contact.number || contact.id.user;

  if (jid.endsWith('@lid')) {
    const resolvedName = (
      contact.pushname ||
      contact.shortName ||
      contact.verifiedName ||
      contact.name ||
      ''
    ).trim() || 'Unknown';

    const nameParts = resolvedName === 'Unknown' ? ['Unknown', ''] : resolvedName.split(/\s+/);
    const firstName = nameParts[0] || 'Unknown';
    const lastName  = nameParts.slice(1).join(' ') || '';

    let phone = rawNumber;
    let e164 = rawNumber;
    
    if (contact.displayNameLID) {
      phone = contact.displayNameLID.replace(/∙/g, '*');
      e164 = phone.replace(/\s+/g, '');
    } else {
      phone = '+' + rawNumber;
      e164 = '+' + rawNumber;
    }

    return {
      displayName:   resolvedName,
      firstName,
      lastName,
      pushName:      contact.pushname || '',
      shortName:     contact.shortName || firstName,
      phoneNumber:   phone,
      e164:          e164,
      country:       'Unknown',
      countryCode:   '',
      nationalNumber:'',
      isBusiness:    !!contact.isBusiness,
      isEnterprise:  !!contact.isEnterprise,
      isVerified:    !!contact.isVerified,
      isMyContact:   false,
      isBlocked:     !!contact.isBlocked,
      labels:        '',
      lastUpdated:   Date.now(),
      whatsappId:    contact.id.user,
      jid:           jid,
      hash:          null,
    };
  }

  // Normalize phone details — still required even for unknown contacts
  const phoneData = normalizePhone(rawNumber, jid, config.fallbackCountry);
  if (!phoneData) {
    eventBus.emit('normalizer:error', { jid, reason: 'Failed phone normalization' });
    return null;
  }

  // Resolve display name — pushname is the most reliable source for unknown contacts.
  // Fall back to 'Unknown' instead of returning null.
  const resolvedName = (
    contact.pushname ||
    contact.shortName ||
    contact.verifiedName ||
    contact.name ||
    ''
  ).trim() || 'Unknown';

  // First & Last Name splitting
  const nameParts = resolvedName === 'Unknown' ? ['Unknown', ''] : resolvedName.split(/\s+/);
  const firstName = nameParts[0] || 'Unknown';
  const lastName  = nameParts.slice(1).join(' ') || '';

  const country = getCountryName(phoneData.countryCode);

  const labels = Array.isArray(contact.labels)
    ? contact.labels.map(l => typeof l === 'object' ? (l.name || JSON.stringify(l)) : l).join(', ')
    : '';

  const normalized = {
    displayName:   resolvedName,
    firstName,
    lastName,
    pushName:      contact.pushname || '',
    shortName:     contact.shortName || firstName,
    phoneNumber:   phoneData.phone,
    e164:          phoneData.e164,
    country,
    countryCode:   phoneData.countryCode,
    nationalNumber:phoneData.nationalNumber,
    isBusiness:    !!contact.isBusiness,
    isEnterprise:  !!contact.isEnterprise,
    isVerified:    !!contact.isVerified,
    isMyContact:   false,   // Always false — this is an unknown contact
    isBlocked:     !!contact.isBlocked,
    labels,
    lastUpdated:   Date.now(),
    whatsappId:    contact.id.user,
    jid:           jid,
    hash:          null,    // Unknown contacts are not in SQLite — no hash available
  };

  eventBus.emit('normalizer:normalized', normalized);
  return normalized;
}

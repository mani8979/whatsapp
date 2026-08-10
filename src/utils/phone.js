import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Validates whether a WhatsApp JID matches a standard individual contact format.
 * @param {string} jid WhatsApp JID (e.g. 919876543210@c.us)
 * @returns {boolean} True if valid
 */
export function isValidJid(jid) {
  if (!jid || typeof jid !== 'string') return false;
  if (!jid.endsWith('@c.us')) return false;
  const user = jid.split('@')[0];
  // WhatsApp user IDs are numeric digits, generally 7 to 15 digits long
  return /^\d{7,15}$/.test(user);
}

/**
 * Normalises phone numbers using libphonenumber-js, implementing robust fallbacks for
 * countries with digit anomalies (e.g. Oman numbers missing country calling code '968')
 * 
 * @param {string} number Raw phone number from address book/chat
 * @param {string} jid WhatsApp JID (e.g. 96891234567@c.us)
 * @param {string} [fallbackCountry='OM'] Default country ISO-2 fallback
 * @returns {Object|null} Normalised phone properties
 */
export function normalizePhone(number, jid, fallbackCountry = 'OM') {
  // Extract base digits from JID first as it is the most reliable source
  let jidDigits = '';
  if (jid && typeof jid === 'string') {
    jidDigits = jid.split('@')[0].replace(/\D/g, '');
  }

  // Clean raw number digits
  let numberDigits = '';
  if (number) {
    numberDigits = String(number).replace(/\D/g, '');
  }

  // Choose the primary digit source (prefer JID digits since they contain country codes)
  const baseDigits = jidDigits || numberDigits;
  if (!baseDigits) return null;

  // 1. Attempt parsing directly by prepending '+' (works if baseDigits contains the country code)
  try {
    const parsedDirect = parsePhoneNumberFromString(`+${baseDigits}`);
    if (parsedDirect && parsedDirect.isValid()) {
      return {
        phone: parsedDirect.format('INTERNATIONAL'),
        e164: parsedDirect.number,
        countryCode: parsedDirect.country || 'UNKNOWN',
        countryCallingCode: parsedDirect.countryCallingCode,
        nationalNumber: parsedDirect.nationalNumber,
      };
    }
  } catch (err) {
    // Fail silently, proceed to next strategies
  }

  // 2. Local fallback rule: If it starts with a country-specific local prefix or fails direct parsing.
  // E.g., Oman numbers often start with 9, 7, 2, etc. (without country prefix).
  // If baseDigits matches standard length of fallback country, try parsing it with fallback country code.
  try {
    const parsedWithFallback = parsePhoneNumberFromString(baseDigits, fallbackCountry);
    if (parsedWithFallback && parsedWithFallback.isValid()) {
      return {
        phone: parsedWithFallback.format('INTERNATIONAL'),
        e164: parsedWithFallback.number,
        countryCode: parsedWithFallback.country || fallbackCountry,
        countryCallingCode: parsedWithFallback.countryCallingCode,
        nationalNumber: parsedWithFallback.nationalNumber,
      };
    }
  } catch (err) {
    // Fail silently
  }

  // 3. Prefix detection fallback: Guess country code based on digits prefix
  let guessedCountryCode = 'UNKNOWN';
  let guessedCallingCode = '';
  let nationalNumber = baseDigits;

  if (baseDigits.startsWith('968')) {
    guessedCountryCode = 'OM';
    guessedCallingCode = '968';
    nationalNumber = baseDigits.substring(3);
  } else if (baseDigits.startsWith('91')) {
    guessedCountryCode = 'IN';
    guessedCallingCode = '91';
    nationalNumber = baseDigits.substring(2);
  } else if (baseDigits.startsWith('1')) {
    guessedCountryCode = 'US';
    guessedCallingCode = '1';
    nationalNumber = baseDigits.substring(1);
  } else if (baseDigits.startsWith('44')) {
    guessedCountryCode = 'GB';
    guessedCallingCode = '44';
    nationalNumber = baseDigits.substring(2);
  }

  // 4. Ultimate fallback: Return structured original digit string so we never lose a contact
  return {
    phone: guessedCallingCode ? `+${guessedCallingCode} ${nationalNumber}` : `+${baseDigits}`,
    e164: `+${baseDigits}`,
    countryCode: guessedCountryCode,
    countryCallingCode: guessedCallingCode,
    nationalNumber: nationalNumber,
  };
}

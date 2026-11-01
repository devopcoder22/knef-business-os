const E164_REGEX = /^\+[1-9]\d{6,14}$/;

// Country-code prefix map for common markets
const COUNTRY_DIALCODES: Record<string, string> = {
  NG: '234',
  GH: '233',
  KE: '254',
  ZA: '27',
  US: '1',
  GB: '44',
};

/**
 * Normalizes a phone number to E.164 format (+[country][number]).
 * Returns null if the number cannot be normalized.
 * countryCode defaults to 'NG' (Nigeria) for backward compatibility.
 */
export function normalizeToE164(phone: string, countryCode = 'NG'): string | null {
  if (!phone) return null;

  // Strip all non-digit characters except leading +
  let cleaned = phone.trim();
  const hasPlus = cleaned.startsWith('+');
  cleaned = cleaned.replace(/\D/g, '');

  if (!cleaned) return null;

  // Already E.164-like (had +, 7–15 digits)
  if (hasPlus && cleaned.length >= 7 && cleaned.length <= 15) {
    const candidate = `+${cleaned}`;
    return E164_REGEX.test(candidate) ? candidate : null;
  }

  const dialCode = COUNTRY_DIALCODES[countryCode.toUpperCase()];
  if (!dialCode) return null;

  // Remove leading 0 (common in many countries for local dialing)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  // If it already starts with the dial code
  if (cleaned.startsWith(dialCode)) {
    const candidate = `+${cleaned}`;
    return E164_REGEX.test(candidate) ? candidate : null;
  }

  const candidate = `+${dialCode}${cleaned}`;
  return E164_REGEX.test(candidate) ? candidate : null;
}

/** Strips the + prefix to produce the wa_id format Meta uses (no +). */
export function toWaId(e164: string): string {
  return e164.startsWith('+') ? e164.slice(1) : e164;
}

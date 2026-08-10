/**
 * Normalize a phone number to international format for wa.me links and WhatsApp API.
 * All clients are in Martinique/Antilles — default country code is +596.
 * Handles:
 *   0696XXXXXX  → 596696XXXXXX  (Martinique mobile, local format)
 *   0697XXXXXX  → 596697XXXXXX  (Martinique SFR mobile)
 *   0596XXXXXX  → 596596XXXXXX  (Martinique landline)
 *   0690/0691   → 590...        (Guadeloupe)
 *   696XXXXXX   → 596696XXXXXX  (9-digit without leading 0)
 *   +596...     → 596...        (already correct)
 *   33696XXXXXX → 596696XXXXXX  (stored with French +33 prefix by mistake)
 *   33697XXXXXX → 596697XXXXXX
 */
export function normalizePhone(raw: string): string {
  if (!raw) return '';

  // Strip everything except digits
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // Already has correct Antilles/Réunion country codes
  if (digits.startsWith('596') || digits.startsWith('590') || digits.startsWith('262')) {
    return digits;
  }

  // Misformatted with French +33 but actually a Martinique/Guadeloupe number
  // e.g., 33696XXXXXX (stored as +33 696 instead of +596 696)
  if (digits.startsWith('33') && digits.length === 11) {
    const after33 = digits.slice(2); // 9 digits
    if (after33.startsWith('696') || after33.startsWith('697')) return '596' + after33;
    if (after33.startsWith('690') || after33.startsWith('691')) return '590' + after33;
    // Actual French metro number
    return digits;
  }

  // 10-digit local format starting with 0
  if (digits.startsWith('0') && digits.length === 10) {
    const local = digits.slice(1); // 9 digits
    if (digits.startsWith('0590') || digits.startsWith('0690') || digits.startsWith('0691')) return '590' + local;
    if (digits.startsWith('069') || digits.startsWith('0596')) return '596' + local;
    if (digits.startsWith('0692') || digits.startsWith('0693')) return '262' + local;
    // France métro (06, 07, 01-05, 08, 09)
    return '33' + local;
  }

  // 9-digit without leading 0 → Martinique mobile (696/697)
  if (digits.length === 9 && (digits.startsWith('696') || digits.startsWith('697') || digits.startsWith('596'))) {
    return '596' + digits;
  }
  // 9-digit Guadeloupe
  if (digits.length === 9 && (digits.startsWith('690') || digits.startsWith('691'))) {
    return '590' + digits;
  }
  // 9-digit generic starting with 6 or 7 → assume Martinique
  if (digits.length === 9 && /^[67]/.test(digits)) {
    return '596' + digits;
  }

  return digits;
}

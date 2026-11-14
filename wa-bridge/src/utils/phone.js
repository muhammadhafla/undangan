'use strict';

/**
 * Normalisasi nomor telepon ke format E.164 (Indonesia).
 * "08123456789"   → "628123456789"
 * "+62 812-3456"  → "628123456"
 * "8123456789"    → "628123456789"
 */
function normalizePhone(phone) {
  if (!phone) return phone;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  }
  return digits;
}

module.exports = { normalizePhone };

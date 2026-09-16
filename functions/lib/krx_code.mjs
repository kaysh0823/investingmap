/**
 * KRX short codes (ISU_SRT_CD): preserve alphanumeric 6-char keys.
 * Never strip letters (0015G0 must not become 000150).
 */

/**
 * @param {unknown} raw
 * @returns {string|null} uppercase 6-char code, or null if unusable
 */
export function normalizeKrxCode(raw) {
  const s = String(raw || '').replace(/"/g, '').trim().toUpperCase();
  if (!s) return null;
  if (/^[0-9A-Z]{6}$/.test(s)) return s; // keep 0015G0, 00088K, …
  if (/^[0-9]{1,6}$/.test(s)) return s.padStart(6, '0'); // pure digits only
  const alnum = s.replace(/[^0-9A-Z]/g, '');
  if (alnum.length === 6) return alnum;
  console.warn(`[normalizeKrxCode] dropped non-6 code: raw=${JSON.stringify(raw)}`);
  return null;
}

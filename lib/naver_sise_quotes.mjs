/**
 * Parse Naver Finance PC sise page (finance.naver.com/item/sise.naver?code=XXXXXX).
 * Used as fallback when KRX OPEN API is unavailable or fields are missing.
 */

export const NAVER_SISE_URL = 'https://finance.naver.com/item/sise.naver';

export function parseKoreanNumber(s) {
  if (s == null || s === '') return null;
  const n = parseFloat(String(s).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Naver sise pages are EUC-KR; decode when possible (Node, modern Workers).
 * @param {ArrayBuffer|Uint8Array|string} input
 */
export function decodeNaverHtml(input) {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  const buf = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  try {
    return new TextDecoder('euc-kr').decode(buf);
  } catch {
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return s;
  }
}

const PAIR_ROW_RE =
  /<tr>\s*<th class="title">[^<]+<\/th>\s*<td class="num"><span class="tah p11">([0-9,]+)<\/span><\/td>\s*<th class="title">[^<]+<\/th>\s*<td class="num"[^>]*><span class="tah p11">([0-9,]+)<\/span>/g;

/** Pick 52-week high/low from paired title rows (works without EUC-KR decode). */
function parse52WeekFromPairRows(html) {
  const pairs = [];
  let m;
  while ((m = PAIR_ROW_RE.exec(html)) !== null) {
    const hi = parseKoreanNumber(m[1]);
    const lo = parseKoreanNumber(m[2]);
    if (hi != null && lo != null && hi >= lo) pairs.push({ hi, lo });
  }
  if (!pairs.length) return { high52w: null, low52w: null };
  // Last pair is 52주 최고|최저 (after 상한가/하한가 rows).
  const last = pairs[pairs.length - 1];
  return { high52w: last.hi, low52w: last.lo };
}

/**
 * @param {string} html
 * @returns {{ last: number|null, high52w: number|null, low52w: number|null }}
 */
export function parseNaverSiseHtml(html) {
  if (!html || typeof html !== 'string') {
    return { last: null, high52w: null, low52w: null };
  }

  let last = null;
  const nowM = html.match(/id="_nowVal"[^>]*>([^<]+)/);
  if (nowM) last = parseKoreanNumber(nowM[1]);
  if (last == null) {
    const todayM = html.match(/class="no_today"[^>]*>[\s\S]*?<span[^>]*class="blind"[^>]*>([^<]+)<\/span>/);
    if (todayM) last = parseKoreanNumber(todayM[1]);
  }

  let high52w = null;
  let low52w = null;

  const pairM = html.match(/52주\s*최고\s*l\s*최저[\s\S]{0,80}?>\s*([0-9,]+)\s*l\s*([0-9,]+)/i);
  if (pairM) {
    high52w = parseKoreanNumber(pairM[1]);
    low52w = parseKoreanNumber(pairM[2]);
  }

  if (high52w == null) {
    const hiM = html.match(/52주\s*최고[\s\S]{0,120}?<span class="tah p11">([0-9,]+)<\/span>/);
    if (hiM) high52w = parseKoreanNumber(hiM[1]);
  }
  if (low52w == null) {
    const loM = html.match(/52주\s*최저[\s\S]{0,120}?<span class="tah p11">([0-9,]+)<\/span>/);
    if (loM) low52w = parseKoreanNumber(loM[1]);
  }

  if (high52w == null || low52w == null) {
    const fromRows = parse52WeekFromPairRows(html);
    if (high52w == null) high52w = fromRows.high52w;
    if (low52w == null) low52w = fromRows.low52w;
  }

  return { last, high52w, low52w };
}

/**
 * @param {string} code 6-char ticker
 * @param {RequestInit} [init]
 */
export async function fetchNaverSiseQuote(code, init) {
  const url = `${NAVER_SISE_URL}?code=${encodeURIComponent(code)}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': 'investingmap-quotes/1.0',
      Accept: 'text/html,application/xhtml+xml',
      ...(init && init.headers),
    },
  });
  if (!res.ok) throw new Error(`Naver sise HTTP ${res.status} ${code}`);
  const buf = await res.arrayBuffer();
  const html = decodeNaverHtml(buf);
  return parseNaverSiseHtml(html);
}

/**
 * @param {string[]} codes
 * @param {{ concurrency?: number }} [opts]
 */
export async function fetchNaverSiseQuotes(codes, opts) {
  const concurrency = (opts && opts.concurrency) || 4;
  const out = {};
  for (let i = 0; i < codes.length; i += concurrency) {
    const batch = codes.slice(i, i + concurrency);
    const rows = await Promise.all(
      batch.map(async (code) => {
        try {
          return { code, quote: await fetchNaverSiseQuote(code) };
        } catch {
          return { code, quote: { last: null, high52w: null, low52w: null } };
        }
      }),
    );
    for (const { code, quote } of rows) out[code] = quote;
  }
  return out;
}

/**
 * Merge Naver fields into quote object (only fill nulls unless preferNaverLast).
 */
export function mergeNaverIntoQuote(quote, naver, opts) {
  const preferLast = opts && opts.preferNaverLast;
  const out = { ...quote };
  if (naver.last != null && (preferLast || out.last == null)) out.last = naver.last;
  if (naver.high52w != null && out.high52w == null) out.high52w = naver.high52w;
  if (naver.low52w != null && out.low52w == null) out.low52w = naver.low52w;
  return out;
}

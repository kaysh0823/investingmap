/**
 * Naver Finance PC sise page parser & fetcher.
 * https://finance.naver.com/item/sise.naver?code=XXXXXX
 */

export const NAVER_SISE_URL = 'https://finance.naver.com/item/sise.naver';

export function parseKoreanNumber(s) {
  if (s == null || s === '') return null;
  const raw = String(s).trim();
  if (/^N\/A$/i.test(raw) || raw === '—' || raw === '-') return null;
  const n = parseFloat(raw.replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

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

function parse52WeekFromPairRows(html) {
  const pairs = [];
  let m;
  while ((m = PAIR_ROW_RE.exec(html)) !== null) {
    const hi = parseKoreanNumber(m[1]);
    const lo = parseKoreanNumber(m[2]);
    if (hi != null && lo != null && hi >= lo) pairs.push({ hi, lo });
  }
  if (!pairs.length) return { high52w: null, low52w: null };
  const last = pairs[pairs.length - 1];
  return { high52w: last.hi, low52w: last.lo };
}

function parseMarketCapWon(html) {
  const blockM = html.match(/<em id="_market_sum">([\s\S]*?)<\/em>\s*억원/);
  if (!blockM) return null;
  const text = blockM[1].replace(/\s+/g, '');
  const joM = text.match(/([\d,]+)조/);
  const eokM = text.match(/([\d,]+)(?:억)?$/);
  const jo = joM ? parseKoreanNumber(joM[1]) : 0;
  const eok = eokM ? parseKoreanNumber(eokM[1]) : 0;
  if (jo == null && eok == null) return null;
  const joPart = jo != null ? jo * 1e12 : 0;
  const eokPart = eok != null ? eok * 1e8 : 0;
  const total = joPart + eokPart;
  return total > 0 ? total : null;
}

function parsePerPbr(html) {
  let per = null;
  let pbr = null;
  const perM = html.match(/id="_per"[^>]*>([^<]+)/);
  if (perM) per = parseKoreanNumber(perM[1]);
  const pbrM = html.match(/id="_pbr"[^>]*>([^<]+)/);
  if (pbrM) pbr = parseKoreanNumber(pbrM[1]);
  if (pbr == null) {
    const rowM = html.match(/<th scope="row">\s*PBR[\s\S]{0,220}?<td>[\s\S]*?<em>([^<]+)<\/em>/);
    if (rowM) pbr = parseKoreanNumber(rowM[1]);
  }
  return { per, pbr };
}

/**
 * @param {string} html
 * @returns {{ last: number|null, high52w: number|null, low52w: number|null, mcapWon: number|null, per: number|null, pbr: number|null }}
 */
export function parseNaverSiseHtml(html) {
  if (!html || typeof html !== 'string') {
    return { last: null, high52w: null, low52w: null, mcapWon: null, per: null, pbr: null };
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

  const { per, pbr } = parsePerPbr(html);
  const mcapWon = parseMarketCapWon(html);

  return { last, high52w, low52w, mcapWon, per, pbr };
}

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
  const html = decodeNaverHtml(await res.arrayBuffer());
  return parseNaverSiseHtml(html);
}

export function mergeNaverIntoQuote(quote, naver, opts) {
  const preferLast = opts && opts.preferNaverLast;
  const out = { ...quote };
  if (naver.last != null && (preferLast || out.last == null)) out.last = naver.last;
  if (naver.high52w != null && out.high52w == null) out.high52w = naver.high52w;
  if (naver.low52w != null && out.low52w == null) out.low52w = naver.low52w;
  if (naver.mcapWon != null && out.mcapWon == null) out.mcapWon = naver.mcapWon;
  if (naver.per != null && out.per == null) out.per = naver.per;
  if (naver.pbr != null && out.pbr == null) out.pbr = naver.pbr;
  return out;
}

export function emptyQuote() {
  return {
    last: null,
    high52w: null,
    low52w: null,
    mcapWon: null,
    per: null,
    pbr: null,
    yoyReturnPct: null,
  };
}

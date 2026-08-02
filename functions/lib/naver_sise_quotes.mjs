/**
 * Naver Finance PC sise page parser & fetcher.
 * https://finance.naver.com/item/sise.naver?code=XXXXXX
 */

export const NAVER_SISE_URL = 'https://finance.naver.com/item/sise.naver';
export const NAVER_MOBILE_INTEGRATION_URL = 'https://m.stock.naver.com/api/stock';

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

/** "1,984조 8,116억", "198,411억" → won */
export function parseMarketCapKoreanText(text) {
  if (text == null || text === '') return null;
  const s = String(text).replace(/\s+/g, '');
  const joM = s.match(/([\d,]+)조/);
  const eokM = s.match(/([\d,]+)억/);
  const jo = joM ? parseKoreanNumber(joM[1]) : 0;
  const eok = eokM ? parseKoreanNumber(eokM[1]) : 0;
  if (!jo && !eok) return null;
  const total = (jo || 0) * 1e12 + (eok || 0) * 1e8;
  return total > 0 ? total : null;
}

function parseMarketCapWon(html) {
  const blockM = html.match(/<em id="_market_sum">([\s\S]*?)<\/em>\s*억원/);
  if (!blockM) return null;
  const inner = blockM[1].replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  const fromKorean = parseMarketCapKoreanText(inner);
  if (fromKorean != null) return fromKorean;
  const plain = parseKoreanNumber(inner);
  if (plain != null && plain > 0) return plain * 1e8;
  return null;
}

/**
 * 당일 거래대금 (원). PC 시세는 보통 '백만' 단위 숫자를 씀.
 * @param {string} html
 * @returns {number|null}
 */
function parseTurnoverWon(html) {
  if (!html || typeof html !== 'string') return null;
  // Header: 거래대금 14,769,098백만
  const millionM =
    html.match(/거래대금\s*([\d,]+)\s*백만/) ||
    html.match(/거래대금[\s\S]{0,80}?([\d,]+)\s*백만/);
  if (millionM) {
    const n = parseKoreanNumber(millionM[1]);
    if (n != null && n > 0) return n * 1e6;
  }
  // Table blind span (same million unit as caption 거래대금)
  const blindM = html.match(
    /거래대금<\/span>\s*<em[^>]*>\s*<span class="blind">([\d,]+)<\/span>/,
  );
  if (blindM) {
    const n = parseKoreanNumber(blindM[1]);
    if (n != null && n > 0) return n * 1e6;
  }
  // Fallback: 조/억 Korean text next to 거래대금
  const koreanM = html.match(/거래대금[\s\S]{0,80}?([\d,.조억\s]+)/);
  if (koreanM) {
    const fromKorean = parseMarketCapKoreanText(koreanM[1]);
    if (fromKorean != null) return fromKorean;
  }
  return null;
}

function mcapWonPrecision(won) {
  if (won == null || !Number.isFinite(won)) return 0;
  if (won >= 1e12 && won % 1e12 === 0) return 1;
  return 2;
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
 * Parse the Naver sise header date marker.
 * Closed:  <em class="date">2026.07.16 <span>기준(KRX 장마감)</span></em>
 * Live:    the same <em class="date"> shows a clock time + "실시간" while trading.
 *
 * @param {string} html
 * @returns {{ tradeDate: string|null, marketClosed: boolean|null }}
 *   tradeDate is 'YYYY-MM-DD' in KST; marketClosed is true when the page says
 *   "장마감", false when it shows a live/실시간 marker, null when undetectable.
 */
export function parseNaverTradeMeta(html) {
  if (!html || typeof html !== 'string') return { tradeDate: null, marketClosed: null };
  const dateBlockM = html.match(/<em class="date">([\s\S]*?)<\/em>/);
  const inner = dateBlockM ? dateBlockM[1] : '';
  const scope = inner || html;

  let tradeDate = null;
  const dM = scope.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (dM) tradeDate = `${dM[1]}-${dM[2]}-${dM[3]}`;

  let marketClosed = null;
  if (/장\s*마\s*감/.test(scope)) marketClosed = true;
  else if (/실시간|장중/.test(scope)) marketClosed = false;

  return { tradeDate, marketClosed };
}

/**
 * Decide whether "today" (KST) is a non-trading day using Naver's own trade marker.
 * Catches holidays the static clock check misses: the wall clock says regular
 * session, but Naver's latest trade date is in the past or the page says 장마감.
 *
 * @param {{ clockRegular: boolean, tradeDate: string|null, marketClosed: boolean|null, todayYmdDash: string }} args
 * @returns {{ regularSession: boolean, marketClosed: boolean, tradeDate: string|null }}
 */
export function resolveNaverSession({ clockRegular, tradeDate, marketClosed, todayYmdDash }) {
  const closedByMarker = marketClosed === true;
  const staleTradeDate = !!(tradeDate && todayYmdDash && tradeDate < todayYmdDash);
  const closedToday = closedByMarker || staleTradeDate;
  return {
    regularSession: !!clockRegular && !closedToday,
    marketClosed: closedToday || !clockRegular,
    tradeDate: tradeDate || null,
  };
}

/**
 * @param {string} html
 * @returns {{ last: number|null, prevClose: number|null, high52w: number|null, low52w: number|null, mcapWon: number|null, turnoverWon: number|null, per: number|null, pbr: number|null, chg1dPct: number|null, tradeDate: string|null, marketClosed: boolean|null }}
 */
export function parseNaverSiseHtml(html) {
  if (!html || typeof html !== 'string') {
    return {
      last: null,
      prevClose: null,
      high52w: null,
      low52w: null,
      mcapWon: null,
      turnoverWon: null,
      per: null,
      pbr: null,
      chg1dPct: null,
      tradeDate: null,
      marketClosed: null,
    };
  }

  let last = null;
  const nowM = html.match(/id="_nowVal"[^>]*>([^<]+)/);
  if (nowM) last = parseKoreanNumber(nowM[1]);
  if (last == null) {
    const todayM = html.match(/class="no_today"[^>]*>[\s\S]*?<span[^>]*class="blind"[^>]*>([^<]+)<\/span>/);
    if (todayM) last = parseKoreanNumber(todayM[1]);
  }

  let prevClose = null;
  const prevM =
    html.match(/전일가[\s\S]{0,220}?>([0-9,]{2,})/) ||
    html.match(/전일가[\s\S]{0,220}?([0-9,]{3,})/);
  if (prevM) prevClose = parseKoreanNumber(prevM[1]);

  let chg1dPct = null;
  const rateM =
    html.match(/id="_rate"[^>]*>\s*([+-]?[\d.]+)\s*%?/) ||
    html.match(/등락률[\s\S]{0,120}?([+-]?[\d.]+)\s*%/);
  if (rateM) {
    const n = parseFloat(String(rateM[1]).replace(/,/g, ''));
    if (Number.isFinite(n)) chg1dPct = n;
  }
  if (chg1dPct == null && last != null && prevClose != null && prevClose > 0) {
    chg1dPct = Math.round(((last / prevClose) - 1) * 10000) / 100;
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
  const turnoverWon = parseTurnoverWon(html);
  const { tradeDate, marketClosed } = parseNaverTradeMeta(html);

  return {
    last,
    prevClose,
    high52w,
    low52w,
    mcapWon,
    turnoverWon,
    per,
    pbr,
    chg1dPct,
    tradeDate,
    marketClosed,
  };
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

/**
 * @param {object} json — m.stock integration payload
 */
export function parseNaverMobileIntegration(json) {
  const out = {
    last: null,
    prevClose: null,
    high52w: null,
    low52w: null,
    mcapWon: null,
    turnoverWon: null,
    per: null,
    pbr: null,
    chg1dPct: null,
    tradeDate: null,
    marketClosed: null,
  };
  if (!json || typeof json !== 'object') return out;

  const byCode = {};
  const arr = json.totalInfos;
  if (Array.isArray(arr)) {
    for (const row of arr) {
      if (row && row.code) byCode[row.code] = row.value;
    }
  }
  if (byCode.marketValue) out.mcapWon = parseMarketCapKoreanText(byCode.marketValue);
  if (byCode.accumulatedTradingValue) {
    out.turnoverWon = parseMarketCapKoreanText(byCode.accumulatedTradingValue);
  }
  if (byCode.highPriceOf52Weeks) out.high52w = parseKoreanNumber(byCode.highPriceOf52Weeks);
  if (byCode.lowPriceOf52Weeks) out.low52w = parseKoreanNumber(byCode.lowPriceOf52Weeks);
  if (byCode.per) out.per = parseKoreanNumber(byCode.per);
  if (byCode.pbr) out.pbr = parseKoreanNumber(byCode.pbr);
  if (byCode.lastClosePrice) out.prevClose = parseKoreanNumber(byCode.lastClosePrice);
  if (byCode.changeRate) {
    const n = parseFloat(String(byCode.changeRate).replace(/,/g, '').replace(/%/g, ''));
    if (Number.isFinite(n)) out.chg1dPct = n;
  }

  const dt = json.dealTrendInfos;
  if (Array.isArray(dt) && dt[0] && dt[0].closePrice != null) {
    // Recent session close — use as last only when PC sise is unavailable (preferNaverLast merge).
    out.last = parseKoreanNumber(dt[0].closePrice);
  }
  if (out.last == null && byCode.lastClosePrice) {
    out.last = parseKoreanNumber(byCode.lastClosePrice);
  }
  if (out.chg1dPct == null && out.last != null && out.prevClose != null && out.prevClose > 0) {
    out.chg1dPct = Math.round(((out.last / out.prevClose) - 1) * 10000) / 100;
  }
  return out;
}

export async function fetchNaverMobileQuote(code, init) {
  const url = `${NAVER_MOBILE_INTEGRATION_URL}/${encodeURIComponent(code)}/integration`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': 'investingmap-quotes/1.0',
      Accept: 'application/json',
      ...(init && init.headers),
    },
  });
  if (!res.ok) throw new Error(`Naver mobile HTTP ${res.status} ${code}`);
  return parseNaverMobileIntegration(await res.json());
}

/** PC sise + mobile integration merged (mcap/per/pbr prefer latest Naver). */
export async function fetchNaverQuote(code, init) {
  const [siseR, mobileR] = await Promise.allSettled([
    fetchNaverSiseQuote(code, init),
    fetchNaverMobileQuote(code, init),
  ]);
  let merged = emptyQuote();
  const mergeOpts = { preferNaverLast: true, preferNaverFundamentals: true };
  if (mobileR.status === 'fulfilled') {
    merged = mergeNaverIntoQuote(merged, mobileR.value, mergeOpts);
  }
  if (siseR.status === 'fulfilled') {
    merged = mergeNaverIntoQuote(merged, siseR.value, mergeOpts);
  }
  if (siseR.status === 'rejected' && mobileR.status === 'rejected') {
    throw siseR.reason || mobileR.reason;
  }
  return merged;
}

export function mergeNaverIntoQuote(quote, naver, opts) {
  const preferLast = opts && opts.preferNaverLast;
  const preferFundamentals = opts && opts.preferNaverFundamentals;
  const out = { ...quote };
  if (naver.last != null && (preferLast || out.last == null)) out.last = naver.last;
  if (naver.prevClose != null && (preferLast || out.prevClose == null)) out.prevClose = naver.prevClose;
  if (naver.chg1dPct != null && (preferLast || out.chg1dPct == null)) out.chg1dPct = naver.chg1dPct;
  if (naver.high52w != null && (preferLast || out.high52w == null)) out.high52w = naver.high52w;
  if (naver.low52w != null && (preferLast || out.low52w == null)) out.low52w = naver.low52w;
  if (naver.mcapWon != null) {
    const nextPrec = mcapWonPrecision(naver.mcapWon);
    const curPrec = mcapWonPrecision(out.mcapWon);
    if (
      out.mcapWon == null ||
      nextPrec > curPrec ||
      (nextPrec === curPrec && preferFundamentals)
    ) {
      out.mcapWon = naver.mcapWon;
    }
  }
  if (naver.turnoverWon != null && (preferLast || out.turnoverWon == null)) {
    out.turnoverWon = naver.turnoverWon;
  }
  if (naver.per != null && (preferFundamentals || out.per == null)) out.per = naver.per;
  if (naver.pbr != null && (preferFundamentals || out.pbr == null)) out.pbr = naver.pbr;
  // Trade marker: PC sise is authoritative; prefer any non-null so the session
  // decision survives whichever source resolved.
  if (naver.tradeDate != null && (preferLast || out.tradeDate == null)) out.tradeDate = naver.tradeDate;
  if (naver.marketClosed != null && (preferLast || out.marketClosed == null)) out.marketClosed = naver.marketClosed;
  if (
    (out.chg1dPct == null || preferLast) &&
    out.last != null &&
    out.prevClose != null &&
    out.prevClose > 0
  ) {
    out.chg1dPct = Math.round(((out.last / out.prevClose) - 1) * 10000) / 100;
  }
  return out;
}

export function emptyQuote() {
  return {
    last: null,
    prevClose: null,
    high52w: null,
    low52w: null,
    mcapWon: null,
    turnoverWon: null,
    per: null,
    pbr: null,
    chg1dPct: null,
    yoyReturnPct: null,
    tradeDate: null,
    marketClosed: null,
  };
}

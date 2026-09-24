/**
 * KRX [12021] PER/PBR/배당수익률 (개별종목) — OTP CSV / getJsonData (data.krx.co.kr).
 * bld: dbms/MDC/STAT/standard/MDCSTAT03501
 *
 * T+0 after regular close. Same login session as daily OHLC (KRX_ID / KRX_PW).
 * Prefer getJsonData; fall back to OTP CSV.
 */
import iconv from 'iconv-lite';
import {
  KRX_MDI_REFERER,
  KRX_USER_AGENT,
  krxDataPost,
} from './krx_data_session.mjs';
import { normalizeKrxCode } from './krx_code.mjs';

const KRX_OTP_URL = 'http://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd';
const KRX_DOWNLOAD_URL = 'http://data.krx.co.kr/comm/fileDn/download_csv/download.cmd';
const KRX_JSON_URL = 'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
export const KRX_VALUATION_BLD = 'dbms/MDC/STAT/standard/MDCSTAT03501';

/** [12021] PER/PBR/배당수익률 menu */
export const KRX_VALUATION_REFERER =
  'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020104';

function decodeCsvBuffer(buf) {
  if (!buf || !buf.length) return '';
  const asUtf8 = buf.toString('utf8');
  if (asUtf8.includes('\uFFFD')) return iconv.decode(buf, 'cp949');
  if (/[\uAC00-\uD7AF]/.test(asUtf8.split(/\r?\n/)[0] || '')) return asUtf8;
  return iconv.decode(buf, 'cp949');
}

function parseNum(v) {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').replace(/"/g, '').trim();
  if (!s || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function findColumnIndex(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].replace(/\s+/g, '').toLowerCase();
    for (const p of patterns) {
      if (h.includes(p)) return i;
    }
  }
  return -1;
}

/**
 * @returns {{
 *   code: string,
 *   rawCode: string,
 *   name: string|null,
 *   close: number|null,
 *   eps: number|null,
 *   per: number|null,
 *   bps: number|null,
 *   pbr: number|null,
 *   dps: number|null,
 *   dvdYld: number|null,
 * }|null}
 */
function rowFromCells(cells) {
  const rawCode = String(cells.ticker || '').replace(/"/g, '').trim();
  const code = normalizeKrxCode(cells.ticker);
  if (!code) return null;
  const name = cells.name != null && String(cells.name).trim()
    ? String(cells.name).replace(/"/g, '').trim()
    : null;
  return {
    code,
    rawCode,
    name,
    close: parseNum(cells.close),
    eps: parseNum(cells.eps),
    per: parseNum(cells.per),
    bps: parseNum(cells.bps),
    pbr: parseNum(cells.pbr),
    dps: parseNum(cells.dps),
    dvdYld: parseNum(cells.dvdYld),
  };
}

export function parseValuationCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const lowerJoined = lines.join('\n').toLowerCase();
  if (
    lowerJoined.includes('조회된 데이터가 없습니다')
    || lowerJoined.includes('login')
    || lowerJoined.includes('<html')
    || lowerJoined === 'logout'
  ) {
    return [];
  }

  const headerIdx = lines.findIndex(
    (l) => /종목/.test(l) && (/코드|명/.test(l) || /per|pbr|eps/i.test(l)),
  );
  if (headerIdx < 0) return [];

  const headers = splitCsvLine(lines[headerIdx]);
  const tickerIdx = findColumnIndex(headers, ['종목코드', 'isu_srt_cd', '티커', 'ticker']);
  const nameIdx = findColumnIndex(headers, ['종목명', 'isu_abbrv', 'isu_nm', 'name']);
  const closeIdx = findColumnIndex(headers, ['종가', 'tdd_clsprc', 'close']);
  const epsIdx = findColumnIndex(headers, ['eps']);
  const perIdx = findColumnIndex(headers, ['per']);
  const bpsIdx = findColumnIndex(headers, ['bps']);
  const pbrIdx = findColumnIndex(headers, ['pbr']);
  const dpsIdx = findColumnIndex(headers, ['주당배당금', 'dps']);
  const dvdIdx = findColumnIndex(headers, ['배당수익률', 'dvd_yld', 'divyield']);
  if (tickerIdx < 0) return [];

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (!cols.length || cols.every((c) => !c)) continue;
    const parsed = rowFromCells({
      ticker: cols[tickerIdx],
      name: nameIdx >= 0 ? cols[nameIdx] : null,
      close: closeIdx >= 0 ? cols[closeIdx] : null,
      eps: epsIdx >= 0 ? cols[epsIdx] : null,
      per: perIdx >= 0 ? cols[perIdx] : null,
      bps: bpsIdx >= 0 ? cols[bpsIdx] : null,
      pbr: pbrIdx >= 0 ? cols[pbrIdx] : null,
      dps: dpsIdx >= 0 ? cols[dpsIdx] : null,
      dvdYld: dvdIdx >= 0 ? cols[dvdIdx] : null,
    });
    if (parsed) rows.push(parsed);
  }
  return rows;
}

export function parseValuationJson(json) {
  if (!json || json.RESULT === 'LOGOUT') return [];
  const out = json.OutBlock_1 || json.output || json.outBlock_1;
  if (!Array.isArray(out) || !out.length) return [];
  const rows = [];
  for (const row of out) {
    const parsed = rowFromCells({
      ticker: row.ISU_SRT_CD || row.ISU_CD || row.ticker,
      name: row.ISU_ABBRV || row.ISU_NM || row.name,
      close: row.TDD_CLSPRC ?? row.tdd_clsprc,
      eps: row.EPS ?? row.eps,
      per: row.PER ?? row.per,
      bps: row.BPS ?? row.bps,
      pbr: row.PBR ?? row.pbr,
      dps: row.DPS ?? row.dps,
      dvdYld: row.DVD_YLD ?? row.dvd_yld ?? row.DVDYLD,
    });
    if (parsed) rows.push(parsed);
  }
  return rows;
}

/**
 * Payload for [12021] MDCSTAT03501 — 전종목 (searchType=1).
 * @param {string} dayYmd YYYYMMDD
 */
function buildPayload(dayYmd) {
  return {
    locale: 'ko_KR',
    mktId: 'ALL',
    trdDd: dayYmd,
    searchType: '1',
    csvxls_isNo: 'false',
    name: 'fileDown',
    url: KRX_VALUATION_BLD,
  };
}

async function fetchViaJson(env, dayYmd) {
  const fields = { bld: KRX_VALUATION_BLD, ...buildPayload(dayYmd) };
  delete fields.name;
  delete fields.url;
  const { res, session } = await krxDataPost(env, KRX_JSON_URL, fields, KRX_VALUATION_REFERER);
  const text = await res.text();
  if (!session.loggedIn && text.trim() === 'LOGOUT') {
    throw new Error('KRX login required — set KRX_ID and KRX_PW (data.krx.co.kr account)');
  }
  if (!res.ok) return [];
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  return parseValuationJson(json);
}

async function fetchViaOtpCsv(env, dayYmd) {
  const payload = buildPayload(dayYmd);
  const { res: otpRes, session } = await krxDataPost(
    env,
    KRX_OTP_URL,
    payload,
    KRX_VALUATION_REFERER,
  );
  const otp = (await otpRes.text()).trim();
  if (!otp || otp === 'LOGOUT' || otp.length < 8 || /html/i.test(otp)) {
    if (!session.loggedIn) {
      throw new Error('KRX login required — set KRX_ID and KRX_PW (data.krx.co.kr account)');
    }
    return [];
  }

  const { res: dlRes } = await krxDataPost(
    env,
    KRX_DOWNLOAD_URL,
    { code: otp },
    KRX_OTP_URL,
  );
  if (!dlRes.ok) return [];
  const buf = Buffer.from(await dlRes.arrayBuffer());
  if (!buf.length) return [];
  return parseValuationCsv(decodeCsvBuffer(buf));
}

/**
 * Fetch PER/PBR/배당 for all listed tickers on a trade date.
 * @param {string} basDd YYYYMMDD
 * @param {object} [env]
 * @returns {Promise<Map<string, {
 *   close: number|null,
 *   eps: number|null,
 *   per: number|null,
 *   bps: number|null,
 *   pbr: number|null,
 *   dps: number|null,
 *   dvdYld: number|null,
 * }>>}
 */
export async function fetchKrxValuationDay(basDd, env = process.env) {
  const ymd = String(basDd || '').replace(/\D/g, '');
  const out = new Map();
  if (ymd.length !== 8) return out;

  try {
    let rows = await fetchViaJson(env, ymd);
    if (!rows.length) {
      console.warn(`fetchKrxValuationDay ${ymd}: getJsonData empty → OTP CSV`);
      rows = await fetchViaOtpCsv(env, ymd);
    }
    for (const row of rows) {
      if (!row?.code) continue;
      if (out.has(row.code)) continue;
      out.set(row.code, {
        close: row.close,
        eps: row.eps,
        per: row.per,
        bps: row.bps,
        pbr: row.pbr,
        dps: row.dps,
        dvdYld: row.dvdYld,
      });
    }
  } catch (err) {
    console.warn(`fetchKrxValuationDay ${ymd}: ${err.message || err}`);
  }
  return out;
}

/** Debug / one-off: getJsonData body + parsed rows. */
export async function fetchValuationJsonRaw(env, dayYmd) {
  const ymd = String(dayYmd || '').replace(/\D/g, '');
  const fields = { bld: KRX_VALUATION_BLD, ...buildPayload(ymd) };
  delete fields.name;
  delete fields.url;
  const { res, session } = await krxDataPost(env, KRX_JSON_URL, fields, KRX_VALUATION_REFERER);
  const text = await res.text();
  if (!session.loggedIn && text.trim() === 'LOGOUT') {
    throw new Error('KRX login required — set KRX_ID and KRX_PW (data.krx.co.kr account)');
  }
  if (!res.ok) return { text, json: null, rows: [], ok: false, status: res.status };
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { text, json: null, rows: [], ok: false, parseError: true };
  }
  return { text, json, rows: parseValuationJson(json), ok: true };
}

/** Debug / one-off: OTP CSV text + parsed rows. */
export async function fetchValuationOtpCsvRaw(env, dayYmd) {
  const ymd = String(dayYmd || '').replace(/\D/g, '');
  const payload = buildPayload(ymd);
  const { res: otpRes, session } = await krxDataPost(
    env,
    KRX_OTP_URL,
    payload,
    KRX_VALUATION_REFERER,
  );
  const otp = (await otpRes.text()).trim();
  if (!otp || otp === 'LOGOUT' || otp.length < 8 || /html/i.test(otp)) {
    if (!session.loggedIn) {
      throw new Error('KRX login required — set KRX_ID and KRX_PW (data.krx.co.kr account)');
    }
    return { text: '', rows: [], otpOk: false };
  }
  const { res: dlRes } = await krxDataPost(
    env,
    KRX_DOWNLOAD_URL,
    { code: otp },
    KRX_OTP_URL,
  );
  if (!dlRes.ok) return { text: '', rows: [], otpOk: true, downloadStatus: dlRes.status };
  const buf = Buffer.from(await dlRes.arrayBuffer());
  const text = decodeCsvBuffer(buf);
  return { text, rows: parseValuationCsv(text), otpOk: true };
}

export { KRX_USER_AGENT, KRX_MDI_REFERER, parseNum };

/**
 * KRX [12001] 전종목 시세 — OTP CSV / getJsonData (data.krx.co.kr).
 * bld: dbms/MDC/STAT/standard/MDCSTAT01501
 *
 * Regular-session daily OHLCV (T+0 after close). Same login session as investor net
 * (KRX_ID / KRX_PW). apihub fetchMarketDay remains the T+1 overwrite source.
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
const KRX_BLD = 'dbms/MDC/STAT/standard/MDCSTAT01501';

/** [12001] 전종목 시세 menu */
export const KRX_DAILY_OHLC_REFERER =
  'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020101';

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

/** Positive traded price; 0/blank means no trade that session. */
function tradedPrice(v) {
  const n = parseNum(v);
  return n != null && n > 0 ? n : null;
}

function padTicker(raw) {
  return normalizeKrxCode(raw);
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
 *   ticker: string,
 *   rawCode: string,
 *   name: string|null,
 *   open: number|null,
 *   high: number|null,
 *   low: number|null,
 *   close: number,
 *   volume: number|null,
 *   turnover_won: number|null,
 *   mcap_won: number|null,
 *   list_shrs: number|null,
 * }|null}
 */
function rowFromCells(cells) {
  const rawCode = String(cells.ticker || '').replace(/"/g, '').trim();
  const ticker = normalizeKrxCode(cells.ticker);
  const close = tradedPrice(cells.close);
  if (!ticker || close == null) return null;
  const name = cells.name != null && String(cells.name).trim()
    ? String(cells.name).replace(/"/g, '').trim()
    : null;
  return {
    ticker,
    rawCode,
    name,
    open: tradedPrice(cells.open),
    high: tradedPrice(cells.high),
    low: tradedPrice(cells.low),
    close,
    volume: parseNum(cells.volume),
    turnover_won: parseNum(cells.turnover),
    mcap_won: tradedPrice(cells.mcap) ?? parseNum(cells.mcap),
    list_shrs: parseNum(cells.listShrs),
  };
}

function parseDailyOhlcCsv(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const lowerJoined = lines.join('\n').toLowerCase();
  if (
    lowerJoined.includes('조회된 데이터가 없습니다') ||
    lowerJoined.includes('login') ||
    lowerJoined.includes('<html') ||
    lowerJoined === 'logout'
  ) {
    return [];
  }

  const headerIdx = lines.findIndex(
    (l) => /종목/.test(l) && (/코드|명/.test(l) || /종가|시가/.test(l)),
  );
  if (headerIdx < 0) return [];

  const headers = splitCsvLine(lines[headerIdx]);
  const tickerIdx = findColumnIndex(headers, ['종목코드', 'isu_srt_cd', '티커', 'ticker']);
  const nameIdx = findColumnIndex(headers, ['종목명', 'isu_abbrv', 'isu_nm', 'name']);
  const openIdx = findColumnIndex(headers, ['시가', 'tdd_opnprc', 'open']);
  const highIdx = findColumnIndex(headers, ['고가', 'tdd_hgprc', 'high']);
  const lowIdx = findColumnIndex(headers, ['저가', 'tdd_lwprc', 'low']);
  const closeIdx = findColumnIndex(headers, ['종가', 'tdd_clsprc', 'close']);
  const volIdx = findColumnIndex(headers, ['거래량', 'acc_trdvol', 'volume']);
  const turnoverIdx = findColumnIndex(headers, ['거래대금', 'acc_trdval', 'turnover']);
  const mcapIdx = findColumnIndex(headers, ['시가총액', 'mktcap', '시총']);
  const shrsIdx = findColumnIndex(headers, ['상장주식수', 'list_shrs', '상장주식']);
  if (tickerIdx < 0 || closeIdx < 0) return [];

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (!cols.length || cols.every((c) => !c)) continue;
    const parsed = rowFromCells({
      ticker: cols[tickerIdx],
      name: nameIdx >= 0 ? cols[nameIdx] : null,
      open: openIdx >= 0 ? cols[openIdx] : null,
      high: highIdx >= 0 ? cols[highIdx] : null,
      low: lowIdx >= 0 ? cols[lowIdx] : null,
      close: cols[closeIdx],
      volume: volIdx >= 0 ? cols[volIdx] : null,
      turnover: turnoverIdx >= 0 ? cols[turnoverIdx] : null,
      mcap: mcapIdx >= 0 ? cols[mcapIdx] : null,
      listShrs: shrsIdx >= 0 ? cols[shrsIdx] : null,
    });
    if (parsed) rows.push(parsed);
  }
  return rows;
}

function parseDailyOhlcJson(json) {
  if (!json || json.RESULT === 'LOGOUT') return [];
  const out = json.OutBlock_1 || json.output || json.outBlock_1;
  if (!Array.isArray(out) || !out.length) return [];
  const rows = [];
  for (const row of out) {
    const parsed = rowFromCells({
      ticker: row.ISU_SRT_CD || row.ISU_CD || row.ticker,
      name: row.ISU_ABBRV || row.ISU_NM || row.name,
      open: row.TDD_OPNPRC ?? row.tdd_opnprc,
      high: row.TDD_HGPRC ?? row.tdd_hgprc,
      low: row.TDD_LWPRC ?? row.tdd_lwprc,
      close: row.TDD_CLSPRC ?? row.tdd_clsprc,
      volume: row.ACC_TRDVOL ?? row.acc_trdvol,
      turnover: row.ACC_TRDVAL ?? row.acc_trdval,
      mcap: row.MKTCAP ?? row.mktcap,
      listShrs: row.LIST_SHRS ?? row.list_shrs,
    });
    if (parsed) rows.push(parsed);
  }
  return rows;
}

/**
 * Payload matching browser getJsonData.cmd for [12001] MDCSTAT01501.
 * @param {string} dayYmd YYYYMMDD
 */
function buildPayload(dayYmd) {
  return {
    locale: 'ko_KR',
    mktId: 'ALL',
    trdDd: dayYmd,
    share: '1',
    money: '1',
    csvxls_isNo: 'false',
    name: 'fileDown',
    url: KRX_BLD,
  };
}

async function fetchViaJson(env, dayYmd) {
  const fields = { bld: KRX_BLD, ...buildPayload(dayYmd) };
  delete fields.name;
  delete fields.url;
  const { res, session } = await krxDataPost(env, KRX_JSON_URL, fields, KRX_DAILY_OHLC_REFERER);
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
  return parseDailyOhlcJson(json);
}

async function fetchViaOtpCsv(env, dayYmd) {
  const payload = buildPayload(dayYmd);
  const { res: otpRes, session } = await krxDataPost(
    env,
    KRX_OTP_URL,
    payload,
    KRX_DAILY_OHLC_REFERER,
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
  return parseDailyOhlcCsv(decodeCsvBuffer(buf));
}

/**
 * Fetch regular-session daily OHLCV for all listed tickers (common + preferred).
 * @param {string} dayYmd YYYYMMDD
 * @param {object} [env]
 * @returns {Promise<Map<string, {
 *   open: number|null,
 *   high: number|null,
 *   low: number|null,
 *   close: number,
 *   volume: number|null,
 *   turnover_won: number|null,
 *   mcap_won: number|null,
 *   list_shrs: number|null,
 * }>>}
 */
export async function fetchKrxDailyOhlc(dayYmd, env = process.env) {
  const ymd = String(dayYmd || '').replace(/\D/g, '');
  const out = new Map();
  /** @type {Map<string, { rawCode: string, name: string|null, close: number }>} */
  const firstMeta = new Map();
  if (ymd.length !== 8) return out;

  try {
    let rows = await fetchViaOtpCsv(env, ymd);
    if (!rows.length) rows = await fetchViaJson(env, ymd);
    for (const row of rows) {
      if (!row?.ticker) continue;
      if (out.has(row.ticker)) {
        const keep = firstMeta.get(row.ticker);
        console.warn(
          `[fetchKrxDailyOhlc] duplicate key ${row.ticker}: keep `
          + `raw=${keep?.rawCode || '?'} name=${keep?.name || '?'} close=${keep?.close}; `
          + `skip raw=${row.rawCode || '?'} name=${row.name || '?'} close=${row.close}`,
        );
        continue;
      }
      firstMeta.set(row.ticker, {
        rawCode: row.rawCode || row.ticker,
        name: row.name || null,
        close: row.close,
      });
      out.set(row.ticker, {
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        turnover_won: row.turnover_won,
        mcap_won: row.mcap_won,
        list_shrs: row.list_shrs,
      });
    }
  } catch (err) {
    console.warn(`fetchKrxDailyOhlc ${ymd}: ${err.message || err}`);
  }
  return out;
}

/**
 * Convert data.krx daily fields → apihub-shaped row for LIST_SHRS / coverage helpers.
 * @param {{ open?: number|null, high?: number|null, low?: number|null, close: number, volume?: number|null, turnover_won?: number|null, mcap_won?: number|null, list_shrs?: number|null }} fields
 */
export function dailyOhlcFieldsToKrxRow(fields) {
  if (!fields || fields.close == null) return null;
  return {
    TDD_OPNPRC: fields.open,
    TDD_HGPRC: fields.high,
    TDD_LWPRC: fields.low,
    TDD_CLSPRC: fields.close,
    ACC_TRDVOL: fields.volume,
    ACC_TRDVAL: fields.turnover_won,
    MKTCAP: fields.mcap_won,
    LIST_SHRS: fields.list_shrs,
  };
}

export function ymdToDash(ymd) {
  if (!ymd || ymd.length !== 8) return ymd || '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** Debug / one-off: OTP CSV text + parsed rows. */
export async function fetchDailyOhlcOtpCsvRaw(env, dayYmd) {
  const ymd = String(dayYmd || '').replace(/\D/g, '');
  const payload = buildPayload(ymd);
  const { res: otpRes, session } = await krxDataPost(
    env,
    KRX_OTP_URL,
    payload,
    KRX_DAILY_OHLC_REFERER,
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
  return { text, rows: parseDailyOhlcCsv(text), otpOk: true };
}

/** Debug / one-off: getJsonData body + parsed rows. */
export async function fetchDailyOhlcJsonRaw(env, dayYmd) {
  const ymd = String(dayYmd || '').replace(/\D/g, '');
  const fields = { bld: KRX_BLD, ...buildPayload(ymd) };
  delete fields.name;
  delete fields.url;
  const { res, session } = await krxDataPost(env, KRX_JSON_URL, fields, KRX_DAILY_OHLC_REFERER);
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
  return { text, json, rows: parseDailyOhlcJson(json), ok: true };
}

export { KRX_USER_AGENT, KRX_MDI_REFERER, KRX_BLD, parseDailyOhlcCsv, parseDailyOhlcJson };
export { normalizeKrxCode } from './krx_code.mjs';

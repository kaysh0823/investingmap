/**
 * KRX [12023] foreign ownership by ticker — OTP CSV download (data.krx.co.kr).
 * bld: dbms/MDC/STAT/standard/MDCSTAT03701
 *
 * Requires free marketplace login (KRX_ID/KRX_PW), same session as investor net.
 */
import iconv from 'iconv-lite';
import {
  KRX_USER_AGENT,
  krxDataPost,
} from './krx_data_session.mjs';

const KRX_OTP_URL = 'http://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd';
const KRX_DOWNLOAD_URL = 'http://data.krx.co.kr/comm/fileDn/download_csv/download.cmd';
const KRX_JSON_URL = 'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
const KRX_BLD = 'dbms/MDC/STAT/standard/MDCSTAT03701';
export const KRX_FOREIGN_RATIO_REFERER =
  'https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020501';

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

function padTicker(raw) {
  const s = String(raw || '').replace(/"/g, '').trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(6, '0').slice(-6);
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

function parseForeignRatioCsv(text) {
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
    (l) => /종목/.test(l) && (/코드|명/.test(l) || /지분율|보유/.test(l)),
  );
  if (headerIdx < 0) return [];

  const headers = splitCsvLine(lines[headerIdx]);
  const tickerIdx = findColumnIndex(headers, ['종목코드', 'isu_srt_cd', '티커', 'ticker']);
  const ratioIdx = findColumnIndex(headers, [
    '외국인지분율',
    '지분율',
    'forn_shr_rt',
    'hold_ratio',
    '보유비율',
  ]);
  if (tickerIdx < 0 || ratioIdx < 0) return [];

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (!cols.length || cols.every((c) => !c)) continue;
    const ticker = padTicker(cols[tickerIdx]);
    if (!ticker) continue;
    const hold_ratio = parseNum(cols[ratioIdx]);
    if (hold_ratio == null) continue;
    rows.push({ ticker, hold_ratio });
  }
  return rows;
}

function parseForeignRatioJson(json) {
  if (!json || json.RESULT === 'LOGOUT') return [];
  const out = json.output;
  if (!Array.isArray(out) || !out.length) return [];
  const rows = [];
  for (const row of out) {
    const ticker = padTicker(row.ISU_SRT_CD || row.ISU_CD || row.ticker);
    const hold_ratio = parseNum(
      row.FORN_SHR_RT ?? row.forn_shr_rt ?? row.HOLD_RATIO ?? row.hold_ratio,
    );
    if (!ticker || hold_ratio == null) continue;
    rows.push({ ticker, hold_ratio });
  }
  return rows;
}

function buildPayload(dayYmd) {
  return {
    locale: 'ko_KR',
    searchType: '1',
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
  const { res, session } = await krxDataPost(env, KRX_JSON_URL, fields, KRX_FOREIGN_RATIO_REFERER);
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
  return parseForeignRatioJson(json);
}

async function fetchViaOtpCsv(env, dayYmd) {
  const payload = buildPayload(dayYmd);
  const { res: otpRes, session } = await krxDataPost(
    env,
    KRX_OTP_URL,
    payload,
    KRX_FOREIGN_RATIO_REFERER,
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
  return parseForeignRatioCsv(decodeCsvBuffer(buf));
}

/**
 * Fetch daily foreign ownership ratio rows for all tickers.
 * @param {string} dayYmd YYYYMMDD
 * @param {object} [env]
 * @returns {Promise<Array<{ ticker: string, hold_ratio: number }>>}
 */
export async function fetchKrxForeignRatio(dayYmd, env = process.env) {
  const ymd = String(dayYmd || '').replace(/\D/g, '');
  if (ymd.length !== 8) return [];

  try {
    const csvRows = await fetchViaOtpCsv(env, ymd);
    if (csvRows.length) return csvRows;
    return fetchViaJson(env, ymd);
  } catch (err) {
    console.warn(`fetchKrxForeignRatio ${ymd}: ${err.message || err}`);
    return [];
  }
}

export function ymdToDash(ymd) {
  if (!ymd || ymd.length !== 8) return ymd || '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

export { KRX_USER_AGENT };

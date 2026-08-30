/**
 * KRX [12010] investor net purchase by ticker — OTP CSV download (data.krx.co.kr).
 * bld: dbms/MDC/STAT/standard/MDCSTAT02401
 *
 * Since ~2026-02 KRX requires a free marketplace login (KRX_ID/KRX_PW) for this stat.
 */
import iconv from 'iconv-lite';
import {
  KRX_MDI_REFERER,
  KRX_USER_AGENT,
  krxDataPost,
} from './krx_data_session.mjs';

const KRX_OTP_URL = 'http://data.krx.co.kr/comm/fileDn/GenerateOTP/generate.cmd';
const KRX_DOWNLOAD_URL = 'http://data.krx.co.kr/comm/fileDn/download_csv/download.cmd';
const KRX_JSON_URL = 'http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd';
const KRX_BLD = 'dbms/MDC/STAT/standard/MDCSTAT02401';

/** OSC Phase 1: trust, PE, pension, foreign. */
export const INVESTOR_NET_CODES = ['3000', '3100', '6000', '9000'];

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

/** Minimal RFC4180-ish CSV row split (handles quoted commas). */
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

function parseInvestorNetCsv(text) {
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

  const headerIdx = lines.findIndex((l) => /종목/.test(l) && (/코드|명/.test(l) || /순매수/.test(l)));
  if (headerIdx < 0) return [];

  const headers = splitCsvLine(lines[headerIdx]);
  const tickerIdx = findColumnIndex(headers, ['종목코드', 'isu_srt_cd', '티커', 'ticker']);
  const netIdx = findColumnIndex(headers, [
    '순매수거래대금',
    '거래대금_순매수',
    '거래대금순매수',
    'netbid_trdval',
    '순매수대금',
  ]);
  if (tickerIdx < 0 || netIdx < 0) return [];

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (!cols.length || cols.every((c) => !c)) continue;
    const ticker = padTicker(cols[tickerIdx]);
    if (!ticker) continue;
    const net_val = parseNum(cols[netIdx]);
    if (net_val == null) continue;
    rows.push({ ticker, net_val });
  }
  return rows;
}

function parseInvestorNetJson(json) {
  if (!json || json.RESULT === 'LOGOUT') return [];
  const out = json.output;
  if (!Array.isArray(out) || !out.length) return [];
  const rows = [];
  for (const row of out) {
    const ticker = padTicker(row.ISU_SRT_CD || row.ISU_CD || row.ticker);
    const net_val = parseNum(row.NETBID_TRDVAL ?? row.netbid_trdval);
    if (!ticker || net_val == null) continue;
    rows.push({ ticker, net_val });
  }
  return rows;
}

function buildPayload(dayYmd, invstTpCd) {
  return {
    locale: 'ko_KR',
    mktId: 'ALL',
    strtDd: dayYmd,
    endDd: dayYmd,
    invstTpCd,
    share: '1',
    money: '1',
    csvxls_isNo: 'false',
    name: 'fileDown',
    url: KRX_BLD,
  };
}

async function fetchViaJson(env, dayYmd, invstTpCd) {
  const fields = { bld: KRX_BLD, ...buildPayload(dayYmd, invstTpCd) };
  delete fields.name;
  delete fields.url;
  const { res, session } = await krxDataPost(env, KRX_JSON_URL, fields);
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
  return parseInvestorNetJson(json);
}

async function fetchViaOtpCsv(env, dayYmd, invstTpCd) {
  const payload = buildPayload(dayYmd, invstTpCd);
  const { res: otpRes, session } = await krxDataPost(env, KRX_OTP_URL, payload, KRX_MDI_REFERER);
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
  return parseInvestorNetCsv(decodeCsvBuffer(buf));
}

/**
 * Fetch daily investor net purchase rows for one investor type.
 * @param {string} dayYmd YYYYMMDD
 * @param {string} invstTpCd e.g. '9000' (foreign)
 * @param {object} [env] process.env (+ .dev.vars merged by caller)
 * @returns {Promise<Array<{ ticker: string, net_val: number }>>}
 */
export async function fetchKrxInvestorNet(dayYmd, invstTpCd, env = process.env) {
  const ymd = String(dayYmd || '').replace(/\D/g, '');
  const code = String(invstTpCd || '').trim();
  if (ymd.length !== 8 || !code) return [];

  try {
    const csvRows = await fetchViaOtpCsv(env, ymd, code);
    if (csvRows.length) return csvRows;
    return fetchViaJson(env, ymd, code);
  } catch (err) {
    console.warn(`fetchKrxInvestorNet ${ymd} ${code}: ${err.message || err}`);
    return [];
  }
}

export function ymdToDash(ymd) {
  if (!ymd || ymd.length !== 8) return ymd || '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

export { KRX_USER_AGENT, KRX_MDI_REFERER };

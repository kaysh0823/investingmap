/**
 * KIS Open API — 국내주식 신용잔고 일별추이 (FHPST04760000).
 * One call returns up to 30 sessions ending at the settlement date passed in
 * fid_input_date_1; rows are keyed by deal_date (체결일, T) with stlm_date = T+2.
 */

export const KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';
const CREDIT_PATH = '/uapi/domestic-stock/v1/quotations/daily-credit-balance';
const CREDIT_TR_ID = 'FHPST04760000';
/** KIS amounts on this endpoint are in 만원. */
export const KIS_CREDIT_AMT_UNIT_WON = 10000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function intOrNull(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function numOrNull(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function ymdToDash(ymd) {
  const s = String(ymd || '').replace(/\D/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}

/**
 * @param {{ KIS_APP_KEY?: string, KIS_APP_SECRET?: string }} env
 * @returns {Promise<string>} access token (valid ~24h; KIS throttles reissue to 1/min)
 */
export async function issueKisToken(env, attempt = 0) {
  const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: env.KIS_APP_KEY,
      appsecret: env.KIS_APP_SECRET,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.access_token) {
    // EGW00133: token reissue is limited to once per minute.
    if (attempt < 2 && (json.error_code === 'EGW00133' || /1분당 1회/.test(json.error_description || ''))) {
      await sleep(61000);
      return issueKisToken(env, attempt + 1);
    }
    throw new Error(`KIS token failed (${res.status}): ${json.error_description || json.msg1 || ''}`);
  }
  return json.access_token;
}

/**
 * KIS row → stock_credit_balance fields (credit_ratio filled later from mcap).
 * @param {string} ticker
 * @param {object} row
 */
export function kisCreditRowToRecord(ticker, row) {
  const tradeDate = ymdToDash(row?.deal_date);
  if (!tradeDate) return null;
  const amt = intOrNull(row.whol_loan_rmnd_amt);
  return {
    trade_date: tradeDate,
    ticker,
    loan_shares: intOrNull(row.whol_loan_rmnd_stcn),
    loan_amt_won: amt == null ? null : amt * KIS_CREDIT_AMT_UNIT_WON,
    loan_rate: numOrNull(row.whol_loan_rmnd_rate),
    stlm_date: ymdToDash(row.stlm_date),
  };
}

/**
 * One page (≤30 sessions) ending at settlement date `stlmYmd`.
 * Retries on KIS per-second throttle (EGW00201) and transient HTTP errors.
 * @returns {Promise<object[]>} raw KIS rows (newest first)
 */
export async function fetchKisCreditPage(env, token, ticker, stlmYmd, attempt = 0) {
  const q = new URLSearchParams({
    fid_cond_mrkt_div_code: 'J',
    fid_cond_scr_div_code: '20476',
    fid_input_iscd: ticker,
    fid_input_date_1: stlmYmd,
  });
  let res;
  let json = {};
  try {
    res = await fetch(`${KIS_BASE_URL}${CREDIT_PATH}?${q}`, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: env.KIS_APP_KEY,
        appsecret: env.KIS_APP_SECRET,
        tr_id: CREDIT_TR_ID,
        custtype: 'P',
      },
    });
    json = await res.json().catch(() => ({}));
  } catch (err) {
    if (attempt < 4) {
      await sleep(1000 * (attempt + 1));
      return fetchKisCreditPage(env, token, ticker, stlmYmd, attempt + 1);
    }
    throw err;
  }
  if (res.ok && json.rt_cd === '0') return Array.isArray(json.output) ? json.output : [];
  const throttled = json.msg_cd === 'EGW00201' || res.status === 429 || res.status >= 500;
  if (throttled && attempt < 6) {
    await sleep(500 * (attempt + 1));
    return fetchKisCreditPage(env, token, ticker, stlmYmd, attempt + 1);
  }
  throw new Error(`KIS credit ${ticker}@${stlmYmd} (${res.status}) ${json.msg_cd || ''} ${json.msg1 || ''}`.trim());
}

/**
 * Walk back `pages` × 30 sessions from `fromStlmYmd` (next cursor = oldest stlm_date − 1 day).
 * @param {{ beforeRequest?: () => Promise<void> }} [opts] e.g. a rate-limit throttle
 * @returns {Promise<object[]>} records (deduped by trade_date)
 */
export async function fetchKisCreditHistory(env, token, ticker, fromStlmYmd, pages = 1, opts = {}) {
  const byDate = new Map();
  let cursor = fromStlmYmd;
  for (let p = 0; p < pages; p++) {
    if (opts.beforeRequest) await opts.beforeRequest();
    const raw = await fetchKisCreditPage(env, token, ticker, cursor);
    let oldestStlm = null;
    for (const row of raw) {
      const rec = kisCreditRowToRecord(ticker, row);
      if (!rec) continue;
      if (!byDate.has(rec.trade_date)) byDate.set(rec.trade_date, rec);
      if (rec.stlm_date && (!oldestStlm || rec.stlm_date < oldestStlm)) oldestStlm = rec.stlm_date;
    }
    if (raw.length < 30 || !oldestStlm) break;
    const d = new Date(`${oldestStlm}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cursor = d.toISOString().slice(0, 10).replace(/-/g, '');
  }
  return [...byDate.values()].map(({ stlm_date, ...rest }) => rest);
}

/**
 * 신용잔고율 = loan_amt_won / mcap_won × 100; KIS share-based loan_rate when mcap is missing.
 * @param {object[]} records
 * @param {Map<string, number>} mcapByDate trade_date → mcap_won
 */
export function attachCreditRatio(records, mcapByDate) {
  for (const rec of records) {
    const mcap = Number(mcapByDate.get(rec.trade_date));
    if (rec.loan_amt_won != null && Number.isFinite(mcap) && mcap > 0) {
      rec.credit_ratio = Math.round((rec.loan_amt_won / mcap) * 100 * 1e6) / 1e6;
    } else {
      rec.credit_ratio = rec.loan_rate;
    }
  }
  return records;
}

/**
 * Naver mobile index quotes used for regular-session KOSPI/KOSDAQ snapshots.
 */
const NAVER_INDEX_BASE = 'https://m.stock.naver.com/api/index';
export const MARKET_INDEX_CODES = ['KOSPI', 'KOSDAQ'];

function numOrNull(value) {
  if (value == null || value === '' || value === '-') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tradeDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function previousFromChange(payload, value) {
  const change = numOrNull(payload?.compareToPreviousClosePrice);
  if (change == null || value == null) return null;
  const direction = payload?.compareToPreviousPrice?.code;
  if (direction === '2') return value - change;
  if (direction === '5') return value + change;
  if (direction === '3') return value;
  return null;
}

export function parseNaverIndexQuote(code, payload, historyRows = []) {
  const value = numOrNull(payload?.closePrice);
  const date = tradeDate(payload?.localTradedAt);
  const prior = Array.isArray(historyRows)
    ? historyRows.find((row) => tradeDate(row?.localTradedAt) && tradeDate(row.localTradedAt) < date)
    : null;
  const prevClose = numOrNull(prior?.closePrice) ?? previousFromChange(payload, value);
  if (!MARKET_INDEX_CODES.includes(code) || value == null || prevClose == null || !date) return null;
  return {
    code,
    value,
    prevClose,
    tradeDate: date,
    marketClosed: payload?.marketStatus === 'CLOSE',
  };
}

export async function fetchNaverMarketIndexQuote(code) {
  if (!MARKET_INDEX_CODES.includes(code)) throw new Error(`Unsupported market index: ${code}`);
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; InvestingMap/1.0)',
  };
  const [basicResponse, historyResponse] = await Promise.all([
    fetch(`${NAVER_INDEX_BASE}/${code}/basic`, { headers }),
    fetch(`${NAVER_INDEX_BASE}/${code}/price?pageSize=2&page=1`, { headers }),
  ]);
  if (!basicResponse.ok || !historyResponse.ok) {
    throw new Error(`Naver index ${code}: ${basicResponse.status}/${historyResponse.status}`);
  }
  return parseNaverIndexQuote(code, await basicResponse.json(), await historyResponse.json());
}

export async function fetchNaverMarketIndices() {
  const settled = await Promise.allSettled(
    MARKET_INDEX_CODES.map((code) => fetchNaverMarketIndexQuote(code)),
  );
  const rows = [];
  const errors = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) rows.push(result.value);
    else errors.push(`${MARKET_INDEX_CODES[index]}: ${result.reason?.message || 'missing values'}`);
  });
  return { rows, errors };
}

/** Historical close fallback when the KRX index service is not authorized. */
export async function fetchNaverMarketIndexHistory(code, days) {
  if (!MARKET_INDEX_CODES.includes(code)) throw new Error(`Unsupported market index: ${code}`);
  const target = Math.max(2, Number(days) || 260);
  const pageSize = 60;
  const collected = [];
  for (let page = 1; collected.length < target; page++) {
    const response = await fetch(
      `${NAVER_INDEX_BASE}/${code}/price?pageSize=${pageSize}&page=${page}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; InvestingMap/1.0)',
        },
      },
    );
    if (!response.ok) throw new Error(`Naver index history ${code}: ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) break;
    collected.push(...rows);
    if (rows.length < pageSize) break;
  }
  return collected
    .map((row) => ({ date: tradeDate(row?.localTradedAt), close: numOrNull(row?.closePrice) }))
    .filter((row) => row.date && row.close != null)
    .filter((row, index, list) => list.findIndex((other) => other.date === row.date) === index)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-target);
}

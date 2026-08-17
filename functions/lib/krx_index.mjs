/**
 * KRX OPEN API — KOSPI/KOSDAQ index daily closes.
 */
import { getAuthKey } from './krx_yoy.mjs';

const KRX_BASE = 'https://data-dbg.krx.co.kr/svc/apis';
const INDEX_ENDPOINTS = {
  KOSPI: '/idx/kospi_dd_trd',
  KOSDAQ: '/idx/kosdaq_dd_trd',
};
const INDEX_NAMES = {
  KOSPI: new Set(['코스피', 'KOSPI']),
  KOSDAQ: new Set(['코스닥', 'KOSDAQ']),
};

function numOrNull(value) {
  if (value == null || value === '' || value === '-') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dateOrNull(value, fallback) {
  const raw = String(value || fallback || '').replace(/-/g, '');
  if (!/^\d{8}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export function parseKrxIndexRows(indexCode, rows, fallbackBasDd) {
  const names = INDEX_NAMES[indexCode];
  if (!names || !Array.isArray(rows)) return null;
  const row = rows.find((item) => names.has(String(item?.IDX_NM || '').trim()));
  if (!row) return null;
  const close = numOrNull(row.CLSPRC_IDX);
  const date = dateOrNull(row.BAS_DD, fallbackBasDd);
  return close != null && date ? { date, close } : null;
}

async function fetchKrxRows(authKey, endpoint, basDd) {
  if (!authKey) throw new Error('KRX index auth key is required');
  const url = `${KRX_BASE}${endpoint}`;
  const headers = {
    AUTH_KEY: authKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ basDd }),
  });
  if (!response.ok) {
    response = await fetch(`${url}?basDd=${encodeURIComponent(basDd)}`, {
      headers: { AUTH_KEY: authKey, Accept: 'application/json' },
    });
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`KRX index ${endpoint} ${basDd}: ${response.status} ${body.slice(0, 160)}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.OutBlock_1) ? payload.OutBlock_1 : [];
}

/** Fetch both headline indices for one KRX business date. */
export async function fetchKrxMarketIndexDay(envOrKey, basDd) {
  const authKey = typeof envOrKey === 'string' ? envOrKey : getAuthKey(envOrKey);
  const entries = await Promise.all(
    Object.entries(INDEX_ENDPOINTS).map(async ([code, endpoint]) => {
      const rows = await fetchKrxRows(authKey, endpoint, basDd);
      return [code, parseKrxIndexRows(code, rows, basDd)];
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Fetch chronological index series for supplied KRX candidate dates.
 * Missing/holiday rows are omitted.
 */
export async function fetchKrxMarketIndexSeries(envOrKey, basDdList) {
  const series = { KOSPI: [], KOSDAQ: [] };
  for (const basDd of basDdList || []) {
    const day = await fetchKrxMarketIndexDay(envOrKey, basDd);
    for (const code of Object.keys(series)) {
      if (day[code]?.close != null) series[code].push(day[code]);
    }
  }
  for (const code of Object.keys(series)) {
    series[code].sort((a, b) => a.date.localeCompare(b.date));
  }
  return series;
}

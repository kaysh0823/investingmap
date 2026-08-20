/**
 * Hub comparison trend: sector mcap indices plus KOSPI/KOSDAQ, rebased to 100.
 */
import { SECTOR_ORDER } from './hub_dashboard_core.mjs';
import { normalizeSectorHorizon } from './hub_api_cache.mjs';
import { fetchSupabaseJson, getSupabaseConfig, numOrNull } from './supabase_hub.mjs';

export const TREND_MAX_POINTS = 200;
const DAILY_LOOKBACK = { '20d': 20, '50d': 50, '120d': 120, '200d': 200 };
const INDEX_CODES = ['KOSPI', 'KOSDAQ'];
const INDEX_FILTER = `index_code=in.(${INDEX_CODES.join(',')})`;

export const TREND_INDEX_CODES = INDEX_CODES;

export function downsampleTrend(points, maxPoints = TREND_MAX_POINTS) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points ? points.slice() : [];
  const out = [];
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round((i * (points.length - 1)) / (maxPoints - 1));
    const point = points[index];
    if (!out.length || out[out.length - 1].t !== point.t) out.push(point);
  }
  return out;
}

export function rebaseTo100(rows, valueKey = 'value', baseValue = null) {
  const clean = (rows || []).filter((row) => {
    const value = numOrNull(row?.[valueKey]);
    return row?.t && value != null && value > 0;
  });
  if (!clean.length) return [];
  const base = numOrNull(baseValue) ?? numOrNull(clean[0][valueKey]);
  if (base == null || base <= 0) return [];
  return clean.map((row, index) => ({
    t: row.t,
    v: index === 0 && baseValue == null
      ? 100
      : Math.round((Number(row[valueKey]) / base) * 1000000) / 10000,
  }));
}

/** Card % = last rebased point − 100 (2dp). Same series hub_trend charts use. */
export function returnPctFromRebasedSeries(series) {
  if (!Array.isArray(series) || !series.length) return null;
  const last = series[series.length - 1];
  const v = numOrNull(last?.v);
  if (v == null) return null;
  return Math.round((v - 100) * 100) / 100;
}

export const TREND_HORIZONS = ['1d', '20d', '50d', '120d', '200d'];

export const TREND_RET_COL = {
  '1d': 'ret_1d_pct',
  '20d': 'ret_20d_pct',
  '50d': 'ret_50d_pct',
  '120d': 'ret_120d_pct',
  '200d': 'ret_200d_pct',
};

export const TREND_RET_KEY = {
  '1d': 'return1dPct',
  '20d': 'return20dPct',
  '50d': 'return50dPct',
  '120d': 'return120dPct',
  '200d': 'return200dPct',
};

/**
 * Per-sector return % for one horizon, derived from the same payload as /api/hub_trend.
 * @returns {Promise<{ horizon: string, returns: Record<string, number|null>, seriesBySector: Record<string, object[]> }>}
 */
export async function buildSectorReturnsForHorizon(hubIndex, env, requestedHorizon) {
  const payload = await buildHubTrendPayload(hubIndex, env, requestedHorizon);
  const returns = {};
  const seriesBySector = {};
  for (const entry of payload.sectors || []) {
    if (!entry?.sector) continue;
    seriesBySector[entry.sector] = entry.series || [];
    returns[entry.sector] = returnPctFromRebasedSeries(entry.series);
  }
  return { horizon: payload.horizon, returns, seriesBySector };
}

/**
 * sector_returns upsert rows: one row per sector, all horizons filled from trend sources.
 */
export async function buildSectorReturnRowsFromTrend(hubIndex, env, updatedAt = new Date().toISOString()) {
  const bySector = new Map();
  for (const horizon of TREND_HORIZONS) {
    const { returns } = await buildSectorReturnsForHorizon(hubIndex, env, horizon);
    const col = TREND_RET_COL[horizon];
    for (const sid of SECTOR_ORDER) {
      if (!bySector.has(sid)) {
        bySector.set(sid, { sector_id: sid, updated_at: updatedAt });
      }
      bySector.get(sid)[col] = returns[sid] != null ? returns[sid] : null;
    }
  }
  return [...bySector.values()];
}

async function safeFetch(config, query) {
  try {
    return await fetchSupabaseJson(config, query);
  } catch (error) {
    console.warn(`hub_trend fetch failed [${query.split('?')[0]}]: ${error?.message || error}`);
    return [];
  }
}

function logIndexSeries(scope, indexRows, entries, valueKey) {
  const fetched = INDEX_CODES.map(
    (code) => `${code}=${indexRows.filter((row) => row.index_code === code && numOrNull(row[valueKey]) != null).length}`,
  ).join(' ');
  const series = entries.map((entry) => `${entry.code}=${entry.series.length}`).join(' ');
  console.log(`hub_trend ${scope} index rows: ${fetched} | series: ${series}`);
}

async function safeFetchPaged(config, query, pageSize = 1000) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const separator = query.includes('?') ? '&' : '?';
    const rows = await safeFetch(config, `${query}${separator}limit=${pageSize}&offset=${offset}`);
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

function sectorName(hubIndex, sector) {
  const meta = hubIndex?.sectors?.[sector]?.meta;
  return meta?.ko || meta?.shortKo || sector;
}

function emptyPayload(hubIndex, horizon) {
  return {
    horizon,
    base: 100,
    sectors: SECTOR_ORDER.map((sector) => ({
      sector,
      name: sectorName(hubIndex, sector),
      series: [],
    })),
    indices: INDEX_CODES.map((code) => ({ code, series: [] })),
  };
}

function latestDates(rows, count) {
  return [...new Set((rows || []).map((row) => row.trade_date).filter(Boolean))]
    .sort()
    .slice(-count);
}

async function buildDailyPayload(config, hubIndex, horizon) {
  const payload = emptyPayload(hubIndex, horizon);
  const window = DAILY_LOOKBACK[horizon] || 20;
  const indexRows = await safeFetch(
    config,
    `market_index_daily?${INDEX_FILTER}&select=trade_date,index_code,close` +
      `&order=trade_date.desc&limit=${(window + 40) * INDEX_CODES.length}`,
  );
  let dates = latestDates(indexRows, window + 1);
  if (!dates.length) {
    const sectorDates = await safeFetch(
      config,
      `sector_mcap_daily?select=trade_date&order=trade_date.desc&limit=${window + 30}`,
    );
    dates = latestDates(sectorDates, window + 1);
  }
  if (!dates.length) return payload;

  const from = dates[0];
  const to = dates[dates.length - 1];
  const sectorRows = await safeFetchPaged(
    config,
    `sector_mcap_daily?trade_date=gte.${encodeURIComponent(from)}` +
      `&trade_date=lte.${encodeURIComponent(to)}` +
      '&select=sector_id,trade_date,mcap_sum&order=trade_date.asc',
  );
  const dateSet = new Set(dates);

  payload.sectors = payload.sectors.map((entry) => {
    const rows = sectorRows
      .filter((row) => row.sector_id === entry.sector && dateSet.has(row.trade_date))
      .map((row) => ({ t: row.trade_date, value: numOrNull(row.mcap_sum) }));
    return { ...entry, series: downsampleTrend(rebaseTo100(rows)) };
  });
  payload.indices = payload.indices.map((entry) => {
    const rows = indexRows
      .filter((row) => row.index_code === entry.code && dateSet.has(row.trade_date))
      .map((row) => ({ t: row.trade_date, value: numOrNull(row.close) }))
      .sort((a, b) => a.t.localeCompare(b.t));
    return { ...entry, series: downsampleTrend(rebaseTo100(rows)) };
  });
  logIndexSeries(horizon, indexRows, payload.indices, 'close');
  return payload;
}

async function resolveLatestIntradayDate(config) {
  const indexRows = await safeFetch(
    config,
    'market_index_intraday?select=trade_date&order=captured_at.desc&limit=1',
  );
  if (indexRows[0]?.trade_date) return indexRows[0].trade_date;
  const sectorRows = await safeFetch(
    config,
    'sector_intraday_snapshots?select=trade_date&order=ts.desc&limit=1',
  );
  return sectorRows[0]?.trade_date || null;
}

/**
 * Before the first intraday capture of a session the intraday table is empty.
 * Fall back to the last two daily closes so the 1d chart still has an index line.
 */
async function dailyCloseFallback(config, codes) {
  if (!codes.length) return new Map();
  const rows = await safeFetch(
    config,
    `market_index_daily?${INDEX_FILTER}&select=trade_date,index_code,close` +
      `&order=trade_date.desc&limit=${codes.length * 4}`,
  );
  const out = new Map();
  for (const code of codes) {
    const own = rows
      .filter((row) => row.index_code === code && numOrNull(row.close) > 0)
      .sort((a, b) => String(b.trade_date).localeCompare(String(a.trade_date)));
    const last = numOrNull(own[0]?.close);
    const prev = numOrNull(own[1]?.close);
    if (last == null || prev == null || prev <= 0) continue;
    out.set(code, { date: own[0].trade_date, last, prev });
  }
  return out;
}

async function buildIntradayPayload(config, hubIndex) {
  const payload = emptyPayload(hubIndex, '1d');
  const tradeDate = await resolveLatestIntradayDate(config);
  if (!tradeDate) return payload;
  const [sectorRows, indexRows] = await Promise.all([
    safeFetchPaged(
      config,
      `sector_intraday_snapshots?trade_date=eq.${encodeURIComponent(tradeDate)}` +
        '&select=sector_id,ts,mcap_sum&order=ts.asc',
    ),
    safeFetch(
      config,
      `market_index_intraday?trade_date=eq.${encodeURIComponent(tradeDate)}&${INDEX_FILTER}` +
        '&select=index_code,captured_at,value,prev_close&order=captured_at.asc&limit=1000',
    ),
  ]);
  const missingCodes = INDEX_CODES.filter(
    (code) => !indexRows.some((row) => row.index_code === code && numOrNull(row.value) != null),
  );
  const fallback = await dailyCloseFallback(config, missingCodes);

  payload.sectors = payload.sectors.map((entry) => {
    const rows = sectorRows
      .filter((row) => row.sector_id === entry.sector)
      .map((row) => ({ t: row.ts, value: numOrNull(row.mcap_sum) }));
    return { ...entry, series: downsampleTrend(rebaseTo100(rows)) };
  });
  payload.indices = payload.indices.map((entry) => {
    const own = indexRows.filter((row) => row.index_code === entry.code);
    const prevClose = own.map((row) => numOrNull(row.prev_close)).find((value) => value > 0);
    if (own.length && prevClose != null) {
      const rows = [
        { t: `${tradeDate}T09:00:00+09:00`, value: prevClose },
        ...own.map((row) => ({ t: row.captured_at, value: numOrNull(row.value) })),
      ];
      return { ...entry, series: downsampleTrend(rebaseTo100(rows, 'value', prevClose)) };
    }
    const daily = fallback.get(entry.code);
    if (!daily) return entry;
    const rows = [
      { t: `${daily.date}T09:00:00+09:00`, value: daily.prev },
      { t: `${daily.date}T15:30:00+09:00`, value: daily.last },
    ];
    return { ...entry, series: rebaseTo100(rows, 'value', daily.prev) };
  });
  logIndexSeries('1d', indexRows, payload.indices, 'value');
  return payload;
}

export async function buildHubTrendPayload(hubIndex, env, requestedHorizon) {
  const horizon = normalizeSectorHorizon(requestedHorizon);
  const config = getSupabaseConfig(env);
  if (!config) return emptyPayload(hubIndex, horizon);
  return horizon === '1d'
    ? buildIntradayPayload(config, hubIndex)
    : buildDailyPayload(config, hubIndex, horizon);
}

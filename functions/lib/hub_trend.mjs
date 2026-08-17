/**
 * Hub comparison trend: sector mcap indices plus KOSPI/KOSDAQ, rebased to 100.
 */
import { SECTOR_ORDER } from './hub_dashboard_core.mjs';
import { normalizeSectorHorizon } from './hub_api_cache.mjs';
import { fetchSupabaseJson, getSupabaseConfig, numOrNull } from './supabase_hub.mjs';

export const TREND_MAX_POINTS = 200;
const DAILY_LOOKBACK = { '20d': 20, '50d': 50, '120d': 120, '200d': 200 };
const INDEX_CODES = ['KOSPI', 'KOSDAQ'];

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

async function safeFetch(config, query) {
  try {
    return await fetchSupabaseJson(config, query);
  } catch {
    return [];
  }
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
    `market_index_daily?select=trade_date,index_code,close&order=trade_date.desc&limit=${(window + 30) * 2}`,
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
      `market_index_intraday?trade_date=eq.${encodeURIComponent(tradeDate)}` +
        '&select=index_code,captured_at,value,prev_close&order=captured_at.asc&limit=1000',
    ),
  ]);

  payload.sectors = payload.sectors.map((entry) => {
    const rows = sectorRows
      .filter((row) => row.sector_id === entry.sector)
      .map((row) => ({ t: row.ts, value: numOrNull(row.mcap_sum) }));
    return { ...entry, series: downsampleTrend(rebaseTo100(rows)) };
  });
  payload.indices = payload.indices.map((entry) => {
    const own = indexRows.filter((row) => row.index_code === entry.code);
    const prevClose = own.map((row) => numOrNull(row.prev_close)).find((value) => value > 0);
    if (!own.length || prevClose == null) return entry;
    const rows = [
      { t: `${tradeDate}T09:00:00+09:00`, value: prevClose },
      ...own.map((row) => ({ t: row.captured_at, value: numOrNull(row.value) })),
    ];
    return {
      ...entry,
      series: downsampleTrend(rebaseTo100(rows, 'value', prevClose)),
    };
  });
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

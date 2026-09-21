/**
 * Shared sector trend series (stock-aggregate) for /api/hub_trend and /api/hub_sector_trend.
 * 1d: sector_intraday_returns (% or base-100) + live tip / synthesize.
 * Nd: hub_return_refs adjusted closes × shares, rebased to 100 at window start.
 */

import {
  SECTOR_ORDER,
  listHubCompanies,
  normalizeTicker,
} from './hub_dashboard_core.mjs';
import { krxSessionInfo, kstYmdDash } from './krx_session.mjs';
import {
  aggregateSectorReturns,
} from './returns_core.mjs';
import {
  loadReturnSource,
  loadCachedReturnRefs,
  pastSessionDd,
} from './hub_returns_source.mjs';
import { fetchSupabaseJson, getSupabaseConfig, numOrNull } from './supabase_hub.mjs';

export const TREND_DAILY_LOOKBACK = {
  '20d': 20,
  '50d': 50,
  '120d': 120,
  '200d': 200,
};

const INDEX_CODES = ['KOSPI', 'KOSDAQ'];
const TREND_CHART_MAX_POINTS = 50;

function compactYmd(v) {
  const s = String(v || '').replace(/-/g, '');
  return /^\d{8}$/.test(s) ? s : '';
}

function downsamplePts(points, maxN) {
  if (!Array.isArray(points) || points.length <= maxN) return points || [];
  if (maxN < 2) return points.slice(0, maxN);
  const out = [];
  for (let i = 0; i < maxN; i++) {
    const idx = Math.round((i * (points.length - 1)) / (maxN - 1));
    const p = points[idx];
    if (!out.length || out[out.length - 1] !== p) out.push(p);
  }
  return out;
}

function rebaseRowsTo100(rows, valueKey = 'value') {
  const clean = (rows || []).filter((row) => {
    const value = numOrNull(row?.[valueKey]);
    return row?.t && value != null && value > 0;
  });
  if (!clean.length) return [];
  const base = numOrNull(clean[0][valueKey]);
  if (base == null || base <= 0) return [];
  return clean.map((row, index) => ({
    t: row.t,
    v: index === 0 ? 100 : Math.round((Number(row[valueKey]) / base) * 1000000) / 10000,
  }));
}

function applyLiveTip(rows, todayDash, liveValue) {
  const value = numOrNull(liveValue);
  if (!todayDash || value == null || !(value > 0)) return rows ? rows.slice() : [];
  const out = (rows || []).filter((row) => row && row.t && numOrNull(row.value) > 0);
  if (out.length && out[out.length - 1].t === todayDash) {
    out[out.length - 1] = { t: todayDash, value };
  } else {
    out.push({ t: todayDash, value });
  }
  return out;
}

export function basDdToDash(basDd) {
  const s = compactYmd(basDd);
  if (s.length !== 8) return '';
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function tipTimestamp(sessionOpen, anchorDash, now = new Date()) {
  if (sessionOpen) return now.toISOString();
  return `${anchorDash}T15:30:00+09:00`;
}

function sectorName(hubIndex, sector) {
  const meta = hubIndex?.sectors?.[sector]?.meta;
  return meta?.ko || meta?.shortKo || sector;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function roundIndex(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

/** ret_1d_pct → base-100 chart value. */
export function retPctToBase100(retPct) {
  const r = numOrNull(retPct);
  if (r == null) return null;
  return roundIndex(100 * (1 + r / 100));
}

/** [{t,v:pct}] → [{t,v:base100}] */
export function pctSeriesToBase100(series) {
  return (series || [])
    .map((p) => {
      const v = retPctToBase100(p?.v);
      if (v == null || !p?.t) return null;
      const out = { t: p.t, v };
      if (p.synthesized) out.synthesized = true;
      if (p.live) out.live = true;
      return out;
    })
    .filter(Boolean);
}

/**
 * Cap-weighted returns by sector from loadReturnSource (all horizons).
 */
export async function computeLiveSectorAggregates(hubIndex, env, request, now = new Date()) {
  const tickers = listHubCompanies(hubIndex)
    .map((c) => normalizeTicker(c.ticker))
    .filter(Boolean);
  const source = await loadReturnSource({ env, request, tickers });
  const k = source.meta?.k ?? 0;
  /** @type {Map<string, ReturnType<typeof aggregateSectorReturns>>} */
  const bySector = new Map();
  for (const sid of SECTOR_ORDER) {
    const block = hubIndex.sectors?.[sid];
    if (!block) continue;
    const members = [];
    for (const c of block.companies || []) {
      const t = normalizeTicker(c.ticker);
      const src = t ? source.byTicker[t] : null;
      if (!src || src.shares == null || !(src.shares > 0)) continue;
      members.push({
        numerator: src.numerator,
        closes: src.closes,
        k,
        shares: src.shares,
      });
    }
    bySector.set(sid, aggregateSectorReturns(members));
  }
  const session = krxSessionInfo(now);
  const sessionOpen = source.meta?.sessionOpen ?? !!session.regular;
  return {
    bySector,
    source,
    meta: {
      asOf: source.meta?.asOf || now.toISOString(),
      sessionOpen,
      regularSession: source.meta?.regularSession ?? !!session.regular,
      numeratorMode: source.meta?.numeratorMode ?? (sessionOpen ? 'live' : 'official'),
      anchorDd: source.meta?.anchorDd || null,
      refsRecentDd: source.meta?.refsRecentDd || null,
      k,
      stale: !!source.meta?.stale,
      dataVersion: source.meta?.dataVersion || null,
      refsEtag: source.meta?.refsEtag || null,
    },
  };
}

/**
 * 1d sparkline / chart series in return-% units (v = ret_1d_pct).
 * Shared by hub_sector_trend and hub_trend (via pct→base100).
 *
 * @returns {Promise<{
 *   trends: Record<string, {t:string,v:number,synthesized?:boolean,live?:boolean}[]>,
 *   meta: object,
 *   synthesized: boolean,
 *   source: string,
 *   tradeDate: string,
 * }>}
 */
export async function buildIntraday1dSeries({
  hubIndex,
  env,
  request = null,
  now = new Date(),
}) {
  const live = await computeLiveSectorAggregates(hubIndex, env, request, now);
  const meta = live.meta;
  const numeratorMode = meta.numeratorMode || (meta.sessionOpen ? 'live' : 'official');
  const liveTip = numeratorMode === 'live';
  const anchorDash = basDdToDash(meta.anchorDd) || kstYmdDash(now);
  const tipTs = tipTimestamp(liveTip, anchorDash, now);
  const config = getSupabaseConfig(env);

  let rows = [];
  if (config && anchorDash) {
    try {
      rows = await fetchSupabaseJson(
        config,
        `sector_intraday_returns?trade_date=eq.${encodeURIComponent(anchorDash)}`
          + `&select=sector_id,ts,ret_1d_pct,anchor_dd,session_kind`
          + `&session_kind=in.(regular,close)`
          + `&order=ts.asc&limit=10000`,
        { paginate: true, warnIfTruncated: 'sector_intraday_returns truncated' },
      );
    } catch (e) {
      const msg = String(e?.message || e);
      console.warn(`sector_intraday_returns ${anchorDash}: ${msg.slice(0, 200)}`);
      rows = [];
    }
  }

  const bySector = new Map();
  for (const row of rows || []) {
    const sid = row.sector_id;
    if (!sid) continue;
    const kind = String(row.session_kind || 'regular');
    if (kind !== 'regular' && kind !== 'close') continue;
    if (!bySector.has(sid)) bySector.set(sid, []);
    const v = Number(row.ret_1d_pct);
    if (!Number.isFinite(v)) continue;
    bySector.get(sid).push({
      t: row.ts,
      v: round2(v),
      session_kind: kind,
    });
  }

  const hasAnyRow = [...bySector.values()].some((pts) => pts.length > 0);
  /** @type {Record<string, {t:string,v:number,synthesized?:boolean,live?:boolean}[]>} */
  const trends = {};
  /** @type {Record<string, number>} */
  const distinctValues = {};
  let pointCount = 0;

  if (!hasAnyRow) {
    for (const sid of SECTOR_ORDER) {
      const agg = live.bySector.get(sid);
      const v = agg?.chg1dPct;
      if (v == null) continue;
      const series = liveTip
        ? [{ t: tipTs, v: round2(v), synthesized: true }]
        : [
          { t: `${anchorDash}T09:00:00+09:00`, v: 0, session_kind: 'regular' },
          { t: `${anchorDash}T15:30:00+09:00`, v: round2(v), session_kind: 'close' },
        ];
      trends[sid] = series;
      distinctValues[sid] = new Set(series.map((p) => p.v)).size;
      pointCount = Math.max(pointCount, series.length);
    }
    return {
      trends,
      meta: { ...meta, numeratorMode, pointCount, distinctValues },
      synthesized: true,
      source: 'live_aggregate',
      tradeDate: anchorDash,
      regularSession: !!krxSessionInfo(now).regular,
    };
  }

  for (const sid of SECTOR_ORDER) {
    let pts = bySector.get(sid) || [];
    const liveV = live.bySector.get(sid)?.chg1dPct;
    if (!pts.length) {
      if (liveV == null) continue;
      const series = liveTip
        ? [{ t: tipTs, v: round2(liveV), synthesized: true }]
        : [
          { t: `${anchorDash}T09:00:00+09:00`, v: 0 },
          { t: `${anchorDash}T15:30:00+09:00`, v: round2(liveV) },
        ];
      trends[sid] = series;
      distinctValues[sid] = new Set(series.map((p) => p.v)).size;
      pointCount = Math.max(pointCount, series.length);
      continue;
    }
    if (!pts[0].t?.includes('T09:00')) {
      pts = [{ t: `${anchorDash}T09:00:00+09:00`, v: 0, session_kind: 'regular' }, ...pts];
    }
    if (liveTip && liveV != null) {
      const lastTs = pts[pts.length - 1]?.t;
      const lastMs = lastTs ? Date.parse(lastTs) : 0;
      const tipMs = Date.parse(tipTs);
      if (!Number.isFinite(lastMs) || tipMs > lastMs) {
        pts = [...pts, { t: tipTs, v: round2(liveV), live: true }];
      } else {
        pts = [...pts.slice(0, -1), { ...pts[pts.length - 1], v: round2(liveV), live: true }];
      }
    } else if (!liveTip) {
      // B/C: tip at 15:30 — prefer live aggregate; else DB session=close.
      // Drop late regular rows that may arrive after the close snapshot.
      const closeTs = `${anchorDash}T15:30:00+09:00`;
      const closeMs = Date.parse(closeTs);
      const dbClose = [...pts].reverse().find((p) => p.session_kind === 'close');
      const tipV = liveV != null
        ? round2(liveV)
        : (dbClose != null && Number.isFinite(Number(dbClose.v)) ? round2(dbClose.v) : null);
      pts = pts.filter((p) => {
        if (p.session_kind === 'close') return false;
        const ms = Date.parse(p.t);
        return Number.isFinite(ms) && Number.isFinite(closeMs) && ms < closeMs;
      });
      if (tipV != null) {
        pts = [...pts, { t: closeTs, v: tipV, session_kind: 'close' }];
      }
    }
    const down = downsamplePts(pts, 60);
    trends[sid] = down;
    distinctValues[sid] = new Set(down.map((p) => p.v)).size;
    pointCount = Math.max(pointCount, down.length);
  }

  return {
    trends,
    meta: { ...meta, numeratorMode, pointCount, distinctValues },
    synthesized: false,
    source: 'sector_intraday_returns',
    tradeDate: anchorDash,
    regularSession: !!krxSessionInfo(now).regular,
  };
}

/**
 * Daily cap-weighted index from refs closes × shares; rebase window start = 100.
 * Tip uses live numerator when sessionOpen (Stage 2).
 *
 * @param {number} horizonN 20|50|120|200
 */
export function buildDailySectorSeriesFromRefs(hubIndex, refs, source, horizonN) {
  const tradingDates = (refs?.tradingDates || []).map(compactYmd).filter(Boolean);
  if (!tradingDates.length || !refs?.quotes) return { sectors: [], metaExtras: {} };

  const refsRecentDd = compactYmd(refs.recentDd);
  const sessionOpen = !!source?.meta?.sessionOpen;
  const numeratorMode = source?.meta?.numeratorMode
    || (sessionOpen ? 'live' : 'official');
  const k = source?.meta?.k ?? 0;
  const anchorDd = compactYmd(source?.meta?.anchorDd) || refsRecentDd;
  const startDd = pastSessionDd(tradingDates, anchorDd, horizonN) || null;
  // B mode (close, refs < today): tip date is today so Nd lines reach the same day as cards.
  const tipAtAnchor = sessionOpen || numeratorMode === 'close';

  // Align closes[] to tradingDates (closes = last closesLen dates).
  function closeOnDate(ticker, ymd) {
    const q = refs.quotes[ticker];
    if (!q?.closes?.length) return null;
    const closesLen = q.closes.length;
    const offset = tradingDates.length - closesLen;
    const idx = tradingDates.indexOf(ymd);
    if (idx < 0) return null;
    const ci = idx - offset;
    if (ci < 0 || ci >= closesLen) return null;
    return numOrNull(q.closes[ci]);
  }

  // Window dates: from startDd through refsRecentDd (inclusive).
  let windowDates = tradingDates.filter((d) => {
    if (startDd && d < startDd) return false;
    if (d > refsRecentDd) return false;
    return true;
  });
  if (windowDates.length > TREND_CHART_MAX_POINTS) {
    const step = (windowDates.length - 1) / (TREND_CHART_MAX_POINTS - 1);
    const picked = [];
    for (let i = 0; i < TREND_CHART_MAX_POINTS; i++) {
      const d = windowDates[Math.round(i * step)];
      if (!picked.length || picked[picked.length - 1] !== d) picked.push(d);
    }
    if (picked[picked.length - 1] !== windowDates[windowDates.length - 1]) {
      picked[picked.length - 1] = windowDates[windowDates.length - 1];
    }
    windowDates = picked;
  }

  const sectors = [];
  for (const sid of SECTOR_ORDER) {
    const tickers = (hubIndex.sectors?.[sid]?.companies || [])
      .map((c) => normalizeTicker(c.ticker))
      .filter(Boolean);
    const members = [];
    for (const t of tickers) {
      const q = refs.quotes[t];
      const shares = numOrNull(q?.shares);
      if (!q?.closes?.length || shares == null || !(shares > 0)) continue;
      members.push({ ticker: t, shares, closes: q.closes });
    }
    if (!members.length || !windowDates.length) {
      sectors.push({ sector: sid, name: sectorName(hubIndex, sid), series: [] });
      continue;
    }

    const baseDate = windowDates[0];
    let baseSum = 0;
    let baseN = 0;
    for (const m of members) {
      const c = closeOnDate(m.ticker, baseDate);
      if (c == null || !(c > 0)) continue;
      baseSum += c * m.shares;
      baseN += 1;
    }
    if (!(baseSum > 0) || !baseN) {
      sectors.push({ sector: sid, name: sectorName(hubIndex, sid), series: [] });
      continue;
    }

    const series = [];
    for (const d of windowDates) {
      let sum = 0;
      let n = 0;
      for (const m of members) {
        const c = closeOnDate(m.ticker, d);
        if (c == null || !(c > 0)) continue;
        sum += c * m.shares;
        n += 1;
      }
      if (!(sum > 0) || !n) continue;
      series.push({
        t: basDdToDash(d),
        v: roundIndex((sum / baseSum) * 100),
      });
    }

    // Tip at anchor: live (A) or B-mode close (refs < today) so Nd reaches today.
    if (tipAtAnchor && k >= 1 && source?.byTicker) {
      let tipSum = 0;
      let tipN = 0;
      for (const m of members) {
        const src = source.byTicker[m.ticker];
        const num = numOrNull(src?.numerator);
        if (num == null) continue;
        tipSum += num * m.shares;
        tipN += 1;
      }
      if (tipSum > 0 && tipN) {
        const tipV = roundIndex((tipSum / baseSum) * 100);
        const tipDash = basDdToDash(anchorDd) || kstYmdDash();
        const tipPt = sessionOpen
          ? { t: tipDash, v: tipV, live: true }
          : { t: tipDash, v: tipV };
        if (series.length && series[series.length - 1].t === tipDash) {
          series[series.length - 1] = tipPt;
        } else {
          series.push(tipPt);
        }
      }
    }

    // Lock tip to aggregateSectorReturns (same math as cards) when possible.
    const aggMembers = members.map((m) => {
      const src = source?.byTicker?.[m.ticker];
      return {
        numerator: src?.numerator ?? closeOnDate(m.ticker, refsRecentDd),
        closes: m.closes,
        k,
        shares: m.shares,
      };
    });
    const agg = aggregateSectorReturns(aggMembers);
    const fieldByN = {
      20: 'ret20dPct',
      50: 'ret50dPct',
      120: 'ret120dPct',
      200: 'ret200dPct',
    };
    const targetPct = agg[fieldByN[horizonN]];
    if (targetPct != null && series.length) {
      const locked = retPctToBase100(targetPct);
      if (locked != null) {
        const tipDash = tipAtAnchor
          ? (basDdToDash(anchorDd) || series[series.length - 1].t)
          : series[series.length - 1].t;
        if (series[series.length - 1].t === tipDash) {
          series[series.length - 1] = {
            ...series[series.length - 1],
            v: locked,
          };
        } else {
          series.push({ t: tipDash, v: locked });
        }
      }
    }

    sectors.push({
      sector: sid,
      name: sectorName(hubIndex, sid),
      series,
    });
  }

  return { sectors, startDd, anchorDd, refsRecentDd };
}

async function fetchIndexDailyRebased(config, windowDatesDash, liveTips) {
  if (!config || !windowDatesDash?.length) {
    return INDEX_CODES.map((code) => ({ code, series: [] }));
  }
  const dateFilter = windowDatesDash.map(encodeURIComponent).join(',');
  let rows = [];
  try {
    rows = await fetchSupabaseJson(
      config,
      `market_index_daily?index_code=in.(${INDEX_CODES.join(',')})`
        + `&trade_date=in.(${dateFilter})`
        + `&select=trade_date,index_code,close&order=trade_date.asc`,
    );
  } catch {
    rows = [];
  }
  return INDEX_CODES.map((code) => {
    let pts = rows
      .filter((r) => r.index_code === code)
      .map((r) => ({
        t: String(r.trade_date).slice(0, 10),
        value: numOrNull(r.close),
      }))
      .filter((r) => r.value != null && r.value > 0);
    const today = windowDatesDash[windowDatesDash.length - 1];
    if (liveTips?.get(code) != null) {
      pts = applyLiveTip(pts, today, liveTips.get(code));
    }
    return { code, series: rebaseRowsTo100(pts) };
  });
}

async function fetchIndexIntradayRebased(config, tradeDateDash, numeratorMode = 'live') {
  if (!config || !tradeDateDash) {
    return INDEX_CODES.map((code) => ({ code, series: [] }));
  }

  let rows = [];
  try {
    rows = await fetchSupabaseJson(
      config,
      `market_index_intraday?trade_date=eq.${encodeURIComponent(tradeDateDash)}`
        + `&select=index_code,captured_at,value`
        + `&order=captured_at.asc&limit=2000`,
    );
  } catch (e) {
    const msg = String(e?.message || e);
    const m = msg.match(/supabase_fetch_failed:(\d+):(.*)$/s);
    if (m) {
      console.warn(
        `fetchIndexIntradayRebased ${tradeDateDash}: status=${m[1]} body=${m[2].slice(0, 200)}`,
      );
    } else {
      console.warn(`fetchIndexIntradayRebased ${tradeDateDash}: ${msg.slice(0, 200)}`);
    }
    rows = [];
  }

  let dailyCloseByCode = new Map();
  const mode = String(numeratorMode || 'live');
  if (mode !== 'live') {
    try {
      const daily = await fetchSupabaseJson(
        config,
        `market_index_daily?trade_date=eq.${encodeURIComponent(tradeDateDash)}`
          + `&select=index_code,close`,
      );
      dailyCloseByCode = new Map(
        (daily || [])
          .map((r) => [r.index_code, numOrNull(r.close)])
          .filter(([, v]) => v != null && v > 0),
      );
    } catch (e) {
      const msg = String(e?.message || e);
      const m = msg.match(/supabase_fetch_failed:(\d+):(.*)$/s);
      if (m) {
        console.warn(
          `fetchIndexIntradayRebased daily close ${tradeDateDash}: status=${m[1]} body=${m[2].slice(0, 200)}`,
        );
      } else {
        console.warn(
          `fetchIndexIntradayRebased daily close ${tradeDateDash}: ${msg.slice(0, 200)}`,
        );
      }
    }
  }

  const openTs = `${tradeDateDash}T09:00:00+09:00`;
  const closeTs = `${tradeDateDash}T15:30:00+09:00`;

  return INDEX_CODES.map((code) => {
    const captures = (rows || [])
      .filter((r) => r.index_code === code)
      .map((r) => ({
        t: r.captured_at,
        value: numOrNull(r.value),
      }))
      .filter((r) => r.t && r.value != null && r.value > 0);

    if (!captures.length) {
      return { code, series: [] };
    }

    const first = captures[0].value;
    // 09:00 base 100 from first capture (not prev_close), then capture points.
    const pts = [{ t: openTs, value: first }, ...captures];

    if (mode !== 'live') {
      const dayClose = dailyCloseByCode.get(code);
      if (dayClose != null && dayClose > 0) {
        const last = pts[pts.length - 1];
        if (last?.t === closeTs) {
          pts[pts.length - 1] = { t: closeTs, value: dayClose };
        } else {
          pts.push({ t: closeTs, value: dayClose });
        }
      }
    }
    // live: last capture remains tip (already in series).

    return { code, series: rebaseRowsTo100(pts) };
  });
}

/**
 * Full /api/hub_trend payload (base=100) from stock-aggregate source.
 */
export async function buildAggregateHubTrendPayload(
  hubIndex,
  env,
  horizon,
  now = new Date(),
  request = null,
) {
  const h = String(horizon || '20d');
  const config = getSupabaseConfig(env);

  if (h === '1d') {
    const one = await buildIntraday1dSeries({ hubIndex, env, request, now });
    const sectors = SECTOR_ORDER.map((sid) => ({
      sector: sid,
      name: sectorName(hubIndex, sid),
      series: pctSeriesToBase100(one.trends[sid] || []),
    })).filter((e) => e.series.length);
    // Keep empty shells for missing so client shape stable.
    const bySid = new Map(sectors.map((s) => [s.sector, s]));
    const sectorList = SECTOR_ORDER.map((sid) => bySid.get(sid) || {
      sector: sid,
      name: sectorName(hubIndex, sid),
      series: [],
    });
    const indices = await fetchIndexIntradayRebased(
      config,
      one.tradeDate,
      one.meta?.numeratorMode,
    );
    return {
      horizon: '1d',
      base: 100,
      sectors: sectorList,
      indices,
      tradeDate: one.tradeDate,
      regularSession: one.regularSession,
      synthesized: one.synthesized,
      source: one.source,
      ...one.meta,
    };
  }

  const horizonN = TREND_DAILY_LOOKBACK[h] || 20;
  const live = await computeLiveSectorAggregates(hubIndex, env, request, now);
  const refs = live.source?.refs || await loadCachedReturnRefs(request, env, null);
  if (!refs?.quotes) {
    return {
      horizon: h,
      base: 100,
      sectors: SECTOR_ORDER.map((sid) => ({
        sector: sid,
        name: sectorName(hubIndex, sid),
        series: [],
      })),
      indices: INDEX_CODES.map((code) => ({ code, series: [] })),
      ...live.meta,
      source: 'stock_aggregate',
      synthesized: false,
    };
  }

  const { sectors, startDd } = buildDailySectorSeriesFromRefs(
    hubIndex,
    refs,
    live.source,
    horizonN,
  );

  const tradingDates = (refs.tradingDates || []).map(compactYmd).filter(Boolean);
  const refsRecentDd = compactYmd(refs.recentDd);
  const anchorDd = compactYmd(live.meta.anchorDd) || kstYmdDash(now);
  const todayDash = basDdToDash(anchorDd) || kstYmdDash(now);
  const isBMode = live.meta.numeratorMode === 'close'
    && !!refsRecentDd
    && !!anchorDd
    && refsRecentDd < anchorDd;
  let windowDates = tradingDates.filter((d) => {
    if (startDd && d < startDd) return false;
    if (d > refsRecentDd) return false;
    return true;
  }).map(basDdToDash);

  // B mode: extend index window to today (market_index_daily.close tip), matching sector tip date.
  if (isBMode && todayDash && !windowDates.includes(todayDash)) {
    windowDates = [...windowDates, todayDash];
  }

  // Live tip (A mode) — latest intraday capture; B mode uses daily close via windowDates.
  const liveTips = new Map();
  if (live.meta.sessionOpen && config) {
    try {
      const tipRows = await fetchSupabaseJson(
        config,
        `market_index_intraday?trade_date=eq.${encodeURIComponent(todayDash)}`
          + `&select=index_code,value,captured_at&order=captured_at.desc&limit=10`,
      );
      for (const code of INDEX_CODES) {
        const row = (tipRows || []).find((r) => r.index_code === code);
        const v = numOrNull(row?.value);
        if (v != null) liveTips.set(code, v);
      }
    } catch (e) {
      const msg = String(e?.message || e);
      const m = msg.match(/supabase_fetch_failed:(\d+):(.*)$/s);
      if (m) {
        console.warn(
          `fetchIndexDaily liveTips ${todayDash}: status=${m[1]} body=${m[2].slice(0, 200)}`,
        );
      } else {
        console.warn(`fetchIndexDaily liveTips ${todayDash}: ${msg.slice(0, 200)}`);
      }
    }
  }

  const indices = await fetchIndexDailyRebased(config, windowDates, liveTips);

  return {
    horizon: h,
    base: 100,
    sectors,
    indices,
    tradeDate: basDdToDash(live.meta.anchorDd) || basDdToDash(refsRecentDd),
    regularSession: !!krxSessionInfo(now).regular,
    synthesized: false,
    source: 'stock_aggregate',
    ...live.meta,
  };
}

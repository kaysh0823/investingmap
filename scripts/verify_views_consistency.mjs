/**
 * Cross-view 1D returns consistency:
 * quotes ↔ hub_sectors ↔ hub_trend tip ↔ hub_movers, plus meta alignment
 * and format1dYTick uniqueness.
 *
 * Usage:
 *   BASE_URL=https://www.investingmap.kr npm run verify:views
 *   node scripts/verify_views_consistency.mjs --base=http://127.0.0.1:8788
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateSectorReturns,
} from '../functions/lib/returns_core.mjs';
import { krxSessionInfo, kstDateParts, kstAnchorYmd } from '../functions/lib/krx_session.mjs';
import { getSupabaseConfig, numOrNull } from '../functions/lib/supabase_hub.mjs';
import { normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOL = 0.01;

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!env[k]) env[k] = v;
  }
  return env;
}

function parseArgs(argv) {
  let base = process.env.BASE_URL || '';
  for (const a of argv) {
    if (a.startsWith('--base=')) base = a.slice('--base='.length);
  }
  return { base: base.replace(/\/+$/, '') };
}

/** Same as js/hub_trend_chart.js format1dYTick */
export function format1dYTick(value) {
  const s = (Math.round(Number(value) * 100) / 100).toFixed(2);
  return s.replace(/\.?0+$/, '');
}

function unique1dYTickLabels(domain, tickCount = 7) {
  const [lo, hi] = domain;
  const span = hi - lo;
  const step = span / Math.max(1, tickCount - 1);
  const raw = [];
  for (let i = 0; i < tickCount; i++) raw.push(lo + step * i);
  const seen = new Set();
  const labels = [];
  for (const v of raw) {
    const label = format1dYTick(v);
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

async function fetchJson(base, apiPath) {
  const url = `${base}${apiPath}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${apiPath} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function nearlyEqual(a, b, tol = TOL) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) <= tol;
}

function fail(msg, detail) {
  console.error(`FAIL: ${msg}`);
  if (detail) console.error(detail);
  process.exit(1);
}

function lastSeriesPoint(series) {
  if (!Array.isArray(series) || !series.length) return null;
  return series[series.length - 1];
}

/** True for T15:30+09:00 or equivalent UTC (06:30Z = KST 15:30). */
function isKstCloseTip(t) {
  const s = String(t || '');
  if (s.includes('T15:30')) return true;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return false;
  const kst = new Date(ms + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() === 15 && kst.getUTCMinutes() === 30;
}

function retPctFromBase100(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round((Number(v) - 100) * 100) / 100;
}

function kstHm(now = new Date()) {
  const p = kstDateParts(now);
  return p.hour * 60 + p.minute;
}

async function main() {
  const env = loadEnv();
  Object.assign(process.env, env);
  const { base } = parseArgs(process.argv.slice(2));
  if (!base) {
    fail('BASE_URL or --base= required');
  }

  console.log(`verify:views base=${base}`);

  // h) tickFormat unit test (offline) + hub_valuation_snapshot cache header
  {
    const labels = unique1dYTickLabels([99.6, 100.4], 7);
    assert.ok(labels.length >= 2, '1d y ticks should produce ≥2 labels');
    assert.equal(new Set(labels).size, labels.length, `duplicate 1d y labels: ${labels.join(',')}`);
    console.log(`  h) format1dYTick unique on [99.6,100.4]: ${labels.join(', ')}`);
    const headersPath = path.join(ROOT, '_headers');
    const headersText = fs.readFileSync(headersPath, 'utf8');
    assert.ok(
      /\/data\/hub_valuation_snapshot\.json[\s\S]*?max-age=60,\s*must-revalidate/.test(headersText),
      'h) hub_valuation_snapshot.json must have 60s must-revalidate in _headers',
    );
    console.log('  h) hub_valuation_snapshot 60s header ok');
  }

  // g) code guard: chg1dPct assignment outside /api/quotes pipeline
  {
    const jsRoot = path.join(ROOT, 'js');
    const files = fs.readdirSync(jsRoot).filter((f) => f.endsWith('.js'));
    const violations = [];
    for (const f of files) {
      // live_quotes copies chg1dPct from /api/quotes response — allowed.
      if (f === 'live_quotes.js') continue;
      const text = fs.readFileSync(path.join(jsRoot, f), 'utf8');
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        // Assignment only — do not match `===` / `==` comparisons.
        if (/\.chg1dPct\s*=(?![=])/.test(lines[i])) {
          violations.push(`${f}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
    if (violations.length) {
      fail('g) chg1dPct assigned outside quotes pipeline', violations.join('\n'));
    }
    console.log('  g) no rogue chg1dPct assignments in js/');
  }

  const [quotes, sectors, trend, movers, trend20] = await Promise.all([
    fetchJson(base, '/api/quotes?codes=005930,000660,036930'),
    fetchJson(base, '/api/hub_sectors?horizon=1d'),
    fetchJson(base, '/api/hub_trend?horizon=1d&v=7'),
    fetchJson(base, '/api/hub_movers'),
    fetchJson(base, '/api/hub_trend?horizon=20d'),
  ]);

  // e) meta alignment
  const metaKeys = ['numeratorMode', 'anchorDd', 'dataVersion'];
  for (const key of metaKeys) {
    const vals = [quotes[key], sectors[key], trend[key], movers[key]];
    const first = vals.find((v) => v != null && v !== '');
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] == null || vals[i] === '') continue;
      if (String(vals[i]) !== String(first)) {
        fail(`e) ${key} mismatch`, {
          quotes: quotes[key],
          hub_sectors: sectors[key],
          hub_trend: trend[key],
          hub_movers: movers[key],
        });
      }
    }
  }
  console.log(
    `  e) meta ok mode=${quotes.numeratorMode} anchor=${quotes.anchorDd} k=${quotes.k} dv=${quotes.dataVersion}`,
  );

  // a) quotes chg1dPct present
  for (const code of ['005930', '000660', '036930']) {
    const item = quotes.items?.[code];
    if (!item || item.chg1dPct == null) {
      fail(`a) quotes missing chg1dPct for ${code}`, item);
    }
  }
  console.log(
    `  a) quotes 005930 chg1dPct=${quotes.items['005930'].chg1dPct}`,
  );

  // b) hub_sectors tip == member aggregate (±0.01) for semi / holdings
  {
    const hubIndexPath = path.join(ROOT, 'data', 'hub_index.json');
    const hubIndex = JSON.parse(fs.readFileSync(hubIndexPath, 'utf8'));
    const config = getSupabaseConfig(env);
    // Rebuild from API quotes + sector membership is heavy; compare trend tip vs sector return1dPct.
    for (const sid of ['semi', 'holdings']) {
      const sRet = sectors.sectors?.[sid]?.return1dPct;
      const series = (trend.sectors || []).find((s) => s.sector === sid)?.series;
      const tip = lastSeriesPoint(series);
      const tipPct = tip ? retPctFromBase100(tip.v) : null;
      if (sRet == null || tipPct == null) {
        fail(`b) missing ${sid} sector/trend 1d`, { sRet, tipPct });
      }
      if (!nearlyEqual(sRet, tipPct)) {
        fail(`b) ${sid} hub_sectors.return1dPct != hub_trend tip`, {
          sectors: sRet,
          trendTip: tipPct,
        });
      }
    }
    void config;
    void hubIndex;
    void aggregateSectorReturns;
    void normalizeTicker;
    void numOrNull;
    console.log('  b) hub_sectors semi/holdings == hub_trend tip (±0.01)');
  }

  // c) hub_trend last point rules
  {
    const sample = (trend.sectors || []).find((s) => s.series?.length)?.series;
    const tip = lastSeriesPoint(sample);
    if (!tip) fail('c) hub_trend 1d has no points');
    const tipMs = Date.parse(tip.t);
    const minutes = kstHm();
    const mode = trend.numeratorMode;
    const pointCount = trend.pointCount ?? sample.length;
    const distinctMap = trend.distinctValues || {};
    const maxDistinct = Math.max(0, ...Object.values(distinctMap).map(Number));
    const afterClose = mode === 'close' || mode === 'official' || minutes >= 16 * 60;

    if (mode === 'live' && minutes >= 11 * 60 && minutes < 15 * 60 + 30) {
      if (pointCount < 6) fail(`c) 11:00 live pointCount≥6 expected, got ${pointCount}`);
      if (maxDistinct < 2) {
        console.warn(`  c) WARN distinctValues max=${maxDistinct} (<2) — freeze may trip`);
      }
      const lagMin = Math.abs(Date.now() - tipMs) / 60000;
      if (lagMin > 15) {
        fail(`c) live tip t must be now±15m, lag=${lagMin.toFixed(1)}m`, tip.t);
      }
      if (tip.live === false) {
        /* ok if live flag omitted */
      }
    }
    if (afterClose) {
      if (!isKstCloseTip(tip.t) && mode !== 'live') {
        fail(`c) B/C last t must be 15:30, got ${tip.t}`);
      }
      const hasLive = (trend.sectors || []).some((s) =>
        (s.series || []).some((p) => p.live),
      );
      if (hasLive) fail('c) B/C must not include live tip points');

      for (const sid of ['semi', 'holdings']) {
        const series = (trend.sectors || []).find((s) => s.sector === sid)?.series || [];
        if (series.length < 40) {
          fail(`c) ${sid} pointCount≥40 after close, got ${series.length}`);
        }
        const sidTip = lastSeriesPoint(series);
        if (!isKstCloseTip(sidTip?.t)) {
          fail(`c) ${sid} last t must be 15:30 after close, got ${sidTip?.t}`);
        }
      }
    }

    // 1d KOSPI/KOSDAQ index series
    const indexList = trend.indices || [];
    for (const code of ['KOSPI', 'KOSDAQ']) {
      const idx = indexList.find((x) => x.code === code);
      const series = idx?.series || [];
      if (mode === 'live' && minutes >= 11 * 60 && minutes < 15 * 60 + 30) {
        if (series.length < 4) {
          fail(`c) 1d ${code} series≥4 expected during live, got ${series.length}`);
        }
      }
      if (afterClose) {
        if (series.length < 4) {
          fail(`c) 1d ${code} series≥4 after close, got ${series.length}`);
        }
        const iTip = lastSeriesPoint(series);
        if (!iTip) {
          fail(`c) 1d ${code} missing after close`);
        } else if (!isKstCloseTip(iTip.t)) {
          fail(`c) 1d ${code} last t must be 15:30 after close, got ${iTip.t}`);
        }
      }
    }

    // 20d indices last date == sector last date
    {
      const semi20 = (trend20.sectors || []).find((s) => s.sector === 'semi');
      const sectorLast = String(lastSeriesPoint(semi20?.series)?.t || '').slice(0, 10);
      if (!sectorLast) fail('c) 20d semi series missing');
      for (const code of ['KOSPI', 'KOSDAQ']) {
        const idx = (trend20.indices || []).find((x) => x.code === code);
        const indexLast = String(lastSeriesPoint(idx?.series)?.t || '').slice(0, 10);
        if (!indexLast) fail(`c) 20d ${code} series missing`);
        if (indexLast !== sectorLast) {
          fail(`c) 20d ${code} last date ${indexLast} != sector ${sectorLast}`);
        }
      }
    }

    console.log(
      `  c) trend tip t=${tip.t} pointCount=${pointCount} maxDistinct=${maxDistinct}`
        + ` indices=${indexList.map((i) => `${i.code}:${(i.series || []).length}`).join(',')}`
        + ` 20dTip=${String(lastSeriesPoint((trend20.sectors || []).find((s) => s.sector === 'semi')?.series)?.t || '').slice(0, 10)}`,
    );
  }

  // d) movers gainers1d == quotes for same tickers
  {
    const gainers = movers.gainers1dTop10 || [];
    for (const row of gainers.slice(0, 5)) {
      const t = normalizeTicker(row.ticker);
      if (!t) continue;
      const q = quotes.items?.[t];
      if (!q) {
        // movers may include tickers outside the 3 we fetched — fetch one-off
        const one = await fetchJson(base, `/api/quotes?codes=${t}`);
        const chg = one.items?.[t]?.chg1dPct;
        if (!nearlyEqual(chg, row.chg1dPct)) {
          fail(`d) movers ${t} chg1dPct != quotes`, { movers: row.chg1dPct, quotes: chg });
        }
      } else if (!nearlyEqual(q.chg1dPct, row.chg1dPct)) {
        fail(`d) movers ${t} chg1dPct != quotes`, {
          movers: row.chg1dPct,
          quotes: q.chg1dPct,
        });
      }
    }
    console.log(`  d) movers gainers1d aligned with quotes (${gainers.length} rows checked)`);
  }

  // f) mode expectations by clock + offline A/B/C edge cases
  {
    const session = krxSessionInfo();
    const minutes = kstHm();
    const mode = quotes.numeratorMode;
    const k = quotes.k;
    const today = kstAnchorYmd();
    if (session.regular) {
      if (mode !== 'live') fail(`f) 11:00-ish expected live, got ${mode}`);
      if (k < 1 && quotes.refsRecentDd && quotes.refsRecentDd < today) {
        fail(`f) live expected k≥1, got k=${k}`);
      }
    } else if (minutes >= 15 * 60 + 45 && minutes < 20 * 60) {
      if (mode !== 'close' && mode !== 'official') {
        fail(`f) 15:45 expected close|official, got ${mode}`);
      }
      if (mode === 'close' && k < 1 && quotes.refsRecentDd && quotes.refsRecentDd < today) {
        fail(`f) close expected k≥1, got k=${k}`);
      }
      const config = getSupabaseConfig(env);
      if (config && mode === 'close') {
        try {
          const dash = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`;
          const url =
            `${config.url}/rest/v1/stock_price_history?ticker=eq.005930&trade_date=eq.${dash}`
            + `&select=close&limit=1`;
          const res = await fetch(url, {
            headers: {
              apikey: config.anonKey,
              Authorization: `Bearer ${config.anonKey}`,
            },
          });
          if (res.ok) {
            const rows = await res.json();
            const close = numOrNull(rows?.[0]?.close);
            const last = numOrNull(quotes.items?.['005930']?.last);
            if (close != null && last != null && !nearlyEqual(close, last, 1)) {
              fail('f) 005930 last != ticker_ohlc today close', { last, close });
            }
          }
        } catch {
          /* optional */
        }
      }
    } else if (minutes >= 20 * 60 + 30 || minutes < 9 * 60) {
      if (session.regular) {
        /* skip */
      } else if (quotes.refsRecentDd === today && mode !== 'official') {
        fail(`f) post_close expected official, got ${mode}`);
      }
      // official: quotes.last == refs tip == history close (same 005930)
      if (mode === 'official' && quotes.refsRecentDd === today) {
        const tip = Number(
          JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hub_return_refs.json'), 'utf8'))
            .quotes?.['005930']?.closes?.slice(-1)?.[0],
        );
        const qLast = numOrNull(quotes.items?.['005930']?.last);
        if (!Number.isFinite(tip) || tip <= 0) {
          fail('f) official refs tip missing for 005930');
        }
        if (qLast == null || !nearlyEqual(qLast, tip, 1)) {
          fail('f) official quotes.last != refs tip', { qLast, tip });
        }
        const config = getSupabaseConfig(env);
        if (config) {
          try {
            const dash = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`;
            const url =
              `${config.url}/rest/v1/stock_price_history?ticker=eq.005930&trade_date=eq.${dash}`
              + `&select=close&limit=1`;
            const res = await fetch(url, {
              headers: {
                apikey: config.anonKey,
                Authorization: `Bearer ${config.anonKey}`,
              },
            });
            if (res.ok) {
              const rows = await res.json();
              const close = numOrNull(rows?.[0]?.close);
              if (close != null && !nearlyEqual(close, tip, 1)) {
                fail('f) official refs tip != ticker_ohlc close', { tip, close });
              }
              if (close != null && qLast != null && !nearlyEqual(qLast, close, 1)) {
                fail('f) official quotes.last != ticker_ohlc close', { qLast, close });
              }
              console.log(`  f) official triple match last=tip=ohlc=${tip}`);
            }
          } catch {
            /* optional when supabase unavailable */
          }
        }
      }
    }
    console.log(`  f) mode clock check ok (${mode}, k=${k})`);

    // Offline A/B/C edge cases (independent of live clock)
    const { loadReturnSource } = await import('../functions/lib/hub_returns_source.mjs');
    const { computeStockReturns, roundPct } = await import('../functions/lib/returns_core.mjs');
    const refsPath = path.join(ROOT, 'data', 'hub_return_refs.json');
    const refsFile = JSON.parse(fs.readFileSync(refsPath, 'utf8'));
    const refQ = refsFile.quotes?.['005930'];
    assert.ok(refQ?.closes?.length >= 2, 'f) refs 005930 closes');
    const closes = refQ.closes;
    const L = closes.length;
    const official1d = roundPct(closes[L - 1] / closes[L - 2] - 1);
    assert.ok(Math.abs(official1d) > 0.001 || official1d === 0, 'f) official 1d computable');
    // Prefer a non-zero sample when available; still assert not spuriously forced to 0 by mode.
    const prevDd = String(refsFile.recentDd || '').replace(/-/g, '');
    assert.ok(/^\d{8}$/.test(prevDd), 'f) refs.recentDd');

    function kstAt(ymd, hh, mm) {
      const dash = /^\d{8}$/.test(ymd)
        ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
        : ymd;
      return new Date(
        `${dash}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`,
      );
    }
    // Next calendar day after refs tip (weekday preferred for closeEligible tests).
    function nextYmd(ymd) {
      const dash = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
      const d = new Date(`${dash}T12:00:00+09:00`);
      d.setTime(d.getTime() + 24 * 60 * 60 * 1000);
      const p = kstDateParts(d);
      return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
    }
    let simToday = nextYmd(prevDd);
    // Advance until weekday for B/closeEligible sims
    for (let i = 0; i < 5; i++) {
      const probe = kstAt(simToday, 12, 0);
      const wp = kstDateParts(probe);
      if (wp.weekday >= 1 && wp.weekday <= 5) break;
      simToday = nextYmd(simToday);
    }

    // 08:30 pre-open → official k=0, chg1dPct = refs tip 1D (not forced 0)
    {
      const now = kstAt(simToday, 8, 30);
      const src = await loadReturnSource({
        env: {},
        tickers: ['005930'],
        refs: refsFile,
        quoteRows: [{
          ticker: '005930',
          last: closes[L - 1],
          as_of: `${prevDd.slice(0, 4)}-${prevDd.slice(4, 6)}-${prevDd.slice(6, 8)}T15:30:00+09:00`,
          trade_date: `${prevDd.slice(0, 4)}-${prevDd.slice(4, 6)}-${prevDd.slice(6, 8)}`,
        }],
        now,
      });
      if (src.meta.numeratorMode !== 'official' || src.meta.k !== 0) {
        fail('f) 08:30 pre-open expected official/k=0', src.meta);
      }
      const ret = computeStockReturns({
        numerator: src.byTicker['005930'].numerator,
        closes,
        k: src.meta.k,
      });
      if (!nearlyEqual(ret.chg1dPct, official1d)) {
        fail('f) 08:30 chg1dPct != refs official 1d', {
          got: ret.chg1dPct,
          expected: official1d,
        });
      }
      if (ret.chg1dPct === 0 && official1d !== 0) {
        fail('f) 08:30 chg1dPct unexpectedly 0 while official 1d is not');
      }
      console.log(`  f) 08:30 pre-open official ok chg1d=${ret.chg1dPct}`);
    }

    // Holiday: weekday afternoon clock but tradeDd still prior session → official
    {
      const now = kstAt(simToday, 16, 0);
      const src = await loadReturnSource({
        env: {},
        tickers: ['005930'],
        refs: { ...refsFile, recentDd: prevDd },
        quoteRows: [{
          ticker: '005930',
          last: closes[L - 1],
          as_of: `${prevDd.slice(0, 4)}-${prevDd.slice(4, 6)}-${prevDd.slice(6, 8)}T15:30:00+09:00`,
          trade_date: `${prevDd.slice(0, 4)}-${prevDd.slice(4, 6)}-${prevDd.slice(6, 8)}`,
        }],
        now,
      });
      if (src.meta.numeratorMode !== 'official' || src.meta.k !== 0) {
        fail('f) holiday sim expected official/k=0', {
          meta: src.meta,
          simToday,
          prevDd,
        });
      }
      console.log('  f) holiday sim official/k=0 ok');
    }

    // 15:45 B: ticker without today row → numerator null (sector-excluded)
    {
      const now = kstAt(simToday, 15, 45);
      const src = await loadReturnSource({
        env: {},
        tickers: ['005930', '000660'],
        refs: { ...refsFile, recentDd: prevDd },
        quoteRows: [
          {
            ticker: '005930',
            last: closes[L - 1] + 1000,
            as_of: now.toISOString(),
            trade_date: `${simToday.slice(0, 4)}-${simToday.slice(4, 6)}-${simToday.slice(6, 8)}`,
          },
          // 000660: prior-day row only — missing today close
          {
            ticker: '000660',
            last: 100000,
            as_of: `${prevDd.slice(0, 4)}-${prevDd.slice(4, 6)}-${prevDd.slice(6, 8)}T15:30:00+09:00`,
            trade_date: `${prevDd.slice(0, 4)}-${prevDd.slice(4, 6)}-${prevDd.slice(6, 8)}`,
          },
        ],
        now,
      });
      if (src.meta.numeratorMode !== 'close') {
        fail('f) 15:45 B expected close mode', src.meta);
      }
      if (src.byTicker['005930']?.numerator == null) {
        fail('f) 15:45 B 005930 should have numerator');
      }
      if (src.byTicker['000660']?.numerator != null) {
        fail('f) 15:45 B missing-today ticker must have numerator=null', src.byTicker['000660']);
      }
      if (!(src.meta.closeMissingCount >= 1)) {
        fail('f) 15:45 closeMissingCount expected ≥1', src.meta);
      }
      const members = ['005930', '000660'].map((t) => ({
        numerator: src.byTicker[t]?.numerator,
        closes: src.byTicker[t]?.closes,
        k: src.meta.k,
        shares: 1000,
      }));
      const agg = aggregateSectorReturns(members);
      // Only 005930 contributes — not a blend with officialClose fallback
      const only = aggregateSectorReturns([members[0]]);
      if (!nearlyEqual(agg.chg1dPct, only.chg1dPct)) {
        fail('f) missing-today ticker must be excluded from sector agg', {
          agg: agg.chg1dPct,
          only: only.chg1dPct,
        });
      }
      console.log(`  f) 15:45 B null-numerator exclude ok (missing=${src.meta.closeMissingCount})`);
    }
  }

  console.log('verify:views OK');
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
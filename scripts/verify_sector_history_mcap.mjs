/**
 * Verify history-based sector returns vs inverse fallback (closed session)
 * and that an intraday mcap bump moves only the numerator.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tradingDates, pastDatesFromAnchor } from '../functions/lib/krx_yoy.mjs';
import { kstYmd } from '../functions/lib/krx_session.mjs';
import { normalizeTicker, SECTOR_ORDER } from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_\u0080-\uFFFF ]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!env[m[1].trim()]) env[m[1].trim()] = v;
  }
  return env;
}

function basDdToDash(basDd) {
  return `${basDd.slice(0, 4)}-${basDd.slice(4, 6)}-${basDd.slice(6, 8)}`;
}

function inverse(members, retKey) {
  let sumNow = 0;
  let sumPast = 0;
  for (const m of members) {
    const ret = m[retKey];
    const mcap = m.mcap_won;
    if (ret == null || !Number.isFinite(ret) || mcap == null || mcap <= 0) continue;
    const g = 1 + ret / 100;
    if (!(g > 0)) continue;
    sumNow += mcap;
    sumPast += mcap / g;
  }
  if (sumPast <= 0) return null;
  return Math.round((sumNow / sumPast - 1) * 10000) / 100;
}

function fromHistory(members, pastByTicker) {
  let sumNow = 0;
  let sumPast = 0;
  let paired = 0;
  for (const m of members) {
    if (m.mcap_won == null || m.mcap_won <= 0) continue;
    const past = pastByTicker.get(m.ticker);
    if (past == null || past <= 0) continue;
    sumNow += m.mcap_won;
    sumPast += past;
    paired += 1;
  }
  if (sumPast <= 0) return { ret: null, sumNow, sumPast, paired };
  return {
    ret: Math.round((sumNow / sumPast - 1) * 10000) / 100,
    sumNow,
    sumPast,
    paired,
  };
}

async function fetchJson(url, headers) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  const env = loadEnv();
  const u = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const sk = env.SUPABASE_SERVICE_ROLE_KEY;
  const h = { apikey: sk, Authorization: `Bearer ${sk}` };
  const hub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hub_index.json'), 'utf8'));

  const quotes = await fetchJson(
    `${u}/rest/v1/stock_quotes_latest?select=ticker,mcap_won,chg_1d_pct,ret_20d_pct,ret_200d_pct,regular_session&limit=2000`,
    h,
  );
  const byTicker = new Map(quotes.map((q) => [normalizeTicker(q.ticker), q]));

  const dates = tradingDates(260);
  const today = kstYmd();
  const anchor = dates[0] === today || dates.includes(today) ? (dates.includes(today) ? today : dates[0]) : dates[0];
  const past1d = pastDatesFromAnchor(anchor, dates, 1, 12).map(basDdToDash);
  console.log({ anchor, past1d: past1d[0], regular: quotes[0]?.regular_session });

  const pastMap = new Map();
  let offset = 0;
  for (;;) {
    const page = await fetchJson(
      `${u}/rest/v1/stock_price_history?trade_date=eq.${past1d[0]}&select=ticker,mcap_won&mcap_won=gt.0&limit=1000&offset=${offset}`,
      h,
    );
    if (!Array.isArray(page) || !page.length) break;
    for (const row of page) {
      const t = normalizeTicker(row.ticker);
      if (t) pastMap.set(t, Number(row.mcap_won));
    }
    if (page.length < 1000) break;
    offset += 1000;
  }
  console.log(`history ${past1d[0]} rows=${pastMap.size}`);

  const sid = 'semi';
  const members = (hub.sectors[sid].companies || [])
    .map((c) => byTicker.get(normalizeTicker(c.ticker)))
    .filter(Boolean);

  const histRet = fromHistory(members, pastMap);
  const invRet = inverse(members, 'chg_1d_pct');
  console.log('semi 1d history', histRet);
  console.log('semi 1d inverse', invRet);
  if (histRet.ret != null && invRet != null) {
    const diff = Math.abs(histRet.ret - invRet);
    console.log(`closed-session |history-inverse|=${diff.toFixed(4)} (expect small when last≈close)`);
    if (diff > 1.5) console.warn('WARN: larger than expected closed-session gap');
    else console.log('CLOSED_SESSION_OK');
  }

  // Intraday simulation: bump Samsung mcap +10%, past must stay fixed.
  const simMembers = members.map((m) => ({ ...m }));
  const sam = simMembers.find((m) => m.ticker === '005930');
  if (sam) sam.mcap_won = sam.mcap_won * 1.1;
  const sim = fromHistory(simMembers, pastMap);
  console.log('semi 1d after +10% 005930 mcap', sim);
  if (histRet.sumPast === sim.sumPast && sim.sumNow > histRet.sumNow && sim.ret > histRet.ret) {
    console.log('INTRADAY_NUMERATOR_OK (denom fixed, num moved)');
  } else {
    console.warn('INTRADAY_CHECK_FAIL', { past0: histRet.sumPast, past1: sim.sumPast, now0: histRet.sumNow, now1: sim.sumNow });
  }

  // Spot-check hub_sectors if reachable
  try {
    for (const hz of ['1d', '20d', '200d']) {
      const r = await fetch(`https://www.investingmap.kr/api/hub_sectors?horizon=${hz}&nocache=1`, {
        signal: AbortSignal.timeout(60000),
      });
      const j = await r.json();
      console.log(`hub_sectors ${hz}`, {
        asOf: j.asOf,
        semi: j.sectors?.semi?.[`return${hz === '1d' ? '1d' : hz === '20d' ? '20d' : '200d'}Pct`],
        n: Object.keys(j.sectors || {}).length,
      });
    }
  } catch (e) {
    console.log('hub_sectors probe skipped:', e.message);
  }

  console.log('sectors in hub_index', SECTOR_ORDER.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

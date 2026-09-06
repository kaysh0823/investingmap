/**
 * Unit checks for sector_perf_calendar rebase / avg / downsample helpers.
 * Usage: node scripts/verify_sector_perf_calendar.mjs
 * Optional live: VERIFY_PERF_CAL_LIVE=1 node scripts/verify_sector_perf_calendar.mjs
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizePerfCalendarYear,
  normalizePerfCalendarSector,
  rebaseMemberPoints,
  buildSectorAvgPoints,
  buildPerfCalendarSampleDates,
  listSectorMembers,
  currentKstYear,
  PERF_CALENDAR_MAX_POINTS,
  buildSectorPerfCalendarPayload,
} from '../functions/lib/sector_perf_calendar.mjs';
import { getSupabaseConfig } from '../functions/lib/supabase_hub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cur = currentKstYear();

assert.equal(normalizePerfCalendarSector('semi'), 'semi');
assert.equal(normalizePerfCalendarSector('nope'), null);
assert.equal(normalizePerfCalendarYear(String(cur)), cur);
assert.equal(normalizePerfCalendarYear(String(cur - 4)), cur - 4);
assert.equal(normalizePerfCalendarYear(String(cur - 5)), null);
assert.equal(normalizePerfCalendarYear(String(cur + 1)), null);
assert.equal(normalizePerfCalendarYear(null), cur);

const closes = [
  { t: '2025-12-30', c: 1000 },
  { t: '2026-01-02', c: 1100 },
  { t: '2026-01-03', c: 1200 },
];
const pts = rebaseMemberPoints(closes, [], '2026-01-01', '2026-12-31');
assert.equal(pts.length, 2);
assert.equal(pts[0].t, '2026-01-02');
assert.equal(pts[0].v, 110);
assert.equal(pts[1].v, 120);

const ipo = rebaseMemberPoints(
  [
    { t: '2026-03-01', c: 50000 },
    { t: '2026-03-02', c: 55000 },
  ],
  [],
  '2026-01-01',
  '2026-12-31',
);
assert.equal(ipo[0].v, 100);
assert.equal(ipo[1].v, 110);

const avg = buildSectorAvgPoints([
  { points: [{ t: '2026-01-02', v: 110 }, { t: '2026-01-03', v: 120 }] },
  { points: [{ t: '2026-01-02', v: 90 }] },
]);
assert.equal(avg[0].t, '2026-01-02');
assert.equal(avg[0].v, 100);
assert.equal(avg[1].v, 120);

const calendar = [];
for (let i = 1; i <= 20; i++) calendar.push(`2025-12-${String(i).padStart(2, '0')}`);
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= 20; d++) {
    calendar.push(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
}
const sample = buildPerfCalendarSampleDates(calendar, '2026-01-01', '2026-12-31', 40);
assert.equal(sample[0], '2025-12-20');
assert.equal(sample[1], '2026-01-01');
assert.equal(sample[sample.length - 1], '2026-12-20');
assert.ok(sample.length <= 41);
assert.ok(sample.length >= 2);

const hub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hub_index.json'), 'utf8'));
const bigchip = listSectorMembers(hub, 'bigchip');
assert.ok(bigchip.length >= 2);
assert.ok(PERF_CALENDAR_MAX_POINTS >= 60 && PERF_CALENDAR_MAX_POINTS <= 80);

console.log('verify_sector_perf_calendar OK (unit)');

function loadEnv() {
  const env = { ...process.env };
  const devVars = path.join(ROOT, '.dev.vars');
  if (!fs.existsSync(devVars)) return env;
  for (const line of fs.readFileSync(devVars, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!env[m[1]]) env[m[1]] = v;
  }
  return env;
}

async function liveChecks() {
  const env = loadEnv();
  const config = getSupabaseConfig(env);
  if (!config) throw new Error('supabase unconfigured');

  const cases = [
    ['semi', 2023],
    ['finance', 2024],
    ['bio', 2023],
    ['bigchip', cur],
  ];

  for (const [sector, year] of cases) {
    const t0 = Date.now();
    const payload = await buildSectorPerfCalendarPayload(hub, config, sector, year);
    const ms = Date.now() - t0;
    assert.equal(payload.sector, sector);
    assert.equal(payload.year, year);
    assert.ok(payload.members.length > 0, `${sector} ${year} members`);
    assert.ok(payload.sectorAvg.length > 0, `${sector} ${year} sectorAvg`);
    assert.ok(
      payload.tradingDays <= PERF_CALENDAR_MAX_POINTS + 1,
      `${sector} ${year} tradingDays=${payload.tradingDays}`,
    );
    assert.ok(payload.tradingDays >= 10, `${sector} ${year} too few points`);
    // market_index_daily may lag stock history; require indices only when present or current year.
    if (year === cur) {
      assert.ok(payload.indices.KOSPI.length > 0, `${sector} ${year} KOSPI`);
      assert.ok(payload.indices.KOSDAQ.length > 0, `${sector} ${year} KOSDAQ`);
    }
    const first = payload.sectorAvg[0];
    const last = payload.sectorAvg[payload.sectorAvg.length - 1];
    assert.ok(first.t.startsWith(String(year)));
    assert.ok(last.t.startsWith(String(year)));
    console.log(
      `  live ${sector} ${year}: members=${payload.members.length} days=${payload.tradingDays} ` +
        `avg=${first.v}→${last.v} kospi=${payload.indices.KOSPI.length} ${ms}ms`,
    );
  }
}

if (process.env.VERIFY_PERF_CAL_LIVE === '1') {
  await liveChecks();
  console.log('verify_sector_perf_calendar OK (live)');
}

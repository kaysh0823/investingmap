/**
 * Unit checks for sector_perf_calendar rebase / avg helpers.
 * Usage: node scripts/verify_sector_perf_calendar.mjs
 */
import assert from 'assert';
import {
  normalizePerfCalendarYear,
  normalizePerfCalendarSector,
  rebaseMemberPoints,
  buildSectorAvgPoints,
  listSectorMembers,
  currentKstYear,
} from '../functions/lib/sector_perf_calendar.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cur = currentKstYear();

assert.equal(normalizePerfCalendarSector('semi'), 'semi');
assert.equal(normalizePerfCalendarSector('nope'), null);
assert.equal(normalizePerfCalendarYear(String(cur)), cur);
assert.equal(normalizePerfCalendarYear(String(cur - 4)), cur - 4);
assert.equal(normalizePerfCalendarYear(String(cur - 5)), null);
assert.equal(normalizePerfCalendarYear(String(cur + 1)), null);
assert.equal(normalizePerfCalendarYear(null), cur);

// Prior year-end base: Dec 30 close 1000 → Jan 2 at 1100 = 110
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

// IPO fallback: no prior-year bar → first in-year close = 100
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

const hub = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hub_index.json'), 'utf8'));
const bigchip = listSectorMembers(hub, 'bigchip');
assert.ok(bigchip.length >= 2);
assert.ok(bigchip.every((m) => m.ticker && m.name));

console.log('verify_sector_perf_calendar OK');

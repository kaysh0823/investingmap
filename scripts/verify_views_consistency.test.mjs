import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { SECTOR_ORDER } from '../functions/lib/hub_dashboard_core.mjs';
import {
  getVerificationSectorIds,
  assertSector1dConsistency,
  assertCloseSectorSeries,
} from './verify_views_consistency.mjs';

const hubIndex = JSON.parse(fs.readFileSync(new URL('../data/hub_index.json', import.meta.url), 'utf8'));
const closeTime = '2026-11-03T15:30:00+09:00';

function fixture(ids = SECTOR_ORDER) {
  return {
    sectors: { sectors: Object.fromEntries(ids.map((sector) => [sector, { return1dPct: 1 }])) },
    trend: {
      sectors: ids.map((sector) => ({
        sector,
        series: Array.from({ length: sector === 'bigchip' || sector === 'semi' ? 42 : 2 }, () => ({
          t: closeTime,
          v: 101,
        })),
      })),
    },
  };
}

test('uses the full active catalog without requiring retired holdings', () => {
  const ids = getVerificationSectorIds(hubIndex);
  assert.deepEqual(ids, SECTOR_ORDER);
  assert.notStrictEqual(ids, SECTOR_ORDER);
  assert.equal(ids.includes('holdings'), false);
  const { sectors, trend } = fixture(ids);
  assert.doesNotThrow(() => assertSector1dConsistency(ids, sectors, trend));
});

test('fails when a configured sector loses hub_index membership', () => {
  const missing = structuredClone(hubIndex);
  delete missing.sectors.software;
  assert.throws(() => getVerificationSectorIds(missing), /software missing hub_index membership/);
  const empty = structuredClone(hubIndex);
  empty.sectors.software.companies = [];
  assert.throws(() => getVerificationSectorIds(empty), /software missing hub_index membership/);
});

test('does not silently skip an active sector missing from the API', () => {
  const { sectors, trend } = fixture();
  delete sectors.sectors.software;
  assert.throws(() => assertSector1dConsistency(SECTOR_ORDER, sectors, trend), /missing software/);
});

test('fails when an active sector trend or tip is missing', () => {
  const { sectors, trend } = fixture();
  trend.sectors = trend.sectors.filter((s) => s.sector !== 'software');
  assert.throws(() => assertSector1dConsistency(SECTOR_ORDER, sectors, trend), /missing software/);
  trend.sectors.push({ sector: 'software', series: [] });
  assert.throws(() => assertSector1dConsistency(SECTOR_ORDER, sectors, trend), /missing software/);
});

test('detects real return mismatches while preserving the 0.01 rounding tolerance', () => {
  const { sectors, trend } = fixture();
  sectors.sectors.software.return1dPct = 1.01;
  assert.doesNotThrow(() => assertSector1dConsistency(SECTOR_ORDER, sectors, trend));
  sectors.sectors.software.return1dPct = 1.02;
  assert.throws(() => assertSector1dConsistency(SECTOR_ORDER, sectors, trend), /software.*!=/);
});

test('checks every closing tip while allowing synthesized new-sector series', () => {
  const { trend } = fixture();
  assert.doesNotThrow(() => assertCloseSectorSeries(SECTOR_ORDER, trend));
  const series = trend.sectors.find((s) => s.sector === 'software').series;
  series.at(-1).t = '2026-11-03T15:20:00+09:00';
  assert.throws(() => assertCloseSectorSeries(SECTOR_ORDER, trend), /software last t/);
});

test('retains the 40-point density guard for established samples', () => {
  for (const sector of ['bigchip', 'semi']) {
    const { trend } = fixture();
    trend.sectors.find((s) => s.sector === sector).series.length = 39;
    assert.throws(() => assertCloseSectorSeries(SECTOR_ORDER, trend), /pointCount≥40/);
  }
});

test('accepts UTC timestamps equivalent to the KST closing time', () => {
  const { trend } = fixture();
  for (const sector of trend.sectors) sector.series.at(-1).t = '2026-11-03T06:30:00Z';
  assert.doesNotThrow(() => assertCloseSectorSeries(SECTOR_ORDER, trend));
});

test('non-finite returns and trend values fail closed', () => {
  for (const value of [Infinity, -Infinity, NaN, 'not-a-number']) {
    const { sectors, trend } = fixture();
    sectors.sectors.software.return1dPct = value;
    assert.throws(() => assertSector1dConsistency(SECTOR_ORDER, sectors, trend));
    sectors.sectors.software.return1dPct = 1;
    trend.sectors.find((s) => s.sector === 'software').series.at(-1).v = value;
    assert.throws(() => assertSector1dConsistency(SECTOR_ORDER, sectors, trend));
  }
});

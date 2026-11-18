import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSectorReturnRankings } from '../functions/lib/sector_trend_core.mjs';
import { aggregateSectorReturns } from '../functions/lib/returns_core.mjs';

const hub = {
  sectors: {
    software: { meta: { ko: '소프트웨어' }, companies: [{ ticker: '126560' }, { ticker: '035420' }] },
  },
};
const refs = {
  recentDd: '20261117',
  tradingDates: ['20261030', '20261106', '20261113', '20261116', '20261117'],
  quotes: {
    '126560': { shares: 100, closes: [80, 90, 100, 110, 120] },
    '035420': { shares: 200, closes: [160, 180, 200, 220, 240] },
  },
};
const source = {
  meta: { numeratorMode: 'live', anchorDd: '20261118', dataVersion: 'live-version' },
  byTicker: {
    '126560': { numerator: 132, numerator1d: 132, prevClose1d: 120, provisional: false },
    // Missing verified daily quote pairs must stay excluded from the daily result.
    '035420': { numerator: 240, numerator1d: null, prevClose1d: null, provisional: false },
  },
};

test('intraday rankings include today in all periods and match the card daily quote pairs', () => {
  for (const weighting of ['cap', 'equal']) {
    const result = buildSectorReturnRankings(hub, refs, weighting, source);
    for (const period of ['daily', 'weekly', 'monthly']) {
      assert.equal(result[period][0].date, '2026-11-18');
    }
    const card = aggregateSectorReturns(Object.entries(source.byTicker).map(([ticker, row]) => ({
      ...row, ...refs.quotes[ticker],
    })), weighting);
    assert.equal(result.daily[0].returns[0].value, card.chg1dPct);
    assert.equal(result.daily[0].returns[0].value, 10);
    assert.equal(result.weighting, weighting);
    assert.equal(result.dataVersion, source.meta.dataVersion);
  }
  const result = buildSectorReturnRankings(hub, refs, 'cap', source);
  assert.equal(result.weekly[0].returns[0].value, 22.4);
  assert.equal(result.monthly[0].returns[0].value, 53);
  assert.deepEqual(result.daily[1], buildSectorReturnRankings(hub, refs).daily[0]);
});

test('confirmed close is appended while provisional post-close quotes remain excluded', () => {
  const closeSource = { ...source, meta: { ...source.meta, numeratorMode: 'close' } };
  assert.equal(buildSectorReturnRankings(hub, refs, 'cap', closeSource).daily[0].date, '2026-11-18');
  const provisionalSource = {
    ...closeSource,
    byTicker: Object.fromEntries(Object.entries(source.byTicker).map(([ticker, row]) => [ticker, {
      ...row, provisional: true,
    }])),
  };
  assert.equal(buildSectorReturnRankings(hub, refs, 'cap', provisionalSource).daily[0].date, '2026-11-17');
});

test('same-day refs still use the verified daily pair and do not duplicate the date', () => {
  const currentRefs = {
    ...refs, recentDd: '20261118', tradingDates: [...refs.tradingDates, '20261118'],
    quotes: Object.fromEntries(Object.entries(refs.quotes).map(([ticker, row]) => [ticker, {
      ...row, closes: [...row.closes, source.byTicker[ticker].numerator],
    }])),
  };
  const result = buildSectorReturnRankings(hub, currentRefs, 'cap', {
    ...source, meta: { ...source.meta, numeratorMode: 'official' },
  });
  assert.equal(result.daily.filter(row => row.date === '2026-11-18').length, 1);
  assert.equal(result.daily[0].returns[0].value, 10);
});

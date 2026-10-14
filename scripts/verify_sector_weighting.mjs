import assert from 'node:assert/strict';
import { aggregateSectorReturns } from '../functions/lib/returns_core.mjs';
import { buildDailySectorSeriesFromRefs, buildIntraday1dSeries } from '../functions/lib/sector_trend_core.mjs';
import { buildSectorReturnCaptureRows } from '../functions/lib/sector_return_captures.mjs';
import { normalizeSectorWeighting, sectorCaptureKey, sectorFromCaptureKey } from '../functions/lib/sector_weighting.mjs';
import { loadReturnSource } from '../functions/lib/hub_returns_source.mjs';
import { onRequest as sectorsApi } from '../functions/api/hub_sectors.js';
import { onRequest as trendApi } from '../functions/api/hub_trend.js';
import { onRequest as sparkApi } from '../functions/api/hub_sector_trend.js';

const members = [
  { numerator: 110, numerator1d: 110, prevClose1d: 100, closes: [100,100,100,100,100], k: 1, shares: 900 },
  { numerator: 80, numerator1d: 80, prevClose1d: 100, closes: [100,100,100,100,100], k: 1, shares: 100 },
];
assert.equal(aggregateSectorReturns(members).chg1dPct, 7);
assert.equal(aggregateSectorReturns(members, 'equal').chg1dPct, -5);
assert.equal(aggregateSectorReturns(members, 'equal').ret5dPct, -5);
assert.equal(aggregateSectorReturns([...members, { numerator1d: null, prevClose1d:100 }], 'equal').chg1dPct, -5);
assert.equal(aggregateSectorReturns([{...members[0], shares:null}], 'equal').chg1dPct, 10, 'equal needs no share count');
assert.equal(aggregateSectorReturns([{...members[0], shares:null}], 'cap').chg1dPct, null);
assert.equal(normalizeSectorWeighting('unknown'), 'cap');
assert.equal(sectorCaptureKey('bigchip','equal'), 'equal:bigchip');
assert.equal(sectorFromCaptureKey('bigchip','equal'), null);
assert.equal(sectorFromCaptureKey('equal:bigchip','cap'), null);

const index = { sectors: { bigchip: { meta: {ko:'칩 리더'}, companies: [{ticker:'005930',mcapWon:90000},{ticker:'000660',mcapWon:10000}] } } };
const refs = {recentDd:'20261013',tradingDates:['20261006','20261007','20261008','20261012','20261013'],quotes:{'005930':{closes:members[0].closes,shares:900},'000660':{closes:members[1].closes,shares:100}}};
const quoteRows = members.map((m,i) => ({ticker:i ? '000660':'005930',last:m.numerator,prev_close:100,as_of:'2026-10-14T15:30:00+09:00',regular_session:true}));
const now = new Date('2026-10-14T20:00:00+09:00');
const source = await loadReturnSource({env:{},refs,quoteRows,tickers:quoteRows.map((q)=>q.ticker),now});
for (const [mode, expected] of [['cap',107],['equal',95]]) {
  const line = buildDailySectorSeriesFromRefs(index,refs,source,5,mode).sectors.find((s)=>s.sector==='bigchip').series;
  assert.equal(line[0].v,100);
  assert.equal(line.at(-1).v,expected);
}
const captures = buildSectorReturnCaptureRows(index,source,'2026-10-14T15:30:00+09:00','2026-10-14','close');
assert.deepEqual(captures.map((r)=>[r.sector_id,r.ret_1d_pct]),[['bigchip',7],['equal:bigchip',-5]]);

const realFetch = globalThis.fetch, RealDate = globalThis.Date, realCaches = globalThis.caches;
const cache = new Map();
const pending = [];
const env = {SUPABASE_URL:'https://db.invalid',SUPABASE_ANON_KEY:'test',ASSETS:{fetch:async(req)=>Response.json(new URL(req.url).pathname.endsWith('hub_index.json')?index:refs)}};
const intraday = [{sector_id:'bigchip',ts:'2026-10-14T09:10:00+09:00',ret_1d_pct:1,session_kind:'regular'}, {sector_id:'equal:bigchip',ts:'2026-10-14T09:20:00+09:00',ret_1d_pct:-1,session_kind:'regular'}];
try {
  globalThis.Date = class extends RealDate { constructor(...args){super(...(args.length?args:[now.toISOString()]));} static now(){return now.getTime();} };
  globalThis.caches = {default:{match:async(req)=>cache.get(req.url)?.clone(),put:async(req,res)=>{cache.set(req.url,res.clone());}}};
  globalThis.fetch = async(input) => {
    const url = new URL(typeof input==='string'?input:input.url || String(input));
    if (url.hostname !== 'db.invalid') throw new Error(`Unexpected network: ${url}`);
    if (url.pathname.endsWith('stock_quotes_latest')) return Response.json(quoteRows);
    if (url.pathname.endsWith('sector_intraday_returns')) return Response.json(intraday);
    return Response.json([]);
  };
  const request = async(handler,path,headers={}) => handler({request:new Request(`https://site.invalid${path}`,{headers}),env,waitUntil:(promise)=>pending.push(promise)});
  for (const horizon of ['1d','5d']) {
    let capEtag;
    for (const [mode,expected] of [['cap',7],['equal',-5]]) {
      const card = await request(sectorsApi,`/api/hub_sectors?horizon=${horizon}&weighting=${mode}`,mode==='equal'?{'If-None-Match':capEtag}:{});
      assert.equal(card.status,200,'mode-specific ETag must not return 304 for another mode');
      if(mode==='cap')capEtag=card.headers.get('etag');else assert.notEqual(card.headers.get('etag'),capEtag);
      const body = await card.json();
      assert.equal(body.weighting,mode);
      assert.equal(body.sectors.bigchip[horizon==='1d'?'return1dPct':'return5dPct'],expected);
      const trend = await request(trendApi,`/api/hub_trend?horizon=${horizon}&weighting=${mode}`);
      assert.equal(trend.status,200);
      const line = await trend.json();
      assert.equal(line.weighting,mode);
      assert.equal(Math.round((line.sectors.find((s)=>s.sector==='bigchip').series.at(-1).v-100)*100)/100,expected);
      const spark = await request(sparkApi,`/api/hub_sector_trend?horizon=${horizon}&weighting=${mode}`);
      assert.equal(spark.status,200);
      const points = await spark.json();
      assert.equal(points.weighting,mode);
      assert.equal(points.bigchip.at(-1).v,expected);
    }
  }
  const cap = await buildIntraday1dSeries({hubIndex:index,env,request:new Request('https://site.invalid'),now,weighting:'cap'});
  const equal = await buildIntraday1dSeries({hubIndex:index,env,request:new Request('https://site.invalid'),now,weighting:'equal'});
  assert.ok(cap.trends.bigchip.some((p)=>p.v===1));
  assert.ok(!equal.trends.bigchip.some((p)=>p.v===1));
  assert.ok(equal.trends.bigchip.some((p)=>p.v===-1));
  await Promise.all(pending);
  assert.ok([...cache.keys()].some((key)=>key.includes('/equal/dv/')));
  assert.ok([...cache.keys()].some((key)=>key.includes('/cap/dv/')));
} finally {globalThis.fetch=realFetch;globalThis.Date=RealDate;globalThis.caches=realCaches;}
console.log('sector weighting: equal means, missing data, daily/intraday alignment, isolated captures, caches and ETags OK');

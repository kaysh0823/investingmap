import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { adjustmentStateFromRows, reconcileReturnRefs, rebuildQuoteFromRawHistory, loadAdjustmentState } from '../functions/lib/return_adjustment_basis.mjs';
import { loadReturnSource, buildDataVersion } from '../functions/lib/hub_returns_source.mjs';
import { computeStockReturns, aggregateSectorReturns } from '../functions/lib/returns_core.mjs';
import { buildDailySectorSeriesFromRefs } from '../functions/lib/sector_trend_core.mjs';
import { onRequest as ohlcApi } from '../functions/api/ticker_ohlc.js';
import { onRequest as quotesApi } from '../functions/api/quotes.js';
import { onRequest as sectorsApi } from '../functions/api/hub_sectors.js';
import { onRequest as trendApi } from '../functions/api/hub_trend.js';
import { onRequest as sparkApi } from '../functions/api/hub_sector_trend.js';
import { stockReturnFieldsFromRefs } from './sync_quotes_to_supabase.mjs';

const ticker='012345', control='054321', anchor='2026-11-04';
const event={ticker,effective_date:anchor,ratio:0.2};
const now=new Date('2026-11-04T14:36:00+09:00');
const dates=[];
for(let d=new Date('2025-12-01T00:00:00Z');d<=new Date('2026-11-03T00:00:00Z');d.setUTCDate(d.getUTCDate()+1)){
  if(d.getUTCDay()!==0&&d.getUTCDay()!==6)dates.push(d.toISOString().slice(0,10));
}
const refs=()=>({recentDd:'20261103',asOf:'2026-11-03T08:00:00Z',tradingDates:dates.map(d=>d.replaceAll('-','')),
  quotes:{[ticker]:{closes:dates.slice(-201).map(()=>1000),shares:100},[control]:{closes:dates.slice(-201).map(()=>1000),shares:10}}});
const raw=()=>new Map([[ticker,dates.map(trade_date=>({ticker,trade_date,close:1000,mcap_won:100000}))]]);
const state=(rows=[event],through=anchor)=>adjustmentStateFromRows(rows,through);
const basis=(events=[],throughDate='2026-11-03')=>({version:1,throughDate,events});
const quoteRows=[{ticker,last:5500,prev_close:5000,as_of:'2026-11-04T14:35:00+09:00',regular_session:true},
  {ticker:control,last:1200,prev_close:1000,as_of:'2026-11-04T14:35:00+09:00',regular_session:true}];
const history={extraTradeDates:[],prevByTicker:new Map(),adjByTicker:new Map(),closeByTicker:new Map()};
const index={sectors:{bigchip:{meta:{ko:'Fixture'},companies:[{ticker,mcapWon:100000},{ticker:control,mcapWon:10000}]}}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Unexpected network in offline basis suite');};
test.after(()=>{globalThis.fetch=originalFetch;});
function freeze(obj){Object.freeze(obj);for(const v of Object.values(obj))if(v&&typeof v==='object')freeze(v);return obj;}

test('legacy raw reconstruction normalizes price and shares without mutating frozen refs',async()=>{
  const input=freeze(refs());const before=JSON.stringify(input);
  const r=await reconcileReturnRefs(input,[ticker,control],anchor,state(),null,raw());
  assert.equal(r.quotes[ticker].closes.at(-1),5000);assert.equal(r.quotes[ticker].shares,20);
  assert.equal(r.quotes[ticker].closes.at(-1)*r.quotes[ticker].shares,100000);
  assert.equal(r.quotes[control],input.quotes[control]);assert.equal(JSON.stringify(input),before);
});
test('unknown already-adjusted legacy arrays are rebuilt from raw, never divided again',async()=>{
  const input=refs();input.quotes[ticker].closes.fill(5000);
  const r=await reconcileReturnRefs(input,[ticker],anchor,state(),null,raw());
  assert.equal(r.quotes[ticker].closes[0],5000);assert.equal(r.quotes[ticker].shares,20);
});
test('known metadata applies each event once across repeated normalization',async()=>{
  const input=refs();input.quotes[ticker].adjustmentBasis=basis();input.quotes[ticker].sharesBasisDate='2026-11-03';
  const first=await reconcileReturnRefs(input,[ticker],anchor,state());
  const second=await reconcileReturnRefs(first,[ticker],anchor,state());
  assert.deepEqual(second.quotes[ticker],first.quotes[ticker]);assert.equal(second.quotes[ticker].shares,20);
  assert.equal(input.quotes[ticker].closes[0],1000);
});
test('same event in two ledgers deduplicates and conflicting ratios fail closed',async()=>{
  const duplicate=state([event,{...event,source:'another'}]);assert.equal(duplicate.byTicker.get(ticker).length,1);
  const r=await reconcileReturnRefs(refs(),[ticker],anchor,duplicate,null,raw());assert.equal(r.quotes[ticker].closes[0],5000);
  const conflict=await reconcileReturnRefs(refs(),[ticker],anchor,state([event,{...event,ratio:5}]),null,raw());
  assert.equal(conflict.quotes[ticker].adjustmentError,'conflicting_events');assert.equal(conflict.quotes[ticker].shares,null);
  assert.ok(conflict.quotes[ticker].closes.every(v=>v===null));
});
test('future events do not alter pre-event valuation; effective day applies once',async()=>{
  const input=refs();input.quotes[ticker].adjustmentBasis=basis();input.quotes[ticker].sharesBasisDate='2026-11-03';
  const before=await reconcileReturnRefs(input,[ticker],'2026-11-03',state());assert.equal(before.quotes[ticker].closes[0],1000);assert.equal(before.quotes[ticker].shares,100);
  assert.equal(state([event],'2026-11-03').byTicker.size,0);
  const after=await reconcileReturnRefs(input,[ticker],anchor,state());assert.equal(after.quotes[ticker].closes[0],5000);
});
test('late event inside a snapshot rebuilds forward-filled prices from their raw dates',async()=>{
  const input={recentDd:'20261104',tradingDates:['20261102','20261103','20261104'],quotes:{[ticker]:{
    closes:[1044,1044,1044],shares:100,sharesBasisDate:'2026-11-03',adjustmentBasis:basis([],anchor)}}};
  const history=new Map([[ticker,[{trade_date:'2026-11-02',close:1044,mcap_won:104400},{trade_date:'2026-11-03',close:1044,mcap_won:104400}]]]);
  const normalized=await reconcileReturnRefs(input,[ticker],anchor,state(),null,history);
  assert.deepEqual(normalized.quotes[ticker].closes,[5220,5220,5220]);assert.equal(normalized.quotes[ticker].shares,20);
});
test('post-event bars and event-day shares stay on their existing scale',()=>{
  const r=rebuildQuoteFromRawHistory({closes:[0,0,0]},['2026-11-03','2026-11-04','2026-11-05'],[
    {trade_date:'2026-11-03',close:1000,mcap_won:100000},{trade_date:'2026-11-04',close:5500,mcap_won:110000},
    {trade_date:'2026-11-05',close:5600,mcap_won:112000}], [event],'2026-11-05');
  assert.deepEqual(r.closes,[5000,5500,5600]);assert.equal(r.shares,20);
});
test('multiple events compose on each bar date and share observation date',()=>{
  const r=rebuildQuoteFromRawHistory({closes:[0,0,0]},['2026-11-03','2026-11-04','2026-11-05'],[
    {trade_date:'2026-11-03',close:1000,mcap_won:100000},{trade_date:'2026-11-04',close:5000,mcap_won:100000},
    {trade_date:'2026-11-05',close:2500,mcap_won:100000}], [event,{effective_date:'2026-11-05',ratio:2}],'2026-11-05');
  assert.deepEqual(r.closes,[2500,2500,2500]);assert.equal(r.shares,40);
});
test('actual latest-mcap-null case recovers prior shares and keeps daily/historical basis aligned',()=>{
  const q=rebuildQuoteFromRawHistory({closes:[1044,1044,5000]},['2026-10-14','2026-11-03','2026-11-04'],[
    {trade_date:'2026-10-14',close:1044,mcap_won:304756208388},
    {trade_date:'2026-11-03',close:1044,mcap_won:304756208388},
    {trade_date:'2026-11-04',close:5000,mcap_won:null}],[event],anchor);
  assert.deepEqual(q.closes,[5220,5220,5000]);assert.equal(q.shares,58382415);assert.equal(q.sharesBasisDate,anchor);
});
test('changed or removed prior events require raw rebuild instead of undoing rounded values',async()=>{
  const input=refs();input.quotes[ticker].closes.fill(333);input.quotes[ticker].adjustmentBasis=basis([{effective_date:'2026-11-02',ratio:3}]);input.quotes[ticker].sharesBasisDate='2026-11-03';
  const changed=state([{ticker,effective_date:'2026-11-02',ratio:2}]);
  const r=await reconcileReturnRefs(input,[ticker],anchor,changed,null,raw());assert.equal(r.quotes[ticker].closes[0],500);
  const removed=await reconcileReturnRefs(input,[ticker],anchor,state([]),null,raw());assert.equal(removed.quotes[ticker].closes[0],1000);
});
test('new event after prior rounded adjustments rebuilds from raw with one rounding',async()=>{
  const input=refs();input.quotes[ticker].closes.fill(33);input.quotes[ticker].adjustmentBasis=basis([{effective_date:'2026-11-02',ratio:3}]);input.quotes[ticker].sharesBasisDate='2026-11-03';
  const original=new Map([[ticker,dates.map(trade_date=>({trade_date,close:100,mcap_won:10000}))]]);
  const normalized=await reconcileReturnRefs(input,[ticker],anchor,state([{ticker,effective_date:'2026-11-02',ratio:3},event]),null,original);
  assert.equal(normalized.quotes[ticker].closes[0],167);
});
test('missing raw history blanks long returns but paired 1D remains valid',async()=>{
  const source=await loadReturnSource({env:{},refs:refs(),tickers:[ticker],quoteRows,now,krxHistory:history,adjustmentState:state(),rawHistoryByTicker:new Map()});
  const r=computeStockReturns({...source.byTicker[ticker],k:source.meta.k});
  assert.equal(r.chg1dPct,10);assert.equal(r.ret5dPct,null);assert.equal(source.byTicker[ticker].shares,null);
  assert.equal(source.meta.adjustmentMissingCount,1);
});
test('missing event read is distinct from successful empty ledger',async()=>{
  const unavailable={...state(),verified:false,version:'unavailable'};
  const a=await reconcileReturnRefs(refs(),[ticker],anchor,unavailable,null,raw());assert.equal(a.quotes[ticker].adjustmentError,'events_unavailable');
  const b=await reconcileReturnRefs(refs(),[ticker],anchor,state([]),null,raw());assert.equal(b.quotes[ticker].closes.at(-1),1000);
  const cold=await reconcileReturnRefs(refs(),[ticker],anchor,adjustmentStateFromRows([],anchor,false),null,raw());
  assert.equal(cold.quotes[ticker].adjustmentError,'events_unavailable');assert.ok(cold.quotes[ticker].closes.every(v=>v===null));
});
test('partial raw coverage fails unavailable horizons and ffill never exceeds 20 sessions',()=>{
  const r=rebuildQuoteFromRawHistory({closes:Array(40).fill(10)},dates.slice(-40),[{trade_date:dates.at(-40),close:1000,mcap_won:100000}],[event],anchor);
  assert.equal(r.closes.filter(v=>v!=null).length,21);assert.equal(r.closes.at(-1),null);
});
test('all 5D through 200D stock returns, sync fields, cap/equal sectors and chart tips agree',async()=>{
  const source=await loadReturnSource({env:{},refs:refs(),tickers:[ticker,control],quoteRows,now,krxHistory:history,adjustmentState:state(),rawHistoryByTicker:raw()});
  const stock=computeStockReturns({...source.byTicker[ticker],k:source.meta.k});
  for(const n of [5,20,50,120,200])assert.equal(stock[`ret${n}dPct`],10);
  const naver={last:5500,regularQuote:{last:5500,prevClose:5000,asOf:'2026-11-04T14:35:00+09:00',tradeDate:anchor,regularSession:true,source:'naver-basic'}};
  const fields=stockReturnFieldsFromRefs(ticker,naver,source.refs,true,null,now);
  assert.equal(fields.ret_20d_pct,10);
  for(const [mode,expected] of [['cap',10.91],['equal',15]]){
    const agg=aggregateSectorReturns(Object.values(source.byTicker).map(m=>({...m,k:source.meta.k})),mode);
    for(const n of [5,20,50,120,200]){
      assert.equal(agg[`ret${n}dPct`],expected);
      const line=buildDailySectorSeriesFromRefs(index,refs(),source,n,mode).sectors.find(s=>s.sector==='bigchip').series;
      assert.equal(line[0].v,100);assert.equal(Math.round((line.at(-1).v-100)*100)/100,expected);
    }
  }
});
test('pre-open uses prior official price basis rather than the future opening event',async()=>{
  const input=refs();input.quotes[ticker].adjustmentBasis=basis();input.quotes[ticker].sharesBasisDate='2026-11-03';
  const source=await loadReturnSource({env:{},refs:input,tickers:[ticker],quoteRows,now:new Date('2026-11-04T08:00:00+09:00'),krxHistory:history,adjustmentState:state()});
  assert.equal(source.meta.anchorDd,'20261103');assert.equal(source.byTicker[ticker].numerator,1000);assert.equal(source.byTicker[ticker].closes[0],1000);assert.equal(source.byTicker[ticker].shares,100);
});
test('event versions invalidate returns even without quote or refs timestamp change',()=>{
  assert.notEqual(buildDataVersion(refs(),'2026-11-04T05:35:00Z',now,state().version),buildDataVersion(refs(),'2026-11-04T05:35:00Z',now,state([]).version));
});
test('read-only adjustment and raw history fetches cache across repeated source use',async()=>{
  const saved=globalThis.fetch;let reads=0;
  try{
    globalThis.fetch=async(url,opts)=>{assert.ok(!opts?.method||opts.method==='GET');reads++;const u=new URL(url);assert.equal(u.hostname,'cached-db.invalid');
      return Response.json(u.pathname.endsWith('price_adjustments')?[event]:raw().get(ticker));};
    const config={url:'https://cached-db.invalid',anonKey:'fixture'};
    const a=await loadAdjustmentState(config,anchor);const b=await loadAdjustmentState(config,anchor);assert.equal(a,b);assert.equal(reads,1);
    const input=refs();const first=await reconcileReturnRefs(input,[ticker],anchor,a,config);const second=await reconcileReturnRefs(input,[ticker],anchor,a,config);
    assert.equal(first,second);assert.equal(reads,2);
  }finally{globalThis.fetch=saved;}
});
test('after-close raw history recovery changes shared version without new quote/event timestamps',async()=>{
  const saved=globalThis.fetch;let available=false,reads=0;
  try{
    globalThis.fetch=async()=>{reads++;return Response.json(available?raw().get(ticker):[]);};
    const config={url:'https://recover.invalid',anonKey:'fixture'},input=refs(),ledger=state();
    const before=new Date('2026-11-04T16:00:00+09:00'),after=new Date('2026-11-04T16:05:00+09:00');
    const missing=await reconcileReturnRefs(input,[ticker],anchor,ledger,config,null,before);
    assert.equal(missing.quotes[ticker].closes[0],null);available=true;
    const recovered=await reconcileReturnRefs(input,[ticker],anchor,ledger,config,null,after);
    assert.equal(recovered.quotes[ticker].closes[0],5000);assert.equal(reads,2);
    assert.notEqual(buildDataVersion(input,'2026-11-04T06:30:00Z',before,ledger.version),buildDataVersion(input,'2026-11-04T06:30:00Z',after,ledger.version));
  }finally{globalThis.fetch=saved;}
});
test('actual quote/card/trend/spark API handlers share corrected data and event ETags',async()=>{
  const savedFetch=globalThis.fetch,RealDate=globalThis.Date,oldCaches=globalThis.caches;
  const input=refs();const cache=new Map();const pending=[];
  const env={SUPABASE_URL:'https://api-basis.invalid',SUPABASE_ANON_KEY:'fixture',ASSETS:{fetch:async(req)=>Response.json(new URL(req.url).pathname.endsWith('hub_index.json')?index:input)}};
  try{
    globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now.toISOString()]));}static now(){return now.getTime();}};
    globalThis.caches={default:{match:async(req)=>cache.get(req.url)?.clone(),put:async(req,res)=>cache.set(req.url,res.clone())}};
    globalThis.fetch=async(req,opts)=>{assert.ok(!opts?.method||opts.method==='GET');const u=new URL(typeof req==='string'?req:req.url);assert.equal(u.hostname,'api-basis.invalid');
      if(u.pathname.endsWith('price_adjustments'))return Response.json([event]);
      if(u.pathname.endsWith('stock_quotes_latest'))return Response.json(quoteRows);
      if(u.pathname.endsWith('stock_price_history')&&u.searchParams.get('select')?.includes('mcap_won'))return Response.json(raw().get(ticker));
      return Response.json([]);};
    const call=async(handler,path)=>handler({request:new Request(`https://site.invalid${path}`),env,waitUntil:p=>pending.push(p)});
    const q=await call(quotesApi,`/api/quotes?codes=${ticker},${control}`);assert.equal(q.status,200);const qb=await q.json();
    assert.equal(qb.items[ticker].ret20dPct,10);
    for(const [mode,expected]of[['cap',10.91],['equal',15]]){
      const card=await call(sectorsApi,`/api/hub_sectors?horizon=20d&weighting=${mode}`);assert.equal((await card.json()).sectors.bigchip.return20dPct,expected);
      const trend=await call(trendApi,`/api/hub_trend?horizon=20d&weighting=${mode}`);const line=(await trend.json()).sectors.find(s=>s.sector==='bigchip').series;
      assert.equal(Math.round((line.at(-1).v-100)*100)/100,expected);
      const spark=await call(sparkApi,`/api/hub_sector_trend?horizon=20d&weighting=${mode}`);assert.equal((await spark.json()).bigchip.at(-1).v,expected);
    }
    await Promise.all(pending);
  }finally{globalThis.fetch=savedFetch;globalThis.Date=RealDate;globalThis.caches=oldCaches;}
});

test('daily and weekly UI never join quotes to a different adjustment basis',()=>{
  const context={console,setTimeout,clearTimeout,URLSearchParams,document:{documentElement:{getAttribute(){return null;},setAttribute(){}},addEventListener(){}}};
  context.globalThis=context;vm.createContext(context);new vm.Script(fs.readFileSync(new URL('../js/candle_modal.js',import.meta.url),'utf8')).runInContext(context);
  const hooks=context.InvestingMapCandleModal._indicators;
  const bars=[{t:'2026-11-03',o:1000,h:1000,l:1000,c:1000,v:1}];
  const quote={asOf:'2026-11-04T15:30:00+09:00',regularSession:false,items:{[ticker]:{last:5500}}};
  for(const name of ['applyLiveQuoteToBars','applyLiveQuoteToWeeklyBars']){
    const blocked=hooks[name](bars,quote,ticker,{throughDate:'2026-11-03',events:[]});assert.equal(blocked.bars.at(-1).c,1000);
    const adjusted=[{...bars[0],o:5000,h:5000,l:5000,c:5000}];
    const allowed=hooks[name](adjusted,quote,ticker,{throughDate:'2026-11-04',events:[event]});assert.equal(allowed.bars.at(-1).c,5500);
    const oldQuote={...quote,asOf:'2026-11-03T15:30:00+09:00'};
    const futureBasis=hooks[name](adjusted,oldQuote,ticker,{throughDate:'2026-11-04',events:[event]});assert.equal(futureBasis.bars.at(-1).c,5000);
  }
});

test('OHLC API carries verified prior closing basis into pre-open and fails closed on ledger outage',async()=>{
  const savedFetch=globalThis.fetch,RealDate=globalThis.Date,oldCaches=globalThis.caches;
  const at=new RealDate('2026-11-05T08:00:00+09:00');let ledgerOk=true;
  try{
    globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[at.toISOString()]));}static now(){return at.getTime();}};
    globalThis.caches=undefined;
    globalThis.fetch=async(req,opts)=>{assert.ok(!opts?.method||opts.method==='GET');const u=new URL(typeof req==='string'?req:req.url);assert.equal(u.hostname,'ohlc-basis.invalid');
      if(u.pathname.endsWith('price_adjustments'))return ledgerOk?Response.json([event]):new Response('unavailable',{status:503});
      if(u.pathname.endsWith('stock_quotes_latest'))return Response.json([{ticker,last:5500,prev_close:5000,as_of:'2026-11-04T15:30:00+09:00',regular_session:true}]);
      if(u.pathname.endsWith('stock_price_history'))return Response.json([{trade_date:'2026-11-03',open:1000,high:1000,low:1000,close:1000,volume:10}]);
      return Response.json([]);};
    const call=()=>ohlcApi({request:new Request(`https://site.invalid/api/ticker_ohlc?code=${ticker}&range=1y`),env:{SUPABASE_URL:'https://ohlc-basis.invalid',SUPABASE_ANON_KEY:'fixture'},waitUntil(){}});
    const response=await call();const body=await response.json();
    assert.equal(body.adjustmentBasis.throughDate,anchor);assert.equal(body.bars[0].c,5000);assert.match(response.headers.get('cache-control'),/must-revalidate/);
    ledgerOk=false;const failed=await call();assert.deepEqual((await failed.json()).bars,[]);
  }finally{globalThis.fetch=savedFetch;globalThis.Date=RealDate;globalThis.caches=oldCaches;}
});

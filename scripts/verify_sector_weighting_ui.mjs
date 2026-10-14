import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = (name) => fs.readFileSync(new URL(`../js/${name}`,import.meta.url),'utf8');
const stored = new Map(), events = new Map(), requests = [];
const document = {getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],documentElement:{lang:'ko',getAttribute:()=> 'ko'},head:{appendChild(){}},createElement:()=>({})};
const context = vm.createContext({console,document,setTimeout,clearTimeout,Date,Promise,Set,Map,URL,
  location:{protocol:'http:',origin:'https://site.invalid'},
  sessionStorage:{getItem:(key)=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
  addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
  dispatchEvent:(event)=>{for(const fn of events.get(event.type)||[])fn(event);},
  CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
  fetch:(url)=>new Promise((resolve)=>requests.push({url:String(url),resolve})),
});
context.window=context;
vm.runInContext(read('sector_weighting.js'),context);
vm.runInContext(read('hub_dashboard.js').replace('global.InvestingMapHubDashboard = {',`global.__dashboard = { fetch: fetchSectorsHorizon, trends: fetchTrends, seed: function(){hubData={sectors:{}};}, get: function(){return dashboardData.sectors;} }; global.InvestingMapHubDashboard = {`),context);
vm.runInContext(read('hub_trend_chart.js').replace('global.InvestingMapHubTrendChart = {','global.__chart = {state:state,fetch:fetchAndRender}; global.InvestingMapHubTrendChart = {'),context);
const W=context.InvestingMapSectorWeighting,D=context.__dashboard,C=context.__chart;
D.seed();
assert.equal(W.get(),'cap');
const capCard=D.fetch('ko','return1dPct');
const capChart=C.fetch('5d');
W.set('equal');
assert.equal(C.state.weighting,'equal','both views follow one preference');
assert.equal(stored.get('im-sector-weighting-v1'),'equal');
const equalCard=D.fetch('ko','return1dPct');
const equalSpark=D.trends('ko','return1dPct');
const equalChart=C.fetch('5d');
function resolveMode(mode,value) {
  for(const request of requests.filter((r)=>!r.done&&r.url.includes(`weighting=${mode}`))) {
    request.done=true;
    const payload=request.url.includes('/hub_sectors?')?{weighting:mode,sectors:{bigchip:{return1dPct:value}}}
      :request.url.includes('/hub_sector_trend?')?{weighting:mode,bigchip:[{t:'2026-10-14',v:value}]}
      :{weighting:mode,sectors:[{sector:'bigchip',series:[{t:'2026-10-14',v:100+value}]}],indices:[]};
    request.resolve({ok:true,headers:{get:()=>''},json:()=>Promise.resolve(payload)});
  }
}
resolveMode('equal',-5);
await Promise.all([equalCard,equalSpark,equalChart]);
resolveMode('cap',7);
await Promise.all([capCard,capChart]);
assert.equal(D.get().bigchip.return1dPct,-5,'late cap response cannot replace equal cards');
assert.equal(C.state.payload.weighting,'equal','late cap response cannot replace equal chart');
assert.equal(C.state.payload.sectors[0].series[0].v,95);
W.set('cap');
const restoredCard=D.fetch('ko','return1dPct'),restoredSpark=D.trends('ko','return1dPct'),restoredChart=C.fetch('5d');
resolveMode('cap',7);
await Promise.all([restoredCard,restoredSpark,restoredChart]);
assert.equal(D.get().bigchip.return1dPct,7,'switching back refetches correct mode');
assert.equal(C.state.payload.weighting,'cap');
assert.equal(C.state.payload.sectors[0].series[0].v,107);
const buttons=['cap','equal'].map((mode)=>({getAttribute:()=>mode,addEventListener(name,fn){this.click=fn;}}));
const root={classList:{add(){}},setAttribute(){},querySelectorAll:()=>buttons};
W.mount(root,'ko');
assert.ok(root.innerHTML.includes('동일가중'));
assert.ok(root.innerHTML.includes('시가총액 가중'));
assert.ok(root.innerHTML.includes('aria-pressed="true"'));
assert.equal(typeof buttons[1].click,'function');
assert.ok(requests.every((r)=>r.done),'all requests settled');
console.log('sector weighting UI: shared buttons/preference, cap→equal→cap, stale-response rejection and API parameters OK');

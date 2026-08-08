/**
 * One-shot: rewrite remaining 250d → 200d names/labels (maps, live_quotes, docs, scripts).
 * Core libs (hub_api_cache / krx_yoy / hub_dashboard_core) are updated by hand — skip them
 * so legacy input aliases like raw==='250d' stay intact.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_FILES = new Set([
  'functions/lib/hub_api_cache.mjs',
  'functions/lib/krx_yoy.mjs',
  'functions/lib/hub_dashboard_core.mjs',
  'functions/lib/hub_sector_trend.mjs',
  'functions/lib/krx_rs.mjs',
  'js/hub_dashboard.js',
  'scripts/patch_250d_to_200d.mjs',
  'scripts/sync_quotes_to_supabase.mjs',
  'functions/api/quotes.js',
]);

const REPLACEMENTS = [
  [/ret250dPct/g, 'ret200dPct'],
  [/ret250d/g, 'ret200d'],
  [/th-ret250d/g, 'th-ret200d'],
  [/thRet250d/g, 'thRet200d'],
  [/return250dPct/g, 'return200dPct'],
  [/ret_250d_pct/g, 'ret_200d_pct'],
  [/mcapPast250dDd/g, 'mcapPast200dDd'],
  [/mcapPast250d/g, 'mcapPast200d'],
  [/past250dDd/g, 'past200dDd'],
  [/pulseRow250d/g, 'pulseRow200d'],
  [/>250일</g, '>200일<'],
  [/"250일"/g, '"200일"'],
  [/'250일'/g, "'200일'"],
  [/250D\(1년\)/g, '200D'],
  [/250D \(1Y\)/g, '200D'],
  [/250D\(1Y\)/g, '200D'],
  [/'250D'/g, "'200D'"],
  [/"250D"/g, '"200D"'],
  [/>250D</g, '>200D<'],
  [/lang === 'en' \? '250D'/g, "lang === 'en' ? '200D'"],
  [/ — 1D·20D·50D·120D·250D/g, ' — 1D·20D·50D·120D·200D'],
  [/, 250D/g, ', 200D'],
  [/5D\/20D\/50D\/120D\/250D/g, '5D/20D/50D/120D/200D'],
  [/1D\/20D\/50D\/120D\/250D/g, '1D/20D/50D/120D/200D'],
  [/20D–250D/g, '20D–200D'],
  [/20D-250D/g, '20D-200D'],
  [/250D 지표/g, '200D 지표'],
  [/"thRet200d": "1Y"/g, '"thRet200d": "200D"'],
  [/thRet200d: '1Y'/g, "thRet200d: '200D'"],
  // horizon tokens in verify / trend scripts (not legacy alias files)
  [/'250d'/g, "'200d'"],
  [/"250d"/g, '"200d"'],
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'supabase']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(mjs|js|html|md|json)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
let n = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (SKIP_FILES.has(rel)) continue;
  let s = fs.readFileSync(f, 'utf8');
  const orig = s;
  for (const [re, rep] of REPLACEMENTS) s = s.replace(re, rep);
  if (s !== orig) {
    fs.writeFileSync(f, s);
    n += 1;
    console.log('patched', rel);
  }
}
console.log('files', n);

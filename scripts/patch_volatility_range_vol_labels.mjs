import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const AXIS_KO = '5일 변동성 (고저폭 ÷ 종가, %)';
const AXIS_EN = '5D Range Vol (high−low ÷ close, %)';

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'functions', 'dist', 'data'].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (
      /korea_.*_map\.html$/.test(ent.name)
      || ent.name.endsWith('.inline.js')
      || ent.name === 'bio_inline_tail.js'
    ) {
      out.push(p);
    }
  }
  return out;
}

/** Match "key": "v" / key: 'v' / optional spaces. */
function replaceQuotedKey(src, key, from, to) {
  const escFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escTo = to.replace(/\$/g, '$$$$');
  const reDq = new RegExp(`("${key}"\\s*:\\s*")${escFrom}(")`, 'g');
  const reSq = new RegExp(`(${key}\\s*:\\s*')${escFrom}(')`, 'g');
  return src.replace(reDq, `$1${escTo}$2`).replace(reSq, `$1${escTo}$2`);
}

function patchLabels(html) {
  let next = html;
  next = replaceQuotedKey(next, 'volatilityAxisAtr', 'ATR3/종가', AXIS_KO);
  next = replaceQuotedKey(next, 'volatilityAxisAtr', 'ATR3/Close', AXIS_EN);
  next = replaceQuotedKey(next, 'volatilityAtr', 'ATR3/종가', '5일 변동성%');
  next = replaceQuotedKey(next, 'volatilityAtr', 'ATR3/Close', '5D Range Vol%');
  next = next.replace(/전 종목 변동성 백분위/g, '전 종목 5일 변동성 백분위');
  next = next.replace(
    /market-wide volatility percentiles/g,
    'market-wide 5D range-vol percentiles',
  );
  return next;
}

function ensureTurnoverRadiusScript(html) {
  if (html.includes('turnover_radius.js')) return html;
  // Prefer injecting before map_momentum; else before map_volatility.
  if (/<script[^>]+map_momentum\.js[^>]*>/.test(html)) {
    return html.replace(
      /(<script[^>]+map_momentum\.js[^>]*>)/,
      '<script src="../js/turnover_radius.js?v=1"></script>\n  $1',
    );
  }
  if (/<script[^>]+map_volatility\.js[^>]*>/.test(html)) {
    return html.replace(
      /(<script[^>]+map_volatility\.js[^>]*>)/,
      '<script src="../js/turnover_radius.js?v=1"></script>\n  $1',
    );
  }
  return html;
}

let n = 0;
for (const p of walk(ROOT)) {
  let html = fs.readFileSync(p, 'utf8');
  let next = patchLabels(html);
  next = next
    .replace(/map_volatility\.js\?v=\d+/g, 'map_volatility.js?v=11')
    .replace(/map_momentum\.js\?v=\d+/g, 'map_momentum.js?v=15');
  if (p.endsWith('.html')) {
    next = ensureTurnoverRadiusScript(next);
  }
  if (next !== html) {
    fs.writeFileSync(p, next);
    n += 1;
  }
}
console.log(`patched ${n} files`);

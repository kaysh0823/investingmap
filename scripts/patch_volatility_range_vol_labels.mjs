import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

let n = 0;
for (const p of walk(ROOT)) {
  let html = fs.readFileSync(p, 'utf8');
  const next = html
    .replace(/map_volatility\.js\?v=\d+/g, 'map_volatility.js?v=10')
    .replace(/"volatilityAtr":\s*"ATR3\/종가"/g, '"volatilityAtr": "5일 변동성%"')
    .replace(/"volatilityAtr":\s*"ATR3\/Close"/g, '"volatilityAtr": "5D Range Vol%"')
    .replace(/volatilityAtr:\s*'ATR3\/종가'/g, "volatilityAtr: '5일 변동성%'")
    .replace(/volatilityAtr:\s*'ATR3\/Close'/g, "volatilityAtr: '5D Range Vol%'");
  if (next !== html) {
    fs.writeFileSync(p, next);
    n += 1;
  }
}
console.log(`patched ${n} files`);

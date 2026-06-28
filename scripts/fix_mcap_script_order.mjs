/** Ensure map_mcap_fmt.js loads before live_quotes; update fmtMcapKoJo body. */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const maps = [
  'semiconductor/korea_semiconductor_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
  'bio/korea_bio_map.html',
];

const NEW_FMT_BODY = `function fmtMcapKoJo(won) {
      var mcapFmt = (typeof window !== 'undefined' ? window : globalThis).InvestingMapMcapFmt;
      return (mcapFmt && mcapFmt.fmtMcapKoJo)
        ? mcapFmt.fmtMcapKoJo(won)
        : (won == null || won === 0 ? '—' : (Math.round(Number(won) / 1e10) * 1e10 / 1e12).toFixed(2) + '조원');
    }`;

const FMT_RE =
  /function fmtMcapKoJo\(won\) \{\r?\n      if \(won == null \|\| won === 0\) return '[^']*';\r?\n      var jo = won \/ 1e12;\r?\n      return jo\.toFixed\(2\) \+ '[^']*';\r?\n    \}/;

for (const rel of maps) {
  const p = join(root, rel);
  let c = fs.readFileSync(p, 'utf8');

  c = c.replace(/\r?\n  <script src="\.\.\/js\/map_mcap_fmt\.js"><\/script>/g, '');
  if (!c.includes('map_mcap_fmt.js')) {
    c = c.replace(
      '<script src="../js/live_quotes.js"></script>',
      '<script src="../js/map_mcap_fmt.js"></script>\n  <script src="../js/live_quotes.js"></script>',
    );
  } else {
    c = c.replace(
      '<script src="../js/live_quotes.js"></script>',
      '<script src="../js/map_mcap_fmt.js"></script>\n  <script src="../js/live_quotes.js"></script>',
    );
    c = c.replace(
      '<script src="../js/map_mcap_fmt.js"></script>\n  <script src="../js/map_mcap_fmt.js"></script>',
      '<script src="../js/map_mcap_fmt.js"></script>',
    );
  }

  if (FMT_RE.test(c)) {
    c = c.replace(FMT_RE, NEW_FMT_BODY);
  } else {
    console.warn('fmtMcapKoJo pattern missing:', rel);
  }

  fs.writeFileSync(p, c, 'utf8');
  console.log('ok', rel);
}

const bioTail = join(root, 'bio/bio_inline_tail.js');
let bt = fs.readFileSync(bioTail, 'utf8');
if (FMT_RE.test(bt)) {
  bt = bt.replace(FMT_RE, NEW_FMT_BODY.replace(/—/g, '\u2014').replace(/조원/g, '\uC870\uC6D0'));
  fs.writeFileSync(bioTail, bt, 'utf8');
  console.log('ok bio/bio_inline_tail.js');
}

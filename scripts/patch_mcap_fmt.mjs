/**
 * Wire map_mcap_fmt.js + replace inline fmtMcapKoJo with 100억-granularity formatter.
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAPS = [
  'semiconductor/korea_semiconductor_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
  'bio/korea_bio_map.html',
];

const OLD_FMT = `function fmtMcapKoJo(won) {
      if (won == null || won === 0) return '\u2014';
      var jo = won / 1e12;
      return jo.toFixed(2) + '\uC870\uC6D0';
    }`;

const OLD_FMT_ASCII = `function fmtMcapKoJo(won) {
      if (won == null || won === 0) return '—';
      var jo = won / 1e12;
      return jo.toFixed(2) + '조원';
    }`;

const NEW_FMT = `function fmtMcapKoJo(won) {
      return (global.InvestingMapMcapFmt && global.InvestingMapMcapFmt.fmtMcapKoJo)
        ? global.InvestingMapMcapFmt.fmtMcapKoJo(won)
        : (won == null || won === 0 ? '\u2014' : (Math.round(Number(won) / 1e10) * 1e10 / 1e12).toFixed(2) + '\uC870\uC6D0');
    }`;

const NEW_FMT_ASCII = NEW_FMT.replace(/\u2014/g, '—').replace(/\uC870\uC6D0/g, '조원');

const SCRIPT_TAG = '  <script src="../js/map_mcap_fmt.js"></script>\n';

for (const rel of MAPS) {
  const p = join(root, rel);
  let c = fs.readFileSync(p, 'utf8');
  if (!c.includes('map_mcap_fmt.js')) {
    c = c.replace(
      '<script src="../js/live_quotes.js"></script>',
      '<script src="../js/map_mcap_fmt.js"></script>\n  <script src="../js/live_quotes.js"></script>',
    );
  }
  if (c.includes(OLD_FMT_ASCII)) c = c.replace(OLD_FMT_ASCII, NEW_FMT_ASCII);
  else if (c.includes(OLD_FMT)) c = c.replace(OLD_FMT, NEW_FMT);
  fs.writeFileSync(p, c, 'utf8');
  console.log('patched', rel);
}

const bioTail = join(root, 'bio/bio_inline_tail.js');
let bt = fs.readFileSync(bioTail, 'utf8');
if (!bt.includes('InvestingMapMcapFmt')) {
  bt = bt.replace(OLD_FMT, NEW_FMT);
  fs.writeFileSync(bioTail, bt, 'utf8');
  console.log('patched bio/bio_inline_tail.js');
}

if (!fs.readFileSync(join(root, 'bio/korea_bio_map.html'), 'utf8').includes('map_mcap_fmt.js')) {
  let bioHtml = fs.readFileSync(join(root, 'bio/korea_bio_map.html'), 'utf8');
  bioHtml = bioHtml.replace(
    '<script src="../js/map_heatmap.js"></script>',
    '<script src="../js/map_mcap_fmt.js"></script>\n  <script src="../js/map_heatmap.js"></script>',
  );
  fs.writeFileSync(join(root, 'bio/korea_bio_map.html'), bioHtml, 'utf8');
}

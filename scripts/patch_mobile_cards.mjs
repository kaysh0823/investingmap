/**
 * Patch industry map pages: mobile card table + map_mobile_table.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAPS = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
];

const SCRIPT_TAG = '  <script src="../js/map_mobile_table.js"></script>\n';

function patchHtml(rel) {
  const fp = path.join(root, rel);
  let c = fs.readFileSync(fp, 'utf8');
  let changed = false;

  if (!c.includes('map_mobile_table.js')) {
    const inserted = c.replace(
      /(<script src="\.\.\/js\/map_heatmap\.js"><\/script>)\r?\n/,
      '$1\n  <script src="../js/map_mobile_table.js"></script>\n'
    );
    if (inserted !== c) {
      c = inserted;
      changed = true;
    }
  }

  if (!c.includes('InvestingMapMobileTable.sync')) {
    c = c.replace(
      /(\s+)\}\)\.join\(''\);\r?\n(\s+)\}\r?\n\r?\n(\s+)function setChainFilter/m,
      "$1}).join('');\n$2if (window.InvestingMapMobileTable) InvestingMapMobileTable.sync(document.getElementById('main-table'));\n$2}\n\n$3function setChainFilter"
    );
    changed = true;
  }

  const oldScroll =
    "var row = document.querySelector('#table-body tr[data-ticker=\"' + (c.ticker || '') + '\"]');";
  const newScroll =
    "if (window.InvestingMapMobileTable) { InvestingMapMobileTable.scrollToTicker(c.ticker || ''); return; }\n          var row = document.querySelector('#table-body tr[data-ticker=\"' + (c.ticker || '') + '\"]');";
  if (c.includes(oldScroll) && !c.includes('InvestingMapMobileTable.scrollToTicker')) {
    c = c.replace(oldScroll, newScroll);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(fp, c);
    console.log('patched:', rel);
  } else {
    console.log('skip:', rel);
  }
}

for (const rel of MAPS) patchHtml(rel);

const bioTail = path.join(root, 'bio/bio_inline_tail.js');
if (fs.existsSync(bioTail)) {
  let bc = fs.readFileSync(bioTail, 'utf8');
  let changed = false;
  if (!bc.includes('InvestingMapMobileTable.sync')) {
    bc = bc.replace(
      /(\s+)\}\)\.join\(''\);\r?\n(\s+)\}\r?\n\r?\n(\s+)function setChainFilter/m,
      "$1}).join('');\n$2if (window.InvestingMapMobileTable) InvestingMapMobileTable.sync(document.getElementById('main-table'));\n$2}\n\n$3function setChainFilter"
    );
    changed = true;
  }
  const oldScroll =
    "var row = document.querySelector('#table-body tr[data-ticker=\"' + (c.ticker || '') + '\"]');";
  const newScroll =
    "if (window.InvestingMapMobileTable) { InvestingMapMobileTable.scrollToTicker(c.ticker || ''); return; }\n          var row = document.querySelector('#table-body tr[data-ticker=\"' + (c.ticker || '') + '\"]');";
  if (bc.includes(oldScroll) && !bc.includes('InvestingMapMobileTable.scrollToTicker')) {
    bc = bc.replace(oldScroll, newScroll);
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(bioTail, bc);
    console.log('patched: bio/bio_inline_tail.js');
  }
}

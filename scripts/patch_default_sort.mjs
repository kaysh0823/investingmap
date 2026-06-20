import fs from 'fs';
import path from 'path';

const root = process.cwd();

const MAPS = [
  'semiconductor/korea_semiconductor_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
];

const OLD = "let currentChain = 'all', currentMarket = 'all', searchTerm = '', sortKey = '', sortDir = 1;";
const NEW = "let currentChain = 'all', currentMarket = 'all', searchTerm = '', sortKey = 'quotePosition', sortDir = -1;";

const SYNC_FN = `
    function syncSortHeader() {
      document.querySelectorAll('thead th').forEach(th => th.className = '');
      if (!sortKey) return;
      const keyMap = { name: 0, ticker: 1, quoteLast: 2, quoteHi52: 3, quoteLo52: 4, quotePosition: 5, mcapWon: 6, per: 7, pbr: 8, market: 9, chain: 10 };
      const idx = keyMap[sortKey];
      if (idx !== undefined) {
        const ths = document.querySelectorAll('thead th');
        if (ths[idx]) ths[idx].className = sortDir === 1 ? 'sort-asc' : 'sort-desc';
      }
    }
`;

for (const rel of MAPS) {
  const fp = path.join(root, rel);
  let c = fs.readFileSync(fp, 'utf8');
  if (!c.includes(OLD)) {
    console.warn('sort state not found:', rel);
    continue;
  }
  c = c.replace(OLD, NEW);
  if (!c.includes('function syncSortHeader')) {
    c = c.replace('    function sortTable(key) {', SYNC_FN + '\n    function sortTable(key) {');
  }
  if (!c.includes('syncSortHeader();')) {
    c = c.replace(
      /(\s+renderTable\(\);\n)(\s+)(\/\/ Update graph|if \(svgEl\))/,
      '$1$2syncSortHeader();\n$2$3'
    );
  }
  fs.writeFileSync(fp, c);
  console.log('sort default:', rel);
}

// bio inline tail
const bio = path.join(root, 'bio/bio_inline_tail.js');
let bc = fs.readFileSync(bio, 'utf8');
bc = bc.replace(OLD, NEW);
if (!bc.includes('function syncSortHeader')) {
  bc = bc.replace('    function sortTable(key) {', SYNC_FN + '\n    function sortTable(key) {');
}
if (!bc.includes('syncSortHeader();')) {
  bc = bc.replace(
    '      renderTable();\n      if (svgEl) {',
    '      renderTable();\n      syncSortHeader();\n      if (svgEl) {'
  );
}
fs.writeFileSync(bio, bc);
console.log('sort default: bio/bio_inline_tail.js');

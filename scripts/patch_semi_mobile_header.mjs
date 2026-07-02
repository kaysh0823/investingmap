import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'semiconductor/korea_semiconductor_map.html');
let html = fs.readFileSync(file, 'utf8');

html = html.replace(
  /\n\s*body\.im-tab-table #tab-table\.tab-content\.active \{\s*\n\s*height: calc\(100dvh - 108px\);\s*\n\s*min-height: 240px\s*\n\s*\}\s*/g,
  '\n',
);
html = html.replace(
  /\n\s*body\.im-tab-table \.header \{\s*\n\s*padding: 8px 12px 6px\s*\n\s*\}\s*\n\s*body\.im-tab-table \.header h1 \{[\s\S]*?margin: 0\s*\n\s*\}\s*\n\s*body\.im-tab-table #hdr-subtitle,[\s\S]*?display: none\s*\n\s*\}\s*/g,
  '\n',
);
html = html.replace('map_tab_state.js?v=3', 'map_tab_state.js?v=4');
html = html.replace('map_mobile_ux.js"', 'map_mobile_ux.js?v=2"');

fs.writeFileSync(file, html, 'utf8');
if (!html.includes('섹터 설명')) throw new Error('Korean text missing after patch');
console.log('OK patch_semi_mobile_header');

/**
 * Sticky table header + first column (company name) for mobile horizontal/vertical scroll.
 * Safe to re-run (marker: investingmap-mobile-table).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = 'investingmap-mobile-table';

const MAP_FILES = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
];

const STICKY_CSS = `
    /* ${MARKER} */
    table {
      border-collapse: separate;
      border-spacing: 0
    }

    .tbl-wrap {
      overflow: auto;
      -webkit-overflow-scrolling: touch
    }

    thead th {
      position: sticky;
      top: 0;
      z-index: 2;
      box-shadow: 0 1px 0 var(--border)
    }

    thead th:first-child,
    tbody td:first-child {
      position: sticky;
      left: 0;
      z-index: 1
    }

    thead th:first-child {
      z-index: 3
    }

    tbody td:first-child {
      background: var(--bg);
      box-shadow: 1px 0 0 var(--border)
    }

    tbody tr:hover td:first-child {
      background: var(--surface2)
    }
`;

const MOBILE_TBL_CSS = `
      .tbl-wrap {
        max-height: min(72vh, calc(100dvh - 210px));
        overscroll-behavior: contain
      }

      thead th:first-child,
      tbody td:first-child {
        min-width: 104px;
        max-width: 128px
      }

      tbody td:first-child .company-name {
        font-size: 12px;
        line-height: 1.35;
        word-break: keep-all
      }
`;

function patchFile(rel) {
  const abs = path.join(root, rel);
  let html = fs.readFileSync(abs, 'utf8');

  if (html.includes(MARKER)) {
    console.log('skip (already patched):', rel);
    return;
  }

  html = html.replace(/border-collapse:\s*collapse/g, 'border-collapse: separate;\n      border-spacing: 0');

  html = html.replace(/(\s+\.node-dim\s*\{[^}]+\}\s*)(\n\s*@media\(max-width:768px\))/s, `$1${STICKY_CSS}$2`);

  if (!html.includes(MARKER)) {
    html = html.replace(/(\s*@media\(max-width:768px\)\s*\{)/, `${STICKY_CSS}$1`);
  }

  if (html.includes('@media(max-width:768px)') && !html.includes('max-height: min(72vh')) {
    html = html.replace(
      /(\.tbl-wrap\s*\{\s*\n\s*max-width:\s*100%;)/,
      `$1\n        max-height: min(72vh, calc(100dvh - 210px));\n        overflow: auto;`
    );
    html = html.replace(
      /(\.tbl-wrap\s*\{\s*\n\s*max-width:\s*100%;\s*\n\s*max-height:[^}]+\})/,
      `$1\n${MOBILE_TBL_CSS}`
    );
    if (!html.includes('min-width: 104px')) {
      html = html.replace(
        /(\.tbl-wrap\s*\{\s*\n\s*max-width:\s*100%;[\s\S]*?overscroll-behavior-x:\s*contain\s*\})/,
        (block) => block + MOBILE_TBL_CSS
      );
    }
  }

  fs.writeFileSync(abs, html, 'utf8');
  console.log('patched:', rel);
}

for (const rel of MAP_FILES) patchFile(rel);
console.log('OK patch_mobile_table');

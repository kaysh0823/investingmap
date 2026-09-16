import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function patchIndex() {
  const p = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(p, 'utf8');
  if (!html.includes('returns_tick.js')) {
    html = html.replace(
      /<script src="js\/return_live\.js\?v=\d+"><\/script>/,
      (m) => `${m}\n  <script src="js/returns_tick.js?v=1"></script>\n  <script src="js/returns_badge.js?v=1"></script>`,
    );
  }
  html = html.replace(/hub_dashboard\.js\?v=\d+/g, 'hub_dashboard.js?v=56');
  html = html.replace(/hub_trend_chart\.js\?v=\d+/g, 'hub_trend_chart.js?v=6');
  fs.writeFileSync(p, html);
  console.log('patched index.html');
}

function walkMaps(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'functions') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkMaps(p, out);
    else if (/korea_.*_map\.html$/.test(ent.name)) out.push(p);
  }
  return out;
}

function patchMaps() {
  const maps = walkMaps(ROOT);
  let n = 0;
  for (const p of maps) {
    let html = fs.readFileSync(p, 'utf8');
    const before = html;
    if (!html.includes('returns_tick.js')) {
      html = html.replace(
        /<script src="(\.\.\/)?js\/return_live\.js\?v=\d+"><\/script>/,
        (m, pre) => {
          const prefix = pre || '';
          return `${m}\n<script src="${prefix}js/returns_tick.js?v=1"></script>\n<script src="${prefix}js/returns_badge.js?v=1"></script>`;
        },
      );
    }
    html = html.replace(/live_quotes\.js\?v=\d+/g, 'live_quotes.js?v=25');
    if (html !== before) {
      fs.writeFileSync(p, html);
      n += 1;
    }
  }
  console.log(`patched maps ${n} of ${maps.length}`);
}

patchIndex();
patchMaps();

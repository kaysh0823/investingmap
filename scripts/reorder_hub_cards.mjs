/**
 * Reorder index.html hub-card anchors to HUB_MAP_PATHS order; insert missing shipping/machinery cards.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SECTOR_META, HUB_MAP_PATHS } from '../lib/sector_meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fp = path.join(ROOT, 'index.html');
let html = fs.readFileSync(fp, 'utf8');

const order = HUB_MAP_PATHS.map(([id]) => id);
const cardRe = /<a class="hub-card" id="hub-link-([a-z0-9]+)"[\s\S]*?<\/a>/g;
const cards = new Map();
let m;
while ((m = cardRe.exec(html))) {
  cards.set(m[1], m[0]);
}

function stubCard(id) {
  const meta = SECTOR_META[id];
  const href = `${meta.map}?tab=heatmap`;
  return `      <a class="hub-card" id="hub-link-${id}" href="${href}">
        <div class="hub-card-head"><span class="hub-card-icon" aria-hidden="true">${meta.icon}</span><span class="hub-card-badge" id="card-${id}-badge">— LISTINGS</span></div>
        <h2 id="card-${id}-title">한국 ${meta.ko} 투자 지도</h2>
        <p class="hub-card-lead" id="card-${id}-lead"></p>
        <p class="hub-card-keyplayers" id="card-${id}-keyplayers"></p><div class="hub-card-tags" id="card-${id}-tags"></div>
        <p class="hub-card-map" id="card-${id}-map">KRX metrics, value-chain tags, company table and peer graph.</p><span class="hub-card-cta" id="card-${id}-cta">Open map →</span>
      </a>`;
}

// Relabel existing ship/metal titles inside card HTML if present
function relabelCard(id, htmlCard) {
  if (id === 'ship') {
    return htmlCard
      .replace(/한국 조선\/해운 산업 투자 지도/g, '한국 조선·기자재 투자 지도')
      .replace(/Shipbuilding and marine:[\s\S]*?(?=<\/p>)/, '조선·해양플랜트·선박기자재 관련 상장사');
  }
  if (id === 'metal') {
    return htmlCard
      .replace(/한국 철강·금속·기계 투자 지도/g, '한국 철강·비철금속 투자 지도')
      .replace(/철강, 비철금속, 트레이딩, 산업기계/g, '철강·비철금속·철강 트레이딩');
  }
  if (id === 'holdings') {
    return htmlCard.replace(
      /(<p class="hub-card-lead" id="card-holdings-lead">)[^<]*(<\/p>)/,
      '$1기업 유형별 지도(일반 산업 아님) · 산업 밸류체인별 지주사$2',
    );
  }
  return htmlCard;
}

const ordered = order.map((id) => {
  const existing = cards.get(id);
  if (existing) return relabelCard(id, existing);
  return stubCard(id);
});

const firstIdx = html.search(/<a class="hub-card" id="hub-link-/);
const lastMatch = [...html.matchAll(/<a class="hub-card" id="hub-link-[a-z0-9]+"[\s\S]*?<\/a>/g)].pop();
if (firstIdx < 0 || !lastMatch) throw new Error('hub cards not found');
const lastEnd = lastMatch.index + lastMatch[0].length;
const next = html.slice(0, firstIdx) + ordered.join('\n') + html.slice(lastEnd);
fs.writeFileSync(fp, next, 'utf8');
console.log('OK index.html hub cards reordered', order.length);

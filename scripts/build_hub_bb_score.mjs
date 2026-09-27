/**
 * Build data/hub_bb_score.json from hub_return_refs adjusted closes.
 * Universe = hub_index companies. Needs ≥144 closes (20-day band + 125 widths).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bbScore, bollingerAt, trailingMinMaxNorm } from '../lib/bollinger.mjs';
import { listHubCompanies, normalizeTicker } from '../functions/lib/hub_dashboard_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFS_PATH = path.join(ROOT, 'data', 'hub_return_refs.json');
const HUB_PATH = path.join(ROOT, 'data', 'hub_index.json');
const VOL_PATH = path.join(ROOT, 'data', 'hub_volatility_snapshot.json');
const OUT_PATH = path.join(ROOT, 'data', 'hub_bb_score.json');

const PERIOD = 20;
const MULT = 2;
const NORM_WINDOW = 125;
const MIN_CLOSES = PERIOD + NORM_WINDOW - 1;

function round5(v) {
  return Math.round(v * 1e5) / 1e5;
}

function scoreCloses(closes) {
  if (!closes || closes.length < MIN_CLOSES) return null;
  const last = closes.length - 1;
  const widths = [];
  for (let i = last - NORM_WINDOW + 1; i <= last; i++) {
    const band = bollingerAt(closes, i, PERIOD, MULT);
    if (!band) return null;
    widths.push(band.width);
  }
  const norm = trailingMinMaxNorm(widths, NORM_WINDOW);
  const bbwNormRaw = norm[norm.length - 1];
  const tip = bollingerAt(closes, last, PERIOD, MULT);
  if (!tip || bbwNormRaw == null || !Number.isFinite(bbwNormRaw)) return null;
  const pctB = round5(tip.pctB);
  const bbw = round5(tip.width);
  const bbwNorm = round5(bbwNormRaw);
  const score = round5(bbScore(pctB, bbwNorm));
  if (score == null) return null;
  return { pctB, bbw, bbwNorm, score };
}

function main() {
  if (!fs.existsSync(REFS_PATH)) {
    console.error('missing data/hub_return_refs.json');
    process.exit(1);
  }
  if (!fs.existsSync(HUB_PATH)) {
    console.error('missing data/hub_index.json');
    process.exit(1);
  }
  const refs = JSON.parse(fs.readFileSync(REFS_PATH, 'utf8'));
  const hub = JSON.parse(fs.readFileSync(HUB_PATH, 'utf8'));
  const companies = listHubCompanies(hub);
  const nameByTicker = new Map();
  for (const c of companies) {
    const t = normalizeTicker(c.ticker);
    if (!t || nameByTicker.has(t)) continue;
    nameByTicker.set(t, c.name || c.nameEn || t);
  }

  let volRecent = null;
  if (fs.existsSync(VOL_PATH)) {
    try {
      volRecent = JSON.parse(fs.readFileSync(VOL_PATH, 'utf8'))?.recentDd || null;
    } catch {
      volRecent = null;
    }
  }
  if (volRecent && refs.recentDd && String(volRecent) !== String(refs.recentDd)) {
    console.warn(
      `[bb-score] hub_volatility_snapshot.recentDd ${volRecent} != hub_return_refs.recentDd ${refs.recentDd}`,
    );
  }

  const quotes = {};
  const ranked = [];
  let excluded = 0;
  for (const [ticker, name] of nameByTicker) {
    const row = refs.quotes && refs.quotes[ticker];
    const scored = scoreCloses(row && row.closes);
    if (!scored) {
      excluded += 1;
      continue;
    }
    quotes[ticker] = scored;
    ranked.push({ ticker, name, ...scored });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.pctB !== a.pctB) return b.pctB - a.pctB;
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  });
  const top20 = ranked.slice(0, 20).map((row, i) => ({
    ticker: row.ticker,
    name: row.name,
    score: row.score,
    pctB: row.pctB,
    bbw: row.bbw,
    bbwNorm: row.bbwNorm,
    rank: i + 1,
  }));

  const out = {
    builtAt: new Date().toISOString(),
    recentDd: refs.recentDd || null,
    source: 'hub_return_refs',
    definition: { period: PERIOD, mult: MULT, normWindow: NORM_WINDOW },
    universe: nameByTicker.size,
    count: Object.keys(quotes).length,
    excluded,
    quotes,
    top20,
  };
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(out)}\n`, 'utf8');
  const head = top20[0];
  console.log(
    `OK hub_bb_score — recentDd=${out.recentDd} universe=${out.universe} count=${out.count} excluded=${excluded}`
      + (head ? ` top1=${head.ticker} ${head.name} score=${head.score}` : ''),
  );
}

main();

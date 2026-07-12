/**
 * Parses cp_list/*.md (Claude, ChatGPT, Perplexity) into a unified industry → ticker map.
 */
import fs from 'fs';
import { join } from 'path';

const INDUSTRY_HEADERS = [
  { re: /^##\s*1[\.)]\s*반도체/i, key: 'semi' },
  { re: /^##\s*반도체\s*$/i, key: 'semi' },
  { re: /^##\s*2[\.)]\s*바이오/i, key: 'bio' },
  { re: /^##\s*바이오\s*$/i, key: 'bio' },
  { re: /^##\s*3[\.)]\s*조선/i, key: 'ship' },
  { re: /^##\s*조선/i, key: 'ship' },
  { re: /^##\s*4[\.)]\s*방/i, key: 'defense' },
  { re: /^##\s*방산/i, key: 'defense' },
  { re: /^##\s*방위/i, key: 'defense' },
  { re: /^##\s*5[\.)]\s*로봇/i, key: 'robot' },
  { re: /^##\s*로봇\s*$/i, key: 'robot' },
  { re: /^##\s*6[\.)]\s*에너지/i, key: 'energy' },
  { re: /^##\s*7[\.)]\s*에너지/i, key: 'energy' },
  { re: /^##\s*에너지/i, key: 'energy' },
  { re: /^##\s*7[\.)]\s*K/i, key: 'kconsume' },
  { re: /^##\s*K-?컬처/i, key: 'kconsume' },
  { re: /^##\s*K-?소비/i, key: 'kconsume' },
  { re: /^##\s*K-?콘텐츠/i, key: 'kcontent' },
  { re: /^##\s*K-?Content/i, key: 'kcontent' },
  { re: /^##\s*\d*[\.)]?\s*금융/i, key: 'finance' },
  { re: /^##\s*Finance\s*$/i, key: 'finance' },
  { re: /^##\s*\d*[\.)]?\s*건설/i, key: 'construction' },
  { re: /^##\s*Construction\s*$/i, key: 'construction' },
];

export function normalizeTicker(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s || /VERIFY/i.test(s)) return null;
  const m = s.match(/\b([0-9]{4}[A-Z0-9]{2}|[0-9]{5}[A-Z0-9]|[0-9]{6})\b/);
  if (m) return m[1];
  const alnum = s.replace(/[^0-9A-Z]/g, '');
  if (/^[0-9]{4}[A-Z0-9]{2}$/.test(alnum) || /^[0-9]{6}$/.test(alnum)) return alnum;
  if (/^[0-9]+$/.test(alnum) && alnum.length <= 6) return alnum.padStart(6, '0');
  return null;
}

function detectIndustry(line) {
  for (const { re, key } of INDUSTRY_HEADERS) {
    if (re.test(line.trim())) return key;
  }
  return null;
}

function ensureIndustry(map, key) {
  if (!map.has(key)) map.set(key, new Map());
  return map.get(key);
}

function upsert(indMap, ticker, patch) {
  const prev = indMap.get(ticker) || {
    ticker,
    nameKo: '',
    market: '',
    subSector: '',
    level: '',
    sources: [],
  };
  if (patch.nameKo && !prev.nameKo) prev.nameKo = patch.nameKo;
  if (patch.market && !prev.market) prev.market = patch.market;
  if (patch.subSector && (!prev.subSector || patch.subSector.length > prev.subSector.length)) {
    prev.subSector = patch.subSector;
  }
  if (patch.level && !prev.level) prev.level = patch.level;
  if (patch.source && !prev.sources.includes(patch.source)) prev.sources.push(patch.source);
  indMap.set(ticker, prev);
}

/** investing_kr_industry_stock_universe.md — primary table source */
function parseUniverseMd(text, out) {
  let industry = null;
  let inVerifySection = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const ind = detectIndustry(trimmed);
    if (ind) {
      industry = ind;
      inVerifySection = false;
      continue;
    }
    if (/^##\s/.test(trimmed) && !ind) {
      industry = null;
      continue;
    }
    if (/^###\s*검증/i.test(trimmed)) {
      inVerifySection = true;
      continue;
    }
    if (!industry || inVerifySection) continue;
    if (!trimmed.startsWith('|')) continue;
    if (/^\|\s*[-—:]+\s*\|/.test(trimmed)) continue;
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const headerLike = /종목코드|종목명|code/i.test(cells[0] + cells[1]);
    if (headerLike) continue;

    let code;
    let name;
    let sub;
    let level;
    if (/^[0-9A-Z]{4,6}$/i.test(cells[0])) {
      [code, name, sub = '', level = ''] = cells;
    } else {
      [name, code, sub = '', level = ''] = cells;
    }
    const ticker = normalizeTicker(code);
    if (!ticker || /verify/i.test(String(level))) continue;
    upsert(ensureIndustry(out, industry), ticker, {
      nameKo: name,
      subSector: sub,
      level,
      source: 'universe',
    });
  }
}

/** investing-kr-stocks.md — subsection tables (name | code | market) */
function parseClaudeMd(text, out) {
  let industry = null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const ind = detectIndustry(trimmed);
    if (ind) {
      industry = ind;
      continue;
    }
    if (/^##\s/.test(trimmed) && !ind) {
      industry = null;
      continue;
    }
    if (!industry || !trimmed.startsWith('|')) continue;
    if (/^\|\s*[-—:]+\s*\|/.test(trimmed)) continue;
    const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (/종목명|종목코드/.test(cells.join(''))) continue;

    let name;
    let code;
    let market = '';
    if (/^[0-9A-Z]{4,6}$/i.test(cells[0])) {
      [code, name, market = ''] = cells;
    } else {
      [name, code, market = ''] = cells;
    }
    const ticker = normalizeTicker(code);
    if (!ticker) continue;
    upsert(ensureIndustry(out, industry), ticker, {
      nameKo: name,
      market: market.toUpperCase().includes('KOSDAQ') ? 'KOSDAQ' : market.toUpperCase().includes('KOSPI') ? 'KOSPI' : '',
      subSector: '',
      source: 'claude',
    });
  }
}

/** output_industries_list.md — bullet lines: name (ticker) */
function parsePerplexityMd(text, out) {
  let industry = null;
  let skipSection = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const ind = detectIndustry(trimmed);
    if (ind) {
      industry = ind;
      skipSection = false;
      continue;
    }
    if (/^##\s/.test(trimmed) && !ind) {
      industry = null;
      continue;
    }
    if (/^###\s*검증/i.test(trimmed)) {
      skipSection = true;
      continue;
    }
    if (/^###\s*(확정|확장)/i.test(trimmed)) {
      skipSection = false;
      continue;
    }
    if (!industry || skipSection) continue;
    const m = trimmed.match(/^[-*]\s*(.+?)\s*\(([0-9A-Z]{4,6}[A-Z0-9]?)\)/);
    if (!m) continue;
    const ticker = normalizeTicker(m[2]);
    if (!ticker) continue;
    const name = m[1].replace(/\[[^\]]*\]/g, '').trim();
    upsert(ensureIndustry(out, industry), ticker, {
      nameKo: name,
      subSector: '',
      source: 'perplexity',
    });
  }
}

/**
 * @param {string} cpListDir absolute path to cp_list folder
 * @returns {Map<string, Map<string, object>>} industryKey → ticker → entry
 */
export function loadCpListUniverse(cpListDir) {
  const out = new Map();
  const files = [
    ['universe', 'investing_kr_industry_stock_universe.md', parseUniverseMd],
    ['claude', 'investing-kr-stocks.md', parseClaudeMd],
    ['perplexity', 'output_industries_list.md', parsePerplexityMd],
  ];
  for (const [, fname, parser] of files) {
    const p = join(cpListDir, fname);
    if (!fs.existsSync(p)) {
      console.warn('cp_list missing:', p);
      continue;
    }
    parser(fs.readFileSync(p, 'utf8'), out);
  }
  return out;
}

export function countByIndustry(universe) {
  const counts = {};
  for (const [key, m] of universe) counts[key] = m.size;
  return counts;
}

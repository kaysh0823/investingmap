/**
 * Invariant checks for sector chain reclass (semi / ship / powergrid).
 * Universe size may change; only structural rules and curated assignments are enforced.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { LEGEND_CHAINS as SEMI_LEAF_CHAINS } from './semi_chain_ui.mjs';

const OVERRIDES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'chain_overrides.json');

export const SECTOR_INVARIANT_CONFIG = {
  semi: {
    industryKey: 'semi',
    expectedChains: [...SEMI_LEAF_CHAINS],
    retiredChains: ['장비', '후공정', 'IDM'],
    excludedTickers: ['171090'],
    /** Chain → exact ticker set when those tickers appear on the map. */
    curatedChainMembers: {
      디자인하우스: ['399720', '200710', '490470'],
      파운드리: ['000990'],
    },
  },
  ship: {
    industryKey: 'ship',
    expectedChains: ['종합조선', '엔진', '의장/배관', '선체·보냉·구조재', '서비스·해양플랜트', '해운물류'],
    retiredChains: ['조선기자재', '기타 기자재', '해양플랜트', '방산해양', '철강소재'],
    excludedTickers: [],
    curatedChainMembers: {},
    /** Ticker → chain when present on map (powergrid-style pin list). */
    curatedTickerChains: {},
  },
  powergrid: {
    industryKey: 'powergrid',
    expectedChains: ['전력설비', '송배전', '전선·케이블', '발전설비'],
    retiredChains: ['송배전·케이블'],
    excludedTickers: [],
    curatedChainMembers: {},
    curatedTickerChains: {
      '001440': '전선·케이블',
      '000500': '전선·케이블',
      '006340': '전선·케이블',
      '229640': '전선·케이블',
      '062040': '송배전',
      '103590': '송배전',
      '060370': '송배전',
      '033100': '송배전',
    },
  },
};

let overridesCache = null;

export function loadChainOverrideMap() {
  if (!overridesCache) {
    overridesCache = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  }
  return overridesCache;
}

export function padTicker(t) {
  return String(t || '').padStart(6, '0');
}

export function countByChain(companies) {
  const counts = {};
  const byChain = {};
  const byTicker = new Map();
  for (const c of companies) {
    const ticker = padTicker(c.ticker);
    const chain = c.chain;
    byTicker.set(ticker, chain);
    counts[chain] = (counts[chain] || 0) + 1;
    if (!byChain[chain]) byChain[chain] = [];
    byChain[chain].push(ticker);
  }
  return { counts, byChain, byTicker, total: companies.length };
}

/**
 * @returns {string[]} validation errors (empty = OK)
 */
export function validateChainInvariants(sectorKey, companies, { label = '' } = {}) {
  const config = SECTOR_INVARIANT_CONFIG[sectorKey];
  if (!config) throw new Error(`unknown sector for chain invariants: ${sectorKey}`);

  const errors = [];
  const prefix = label ? `${label}: ` : '';
  const expectedSet = new Set(config.expectedChains);
  const retiredSet = new Set(config.retiredChains || []);
  const onMap = new Set(companies.map((c) => padTicker(c.ticker)));
  const { counts, byChain, byTicker, total } = countByChain(companies);

  // 4) sum(counts) === company count; each row has a chain
  let sum = 0;
  for (const c of companies) {
    if (!c.chain || typeof c.chain !== 'string') {
      errors.push(`${prefix}${c.ticker}: missing chain`);
    }
    sum += 1;
  }
  const countSum = Object.values(counts).reduce((a, n) => a + n, 0);
  if (countSum !== total) {
    errors.push(`${prefix}count sum ${countSum} != companies ${total}`);
  }
  if (sum !== total) {
    errors.push(`${prefix}invalid company rows: ${sum} vs ${total}`);
  }

  // 1) chain SET: only expected leaf chains (no extra / retired)
  for (const chain of Object.keys(counts)) {
    if (retiredSet.has(chain)) {
      errors.push(`${prefix}retired chain in use: ${chain} (${counts[chain]})`);
    } else if (!expectedSet.has(chain)) {
      errors.push(`${prefix}unexpected chain: ${chain} (${counts[chain]})`);
    }
  }

  // excluded tickers must not appear on map
  for (const t of config.excludedTickers || []) {
    if (onMap.has(padTicker(t))) {
      errors.push(`${prefix}excluded ticker ${t} must not be on map`);
    }
  }

  // 2) curated chain member sets (exact for tickers present on map)
  for (const [chain, members] of Object.entries(config.curatedChainMembers || {})) {
    const want = new Set(members.map(padTicker).filter((t) => onMap.has(t)));
    const got = new Set((byChain[chain] || []).map(padTicker));
    for (const t of got) {
      if (!want.has(t)) {
        errors.push(`${prefix}${chain}: unexpected member ${t} (not in curated set)`);
      }
    }
    for (const t of want) {
      if (!got.has(t)) {
        errors.push(`${prefix}${chain}: missing curated member ${t} (got ${byTicker.get(t) || 'absent'})`);
      }
    }
    if (got.size !== want.size) {
      errors.push(`${prefix}${chain}: curated size ${want.size}, got ${got.size}`);
    }
  }

  // 2b) curated ticker → chain pins
  for (const [ticker, chain] of Object.entries(config.curatedTickerChains || {})) {
    const t = padTicker(ticker);
    if (!onMap.has(t)) continue;
    if (byTicker.get(t) !== chain) {
      errors.push(`${prefix}${t}: curated chain ${chain}, got ${byTicker.get(t)}`);
    }
  }

  // 3) chain_overrides.json reassignments for tickers on this map
  const overrides = loadChainOverrideMap()[config.industryKey] || {};
  for (const [ticker, wantChain] of Object.entries(overrides)) {
    const t = padTicker(ticker);
    if (!onMap.has(t)) continue;
    if (byTicker.get(t) !== wantChain) {
      errors.push(`${prefix}override ${t}→${wantChain}, map has ${byTicker.get(t)}`);
    }
  }

  return errors;
}

export function assertChainInvariants(sectorKey, companies, opts) {
  const errors = validateChainInvariants(sectorKey, companies, opts);
  if (errors.length) {
    throw new Error(`${sectorKey} chain invariant failed — ${errors.join('; ')}`);
  }
  return countByChain(companies).counts;
}

/** Reference log of chain counts (not asserted). */
export function logChainCounts(sectorKey, counts) {
  const config = SECTOR_INVARIANT_CONFIG[sectorKey];
  const ordered = [...(config?.expectedChains || []), ...Object.keys(counts).filter((c) => !config?.expectedChains?.includes(c))];
  const parts = ordered.filter((c) => counts[c]).map((c) => `${c}:${counts[c]}`);
  return parts.join(', ');
}

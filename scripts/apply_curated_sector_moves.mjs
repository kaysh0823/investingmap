/**
 * Ensures approved sector additions exist before cp_list merging:
 * cable names in powergrid and Intellian in defense.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  extractCompaniesFromHtml,
  fmtMcap,
  mcapTier,
  patchKoreanCompaniesHtml,
  slugId,
} from '../lib/map_company_serialize.mjs';
import { chainOverride } from '../lib/chain_overrides.mjs';
import { loadMergedKrxMap } from '../lib/krx_data_sources.mjs';
import { passesMcapFloor } from '../lib/mcap_policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KRX = loadMergedKrxMap(join(ROOT, 'data'));

const MAPS = {
  powergrid: {
    path: 'powergrid/korea_powergrid_map.html',
    companies: [
      {
        ticker: '000500',
        name: '가온전선',
        nameEn: 'Gaon Cable',
        chain: '송배전',
        semType: '전력·통신 케이블',
        semTypeEn: 'Power and communications cables',
        products: '전력·통신 케이블',
        productsEn: 'Power and communications cables',
      },
      {
        ticker: '006340',
        name: '대원전선',
        nameEn: 'Daewon Cable',
        chain: '송배전',
        semType: '전선·케이블',
        semTypeEn: 'Wire and cable',
        products: '전력·통신·산업용 전선',
        productsEn: 'Power, communications and industrial cables',
      },
      {
        ticker: '060370',
        name: 'LS마린솔루션',
        nameEn: 'LS Marine Solution',
        chain: '송배전',
        semType: '해저케이블 시공·유지보수',
        semTypeEn: 'Subsea cable installation and maintenance',
        products: '해저 전력·통신 케이블 시공·유지보수',
        productsEn: 'Subsea power and communications cable installation and maintenance',
      },
      {
        ticker: '229640',
        name: 'LS에코에너지',
        nameEn: 'LS Eco Energy',
        chain: '송배전',
        semType: '전력·통신 케이블',
        semTypeEn: 'Power and communications cables',
        products: '초고압·배전·통신 케이블',
        productsEn: 'High-voltage, distribution and communications cables',
      },
    ],
  },
  defense: {
    path: 'defense/korea_defense_map.html',
    companies: [
      {
        ticker: '189300',
        name: '인텔리안테크',
        nameEn: 'Intellian Technologies',
        chain: '우주·위성·민항',
        semType: '위성통신 안테나',
        semTypeEn: 'Satellite communications antennas',
        products: '해상·육상용 위성안테나·게이트웨이',
        productsEn: 'Maritime and land satellite antennas and gateways',
      },
    ],
  },
};

function upsertMap(sector, config) {
  const path = join(ROOT, config.path);
  let html = fs.readFileSync(path, 'utf8');
  const companies = extractCompaniesFromHtml(html);
  const byTicker = new Map(companies.map((c) => [c.ticker, c]));

  for (const approved of config.companies) {
    const row = KRX.get(approved.ticker);
    if (!row || !passesMcapFloor({ mcapWon: row.mcap })) {
      throw new Error(`${sector}: ${approved.ticker} missing KRX row or below mcap floor`);
    }
    const existing = byTicker.get(approved.ticker) || {};
    byTicker.set(approved.ticker, {
      ...existing,
      ...approved,
      id: existing.id || slugId(approved.ticker, approved.nameEn, sector),
      market: row.market,
      chain: chainOverride(sector, approved.ticker) || approved.chain,
      revenue: fmtMcap(row.mcap),
      mcapWon: row.mcap,
      per: existing.per ?? null,
      pbr: existing.pbr ?? null,
      revTier: mcapTier(row.mcap),
      partners: existing.partners || [],
    });
  }

  if (sector === 'defense') {
    for (const ticker of ['099320', '214430']) {
      const company = byTicker.get(ticker);
      const forced = chainOverride(sector, ticker);
      if (company && forced) company.chain = forced;
    }
  }

  const next = [...byTicker.values()].sort((a, b) => (b.mcapWon || 0) - (a.mcapWon || 0));
  html = patchKoreanCompaniesHtml(html, next);
  fs.writeFileSync(path, html, 'utf8');
  console.log(`${sector}: curated additions applied (${next.length} companies)`);
}

for (const [sector, config] of Object.entries(MAPS)) upsertMap(sector, config);

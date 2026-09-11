/**
 * Invariant checks for sector chain reclass (semi / ship / energy §0-4 / powergrid).
 * Universe size may change; only structural rules and curated assignments are enforced.
 */
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { LEGEND_CHAINS as SEMI_LEAF_CHAINS } from './semi_chain_ui.mjs';
import {
  BATTERY_CHAINS,
  RENEWABLE_CHAINS,
  NUCLEAR_CHAINS,
  POWERGRID_CHAINS,
  ENERGY_04,
} from './energy_04_chain_ui.mjs';
import {
  CHEMICAL_CHAINS,
  METAL_CHAINS,
  MACHINERY_CHAINS,
  CONSTRUCTION_CHAINS,
  INDUSTRY_04B,
} from './industry_04b_chain_ui.mjs';
import {
  AUTO_CHAINS,
  SHIP_CHAINS,
  SHIPPING_CHAINS,
  DEFENSE_CHAINS,
  MOBILITY_04C,
} from './mobility_04c_chain_ui.mjs';
import {
  ELEC_CHAINS,
  SOFTWARE_CHAINS,
  TELECOM_CHAINS,
  ROBOT_CHAINS,
  TECH_04D,
} from './tech_04d_chain_ui.mjs';
import {
  BIO_CHAINS,
  MEDTECH_CHAINS,
  COSMETICS_CHAINS,
  HEALTH_04E,
} from './health_04e_chain_ui.mjs';
import {
  KCONSUME_CHAINS,
  KCONTENT_CHAINS,
  TRAVEL_CHAINS,
  CONSUMER_04F,
} from './consumer_04f_chain_ui.mjs';
import {
  FINANCE_CHAINS,
  HOLDINGS_CHAINS,
  FINANCE_04G,
} from './finance_04g_chain_ui.mjs';

const OVERRIDES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'chain_overrides.json');

export const SECTOR_INVARIANT_CONFIG = {
  semi: {
    industryKey: 'semi',
    expectedChains: [...SEMI_LEAF_CHAINS],
    retiredChains: [
      '장비',
      '후공정',
      'IDM',
      'IDM/종합반도체',
      '팹리스',
      '소재',
      '후공정 장비',
      '부품/기판',
      '패키징/테스트',
    ],
    excludedTickers: ['171090', '005930', '000660', '036830'],
    /** Chain → exact ticker set when those tickers appear on the map. */
    curatedChainMembers: {
      디자인하우스: ['399720', '200710', '490470'],
      파운드리: ['000990'],
      '반도체 유통': ['093520', '031330'],
    },
    curatedTickerChains: {
      '077360': '기판·패키징 소재',
      '082270': '팹 인프라·지원설비',
      '323280': '전공정 장비',
      '127120': '공정 부품·유지관리',
      '388210': '공정 부품·유지관리',
      '159010': '공정 부품·유지관리',
      '031330': '반도체 유통',
      '024850': '기판·패키징 소재',
      '383310': '팹 인프라·지원설비',
      '029460': '팹 인프라·지원설비',
      '015360': '전공정 장비',
      '170920': '공정 소재',
    },
  },
  ship: {
    industryKey: 'ship',
    expectedChains: [...SHIP_CHAINS],
    retiredChains: [...MOBILITY_04C.ship.retired],
    excludedTickers: ['011200', '003280', '028670', '005880', '044490'],
    curatedChainMembers: {},
    curatedTickerChains: {},
  },
  shipping: {
    industryKey: 'shipping',
    expectedChains: [...SHIPPING_CHAINS],
    retiredChains: [...MOBILITY_04C.shipping.retired],
    excludedTickers: [],
    curatedChainMembers: {},
    curatedTickerChains: {
      '011200': '컨테이너 해운',
      '003280': '컨테이너 해운',
      '028670': '벌크 해운',
      '005880': '벌크 해운',
      '086280': '자동차·특수화물 운송',
      '000120': '종합물류',
    },
  },
  auto: {
    industryKey: 'auto',
    expectedChains: [...AUTO_CHAINS],
    retiredChains: [...MOBILITY_04C.auto.retired],
    excludedTickers: ['000430', '010690'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '437730': '구동·파워트레인',
      '125490': '차체·내외장',
      '089860': '유통·모빌리티 서비스',
      '046070': '차체·내외장',
      '004700': '차체·내외장',
      '448900': '섀시·안전',
    },
  },
  defense: {
    industryKey: 'defense',
    expectedChains: [...DEFENSE_CHAINS],
    retiredChains: [...MOBILITY_04C.defense.retired],
    excludedTickers: ['189300'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '012450': '육상체계',
      '079550': '유도무기·탄약',
      '484870': '소재·핵심부품',
      '368770': '방산전자·센서',
    },
  },
  battery: {
    industryKey: 'battery',
    expectedChains: [...BATTERY_CHAINS],
    retiredChains: [...ENERGY_04.battery.retired],
    excludedTickers: ['126340', '001570'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '222080': '제조·검사 장비',
      '033790': '제조·검사 장비',
    },
  },
  renewable: {
    industryKey: 'renewable',
    expectedChains: [...RENEWABLE_CHAINS],
    retiredChains: [...ENERGY_04.renewable.retired],
    excludedTickers: ['119850', '018670'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '126340': '수소·연료전지',
      '044490': '구조물·보조설비',
    },
  },
  nuclear: {
    industryKey: 'nuclear',
    expectedChains: [...NUCLEAR_CHAINS],
    retiredChains: [...ENERGY_04.nuclear.retired],
    excludedTickers: [],
    curatedChainMembers: {},
    curatedTickerChains: {
      '100840': '보조기기·소재',
      '006910': '보조기기·소재',
      '052690': '설계·엔지니어링',
      '032820': '계측·제어',
      '126720': '정비·운영지원',
    },
  },
  powergrid: {
    industryKey: 'powergrid',
    expectedChains: [...POWERGRID_CHAINS],
    retiredChains: [...ENERGY_04.powergrid.retired, '송배전·케이블'],
    excludedTickers: [],
    curatedChainMembers: {},
    curatedTickerChains: {
      '001440': '전선·케이블',
      '000500': '전선·케이블',
      '006340': '전선·케이블',
      '229640': '전선·케이블',
      '103590': '전선·케이블',
      '062040': '변압기',
      '033100': '변압기',
      '060370': '전력망 시공·서비스',
      '119850': '발전·비상전원 설비',
      '004690': '유틸리티',
      '005090': '유틸리티',
    },
  },
  chemical: {
    industryKey: 'chemical',
    expectedChains: [...CHEMICAL_CHAINS],
    retiredChains: [...INDUSTRY_04B.chemical.retired],
    excludedTickers: ['004690', '005090'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '002380': '정밀·특수화학',
      '018670': '가스',
      '017940': '가스',
      '001570': '정밀·특수화학',
      '014820': '포장재',
      '008730': '포장재',
      '014830': '정밀·특수화학',
      '001390': '비료·농화학',
    },
  },
  metal: {
    industryKey: 'metal',
    expectedChains: [...METAL_CHAINS],
    retiredChains: [...INDUSTRY_04B.metal.retired],
    excludedTickers: [],
    curatedChainMembers: {},
    curatedTickerChains: {
      '009520': '금속 유통·가공서비스',
    },
  },
  machinery: {
    industryKey: 'machinery',
    expectedChains: [...MACHINERY_CHAINS],
    retiredChains: [...INDUSTRY_04B.machinery.retired],
    excludedTickers: ['437730'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '267270': '건설기계',
      '079900': '건설기계',
    },
  },
  construction: {
    industryKey: 'construction',
    expectedChains: [...CONSTRUCTION_CHAINS],
    retiredChains: [...INDUSTRY_04B.construction.retired],
    excludedTickers: ['267270', '002380'],
    curatedChainMembers: {},
    curatedTickerChains: {},
  },
  elec: {
    industryKey: 'elec',
    expectedChains: [...ELEC_CHAINS],
    retiredChains: [...TECH_04D.elec.retired],
    excludedTickers: ['222080', '077360'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '009450': '가전·생활기기',
      '025320': '전자부품·기판',
    },
  },
  software: {
    industryKey: 'software',
    expectedChains: [...SOFTWARE_CHAINS],
    retiredChains: [...TECH_04D.software.retired],
    excludedTickers: [],
    curatedChainMembers: {},
    curatedTickerChains: {
      '064260': '결제·데이터 인프라',
      '234340': '결제·데이터 인프라',
    },
  },
  telecom: {
    industryKey: 'telecom',
    expectedChains: [...TELECOM_CHAINS],
    retiredChains: [...TECH_04D.telecom.retired],
    excludedTickers: ['126560'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '189300': '위성통신 장비',
    },
  },
  robot: {
    industryKey: 'robot',
    expectedChains: [...ROBOT_CHAINS],
    retiredChains: [...TECH_04D.robot.retired],
    excludedTickers: ['125490'],
    curatedChainMembers: {},
    curatedTickerChains: {},
  },
  bio: {
    industryKey: 'bio',
    expectedChains: [...BIO_CHAINS],
    retiredChains: [...HEALTH_04E.bio.retired],
    excludedTickers: ['086900', '290650', '0120G0', '082270'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '372320': '신약개발',
      '950260': '신약개발',
      '187660': '신약개발',
    },
  },
  medtech: {
    industryKey: 'medtech',
    expectedChains: [...MEDTECH_CHAINS],
    retiredChains: [...HEALTH_04E.medtech.retired],
    excludedTickers: ['228760', '389650'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '067630': '체외진단',
      '290650': '의료소모품·재생재료',
      '0120G0': '의료소모품·재생재료',
      '386380': '생체측정·모니터링',
    },
  },
  cosmetics: {
    industryKey: 'cosmetics',
    expectedChains: [...COSMETICS_CHAINS],
    retiredChains: [...HEALTH_04E.cosmetics.retired],
    excludedTickers: ['003350', '078520', '352480'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '086900': '에스테틱 의약품·소모품',
      '214450': '에스테틱 의약품·소모품',
      '336570': '미용 의료장비',
    },
  },
  kconsume: {
    industryKey: 'kconsume',
    expectedChains: [...KCONSUME_CHAINS],
    retiredChains: [...CONSUMER_04F.kconsume.retired],
    excludedTickers: ['086280', '000120', '001740'],
    curatedChainMembers: {},
    curatedTickerChains: {
      '001120': '종합상사',
      '011760': '종합상사',
      '033780': '담배·건강소비재',
      '452260': '유통',
      '194370': '의류 제조',
    },
  },
  kcontent: {
    industryKey: 'kcontent',
    expectedChains: [...KCONTENT_CHAINS],
    retiredChains: [...CONSUMER_04F.kcontent.retired],
    excludedTickers: [],
    curatedChainMembers: {},
    curatedTickerChains: {
      '293490': '게임',
      '376300': '팬덤 플랫폼',
      '035760': '방송·스트리밍',
    },
  },
  travel: {
    industryKey: 'travel',
    expectedChains: [...TRAVEL_CHAINS],
    retiredChains: [...CONSUMER_04F.travel.retired],
    excludedTickers: [],
    curatedChainMembers: {},
    curatedTickerChains: {
      '008770': '면세',
      '025980': '호텔·리조트',
      '003490': '항공운송',
      '006730': '호텔·리조트',
    },
  },
  finance: {
    industryKey: 'finance',
    expectedChains: [...FINANCE_CHAINS],
    retiredChains: [...FINANCE_04G.finance.retired],
    excludedTickers: [],
    curatedChainMembers: {},
    curatedTickerChains: {
      '377300': '결제·핀테크',
      '071050': '비은행 금융그룹',
      '029780': '카드·캐피탈·여신금융',
    },
  },
  holdings: {
    industryKey: 'holdings',
    expectedChains: [...HOLDINGS_CHAINS],
    retiredChains: [...FINANCE_04G.holdings.retired],
    excludedTickers: [],
    curatedChainMembers: {},
    curatedTickerChains: {
      '402340': 'IT·전자',
      '012030': '금융',
      '023590': '금융',
      '032190': '금융',
      '004800': '복합사업',
      '000070': '복합사업',
      '024720': '복합사업',
      '180640': '운송·물류',
      '096760': '헬스케어',
      '499790': '에너지·화학',
      '034310': '금융',
      '008060': 'IT·전자',
      '035810': '소비·유통',
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

/**
 * Fills empty semType / products from cp_list sub_sector, templates, and curated overrides.
 */
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadCpListUniverse } from './cp_list_universe.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OVERRIDES_PATH = join(__dirname, '..', 'data', 'ticker_field_overrides.json');

const HANGUL = /[\uAC00-\uD7A3\u3131-\u318E]/;
const EMPTY = (v) => v == null || String(v).trim() === '' || String(v).trim() === '—';

function englishOnlyFallback(industryKey) {
  const map = {
    semi: 'Semiconductor-related products and services',
    ship: 'Shipbuilding and marine products and services',
    defense: 'Defense and aerospace products and services',
    robot: 'Robotics and automation products and services',
    energy: 'Energy and power products and services',
    kculture: 'K-culture products and services',
    kconsume: 'K-consume, retail and travel products and services',
    kcontent: 'K-content, games and entertainment products and services',
    bio: 'Biotech and healthcare products and services',
    finance: 'Financial products and services',
    construction: 'Construction products and services',
    powergrid: 'Power equipment and services',
  };
  return map[industryKey] || 'Related products and services';
}

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_PATH)) return {};
  return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
}

function pickOverride(overrides, ticker, industryKey) {
  const o = overrides[ticker];
  if (!o) return null;
  if (o.byIndustry?.[industryKey]) return o.byIndustry[industryKey];
  if (o.semType || o.products) return o;
  return null;
}

function productsFromSubSector(industryKey, sub, chain, name) {
  const s = (sub || chain || '').trim();
  if (!s || s === '—') return null;

  const eq = (re) => re.test(s);
  const ko = (text, en) => ({ ko: text, en: en || text });

  switch (industryKey) {
    case 'semi':
      if (eq(/메모리|HBM|DRAM|NAND|IDM|파운드리/i)) return ko(`${s} — 웨이퍼·메모리·시스템반도체`, `${s} — wafers, memory and system semiconductors`);
      if (eq(/팹리스|디자인|IP|ASIC|MCU|SSD|컨트롤러/i)) return ko(`${s} — 팹리스·IP·ASSP`, `${s} — fabless, IP and ASSP`);
      if (eq(/패키징|OSAT|테스트|프로브|리드프레임|본딩/i)) return ko(`${s} — OSAT·패키징·테스트`, `${s} — OSAT, packaging and test services`);
      if (eq(/PCB|기판|FPCB|FC-BGA|모듈/i)) return ko(`${s} — 패키지·PCB 기판`, `${s} — package substrates and PCB`);
      if (eq(/소재|케미칼|가스|PR|전구체|PR\b|머티리얼|와이어|PR/i)) return ko(`${s} — 반도체 공정 소재·화학`, `${s} — semiconductor process materials and chemicals`);
      if (eq(/장비|핸들러|검사|스크러버|펌프|레이저|클린룸|어닐링|증착|식각|계측|UV|코팅|이송|자동화/i)) return ko(`${s} — 반도체 공정·검사 장비`, `${s} — semiconductor process and inspection equipment`);
      if (eq(/유통|리퍼/i)) return ko(`${s} — 반도체 장비·부품 유통`, `${s} — semiconductor equipment and parts distribution`);
      return ko(`${s} — 반도체 관련 제품`, englishOnlyFallback('semi'));

    case 'ship':
      if (eq(/종합조선|조선소|yard/i)) return ko(`${s} — 상선·특수선 건조`, `${s} — merchant and specialty vessel construction`);
      if (eq(/조선기자재|엔진|밸브|펌프|전장/i)) return ko(`${s} — 선박용 기자재·엔진`, `${s} — marine equipment and engines`);
      if (eq(/해양|플랜트|FPSO|시추/i)) return ko(`${s} — 해양플랜트·FPSO`, `${s} — offshore plants and FPSO`);
      if (eq(/해운|물류|컨테이너/i)) return ko(`${s} — 해운·선박 MRO·솔루션`, `${s} — shipping, vessel MRO and logistics`);
      if (eq(/방산|함정|군함/i)) return ko(`${s} — 군함·방산 해양`, `${s} — naval and defense marine systems`);
      if (eq(/철강|소재|강판/i)) return ko(`${s} — 조선·방산용 철강 소재`, `${s} — steel materials for shipbuilding and defense`);
      return ko(`${s} — 조선·해양 관련`, englishOnlyFallback('ship'));

    case 'defense':
      if (eq(/항공|엔진|MRO|민항/i)) return ko(`${s} — 항공기·엔진·MRO`, `${s} — aircraft, engines and MRO`);
      if (eq(/미사일|레이더|C4ISR|전자전/i)) return ko(`${s} — 미사일·레이더·C4ISR`, `${s} — missiles, radar and C4ISR`);
      if (eq(/육상|차량|탄약|포|장갑/i)) return ko(`${s} — 지상무기·차량·탄약`, `${s} — land systems, vehicles and munitions`);
      if (eq(/함정|해군|조선방산/i)) return ko(`${s} — 함정·해군 방산`, `${s} — naval combat systems`);
      if (eq(/우주|위성|발사/i)) return ko(`${s} — 위성·우주·발사체`, `${s} — satellites, space and launch systems`);
      return ko(`${s} — 방산·항공우주`, englishOnlyFallback('defense'));

    case 'robot':
      if (eq(/휴머노이드|모바일|이족/i)) return ko(`${s} — 휴머노이드·이동로봇`, `${s} — humanoid and mobile robots`);
      if (eq(/협동|코봇|cobot/i)) return ko(`${s} — 협동·산업용 로봇`, `${s} — collaborative and industrial robots`);
      if (eq(/물류|AMR|AGV|무인|드론/i)) return ko(`${s} — AMR·물류·무인시스템`, `${s} — AMR, logistics and unmanned systems`);
      if (eq(/센서|비전|감속기|베어링|모션/i)) return ko(`${s} — 로봇 핵심 부품`, `${s} — core robot components`);
      if (eq(/AI|지능|제어|SW|소프트/i)) return ko(`${s} — 로봇·FA 제어 SW`, `${s} — robot and FA control software`);
      return ko(`${s} — 로봇·자동화`, englishOnlyFallback('robot'));

    case 'energy':
      if (eq(/ESS|배터리|2차전지|양극|음극|전해질|리튬/i)) return ko(`${s} — 2차전지·ESS`, `${s} — batteries and ESS`);
      if (eq(/전력|송배전|변압|케이블|스위치|전선/i)) return ko(`${s} — 전력설비·송배전`, `${s} — power equipment and T&D`);
      if (eq(/태양|풍력|신재생|솔라/i)) return ko(`${s} — 태양광·풍력·신재생`, `${s} — solar, wind and renewables`);
      if (eq(/원자력|원전|터빈/i)) return ko(`${s} — 원전·발전설비`, `${s} — nuclear and power generation equipment`);
      if (eq(/수소|연료전지/i)) return ko(`${s} — 수소·연료전지`, `${s} — hydrogen and fuel cells`);
      if (eq(/정유|석유|화학/i)) return ko(`${s} — 정유·석유화학`, `${s} — refining and petrochemicals`);
      if (eq(/지주|홀딩/i)) return ko(`${s} — 에너지·화학 계열`, `${s} — energy and chemicals group`);
      return ko(`${s} — 에너지·전력`, englishOnlyFallback('energy'));

    case 'kculture':
    case 'kconsume':
      if (eq(/라면|식품|F&B|제과|음식/i)) return ko(`${s} — K-푸드·F&B`, `${s} — K-food and F&B`);
      if (eq(/여행|항공|레저|호텔|면세/i)) return ko(`${s} — 여행·레저·항공`, `${s} — travel, leisure and aviation`);
      if (eq(/화장품|뷰티|코스메틱/i)) return ko(`${s} — K-뷰티·화장품`, `${s} — K-beauty and cosmetics`);
      if (eq(/패션|의류|apparel/i)) return ko(`${s} — 패션·의류`, `${s} — fashion and apparel`);
      if (eq(/유통|쇼핑|리테일|백화점/i)) return ko(`${s} — 쇼핑·유통`, `${s} — retail and distribution`);
      if (industryKey === 'kconsume') return ko(`${s} — K-소비·유통`, englishOnlyFallback('kconsume'));
      if (eq(/게임/i)) return ko(`${s} — 게임·IP`, 'Games and IP');
      if (eq(/드라마|미디어|웹툰|OTT|영화|콘텐츠/i)) return ko(`${s} — 콘텐츠·미디어`, `${s} — content and media`);
      if (eq(/K-pop|K팝|엔터|아이돌|공연/i)) return ko(`${s} — K-pop·엔터`, `${s} — K-pop and entertainment`);
      return ko(`${s} — K-컬처`, englishOnlyFallback('kculture'));

    case 'kcontent':
      if (eq(/게임/i)) return ko(`${s} — 게임·IP`, 'Games and IP');
      if (eq(/드라마|미디어|웹툰|OTT|영화|콘텐츠/i)) return ko(`${s} — 콘텐츠·미디어`, `${s} — content and media`);
      if (eq(/K-pop|K팝|엔터|아이돌|공연/i)) return ko(`${s} — K-pop·엔터`, `${s} — K-pop and entertainment`);
      return ko(`${s} — K-콘텐츠`, englishOnlyFallback('kcontent'));

    case 'bio':
      if (eq(/CDMO|CMO|위탁/i)) return ko(`${s} — 바이오 CDMO·위탁생산`, `${s} — biologics CDMO`);
      if (eq(/시밀러/i)) return ko(`${s} — 바이오시밀러`, `${s} — biosimilars`);
      if (eq(/ADC|항체/i)) return ko(`${s} — 항체·ADC 신약`, `${s} — antibody and ADC therapeutics`);
      if (eq(/면역/i)) return ko(`${s} — 면역항암·면역치료`, `${s} — immuno-oncology`);
      if (eq(/비만|대사|GLP/i)) return ko(`${s} — 비만·대사질환 치료`, `${s} — obesity and metabolic therapeutics`);
      if (eq(/세포|유전|CAR/i)) return ko(`${s} — 세포·유전자치료`, `${s} — cell and gene therapy`);
      if (eq(/IVD|진단|체외/i)) return ko(`${s} — 체외진단·진단키트`, `${s} — in-vitro diagnostics`);
      if (eq(/의료기기|디지털|헬스|임플란트/i)) return ko(`${s} — 의료기기·디지털헬스`, `${s} — medtech and digital health`);
      if (eq(/제약|신약|generic|제네릭|지주/i)) return ko(`${s} — 의약품·제약`, `${s} — pharmaceuticals`);
      return ko(`${s} — 바이오·헬스케어`, englishOnlyFallback('bio'));

    default:
      return ko(`${s} 관련 제품·서비스`, englishOnlyFallback(industryKey));
  }
}

/**
 * @param {object} c company record
 * @param {string} industryKey semi|ship|...
 * @param {Map<string,{subSector:string}>|null} cpMap
 * @param {object} overrides
 */
export function enrichCompanyFields(c, industryKey, cpMap, overrides) {
  const cp = cpMap?.get(c.ticker);
  const sub = cp?.subSector?.trim() || '';
  const ov = pickOverride(overrides, c.ticker, industryKey);

  if (EMPTY(c.semType)) {
    c.semType = ov?.semType || sub || c.chain || '—';
  }
  if (EMPTY(c.semTypeEn)) {
    c.semTypeEn = ov?.semTypeEn || (HANGUL.test(c.semType || '') ? '—' : c.semType);
  } else if (HANGUL.test(c.semTypeEn)) {
    c.semTypeEn = ov?.semTypeEn || '—';
  }

  if (EMPTY(c.products)) {
    if (ov?.products) {
      c.products = ov.products;
      c.productsEn = ov.productsEn || ov.products;
    } else {
      const gen = productsFromSubSector(industryKey, sub || c.semType, c.chain, c.name);
      if (gen) {
        c.products = gen.ko;
        c.productsEn = gen.en;
      } else if (!EMPTY(c.semType) && c.semType !== '—') {
        const gen2 = productsFromSubSector(industryKey, c.semType, c.chain, c.name);
        if (gen2) {
          c.products = gen2.ko;
          c.productsEn = gen2.en;
        }
      }
    }
  }
  if (EMPTY(c.productsEn) && !EMPTY(c.products)) {
    c.productsEn = ov?.productsEn || (HANGUL.test(c.products) ? englishOnlyFallback(industryKey) : c.products);
  } else if (!EMPTY(c.productsEn) && HANGUL.test(c.productsEn) && !ov?.productsEn) {
    c.productsEn = englishOnlyFallback(industryKey);
  }

  return c;
}

export function enrichCompanyList(companies, industryKey, cpListDir) {
  const universe = loadCpListUniverse(cpListDir);
  const cpMap = universe.get(industryKey) || new Map();
  const overrides = loadOverrides();
  let filled = 0;
  for (const c of companies) {
    const before = EMPTY(c.semType) || EMPTY(c.products);
    enrichCompanyFields(c, industryKey, cpMap, overrides);
    if (before && (!EMPTY(c.semType) && !EMPTY(c.products))) filled++;
  }
  return { filled, total: companies.length };
}

export function enrichBioCompanies(companies, cpListDir) {
  const universe = loadCpListUniverse(cpListDir);
  const cpMap = universe.get('bio') || new Map();
  const overrides = loadOverrides();
  let filled = 0;
  for (const c of companies) {
    const before = EMPTY(c.semType) || EMPTY(c.products);
    enrichCompanyFields(c, 'bio', cpMap, overrides);
    if (before && (!EMPTY(c.semType) && !EMPTY(c.products))) filled++;
  }
  return { filled, total: companies.length };
}

/** Crawlable industry copy per sector — ko/en. Body paragraphs come from lib/sector_editorial.mjs. */
import { editorialParagraphsForGeo } from './sector_editorial.mjs';

function withEditorial(geoKey, meta) {
  const paras = editorialParagraphsForGeo(geoKey);
  if (!paras) {
    throw new Error(`Missing SECTOR_EDITORIAL for geoKey=${geoKey}`);
  }
  return { ...meta, ...paras };
}

export const SEO_SECTOR_COPY = {
  semiconductor: withEditorial('semiconductor', {
    titleKo: '반도체 밸류체인과 코스피·코스닥 반도체 관련주',
    titleEn: 'Korean semiconductor value chain & listed stocks',
    keywordsKo: '반도체 관련주, 반도체 밸류체인, 코스피 반도체, 코스닥 반도체, HBM, 파운드리',
    keywordsEn: 'Korean semiconductor stocks, Korea semiconductor value chain, KOSPI semiconductors',
  }),
  energy: withEditorial('energy', {
    titleKo: '2차전지·ESS·태양광·풍력 밸류체인과 상장 종목',
    titleEn: 'Korean battery, ESS, solar & wind stocks',
    keywordsKo: '2차전지, ESS, 태양광, 풍력, 배터리 관련주',
    keywordsEn: 'Korean battery stocks, ESS, solar, wind',
  }),
  powergrid: withEditorial('powergrid', {
    titleKo: '전력설비·송배전·발전설비 밸류체인과 상장 종목',
    titleEn: 'Korean power equipment & grid stocks',
    keywordsKo: '전력설비, 송배전, 변압기, 원전 기자재',
    keywordsEn: 'Korean power equipment, T&D, transformers',
  }),
  ship: withEditorial('ship', {
    titleKo: '조선·조선기자재·해운 밸류체인과 상장 종목',
    titleEn: 'Korean shipbuilding & marine equipment stocks',
    keywordsKo: '조선 관련주, 조선기자재, LNG선, 해운',
    keywordsEn: 'Korean shipbuilding stocks, marine equipment, LNG carriers',
  }),
  defense: withEditorial('defense', {
    titleKo: '방산·항공·우주 밸류체인과 코스피 방산주',
    titleEn: 'Korean defense, aerospace & space stocks',
    keywordsKo: '방산주, 항공우주, 미사일, 함정',
    keywordsEn: 'Korean defense stocks, aerospace, missiles',
  }),
  kconsume: withEditorial('kconsume', {
    titleKo: 'K-소비/유통 상장 종목 지도',
    titleEn: 'K-consume, beauty, fashion & retail stocks',
    keywordsKo: 'K-소비, 화장품, 패션, 식품, 유통',
    keywordsEn: 'K-consume, beauty, fashion, retail stocks',
  }),
  kcontent: withEditorial('kcontent', {
    titleKo: 'K-콘텐츠 상장 종목 지도',
    titleEn: 'K-content, games, media & K-pop stocks',
    keywordsKo: 'K-콘텐츠, 게임, 웹툰, K-pop, 엔터',
    keywordsEn: 'K-content, games, webtoon, K-pop stocks',
  }),
  bio: withEditorial('bio', {
    titleKo: '바이오·제약 밸류체인과 코스닥·코스피 바이오주',
    titleEn: 'Korean biotech & pharma listed stocks',
    keywordsKo: '바이오 관련주, CDMO, 바이오시밀러, 신약',
    keywordsEn: 'Korean biotech stocks, CDMO, biosimilars',
  }),
  robot: withEditorial('robot', {
    titleKo: '로봇·피지컬AI·공장자동화 상장 종목',
    titleEn: 'Korean robotics & physical AI stocks',
    keywordsKo: '로봇 관련주, 피지컬AI, AMR, 협동로봇',
    keywordsEn: 'Korean robotics stocks, Physical AI, AMR, cobots',
  }),
  finance: withEditorial('finance', {
    titleKo: '은행·증권·보험·카드 등 금융 상장 종목',
    titleEn: 'Korean listed financials — banks, securities & insurance',
    keywordsKo: '금융주, 은행, 증권, 보험, 카드',
    keywordsEn: 'Korean financial stocks, banks, securities, insurance',
  }),
  construction: withEditorial('construction', {
    titleKo: '종합건설·주택·건설기계 등 건설 상장 종목',
    titleEn: 'Korean construction sector stocks',
    keywordsKo: '건설주, 종합건설, 주택, 건설기계',
    keywordsEn: 'Korean construction stocks, contractors, housing',
  }),
};

export const SECTOR_ROUTES = [
  { id: 'semi', geoKey: 'semiconductor', file: 'semiconductor/korea_semiconductor_map.html', labelKo: '한국 반도체 산업 투자 지도', labelEn: 'Korea Semiconductor Investment Map' },
  { id: 'energy', geoKey: 'energy', file: 'energy/korea_energy_map.html', labelKo: '한국 에너지 투자 지도', labelEn: 'Korea Energy Sector Stocks Map' },
  { id: 'powergrid', geoKey: 'powergrid', file: 'powergrid/korea_powergrid_map.html', labelKo: '한국 전력설비 투자 지도', labelEn: 'Korea Power Equipment Map' },
  { id: 'ship', geoKey: 'ship', file: 'ship/korea_ship_map.html', labelKo: '한국 조선·조선기자재 산업 투자 지도', labelEn: 'Korea Shipbuilding & Marine Equipment Map' },
  { id: 'defense', geoKey: 'defense', file: 'defense/korea_defense_map.html', labelKo: '한국 방산·우주·항공 산업 투자 지도', labelEn: 'Korea Defense, Space & Aviation Map' },
  { id: 'kconsume', geoKey: 'kconsume', file: 'kconsume/korea_kconsume_map.html', labelKo: '한국 K-소비/유통 투자 지도', labelEn: 'Korea K-Consume / Retail Map' },
  { id: 'kcontent', geoKey: 'kcontent', file: 'kcontent/korea_kcontent_map.html', labelKo: '한국 K-콘텐츠 투자 지도', labelEn: 'Korea K-Content Industry Map' },
  { id: 'bio', geoKey: 'bio', file: 'bio/korea_bio_map.html', labelKo: '한국 바이오 산업 투자 지도', labelEn: 'Korea Bio Industry Investment Map' },
  { id: 'robot', geoKey: 'robot', file: 'robot/korea_robot_map.html', labelKo: '한국 로봇/피지컬AI 산업 투자 지도', labelEn: 'Korea Robot / Physical AI Industry Map' },
  { id: 'finance', geoKey: 'finance', file: 'finance/korea_finance_map.html', labelKo: '한국 금융 투자 지도', labelEn: 'Korea Listed Financials Map' },
  { id: 'construction', geoKey: 'construction', file: 'construction/korea_construction_map.html', labelKo: '한국 건설 투자 지도', labelEn: 'Korea Construction Sector Map' },
];

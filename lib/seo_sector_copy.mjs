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
  bigchip: withEditorial('bigchip', {
    titleKo: '삼성전자·SK하이닉스 반도체 대형주 비교',
    titleEn: 'Korea chip leaders — Samsung Electronics & SK hynix',
    keywordsKo: '반도체 대형주, 삼성전자, SK하이닉스, HBM, 메모리 반도체',
    keywordsEn: 'Korea chip leaders, Samsung Electronics, SK hynix, HBM, memory stocks',
  }),
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
  battery: withEditorial('battery', {
    titleKo: '2차전지·배터리 밸류체인과 상장 종목',
    titleEn: 'Korean battery value chain & listed stocks',
    keywordsKo: '2차전지, 배터리, ESS, 양극재, 음극재, 전해질, 배터리 장비',
    keywordsEn: 'Korean battery stocks, ESS, cathode, anode, electrolyte, battery equipment',
  }),
  renewable: withEditorial('renewable', {
    titleKo: '신재생에너지 밸류체인과 상장 종목',
    titleEn: 'Korean renewable-energy listed stocks',
    keywordsKo: '신재생에너지, 태양광, 풍력, 수소, 재생에너지 관련주',
    keywordsEn: 'Korean renewable stocks, solar, wind, hydrogen',
  }),
  nuclear: withEditorial('nuclear', {
    titleKo: '원전·SMR 밸류체인과 상장 종목',
    titleEn: 'Korean nuclear and SMR listed stocks',
    keywordsKo: '원전, SMR, 원자로, 원전 기자재, 원전 정비',
    keywordsEn: 'Korean nuclear stocks, SMR, reactors, nuclear components, O&M',
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
    titleEn: 'K-consume fashion, food & retail stocks',
    keywordsKo: 'K-소비, 패션, 식품, 유통, 여행',
    keywordsEn: 'K-consume, fashion, food, retail stocks',
  }),
  cosmetics: withEditorial('cosmetics', {
    titleKo: '화장품/미용기기 브랜드·ODM·미용기기·유통 밸류체인과 상장 종목',
    titleEn: 'Korean cosmetics & aesthetic devices — brands, ODM & channels',
    keywordsKo: '화장품, 미용기기, K-뷰티, ODM, 클래시스, 아모레퍼시픽',
    keywordsEn: 'Korean cosmetics, aesthetic devices, K-beauty, ODM, Classys, Amorepacific',
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
  auto: withEditorial('auto', {
    titleKo: '완성차·부품·타이어·전장 등 자동차 상장 종목',
    titleEn: 'Korean auto OEMs, parts, tires & electronics',
    keywordsKo: '자동차 관련주, 완성차, 부품, 타이어, 전장, ADAS',
    keywordsEn: 'Korean auto stocks, OEM, parts, tires, ADAS',
  }),
  medtech: withEditorial('medtech', {
    titleKo: '의료기기/헬스케어 진단·임플란트·장비 상장 종목',
    titleEn: 'Korean medtech/healthcare — diagnostics, implants & equipment',
    keywordsKo: '의료기기, 헬스케어, 진단, IVD, 임플란트',
    keywordsEn: 'Korean medtech, healthcare, diagnostics, implants, medical equipment',
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
  software: withEditorial('software', {
    titleKo: 'IT·소프트웨어 플랫폼·클라우드·SaaS·보안 상장 종목',
    titleEn: 'Korean IT & software stocks — platforms, cloud, SaaS & security',
    keywordsKo: 'IT 소프트웨어 관련주, AI 플랫폼, 클라우드, SaaS, 보안',
    keywordsEn: 'Korean software stocks, AI platforms, cloud, SaaS, cybersecurity',
  }),
  holdings: withEditorial('holdings', {
    titleKo: '국내 상장 지주회사와 그룹 포트폴리오',
    titleEn: 'Korean listed holding companies',
    keywordsKo: '지주회사, 사업지주, 순수지주, 지주사 할인, 그룹주',
    keywordsEn: 'Korean holding companies, operating holdings, holding company discount',
  }),
  telecom: withEditorial('telecom', {
    titleKo: '통신서비스·무선장비·광통신·위성통신 상장 종목',
    titleEn: 'Korean telecom services and equipment stocks',
    keywordsKo: '통신 관련주, 5G, 광통신, 무선장비, 위성통신',
    keywordsEn: 'Korean telecom stocks, 5G, optical networking, wireless, satellite communications',
  }),
};

export const SECTOR_ROUTES = [
  { id: 'bigchip', geoKey: 'bigchip', file: 'bigchip/korea_bigchip_map.html', labelKo: '한국 반도체 대형주 투자 지도', labelEn: 'Korea Chip Leaders Map' },
  { id: 'semi', geoKey: 'semiconductor', file: 'semiconductor/korea_semiconductor_map.html', labelKo: '한국 반도체 산업 투자 지도', labelEn: 'Korea Semiconductor Investment Map' },
  { id: 'battery', geoKey: 'battery', file: 'battery/korea_battery_map.html', labelKo: '한국 2차전지·배터리 투자 지도', labelEn: 'Korea Battery Value Chain Map' },
  { id: 'renewable', geoKey: 'renewable', file: 'renewable/korea_renewable_map.html', labelKo: '한국 신재생에너지 투자 지도', labelEn: 'Korea Renewable Energy Map' },
  { id: 'nuclear', geoKey: 'nuclear', file: 'nuclear/korea_nuclear_map.html', labelKo: '한국 원전 투자 지도', labelEn: 'Korea Nuclear Power Map' },
  { id: 'powergrid', geoKey: 'powergrid', file: 'powergrid/korea_powergrid_map.html', labelKo: '한국 전력설비 투자 지도', labelEn: 'Korea Power Equipment Map' },
  { id: 'ship', geoKey: 'ship', file: 'ship/korea_ship_map.html', labelKo: '한국 조선·조선기자재 산업 투자 지도', labelEn: 'Korea Shipbuilding & Marine Equipment Map' },
  { id: 'defense', geoKey: 'defense', file: 'defense/korea_defense_map.html', labelKo: '한국 방산·우주·항공 산업 투자 지도', labelEn: 'Korea Defense, Space & Aviation Map' },
  { id: 'kconsume', geoKey: 'kconsume', file: 'kconsume/korea_kconsume_map.html', labelKo: '한국 K-소비/유통 투자 지도', labelEn: 'Korea K-Consume / Retail Map' },
  { id: 'cosmetics', geoKey: 'cosmetics', file: 'cosmetics/korea_cosmetics_map.html', labelKo: '한국 화장품/미용기기 투자 지도', labelEn: 'Korea Cosmetics / Aesthetic Devices Map' },
  { id: 'kcontent', geoKey: 'kcontent', file: 'kcontent/korea_kcontent_map.html', labelKo: '한국 K-콘텐츠 투자 지도', labelEn: 'Korea K-Content Industry Map' },
  { id: 'bio', geoKey: 'bio', file: 'bio/korea_bio_map.html', labelKo: '한국 바이오 산업 투자 지도', labelEn: 'Korea Bio Industry Investment Map' },
  { id: 'robot', geoKey: 'robot', file: 'robot/korea_robot_map.html', labelKo: '한국 로봇/피지컬AI 산업 투자 지도', labelEn: 'Korea Robot / Physical AI Industry Map' },
  { id: 'auto', geoKey: 'auto', file: 'auto/korea_auto_map.html', labelKo: '한국 자동차 투자 지도', labelEn: 'Korea Auto Industry Map' },
  { id: 'medtech', geoKey: 'medtech', file: 'medtech/korea_medtech_map.html', labelKo: '한국 의료기기/헬스케어 투자 지도', labelEn: 'Korea MedTech / Healthcare Map' },
  { id: 'finance', geoKey: 'finance', file: 'finance/korea_finance_map.html', labelKo: '한국 금융 투자 지도', labelEn: 'Korea Listed Financials Map' },
  { id: 'construction', geoKey: 'construction', file: 'construction/korea_construction_map.html', labelKo: '한국 건설 투자 지도', labelEn: 'Korea Construction Sector Map' },
  { id: 'software', geoKey: 'software', file: 'software/korea_software_map.html', labelKo: '한국 IT·소프트웨어 투자 지도', labelEn: 'Korea IT & Software Map' },
  { id: 'holdings', geoKey: 'holdings', file: 'holdings/korea_holdings_map.html', labelKo: '한국 지주회사 투자 지도', labelEn: 'Korea Holdings Map' },
  { id: 'telecom', geoKey: 'telecom', file: 'telecom/korea_telecom_map.html', labelKo: '한국 통신 투자 지도', labelEn: 'Korea Telecom Map' },
];

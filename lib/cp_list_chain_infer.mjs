/** Maps cp_list sub_sector text → map chain labels per industry. */

const RULES = {
  semi: [
    [/삼성전자|SK하이닉스|메모리|HBM|IDM/i, 'IDM'],
    [/파운드리|파운드/i, '파운드리'],
    [/팹리스|디자인|IP\b|ASIC|MCU|SSD|컨트롤러/i, '팹리스'],
    [/패키징|OSAT|테스트|리드프레임|패키지|프로브/i, '패키징/테스트'],
    [/PCB|기판|FPCB|FC-BGA|심텍/i, '부품/기판'],
    [/전구체|케미칼|가스|소재|PR\b|식각|세정|머티리얼/i, '소재'],
    [/전공정/i, '전공정'],
    [/후공정/i, '후공정'],
    [/장비|핸들러|검사|증착|어닐링|스크러버|펌프|레이저|계측|클린룸|UV|코팅/i, '장비'],
  ],
  ship: [
    [/종합조선|조선소|yard|중공업|오션/i, '종합조선'],
    [/조선기자재|엔진|밸브|펌프|도장|전장|선박기자재/i, '조선기자재'],
    [/해양플랜트|FPSO|해양|플랜트|시추/i, '해양플랜트'],
    [/해운|물류|컨테이너선|선박/i, '해운물류'],
    [/방산|함정|군함|해군/i, '방산해양'],
    [/철강|소재|강판/i, '철강소재'],
  ],
  defense: [
    [/항공|엔진|MRO|민항|항공기/i, '항공기·엔진·MRO'],
    [/미사일|레이더|C4ISR|전자전|감시/i, '미사일·레이더·C4ISR'],
    [/육상|차량|탄약|포|장갑/i, '육상무기·차량·탄약'],
    [/함정|해군|조선방산|잠수함/i, '해군·함정·조선방산'],
    [/우주|위성|발사체|로켓/i, '우주·위성·민항'],
  ],
  robot: [
    [/휴머노이드|휴먼oid|이족|모바일/i, '휴머노이드·모바일'],
    [/협동|코봇|cobot|업무용/i, '협동·업무용로봇'],
    [/물류|AMR|AGV|무인|드론/i, '물류·무인주행'],
    [/센서|비전|정밀|모션|감속기|베어링/i, '정밀·센서·비전'],
    [/물리AI|AI|지능|제어|소프트웨어/i, '지능제어·물리AI'],
    [/자동화|FA|장비|로봇/i, '산업자동화·장비'],
  ],
  energy: [
    [/ESS|배터리|2차전지|양극|음극|전해질|리튬|셀|분리막/i, '2차전지'],
    [/계통|grid ESS|피크저감|에너지저장/i, 'ESS'],
    [/팩|pack|BMS/i, '배터리'],
    [/태양|솔라|solar|모듈|폴리실리콘/i, '태양광'],
    [/풍력|풍|wind|타워/i, '풍력'],
    [/연료전지|수소/i, 'ESS'],
  ],
  powergrid: [
    [/송배전|송전|배전|케이블|전선|전력망|LNG|가스공사|한전|전력/i, '송배전'],
    [/발전|원자|원전|터빈|EPC|O&M|가스터빈/i, '발전설비'],
    [/변압|개폐|스위치|전력기기|HVDC|STATCOM/i, '전력설비'],
  ],
  kculture: [
    [/라면|식품|음식|F&B|농심|오뚜기|제과/i, '음식·라면·식품'],
    [/여행|항공|레저|호텔|카지노|면세/i, '여행·레저·항공'],
    [/화장품|뷰티|코스메틱|스킨/i, '화장품·뷰티케어'],
    [/게임|Game/i, '게임'],
    [/패션|의류|apparel|fashion/i, '패션'],
    [/유통|백화점|마트|편의점|리테일|department|hypermarket/i, '쇼핑/유통'],
    [/드라마|미디어|웹툰|컨텐츠|콘텐츠|OTT|영화|스트리밍/i, '드라마·미디어·웹툰·컨텐츠'],
    [/K-pop|K팝|엔터|아이돌|레이블|공연/i, 'K-pop·엔터테인먼트'],
  ],
  finance: [
    [/은행|금융지주|bank|holding/i, '은행·금융지주'],
    [/증권|자산운용|브로커|WM|IB|brokerage|securities/i, '증권·자산운용'],
    [/보험|생명|손해|화재|insurance|life|P&C/i, '보험'],
    [/카드|캐피탈|할부|리스|card|capital|lease/i, '카드·캐피탈'],
    [/금융|finance/i, '기타금융'],
  ],
  bio: [
    [/CDMO|CMO|위탁/i, 'CDMO / CMO'],
    [/시밀러|바이오시밀러/i, '바이오시밀러'],
    [/ADC|항체/i, '항체신약 / ADC'],
    [/면역/i, '면역항암제'],
    [/비만|대사|GLP/i, '비만 / 대사질환'],
    [/세포|유전|CAR/i, '세포 · 유전자치료제'],
    [/플랫폼|RNA|mRNA/i, '플랫폼 기술'],
    [/IVD|진단|체외/i, '체외진단 (IVD)'],
    [/의료기기|디지털|헬스/i, '의료기기 / 디지털헬스'],
    [/제약|신약|generic|제네릭/i, '합성신약 / 제네릭'],
  ],
};

const DEFAULTS = {
  semi: '장비',
  ship: '조선기자재',
  defense: '육상무기·차량·탄약',
  robot: '산업자동화·장비',
  energy: '2차전지',
  powergrid: '전력설비',
  finance: '기타금융',
  kculture: '드라마·미디어·웹툰·컨텐츠',
  bio: '합성신약 / 제네릭',
};

const BIO_SECTOR_ID = {
  '바이오시밀러': 'biosimilar',
  'CDMO / CMO': 'cdmo',
  '항체신약 / ADC': 'antibody_adc',
  '면역항암제': 'immuno_onc',
  '비만 / 대사질환': 'obesity',
  '세포 · 유전자치료제': 'cell_gene',
  '플랫폼 기술': 'platform',
  '합성신약 / 제네릭': 'smallmol',
  '체외진단 (IVD)': 'diagnostics',
  '의료기기 / 디지털헬스': 'medtech',
};

export function inferChain(subSector, industryKey, availableChains) {
  const text = String(subSector || '');
  const rules = RULES[industryKey] || [];
  for (const [re, chain] of rules) {
    if (re.test(text) && (!availableChains.length || availableChains.includes(chain))) {
      return chain;
    }
  }
  const def = DEFAULTS[industryKey];
  if (def && (!availableChains.length || availableChains.includes(def))) return def;
  return availableChains[0] || def || '—';
}

export function bioSectorIdForChain(chain) {
  return BIO_SECTOR_ID[chain] || 'smallmol';
}

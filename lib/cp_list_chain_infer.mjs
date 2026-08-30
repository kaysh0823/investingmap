/** Maps cp_list sub_sector text → map chain labels per industry. */

const RULES = {
  // 순서 주의: '메모리 검사장비', '반도체 유통·메모리', '메모리 모듈 PCB'처럼
  // 상위 키워드가 섞인 표기가 넓은 메모리 규칙으로 흡수되지 않도록 좁은 규칙을 먼저 둔다.
  semi: [
    [/유통|리퍼비시|리퍼|대리점|딜러/i, '반도체 유통'],
    [/후공정[^,]*장비|패키징\s*장비|본딩\s*장비|본더|Bonder|핸들러|테스터|검사\s*장비|검사장비|번인|다이싱|쏘잉|레이저\s*장비/i, '후공정 장비'],
    [/전공정|증착|식각\s*장비|세정[^,]*장비|노광|ALD|CVD|어닐링|스크러버|계측|오버레이|진공펌프|클린룸|공조|리플로우|CCSS|유틸리티|칠러|온습도|모니터링|혼합공급|이송|자동화/i, '전공정 장비'],
    [/PCB|기판|FPCB|FC-BGA|모듈|센서|심텍/i, '부품/기판'],
    [/패키징|OSAT|팬아웃|범핑|리드프레임|프로브|소켓|테스트|패키지/i, '패키징/테스트'],
    [/전구체|케미칼|가스|소재|포토레지스트|PR\b|머티리얼|웨이퍼|블랭크마스크|세라믹|실리콘|\bSiC\b|와이어|공정\s*부품|전자재료|식각|세정|코팅/i, '소재'],
    [/파운드리|파운드/i, '파운드리'],
    [/디자인\s*하우스|Design\s*House|\bDSP\b|턴키\s*설계|설계\s*구현/i, '디자인하우스'],
    [/팹리스|IP\b|ASIC|MCU|SSD|컨트롤러|설계|비메모리|시스템반도체/i, '팹리스'],
    [/IDM|종합반도체|메모리\s*[·,]\s*(?:파운드리|HBM)|HBM\s*[·,]\s*메모리|삼성전자|SK하이닉스/i, '파운드리'],
    [/메모리|HBM|DRAM|NAND/i, '팹리스'],
    [/후공정/i, '후공정 장비'],
    [/장비|펌프|UV/i, '전공정 장비'],
  ],
  ship: [
    [/종합조선|조선소|yard|중공업|오션/i, '종합조선'],
    [/엔진|추진|실린더라이너|발전기/i, '엔진'],
    [/의장|배관|피팅|밸브|관이음|튜브|평형수|계측/i, '의장/배관'],
    [/A\/S|MRO|개조|해양플랜트|FPSO|해상풍력|플랜트|시추|HRSG/i, '서비스·해양플랜트'],
    [/조선기자재|선박기자재|보냉|선박\s*블록|단조|플랜지|선체|구조재|펌프|도장|전장/i, '선체·보냉·구조재'],
    [/해운|물류|컨테이너선|선박/i, '해운물류'],
  ],
  defense: [
    [/항공|엔진|MRO|민항|항공기/i, '항공기·엔진·MRO'],
    [/미사일|레이더|C4ISR|전자전|감시/i, '미사일·레이더·C4ISR'],
    [/육상|차량|탄약|포|장갑/i, '육상무기·차량·탄약'],
    [/함정|해군|조선방산|잠수함/i, '해군·함정·조선방산'],
    [/우주|위성|발사체|로켓/i, '우주·위성·민항'],
  ],
  robot: [
    [/휴머노이드|협동|코봇|cobot|완성로봇|매니퓰레이터|모바일 로봇|서비스 로봇/i, '완성로봇·플랫폼'],
    [/액추에이터|서보모터|스마트 액추에이터|DYNAMIXEL|모터/i, '액추에이터·모터'],
    [/감속기|하모닉|RV|동력전달|기어드/i, '감속기·동력전달'],
    [/센서|비전|정밀부품|다이캐스팅|AOI/i, '센서·비전·정밀부품'],
    [/관제|모션|제어|로봇SW|소프트웨어|물리AI/i, '제어·모션·로봇SW'],
    [/자동화|SI|물류|AMR|AGV|FA|무인/i, '자동화·SI·물류시스템'],
    [/로봇/i, '완성로봇·플랫폼'],
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
    [/해저케이블[^,]*(?:시공|유지보수)|케이블[^,]*(?:시공|유지보수)/i, '송배전'],
    [/케이블|전선/i, '전선·케이블'],
    [/송배전|송전|배전|전력망|LNG|가스공사|한전/i, '송배전'],
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
  kconsume: [
    [/라면|식품|음식|F&B|농심|오뚜기|제과/i, '라면·식품'],
    [/여행|항공|레저|호텔|카지노|면세/i, '여행·항공'],
    [/화장품|뷰티|코스메틱|스킨/i, '뷰티'],
    [/패션|의류|apparel|fashion/i, '패션'],
    [/유통|백화점|마트|편의점|리테일|department|hypermarket|쇼핑/i, '쇼핑·유통'],
  ],
  kcontent: [
    [/게임|Game/i, '게임'],
    [/드라마|미디어|웹툰|컨텐츠|콘텐츠|OTT|영화|스트리밍/i, '드라마·웹툰'],
    [/K-pop|K팝|엔터|아이돌|레이블|공연/i, 'K-pop'],
  ],
  finance: [
    [/은행|금융지주|bank|holding/i, '은행·금융지주'],
    [/증권|자산운용|브로커|WM|IB|brokerage|securities/i, '증권·자산운용'],
    [/보험|생명|손해|화재|insurance|life|P&C/i, '보험'],
    [/카드|캐피탈|할부|리스|card|capital|lease/i, '카드·캐피탈'],
    [/금융|finance/i, '기타금융'],
  ],
  construction: [
    [/건설기계|굴착|휠로더|equipment|excavator/i, '건설기계'],
    [/주택|디벨로퍼|산업개발|아파트|재건축|housing|developer/i, '주택·디벨로퍼'],
    [/자산신탁|부동산신탁|토지신탁|asset trust|real estate trust/i, '부동산신탁'],
    [/시멘트|cement|레미콘/i, '시멘트'],
    [/유리|판유리|창호|바닥재|목질|건자재|도료|실리콘|인테리어|홈퍼니싱|glass|coating|flooring/i, '건자재'],
    [/플랜트|EPC|E&A|엔지니어링|plant engineering/i, '종합건설·EPC'],
    [/지주|holding/i, '지주·기타'],
    [/건설|이앤씨|시공|토목|contractor|construction/i, '종합건설'],
  ],
  auto: [
    [/완성차|OEM|현대차|기아|모빌리티/i, '완성차'],
    [/타이어|tire/i, '타이어'],
    [/전장|ADAS|카메라|오토에버|SW|전자/i, '전장·ADAS'],
    [/부품|모비스|만도|한온|위아|샤시|램프|프레스/i, '부품'],
  ],
  medtech: [
    [/진단|IVD|씨젠|루닛|인바디|영상|분자/i, '진단·IVD'],
    [/임플란트|치과|덴티/i, '임플란트·치과'],
    [/미용|에스테틱|HIFU|레이저|클래시스|원텍/i, '미용기기'],
    [/수술|로봇|내시경|의료장비|장비/i, '의료장비·수술'],
  ],

  bio: [
    [/CDMO|CMO|위탁/i, 'CDMO / CMO'],
    [/시밀러|바이오시밀러/i, '바이오시밀러'],
    [/ADC|항체/i, '항체신약 / ADC'],
    [/면역/i, '면역항암제'],
    [/비만|대사|GLP/i, '비만 / 대사질환'],
    [/세포|유전|CAR/i, '세포 · 유전자치료제'],
    [/플랫폼|RNA|mRNA/i, '플랫폼 기술'],
    [/제약|신약|generic|제네릭/i, '합성신약 / 제네릭'],
  ],
};

const DEFAULTS = {
  semi: '전공정 장비',
  ship: '선체·보냉·구조재',
  defense: '육상무기·차량·탄약',
  robot: '자동화·SI·물류시스템',
  energy: '2차전지',
  powergrid: '전력설비',
  finance: '기타금융',
  construction: '종합건설',
  auto: '부품',
  medtech: '진단·IVD',
  kculture: '드라마·미디어·웹툰·컨텐츠',
  kconsume: '뷰티',
  kcontent: '게임',
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

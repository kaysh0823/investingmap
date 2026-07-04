/** Crawlable industry copy (300–800+ chars) per sector — ko/en. */
export const SEO_SECTOR_COPY = {
  semiconductor: {
    titleKo: '반도체 밸류체인과 코스피·코스닥 반도체 관련주',
    titleEn: 'Korean semiconductor value chain & listed stocks',
    bodyKo:
      '본 페이지는 KOSPI·KOSDAQ 상장 반도체 관련주를 설계·팹리스·파운드리·메모리(IDM)·소재·장비·기판·패키징·테스트 등 밸류체인 축으로 분류한 투자 지도입니다. ' +
      '삼성전자, SK하이닉스를 비롯한 국내 반도체 종목의 KRX 시가총액·PER·PBR과 52주 주가 위치를 표에서 확인하고, NVIDIA·Apple·TSMC 등 글로벌 거래처·동종 peer 관계를 참고용 그래프로 연결했습니다. ' +
      '반도체 밸류체인을 한눈에 비교하려는 국내외 투자자를 위해 정리했으며, 시총 3천억원 이상 편집 분류 종목만 포함합니다. 아래 표의 시세·시총은 빌드 시점 스냅샷이며, 영업일에는 실시간 갱신됩니다.',
    bodyEn:
      'This map classifies KOSPI and KOSDAQ semiconductor stocks across design, fabless, foundry, memory (IDM), materials, equipment, substrates, and packaging & test. ' +
      'Compare KRX market cap, PER, PBR, and 52-week price position for names including Samsung Electronics and SK hynix, with illustrative links to global customers and peers such as NVIDIA, Apple, and TSMC. ' +
      'Listed names meet a KRW 300 billion market-cap editorial floor. Quote and cap fields below are build-time snapshots; live values refresh on trading days.',
    keywordsKo: '반도체 관련주, 반도체 밸류체인, 코스피 반도체, 코스닥 반도체, HBM, 파운드리',
    keywordsEn: 'Korean semiconductor stocks, Korea semiconductor value chain, KOSPI semiconductors',
  },
  energy: {
    titleKo: '2차전지·ESS·태양광·풍력 밸류체인과 상장 종목',
    titleEn: 'Korean battery, ESS, solar & wind stocks',
    bodyKo:
      '2차전지·ESS·배터리·태양광·풍력 밸류체인에 속한 KOSPI·KOSDAQ 상장사를 정리합니다. ' +
      'LG에너지솔루션, 삼성SDI, 에코프로, 한화솔루션 등 셀·소재·모듈·풍력 타워 종목의 시가총액·PER·PBR과 밸류체인 태그를 표로 제공합니다. ' +
      '에너지 전환·원자재 가격 민감도가 큰 섹터이므로 공시·정책 변화를 함께 확인하시기 바랍니다.',
    bodyEn:
      'Covers KOSPI/KOSDAQ names across lithium-ion batteries, ESS, solar PV, and wind power. ' +
      'The table lists market cap, PER, PBR, and value-chain tags for cell, material, and module leaders including LG Energy Solution, Samsung SDI, and Hanwha Solutions. ' +
      'Energy-transition policy and commodity prices move quickly—cross-check filings and official data.',
  },
  powergrid: {
    titleKo: '전력설비·송배전·발전설비 밸류체인과 상장 종목',
    titleEn: 'Korean power equipment & grid stocks',
    bodyKo:
      '전력설비·송배전·발전설비 밸류체인에 속한 KOSPI·KOSDAQ 상장사를 정리합니다. ' +
      'HD현대일렉트릭, LS ELECTRIC, 두산에너빌리티, 한국전력 등 변압기·케이블·발전·원전 기자재 종목의 시가총액·PER·PBR과 밸류체인 태그를 표로 제공하고, Siemens Energy·GE Vernova 등 글로벌 참고 관계를 연결합니다.',
    bodyEn:
      'Covers listed names in power equipment, transmission & distribution, and generation OEM. ' +
      'Compare KRX metrics and value-chain tags for HD Hyundai Electric, LS Electric, Doosan Enerbility, and KEPCO, with illustrative global equipment links.',
  },
  ship: {
    titleKo: '조선·조선기자재·해운 밸류체인과 상장 종목',
    titleEn: 'Korean shipbuilding & marine equipment stocks',
    bodyKo:
      '조선소·엔진·철강·조선기자재·해양플랜트·해운·방산 해양 등 조선·해양 클러스터 상장사를 밸류체인별로 분류합니다. ' +
      'HD현대중공업, 한화오션, HMM 등 국내 조선·해운 관련주의 KRX 시가총액·PER·PBR과 수주·선종 민감 테마를 표와 관계 그래프로 제공합니다. ' +
      'Korean shipbuilding stocks와 marine equipment names를 LNG선·컨선 사이클 관점에서 비교하려는 투자자용 참고 자료이며, 수주 공시는 별도 확인이 필요합니다.',
    bodyEn:
      'Maps listed Korean yards, engines, steel, marine equipment, offshore, shipping, and naval-marine names by value chain. ' +
      'Compare KRX metrics and order-cycle themes for HD Hyundai Heavy Industries, Hanwha Ocean, HMM, and peers—useful for investors tracking Korean shipbuilding stocks and marine equipment suppliers. ' +
      'Verify latest order disclosures separately; graph links are illustrative.',
  },
  defense: {
    titleKo: '방산·항공·우주 밸류체인과 코스피 방산주',
    titleEn: 'Korean defense, aerospace & space stocks',
    bodyKo:
      '군용 항공기·엔진, 미사일·레이더·C4ISR, 육상무기·탄약, 해군·함정, 우주·위성·민항 등 방위·항공·우주 밸류체인에 속한 상장사를 정리합니다. ' +
      '한화에어로스페이스, LIG넥스원, 한국항공우주, 현대로템 등 Korean defense stocks의 시가총액·PER·PBR과 수출·프로그램 참고 관계를 제공합니다. ' +
      '방산주는 예산·수출 승인·지정학 이벤트에 민감하며, 본 페이지는 정보 제공 목적이며 투자 권유가 아닙니다.',
    bodyEn:
      'Organizes listed primes and suppliers across military aviation, missiles and C4ISR, land systems, naval shipbuilding, space, satellites, and civil aviation. ' +
      'Korean defense stocks such as Hanwha Aerospace, LIG Nex1, KAI, and Hyundai Rotem appear with KRX market cap, PER, PBR, and illustrative export-program links. ' +
      'Defense names are volatile around budgets and geopolitics; informational only, not investment advice.',
  },
  kculture: {
    titleKo: 'K컬처·식품·뷰티·미디어 상장 종목 지도',
    titleEn: 'K-culture, food, beauty & media stocks',
    bodyKo:
      '라면·가공식품, 여행·항공·레저, 화장품·뷰티, 드라마·웹툰·스트리밍 IP, K-pop 레이블 등 K컬처 수출 테마별 KOSPI·KOSDAQ 상장사를 키워드 중심으로 분류합니다. ' +
      '삼양식품, 하이브, NAVER, 아모레퍼시픽 등 K-culture stocks의 시가총액·PER·PBR과 글로벌 수출·플랫폼 연계 예시를 표와 그래프로 제공합니다. ' +
      '불닭볶음면, BTS, K드라마 등 검색 수요와 연결된 국내 상장주를 탐색하는 출발점으로 활용할 수 있습니다.',
    bodyEn:
      'Groups listed names by K-culture export themes—ramen and food, travel and airlines, beauty, drama and webtoon IP, streaming, and K-pop labels. ' +
      'Explore K-culture stocks including Samyang Foods, HYBE, NAVER, and Amorepacific with KRX metrics and illustrative global demand links tied to keywords like Buldak ramen, BTS, and K-drama.',
  },
  bio: {
    titleKo: '바이오·제약 밸류체인과 코스닥·코스피 바이오주',
    titleEn: 'Korean biotech & pharma listed stocks',
    bodyKo:
      '신약·CDMO·바이오시밀러·의료기기·진단(IVD) 등 섹터별 국내 상장 바이오·제약사를 분류합니다. ' +
      '삼성바이오로직스, 셀트리온, 알테오젠 등 바이오 관련주의 KRX 시가총액·PER·PBR과 글로벌 빅파마·기술이전 페어링 참고 관계를 한 페이지에서 비교할 수 있습니다. ' +
      '임상 단계·파이프라인은 공시 기준으로 최신 정보를 확인하시고, 그래프 연결은 편집 분류용 참고 네트워크입니다.',
    bodyEn:
      'Classifies listed Korean bio and pharma names by novel drugs, CDMO, biosimilars, devices, and diagnostics (IVD). ' +
      'Compare KRX metrics and illustrative big-pharma pairing links for Samsung Biologics, Celltrion, Alteogen, and other Korean biotech stocks. ' +
      'Confirm clinical stages in filings; graph edges are editorial reference networks.',
  },
  robot: {
    titleKo: '로봇·피지컬AI·공장자동화 상장 종목',
    titleEn: 'Korean robotics & physical AI stocks',
    bodyKo:
      '공장자동화(FA)·물류 AMR·협동로봇·감속기·서보·비전·센싱·피지컬AI 소프트웨어 등 로봇·자동화 생태계 상장사를 밸류체인별로 정리합니다. ' +
      '레인보우로보틱스, 두산로보틱스, 현대모비스 등 로봇 관련주와 physical AI 테마 종목의 시가총액·PER·PBR, 글로벌 장비·SI 참고 관계를 제공합니다. ' +
      '설비투자 사이클·제조업 PMI와 연동되는 섹터로, 표 데이터는 빌드 스냅샷이며 영업일 시세는 갱신됩니다.',
    bodyEn:
      'Maps listed names in factory automation, logistics AMRs, cobots, motion control, sensing, and physical-AI software. ' +
      'Compare KRX data and illustrative global equipment links for Rainbow Robotics, Doosan Robotics, Hyundai Mobis, and other Korean robotics stocks. ' +
      'The sector tracks capex cycles; table quotes are build snapshots refreshed on trading days.',
  },
  finance: {
    titleKo: '은행·증권·보험·카드 등 금융 상장 종목',
    titleEn: 'Korean banks, securities, insurance & cards',
    bodyKo:
      '은행·금융지주, 증권·자산운용, 생명·손해보험, 카드·캐피탈 등 국내 상장 금융사를 밸류체인별로 정리합니다. ' +
      'KB금융, 신한지주, 삼성생명, 미래에셋증권 등 Korean financial stocks의 KRX 시가총액·PER·PBR과 글로벌 peer 참고 관계를 제공합니다. ' +
      '금리·규제·신용 사이클에 민감한 섹터이며, 본 페이지는 정보 제공 목적이며 투자 권유가 아닙니다.',
    bodyEn:
      'Maps listed Korean banks and holdings, securities and asset managers, life and P&C insurers, and card/capital names. ' +
      'Compare KRX metrics and illustrative global peer links for KB Financial, Shinhan, Samsung Life, Mirae Asset Securities, and other Korean financial stocks. ' +
      'Rates, regulation, and credit cycles drive the sector; informational only, not investment advice.',
  },
  construction: {
    titleKo: '종합건설·주택·건설기계 등 건설 상장 종목',
    titleEn: 'Korean contractors, housing & construction equipment',
    bodyKo:
      '종합건설, 주택·디벨로퍼, 건설기계, 건설 지주 등 국내 상장 건설사를 밸류체인별로 정리합니다. ' +
      '삼성물산, 현대건설, 대우건설, DL이앤씨, GS건설 등 Korean construction stocks의 KRX 시가총액·PER·PBR과 글로벌 EPC·장비 peer 참고 관계를 제공합니다. ' +
      '수주·분양·원자재·금리에 민감한 섹터이며, 본 페이지는 정보 제공 목적이며 투자 권유가 아닙니다.',
    bodyEn:
      'Maps listed Korean general contractors, housing developers, construction equipment makers, and related holdings. ' +
      'Compare KRX metrics and illustrative global EPC and equipment peer links for Samsung C&T, Hyundai E&C, Daewoo E&C, DL E&C, GS E&C, and peers. ' +
      'Orders, housing sales, materials, and rates drive the sector; informational only, not investment advice.',
  },
};

export const SECTOR_ROUTES = [
  { id: 'semi', geoKey: 'semiconductor', file: 'semiconductor/korea_semiconductor_map.html', labelKo: '한국 반도체 산업 투자 지도', labelEn: 'Korea Semiconductor Investment Map' },
  { id: 'energy', geoKey: 'energy', file: 'energy/korea_energy_map.html', labelKo: '한국 에너지 투자 지도', labelEn: 'Korea Energy Map' },
  { id: 'powergrid', geoKey: 'powergrid', file: 'powergrid/korea_powergrid_map.html', labelKo: '한국 전력설비 투자 지도', labelEn: 'Korea Power Grid Equipment Map' },
  { id: 'ship', geoKey: 'ship', file: 'ship/korea_ship_map.html', labelKo: '한국 조선·조선기자재 산업 투자 지도', labelEn: 'Korea Shipbuilding & Marine Equipment Map' },
  { id: 'defense', geoKey: 'defense', file: 'defense/korea_defense_map.html', labelKo: '한국 방위·우주·항공 산업 투자 지도', labelEn: 'Korea Defense, Space & Aviation Map' },
  { id: 'kculture', geoKey: 'kculture', file: 'kculture/korea_kculture_map.html', labelKo: '한국 K컬처 산업 투자 지도', labelEn: 'Korea K-Culture Industry Map' },
  { id: 'bio', geoKey: 'bio', file: 'bio/korea_bio_map.html', labelKo: '한국 바이오 산업 투자 지도', labelEn: 'Korea Bio Industry Investment Map' },
  { id: 'robot', geoKey: 'robot', file: 'robot/korea_robot_map.html', labelKo: '한국 로봇/피지컬AI 산업 투자 지도', labelEn: 'Korea Robot / Physical AI Industry Map' },
  { id: 'finance', geoKey: 'finance', file: 'finance/korea_finance_map.html', labelKo: '한국 금융 투자 지도', labelEn: 'Korea Finance Map' },
  { id: 'construction', geoKey: 'construction', file: 'construction/korea_construction_map.html', labelKo: '한국 건설 투자 지도', labelEn: 'Korea Construction Map' },
];

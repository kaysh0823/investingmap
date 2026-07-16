/**
 * Single source for sector editorial paragraphs (ko/en).
 * Used by SEO prerender (static #im-seo-body) and js/map_editorial.js (via generated data).
 * Keys match body[data-sector] on industry map pages.
 */
export const SECTOR_EDITORIAL = {
  semi: {
    ko: {
      paragraphs: [
        'KOSPI·KOSDAQ에 상장된 국내 반도체 기업을 IDM, 팹리스, 파운드리, 소재, 장비, 기판, 패키징·테스트 등 벨류체인 축으로 묶어 비교할 수 있게 만든 콘텐츠입니다. 단순 종목 나열이 아니라, 각 기업이 어느 공정·역할에 속하는지와 글로벌 거래처·동종 peer가 한 화면에서 연결되도록 구성했습니다.',
        '표에서는 KRX 공시 기준 시가총액·PER·PBR과 52주 가격 구간(주가 위치)을 함께 볼 수 있습니다. 관계 그래프는 공개 보도·사업보고서·애널리스트 보고서를 바탕으로 분류한 참고 네트워크이며, 공식 계약이나 지분 관계를 대체하지 않습니다. 해외 투자자를 위해 영문 모드에서는 시총을 USD 환산(Billion)으로, 한국어 모드에서는 조(兆)원 단위로 표시합니다.',
        '반도체는 수출·설비투자·메모리 사이클에 민감합니다. 본 페이지는 산업 구조를 파악하는 출발점으로 활용하고, 매수·매도 판단은 책임지지 않습니다. 데이터 갱신 주기와 검증 절차는 <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하십시오.',
      ],
    },
    en: {
      paragraphs: [
        'This content groups listed Korean semiconductor companies on KOSPI and KOSDAQ by value-chain segment—IDM, fabless, foundry, materials, equipment, substrates, and packaging & test—for side-by-side comparison. It is not a flat ticker list: each company’s process role and illustrative global customer and peer links are connected on one screen.',
        'The table shows market cap, PER, and PBR based on KRX disclosures, plus position within the 52-week range. The relationship graph is a reference network classified from public news, annual reports, and analyst reports; it does not replace official contracts or ownership. In English mode, market cap is shown in USD billions; in Korean mode, in trillions of won.',
        'Semiconductors are sensitive to exports, capex, and memory cycles. Use this page as a starting point to understand industry structure; we do not provide buy or sell recommendations. See our <a href="../editorial-policy.html">editorial policy</a> for update cadence and verification.',
      ],
    },
  },
  bio: {
    ko: {
      paragraphs: [
        '바이오시밀러, 신약·CDMO, 의료기기, 진단 등 섹터별로 국내 상장 바이오·제약사를 분류하고, 글로벌 빅파마·플랫폼 기업과의 기술이전·페어링 관계를 참고용으로 연결합니다. 임상 단계·파이프라인은 각 기업의 핵심 테마 열에 요약되어 있으며, 투자 전 공시 등을 통해 최신 단계를 확인하시기 바랍니다.',
        '시가총액·밸류에이션 지표는 페이지 상단 기준일의 KRX 데이터를 따릅니다. 비상장 계열사나 SPAC 구조는 표에 포함되지 않을 수 있습니다. 그래프의 실선·점선은 페어링 유형을 구분하는 편집 표기이며, 라이선스 계약의 법적 효력을 의미하지 않습니다.',
        '바이오는 임상 실패·규제 리스크가 큰 섹터입니다. 본 컨텐츠는 국내 산업 지형과 글로벌 연결을 한눈에 파악하기 위한 정보 제공 자료에 불과하며, 투자 권유가 아닙니다. 자세한 면책은 <a href="../disclaimer.html">면책 고지</a>를 읽어 주세요.',
      ],
    },
    en: {
      paragraphs: [
        'Listed Korean bio and pharma companies are grouped by sector—biosimilars, novel drugs, CDMO, devices, diagnostics—with illustrative licensing and partnership relationships to global big pharma and platform companies. Clinical stage and pipeline notes are summarized in each company’s theme column; check the latest stage in filings before investing.',
        'Market cap and valuation metrics follow KRX data as of the date shown at the top of the page. Unlisted affiliates or SPAC structures may be omitted from the table. Solid and dashed lines in the graph are editorial markers for partnership types, not legal proof of license agreements.',
        'Biotech carries high clinical and regulatory risk. This content is for information only—to help you see domestic industry structure and global links at a glance—and is not investment advice. See our <a href="../disclaimer.html">disclaimer</a> for details.',
      ],
    },
  },
  ship: {
    ko: {
      paragraphs: [
        '조선소, 엔진·기자재, 철강·용접, 해양플랜트, 해운, 방산 해양 등 조선·해양 밸류체인에 속한 상장사를 묶어 보여 줍니다. 수주 잔량·선종 mix는 각 기업 설명에 반영하되, 실시간 수주 공시는 별도로 확인해야 합니다.',
        '조선은 LNG선·컨테이너선 사이클과 환율, 원자재 가격에 민감합니다. 표의 주가 위치는 52주 구간 대비 현재가를 백분율로 나타내며, 동종 업체 간 상대적 위치 비교에 유용합니다. 글로벌 조선·해운 peer와의 참고 관계는 그래프에서 회색·실선으로 구분됩니다.',
        '편집 분류 기준과 데이터 출처는 <a href="../editorial-policy.html">편집·검증 정책</a>에 정리되어 있습니다.',
      ],
    },
    en: {
      paragraphs: [
        'Listed companies across the shipbuilding and marine value chain—yards, engines and marine equipment, steel and welding, offshore, shipping, and defense-marine—are grouped on one map. Order backlog and vessel-mix themes are reflected in company notes; verify real-time order disclosures separately.',
        'Shipbuilding is sensitive to LNG and container-ship cycles, FX, and raw-material prices. The 52-week range column shows where the last price sits within the 52-week high/low as a percentage, useful for comparing peers. Reference relationships to global yard and shipping peers are shown as gray and solid lines in the graph.',
        'Classification rules and data sources are described in our <a href="../editorial-policy.html">editorial policy</a>.',
      ],
    },
  },
  defense: {
    ko: {
      paragraphs: [
        '항공기·엔진, 미사일·레이더, 육상무기, 해군·함정, 우주·위성·민항 등 방산·항공 밸류체인별로 국내 상장 기업과 협력사를 정리합니다. 수출 프로그램, 유럽·중동 등 해외 수주 이슈는 관계 그래프의 참고 링크로 표현되나, 군사 기밀·계약 세부는 공시 범위 내에서만 반영됩니다.',
        '방산주는 정부 예산·수출 승인·지정학 이벤트에 변동성이 큽니다. PER·PBR만으로 밸류에이션을 단정하지 말고, 방위사업청·DART 계약 공시를 병행하세요. 본 콘텐츠는 정보 제공 목적이며 증권 투자 권유가 아닙니다.',
        'FAQ와 데이터 한계는 <a href="../faq.html">자주 묻는 질문</a>에서 확인할 수 있습니다.',
      ],
    },
    en: {
      paragraphs: [
        'Listed domestic companies and suppliers are organized by defense and aviation value chain—aircraft and engines, missiles and radar, land systems, naval ships, space and satellites, and civil aviation. Export programs and overseas order themes in Europe and the Middle East appear as reference relationships in the graph; classified details and contract terms are reflected only within public disclosure.',
        'Defense stocks are volatile around government budgets, export approvals, and geopolitical events. Do not value companies based solely on PER and PBR—cross-check Defense Acquisition Program Administration and DART contract filings. This content is for information only, not investment advice.',
        'FAQ and data limitations are covered in our <a href="../faq.html">FAQ</a>.',
      ],
    },
  },
  robot: {
    ko: {
      paragraphs: [
        '공장 자동화, 물류 AMR, 협동로봇, 감속기·서보, 비전·센싱, 피지컬AI 소프트웨어 등 로봇·자동화 생태계의 상장사를 섹터별로 분류합니다. 국내 대기업 계열·스타트업 IPO 종목이 혼재하므로 시총 규모와 KOSPI/KOSDAQ 구분을 함께 보는 것이 좋습니다.',
        '로봇은 설비투자 사이클과 제조업 PMI, 자동차·전자 대기업 capex와 연동됩니다. 그래프는 국내외 장비사·SI·글로벌 로봇 OEM과의 참고 관계를 보여 주며, 실제 납품 비중은 공시에 따라 달라질 수 있습니다.',
        '편집 정책 등은 <a href="../authors.html">편집·데이터 팀</a> 페이지를 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'Listed companies in the robotics and automation ecosystem—factory automation, logistics AMRs, cobots, reducers and servos, vision and sensing, Physical AI software—are classified by sector. Large chaebol affiliates and startup IPOs sit side by side, so compare market cap and KOSPI vs KOSDAQ segment together.',
        'Robotics tracks equipment-investment cycles, manufacturing PMI, and capex at major auto and electronics groups. The graph shows illustrative ties to domestic and overseas equipment makers, integrators, and global robot OEMs; actual delivery mix follows filings.',
        'For editorial policy and related information, see our <a href="../authors.html">editorial & data team</a> page.',
      ],
    },
  },
  energy: {
    ko: {
      paragraphs: [
        '2차전지·ESS·배터리·태양광·풍력 밸류체인에 속한 상장사를 다룹니다. 셀·소재·모듈·풍력 타워·태양광 EPC 등 신재생·배터리 수요 축을 한 지도에서 비교할 수 있습니다.',
        '2차전지는 전기차·ESS 수요와 원자재(리튬·니켈) 가격에 민감합니다. 태양광·풍력은 정책·PPA·설비 투자 사이클의 영향을 받습니다. 각 기업의 세부 유형·제품 열에서 사업 mix를 확인하세요.',
        '에너지 전환 정책은 빠르게 변합니다. 최신 사업보고서와 산업부 자료로 교차 검증하시고, <a href="../editorial-policy.html">편집·검증 정책</a>에서 갱신 주기를 확인하세요.',
      ],
    },
    en: {
      paragraphs: [
        'This map covers listed companies across lithium-ion batteries, ESS, solar PV, and wind power. Compare cells, materials, modules, and wind-tower companies on one map.',
        'Batteries track EV and ESS demand and commodity prices (lithium, nickel); solar and wind follow policy and project-investment cycles. Check business mix in each company’s segment and product columns.',
        'Energy-transition policy changes quickly. Cross-check latest annual reports and Ministry data; see update cadence in our <a href="../editorial-policy.html">editorial policy</a>.',
      ],
    },
  },
  powergrid: {
    ko: {
      paragraphs: [
        '전력설비·송배전·발전설비 밸류체인에 속한 상장사를 다룹니다. 변압기·개폐기·케이블·발전 EPC·원전 기자재·전력·가스 유틸리티가 한 지도에서 연결됩니다.',
        '전력기기는 북미·중동 송전 투자 사이클과 전력 수요에 민감합니다. 발전·원전은 규제와 수주가 밸류에이션에 큰 변수입니다. 표의 세부 유형·제품 열에서 사업 mix를 확인하세요.',
        '전력 정책·요금 체계는 빠르게 변합니다. 공시와 한국전력거래소 자료로 교차 검증하시고, <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'This map covers listed companies in power equipment, transmission & distribution, and power generation equipment—including transformers, switchgear, cables, EPC, and utilities.',
        'Grid equipment makers track transmission-investment cycles; generation and nuclear companies are driven by regulation and order books. Check segment and product columns for business mix.',
        'Power policy and tariff frameworks change quickly. Cross-check filings and Korea Power Exchange data; see our <a href="../editorial-policy.html">editorial policy</a>.',
      ],
    },
  },
  finance: {
    ko: {
      paragraphs: [
        '은행·금융지주, 증권·자산운용, 생명·손해보험, 카드·캐피탈 등 국내 상장 금융사를 밸류체인별로 정리합니다. KB금융·신한지주·삼성생명·미래에셋증권 등 대표 종목의 시가총액·PER·PBR과 글로벌 peer 참고 관계를 한 페이지에서 비교할 수 있습니다.',
        '금융주는 기준금리·규제·신용 사이클·자본비율에 민감합니다. 표의 세부 유형·주요 사업 열에서 은행·증권·보험·카드 mix를 확인하세요.',
        '본 콘텐츠는 정보 제공 목적이며 투자 권유·자문이 아닙니다. 공시와 금융감독원·한국은행 자료를 교차 검증하시고, <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'This map covers listed Korean banks and holdings, securities and asset managers, life and P&C insurers, and card and consumer-finance companies. Compare KRX metrics and illustrative global peer relationships for KB Financial, Shinhan, Samsung Life, Mirae Asset Securities, and peers.',
        'Financial stocks track policy rates, regulation, credit cycles, and capital ratios. Use segment and product columns for business mix.',
        'Informational only—not investment advice. Cross-check filings and official data; see our <a href="../editorial-policy.html">editorial policy</a>.',
      ],
    },
  },
  construction: {
    ko: {
      paragraphs: [
        '종합건설, 주택·디벨로퍼, 건설기계, 건설 지주 등 국내 상장 건설사를 밸류체인별로 정리합니다. 삼성물산·현대건설·대우건설·DL이앤씨·GS건설 등 대표 종목의 시가총액·PER·PBR과 글로벌 EPC·장비 peer 참고 관계를 한 페이지에서 비교할 수 있습니다.',
        '건설주는 수주·분양·원자재·금리에 민감합니다. 표의 세부 유형·주요 사업 열에서 건축·토목·플랜트·주택 mix를 확인하세요.',
        '본 콘텐츠는 정보 제공 목적이며 투자 권유·자문이 아닙니다. 공시와 국토교통부·한국부동산원 자료를 교차 검증하시고, <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'This map covers listed Korean general contractors, housing developers, construction equipment makers, and related holdings. Compare KRX metrics and illustrative global EPC and equipment peer relationships for Samsung C&T, Hyundai E&C, Daewoo E&C, DL E&C, GS E&C, and peers.',
        'Construction stocks track orders, housing sales, materials, and rates. Use segment and product columns for business mix.',
        'Informational only—not investment advice. Cross-check filings and official data; see our <a href="../editorial-policy.html">editorial policy</a>.',
      ],
    },
  },
  auto: {
    ko: {
      paragraphs: [
        '완성차, 부품, 타이어, 전장·ADAS 등 국내 상장 자동차 밸류체인을 정리합니다. 현대차·기아·현대모비스·한국타이어 등 대표 종목의 시가총액·PER·PBR과 글로벌 OEM·부품 peer 참고 관계를 한 페이지에서 비교할 수 있습니다.',
        '자동차주는 글로벌 수요·환율·원자재·전동화·ADAS 투자 사이클에 민감합니다. 표의 세부 유형·주요 사업 열에서 완성차·부품·타이어·전장 mix를 확인하세요.',
        '본 콘텐츠는 정보 제공 목적이며 투자 권유·자문이 아닙니다. 공시와 산업 통계를 교차 검증하시고, <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'This map covers listed Korean OEMs, auto parts, tires, and electronics/ADAS names. Compare KRX metrics and illustrative global OEM and parts peer relationships for Hyundai Motor, Kia, Hyundai Mobis, Hankook Tire, and peers.',
        'Auto stocks track global demand, FX, materials, electrification, and ADAS investment cycles. Use segment and product columns for business mix.',
        'Informational only—not investment advice. Cross-check filings and industry data; see our <a href="../editorial-policy.html">editorial policy</a>.',
      ],
    },
  },
  medtech: {
    ko: {
      paragraphs: [
        '진단·IVD, 임플란트·치과, 미용기기, 의료장비·수술 등 국내 상장 의료·미용기기를 밸류체인별로 정리합니다. 씨젠·루닛·덴티움·클래시스·큐렉소 등 대표 종목의 시가총액·PER·PBR과 글로벌 진단·임플란트·에스테틱 peer 참고 관계를 한 페이지에서 비교할 수 있습니다.',
        '의료기기는 허가·보험수가·병원 capex·해외 인허가에 민감합니다. 표의 세부 유형·주요 사업 열에서 진단·임플란트·미용기기·장비 mix를 확인하세요.',
        '본 콘텐츠는 정보 제공 목적이며 투자 권유·자문이 아닙니다. 공시와 식약처·건강보험 관련 자료를 교차 검증하시고, <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'This map covers listed Korean diagnostics/IVD, dental implants, aesthetic devices, and medical equipment. Compare KRX metrics and illustrative global peer relationships for Seegene, Lunit, Dentium, Classys, Curexo, and peers.',
        'Medtech stocks track approvals, reimbursement, hospital capex, and overseas clearances. Use segment and product columns for business mix.',
        'Informational only—not investment advice. Cross-check filings and regulatory data; see our <a href="../editorial-policy.html">editorial policy</a>.',
      ],
    },
  },
  kculture: {
    ko: {
      paragraphs: [
        '라면·가공식품, 여행·항공, 화장품·뷰티, 게임, 패션, 쇼핑·유통, 드라마·웹툰·플랫폼, K-pop 엔터 등 K컬처 수출 테마별 상장사를 묶습니다. 불닭볶음면, BTS, K드라마 같은 키워드 중심 글로벌 수요와 연결된 종목을 찾을 때 출발점으로 쓸 수 있습니다.',
        'K컬처주는 환율, 중국·동남아 규제, 플랫폼 효과, 아티스트 이슈 등 비재무 요인이 크습니다. 표의 재무 지표는 참고용이며, 엔터·식품·화장품은 계절성·일회성 이벤트가 실적에 영향을 줄 수 있습니다. 그래프의 글로벌 링크는 수출·동종업종 등 예시입니다.',
        '투자 유의 사항은 <a href="../disclaimer.html">면책 고지</a>, 사이트 소개는 <a href="../about.html">소개</a> 페이지를 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'Listed companies are grouped by K-culture export themes—ramen and packaged food, travel and airlines, cosmetics and beauty, games, fashion, retail, drama and webtoon platforms, and K-pop labels. Use it as a starting point when exploring companies tied to global demand around themes such as Buldak ramen, BTS, or K-drama.',
        'K-culture stocks are driven heavily by non-financial factors—FX, China and Southeast Asia regulation, platform effects, and artist news. Table metrics are for reference; entertainment, food, and beauty companies can see earnings swings from seasonality and one-off events. Global relationships in the graph illustrate exports and peer-group examples.',
        'For investment cautions see our <a href="../disclaimer.html">disclaimer</a>; for site overview see <a href="../about.html">about</a>.',
      ],
    },
  },
  kconsume: {
    ko: {
      paragraphs: [
        '화장품·뷰티, 패션, 식품·라면, 쇼핑·유통, 여행·레저 등 K-소비/유통 테마 상장사를 묶습니다. 아모레퍼시픽, 삼양식품, 신세계 등 소비재·유통 종목을 밸류체인별로 비교할 때 출발점으로 쓸 수 있습니다.',
        '소비·유통주는 환율, 중국·동남아 수요, 채널 경쟁, 원가·판촉 사이클의 영향을 크게 받습니다. 표의 재무 지표는 참고용이며, 화장품·식품은 계절성·일회성 이벤트가 실적에 영향을 줄 수 있습니다.',
        '투자 유의 사항은 <a href="../disclaimer.html">면책 고지</a>, 사이트 소개는 <a href="../about.html">소개</a> 페이지를 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'Listed companies are grouped by K-consume themes—beauty, fashion, food and ramen, retail, and travel. Use it as a starting point when comparing Amorepacific, Samyang Foods, Shinsegae, and peers.',
        'Consumer and retail stocks are sensitive to FX, China and Southeast Asia demand, channel competition, and cost/promotion cycles. Table metrics are for reference; beauty and food names can swing with seasonality and one-off events.',
        'For investment cautions see our <a href="../disclaimer.html">disclaimer</a>; for site overview see <a href="../about.html">about</a>.',
      ],
    },
  },
  kcontent: {
    ko: {
      paragraphs: [
        '게임, 드라마·웹툰·미디어, K-pop 엔터 등 K-콘텐츠 테마 상장사를 묶습니다. 하이브, NAVER, 크래프톤 등 IP·플랫폼·엔터 종목을 탐색할 때 출발점으로 쓸 수 있습니다.',
        '콘텐츠주는 플랫폼 효과, 아티스트·타이틀 이슈, 중국·글로벌 규제 등 비재무 요인이 큽니다. 표의 재무 지표는 참고용이며, 엔터·게임은 일회성 이벤트와 히트작 여부가 실적에 큰 영향을 줄 수 있습니다.',
        '투자 유의 사항은 <a href="../disclaimer.html">면책 고지</a>, 사이트 소개는 <a href="../about.html">소개</a> 페이지를 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'Listed companies are grouped by K-content themes—games, drama/webtoon/media, and K-pop entertainment. Use it as a starting point when exploring HYBE, NAVER, Krafton, and peers.',
        'Content stocks are driven heavily by platform effects, artist and title news, and China/global regulation. Table metrics are for reference; entertainment and games can swing sharply with hit titles and one-off events.',
        'For investment cautions see our <a href="../disclaimer.html">disclaimer</a>; for site overview see <a href="../about.html">about</a>.',
      ],
    },
  },
};

/** geoKey in SEO_SECTOR_COPY / geo.json → data-sector / SECTOR_EDITORIAL key */
export const GEO_KEY_TO_EDITORIAL = {
  semiconductor: 'semi',
  energy: 'energy',
  powergrid: 'powergrid',
  ship: 'ship',
  defense: 'defense',
  kconsume: 'kconsume',
  kcontent: 'kcontent',
  bio: 'bio',
  robot: 'robot',
  auto: 'auto',
  medtech: 'medtech',
  finance: 'finance',
  construction: 'construction',
  kculture: 'kculture',
};

export function editorialParagraphsForGeo(geoKey) {
  const id = GEO_KEY_TO_EDITORIAL[geoKey] || geoKey;
  const block = SECTOR_EDITORIAL[id];
  if (!block) return null;
  return {
    paragraphsKo: block.ko.paragraphs.slice(),
    paragraphsEn: block.en.paragraphs.slice(),
    bodyKo: block.ko.paragraphs.join(' '),
    bodyEn: block.en.paragraphs.join(' '),
  };
}

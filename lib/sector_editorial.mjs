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
        '항공기·엔진, 미사일·레이더, 육상무기, 해군·함정, 우주·위성·민항 등 방산·우주·항공 밸류체인별로 국내 상장 기업과 협력사를 정리합니다. 수출 프로그램, 유럽·중동 등 해외 수주 이슈는 관계 그래프의 참고 링크로 표현되나, 군사 기밀·계약 세부는 공시 범위 내에서만 반영됩니다.',
        '방산주는 정부 예산·수출 승인·지정학 이벤트에 변동성이 큽니다. PER·PBR만으로 밸류에이션을 단정하지 말고, 방위사업청·DART 계약 공시를 병행하세요. 본 콘텐츠는 정보 제공 목적이며 증권 투자 권유가 아닙니다.',
        'FAQ와 데이터 한계는 <a href="../faq.html">자주 묻는 질문</a>에서 확인할 수 있습니다.',
      ],
    },
    en: {
      paragraphs: [
        'Listed domestic companies and suppliers are organized by defense, space, and aviation value chain—aircraft and engines, missiles and radar, land systems, naval ships, space and satellites, and civil aviation. Export programs and overseas order themes in Europe and the Middle East appear as reference relationships in the graph; classified details and contract terms are reflected only within public disclosure.',
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
  battery: {
    ko: {
      paragraphs: [
        '2차전지·배터리 지도는 국내 상장사를 셀, 소재, 장비, 부품, ESS 밸류체인으로 나누어 비교합니다. LG에너지솔루션·삼성SDI 같은 셀 업체부터 양극재·전해질·분리막·동박·제조장비 기업, 그리고 ESS·PCS·연료전지 노출 기업까지 한 화면에서 확인할 수 있습니다.',
        '배터리·ESS 밸류체인은 전기차·에너지저장 수요, 리튬·니켈 등 원자재 가격, 전력망 연계 프로젝트, 고객사 증설 계획에 민감합니다. 표의 시가총액·PER·PBR과 52주 가격 위치는 KRX 데이터 기준이며, 관계 그래프는 공개 자료를 바탕으로 한 참고 네트워크입니다.',
        '본 페이지는 배터리·ESS 산업 구조를 파악하기 위한 정보 제공 자료이며 투자 권유가 아닙니다. 소재 가격과 수주·증설·ESS 프로젝트 공시는 변동성이 크므로 DART 공시와 기업 IR 자료를 함께 확인하고, 갱신 기준은 <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'The battery map groups listed Korean companies by cells, materials, equipment, parts, and ESS. It covers cell makers such as LG Energy Solution and Samsung SDI as well as cathode, electrolyte, separator, copper-foil, and manufacturing-equipment suppliers, plus ESS, PCS, and fuel-cell exposure.',
        'Battery and ESS value chains are sensitive to EV and energy-storage demand, lithium and nickel prices, grid-linked projects, and customer capacity plans. Market cap, PER, PBR, and 52-week position follow KRX data; the relationship graph is an editorial reference network based on public information.',
        'This page is informational only and is not investment advice. Material prices, orders, capacity-expansion, and ESS project disclosures can change quickly, so cross-check DART filings and company IR; see our <a href="../editorial-policy.html">editorial policy</a> for update cadence.',
      ],
    },
  },
  renewable: {
    ko: {
      paragraphs: [
        '신재생에너지 지도는 태양광, 풍력, 수소, 신재생 개발·운영 관련 상장사를 분리해 보여 줍니다. 기존 에너지 지도에 함께 있던 태양광 소재·모듈, 풍력 타워, 신재생 EPC·운영 기업을 별도 섹터로 정리했습니다.',
        '신재생 기업은 정책 지원, PPA·REC 가격, 금리, 프로젝트 파이낸싱, 글로벌 공급망 변화에 민감합니다. 표에서는 각 기업의 주요 사업 mix와 KRX 밸류에이션을 함께 볼 수 있으며, 그래프의 해외 연결은 peer·수요처 참고 관계입니다.',
        '재생에너지 정책과 프로젝트 일정은 빠르게 바뀝니다. 투자 판단 전 공시·사업보고서·산업부 자료를 확인하고, 본 페이지는 정보 제공 목적이라는 점을 유의하세요.',
      ],
    },
    en: {
      paragraphs: [
        'The renewable-energy map separates listed companies in solar, wind, hydrogen, and renewable project development and operations. Solar materials and modules, wind towers, and renewable EPC/operators previously grouped under energy now sit in a dedicated sector.',
        'Renewable names are sensitive to policy support, PPA and REC prices, interest rates, project financing, and global supply-chain changes. The table combines business-mix notes with KRX valuation data, while overseas links in the graph are peer and demand references.',
        'Renewable policy and project schedules change quickly. Check filings, annual reports, and Ministry data before making investment decisions; this page is for information only.',
      ],
    },
  },
  nuclear: {
    ko: {
      paragraphs: [
        '원전 지도는 원자로·주기기, 설계·EPC, 운영·정비, 계측·보조기기 및 SMR 관련 상장사를 별도 섹터로 정리합니다. 기존 전력설비 지도에 포함되어 있던 원전 기자재·정비 기업을 분리해 원전 밸류체인을 더 직접적으로 볼 수 있게 했습니다.',
        '원전 관련주는 국내 전력정책, 해외 원전 수주, SMR 기술 상용화, 규제 승인 일정에 민감합니다. 표의 KRX 지표와 52주 가격 위치는 상대 비교용이며, 그래프의 글로벌 관계는 원전 기자재·설계·정비 peer를 이해하기 위한 참고 연결입니다.',
        '원전 프로젝트는 장기 계약과 규제 리스크가 큽니다. 본 콘텐츠는 투자 권유가 아니며, 한국수력원자력·산업부·DART 공시 등 1차 자료를 반드시 확인하시기 바랍니다.',
      ],
    },
    en: {
      paragraphs: [
        'The nuclear map groups listed Korean companies in reactors and major components, design and EPC, operations and maintenance, instrumentation, auxiliary equipment, and SMR themes. Nuclear component and maintenance names previously inside the power-equipment map are now separated for a clearer value-chain view.',
        'Nuclear stocks are sensitive to domestic power policy, overseas plant orders, SMR commercialization, and regulatory approvals. KRX metrics and 52-week position are for comparison; graph relationships are reference links for nuclear equipment, design, and O&M peers.',
        'Nuclear projects involve long contracts and regulatory risk. This content is not investment advice; verify primary sources such as KHNP, ministry releases, and DART filings.',
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
        '진단·IVD, 임플란트·치과, 의료장비·수술 등 국내 상장 의료기기/헬스케어를 밸류체인별로 정리합니다. 씨젠·루닛·에스디바이오센서·덴티움·큐렉소 등 대표 종목의 시가총액·PER·PBR과 글로벌 진단·임플란트·장비 peer 참고 관계를 한 페이지에서 비교할 수 있습니다.',
        '의료기기/헬스케어는 허가·보험수가·병원 capex·해외 인허가에 민감합니다. 표의 세부 유형·주요 사업 열에서 진단·임플란트·장비 mix를 확인하세요. 미용기기·에스테틱 종목은 화장품/미용기기 지도에서 다룹니다.',
        '본 콘텐츠는 정보 제공 목적이며 투자 권유·자문이 아닙니다. 공시와 식약처·건강보험 관련 자료를 교차 검증하시고, <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'This map covers listed Korean diagnostics/IVD, dental implants, and medical equipment under the medtech/healthcare umbrella. Compare KRX metrics and illustrative global peer relationships for Seegene, Lunit, SD Biosensor, Dentium, Curexo, and peers.',
        'Medtech/healthcare stocks track approvals, reimbursement, hospital capex, and overseas clearances. Use segment and product columns for business mix. Aesthetic device names sit on the cosmetics/aesthetic map.',
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
        '패션, 식품·라면, 쇼핑·유통, 여행·레저 등 K-소비/유통 테마 상장사를 묶습니다. 삼양식품, 신세계, F&F 등 소비재·유통 종목을 밸류체인별로 비교할 때 출발점으로 쓸 수 있습니다. 화장품은 별도 화장품 지도에서 다룹니다.',
        '소비·유통주는 환율, 중국·동남아 수요, 채널 경쟁, 원가·판촉 사이클의 영향을 크게 받습니다. 표의 재무 지표는 참고용이며, 식품·패션은 계절성·일회성 이벤트가 실적에 영향을 줄 수 있습니다.',
        '투자 유의 사항은 <a href="../disclaimer.html">면책 고지</a>, 사이트 소개는 <a href="../about.html">소개</a> 페이지를 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'Listed companies are grouped by K-consume themes—fashion, food and ramen, retail, and travel. Cosmetics now sit on a dedicated cosmetics map. Use this page when comparing Samyang Foods, Shinsegae, F&F, and peers.',
        'Consumer and retail stocks are sensitive to FX, China and Southeast Asia demand, channel competition, and cost/promotion cycles. Table metrics are for reference; food and fashion names can swing with seasonality and one-off events.',
        'For investment cautions see our <a href="../disclaimer.html">disclaimer</a>; for site overview see <a href="../about.html">about</a>.',
      ],
    },
  },
  cosmetics: {
    ko: {
      paragraphs: [
        '화장품/미용기기 지도는 브랜드, ODM·OEM, 원료, 용기, 유통·채널, 미용기기 밸류체인으로 국내 상장사를 나눕니다. 아모레퍼시픽·LG생활건강 등 브랜드와 한국콜마·코스맥스 등 ODM, 실리콘투 유통·채널, 클래시스·파마리서치·원텍 미용기기를 한 화면에서 비교할 수 있습니다.',
        '화장품·뷰티·미용기기주는 중국·동남아 수요, 환율, 채널 경쟁, 신제품·마케팅·시술 사이클에 민감합니다. 원료·용기 체인은 종목이 추가되면 필터와 범례에 자동으로 나타납니다.',
        '본 페이지는 정보 제공 목적이며 투자 권유가 아닙니다. 공시와 IR 자료를 함께 확인하고, 갱신 기준은 <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'The cosmetics/aesthetic map groups listed Korean companies by brands, ODM/OEM, ingredients, packaging, channels, and aesthetic devices. Compare Amorepacific, LG H&H, Kolmar, Cosmax, Silicon2, Classys, PharmaResearch, and Won Tech on one screen.',
        'Beauty and aesthetic-device stocks are sensitive to China and Southeast Asia demand, FX, channel competition, and product/procedure cycles. Ingredient and packaging chains appear in filters and legends automatically once companies are added.',
        'This page is informational only and is not investment advice. Cross-check filings and IR; see our <a href="../editorial-policy.html">editorial policy</a> for update cadence.',
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
  bigchip: {
    ko: {
      paragraphs: [
        '삼성전자/하이닉스 지도는 삼성전자와 SK하이닉스만을 분리해 메모리, HBM, 시스템반도체와 파운드리 노출을 비교합니다. 종목·시장 구분과 시가총액·PER·PBR은 페이지 기준일의 KRX 데이터에서 가져오며, 기존 반도체 지도에서는 두 종목을 제외해 섹터별 단일 소속을 유지합니다.',
        '메모리 업황은 DRAM·NAND 가격, AI 서버용 HBM 수요, 설비투자와 재고 사이클에 민감합니다. 그래프의 TSMC·Micron·Intel 연결은 동종 사업을 비교하기 위한 글로벌 peer 참고선이며 고객·공급 또는 계약 관계를 주장하지 않습니다.',
        '본 페이지는 산업 구조 비교를 위한 정보 제공 자료이며 투자 권유·자문이 아닙니다. 최신 생산능력, 투자계획과 사업별 실적은 삼성전자·SK하이닉스의 DART 공시와 기업 IR을 확인하고, 데이터 갱신 기준은 <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'The Samsung/SK hynix map isolates Samsung Electronics and SK hynix for comparison across memory, HBM, system semiconductors, and foundry exposure. Listings, market classification, market cap, PER, and PBR follow KRX data as of the page date; both names are removed from the broader semiconductor map to preserve one-sector membership.',
        'Memory earnings are sensitive to DRAM and NAND pricing, AI-server HBM demand, capital spending, and inventory cycles. Links to TSMC, Micron, and Intel are global peer references for comparable business lines and do not assert customer, supplier, or contractual relationships.',
        'This page is informational and is not investment advice. Check Samsung Electronics and SK hynix DART filings and investor-relations material for current capacity, capex, and segment results; see our <a href="../editorial-policy.html">editorial policy</a> for update standards.',
      ],
    },
  },
  software: {
    ko: {
      paragraphs: [
        'IT·소프트웨어 지도는 국내 상장사를 플랫폼·AI, SI·클라우드, 기업SW·SaaS, 보안으로 나누어 비교합니다. 사업 분류는 각 회사의 DART 사업보고서상 주요 서비스와 매출 설명을 바탕으로 하며, 시가총액·PER·PBR과 시장 구분은 KRX 데이터 기준입니다.',
        '소프트웨어 기업은 클라우드 전환, 생성형AI 투자, 기업 IT 예산, 구독형 매출과 보안 수요에 영향을 받습니다. 그래프의 글로벌 기업은 제품군과 사업모델을 비교하기 위한 peer로만 연결했으며 공식 제휴·납품·계약 관계를 의미하지 않습니다.',
        '플랫폼 규제, 데이터보호, 인건비와 AI 인프라 비용은 실적 변동 요인입니다. 본 콘텐츠는 정보 제공 목적이며 투자 권유가 아니므로 최신 DART 공시와 기업 IR을 교차 확인하고 <a href="../disclaimer.html">면책 고지</a>를 읽어 주세요.',
      ],
    },
    en: {
      paragraphs: [
        'The IT and software map groups listed Korean companies into platforms & AI, IT services & cloud, enterprise software & SaaS, and cybersecurity. Classification follows principal services and revenue descriptions in DART annual reports, while market cap, PER, PBR, and market segment follow KRX data.',
        'Software businesses are exposed to cloud migration, generative-AI spending, enterprise IT budgets, recurring subscription revenue, and security demand. Global companies in the graph are product and business-model peers only; links do not imply partnerships, supply, or contracts.',
        'Platform regulation, data protection, labor costs, and AI-infrastructure spending can move earnings. This content is informational and not investment advice; cross-check current DART filings and company IR and read our <a href="../disclaimer.html">disclaimer</a>.',
      ],
    },
  },
  holdings: {
    ko: {
      paragraphs: [
        '지주회사 지도는 국내 상장 지주사를 순수지주·투자, 사업지주, 소비·서비스 지주, 산업재 지주로 보수적으로 분류합니다. 포함 범위는 승인된 법인에 한정하며, 계열 포트폴리오 설명은 DART 사업보고서와 지배구조 공시를 바탕으로 하고 정량 지표는 KRX 데이터에서 가져옵니다.',
        '지주사 가치는 상장·비상장 자회사 가치, 순차입금, 배당·로열티 현금흐름, 자사주와 지배구조 정책의 영향을 받습니다. 해외 연결은 사업 구조를 비교하기 위한 holding-company peer일 뿐 지분·투자 또는 계약 관계를 의미하지 않습니다.',
        '지주회사 할인율과 순자산가치는 평가 가정에 따라 크게 달라질 수 있습니다. 본 페이지는 투자 권유가 아니며 연결·별도 재무제표, 주요 자회사 공시와 공정거래위원회 기업집단 자료를 함께 확인하고 <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'The holdings map conservatively classifies approved listed Korean holding companies as investment, operating, consumer/service, or industrial holdings. Portfolio descriptions follow DART annual reports and governance disclosures, while quantitative metrics come from KRX data.',
        'Holding-company value is affected by listed and unlisted subsidiary values, net debt, dividend and royalty cash flows, treasury shares, and governance policy. Overseas links are holding-company peers for structural comparison and do not imply ownership, investment, or contracts.',
        'Holding-company discounts and net asset values vary materially with assumptions. This page is not investment advice; review consolidated and separate financial statements, major-subsidiary filings, and Korea Fair Trade Commission group data, and see our <a href="../editorial-policy.html">editorial policy</a>.',
      ],
    },
  },
  telecom: {
    ko: {
      paragraphs: [
        '통신 지도는 국내 상장사를 통신서비스, 무선장비, 광통신, 위성통신으로 나누어 네트워크 밸류체인을 비교합니다. 시장·시가총액·PER·PBR은 KRX 데이터 기준이며, 사업 유형과 제품은 DART 사업보고서의 주요 사업 설명을 요약했습니다.',
        '통신서비스는 가입자 경쟁, 주파수 정책, 설비투자와 데이터센터 수요에 영향을 받고 장비사는 5G 투자, 광전송 증설과 위성망 구축 사이클에 민감합니다. 글로벌 그래프 연결은 Verizon·Ericsson·Ciena 등 동종 peer 참고 관계이며 실제 납품이나 계약을 뜻하지 않습니다.',
        '주파수·보안·통신요금 규제와 고객사 투자 일정은 빠르게 변합니다. 본 콘텐츠는 정보 제공 목적이며 투자 권유가 아니므로 과학기술정보통신부 자료, DART 공시와 기업 IR을 확인하고 <a href="../disclaimer.html">면책 고지</a>를 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'The telecom map groups listed Korean companies into telecom services, wireless equipment, optical communications, and satellite communications. Market, market cap, PER, and PBR follow KRX data; business and product descriptions summarize principal activities in DART annual reports.',
        'Operators are exposed to subscriber competition, spectrum policy, network capex, and data-center demand, while equipment suppliers track 5G, optical-transport, and satellite-network investment cycles. Global links to Verizon, Ericsson, Ciena, and others are peer references and do not imply supply or contractual relationships.',
        'Spectrum, security, tariff regulation, and customer investment schedules can change quickly. This content is informational and not investment advice; check ministry releases, DART filings, and company IR and see our <a href="../disclaimer.html">disclaimer</a>.',
      ],
    },
  },
  elec: {
    ko: {
      paragraphs: [
        '전기·전자 지도는 국내 상장사를 가전, 디스플레이, 카메라·모듈, 전자부품, 전선·케이블로 나눠 비교합니다. 삼성전기와 LG이노텍은 반도체 부품/기판 체인에서 옮겨 왔으며, 시가총액·PER·PBR과 시장 구분은 KRX 데이터 기준입니다.',
        '가전·디스플레이는 소비 수요와 패널 가격에, 전자부품은 스마트폰·전장 사이클과 MLCC 재고에 민감합니다. 그래프의 Sony·Murata·Bosch 연결은 동종 사업 비교를 위한 peer 참고선이며 납품이나 계약을 뜻하지 않습니다.',
        '전선은 전력설비 섹터의 대한전선과 사업이 겹칠 수 있고, 부품사는 반도체 기판·테스트 체인과도 인접합니다. 본 페이지는 정보 제공 목적이며 투자 권유가 아니므로 DART 공시와 <a href="../disclaimer.html">면책 고지</a>를 확인하세요.',
      ],
    },
    en: {
      paragraphs: [
        'The electrical and electronics map groups listed Korean companies into appliances, displays, camera modules, electronic components, and cables. Samsung Electro-Mechanics and LG Innotek were moved from the semiconductor substrate chain; market cap, PER, PBR, and market segment follow KRX data.',
        'Appliances and displays track consumer demand and panel prices, while components are sensitive to smartphone and auto-electronics cycles and MLCC inventories. Links to Sony, Murata, and Bosch are peer references and do not imply supply or contracts.',
        'Cable names can overlap thematically with power-equipment listings, and component makers sit next to semiconductor substrate and test chains. This page is informational and not investment advice; check DART filings and our <a href="../disclaimer.html">disclaimer</a>.',
      ],
    },
  },
  metal: {
    ko: {
      paragraphs: [
        '철강·금속·기계 지도는 제철·강관·비철 사업회사, 철강 중심 사업지주와 산업기계를 묶습니다. POSCO홀딩스 같은 다각화 지주회사는 holdings에 두고, 현대제철·고려아연·세아베스틸지주처럼 철강·금속 사업 노출이 직접적인 회사는 이 지도에 둡니다. 정량 지표는 KRX 데이터입니다.',
        '철강은 후판·봉형강 수요와 원료 가격, 비철은 아연·은 가격, 산업기계는 건설·물류 투자 사이클의 영향을 받습니다. Nippon Steel·Glencore·Caterpillar 연결은 사업 비교용 peer이며 계약 관계가 아닙니다.',
        '포스코인터내셔널과 현대제철은 조선 철강소재 체인에서 이동했으며, 두산에너빌리티는 원전, HD현대일렉트릭은 전력설비에 남겼습니다. 투자 권유가 아니므로 DART와 <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하세요.',
      ],
    },
    en: {
      paragraphs: [
        'The steel, metals and machinery map groups steel, pipe and nonferrous operators, steel-focused operating holdings, and industrial-machinery companies. Diversified holdings such as POSCO Holdings stay in holdings, while names with direct steel and metals exposure such as Hyundai Steel, Korea Zinc, and SeAH Besteel Holdings are listed here. Quantitative fields follow KRX data.',
        'Steel tracks plate and long-product demand and raw-material prices, nonferrous names track zinc and silver, and machinery follows construction and logistics capex. Links to Nippon Steel, Glencore, and Caterpillar are peers, not contracts.',
        'POSCO International and Hyundai Steel were moved from the shipbuilding steel chain; Doosan Enerbility remains in nuclear and HD Hyundai Electric in power equipment. This is not investment advice; see DART and our <a href="../editorial-policy.html">editorial policy</a>.',
      ],
    },
  },
};

/** geoKey in SEO_SECTOR_COPY / geo.json → data-sector / SECTOR_EDITORIAL key */
export const GEO_KEY_TO_EDITORIAL = {
  bigchip: 'bigchip',
  semiconductor: 'semi',
  energy: 'energy',
  battery: 'battery',
  renewable: 'renewable',
  nuclear: 'nuclear',
  powergrid: 'powergrid',
  ship: 'ship',
  defense: 'defense',
  kconsume: 'kconsume',
  cosmetics: 'cosmetics',
  kcontent: 'kcontent',
  bio: 'bio',
  robot: 'robot',
  auto: 'auto',
  medtech: 'medtech',
  finance: 'finance',
  construction: 'construction',
  software: 'software',
  holdings: 'holdings',
  telecom: 'telecom',
  elec: 'elec',
  metal: 'metal',
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

/**
 * Sector-specific editorial intro on industry map pages (AdSense / thin-content compliance).
 */
(function (global) {
  'use strict';

  var EDITORIAL = {
    semi: {
      ko: {
        title: '한국 반도체 산업 지도 — 이 페이지에서 읽는 방법',
        paragraphs: [
          '이 지도는 KOSPI·KOSDAQ에 상장된 국내 반도체 기업을 IDM, 팹리스, 파운드리, 소재, 장비, 기판, 패키징·테스트 등 벨류체인 축으로 묶어 비교할 수 있게 만든 편집 콘텐츠입니다. 단순 종목 나열이 아니라, 각 기업이 어느 공정·역할에 속하는지와 글로벌 거래처·동종 peer가 한 화면에서 연결되도록 설계했습니다.',
          '표에서는 KRX 공시 기준 시가총액·PER·PBR과 52주 가격 구간(주가 위치)을 함께 볼 수 있습니다. 관계 그래프는 공개 보도·사업보고서·업계 보고서를 바탕으로 편집팀이 분류한 참고 네트워크이며, 공식 계약이나 지분 관계를 대체하지 않습니다. 해외 투자자를 위해 영문 모드에서는 시총을 USD 환산(Billion)으로, 한국어 모드에서는 조(兆)원 단위로 표시합니다.',
          '반도체는 수출·설비투자·메모리 사이클에 민감합니다. 본 페이지는 산업 구조를 파악하는 출발점으로 활용하고, 매수·매도 판단은 DART·KRX 1차 자료로 검증하세요. 데이터 갱신 주기와 검증 절차는 <a href="../editorial-policy.html">편집·검증 정책</a>을 참고하십시오.'
        ]
      },
      en: {
        title: 'How to read the Korea semiconductor map',
        paragraphs: [
          'This map groups listed Korean semiconductor names across IDM, fabless, foundry, materials, equipment, substrates, and packaging & test—not as a flat ticker list, but by value-chain role with illustrative customer, supply, and peer links on one screen.',
          'The table combines KRX-based market cap, PER, PBR, and 52-week price position. The relationship graph is an editorial reference network drawn from public filings and industry sources; it does not replace official contracts or ownership records. English mode shows market cap in billions USD; Korean mode uses jo (兆) of won.',
          'Semiconductors are cyclical and export-sensitive. Use this page to understand industry structure, then verify decisions via DART and KRX primary sources. See our <a href="../editorial-policy.html">editorial policy</a> for update cadence and verification.'
        ]
      }
    },
    bio: {
      ko: {
        title: '한국 바이오·제약 산업 지도 — 이 페이지에서 읽는 방법',
        paragraphs: [
          '바이오시밀러, 신약·CDMO, 의료기기, 진단 등 섹터별로 국내 상장 바이오·제약사를 분류하고, 글로벌 빅파마·플랫폼 기업과의 기술이전·페어링 관계를 참고용으로 연결합니다. 임상 단계·파이프라인은 각 기업의 핵심 테마 열에 요약되어 있으며, 투자 전 공시로 최신 단계를 확인해야 합니다.',
          '시가총액·밸류에이션 지표는 페이지 상단 기준일의 KRX 데이터를 따릅니다. 비상장 계열사나 SPAC 구조는 표에 포함되지 않을 수 있습니다. 그래프의 실선·점선은 페어링 유형을 구분하는 편집 표기이며, 라이선스 계약의 법적 효력을 의미하지 않습니다.',
          '바이오는 임상 실패·규제 리스크가 큰 섹터입니다. 본 지도는 국내 산업 지형과 글로벌 연결을 한눈에 보는 학습 자료이며 투자 권유가 아닙니다. 자세한 면책은 <a href="../disclaimer.html">면책 고지</a>를 읽어 주세요.'
        ]
      },
      en: {
        title: 'How to read the Korea bio & pharma map',
        paragraphs: [
          'Companies are grouped by biosimilars, novel drugs, CDMO, devices, diagnostics, and related themes, with illustrative global licensing and pairing links. Pipeline notes in the table are summaries—confirm latest clinical stages in official filings.',
          'Market cap and ratios follow KRX as of the date shown. Graph edge styles distinguish pairing types editorially; they are not legal proof of licenses. Unlisted affiliates may be omitted.',
          'Biotech carries clinical and regulatory risk. This map is educational industry context, not a recommendation. See our <a href="../disclaimer.html">disclaimer</a>.'
        ]
      }
    },
    ship: {
      ko: {
        title: '한국 조선·해양 산업 지도 — 이 페이지에서 읽는 방법',
        paragraphs: [
          '조선소, 엔진·기자재, 철강·용접, 해양플랜트, 해운, 방산 해양 등 조선·해양 밸류체인에 속한 상장사를 묶어 보여 줍니다. 수주 잔량·선종 mix는 각 기업 설명에 반영하되, 실시간 수주 공시는 별도로 확인해야 합니다.',
          '조선은 LNG선·컨테이너선 사이클과 환율, 원자재 가격에 민감합니다. 표의 주가 위치는 52주 구간 대비 현재가를 백분율로 나타내며, 동종 업체 간 상대적 위치 비교에 유용합니다. 글로벌 조선·해운 peer와의 참고 관계는 그래프에서 회색·실선으로 구분됩니다.',
          '편집 분류 기준과 데이터 출처는 <a href="../editorial-policy.html">편집·검증 정책</a>에 정리되어 있습니다.'
        ]
      },
      en: {
        title: 'How to read the Korea shipbuilding map',
        paragraphs: [
          'Listed names span yards, engines, steel, marine equipment, offshore, shipping, and defense-marine clusters. Order backlog themes are summarized per company—verify latest orders in filings.',
          'The sector is cyclical with FX and steel cost exposure. Price position shows where last trades within the 52-week range. Global yard and shipping peers appear as reference links in the graph.',
          'Classification rules and sources are in our <a href="../editorial-policy.html">editorial policy</a>.'
        ]
      }
    },
    defense: {
      ko: {
        title: '한국 방위·우주·항공 산업 지도 — 이 페이지에서 읽는 방법',
        paragraphs: [
          '항공기·엔진, 미사일·레이더, 육상무기, 해군·함정, 우주·위성·민항 등 방산·항공 밸류체인별로 국내 상장 프라임과 협력사를 정리합니다. 수출 프로그램·폴란드·중동 등 해외 수주 이슈는 관계 그래프의 참고 링크로 표현되나, 군사 기밀·계약 세부는 공시 범위 내에서만 반영됩니다.',
          '방산주는 정부 예산·수출 승인·지정학 이벤트에 변동성이 큽니다. PER·PBR만으로 밸류에이션을 단정하지 말고, 방위사업청·DART 계약 공시를 병행하세요. 본 콘텐츠는 정보 제공 목적이며 증권 투자 권유가 아닙니다.',
          'FAQ와 데이터 한계는 <a href="../faq.html">자주 묻는 질문</a>에서 확인할 수 있습니다.'
        ]
      },
      en: {
        title: 'How to read the Korea defense & aerospace map',
        paragraphs: [
          'Primes and suppliers are mapped across military aviation, missiles & C4ISR, land systems, naval shipbuilding, and space/civil aviation. Export program links are illustrative; classified detail stays within public disclosure.',
          'Defense equities are budget- and geopolitics-sensitive. Do not rely on multiples alone—cross-check DART and defense procurement releases. This is informational, not a recommendation.',
          'See <a href="../faq.html">FAQ</a> for data limits.'
        ]
      }
    },
    robot: {
      ko: {
        title: '한국 로봇·피지컬AI 산업 지도 — 이 페이지에서 읽는 방법',
        paragraphs: [
          '공장 자동화, 물류 AMR, 협동로봇, 감속기·서보, 비전·센싱, 피지컬AI 소프트웨어 등 로봇·자동화 생태계의 상장사를 섹터별로 분류합니다. 국내 대기업 계열·스타트업 IPO 종목이 혼재하므로 시총 규모와 KOSPI/KOSDAQ 구분을 함께 보는 것이 좋습니다.',
          '로봇은 설비투자 사이클과 제조업 PMI, 자동차·전자 대기업 capex와 연동됩니다. 그래프는 국내외 장비사·SI·글로벌 로봇 OEM과의 참고 관계를 보여 주며, 실제 납품 비중은 공시에 따라 달라질 수 있습니다.',
          '운영팀 소개와 연락 경로는 <a href="../authors.html">편집·데이터 팀</a> 페이지를 참고하세요.'
        ]
      },
      en: {
        title: 'How to read the Korea robotics map',
        paragraphs: [
          'Listed names cover factory automation, logistics AMRs, cobots, motion components, sensing, and physical-AI software. Chaebol affiliates and KOSDAQ innovators sit side by side—compare market cap and exchange segment.',
          'Robotics tracks capex cycles in autos and electronics. Graph edges show illustrative OEM and integrator ties; actual revenue mix follows filings.',
          'Meet the team on <a href="../authors.html">editorial & data</a>.'
        ]
      }
    },
    energy: {
      ko: {
        title: '한국 에너지·파워플랜트 산업 지도 — 이 페이지에서 읽는 방법',
        paragraphs: [
          '신재생, 2차전지·ESS, 태양광·풍력, 원자력·발전설비, 수소·연료전지, 전력·가스 유틸리티까지 에너지·파워플랜트 밸류체인 전반의 상장사 40여 곳을 다룹니다. 배터리 셀·소재·전력기기·EPC·발전사가 한 지도에서 연결되어 정책·원자재·전력 수요 변화의 수혜 축을 비교할 수 있습니다.',
          '2차전지는 전기차·ESS 수요와 원자재(리튬·니켈) 가격, 전력기기는 북미·중동 송전 투자 사이클의 영향을 받습니다. 원자력·가스·유틸리티는 규제와 요금 체계가 밸류에이션에 큰 변수입니다. 각 기업의 세부 유형·제품 열에서 사업 mix를 확인하세요.',
          '에너지 전환 정책은 빠르게 변합니다. 최신 사업보고서와 산업부·전력거래소 자료로 교차 검증하시고, <a href="../editorial-policy.html">편집·검증 정책</a>에서 갱신 주기를 확인하세요.'
        ]
      },
      en: {
        title: 'How to read the Korea energy & power-plant map',
        paragraphs: [
          'Covers ~40 listed names across renewables, batteries & ESS, solar & wind, nuclear & power OEM, hydrogen & fuel cells, and utilities—so you can compare who sits on cells, materials, grid gear, EPC, or generation.',
          'Batteries track EV/ESS demand and commodity prices; power equipment follows grid capex cycles; nuclear and utilities are regulation-heavy. Use segment and product columns for business mix.',
          'Energy policy shifts quickly—cross-check latest filings and ministry data. Update cadence is in our <a href="../editorial-policy.html">editorial policy</a>.'
        ]
      }
    },
    kculture: {
      ko: {
        title: '한국 K컬처 산업 지도 — 이 페이지에서 읽는 방법',
        paragraphs: [
          '라면·가공식품, 여행·항공, 화장품·뷰티, 드라마·웹툰·플랫폼, K-pop 엔터 등 K컬처 수출 테마별 상장사를 묶습니다. 불닭볶음면, BTS, K드라마 같은 키워드 중심 글로벌 수요와 연결된 종목을 찾을 때 출발점으로 쓸 수 있습니다.',
          'K컬처주는 환율, 중국·동남아 규제, 플랫폼 알고리즘, 아티스트 이슈 등 비재무 요인이 크습니다. 표의 재무 지표는 참고용이며, 엔터·식품·화장품은 계절성·일회성 이벤트가 실적을 흔들 수 있습니다. 그래프의 글로벌 링크는 수출·콜라보 예시입니다.',
          '투자 유의 사항은 <a href="../disclaimer.html">면책 고지</a>, 사이트 소개는 <a href="../about.html">소개</a> 페이지를 참고하세요.'
        ]
      },
      en: {
        title: 'How to read the Korea K-Culture map',
        paragraphs: [
          'Themes include ramen & food, travel & airlines, beauty, drama/webtoon/platforms, and K-pop labels—useful when exploring listed names tied to global demand for Korean content and brands.',
          'K-culture equities react to FX, platform rules, and artist news—not just multiples. Graph global links illustrate export and collaboration examples.',
          'See <a href="../disclaimer.html">disclaimer</a> and <a href="../about.html">about</a>.'
        ]
      }
    }
  };

  function imLang() {
    try {
      var q = new URLSearchParams(window.location.search).get('lang');
      if (q === 'en' || q === 'ko') return q;
      var s = localStorage.getItem('im_lang');
      if (s === 'en' || s === 'ko') return s;
    } catch (e) {}
    return document.documentElement.lang === 'ko' ? 'ko' : 'en';
  }

  function render(lang) {
    var sector = (document.body && document.body.getAttribute('data-sector')) || '';
    var data = EDITORIAL[sector];
    var section = document.getElementById('map-editorial');
    if (!section || !data) return;
    lang = lang || imLang();
    var block = data[lang] || data.en;
    var titleEl = document.getElementById('map-editorial-title');
    var bodyEl = document.getElementById('map-editorial-body');
    if (titleEl) titleEl.textContent = block.title;
    if (bodyEl) {
      bodyEl.innerHTML = block.paragraphs.map(function (p) {
        return '<p>' + p + '</p>';
      }).join('');
    }
    section.setAttribute('lang', lang);
  }

  global.InvestingMapEditorial = { render: render };

  document.addEventListener('DOMContentLoaded', function () {
    render(imLang());
  });
  if (document.readyState !== 'loading') render(imLang());
})(typeof window !== 'undefined' ? window : globalThis);

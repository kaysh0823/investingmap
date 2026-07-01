/**
 * Build GEO trust pages: editorial-policy, disclaimer, authors, faq.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { articleLd, faqPageLd, ldScript, organizationLd, webSiteLd, geo, BASE } from './geo_lib.mjs';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TRUST_CSS = `
    :root {
      --bg: #0d1117; --surface: #161b22; --surface2: #21262d; --border: #30363d;
      --text: #e6edf3; --text-muted: #8b949e; --accent: #58a6ff;
      --header-g0: #0d1117; --header-g1: #161b22;
    }
    [data-theme="light"] {
      --bg: #f6f8fa; --surface: #fff; --surface2: #eaeef2; --border: #d0d7de;
      --text: #1f2328; --text-muted: #656d76; --accent: #0969da;
      --header-g0: #fff; --header-g1: #f6f8fa;
    }
    * { box-sizing: border-box; margin: 0; padding: 0 }
    body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', -apple-system, sans-serif; font-size: 15px; min-height: 100vh; line-height: 1.6 }
    .site-header { background: linear-gradient(135deg, var(--header-g0), var(--header-g1)); border-bottom: 1px solid var(--border); padding: 24px 28px; position: relative }
    .header-actions { position: absolute; top: 20px; right: 22px; display: flex; gap: 8px; align-items: center }
    .theme-toggle, .lang-toggle, .hub-back { background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 13px; text-decoration: none }
    .trust-main { max-width: 760px; margin: 0 auto; padding: 28px 28px 12px }
    .trust-main h1 { font-size: 26px; margin-bottom: 8px }
    .trust-main .lead { color: var(--text-muted); margin-bottom: 24px }
    .trust-main h2 { font-size: 18px; margin: 28px 0 10px }
    .trust-main p, .trust-main li { margin-bottom: 10px }
    .trust-main ul { padding-left: 1.25rem }
    .trust-main a { color: var(--accent) }
    .answer-capsule { margin-bottom: 20px }
    .updated { font-size: 13px; color: var(--text-muted); margin-bottom: 20px }
    .im-trust-footer { border-top: 1px solid var(--border); padding: 20px 28px 28px; margin-top: 24px; font-size: 13px; color: var(--text-muted) }
    .im-trust-nav { display: flex; flex-wrap: wrap; gap: 10px 18px; margin-bottom: 12px }
    .im-trust-nav a { color: var(--accent); text-decoration: none }
    .faq-item { margin-bottom: 22px }
    .faq-item h2 { font-size: 16px; margin: 0 0 6px }
`;

function trustShell({ slug, titleKo, titleEn, descKo, descEn, extraLd, bodyKo, bodyEn, i18nKey }) {
  const url = `${BASE}/${slug}.html`;
  const article = articleLd({
    headline: titleKo,
    description: descKo,
    url,
  });
  const schemas = [webSiteLd(), organizationLd(), article, ...(extraLd || [])];

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <meta name="description" content="${descKo.replace(/"/g, '&quot;')}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="ko" href="${url}?lang=ko">
  <link rel="alternate" hreflang="en" href="${url}?lang=en">
  <link rel="alternate" hreflang="x-default" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Investing Map">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${titleKo}">
  <meta property="og:description" content="${descKo.replace(/"/g, '&quot;')}">
${schemas.map((s) => ldScript(s)).join('\n')}
  <script src="js/seo.js"></script>
  <title>${titleKo} | Investing Map</title>
  <script>try { var __im = localStorage.getItem('im_theme'); if (__im === 'light' || __im === 'dark') document.documentElement.setAttribute('data-theme', __im); } catch (e) { }</script>
  <style>${TRUST_CSS}</style>
</head>
<body>
  <header class="site-header">
    <div class="header-actions">
      <button type="button" class="theme-toggle" id="theme-toggle" onclick="toggleTheme()" aria-label="Theme">☀️</button>
      <button type="button" class="lang-toggle" id="lang-toggle" onclick="toggleLang()"><span class="flag">🇺🇸</span> <span id="lang-text">English</span></button>
    </div>
    <h1 id="page-title">${titleKo}</h1>
    <p class="lead" id="page-lead">${descKo}</p>
  </header>
  <main class="trust-main" id="trust-body-ko" lang="ko">
${bodyKo}
  </main>
  <main class="trust-main" id="trust-body-en" lang="en" hidden>
${bodyEn}
  </main>
  <footer class="im-trust-footer" id="im-trust-footer">
    <nav class="im-trust-nav" aria-label="Trust and policies">
      <a href="editorial-policy.html" id="tf-editorial">편집·검증 정책</a>
      <a href="disclaimer.html" id="tf-disclaimer">면책 고지</a>
      <a href="authors.html" id="tf-authors">편집·데이터 팀</a>
      <a href="faq.html" id="tf-faq">FAQ</a>
      <a href="index.html" id="tf-hub">허브</a>
    </nav>
    <p class="im-trust-disclaimer" id="tf-inline-disclaimer">본 콘텐츠는 정보 제공 목적이며 투자 권유·자문이 아닙니다.</p>
  </footer>
  <script src="js/global_bottom_nav.js"></script>
  <script src="js/geo_footer.js"></script>
  <script>
    const PAGE = ${JSON.stringify({ titleKo, titleEn, descKo, descEn, i18nKey })};
    const T = {
      ko: { hub: '허브', langFlag: '🇺🇸', langText: 'English', themeLight: '라이트 모드', themeDark: '다크 모드' },
      en: { hub: 'Hub', langFlag: '🇰🇷', langText: '한국어', themeLight: 'Light mode', themeDark: 'Dark mode' }
    };
    function imInitialLang() {
      try {
        const q = new URLSearchParams(location.search).get('lang');
        if (q === 'en' || q === 'ko') return q;
        const s = localStorage.getItem('im_lang');
        if (s === 'en' || s === 'ko') return s;
      } catch (e) {}
      return 'ko';
    }
    let lang = imInitialLang();
    function toggleTheme() {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('im_theme', next); } catch (e) {}
      syncTheme();
    }
    function syncTheme() {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const btn = document.getElementById('theme-toggle');
      if (btn) { btn.textContent = cur === 'light' ? '🌙' : '☀️'; btn.title = cur === 'light' ? T[lang].themeDark : T[lang].themeLight; }
    }
    function toggleLang() {
      lang = lang === 'ko' ? 'en' : 'ko';
      try {
        const u = new URL(location.href);
        u.searchParams.set('lang', lang);
        history.replaceState(null, '', u.pathname + u.search);
        localStorage.setItem('im_lang', lang);
      } catch (e) {}
      applyLang();
    }
    function applyLang() {
      document.documentElement.lang = lang === 'en' ? 'en' : 'ko';
      document.getElementById('page-title').textContent = lang === 'en' ? PAGE.titleEn : PAGE.titleKo;
      document.getElementById('page-lead').textContent = lang === 'en' ? PAGE.descEn : PAGE.descKo;
      document.getElementById('trust-body-ko').hidden = lang !== 'ko';
      document.getElementById('trust-body-en').hidden = lang !== 'en';
      document.querySelector('.lang-toggle .flag').textContent = T[lang].langFlag;
      document.getElementById('lang-text').textContent = T[lang].langText;
      document.title = (lang === 'en' ? PAGE.titleEn : PAGE.titleKo) + ' | Investing Map';
      if (window.InvestingMapSeo) InvestingMapSeo.sync({ title: document.title, description: lang === 'en' ? PAGE.descEn : PAGE.descKo });
      if (window.InvestingMapGeoFooter) InvestingMapGeoFooter.apply(lang);
      if (window.InvestingMapGlobalBottomNav) InvestingMapGlobalBottomNav.render(lang);
      syncTheme();
    }
    applyLang();
  </script>
</body>
</html>`;
}

const FAQS_KO = [
  {
    q: 'Investing Map은 무엇을 제공하나요?',
    a: 'Investing Map은 KOSPI·KOSDAQ 상장사를 산업별로 분류한 인터랙티브 지도입니다. 각 페이지에서 KRX 기준 시가총액·PER·PBR, 밸류체인 태그, 정렬·필터 가능한 기업 표, 관계형 그래프를 한국어·영어로 볼 수 있습니다.',
  },
  {
    q: '어떤 종목이 지도·허브에 포함되나요?',
    a: 'KOSPI·KOSDAQ 상장사 중 KRX 기준 시가총액 3천억원(300,000,000,000원) 이상이며, 해당 산업 cp_list·편집 분류에 포함된 종목만 산업 지도·허브·Top10에 노출됩니다. 자세한 편집 원칙은 편집·검증 정책 페이지를 참고하세요.',
  },
  {
    q: '시가총액·PER·PBR 데이터는 어디서 가져오나요?',
    a: '시가총액·시장 구분은 data/ 폴더의 KRX CSV(4937·4848·5016 시리즈)를 기준으로 하며, 페이지 상단에 표시된 기준일(예: 2026년 6월 15일)에 맞춥니다. PER·PBR도 동일 CSV 출처를 사용합니다. 현재가·52주 고저는 /api/quotes를 통해 KRX OPEN API·네이버 시세 캐시로 갱신되며 지연·휴장일에는 —로 표시될 수 있습니다.',
  },
  {
    q: '영문 시가총액은 어떻게 환산하나요?',
    a: '영문 표의 시가총액은 네이버 금융 USD/KRW 고시 환율(data/fx_usdkrw.json)을 적용해 Billion(십억 달러) 단위로 소수 둘째 자리까지 환산한 참고치입니다. 환율 출처: https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW',
  },
  {
    q: '관계 지도(그래프)는 공시 데이터인가요?',
    a: '관계 그래프의 거래처·피어·키워드 연결은 공개 정보와 편집 분류를 바탕으로 한 참고용 네트워크입니다. 공식 공시·계약 관계를 대체하지 않으며, 투자 판단 전 DART 전자공시와 사업보고서에서 최신 정보를 확인해야 합니다.',
  },
  {
    q: '데이터는 얼마나 자주 갱신되나요?',
    a: 'KRX 정량 데이터(시총·PER·PBR)는 주기적으로 CSV를 갱신하며 페이지 기준일을 업데이트합니다. 실시간 시세 필드는 영업일 기준으로 /api/quotes 폴링 주기에 따라 반영됩니다. 고트래픽 페이지는 연 1회 이상 편집·검증 정책에 따라 출처를 재확인합니다.',
  },
];

const FAQS_EN = FAQS_KO.map((f, i) => ({
  q: [
    'What does Investing Map provide?',
    'Which stocks appear on maps and the hub?',
    'Where do market cap, PER, and PBR come from?',
    'How is English market cap converted?',
    'Are relationship graphs official filing data?',
    'How often is data updated?',
  ][i],
  a: [
    'Investing Map is a set of interactive industry maps for KOSPI and KOSDAQ listed names. Each page shows KRX-based market cap, PER, PBR, value-chain tags, a sortable company table, and a relationship graph in Korean and English.',
    'Only KOSPI/KOSDAQ names with KRX market cap of at least KRW 300 billion (300,000,000,000 won) that are in the sector cp_list and editorial taxonomy appear on maps, the hub, and Top 10. See the editorial policy page for details.',
    'Market cap and market segment use KRX CSV files under data/ (4937, 4848, 5016 series), aligned to the as-of date shown on each page (e.g. 15 June 2026). Last price and 52-week high/low refresh via /api/quotes (KRX OPEN API and Naver cache) and may show — when delayed or closed.',
    'English market cap is an illustrative billions-USD figure (two decimals) using the USD/KRW spot stored in data/fx_usdkrw.json from Naver Finance.',
    'Graph edges for customers, peers, and keywords are editorial reference networks from public information—not a substitute for DART filings or annual reports.',
    'KRX quantitative fields are updated when CSVs are refreshed and the page as-of date changes. Quote fields follow /api/quotes polling on trading days. High-traffic pages are source-checked at least annually per our editorial policy.',
  ][i],
}));

const pages = [
  {
    slug: 'editorial-policy',
    titleKo: '편집·검증 정책',
    titleEn: 'Editorial & verification policy',
    descKo: 'Investing Map 콘텐츠 작성, 데이터 출처 확인, 갱신 주기를 설명합니다.',
    descEn: 'How Investing Map sources, verifies, and updates industry map content.',
    bodyKo: `
    <p class="updated">최종 검증일: ${geo.dates.geoModified}</p>
    <p class="answer-capsule">Investing Map은 KRX·공시·공개 정보를 1차 출처로 삼아 산업 분류와 정량 지표를 편집·검증하며, 관계 지도는 참고용 네트워크로 별도 표기합니다.</p>
    <h2>콘텐츠는 어떻게 만들어지나요?</h2>
    <p>각 산업 지도는 (1) KRX CSV에서 종목·시총·PER·PBR을 추출하고, (2) 밸류체인·세그먼트를 편집 기준에 따라 분류하며, (3) 공개 정보 기반 거래처·피어·키워드 관계를 그래프로 정리합니다. 한국어·영어 라벨은 동일 데이터를 공유합니다.</p>
    <h2>어떤 출처를 우선하나요?</h2>
    <ul>
      <li>한국거래소(KRX) 시세·시가총액·PER·PBR (data/ CSV)</li>
      <li>DART 전자공시·사업보고서 (투자 판단 전 사용자 확인 권장)</li>
      <li>네이버 금융 USD/KRW (영문 시총 환산 참고)</li>
    </ul>
    <h2>데이터 편집 원칙</h2>
    <ul>
      <li><strong>시총 하한</strong>: KRX 기준 시가총액 <strong>3천억원(300,000,000,000원) 미만</strong> KOSPI·KOSDAQ 상장사는 산업 지도, 허브 기업 목록, Top10·RS Top10 집계 대상에서 제외합니다.</li>
      <li>하한은 빌드 시 <code>lib/mcap_policy.mjs</code>의 <code>MIN_MCAP_WON</code>과 <code>scripts/filter_mcap_floor.mjs</code>로 지도·허브 인덱스에 반영됩니다.</li>
      <li>영업일 시세 갱신 후 시총이 하한 아래로 내려가면 기업 표에서도 해당 행을 숨길 수 있습니다.</li>
      <li>산업 분류(cp_list)에 새 종목을 넣을 때도 동일한 시총 하한을 적용합니다.</li>
    </ul>
    <h2>갱신·검증 주기는 어떻게 되나요?</h2>
    <p>정량 데이터는 CSV 갱신 시 페이지 기준일을 업데이트합니다. 시세 필드는 영업일 /api/quotes 갱신을 따릅니다. 핵심 페이지는 연 1회 이상 출처·분류·면책 문구를 재검토합니다.</p>
    <h2>투자 권유에 해당하나요?</h2>
    <p>본 사이트는 정보 제공 목적이며 특정 종목 매수·매도를 권유하지 않습니다. <!-- COMPLIANCE-REVIEW --> 규제 해석이 필요한 표현은 법무·컴플라이언스 검토 대상입니다.</p>`,
    bodyEn: `
    <p class="updated">Last verified: ${geo.dates.geoModified}</p>
    <p class="answer-capsule">Investing Map treats KRX, filings, and public sources as primary references for quantitative fields and industry tags, while relationship graphs are labeled as illustrative networks.</p>
    <h2>How is content produced?</h2>
    <p>Each map (1) pulls tickers, market cap, PER, and PBR from KRX CSVs, (2) applies editorial value-chain labels, and (3) builds reference relationship graphs from public information. Korean and English views share the same underlying data.</p>
    <h2>Which sources are prioritized?</h2>
    <ul>
      <li>KRX market data (data/ CSV series)</li>
      <li>DART electronic disclosures (users should confirm before investing)</li>
      <li>Naver Finance USD/KRW for English market-cap conversion</li>
    </ul>
    <h2>Data editing principles</h2>
    <ul>
      <li><strong>Market-cap floor</strong>: KOSPI and KOSDAQ listings below <strong>KRW 300 billion</strong> (300,000,000,000 won) on KRX market cap are excluded from industry maps, the hub company list, and Top 10 / RS Top 10 rankings.</li>
      <li>The floor is applied at build time via <code>lib/mcap_policy.mjs</code> (<code>MIN_MCAP_WON</code>) and <code>scripts/filter_mcap_floor.mjs</code>.</li>
      <li>After live quote updates, rows may be hidden if market cap falls below the floor.</li>
      <li>New tickers added to industry lists (cp_list) must meet the same floor.</li>
    </ul>
    <h2>Update and review cadence</h2>
    <p>Quantitative fields update when CSVs refresh and the on-page as-of date changes. Quote fields follow /api/quotes on trading days. Core pages undergo source and disclaimer review at least annually.</p>
    <h2>Is this investment advice?</h2>
    <p>The site is informational only and does not recommend buying or selling specific securities. <!-- COMPLIANCE-REVIEW --> Wording that may constitute solicitation is subject to compliance review.</p>`,
  },
  {
    slug: 'disclaimer',
    titleKo: '투자 유의 / 면책 고지',
    titleEn: 'Investment disclaimer',
    descKo: 'Investing Map 정보의 한계, 투자 책임, 데이터 지연에 대한 고지입니다.',
    descEn: 'Limits of Investing Map data, investor responsibility, and delay notices.',
    bodyKo: `
    <p class="answer-capsule">본 콘텐츠는 정보 제공 목적이며 투자 권유·자문이 아닙니다. 투자 결정과 책임은 투자자 본인에게 있으며, 공시·시세는 지연·오류가 있을 수 있습니다.</p>
    <h2>투자 권유·자문이 아닙니다</h2>
    <p>Investing Map의 표·그래프·설명은 한국 상장사 산업 구조를 이해하기 위한 참고 자료입니다. 특정 종목의 매수·매도·보유를 권유하지 않으며, 수익을 보장하지 않습니다.</p>
    <h2>데이터 한계</h2>
    <ul>
      <li>시가총액·PER·PBR은 페이지 기준일 KRX CSV 기준이며 실시간이 아닐 수 있습니다.</li>
      <li>현재가·52주 고저는 /api/quotes 경유 데이터로 지연·미제공 시 — 표시됩니다.</li>
      <li>관계 그래프는 편집 분류·공개 정보 기반 참고용이며 공식 계약·지분 관계가 아닙니다.</li>
      <li>영문 시총(Billion USD)은 네이버 환율 기반 환산 참고치입니다.</li>
    </ul>
    <h2>투자자 책임</h2>
    <p>투자 결정 전 금융감독원·DART·한국거래소 등 1차 출처에서 최신 공시와 리스크를 확인하십시오. 본 사이트 이용으로 발생하는 손실에 대해 운영자는 법령이 허용하는 범위 내에서 책임을 제한합니다.</p>`,
    bodyEn: `
    <p class="answer-capsule">This content is for information only—not investment advice or a recommendation. Investment decisions and responsibility rest with you; prices and filings may be delayed or incomplete.</p>
    <h2>Not investment advice</h2>
    <p>Tables and graphs are reference material to understand Korean listed-industry structure. We do not recommend buying, selling, or holding any security and do not guarantee returns.</p>
    <h2>Data limitations</h2>
    <ul>
      <li>Market cap, PER, and PBR follow KRX CSV as of the date on each page and may not be real-time.</li>
      <li>Last price and 52-week ranges come via /api/quotes and may show — when delayed or unavailable.</li>
      <li>Relationship graphs are editorial reference networks, not official contracts or ownership.</li>
      <li>English market cap in billions USD uses Naver FX conversion as an illustrative figure.</li>
    </ul>
    <h2>Your responsibility</h2>
    <p>Confirm latest filings and risks via FSS, DART, and KRX before investing. Liability of the operator is limited to the extent permitted by applicable law.</p>`,
  },
  {
    slug: 'authors',
    titleKo: '편집·데이터 팀',
    titleEn: 'Editorial & data team',
    descKo: 'Investing Map 콘텐츠와 KRX 데이터 검증을 담당하는 편집·데이터 팀 소개입니다.',
    descEn: 'The editorial and data team behind Investing Map industry maps.',
    bodyKo: `
    <p class="answer-capsule">Investing Map 콘텐츠는 ${geo.editorialTeam.name}이 KRX·공시 출처를 바탕으로 작성·갱신하며, 금융 분석 자격 보유 전문가 프로필은 순차 공개 예정입니다.</p>
    <h2>담당 범위</h2>
    <ul>
      <li>KRX CSV 기반 시총·PER·PBR·시장 구분 검증</li>
      <li>산업별 밸류체인·세그먼트 편집 분류</li>
      <li>관계 지도(거래처·피어·키워드) 공개 정보 정리</li>
      <li>한국어·영어 UI·면책·출처 문구 일관성</li>
    </ul>
    <h2>전문가 바이라인</h2>
    <p>금융 YMYL 콘텐츠 신뢰를 위해 실명·자격(투자권유자문인력, 금융투자분석사, CFA 등)이 확인된 애널리스트 프로필과 Person 스키마를 추가할 예정입니다. 자격·sameAs 링크가 확보되기 전까지 발행 주체는 <strong>${geo.editorialTeam.name}</strong> 조직 바이라인을 사용합니다.</p>
    <p>문의·정정 요청: 사이트 운영 채널을 통해 제출해 주시면 편집·검증 정책에 따라 검토합니다.</p>`,
    bodyEn: `
    <p class="answer-capsule">Content is produced and updated by the ${geo.editorialTeam.name} using KRX and public filing sources; named analyst profiles with verifiable credentials will be published in phases.</p>
    <h2>Scope</h2>
    <ul>
      <li>Verify market cap, PER, PBR, and market segment from KRX CSVs</li>
      <li>Maintain editorial value-chain and segment labels</li>
      <li>Curate reference relationship networks from public information</li>
      <li>Keep Korean/English UI and source/disclaimer wording consistent</li>
    </ul>
    <h2>Expert bylines</h2>
    <p>For YMYL trust signals we will add named analysts with verifiable credentials (Person schema + sameAs). Until those links are confirmed, bylines use the <strong>${geo.editorialTeam.name}</strong> organization.</p>
    <p>Corrections: submit via site contact channels; we review under the editorial policy.</p>`,
  },
  {
    slug: 'faq',
    titleKo: '자주 묻는 질문',
    titleEn: 'Frequently asked questions',
    descKo: 'Investing Map 데이터 출처, 환율·시총 표기, 관계 지도 해석에 대한 FAQ입니다.',
    descEn: 'FAQ on Investing Map data sources, FX conversion, and reading the relationship graphs.',
    extraLd: [faqPageLd(FAQS_KO)],
    bodyKo: FAQS_KO.map((f) => `<div class="faq-item"><h2>${f.q}</h2><p>${f.a}</p></div>`).join('\n'),
    bodyEn: FAQS_EN.map((f) => `<div class="faq-item"><h2>${f.q}</h2><p>${f.a}</p></div>`).join('\n'),
  },
];

for (const p of pages) {
  const html = trustShell(p);
  const file = path.join(outDir, `${p.slug}.html`);
  fs.writeFileSync(file, html);
  console.log('wrote', p.slug + '.html');
}

console.log('OK build_trust_pages');

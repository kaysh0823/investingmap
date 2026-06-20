/**
 * Inject SEO meta tags, JSON-LD, seo.js, and applyLang sync into map HTML pages.
 * Safe to re-run (skips pages that already contain investingmap-seo).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://investing-kr.com';
const MARKER = 'investingmap-seo';

const PAGES = [
  {
    file: 'semiconductor/korea_semiconductor_map.html',
    path: '/semiconductor/korea_semiconductor_map.html',
    title: '한국 반도체 산업 투자 지도',
    description:
      '국내 상장 반도체 기업의 KRX 시가총액·PER·PBR, 밸류체인 분류, 국내외 거래처·동종 peer·글로벌 피어 그룹 관계 지도.',
  },
  {
    file: 'bio/korea_bio_map.html',
    path: '/bio/korea_bio_map.html',
    title: '한국 바이오 산업 투자 지도',
    description:
      '국내 바이오·제약 상장사의 KRX 시가총액·PER·PBR, 섹터 분류, 기술이전·글로벌 빅파마 페어링과 peer 네트워크 지도.',
  },
  {
    file: 'ship/korea_ship_map.html',
    path: '/ship/korea_ship_map.html',
    title: '한국 조선·조선기자재 산업 투자 지도',
    description:
      '국내 상장 조선·해양·기자재 기업의 KRX 시가총액·PER·PBR, 밸류체인, 글로벌 거래·수주 관계 지도.',
  },
  {
    file: 'defense/korea_defense_map.html',
    path: '/defense/korea_defense_map.html',
    title: '한국 방위·우주·항공 산업 투자 지도',
    description:
      '항공기·엔진, 미사일·레이더, 육상무기, 해군·함정, 우주·위성·민항 관련 상장사의 KRX 데이터와 글로벌 참고 네트워크.',
  },
  {
    file: 'robot/korea_robot_map.html',
    path: '/robot/korea_robot_map.html',
    title: '한국 로봇·피지컬AI 산업 투자 지도',
    description:
      '국내 상장 산업로봇·자동화·물류·피지컬AI 기업의 KRX 시가총액·PER·PBR, 밸류체인과 글로벌 장비·SW 관계 지도.',
  },
  {
    file: 'energy/korea_energy_map.html',
    path: '/energy/korea_energy_map.html',
    title: '한국 에너지/파워플랜트 투자 지도',
    description:
      '신재생·2차전지·태양광·풍력·원자력·전력기기·ESS·수소·연료전지·전력·가스 관련 상장사와 글로벌 참고 관계 지도.',
  },
  {
    file: 'kculture/korea_kculture_map.html',
    path: '/kculture/korea_kculture_map.html',
    title: '한국 K컬처 산업 투자 지도',
    description:
      '라면·식품, 여행·레저, 화장품, 드라마·웹툰·미디어, K-pop 관련 상장사의 KRX 데이터와 글로벌 네트워크 지도.',
  },
];

function seoBlock(page) {
  const url = `${BASE}${page.path}`;
  const desc = page.description.replace(/"/g, '&quot;');
  return `  <!-- ${MARKER} -->
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <meta name="description" content="${desc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="ko" href="${url}?lang=ko">
  <link rel="alternate" hreflang="en" href="${url}?lang=en">
  <link rel="alternate" hreflang="x-default" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Investing Map">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:locale:alternate" content="en_US">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${page.title}">
  <meta property="og:description" content="${desc}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${page.title}">
  <meta name="twitter:description" content="${desc}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "${page.title}",
    "description": "${page.description.replace(/"/g, '\\"')}",
    "url": "${url}",
    "inLanguage": ["ko", "en"],
    "isPartOf": {
      "@type": "WebSite",
      "name": "Investing Map",
      "url": "${BASE}/"
    }
  }
  </script>
  <script src="../js/seo.js"></script>
`;
}

function patchFile(rel) {
  const abs = path.join(root, rel);
  let html = fs.readFileSync(abs, 'utf8');
  if (html.includes(MARKER)) {
    console.log('skip (already patched):', rel);
    return;
  }

  const viewportRe = /(<meta name="viewport" content="width=device-width, initial-scale=1\.0">)/;
  if (!viewportRe.test(html)) {
    console.warn('no viewport in', rel);
    return;
  }

  const page = PAGES.find((p) => p.file === rel.replace(/\\/g, '/'));
  if (!page) {
    console.warn('no SEO config for', rel);
    return;
  }

  html = html.replace(viewportRe, `$1\n${seoBlock(page)}`);

  if (!html.includes('InvestingMapSeo.sync')) {
    const seoLine =
      "      if (window.InvestingMapSeo) InvestingMapSeo.sync({ title: t.title, description: t.subtitle });\n";
    if (html.includes('document.title = t.title;\n      if (window.InvestingMapSectorNav)')) {
      html = html.replace(
        /document\.title = t\.title;\n      if \(window\.InvestingMapSectorNav\)/,
        'document.title = t.title;\n' + seoLine + '      if (window.InvestingMapSectorNav)'
      );
    } else {
      html = html.replace(
        /document\.title = t\.title;\n/,
        "document.title = t.title;\n" + seoLine
      );
    }
  }

  fs.writeFileSync(abs, html);
  console.log('patched:', rel);
}

for (const page of PAGES) patchFile(page.file);

// bio inline tail (regenerated into korea_bio_map.inline.js)
const bioTail = path.join(root, 'bio/bio_inline_tail.js');
let tail = fs.readFileSync(bioTail, 'utf8');
if (!tail.includes('InvestingMapSeo.sync')) {
  tail = tail.replace(
    /document\.title = t\.title;\n/,
    "document.title = t.title;\n      if (window.InvestingMapSeo) InvestingMapSeo.sync({ title: t.title, description: t.subtitle });\n"
  );
  fs.writeFileSync(bioTail, tail);
  console.log('patched: bio/bio_inline_tail.js');
}

console.log('OK patch_seo');

/**
 * §0-4 batch E leaf chains: bio / medtech / cosmetics.
 */
export const BIO_CHAINS = [
  '종합 제약',
  '신약개발',
  '바이오시밀러',
  '백신·혈액제제',
  'CDMO·CMO',
  '원료의약품·생산소재',
  '연구도구·서비스',
  '제약·바이오 지주',
];

export const BIO_COLORS = {
  '종합 제약': '#42A5F5',
  신약개발: '#EF5350',
  바이오시밀러: '#26A69A',
  '백신·혈액제제': '#66BB6A',
  'CDMO·CMO': '#7C3AED',
  '원료의약품·생산소재': '#FFA726',
  '연구도구·서비스': '#26C6DA',
  '제약·바이오 지주': '#8D6E63',
};

export const BIO_SECTOR_IDS = {
  '종합 제약': 'pharma_integrated',
  신약개발: 'drug_discovery',
  바이오시밀러: 'biosimilar',
  '백신·혈액제제': 'vaccine_blood',
  'CDMO·CMO': 'cdmo',
  '원료의약품·생산소재': 'api_materials',
  '연구도구·서비스': 'research_tools',
  '제약·바이오 지주': 'bio_holdings',
};

export const MEDTECH_CHAINS = [
  '체외진단',
  '영상진단 장비',
  '의료AI·소프트웨어',
  '생체측정·모니터링',
  '치과',
  '수술·치료 장비',
  '재활·보조기기',
  '의료소모품·재생재료',
  '연구·분석 장비',
];

export const MEDTECH_COLORS = {
  체외진단: '#42A5F5',
  '영상진단 장비': '#5C6BC0',
  '의료AI·소프트웨어': '#AB47BC',
  '생체측정·모니터링': '#26C6DA',
  치과: '#66BB6A',
  '수술·치료 장비': '#EF5350',
  '재활·보조기기': '#FFA726',
  '의료소모품·재생재료': '#26A69A',
  '연구·분석 장비': '#78909C',
};

export const COSMETICS_CHAINS = [
  '화장품 브랜드',
  '화장품 ODM·OEM',
  '원료·소재',
  '용기·부자재',
  '유통·채널',
  '홈뷰티 기기',
  '미용 의료장비',
  '에스테틱 의약품·소모품',
];

export const COSMETICS_COLORS = {
  '화장품 브랜드': '#F48FB1',
  '화장품 ODM·OEM': '#CE93D8',
  '원료·소재': '#80CBC4',
  '용기·부자재': '#FFCC80',
  '유통·채널': '#81D4FA',
  '홈뷰티 기기': '#4FC3F7',
  '미용 의료장비': '#EF9A9A',
  '에스테틱 의약품·소모품': '#E57373',
};

function labels(chains) {
  return Object.fromEntries(chains.map((c) => [c, c]));
}

export const HEALTH_04E = {
  bio: {
    key: 'bio',
    html: 'bio/korea_bio_map.html',
    chains: BIO_CHAINS,
    colors: BIO_COLORS,
    retired: [
      '합성신약 / 제네릭',
      '항체신약 / ADC',
      '면역항암제',
      '비만 / 대사질환',
      '세포 · 유전자치료제',
      '플랫폼 기술',
      'CDMO / CMO',
      '체외진단 (IVD)',
      '의료기기 / 디지털헬스',
    ],
    labelKo: labels(BIO_CHAINS),
    labelEn: {
      '종합 제약': 'Integrated pharma',
      신약개발: 'Drug discovery',
      바이오시밀러: 'Biosimilars',
      '백신·혈액제제': 'Vaccines & blood products',
      'CDMO·CMO': 'CDMO / CMO',
      '원료의약품·생산소재': 'API & production materials',
      '연구도구·서비스': 'Research tools & services',
      '제약·바이오 지주': 'Pharma / biotech holdings',
    },
    filterKo: labels(BIO_CHAINS),
    filterEn: {
      '종합 제약': 'Pharma',
      신약개발: 'Discovery',
      바이오시밀러: 'Biosimilar',
      '백신·혈액제제': 'Vaccines',
      'CDMO·CMO': 'CDMO',
      '원료의약품·생산소재': 'API',
      '연구도구·서비스': 'Tools',
      '제약·바이오 지주': 'Holdings',
    },
  },
  medtech: {
    key: 'medtech',
    html: 'medtech/korea_medtech_map.html',
    chains: MEDTECH_CHAINS,
    colors: MEDTECH_COLORS,
    retired: ['진단·IVD', '임플란트·치과', '의료장비·수술', '미용기기'],
    labelKo: labels(MEDTECH_CHAINS),
    labelEn: {
      체외진단: 'IVD',
      '영상진단 장비': 'Imaging equipment',
      '의료AI·소프트웨어': 'Medical AI & software',
      '생체측정·모니터링': 'Biometrics & monitoring',
      치과: 'Dental',
      '수술·치료 장비': 'Surgical & therapy equipment',
      '재활·보조기기': 'Rehab & assistive devices',
      '의료소모품·재생재료': 'Consumables & regenerative materials',
      '연구·분석 장비': 'Research & analysis equipment',
    },
    filterKo: labels(MEDTECH_CHAINS),
    filterEn: {
      체외진단: 'IVD',
      '영상진단 장비': 'Imaging',
      '의료AI·소프트웨어': 'Med AI/SW',
      '생체측정·모니터링': 'Monitoring',
      치과: 'Dental',
      '수술·치료 장비': 'Surgery',
      '재활·보조기기': 'Rehab',
      '의료소모품·재생재료': 'Consumables',
      '연구·분석 장비': 'Research',
    },
  },
  cosmetics: {
    key: 'cosmetics',
    html: 'cosmetics/korea_cosmetics_map.html',
    chains: COSMETICS_CHAINS,
    colors: COSMETICS_COLORS,
    retired: ['브랜드', 'ODM·OEM', '원료', '용기', '미용기기'],
    labelKo: labels(COSMETICS_CHAINS),
    labelEn: {
      '화장품 브랜드': 'Beauty brands',
      '화장품 ODM·OEM': 'Cosmetics ODM/OEM',
      '원료·소재': 'Ingredients & materials',
      '용기·부자재': 'Packaging & components',
      '유통·채널': 'Distribution & channels',
      '홈뷰티 기기': 'Home beauty devices',
      '미용 의료장비': 'Aesthetic medical devices',
      '에스테틱 의약품·소모품': 'Aesthetic drugs & consumables',
    },
    filterKo: labels(COSMETICS_CHAINS),
    filterEn: {
      '화장품 브랜드': 'Brands',
      '화장품 ODM·OEM': 'ODM/OEM',
      '원료·소재': 'Ingredients',
      '용기·부자재': 'Packaging',
      '유통·채널': 'Channels',
      '홈뷰티 기기': 'Home devices',
      '미용 의료장비': 'Aesthetic devices',
      '에스테틱 의약품·소모품': 'Aesthetic drugs',
    },
  },
};

export function angleLiteral(chains) {
  const n = chains.length || 1;
  const parts = chains.map((c, i) => {
    const key = /[^a-zA-Z0-9_$]/.test(c) ? `'${c}'` : c;
    return `${key}: ${Math.round((360 / n) * i)}`;
  });
  return `{ ${parts.join(', ')} }`;
}

export function toJsChainList(arr) {
  return `[${arr.map((c) => `'${c}'`).join(', ')}]`;
}

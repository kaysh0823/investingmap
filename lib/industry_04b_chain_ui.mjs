/**
 * §0-4 batch B leaf chains: chemical / metal / machinery / construction.
 */
export const CHEMICAL_CHAINS = [
  '정유·석유제품',
  '가스',
  '기초유분·석유화학',
  '합성수지·고무',
  '섬유·산업소재',
  '정밀·특수화학',
  '전자·첨단소재',
  '비료·농화학',
  '화학 유통',
  '포장재',
];

export const CHEMICAL_COLORS = {
  '정유·석유제품': '#FFA726',
  가스: '#FFB74D',
  '기초유분·석유화학': '#42A5F5',
  '합성수지·고무': '#5C6BC0',
  '섬유·산업소재': '#AB47BC',
  '정밀·특수화학': '#26A69A',
  '전자·첨단소재': '#EF5350',
  '비료·농화학': '#66BB6A',
  '화학 유통': '#8D6E63',
  포장재: '#90A4AE',
};

export const METAL_CHAINS = [
  '종합 철강',
  '판재·도금강판',
  '봉형강·선재',
  '강관',
  '특수강·단조',
  '비철 제련',
  '비철 가공·첨단금속',
  '금속 유통·가공서비스',
];

export const METAL_COLORS = {
  '종합 철강': '#78909C',
  '판재·도금강판': '#42A5F5',
  '봉형강·선재': '#8D6E63',
  강관: '#26A69A',
  '특수강·단조': '#5C6BC0',
  '비철 제련': '#FFA726',
  '비철 가공·첨단금속': '#FF8A65',
  '금속 유통·가공서비스': '#AB47BC',
};

export const MACHINERY_CHAINS = [
  '건설기계',
  '공작·금속가공기계',
  '물류·운반기계',
  '승강기',
  '산업용 설비',
  '핵심부품·공구',
  '유지보수·서비스',
];

export const MACHINERY_COLORS = {
  건설기계: '#FFA726',
  '공작·금속가공기계': '#8D6E63',
  '물류·운반기계': '#26A69A',
  승강기: '#42A5F5',
  '산업용 설비': '#78909C',
  '핵심부품·공구': '#AB47BC',
  '유지보수·서비스': '#66BB6A',
};

export const CONSTRUCTION_CHAINS = [
  '종합건설',
  '주택·개발',
  '플랜트·EPC',
  '토목·인프라',
  '전문건설·엔지니어링',
  '시멘트·기초 건자재',
  '마감재·인테리어',
  '부동산 서비스',
];

export const CONSTRUCTION_COLORS = {
  종합건설: '#42A5F5',
  '주택·개발': '#66BB6A',
  '플랜트·EPC': '#1E88E5',
  '토목·인프라': '#26A69A',
  '전문건설·엔지니어링': '#5C6BC0',
  '시멘트·기초 건자재': '#8D6E63',
  '마감재·인테리어': '#FFA726',
  '부동산 서비스': '#AB47BC',
};

function labels(chains) {
  return Object.fromEntries(chains.map((c) => [c, c]));
}

export const INDUSTRY_04B = {
  chemical: {
    key: 'chemical',
    html: 'chemical/korea_chemical_map.html',
    chains: CHEMICAL_CHAINS,
    colors: CHEMICAL_COLORS,
    retired: ['정유·가스', '석유화학', '정밀·특수화학', '화학소재·기타'],
    // keep 정밀·특수화학 as leaf; retire only coarse non-leaf names carefully
    labelKo: labels(CHEMICAL_CHAINS),
    labelEn: {
      '정유·석유제품': 'Refining & petroleum products',
      가스: 'Gas',
      '기초유분·석유화학': 'Basic chemicals & petrochemicals',
      '합성수지·고무': 'Resins & rubber',
      '섬유·산업소재': 'Fibers & industrial materials',
      '정밀·특수화학': 'Specialty chemicals',
      '전자·첨단소재': 'Electronic & advanced materials',
      '비료·농화학': 'Fertilizer & agrochemicals',
      '화학 유통': 'Chemical distribution',
      포장재: 'Packaging materials',
    },
    filterKo: labels(CHEMICAL_CHAINS),
    filterEn: {
      '정유·석유제품': 'Refining',
      가스: 'Gas',
      '기초유분·석유화학': 'Petrochemicals',
      '합성수지·고무': 'Resins',
      '섬유·산업소재': 'Fibers',
      '정밀·특수화학': 'Specialty',
      '전자·첨단소재': 'Advanced mats',
      '비료·농화학': 'Agrochem',
      '화학 유통': 'Distribution',
      포장재: 'Packaging',
    },
  },
  metal: {
    key: 'metal',
    html: 'metal/korea_metal_map.html',
    chains: METAL_CHAINS,
    colors: METAL_COLORS,
    retired: ['철강', '비철', '철강 트레이딩', '산업기계'],
    labelKo: labels(METAL_CHAINS),
    labelEn: {
      '종합 철강': 'Integrated steel',
      '판재·도금강판': 'Flat & coated steel',
      '봉형강·선재': 'Long products & wire rod',
      강관: 'Steel pipe',
      '특수강·단조': 'Specialty steel & forging',
      '비철 제련': 'Non-ferrous smelting',
      '비철 가공·첨단금속': 'Non-ferrous processing & advanced metals',
      '금속 유통·가공서비스': 'Metal trading & processing services',
    },
    filterKo: labels(METAL_CHAINS),
    filterEn: {
      '종합 철강': 'Integrated',
      '판재·도금강판': 'Flat steel',
      '봉형강·선재': 'Long products',
      강관: 'Pipe',
      '특수강·단조': 'Specialty',
      '비철 제련': 'Smelting',
      '비철 가공·첨단금속': 'Processing',
      '금속 유통·가공서비스': 'Trading/services',
    },
  },
  machinery: {
    key: 'machinery',
    html: 'machinery/korea_machinery_map.html',
    chains: MACHINERY_CHAINS,
    colors: MACHINERY_COLORS,
    retired: ['산업기계'],
    labelKo: labels(MACHINERY_CHAINS),
    labelEn: {
      건설기계: 'Construction equipment',
      '공작·금속가공기계': 'Machine tools & metalworking',
      '물류·운반기계': 'Logistics & material handling',
      승강기: 'Elevators',
      '산업용 설비': 'Industrial plant equipment',
      '핵심부품·공구': 'Core parts & tools',
      '유지보수·서비스': 'MRO & services',
    },
    filterKo: labels(MACHINERY_CHAINS),
    filterEn: {
      건설기계: 'Construction',
      '공작·금속가공기계': 'Machine tools',
      '물류·운반기계': 'Logistics',
      승강기: 'Elevators',
      '산업용 설비': 'Plant',
      '핵심부품·공구': 'Parts/tools',
      '유지보수·서비스': 'MRO',
    },
  },
  construction: {
    key: 'construction',
    html: 'construction/korea_construction_map.html',
    chains: CONSTRUCTION_CHAINS,
    colors: CONSTRUCTION_COLORS,
    retired: ['건설기계', '건자재', '시멘트', '종합건설·EPC', '주택·디벨로퍼', '부동산신탁'],
    labelKo: labels(CONSTRUCTION_CHAINS),
    labelEn: {
      종합건설: 'General contractors',
      '주택·개발': 'Housing & development',
      '플랜트·EPC': 'Plant & EPC',
      '토목·인프라': 'Civil & infrastructure',
      '전문건설·엔지니어링': 'Specialty construction & engineering',
      '시멘트·기초 건자재': 'Cement & basic materials',
      '마감재·인테리어': 'Finishes & interiors',
      '부동산 서비스': 'Real-estate services',
    },
    filterKo: labels(CONSTRUCTION_CHAINS),
    filterEn: {
      종합건설: 'Contractors',
      '주택·개발': 'Housing',
      '플랜트·EPC': 'EPC',
      '토목·인프라': 'Civil',
      '전문건설·엔지니어링': 'Specialty',
      '시멘트·기초 건자재': 'Cement',
      '마감재·인테리어': 'Finishes',
      '부동산 서비스': 'RE services',
    },
  },
};

/** Coarse labels that remain valid leaf names must not be in retired. */
INDUSTRY_04B.chemical.retired = ['정유·가스', '석유화학', '화학소재·기타'];

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

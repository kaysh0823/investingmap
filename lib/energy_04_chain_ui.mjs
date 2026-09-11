/**
 * §0-4 energy sector leaf chains (battery / renewable / nuclear / powergrid).
 * Single source for apply scripts and rebuild persistence.
 */
export const BATTERY_CHAINS = [
  '원료·정제',
  '양극재·전구체',
  '음극재',
  '전해액·전해질',
  '분리막',
  '집전체·기타 소재',
  '셀 제조',
  '모듈·팩·시스템 부품',
  '제조·검사 장비',
  '재사용·재활용',
];

export const BATTERY_COLORS = {
  '원료·정제': '#8D6E63',
  '양극재·전구체': '#EF5350',
  음극재: '#5C6BC0',
  '전해액·전해질': '#26A69A',
  분리막: '#42A5F5',
  '집전체·기타 소재': '#FF8A65',
  '셀 제조': '#AB47BC',
  '모듈·팩·시스템 부품': '#7E57C2',
  '제조·검사 장비': '#FFA726',
  '재사용·재활용': '#66BB6A',
};

export const RENEWABLE_CHAINS = [
  '핵심 소재·부품',
  '발전설비 제조',
  '구조물·보조설비',
  '개발·EPC',
  '발전 운영·유지보수',
  '수소·연료전지',
];

export const RENEWABLE_COLORS = {
  '핵심 소재·부품': '#EF5350',
  '발전설비 제조': '#42A5F5',
  '구조물·보조설비': '#FFCA28',
  '개발·EPC': '#26A69A',
  '발전 운영·유지보수': '#66BB6A',
  '수소·연료전지': '#4FC3F7',
};

export const NUCLEAR_CHAINS = [
  '설계·엔지니어링',
  '건설·EPC',
  '원자로·주기기',
  '보조기기·소재',
  '계측·제어',
  '정비·운영지원',
  '연료·해체·폐기물',
];

export const NUCLEAR_COLORS = {
  '설계·엔지니어링': '#42A5F5',
  '건설·EPC': '#26A69A',
  '원자로·주기기': '#78909C',
  '보조기기·소재': '#FF8A65',
  '계측·제어': '#AB47BC',
  '정비·운영지원': '#66BB6A',
  '연료·해체·폐기물': '#EF5350',
};

export const POWERGRID_CHAINS = [
  '변압기',
  '개폐·배전기기',
  '전선·케이블',
  '전력변환·제어',
  '전력망 시공·서비스',
  '발전·비상전원 설비',
  '유틸리티',
];

export const POWERGRID_COLORS = {
  변압기: '#42A5F5',
  '개폐·배전기기': '#FF8A65',
  '전선·케이블': '#FFCA28',
  '전력변환·제어': '#AB47BC',
  '전력망 시공·서비스': '#26A69A',
  '발전·비상전원 설비': '#78909C',
  유틸리티: '#66BB6A',
};

export const ENERGY_04 = {
  battery: {
    key: 'battery',
    html: 'battery/korea_battery_map.html',
    chains: BATTERY_CHAINS,
    colors: BATTERY_COLORS,
    retired: ['셀', '소재', '장비', '부품', 'ESS'],
    labelKo: Object.fromEntries(BATTERY_CHAINS.map((c) => [c, c])),
    labelEn: {
      '원료·정제': 'Feedstock & refining',
      '양극재·전구체': 'Cathode & precursors',
      음극재: 'Anode materials',
      '전해액·전해질': 'Electrolyte',
      분리막: 'Separator',
      '집전체·기타 소재': 'Current collectors & other materials',
      '셀 제조': 'Cell manufacturing',
      '모듈·팩·시스템 부품': 'Module, pack & system parts',
      '제조·검사 장비': 'Manufacturing & inspection equipment',
      '재사용·재활용': 'Reuse & recycling',
    },
    filterKo: Object.fromEntries(BATTERY_CHAINS.map((c) => [c, c])),
    filterEn: {
      '원료·정제': 'Feedstock',
      '양극재·전구체': 'Cathode',
      음극재: 'Anode',
      '전해액·전해질': 'Electrolyte',
      분리막: 'Separator',
      '집전체·기타 소재': 'Collectors',
      '셀 제조': 'Cells',
      '모듈·팩·시스템 부품': 'Pack parts',
      '제조·검사 장비': 'Equipment',
      '재사용·재활용': 'Recycling',
    },
  },
  renewable: {
    key: 'renewable',
    html: 'renewable/korea_renewable_map.html',
    chains: RENEWABLE_CHAINS,
    colors: RENEWABLE_COLORS,
    retired: ['태양광', '풍력', '수소', '신재생 운영', '해상풍력'],
    labelKo: Object.fromEntries(RENEWABLE_CHAINS.map((c) => [c, c])),
    labelEn: {
      '핵심 소재·부품': 'Core materials & parts',
      '발전설비 제조': 'Generation equipment',
      '구조물·보조설비': 'Structures & auxiliaries',
      '개발·EPC': 'Development & EPC',
      '발전 운영·유지보수': 'O&M',
      '수소·연료전지': 'Hydrogen & fuel cells',
    },
    filterKo: Object.fromEntries(RENEWABLE_CHAINS.map((c) => [c, c])),
    filterEn: {
      '핵심 소재·부품': 'Materials',
      '발전설비 제조': 'Equipment',
      '구조물·보조설비': 'Structures',
      '개발·EPC': 'EPC',
      '발전 운영·유지보수': 'O&M',
      '수소·연료전지': 'Hydrogen',
    },
  },
  nuclear: {
    key: 'nuclear',
    html: 'nuclear/korea_nuclear_map.html',
    chains: NUCLEAR_CHAINS,
    colors: NUCLEAR_COLORS,
    retired: ['설계·EPC', '운영·정비', '계측·보조기기'],
    // keep 원자로·주기기 name as leaf; retire old '설계·EPC'/'운영·정비'/'계측·보조기기' labels
    labelKo: Object.fromEntries(NUCLEAR_CHAINS.map((c) => [c, c])),
    labelEn: {
      '설계·엔지니어링': 'Design & engineering',
      '건설·EPC': 'Construction & EPC',
      '원자로·주기기': 'Reactor & NSSS',
      '보조기기·소재': 'Auxiliaries & materials',
      '계측·제어': 'I&C',
      '정비·운영지원': 'Maintenance & ops support',
      '연료·해체·폐기물': 'Fuel, decommissioning & waste',
    },
    filterKo: Object.fromEntries(NUCLEAR_CHAINS.map((c) => [c, c])),
    filterEn: {
      '설계·엔지니어링': 'Design',
      '건설·EPC': 'EPC',
      '원자로·주기기': 'Reactor',
      '보조기기·소재': 'Auxiliaries',
      '계측·제어': 'I&C',
      '정비·운영지원': 'O&M',
      '연료·해체·폐기물': 'Fuel & waste',
    },
  },
  powergrid: {
    key: 'powergrid',
    html: 'powergrid/korea_powergrid_map.html',
    chains: POWERGRID_CHAINS,
    colors: POWERGRID_COLORS,
    retired: ['전력설비', '송배전', '발전설비'],
    // 전선·케이블 kept as leaf name
    labelKo: Object.fromEntries(POWERGRID_CHAINS.map((c) => [c, c])),
    labelEn: {
      변압기: 'Transformers',
      '개폐·배전기기': 'Switchgear & distribution',
      '전선·케이블': 'Wire & cable',
      '전력변환·제어': 'Power conversion & control',
      '전력망 시공·서비스': 'Grid construction & services',
      '발전·비상전원 설비': 'Generation & standby power',
      유틸리티: 'Utilities',
    },
    filterKo: Object.fromEntries(POWERGRID_CHAINS.map((c) => [c, c])),
    filterEn: {
      변압기: 'Transformers',
      '개폐·배전기기': 'Switchgear',
      '전선·케이블': 'Cable',
      '전력변환·제어': 'Conversion',
      '전력망 시공·서비스': 'Grid services',
      '발전·비상전원 설비': 'Standby power',
      유틸리티: 'Utilities',
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

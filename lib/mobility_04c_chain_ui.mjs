/**
 * §0-4 batch C leaf chains: auto / ship / shipping / defense.
 */
export const AUTO_CHAINS = [
  '완성차',
  '구동·파워트레인',
  '섀시·안전',
  '차체·내외장',
  '전장·차량 소프트웨어',
  '열관리',
  '타이어',
  '유통·모빌리티 서비스',
];

export const AUTO_COLORS = {
  완성차: '#42A5F5',
  '구동·파워트레인': '#66BB6A',
  '섀시·안전': '#EF5350',
  '차체·내외장': '#8D6E63',
  '전장·차량 소프트웨어': '#AB47BC',
  열관리: '#26C6DA',
  타이어: '#FFA726',
  '유통·모빌리티 서비스': '#78909C',
};

export const SHIP_CHAINS = [
  '조선',
  '엔진·추진',
  '선체·구조물',
  '탱크·보냉',
  '배관·의장',
  '전장·항해·제어',
  '해양플랜트 설비',
  '유지보수·개조',
];

export const SHIP_COLORS = {
  조선: '#4FC3F7',
  '엔진·추진': '#66BB6A',
  '선체·구조물': '#FFCA28',
  '탱크·보냉': '#26A69A',
  '배관·의장': '#26C6DA',
  '전장·항해·제어': '#AB47BC',
  '해양플랜트 설비': '#FFA726',
  '유지보수·개조': '#8D6E63',
};

export const SHIPPING_CHAINS = [
  '컨테이너 해운',
  '벌크 해운',
  '탱커·가스 운송',
  '자동차·특수화물 운송',
  '종합물류',
  '택배·풀필먼트',
  '포워딩·국제물류',
  '항만·터미널',
];

export const SHIPPING_COLORS = {
  '컨테이너 해운': '#42A5F5',
  '벌크 해운': '#8D6E63',
  '탱커·가스 운송': '#FFA726',
  '자동차·특수화물 운송': '#26A69A',
  종합물류: '#5C6BC0',
  '택배·풀필먼트': '#66BB6A',
  '포워딩·국제물류': '#AB47BC',
  '항만·터미널': '#78909C',
};

export const DEFENSE_CHAINS = [
  '육상체계',
  '유도무기·탄약',
  '항공체계·엔진',
  '해양 방산',
  '방산전자·센서',
  '우주·위성',
  '소재·핵심부품',
  '정비·지원',
];

export const DEFENSE_COLORS = {
  육상체계: '#8D6E63',
  '유도무기·탄약': '#EF5350',
  '항공체계·엔진': '#5C6BC0',
  '해양 방산': '#00838F',
  '방산전자·센서': '#78909C',
  '우주·위성': '#7E57C2',
  '소재·핵심부품': '#FF8A65',
  '정비·지원': '#66BB6A',
};

function labels(chains) {
  return Object.fromEntries(chains.map((c) => [c, c]));
}

export const MOBILITY_04C = {
  auto: {
    key: 'auto',
    html: 'auto/korea_auto_map.html',
    chains: AUTO_CHAINS,
    colors: AUTO_COLORS,
    retired: ['부품', '전장·ADAS', '모빌리티·유통'],
    labelKo: labels(AUTO_CHAINS),
    labelEn: {
      완성차: 'OEMs',
      '구동·파워트레인': 'Drivetrain & powertrain',
      '섀시·안전': 'Chassis & safety',
      '차체·내외장': 'Body & interior/exterior',
      '전장·차량 소프트웨어': 'Electronics & vehicle software',
      열관리: 'Thermal management',
      타이어: 'Tires',
      '유통·모빌리티 서비스': 'Distribution & mobility services',
    },
    filterKo: labels(AUTO_CHAINS),
    filterEn: {
      완성차: 'OEM',
      '구동·파워트레인': 'Powertrain',
      '섀시·안전': 'Chassis',
      '차체·내외장': 'Body',
      '전장·차량 소프트웨어': 'Electronics/SW',
      열관리: 'Thermal',
      타이어: 'Tires',
      '유통·모빌리티 서비스': 'Mobility',
    },
  },
  ship: {
    key: 'ship',
    html: 'ship/korea_ship_map.html',
    chains: SHIP_CHAINS,
    colors: SHIP_COLORS,
    retired: [
      '종합조선',
      '엔진',
      '의장/배관',
      '선체·보냉·구조재',
      '서비스·해양플랜트',
      '조선기자재',
      '기타 기자재',
      '해양플랜트',
      '방산해양',
      '철강소재',
      '해운물류',
    ],
    labelKo: labels(SHIP_CHAINS),
    labelEn: {
      조선: 'Shipbuilding',
      '엔진·추진': 'Engines & propulsion',
      '선체·구조물': 'Hull & structures',
      '탱크·보냉': 'Tanks & cryogenic insulation',
      '배관·의장': 'Piping & outfitting',
      '전장·항해·제어': 'Marine electronics & navigation',
      '해양플랜트 설비': 'Offshore plant equipment',
      '유지보수·개조': 'MRO & conversion',
    },
    filterKo: labels(SHIP_CHAINS),
    filterEn: {
      조선: 'Yards',
      '엔진·추진': 'Engines',
      '선체·구조물': 'Hull',
      '탱크·보냉': 'Tanks',
      '배관·의장': 'Outfitting',
      '전장·항해·제어': 'Electronics',
      '해양플랜트 설비': 'Offshore',
      '유지보수·개조': 'MRO',
    },
  },
  shipping: {
    key: 'shipping',
    html: 'shipping/korea_shipping_map.html',
    chains: SHIPPING_CHAINS,
    colors: SHIPPING_COLORS,
    retired: ['해운물류'],
    labelKo: labels(SHIPPING_CHAINS),
    labelEn: {
      '컨테이너 해운': 'Container shipping',
      '벌크 해운': 'Bulk shipping',
      '탱커·가스 운송': 'Tanker & gas transport',
      '자동차·특수화물 운송': 'Auto & special cargo',
      종합물류: 'Integrated logistics',
      '택배·풀필먼트': 'Parcel & fulfillment',
      '포워딩·국제물류': 'Forwarding & intl logistics',
      '항만·터미널': 'Ports & terminals',
    },
    filterKo: labels(SHIPPING_CHAINS),
    filterEn: {
      '컨테이너 해운': 'Container',
      '벌크 해운': 'Bulk',
      '탱커·가스 운송': 'Tanker/gas',
      '자동차·특수화물 운송': 'Auto/special',
      종합물류: 'Logistics',
      '택배·풀필먼트': 'Parcel',
      '포워딩·국제물류': 'Forwarding',
      '항만·터미널': 'Ports',
    },
  },
  defense: {
    key: 'defense',
    html: 'defense/korea_defense_map.html',
    chains: DEFENSE_CHAINS,
    colors: DEFENSE_COLORS,
    retired: [
      '항공기·엔진·MRO',
      '미사일·레이더·C4ISR',
      '육상무기·차량·탄약',
      '해군·함정·조선방산',
      '우주·위성·민항',
    ],
    labelKo: labels(DEFENSE_CHAINS),
    labelEn: {
      육상체계: 'Land systems',
      '유도무기·탄약': 'Missiles & munitions',
      '항공체계·엔진': 'Aerospace systems & engines',
      '해양 방산': 'Naval defense',
      '방산전자·센서': 'Defense electronics & sensors',
      '우주·위성': 'Space & satellites',
      '소재·핵심부품': 'Materials & critical parts',
      '정비·지원': 'MRO & support',
    },
    filterKo: labels(DEFENSE_CHAINS),
    filterEn: {
      육상체계: 'Land',
      '유도무기·탄약': 'Missiles',
      '항공체계·엔진': 'Aerospace',
      '해양 방산': 'Naval',
      '방산전자·센서': 'Electronics',
      '우주·위성': 'Space',
      '소재·핵심부품': 'Materials',
      '정비·지원': 'MRO',
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

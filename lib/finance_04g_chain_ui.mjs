/**
 * §0-4 batch G leaf chains: finance / holdings.
 */
export const FINANCE_CHAINS = [
  '은행·은행계 금융그룹',
  '비은행 금융그룹',
  '증권',
  '생명보험',
  '손해보험·재보험',
  '카드·캐피탈·여신금융',
  '자산운용·PE·VC',
  '결제·핀테크',
  '금융정보·평가',
  '보험판매·중개',
  '부동산금융·투자기구',
];

export const FINANCE_COLORS = {
  '은행·은행계 금융그룹': '#42A5F5',
  '비은행 금융그룹': '#5C6BC0',
  증권: '#66BB6A',
  생명보험: '#FFA726',
  '손해보험·재보험': '#FF8A65',
  '카드·캐피탈·여신금융': '#AB47BC',
  '자산운용·PE·VC': '#26A69A',
  '결제·핀테크': '#7E57C2',
  '금융정보·평가': '#78909C',
  '보험판매·중개': '#FFCA28',
  '부동산금융·투자기구': '#8D6E63',
};

export const HOLDINGS_CHAINS = [
  '복합사업',
  'IT·전자',
  '에너지·화학',
  '소재·산업재',
  '소비·유통',
  '건설·부동산',
  '운송·물류',
  '헬스케어',
  '금융',
];

export const HOLDINGS_COLORS = {
  복합사업: '#78909C',
  'IT·전자': '#42A5F5',
  '에너지·화학': '#66BB6A',
  '소재·산업재': '#8D6E63',
  '소비·유통': '#FFA726',
  '건설·부동산': '#1E88E5',
  '운송·물류': '#26C6DA',
  헬스케어: '#26A69A',
  금융: '#5C6BC0',
};

function labels(chains) {
  return Object.fromEntries(chains.map((c) => [c, c]));
}

export const FINANCE_04G = {
  finance: {
    key: 'finance',
    html: 'finance/korea_finance_map.html',
    chains: FINANCE_CHAINS,
    colors: FINANCE_COLORS,
    retired: ['은행·금융지주', '증권·자산운용', '보험', '카드·캐피탈', '기타금융'],
    labelKo: labels(FINANCE_CHAINS),
    labelEn: {
      '은행·은행계 금융그룹': 'Bank & banking groups',
      '비은행 금융그룹': 'Non-bank financial groups',
      증권: 'Securities',
      생명보험: 'Life insurance',
      '손해보험·재보험': 'P&C / reinsurance',
      '카드·캐피탈·여신금융': 'Card, capital & consumer finance',
      '자산운용·PE·VC': 'Asset mgmt / PE / VC',
      '결제·핀테크': 'Payments & fintech',
      '금융정보·평가': 'Financial info & ratings',
      '보험판매·중개': 'Insurance brokerage',
      '부동산금융·투자기구': 'RE finance / vehicles',
    },
    filterKo: {
      '은행·은행계 금융그룹': '은행',
      '비은행 금융그룹': '비은행',
      증권: '증권',
      생명보험: '생명',
      '손해보험·재보험': '손보·재보',
      '카드·캐피탈·여신금융': '카드·여신',
      '자산운용·PE·VC': '운용·PE/VC',
      '결제·핀테크': '결제·핀테크',
      '금융정보·평가': '정보·평가',
      '보험판매·중개': '보험판매',
      '부동산금융·투자기구': '부동산금융',
    },
    filterEn: {
      '은행·은행계 금융그룹': 'Banks',
      '비은행 금융그룹': 'Non-bank',
      증권: 'Securities',
      생명보험: 'Life',
      '손해보험·재보험': 'P&C',
      '카드·캐피탈·여신금융': 'Card/capital',
      '자산운용·PE·VC': 'AM/PE/VC',
      '결제·핀테크': 'Fintech',
      '금융정보·평가': 'Info/ratings',
      '보험판매·중개': 'Brokerage',
      '부동산금융·투자기구': 'RE finance',
    },
  },
  holdings: {
    key: 'holdings',
    html: 'holdings/korea_holdings_map.html',
    chains: HOLDINGS_CHAINS,
    colors: HOLDINGS_COLORS,
    retired: [
      '반도체',
      '정유·화학',
      '철강·금속·기계',
      '소비/유통',
      '건설',
      '자동차',
      '전기·전자',
      'IT·소프트웨어',
      '조선/해운',
      '여행·레저·항공',
      '방산/우주',
      '화장품',
      '콘텐츠',
      '바이오',
      '전력설비',
    ],
    /** Default classification axis label (not chain names). */
    axisLabelKo: '주요 투자·사업영역',
    axisLabelEn: 'Core investments & businesses',
    labelKo: labels(HOLDINGS_CHAINS),
    labelEn: {
      복합사업: 'Diversified',
      'IT·전자': 'IT & electronics',
      '에너지·화학': 'Energy & chemicals',
      '소재·산업재': 'Materials & industrials',
      '소비·유통': 'Consumer & retail',
      '건설·부동산': 'Construction & real estate',
      '운송·물류': 'Transport & logistics',
      헬스케어: 'Healthcare',
      금융: 'Financial holdings',
    },
    filterKo: labels(HOLDINGS_CHAINS),
    filterEn: {
      복합사업: 'Diversified',
      'IT·전자': 'IT/elec',
      '에너지·화학': 'Energy/chem',
      '소재·산업재': 'Materials',
      '소비·유통': 'Consumer',
      '건설·부동산': 'Construction',
      '운송·물류': 'Logistics',
      헬스케어: 'Healthcare',
      금융: 'Finance',
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

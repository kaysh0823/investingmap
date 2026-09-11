/**
 * §0-4 batch D leaf chains: elec / software / telecom / robot.
 */
export const ELEC_CHAINS = [
  '가전·생활기기',
  '디스플레이 패널',
  '디스플레이 장비',
  '디스플레이 소재',
  '전자부품·기판',
  '카메라·광학·센서',
  '전자제품 제조·조립',
];

export const ELEC_COLORS = {
  '가전·생활기기': '#42A5F5',
  '디스플레이 패널': '#26A69A',
  '디스플레이 장비': '#AB47BC',
  '디스플레이 소재': '#EF5350',
  '전자부품·기판': '#FFA726',
  '카메라·광학·센서': '#26C6DA',
  '전자제품 제조·조립': '#78909C',
};

export const SOFTWARE_CHAINS = [
  '인터넷 플랫폼',
  'IT서비스·SI',
  '클라우드·인터넷 인프라',
  '기업 소프트웨어',
  'AI 소프트웨어',
  '보안·인증',
  '결제·데이터 인프라',
];

export const SOFTWARE_COLORS = {
  '인터넷 플랫폼': '#42A5F5',
  'IT서비스·SI': '#26A69A',
  '클라우드·인터넷 인프라': '#26C6DA',
  '기업 소프트웨어': '#FFA726',
  'AI 소프트웨어': '#7E57C2',
  '보안·인증': '#EF5350',
  '결제·데이터 인프라': '#66BB6A',
};

export const TELECOM_CHAINS = [
  '통신서비스',
  '무선통신 장비',
  '광통신 부품·장비',
  '네트워크 장비',
  '위성통신 장비',
];

export const TELECOM_COLORS = {
  통신서비스: '#42A5F5',
  '무선통신 장비': '#26A69A',
  '광통신 부품·장비': '#AB47BC',
  '네트워크 장비': '#78909C',
  '위성통신 장비': '#FFA726',
};

export const ROBOT_CHAINS = [
  '완성로봇',
  '구동부품',
  '센싱·정밀부품',
  '제어·로봇 소프트웨어',
  '자동화·시스템 통합',
];

export const ROBOT_COLORS = {
  완성로봇: '#4FC3F7',
  구동부품: '#66BB6A',
  '센싱·정밀부품': '#EF5350',
  '제어·로봇 소프트웨어': '#AB47BC',
  '자동화·시스템 통합': '#26C6DA',
};

function labels(chains) {
  return Object.fromEntries(chains.map((c) => [c, c]));
}

export const TECH_04D = {
  elec: {
    key: 'elec',
    html: 'elec/korea_elec_map.html',
    chains: ELEC_CHAINS,
    colors: ELEC_COLORS,
    retired: ['가전', '디스플레이', '카메라·모듈', '전자부품'],
    labelKo: labels(ELEC_CHAINS),
    labelEn: {
      '가전·생활기기': 'Appliances & lifestyle devices',
      '디스플레이 패널': 'Display panels',
      '디스플레이 장비': 'Display equipment',
      '디스플레이 소재': 'Display materials',
      '전자부품·기판': 'Electronic components & boards',
      '카메라·광학·센서': 'Camera, optics & sensors',
      '전자제품 제조·조립': 'Electronics manufacturing & assembly',
    },
    filterKo: labels(ELEC_CHAINS),
    filterEn: {
      '가전·생활기기': 'Appliances',
      '디스플레이 패널': 'Panels',
      '디스플레이 장비': 'Equipment',
      '디스플레이 소재': 'Materials',
      '전자부품·기판': 'Components',
      '카메라·광학·센서': 'Optics/sensors',
      '전자제품 제조·조립': 'EMS/assembly',
    },
  },
  software: {
    key: 'software',
    html: 'software/korea_software_map.html',
    chains: SOFTWARE_CHAINS,
    colors: SOFTWARE_COLORS,
    retired: ['플랫폼·AI', 'SI·클라우드', '기업SW·SaaS', '보안', '결제·핀테크'],
    labelKo: labels(SOFTWARE_CHAINS),
    labelEn: {
      '인터넷 플랫폼': 'Internet platforms',
      'IT서비스·SI': 'IT services & SI',
      '클라우드·인터넷 인프라': 'Cloud & internet infrastructure',
      '기업 소프트웨어': 'Enterprise software',
      'AI 소프트웨어': 'AI software',
      '보안·인증': 'Security & authentication',
      '결제·데이터 인프라': 'Payments & data infrastructure',
    },
    filterKo: labels(SOFTWARE_CHAINS),
    filterEn: {
      '인터넷 플랫폼': 'Platforms',
      'IT서비스·SI': 'IT/SI',
      '클라우드·인터넷 인프라': 'Cloud/infra',
      '기업 소프트웨어': 'Enterprise SW',
      'AI 소프트웨어': 'AI SW',
      '보안·인증': 'Security',
      '결제·데이터 인프라': 'Payments/data',
    },
  },
  telecom: {
    key: 'telecom',
    html: 'telecom/korea_telecom_map.html',
    chains: TELECOM_CHAINS,
    colors: TELECOM_COLORS,
    retired: ['무선장비', '광통신', '위성통신'],
    labelKo: labels(TELECOM_CHAINS),
    labelEn: {
      통신서비스: 'Telecom services',
      '무선통신 장비': 'Wireless equipment',
      '광통신 부품·장비': 'Optical components & equipment',
      '네트워크 장비': 'Network equipment',
      '위성통신 장비': 'Satellite communications equipment',
    },
    filterKo: labels(TELECOM_CHAINS),
    filterEn: {
      통신서비스: 'Services',
      '무선통신 장비': 'Wireless',
      '광통신 부품·장비': 'Optical',
      '네트워크 장비': 'Network',
      '위성통신 장비': 'Satellite',
    },
  },
  robot: {
    key: 'robot',
    html: 'robot/korea_robot_map.html',
    chains: ROBOT_CHAINS,
    colors: ROBOT_COLORS,
    retired: [
      '완성로봇·플랫폼',
      '액추에이터·모터',
      '감속기·동력전달',
      '센서·비전·정밀부품',
      '제어·모션·로봇SW',
      '자동화·SI·물류시스템',
    ],
    labelKo: labels(ROBOT_CHAINS),
    labelEn: {
      완성로봇: 'Complete robots',
      구동부품: 'Drive components',
      '센싱·정밀부품': 'Sensing & precision parts',
      '제어·로봇 소프트웨어': 'Control & robot software',
      '자동화·시스템 통합': 'Automation & system integration',
    },
    filterKo: labels(ROBOT_CHAINS),
    filterEn: {
      완성로봇: 'Robots',
      구동부품: 'Drive parts',
      '센싱·정밀부품': 'Sensing/parts',
      '제어·로봇 소프트웨어': 'Control/SW',
      '자동화·시스템 통합': 'Automation/SI',
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

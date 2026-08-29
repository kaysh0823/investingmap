/**
 * Phase 5I — robot component / product / category canonical (map fields only).
 * Max 3 products, 2 categories, 2 applications per company. No invented supply/deploy.
 */
export const FORBIDDEN_GENERIC_ROBOT_IDS = new Set([
  'robot:item', 'product:item', 'component:item', 'technology:item',
  'application:item', 'market:item', 'partner:item',
  'robot_product:item', 'robot_category:item', 'robot_component:item',
  'reducer:item', 'actuator:item', 'sensor:item',
]);

/** @type {Record<string, object>} */
export const ROBOT_FOCUS_BY_TICKER = {
  '277810': {
    lane: 'industrial_robot',
    products: [
      { id: 'robot_product:hubo-platform', nameKo: 'HUBO·휴머노이드 플랫폼', nameEn: 'HUBO / humanoid platform', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:humanoid', nameKo: '휴머노이드', nameEn: 'Humanoid' },
      { id: 'robot_category:dual-arm', nameKo: '양팔·매니퓰레이터', nameEn: 'Dual-arm / manipulator' },
    ],
    applications: [
      { id: 'application:manufacturing', nameKo: '제조', nameEn: 'Manufacturing' },
      { id: 'application:service', nameKo: '서비스', nameEn: 'Service' },
    ],
  },
  '454910': {
    lane: 'collaborative_robot',
    products: [
      { id: 'robot_product:doosan-cobot-series', nameKo: 'A/M/H 협동로봇', nameEn: 'A/M/H cobot series', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:collaborative', nameKo: '협동로봇', nameEn: 'Collaborative robot' },
    ],
    applications: [
      { id: 'application:manufacturing', nameKo: '제조', nameEn: 'Manufacturing' },
      { id: 'application:palletizing', nameKo: '팔레타이징', nameEn: 'Palletizing' },
    ],
  },
  '090710': {
    lane: 'industrial_robot',
    products: [
      { id: 'robot_product:hyulim-industrial-service', nameKo: '제조·서비스 로봇', nameEn: 'Industrial / service robots', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:industrial', nameKo: '산업용 로봇', nameEn: 'Industrial robot' },
      { id: 'robot_category:service', nameKo: '서비스 로봇', nameEn: 'Service robot' },
    ],
    applications: [
      { id: 'application:manufacturing', nameKo: '제조', nameEn: 'Manufacturing' },
    ],
  },
  '090360': {
    lane: 'industrial_robot',
    products: [
      { id: 'robot_product:robostar-scara-articulated', nameKo: '스카라·다관절 로봇', nameEn: 'SCARA / articulated robots', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:industrial', nameKo: '산업용 로봇', nameEn: 'Industrial robot' },
    ],
    applications: [
      { id: 'application:manufacturing', nameKo: '제조', nameEn: 'Manufacturing' },
    ],
  },
  '388720': {
    lane: 'industrial_robot',
    products: [
      { id: 'robot_product:yuil-pick-transfer', nameKo: '피킹·이송 로봇 시스템', nameEn: 'Picking / transfer systems', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:industrial', nameKo: '산업용 로봇', nameEn: 'Industrial robot' },
      { id: 'robot_category:logistics', nameKo: '물류 로봇', nameEn: 'Logistics robot' },
    ],
    applications: [
      { id: 'application:logistics', nameKo: '물류', nameEn: 'Logistics' },
    ],
  },
  '056080': {
    lane: 'logistics_robot',
    products: [
      { id: 'robot_product:yujin-iclebo-amr', nameKo: 'iClebo·AMR', nameEn: 'iClebo / AMR', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:amr', nameKo: '자율주행 로봇', nameEn: 'Autonomous mobile robot' },
      { id: 'robot_category:service', nameKo: '서비스 로봇', nameEn: 'Service robot' },
    ],
    applications: [
      { id: 'application:logistics', nameKo: '물류', nameEn: 'Logistics' },
      { id: 'application:service', nameKo: '서비스', nameEn: 'Service' },
    ],
  },
  '348340': {
    lane: 'collaborative_robot',
    products: [
      { id: 'robot_product:neuromeka-indy', nameKo: 'Indy 협동로봇', nameEn: 'Indy cobot', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:collaborative', nameKo: '협동로봇', nameEn: 'Collaborative robot' },
    ],
    applications: [
      { id: 'application:manufacturing', nameKo: '제조', nameEn: 'Manufacturing' },
    ],
  },
  '117730': {
    lane: 'industrial_robot',
    products: [
      { id: 'robot_product:t-robotics-transfer-amr', nameKo: '이송로봇·AMR', nameEn: 'Transfer robot / AMR', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:industrial', nameKo: '산업용 로봇', nameEn: 'Industrial robot' },
      { id: 'robot_category:amr', nameKo: '자율주행 로봇', nameEn: 'Autonomous mobile robot' },
    ],
    applications: [
      { id: 'application:semiconductor-display', nameKo: '반도체·디스플레이', nameEn: 'Semiconductor / display' },
    ],
  },
  '108490': {
    lane: 'actuator_drive',
    products: [
      { id: 'actuator:dynamixel', nameKo: 'DYNAMIXEL 액추에이터', nameEn: 'DYNAMIXEL actuator', edge: 'produces_component' },
      { id: 'robot_product:openmanipulator', nameKo: 'OPENMANIPULATOR', nameEn: 'OPENMANIPULATOR', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:actuator-module', nameKo: '액추에이터·모듈', nameEn: 'Actuator / module' },
    ],
    applications: [
      { id: 'application:research-education', nameKo: '연구·교육', nameEn: 'Research / education' },
    ],
  },
  '160190': {
    lane: 'actuator_drive',
    products: [
      { id: 'actuator:higen-servo', nameKo: '서보모터·드라이브', nameEn: 'Servo motor / drive', edge: 'produces_component' },
    ],
    categories: [
      { id: 'robot_category:servo-drive', nameKo: '서보·드라이브', nameEn: 'Servo / drive' },
    ],
    applications: [
      { id: 'application:manufacturing', nameKo: '제조', nameEn: 'Manufacturing' },
    ],
  },
  '058610': {
    lane: 'precision_component',
    products: [
      { id: 'reducer:precision-geared', nameKo: '정밀 감속기·기어드모터', nameEn: 'Precision reducer / geared motor', edge: 'produces_component' },
    ],
    categories: [
      { id: 'robot_category:reducer', nameKo: '감속기', nameEn: 'Reducer' },
    ],
    applications: [
      { id: 'application:robot-drive-train', nameKo: '로봇 구동계', nameEn: 'Robot drivetrain' },
    ],
  },
  '389500': {
    lane: 'precision_component',
    products: [
      { id: 'reducer:harmonic', nameKo: '하모닉 감속기', nameEn: 'Harmonic reducer', edge: 'produces_component' },
    ],
    categories: [
      { id: 'robot_category:reducer', nameKo: '감속기', nameEn: 'Reducer' },
    ],
    applications: [
      { id: 'application:robot-drive-train', nameKo: '로봇 구동계', nameEn: 'Robot drivetrain' },
    ],
  },
  '125490': {
    lane: 'precision_component',
    products: [
      { id: 'robot_component:precision-die-cast', nameKo: '정밀 다이캐스팅 부품', nameEn: 'Precision die-cast parts', edge: 'produces_component' },
    ],
    categories: [
      { id: 'robot_category:precision-structure', nameKo: '정밀 구조·열관리', nameEn: 'Precision structure / thermal' },
    ],
    applications: [
      { id: 'application:robot-structure', nameKo: '로봇 구조', nameEn: 'Robot structure' },
      { id: 'application:automotive-electronics', nameKo: '전장·자율주행 하우징', nameEn: 'ADAS / electronics housings' },
    ],
  },
  '466100': {
    lane: 'robot_software',
    products: [
      { id: 'robot_software:croms', nameKo: 'CROMS 통합관제', nameEn: 'CROMS orchestration', edge: 'develops' },
      { id: 'robot_software:chameleon-nav', nameKo: 'CHAMELEON 자율주행', nameEn: 'CHAMELEON navigation', edge: 'develops' },
    ],
    categories: [
      { id: 'robot_category:fleet-software', nameKo: '관제·자율주행 SW', nameEn: 'Fleet / navigation SW' },
    ],
    applications: [
      { id: 'application:heterogeneous-fleet', nameKo: '이기종 로봇 관제', nameEn: 'Heterogeneous fleet' },
    ],
  },
  '319400': {
    lane: 'system_integration',
    products: [
      { id: 'robot_product:hd-movex-smart-logistics', nameKo: '스마트물류·자동화', nameEn: 'Smart logistics / automation', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:logistics-automation', nameKo: '물류 자동화', nameEn: 'Logistics automation' },
    ],
    applications: [
      { id: 'application:logistics', nameKo: '물류', nameEn: 'Logistics' },
    ],
  },
  '056190': {
    lane: 'system_integration',
    products: [
      { id: 'robot_product:sfa-smart-factory-logistics', nameKo: '스마트팩토리·공정물류', nameEn: 'Smart factory / process logistics', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:factory-automation', nameKo: '공장 자동화', nameEn: 'Factory automation' },
    ],
    applications: [
      { id: 'application:semiconductor-display', nameKo: '반도체·디스플레이', nameEn: 'Semiconductor / display' },
      { id: 'application:manufacturing', nameKo: '제조', nameEn: 'Manufacturing' },
    ],
  },
  '475400': {
    lane: 'system_integration',
    products: [
      { id: 'robot_product:cmes-pick-palletize', nameKo: '피킹·팔레타이징 SI', nameEn: 'Picking / palletizing SI', edge: 'produces_robot' },
    ],
    categories: [
      { id: 'robot_category:vision-si', nameKo: 'AI비전·SI', nameEn: 'AI vision / SI' },
    ],
    applications: [
      { id: 'application:logistics', nameKo: '물류', nameEn: 'Logistics' },
      { id: 'application:palletizing', nameKo: '팔레타이징', nameEn: 'Palletizing' },
    ],
  },
};

export function focusForTicker(ticker) {
  const spec = ROBOT_FOCUS_BY_TICKER[ticker];
  if (!spec) return [];
  const out = [];
  for (const p of (spec.products || []).slice(0, 3)) {
    let nodeType = 'robot_product';
    if (p.id.startsWith('reducer:')) nodeType = 'reducer';
    else if (p.id.startsWith('actuator:')) nodeType = 'actuator';
    else if (p.id.startsWith('sensor:')) nodeType = 'sensor';
    else if (p.id.startsWith('robot_controller:')) nodeType = 'controller';
    else if (p.id.startsWith('robot_software:')) nodeType = 'robot_software';
    else if (p.id.startsWith('robot_component:')) nodeType = 'robot_component';
    out.push({
      id: p.id, nameKo: p.nameKo, nameEn: p.nameEn,
      type: p.edge || 'produces_robot', nodeType, lane: spec.lane,
    });
  }
  for (const c of (spec.categories || []).slice(0, 2)) {
    out.push({
      id: c.id, nameKo: c.nameKo, nameEn: c.nameEn,
      type: 'member_of_category', nodeType: 'robot_category', lane: spec.lane,
    });
  }
  for (const a of (spec.applications || []).slice(0, 2)) {
    out.push({
      id: a.id, nameKo: a.nameKo, nameEn: a.nameEn,
      type: 'supports_application', nodeType: 'application', lane: 'end_market',
    });
  }
  return out;
}

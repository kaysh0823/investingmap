/**
 * Phase 5H — telecom service / equipment / spectrum canonical (map fields only).
 * No invented equipment supply, MVNO contracts, or license nodes without identifiers.
 */
export const FORBIDDEN_GENERIC_TELECOM_IDS = new Set([
  'service:item', 'equipment:item', 'network:item', 'spectrum:item',
  'asset:item', 'platform:item', 'telecom_service:item', 'network_equipment:item',
  'network_component:item', 'telecom_license:item',
]);

/** @type {Record<string, object>} */
export const TELECOM_FOCUS_BY_TICKER = {
  '017670': {
    lane: 'network_operator',
    services: [{ id: 'telecom_service:skt-mobile', nameKo: '이동통신 서비스', nameEn: 'Mobile service', edge: 'offers_service' }],
    generations: [{ id: 'network_generation:5g', nameKo: '5G', nameEn: '5G' }],
  },
  '030200': {
    lane: 'network_operator',
    services: [{ id: 'telecom_service:kt-mobile-fixed', nameKo: '이동·유선 통신', nameEn: 'Mobile / fixed telecom', edge: 'offers_service' }],
    generations: [{ id: 'network_generation:5g', nameKo: '5G', nameEn: '5G' }],
  },
  '032640': {
    lane: 'network_operator',
    services: [{ id: 'telecom_service:lgu-mobile', nameKo: '이동통신 서비스', nameEn: 'Mobile service', edge: 'offers_service' }],
    generations: [{ id: 'network_generation:5g', nameKo: '5G', nameEn: '5G' }],
  },
  '010170': {
    lane: 'optical_wireless_component',
    components: [{ id: 'network_component:optical-fiber-cable', nameKo: '광케이블·광통신', nameEn: 'Optical fiber / cable', edge: 'produces_component' }],
    generations: [{ id: 'network_generation:optical-transport', nameKo: '광전송', nameEn: 'Optical transport' }],
  },
  '218410': {
    lane: 'network_equipment',
    equipment: [{ id: 'network_equipment:rf-power-amplifier', nameKo: 'RF 전력증폭', nameEn: 'RF power amplifier', edge: 'manufactures_equipment' }],
    generations: [{ id: 'network_generation:5g', nameKo: '5G', nameEn: '5G' }],
  },
  '032500': {
    lane: 'network_equipment',
    equipment: [{ id: 'network_equipment:base-station-antenna', nameKo: '기지국 안테나·RF', nameEn: 'Base-station antenna / RF', edge: 'manufactures_equipment' }],
    generations: [{ id: 'network_generation:5g', nameKo: '5G', nameEn: '5G' }],
  },
  '050890': {
    lane: 'network_equipment',
    equipment: [{ id: 'network_equipment:das-small-cell', nameKo: 'DAS·스몰셀', nameEn: 'DAS / small cell', edge: 'manufactures_equipment' }],
    generations: [{ id: 'network_generation:5g', nameKo: '5G', nameEn: '5G' }],
  },
  '037460': {
    lane: 'network_equipment',
    equipment: [{ id: 'network_equipment:rf-module', nameKo: 'RF 모듈', nameEn: 'RF module', edge: 'manufactures_equipment' }],
    generations: [{ id: 'network_generation:5g', nameKo: '5G', nameEn: '5G' }],
  },
  '138080': {
    lane: 'optical_wireless_component',
    components: [{ id: 'network_component:optical-transceiver', nameKo: '광트랜시버', nameEn: 'Optical transceiver', edge: 'produces_component' }],
    generations: [{ id: 'network_generation:optical-transport', nameKo: '광전송', nameEn: 'Optical transport' }],
  },
  '069540': {
    lane: 'optical_wireless_component',
    components: [{ id: 'network_component:optical-module', nameKo: '광모듈', nameEn: 'Optical module', edge: 'produces_component' }],
    generations: [{ id: 'network_generation:optical-transport', nameKo: '광전송', nameEn: 'Optical transport' }],
  },
  '230240': {
    lane: 'network_equipment',
    equipment: [{ id: 'network_equipment:xhaul-transport', nameKo: 'Xhaul·전송장비', nameEn: 'Xhaul / transport equipment', edge: 'manufactures_equipment' }],
    generations: [{ id: 'network_generation:5g', nameKo: '5G', nameEn: '5G' }],
  },
};

export function focusForTicker(ticker) {
  const spec = TELECOM_FOCUS_BY_TICKER[ticker];
  if (!spec) return [];
  const out = [];
  for (const s of (spec.services || []).slice(0, 2)) {
    out.push({
      id: s.id, nameKo: s.nameKo, nameEn: s.nameEn,
      type: s.edge || 'offers_service', nodeType: 'telecom_service', lane: spec.lane,
    });
  }
  for (const e of (spec.equipment || []).slice(0, 2)) {
    out.push({
      id: e.id, nameKo: e.nameKo, nameEn: e.nameEn,
      type: e.edge || 'manufactures_equipment', nodeType: 'network_equipment', lane: spec.lane,
    });
  }
  for (const c of (spec.components || []).slice(0, 2)) {
    out.push({
      id: c.id, nameKo: c.nameKo, nameEn: c.nameEn,
      type: c.edge || 'produces_component', nodeType: 'network_component', lane: spec.lane,
    });
  }
  for (const g of (spec.generations || []).slice(0, 1)) {
    out.push({
      id: g.id, nameKo: g.nameKo, nameEn: g.nameEn,
      type: 'supports_network_generation', nodeType: 'network_generation', lane: spec.lane,
    });
  }
  return out;
}

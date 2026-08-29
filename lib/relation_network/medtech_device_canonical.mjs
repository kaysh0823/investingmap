/**
 * Phase 5G — medtech device / specialty canonical IDs (map fields only).
 * Max 3 device categories, 2 specialties per listed company.
 * No clearance nodes without verified authority identifiers.
 */

export const FORBIDDEN_GENERIC_MEDTECH_IDS = new Set([
  'device:item',
  'product:item',
  'medical_device:item',
  'technology:item',
  'indication:item',
  'market:item',
  'clearance:item',
  'device_category:item',
  'specialty:item',
]);

/**
 * @type {Record<string, object>}
 */
export const MEDTECH_FOCUS_BY_TICKER = {
  '096530': {
    lane: 'in_vitro_diagnostics',
    deviceCategories: [
      { id: 'device_category:molecular-ivd', nameKo: '분자진단 IVD', nameEn: 'Molecular IVD' },
    ],
    specialties: [
      { id: 'specialty:laboratory-medicine', nameKo: '진단검사의학', nameEn: 'Laboratory medicine' },
    ],
    provenance: { sourceType: 'map_fields', title: 'medtech map — Seegene molecular IVD' },
  },
  '328130': {
    lane: 'digital_health_samd',
    deviceCategories: [
      { id: 'device_category:ai-imaging-samd', nameKo: 'AI 영상 판독 SaMD', nameEn: 'AI imaging SaMD' },
    ],
    specialties: [
      { id: 'specialty:radiology', nameKo: '영상의학', nameEn: 'Radiology' },
    ],
    provenance: { sourceType: 'map_fields', title: 'medtech map — Lunit AI imaging / SaMD' },
  },
  '137310': {
    lane: 'in_vitro_diagnostics',
    deviceCategories: [
      { id: 'device_category:poc-ivd', nameKo: '현장진단·면역 IVD', nameEn: 'POC / immunoassay IVD' },
    ],
    specialties: [
      { id: 'specialty:laboratory-medicine', nameKo: '진단검사의학', nameEn: 'Laboratory medicine' },
    ],
    provenance: { sourceType: 'map_fields', title: 'medtech map — SD Biosensor IVD' },
  },
  '041830': {
    lane: 'patient_monitoring',
    deviceCategories: [
      { id: 'device_category:body-composition', nameKo: '체성분·생체전기분석', nameEn: 'Body composition / BIA' },
    ],
    specialties: [
      { id: 'specialty:preventive-wellness', nameKo: '예방·웰니스 측정', nameEn: 'Preventive / wellness measurement' },
    ],
    provenance: { sourceType: 'map_fields', title: 'medtech map — InBody analyzers' },
  },
  '099190': {
    lane: 'in_vitro_diagnostics',
    deviceCategories: [
      { id: 'device_category:glucose-monitoring', nameKo: '혈당측정 IVD', nameEn: 'Blood glucose monitoring IVD' },
    ],
    specialties: [
      { id: 'specialty:endocrinology', nameKo: '내분비·당뇨', nameEn: 'Endocrinology / diabetes' },
    ],
    provenance: { sourceType: 'map_fields', title: 'medtech map — i-SENS glucose IVD' },
  },
  '060280': {
    lane: 'surgical_device',
    deviceCategories: [
      { id: 'device_category:surgical-robot', nameKo: '수술·정형 로봇', nameEn: 'Surgical / orthopedic robots' },
    ],
    specialties: [
      { id: 'specialty:orthopedics-surgery', nameKo: '정형·수술', nameEn: 'Orthopedics / surgery' },
    ],
    provenance: { sourceType: 'map_fields', title: 'medtech map — Curexo surgical equipment' },
  },
  '145720': {
    lane: 'dental_device',
    deviceCategories: [
      { id: 'device_category:dental-implant', nameKo: '치과 임플란트', nameEn: 'Dental implants' },
    ],
    specialties: [
      { id: 'specialty:dentistry', nameKo: '치과', nameEn: 'Dentistry' },
    ],
    provenance: { sourceType: 'map_fields', title: 'medtech map — Dentium dental implants' },
  },
  '067630': {
    lane: 'in_vitro_diagnostics',
    deviceCategories: [
      { id: 'device_category:ivd-reagents-distribution', nameKo: 'IVD·진단 관련 제품', nameEn: 'IVD / diagnostic-related products' },
    ],
    specialties: [
      { id: 'specialty:laboratory-medicine', nameKo: '진단검사의학', nameEn: 'Laboratory medicine' },
    ],
    provenance: { sourceType: 'map_fields', title: 'medtech map — HLB Life Science IVD chain' },
  },
  '389650': {
    lane: 'surgical_device',
    deviceCategories: [
      { id: 'device_category:embolization-device', nameKo: '색전·인터벤션 기기', nameEn: 'Embolization / intervention devices' },
    ],
    specialties: [
      { id: 'specialty:interventional', nameKo: '인터벤션', nameEn: 'Interventional' },
    ],
    provenance: { sourceType: 'map_fields', title: 'medtech map — Next Biomedical surgical devices' },
  },
  '228760': {
    lane: 'in_vitro_diagnostics',
    deviceCategories: [
      { id: 'device_category:cancer-molecular-dx', nameKo: '암 분자진단', nameEn: 'Cancer molecular diagnostics' },
    ],
    specialties: [
      { id: 'specialty:laboratory-medicine', nameKo: '진단검사의학', nameEn: 'Laboratory medicine' },
      { id: 'specialty:oncology-diagnostics', nameKo: '종양 진단', nameEn: 'Oncology diagnostics' },
    ],
    provenance: { sourceType: 'map_fields', title: 'medtech map — GenomicTree molecular cancer DX' },
  },
};

/**
 * @param {string} ticker
 * @returns {{ id: string, nameKo: string, nameEn: string, type: string, nodeType: string, lane?: string }[]}
 */
export function focusForTicker(ticker) {
  const spec = MEDTECH_FOCUS_BY_TICKER[ticker];
  if (!spec) return [];
  const out = [];
  for (const d of spec.deviceCategories || []) {
    out.push({
      id: d.id,
      nameKo: d.nameKo,
      nameEn: d.nameEn,
      type: 'specializes_in',
      nodeType: 'device_category',
      lane: spec.lane,
    });
  }
  for (const s of (spec.specialties || []).slice(0, 2)) {
    out.push({
      id: s.id,
      nameKo: s.nameKo,
      nameEn: s.nameEn,
      type: 'used_in_specialty',
      nodeType: 'clinical_specialty',
      lane: spec.lane,
    });
  }
  return out;
}

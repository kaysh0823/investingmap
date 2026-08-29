/**
 * Phase 5E — cosmetics brand / product / service canonical IDs (map fields + public brand portfolios).
 * Max 3 brands, 2 product categories, 2 manufacturing roles per listed company.
 */

export const FORBIDDEN_GENERIC_COSMETICS_IDS = new Set([
  'brand:item',
  'product:item',
  'beauty_product:item',
  'ingredient:item',
  'market:item',
  'channel:item',
  'packaging:item',
  'manufacturing_service:item',
]);

/**
 * @type {Record<string, object>}
 */
export const COSMETICS_FOCUS_BY_TICKER = {
  '278470': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:medicube', nameKo: '메디큐브', nameEn: 'Medicube', edgeType: 'operates_brand' },
      { id: 'brand:apr', nameKo: 'APR', nameEn: 'APR', edgeType: 'operates_brand' },
    ],
    productCategories: [
      { id: 'beauty_product:skincare_devices', nameKo: '스킨케어·뷰티디바이스', nameEn: 'Skincare & beauty devices' },
    ],
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — APR/Medicube brand owner' },
  },
  '090430': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:laneige', nameKo: '라네즈', nameEn: 'Laneige', edgeType: 'operates_brand' },
      { id: 'brand:sulwhasoo', nameKo: '설화수', nameEn: 'Sulwhasoo', edgeType: 'operates_brand' },
      { id: 'brand:innisfree', nameKo: '이니스프리', nameEn: 'innisfree', edgeType: 'operates_brand' },
    ],
    productCategories: [
      { id: 'beauty_product:skincare_color', nameKo: '스킨케어·색조', nameEn: 'Skincare & color cosmetics' },
    ],
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Amorepacific flagship brands' },
  },
  '051900': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:whoo', nameKo: '후', nameEn: 'The History of Whoo', edgeType: 'operates_brand' },
      { id: 'brand:ohui', nameKo: '오휘', nameEn: 'O HUI', edgeType: 'operates_brand' },
      { id: 'brand:sum37', nameKo: '숨37', nameEn: 'su:m37°', edgeType: 'operates_brand' },
    ],
    productCategories: [
      { id: 'beauty_product:skincare_premium', nameKo: '프리미엄 스킨케어', nameEn: 'Premium skincare' },
    ],
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — LG H&H brand portfolio' },
  },
  '483650': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:dalba', nameKo: '달바', nameEn: "d'Alba", edgeType: 'operates_brand' },
    ],
    productCategories: [
      { id: 'beauty_product:skincare_suncare', nameKo: '스킨케어·선케어', nameEn: 'Skincare & suncare' },
    ],
    provenance: { sourceType: 'map_fields', title: "cosmetics map — d'Alba Global brand" },
  },
  '002790': {
    lane: 'brand_owner',
    specializesIn: {
      id: 'beauty_product:beauty_holding', nameKo: '화장품 지주·지배구조', nameEn: 'Beauty holding & governance',
    },
    productCategories: [
      { id: 'beauty_product:holding_structure', nameKo: '지주·자회사 브랜드 지배', nameEn: 'Holding structure for brand subsidiaries' },
    ],
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Amorepacific Holdings (not direct brand operator)' },
  },
  '018290': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:vt', nameKo: 'VT', nameEn: 'VT Cosmetics', edgeType: 'operates_brand' },
    ],
    productCategories: [
      { id: 'beauty_product:skincare_color', nameKo: '스킨케어·색조', nameEn: 'Skincare & color cosmetics' },
    ],
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — VT brand owner' },
  },
  '161890': {
    lane: 'odm_oem',
    specializesIn: {
      id: 'manufacturing_service:cosmetics_odm', nameKo: '화장품 ODM', nameEn: 'Cosmetics ODM',
    },
    serviceType: 'odm',
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Kolmar ODM·OEM chain' },
  },
  '192820': {
    lane: 'odm_oem',
    specializesIn: {
      id: 'manufacturing_service:cosmetics_odm', nameKo: '화장품 ODM', nameEn: 'Cosmetics ODM',
    },
    serviceType: 'odm',
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Cosmax ODM·OEM chain' },
  },
  '241710': {
    lane: 'odm_oem',
    specializesIn: {
      id: 'manufacturing_service:cosmetics_odm', nameKo: '화장품 ODM', nameEn: 'Cosmetics ODM',
    },
    serviceType: 'odm',
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Cosmecca ODM·OEM chain' },
  },
  '257720': {
    lane: 'distributor',
    specializesIn: {
      id: 'channel:cross_border_distribution', nameKo: '크로스보더 K-뷰티 유통', nameEn: 'Cross-border K-beauty distribution',
    },
    productCategories: [
      { id: 'beauty_product:multi_brand_distribution', nameKo: '멀티브랜드 유통·소싱', nameEn: 'Multi-brand distribution & sourcing' },
    ],
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Silicon2 distribution channel' },
  },
  '145020': {
    lane: 'beauty_device',
    specializesIn: {
      id: 'beauty_product:botulinum_filler', nameKo: '보툴리눔·필러', nameEn: 'Botulinum toxin & dermal fillers',
    },
    productCategories: [
      { id: 'beauty_product:aesthetic_injectables', nameKo: '에스테틱 주사제', nameEn: 'Aesthetic injectables' },
    ],
    crossSector: 'sector:medtech',
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Hugel botulinum/filler aesthetics' },
  },
  '214150': {
    lane: 'beauty_device',
    specializesIn: {
      id: 'beauty_product:hifu_rf_devices', nameKo: 'HIFU·RF 미용기기', nameEn: 'HIFU & RF aesthetic devices',
    },
    productCategories: [
      { id: 'beauty_product:aesthetic_energy_devices', nameKo: '에너지 기반 에스테틱 장비', nameEn: 'Energy-based aesthetic devices' },
    ],
    crossSector: 'sector:medtech',
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Classys Shurink/Volnewmer devices' },
  },
  '214450': {
    lane: 'beauty_device',
    specializesIn: {
      id: 'beauty_product:aesthetic_regenerative', nameKo: '재생·에스테틱', nameEn: 'Regenerative aesthetics',
    },
    productCategories: [
      { id: 'beauty_product:skin_booster', nameKo: '스킨부스터·에스테틱', nameEn: 'Skin booster aesthetics' },
    ],
    crossSector: 'sector:medtech',
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Pharmaresearch (primary medtech sector)' },
  },
  '336570': {
    lane: 'beauty_device',
    specializesIn: {
      id: 'beauty_product:laser_aesthetic_devices', nameKo: '레이저·에스테틱 기기', nameEn: 'Laser aesthetic devices',
    },
    productCategories: [
      { id: 'beauty_product:home_clinic_devices', nameKo: '홈·클리닉 미용기기', nameEn: 'Home & clinic aesthetic devices' },
    ],
    crossSector: 'sector:medtech',
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Wontech aesthetic devices' },
  },
  '214370': {
    lane: 'beauty_device',
    specializesIn: {
      id: 'beauty_product:peptide_aesthetics', nameKo: '펩타이드 기반 미용', nameEn: 'Peptide-based aesthetics',
    },
    productCategories: [
      { id: 'beauty_product:peptide_skincare', nameKo: '펩타이드 스킨케어', nameEn: 'Peptide skincare' },
    ],
    crossSector: 'sector:bio',
    provenance: { sourceType: 'map_fields', title: 'cosmetics map — Caregen peptide aesthetics' },
  },
};

/**
 * @param {string} ticker
 * @returns {object[]}
 */
export function focusForTicker(ticker) {
  const spec = COSMETICS_FOCUS_BY_TICKER[ticker];
  if (!spec) return [];
  const out = [];
  if (spec.specializesIn) {
    out.push({
      type: 'specializes_in',
      id: spec.specializesIn.id,
      nameKo: spec.specializesIn.nameKo,
      nameEn: spec.specializesIn.nameEn,
      lane: spec.lane,
      nodeType: spec.specializesIn.id.startsWith('manufacturing_service:') ? 'manufacturing_service'
        : spec.specializesIn.id.startsWith('channel:') ? 'retail_channel' : 'beauty_product',
    });
  }
  for (const b of spec.brands || []) {
    out.push({
      type: b.edgeType || 'operates_brand',
      id: b.id,
      nameKo: b.nameKo,
      nameEn: b.nameEn,
      lane: spec.lane,
      nodeType: 'brand',
    });
  }
  for (const p of spec.productCategories || []) {
    out.push({
      type: 'used_in_product_category',
      id: p.id,
      nameKo: p.nameKo,
      nameEn: p.nameEn,
      lane: spec.lane,
      nodeType: 'product_category',
    });
  }
  if (spec.serviceType === 'odm') {
    out.push({
      type: 'provides_odm',
      id: 'manufacturing_service:cosmetics_odm',
      nameKo: '화장품 ODM 서비스', nameEn: 'Cosmetics ODM services',
      lane: spec.lane,
      nodeType: 'manufacturing_service',
    });
  }
  return out.slice(0, 5);
}

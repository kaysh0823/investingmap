/**
 * Phase 5D — metal sector product/commodity canonical IDs (from METAL_CONFIG + map fields).
 */

export const FORBIDDEN_GENERIC_METAL_IDS = new Set([
  'metal_product:item',
  'metal_product:product',
  'metal_product:metal',
  'metal_product:material',
  'commodity:item',
  'commodity:metal',
  'alloy:item',
  'process:item',
  'metal:item',
  'material:item',
]);

/**
 * Per-ticker structural focus — max 3 edges (specializes_in, produces, exposed_to_commodity / used_in_end_market).
 * @type {Record<string, object>}
 */
export const METAL_PRODUCT_BY_TICKER = {
  '047050': {
    lane: 'distribution_trading',
    specializesIn: { id: 'metal_product:steel_energy_agri_trading', nameKo: '철강·에너지·식량 트레이딩', nameEn: 'Steel, energy and agri trading' },
    produces: { id: 'metal_product:steel_trading_services', nameKo: '철강 무역·자원 트레이딩', nameEn: 'Steel and resource trading services' },
    commodities: [
      { id: 'commodity:iron_ore', nameKo: '철광석', nameEn: 'Iron ore' },
      { id: 'commodity:coking_coal', nameKo: '코크스·원료탄', nameEn: 'Coking coal' },
    ],
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — POSCO International semType/products' },
  },
  '004020': {
    lane: 'steelmaking',
    specializesIn: { id: 'metal_product:integrated_steel', nameKo: '일관제철', nameEn: 'Integrated steelmaking' },
    produces: { id: 'metal_product:hot_rolled_steel', nameKo: '열연·냉연·후판·봉형강', nameEn: 'Hot-rolled, cold-rolled, plate and long products' },
    commodities: [
      { id: 'commodity:iron_ore', nameKo: '철광석', nameEn: 'Iron ore' },
      { id: 'commodity:coking_coal', nameKo: '코크스·원료탄', nameEn: 'Coking coal' },
    ],
    endMarket: { id: 'end_market:automotive', nameKo: '자동차', nameEn: 'Automotive' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Hyundai Steel semType/products' },
  },
  '010130': {
    lane: 'smelting_refining',
    specializesIn: { id: 'metal_product:zinc_lead_silver_smelting', nameKo: '아연·연·은 제련', nameEn: 'Zinc, lead and silver smelting' },
    produces: { id: 'metal_product:zinc_ingot', nameKo: '아연·연·은·부산 비철', nameEn: 'Zinc, lead, silver and by-product metals' },
    commodities: [
      { id: 'commodity:zinc', nameKo: '아연', nameEn: 'Zinc' },
      { id: 'commodity:lead', nameKo: '연', nameEn: 'Lead' },
      { id: 'commodity:silver', nameKo: '은', nameEn: 'Silver' },
    ],
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Korea Zinc semType/products' },
  },
  '016380': {
    lane: 'rolling_processing',
    specializesIn: { id: 'metal_product:cold_rolled_coated_steel', nameKo: '냉연·도금강판', nameEn: 'Cold-rolled and coated steel' },
    produces: { id: 'metal_product:galvanized_steel', nameKo: '냉연·아연도금·컬러강판', nameEn: 'Cold-rolled, galvanized and color-coated steel' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — KG Steel semType/products' },
  },
  '002240': {
    lane: 'rolling_processing',
    specializesIn: { id: 'metal_product:wire_rod_rope', nameKo: '선재·와이어로프', nameEn: 'Wire rod and wire rope' },
    produces: { id: 'metal_product:wire_rope', nameKo: '선재·와이어로프·비드와이어', nameEn: 'Wire rod, wire rope and bead wire' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Kiswire semType/products' },
  },
  '460860': {
    lane: 'steelmaking',
    specializesIn: { id: 'metal_product:long_products_plate', nameKo: '봉형강·후판', nameEn: 'Long products and plate' },
    produces: { id: 'metal_product:rebar', nameKo: '철근·형강·후판', nameEn: 'Rebar, sections and plate' },
    endMarket: { id: 'end_market:construction', nameKo: '건설', nameEn: 'Construction' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Dongkuk Steel semType/products' },
  },
  '092790': {
    lane: 'metal_products',
    specializesIn: { id: 'metal_product:steel_pipe', nameKo: '강관', nameEn: 'Steel pipe' },
    produces: { id: 'metal_product:octg_industrial_pipe', nameKo: '유정용·산업용 강관', nameEn: 'OCTG and industrial pipe' },
    endMarket: { id: 'end_market:shipbuilding', nameKo: '조선·해양', nameEn: 'Shipbuilding & offshore' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Nexteel semType/products' },
  },
  '002710': {
    lane: 'rolling_processing',
    specializesIn: { id: 'metal_product:tinplate', nameKo: '석도강판', nameEn: 'Tinplate' },
    produces: { id: 'metal_product:coated_tinplate', nameKo: '석도강판·도금강판', nameEn: 'Tinplate and coated steel' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — TCC Steel semType/products' },
  },
  '058430': {
    lane: 'rolling_processing',
    specializesIn: { id: 'metal_product:coated_color_steel', nameKo: '도금·컬러강판', nameEn: 'Coated and color steel' },
    produces: { id: 'metal_product:color_coated_steel', nameKo: '아연도금·컬러강판', nameEn: 'Galvanized and color-coated steel' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — POSCO Steelion semType/products' },
  },
  '104700': {
    lane: 'steelmaking',
    specializesIn: { id: 'metal_product:long_steel_products', nameKo: '봉형강', nameEn: 'Long steel products' },
    produces: { id: 'metal_product:rebar_bars', nameKo: '철근·봉강', nameEn: 'Rebar and bars' },
    endMarket: { id: 'end_market:construction', nameKo: '건설', nameEn: 'Construction' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Hankook Steel semType/products' },
  },
  '084010': {
    lane: 'steelmaking',
    specializesIn: { id: 'metal_product:rebar_long', nameKo: '철근', nameEn: 'Rebar' },
    produces: { id: 'metal_product:rebar_sections', nameKo: '철근·봉형강', nameEn: 'Rebar and long products' },
    endMarket: { id: 'end_market:construction', nameKo: '건설', nameEn: 'Construction' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Daehan Steel semType/products' },
  },
  '001430': {
    lane: 'specialty_alloy',
    specializesIn: { id: 'metal_product:specialty_steel_forging', nameKo: '특수강·단조 사업지주', nameEn: 'Specialty steel and forging operating holding' },
    produces: { id: 'metal_product:auto_parts_forgings', nameKo: '특수강·자동차부품·대형단조', nameEn: 'Specialty steel, automotive parts and large forgings' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — SeAH Besteel Holdings semType/products' },
  },
  '006110': {
    lane: 'nonferrous_metal',
    specializesIn: { id: 'metal_product:rolled_aluminium', nameKo: '알루미늄 압연', nameEn: 'Rolled aluminium' },
    produces: { id: 'metal_product:aluminium_foil_packaging', nameKo: '알루미늄박·포장재·배터리용 압연재', nameEn: 'Aluminium foil, packaging and battery-grade rolled products' },
    commodities: [{ id: 'commodity:aluminium', nameKo: '알루미늄', nameEn: 'Aluminium' }],
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Sama Aluminium semType/products' },
  },
  '000670': {
    lane: 'smelting_refining',
    specializesIn: { id: 'metal_product:zinc_smelting', nameKo: '아연 제련', nameEn: 'Zinc smelting' },
    produces: { id: 'metal_product:zinc_sulfuric_acid', nameKo: '아연·황산 등 비철금속 제련', nameEn: 'Zinc, sulfuric acid and nonferrous smelting' },
    commodities: [{ id: 'commodity:zinc', nameKo: '아연', nameEn: 'Zinc' }],
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Young Poong semType/products' },
  },
  '295310': {
    lane: 'specialty_alloy',
    specializesIn: { id: 'metal_product:specialty_advanced_metals', nameKo: '특수합금·첨단금속', nameEn: 'Special alloys & advanced metals' },
    produces: { id: 'metal_product:high_purity_specialty_metals', nameKo: '항공·우주·반도체용 고순도 특수금속', nameEn: 'High-purity specialty metals for aerospace and semiconductors' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — HVM semType/products' },
  },
  '019210': {
    lane: 'metal_products',
    specializesIn: { id: 'metal_product:cutting_tools', nameKo: '절삭공구', nameEn: 'Cutting tools' },
    produces: { id: 'metal_product:end_mills_drills', nameKo: '엔드밀·드릴·탭 등 산업용 절삭공구', nameEn: 'Industrial end mills, drills and taps' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — YG-1 semType/products' },
  },
  '241560': {
    lane: 'metal_products',
    specializesIn: { id: 'metal_product:compact_construction_equipment', nameKo: '소형 건설기계', nameEn: 'Compact construction equipment' },
    produces: { id: 'metal_product:skid_steer_excavators', nameKo: '스키드로더·소형 굴착기', nameEn: 'Skid-steer loaders and compact excavators' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Doosan Bobcat semType/products' },
  },
  '017800': {
    lane: 'metal_products',
    specializesIn: { id: 'metal_product:elevators_escalators', nameKo: '승강기', nameEn: 'Elevators' },
    produces: { id: 'metal_product:elevator_systems', nameKo: '엘리베이터·에스컬레이터', nameEn: 'Elevators and escalators' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — Hyundai Elevator semType/products' },
  },
  '306200': {
    lane: 'metal_products',
    specializesIn: { id: 'metal_product:energy_steel_pipe', nameKo: '에너지용 강관', nameEn: 'Energy steel pipe' },
    produces: { id: 'metal_product:octg_line_pipe', nameKo: '유정용·송유관·구조용 강관', nameEn: 'OCTG, line pipe and structural steel pipe' },
    endMarket: { id: 'end_market:shipbuilding', nameKo: '조선·해양', nameEn: 'Shipbuilding & offshore' },
    provenance: { sourceType: 'metal_config', title: 'METAL_CONFIG — SeAH Steel semType/products' },
  },
};

/**
 * @param {string} ticker
 * @returns {Array<{ id: string, nameKo: string, nameEn: string, type: string, lane?: string }>}
 */
export function productFocusForTicker(ticker) {
  const spec = METAL_PRODUCT_BY_TICKER[ticker];
  if (!spec) return [];
  const out = [{
    id: spec.specializesIn.id,
    nameKo: spec.specializesIn.nameKo,
    nameEn: spec.specializesIn.nameEn,
    type: 'specializes_in',
    lane: spec.lane,
    nodeType: 'metal_product',
  }];
  if (spec.produces) {
    out.push({
      id: spec.produces.id,
      nameKo: spec.produces.nameKo,
      nameEn: spec.produces.nameEn,
      type: 'produces',
      lane: spec.lane,
      nodeType: 'metal_product',
    });
  }
  for (const c of (spec.commodities || []).slice(0, 1)) {
    out.push({
      id: c.id,
      nameKo: c.nameKo,
      nameEn: c.nameEn,
      type: 'exposed_to_commodity',
      lane: 'raw_material',
      nodeType: 'commodity',
    });
  }
  if (spec.endMarket && out.length < 3) {
    out.push({
      id: spec.endMarket.id,
      nameKo: spec.endMarket.nameKo,
      nameEn: spec.endMarket.nameEn,
      type: 'used_in_end_market',
      lane: 'end_market',
      nodeType: 'end_market',
    });
  }
  return out.slice(0, 3);
}

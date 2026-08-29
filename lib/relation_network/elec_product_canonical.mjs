/**
 * Phase 5C/5C.1 — elec sector product canonical IDs (from ELEC_CONFIG + map fields).
 * Korean semType must not slug to generic `item`.
 */

export const FORBIDDEN_GENERIC_PRODUCT_IDS = new Set([
  'product:item',
  'product:product',
  'product:component',
  'product:electronics',
  'product:module',
  'product:parts',
  'component:item',
  'technology:item',
  'market:item',
]);

/** @typedef {{ id: string, nameKo: string, nameEn: string }} CanonicalRef */
/** @typedef {{ sourceType: string, title: string, url?: string|null, primarySource?: boolean }} Provenance */

/**
 * Per-ticker product focus — max 3 structural targets (specializes_in, manufactures, exposed_to).
 * @type {Record<string, { lane: string, specializesIn: CanonicalRef, manufactures?: CanonicalRef, endMarket?: CanonicalRef, provenance: Provenance }>}
 */
export const ELEC_PRODUCT_BY_TICKER = {
  '009150': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:mlcc_camera_substrate', nameKo: 'MLCC·카메라모듈·기판', nameEn: 'MLCC, camera modules & substrates' },
    manufactures: { id: 'component:mlcc', nameKo: 'MLCC', nameEn: 'MLCC' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Samsung Electro-Mechanics semType/products' },
  },
  '066570': {
    lane: 'home_appliance',
    specializesIn: { id: 'product:home_appliances_tv_auto', nameKo: '가전·TV·전장', nameEn: 'Appliances, TVs & auto electronics' },
    manufactures: { id: 'component:home_appliances', nameKo: '생활가전', nameEn: 'Home appliances' },
    endMarket: { id: 'end_market:automotive_electronics', nameKo: '자동차 전장', nameEn: 'Automotive electronics' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — LG Electronics semType/products' },
  },
  '011070': {
    lane: 'camera_module',
    specializesIn: { id: 'product:camera_module_auto_electronics', nameKo: '카메라모듈·전장부품', nameEn: 'Camera modules & auto electronics' },
    manufactures: { id: 'component:smartphone_camera_module', nameKo: '스마트폰 카메라모듈', nameEn: 'Smartphone camera modules' },
    endMarket: { id: 'end_market:automotive_electronics', nameKo: '자동차 전장', nameEn: 'Automotive electronics' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — LG Innotek semType/products' },
  },
  '034220': {
    lane: 'display',
    specializesIn: { id: 'product:oled_display_panel', nameKo: 'OLED·디스플레이 패널', nameEn: 'OLED and display panels' },
    manufactures: { id: 'component:oled_panel', nameKo: 'OLED 패널', nameEn: 'OLED panels' },
    endMarket: { id: 'end_market:automotive_electronics', nameKo: '자동차 전장', nameEn: 'Automotive electronics' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — LG Display semType/products' },
  },
  '021240': {
    lane: 'home_appliance',
    specializesIn: { id: 'product:environmental_appliances_rental', nameKo: '환경가전·렌탈', nameEn: 'Environmental appliances & rental' },
    manufactures: { id: 'component:water_purifier', nameKo: '정수기', nameEn: 'Water purifiers' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Coway semType/products' },
  },
  '489790': {
    lane: 'camera_module',
    specializesIn: { id: 'product:video_security_camera', nameKo: '영상보안·카메라', nameEn: 'Video security & cameras' },
    manufactures: { id: 'component:cctv', nameKo: 'CCTV', nameEn: 'CCTV' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Hanwha Vision semType/products' },
  },
  '043260': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:electronic_components_modules', nameKo: '전자부품·모듈', nameEn: 'Electronic components and modules' },
    manufactures: { id: 'component:electronic_module', nameKo: '전자 모듈', nameEn: 'Electronic modules' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Sungho Electronics semType/products' },
  },
  '001820': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:mlcc_capacitors', nameKo: '적층세라믹캐패시터', nameEn: 'MLCC / capacitors' },
    manufactures: { id: 'component:capacitor', nameKo: '콘덴서', nameEn: 'Capacitors' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Samwha Capacitor semType/products' },
  },
  '065350': {
    lane: 'home_appliance',
    specializesIn: { id: 'product:appliance_auto_electronics_mfg', nameKo: '가전·전장 전자제조', nameEn: 'Appliance and auto electronics manufacturing' },
    manufactures: { id: 'component:electronic_module', nameKo: '전자 모듈', nameEn: 'Electronic modules' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Shinsung Delta Tech semType/products' },
  },
  '417200': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:ultracapacitor_aluminum', nameKo: '울트라커패시터·알루미늄 부품', nameEn: 'Ultracapacitors & aluminium components' },
    manufactures: { id: 'component:ultracapacitor', nameKo: '울트라커패시터', nameEn: 'Ultracapacitors' },
    endMarket: { id: 'end_market:automotive_electronics', nameKo: '자동차 전장', nameEn: 'Automotive electronics' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — LS Materials semType/products' },
  },
  '204270': {
    lane: 'camera_module',
    specializesIn: { id: 'product:camera_cover_glass', nameKo: '카메라 커버글라스', nameEn: 'Camera cover glass' },
    manufactures: { id: 'component:camera_window_glass', nameKo: '카메라 윈도글라스', nameEn: 'Camera window glass' },
    endMarket: { id: 'end_market:consumer_electronics', nameKo: '소비자 전자', nameEn: 'Consumer electronics' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — JNTC semType/products' },
  },
  '248070': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:power_module_esl_ems', nameKo: '파워모듈·ESL·EMS', nameEn: 'Power modules, ESL and EMS' },
    manufactures: { id: 'component:power_module', nameKo: '파워모듈', nameEn: 'Power modules' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — SoluM semType/products' },
  },
  '090460': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:fpcb', nameKo: 'FPCB', nameEn: 'FPCB' },
    manufactures: { id: 'component:fpcb', nameKo: '연성인쇄회로기판', nameEn: 'Flexible printed circuit boards' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — BH semType/products' },
  },
  '171090': {
    lane: 'display',
    specializesIn: { id: 'product:oled_deposition_equipment', nameKo: 'OLED 증착 장비', nameEn: 'OLED deposition equipment' },
    manufactures: { id: 'component:oled_evaporator', nameKo: 'OLED 증착기', nameEn: 'OLED evaporators' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — SUNIC SYSTEM semType/products' },
  },
  '046890': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:led_vcsel_opto', nameKo: 'LED·VCSEL 광반도체', nameEn: 'LED & VCSEL optoelectronics' },
    manufactures: { id: 'component:wicop', nameKo: 'Wicop', nameEn: 'Wicop' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Seoul Semiconductor semType/products' },
  },
  '033240': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:vcm_magnetics', nameKo: '카메라 액추에이터·자성', nameEn: 'Camera actuators & magnetics' },
    manufactures: { id: 'component:vcm', nameKo: 'VCM', nameEn: 'VCM' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Jahwa Electronics semType/products' },
  },
  '077360': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:solder_packaging_materials', nameKo: '반도체 솔더·패키징 소재', nameEn: 'Solder and packaging materials' },
    manufactures: { id: 'component:solder_ball', nameKo: '솔더볼', nameEn: 'Solder balls' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Duksan Hi-Metal semType/products' },
  },
  '017900': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:led_opto_devices', nameKo: 'LED·광소자', nameEn: 'LED and optical devices' },
    manufactures: { id: 'component:led', nameKo: 'LED', nameEn: 'LED' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — KEC Photonics semType/products' },
  },
  '284740': {
    lane: 'home_appliance',
    specializesIn: { id: 'product:home_appliance_rental', nameKo: '생활가전·렌탈', nameEn: 'Home appliances & rental' },
    manufactures: { id: 'component:kitchen_appliances', nameKo: '주방가전', nameEn: 'Kitchen appliances' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Cuckoo Homesys semType/products' },
  },
  '004710': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:led_blu_electronic_modules', nameKo: 'LED BLU·전자모듈', nameEn: 'LED BLU and electronic modules' },
    manufactures: { id: 'component:backlight_unit', nameKo: '백라이트', nameEn: 'Backlight units' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Hansol Technics semType/products' },
  },
  '192650': {
    lane: 'camera_module',
    specializesIn: { id: 'product:camera_biometric_modules', nameKo: '카메라·지문 모듈', nameEn: 'Camera and fingerprint modules' },
    manufactures: { id: 'component:biometric_module', nameKo: '생체인증 모듈', nameEn: 'Biometric modules' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Dreamtech semType/products' },
  },
  '052710': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:motor_antenna_ceramic', nameKo: '모터·안테나·세라믹', nameEn: 'Motors, antennas & ceramics' },
    manufactures: { id: 'component:ceramic_parts', nameKo: '세라믹 부품', nameEn: 'Ceramic parts' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Amotech semType/products' },
  },
  '065680': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:connectors', nameKo: '커넥터', nameEn: 'Connectors' },
    manufactures: { id: 'component:connector', nameKo: '전자 커넥터', nameEn: 'Electronic connectors' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Woojin Electro-Nite semType/products' },
  },
  '049070': {
    lane: 'electronic_component',
    specializesIn: { id: 'product:electronics_ems_intops', nameKo: '전자기기 EMS', nameEn: 'Electronics manufacturing services' },
    manufactures: { id: 'component:ems_assembly', nameKo: '위탁생산·조립', nameEn: 'Contract assembly' },
    endMarket: { id: 'end_market:automotive_electronics', nameKo: '자동차 전장', nameEn: 'Automotive electronics' },
    provenance: { sourceType: 'elec_config', title: 'ELEC_CONFIG — Intops semType/products' },
  },
};

/** Legacy generic IDs → replacement (for curate migration). */
export const ELEC_PRODUCT_ID_ALIASES = {
  'product:item': null,
  'product:mlcc': 'product:mlcc_camera_substrate',
  'product:tv': 'product:home_appliances_tv_auto',
  'product:oled': 'product:oled_display_panel',
  'product:ems': null,
  'product:led_vcsel': 'product:led_vcsel_opto',
  'product:led': 'product:led_opto_devices',
  'product:led_blu': 'product:led_blu_electronic_modules',
  'component:item': null,
  'component:tv': 'component:oled_panel',
  'component:oled': 'component:oled_evaporator',
};

/**
 * @param {string} ticker
 * @returns {{ id: string, nameKo: string, nameEn: string, type: string }[]}
 */
export function productFocusForTicker(ticker) {
  const spec = ELEC_PRODUCT_BY_TICKER[ticker];
  if (!spec) return [];
  const out = [{
    id: spec.specializesIn.id,
    nameKo: spec.specializesIn.nameKo,
    nameEn: spec.specializesIn.nameEn,
    type: 'specializes_in',
    lane: spec.lane,
  }];
  if (spec.manufactures) {
    out.push({
      id: spec.manufactures.id,
      nameKo: spec.manufactures.nameKo,
      nameEn: spec.manufactures.nameEn,
      type: 'manufactures',
      lane: spec.lane,
    });
  }
  if (spec.endMarket) {
    out.push({
      id: spec.endMarket.id,
      nameKo: spec.endMarket.nameKo,
      nameEn: spec.endMarket.nameEn,
      type: 'exposed_to',
      lane: 'end_market',
    });
  }
  return out.slice(0, 3);
}

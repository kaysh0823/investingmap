/**
 * Chemical & refining sector product canonical IDs (from CHEMICAL_CONFIG + map fields).
 */
export const FORBIDDEN_GENERIC_CHEMICAL_IDS = new Set([
  'chemical_product:item', 'feedstock:item', 'process:item', 'material:item',
  'refining_product:item', 'specialty_chemical:item', 'petrochemical:item',
]);

/** @type {Record<string, object>} */
export const CHEMICAL_PRODUCT_BY_TICKER = {
  '011780': { lane: 'petrochemical', specializesIn: { id: 'chemical_product:synthetic_rubber_phenol', nameKo: '합성고무·페놀', nameEn: 'Synthetic rubber & phenol' }, produces: { id: 'chemical_product:rubber_bpa', nameKo: '합성고무·BPA', nameEn: 'Synthetic rubber and BPA' } },
  '011170': { lane: 'petrochemical', specializesIn: { id: 'chemical_product:olefins_basic', nameKo: '올레핀·기초유분', nameEn: 'Olefins & basic petrochemicals' }, produces: { id: 'chemical_product:ethylene_propylene', nameKo: '에틸렌·프로필렌·MEG', nameEn: 'Ethylene, propylene and MEG' } },
  '120110': { lane: 'petrochemical', specializesIn: { id: 'chemical_product:industrial_materials', nameKo: '산업소재·화학', nameEn: 'Industrial materials & chemicals' }, produces: { id: 'chemical_product:aramid_pet', nameKo: '아라미드·PET', nameEn: 'Aramid and PET' } },
  '003240': { lane: 'petrochemical', specializesIn: { id: 'chemical_product:petrochem_fiber', nameKo: '석유화학·섬유', nameEn: 'Petrochemicals & fibers' }, produces: { id: 'chemical_product:an_acrylic_pet', nameKo: 'AN·아크릴섬유·PET', nameEn: 'AN, acrylic fiber and PET' } },
  '006650': { lane: 'petrochemical', specializesIn: { id: 'chemical_product:olefins', nameKo: '올레핀', nameEn: 'Olefins' }, produces: { id: 'chemical_product:ethylene_propylene_kpc', nameKo: '에틸렌·프로필렌', nameEn: 'Ethylene and propylene' } },
  '005950': { lane: 'petrochemical', specializesIn: { id: 'chemical_product:petrochem_specialty', nameKo: '석유화학·정밀', nameEn: 'Petrochemicals & specialty' }, produces: { id: 'chemical_product:sm_abs_phenol', nameKo: 'SM·ABS·페놀', nameEn: 'SM, ABS and phenol' } },
  '457190': { lane: 'specialty_chemical', specializesIn: { id: 'chemical_product:electrolyte_additive', nameKo: '전해액 첨가제', nameEn: 'Electrolyte additives' }, produces: { id: 'chemical_product:battery_specialty', nameKo: '2차전지 특수화학', nameEn: 'Battery specialty chemicals' } },
  '069260': { lane: 'specialty_chemical', specializesIn: { id: 'chemical_product:nitric_fine', nameKo: '질산·정밀화학', nameEn: 'Nitric acid & fine chemicals' }, produces: { id: 'chemical_product:nitric_an', nameKo: '질산·AN', nameEn: 'Nitric acid and AN' } },
  '268280': { lane: 'specialty_chemical', specializesIn: { id: 'chemical_product:specialty_chem', nameKo: '특수화학', nameEn: 'Specialty chemicals' }, produces: { id: 'chemical_product:surfactant_specialty', nameKo: '계면활성제·특수화학', nameEn: 'Surfactants and specialty chemicals' } },
  '002840': { lane: 'specialty_chemical', specializesIn: { id: 'chemical_product:surfactants', nameKo: '계면활성제', nameEn: 'Surfactants' }, produces: { id: 'chemical_product:cosmetic_surfactant', nameKo: '계면활성제·화장품 소재', nameEn: 'Surfactants and cosmetic ingredients' } },
  '006380': { lane: 'specialty_chemical', specializesIn: { id: 'chemical_product:caprolactam', nameKo: '카프로락탐', nameEn: 'Caprolactam' }, produces: { id: 'chemical_product:nylon_capro', nameKo: '카프로락탐·나일론', nameEn: 'Caprolactam and nylon' } },
  '161000': { lane: 'specialty_chemical', specializesIn: { id: 'chemical_product:plasticizer_biodiesel', nameKo: '가소제·바이오디젤', nameEn: 'Plasticizers & biodiesel' }, produces: { id: 'chemical_product:dop_biodiesel', nameKo: 'DOP·바이오디젤', nameEn: 'DOP and biodiesel' } },
  '007690': { lane: 'specialty_chemical', specializesIn: { id: 'chemical_product:epoxy_resin', nameKo: '에폭시수지', nameEn: 'Epoxy resins' }, produces: { id: 'chemical_product:epoxy_coating', nameKo: '에폭시·코팅', nameEn: 'Epoxy resins and coatings' } },
  '025860': { lane: 'specialty_chemical', specializesIn: { id: 'chemical_product:fertilizer', nameKo: '비료', nameEn: 'Fertilizers' }, produces: { id: 'chemical_product:npk_fertilizer', nameKo: '질소·인산·복합비료', nameEn: 'Nitrogen, phosphate and compound fertilizers' } },
  '017890': { lane: 'specialty_chemical', specializesIn: { id: 'chemical_product:ethanol_fine', nameKo: '주정·정밀화학', nameEn: 'Ethanol & fine chemicals' }, produces: { id: 'chemical_product:ethanol_solvent', nameKo: '주정·용제', nameEn: 'Ethanol and solvents' } },
  '010950': { lane: 'refining_gas', specializesIn: { id: 'refining_product:refining', nameKo: '정유', nameEn: 'Refining' }, produces: { id: 'refining_product:fuels_aromatics', nameKo: '정유·아로마틱', nameEn: 'Refined fuels and aromatics' } },
  '005090': { lane: 'refining_gas', specializesIn: { id: 'refining_product:cogeneration', nameKo: '집단에너지·정유', nameEn: 'Cogeneration & refining' }, produces: { id: 'refining_product:steam_power', nameKo: '집단에너지·발전', nameEn: 'Cogeneration and power' } },
  '017940': { lane: 'refining_gas', specializesIn: { id: 'refining_product:lpg', nameKo: 'LPG', nameEn: 'LPG' }, produces: { id: 'refining_product:lpg_distribution', nameKo: 'LPG 수입·유통', nameEn: 'LPG import and distribution' } },
  '002960': { lane: 'refining_gas', specializesIn: { id: 'refining_product:lubricants', nameKo: '윤활유', nameEn: 'Lubricants' }, produces: { id: 'refining_product:lube_products', nameKo: '윤활유·석유제품', nameEn: 'Lubricants and petroleum products' } },
  '004690': { lane: 'refining_gas', specializesIn: { id: 'refining_product:city_gas', nameKo: '도시가스', nameEn: 'City gas' }, produces: { id: 'refining_product:gas_supply', nameKo: '도시가스 공급', nameEn: 'City gas supply' } },
  '298020': { lane: 'chemical_materials', specializesIn: { id: 'chemical_product:spandex', nameKo: '스판덱스', nameEn: 'Spandex' }, produces: { id: 'chemical_product:spandex_yarn', nameKo: '스판덱스·원사', nameEn: 'Spandex and yarn' } },
  '004000': { lane: 'chemical_materials', specializesIn: { id: 'chemical_product:ammonia_fine', nameKo: '암모니아·정밀화학', nameEn: 'Ammonia & fine chemicals' }, produces: { id: 'chemical_product:ammonia_meg', nameKo: '암모니아·MEG', nameEn: 'Ammonia and MEG' } },
  '298050': { lane: 'chemical_materials', specializesIn: { id: 'chemical_product:tire_cord_cf', nameKo: '타이어코드·탄소섬유', nameEn: 'Tire cord & carbon fiber' }, produces: { id: 'chemical_product:cord_cf_ep', nameKo: '타이어코드·탄소섬유', nameEn: 'Tire cord and carbon fiber' } },
  '014820': { lane: 'chemical_materials', specializesIn: { id: 'chemical_product:packaging_alu', nameKo: '포장재·알루미늄', nameEn: 'Packaging & aluminium' }, produces: { id: 'chemical_product:can_packaging', nameKo: 'CAN·포장재', nameEn: 'Cans and packaging' } },
  '008730': { lane: 'chemical_materials', specializesIn: { id: 'chemical_product:packaging_film', nameKo: '포장필름', nameEn: 'Packaging films' }, produces: { id: 'chemical_product:bopp_cpp', nameKo: 'BOPP·CPP 필름', nameEn: 'BOPP and CPP films' } },
  '002810': { lane: 'chemical_materials', specializesIn: { id: 'chemical_product:chem_trading', nameKo: '화학소재 유통', nameEn: 'Chemical materials trading' }, produces: { id: 'chemical_product:plastic_distribution', nameKo: '화학·플라스틱 유통', nameEn: 'Chemical and plastic distribution' } },
};

export function productFocusForTicker(ticker) {
  const spec = CHEMICAL_PRODUCT_BY_TICKER[ticker];
  if (!spec) return [];
  const out = [];
  if (spec.specializesIn) {
    out.push({
      id: spec.specializesIn.id,
      nameKo: spec.specializesIn.nameKo,
      nameEn: spec.specializesIn.nameEn,
      type: 'specializes_in',
      lane: spec.lane,
      nodeType: 'chemical_product',
    });
  }
  if (spec.produces && out.length < 3) {
    out.push({
      id: spec.produces.id,
      nameKo: spec.produces.nameKo,
      nameEn: spec.produces.nameEn,
      type: 'produces',
      lane: spec.lane,
      nodeType: 'chemical_product',
    });
  }
  return out.slice(0, 3);
}

/**
 * Travel, leisure & airlines sector product canonical IDs (from TRAVEL_CONFIG + map fields).
 */
export const FORBIDDEN_GENERIC_TRAVEL_IDS = new Set([
  'travel_service:item', 'airline_route:item', 'casino_property:item', 'hotel_property:item',
  'tour_product:item', 'duty_free:item',
]);

/** @type {Record<string, object>} */
export const TRAVEL_PRODUCT_BY_TICKER = {
  '003490': { lane: 'airlines', specializesIn: { id: 'travel_service:network_carrier', nameKo: 'FSC·네트워크 항공', nameEn: 'Full-service network carrier' }, produces: { id: 'travel_service:intl_domestic_air', nameKo: '국제·국내 항공·화물', nameEn: 'International and domestic air & cargo' } },
  '020560': { lane: 'airlines', specializesIn: { id: 'travel_service:fsc', nameKo: 'FSC', nameEn: 'Full-service carrier' }, produces: { id: 'travel_service:passenger_cargo', nameKo: '여객·화물', nameEn: 'Passenger and cargo' } },
  '089590': { lane: 'airlines', specializesIn: { id: 'travel_service:lcc', nameKo: 'LCC', nameEn: 'Low-cost carrier' }, produces: { id: 'travel_service:domestic_short_haul', nameKo: '국내·단거리', nameEn: 'Domestic and short-haul' } },
  '272450': { lane: 'airlines', specializesIn: { id: 'travel_service:lcc_jin', nameKo: 'LCC', nameEn: 'Low-cost carrier' }, produces: { id: 'travel_service:domestic_ne_asia', nameKo: '국내·동북아', nameEn: 'Domestic and Northeast Asia' } },
  '035250': { lane: 'casino', specializesIn: { id: 'casino_property:integrated_resort', nameKo: '카지노·리조트', nameEn: 'Casino & integrated resort' }, produces: { id: 'casino_property:kangwon_land', nameKo: '강원랜드 카지노·호텔', nameEn: 'Kangwon Land casino and hotel' } },
  '034230': { lane: 'casino', specializesIn: { id: 'casino_property:foreigner_casino', nameKo: '외국인 카지노', nameEn: 'Foreigner-only casino' }, produces: { id: 'casino_property:paradise_city', nameKo: '파라다이스 카지노·호텔', nameEn: 'Paradise casino and hotel' } },
  '114090': { lane: 'casino', specializesIn: { id: 'casino_property:casino_operator', nameKo: '카지노·호텔 운영', nameEn: 'Casino & hotel operator' }, produces: { id: 'casino_property:seoul_busan_casino', nameKo: '서울·부산 카지노', nameEn: 'Seoul and Busan casino operations' } },
  '032350': { lane: 'casino', specializesIn: { id: 'casino_property:resort_dev', nameKo: '카지노·리조트 개발', nameEn: 'Casino resort development' }, produces: { id: 'casino_property:dream_tower', nameKo: '드림타워·제주', nameEn: 'Dream Tower Jeju' } },
  '008770': { lane: 'hotel_resort', specializesIn: { id: 'hotel_property:hotel_duty_free', nameKo: '호텔·면세', nameEn: 'Hotels & duty-free' }, produces: { id: 'hotel_property:shilla_hotels', nameKo: '신라호텔·면세', nameEn: 'Shilla hotels and duty-free' } },
  '025980': { lane: 'hotel_resort', specializesIn: { id: 'hotel_property:resort', nameKo: '리조트·호텔', nameEn: 'Resort & hotel' }, produces: { id: 'hotel_property:ananti_resorts', nameKo: '아난티 리조트', nameEn: 'Ananti resort portfolio' } },
  '039130': { lane: 'travel_duty_free', specializesIn: { id: 'tour_product:travel_agency', nameKo: '여행사·패키지', nameEn: 'Travel agency & packages' }, produces: { id: 'tour_product:outbound_packages', nameKo: '해외·국내 패키지', nameEn: 'Outbound and domestic packages' } },
};

export function productFocusForTicker(ticker) {
  const spec = TRAVEL_PRODUCT_BY_TICKER[ticker];
  if (!spec) return [];
  const out = [];
  if (spec.specializesIn) {
    out.push({
      id: spec.specializesIn.id,
      nameKo: spec.specializesIn.nameKo,
      nameEn: spec.specializesIn.nameEn,
      type: 'specializes_in',
      lane: spec.lane,
      nodeType: 'travel_service',
    });
  }
  if (spec.produces && out.length < 3) {
    out.push({
      id: spec.produces.id,
      nameKo: spec.produces.nameKo,
      nameEn: spec.produces.nameEn,
      type: 'produces',
      lane: spec.lane,
      nodeType: 'travel_service',
    });
  }
  return out.slice(0, 3);
}

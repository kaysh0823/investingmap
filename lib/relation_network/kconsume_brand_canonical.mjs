/**
 * K-consume brand / category canonical map — Phase 5F.
 * Brands are separate from listed legal entities. No invented ownership.
 */
export const FORBIDDEN_GENERIC_KCONSUME_IDS = [
  'brand:item',
  'product:item',
  'consumer_product:item',
  'category:item',
  'channel:item',
  'market:item',
  'franchise:item',
];

/** @type {Record<string, { lane: string, brands?: Array<{id:string,nameKo:string,nameEn:string}>, categories?: Array<{id:string,nameKo:string,nameEn:string}>, maxBrands?: number }>} */
export const KCONSUME_FOCUS_BY_TICKER = {
  '003230': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:buldak', nameKo: '불닭볶음면', nameEn: 'Buldak' },
      { id: 'brand:samyang-ramen', nameKo: '삼양라면', nameEn: 'Samyang Ramen' },
    ],
    categories: [{ id: 'consumer_category:instant-noodles', nameKo: '라면·면류', nameEn: 'Instant noodles' }],
  },
  '271560': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:chocopie', nameKo: '초코파이', nameEn: 'Choco Pie' },
      { id: 'brand:market-o', nameKo: '마켓오', nameEn: 'Market O' },
    ],
    categories: [{ id: 'consumer_category:confectionery', nameKo: '제과', nameEn: 'Confectionery' }],
  },
  '097950': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:bibigo', nameKo: '비비고', nameEn: 'Bibigo' },
      { id: 'brand:hetbahn', nameKo: '햇반', nameEn: 'Hetbahn' },
    ],
    categories: [{ id: 'consumer_category:hmr-processed-food', nameKo: 'HMR·가공식품', nameEn: 'HMR / processed food' }],
  },
  '004370': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:shin-ramen', nameKo: '신라면', nameEn: 'Shin Ramyun' },
      { id: 'brand:chapagetti', nameKo: '짜파게티', nameEn: 'Chapagetti' },
    ],
    categories: [{ id: 'consumer_category:instant-noodles', nameKo: '라면·면류', nameEn: 'Instant noodles' }],
  },
  '007310': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:jin-ramen', nameKo: '진라면', nameEn: 'Jin Ramen' },
      { id: 'brand:ottogi-ketchup', nameKo: '오뚜기 케첩', nameEn: 'Ottogi Ketchup' },
    ],
    categories: [{ id: 'consumer_category:sauces-condiments', nameKo: '소스·조미', nameEn: 'Sauces / condiments' }],
  },
  '280360': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:pepero', nameKo: '빼빼로', nameEn: 'Pepero' },
      { id: 'brand:ghana-chocolate', nameKo: '가나 초콜릿', nameEn: 'Ghana Chocolate' },
    ],
    categories: [{ id: 'consumer_category:confectionery', nameKo: '제과', nameEn: 'Confectionery' }],
  },
  '005180': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:banana-flavored-milk', nameKo: '바나나맛우유', nameEn: 'Banana Flavored Milk' },
      { id: 'brand:melona', nameKo: '메로나', nameEn: 'Melona' },
    ],
    categories: [{ id: 'consumer_category:dairy-frozen', nameKo: '유제품·빙과', nameEn: 'Dairy / frozen dessert' }],
  },
  '145990': {
    lane: 'manufacturing',
    categories: [{ id: 'consumer_category:food-ingredients', nameKo: '식품 소재', nameEn: 'Food ingredients' }],
  },
  '136480': {
    lane: 'manufacturing',
    categories: [{ id: 'consumer_category:poultry-meat', nameKo: '가금·육가공', nameEn: 'Poultry / meat' }],
  },
  '383220': {
    lane: 'brand_owner',
    brands: [
      { id: 'brand:mlb', nameKo: 'MLB', nameEn: 'MLB' },
      { id: 'brand:discovery-expedition', nameKo: '디스커버리 익스페디션', nameEn: 'Discovery Expedition' },
    ],
    categories: [{ id: 'consumer_category:apparel', nameKo: '의류·패션', nameEn: 'Apparel / fashion' }],
  },
  '111770': {
    lane: 'manufacturing',
    categories: [{ id: 'consumer_category:apparel-oem', nameKo: '의류 OEM·수출', nameEn: 'Apparel OEM / export' }],
  },
  '081660': {
    lane: 'brand_owner',
    brands: [{ id: 'brand:mistoholdings-portfolio', nameKo: '미스토홀딩스 패션 포트폴리오', nameEn: 'Misto Holdings fashion portfolio' }],
    categories: [{ id: 'consumer_category:apparel', nameKo: '의류·패션', nameEn: 'Apparel / fashion' }],
  },
  '093050': {
    lane: 'brand_owner',
    brands: [{ id: 'brand:lf-houses', nameKo: 'LF 패션 하우스', nameEn: 'LF fashion houses' }],
    categories: [{ id: 'consumer_category:apparel', nameKo: '의류·패션', nameEn: 'Apparel / fashion' }],
  },
  '020000': {
    lane: 'brand_owner',
    brands: [{ id: 'brand:handsome-houses', nameKo: '한섬 패션 하우스', nameEn: 'Handsome fashion houses' }],
    categories: [{ id: 'consumer_category:apparel', nameKo: '의류·패션', nameEn: 'Apparel / fashion' }],
  },
  '004170': {
    lane: 'retail_channel',
    categories: [{ id: 'consumer_category:department-retail', nameKo: '백화점·리테일', nameEn: 'Department / retail' }],
  },
  '023530': {
    lane: 'retail_channel',
    categories: [{ id: 'consumer_category:department-retail', nameKo: '백화점·리테일', nameEn: 'Department / retail' }],
  },
  '069960': {
    lane: 'retail_channel',
    categories: [{ id: 'consumer_category:department-retail', nameKo: '백화점·리테일', nameEn: 'Department / retail' }],
  },
  '139480': {
    lane: 'retail_channel',
    categories: [{ id: 'consumer_category:hypermarket', nameKo: '대형마트', nameEn: 'Hypermarket' }],
  },
  '007070': {
    lane: 'retail_channel',
    categories: [{ id: 'consumer_category:convenience-retail', nameKo: '편의점·리테일', nameEn: 'Convenience / retail' }],
  },
  '008770': {
    lane: 'leisure_lifestyle',
    categories: [{ id: 'consumer_category:travel-hospitality', nameKo: '여행·호텔', nameEn: 'Travel / hospitality' }],
  },
  '032350': {
    lane: 'leisure_lifestyle',
    categories: [{ id: 'consumer_category:travel-hospitality', nameKo: '여행·레저', nameEn: 'Travel / leisure' }],
  },
  '039130': {
    lane: 'leisure_lifestyle',
    categories: [{ id: 'consumer_category:travel-agency', nameKo: '여행사', nameEn: 'Travel agency' }],
  },
};

export function focusForTicker(ticker) {
  return KCONSUME_FOCUS_BY_TICKER[ticker] || null;
}

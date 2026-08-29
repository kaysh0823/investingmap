/**
 * K-content artist / IP / studio canonical map — Phase 5F.
 * Artists and IP are not legal companies. No fan-list expansion.
 */
export const FORBIDDEN_GENERIC_KCONTENT_IDS = [
  'artist:item',
  'content:item',
  'ip:item',
  'platform:item',
  'production:item',
  'market:item',
  'creator:item',
  'franchise_ip:item',
];

/** Max 3 artists / IPs per company for structural classification only. */
export const KCONTENT_FOCUS_BY_TICKER = {
  '352820': {
    lane: 'label_agency',
    artists: [
      { id: 'artist:bts', nameKo: 'BTS', nameEn: 'BTS' },
      { id: 'artist:newjeans', nameKo: 'NewJeans', nameEn: 'NewJeans' },
      { id: 'artist:seventeen', nameKo: '세븐틴', nameEn: 'SEVENTEEN' },
    ],
    categories: [{ id: 'content_category:kpop', nameKo: 'K-pop', nameEn: 'K-pop' }],
  },
  '035900': {
    lane: 'label_agency',
    artists: [
      { id: 'artist:twice', nameKo: 'TWICE', nameEn: 'TWICE' },
      { id: 'artist:stray-kids', nameKo: 'Stray Kids', nameEn: 'Stray Kids' },
      { id: 'artist:itzy', nameKo: 'ITZY', nameEn: 'ITZY' },
    ],
    categories: [{ id: 'content_category:kpop', nameKo: 'K-pop', nameEn: 'K-pop' }],
  },
  '041510': {
    lane: 'label_agency',
    artists: [
      { id: 'artist:aespa', nameKo: 'aespa', nameEn: 'aespa' },
      { id: 'artist:nct', nameKo: 'NCT', nameEn: 'NCT' },
      { id: 'artist:exo', nameKo: 'EXO', nameEn: 'EXO' },
    ],
    categories: [{ id: 'content_category:kpop', nameKo: 'K-pop', nameEn: 'K-pop' }],
  },
  '122870': {
    lane: 'label_agency',
    artists: [
      { id: 'artist:blackpink', nameKo: 'BLACKPINK', nameEn: 'BLACKPINK' },
      { id: 'artist:treasure', nameKo: 'TREASURE', nameEn: 'TREASURE' },
    ],
    categories: [{ id: 'content_category:kpop', nameKo: 'K-pop', nameEn: 'K-pop' }],
  },
  '035760': {
    lane: 'production_studio',
    ips: [
      { id: 'content_ip:cj-enm-drama-slate', nameKo: 'CJ ENM 드라마·예능 IP', nameEn: 'CJ ENM drama/variety slate' },
    ],
    categories: [{ id: 'content_category:broadcast-media', nameKo: '방송·미디어', nameEn: 'Broadcast / media' }],
  },
  '253450': {
    lane: 'production_studio',
    ips: [
      { id: 'content_ip:studio-dragon-drama', nameKo: '스튜디오드래곤 드라마 IP', nameEn: 'Studio Dragon drama IP' },
    ],
    categories: [{ id: 'content_category:drama', nameKo: '드라마', nameEn: 'Drama' }],
  },
  '079160': {
    lane: 'distributor',
    categories: [{ id: 'content_category:theatrical', nameKo: '극장 배급', nameEn: 'Theatrical exhibition' }],
  },
  '376300': {
    lane: 'platform',
    categories: [{ id: 'content_category:fan-platform', nameKo: '팬 플랫폼', nameEn: 'Fan platform' }],
  },
  '259960': {
    lane: 'ip_rights',
    ips: [
      { id: 'content_ip:pubg', nameKo: 'PUBG', nameEn: 'PUBG' },
    ],
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '036570': {
    lane: 'ip_rights',
    ips: [{ id: 'content_ip:lineage', nameKo: '리니지', nameEn: 'Lineage' }],
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '251270': {
    lane: 'ip_rights',
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '263750': {
    lane: 'ip_rights',
    ips: [{ id: 'content_ip:black-desert', nameKo: '검은사막', nameEn: 'Black Desert' }],
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '462870': {
    lane: 'ip_rights',
    ips: [{ id: 'content_ip:nikke', nameKo: '니케', nameEn: 'NIKKE' }],
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '192080': {
    lane: 'ip_rights',
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '293490': {
    lane: 'ip_rights',
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '225570': {
    lane: 'ip_rights',
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '112040': {
    lane: 'ip_rights',
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '095660': {
    lane: 'ip_rights',
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '069080': {
    lane: 'ip_rights',
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
  '078340': {
    lane: 'ip_rights',
    categories: [{ id: 'content_category:game', nameKo: '게임', nameEn: 'Games' }],
  },
};

export function focusForTicker(ticker) {
  return KCONTENT_FOCUS_BY_TICKER[ticker] || null;
}

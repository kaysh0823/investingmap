/**
 * Phase 5H — software product / platform canonical (map fields only).
 * Max 3 products/categories per company. No invented customers or marketplace contracts.
 */
export const FORBIDDEN_GENERIC_SOFTWARE_IDS = new Set([
  'software:item', 'product:item', 'platform:item', 'solution:item',
  'service:item', 'customer:item', 'industry:item', 'software_product:item',
  'software_category:item', 'cloud_service:item',
]);

/** @type {Record<string, object>} */
export const SOFTWARE_FOCUS_BY_TICKER = {
  '035420': {
    lane: 'data_ai',
    products: [{ id: 'platform:naver-search-ai', nameKo: '검색·AI 플랫폼', nameEn: 'Search / AI platform', edge: 'operates_platform' }],
    categories: [{ id: 'software_category:internet-platform', nameKo: '인터넷 플랫폼', nameEn: 'Internet platform' }],
    industries: [{ id: 'industry:consumer-internet', nameKo: '컨슈머 인터넷', nameEn: 'Consumer internet' }],
  },
  '035720': {
    lane: 'data_ai',
    products: [{ id: 'platform:kakao-messenger', nameKo: '메신저·플랫폼', nameEn: 'Messenger platform', edge: 'operates_platform' }],
    categories: [{ id: 'software_category:internet-platform', nameKo: '인터넷 플랫폼', nameEn: 'Internet platform' }],
    industries: [{ id: 'industry:consumer-internet', nameKo: '컨슈머 인터넷', nameEn: 'Consumer internet' }],
  },
  '018260': {
    lane: 'managed_service',
    products: [{ id: 'cloud_service:samsung-sds-cloud', nameKo: '기업 클라우드·SI', nameEn: 'Enterprise cloud / SI', edge: 'offers_cloud_service' }],
    categories: [{ id: 'software_category:si-cloud', nameKo: 'SI·클라우드', nameEn: 'SI / cloud' }],
    industries: [{ id: 'industry:enterprise-it', nameKo: '기업 IT', nameEn: 'Enterprise IT' }],
  },
  '064400': {
    lane: 'managed_service',
    products: [{ id: 'cloud_service:lg-cns-cloud', nameKo: '클라우드·디지털전환', nameEn: 'Cloud / DX', edge: 'offers_cloud_service' }],
    categories: [{ id: 'software_category:si-cloud', nameKo: 'SI·클라우드', nameEn: 'SI / cloud' }],
    industries: [{ id: 'industry:enterprise-it', nameKo: '기업 IT', nameEn: 'Enterprise IT' }],
  },
  '022100': {
    lane: 'industrial_software',
    products: [{ id: 'software_product:posco-dx-industrial', nameKo: '산업 DX·스마트팩토리', nameEn: 'Industrial DX / smart factory', edge: 'develops' }],
    categories: [{ id: 'software_category:industrial-dx', nameKo: '산업 DX', nameEn: 'Industrial DX' }],
    industries: [{ id: 'industry:manufacturing', nameKo: '제조', nameEn: 'Manufacturing' }],
  },
  '181710': {
    lane: 'data_ai',
    products: [{ id: 'platform:nhn-cloud-game', nameKo: '클라우드·게임 플랫폼', nameEn: 'Cloud / game platform', edge: 'operates_platform' }],
    categories: [{ id: 'software_category:internet-platform', nameKo: '인터넷 플랫폼', nameEn: 'Internet platform' }],
  },
  '053800': {
    lane: 'cybersecurity',
    products: [{ id: 'software_product:ahnlab-endpoint', nameKo: '엔드포인트·보안', nameEn: 'Endpoint security', edge: 'develops' }],
    categories: [{ id: 'software_category:cybersecurity', nameKo: '사이버보안', nameEn: 'Cybersecurity' }],
    industries: [{ id: 'industry:enterprise-security', nameKo: '기업 보안', nameEn: 'Enterprise security' }],
  },
  '030520': {
    lane: 'enterprise_software',
    products: [{ id: 'software_product:hancom-office', nameKo: '오피스·문서 SW', nameEn: 'Office / document SW', edge: 'develops' }],
    categories: [{ id: 'software_category:productivity-saas', nameKo: '생산성 SaaS', nameEn: 'Productivity SaaS' }],
  },
  '042000': {
    lane: 'commerce_platform',
    products: [{ id: 'platform:cafe24-commerce', nameKo: '커머스 플랫폼', nameEn: 'Commerce platform', edge: 'operates_platform' }],
    categories: [{ id: 'software_category:ecommerce-saas', nameKo: '이커머스 SaaS', nameEn: 'E-commerce SaaS' }],
    industries: [{ id: 'industry:retail-commerce', nameKo: '리테일·커머스', nameEn: 'Retail / commerce' }],
  },
  '079940': {
    lane: 'cloud_infrastructure',
    products: [{ id: 'cloud_service:gabia-hosting', nameKo: '호스팅·클라우드', nameEn: 'Hosting / cloud', edge: 'offers_cloud_service' }],
    categories: [{ id: 'software_category:hosting-cloud', nameKo: '호스팅·클라우드', nameEn: 'Hosting / cloud' }],
  },
  '203650': {
    lane: 'cybersecurity',
    products: [{ id: 'software_product:dream-security-auth', nameKo: '인증·보안', nameEn: 'Auth / security', edge: 'develops' }],
    categories: [{ id: 'software_category:cybersecurity', nameKo: '사이버보안', nameEn: 'Cybersecurity' }],
  },
  '286940': {
    lane: 'managed_service',
    products: [{ id: 'cloud_service:lotte-innovate-it', nameKo: '그룹 IT·클라우드', nameEn: 'Group IT / cloud', edge: 'provides_managed_service' }],
    categories: [{ id: 'software_category:si-cloud', nameKo: 'SI·클라우드', nameEn: 'SI / cloud' }],
  },
  '093320': {
    lane: 'cloud_infrastructure',
    products: [{ id: 'cloud_service:kinx-ix-cloud', nameKo: 'IX·클라우드 인프라', nameEn: 'IX / cloud infra', edge: 'offers_cloud_service' }],
    categories: [{ id: 'software_category:hosting-cloud', nameKo: '호스팅·클라우드', nameEn: 'Hosting / cloud' }],
  },
};

export function focusForTicker(ticker) {
  const spec = SOFTWARE_FOCUS_BY_TICKER[ticker];
  if (!spec) return [];
  const out = [];
  for (const p of (spec.products || []).slice(0, 3)) {
    const nodeType = p.id.startsWith('platform:') ? 'platform'
      : p.id.startsWith('cloud_service:') ? 'cloud_service' : 'software_product';
    out.push({
      id: p.id, nameKo: p.nameKo, nameEn: p.nameEn,
      type: p.edge || 'develops', nodeType, lane: spec.lane,
    });
  }
  for (const c of (spec.categories || []).slice(0, 2)) {
    out.push({
      id: c.id, nameKo: c.nameKo, nameEn: c.nameEn,
      type: 'specializes_in', nodeType: 'software_category', lane: spec.lane,
    });
  }
  for (const i of (spec.industries || []).slice(0, 2)) {
    out.push({
      id: i.id, nameKo: i.nameKo, nameEn: i.nameEn,
      type: 'used_in_industry', nodeType: 'customer_industry', lane: spec.lane,
    });
  }
  return out;
}

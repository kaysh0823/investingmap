/**
 * Shared semiconductor value-chain UI literals (ANGLE / filter chips / legend).
 * Single source for apply_semi_chain_reclass.mjs and map clone retargeting.
 * 13 leaf groups (2026-09); bigchip still uses IDM/종합반도체 separately.
 */
export const SEMI_CHAIN_COLORS = {
  전공정: '#1E88E5',
  후공정: '#43A047',
  '팹리스·IP': '#66BB6A',
  디자인하우스: '#00897B',
  파운드리: '#FFA726',
  '전공정 장비': '#AB47BC',
  '패키징 장비': '#8E24AA',
  '검사·계측 장비': '#5C6BC0',
  '공정 소재': '#EF5350',
  '공정 부품·유지관리': '#EC407A',
  '기판·패키징 소재': '#26C6DA',
  '테스트 부품·인터페이스': '#FFCA28',
  '패키징·테스트 서비스': '#43A047',
  '팹 인프라·지원설비': '#78909C',
  '반도체 유통': '#8D6E63',
};

/** Leaf chains shown on legend / heatmap (no aggregate 전공정/후공정). */
export const LEGEND_CHAINS = [
  '팹리스·IP',
  '디자인하우스',
  '파운드리',
  '전공정 장비',
  '패키징 장비',
  '검사·계측 장비',
  '공정 소재',
  '공정 부품·유지관리',
  '기판·패키징 소재',
  '테스트 부품·인터페이스',
  '패키징·테스트 서비스',
  '팹 인프라·지원설비',
  '반도체 유통',
];

export const SEMI_FE_CHAINS = [
  '팹리스·IP',
  '디자인하우스',
  '파운드리',
  '전공정 장비',
  '공정 소재',
  '공정 부품·유지관리',
  '팹 인프라·지원설비',
];

export const SEMI_BE_CHAINS = [
  '패키징 장비',
  '검사·계측 장비',
  '기판·패키징 소재',
  '테스트 부품·인터페이스',
  '패키징·테스트 서비스',
  '반도체 유통',
];

export const CHIP_CHAINS = ['all', '전공정', '후공정', ...LEGEND_CHAINS];

/** Exact forceX/Y angle object literal written into semiconductor HTML. */
export const ANGLE =
  "{ '팹리스·IP': 0, '디자인하우스': 28, 파운드리: 55, '전공정 장비': 83, '패키징 장비': 110, '검사·계측 장비': 138, '공정 소재': 166, '공정 부품·유지관리': 194, '기판·패키징 소재': 221, '테스트 부품·인터페이스': 249, '패키징·테스트 서비스': 277, '팹 인프라·지원설비': 304, '반도체 유통': 332 }";

/** Old ?chain= / filter keys → new leaf or aggregate. */
export const SEMI_LEGACY_CHAIN_ALIASES = {
  팹리스: '팹리스·IP',
  소재: '공정 소재',
  '후공정 장비': '패키징 장비',
  '부품/기판': '기판·패키징 소재',
  '패키징/테스트': '패키징·테스트 서비스',
  IDM: 'all',
  'IDM/종합반도체': 'all',
  장비: '전공정 장비',
};

export function toJsChainList(arr) {
  return `[${arr.map((c) => `'${c}'`).join(', ')}]`;
}

export function semiChainsAllSource() {
  return `const chains = ${toJsChainList(CHIP_CHAINS)};`;
}

export function semiChainsNoAllSource() {
  return `const chains = ${toJsChainList(LEGEND_CHAINS)};`;
}

function reEsc(s) {
  return String(s).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Sector builders clone semiconductor HTML. After curated relation patches the
 * classic forceX/Y ANGLE needle may be gone — retarget curated angle maps and
 * clear group hubs so clone maps keep a simple chain-angle layout.
 */
export function retargetSemiCloneAngles(html, sectorAngleLiteral) {
  let out = html;
  if (out.includes('CURATED_RELATION_HUBS') || out.includes('CURATED_FALLBACK_ANGLE')) {
    out = out.replace(
      /const CURATED_RELATION_HUBS = \[[\s\S]*?\n    \];/,
      'const CURATED_RELATION_HUBS = [];',
    );
    if (out.includes('CURATED_HUB_ANGLE')) {
      out = out.replace(/const CURATED_HUB_ANGLE = \{[^}]+\};/, `const CURATED_HUB_ANGLE = ${sectorAngleLiteral};`);
    }
    if (out.includes('CURATED_FALLBACK_ANGLE')) {
      out = out.replace(
        /const CURATED_FALLBACK_ANGLE = \{[^}]+\};/,
        `const CURATED_FALLBACK_ANGLE = ${sectorAngleLiteral};`,
      );
    } else {
      throw new Error('retargetSemiCloneAngles: CURATED_FALLBACK_ANGLE missing');
    }
    return out;
  }

  const semiAngleRe = new RegExp(reEsc(ANGLE), 'g');
  const matches = out.match(semiAngleRe);
  if (matches && matches.length >= 2) {
    return out.replace(semiAngleRe, sectorAngleLiteral);
  }
  const sectorRe = new RegExp(reEsc(sectorAngleLiteral), 'g');
  const sectorMatches = out.match(sectorRe);
  if (sectorMatches && sectorMatches.length >= 2) return out;
  throw new Error('retargetSemiCloneAngles: expected semiconductor or sector angle snippet');
}

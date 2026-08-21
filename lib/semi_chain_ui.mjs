/**
 * Shared semiconductor value-chain UI literals (ANGLE / filter chips / legend).
 * Keep in sync via apply_semi_chain_reclass.mjs; map builders that clone the
 * semiconductor HTML template must import these instead of hardcoding needles.
 */
export const SEMI_CHAIN_COLORS = {
  전공정: '#1E88E5',
  후공정: '#43A047',
  팹리스: '#66BB6A',
  디자인하우스: '#00897B',
  파운드리: '#FFA726',
  소재: '#EF5350',
  '전공정 장비': '#AB47BC',
  '후공정 장비': '#8E24AA',
  '부품/기판': '#26C6DA',
  '패키징/테스트': '#FFCA28',
  '반도체 유통': '#8D6E63',
};

export const SEMI_FE_CHAINS = ['팹리스', '디자인하우스', '파운드리', '소재', '전공정 장비'];
export const SEMI_BE_CHAINS = ['부품/기판', '패키징/테스트', '후공정 장비', '반도체 유통'];
export const CHIP_CHAINS = [
  'all',
  '전공정',
  '후공정',
  '팹리스',
  '디자인하우스',
  '파운드리',
  '소재',
  '전공정 장비',
  '후공정 장비',
  '부품/기판',
  '패키징/테스트',
  '반도체 유통',
];
export const LEGEND_CHAINS = [
  '팹리스',
  '디자인하우스',
  '파운드리',
  '소재',
  '전공정 장비',
  '후공정 장비',
  '부품/기판',
  '패키징/테스트',
  '반도체 유통',
];

/** Exact forceX/Y angle object literal written into semiconductor HTML. */
export const ANGLE =
  "{ 팹리스: 0, '디자인하우스': 40, 파운드리: 80, 소재: 120, '전공정 장비': 160, '후공정 장비': 200, '부품/기판': 240, '패키징/테스트': 280, '반도체 유통': 320 }";

export function toJsChainList(arr) {
  return `[${arr.map((c) => `'${c}'`).join(', ')}]`;
}

export function semiChainsAllSource() {
  return `const chains = ${toJsChainList(CHIP_CHAINS)};`;
}

export function semiChainsNoAllSource() {
  return `const chains = ${toJsChainList(LEGEND_CHAINS)};`;
}

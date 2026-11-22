/** Publish gaming and media maps while keeping the unified map as their source. */
import { SOURCE_MAP_PATHS } from '../lib/sector_meta.mjs';
import { buildSplitSectorMaps } from './build_split_sector_maps.mjs';

const copy = {
  gaming: {
    ko: '국내 상장 게임 개발사와 퍼블리셔를 비교합니다.',
    en: 'Compare listed Korean game developers and publishers.',
  },
  kcontent: {
    ko: '음악·엔터테인먼트, 영상·방송, 팬덤 플랫폼, 광고, 교육서비스 종목을 비교합니다.',
    en: 'Compare listed Korean music, film, broadcasting, fan platforms, advertising, and education companies.',
  },
};
const escapeHtml = (value) => value.replaceAll('&', '&amp;');

buildSplitSectorMaps({
  sourcePath: SOURCE_MAP_PATHS.find(([id]) => id === 'kcontent')[1],
  sourceGraph: 'data/netmap/kcontent.json',
  graphSlugs: { gaming: 'kcontent_game', kcontent: 'kcontent_media' },
  sectorFor: ({ chain }) => chain === '게임' ? 'gaming' : 'kcontent',
  transformPage: (source, id, meta) => source
    .replace('data-sector="kcontent"', `data-sector="${id}"`)
    .replaceAll('한국 콘텐츠 투자 지도', `한국 ${meta.ko} 투자 지도`)
    .replaceAll('Korea K-Content Industry Map', `Korea ${meta.en} Industry Map`)
    .replace('콘텐츠 상장 종목 지도', `${meta.ko} 상장 종목 지도`)
    .replace('K-content, games, media &amp; K-pop stocks', `${escapeHtml(meta.en)} stocks`)
    .replace(/(<p lang="(ko|en)" class="im-seo-lead[^>]*>)[\s\S]*?(<\/p>)/g,
      (_, open, lang, close) => `${open}${escapeHtml(copy[id][lang])}${close}`),
});

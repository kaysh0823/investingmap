/** Publish banking, securities, and insurance maps from the legacy finance map. */
import { SECTOR_META } from '../lib/sector_meta.mjs';
import { financeSectorFor } from '../lib/finance_sector_split.mjs';
import { buildSplitSectorMaps } from './build_split_sector_maps.mjs';

const copy = {
  banking: { ko: '은행·금융지주, 카드·여신금융, 결제·핀테크 및 기타 금융서비스를 비교합니다.', en: 'Compare listed Korean banks, card issuers, payment firms, and other financial services.' },
  securities: { ko: '증권사, 자산운용사, PE·VC 및 투자기구를 비교합니다.', en: 'Compare Korean brokerages, asset managers, private equity, venture capital, and investment vehicles.' },
  insurance: { ko: '생명보험, 손해보험·재보험, 보험중개 및 보험계 금융그룹을 비교합니다.', en: 'Compare Korean life and non-life insurers, reinsurers, insurance brokers, and insurance-led financial groups.' },
};

buildSplitSectorMaps({
  sourcePath: SECTOR_META.finance.map,
  sourceGraph: 'data/netmap/finance.json',
  graphSlugs: { banking: 'finance_bank', securities: 'finance_securities', insurance: 'finance_insurance' },
  sectorFor: financeSectorFor,
  transformPage: (source, id, meta) => source
    .replace('data-sector="finance"', `data-sector="${id}"`)
    .replaceAll('은행·증권·보험·카드·캐피탈 등 국내 상장 금융사와 글로벌 peer 참고 관계', copy[id].ko)
    .replaceAll('은행·증권·보험·카드·캐피탈 등 국내 상장 금융사의 KRX 데이터와 글로벌 peer 참고 관계를 정리합니다.', copy[id].ko)
    .replaceAll('Listed Korean banks, securities, insurers, cards & capital with global peer relationships', copy[id].en)
    .replaceAll('한국 금융 투자 지도', `한국 ${meta.ko} 투자 지도`)
    .replaceAll(/Korea(?: Listed)? Financials(?: Industry)? (?:Investment )?Map/g, `Korea ${meta.en} Investment Map`)
    .replace(/(<h2 id="im-seo-body-title"[^>]*>)[^<]*(<\/h2>)/, `$1${meta.ko} 상장 종목$2`)
    .replace(/(<h2 id="im-seo-body-title-en"[^>]*>)[^<]*(<\/h2>)/, `$1Listed Korean ${meta.en} Stocks$2`)
    .replace(/(<p lang="(ko|en)" class="im-seo-lead[^>]*>)[\s\S]*?(<\/p>)/g,
      (_, open, lang, close) => `${open}${copy[id][lang]}${close}`),
});

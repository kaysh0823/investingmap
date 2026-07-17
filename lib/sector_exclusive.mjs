/**
 * Single-home tickers: must appear in exactly one industry map (removed from others).
 * Key = ticker, value = sector key.
 *
 * Multi-sector tickers use SECTOR_CROSS instead (not listed here).
 */
export const SECTOR_EXCLUSIVE = {
  '329180': 'ship', // HD현대중공업
  '012450': 'defense', // 한화에어로스페이스
  '042660': 'ship', // 한화오션
  '009540': 'ship', // HD한국조선해양
  '010140': 'ship', // 삼성중공업
  '064350': 'defense', // 현대로템
  '079550': 'defense', // LIG디펜스앤에어로스페이스
  '082740': 'ship', // 한화엔진
  '071970': 'ship', // HD현대마린엔진
  '097230': 'ship', // HJ중공업
  '077970': 'ship', // STX엔진
  '100840': 'ship', // SNT에너지
  '064820': 'ship', // 케이프
  '039030': 'semi', // 이오테크닉스
  '089890': 'semi', // 코세스
  '160980': 'semi', // 싸이맥스
  '039440': 'semi', // 에스티아이
  '036200': 'semi', // 유니셈
  '086390': 'semi', // 유니테스트
  '357780': 'semi', // 솔브레인
  '093370': 'battery', // 후성
  '078600': 'semi', // 대주전자재료
  '178920': 'semi', // PI첨단소재
  '011930': 'renewable', // 신성이엔지
  '034020': 'nuclear', // 두산에너빌리티
  '267260': 'powergrid', // HD현대일렉트릭
  '267250': 'ship', // HD현대
  '100090': 'ship', // SK오션플랜트
  '060280': 'medtech', // 큐렉소
  '285130': 'renewable', // SK케미칼
  '214150': 'cosmetics', // 클래시스
  '214450': 'cosmetics', // 파마리서치
  '336570': 'cosmetics', // 원텍
  '137310': 'medtech', // 에스디바이오센서
  '099190': 'medtech', // 아이센스
  '228760': 'medtech', // 지노믹트리
  '278470': 'cosmetics', // 에이피알
  '090430': 'cosmetics', // 아모레퍼시픽
  '051900': 'cosmetics', // LG생활건강
  '483650': 'cosmetics', // 달바글로벌
  '002790': 'cosmetics', // 아모레G
  '018290': 'cosmetics', // 브이티
  '161890': 'cosmetics', // 한국콜마
  '192820': 'cosmetics', // 코스맥스
  '241710': 'cosmetics', // 코스메카코리아
  '257720': 'cosmetics', // 실리콘투
  // Auto sector
  '005380': 'auto', // 현대차
  '000270': 'auto', // 기아
  '003620': 'auto', // KG모빌리티
  '012330': 'auto', // 현대모비스
  '204320': 'auto', // HL만도
  '018880': 'auto', // 한온시스템
  '011210': 'auto', // 현대위아
  '005850': 'auto', // 에스엘
  '007340': 'auto', // DN오토모티브
  '009900': 'auto', // 명신산업
  '015750': 'auto', // 성우하이텍
  '200880': 'auto', // 서연이화
  '010690': 'auto', // 화신
  '000430': 'auto', // 대원강업
  '064960': 'auto', // SNT모티브
  '161390': 'auto', // 한국타이어
  '073240': 'auto', // 금호타이어
  '002350': 'auto', // 넥센타이어
  '000240': 'auto', // 한국앤컴퍼니
  '307950': 'auto', // 현대오토에버
  '097520': 'auto', // 엠씨넥스
  // MedTech sector
  '096530': 'medtech', // 씨젠
  '328130': 'medtech', // 루닛
  '041830': 'medtech', // 인바디
  '145720': 'medtech', // 덴티움
  '389650': 'medtech', // 넥스트바이오메디컬
  // Finance sector (single home)
  '105560': 'finance', // KB금융
  '055550': 'finance', // 신한지주
  '086790': 'finance', // 하나금융지주
  '316140': 'finance', // 우리금융지주
  '024110': 'finance', // 기업은행
  '138930': 'finance', // BNK금융지주
  '175330': 'finance', // JB금융지주
  '139130': 'finance', // iM금융지주
  '138040': 'finance', // 메리츠금융지주
  '071050': 'finance', // 한국금융지주
  '006800': 'finance', // 미래에셋증권
  '005940': 'finance', // NH투자증권
  '016360': 'finance', // 삼성증권
  '039490': 'finance', // 키움증권
  '003540': 'finance', // 대신증권
  '003470': 'finance', // 유안타증권
  '001500': 'finance', // 현대차증권
  '003530': 'finance', // 한화투자증권
  '001200': 'finance', // 유진투자증권
  '078020': 'finance', // LS증권
  '032830': 'finance', // 삼성생명
  '000810': 'finance', // 삼성화재
  '005830': 'finance', // DB손해보험
  '001450': 'finance', // 현대해상
  '088350': 'finance', // 한화생명
  '000370': 'finance', // 한화손해보험
  '029780': 'finance', // 삼성카드
  '100790': 'finance', // 미래에셋벤처투자
  '027360': 'finance', // 아주IB투자
  '094800': 'finance', // 맵스리얼티
  '041190': 'finance', // 우리기술투자
  // Construction sector
  '028260': 'construction', // 삼성물산
  '000720': 'construction', // 현대건설
  '047040': 'construction', // 대우건설
  '375500': 'construction', // DL이앤씨
  '006360': 'construction', // GS건설
  '009410': 'construction', // 태영건설
  '294870': 'construction', // 현대산업개발
  '012630': 'construction', // HDC
  '035890': 'construction', // 서희건설
  '267270': 'construction', // HD건설기계
  '000210': 'construction', // DL
  '034830': 'construction', // 한국토지신탁
};

/**
 * Explicit multi-sector membership. Ticker may appear only in listed sector keys.
 * Example: bio + cosmetics for Hugel / Caregen.
 */
export const SECTOR_CROSS = {
  '145020': ['bio', 'cosmetics'], // 휴젤
  '214370': ['bio', 'cosmetics'], // 케어젠
};

/** @returns {string|null} exclusive single-home sector key, or null */
export function exclusiveSector(ticker) {
  if (ticker == null) return null;
  return SECTOR_EXCLUSIVE[String(ticker).trim()] || null;
}

/** @returns {string[]|null} allowed sector keys for cross-listed tickers */
export function crossSectors(ticker) {
  if (ticker == null) return null;
  const list = SECTOR_CROSS[String(ticker).trim()];
  return list && list.length ? list : null;
}

/** Keep company only if allowed in this sector (exclusive, cross, or unrestricted). */
export function allowedInSector(ticker, sectorKey) {
  const t = String(ticker ?? '').trim();
  if (!t) return true;
  const exclusive = exclusiveSector(t);
  if (exclusive) return exclusive === sectorKey;
  const cross = crossSectors(t);
  if (cross) return cross.includes(sectorKey);
  return true;
}

export function filterCompaniesForSector(companies, sectorKey) {
  return (companies || []).filter((c) => allowedInSector(c && c.ticker, sectorKey));
}

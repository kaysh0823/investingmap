/**
 * Tickers that must appear in exactly one industry map.
 * Key = ticker, value = sector key (semi|bio|ship|defense|robot|energy|powergrid|kculture|finance|construction).
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
  '093370': 'energy', // 후성
  '078600': 'semi', // 대주전자재료
  '178920': 'semi', // PI첨단소재
  '011930': 'energy', // 신성이엔지
  '034020': 'powergrid', // 두산에너빌리티
  '267260': 'powergrid', // HD현대일렉트릭
  '267250': 'ship', // HD현대
  '100090': 'ship', // SK오션플랜트
  '060280': 'robot', // 큐렉소
  '285130': 'energy', // SK케미칼
  '214150': 'kconsume', // 클래시스
  '192820': 'kconsume', // 코스맥스
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

/** @returns {string|null} allowed sector key, or null if not restricted */
export function exclusiveSector(ticker) {
  if (ticker == null) return null;
  return SECTOR_EXCLUSIVE[String(ticker).trim()] || null;
}

/** Keep company only if unrestricted or assigned to this sector. */
export function allowedInSector(ticker, sectorKey) {
  const allowed = exclusiveSector(ticker);
  return !allowed || allowed === sectorKey;
}

export function filterCompaniesForSector(companies, sectorKey) {
  return (companies || []).filter((c) => allowedInSector(c && c.ticker, sectorKey));
}

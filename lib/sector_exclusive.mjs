/**
 * Single-home tickers: must appear in exactly one industry map (removed from others).
 * Key = ticker, value = sector key.
 *
 * No multi-sector memberships are currently active.
 */
export const SECTOR_EXCLUSIVE = {
  // Korea chip leaders
  '005930': 'bigchip', // 삼성전자
  '000660': 'bigchip', // SK하이닉스
  // IT & software
  '035420': 'software', // NAVER
  '035720': 'software', // 카카오
  '018260': 'software', // 삼성SDS
  '064400': 'software', // LG CNS
  '022100': 'software', // 포스코DX
  '012510': 'software', // 더존비즈온
  '181710': 'software', // NHN
  '053800': 'software', // 안랩
  '030520': 'software', // 한글과컴퓨터
  '042000': 'software', // 카페24
  '079940': 'software', // 가비아
  '203650': 'software', // 드림시큐리티
  '286940': 'software', // 롯데이노베이트
  '093320': 'software', // 케이아이엔엑스
  // Holdings
  '402340': 'holdings', // SK스퀘어
  '034730': 'holdings', // SK
  '000150': 'holdings', // 두산
  '005490': 'holdings', // 포스코홀딩스
  '267250': 'holdings', // HD현대
  '003550': 'holdings', // LG
  '006260': 'holdings', // LS
  '000880': 'holdings', // 한화
  '180640': 'holdings', // 한진칼
  '078930': 'holdings', // GS
  '001040': 'holdings', // CJ
  '004800': 'holdings', // 효성
  '004990': 'holdings', // 롯데지주
  '009970': 'holdings', // 영원무역홀딩스
  '001800': 'holdings', // 오리온홀딩스
  '012630': 'holdings', // HDC
  '003380': 'holdings', // 하림지주
  '000210': 'holdings', // DL
  '002020': 'holdings', // 코오롱
  '007700': 'holdings', // F&F홀딩스
  '383800': 'holdings', // LX홀딩스
  '003030': 'holdings', // 세아제강지주
  '058650': 'holdings', // 세아홀딩스
  '000070': 'holdings', // 삼양홀딩스
  '072710': 'holdings', // 농심홀딩스
  '060980': 'holdings', // HL홀딩스
  '012030': 'holdings', // DB
  '084690': 'holdings', // 대상홀딩스
  '030530': 'holdings', // 원익홀딩스
  '005810': 'holdings', // 풍산홀딩스
  '036530': 'holdings', // SNT홀딩스
  // Telecom
  '017670': 'telecom', // SK텔레콤
  '030200': 'telecom', // KT
  '032640': 'telecom', // LG유플러스
  '010170': 'telecom', // 대한광통신
  '218410': 'telecom', // RFHIC
  '032500': 'telecom', // 케이엠더블유
  '189300': 'defense', // 인텔리안테크
  '050890': 'telecom', // 쏠리드
  '037460': 'telecom', // 삼지전자
  '138080': 'telecom', // 오이솔루션
  '069540': 'telecom', // 라이트론
  '230240': 'telecom', // 에치에프알
  // Electrical & electronics
  '009150': 'elec', // 삼성전기
  '011070': 'elec', // LG이노텍
  '066570': 'elec', // LG전자
  '034220': 'elec', // LG디스플레이
  '021240': 'elec', // 코웨이
  '489790': 'elec', // 한화비전
  '043260': 'elec', // 성호전자
  '001820': 'elec', // 삼화콘덴서
  '065350': 'elec', // 신성델타테크
  '204270': 'elec', // 제이앤티씨
  '248070': 'elec', // 솔루엠
  '090460': 'elec', // 비에이치
  '417200': 'elec', // LS머트리얼즈
  '033240': 'elec', // 자화전자
  '077360': 'elec', // 덕산하이메탈
  '017900': 'elec', // 광전자
  '046890': 'elec', // 서울반도체
  '004710': 'elec', // 한솔테크닉스
  '192650': 'elec', // 드림텍
  '052710': 'elec', // 아모텍
  '065680': 'elec', // 우주일렉트로
  '284740': 'elec', // 쿠쿠홈시스
  '049070': 'elec', // 인탑스
  // Power grid / cables
  '000500': 'powergrid', // 가온전선
  '006340': 'powergrid', // 대원전선
  '060370': 'powergrid', // LS마린솔루션
  '229640': 'powergrid', // LS에코에너지
  // Steel, metals & machinery
  '047050': 'metal', // 포스코인터내셔널
  '004020': 'metal', // 현대제철
  '010130': 'metal', // 고려아연
  '016380': 'metal', // KG스틸
  '002240': 'metal', // 고려제강
  '460860': 'metal', // 동국제강
  '092790': 'metal', // 넥스틸
  '002710': 'metal', // TCC스틸
  '058430': 'metal', // 포스코스틸리온
  '104700': 'metal', // 한국철강
  '084010': 'metal', // 대한제강
  '241560': 'metal', // 두산밥캣
  '017800': 'metal', // 현대엘리베이터
  '001430': 'metal', // 세아베스틸지주
  '006110': 'metal', // 삼아알미늄
  '000670': 'metal', // 영풍
  '295310': 'metal', // 에이치브이엠
  '019210': 'metal', // 와이지-원
  '009160': 'metal', // SIMPAC
  '306200': 'metal', // 세아제강
  '125490': 'robot', // 한라캐스트
  '160190': 'robot', // 하이젠알앤엠
  '329180': 'ship', // HD현대중공업
  '012450': 'defense', // 한화에어로스페이스
  '042660': 'ship', // 한화오션
  '009540': 'ship', // HD한국조선해양
  '010140': 'ship', // 삼성중공업
  '064350': 'defense', // 현대로템
  '079550': 'defense', // LIG디펜스앤에어로스페이스
  '103140': 'defense', // 풍산
  '082740': 'ship', // 한화엔진
  '071970': 'ship', // HD현대마린엔진
  '097230': 'ship', // HJ중공업
  '077970': 'ship', // STX엔진
  '100840': 'ship', // SNT에너지
  '064820': 'ship', // 케이프
  '039030': 'semi', // 이오테크닉스
  '425040': 'semi', // 티이엠씨 (공정장비; robot 시드 오등록 방지)
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
  '100090': 'ship', // SK오션플랜트
  '060280': 'medtech', // 큐렉소
  '285130': 'renewable', // SK케미칼
  '119850': 'renewable', // 지엔씨에너지
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
  '145020': 'cosmetics', // 휴젤
  '214370': 'cosmetics', // 케어젠
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
  '025540': 'auto', // 한국단자
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
  '035890': 'construction', // 서희건설
  '267270': 'construction', // HD건설기계
  '034830': 'construction', // 한국토지신탁
};

/**
 * Explicit multi-sector membership. Ticker may appear only in listed sector keys.
 * Example: bio + cosmetics for Hugel / Caregen.
 */
export const SECTOR_CROSS = {};

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

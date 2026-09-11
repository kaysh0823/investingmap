/**
 * Single-home tickers: must appear in exactly one industry map (removed from others).
 * Key = ticker, value = sector key.
 *
 * Kakao Pay (377300) is cross-listed finance+software; other multi-sector memberships inactive.
 */
export const SECTOR_EXCLUSIVE = {
  '323280': 'semi', // 태성 (P3 mcap admission → 전공정 장비)
  '127120': 'semi', // 제이에스링크 (P3 mcap admission → 공정 부품·유지관리)
  '388210': 'semi', // 씨엠티엑스 (P3 mcap admission → 공정 부품·유지관리)
  '159010': 'semi', // 아스플로 (P3 mcap admission → 공정 부품·유지관리)
  '031330': 'semi', // 에스에이엠티 (P3 mcap admission → 반도체 유통)
  '024850': 'semi', // HLB이노베이션 (P3 mcap admission → 기판·패키징 소재)
  '383310': 'semi', // 에코프로에이치엔 (P3 mcap admission → 팹 인프라·지원설비)
  '029460': 'semi', // 케이씨 (P3 mcap admission → 팹 인프라·지원설비)
  '015360': 'semi', // INVENI (P3 mcap admission → 전공정 장비)
  '170920': 'semi', // 엘티씨 (P3 mcap admission → 공정 소재)
  '032820': 'nuclear', // 우리기술 (P3 mcap admission → 계측·제어)
  '126720': 'nuclear', // 수산인더스트리 (P3 mcap admission → 정비·운영지원)
  '089860': 'auto', // 롯데렌탈 (P3 mcap admission → 유통·모빌리티 서비스)
  '046070': 'auto', // 코다코 (P3 mcap admission → 차체·내외장)
  '004700': 'auto', // 조광피혁 (P3 mcap admission → 차체·내외장)
  '448900': 'auto', // 한국피아이엠 (P3 mcap admission → 섀시·안전)
  '033790': 'battery', // 피노 (P3 mcap admission → 제조·검사 장비)
  '009450': 'elec', // 경동나비엔 (P3 mcap admission → 가전·생활기기)
  '025320': 'elec', // 시노펙스 (P3 mcap admission → 전자부품·기판)
  '079900': 'machinery', // 전진건설로봇 (P3 mcap admission → 건설기계)
  '014830': 'chemical', // 유니드 (P3 mcap admission → 정밀·특수화학)
  '001390': 'chemical', // KG케미칼 (P3 mcap admission → 비료·농화학)
  '950260': 'bio', // 인제니아테라퓨틱스(Reg.S) (P3 mcap admission → 신약개발)
  '187660': 'bio', // 페니트리움바이오 (P3 mcap admission → 신약개발)
  '386380': 'medtech', // 스카이랩스 (P3 mcap admission → 생체측정·모니터링)
  '484870': 'defense', // 엠앤씨솔루션 (P3 mcap admission → 소재·핵심부품)
  '368770': 'defense', // 파이버프로 (P3 mcap admission → 방산전자·센서)
  '452260': 'kconsume', // 한화갤러리아 (P3 mcap admission → 유통)
  '194370': 'kconsume', // 제이에스코퍼레이션 (P3 mcap admission → 의류 제조)
  '006730': 'travel', // 서부T&D (P3 mcap admission → 호텔·리조트)
  '064260': 'software', // 다날 (P3 mcap admission → 결제·데이터 인프라)
  '234340': 'software', // 헥토파이낸셜 (P3 mcap admission → 결제·데이터 인프라)
  '499790': 'holdings', // GS피앤엘 (P3 mcap admission → 에너지·화학)
  '034310': 'holdings', // NICE (P3 mcap admission → 금융)
  '008060': 'holdings', // 대덕 (P3 mcap admission → IT·전자)
  '035810': 'holdings', // 이지홀딩스 (P3 mcap admission → 소비·유통)
  '008730': 'chemical', // 율촌화학 (포장재 복원)
  '014820': 'chemical', // 동원시스템즈 (포장재 복원)
  '044490': 'renewable', // 태웅 (ship→renewable 구조물·보조설비, 해상풍력 플랜지 44%)
  '001570': 'chemical', // 금양 (battery→chemical 정밀·특수화학, 발포제 100%)
  '082270': 'semi', // 젬백스 (bio→semi 팹 인프라·지원설비, 케미컬필터 95.5%)
  '000120': 'shipping', // CJ대한통운 (kconsume→shipping 종합물류)
  '086280': 'shipping', // 현대글로비스 (kconsume→shipping 자동차·특수화물 운송)
  '0120G0': 'medtech', // 삼양바이오팜 (bio→medtech 의료소모품·재생재료)
  '290650': 'medtech', // 엘앤씨바이오 (bio→medtech 의료소모품·재생재료)
  '086900': 'cosmetics', // 메디톡스 (bio→cosmetics 에스테틱 의약품·소모품)
  '222080': 'battery', // SFA넥셀 (elec→battery 제조·검사 장비)
  '403550': 'auto', // 쏘카 (유통·모빌리티 서비스)
  '381970': 'auto', // 케이카 (유통·모빌리티 서비스)
  '437730': 'auto', // 삼현 (구동·파워트레인)
  '003280': 'shipping', // 흥아해운 (컨테이너 해운)
  '005880': 'shipping', // 대한해운 (벌크 해운)
  '028670': 'shipping', // 팬오션 (벌크 해운)
  '011200': 'shipping', // HMM (컨테이너 해운)

  // Korea chip leaders
  '005930': 'bigchip', // 삼성전자
  '000660': 'bigchip', // SK하이닉스
  // IT & software
  '035420': 'software', // NAVER
  '035720': 'software', // 카카오
  '018260': 'software', // 삼성SDS
  '064400': 'software', // LG CNS
  '022100': 'software', // 포스코DX
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
  '024720': 'holdings', // 콜마홀딩스
  '036830': 'holdings', // 솔브레인홀딩스 (semi→holdings)
  // Telecom
  '017670': 'telecom', // SK텔레콤
  '030200': 'telecom', // KT
  '032640': 'telecom', // LG유플러스
  '010170': 'telecom', // 대한광통신
  '218410': 'telecom', // RFHIC
  '032500': 'telecom', // 케이엠더블유
  '189300': 'telecom', // 인텔리안테크 (위성통신 장비)
  '347700': 'defense', // 스피어
  '050890': 'telecom', // 쏠리드
  '037460': 'telecom', // 삼지전자
  '138080': 'telecom', // 오이솔루션
  '069540': 'telecom', // 라이트론
  '230240': 'telecom', // 에치에프알
  // Chemical & refining
  '011780': 'chemical', // 금호석유화학
  '011170': 'chemical', // 롯데케미칼
  '120110': 'chemical', // 코오롱인더
  '003240': 'chemical', // 태광산업
  '006650': 'chemical', // 대한유화
  '005950': 'chemical', // 이수화학
  '457190': 'chemical', // 이수스페셜티케미컬
  '069260': 'chemical', // TKG휴켐스
  '268280': 'chemical', // 미원에스씨
  '002840': 'chemical', // 미원상사
  '006380': 'chemical', // 카프로
  '161000': 'chemical', // 애경케미칼
  '007690': 'chemical', // 국도화학
  '025860': 'chemical', // 남해화학
  '017890': 'chemical', // 한국알콜
  '010950': 'chemical', // S-Oil
  '005090': 'powergrid', // SGC에너지 (chemical→powergrid 유틸리티, 집단에너지·정유 없음)
  '017940': 'chemical', // E1
  '002960': 'chemical', // 한국쉘석유
  '004690': 'powergrid', // 삼천리 (chemical→powergrid 유틸리티)
  '298020': 'chemical', // 효성티앤씨
  '004000': 'chemical', // 롯데정밀화학
  '298050': 'chemical', // HS효성첨단소재
  '002810': 'chemical', // 삼영무역
  // Travel, leisure & airlines
  '003490': 'travel', // 대한항공
  '020560': 'travel', // 아시아나항공
  '089590': 'travel', // 제주항공
  '272450': 'travel', // 진에어
  '035250': 'travel', // 강원랜드
  '034230': 'travel', // 파라다이스
  '114090': 'travel', // GKL
  '032350': 'travel', // 롯데관광개발
  '008770': 'travel', // 호텔신라
  '025980': 'travel', // 아난티
  '039130': 'travel', // 하나투어
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
  '077360': 'semi', // 덕산하이메탈 (elec→semi 기판·패키징 소재)
  '017900': 'elec', // 광전자
  '046890': 'elec', // 서울반도체
  '004710': 'elec', // 한솔테크닉스
  '192650': 'elec', // 드림텍
  '052710': 'elec', // 아모텍
  '065680': 'elec', // 우주일렉트로
  '284740': 'elec', // 쿠쿠홈시스
  '049070': 'elec', // 인탑스
  '171090': 'elec', // 선익시스템 (OLED 증착 장비)
  '213420': 'elec', // 덕산네오룩스
  // Power grid / cables
  '001440': 'powergrid', // 대한전선
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
  '241560': 'machinery', // 두산밥캣
  '017800': 'machinery', // 현대엘리베이터
  '001430': 'metal', // 세아베스틸지주
  '006110': 'metal', // 삼아알미늄
  '000670': 'metal', // 영풍
  '295310': 'metal', // 에이치브이엠
  '019210': 'machinery', // 와이지-원
  '009160': 'machinery', // SIMPAC
  '306200': 'metal', // 세아제강
  '125490': 'auto', // 한라캐스트 (robot→auto 차체·내외장)
  '160190': 'robot', // 하이젠알앤엠
  '329180': 'ship', // HD현대중공업
  '012450': 'defense', // 한화에어로스페이스 (육상체계)
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
  '100840': 'nuclear', // SNT에너지
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
  '018670': 'chemical', // SK가스 (renewable→chemical 정유·가스)
  '126340': 'renewable', // 비나텍 (battery→renewable 수소·연료전지)
  '336260': 'renewable', // 두산퓨얼셀
  '078600': 'semi', // 대주전자재료
  '178920': 'semi', // PI첨단소재
  '011930': 'renewable', // 신성이엔지
  '267260': 'powergrid', // HD현대일렉트릭
  '100090': 'renewable', // SK오션플랜트
  '001740': 'chemical', // SK네트웍스
  '060280': 'medtech', // 큐렉소
  '285130': 'renewable', // SK케미칼
  '119850': 'powergrid', // 지엔씨에너지 (renewable→powergrid 비상전원)
  '214150': 'cosmetics', // 클래시스
  '214450': 'cosmetics', // 파마리서치
  '336570': 'cosmetics', // 원텍
  '137310': 'medtech', // 에스디바이오센서
  '099190': 'medtech', // 아이센스
  '228760': 'medtech', // 지노믹트리
  '067630': 'medtech', // HLB생명과학
  '086450': 'bio', // 동국제약
  '009290': 'bio', // 광동제약
  '278470': 'cosmetics', // 에이피알
  '090430': 'cosmetics', // 아모레퍼시픽
  '051900': 'cosmetics', // LG생활건강
  '483650': 'cosmetics', // 달바글로벌
  '002790': 'cosmetics', // 아모레G
  '018290': 'cosmetics', // 브이티
  '251970': 'cosmetics', // 펌텍코리아
  '352480': 'cosmetics', // 씨앤씨인터내셔널
  '003350': 'cosmetics', // 한국화장품제조
  '092730': 'cosmetics', // 네오팜
  '078520': 'cosmetics', // 에이블씨엔씨
  '018250': 'cosmetics', // 애경산업
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
  '010690': 'auto', // 화신 (시총 미달 잠정 exclusive)
  '000430': 'auto', // 대원강업 (시총 미달 잠정 exclusive)
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
  '340570': 'medtech', // 티앤엘
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
  '323410': 'finance', // 카카오뱅크
  '279570': 'finance', // 케이뱅크
  '006220': 'finance', // 제주은행
  '001720': 'finance', // 신영증권
  '030610': 'finance', // 교보증권
  '001510': 'finance', // SK증권
  '001270': 'finance', // 부국증권
  '016610': 'finance', // DB증권
  '085620': 'finance', // 미래에셋생명
  '082640': 'finance', // 동양생명
  '000400': 'finance', // 롯데손해보험
  '003690': 'finance', // 코리안리
  '031210': 'finance', // 서울보증보험
  '034950': 'finance', // 한국기업평가
  '030190': 'finance', // NICE평가정보
  '211050': 'finance', // 인카금융서비스
  '244920': 'finance', // 에이플러스에셋
  '026890': 'finance', // 스틱인베스트먼트
  // Construction sector
  '000720': 'construction', // 현대건설
  '047040': 'construction', // 대우건설
  '375500': 'construction', // DL이앤씨
  '006360': 'construction', // GS건설
  '009410': 'construction', // 태영건설
  '294870': 'construction', // 현대산업개발
  '035890': 'construction', // 서희건설
  '267270': 'machinery', // HD건설기계 (construction→machinery)
  '034830': 'construction', // 한국토지신탁
  '028050': 'construction', // 삼성E&A
  '002990': 'construction', // 금호건설
  '010780': 'construction', // 아이에스동서
  '317400': 'construction', // 자이에스앤디
  '002380': 'chemical', // KCC (construction→chemical 정밀·특수화학)
  '344820': 'construction', // KCC글라스
  '108670': 'construction', // LX하우시스
  '025900': 'construction', // 동화기업
  '009240': 'construction', // 한샘
  '300720': 'construction', // 한일시멘트
  '038500': 'construction', // 삼표시멘트
  '183190': 'construction', // 아세아시멘트
  '123890': 'construction', // 한국자산신탁
};

/**
 * Explicit multi-sector membership. Ticker may appear only in listed sector keys.
 * Example: bio + cosmetics for Hugel / Caregen.
 */
export const SECTOR_CROSS = {
  '377300': ['finance', 'software'], // 카카오페이 (finance 결제·핀테크 + software 결제·데이터 인프라)
  '028260': ['construction', 'kconsume'], // 삼성물산 (건설 + 종합상사)
  '034020': ['nuclear', 'powergrid'], // 두산에너빌리티 (원자로·주기기 + 가스터빈·발전설비)
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

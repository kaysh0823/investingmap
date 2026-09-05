/**
 * Triage candidates from mcap_audit_additions.csv for sector coverage expansion.
 *
 * Filters out:
 *   - Preferred stocks (우선주: name matches '우'/'우B' or ticker ends with 5/7/K)
 *   - REITs / Infrastructure (리츠, 인프라, 맥쿼리, 리얼티)
 *   - SPACs (스팩, 기업인수목적)
 *   - ETN / ETF
 *
 * Enriches remaining eligible candidates with KRX industry from KRX CSVs,
 * proposes 1 sector out of the 24 map sectors (or '미분류'), and outputs:
 *   docs/reports/mcap_additions_triage.csv (ticker,name,mcap_eok,krx_업종,제안섹터,비고)
 *
 * Usage:
 *   node scripts/triage_mcap_additions.mjs
 *   npm run triage:mcap-additions
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readKrxCsvFile } from '../lib/krx_csv_encode.mjs';
import { SECTOR_META } from '../lib/sector_meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_DIR = path.join(ROOT, 'docs', 'reports');
const ADDITIONS_CSV = path.join(REPORTS_DIR, 'mcap_audit_additions.csv');
const TRIAGE_CSV = path.join(REPORTS_DIR, 'mcap_additions_triage.csv');

/** Curated sector and notes for known addition candidates */
const CURATED = {
  // 미분류 (보수적: 담배, 렌탈, 물리보안, 제지, 도시가스, 전통방적, 단순공구 등)
  '033780': { sector: '미분류', note: '담배·홍삼(보수적 미분류)' }, // KT&G
  '012750': { sector: '미분류', note: '물리보안·시설관리(보수적 미분류)' }, // 에스원
  '089860': { sector: '미분류', note: '렌터카·기기렌탈(보수적 미분류)' }, // 롯데렌탈
  '016590': { sector: '미분류', note: '골판지 원지 제조(보수적 미분류)' }, // 신대양제지
  '078130': { sector: '미분류', note: '특수지·박엽지 제조(보수적 미분류)' }, // 국일제지
  '002310': { sector: '미분류', note: '골판지 상자·원지(보수적 미분류)' }, // 아세아제지
  '017390': { sector: '미분류', note: '도시가스 공급(보수적 미분류)' }, // 서울가스
  '003200': { sector: '미분류', note: '면방적사 제조(보수적 미분류)' }, // 일신방직
  '068930': { sector: '미분류', note: '온라인 대입 교육(보수적 미분류)' }, // 디지털대성
  '049430': { sector: '미분류', note: '줄자·수공구 제조(보수적 미분류)' }, // 코메론

  // 반도체 (semi - 18개)
  '323280': { sector: 'semi', note: 'PCB·반도체 습식세정·식각장비' }, // 태성
  '127120': { sector: 'semi', note: '반도체 장비 부품·기술서비스' }, // 제이에스링크
  '031330': { sector: 'semi', note: '삼성전자 반도체·IT 유통' }, // 에스에이엠티
  '388210': { sector: 'semi', note: '반도체 SiC 포커스링 소재' }, // 씨엠티엑스
  '024850': { sector: 'semi', note: '반도체 리드프레임·바이오' }, // HLB이노베이션
  '029460': { sector: 'semi', note: '반도체 가스공급장치·화학소재' }, // 케이씨
  '015360': { sector: 'semi', note: '디스플레이·반도체 건식식각장비' }, // INVENI
  '170920': { sector: 'semi', note: '반도체 세정/박리액 케미컬' }, // 엘티씨
  '159010': { sector: 'semi', note: '반도체 고순도 가스배관 부품' }, // 아스플로
  '452430': { sector: 'semi', note: '마이크로LED DDI 팹리스' }, // 사피엔반도체
  '265520': { sector: 'semi', note: '반도체 급속열처리·디스플레이 ELA' }, // AP시스템
  '482630': { sector: 'semi', note: '반도체 감광액(PR) 핵심소재' }, // 삼양엔씨켐
  '200470': { sector: 'semi', note: '반도체 패키징·테스트(OSAT)' }, // 에이팩트
  '317330': { sector: 'semi', note: '반도체 전구체·OLED 소재' }, // 덕산테코피아
  '001340': { sector: 'semi', note: '반도체 고순도 염소가스·화학' }, // PKC
  '445090': { sector: 'semi', note: 'TSMC VCA 디자인하우스' }, // 에이직랜드
  '456010': { sector: 'semi', note: '보안 반도체(PUF) 팹리스' }, // 아이씨티케이
  '125020': { sector: 'semi', note: '반도체·전자 방열/금속소재' }, // 티씨머티리얼즈

  // 바이오 (bio - 14개)
  '950260': { sector: 'bio', note: '망막질환 신약개발 바이오' }, // 인제니아테라퓨틱스
  '187660': { sector: 'bio', note: '세포·유전자 신약개발 바이오' }, // 페니트리움바이오
  '376270': { sector: 'bio', note: '마이크로바이옴 헬스케어·신약' }, // HEM파마
  '003120': { sector: 'bio', note: '전문의약품·항생제 제조' }, // 일성아이에스
  '004310': { sector: 'bio', note: '전문의약품·탈모치료제' }, // 현대약품
  '377460': { sector: 'bio', note: '임상시험수탁(CRO)·바이오연구' }, // 큐에이드
  '008490': { sector: 'bio', note: '의약품·건기식 하드캡슐 제조' }, // 서흥
  '304360': { sector: 'bio', note: '줄기세포 치료제 개발' }, // 에스바이오메딕스
  '180400': { sector: 'bio', note: '유전체 분석·바이오 신약' }, // DXVX
  '365270': { sector: 'bio', note: '혈관내피질환 신약개발 바이오' }, // 큐라클
  '493280': { sector: 'bio', note: '이중항체 자가면역 신약 바이오' }, // 아이엠바이오로직스
  '290690': { sector: 'bio', note: '치매 신약 파이프라인·LED조명' }, // 아리바이오홀딩스
  '0082N0': { sector: 'bio', note: '면역항암·자가면역 신약 바이오' }, // 카나프테라퓨틱스
  '003520': { sector: 'bio', note: '전문의약품·원료의약품' }, // 영진약품

  // 의료기기/헬스케어 (medtech - 5개)
  '386380': { sector: 'medtech', note: '반지형 혈압·심방세동 웨어러블' }, // 스카이랩스
  '054950': { sector: 'medtech', note: '병원·약국 의약품 자동조제기' }, // 제이브이엠
  '042520': { sector: 'medtech', note: '조직공학 인공유방보형물·골이식재' }, // 한스바이오메드
  '100120': { sector: 'medtech', note: '디지털 엑스레이 디텍터·머신비전' }, // 뷰웍스
  '318060': { sector: 'medtech', note: '치과용 3D프린팅 레진소재' }, // 그래피

  // 화장품/미용기기 (cosmetics - 7개)
  '200670': { sector: 'cosmetics', note: '히알루론산 필러·보톡스 에스테틱' }, // 휴메딕스
  '439090': { sector: 'cosmetics', note: '클린뷰티 스킨케어 화장품' }, // 마녀공장
  '123330': { sector: 'cosmetics', note: '하이드로겔 마스크팩·화장품 ODM' }, // 제닉
  '200130': { sector: 'cosmetics', note: '건강기능식품·화장품 ODM' }, // 콜마비앤에이치
  '226320': { sector: 'cosmetics', note: '스킨케어·화장품 제조 브랜드' }, // 잇츠한불
  '216080': { sector: 'cosmetics', note: '보툴리눔 톡신·필러 에스테틱' }, // 제테마
  '237880': { sector: 'cosmetics', note: '색조 화장품 브랜드(클리오)' }, // 클리오

  // 2차전지 (battery - 10개)
  '033790': { sector: 'battery', note: '2차전지 소재·자동화 장비' }, // 피노
  '091580': { sector: 'battery', note: '2차전지 캔·케이스 부품' }, // 상신이디피
  '378340': { sector: 'battery', note: '2차전지 레이저 노칭·스태킹장비' }, // 필에너지
  '089980': { sector: 'battery', note: '2차전지 부품·수소차 멤브레인' }, // 상아프론테크
  '114190': { sector: 'battery', note: '2차전지 양극재 설비·플랜트' }, // 강원에너지
  '416180': { sector: 'battery', note: '2차전지 버스바(Busbar)·모듈케이스' }, // 신성에스티
  '243840': { sector: 'battery', note: '2차전지 캡어셈블리·캔' }, // 신흥에스이씨
  '095500': { sector: 'battery', note: '2차전지 양극재 수산화리튬 가공' }, // 미래나노텍
  '446540': { sector: 'battery', note: '2차전지 공정핀·반도체 핀' }, // 메가터치
  '354320': { sector: 'battery', note: 'EV 배터리팩 알루미늄 하우징' }, // 알멕

  // 자동차 (auto - 12개)
  '046070': { sector: 'auto', note: '차량용 알루미늄 다이캐스팅 부품' }, // 코다코
  '004700': { sector: 'auto', note: '자동차 카시트용 천연가죽' }, // 조광피혁
  '448900': { sector: 'auto', note: '차량용 MIM 정밀부품' }, // 한국피아이엠
  '043370': { sector: 'auto', note: '자동차 도어 무빙시스템 부품' }, // 피에이치에이
  '900140': { sector: 'auto', note: '동남아 자동차·오토바이 유통' }, // 엘브이엠씨홀딩스
  '092200': { sector: 'auto', note: '자동차 변속기·EV 감속기' }, // 디아이씨
  '009680': { sector: 'auto', note: '엔진·파워트레인 전장부품' }, // 모토닉
  '035150': { sector: 'auto', note: '차량시트·신발용 합성피혁' }, // 백산
  '0011T0': { sector: 'auto', note: '전기차 급속충전기 제조·충전인프라' }, // 채비
  '005710': { sector: 'auto', note: '자동차 시트 제조' }, // 대원산업
  '024840': { sector: 'auto', note: '차량 전장용 모터코어·동선' }, // KBI메탈
  '307180': { sector: 'auto', note: '차량용 실리콘렌즈·전자소재' }, // 아이엘

  // 로봇 (robot - 5개)
  '079900': { sector: 'robot', note: '콘크리트 펌프카·건설로봇' }, // 전진건설로봇
  '000490': { sector: 'robot', note: '트랙터·자율주행 농업로봇' }, // 대동
  '199430': { sector: 'robot', note: '유압로봇·시험평가장비' }, // 케이엔알시스템
  '484810': { sector: 'robot', note: '물류자율주행로봇(AMR)·자동화' }, // 티엑스알로보틱스
  '065710': { sector: 'robot', note: '항만 크레인 구동·자동화제어' }, // 서호전기

  // 방산/우주 (defense - 5개)
  '484870': { sector: 'defense', note: '방산 유압구동장치·기계' }, // 엠앤씨솔루션
  '368770': { sector: 'defense', note: '광섬유 자이로·항공방산 관성센서' }, // 파이버프로
  '484590': { sector: 'defense', note: '방산 방탄복·장갑차 방호복합소재' }, // 삼양컴텍
  '488900': { sector: 'defense', note: '우주발사체 엔진·방산부품' }, // 비츠로넥스텍
  '067390': { sector: 'defense', note: '민항기 동체골격·항공부품' }, // 아스트

  // 조선/해운 (ship - 3개)
  '0008Z0': { sector: 'ship', note: '선박 배전반·전력제어시스템' }, // 에스엔시스
  '044450': { sector: 'ship', note: 'LPG·암모니아 특수선 해상운송' }, // KSS해운
  '004360': { sector: 'ship', note: '항만하역·해상중량물 운송' }, // 세방

  // 원전 (nuclear - 2개)
  '032820': { sector: 'nuclear', note: '원전 제어계측시스템(MMIS)' }, // 우리기술
  '126720': { sector: 'nuclear', note: '원전·발전설비 경상정비' }, // 수산인더스트리

  // 신재생 (renewable - 5개)
  '448280': { sector: 'renewable', note: '탄소배출권·온실가스 감축' }, // 에코아이
  '389260': { sector: 'renewable', note: '풍력·태양광 발전단지 개발' }, // 대명에너지
  '151860': { sector: 'renewable', note: '선박용 바이오중유·친환경에너지' }, // KG에코솔루션
  '0001A0': { sector: 'renewable', note: '산업용 수소·가스 공급' }, // 덕양에너젠
  '017860': { sector: 'renewable', note: '바이오디젤·배터리 리사이클' }, // DS단석

  // 전력설비 (powergrid - 2개)
  '217590': { sector: 'powergrid', note: '선박·원전용 특수케이블' }, // 티엠씨
  '042370': { sector: 'powergrid', note: '전력기기(차단기·개폐기)·우주플라즈마' }, // 비츠로테크

  // 화학·정유 (chemical - 11개)
  '285130': { sector: 'chemical', note: '친환경 코폴리에스터·바이오소재' }, // SK케미칼
  '383310': { sector: 'chemical', note: '반도체 클린룸 필터·친환경 소재' }, // 에코프로에이치엔
  '014830': { sector: 'chemical', note: '가성칼륨·탄산칼륨 글로벌 1위' }, // 유니드
  '001390': { sector: 'chemical', note: '비료·정밀화학소재' }, // KG케미칼
  '004430': { sector: 'chemical', note: '플라스틱 산화방지제 글로벌 2위' }, // 송원산업
  '025000': { sector: 'chemical', note: '폴리우레탄 원료(PPG)' }, // KPX케미칼
  '003650': { sector: 'chemical', note: '윤활유·전기 절연유 제조' }, // 미창석유
  '134380': { sector: 'chemical', note: '계면활성제·황산 정밀화학' }, // 미원화학
  '298000': { sector: 'chemical', note: 'PP(폴리프로필렌)·특수가스' }, // 효성화학
  '309710': { sector: 'chemical', note: '전자소재·의약품 중간체' }, // 아이티켐
  '098070': { sector: 'chemical', note: '화공플랜트 압력용기·열교환기' }, // 한텍

  // K-소비/유통 (kconsume - 22개)
  '452260': { sector: 'kconsume', note: '백화점·명품 리테일' }, // 한화갤러리아
  '194370': { sector: 'kconsume', note: '글로벌 핸드백·의류 ODM' }, // 제이에스코퍼레이션
  '472850': { sector: 'kconsume', note: '브랜드 의류 기획·유통' }, // 폰드그룹
  '003960': { sector: 'kconsume', note: '수산물 가공·종합식품' }, // 사조대림
  '136480': { sector: 'kconsume', note: '육계 가공·축산식품' }, // 하림
  '051500': { sector: 'kconsume', note: '식자재 유통·단체급식' }, // CJ프레시웨이
  '122900': { sector: 'kconsume', note: '산업재 MRO B2B 전자상거래' }, // 아이마켓코리아
  '037710': { sector: 'kconsume', note: '백화점 운영' }, // 광주신세계
  '267980': { sector: 'kconsume', note: '유가공·유음료' }, // 매일유업
  '136490': { sector: 'kconsume', note: '배합사료·식육가공' }, // 선진
  '007160': { sector: 'kconsume', note: '원양어업·수산식품' }, // 사조산업
  '001790': { sector: 'kconsume', note: '제당·식품소재' }, // 대한제당
  '481070': { sector: 'kconsume', note: '패션·의류 브랜드' }, // 에이유브랜즈
  '003920': { sector: 'kconsume', note: '유가공·음료' }, // 남양유업
  '000680': { sector: 'kconsume', note: '스포츠 브랜드(프로스펙스)·상사' }, // LS네트웍스
  '001460': { sector: 'kconsume', note: '이너웨어·내의 제조' }, // BYC
  '036030': { sector: 'kconsume', note: 'T커머스·모바일쿠폰' }, // 케이티알파
  '002320': { sector: 'kconsume', note: '종합물류·택배·항만하역' }, // 한진
  '475560': { sector: 'kconsume', note: '외식 프랜차이즈·식품유통' }, // 더본코리아
  '000050': { sector: 'kconsume', note: '타임스퀘어 복합몰 운영·섬유' }, // 경방
  '033920': { sector: 'kconsume', note: '소주·주류 제조' }, // 무학
  '353810': { sector: 'kconsume', note: '사료첨가제·축산사료' }, // 이지바이오

  // K-콘텐츠 (kcontent - 4개)
  '020120': { sector: 'kcontent', note: '웹툰·웹소설 플랫폼 및 제작' }, // 키다리스튜디오
  '215000': { sector: 'kcontent', note: '스크린골프 시뮬레이터 시스템' }, // 골프존
  '034120': { sector: 'kcontent', note: '지상파 방송·드라마 콘텐츠' }, // SBS
  '037270': { sector: 'kcontent', note: 'K-pop 음원유통·MD기획' }, // YG PLUS

  // IT·소프트웨어 (software - 11개)
  '064260': { sector: 'software', note: '모바일 결제·전자금융(PG)' }, // 다날
  '234340': { sector: 'software', note: '간편현금결제·가상계좌 핀테크' }, // 헥토파이낸셜
  '377450': { sector: 'software', note: '프롭테크·부동산 권리조사 솔루션' }, // 리파인
  '035600': { sector: 'software', note: '전자결제대행(PG) 1위' }, // KG이니시스
  '461300': { sector: 'software', note: '디지털 초등 교육 플랫폼' }, // 아이스크림미디어
  '108860': { sector: 'software', note: '음성인식·생성형 AI 솔루션' }, // 셀바스AI
  '462860': { sector: 'software', note: '펌뱅킹·B2B 핀테크 플랫폼' }, // 더즌
  '094480': { sector: 'software', note: '전자결제·모바일상품권' }, // 갤럭시아머니트리
  '071200': { sector: 'software', note: '의료영상정보시스템(PACS) SW' }, // 인피니트헬스케어
  '298830': { sector: 'software', note: '차량·원전 SW 테스팅 자동화' }, // 슈어소프트테크
  '053300': { sector: 'software', note: '공인인증·보안인증 솔루션' }, // 한국정보인증

  // 금융 (finance - 6개)
  '034830': { sector: 'finance', note: '부동산 신탁·도시정비' }, // 한국토지신탁
  '001750': { sector: 'finance', note: '증권·금융투자업' }, // 한양증권
  '030210': { sector: 'finance', note: '증권·금융투자업' }, // 다올투자증권
  '000540': { sector: 'finance', note: '손해보험사' }, // 흥국화재
  '023760': { sector: 'finance', note: '여신전문금융(리스·할부금융)' }, // 한국캐피탈
  '241520': { sector: 'finance', note: '벤처캐피탈(VC) 스타트업 투자' }, // DSC인베스트먼트

  // 건설 (construction - 7개)
  '053690': { sector: 'construction', note: '건설사업관리(CM/PM)' }, // 한미글로벌
  '023410': { sector: 'construction', note: '레미콘·건축자재 국내 1위' }, // 유진기업
  '011560': { sector: 'construction', note: '반도체 클린룸·배관설비공사' }, // 세보엠이씨
  '003070': { sector: 'construction', note: '종합건설·해상풍력 개발' }, // 코오롱글로벌
  '001470': { sector: 'construction', note: '토목·종합건설' }, // 삼부토건
  '004980': { sector: 'construction', note: '시멘트·레미콘 제조' }, // 성신양회
  '018310': { sector: 'construction', note: '건축용 알루미늄 거푸집(알폼)' }, // 삼목에스폼

  // 지주회사 (holdings - 9개)
  '499790': { sector: 'holdings', note: 'GS그룹 에너지·물류 지주회사' }, // GS피앤엘
  '034310': { sector: 'holdings', note: 'NICE그룹 순수지주회사' }, // NICE
  '008060': { sector: 'holdings', note: '대덕그룹 순수지주회사' }, // 대덕
  '035810': { sector: 'holdings', note: '사료·축산·바이오 지주회사' }, // 이지홀딩스
  '044820': { sector: 'holdings', note: '코스맥스그룹 지주회사' }, // 코스맥스비티아이
  '000320': { sector: 'holdings', note: '노루그룹 순수지주회사' }, // 노루홀딩스
  '000480': { sector: 'holdings', note: '조선내화 지주회사' }, // CR홀딩스
  '036710': { sector: 'holdings', note: '심텍(반도체PCB) 지주회사' }, // 심텍홀딩스
  '100250': { sector: 'holdings', note: '진양그룹 순수지주회사' }, // 진양홀딩스

  // 통신 (telecom - 3개)
  '073490': { sector: 'telecom', note: '무선통신망 최적화 장비·계측' }, // LIG아큐버
  '046970': { sector: 'telecom', note: '양자암호통신 SPAD·광소자' }, // 우리로
  '380540': { sector: 'telecom', note: '5G·데이터센터 광트랜시버' }, // 옵티코어

  // 여행·레저·항공 (travel - 8개)
  '006730': { sector: 'travel', note: '호텔(드래곤시티)·복합쇼핑몰' }, // 서부T&D
  '204620': { sector: 'travel', note: '외국인 택스리펀드(Tax Refund) 대행' }, // 글로벌텍스프리
  '091810': { sector: 'travel', note: '항공 여객운송' }, // 트리니티항공
  '005430': { sector: 'travel', note: '항공기 지상조업·항공서비스' }, // 한국공항
  '298690': { sector: 'travel', note: '저비용항공(LCC) 여객운송' }, // 에어부산
  '019010': { sector: 'travel', note: '웨딩·골프장·백화점 운영' }, // 베뉴지
  '950170': { sector: 'travel', note: '일본 사후면세점 운영' }, // JTC
  '000650': { sector: 'travel', note: '고속버스 여객운송' }, // 천일고속

  // 전기·전자 (elec - 12개)
  '009450': { sector: 'elec', note: '콘덴싱 보일러·온수기' }, // 경동나비엔
  '025320': { sector: 'elec', note: 'FPCB·반도체 필터·의료필터' }, // 시노펙스
  '045390': { sector: 'elec', note: '철도 신호제어 시스템' }, // 대아티아이
  '060720': { sector: 'elec', note: '폴더블 힌지·정밀 메탈부품' }, // KH바텍
  '121800': { sector: 'elec', note: '방송용 디스플레이·모니터' }, // 비덴트
  '900290': { sector: 'elec', note: '광학보호필름·정밀코팅소재' }, // GRT
  '005680': { sector: 'elec', note: '알루미늄 전해콘덴서' }, // 삼영전자
  '484120': { sector: 'elec', note: '폴더블 초박막강화유리(UTG)' }, // 도우인시스
  '061090': { sector: 'elec', note: '이륜차 스마트 통신기기' }, // 세나테크놀로지
  '052710': { sector: 'elec', note: '칩바리스터·전장용 BLDC모터' }, // 아모텍
  '052330': { sector: 'elec', note: '카지노·산업용 특수모니터' }, // 코텍
  '003720': { sector: 'elec', note: '커패시터용 초박막 필름' }, // 삼영

  // 철강·금속·기계 (metal - 4개)
  '002900': { sector: 'metal', note: '트랙터·농업기계' }, // TYM
  '036890': { sector: 'metal', note: '건설중장비 하부주행체 부품' }, // 진성티이씨
  '001250': { sector: 'metal', note: '철강·에너지 무역 종합상사' }, // GS글로벌
  '005010': { sector: 'metal', note: '강관(배관재·유정관) 제조' }, // 휴스틸
};

/**
 * Fallback heuristic rule-based sector proposer for uncurated candidates.
 */
function proposeSectorByHeuristics(name, krxInd) {
  const n = (name || '').toLowerCase();
  const ind = (krxInd || '').toLowerCase();

  // Conservative exclusions
  if (/담배|인삼/.test(n) || /담배/.test(ind)) return { sector: '미분류', note: '담배(보수적 미분류)' };
  if (/보안|에스원/.test(n)) return { sector: '미분류', note: '물리보안(보수적 미분류)' };
  if (/렌탈|렌트/.test(n)) return { sector: '미분류', note: '렌탈(보수적 미분류)' };
  if (/제지|골판지|종이|펄프/.test(n) || /종이·목재/.test(ind)) return { sector: '미분류', note: '제지(보수적 미분류)' };

  // Specific sectors
  if (/반도체|semiconductor|팹리스|파운드리|패키징|테스트|웨이퍼|오사트/.test(n)) return { sector: 'semi', note: '반도체 관련' };
  if (/바이오|제약|생명공학|테라퓨틱스|항암|치료제|파마|백신|임상/.test(n) || /제약/.test(ind)) return { sector: 'bio', note: '바이오·제약' };
  if (/의료기기|헬스케어|디텍터|임플란트|진단/.test(n) || /의료·정밀기기/.test(ind)) return { sector: 'medtech', note: '의료기기' };
  if (/화장품|뷰티|코스메틱|에스테틱|필러|보톡스/.test(n)) return { sector: 'cosmetics', note: '화장품·미용' };
  if (/배터리|2차전지|양극재|음극재|전해액|분리막/.test(n)) return { sector: 'battery', note: '2차전지' };
  if (/자동차|오토|모터스|타이어|전장/.test(n) || /운송장비·부품/.test(ind)) return { sector: 'auto', note: '자동차·부품' };
  if (/로봇|로보틱스|자동화/.test(n)) return { sector: 'robot', note: '로봇·자동화' };
  if (/방산|우주|항공|에어로스페이스|위성/.test(n)) return { sector: 'defense', note: '방산·우주' };
  if (/조선|해운|선박|해양/.test(n)) return { sector: 'ship', note: '조선·해운' };
  if (/원전|원자력/.test(n)) return { sector: 'nuclear', note: '원전' };
  if (/태양광|풍력|신재생|수소|친환경/.test(n)) return { sector: 'renewable', note: '신재생에너지' };
  if (/전력|변압기|케이블|배전/.test(n)) return { sector: 'powergrid', note: '전력설비' };
  if (/화학|케미칼|정유|석유/.test(n) || /화학/.test(ind)) return { sector: 'chemical', note: '화학' };
  if (/엔터|미디어|스튜디오|콘텐츠|방송|게임|웹툰/.test(n) || /오락·문화/.test(ind)) return { sector: 'kcontent', note: 'K-콘텐츠' };
  if (/소프트웨어|인공지능|솔루션|클라우드|플랫폼|it/.test(n) || /it 서비스/.test(ind)) return { sector: 'software', note: '소프트웨어' };
  if (/증권|금융|캐피탈|보험|은행|투자/.test(n) || /금융|증권|보험/.test(ind)) return { sector: 'finance', note: '금융' };
  if (/건설|토목|엔지니어링|시멘트|레미콘/.test(n) || /건설/.test(ind)) return { sector: 'construction', note: '건설' };
  if (/홀딩스|지주/.test(n)) return { sector: 'holdings', note: '지주사' };
  if (/통신|텔레콤|네트워크/.test(n) || /통신/.test(ind)) return { sector: 'telecom', note: '통신' };
  if (/항공|여행|투어|호텔|카지노|면세/.test(n)) return { sector: 'travel', note: '여행·항공' };
  if (/식품|유업|제당|사료|육가공|외식|유통|백화점|패션|의류/.test(n) || /음식료|유통|섬유·의류/.test(ind)) return { sector: 'kconsume', note: '소비재·유통' };
  if (/전자|전기|부품|디스플레이/.test(n) || /전기·전자/.test(ind)) return { sector: 'elec', note: '전기·전자' };
  if (/철강|금속|기계|제철|파이프|강관/.test(n) || /금속|기계·장비/.test(ind)) return { sector: 'metal', note: '철강·기계' };

  return { sector: '미분류', note: '미분류' };
}

/** Check if preferred stock */
function isPreferredStock(ticker, name) {
  if (/[57K]$/i.test(ticker)) return true;
  if (/우$|우B$|우\(전환\)|우선주/i.test(name)) return true;
  if (/우B|2우|3우|1우/i.test(name)) return true;
  return false;
}

/** Check if REIT / Infra */
function isReitOrInfra(name) {
  return /리츠|인프라|맥쿼리|리얼티/i.test(name);
}

/** Check if SPAC */
function isSpac(name) {
  return /스팩|기업인수목적/i.test(name);
}

/** Check if ETN / ETF */
function isEtnOrEtf(name) {
  return /ETN|ETF/i.test(name);
}

function loadKrxIndustryMap() {
  const indMap = new Map();
  const dataDir = path.join(ROOT, 'data');
  const files = ['data_4848_20260612.csv', 'data_4937_20260612.csv'];

  for (const f of files) {
    const p = path.join(dataDir, f);
    if (!fs.existsSync(p)) continue;
    const text = readKrxCsvFile(p);
    for (const line of text.split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const parts = line.split('","').map(s => s.replace(/^"|"$/g, ''));
      if (parts.length >= 4 && parts[0]) {
        indMap.set(parts[0].trim(), parts[3].trim());
      }
    }
  }

  // Fallbacks for recent listings not present in 20260612 snapshot
  if (!indMap.has('950260')) indMap.set('950260', '기타서비스'); // 인제니아테라퓨틱스
  if (!indMap.has('386380')) indMap.set('386380', '의료·정밀기기'); // 스카이랩스

  return indMap;
}

function escapeCsvField(val) {
  const s = String(val == null ? '' : val);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function triageMcapAdditions() {
  if (!fs.existsSync(ADDITIONS_CSV)) {
    throw new Error(`Additions CSV not found at ${ADDITIONS_CSV}`);
  }

  const lines = fs.readFileSync(ADDITIONS_CSV, 'utf8').trim().split(/\r?\n/);
  const rows = lines.slice(1).filter(Boolean);

  const krxIndMap = loadKrxIndustryMap();

  const prefList = [];
  const reitList = [];
  const spacList = [];
  const etnEtfList = [];
  const eligible = [];

  for (const line of rows) {
    const parts = line.split(',');
    const ticker = (parts[0] || '').trim();
    const name = (parts[1] || '').trim();
    const market = (parts[2] || '').trim();
    const mcapEok = parseFloat((parts[3] || '').trim()) || 0;

    if (isPreferredStock(ticker, name)) {
      prefList.push({ ticker, name });
    } else if (isReitOrInfra(name)) {
      reitList.push({ ticker, name });
    } else if (isSpac(name)) {
      spacList.push({ ticker, name });
    } else if (isEtnOrEtf(name)) {
      etnEtfList.push({ ticker, name });
    } else {
      const krxInd = krxIndMap.get(ticker) || '';
      const curated = CURATED[ticker];
      const proposed = curated || proposeSectorByHeuristics(name, krxInd);

      eligible.push({
        ticker,
        name,
        market,
        mcapEok,
        krxInd,
        sector: proposed.sector,
        note: proposed.note,
      });
    }
  }

  // Sort eligible by mcap descending
  eligible.sort((a, b) => b.mcapEok - a.mcapEok);

  // Generate CSV with UTF-8 BOM for Excel compatibility
  const csvLines = ['\uFEFFticker,name,mcap_eok,krx_업종,제안섹터,비고'];
  for (const item of eligible) {
    csvLines.push([
      escapeCsvField(item.ticker),
      escapeCsvField(item.name),
      escapeCsvField(item.mcapEok.toFixed(2)),
      escapeCsvField(item.krxInd),
      escapeCsvField(item.sector),
      escapeCsvField(item.note),
    ].join(','));
  }

  fs.writeFileSync(TRIAGE_CSV, csvLines.join('\n'), 'utf8');

  // Summary counts
  const sectorCounts = {};
  for (const item of eligible) {
    sectorCounts[item.sector] = (sectorCounts[item.sector] || 0) + 1;
  }

  const sortedSectors = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]);

  console.log('========================================================');
  console.log('  커버리지 확장 Triage 리포트 생성 완료');
  console.log('========================================================');
  console.log(`  총 원본 후보 수:     ${rows.length}개`);
  console.log(`  제외: 우선주:        ${prefList.length}개`);
  console.log(`  제외: 리츠/인프라:   ${reitList.length}개`);
  console.log(`  제외: 스팩:          ${spacList.length}개`);
  console.log(`  제외: ETN/ETF:       ${etnEtfList.length}개`);
  console.log(`  총 제외 건수:        ${prefList.length + reitList.length + spacList.length + etnEtfList.length}개`);
  console.log(`  최종 대상(eligible): ${eligible.length}개`);
  console.log('--------------------------------------------------------');
  console.log('  [제안섹터별 후보 건수 요약]');
  for (const [sec, count] of sortedSectors) {
    const label = sec === '미분류' ? '미분류' : `${sec} (${SECTOR_META[sec]?.ko || sec})`;
    console.log(`    - ${label.padEnd(24)}: ${count}개`);
  }
  console.log('--------------------------------------------------------');
  console.log(`  출력 파일: ${path.relative(ROOT, TRIAGE_CSV)}`);
  console.log('========================================================\n');

  return {
    total: rows.length,
    excluded: prefList.length + reitList.length + spacList.length + etnEtfList.length,
    eligible: eligible.length,
    sectorCounts,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  triageMcapAdditions();
}

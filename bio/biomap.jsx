import { useState } from "react";

const bioData = [
  {
    id: "biosimilar",
    sector: "바이오시밀러",
    sectorEn: "Biosimilar",
    icon: "🧬",
    color: "#0066FF",
    bg: "rgba(0,102,255,0.08)",
    description: "오리지널 바이오의약품의 복제약 개발·제조",
    domestic: [
      { name: "셀트리온", ticker: "068270", note: "시밀러11→41종('38), 신약16종: ADC CT-P70 FDA패스트트랙·4종1상, 비만약CT-G32 '27IND", mcap: "대형" },
      { name: "삼성에피스홀딩스", ticker: "0126Z0", note: "'25.11 삼바 인적분할 재상장, 바이오시밀러 9종 글로벌·후속 ADC파이프라인 확대중", mcap: "대형" },
      { name: "셀트리온제약", ticker: "068760", note: "셀트리온 합병법인 국내유통, 짐펜트라(자가면역SC) '26 美매출 급성장 기대", mcap: "중형" },
      { name: "프레스티지바이오파마", ticker: "950210", note: "투즈뉴(허셉틴 시밀러) EU출시·Teva L/O, HD204 아바스틴 3상완료, PBP1510 췌장암신약 1/2a상", mcap: "중형" },
    ],
    global: [
      { name: "Sandoz (Novartis)", ticker: "SDZ", flag: "🇨🇭", note: "글로벌 시밀러 1위, '23 분사" },
      { name: "Amgen", ticker: "AMGN", flag: "🇺🇸", note: "MVasi·Kanjinti 등 시밀러 포트폴리오" },
      { name: "Teva", ticker: "TEVA", flag: "🇮🇱", note: "제네릭+시밀러 글로벌 리더" },
    ],
  },
  {
    id: "cdmo",
    sector: "CDMO / CMO",
    sectorEn: "Contract Development & Manufacturing",
    icon: "🏭",
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.08)",
    description: "바이오의약품 위탁개발·생산(대형 캐파 경쟁)",
    domestic: [
      { name: "삼성바이올로직스", ticker: "207940", note: "62만L 세계최대 캐파, 美공장+제5공장 착공, CDMO 글로벌 Top3·셀트리온DS 생산 병행", mcap: "초대형" },
      { name: "SK바이오사이언스", ticker: "302440", note: "스카이셀플루(세포배양 독감백신) 허가, mRNA 백신 CDMO + 자체 파이프라인", mcap: "대형" },
      { name: "에스티팜", ticker: "237690", note: "올리고 CDMO 글로벌 Top, FDA승인 5품목, 제2올리고동 '26가동·피르미테그라비르(HIV) 2a상", mcap: "중형" },
      { name: "바이넥스", ticker: "053030", note: "항체·ADC CDMO, 셀트리온DS 상업생산 본격화·'25 흑자전환, 생물보안법 수혜", mcap: "중형" },
    ],
    global: [
      { name: "Lonza", ticker: "LONN", flag: "🇨🇭", note: "글로벌 바이오 CDMO 1위" },
      { name: "WuXi Biologics", ticker: "2269.HK", flag: "🇨🇳", note: "중국 최대 바이오 CDMO" },
      { name: "Catalent → Novo Holdings", ticker: "인수완료", flag: "🇺🇸", note: "'24 노보홀딩스 인수" },
      { name: "Samsung Biologics", ticker: "207940", flag: "🇰🇷", note: "글로벌 Top3 CDMO" },
    ],
  },
  {
    id: "antibody_adc",
    sector: "항체신약 / ADC",
    sectorEn: "Antibody & ADC Therapeutics",
    icon: "🎯",
    color: "#DC2626",
    bg: "rgba(220,38,38,0.08)",
    description: "항체치료제, 항체약물접합체(ADC), 이중항체 등",
    domestic: [
      { name: "에이비엘바이오", ticker: "298380", note: "Grabody: 사노피·GSK·릴리 3대빅파마 L/O(누적10조), ABL001 담도암 FDA패스트트랙, ABL111 위암2상", mcap: "대형" },
      { name: "알테오젠", ticker: "196170", note: "ALT-B4 SC전환: 키트루다SC 美·EU출시, GSK젬퍼리 L/O('26.1), 누적L/O 10조+, '26 코스피이전", mcap: "초대형" },
      { name: "리가켐바이오", ticker: "141080", note: "ConjuAll ADC: LCB14 中허가신청·글로벌1b, LCB84 얀센 1상완료→2상, LCB39 차세대 '26임상진입", mcap: "대형" },
      { name: "오름테라퓨틱", ticker: "475830", note: "DAC/TPD² 항암: BMS ORM-6151 1상(혈액암)+버텍스 플랫폼L/O 1.3조, 현금3000억 보유", mcap: "중형" },
      { name: "인투셀", ticker: "287840", note: "OHPAS ADC링커: 삼성에피스 SBE303(Nectin-4) '26H1 임상1상 개시, 2030년 10건 L/O 목표", mcap: "소형" },
      { name: "에임드바이오", ticker: "0009K0", note: "P-ADC: 베링거1.4조+바이오헤븐AMB302+SK플라즈마AMB303 L/O, 누적3조+, '25.12 상장", mcap: "대형" },
      { name: "이뮨온시아", ticker: "424870", note: "IMC-001 PD-L1 NK/T림프종 2상 ORR79%→허가준비, IMC-002 CD47 간암 1b상, 3D메디슨 L/O", mcap: "소형" },
    ],
    global: [
      { name: "Daiichi Sankyo", ticker: "4568.T", flag: "🇯🇵", note: "Enhertu ADC 블록버스터" },
      { name: "AbbVie", ticker: "ABBV", flag: "🇺🇸", note: "휴미라 후속 면역 항체 포트폴리오" },
      { name: "Roche/Genentech", ticker: "ROG", flag: "🇨🇭", note: "허셉틴·아바스틴·옵디보 항체 레전드" },
      { name: "AstraZeneca", ticker: "AZN", flag: "🇬🇧", note: "Enhertu 공동개발, ADC 포트폴리오 확대" },
    ],
  },
  {
    id: "immuno_onc",
    sector: "면역항암제",
    sectorEn: "Immuno-Oncology",
    icon: "🛡️",
    color: "#EA580C",
    bg: "rgba(234,88,12,0.08)",
    description: "면역관문억제제(PD-1/L1), 세포치료 항암제 등",
    domestic: [
      { name: "유한양행", ticker: "000100", note: "렉라자 FDA허가·J&J '26美매출8억$전망, 레시게르셉트(항IgE) 다국가2상('26.2 개시)", mcap: "대형" },
      { name: "HLB", ticker: "028300", note: "리보세라닙 간암+리라푸그라티닙 담관암 FDA NDA제출, '26 美허가→美시장 첫진출 기대", mcap: "대형" },
      { name: "보로노이", ticker: "310210", note: "VRN11 EGFR뇌전이 1a상(韓·대만)+VRN10 HER2 1a상(韓·호주), '26 글로벌1b/2상 2건 동시진입", mcap: "대형" },
      { name: "제넥신", ticker: "095700", note: "하일루킨(IL-7 Fc) 면역항암 2상, GX-I7 키트루다 병용 등 다수 임상", mcap: "중형" },
      { name: "CG인바이츠", ticker: "083790", note: "아이발티노스타트 췌장암 美 2상, 캄렐리주맙 간암 국내허가 추진, 항암백신 개발", mcap: "소형" },
      { name: "지놈앤컴퍼니", ticker: "314130", note: "GEN-001 마이크로바이옴 면역항암 1b/2상, 키트루다 병용 고형암 데이터", mcap: "소형" },
    ],
    global: [
      { name: "Merck & Co", ticker: "MRK", flag: "🇺🇸", note: "키트루다(PD-1) 글로벌 매출 1위 항암제" },
      { name: "Bristol-Myers Squibb", ticker: "BMY", flag: "🇺🇸", note: "옵디보(PD-1)+여보이(CTLA-4)" },
      { name: "Roche", ticker: "ROG", flag: "🇨🇭", note: "티쎈트릭(PD-L1) + 항체 병용" },
    ],
  },
  {
    id: "obesity",
    sector: "비만 / 대사질환",
    sectorEn: "Obesity & Metabolic Disease",
    icon: "⚖️",
    color: "#059669",
    bg: "rgba(5,150,105,0.08)",
    description: "GLP-1 등 비만·당뇨 치료제 — 2025년 최대 테마",
    domestic: [
      { name: "한미약품", ticker: "128940", note: "에피노페그듀타이드 MASH 2상(MSD L/O), HM17321 차세대비만, LAPS기반 ADC·TPD 확장", mcap: "대형" },
      { name: "펩트론", ticker: "087010", note: "PT403 장기지속형 GLP-1 비만, 美 FDA 1상 IND 준비·비만약 코스닥 대장주", mcap: "중형" },
      { name: "디앤디파마텍", ticker: "347850", note: "DD01 MASH 2상 투약완료·조직생검중(JPM'26 발표), DD02S경구GLP-1(화이자/멧세라 L/O) '26H1데이터", mcap: "중형" },
      { name: "삼천당제약", ticker: "000250", note: "GLP-1 비만치료제 파이프라인(SC·경구)", mcap: "중형" },
    ],
    global: [
      { name: "Novo Nordisk", ticker: "NVO", flag: "🇩🇰", note: "위고비·오젬픽 GLP-1 세계 1위" },
      { name: "Eli Lilly", ticker: "LLY", flag: "🇺🇸", note: "젭바운드·먼자로 GIP/GLP-1 듀얼" },
      { name: "Amgen", ticker: "AMGN", flag: "🇺🇸", note: "MariTide — 차세대 비만 후보" },
      { name: "Viking Therapeutics", ticker: "VKTX", flag: "🇺🇸", note: "VK2735 경구+주사 비만 파이프라인" },
    ],
  },
  {
    id: "cell_gene",
    sector: "세포 · 유전자치료제",
    sectorEn: "Cell & Gene Therapy",
    icon: "🔬",
    color: "#2563EB",
    bg: "rgba(37,99,235,0.08)",
    description: "CAR-T, 줄기세포, 유전자편집(CRISPR) 치료제",
    domestic: [
      { name: "코오롱티슈진", ticker: "950160", note: "인보사(TG-C) 골관절염 유전자치료 美3상('26.7 결과예정), FDA BLA '27Q1 목표", mcap: "대형" },
      { name: "차바이오텍", ticker: "085660", note: "줄기세포(면역세포) 치료제, 세포배양", mcap: "중형" },
      { name: "메디포스트", ticker: "078160", note: "카티스템(연골줄기세포) 허가 품목", mcap: "소형" },
      { name: "지놈앤컴퍼니", ticker: "314130", note: "마이크로바이옴+유전자치료", mcap: "소형" },
      { name: "툴젠", ticker: "199800", note: "유전자가위(CRISPR) 원천기술 보유", mcap: "중형" },
      { name: "진원생명과학", ticker: "011000", note: "DNA백신·유전자치료 플라스미드 CDMO", mcap: "소형" },
    ],
    global: [
      { name: "Gilead (Kite)", ticker: "GILD", flag: "🇺🇸", note: "예스카타 CAR-T" },
      { name: "Novartis", ticker: "NVS", flag: "🇨🇭", note: "킴리아 CAR-T + 졸겐스마 유전자치료" },
      { name: "CRISPR Therapeutics", ticker: "CRSP", flag: "🇨🇭", note: "카스거비 — 최초 CRISPR 승인 치료제" },
      { name: "BMS", ticker: "BMY", flag: "🇺🇸", note: "브레안지·아베크마 CAR-T" },
    ],
  },
  {
    id: "platform",
    sector: "플랫폼 기술",
    sectorEn: "Platform Technology",
    icon: "⚙️",
    color: "#9333EA",
    bg: "rgba(147,51,234,0.08)",
    description: "SC전환, 약물전달, mRNA, 올리고 등 기반기술",
    domestic: [
      { name: "알테오젠", ticker: "196170", note: "ALT-B4: MSD·AZ·다이이찌·GSK 등 9건+ L/O, 누적계약 10조+, 상용화3→9개 확대('30)", mcap: "초대형" },
      { name: "에이비엘바이오", ticker: "298380", note: "Grabody-B/T: 사노피·GSK·릴리 빅3 L/O(누적10조), 이중항체ADC ABL206·209 '26 IND", mcap: "대형" },
      { name: "리가켐바이오", ticker: "141080", note: "ConjuAll: 얀센·오노·암젠·SOTIO 등 플랫폼L/O 4.3조+, LCB39 차세대ADC '26 1상", mcap: "대형" },
      { name: "에스티팜", ticker: "237690", note: "올리고뉴클레오타이드 합성 플랫폼", mcap: "중형" },
      { name: "올릭스", ticker: "226950", note: "비대칭siRNA: OLX702A MASH·비만 릴리L/O 9100억('25.2), 호주1상진행·한소3종+로레알 L/O", mcap: "대형" },
      { name: "아이진", ticker: "185490", note: "mRNA-LNP 플랫폼", mcap: "소형" },
    ],
    global: [
      { name: "Halozyme", ticker: "HALO", flag: "🇺🇸", note: "ENHANZE SC전환 플랫폼 — 알테오젠 경쟁사" },
      { name: "Moderna", ticker: "MRNA", flag: "🇺🇸", note: "mRNA 플랫폼 선도" },
      { name: "BioNTech", ticker: "BNTX", flag: "🇩🇪", note: "mRNA + 면역항암 플랫폼" },
      { name: "Alnylam", ticker: "ALNY", flag: "🇺🇸", note: "RNAi 치료제 플랫폼" },
    ],
  },
  {
    id: "smallmol",
    sector: "합성신약 / 제네릭",
    sectorEn: "Small Molecule & Generic",
    icon: "💊",
    color: "#0891B2",
    bg: "rgba(8,145,178,0.08)",
    description: "저분자 합성의약품 개발, 제네릭, 개량신약",
    domestic: [
      { name: "한미약품", ticker: "128940", note: "LAPS 장기지속형 플랫폼: 롤론티스·포시가, '25 기술수출전담본부신설·ADC·TPD 멀티모달리티", mcap: "대형" },
      { name: "SK바이오팜", ticker: "326030", note: "엑스코프리 美직판 '25 1~3Q 4595억(블록버스터 임박), RPT 방사성의약 SKL35501·WT-7695 '26 1상", mcap: "대형" },
      { name: "대웅제약", ticker: "069620", note: "나보타(보톡스), 펙수클루 등", mcap: "대형" },
      { name: "종근당", ticker: "185750", note: "제네릭 강자 + 신약 R&D 투자 확대", mcap: "중형" },
      { name: "GC바이오파마", ticker: "006280", note: "알리글로 美FDA허가·출시, 면역글로불린 美매출 1500억+돌파('25), 글로벌 시장 확대", mcap: "대형" },
      { name: "JW중외제약", ticker: "001060", note: "리바로·리바넥스, 개량신약", mcap: "중형" },
      { name: "한올바이오파마", ticker: "009420", note: "HL161 자가면역 항체 임상 진행, 롤론티스 공동판매, 한미약품 계열", mcap: "중형" },
      { name: "동아에스티", ticker: "170900", note: "슈가논·스티렌, R&D 비율 19%+ 업계 상위권, AI 신약탐색 확대", mcap: "중형" },
    ],
    global: [
      { name: "Pfizer", ticker: "PFE", flag: "🇺🇸", note: "팍스로비드·리핀자 등 저분자 포트폴리오" },
      { name: "Johnson & Johnson", ticker: "JNJ", flag: "🇺🇸", note: "제약+의료기기 통합 빅파마" },
      { name: "Merck & Co", ticker: "MRK", flag: "🇺🇸", note: "키트루다+가다실+라제브리오 등" },
    ],
  },
  {
    id: "diagnostics",
    sector: "체외진단 (IVD)",
    sectorEn: "In-Vitro Diagnostics",
    icon: "🔎",
    color: "#CA8A04",
    bg: "rgba(202,138,4,0.08)",
    description: "분자진단, 면역진단, 현장진단(POCT) 등",
    domestic: [
      { name: "씨젠", ticker: "096530", note: "다중 분자진단 플랫폼, 코로나 수혜 후 전환", mcap: "중형" },
      { name: "에스디바이오센서", ticker: "137310", note: "면역·현장진단 글로벌 공급", mcap: "중형" },
      { name: "수젠텍", ticker: "253840", note: "면역진단키트", mcap: "소형" },
      { name: "바디텍메드", ticker: "206640", note: "POCT 진단장비", mcap: "소형" },
    ],
    global: [
      { name: "Roche Diagnostics", ticker: "ROG", flag: "🇨🇭", note: "IVD 글로벌 1위" },
      { name: "Abbott", ticker: "ABT", flag: "🇺🇸", note: "면역·분자진단 + POC" },
      { name: "Danaher", ticker: "DHR", flag: "🇺🇸", note: "생명과학장비·진단 플랫폼" },
    ],
  },
  {
    id: "medtech",
    sector: "의료기기 / 디지털헬스",
    sectorEn: "MedTech & Digital Health",
    icon: "🏥",
    color: "#16A34A",
    bg: "rgba(22,163,74,0.08)",
    description: "의료AI, 임플란트, 로봇수술, 웨어러블 등",
    domestic: [
      { name: "휴젤", ticker: "145020", note: "보툴렉스·더채움 K-뷰티 대표, 美시장 고농도제형 3상 '26 착수·'43년 독점 전략", mcap: "대형" },
      { name: "파마리서치", ticker: "214450", note: "리쥬란(PDRN) 스킨부스터, 글로벌 미용시장 고성장·美 진출 가속", mcap: "대형" },
      { name: "클래시스", ticker: "214150", note: "슈링크·볼뉴머 미용의료기기", mcap: "대형" },
      { name: "루닛", ticker: "328130", note: "AI 영상진단(흉부CT·유방) FDA 승인", mcap: "중형" },
      { name: "뷰노", ticker: "338220", note: "AI 의료영상·ECG 분석", mcap: "소형" },
      { name: "인바디", ticker: "041830", note: "체성분분석기 글로벌 1위", mcap: "중형" },
      { name: "오스템임플란트", ticker: "비상장", note: "치과임플란트 — MBK 인수 후 상폐", mcap: "비상장" },
      { name: "레이", ticker: "228670", note: "3D 디지털 덴티스트리", mcap: "소형" },
      { name: "미래컴퍼니", ticker: "049950", note: "수술로봇 Revo-i", mcap: "소형" },
    ],
    global: [
      { name: "Intuitive Surgical", ticker: "ISRG", flag: "🇺🇸", note: "다빈치 수술로봇 독점" },
      { name: "Medtronic", ticker: "MDT", flag: "🇮🇪", note: "의료기기 글로벌 1위" },
      { name: "Stryker", ticker: "SYK", flag: "🇺🇸", note: "정형외과·수술 장비" },
      { name: "Veeva Systems", ticker: "VEEV", flag: "🇺🇸", note: "생명과학 클라우드 SaaS" },
    ],
  },
];

const sizeColors = {
  "초대형": "#DC2626",
  "대형": "#2563EB",
  "중형": "#059669",
  "소형": "#9CA3AF",
  "비상장": "#6B7280",
};

export default function BioMap() {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const filtered = bioData.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        s.sector.includes(search) ||
        s.sectorEn.toLowerCase().includes(q) ||
        s.domestic.some((c) => c.name.includes(search) || c.ticker.includes(search)) ||
        s.global.some((c) => c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalDomestic = bioData.reduce((a, s) => a + s.domestic.length, 0);
  const totalGlobal = bioData.reduce((a, s) => a + s.global.length, 0);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#FAFAF9",
      fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, sans-serif",
      color: "#1C1917",
    }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .sector-card { transition: all 0.25s ease; cursor: pointer; }
        .sector-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.08); }
        .company-pill { transition: all 0.15s ease; }
        .company-pill:hover { transform: scale(1.03); }
        .tab-btn { transition: all 0.2s ease; cursor: pointer; border: none; }
        .tab-btn:hover { opacity: 0.85; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.35s ease forwards; }
        input:focus { outline: none; border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
        .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .arrow-icon { display: inline-block; transition: transform 0.25s ease; }
        .arrow-icon.open { transform: rotate(180deg); }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #D6D3D1; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)",
        padding: "40px 24px 32px",
        color: "white",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          background: "radial-gradient(ellipse at 20% 50%, rgba(37,99,235,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(147,51,234,0.12) 0%, transparent 50%)",
        }} />
        <div style={{ position: "relative", maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 28 }}>🧬</span>
            <span style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", opacity: 0.6, fontWeight: 600 }}>
              Bio Industry Stock Map 2025
            </span>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.25, marginBottom: 8, letterSpacing: -0.5 }}>
            국내 바이오 산업 주식 지도
          </h1>
          <p style={{ fontSize: 14, opacity: 0.6, lineHeight: 1.6, maxWidth: 600 }}>
            {bioData.length}개 섹터 · 국내 {totalDomestic}개 기업 · 해외 빅파마 {totalGlobal}개 페어링
          </p>

          {/* Search */}
          <div style={{ marginTop: 20 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="기업명, 티커, 섹터 검색..."
              style={{
                width: "100%", maxWidth: 400, padding: "10px 16px",
                borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)", color: "white",
                fontSize: 14, backdropFilter: "blur(8px)",
              }}
            />
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
            {Object.entries(sizeColors).map(([label, c]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, opacity: 0.7 }}>
                <span className="legend-dot" style={{ background: c }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Filter */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 24px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { key: "all", label: "전체" },
          { key: "치료제", label: "치료제" },
          { key: "인프라", label: "인프라/서비스" },
        ].map((t) => (
          <button
            key={t.key}
            className="tab-btn"
            onClick={() => setTab(t.key)}
            style={{
              padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: tab === t.key ? "#1E293B" : "#E7E5E4",
              color: tab === t.key ? "white" : "#57534E",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sector Cards */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 24px 60px" }}>
        {filtered
          .filter((s) => {
            if (tab === "치료제") return ["biosimilar", "antibody_adc", "immuno_onc", "obesity", "cell_gene", "smallmol", "platform"].includes(s.id);
            if (tab === "인프라") return ["cdmo", "diagnostics", "medtech"].includes(s.id);
            return true;
          })
          .map((sector, idx) => {
            const isOpen = selected === sector.id;
            return (
              <div
                key={sector.id}
                className="sector-card fade-in"
                style={{
                  background: "white",
                  borderRadius: 14,
                  marginBottom: 12,
                  border: `1.5px solid ${isOpen ? sector.color : "#E7E5E4"}`,
                  overflow: "hidden",
                  animationDelay: `${idx * 50}ms`,
                }}
              >
                {/* Sector Header */}
                <div
                  onClick={() => setSelected(isOpen ? null : sector.id)}
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: isOpen ? sector.bg : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 24 }}>{sector.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 16, fontWeight: 750, color: sector.color }}>{sector.sector}</span>
                        <span style={{ fontSize: 11, color: "#A8A29E", fontWeight: 500 }}>{sector.sectorEn}</span>
                      </div>
                      <p style={{ fontSize: 12, color: "#78716C", marginTop: 3, lineHeight: 1.4 }}>
                        {sector.description}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ textAlign: "right" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: sector.color,
                        background: sector.bg, padding: "3px 8px", borderRadius: 6,
                      }}>
                        🇰🇷 {sector.domestic.length} · 🌍 {sector.global.length}
                      </span>
                    </div>
                    <span className={`arrow-icon ${isOpen ? "open" : ""}`} style={{ fontSize: 18, color: "#A8A29E" }}>▾</span>
                  </div>
                </div>

                {/* Expanded Content */}
                {isOpen && (
                  <div style={{ padding: "0 20px 20px" }}>
                    {/* Domestic */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
                        paddingBottom: 6, borderBottom: "1px solid #F5F5F4",
                      }}>
                        <span style={{ fontSize: 14 }}>🇰🇷</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#44403C" }}>국내 상장기업</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {sector.domestic.map((c) => (
                          <div
                            key={c.ticker}
                            className="company-pill"
                            style={{
                              display: "flex", alignItems: "flex-start", gap: 10,
                              padding: "10px 14px", borderRadius: 10,
                              background: "#FAFAF9", border: "1px solid #F5F5F4",
                            }}
                          >
                            <div style={{
                              width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                              background: sizeColors[c.mcap] || "#9CA3AF",
                            }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: "#1C1917" }}>{c.name}</span>
                                <span style={{
                                  fontSize: 11, fontFamily: "monospace", color: "#78716C",
                                  background: "#F5F5F4", padding: "1px 6px", borderRadius: 4,
                                }}>{c.ticker}</span>
                                <span style={{
                                  fontSize: 10, fontWeight: 600, color: sizeColors[c.mcap],
                                }}>{c.mcap}</span>
                              </div>
                              <p style={{ fontSize: 12, color: "#78716C", marginTop: 3, lineHeight: 1.5 }}>{c.note}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pairing Arrow */}
                    <div style={{
                      textAlign: "center", padding: "6px 0", fontSize: 12, color: "#A8A29E",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                      <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg, transparent, #D6D3D1)" }} />
                      <span style={{ fontWeight: 600 }}>⇅ 해외 빅파마 페어링</span>
                      <div style={{ height: 1, flex: 1, background: "linear-gradient(90deg, #D6D3D1, transparent)" }} />
                    </div>

                    {/* Global */}
                    <div style={{ marginTop: 10 }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
                        paddingBottom: 6, borderBottom: "1px solid #F5F5F4",
                      }}>
                        <span style={{ fontSize: 14 }}>🌍</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#44403C" }}>글로벌 빅파마 / 바이오텍</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {sector.global.map((c) => (
                          <div
                            key={c.ticker}
                            className="company-pill"
                            style={{
                              display: "flex", alignItems: "flex-start", gap: 10,
                              padding: "10px 14px", borderRadius: 10,
                              background: "linear-gradient(135deg, #FAFAF9, #F5F5F4)",
                              border: "1px solid #E7E5E4",
                            }}
                          >
                            <span style={{ fontSize: 18, flexShrink: 0 }}>{c.flag}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: "#1C1917" }}>{c.name}</span>
                                <span style={{
                                  fontSize: 11, fontFamily: "monospace", color: sector.color,
                                  background: sector.bg, padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                                }}>{c.ticker}</span>
                              </div>
                              <p style={{ fontSize: 12, color: "#78716C", marginTop: 3, lineHeight: 1.5 }}>{c.note}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "#A8A29E" }}>
            <span style={{ fontSize: 40 }}>🔍</span>
            <p style={{ marginTop: 12, fontSize: 14 }}>검색 결과가 없습니다</p>
          </div>
        )}

        {/* Footer Disclaimer */}
        <div style={{
          marginTop: 24, padding: 16, borderRadius: 10,
          background: "#F5F5F4", fontSize: 11, color: "#A8A29E", lineHeight: 1.7,
        }}>
          ⚠️ 본 자료는 정보 제공 목적이며, 투자 권유가 아닙니다. 기업 분류는 주요 사업 기준이며 일부 기업은 복수 섹터에 중복 포함될 수 있습니다.
          상장 여부·시가총액 구분은 2025년 기준 참고치이며, 최신 정보는 거래소 공시를 확인하세요.
        </div>
      </div>
    </div>
  );
}

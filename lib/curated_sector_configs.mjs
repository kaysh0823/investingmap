const PEERS = {
  bigchip: [
    { id: 'tsmc', name: 'TSMC', country: '대만/Taiwan', region: 'tw', sector: 'Foundry peer' },
    { id: 'micron', name: 'Micron', country: '미국/USA', region: 'us', sector: 'Memory peer' },
    { id: 'intel', name: 'Intel', country: '미국/USA', region: 'us', sector: 'IDM peer' },
  ],
  software: [
    { id: 'microsoft', name: 'Microsoft', country: '미국/USA', region: 'us', sector: 'Cloud & enterprise software peer' },
    { id: 'google', name: 'Google', country: '미국/USA', region: 'us', sector: 'Platform & AI peer' },
    { id: 'sap', name: 'SAP', country: '독일/Germany', region: 'eu', sector: 'Enterprise software peer' },
    { id: 'accenture', name: 'Accenture', country: '아일랜드/Ireland', region: 'eu', sector: 'IT services peer' },
    { id: 'paloalto', name: 'Palo Alto Networks', country: '미국/USA', region: 'us', sector: 'Cybersecurity peer' },
  ],
  holdings: [
    { id: 'berkshire', name: 'Berkshire Hathaway', country: '미국/USA', region: 'us', sector: 'Diversified holding peer' },
    { id: 'softbank', name: 'SoftBank Group', country: '일본/Japan', region: 'jp', sector: 'Investment holding peer' },
    { id: 'ckh', name: 'CK Hutchison Holdings', country: '홍콩/Hong Kong', region: 'cn', sector: 'Operating holding peer' },
  ],
  telecom: [
    { id: 'verizon', name: 'Verizon', country: '미국/USA', region: 'us', sector: 'Telecom service peer' },
    { id: 'deutsche', name: 'Deutsche Telekom', country: '독일/Germany', region: 'eu', sector: 'Telecom service peer' },
    { id: 'ericsson', name: 'Ericsson', country: '스웨덴/Sweden', region: 'eu', sector: 'Wireless equipment peer' },
    { id: 'ciena', name: 'Ciena', country: '미국/USA', region: 'us', sector: 'Optical networking peer' },
    { id: 'viasat', name: 'Viasat', country: '미국/USA', region: 'us', sector: 'Satellite communications peer' },
  ],
};

const C = (id, ko, en, color, filterKo = ko, filterEn = en) => ({ id, ko, en, color, filterKo, filterEn });
const P = (id, name, nameEn, ticker, chain, semType, semTypeEn, products, productsEn, partners) => ({
  id, name, nameEn, ticker, chain, semType, semTypeEn, products, productsEn, partners,
});

export const BIGCHIP_CONFIG = {
  id: 'bigchip',
  titleKo: '한국 반도체 대형주 투자 지도',
  titleEn: 'Korea Chip Leaders',
  subtitleKo: '삼성전자와 SK하이닉스의 메모리·시스템반도체 사업 및 글로벌 peer 비교',
  subtitleEn: 'Samsung Electronics and SK hynix across memory, system chips and global peer references',
  chains: [
    C('종합반도체', '종합반도체·IDM', 'Diversified IDM', '#42A5F5', 'IDM', 'IDM'),
    C('HBM·메모리', 'HBM·메모리', 'HBM & memory', '#AB47BC', 'HBM·메모리', 'HBM & memory'),
  ],
  globals: PEERS.bigchip,
  companies: [
    P('samsung_electronics', '삼성전자', 'Samsung Electronics', '005930', '종합반도체', '메모리·시스템LSI·파운드리', 'Memory, system LSI & foundry', 'DRAM·NAND·모바일AP·파운드리', 'DRAM, NAND, mobile APs, foundry', ['micron', 'intel', 'tsmc']),
    P('sk_hynix', 'SK하이닉스', 'SK hynix', '000660', 'HBM·메모리', '메모리·AI 반도체', 'Memory & AI semiconductors', 'HBM·DRAM·NAND', 'HBM, DRAM, NAND', ['micron']),
  ],
};

export const SOFTWARE_CONFIG = {
  id: 'software',
  titleKo: '한국 IT·소프트웨어 투자 지도',
  titleEn: 'Korea IT & Software Map',
  subtitleKo: '플랫폼·AI, SI·클라우드, 기업SW·SaaS, 보안 관련 국내 상장사와 글로벌 peer',
  subtitleEn: 'Listed Korean platforms, AI, IT services, cloud, enterprise software, SaaS and cybersecurity peers',
  chains: [
    C('플랫폼·AI', '플랫폼·AI', 'Platforms & AI', '#42A5F5'),
    C('SI·클라우드', 'SI·클라우드', 'IT services & cloud', '#26A69A'),
    C('기업SW·SaaS', '기업SW·SaaS', 'Enterprise SW & SaaS', '#FFA726'),
    C('보안', '보안', 'Cybersecurity', '#EF5350'),
  ],
  globals: PEERS.software,
  companies: [
    P('naver', 'NAVER', 'NAVER', '035420', '플랫폼·AI', '검색·커머스·AI 플랫폼', 'Search, commerce & AI platform', '검색·광고·커머스·클라우드·생성형AI', 'Search, ads, commerce, cloud, generative AI', ['google', 'microsoft']),
    P('kakao', '카카오', 'Kakao', '035720', '플랫폼·AI', '메신저·콘텐츠·플랫폼', 'Messaging, content & platform', '카카오톡·광고·커머스·모빌리티 플랫폼', 'KakaoTalk, ads, commerce, mobility platforms', ['google']),
    P('samsung_sds', '삼성SDS', 'Samsung SDS', '018260', 'SI·클라우드', 'IT서비스·클라우드', 'IT services & cloud', '클라우드·ERP·물류IT·생성형AI', 'Cloud, ERP, logistics IT, generative AI', ['accenture', 'microsoft']),
    P('lg_cns', 'LG씨엔에스', 'LG CNS', '064400', 'SI·클라우드', 'DX·클라우드·SI', 'DX, cloud & systems integration', '클라우드·스마트팩토리·금융IT', 'Cloud, smart factory, financial IT', ['accenture', 'microsoft']),
    P('posco_dx', '포스코DX', 'POSCO DX', '022100', 'SI·클라우드', '산업DX·스마트팩토리', 'Industrial DX & smart factory', '공장자동화·물류자동화·산업AI', 'Factory and logistics automation, industrial AI', ['accenture', 'sap']),
    P('douzone', '더존비즈온', 'Douzone Bizon', '012510', '기업SW·SaaS', 'ERP·기업용 SaaS', 'ERP & enterprise SaaS', 'ERP·그룹웨어·클라우드 업무 플랫폼', 'ERP, groupware, cloud business platform', ['sap', 'microsoft']),
    P('nhn', 'NHN', 'NHN', '181710', '플랫폼·AI', '클라우드·결제·게임 플랫폼', 'Cloud, payments & game platform', 'NHN Cloud·결제·게임·커머스', 'NHN Cloud, payments, games, commerce', ['google', 'microsoft']),
    P('ahnlab', '안랩', 'AhnLab', '053800', '보안', '엔드포인트·네트워크 보안', 'Endpoint & network security', '백신·EDR·침해대응·보안관제', 'Antivirus, EDR, incident response, managed security', ['paloalto']),
    P('hancom', '한글과컴퓨터', 'Hancom', '030520', '기업SW·SaaS', '오피스·문서 소프트웨어', 'Office & document software', '한컴오피스·클라우드 문서·AI 문서도구', 'Hancom Office, cloud documents, AI document tools', ['microsoft']),
    P('cafe24', '카페24', 'Cafe24', '042000', '기업SW·SaaS', '전자상거래 SaaS', 'E-commerce SaaS', '온라인 쇼핑몰 구축·결제·마케팅 도구', 'Online-store software, payments and marketing tools', ['shopify']),
    P('gabia', '가비아', 'Gabia', '079940', 'SI·클라우드', '클라우드·호스팅·도메인', 'Cloud, hosting & domains', '클라우드 인프라·호스팅·그룹웨어', 'Cloud infrastructure, hosting, groupware', ['microsoft']),
    P('dream_security', '드림시큐리티', 'Dream Security', '203650', '보안', '인증·암호·보안솔루션', 'Authentication, cryptography & security', '전자서명·인증·암호모듈·보안솔루션', 'Digital signatures, authentication, cryptographic modules', ['paloalto']),
    P('lotte_innovate', '롯데이노베이트', 'Lotte Innovate', '286940', 'SI·클라우드', '유통·서비스 IT·클라우드', 'Retail/service IT & cloud', '시스템통합·데이터센터·클라우드·모빌리티IT', 'Systems integration, data centers, cloud, mobility IT', ['accenture', 'microsoft']),
  ],
};

// Cafe24's global comparison is a peer reference, not a contractual relationship.
SOFTWARE_CONFIG.globals.push({ id: 'shopify', name: 'Shopify', country: '캐나다/Canada', region: 'us', sector: 'Commerce software peer' });

export const HOLDINGS_CONFIG = {
  id: 'holdings',
  titleKo: '한국 지주회사 투자 지도',
  titleEn: 'Korea Holdings Map',
  subtitleKo: '순수지주·투자, 사업지주, 소비·서비스 지주, 산업재 지주 관련 국내 상장사',
  subtitleEn: 'Listed Korean investment, operating, consumer/service and industrial holding companies',
  chains: [
    C('순수지주·투자', '순수지주·투자', 'Investment holdings', '#42A5F5'),
    C('사업지주', '사업지주', 'Operating holdings', '#26A69A'),
    C('소비·서비스 지주', '소비·서비스 지주', 'Consumer & service holdings', '#FFA726'),
    C('산업재 지주', '산업재 지주', 'Industrial holdings', '#AB47BC'),
  ],
  globals: PEERS.holdings,
  companies: [
    P('sk_square', 'SK스퀘어', 'SK Square', '402340', '순수지주·투자', 'ICT 투자전문회사', 'ICT investment holding', '반도체·플랫폼 포트폴리오 투자', 'Semiconductor and platform portfolio investments', ['softbank']),
    P('sk', 'SK', 'SK Inc.', '034730', '사업지주', '그룹 지주·사업지주', 'Group and operating holding', '첨단소재·바이오·에너지·디지털 투자', 'Advanced materials, bio, energy and digital investments', ['berkshire']),
    P('doosan', '두산', 'Doosan', '000150', '산업재 지주', '산업재 사업지주', 'Industrial operating holding', '전자소재·유통·로봇 등 계열 포트폴리오', 'Electronics materials, retail and robotics portfolio', ['ckh']),
    P('posco_holdings', '포스코홀딩스', 'POSCO Holdings', '005490', '사업지주', '철강·소재 사업지주', 'Steel and materials holding', '철강·2차전지소재·인프라 포트폴리오', 'Steel, battery materials and infrastructure portfolio', ['ckh']),
    P('hd_hyundai', 'HD현대', 'HD Hyundai', '267250', '산업재 지주', '조선·에너지 산업지주', 'Shipbuilding and energy holding', '조선·해양·에너지·건설기계 계열', 'Shipbuilding, marine, energy and machinery affiliates', ['ckh']),
    P('lg', 'LG', 'LG Corp.', '003550', '순수지주·투자', '그룹 지주회사', 'Group holding company', '전자·화학·통신·생활소비재 계열', 'Electronics, chemicals, telecom and consumer affiliates', ['berkshire']),
    P('ls', 'LS', 'LS Corp.', '006260', '산업재 지주', '전기·소재 산업지주', 'Electrical and materials holding', '전선·전력기기·금속·에너지 계열', 'Cable, power equipment, metals and energy affiliates', ['ckh']),
    P('hanwha', '한화', 'Hanwha Corp.', '000880', '사업지주', '방산·에너지 사업지주', 'Defense and energy operating holding', '화약·방산·에너지·금융 계열', 'Explosives, defense, energy and finance affiliates', ['ckh']),
    P('hanjin_kal', '한진칼', 'Hanjin KAL', '180640', '소비·서비스 지주', '항공·물류 지주', 'Airline and logistics holding', '항공·여행·호텔·물류 계열', 'Airline, travel, hotel and logistics affiliates', ['ckh']),
    P('gs', 'GS', 'GS Holdings', '078930', '사업지주', '에너지·유통 지주', 'Energy and retail holding', '정유·전력·유통·건설 계열', 'Refining, power, retail and construction affiliates', ['ckh']),
    P('cj', 'CJ', 'CJ Corp.', '001040', '소비·서비스 지주', '식품·콘텐츠·물류 지주', 'Food, content and logistics holding', '식품·유통·물류·미디어 계열', 'Food, retail, logistics and media affiliates', ['ckh']),
    P('hyosung', '효성', 'Hyosung Corp.', '004800', '산업재 지주', '산업소재 지주', 'Industrial materials holding', '첨단소재·화학·중공업·IT 계열', 'Advanced materials, chemicals, heavy industry and IT affiliates', ['ckh']),
    P('lotte', '롯데지주', 'Lotte Corp.', '004990', '소비·서비스 지주', '유통·식품·화학 지주', 'Retail, food and chemicals holding', '유통·식품·호텔·화학 계열', 'Retail, food, hotel and chemicals affiliates', ['ckh']),
    P('youngone_holdings', '영원무역홀딩스', 'Youngone Holdings', '009970', '소비·서비스 지주', '의류·아웃도어 지주', 'Apparel and outdoor holding', '의류 OEM·아웃도어 브랜드 계열', 'Apparel OEM and outdoor-brand affiliates', ['ckh']),
    P('orion_holdings', '오리온홀딩스', 'Orion Holdings', '001800', '소비·서비스 지주', '식품 지주회사', 'Food holding company', '제과·식품·바이오 투자', 'Confectionery, food and bio investments', ['ckh']),
    P('hdc', 'HDC', 'HDC Holdings', '012630', '사업지주', '건설·개발 지주', 'Construction and development holding', '건설·개발·유통·호텔 계열', 'Construction, development, retail and hotel affiliates', ['ckh']),
    P('harim_holdings', '하림지주', 'Harim Holdings', '003380', '소비·서비스 지주', '식품·물류 지주', 'Food and logistics holding', '축산·식품·사료·물류 계열', 'Livestock, food, feed and logistics affiliates', ['ckh']),
    P('dl', 'DL', 'DL Holdings', '000210', '사업지주', '건설·화학 지주', 'Construction and chemicals holding', '건설·석유화학·에너지 계열', 'Construction, petrochemicals and energy affiliates', ['ckh']),
    P('kolon', '코오롱', 'Kolon Corp.', '002020', '산업재 지주', '소재·건설 지주', 'Materials and construction holding', '산업소재·화학·건설·유통 계열', 'Industrial materials, chemicals, construction and retail affiliates', ['ckh']),
    P('fnf_holdings', 'F&F홀딩스', 'F&F Holdings', '007700', '소비·서비스 지주', '패션 지주회사', 'Fashion holding company', '패션 브랜드·라이선스 사업 계열', 'Fashion-brand and licensing affiliates', ['ckh']),
    P('lx_holdings', 'LX홀딩스', 'LX Holdings', '383800', '순수지주·투자', '그룹 지주회사', 'Group holding company', '상사·물류·소재·IT 계열', 'Trading, logistics, materials and IT affiliates', ['berkshire']),
    P('seah_steel_holdings', '세아제강지주', 'SeAH Steel Holdings', '003030', '산업재 지주', '강관 사업지주', 'Steel-pipe operating holding', '강관·에너지용 강재 계열', 'Steel pipe and energy steel affiliates', ['ckh']),
    P('seah_holdings', '세아홀딩스', 'SeAH Holdings', '058650', '산업재 지주', '특수강 지주회사', 'Specialty-steel holding', '특수강·단조·금속소재 계열', 'Specialty steel, forging and metal-material affiliates', ['ckh']),
    P('samyang_holdings', '삼양홀딩스', 'Samyang Holdings', '000070', '사업지주', '화학·식품 사업지주', 'Chemicals and food holding', '화학·식품·바이오 계열', 'Chemicals, food and bio affiliates', ['ckh']),
    P('nongshim_holdings', '농심홀딩스', 'Nongshim Holdings', '072710', '소비·서비스 지주', '식품 지주회사', 'Food holding company', '면류·스낵·식품소재 계열', 'Noodles, snacks and food-material affiliates', ['ckh']),
    P('hl_holdings', 'HL홀딩스', 'HL Holdings', '060980', '산업재 지주', '자동차부품·물류 지주', 'Auto-parts and logistics holding', '자동차부품·유통·물류 계열', 'Auto parts, distribution and logistics affiliates', ['ckh']),
    P('db_inc', 'DB', 'DB Inc.', '012030', '사업지주', 'IT·상사 중심 사업지주', 'IT and trading operating holding', 'IT서비스·무역·그룹 투자', 'IT services, trading and group investments', ['ckh']),
    P('daesang_holdings', '대상홀딩스', 'Daesang Holdings', '084690', '소비·서비스 지주', '식품 지주회사', 'Food holding company', '식품·전분당·바이오 계열', 'Food, starch sweeteners and bio affiliates', ['ckh']),
  ],
};

export const TELECOM_CONFIG = {
  id: 'telecom',
  titleKo: '한국 통신 투자 지도',
  titleEn: 'Korea Telecom Map',
  subtitleKo: '통신서비스, 무선장비, 광통신, 위성통신 관련 국내 상장사와 글로벌 peer',
  subtitleEn: 'Listed Korean telecom services, wireless, optical and satellite communications companies',
  chains: [
    C('통신서비스', '통신서비스', 'Telecom services', '#42A5F5'),
    C('무선장비', '무선장비', 'Wireless equipment', '#26A69A'),
    C('광통신', '광통신', 'Optical communications', '#AB47BC'),
    C('위성통신', '위성통신', 'Satellite communications', '#FFA726'),
  ],
  globals: PEERS.telecom,
  companies: [
    P('sk_telecom', 'SK텔레콤', 'SK Telecom', '017670', '통신서비스', '이동통신·AI 서비스', 'Mobile telecom & AI services', '5G 이동통신·데이터센터·AI 서비스', '5G mobile, data centers and AI services', ['verizon', 'deutsche']),
    P('kt', 'KT', 'KT', '030200', '통신서비스', '유무선통신·클라우드', 'Fixed/mobile telecom & cloud', '5G·초고속인터넷·IDC·클라우드', '5G, broadband, data centers and cloud', ['verizon', 'deutsche']),
    P('lg_uplus', 'LG유플러스', 'LG Uplus', '032640', '통신서비스', '이동통신·미디어', 'Mobile telecom & media', '5G·초고속인터넷·IPTV·기업통신', '5G, broadband, IPTV and enterprise telecom', ['verizon', 'deutsche']),
    P('taihan_fiber', '대한광통신', 'Taihan Fiberoptics', '010170', '광통신', '광섬유·광케이블', 'Optical fiber & cable', '광섬유·광케이블·광통신 소재', 'Optical fiber, cable and materials', ['ciena']),
    P('rfhic', 'RFHIC', 'RFHIC', '218410', '무선장비', 'GaN RF 전력증폭기', 'GaN RF power amplifiers', '통신·방산용 GaN 트랜지스터·증폭기', 'GaN transistors and amplifiers for telecom and defense', ['ericsson']),
    P('kmw', '케이엠더블유', 'KMW', '032500', '무선장비', '기지국 RF 장비', 'Base-station RF equipment', '안테나·필터·RRH 등 5G 장비', 'Antennas, filters, RRH and 5G equipment', ['ericsson']),
    P('intellian', '인텔리안테크', 'Intellian Technologies', '189300', '위성통신', '위성통신 안테나', 'Satellite communications antennas', '해상·육상용 위성안테나·게이트웨이', 'Maritime and land satellite antennas and gateways', ['viasat']),
    P('solid', '쏠리드', 'Solid', '050890', '무선장비', '인빌딩·중계기', 'In-building coverage & repeaters', 'DAS·중계기·Open RAN 관련 장비', 'DAS, repeaters and Open RAN equipment', ['ericsson']),
    P('samji', '삼지전자', 'Samji Electronics', '037460', '무선장비', '통신장비·중계기', 'Telecom equipment & repeaters', '이동통신 중계기·네트워크 장비', 'Mobile repeaters and network equipment', ['ericsson']),
    P('oe_solutions', '오이솔루션', 'OE Solutions', '138080', '광통신', '광트랜시버', 'Optical transceivers', '무선백홀·데이터센터용 광모듈', 'Optical modules for wireless backhaul and data centers', ['ciena']),
    P('lighttron', '라이트론', 'Lighttron', '069540', '광통신', '광모듈·광부품', 'Optical modules & components', '광트랜시버·광통신 부품', 'Optical transceivers and components', ['ciena']),
    P('hfr', '에치에프알', 'HFR', '230240', '무선장비', '유무선 액세스 장비', 'Fixed and wireless access equipment', '5G 프론트홀·특화망·광전송 장비', '5G fronthaul, private networks and optical transport', ['ericsson', 'ciena']),
  ],
};

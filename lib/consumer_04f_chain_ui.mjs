/**
 * §0-4 batch F leaf chains: kconsume / kcontent / travel.
 */
export const KCONSUME_CHAINS = [
  '가공식품',
  '음료·주류',
  '식품소재·급식',
  '농축수산·가공',
  '담배·건강소비재',
  '패션 브랜드',
  '의류 제조',
  '유통',
  '가구·생활소비재',
  '종합상사',
];

export const KCONSUME_COLORS = {
  가공식품: '#FF8A65',
  '음료·주류': '#EF5350',
  '식품소재·급식': '#FFA726',
  '농축수산·가공': '#26A69A',
  '담배·건강소비재': '#66BB6A',
  '패션 브랜드': '#AB47BC',
  '의류 제조': '#CE93D8',
  유통: '#42A5F5',
  '가구·생활소비재': '#8D6E63',
  종합상사: '#5C6BC0',
};

export const KCONTENT_CHAINS = [
  '게임',
  '음악·엔터테인먼트',
  '팬덤 플랫폼',
  '영상 제작·IP',
  '웹툰·출판',
  '방송·스트리밍',
  '극장·배급',
  '광고·마케팅',
  '교육서비스',
];

export const KCONTENT_COLORS = {
  게임: '#66BB6A',
  '음악·엔터테인먼트': '#FFD54F',
  '팬덤 플랫폼': '#FF7043',
  '영상 제작·IP': '#BA68C8',
  '웹툰·출판': '#7E57C2',
  '방송·스트리밍': '#29B6F6',
  '극장·배급': '#26A69A',
  '광고·마케팅': '#90A4AE',
  교육서비스: '#42A5F5',
};

export const TRAVEL_CHAINS = [
  '항공운송',
  '여행·예약',
  '호텔·리조트',
  '카지노',
  '레저·스포츠',
  '면세',
];

export const TRAVEL_COLORS = {
  항공운송: '#42A5F5',
  '여행·예약': '#FFA726',
  '호텔·리조트': '#26A69A',
  카지노: '#AB47BC',
  '레저·스포츠': '#66BB6A',
  면세: '#EF5350',
};

function labels(chains) {
  return Object.fromEntries(chains.map((c) => [c, c]));
}

export const CONSUMER_04F = {
  kconsume: {
    key: 'kconsume',
    html: 'kconsume/korea_kconsume_map.html',
    chains: KCONSUME_CHAINS,
    colors: KCONSUME_COLORS,
    retired: ['음식·라면·식품', '패션', '쇼핑/유통', '가구·리빙', '물류·상사', '여행·레저·항공'],
    labelKo: labels(KCONSUME_CHAINS),
    labelEn: {
      가공식품: 'Processed foods',
      '음료·주류': 'Beverages & alcohol',
      '식품소재·급식': 'Food ingredients & catering',
      '농축수산·가공': 'Agri/fishery & processing',
      '담배·건강소비재': 'Tobacco & health consumer',
      '패션 브랜드': 'Fashion brands',
      '의류 제조': 'Apparel manufacturing',
      유통: 'Retail & distribution',
      '가구·생활소비재': 'Furniture & household',
      종합상사: 'General trading companies',
    },
    filterKo: labels(KCONSUME_CHAINS),
    filterEn: {
      가공식품: 'Foods',
      '음료·주류': 'Beverages',
      '식품소재·급식': 'Ingredients',
      '농축수산·가공': 'Agri/fishery',
      '담배·건강소비재': 'Tobacco/health',
      '패션 브랜드': 'Fashion',
      '의류 제조': 'Apparel mfg',
      유통: 'Retail',
      '가구·생활소비재': 'Home',
      종합상사: 'Trading',
    },
  },
  kcontent: {
    key: 'kcontent',
    html: 'kcontent/korea_kcontent_map.html',
    chains: KCONTENT_CHAINS,
    colors: KCONTENT_COLORS,
    retired: ['드라마·미디어·웹툰·컨텐츠', 'K-pop·엔터테인먼트', '광고', '교육'],
    labelKo: labels(KCONTENT_CHAINS),
    labelEn: {
      게임: 'Games',
      '음악·엔터테인먼트': 'Music & entertainment',
      '팬덤 플랫폼': 'Fandom platforms',
      '영상 제작·IP': 'Video production & IP',
      '웹툰·출판': 'Webtoon & publishing',
      '방송·스트리밍': 'Broadcast & streaming',
      '극장·배급': 'Cinema & distribution',
      '광고·마케팅': 'Advertising & marketing',
      교육서비스: 'Education services',
    },
    filterKo: labels(KCONTENT_CHAINS),
    filterEn: {
      게임: 'Games',
      '음악·엔터테인먼트': 'Music/ent.',
      '팬덤 플랫폼': 'Fandom',
      '영상 제작·IP': 'Video/IP',
      '웹툰·출판': 'Webtoon',
      '방송·스트리밍': 'Streaming',
      '극장·배급': 'Cinema',
      '광고·마케팅': 'Ads',
      교육서비스: 'Edu',
    },
  },
  travel: {
    key: 'travel',
    html: 'travel/korea_travel_map.html',
    chains: TRAVEL_CHAINS,
    colors: TRAVEL_COLORS,
    retired: ['항공', '여행·면세', '호텔·리조트'],
    labelKo: labels(TRAVEL_CHAINS),
    labelEn: {
      항공운송: 'Air transport',
      '여행·예약': 'Travel & booking',
      '호텔·리조트': 'Hotels & resorts',
      카지노: 'Casinos',
      '레저·스포츠': 'Leisure & sports',
      면세: 'Duty-free',
    },
    filterKo: labels(TRAVEL_CHAINS),
    filterEn: {
      항공운송: 'Airlines',
      '여행·예약': 'Travel',
      '호텔·리조트': 'Hotels',
      카지노: 'Casino',
      '레저·스포츠': 'Leisure',
      면세: 'Duty-free',
    },
  },
};

/** Keep 호텔·리조트 as valid leaf — remove from retired. */
CONSUMER_04F.travel.retired = ['항공', '여행·면세'];

export function angleLiteral(chains) {
  const n = chains.length || 1;
  const parts = chains.map((c, i) => {
    const key = /[^a-zA-Z0-9_$]/.test(c) ? `'${c}'` : c;
    return `${key}: ${Math.round((360 / n) * i)}`;
  });
  return `{ ${parts.join(', ')} }`;
}

export function toJsChainList(arr) {
  return `[${arr.map((c) => `'${c}'`).join(', ')}]`;
}

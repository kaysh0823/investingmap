/** Assign a listed company to the active sector within the finance map. */
export function financeSectorFor({ ticker, chain }) {
  if (ticker === '138040') return 'insurance';
  if (ticker === '071050') return 'securities';
  switch (chain) {
    case '생명보험':
    case '손해보험·재보험':
    case '보험판매·중개':
      return 'insurance';
    case '증권':
    case '자산운용·PE·VC':
    case '부동산금융·투자기구':
      return 'securities';
    default:
      return 'banking';
  }
}

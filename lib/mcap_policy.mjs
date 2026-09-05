/** Minimum listed market cap (2천억원) for hub maps and company tables. */
export const MIN_MCAP_WON = 200_000_000_000;

export function passesMcapFloor(company) {
  if (!company) return false;
  const mcap = company.mcapWon;
  if (mcap == null || !Number.isFinite(Number(mcap)) || Number(mcap) <= 0) return false;
  return Number(mcap) >= MIN_MCAP_WON;
}

export function filterCompaniesByMcap(companies) {
  if (!Array.isArray(companies)) return [];
  return companies.filter(passesMcapFloor);
}

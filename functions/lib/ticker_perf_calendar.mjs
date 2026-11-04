import {
  currentKstYear, PERF_CALENDAR_YEAR_SPAN, fetchTradingDatesInRange,
  buildPerfCalendarSampleDates, fetchMemberCloseSeriesForDates,
  fetchAdjustmentsByTicker, rebaseMemberPoints,
} from './sector_perf_calendar.mjs';

export function tickerPerfYears(now = new Date()) {
  const year = currentKstYear(now);
  return Array.from({ length: PERF_CALENDAR_YEAR_SPAN }, (_, i) => year - i);
}

export function buildTickerYearLines(ticker, closes, adjustments, years) {
  return years.map(year => {
    const start = `${year}-01-01`, end = `${year}-12-31`;
    const relevant = closes.filter(row => row.t <= end);
    const prior = relevant.filter(row => row.t < start).at(-1);
    const first = relevant.find(row => row.t >= start);
    const base = prior || first;
    return { year, baseDate: base?.t || null, baseMode: prior ? 'prior_year_end' : 'first_available',
      points: rebaseMemberPoints(relevant, adjustments, start, end) };
  });
}

export async function loadTickerPerfCalendar(config, ticker, now = new Date()) {
  const years = tickerPerfYears(now);
  const dates = await fetchTradingDatesInRange(config, `${years.at(-1) - 1}-12-01`, `${years[0]}-12-31`);
  const sampled = [...new Set(years.flatMap(year => buildPerfCalendarSampleDates(dates, `${year}-01-01`, `${year}-12-31`)))].sort();
  const [byTicker, adjustments] = await Promise.all([
    fetchMemberCloseSeriesForDates(config, [ticker], sampled), fetchAdjustmentsByTicker(config, [ticker]),
  ]);
  const lines = buildTickerYearLines(ticker, byTicker.get(ticker) || [], adjustments.get(ticker) || [], years);
  return { ticker, years: lines, asOf: lines.flatMap(line => line.points.map(p => p.t)).sort().at(-1) || null };
}

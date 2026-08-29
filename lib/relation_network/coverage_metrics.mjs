/**
 * Shared coverage metric helper — denominator 0 yields N/A, not 100%.
 */

/**
 * @param {number} numerator
 * @param {number} denominator
 * @param {{ reason?: string }} [opts]
 */
export function computeCoverageMetric(numerator, denominator, opts = {}) {
  const reason = opts.reason || 'no_eligible_edges';
  if (!denominator) {
    return {
      numerator: 0,
      denominator: 0,
      percentage: null,
      displayValue: 'N/A',
      applicable: false,
      reason,
    };
  }
  const pct = numerator / denominator;
  return {
    numerator,
    denominator,
    percentage: pct,
    displayValue: `${Math.round(pct * 1000) / 10}%`,
    applicable: true,
    reason: null,
  };
}

/** @deprecated use computeCoverageMetric */
export function coverage(num, den) {
  return computeCoverageMetric(num, den);
}

/**
 * Fail if a coverage object incorrectly reports 100% on 0/0.
 * @param {object} metric
 * @param {string} label
 * @returns {string|null}
 */
export function validateCoverageMetric(metric, label) {
  if (!metric || typeof metric !== 'object') return `${label}: missing metric object`;
  if (metric.denominator === 0) {
    if (metric.percentage === 1 || metric.percentage === 100) {
      return `${label}: 0/0 must not be 100% (got percentage=${metric.percentage})`;
    }
    if (metric.applicable !== false) {
      return `${label}: 0 denominator requires applicable=false`;
    }
    if (metric.displayValue !== 'N/A') {
      return `${label}: 0 denominator requires displayValue=N/A (got ${metric.displayValue})`;
    }
    if (metric.percentage != null) {
      return `${label}: 0 denominator requires percentage=null (got ${metric.percentage})`;
    }
  }
  return null;
}

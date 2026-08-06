/**
 * metrics.js — Financial resilience metric calculations
 * All formulas derived from IRS Form 990 field definitions.
 */

/**
 * Months of Cash on Hand
 * How long can org operate on liquid reserves alone?
 * Benchmark: < 3 = critical, 3–6 = moderate, > 6 = healthy
 */
export function monthsOfCash(filing) {
  const monthlyBurn = (filing.totalExpenses || 0) / 12;
  if (monthlyBurn <= 0) return null;
  const liquid = (filing.totalAssets || 0) - (filing.totalLiabilities || 0);
  return Math.max(0, liquid / monthlyBurn);
}

/**
 * Operating Margin
 * Measures ability to generate surplus after expenses.
 * Benchmark: < 0 = at risk, 0–5% = tight, > 5% = healthy
 */
export function operatingMargin(filing) {
  const rev = filing.totalRevenue || 0;
  if (rev <= 0) return null;
  return (rev - (filing.totalExpenses || 0)) / rev;
}

/**
 * Revenue Concentration Risk
 * Gov grants / total revenue. High reliance on one source = vulnerable.
 * Benchmark: > 0.5 = high risk, 0.3–0.5 = moderate, < 0.3 = diversified
 */
export function revenueConcentration(filing) {
  const rev = filing.totalRevenue || 0;
  if (rev <= 0) return null;
  // Use govt grants as the primary concentration indicator
  const govtGrants = filing.govtGrants || 0;
  return govtGrants / rev;
}

/**
 * Current Ratio (proxy)
 * Assets / Liabilities. > 1 = can cover obligations.
 * We use total assets vs total liabilities as a proxy.
 */
export function currentRatio(filing) {
  const liab = filing.totalLiabilities || 0;
  if (liab <= 0) return filing.totalAssets > 0 ? 10 : null; // no liabilities = great
  return (filing.totalAssets || 0) / liab;
}

/**
 * Program Expense Ratio
 * % of expenses going directly to mission programs.
 * Benchmark: < 60% = poor, 60–75% = ok, > 75% = strong
 */
export function programExpenseRatio(filing) {
  const totalExp = filing.totalExpenses || 0;
  if (totalExp <= 0) return null;
  // Estimate program expenses from raw data
  const progExp = filing.programExpenses || 0;
  if (progExp <= 0) {
    // Fallback: assume 75% is program if not available
    return 0.75;
  }
  return progExp / totalExp;
}

/**
 * Compute all metrics for a single filing.
 */
export function computeMetrics(filing) {
  return {
    monthsOfCash: monthsOfCash(filing),
    operatingMargin: operatingMargin(filing),
    revenueConcentration: revenueConcentration(filing),
    currentRatio: currentRatio(filing),
    programExpenseRatio: programExpenseRatio(filing),
  };
}

/**
 * Resilience Score (0–100 composite)
 * Weighted aggregate of all 5 metrics.
 */
export function resilienceScore(metrics) {
  let score = 0;
  let weight = 0;

  // Months of cash (weight: 30)
  if (metrics.monthsOfCash !== null) {
    const m = metrics.monthsOfCash;
    const s = m >= 12 ? 100 : m >= 6 ? 80 : m >= 3 ? 55 : m >= 1 ? 30 : 10;
    score += s * 0.30;
    weight += 0.30;
  }

  // Operating margin (weight: 25)
  if (metrics.operatingMargin !== null) {
    const m = metrics.operatingMargin;
    const s = m >= 0.10 ? 100 : m >= 0.05 ? 80 : m >= 0 ? 60 : m >= -0.05 ? 35 : 10;
    score += s * 0.25;
    weight += 0.25;
  }

  // Revenue concentration (weight: 20) — lower is better
  if (metrics.revenueConcentration !== null) {
    const m = metrics.revenueConcentration;
    const s = m <= 0.15 ? 100 : m <= 0.30 ? 80 : m <= 0.50 ? 50 : m <= 0.70 ? 25 : 10;
    score += s * 0.20;
    weight += 0.20;
  }

  // Current ratio (weight: 15)
  if (metrics.currentRatio !== null) {
    const m = metrics.currentRatio;
    const s = m >= 3 ? 100 : m >= 2 ? 85 : m >= 1.5 ? 70 : m >= 1 ? 50 : 20;
    score += s * 0.15;
    weight += 0.15;
  }

  // Program expense ratio (weight: 10)
  if (metrics.programExpenseRatio !== null) {
    const m = metrics.programExpenseRatio;
    const s = m >= 0.80 ? 100 : m >= 0.70 ? 85 : m >= 0.60 ? 65 : m >= 0.50 ? 45 : 20;
    score += s * 0.10;
    weight += 0.10;
  }

  if (weight === 0) return 50;
  return Math.round(score / weight);
}

/**
 * Get score label and color class
 */
export function scoreLabel(score) {
  if (score >= 75) return { label: 'Strong', cls: 'score-strong', color: '#00BFA5' };
  if (score >= 50) return { label: 'Moderate', cls: 'score-moderate', color: '#F5A623' };
  if (score >= 30) return { label: 'At Risk', cls: 'score-risk', color: '#FF6B6B' };
  return { label: 'Critical', cls: 'score-critical', color: '#FF2D55' };
}

/**
 * Get RAG status for a given metric
 */
export function metricStatus(metricName, value) {
  if (value === null || value === undefined) return 'unknown';
  switch (metricName) {
    case 'monthsOfCash':
      return value >= 6 ? 'green' : value >= 3 ? 'amber' : 'red';
    case 'operatingMargin':
      return value >= 0.05 ? 'green' : value >= 0 ? 'amber' : 'red';
    case 'revenueConcentration':
      return value <= 0.30 ? 'green' : value <= 0.50 ? 'amber' : 'red';
    case 'currentRatio':
      return value >= 2 ? 'green' : value >= 1 ? 'amber' : 'red';
    case 'programExpenseRatio':
      return value >= 0.70 ? 'green' : value >= 0.60 ? 'amber' : 'red';
    default:
      return 'unknown';
  }
}

/**
 * Format metric value for display
 */
export function formatMetricValue(metricName, value) {
  if (value === null || value === undefined) return 'N/A';
  switch (metricName) {
    case 'monthsOfCash':
      return `${value.toFixed(1)} mo`;
    case 'operatingMargin':
      return `${(value * 100).toFixed(1)}%`;
    case 'revenueConcentration':
      return `${(value * 100).toFixed(1)}%`;
    case 'currentRatio':
      return `${value.toFixed(2)}x`;
    case 'programExpenseRatio':
      return `${(value * 100).toFixed(1)}%`;
    default:
      return String(value);
  }
}

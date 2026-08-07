/**
 * montecarlo.js — Monte Carlo solvency simulation
 *
 * Turns the org's own filing history into a probabilistic 3-year outlook
 * instead of a single deterministic projection. Revenue and expense growth
 * are modeled as random variables (mean + stdev of the org's own historical
 * year-over-year growth rates), and thousands of simulated futures are run
 * forward to produce solvency probabilities at 12/24/36 months plus
 * percentile bands (p10/p50/p90) for a fan chart.
 *
 * This is deliberately simple (no ML, no training data) but it is genuinely
 * probabilistic: outputs are Monte Carlo estimates over many random draws,
 * not a single fixed "what if" number.
 */

// Bounds that keep simulations sane for orgs with very short or very noisy
// filing histories (a handful of data points can otherwise produce wild
// stdev estimates).
const MIN_STDEV = 0.05;
const MAX_STDEV = 0.45;
const MEAN_CLAMP = 0.25;

/**
 * Box-Muller transform: turns JS's uniform Math.random() into a standard
 * normal (Gaussian) random variable.
 */
function gaussianRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function statsFromGrowthRates(rates, fallbackMean, fallbackStdev) {
  if (rates.length < 2) {
    return { mean: fallbackMean, stdev: fallbackStdev, sampleSize: rates.length };
  }
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance = rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length;
  const stdev = Math.min(Math.max(Math.sqrt(variance), MIN_STDEV), MAX_STDEV);
  const clampedMean = Math.min(Math.max(mean, -MEAN_CLAMP), MEAN_CLAMP);
  return { mean: clampedMean, stdev, sampleSize: rates.length };
}

/**
 * Calibrate revenue/expense volatility from an org's own normalized filings
 * (oldest → newest, as produced by api.js#normalizeFilings).
 */
export function calibrateVolatility(filings) {
  const revGrowths = [];
  const expGrowths = [];

  for (let i = 1; i < filings.length; i++) {
    const prev = filings[i - 1];
    const cur = filings[i];
    if (prev.totalRevenue > 0 && cur.totalRevenue > 0) {
      revGrowths.push((cur.totalRevenue - prev.totalRevenue) / prev.totalRevenue);
    }
    if (prev.totalExpenses > 0 && cur.totalExpenses > 0) {
      expGrowths.push((cur.totalExpenses - prev.totalExpenses) / prev.totalExpenses);
    }
  }

  return {
    revenue: statsFromGrowthRates(revGrowths, 0.02, 0.15),
    expenses: statsFromGrowthRates(expGrowths, 0.03, 0.10),
    yearsOfHistory: filings.length,
  };
}

/**
 * Run the Monte Carlo simulation.
 * @param {NormalizedFiling} baseFiling — most recent filing (optionally
 *   pre-adjusted for a shock or grant scenario before calling this).
 * @param {ReturnType<typeof calibrateVolatility>} volatility
 * @param {{numSimulations?: number}} options
 */
export function runMonteCarlo(baseFiling, volatility, options = {}) {
  const numSimulations = options.numSimulations || 5000;
  const years = 3;
  const solvencyCounts = [0, 0, 0]; // year 1, 2, 3
  const trajectories = [];

  for (let s = 0; s < numSimulations; s++) {
    let revenue = baseFiling.totalRevenue;
    let expenses = baseFiling.totalExpenses;
    let netAssets = baseFiling.netAssets;
    let alreadyInsolvent = false;
    const path = [netAssets];

    for (let y = 0; y < years; y++) {
      const revGrowth = volatility.revenue.mean + volatility.revenue.stdev * gaussianRandom();
      const expGrowth = volatility.expenses.mean + volatility.expenses.stdev * gaussianRandom();
      revenue = Math.max(0, revenue * (1 + revGrowth));
      expenses = Math.max(0, expenses * (1 + expGrowth));
      netAssets += revenue - expenses;
      path.push(netAssets);

      if (!alreadyInsolvent && netAssets > 0) {
        solvencyCounts[y]++;
      } else {
        alreadyInsolvent = true;
      }
    }
    trajectories.push(path);
  }

  const solvencyProb = {
    12: Math.round((solvencyCounts[0] / numSimulations) * 100),
    24: Math.round((solvencyCounts[1] / numSimulations) * 100),
    36: Math.round((solvencyCounts[2] / numSimulations) * 100),
  };

  const percentileAt = (yearIdx, p) => {
    const vals = trajectories.map(t => t[yearIdx]).sort((a, b) => a - b);
    const idx = Math.min(vals.length - 1, Math.max(0, Math.floor(p * vals.length)));
    return vals[idx];
  };

  const bands = { p10: [], p50: [], p90: [] };
  for (let y = 0; y <= years; y++) {
    bands.p10.push(Math.round(percentileAt(y, 0.10)));
    bands.p50.push(Math.round(percentileAt(y, 0.50)));
    bands.p90.push(Math.round(percentileAt(y, 0.90)));
  }

  return { solvencyProb, bands, numSimulations, volatility };
}

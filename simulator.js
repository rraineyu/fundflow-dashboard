/**
 * simulator.js — Funding shock engine + grant impact modeler
 */

import { computeMetrics, resilienceScore } from './metrics.js';

/**
 * Shock types and their effect vectors
 */
export const SHOCK_TYPES = {
  revenue_loss: {
    label: 'Revenue Loss',
    icon: '📉',
    description: 'Sudden drop in total revenue (donor loss, market downturn)',
    affectsRevenue: true,
    affectsExpenses: false,
  },
  grant_elimination: {
    label: 'Grant Elimination',
    icon: '🚫',
    description: 'A major government or foundation grant is pulled',
    affectsRevenue: true,
    affectsExpenses: false,
    targetGovtGrants: true,
  },
  expense_surge: {
    label: 'Expense Surge',
    icon: '📈',
    description: 'Unexpected cost increase (inflation, emergency, legal)',
    affectsRevenue: false,
    affectsExpenses: true,
  },
};

/**
 * Grant types and their financial impact profiles
 */
export const GRANT_TYPES = {
  general_operating: {
    label: 'General Operating Support',
    icon: '🏛️',
    revenueBoost: 1.0,
    flexibilityFactor: 1.0, // fully flexible
    concentrationImpact: 0.05, // adds slight concentration
  },
  restricted_program: {
    label: 'Restricted Program Grant',
    icon: '🎯',
    revenueBoost: 1.0,
    flexibilityFactor: 0.6,
    concentrationImpact: 0.08,
  },
  capacity_building: {
    label: 'Capacity Building',
    icon: '⚙️',
    revenueBoost: 1.0,
    programExpenseBoost: 0.05, // also improves program ratio
    flexibilityFactor: 0.75,
    concentrationImpact: 0.04,
  },
  endowment_seed: {
    label: 'Endowment Seed',
    icon: '🌱',
    revenueBoost: 0.0, // goes to assets not revenue
    assetBoost: 1.0,
    flexibilityFactor: 0.3,
    concentrationImpact: 0.02,
  },
};

/**
 * Run a funding shock simulation.
 * @param {NormalizedFiling} baseFiling — most recent filing
 * @param {string} shockType — key from SHOCK_TYPES
 * @param {number} shockMagnitude — 0.0–1.0 (e.g., 0.30 = 30% shock)
 * @param {number} durationYears — 1, 2, or 3
 * @returns {ShockResult}
 */
export function runShockSimulation(baseFiling, shockType, shockMagnitude, durationYears) {
  const shock = SHOCK_TYPES[shockType];
  const years = [];
  const revenueByYear = [];
  const expensesByYear = [];
  const netAssetsByYear = [];

  let currentNetAssets = baseFiling.netAssets;
  let survivedMonths = null;
  let runwayExhausted = false;

  // Project 5 years: pre-shock base → shock period → recovery
  const totalYears = Math.max(5, durationYears + 2);

  for (let i = 0; i < totalYears; i++) {
    const inShockPeriod = i < durationYears;
    const isRecovery = !inShockPeriod;

    let projRevenue = baseFiling.totalRevenue;
    let projExpenses = baseFiling.totalExpenses;

    if (inShockPeriod) {
      if (shock.affectsRevenue) {
        if (shock.targetGovtGrants) {
          // Eliminate govt grants specifically
          const govtGrants = baseFiling.govtGrants || baseFiling.totalRevenue * 0.3;
          projRevenue = baseFiling.totalRevenue - (govtGrants * shockMagnitude);
        } else {
          projRevenue = baseFiling.totalRevenue * (1 - shockMagnitude);
        }
      }
      if (shock.affectsExpenses) {
        projExpenses = baseFiling.totalExpenses * (1 + shockMagnitude);
      }
    } else {
      // Recovery: linear ramp back to baseline over 2 years
      const recoveryProgress = Math.min(1, (i - durationYears) / 2);
      const shockedRevenue = shock.affectsRevenue
        ? baseFiling.totalRevenue * (1 - shockMagnitude)
        : baseFiling.totalRevenue;
      projRevenue = shockedRevenue + (baseFiling.totalRevenue - shockedRevenue) * recoveryProgress;

      const shockedExpenses = shock.affectsExpenses
        ? baseFiling.totalExpenses * (1 + shockMagnitude * 0.5) // expenses come down slower
        : baseFiling.totalExpenses;
      projExpenses = shockedExpenses + (baseFiling.totalExpenses - shockedExpenses) * recoveryProgress;
    }

    const netChange = projRevenue - projExpenses;
    currentNetAssets += netChange;

    years.push(`Year +${i + 1}`);
    revenueByYear.push(Math.round(projRevenue));
    expensesByYear.push(Math.round(projExpenses));
    netAssetsByYear.push(Math.round(currentNetAssets));

    // Track when runway is exhausted
    if (currentNetAssets <= 0 && !runwayExhausted) {
      runwayExhausted = true;
      survivedMonths = Math.round(i * 12 + (netAssetsByYear[i - 1] || 0) / Math.abs(netChange / 12));
    }
  }

  // Shocked filing for metric recalculation
  const shockedFiling = { ...baseFiling };
  if (shock.affectsRevenue) {
    if (shock.targetGovtGrants) {
      const govtGrants = baseFiling.govtGrants || baseFiling.totalRevenue * 0.3;
      shockedFiling.totalRevenue = baseFiling.totalRevenue - govtGrants * shockMagnitude;
      shockedFiling.govtGrants = baseFiling.govtGrants * (1 - shockMagnitude);
    } else {
      shockedFiling.totalRevenue = baseFiling.totalRevenue * (1 - shockMagnitude);
      shockedFiling.govtGrants = baseFiling.govtGrants * (1 - shockMagnitude);
    }
  }
  if (shock.affectsExpenses) {
    shockedFiling.totalExpenses = baseFiling.totalExpenses * (1 + shockMagnitude);
  }
  shockedFiling.netAssets = baseFiling.netAssets + (shockedFiling.totalRevenue - shockedFiling.totalExpenses);

  const shockedMetrics = computeMetrics(shockedFiling);
  const shockedScore = resilienceScore(shockedMetrics);

  const baseMetrics = computeMetrics(baseFiling);
  const baseScore = resilienceScore(baseMetrics);

  // Monthly runway from current net assets
  const monthlyBurnInShock = (shockedFiling.totalExpenses - shockedFiling.totalRevenue) / 12;
  const runwayMonths = monthlyBurnInShock > 0
    ? Math.max(0, baseFiling.netAssets / monthlyBurnInShock)
    : null;

  return {
    years,
    revenueByYear,
    expensesByYear,
    netAssetsByYear,
    shockedMetrics,
    shockedScore,
    baseScore,
    scoreDelta: shockedScore - baseScore,
    runwayMonths: survivedMonths || runwayMonths,
    runwayExhausted,
    annualDeficit: Math.round(shockedFiling.totalRevenue - shockedFiling.totalExpenses),
  };
}

/**
 * Run a grant impact simulation.
 * @param {NormalizedFiling} baseFiling
 * @param {number} grantAmount — dollar amount
 * @param {string} grantType — key from GRANT_TYPES
 * @returns {GrantResult}
 */
export function runGrantSimulation(baseFiling, grantAmount, grantType) {
  const grant = GRANT_TYPES[grantType];
  const baseMetrics = computeMetrics(baseFiling);
  const baseScore = resilienceScore(baseMetrics);

  // Apply grant effects
  const boostedFiling = { ...baseFiling };

  if (grant.assetBoost) {
    // Endowment — goes to net assets, generates small investment income
    boostedFiling.totalAssets = baseFiling.totalAssets + grantAmount;
    boostedFiling.netAssets = baseFiling.netAssets + grantAmount;
    const investmentReturn = grantAmount * 0.05; // 5% return assumption
    boostedFiling.totalRevenue = baseFiling.totalRevenue + investmentReturn;
    boostedFiling.investmentIncome = (baseFiling.investmentIncome || 0) + investmentReturn;
  } else {
    // Operating grant — flows through revenue
    const effectiveRevenue = grantAmount * grant.revenueBoost;
    boostedFiling.totalRevenue = baseFiling.totalRevenue + effectiveRevenue;
    boostedFiling.contributions = (baseFiling.contributions || 0) + effectiveRevenue;
    // Slight assets improvement from surplus
    const annualSurplus = effectiveRevenue * grant.flexibilityFactor;
    boostedFiling.totalAssets = baseFiling.totalAssets + annualSurplus;
    boostedFiling.netAssets = baseFiling.netAssets + annualSurplus;
  }

  const boostedMetrics = computeMetrics(boostedFiling);
  const boostedScore = resilienceScore(boostedMetrics);

  // 3-year projection (compounding surplus)
  const annualSurplus = boostedFiling.totalRevenue - boostedFiling.totalExpenses;
  const netAssets3yr = baseFiling.netAssets + annualSurplus * 3;

  // Months of runway added vs base
  const baseRunway = baseMetrics.monthsOfCash || 0;
  const boostedRunway = boostedMetrics.monthsOfCash || 0;
  const runwayAdded = boostedRunway - baseRunway;

  // Revenue concentration change
  const concBefore = baseMetrics.revenueConcentration || 0;
  const concAfter = boostedMetrics.revenueConcentration || 0;

  return {
    baseScore,
    boostedScore,
    scoreDelta: boostedScore - baseScore,
    baseMetrics,
    boostedMetrics,
    runwayAdded,
    netAssets3yr: Math.round(netAssets3yr),
    annualSurplus: Math.round(annualSurplus),
    concentrationChange: concAfter - concBefore,
    grantInfo: grant,
  };
}

/**
 * Format dollar amounts compactly
 */
export function formatDollars(n) {
  if (n === null || n === undefined) return 'N/A';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

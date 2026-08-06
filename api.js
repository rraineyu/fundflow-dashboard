/**
 * api.js — ProPublica Nonprofit Explorer API (v2) client
 *
 * This module was missing from the project (app.js imports it but the file
 * did not exist), which broke the entire dashboard — the module import
 * failure prevents app.js from loading at all. Field names below are
 * verified against live responses from:
 *   GET /search.json?q=...
 *   GET /organizations/{ein}.json
 */

const BASE = 'https://projects.propublica.org/nonprofits/api/v2';

/**
 * Search organizations by name/EIN.
 * @param {string} query
 * @returns {Promise<{organizations: Array}>}
 */
export async function searchOrganizations(query) {
  let res;
  try {
    res = await fetch(`${BASE}/search.json?q=${encodeURIComponent(query)}`);
  } catch (err) {
    throw new Error('Could not reach the ProPublica Nonprofit Explorer API. Check your connection and try again.');
  }
  if (!res.ok) {
    throw new Error(`Search failed (HTTP ${res.status}). Please try again.`);
  }
  const data = await res.json();
  return { organizations: data.organizations || [], total: data.total_results || 0 };
}

/**
 * Fetch a single organization's profile + filing history.
 * @param {string|number} ein
 * @returns {Promise<{organization: object, filings_with_data: Array}>}
 */
export async function getOrganization(ein) {
  let res;
  try {
    res = await fetch(`${BASE}/organizations/${ein}.json`);
  } catch (err) {
    throw new Error('Could not reach the ProPublica Nonprofit Explorer API. Check your connection and try again.');
  }
  if (!res.ok) {
    throw new Error(`Could not load this organization (HTTP ${res.status}).`);
  }
  const data = await res.json();
  return {
    organization: data.organization,
    filings_with_data: data.filings_with_data || [],
  };
}

/**
 * Normalize raw ProPublica filings into the shape metrics.js / simulator.js /
 * charts.js expect, oldest → newest.
 *
 * Note: the ProPublica v2 filing extract does not break out government vs.
 * private grants, nor program vs. admin/fundraising expenses. We use
 * "total contributions & grants" (totcntrbgfts) as a concentration-risk
 * proxy for govtGrants, and let metrics.js fall back to its built-in 75%
 * program-expense assumption when programExpenses is unavailable.
 */
export function normalizeFilings(filingsWithData) {
  return (filingsWithData || [])
    .filter(f => f && typeof f.totrevenue === 'number' && typeof f.totfuncexpns === 'number')
    .map(f => ({
      year: f.tax_prd_yr,
      totalRevenue: f.totrevenue || 0,
      totalExpenses: f.totfuncexpns || 0,
      totalAssets: f.totassetsend || 0,
      totalLiabilities: f.totliabend || 0,
      netAssets: f.totnetassetend || 0,
      contributions: f.totcntrbgfts || 0,
      programRevenue: f.totprgmrevnue || 0,
      investmentIncome: f.invstmntinc || 0,
      govtGrants: f.totcntrbgfts || 0,
      programExpenses: 0,
    }))
    .sort((a, b) => a.year - b.year);
}

/**
 * Revenue mix for the donut chart on a single normalized filing.
 */
export function getRevenueBreakdown(filing) {
  const contributions = filing.contributions || 0;
  const programRevenue = filing.programRevenue || 0;
  const investmentIncome = filing.investmentIncome || 0;
  const total = filing.totalRevenue || 0;
  const other = Math.max(0, total - contributions - programRevenue - investmentIncome);

  return {
    contributions,
    govtGrants: 0, // not separately reported in this data source; folded into "contributions" above
    programRevenue,
    investmentIncome,
    other,
  };
}

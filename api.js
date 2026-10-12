/**
 * api.js — ProPublica Nonprofit Explorer API (v2) client
 *
 * This module was missing from the project (app.js imports it but the file
 * did not exist), which broke the entire dashboard — the module import
 * failure prevents app.js from loading at all. Field names below are
 * verified against live responses from:
 *   GET /search.json?q=...
 *   GET /organizations/{ein}.json
 *
 * IMPORTANT: ProPublica's API does not send CORS headers, so a direct
 * browser fetch() from a static site (e.g. GitHub Pages) is blocked by the
 * browser even though the API itself is reachable and public (confirmed:
 * a no-cors probe connects fine; a normal cors-mode fetch throws
 * "Failed to fetch"). Since this project has no backend, requests are
 * routed through a public CORS proxy, with a direct-fetch attempt first
 * (in case ProPublica ever adds CORS support) and two proxy fallbacks for
 * resilience against any single proxy being down.
 */

const BASE = 'https://projects.propublica.org/nonprofits/api/v2';

// Own Cloudflare Worker relay (source: relay/worker.js).
const RELAY = 'https://fundflow-proxy.rraineyyu.workers.dev';

const CORS_PROXIES = [
  url => url.replace('https://projects.propublica.org', RELAY), // own relay first
  url => url, // direct (works only if ProPublica adds CORS)
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

async function fetchJSON(url) {
  let lastErr;
  for (const wrap of CORS_PROXIES) {
    try {
      const res = await fetch(wrap(url));
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Unknown fetch error');
}

/**
 * Search organizations by name/EIN.
 * @param {string} query
 * @returns {Promise<{organizations: Array}>}
 */
export async function searchOrganizations(query) {
  let data;
  try {
    data = await fetchJSON(`${BASE}/search.json?q=${encodeURIComponent(query)}`);
  } catch (err) {
    throw new Error('Could not reach the ProPublica Nonprofit Explorer API. Check your connection and try again.');
  }
  return { organizations: data.organizations || [], total: data.total_results || 0 };
}

/**
 * Fetch a single organization's profile + filing history.
 * @param {string|number} ein
 * @returns {Promise<{organization: object, filings_with_data: Array}>}
 */
export async function getOrganization(ein) {
  let data;
  try {
    data = await fetchJSON(`${BASE}/organizations/${ein}.json`);
  } catch (err) {
    throw new Error('Could not reach the ProPublica Nonprofit Explorer API. Check your connection and try again.');
  }
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

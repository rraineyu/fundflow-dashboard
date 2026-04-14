/**
 * api.js — ProPublica Nonprofit Explorer API v2 wrapper
 * Routes through a CORS proxy because ProPublica does not send
 * Access-Control-Allow-Origin headers from browser contexts.
 * Uses corsproxy.io with fallback to allorigins.win.
 */

const BASE_URL = 'https://projects.propublica.org/nonprofits/api/v2';

// Ordered list of CORS proxies — tried in sequence on failure
const PROXIES = [
  // corsproxy.io: prepend as a URL prefix, returns the response directly
  { type: 'prefix', url: 'https://corsproxy.io/?' },
  // allorigins.win: wraps response in { contents: '...' }
  { type: 'allorigins', url: 'https://api.allorigins.win/get?url=' },
];

async function proxiedFetch(targetUrl) {
  let lastError;
  for (const proxy of PROXIES) {
    try {
      if (proxy.type === 'prefix') {
        const res = await fetch(`${proxy.url}${encodeURIComponent(targetUrl)}`, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } else if (proxy.type === 'allorigins') {
        const res = await fetch(`${proxy.url}${encodeURIComponent(targetUrl)}`, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const wrapper = await res.json();
        if (!wrapper.contents) throw new Error('Empty response');
        return JSON.parse(wrapper.contents);
      }
    } catch (err) {
      lastError = err;
      console.warn(`Proxy ${proxy.url} failed:`, err.message, '— trying next…');
    }
  }
  throw new Error(`All proxies failed. Last error: ${lastError?.message}`);
}

/**
 * Search nonprofits by name/keyword.
 * @param {string} query
 * @param {number} page
 * @returns {Promise<{organizations: Array, total_results: number}>}
 */
export async function searchOrganizations(query, page = 0) {
  const url = `${BASE_URL}/search.json?q=${encodeURIComponent(query)}&page=${page}`;
  return proxiedFetch(url);
}

/**
 * Get full organization data + all filings by EIN.
 * @param {string|number} ein
 * @returns {Promise<OrganizationResult>}
 */
export async function getOrganization(ein) {
  const cleanEin = String(ein).replace(/-/g, '');
  const url = `${BASE_URL}/organizations/${cleanEin}.json`;
  return proxiedFetch(url);
}

/**
 * Normalize and sort filings into a clean 7-year panel.
 * Returns filings sorted ascending by year, at most 7.
 * @param {Array} filings — filings_with_data from API
 * @returns {Array<NormalizedFiling>}
 */
export function normalizeFilings(filings) {
  if (!filings || filings.length === 0) return [];

  const normalized = filings
    .filter(f => f.totrevenue !== null && f.totrevenue !== undefined)
    .map(f => ({
      year: f.tax_prd_yr,
      period: f.tax_prd,
      formtype: f.formtype,
      pdfUrl: f.pdf_url,
      // Core financials
      totalRevenue: f.totrevenue || 0,
      totalExpenses: f.totfuncexpns || 0,
      totalAssets: f.totassetsend || 0,
      totalLiabilities: f.totliabend || 0,
      netAssets: (f.totassetsend || 0) - (f.totliabend || 0),
      // Revenue breakdown
      contributions: f.totcntrbgfts || 0,         // contributions & grants
      govtGrants: f.gvtgrnts || 0,                // government grants
      programRevenue: f.totprgmrevnue || 0,        // program service revenue
      investmentIncome: f.invstmntinc || 0,        // investment income
      otherRevenue: f.othrincome || 0,             // other revenue
      // Expense breakdown
      programExpenses: f.totprgmrevnue !== undefined ? (f.progservexpns || 0) : 0,
      mgmtExpenses: f.mgmtgenexpns || 0,
      fundraisingExpenses: f.fundrexpns || 0,
      // Cash & compensation
      cashOnHand: f.totassetsend || 0,
      employeeCount: f.noemployees || 0,
      officerCompensation: f.compnsatncurrofcr || 0,
      // Raw filing object for fallback
      _raw: f,
    }));

  // Sort ascending by year, take last 7
  const sorted = normalized.sort((a, b) => a.year - b.year);
  return sorted.slice(-7);
}

/**
 * Extract revenue breakdown for most recent filing.
 * @param {NormalizedFiling} filing
 * @returns {Object}
 */
export function getRevenueBreakdown(filing) {
  const total = filing.totalRevenue || 1;
  const contributions = filing.contributions || 0;
  const govtGrants = filing.govtGrants || 0;
  const programRevenue = filing.programRevenue || 0;
  const investmentIncome = filing.investmentIncome || 0;
  const other = Math.max(0, total - contributions - govtGrants - programRevenue - investmentIncome);

  return {
    contributions,
    govtGrants,
    programRevenue,
    investmentIncome,
    other,
    total,
  };
}

/**
 * app.js — FundFlow Simulator main application
 * View routing, state management, UI wiring
 */

import { searchOrganizations, getOrganization, normalizeFilings, getRevenueBreakdown } from './api.js';
import { computeMetrics, resilienceScore, scoreLabel, metricStatus, formatMetricValue } from './metrics.js';
import { runShockSimulation, runGrantSimulation, SHOCK_TYPES, GRANT_TYPES, formatDollars } from './simulator.js';
import { buildTrendChart, buildRevenueDonut, buildShockChart, buildGrantComparisonChart } from './charts.js';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  searchResults: [],
  filteredResults: [],
  selectedOrg: null,
  filings: [],
  latestFiling: null,
  metrics: null,
  score: 0,
  charts: {},
  shockResult: null,
  grantResult: null,
  filters: {
    category: 'all',
    revenue: 'all',
    employees: 'all',
    geography: 'all',
  },
};

// ── View Navigation ───────────────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.style.display = '';
  });
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    // The loading view needs flex display, others default to block
    if (id === 'view-loading') {
      el.style.display = 'flex';
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Search ────────────────────────────────────────────────────────────────────
async function handleSearch(query) {
  if (!query.trim()) return;

  const resultsEl = document.getElementById('search-results');
  const searchBtn = document.getElementById('search-btn');
  
  resultsEl.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Searching ProPublica Nonprofit Explorer…</p>
    </div>`;
  searchBtn.disabled = true;
  searchBtn.textContent = 'Searching…';

  try {
    const data = await searchOrganizations(query);
    state.searchResults = data.organizations || [];
    initializeSearchFilters(state.searchResults);
    applySearchFilters();
  } catch (err) {
    resultsEl.innerHTML = `<div class="error-state"><span class="error-icon">⚠️</span> ${err.message}</div>`;
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Search';
  }
}

function renderSearchResults(orgs, total = orgs.length) {
  const el = document.getElementById('search-results');
  if (!orgs.length) {
    el.innerHTML = `
      <div id="search-filters" class="search-filters"></div>
      <div class="empty-state">No organizations match this filter set. Try widening one or more filters.</div>`;
    renderSearchFilters();
    return;
  }

  el.innerHTML = `
    <div id="search-filters" class="search-filters"></div>
    <div class="results-header">
      <span>Showing ${orgs.length} of ${total} organizations</span>
      <span class="results-subtle">${getActiveFilterCount()} active filter${getActiveFilterCount() === 1 ? '' : 's'}</span>
    </div>
    <div class="results-grid">
      ${orgs.slice(0, 20).map(org => `
        <div class="org-card" data-ein="${org.ein}" role="button" tabindex="0">
          <div class="org-card-header">
            <div class="org-icon">${getNTEEIcon(org.ntee_code)}</div>
            <div class="org-card-meta">
              <span class="org-name">${org.name || 'Unknown'}</span>
              <span class="org-ein">EIN: ${org.strein || org.ein}</span>
            </div>
          </div>
          <div class="org-card-details">
            <span class="org-location">${[org.city, org.state].filter(Boolean).join(', ') || 'Location unknown'}</span>
            <span class="org-category">${deriveCategory(org)}</span>
          </div>
          ${org.income_amount ? `<div class="org-revenue">Revenue: ${formatDollars(org.income_amount)}</div>` : ''}
          <div class="org-meta-row">
            <span>${labelRevenueRange(org)}</span>
            <span>${labelEmployeeSize(org)}</span>
          </div>
        </div>
      `).join('')}
    </div>`;
  renderSearchFilters();

  // Attach click handlers
  el.querySelectorAll('.org-card').forEach(card => {
    const handler = () => loadOrganization(card.dataset.ein);
    card.addEventListener('click', handler);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });
}

function initializeSearchFilters(orgs) {
  state.filters = { category: 'all', revenue: 'all', employees: 'all', geography: 'all' };
  state.filterOptions = {
    categories: ['all', ...new Set(orgs.map(deriveCategory).filter(Boolean))].sort(),
    states: ['all', ...new Set(orgs.map(o => o.state).filter(Boolean))].sort(),
  };
}

function renderSearchFilters() {
  const el = document.getElementById('search-filters');
  if (!el || !state.searchResults.length) return;
  const categories = (state.filterOptions?.categories || ['all']).filter(Boolean);
  const states = (state.filterOptions?.states || ['all']).filter(Boolean);
  const activeFilterCount = getActiveFilterCount();
  el.innerHTML = `
    <div class="filters-header">
      <h3>Filter organizations</h3>
      <div class="filters-header-actions">
        <div class="active-filter-pill">${activeFilterCount} active</div>
        <button id="clear-filters-btn" type="button" ${activeFilterCount === 0 ? 'disabled' : ''}>Clear filters</button>
      </div>
    </div>
    <div class="filters-grid">
      <div class="filter-field">
        <label for="filter-category">Category</label>
        <select id="filter-category">
          ${categories.map(c => `<option value="${c}" ${state.filters.category === c ? 'selected' : ''}>${c === 'all' ? 'All categories' : c}</option>`).join('')}
        </select>
      </div>
      <div class="filter-field">
        <label for="filter-revenue">Revenue Range</label>
        <select id="filter-revenue">
          <option value="all" ${state.filters.revenue === 'all' ? 'selected' : ''}>All revenue ranges</option>
          <option value="500k-5m" ${state.filters.revenue === '500k-5m' ? 'selected' : ''}>$500K-$5M</option>
          <option value="0-500k" ${state.filters.revenue === '0-500k' ? 'selected' : ''}>Below $500K</option>
          <option value="5m-25m" ${state.filters.revenue === '5m-25m' ? 'selected' : ''}>$5M-$25M</option>
          <option value="25m+" ${state.filters.revenue === '25m+' ? 'selected' : ''}>$25M+</option>
        </select>
      </div>
      <div class="filter-field">
        <label for="filter-employees">Employee Size</label>
        <select id="filter-employees">
          <option value="all" ${state.filters.employees === 'all' ? 'selected' : ''}>All employee sizes</option>
          <option value="1-10" ${state.filters.employees === '1-10' ? 'selected' : ''}>1-10</option>
          <option value="11-50" ${state.filters.employees === '11-50' ? 'selected' : ''}>11-50</option>
          <option value="51-200" ${state.filters.employees === '51-200' ? 'selected' : ''}>51-200</option>
          <option value="200+" ${state.filters.employees === '200+' ? 'selected' : ''}>200+</option>
        </select>
      </div>
      <div class="filter-field">
        <label for="filter-geography">Geography</label>
        <select id="filter-geography">
          ${states.map(s => `<option value="${s}" ${state.filters.geography === s ? 'selected' : ''}>${s === 'all' ? 'All states' : s}</option>`).join('')}
        </select>
      </div>
    </div>`;

  el.querySelectorAll('select').forEach(select => {
    select.addEventListener('change', () => {
      state.filters = {
        category: document.getElementById('filter-category')?.value || 'all',
        revenue: document.getElementById('filter-revenue')?.value || 'all',
        employees: document.getElementById('filter-employees')?.value || 'all',
        geography: document.getElementById('filter-geography')?.value || 'all',
      };
      applySearchFilters();
    });
  });
  const clearBtn = document.getElementById('clear-filters-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.filters = { category: 'all', revenue: 'all', employees: 'all', geography: 'all' };
      applySearchFilters();
    });
  }
}

function getActiveFilterCount() {
  return Object.values(state.filters || {}).filter(v => v && v !== 'all').length;
}

function applySearchFilters() {
  const filtered = state.searchResults.filter(org => {
    const categoryMatch = state.filters.category === 'all' || deriveCategory(org) === state.filters.category;
    const revenueMatch = matchesRevenueRange(org.income_amount || 0, state.filters.revenue);
    const employeeMatch = matchesEmployeeRange(estimateEmployeeCount(org), state.filters.employees);
    const geoMatch = state.filters.geography === 'all' || org.state === state.filters.geography;
    return categoryMatch && revenueMatch && employeeMatch && geoMatch;
  });
  state.filteredResults = filtered;
  renderSearchResults(filtered, state.searchResults.length);
}

function deriveCategory(org) {
  const major = (org.ntee_code || '').charAt(0).toUpperCase();
  if (['K', 'L', 'P', 'S'].includes(major)) return 'Human Services';
  if (['A', 'B'].includes(major)) return 'Education';
  if (['E', 'F', 'G', 'H'].includes(major)) return 'Health';
  if (['N', 'O'].includes(major)) return 'Youth Development';
  return major ? 'Other' : 'Unclassified';
}

function estimateEmployeeCount(org) {
  if (typeof org.noemployees === 'number' && org.noemployees > 0) return org.noemployees;
  const revenue = org.income_amount || 0;
  if (revenue <= 500_000) return 8;
  if (revenue <= 2_000_000) return 30;
  if (revenue <= 10_000_000) return 90;
  return 250;
}

function matchesRevenueRange(revenue, range) {
  if (range === 'all') return true;
  if (range === '0-500k') return revenue < 500_000;
  if (range === '500k-5m') return revenue >= 500_000 && revenue <= 5_000_000;
  if (range === '5m-25m') return revenue > 5_000_000 && revenue <= 25_000_000;
  if (range === '25m+') return revenue > 25_000_000;
  return true;
}

function matchesEmployeeRange(count, range) {
  if (range === 'all') return true;
  if (range === '1-10') return count >= 1 && count <= 10;
  if (range === '11-50') return count >= 11 && count <= 50;
  if (range === '51-200') return count >= 51 && count <= 200;
  if (range === '200+') return count > 200;
  return true;
}

function labelRevenueRange(org) {
  const rev = org.income_amount || 0;
  if (rev < 500_000) return 'Revenue: < $500K';
  if (rev <= 5_000_000) return 'Revenue: $500K-$5M';
  if (rev <= 25_000_000) return 'Revenue: $5M-$25M';
  return 'Revenue: $25M+';
}

function labelEmployeeSize(org) {
  const n = estimateEmployeeCount(org);
  if (n <= 10) return 'Employees: 1-10';
  if (n <= 50) return 'Employees: 11-50';
  if (n <= 200) return 'Employees: 51-200';
  return 'Employees: 200+';
}

// ── Organization Dashboard ────────────────────────────────────────────────────
async function loadOrganization(ein) {
  showView('view-loading');
  document.getElementById('loading-org-name').textContent = 'Loading organization data…';

  try {
    const data = await getOrganization(ein);
    state.selectedOrg = data.organization;
    state.filings = normalizeFilings(data.filings_with_data || []);

    if (!state.filings.length) {
      throw new Error('No financial data available for this organization.');
    }

    state.latestFiling = state.filings[state.filings.length - 1];
    state.metrics = computeMetrics(state.latestFiling);
    state.score = resilienceScore(state.metrics);

    renderDashboard();
    showView('view-dashboard');
  } catch (err) {
    showView('view-search');
    showToast(`Error: ${err.message}`, 'error');
  }
}

function renderDashboard() {
  const org = state.selectedOrg;
  const filing = state.latestFiling;
  const metrics = state.metrics;
  const score = state.score;
  const sl = scoreLabel(score);

  // Header
  document.getElementById('dash-org-name').textContent = org.name || 'Unknown Organization';
  document.getElementById('dash-org-ein').textContent = `EIN ${org.strein || org.ein}`;
  document.getElementById('dash-org-location').textContent = [org.city, org.state, org.zipcode].filter(Boolean).join(', ');
  document.getElementById('dash-org-ntee').textContent = org.ntee_code ? `NTEE: ${org.ntee_code}` : '';
  document.getElementById('dash-data-year').textContent = `Most recent data: ${filing.year}`;
  document.getElementById('dash-total-filings').textContent = `${state.filings.length} years of filings`;

  // Key financials
  document.getElementById('stat-revenue').textContent = formatDollars(filing.totalRevenue);
  document.getElementById('stat-expenses').textContent = formatDollars(filing.totalExpenses);
  document.getElementById('stat-net-assets').textContent = formatDollars(filing.netAssets);
  const surplus = filing.totalRevenue - filing.totalExpenses;
  const surplusEl = document.getElementById('stat-surplus');
  surplusEl.textContent = formatDollars(surplus);
  surplusEl.className = surplus >= 0 ? 'stat-value positive' : 'stat-value negative';

  // Resilience score
  animateScore(score, sl);

  // Metric cards
  renderMetricCards(metrics);

  // Charts
  renderDashboardCharts();
}

function animateScore(targetScore, sl) {
  const scoreEl = document.getElementById('resilience-score-value');
  const labelEl = document.getElementById('resilience-score-label');
  const ringEl = document.getElementById('score-ring');
  const descEl = document.getElementById('resilience-score-desc');

  labelEl.textContent = sl.label;
  labelEl.style.color = sl.color;
  descEl.textContent = getScoreDescription(targetScore);

  // Set ring color
  ringEl.style.setProperty('--score-color', sl.color);
  ringEl.style.setProperty('--score-pct', `${targetScore}%`);

  // Animate counter
  let current = 0;
  const step = targetScore / 40;
  const interval = setInterval(() => {
    current = Math.min(current + step, targetScore);
    scoreEl.textContent = Math.round(current);
    if (current >= targetScore) clearInterval(interval);
  }, 25);
}

function getScoreDescription(score) {
  if (score >= 75) return 'This organization demonstrates strong financial resilience with healthy reserves and diversified revenue.';
  if (score >= 50) return 'Moderate resilience. Some risks present — review concentration and cash runway carefully.';
  if (score >= 30) return 'Financial vulnerabilities detected. Grant impact could be significant here.';
  return 'Critical financial stress. Targeted support may be essential for organizational survival.';
}

function renderMetricCards(metrics) {
  const metricsMeta = [
    {
      key: 'monthsOfCash',
      label: 'Months of Cash',
      icon: '💧',
      description: 'Operating reserve runway',
      benchmark: '≥ 6 months healthy',
    },
    {
      key: 'operatingMargin',
      label: 'Operating Margin',
      icon: '📊',
      description: 'Revenue surplus after expenses',
      benchmark: '≥ 5% healthy',
    },
    {
      key: 'revenueConcentration',
      label: 'Revenue Concentration',
      icon: '🎯',
      description: 'Gov grant dependency ratio',
      benchmark: '≤ 30% diversified',
      invertColor: true,
    },
    {
      key: 'currentRatio',
      label: 'Current Ratio',
      icon: '⚖️',
      description: 'Assets vs. liabilities coverage',
      benchmark: '≥ 2.0x healthy',
    },
    {
      key: 'programExpenseRatio',
      label: 'Program Efficiency',
      icon: '🎖️',
      description: 'Expenses toward mission programs',
      benchmark: '≥ 70% efficient',
    },
  ];

  const container = document.getElementById('metric-cards');
  container.innerHTML = metricsMeta.map(m => {
    const value = metrics[m.key];
    const status = metricStatus(m.key, value);
    const displayVal = formatMetricValue(m.key, value);
    const statusClass = `status-${status}`;

    return `
      <div class="metric-card ${statusClass}">
        <div class="metric-icon">${m.icon}</div>
        <div class="metric-body">
          <div class="metric-label">${m.label}</div>
          <div class="metric-value">${displayVal}</div>
          <div class="metric-description">${m.description}</div>
          <div class="metric-benchmark">${m.benchmark}</div>
        </div>
        <div class="metric-status-dot"></div>
      </div>`;
  }).join('');
}

function renderDashboardCharts() {
  // Destroy existing charts
  Object.values(state.charts).forEach(c => { if (c && c.destroy) c.destroy(); });
  state.charts = {};

  // Trend chart
  const trendCtx = document.getElementById('chart-trend');
  if (trendCtx && state.filings.length > 0) {
    state.charts.trend = buildTrendChart(trendCtx, state.filings);
  }

  // Revenue donut
  const donutCtx = document.getElementById('chart-donut');
  if (donutCtx && state.latestFiling) {
    const breakdown = getRevenueBreakdown(state.latestFiling);
    const hasData = Object.values(breakdown).some(v => v > 0 && !isNaN(v));
    if (hasData) {
      state.charts.donut = buildRevenueDonut(donutCtx, breakdown);
    } else {
      document.getElementById('chart-donut').parentElement.innerHTML =
        '<div class="no-data-msg">Revenue breakdown data not available for this filing type.</div>';
    }
  }
}

// ── Shock Simulator ───────────────────────────────────────────────────────────
function initShockSimulator() {
  const shockTypeEl = document.getElementById('shock-type');
  const magnitudeEl = document.getElementById('shock-magnitude');
  const magnitudeValEl = document.getElementById('shock-magnitude-val');
  const durationEl = document.getElementById('shock-duration');
  const durationValEl = document.getElementById('shock-duration-val');

  // Populate shock type options
  shockTypeEl.innerHTML = Object.entries(SHOCK_TYPES).map(([key, v]) =>
    `<option value="${key}">${v.icon} ${v.label}</option>`).join('');

  // Live labels
  magnitudeEl.addEventListener('input', () => {
    magnitudeValEl.textContent = `${magnitudeEl.value}%`;
    runShock();
  });
  durationEl.addEventListener('input', () => {
    durationValEl.textContent = `${durationEl.value} year${durationEl.value > 1 ? 's' : ''}`;
    runShock();
  });
  shockTypeEl.addEventListener('change', () => {
    updateShockDescription();
    runShock();
  });

  updateShockDescription();
  runShock();
}

function updateShockDescription() {
  const type = document.getElementById('shock-type').value;
  const shock = SHOCK_TYPES[type];
  if (shock) {
    document.getElementById('shock-type-desc').textContent = shock.description;
  }
}

function runShock() {
  if (!state.latestFiling) return;

  const shockType = document.getElementById('shock-type').value;
  const magnitude = parseInt(document.getElementById('shock-magnitude').value) / 100;
  const duration = parseInt(document.getElementById('shock-duration').value);

  const result = runShockSimulation(state.latestFiling, shockType, magnitude, duration);
  state.shockResult = result;
  renderShockResults(result);
}

function renderShockResults(result) {
  // Score delta
  const deltaEl = document.getElementById('shock-score-delta');
  const delta = result.scoreDelta;
  deltaEl.textContent = delta >= 0 ? `+${delta}` : String(delta);
  deltaEl.className = delta >= 0 ? 'delta-positive' : 'delta-negative';

  document.getElementById('shock-score-before').textContent = result.baseScore;
  document.getElementById('shock-score-after').textContent = result.shockedScore;

  // Runway
  const runwayEl = document.getElementById('shock-runway');
  if (result.runwayMonths !== null) {
    runwayEl.textContent = result.runwayMonths < 0.5
      ? 'Immediate insolvency risk'
      : `${result.runwayMonths.toFixed(1)} months`;
    runwayEl.className = result.runwayMonths < 3 ? 'runway-critical' : result.runwayMonths < 12 ? 'runway-warning' : 'runway-ok';
  } else {
    runwayEl.textContent = 'Sustainable';
    runwayEl.className = 'runway-ok';
  }

  // Annual deficit/surplus
  const deficitEl = document.getElementById('shock-deficit');
  deficitEl.textContent = formatDollars(result.annualDeficit);
  deficitEl.className = result.annualDeficit >= 0 ? 'delta-positive' : 'delta-negative';

  // Recovery chart
  if (state.charts.shock) state.charts.shock.destroy();
  const shockCtx = document.getElementById('chart-shock');
  if (shockCtx) {
    state.charts.shock = buildShockChart(shockCtx, result);
  }
}

// ── Grant Impact Modeler ──────────────────────────────────────────────────────
function initGrantModeler() {
  const grantTypeEl = document.getElementById('grant-type');
  const grantAmountEl = document.getElementById('grant-amount');

  grantTypeEl.innerHTML = Object.entries(GRANT_TYPES).map(([key, v]) =>
    `<option value="${key}">${v.icon} ${v.label}</option>`).join('');

  grantTypeEl.addEventListener('change', runGrant);
  grantAmountEl.addEventListener('input', runGrant);

  // Format amount on blur
  grantAmountEl.addEventListener('blur', () => {
    const val = parseGrantAmount(grantAmountEl.value);
    if (val > 0) grantAmountEl.value = val.toLocaleString();
  });

  runGrant();
}

function parseGrantAmount(str) {
  return parseInt(String(str).replace(/[^0-9]/g, '')) || 0;
}

function runGrant() {
  if (!state.latestFiling) return;

  const grantType = document.getElementById('grant-type').value;
  const grantAmount = parseGrantAmount(document.getElementById('grant-amount').value);

  if (grantAmount <= 0) return;

  const result = runGrantSimulation(state.latestFiling, grantAmount, grantType);
  state.grantResult = result;
  renderGrantResults(result);
}

function renderGrantResults(result) {
  // Score delta
  const deltaEl = document.getElementById('grant-score-delta');
  const delta = result.scoreDelta;
  deltaEl.textContent = delta >= 0 ? `+${delta}` : String(delta);
  deltaEl.className = delta >= 0 ? 'delta-positive' : 'delta-negative';

  document.getElementById('grant-score-before').textContent = result.baseScore;
  document.getElementById('grant-score-after').textContent = result.boostedScore;

  // Runway added
  const runwayEl = document.getElementById('grant-runway-added');
  runwayEl.textContent = result.runwayAdded > 0
    ? `+${result.runwayAdded.toFixed(1)} months`
    : `${result.runwayAdded.toFixed(1)} months`;
  runwayEl.className = result.runwayAdded >= 0 ? 'delta-positive' : 'delta-negative';

  // 3-year net assets
  document.getElementById('grant-3yr-assets').textContent = formatDollars(result.netAssets3yr);

  // Concentration change
  const concEl = document.getElementById('grant-concentration');
  const concDelta = result.concentrationChange * 100;
  concEl.textContent = `${concDelta >= 0 ? '+' : ''}${concDelta.toFixed(1)}%`;
  concEl.className = concDelta <= 0 ? 'delta-positive' : 'delta-negative';

  // Annual cash flow impact
  document.getElementById('grant-annual-impact').textContent = formatDollars(result.annualSurplus);

  // Comparison chart
  if (state.charts.grant) state.charts.grant.destroy();
  const grantCtx = document.getElementById('chart-grant');
  if (grantCtx) {
    state.charts.grant = buildGrantComparisonChart(grantCtx, result.baseMetrics, result.boostedMetrics);
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────
function getNTEEIcon(code) {
  if (!code) return '🏢';
  const major = code[0];
  const icons = {
    A: '🎭', B: '📚', C: '🌿', D: '🐾', E: '🏥', F: '🧠', G: '🔬',
    H: '🔬', I: '⚖️', J: '💼', K: '🍽️', L: '🏠', M: '🛡️', N: '⚽',
    O: '👥', P: '❤️', Q: '🌍', R: '✊', S: '🤝', T: '💰', U: '🔭',
    V: '🧩', W: '🏛️', X: '✝️', Y: '🏊', Z: '🔷',
  };
  return icons[major.toUpperCase()] || '🏢';
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} toast-show`;
  setTimeout(() => { toast.className = 'toast'; }, 4000);
}

// ── Initialize ────────────────────────────────────────────────────────────────
function init() {
  // Search form
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');

  const doSearch = () => handleSearch(searchInput.value);

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // Example searches
  document.querySelectorAll('.example-search').forEach(btn => {
    btn.addEventListener('click', () => {
      searchInput.value = btn.dataset.query;
      handleSearch(btn.dataset.query);
    });
  });

  // Back button
  document.getElementById('btn-back-to-search').addEventListener('click', () => {
    showView('view-search');
  });

  // Tab navigation in dashboard
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(`tab-${btn.dataset.tab}`);
      if (panel) panel.classList.add('active');
      // Initialize simulators when tabs are opened for the first time
      if (btn.dataset.tab === 'shock' && !state.shockInitialized) {
        initShockSimulator();
        state.shockInitialized = true;
      }
      if (btn.dataset.tab === 'grant' && !state.grantInitialized) {
        initGrantModeler();
        state.grantInitialized = true;
      }
    });
  });

  showView('view-search');
}

document.addEventListener('DOMContentLoaded', init);

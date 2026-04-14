/**
 * charts.js — Chart.js chart builders
 * Assumes Chart.js is loaded globally via CDN.
 */

// Color palette
const COLORS = {
  gold: '#F5A623',
  teal: '#00BFA5',
  red: '#FF6B6B',
  purple: '#9B59B6',
  blue: '#4A90D9',
  green: '#2ECC71',
  gridLine: 'rgba(255,255,255,0.06)',
  text: 'rgba(255,255,255,0.6)',
  white: 'rgba(255,255,255,0.9)',
};

const CHART_DEFAULTS = {
  color: COLORS.text,
  borderColor: COLORS.gridLine,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  animation: {
    duration: 750,
    easing: 'easeOutQuart',
  },
  plugins: {
    legend: {
      position: 'top',
      labels: { color: COLORS.white, font: { family: 'Inter', size: 12 }, padding: 16 },
    },
    tooltip: {
      backgroundColor: 'rgba(15,20,40,0.95)',
      borderColor: 'rgba(245,166,35,0.3)',
      borderWidth: 1,
      titleColor: COLORS.gold,
      bodyColor: COLORS.white,
      padding: 12,
      cornerRadius: 8,
    },
  },
};

function applyDefaults(config) {
  const options = config.options || {};
  options.responsive = true;
  options.maintainAspectRatio = false;
  options.animation = { ...CHART_DEFAULTS.animation, ...(options.animation || {}) };
  options.interaction = { ...CHART_DEFAULTS.interaction, ...(options.interaction || {}) };
  options.plugins = { ...CHART_DEFAULTS.plugins, ...(options.plugins || {}) };
  if (options.plugins.legend === undefined) options.plugins.legend = CHART_DEFAULTS.plugins.legend;
  config.options = options;
  return config;
}

/**
 * 7-year financial trend (Revenue / Expenses / Net Assets)
 */
export function buildTrendChart(ctx, filings) {
  const labels = filings.map(f => String(f.year));
  const revenue = filings.map(f => f.totalRevenue);
  const expenses = filings.map(f => f.totalExpenses);
  const netAssets = filings.map(f => f.netAssets);

  return new Chart(ctx, applyDefaults({
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Total Revenue',
          data: revenue,
          borderColor: COLORS.teal,
          backgroundColor: 'rgba(0,191,165,0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: COLORS.teal,
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Total Expenses',
          data: expenses,
          borderColor: COLORS.gold,
          backgroundColor: 'rgba(245,166,35,0.06)',
          borderWidth: 2.5,
          pointBackgroundColor: COLORS.gold,
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Net Assets',
          data: netAssets,
          borderColor: COLORS.blue,
          backgroundColor: 'rgba(74,144,217,0.06)',
          borderWidth: 2,
          pointBackgroundColor: COLORS.blue,
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.3,
          fill: false,
          borderDash: [5, 3],
        },
      ],
    },
    options: {
      scales: {
        x: {
          grid: { color: COLORS.gridLine },
          ticks: { color: COLORS.text, font: { family: 'Inter', size: 11 } },
        },
        y: {
          grid: { color: COLORS.gridLine },
          ticks: {
            color: COLORS.text,
            font: { family: 'Inter', size: 11 },
            callback: v => formatAxisDollars(v),
          },
        },
      },
    },
  }));
}

/**
 * Revenue breakdown doughnut
 */
export function buildRevenueDonut(ctx, breakdown) {
  const labels = ['Contributions & Grants', 'Govt Grants', 'Program Revenue', 'Investment', 'Other'];
  const data = [
    breakdown.contributions,
    breakdown.govtGrants,
    breakdown.programRevenue,
    breakdown.investmentIncome,
    breakdown.other,
  ];

  // Filter out zeros for cleaner display
  const filtered = labels.map((l, i) => ({ label: l, value: data[i] })).filter(d => d.value > 0);

  return new Chart(ctx, applyDefaults({
    type: 'doughnut',
    data: {
      labels: filtered.map(d => d.label),
      datasets: [{
        data: filtered.map(d => d.value),
        backgroundColor: [
          'rgba(0,191,165,0.8)',
          'rgba(245,166,35,0.8)',
          'rgba(74,144,217,0.8)',
          'rgba(155,89,182,0.8)',
          'rgba(100,116,139,0.8)',
        ],
        borderColor: 'rgba(15,20,40,0.6)',
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      cutout: '65%',
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          ...CHART_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${formatAxisDollars(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  }));
}

/**
 * Shock simulation recovery curve
 */
export function buildShockChart(ctx, result) {
  const baseline = result.revenueByYear.map(() => result.revenueByYear[0]);

  return new Chart(ctx, applyDefaults({
    type: 'line',
    data: {
      labels: result.years,
      datasets: [
        {
          label: 'Projected Revenue',
          data: result.revenueByYear,
          borderColor: COLORS.teal,
          backgroundColor: 'rgba(0,191,165,0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Projected Expenses',
          data: result.expensesByYear,
          borderColor: COLORS.red,
          backgroundColor: 'rgba(255,107,107,0.06)',
          borderWidth: 2.5,
          pointRadius: 4,
          tension: 0.3,
          fill: false,
        },
        {
          label: 'Net Assets',
          data: result.netAssetsByYear,
          borderColor: COLORS.gold,
          backgroundColor: 'rgba(245,166,35,0.06)',
          borderWidth: 2,
          pointRadius: 4,
          tension: 0.2,
          fill: false,
          borderDash: [5, 3],
        },
      ],
    },
    options: {
      scales: {
        x: {
          grid: { color: COLORS.gridLine },
          ticks: { color: COLORS.text, font: { family: 'Inter', size: 11 } },
        },
        y: {
          grid: { color: COLORS.gridLine },
          ticks: {
            color: COLORS.text,
            font: { family: 'Inter', size: 11 },
            callback: v => formatAxisDollars(v),
          },
        },
      },
    },
  }));
}

/**
 * Grant impact comparison bar
 */
export function buildGrantComparisonChart(ctx, baseMetrics, boostedMetrics) {
  const metricsMeta = [
    { key: 'monthsOfCash', label: 'Cash (months)', scale: 1 },
    { key: 'operatingMargin', label: 'Op. Margin %', scale: 100 },
    { key: 'currentRatio', label: 'Current Ratio', scale: 10 },
  ];

  const labels = metricsMeta.map(m => m.label);
  const baseVals = metricsMeta.map(m => {
    const v = baseMetrics[m.key];
    return v !== null && v !== undefined ? parseFloat((v * m.scale).toFixed(2)) : 0;
  });
  const boostedVals = metricsMeta.map(m => {
    const v = boostedMetrics[m.key];
    return v !== null && v !== undefined ? parseFloat((v * m.scale).toFixed(2)) : 0;
  });

  return new Chart(ctx, applyDefaults({
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Before Grant',
          data: baseVals,
          backgroundColor: 'rgba(100,116,139,0.6)',
          borderColor: 'rgba(100,116,139,0.9)',
          borderWidth: 1,
          borderRadius: 6,
        },
        {
          label: 'After Grant',
          data: boostedVals,
          backgroundColor: 'rgba(0,191,165,0.7)',
          borderColor: COLORS.teal,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: COLORS.text, font: { family: 'Inter', size: 11 } },
        },
        y: {
          grid: { color: COLORS.gridLine },
          ticks: { color: COLORS.text, font: { family: 'Inter', size: 11 } },
        },
      },
    },
  }));
}

function formatAxisDollars(v) {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
}

const { useState, useEffect, useMemo, useRef } = React;

const formatCurrency = (val) => (val === null || val === undefined) ? 'N/A' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
const formatPercent = (val) => (val === null || val === undefined) ? 'N/A' : new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(val);

function StatCard({ label, value, trend, isPositive, prefix = '', suffix = '' }) {
  return (
    <div className="glass-panel kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{prefix}{value}{suffix}</div>
      {trend && (
        <div className={`kpi-trend ${isPositive ? 'trend-up' : 'trend-down'}`}>
          {isPositive ? '↗' : '↘'} {trend}
        </div>
      )}
    </div>
  );
}

function GlobalDashboard({ db, onSelectOrg }) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const orgs = useMemo(() => Object.values(db), [db]);

  // Compute hidden gems: orgs that are 'Resilient' but small/medium size
  const hiddenGems = useMemo(() => {
    return orgs
      .filter(o => o.is_hidden_gem === 'True')
      .sort((a, b) => (b.hidden_gem_score || 0) - (a.hidden_gem_score || 0))
      .slice(0, 10);
  }, [orgs]);

  // High Risk Orgs
  const highRisk = useMemo(() => {
    return orgs
      .filter(o => o.resilience_label === 'Critical')
      .sort((a, b) => (a.months_of_cash || 0) - (b.months_of_cash || 0))
      .slice(0, 5);
  }, [orgs]);

  // Search Results
  const searchResults = useMemo(() => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    return orgs.filter(o => 
      o.name.toLowerCase().includes(term) || 
      (o.ein && o.ein.includes(term))
    ).slice(0, 15);
  }, [searchTerm, orgs]);

  return (
    <div className="animate-fade-in">
      <h1 className="page-title">Welcome to FundFlow NextGen</h1>
      <p className="page-subtitle">Powered by ML Resilience Models & IRS 990 Data</p>
      
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
        <div className="search-container" style={{ width: '100%' }}>
          <span className="search-icon">🔍</span>
          <input 
            type="text"
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search thousands of organizations by name or EIN..." 
          />
        </div>
        
        {searchTerm && searchResults.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <table className="data-table">
              <thead><tr><th>Organization</th><th>State</th><th>Resilience</th><th>Latest YR</th></tr></thead>
              <tbody>
                {searchResults.map(org => (
                  <tr key={org.ein} onClick={() => onSelectOrg(org)}>
                    <td style={{ fontWeight: 600 }}>{org.name} <br/><span style={{ fontSize:'0.8rem', color:'var(--text-muted)'}}>EIN: {org.ein}</span></td>
                    <td>{org.state}</td>
                    <td>
                      <span className={`badge badge-${(org.resilience_label || 'Unknown').toLowerCase().replace(' ', '-')}`}>
                        {org.resilience_label || 'Unknown'}
                      </span>
                    </td>
                    <td>{org.latest_year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-teal)' }}>💎</span> Top Hidden Gems
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
            Highly resilient organizations with strong program revenue autonomy.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Revenue</th>
                <th>Prog. Ratio</th>
              </tr>
            </thead>
            <tbody>
              {hiddenGems.map(org => (
                <tr key={org.ein} onClick={() => onSelectOrg(org)}>
                  <td style={{ fontWeight: 500 }}>{org.name}</td>
                  <td>{formatCurrency(org.latest_revenue)}</td>
                  <td style={{ color: 'var(--accent-teal)' }}>{formatPercent(org.program_revenue_ratio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-red)' }}>⚠️</span> Critical Funding Risk
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '16px', fontSize: '0.9rem' }}>
            Organizations highly dependent on grants with concentrated revenue streams.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Months Cash</th>
                <th>Shock Class</th>
              </tr>
            </thead>
            <tbody>
              {highRisk.map(org => (
                <tr key={org.ein} onClick={() => onSelectOrg(org)}>
                  <td style={{ fontWeight: 500 }}>{org.name}</td>
                  <td style={{ color: 'var(--accent-red)' }}>{org.months_of_cash != null ? org.months_of_cash.toFixed(1) + ' mo' : 'N/A'}</td>
                  <td style={{ fontSize: '0.8rem' }}>{org.shock_recovery_class}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OrgChart({ filings }) {
  const chartRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !filings || filings.length === 0) return;
    
    // Reverse filings to go from oldest to newest for chart left-to-right
    const sorted = [...filings].sort((a,b) => (a.tax_prd_yr || 0) - (b.tax_prd_yr || 0));
    
    const labels = sorted.map(f => f.tax_prd_yr);
    const revenues = sorted.map(f => f.totrevenue != null ? f.totrevenue : null);
    const expenses = sorted.map(f => f.totfuncexpns != null ? f.totfuncexpns : null);

    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext('2d');
    
    // Gradients
    const revGrad = ctx.createLinearGradient(0,0,0,300);
    revGrad.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
    revGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Revenue',
            data: revenues,
            borderColor: '#00F0FF',
            backgroundColor: revGrad,
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#00F0FF'
          },
          {
            label: 'Total Expenses',
            data: expenses,
            borderColor: '#FF3366',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.4,
            pointBackgroundColor: '#FF3366'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#9BA1A6' } },
        },
        scales: {
          y: { 
            grid: { color: 'rgba(255, 255, 255, 0.05)' }, 
            ticks: { color: '#9BA1A6', callback: (val) => '$' + (val/1e6).toFixed(1) + 'M' }
          },
          x: { 
            grid: { display: false }, 
            ticks: { color: '#9BA1A6' } 
          }
        }
      }
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [filings]);

  return (
    <div className="chart-container">
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}

function ShockSimulator({ org }) {
  const [shockType, setShockType] = useState('Revenue Loss');
  const [magnitude, setMagnitude] = useState(40);
  const [duration, setDuration] = useState(2);
  const chartRef = useRef(null);
  const canvasRef = useRef(null);

  // Baseline extraction from latest filing
  const baselineRev = org.latest_revenue || 0;
  const baselineExpenses = baselineRev * (1 - (org.operating_margin || 0));
  
  // Starting Net Assets derived from months_of_cash
  const monthlyExpenses = baselineExpenses / 12;
  const startingNetAssets = (org.months_of_cash || 0) * monthlyExpenses;

  // Run 5 year Simulation
  const labels = ['Current', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
  const revData = [baselineRev];
  const expData = [baselineExpenses];
  const netAssetData = [startingNetAssets];

  let currentAssets = startingNetAssets;
  let exhaustedYear = null;

  for (let i = 1; i <= 5; i++) {
     let yearRev = baselineRev;
     let yearExp = baselineExpenses;

     if (i <= duration) {
        // Apply Shock
        if (shockType === 'Revenue Loss') yearRev = baselineRev * (1 - magnitude/100);
        else if (shockType === 'Grant Elimination') {
            const grantDep = org.grant_dependency || 0;
            yearRev = baselineRev - (baselineRev * grantDep * (magnitude/100));
        }
        else if (shockType === 'Expense Surge') yearExp = baselineExpenses * (1 + magnitude/100);
     } else {
        // Recovery Period (2 years)
        const totalRecoveryYears = 2;
        const yearsAfterShock = i - duration;
        
        let targetRev = baselineRev;
        let targetExp = baselineExpenses;
        
        if (yearsAfterShock <= totalRecoveryYears) {
           // Interpolate 
           const ratio = yearsAfterShock / totalRecoveryYears;
           if (shockType === 'Revenue Loss') {
              const shockRev = baselineRev * (1 - magnitude/100);
              yearRev = shockRev + ((baselineRev - shockRev) * ratio);
           } else if (shockType === 'Grant Elimination') {
              const grantDep = org.grant_dependency || 0;
              const shockRev = baselineRev - (baselineRev * grantDep * (magnitude/100));
              yearRev = shockRev + ((baselineRev - shockRev) * ratio);
           } else if (shockType === 'Expense Surge') {
              const shockExp = baselineExpenses * (1 + magnitude/100);
              yearExp = shockExp - ((shockExp - baselineExpenses) * ratio);
           }
        }
     }
     
     revData.push(yearRev);
     expData.push(yearExp);
     
     const netFlow = yearRev - yearExp;
     currentAssets += netFlow;
     
     if (currentAssets < 0 && exhaustedYear === null) {
        exhaustedYear = i;
        currentAssets = 0; // cannot go below 0 realistically, implies bankruptcy
     }
     netAssetData.push(currentAssets);
  }

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (chartRef.current) chartRef.current.destroy();

    // Determine max values for scaling
    // Math.max on array requires destructuring, which is fine for small arrays
    
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Projected Net Assets',
            data: netAssetData,
            borderColor: '#00F0FF',
            backgroundColor: 'rgba(0, 240, 255, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.3
          },
          {
            label: 'Projected Revenue',
            data: revData,
            borderColor: '#4CAF50',
            borderWidth: 2,
            borderDash: [5,5],
            tension: 0.3
          },
          {
             label: 'Projected Expenses',
             data: expData,
             borderColor: '#FF3366',
             borderWidth: 2,
             borderDash: [5,5],
             tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9BA1A6' } } },
        scales: {
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9BA1A6', callback: (val) => '$' + (val/1e6).toFixed(1) + 'M' } },
          x: { grid: { display: false }, ticks: { color: '#9BA1A6' } }
        }
      }
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [shockType, magnitude, duration, org]);

  const postShockCashMonths = (netAssetData[duration] / monthlyExpenses) || 0;
  
  return (
    <div className="grid-2">
       <div className="glass-panel" style={{ padding: '24px' }}>
          <h3>Shock Parameters</h3>
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
             <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Shock Type</label>
                <select 
                   value={shockType} 
                   onChange={(e) => setShockType(e.target.value)}
                   style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '1rem' }}
                >
                   <option>Revenue Loss</option>
                   <option>Grant Elimination</option>
                   <option>Expense Surge</option>
                </select>
             </div>
             
             <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Magnitude ({magnitude}%)</label>
                <input 
                   type="range" min="10" max="80" step="5" value={magnitude}
                   onChange={e => setMagnitude(parseInt(e.target.value))}
                   style={{ width: '100%', accentColor: 'var(--accent-red)' }}
                />
             </div>

             <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Duration ({duration} Years)</label>
                <input 
                   type="range" min="1" max="3" step="1" value={duration}
                   onChange={e => setDuration(parseInt(e.target.value))}
                   style={{ width: '100%', accentColor: 'var(--accent-red)' }}
                />
             </div>
             
             <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', marginTop: '16px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Simulation Output</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600, color: exhaustedYear ? 'var(--accent-red)' : 'var(--accent-teal)', marginTop: '8px' }}>
                   {exhaustedYear ? `Runway Exhausted in Year ${exhaustedYear}` : 'Survives 5-Year Scenario'}
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                   Post-Shock Cash Reserve: {postShockCashMonths.toFixed(1)} months
                </div>
             </div>
          </div>
       </div>
       
       <div className="glass-panel" style={{ padding: '24px' }}>
          <h3>5-Year Recovery Curve</h3>
          <div style={{ height: '350px', marginTop: '20px' }}>
             <canvas ref={canvasRef}></canvas>
          </div>
       </div>
    </div>
  );
}

function GrantModeler({ org }) {
  const chartRef = useRef(null);
  const canvasRef = useRef(null);
  const [grantType, setGrantType] = useState('General Operating Support');

  const baselineRevenue = org.latest_revenue || 0;
  const baselineExpenses = baselineRevenue * (1 - (org.operating_margin || 0));
  const monthlyExpenses = baselineExpenses / 12;
  const startingNetAssets = (org.months_of_cash || 0) * monthlyExpenses;
  const baselineScore = org.resilience_score || 0;
  const grantDependency = org.grant_dependency || 0;
  const grantTypeProfiles = {
    'General Operating Support': { liquidityWeight: 1.0, revenueWeight: 1.0 },
    'Capacity Building': { liquidityWeight: 0.75, revenueWeight: 1.15 },
    'Program Restricted': { liquidityWeight: 0.55, revenueWeight: 0.9 }
  };
  const activeProfile = grantTypeProfiles[grantType] || grantTypeProfiles['General Operating Support'];

  // Simulate how an annual grant of `grantAmount` would affect the resilience score.
  // The curve is intentionally saturating so we can identify diminishing returns.
  const simulateScore = (grantAmount) => {
    const newRevenue = baselineRevenue + grantAmount;
    const newNetAssets = startingNetAssets + grantAmount;
    const newMonthsOfCash = monthlyExpenses > 0 ? newNetAssets / monthlyExpenses : 0;
    const runwayGain = Math.max(0, newMonthsOfCash - (org.months_of_cash || 0));
    const cashUplift = 30 * activeProfile.liquidityWeight * (1 - Math.exp(-runwayGain / 10));
    const revenuePctGain = baselineRevenue > 0 ? ((newRevenue / baselineRevenue) - 1) : 0;
    const revenueUplift = 18 * activeProfile.revenueWeight * (1 - Math.exp(-revenuePctGain * 2.5));
    const diversityBonus = grantDependency < 0.5 ? 5 : 0;
    return Math.min(baselineScore + cashUplift + revenueUplift + diversityBonus, 100);
  };

  const THRESHOLD = 75; // "Strong" threshold per the spec
  const steps = [];
  for (let g = 10000; g <= 500000; g += 10000) steps.push(g);
  const scores = steps.map(simulateScore);
  const improvements = scores.map(score => score - baselineScore);

  // Find minimum effective grant (first amount that crosses 75)
  const effectiveIdx = scores.findIndex(s => s >= THRESHOLD);
  const effectiveGrant = effectiveIdx >= 0 ? steps[effectiveIdx] : null;
  const incrementalGains = improvements.map((val, idx) => idx === 0 ? val : val - improvements[idx - 1]);
  const diminishingIdx = incrementalGains.findIndex((gain, idx) => idx > 0 && gain < 0.5);
  const diminishingGrant = diminishingIdx >= 0 ? steps[diminishingIdx] : null;
  const steepestIdx = incrementalGains.reduce((best, gain, idx, arr) => {
    if (idx === 0 || idx === arr.length - 1) return best;
    return gain > arr[best] ? idx : best;
  }, 1);
  const steepestGrant = steps[steepestIdx];
  const steepestGain = incrementalGains[steepestIdx];

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (chartRef.current) chartRef.current.destroy();

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, 320);
    grad.addColorStop(0, 'rgba(157, 78, 221, 0.45)');
    grad.addColorStop(1, 'rgba(157, 78, 221, 0)');

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: steps.map(s => '$' + (s / 1000).toFixed(0) + 'K'),
        datasets: [
          {
            label: 'Resilience Score Improvement',
            data: improvements,
            borderColor: '#9D4EDD',
            backgroundColor: grad,
            borderWidth: 2.5,
            fill: true,
            tension: 0.45,
            pointRadius: 0,
            pointHitRadius: 8,
          },
          // Threshold reference line
          {
            label: 'Strong Threshold (75)',
            data: steps.map(() => THRESHOLD - baselineScore),
            borderColor: 'rgba(255, 183, 3, 0.7)',
            borderWidth: 1.5,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
          },
          // Effective grant vertical indicator (single point)
          ...(effectiveGrant ? [{
            label: `Min Effective Grant (${formatCurrency(effectiveGrant)})`,
            data: steps.map((s, i) => (i === effectiveIdx ? improvements[effectiveIdx] : null)),
            borderColor: '#00F0FF',
            backgroundColor: '#00F0FF',
            borderWidth: 0,
            pointRadius: steps.map((s, i) => (i === effectiveIdx ? 8 : 0)),
            pointHoverRadius: 10,
            fill: false,
            showLine: false,
          }] : [])
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#9BA1A6', usePointStyle: true, pointStyleWidth: 10 } },
          tooltip: {
            callbacks: {
              title: (items) => `Grant Size: ${items[0].label}`,
              label: (item) => {
                if (item.datasetIndex === 0) return ` Score Improvement: +${item.parsed.y.toFixed(1)} points`;
                if (item.datasetIndex === 1) return ` Improvement needed for 75: +${(THRESHOLD - baselineScore).toFixed(1)}`;
                return ` Optimal Grant Point`;
              }
            },
            backgroundColor: 'rgba(11, 14, 20, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            titleColor: '#F8F9FA',
            bodyColor: '#9BA1A6',
          }
        },
        scales: {
          y: {
            min: 0,
            max: Math.max(10, Math.ceil((Math.max(...improvements, THRESHOLD - baselineScore) + 2) / 2) * 2),
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#9BA1A6', callback: val => `+${val.toFixed(0)}` }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#9BA1A6', maxTicksLimit: 10 },
          }
        }
      }
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [org, grantType]);

  const postGrantScore = effectiveGrant ? simulateScore(effectiveGrant) : baselineScore;

  // --- Grant Impact Analysis metrics ---
  const recommendedGrant = effectiveGrant;
  const scoreImprovement = recommendedGrant ? (postGrantScore - baselineScore) : 0;

  // Runway added: extra months of cash from the grant
  const baselineMonths = org.months_of_cash || 0;
  const postGrantNetAssets = startingNetAssets + (recommendedGrant || 0);
  const postGrantMonths = monthlyExpenses > 0 ? postGrantNetAssets / monthlyExpenses : baselineMonths;
  const runwayAdded = postGrantMonths - baselineMonths;

  // 3-year net asset projection with the recommended grant applied annually
  const annualNetFlow = (baselineRevenue + (recommendedGrant || 0)) - baselineExpenses;
  const yr1Assets = startingNetAssets + annualNetFlow;
  const yr2Assets = yr1Assets + annualNetFlow;
  const yr3Assets = yr2Assets + annualNetFlow;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top row: Analysis panel + Chart */}
      <div className="grid-2">
        {/* Left: Sizing info */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <h3>Grant Sizing Analysis</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.6' }}>
            Iterates grant amounts from <strong style={{ color: 'var(--text-primary)' }}>$10K → $500K</strong> in steps,
            running the resilience simulation at each point to find the minimum grant that lifts the
            score above the <strong style={{ color: 'var(--accent-gold)' }}>Strong threshold (75)</strong>.
            Outputs both the catalytic threshold and the diminishing-returns inflection.
          </p>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Grant Type</label>
            <select
              value={grantType}
              onChange={(e) => setGrantType(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
            >
              {Object.keys(grantTypeProfiles).map(type => <option key={type}>{type}</option>)}
            </select>
          </div>

          {/* Baseline */}
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Baseline Resilience Score</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: baselineScore >= THRESHOLD ? 'var(--accent-green)' : baselineScore >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
              {baselineScore.toFixed(1)}
            </div>
            <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {org.resilience_label || 'Unknown'} · {formatPercent(org.grant_dependency)} grant-dependent
            </div>
          </div>

          {/* Catalytic grant */}
          <div style={{ background: recommendedGrant ? 'rgba(0,240,255,0.05)' : 'rgba(255,51,102,0.05)', border: `1px solid ${recommendedGrant ? 'rgba(0,240,255,0.2)' : 'rgba(255,51,102,0.2)'}`, padding: '16px', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Catalytic Grant Size</div>
            {recommendedGrant ? (
              <>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-teal)' }}>{formatCurrency(recommendedGrant)}</div>
                <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Minimum grant to reach score ≥ 75 · post-grant: <span style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>{postGrantScore.toFixed(1)}</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--accent-red)' }}>Not achievable within $500K</div>
                <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Structural issues require intervention beyond grant funding.</div>
              </>
            )}
          </div>

          {/* Diminishing returns note */}
          <div style={{ background: 'rgba(157,78,221,0.05)', border: '1px solid rgba(157,78,221,0.15)', padding: '14px 16px', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--accent-purple)', fontWeight: 600, marginBottom: '4px' }}>📉 Diminishing Returns</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.55' }}>
              {diminishingGrant
                ? `After about ${formatCurrency(diminishingGrant)}, each additional $10K adds less than 0.5 score points.`
                : 'No clear diminishing-return inflection appears before $500K for this organization.'}
            </div>
          </div>
        </div>

        {/* Right: Chart */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '6px' }}>Catalytic Grant Sizing Curve</h3>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Resilience improvement vs. annual grant amount — hover for details
          </p>
          <div style={{ height: '340px' }}>
            <canvas ref={canvasRef}></canvas>
          </div>
        </div>
      </div>

      {/* Bottom: Grant Impact Analysis */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '4px' }}>Grant Impact Analysis</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Projected outcomes if <strong style={{ color: 'var(--accent-teal)' }}>{recommendedGrant ? formatCurrency(recommendedGrant) : 'the recommended grant'}</strong> is applied annually.
          </p>
        </div>

        <div className="grid-4" style={{ gap: '16px' }}>
          {/* 1: Recommended Grant */}
          <div style={{ background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.15)', borderRadius: '10px', padding: '18px' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Recommended Grant</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent-teal)', lineHeight: 1.1 }}>
              {recommendedGrant ? formatCurrency(recommendedGrant) : '—'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              From catalytic curve · minimum to cross Strong threshold
            </div>
          </div>

          {/* 2: Expected Score Improvement */}
          <div style={{ background: 'rgba(0,230,118,0.04)', border: '1px solid rgba(0,230,118,0.15)', borderRadius: '10px', padding: '18px' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Score Improvement</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent-green)', lineHeight: 1.1 }}>
              {scoreImprovement > 0 ? `+${scoreImprovement.toFixed(1)}` : '—'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {baselineScore.toFixed(1)} → {postGrantScore.toFixed(1)} resilience score
            </div>
          </div>

          {/* 3: Runway Added */}
          <div style={{ background: 'rgba(255,183,3,0.04)', border: '1px solid rgba(255,183,3,0.15)', borderRadius: '10px', padding: '18px' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Runway Added</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent-gold)', lineHeight: 1.1 }}>
              {recommendedGrant ? `+${runwayAdded.toFixed(1)} mo` : '—'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {baselineMonths.toFixed(1)} mo → {postGrantMonths.toFixed(1)} mo cash runway
            </div>
          </div>

          {/* 4: Leverage signal */}
          <div style={{ background: 'rgba(157,78,221,0.04)', border: '1px solid rgba(157,78,221,0.15)', borderRadius: '10px', padding: '18px' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Steepest Improvement Segment</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent-purple)', lineHeight: 1.1 }}>
              {formatCurrency(steepestGrant)}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              {grantType} has the highest modeled marginal lift near this point: +{steepestGain.toFixed(2)} per $10K step
            </div>
          </div>
        </div>

        <div style={{ marginTop: '14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          3-Year Net Asset projection with recommended grant: Yr 1 {formatCurrency(yr1Assets)} · Yr 2 {formatCurrency(yr2Assets)} · Yr 3 {formatCurrency(yr3Assets)}
        </div>
      </div>
    </div>
  );
}

function FunderBrief({ org }) {
  const [analystNotes, setAnalystNotes] = useState('');

  const baselineRev = org.latest_revenue || 0;
  const baselineExpenses = baselineRev * (1 - (org.operating_margin || 0));
  const monthlyExpenses = baselineExpenses / 12;
  const startingNetAssets = (org.months_of_cash || 0) * monthlyExpenses;
  const baselineScore = org.resilience_score || 0;
  const grantDependency = org.grant_dependency || 0;
  const yearsAvailable = (org.filings || []).length;

  const getBand = (s) => s >= 75 ? 'Strong' : s >= 50 ? 'Moderate' : 'At Risk';
  const ragColor = (rag) => rag === 'green' ? '#16a34a' : rag === 'yellow' ? '#b45309' : '#dc2626';
  const ragBg   = (rag) => rag === 'green' ? '#dcfce7' : rag === 'yellow' ? '#fef3c7' : '#fee2e2';
  const ragLabel = (rag) => rag === 'green' ? 'STRONG' : rag === 'yellow' ? 'MODERATE' : 'AT RISK';

  const metrics = [
    { name: 'Resilience Score',   value: baselineScore.toFixed(1),             sub: getBand(baselineScore),
      rag: baselineScore >= 75 ? 'green' : baselineScore >= 50 ? 'yellow' : 'red' },
    { name: 'Cash Runway',        value: org.months_of_cash != null ? org.months_of_cash.toFixed(1) + ' mo' : 'N/A',
      sub: (org.months_of_cash || 0) >= 6 ? 'Adequate' : (org.months_of_cash || 0) >= 3 ? 'Limited' : 'Critical',
      rag: (org.months_of_cash || 0) >= 6 ? 'green' : (org.months_of_cash || 0) >= 3 ? 'yellow' : 'red' },
    { name: 'Operating Margin',   value: formatPercent(org.operating_margin),
      sub: (org.operating_margin || 0) >= 0.05 ? 'Healthy' : (org.operating_margin || 0) >= 0 ? 'Break-even' : 'Deficit',
      rag: (org.operating_margin || 0) >= 0.05 ? 'green' : (org.operating_margin || 0) >= 0 ? 'yellow' : 'red' },
    { name: 'Grant Dependency',   value: formatPercent(org.grant_dependency),
      sub: (org.grant_dependency || 0) <= 0.3 ? 'Diversified' : (org.grant_dependency || 0) <= 0.6 ? 'Moderate' : 'Concentrated',
      rag: (org.grant_dependency || 0) <= 0.3 ? 'green' : (org.grant_dependency || 0) <= 0.6 ? 'yellow' : 'red' },
    { name: 'Program Rev. Ratio', value: formatPercent(org.program_revenue_ratio),
      sub: (org.program_revenue_ratio || 0) >= 0.5 ? 'Strong' : (org.program_revenue_ratio || 0) >= 0.2 ? 'Moderate' : 'Weak',
      rag: (org.program_revenue_ratio || 0) >= 0.5 ? 'green' : (org.program_revenue_ratio || 0) >= 0.2 ? 'yellow' : 'red' },
  ];

  // Worst-case shock: 40% Revenue Loss for 2 years
  let shockAssets = startingNetAssets;
  let exhaustedYear = null;
  for (let i = 1; i <= 5; i++) {
    const yearRev = i <= 2 ? baselineRev * 0.6 : baselineRev;
    shockAssets += (yearRev - baselineExpenses);
    if (shockAssets < 0 && exhaustedYear === null) { exhaustedYear = i; shockAssets = 0; }
  }
  const postShockRunway = monthlyExpenses > 0 ? shockAssets / monthlyExpenses : 0;

  // Grant impact (same model as GrantModeler, General Operating Support profile)
  const THRESHOLD = 75;
  const simulateGrantScore = (grantAmount) => {
    const newMonthsOfCash = monthlyExpenses > 0 ? (startingNetAssets + grantAmount) / monthlyExpenses : 0;
    const runwayGain = Math.max(0, newMonthsOfCash - (org.months_of_cash || 0));
    const cashUplift = 30 * (1 - Math.exp(-runwayGain / 10));
    const revPctGain = baselineRev > 0 ? (grantAmount / baselineRev) : 0;
    const revenueUplift = 18 * (1 - Math.exp(-revPctGain * 2.5));
    const diversityBonus = grantDependency < 0.5 ? 5 : 0;
    return Math.min(baselineScore + cashUplift + revenueUplift + diversityBonus, 100);
  };
  const grantSteps = [];
  for (let g = 10000; g <= 500000; g += 10000) grantSteps.push(g);
  const effectiveIdx = grantSteps.findIndex(g => simulateGrantScore(g) >= THRESHOLD);
  const catalyticGrant = effectiveIdx >= 0 ? grantSteps[effectiveIdx] : null;
  const postGrantScore = catalyticGrant ? simulateGrantScore(catalyticGrant) : baselineScore;
  const scoreImprovement = postGrantScore - baselineScore;
  const postGrantMonths = catalyticGrant && monthlyExpenses > 0
    ? (startingNetAssets + catalyticGrant) / monthlyExpenses
    : (org.months_of_cash || 0);
  const runwayAdded = postGrantMonths - (org.months_of_cash || 0);
  const annualNetFlow = (baselineRev + (catalyticGrant || 0)) - baselineExpenses;
  const yr1 = startingNetAssets + annualNetFlow;
  const yr2 = yr1 + annualNetFlow;
  const yr3 = yr2 + annualNetFlow;

  const isHiddenGem = org.is_hidden_gem === 'True';
  const scoreRag = baselineScore >= 75 ? 'green' : baselineScore >= 50 ? 'yellow' : 'red';

  const sectionStyle = { marginBottom: '18px', pageBreakInside: 'avoid' };
  const sectionHeadStyle = {
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: '5px', marginBottom: '10px',
  };

  return (
    <div>
      {/* Action bar (hidden when printing) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <button
          onClick={() => window.print()}
          style={{ background: 'linear-gradient(135deg, #00F0FF 0%, #9D4EDD 100%)', border: 'none', color: '#000', padding: '10px 26px', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', letterSpacing: '0.03em' }}
        >
          Print / Export Brief
        </button>
      </div>

      {/* Brief document — white card on screen, full page when printed */}
      <div id="funder-brief" style={{ background: '#fff', color: '#1e293b', borderRadius: '12px', padding: '36px 40px', fontFamily: 'Georgia, serif', maxWidth: '860px', margin: '0 auto', boxShadow: '0 4px 40px rgba(0,0,0,0.4)' }}>

        {/* ── Header ── */}
        <div style={{ borderBottom: '3px solid #0f172a', paddingBottom: '14px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: '4px' }}>FundFlow NextGen · Funder Brief</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: '#0f172a', lineHeight: 1.2 }}>{org.name}</div>
            <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '5px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span>EIN: <strong>{org.ein}</strong></span>
              <span>NTEE: <strong>{org.ntee_code || 'N/A'}</strong></span>
              <span>{org.city}, {org.state}</span>
              <span>{yearsAvailable > 0 ? yearsAvailable + ' yrs of data' : 'Data N/A'} · Most recent: <strong>{org.latest_year || 'N/A'}</strong></span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ML Resilience</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: ragColor(scoreRag), lineHeight: 1 }}>{baselineScore.toFixed(1)}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: ragColor(scoreRag), background: ragBg(scoreRag), padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '3px' }}>{getBand(baselineScore).toUpperCase()}</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '3px' }}>{org.size_bucket || ''} · {org.peer_group || ''}</div>
          </div>
        </div>

        {/* ── Section 1: Resilience Snapshot ── */}
        <div style={sectionStyle}>
          <div style={sectionHeadStyle}>Resilience Snapshot</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
            {metrics.map(m => (
              <div key={m.name} style={{ border: `1px solid ${ragBg(m.rag)}`, background: ragBg(m.rag) + '88', borderRadius: '6px', padding: '9px 10px' }}>
                <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'Inter, sans-serif' }}>{m.name}</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'Outfit, sans-serif', color: '#0f172a', margin: '3px 0 2px' }}>{m.value}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: ragColor(m.rag), background: ragBg(m.rag), padding: '1px 5px', borderRadius: '3px', display: 'inline-block' }}>{ragLabel(m.rag)}</div>
                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '3px', fontFamily: 'Inter, sans-serif' }}>{m.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 2: Peer Context ── */}
        <div style={sectionStyle}>
          <div style={sectionHeadStyle}>Peer Context</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ color: '#64748b', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>Peer Group</div>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{org.peer_group || 'N/A'}</div>
              <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '2px' }}>Sector · Revenue Tier · Region</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ color: '#64748b', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>Benchmark Tier</div>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{org.benchmark_tier || 'N/A'}</div>
              <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '2px' }}>vs. peers in same cell</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ color: '#64748b', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>Income Diversity</div>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{org.income_diversity || 'N/A'}</div>
              <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: '2px' }}>Dominant: {org.dominant_stream || 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* ── Section 3: Shock Scenario Summary ── */}
        <div style={sectionStyle}>
          <div style={sectionHeadStyle}>Shock Scenario Summary — Worst Case (40% Revenue Loss · 2 Years)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>
            {[
              { label: 'Before Shock', value: baselineScore.toFixed(1), sub: 'Resilience score', accent: '#1d4ed8' },
              { label: 'After Shock', value: exhaustedYear ? `Yr ${exhaustedYear} exhausted` : postShockRunway.toFixed(1) + ' mo runway', sub: exhaustedYear ? 'Assets depleted' : 'Remaining runway', accent: exhaustedYear ? '#dc2626' : '#b45309' },
              { label: 'Shock Recovery', value: org.shock_recovery_class || 'N/A', sub: 'ML classification', accent: '#7c3aed' },
              { label: 'Revenue Exposure', value: formatCurrency(baselineRev * 0.4), sub: '40% of latest revenue', accent: '#dc2626' },
            ].map(item => (
              <div key={item.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>{item.label}</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', fontFamily: 'Outfit, sans-serif', color: item.accent }}>{item.value}</div>
                <div style={{ color: '#94a3b8', fontSize: '0.68rem', marginTop: '2px' }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 4: Grant Impact Analysis ── */}
        <div style={sectionStyle}>
          <div style={sectionHeadStyle}>Grant Impact Analysis — Catalytic Curve (General Operating Support)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>
            {[
              { label: 'Recommended Grant', value: catalyticGrant ? formatCurrency(catalyticGrant) : 'Not achievable', sub: 'Min. to reach Strong (75)', accent: '#0369a1' },
              { label: 'Score Improvement', value: scoreImprovement > 0 ? `+${scoreImprovement.toFixed(1)} pts` : '—', sub: `${baselineScore.toFixed(1)} → ${postGrantScore.toFixed(1)}`, accent: '#16a34a' },
              { label: 'Runway Added', value: catalyticGrant ? `+${runwayAdded.toFixed(1)} mo` : '—', sub: `${(org.months_of_cash || 0).toFixed(1)} → ${postGrantMonths.toFixed(1)} mo`, accent: '#b45309' },
              { label: '3-Year Net Asset Projection', value: catalyticGrant ? formatCurrency(yr3) : '—', sub: `Yr1 ${formatCurrency(yr1)} · Yr2 ${formatCurrency(yr2)}`, accent: '#7c3aed' },
            ].map(item => (
              <div key={item.label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ color: '#64748b', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>{item.label}</div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', fontFamily: 'Outfit, sans-serif', color: item.accent, lineHeight: 1.2 }}>{item.value}</div>
                <div style={{ color: '#94a3b8', fontSize: '0.68rem', marginTop: '3px' }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 5: Hidden Gem Flag ── */}
        <div style={{ ...sectionStyle, background: isHiddenGem ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isHiddenGem ? '#86efac' : '#e2e8f0'}`, borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ fontSize: '1.4rem', lineHeight: 1, marginTop: '2px' }}>{isHiddenGem ? '💎' : '—'}</div>
          <div style={{ fontFamily: 'Inter, sans-serif' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isHiddenGem ? '#16a34a' : '#64748b', marginBottom: '3px' }}>
              Hidden Gem Flag · {isHiddenGem ? 'QUALIFIES' : 'Does Not Qualify'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
              {isHiddenGem
                ? <>This organization qualifies as a <strong>catalytic investment opportunity</strong>. Program revenue ratio: {formatPercent(org.program_revenue_ratio)}, hidden gem score: {(org.hidden_gem_score || 0).toFixed(2)}. High autonomy and lean operations relative to revenue tier indicate resource-scarcity resilience.</>
                : <>Organization does not meet the Hidden Gem threshold. Program revenue ratio {formatPercent(org.program_revenue_ratio)} and current resilience profile did not trigger the efficiency + resource-scarcity flag.</>}
            </div>
          </div>
        </div>

        {/* ── Section 6: Analyst Notes ── */}
        <div style={sectionStyle}>
          <div style={sectionHeadStyle}>Analyst Notes</div>
          <textarea
            className="no-print"
            value={analystNotes}
            onChange={e => setAnalystNotes(e.target.value)}
            placeholder="Add context for the committee — investment thesis, relationship notes, outstanding diligence questions…"
            rows={4}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontFamily: 'Inter, sans-serif', fontSize: '0.83rem', color: '#1e293b', resize: 'vertical', background: '#f8fafc', outline: 'none' }}
          />
          {analystNotes && (
            <div className="print-only" style={{ fontSize: '0.82rem', color: '#1e293b', fontFamily: 'Inter, sans-serif', lineHeight: 1.6, border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px', background: '#f8fafc', whiteSpace: 'pre-wrap' }}>
              {analystNotes}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>
          <span>Generated by FundFlow NextGen · IRS 990 Data + ML Resilience Model</span>
          <span>This is a decision-support summary, not a financial audit or guarantee of outcome.</span>
        </div>
      </div>
    </div>
  );
}

function OrganizationView({ org, onBack }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'simulator' | 'grant-modeler' | 'funder-brief'
  const [liveFilings, setLiveFilings] = useState(org ? (org.filings || []) : []);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (!org) return;
    
    // If the dataset only contains the single current year, pull down the history live
    if ((org.filings || []).length <= 1) {
      setIsFetching(true);
      const targetUrl = `https://projects.propublica.org/nonprofits/api/v2/organizations/${org.ein}.json`;
      fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.filings_with_data) {
                const fetchedFilings = data.filings_with_data.map(f => ({
                    tax_prd_yr: f.tax_prd_yr,
                    totrevenue: f.totrevenue,
                    totfuncexpns: f.totfuncexpns
                }));
                
                const existingYears = new Set((org.filings || []).map(f => f.tax_prd_yr));
                const combined = [...(org.filings || [])];
                
                for (let f of fetchedFilings) {
                   if (!existingYears.has(f.tax_prd_yr)) {
                       combined.push(f);
                       existingYears.add(f.tax_prd_yr);
                   }
                }
                combined.sort((a,b) => a.tax_prd_yr - b.tax_prd_yr);
                setLiveFilings(combined);
            }
        })
        .catch(err => console.error("ProPublica fetch failed", err))
        .finally(() => setIsFetching(false));
    } else {
        setLiveFilings(org.filings);
    }
  }, [org]);

  if (!org) return null;

  return (
    <div className="animate-fade-in">
      <button className="back-btn" onClick={onBack}>← Back to Dashboard</button>
      
      <div className="org-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title">{org.name}</h1>
          <div className="tag-list">
            <span className="tag">EIN: {org.ein}</span>
            <span className="tag">{org.city}, {org.state}</span>
            <span className="tag">NTEE: {org.ntee_code || 'Unknown'}</span>
            <span className="tag">Bucket: {org.size_bucket || 'Unknown'}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className={`badge badge-${(org.resilience_label || 'Unknown').toLowerCase().replace(' ', '-')}`} style={{ fontSize: '1rem', padding: '8px 16px' }}>
            ML Status: {org.resilience_label || 'Unknown'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '16px' }}>
         <button 
           onClick={() => setActiveTab('overview')}
           style={{ background: activeTab === 'overview' ? 'var(--accent-teal)' : 'transparent', color: activeTab === 'overview' ? 'black' : 'var(--text-secondary)', border: `1px solid ${activeTab === 'overview' ? 'var(--accent-teal)' : 'transparent'}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
         >
           Financial Overview
         </button>
         <button 
           onClick={() => setActiveTab('simulator')}
           style={{ background: activeTab === 'simulator' ? 'var(--accent-red)' : 'transparent', color: activeTab === 'simulator' ? 'white' : 'var(--text-secondary)', border: `1px solid ${activeTab === 'simulator' ? 'var(--accent-red)' : 'transparent'}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
         >
           Shock Simulator
         </button>
         <button
           onClick={() => setActiveTab('grant-modeler')}
           style={{ background: activeTab === 'grant-modeler' ? 'var(--accent-purple)' : 'transparent', color: activeTab === 'grant-modeler' ? 'white' : 'var(--text-secondary)', border: `1px solid ${activeTab === 'grant-modeler' ? 'var(--accent-purple)' : 'transparent'}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
         >
           Grant Modeler
         </button>
         <button
           onClick={() => setActiveTab('funder-brief')}
           style={{ background: activeTab === 'funder-brief' ? 'var(--accent-gold)' : 'transparent', color: activeTab === 'funder-brief' ? '#000' : 'var(--text-secondary)', border: `1px solid ${activeTab === 'funder-brief' ? 'var(--accent-gold)' : 'transparent'}`, padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
         >
           Funder Brief
         </button>
      </div>

      <div className="grid-4" style={{ marginBottom: '24px' }}>
        <StatCard 
          label="Total Revenue" 
          value={formatCurrency(org.latest_revenue)}
        />
        <StatCard 
          label="Operating Margin" 
          value={formatPercent(org.operating_margin)}
          trend="vs Industry Average"
          isPositive={org.operating_margin != null ? org.operating_margin >= 0 : false}
        />
        <StatCard 
          label="Cash Runway" 
          value={org.months_of_cash != null ? org.months_of_cash.toFixed(1) : 'N/A'}
          suffix={org.months_of_cash != null ? ' mo' : ''}
          isPositive={org.months_of_cash != null ? org.months_of_cash > 6 : false}
        />
        <StatCard 
          label="Resilience Score" 
          value={org.resilience_score != null ? org.resilience_score.toFixed(1) : 'N/A'}
          trend="ML Predicted Prob."
          isPositive={org.resilience_score != null ? org.resilience_score > 50 : false}
        />
      </div>

      {activeTab === 'overview' ? (
        <div className="grid-2">
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
               7-Year Financial Trend
               {isFetching && <span style={{ fontSize: '0.8rem', color: 'var(--accent-teal)', marginLeft: '12px', fontWeight: 'normal', animation: 'pulse 2s infinite' }}>Fetching API history...</span>}
            </h3>
            <OrgChart filings={liveFilings} />
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px' }}>Benchmarking & Risk</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peer Benchmark Tier</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--accent-gold)' }}>{org.benchmark_tier || 'N/A'}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Among peers in {org.peer_group}</div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Income Diversity (HHI)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--accent-purple)' }}>{org.income_diversity || 'Unknown'}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Dominant Stream: {org.dominant_stream || 'Unknown'}<br/>Grant Dependency: {formatPercent(org.grant_dependency)}</div>
              </div>
              
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Shock Recovery Class</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-red)', lineHeight: '1.2' }}>{org.shock_recovery_class || 'Unknown'}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Simulated ML Funding Shock</div>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'simulator' ? (
        <ShockSimulator org={org} />
      ) : activeTab === 'grant-modeler' ? (
        <GrantModeler org={org} />
      ) : (
        <FunderBrief org={org} />
      )}
    </div>
  );
}

function App() {
  const [db, setDb] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);

  useEffect(() => {
    fetch('dataset.json')
      .then(res => res.json())
      .then(data => {
        setDb(data);
      })
      .catch(err => console.error("Could not load database", err));
  }, []);

  if (!db) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <h2 className="animate-fade-in" style={{ color: 'var(--accent-teal)' }}>Loading Datasets...</h2>
      </div>
    );
  }

  return (
    <div>
      <nav className="navbar">
        <div className="nav-brand" onClick={() => setSelectedOrg(null)}>
          <div className="logo-icon">FF</div>
          <div className="nav-title">FundFlow</div>
        </div>
      </nav>
      
      <main className="app-container">
        {selectedOrg ? (
          <OrganizationView org={selectedOrg} onBack={() => setSelectedOrg(null)} />
        ) : (
          <GlobalDashboard db={db} onSelectOrg={setSelectedOrg} />
        )}
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

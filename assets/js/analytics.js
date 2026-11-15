/* analytics.js - filtering, company summaries, classification, KPIs, relationships and rule-based insights.
   Every number shown in the dashboard and the PDF report comes from these functions, recalculated on every change. */
(function () {
  'use strict';
  const { RULES } = window.FinConfig;
  const U = window.FinUtils;
  const { isNum, mean, median, stdev, slope } = U;

  // ---------------------------------------------------------------- filtering
  function applyFilters(rows, f) {
    return rows.filter((r) => r.year >= f.yearFrom && r.year <= f.yearTo
      && (!f.categories.length || f.categories.includes(r.category))
      && (!f.tickers.length || f.tickers.includes(r.ticker)));
  }
  const byTicker = (rows) => { const m = new Map(); rows.forEach((r) => { if (!m.has(r.ticker)) m.set(r.ticker, []); m.get(r.ticker).push(r); }); m.forEach((a) => a.sort((x, y) => x.year - y.year)); return m; };

  // ---------------------------------------------------------------- company summary over the filtered years
  function companySummaries(rows) {
    const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    const out = [];
    byTicker(rows).forEach((s, ticker) => {
      const f = s[0], l = s[s.length - 1], span = l.year - f.year;
      const cagr = span >= RULES.minYearsForCagr - 1 && f.revenue > 0 ? (Math.pow(l.revenue / f.revenue, 1 / span) - 1) * 100 : null;
      const niCagr = span >= 1 && f.net_income > 0 && l.net_income > 0 ? (Math.pow(l.net_income / f.net_income, 1 / span) - 1) * 100 : null;
      const growth = s.map((r) => r.revenue_growth_pct).filter(isNum);
      const nm = s.map((r) => r.net_margin_pct);
      const k = Math.max(1, Math.min(3, Math.floor(s.length / 2)));
      const loss = s.filter((r) => r.is_loss).length;
      const gpVals = s.map((r) => r.gross_profit_valid).filter(isNum);
      const c = {
        ticker, company_name: f.company_name, category: l.category, first_year: f.year, last_year: l.year, years: s.length,
        revenue_first: f.revenue, revenue_last: l.revenue, revenue_cagr_pct: cagr, net_income_cagr_pct: niCagr,
        total_revenue: s.reduce((a, r) => a + r.revenue, 0), total_gross_profit: gpVals.length ? gpVals.reduce((a, v) => a + v, 0) : null,
        total_net_income: s.reduce((a, r) => a + r.net_income, 0),
        avg_gross_margin_pct: mean(s.map((r) => r.gross_margin_pct)), avg_net_margin_pct: mean(nm),
        median_roe_pct: median(s.map((r) => r.roe_pct)),
        net_margin_change_pp: isNum(l.net_margin_pct) && isNum(f.net_margin_pct) ? l.net_margin_pct - f.net_margin_pct : null,
        net_margin_shift_pp: mean(nm.slice(-k)) - mean(nm.slice(0, k)),
        net_margin_trend_pp_per_year: slope(s.map((r) => r.year), nm),
        pct_years_revenue_growth: growth.length ? (growth.filter((g) => g > 0).length / growth.length) * 100 : null,
        revenue_growth_volatility_pp: growth.length >= 2 ? stdev(growth) : null,
        loss_years: loss, pct_years_profitable: (1 - loss / s.length) * 100,
        growth_with_margin_decline_years: s.filter((r) => r.growth_with_margin_decline).length,
        initial_revenue: f.revenue, median_market_cap_bn: median(s.map((r) => r.market_cap_bn)),
        latest_market_cap_bn: l.market_cap_bn, latest_eps: l.eps, first_eps: f.eps, loss_in_last_year: l.is_loss,
      };
      c.revenue_share_pct = totalRevenue ? (c.total_revenue / totalRevenue) * 100 : null;
      Object.assign(c, classify(c));
      out.push(c);
    });
    // composite score: mean percentile rank (0-100) of growth, margin, ROE and growth consistency, within the selection
    const metrics = ['revenue_cagr_pct', 'avg_net_margin_pct', 'median_roe_pct', 'pct_years_revenue_growth'];
    const pr = metrics.map((m) => U.percentRank(out.map((c) => c[m])));
    out.forEach((c, i) => { c.performance_score = pr.reduce((s, a) => s + a[i], 0) / metrics.length; });
    return out.sort((a, b) => b.performance_score - a.performance_score);
  }

  function classify(c) {
    const R = RULES, reasons = [];
    if (c.loss_in_last_year) reasons.push(`loss in ${c.last_year}`);
    if (isNum(c.revenue_cagr_pct) && c.revenue_cagr_pct < 0) reasons.push('revenue declining');
    if (isNum(c.net_margin_trend_pp_per_year) && c.net_margin_trend_pp_per_year <= R.deteriorating.marginTrendMax) reasons.push('net margin falling by 1 pp or more a year');
    if (isNum(c.net_margin_shift_pp) && c.net_margin_shift_pp <= R.deteriorating.marginShiftMax) reasons.push('net margin down 5 pp or more (end vs start averages)');
    if (reasons.length) return { classification: 'Deteriorating', classification_reason: reasons.join('; ') };
    const s = R.strong;
    if (isNum(c.revenue_cagr_pct) && c.revenue_cagr_pct >= s.cagrMin && c.avg_net_margin_pct >= s.avgNetMarginMin
      && c.pct_years_profitable >= s.profitableYearsMin && (!isNum(c.net_margin_trend_pp_per_year) || c.net_margin_trend_pp_per_year >= s.marginTrendMin))
      return { classification: 'Consistently strong', classification_reason: 'revenue growth of 5%+ a year, average net margin of 10%+, profitable in 90%+ of years, margin stable or rising' };
    const miss = [];
    if (!(isNum(c.revenue_cagr_pct) && c.revenue_cagr_pct >= s.cagrMin)) miss.push('growth below 5% a year');
    if (!(c.avg_net_margin_pct >= s.avgNetMarginMin)) miss.push('average net margin below 10%');
    if (!(c.pct_years_profitable >= s.profitableYearsMin)) miss.push('losses in more than 10% of years');
    if (isNum(c.net_margin_trend_pp_per_year) && c.net_margin_trend_pp_per_year < s.marginTrendMin) miss.push('margin drifting down');
    return { classification: 'Mixed', classification_reason: miss.join('; ') || 'meets neither rule set' };
  }

  // ---------------------------------------------------------------- reference year and KPIs
  function referenceYear(rows) {
    const companies = new Set(rows.map((r) => r.ticker)).size;
    const counts = new Map(); rows.forEach((r) => counts.set(r.year, (counts.get(r.year) || 0) + 1));
    const years = [...counts.keys()].sort((a, b) => b - a);
    const y = years.find((yr) => counts.get(yr) >= Math.max(1, Math.ceil(companies * RULES.referenceYearCoverage))) ?? years[0];
    return { year: y, reporting: counts.get(y) || 0, companies };
  }
  function kpis(rows, summaries) {
    if (!rows.length) return null;
    const ref = referenceYear(rows);
    const cur = rows.filter((r) => r.year === ref.year), prev = rows.filter((r) => r.year === ref.year - 1);
    const prevBy = new Map(prev.map((r) => [r.ticker, r]));
    const lfl = cur.filter((r) => prevBy.has(r.ticker));
    const sum = (a, k) => a.reduce((s, r) => s + (isNum(r[k]) ? r[k] : 0), 0);
    const lflPrev = lfl.map((r) => prevBy.get(r.ticker));
    const growth = (a, b) => (b ? (a / b - 1) * 100 : null);
    const mcLfl = lfl.filter((r) => isNum(r.market_cap_bn) && isNum(prevBy.get(r.ticker).market_cap_bn));
    const cagrs = summaries.map((c) => c.revenue_cagr_pct).filter(isNum);
    const cls = { 'Consistently strong': 0, Mixed: 0, Deteriorating: 0 };
    summaries.forEach((c) => { cls[c.classification]++; });
    const nmNow = sum(cur, 'revenue') ? (sum(cur, 'net_income') / sum(cur, 'revenue')) * 100 : null;
    const nmL = sum(lfl, 'revenue') ? (sum(lfl, 'net_income') / sum(lfl, 'revenue')) * 100 : null;
    const nmP = sum(lflPrev, 'revenue') ? (sum(lflPrev, 'net_income') / sum(lflPrev, 'revenue')) * 100 : null;
    return {
      ref, lflCount: lfl.length,
      revenue: sum(cur, 'revenue'), revenue_lfl_growth_pct: lfl.length ? growth(sum(lfl, 'revenue'), sum(lflPrev, 'revenue')) : null,
      net_income: sum(cur, 'net_income'), net_income_lfl_growth_pct: lfl.length && sum(lflPrev, 'net_income') > 0 ? growth(sum(lfl, 'net_income'), sum(lflPrev, 'net_income')) : null,
      net_margin_pct: nmNow, net_margin_change_pp: isNum(nmL) && isNum(nmP) ? nmL - nmP : null,
      median_cagr_pct: median(cagrs), min_cagr_pct: cagrs.length ? Math.min(...cagrs) : null, max_cagr_pct: cagrs.length ? Math.max(...cagrs) : null,
      median_roe_pct: median(cur.map((r) => r.roe_pct)), median_roe_prev_pct: median(prev.map((r) => r.roe_pct)),
      roe_count: cur.filter((r) => isNum(r.roe_pct)).length,
      market_cap_bn: sum(cur, 'market_cap_bn'), market_cap_count: cur.filter((r) => isNum(r.market_cap_bn)).length,
      market_cap_lfl_growth_pct: mcLfl.length ? growth(sum(mcLfl, 'market_cap_bn'), mcLfl.reduce((s, r) => s + prevBy.get(r.ticker).market_cap_bn, 0)) : null,
      classification: cls,
    };
  }

  // ---------------------------------------------------------------- relationships (objective 5)
  function relationships(summaries, rows) {
    const t = summaries;
    const logInit = t.map((c) => (c.initial_revenue > 0 ? Math.log10(c.initial_revenue) : null));
    const logMc = t.map((c) => (c.median_market_cap_bn > 0 ? Math.log10(c.median_market_cap_bn) : null));
    const cagr = t.map((c) => c.revenue_cagr_pct), margin = t.map((c) => c.avg_net_margin_pct);
    const pair = (id, label, x, y, xLabel, yLabel) => ({ id, label, xLabel, yLabel, pearson: U.pearson(x, y), spearman: U.spearman(x, y), fit: U.linreg(x, y) });
    // revenue vs net income co-movement (company-years with both growth rates measurable)
    const both = rows.filter((r) => isNum(r.revenue_growth_pct) && isNum(r.net_income_growth_pct));
    const revUp = both.filter((r) => r.revenue_growth_pct > 0);
    const revUpNiUp = revUp.filter((r) => r.net_income_growth_pct > 0);
    const revUpNiFaster = revUp.filter((r) => r.net_income_growth_pct > r.revenue_growth_pct);
    return {
      pairs: [
        pair('size_growth', 'Initial size vs revenue growth', logInit, cagr, 'Revenue in first year (log10, USD m)', 'Revenue CAGR (%)'),
        pair('size_margin', 'Initial size vs profitability', logInit, margin, 'Revenue in first year (log10, USD m)', 'Average net margin (%)'),
        pair('growth_margin', 'Revenue growth vs profitability', cagr, margin, 'Revenue CAGR (%)', 'Average net margin (%)'),
        pair('mcap_growth', 'Market value vs revenue growth', logMc, cagr, 'Median market cap (log10, USD bn)', 'Revenue CAGR (%)'),
        pair('mcap_margin', 'Market value vs profitability', logMc, margin, 'Median market cap (log10, USD bn)', 'Average net margin (%)'),
      ],
      comovement: { measurable: both.length, revenueUp: revUp.length, revenueUpIncomeUp: revUpNiUp.length, revenueUpIncomeFaster: revUpNiFaster.length,
        growthWithMarginDecline: rows.filter((r) => r.growth_with_margin_decline).map((r) => ({ ticker: r.ticker, year: r.year, revenue_growth_pct: r.revenue_growth_pct, net_margin_change_pp: r.net_margin_change_pp })) },
    };
  }

  // ---------------------------------------------------------------- rule-based insights and recommendations
  function insights(rows, summaries, k, rel) {
    const out = [];
    if (!rows.length || !summaries.length) return out;
    const by = (key, dir = -1) => summaries.filter((c) => isNum(c[key])).sort((a, b) => dir * (a[key] - b[key]));
    const name = (c) => `${c.company_name} (${c.ticker})`;
    const yrs = `${Math.min(...rows.map((r) => r.year))}-${Math.max(...rows.map((r) => r.year))}`;
    const top = by('revenue_share_pct')[0];
    if (top) out.push({ type: 'Contribution', rule: 'Largest share of combined revenue over the selected years',
      text: `${name(top)} contributed ${U.fmtPct(top.revenue_share_pct)} of combined revenue in ${yrs}${by('revenue_share_pct')[1] ? `, followed by ${name(by('revenue_share_pct')[1])} (${U.fmtPct(by('revenue_share_pct')[1].revenue_share_pct)})` : ''}.` });
    const g = by('revenue_cagr_pct');
    if (g.length >= 2) out.push({ type: 'Growth', rule: 'Highest and lowest revenue CAGR over each company\'s years in the selection',
      text: `${name(g[0])} grew revenue fastest at ${U.fmtPct(g[0].revenue_cagr_pct)} a year (${g[0].first_year}-${g[0].last_year}); ${name(g[g.length - 1])} was slowest at ${U.fmtPct(g[g.length - 1].revenue_cagr_pct)} a year.` });
    const m = by('avg_net_margin_pct');
    if (m.length) out.push({ type: 'Profitability', rule: 'Highest average net margin',
      text: `${name(m[0])} had the highest average net margin (${U.fmtPct(m[0].avg_net_margin_pct)})${m.length > 1 ? `; the lowest was ${name(m[m.length - 1])} (${U.fmtPct(m[m.length - 1].avg_net_margin_pct)})` : ''}.` });
    const cm = rel.comovement;
    if (cm.revenueUp >= 5) out.push({ type: 'Revenue vs profit', rule: 'Company-years with revenue growth in which net income also grew (prior-year net income > 0)',
      text: `Revenue growth did not always bring profit growth: in ${cm.revenueUpIncomeUp} of ${cm.revenueUp} company-years with higher revenue (${U.fmtPct(cm.revenueUpIncomeUp / cm.revenueUp * 100, 0)}), net income also rose, and in ${cm.revenueUpIncomeFaster} it rose faster than revenue.` });
    const squeeze = summaries.filter((c) => c.growth_with_margin_decline_years >= 3 && c.net_margin_shift_pp < 0).sort((a, b) => b.growth_with_margin_decline_years - a.growth_with_margin_decline_years);
    if (squeeze.length) out.push({ type: 'Growth without profitability', rule: 'Years in which revenue grew but net margin fell by more than 1 pp; companies with 3+ such years whose margin is lower overall (end vs start averages)',
      text: `Revenue grew while profitability fell repeatedly at ${squeeze.slice(0, 4).map((c) => `${c.ticker} (${c.growth_with_margin_decline_years} years, net margin ${U.fmtPp(c.net_margin_shift_pp)} overall)`).join(', ')}.` });
    const det = summaries.filter((c) => c.classification === 'Deteriorating');
    if (det.length) out.push({ type: 'Deteriorating', rule: 'Classification rules (see Methodology)',
      text: `${det.length} compan${det.length === 1 ? 'y is' : 'ies are'} classified as deteriorating: ${det.map((c) => `${c.ticker} (${c.classification_reason})`).join('; ')}.` });
    const strong = summaries.filter((c) => c.classification === 'Consistently strong');
    if (strong.length) out.push({ type: 'Consistently strong', rule: 'Classification rules (see Methodology)',
      text: `${strong.map(name).join(', ')} met every rule for consistently strong performance in the selected years.` });
    const cons = summaries.filter((c) => isNum(c.revenue_growth_volatility_pp) && c.years >= 5).sort((a, b) => b.pct_years_revenue_growth - a.pct_years_revenue_growth || a.revenue_growth_volatility_pp - b.revenue_growth_volatility_pp);
    if (cons.length) out.push({ type: 'Consistency', rule: 'Highest share of years with revenue growth, ties broken by lowest growth volatility (5+ years of data)',
      text: `${name(cons[0])} grew revenue in ${U.fmtPct(cons[0].pct_years_revenue_growth, 0)} of years with growth volatility of ${U.fmtNum(cons[0].revenue_growth_volatility_pp, 1)} pp; the least consistent was ${name(cons[cons.length - 1])} (${U.fmtPct(cons[cons.length - 1].pct_years_revenue_growth, 0)} of years).` });
    const shift = by('net_margin_shift_pp');
    if (shift.length >= 2) out.push({ type: 'Margin change', rule: 'Net margin, average of the last 3 years minus average of the first 3 (fewer when data is short)',
      text: `The biggest margin improvement was at ${name(shift[0])} (${U.fmtPp(shift[0].net_margin_shift_pp)}); the biggest deterioration at ${name(shift[shift.length - 1])} (${U.fmtPp(shift[shift.length - 1].net_margin_shift_pp)}).` });
    const sg = rel.pairs.find((p) => p.id === 'size_growth');
    if (sg && isNum(sg.pearson.r)) out.push({ type: 'Size and growth', rule: 'Pearson correlation across companies; significant if p < 0.05',
      text: `Across ${sg.pearson.n} companies, initial size and later revenue growth show a ${U.describeCorr(sg.pearson.r)} relationship (r = ${sg.pearson.r.toFixed(2)}, p = ${sg.pearson.p.toFixed(3)})${sg.pearson.p < 0.05 ? '' : ', which is not statistically significant'}. With so few companies this is indicative only.` });
    const years = new Set(summaries.map((c) => `${c.first_year}-${c.last_year}`));
    if (years.size > 1) out.push({ type: 'Coverage', rule: 'Companies do not all report the same years',
      text: `Coverage is uneven (${[...years].slice(0, 4).join(', ')}${years.size > 4 ? ', ...' : ''}). Growth rates use each company's own first and last year, and year-on-year KPIs compare only companies reporting in both years.` });
    return out;
  }

  function recommendations(summaries, rel, rows) {
    const recs = [];
    const strong = summaries.filter((c) => c.classification === 'Consistently strong');
    const det = summaries.filter((c) => c.classification === 'Deteriorating');
    const squeeze = summaries.filter((c) => c.growth_with_margin_decline_years >= 3 && c.net_margin_shift_pp < 0);
    const highGrowthLowMargin = summaries.filter((c) => c.revenue_cagr_pct >= 15 && c.avg_net_margin_pct < 5);
    if (strong.length) recs.push({ horizon: 'Immediate', text: `Prioritise ${strong.map((c) => c.ticker).join(', ')} for deeper valuation and peer benchmarking work.`,
      evidence: 'Classified consistently strong: growth, margin, profitability and margin-trend rules all met.' });
    if (det.length) recs.push({ horizon: 'Immediate', text: `Put ${det.map((c) => c.ticker).join(', ')} on a watch list and review the drivers behind the flags before increasing exposure.`,
      evidence: det.map((c) => `${c.ticker}: ${c.classification_reason}`).join('; ') });
    if (highGrowthLowMargin.length) recs.push({ horizon: 'Medium term', text: `Judge ${highGrowthLowMargin.map((c) => c.ticker).join(', ')} on margin progression, not revenue growth alone.`,
      evidence: highGrowthLowMargin.map((c) => `${c.ticker}: ${U.fmtPct(c.revenue_cagr_pct)} CAGR, ${U.fmtPct(c.avg_net_margin_pct)} average net margin`).join('; ') });
    if (squeeze.length) recs.push({ horizon: 'Medium term', text: `Investigate pricing and cost structure at ${squeeze.map((c) => c.ticker).join(', ')}, where revenue grew while net margin fell in three or more years and margins ended lower.`,
      evidence: squeeze.map((c) => `${c.ticker}: ${c.growth_with_margin_decline_years} such years; net margin ${U.fmtPp(c.net_margin_shift_pp)} (end vs start averages)`).join('; ') });
    const mg = rel.pairs.find((p) => p.id === 'mcap_growth');
    if (mg && isNum(mg.pearson.r) && mg.pearson.p < 0.05) recs.push({ horizon: 'Long term', text: 'Track growth and margin quality together when screening companies; market value in this group rewards both.',
      evidence: `Median market cap correlates with revenue CAGR (r = ${mg.pearson.r.toFixed(2)}) across ${mg.pearson.n} companies. This is an association: valuation reflects past growth, so it does not show that size causes growth.` });
    const nm = [...new Set(rows.filter((r) => r.flag_gross_margin_nm || r.flag_current_ratio_placeholder).map((r) => r.ticker))];
    if (nm.length) recs.push({ horizon: 'Long term', text: `Assess ${nm.join(', ')} with sector-specific measures (for banks and insurers: capital ratios, net interest margin, combined ratio) rather than gross margin or current ratio.`,
      evidence: `${nm.join(', ')} report gross profit equal to revenue and/or a placeholder current ratio of exactly 1.0, so those ratios are not meaningful for them.` });
    return recs;
  }

  window.FinAnalytics = { applyFilters, byTicker, companySummaries, classify, referenceYear, kpis, relationships, insights, recommendations };
})();

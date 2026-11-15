/* report-generator.js - builds the downloadable PDF analysis report from the data currently loaded.
   Nothing in the report is pre-written about results: every number, table, finding and chart is produced from the
   same calculations as the dashboard at the moment the button is pressed. Text uses the standard PDF Helvetica font,
   so only plain ASCII characters are written. */
(function () {
  'use strict';
  const U = window.FinUtils;
  const A = window.FinAnalytics;
  const C = window.FinCharts;
  const { KPI_DEFS, RULES } = window.FinConfig;

  const ascii = (s) => String(s ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\n]/g, '');

  async function chartImages(rows, summaries, rel) {
    const host = document.createElement('div');
    host.className = 'report-canvas';                      // forces light-theme colours (styles.css)
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;';
    document.body.appendChild(host);
    const mk = (h) => { const d = document.createElement('div'); d.style.cssText = `width:900px;height:${h}px`; host.appendChild(d); return d; };
    const out = {};
    C.setAnimation(false);
    try {
      const a = mk(380); C.yearTotals(a, rows); out.totals = C.image(a);
      const b = mk(Math.max(260, 26 * summaries.length + 40)); C.rankBars(b, summaries, { valueKey: 'revenue_cagr_pct', unit: 'pct' }); out.cagr = C.image(b);
      const c = mk(Math.max(280, 26 * summaries.length + 60)); C.marginBars(c, summaries); out.margins = C.image(c);
      const sg = rel.pairs.find((p) => p.id === 'size_growth');
      const d = mk(420); C.companyScatter(d, summaries, { x: 'initial_revenue', y: 'revenue_cagr_pct', xLabel: 'Revenue in first year', yLabel: 'Revenue CAGR', xUnit: 'usd_m', yUnit: 'pct', sizeKey: 'median_market_cap_bn', xLog: true, fit: sg && sg.fit }); out.scatter = C.image(d);
      out.sizes = { totals: 380, cagr: b.offsetHeight, margins: c.offsetHeight, scatter: 420 };
    } finally {
      C.setAnimation(true);
      host.querySelectorAll('div').forEach((el) => { const inst = window.echarts.getInstanceByDom(el); if (inst) inst.dispose(); });
      host.remove();
    }
    return out;
  }

  async function generate(ctx) {
    const { jsPDF } = window.jspdf;
    // jspdf-autotable 5 exposes applyPlugin() globally; it adds doc.autoTable to jsPDF instances.
    if (typeof jsPDF.API.autoTable !== 'function' && typeof window.applyPlugin === 'function') window.applyPlugin(jsPDF);
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48, CW = W - 2 * M;
    const NAVY = [31, 56, 100], BLUE = [42, 120, 214], GREY = [90, 90, 90];
    let y = M;
    const ensure = (h) => { if (y + h > H - M) { doc.addPage(); y = M; } };
    const h1 = (t) => { ensure(40); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...NAVY); doc.text(ascii(t), M, y); y += 8; doc.setDrawColor(...BLUE); doc.setLineWidth(1); doc.line(M, y, M + CW, y); y += 16; };
    const h2 = (t) => { ensure(26); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY); doc.text(ascii(t), M, y); y += 14; };
    const p = (t, opt = {}) => { doc.setFont('helvetica', opt.bold ? 'bold' : 'normal'); doc.setFontSize(opt.size || 9.5); doc.setTextColor(...(opt.color || [20, 20, 20]));
      const lines = doc.splitTextToSize(ascii(t), CW - (opt.indent || 0)); lines.forEach((ln) => { ensure(13); doc.text(ln, M + (opt.indent || 0), y); y += 12.5; }); y += opt.after ?? 4; };
    const bullet = (t) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
      const lines = doc.splitTextToSize(ascii(t), CW - 14); lines.forEach((ln, i) => { ensure(13); if (!i) doc.text('-', M + 2, y); doc.text(ln, M + 14, y); y += 12.5; }); y += 2; };
    const table = (head, body, opts = {}) => {
      doc.autoTable({ startY: y, head: [head.map(ascii)], body: body.map((r) => r.map((c) => ascii(c))), margin: { left: M, right: M }, theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, lineColor: [220, 220, 220], lineWidth: 0.5, textColor: [20, 20, 20], overflow: 'linebreak' },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [246, 248, 252] }, columnStyles: opts.columnStyles || {} });
      y = doc.lastAutoTable.finalY + 12;
    };
    const img = (data, hPx) => { if (!data) return; const h = CW * (hPx / 900); ensure(h + 8); doc.addImage(data, 'JPEG', M, y, CW, h); y += h + 8; };
    const caption = (t) => p(t, { size: 8, color: GREY, after: 8 });

    const { rows, summaries, kpis, rel, insights, recs } = ctx;
    const years = rows.map((r) => r.year);
    const period = `${Math.min(...years)}-${Math.max(...years)}`;
    const images = await chartImages(rows, summaries, rel);

    // ---- cover
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 130, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('Financial Performance Analysis', M, 62);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text(ascii(`Revenue, profitability and financial ratios of ${summaries.length} listed companies, ${period}`), M, 86);
    doc.setFontSize(9); doc.text(ascii(`Generated ${new Date().toLocaleString('en-GB')} from the Financial Performance Dashboard`), M, 108);
    y = 160;
    table(['Report scope', ''], [
      ['Scope', ctx.scopeLabel], ['Filters applied', ctx.filtersDesc], ['Records analysed', `${rows.length} company-years, ${summaries.length} companies, ${period}`],
      ['Dataset status', ctx.datasetStatus], ['Reference year for KPIs', `${kpis.ref.year} (${kpis.ref.reporting} of ${kpis.ref.companies} companies report)`],
      ['Units', 'Revenue, profit and cash-flow values in USD millions (shown as $bn/$tn); market capitalisation in USD billions; ratios in %'],
    ], { columnStyles: { 0: { cellWidth: 130, fontStyle: 'bold' } } });

    // ---- 1-4
    h1('1. Business context and problem');
    p('A Financial Data Analyst was engaged to evaluate the financial performance of several publicly traded companies over multiple years. Management wants to know which companies are growing, which are becoming more profitable, how their financial positions are evolving and which show stronger, more consistent performance.');
    p('The problem: headline revenue alone does not show whether growth is profitable, sustained or reflected in shareholder returns. Management needs a consistent, evidence-based comparison across companies of very different size and sector before deciding where to focus deeper review.');
    h1('2. Purpose and objectives');
    ['Evaluate revenue and profit trends across selected companies.', 'Compare profitability across companies and financial periods.', 'Examine the evolution of selected financial ratios.',
      'Identify companies with consistently strong or deteriorating performance.', 'Assess relationships between company size, revenue growth and profitability.', 'Develop an executive financial performance dashboard.']
      .forEach((t, i) => bullet(`${i + 1}. ${t}`));

    h1('3. Dataset overview');
    table(['Item', 'Value'], [
      ['Source', ctx.sourceName], ['Records in scope', `${rows.length} company-years`], ['Companies', summaries.map((c) => c.ticker).join(', ')],
      ['Years', period], ['Fields', '23 source fields (income statement, balance sheet, cash flow, ratios, market data) plus derived metrics'],
      ['Coverage', [...new Set(summaries.map((c) => `${c.ticker} ${c.first_year}-${c.last_year}`))].join('; ')],
    ], { columnStyles: { 0: { cellWidth: 110, fontStyle: 'bold' } } });

    h1('4. Data preparation summary');
    const cc = ctx.cleaningCounts;
    table(['Rule', 'Action', 'Records affected (in scope)'], [
      ['Column names', "Header whitespace trimmed ('Company ' -> 'Company'); columns mapped to standard names", 'all'],
      ['Categories', "Labels standardised case-insensitively ('BANK'/'Bank' -> 'Bank', 'ELEC' -> 'Electronics', ...)", String(cc.category)],
      ['Gross margin', 'Gross profit equal to revenue (no cost of sales) -> gross margin not meaningful', String(cc.gross)],
      ['EBITDA', 'Placeholder value of 1 -> treated as missing', String(cc.ebitda)],
      ['Current ratio', 'Placeholder of exactly 1.0 -> treated as missing', String(cc.current)],
      ['Negative equity', 'Equity <= 0 -> ROE and debt/equity not meaningful', String(cc.equity)],
      ['Missing values', 'Kept missing (never imputed); excluded only from the metric that needs them', String(cc.missingMcap) + ' market cap'],
      ['Ratios', 'Margins and ROE recalculated from statement lines (reported ratios kept for reference)', 'all'],
    ], { columnStyles: { 0: { cellWidth: 90, fontStyle: 'bold' }, 2: { cellWidth: 90 } } });
    if (ctx.uploads.length) { h2('Data added during use'); table(['When', 'File', 'Mode', 'Result'], ctx.uploads.map((b) => [new Date(b.at).toLocaleString('en-GB'), b.file, b.modeLabel, b.resultText])); }

    h1('5. Analytical methods');
    [
      'Growth: compound annual growth rate (CAGR) between each company\'s first and last year in scope; year-on-year growth only between consecutive years.',
      'Profitability: gross, net and EBITDA margins and ROE recalculated from the statements; averages across years; margin trend as the least-squares slope of net margin on year (pp per year).',
      'Consistency: share of years with revenue growth and the standard deviation of year-on-year growth (volatility).',
      `Classification (rule-based): "Deteriorating" if any of: loss in the latest year, negative revenue CAGR, margin slope <= ${RULES.deteriorating.marginTrendMax} pp a year, or net margin down ${-RULES.deteriorating.marginShiftMax} pp or more (average of last 3 years vs first 3). "Consistently strong" if CAGR >= ${RULES.strong.cagrMin}%, average net margin >= ${RULES.strong.avgNetMarginMin}%, profitable in >= ${RULES.strong.profitableYearsMin}% of years and margin slope >= ${RULES.strong.marginTrendMin} pp a year. Otherwise "Mixed".`,
      'Performance score: average percentile rank (0-100) of revenue CAGR, average net margin, median ROE and share of growth years, within the companies in scope. It is relative, not absolute.',
      'Relationships: Pearson correlation (with two-sided p-value from the t distribution) and Spearman rank correlation across companies; with about a dozen companies these are indicative and do not establish causation.',
      'Like-for-like comparisons: year-on-year KPI changes use only companies reporting in both years.',
    ].forEach(bullet);

    h1('6. KPI definitions');
    table(['KPI', 'Definition', 'Comparison'], KPI_DEFS.map((k) => [k.name, k.formula, k.compare]), { columnStyles: { 0: { cellWidth: 100, fontStyle: 'bold' } } });

    h1('7. Important numerical results');
    table(['KPI', `Value (${kpis.ref.year})`, 'Change / context'], [
      ['Combined revenue', U.fmtUsdM(kpis.revenue), `${U.fmtSignedPct(kpis.revenue_lfl_growth_pct)} like-for-like (${kpis.lflCount} companies)`],
      ['Combined net income', U.fmtUsdM(kpis.net_income), `${U.fmtSignedPct(kpis.net_income_lfl_growth_pct)} like-for-like`],
      ['Aggregate net margin', U.fmtPct(kpis.net_margin_pct), `${U.fmtPp(kpis.net_margin_change_pp)} like-for-like`],
      ['Median revenue CAGR', U.fmtPct(kpis.median_cagr_pct), `range ${U.fmtPct(kpis.min_cagr_pct)} to ${U.fmtPct(kpis.max_cagr_pct)}`],
      ['Median ROE', U.fmtPct(kpis.median_roe_pct), `${kpis.roe_count} companies with positive equity; previous year ${U.fmtPct(kpis.median_roe_prev_pct)}`],
      ['Combined market cap', U.fmtUsdBn(kpis.market_cap_bn), `${U.fmtSignedPct(kpis.market_cap_lfl_growth_pct)} like-for-like`],
      ['Performance mix', `${kpis.classification['Consistently strong']} strong / ${kpis.classification.Mixed} mixed / ${kpis.classification.Deteriorating} deteriorating`, 'rule-based classification'],
    ], { columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold' } } });
    img(images.totals, images.sizes.totals); caption(`Combined revenue and net income by year (all companies in scope). Totals change partly because coverage changes between years.`);
    h2('Company scorecard');
    table(['Company', 'Years', 'Rev. CAGR', 'Avg net margin', 'Avg gross margin', 'Median ROE', 'Growth years', 'Score', 'Classification'],
      summaries.map((c) => [`${c.ticker}`, `${c.first_year}-${c.last_year}`, U.fmtPct(c.revenue_cagr_pct), U.fmtPct(c.avg_net_margin_pct), U.isNum(c.avg_gross_margin_pct) ? U.fmtPct(c.avg_gross_margin_pct) : 'n/m',
        U.fmtPct(c.median_roe_pct), U.fmtPct(c.pct_years_revenue_growth, 0), U.fmtNum(c.performance_score, 0), c.classification]));
    img(images.cagr, images.sizes.cagr); caption('Revenue CAGR by company over each company\'s years in scope.');
    img(images.margins, images.sizes.margins); caption('Average gross and net margin by company (gross margin not meaningful where gross profit equals revenue).');
    h2('Relationships between size, growth and profitability');
    table(['Relationship', 'Pearson r', 'p-value', 'Spearman rho', 'n', 'Reading'], rel.pairs.map((q) => [q.label, U.isNum(q.pearson.r) ? q.pearson.r.toFixed(2) : 'n/a',
      U.isNum(q.pearson.p) ? q.pearson.p.toFixed(3) : 'n/a', U.isNum(q.spearman.r) ? q.spearman.r.toFixed(2) : 'n/a', String(q.pearson.n),
      U.isNum(q.pearson.r) ? `${U.describeCorr(q.pearson.r)}${q.pearson.p < 0.05 ? ', significant at 5%' : ', not significant'}` : 'not enough data']));
    img(images.scatter, images.sizes.scatter); caption('Initial revenue (log scale) against revenue CAGR; bubble size = median market cap; dashed line = least-squares fit.');

    h1('8. Key findings');
    insights.forEach((i) => bullet(`${i.type}: ${i.text}`));
    h1('9. Business interpretation');
    const cm = rel.comovement;
    p(`What the data shows: across the ${summaries.length} companies in scope, ${kpis.classification['Consistently strong']} met every rule for consistently strong performance and ${kpis.classification.Deteriorating} were flagged as deteriorating. Revenue growth was accompanied by net income growth in ${cm.revenueUp ? U.fmtPct(cm.revenueUpIncomeUp / cm.revenueUp * 100, 0) : 'n/a'} of company-years with higher revenue, so growth and profitability must be judged together.`);
    p('What the analysis suggests: companies combining steady growth with high and stable margins dominate both profit and market value in this group. Fast growth with thin margins, or growth while margins fall, deserves closer review of cost structure and pricing.');
    p('What requires further investigation: the reasons behind margin changes (pricing, costs, one-off items) are not in the data; sector differences (banks, utilities, retailers) limit like-for-like comparison; and correlations across so few companies cannot show cause and effect.');
    h1('10. Recommendations');
    table(['Horizon', 'Recommendation', 'Evidence'], recs.map((r) => [r.horizon, r.text, r.evidence]), { columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' } } });
    h1('11. Limitations and assumptions');
    [
      'Companies report different years (coverage table in section 3); fiscal years end in different months, so "year" means the fiscal year as reported.',
      'Statement values are assumed to be USD millions and market cap USD billions, as labelled in the source. Barclays\' reported margins differ slightly from recalculated ones, possibly due to currency conversion.',
      'Gross margin, EBITDA and current ratio are not meaningful for banks and insurers in this dataset; ROE and debt/equity are not meaningful where equity is negative.',
      'Total assets are not in the data, so ROA is the reported figure and cannot be recalculated.',
      'Classification thresholds and the performance score are analytical conventions documented in the dashboard; changing them changes the labels.',
      'Correlations across about a dozen companies are descriptive and indicative only; they do not establish causation.',
      'Data added through the dashboard is validated for structure and type but its accuracy depends on the source.',
    ].forEach(bullet);
    p(`Report generated: ${new Date().toLocaleString('en-GB')}. Scope: ${ctx.scopeLabel}. Records: ${rows.length}.`, { color: GREY, size: 8.5 });

    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130);
      doc.text(ascii(`Financial Performance Analysis | ${ctx.scopeLabel} | page ${i} of ${pages}`), M, H - 22); }
    const fname = `financial_performance_report_${ctx.scope}_${U.stamp()}.pdf`;
    doc.save(fname);
    return { pages, fname };
  }

  window.FinReport = { generate };
})();

/* app.js - application state, rendering and user interaction.
   Data flow: stored records -> FinData.derive() -> filters -> FinAnalytics -> charts, tables, KPIs, report, exports.
   Every change (filter, upload, undo, reset) re-runs that whole chain, so all views always share one dataset. */
(function () {
  'use strict';
  const U = window.FinUtils, D = window.FinData, A = window.FinAnalytics, C = window.FinCharts, S = window.FinStore;
  const { METRICS, KPI_DEFS, RULES, FIELDS, COMPANY_NAMES } = window.FinConfig;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = U.esc;

  const state = {
    baseRecords: [], records: [], batches: [], updatedAt: null, storage: false,
    all: [], filtered: [], summaries: [], kpis: null, rel: null, insights: [], recs: [],
    filters: { yearFrom: 0, yearTo: 0, categories: [], tickers: [] },
    view: { tab: 'overview', trendMetric: 'revenue', trendMode: 'abs', trendLog: false, trendHL: null, ratioMetric: 'roe_pct', ratioHL: null,
      profile: null, relX: 'initial_revenue', relY: 'revenue_cagr_pct',
      table: { search: '', cols: 'key', page: 1, size: 25, sort: 'ticker', dir: 1 }, sorts: {} },
    pending: null, dirty: new Set(),
  };

  // ================================================================ start-up
  async function init() {
    try {
      busy(true, 'Loading data...');
      const base = window.BASE_DATASET;
      const parsed = D.readCsvText(base.csv);
      const map = D.mapColumns(parsed.headers);
      const v = D.validateRows(parsed.rows, map, null);
      state.baseRecords = v.accepted.map((r) => { const o = {}; D.INPUT_KEYS.forEach((k) => { o[k] = r[k]; }); o._batch = 'base'; return o; });
      state.baseCheck = { rows: parsed.rows.length, accepted: v.accepted.length, rejected: v.rejected.length, map };
      state.storage = await S.available();
      const saved = state.storage ? await S.load() : null;
      if (saved && Array.isArray(saved.records) && saved.records.length) {
        state.records = saved.records; state.batches = saved.batches || []; state.updatedAt = saved.updatedAt;
        toast(`Loaded your working dataset saved in this browser (${saved.records.length} records).`);
      } else state.records = state.baseRecords.slice();
      try { const t = localStorage.getItem('fin-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* storage blocked */ }
      wire();
      recompute(true);
      renderStatic();
    } catch (e) {
      console.error(e);
      $('#main').insertAdjacentHTML('afterbegin', `<div class="msg err">The dashboard could not start: ${esc(e.message)}. Check that all files in assets/ and data/ were deployed.</div>`);
    } finally { busy(false); }
  }

  // ================================================================ recalculation
  function recompute(resetFilters = false) {
    state.all = D.derive(state.records);
    const years = state.all.map((r) => r.year);
    const yMin = Math.min(...years), yMax = Math.max(...years);
    const f = state.filters;
    if (resetFilters || !f.yearFrom) { f.yearFrom = yMin; f.yearTo = yMax; f.categories = []; f.tickers = []; }
    f.yearFrom = Math.max(yMin, Math.min(f.yearFrom, yMax)); f.yearTo = Math.min(yMax, Math.max(f.yearTo, yMin));
    const cats = new Set(state.all.map((r) => r.category)), ticks = new Set(state.all.map((r) => r.ticker));
    f.categories = f.categories.filter((c) => cats.has(c)); f.tickers = f.tickers.filter((t) => t === '__none__' || ticks.has(t));
    buildFilterOptions(yMin, yMax);
    refresh();
  }
  function refresh() {
    state.filtered = A.applyFilters(state.all, state.filters);
    state.summaries = A.companySummaries(state.filtered);
    state.kpis = A.kpis(state.filtered, state.summaries);
    state.rel = A.relationships(state.summaries, state.filtered);
    state.insights = A.insights(state.filtered, state.summaries, state.kpis, state.rel);
    state.recs = A.recommendations(state.summaries, state.rel, state.filtered);
    const tickers = state.summaries.slice().sort((a, b) => b.revenue_last - a.revenue_last).map((c) => c.ticker);
    const keep = (hl) => (hl || []).filter((t) => tickers.includes(t));
    state.view.trendHL = keep(state.view.trendHL).length ? keep(state.view.trendHL) : tickers.slice(0, 3);
    state.view.ratioHL = keep(state.view.ratioHL).length ? keep(state.view.ratioHL) : tickers.slice(0, 3);
    if (!tickers.includes(state.view.profile)) state.view.profile = tickers[0] || null;
    state.view.table.page = 1;
    renderHeader(); renderChips();
    ['overview', 'growth', 'profit', 'ratios', 'drivers', 'explorer', 'data', 'method'].forEach((t) => state.dirty.add(t));
    renderTab(state.view.tab);
  }
  function renderTab(tab) {
    if (!state.dirty.has(tab)) return;
    state.dirty.delete(tab);
    const empty = !state.filtered.length;
    ({ overview: renderOverview, growth: renderGrowth, profit: renderProfit, ratios: renderRatios, drivers: renderDrivers,
      explorer: renderExplorer, data: renderDataTab, method: renderMethod })[tab](empty);
  }
  const openProfile = (ticker) => { state.view.profile = ticker; switchTab('ratios'); state.dirty.add('ratios'); renderTab('ratios');
    setTimeout(() => $('#profileCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };

  // ================================================================ header, filters, chips
  function renderHeader() {
    const modified = state.batches.length > 0;
    const st = $('#datasetStatus');
    st.textContent = modified ? `Working dataset: ${state.records.length} records (${state.batches.length} upload${state.batches.length > 1 ? 's' : ''} in this browser)` : `Original dataset: ${state.records.length} records`;
    st.classList.toggle('modified', modified);
    const years = state.all.map((r) => r.year);
    $('#datasetScope').textContent = `${new Set(state.all.map((r) => r.ticker)).size} companies, ${Math.min(...years)}-${Math.max(...years)}`;
    $('#lastUpdated').textContent = modified ? `Data last changed ${new Date(state.updatedAt).toLocaleString('en-GB')}` : `Source: ${window.BASE_DATASET.name}`;
  }
  function datasetStatusText() {
    return state.batches.length ? `Working dataset modified in this browser: ${state.batches.length} upload(s), last change ${new Date(state.updatedAt).toLocaleString('en-GB')}` : `Original dataset (${window.BASE_DATASET.name}), unmodified`;
  }
  function buildFilterOptions(yMin, yMax) {
    const f = state.filters;
    const opts = (sel) => Array.from({ length: yMax - yMin + 1 }, (_, i) => yMin + i).map((y) => `<option ${y === sel ? 'selected' : ''}>${y}</option>`).join('');
    $('#fYearFrom').innerHTML = opts(f.yearFrom); $('#fYearTo').innerHTML = opts(f.yearTo);
    const count = (k, v) => state.all.filter((r) => r[k] === v).length;
    const cats = [...new Set(state.all.map((r) => r.category))].sort();
    $('#fCategory').innerHTML = cats.map((c) => `<label><input type="checkbox" value="${esc(c)}" ${!f.categories.length || f.categories.includes(c) ? 'checked' : ''}> ${esc(c)} <small class="note">(${count('category', c)})</small></label>`).join('')
      + '<div class="menu-actions"><button type="button" data-all>All</button><button type="button" data-none>None</button></div>';
    const ticks = [...new Set(state.all.map((r) => r.ticker))].sort();
    $('#fCompany').innerHTML = ticks.map((t) => `<label><input type="checkbox" value="${esc(t)}" ${!f.tickers.length || f.tickers.includes(t) ? 'checked' : ''}> <b>${esc(t)}</b> ${esc(COMPANY_NAMES[t] || '')}</label>`).join('')
      + '<div class="menu-actions"><button type="button" data-all>All</button><button type="button" data-none>None</button></div>';
    updateFilterLabels();
  }
  function readMulti(box, all) {
    const checked = $$(`${box} input:checked`).map((i) => i.value);
    return checked.length === all ? [] : checked.length === 0 ? ['__none__'] : checked;
  }
  function updateFilterLabels() {
    const f = state.filters;
    $('#fCategoryVal').textContent = !f.categories.length ? 'All' : f.categories.includes('__none__') ? 'None' : f.categories.length === 1 ? f.categories[0] : `${f.categories.length} selected`;
    $('#fCompanyVal').textContent = !f.tickers.length ? 'All' : f.tickers.includes('__none__') ? 'None' : f.tickers.length <= 3 ? f.tickers.join(', ') : `${f.tickers.length} selected`;
  }
  function renderChips() {
    const f = state.filters, chips = [];
    const years = state.all.map((r) => r.year); const yMin = Math.min(...years), yMax = Math.max(...years);
    if (f.yearFrom !== yMin || f.yearTo !== yMax) chips.push(['years', `Years ${f.yearFrom}-${f.yearTo}`]);
    f.categories.filter((c) => c !== '__none__').forEach((c) => chips.push([`cat:${c}`, `Category: ${c}`]));
    if (f.tickers.length) chips.push(['ticks', f.tickers.includes('__none__') ? 'No companies selected' : `Companies: ${f.tickers.length <= 4 ? f.tickers.join(', ') : f.tickers.length + ' selected'}`]);
    $('#activeFilters').innerHTML = chips.length ? chips.map(([k, t]) => `<button class="chip" type="button" data-chip="${esc(k)}" aria-label="Remove filter ${esc(t)}">${esc(t)} <span aria-hidden="true">✕</span></button>`).join('')
      : '<span class="note">No filters: showing all data</span>';
    updateFilterLabels();
  }
  function filtersDescription() {
    const f = state.filters; const years = state.all.map((r) => r.year);
    const parts = [`years ${f.yearFrom}-${f.yearTo}`];
    if (f.categories.length) parts.push(`categories: ${f.categories.join(', ')}`);
    if (f.tickers.length) parts.push(`companies: ${f.tickers.join(', ')}`);
    const none = f.yearFrom === Math.min(...years) && f.yearTo === Math.max(...years) && !f.categories.length && !f.tickers.length;
    return none ? 'None (all data)' : parts.join('; ');
  }

  // ================================================================ overview
  function kpiCard(def, value, delta, deltaClass, context) {
    return `<div class="kpi"><div class="k-name">${esc(def.name)} <button class="info" type="button" aria-label="Definition of ${esc(def.name)}">i<span class="tip" role="tooltip"><b>${esc(def.name)}</b><br>${esc(def.formula)}.<br><i>${esc(def.compare)}.</i></span></button></div>
      <div class="k-value">${value}</div>${delta ? `<div class="k-delta ${deltaClass}">${delta}</div>` : ''}<div class="k-context">${context}</div></div>`;
  }
  const dcls = (v) => (!U.isNum(v) ? 'flat' : v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat');
  const arrow = (v) => (!U.isNum(v) ? '' : v > 0.05 ? '▲ ' : v < -0.05 ? '▼ ' : '');
  function renderOverview(empty) {
    const k = state.kpis;
    if (empty || !k) { $('#kpis').innerHTML = '<p class="empty">No records match the current filters. Use Reset filters to see all data.</p>'; $('#kpiNote').textContent = '';
      ['#insights', '#glance', '#recs'].forEach((s) => { $(s).innerHTML = ''; }); C.yearTotals($('#cYearTotals'), []); C.rankBars($('#cShare'), [], { valueKey: 'x' }); return; }
    const d = Object.fromEntries(KPI_DEFS.map((x) => [x.id, x]));
    const prevY = k.ref.year - 1;
    $('#kpis').innerHTML = [
      kpiCard(d.revenue, U.fmtUsdM(k.revenue), `${arrow(k.revenue_lfl_growth_pct)}${U.fmtSignedPct(k.revenue_lfl_growth_pct)} vs ${prevY}`, dcls(k.revenue_lfl_growth_pct), `${k.ref.year}, ${k.ref.reporting} companies; change like-for-like (${k.lflCount})`),
      kpiCard(d.net_income, U.fmtUsdM(k.net_income), `${arrow(k.net_income_lfl_growth_pct)}${U.fmtSignedPct(k.net_income_lfl_growth_pct)} vs ${prevY}`, dcls(k.net_income_lfl_growth_pct), `${k.ref.year}, like-for-like change`),
      kpiCard(d.net_margin, U.fmtPct(k.net_margin_pct), `${arrow(k.net_margin_change_pp)}${U.fmtPp(k.net_margin_change_pp)} vs ${prevY}`, dcls(k.net_margin_change_pp), 'Net income as a share of revenue'),
      kpiCard(d.cagr, U.fmtPct(k.median_cagr_pct), '', '', `Range ${U.fmtPct(k.min_cagr_pct)} to ${U.fmtPct(k.max_cagr_pct)} a year, ${state.filters.yearFrom}-${state.filters.yearTo}`),
      kpiCard(d.roe, U.fmtPct(k.median_roe_pct), `${U.isNum(k.median_roe_prev_pct) ? `${prevY}: ${U.fmtPct(k.median_roe_prev_pct)}` : ''}`, 'flat', `${k.ref.year}, ${k.roe_count} companies with positive equity`),
      kpiCard(d.market_cap, U.fmtUsdBn(k.market_cap_bn), `${arrow(k.market_cap_lfl_growth_pct)}${U.fmtSignedPct(k.market_cap_lfl_growth_pct)} vs ${prevY}`, dcls(k.market_cap_lfl_growth_pct), `${k.ref.year}, ${k.market_cap_count} companies with a value`),
      kpiCard(d.classification, `${state.summaries.length} <small style="font-size:13px;font-weight:600;color:var(--text-secondary)">companies</small>`, '', '', `<div class="mix"><span class="badge b-strong">${k.classification['Consistently strong']} strong</span><span class="badge b-mixed">${k.classification.Mixed} mixed</span><span class="badge b-det">${k.classification.Deteriorating} deteriorating</span></div>`),
    ].join('');
    $('#kpiNote').textContent = `Reference year ${k.ref.year}: the latest year in which at least half of the companies in view report (${k.ref.reporting} of ${k.ref.companies}). Changes compare only companies reporting in both ${prevY} and ${k.ref.year}.`;
    C.yearTotals($('#cYearTotals'), state.filtered);
    C.rankBars($('#cShare'), state.summaries, { valueKey: 'revenue_share_pct', unit: 'pct', onClick: openProfile, note: (c) => `Total revenue ${U.fmtUsdM(c.total_revenue)} (${c.first_year}-${c.last_year})` });
    $('#insights').innerHTML = state.insights.map((i) => `<li><b>${esc(i.type)}</b>${esc(i.text)}<small>Rule: ${esc(i.rule)}</small></li>`).join('') || '<li>No findings for this selection.</li>';
    const badge = (c) => `<span class="badge ${c.classification === 'Consistently strong' ? 'b-strong' : c.classification === 'Deteriorating' ? 'b-det' : 'b-mixed'}" title="${esc(c.classification_reason)}">${esc(c.classification)}</span>`;
    $('#glance').innerHTML = `<thead><tr><th>Company</th><th>Classification</th><th class="num">Revenue CAGR</th><th class="num">Avg net margin</th><th>Score</th></tr></thead><tbody>${
      state.summaries.map((c) => `<tr><td><b>${esc(c.ticker)}</b> ${esc(c.company_name)}</td><td>${badge(c)}</td><td class="num">${U.fmtPct(c.revenue_cagr_pct)}</td><td class="num">${U.fmtPct(c.avg_net_margin_pct)}</td>
      <td><span class="bar" style="width:${Math.round(c.performance_score * 0.6)}px"></span>${U.fmtNum(c.performance_score, 0)}</td></tr>`).join('')}</tbody>`;
    $('#recs').innerHTML = state.recs.map((r) => `<div class="rec"><div class="h">${esc(r.horizon)}</div><p>${esc(r.text)}</p><small><b>Evidence:</b> ${esc(r.evidence)}</small></div>`).join('');
    setAria('#cYearTotals', `Combined revenue and net income by year, ${state.filters.yearFrom} to ${state.filters.yearTo}.`);
  }

  // ================================================================ growth
  function highlightButtons(el, key, onChange) {
    const P = C.palette();
    const list = state.summaries.slice().sort((a, b) => b.revenue_last - a.revenue_last).map((c) => c.ticker);
    const sel = state.view[key];
    el.innerHTML = `<span class="lbl">Highlight (up to 3):</span>` + list.map((t) => { const i = sel.indexOf(t);
      return `<button type="button" aria-pressed="${i >= 0}" data-t="${esc(t)}" style="${i >= 0 ? `background:${P.series[i]}` : ''}">${esc(t)}</button>`; }).join('');
    el.onclick = (e) => { const b = e.target.closest('button[data-t]'); if (!b) return; const t = b.dataset.t; let s = state.view[key].slice();
      s = s.includes(t) ? s.filter((x) => x !== t) : [...s, t].slice(-3); state.view[key] = s; onChange(); };
  }
  function renderTrend() {
    const v = state.view, m = METRICS[v.trendMetric];
    $('#trendTitle').textContent = `${m.label} over time${v.trendMode === 'index' && m.level ? ' (index, first year = 100)' : ''}`;
    $('#trendMode').disabled = !m.level; if (!m.level) $('#trendMode').value = 'abs';
    $('#trendLog').disabled = !m.level;
    highlightButtons($('#trendHighlight'), 'trendHL', renderTrend);
    C.trend($('#cTrend'), state.filtered, { metric: v.trendMetric, highlights: v.trendHL, mode: m.level ? v.trendMode : 'abs', log: m.level && v.trendLog && v.trendMode === 'abs', onClick: openProfile });
    setAria('#cTrend', `${m.label} by year for ${state.summaries.length} companies; highlighted: ${v.trendHL.join(', ')}.`);
  }
  function renderGrowth() {
    renderTrend();
    C.rankBars($('#cCagr'), state.summaries, { valueKey: 'revenue_cagr_pct', unit: 'pct', signed: true, onClick: openProfile, note: (c) => `${c.first_year}-${c.last_year}: ${U.fmtUsdM(c.revenue_first)} to ${U.fmtUsdM(c.revenue_last)}` });
    C.companyScatter($('#cConsistency'), state.summaries, { x: 'revenue_cagr_pct', y: 'revenue_growth_volatility_pp', xLabel: 'Revenue CAGR', yLabel: 'Growth volatility (pp)', xUnit: 'pct', yUnit: 'num', onClick: openProfile });
    C.growthHeatmap($('#cHeat'), state.filtered, openProfile);
    const top = state.summaries.filter((c) => U.isNum(c.revenue_cagr_pct)).sort((a, b) => b.revenue_cagr_pct - a.revenue_cagr_pct)[0];
    setAria('#cCagr', top ? `Revenue CAGR by company; highest ${top.ticker} at ${U.fmtPct(top.revenue_cagr_pct)}.` : 'No data.');
  }

  // ================================================================ profitability
  function renderProfit() {
    C.rankBars($('#cGrossProfit'), state.summaries, { valueKey: 'total_gross_profit', unit: 'usd_m', onClick: openProfile, note: (c) => `Average gross margin ${U.fmtPct(c.avg_gross_margin_pct)}` });
    C.marginBars($('#cMargins'), state.summaries, openProfile);
    C.revVsIncome($('#cRevNi'), state.filtered, openProfile);
    C.rankBars($('#cShift'), state.summaries, { valueKey: 'net_margin_shift_pp', unit: 'pp', signed: true, onClick: openProfile, note: (c) => `Trend ${U.fmtPp(c.net_margin_trend_pp_per_year)} a year` });
    const cm = state.rel.comovement;
    $('#revNiNote').textContent = cm.revenueUp ? `In ${cm.revenueUpIncomeUp} of ${cm.revenueUp} company-years where revenue grew (${U.fmtPct(cm.revenueUpIncomeUp / cm.revenueUp * 100, 0)}), net income also grew; in ${cm.revenueUpIncomeFaster} it grew faster than revenue. Years after a loss are excluded because growth from a negative base is not meaningful.` : '';
    const rows = cm.growthWithMarginDecline.slice().sort((a, b) => a.net_margin_change_pp - b.net_margin_change_pp);
    $('#squeezeTable').innerHTML = rows.length ? `<thead><tr><th>Company</th><th class="num">Year</th><th class="num">Revenue growth</th><th class="num">Net margin change</th></tr></thead><tbody>${
      rows.map((r) => `<tr><td><b>${esc(r.ticker)}</b> ${esc(COMPANY_NAMES[r.ticker] || '')}</td><td class="num">${r.year}</td><td class="num">${U.fmtSignedPct(r.revenue_growth_pct)}</td><td class="num">${U.fmtPp(r.net_margin_change_pp)}</td></tr>`).join('')}</tbody>`
      : '<tbody><tr><td>No company-years in view where revenue grew while net margin fell by more than 1 pp.</td></tr></tbody>';
  }

  // ================================================================ ratios and market
  function renderRatioChart() {
    const v = state.view, m = METRICS[v.ratioMetric];
    $('#ratioTitle').textContent = `${m.label} over time`;
    highlightButtons($('#ratioHighlight'), 'ratioHL', renderRatioChart);
    C.trend($('#cRatio'), state.filtered, { metric: v.ratioMetric, highlights: v.ratioHL, mode: 'abs', onClick: openProfile });
  }
  function renderRatios() {
    renderRatioChart();
    C.rankBars($('#cRoe'), state.summaries, { valueKey: 'median_roe_pct', unit: 'pct', signed: true, onClick: openProfile, note: (c) => `Years with positive equity only` });
    const latest = [...A.byTicker(state.filtered).values()].map((s) => s[s.length - 1]);
    sortableTable($('#ratioTable'), 'ratios', [
      { key: 'ticker', label: 'Company' }, { key: 'year', label: 'Year', num: true },
      { key: 'gross_margin_pct', label: 'Gross margin', num: true, f: U.fmtPct }, { key: 'net_margin_pct', label: 'Net margin', num: true, f: U.fmtPct },
      { key: 'roe_pct', label: 'ROE', num: true, f: U.fmtPct }, { key: 'roa_reported', label: 'ROA', num: true, f: U.fmtPct },
      { key: 'debt_equity', label: 'Debt/equity', num: true, f: U.fmtX }, { key: 'current_ratio', label: 'Current ratio', num: true, f: U.fmtX },
      { key: 'eps', label: 'EPS', num: true, f: U.fmtUsd }, { key: 'market_cap_bn', label: 'Market cap', num: true, f: U.fmtUsdBn },
    ], latest);
    const ticks = state.summaries.map((c) => c.ticker).sort();
    $('#profileSelect').innerHTML = ticks.map((t) => `<option value="${esc(t)}" ${t === state.view.profile ? 'selected' : ''}>${esc(t)} ${esc(COMPANY_NAMES[t] || '')}</option>`).join('');
    renderProfile();
  }
  function renderProfile() {
    const t = state.view.profile; const rows = state.filtered.filter((r) => r.ticker === t);
    const c = state.summaries.find((s) => s.ticker === t);
    $('#profileName').textContent = c ? `${c.company_name} (${t}) - ${c.classification}` : 'none';
    C.profile($('#cProfile'), rows);
    setAria('#cProfile', c ? `${c.company_name}: revenue CAGR ${U.fmtPct(c.revenue_cagr_pct)}, average net margin ${U.fmtPct(c.avg_net_margin_pct)}, EPS ${U.fmtUsd(c.first_eps)} to ${U.fmtUsd(c.latest_eps)}.` : 'No company selected.');
  }

  // ================================================================ performance and drivers
  function renderDrivers() {
    sortableTable($('#scorecard'), 'scorecard', [
      { key: 'ticker', label: 'Company', f: (v, r) => `<b>${esc(v)}</b> ${esc(r.company_name)}`, html: true },
      { key: 'category', label: 'Category' }, { key: 'years', label: 'Years', num: true, f: (v, r) => `${r.first_year}-${r.last_year}` },
      { key: 'revenue_cagr_pct', label: 'Revenue CAGR', num: true, f: U.fmtPct }, { key: 'revenue_share_pct', label: 'Revenue share', num: true, f: U.fmtPct },
      { key: 'avg_gross_margin_pct', label: 'Avg gross margin', num: true, f: (v) => (U.isNum(v) ? U.fmtPct(v) : 'n/m') },
      { key: 'avg_net_margin_pct', label: 'Avg net margin', num: true, f: U.fmtPct }, { key: 'net_margin_trend_pp_per_year', label: 'Margin trend (pp/yr)', num: true, f: (v) => U.fmtNum(v, 2) },
      { key: 'median_roe_pct', label: 'Median ROE', num: true, f: U.fmtPct }, { key: 'pct_years_revenue_growth', label: 'Growth years', num: true, f: (v) => U.fmtPct(v, 0) },
      { key: 'revenue_growth_volatility_pp', label: 'Growth volatility (pp)', num: true, f: (v) => U.fmtNum(v, 1) },
      { key: 'loss_years', label: 'Loss years', num: true }, { key: 'performance_score', label: 'Score', num: true, f: (v) => U.fmtNum(v, 0) },
      { key: 'classification', label: 'Classification', html: true, f: (v, r) => `<span class="badge ${v === 'Consistently strong' ? 'b-strong' : v === 'Deteriorating' ? 'b-det' : 'b-mixed'}">${esc(v)}</span>` },
      { key: 'classification_reason', label: 'Why', wrap: true },
    ], state.summaries, 'performance_score', -1);
    renderRel();
    $('#corrTable').innerHTML = `<thead><tr><th>Relationship</th><th class="num">Pearson r</th><th class="num">p-value</th><th class="num">Spearman ρ</th><th class="num">n</th><th>Reading</th></tr></thead><tbody>${
      state.rel.pairs.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${U.isNum(p.pearson.r) ? p.pearson.r.toFixed(2) : 'n/a'}</td><td class="num">${U.isNum(p.pearson.p) ? p.pearson.p.toFixed(3) : 'n/a'}</td>
        <td class="num">${U.isNum(p.spearman.r) ? p.spearman.r.toFixed(2) : 'n/a'}</td><td class="num">${p.pearson.n}</td>
        <td>${U.isNum(p.pearson.r) ? `${U.describeCorr(p.pearson.r)}${p.pearson.p < 0.05 ? ' <span class="badge b-ok">significant at 5%</span>' : ' <span class="badge b-mixed">not significant</span>'}` : 'not enough data'}</td></tr>`).join('')}</tbody>`;
    $('#corrNote').textContent = 'Initial size uses each company\'s revenue in its first year in view, which avoids the circularity of market value (a company that grows and earns more is valued more). p-values come from a two-sided t-test of r = 0; a significant result shows association, not cause.';
  }
  function renderRel() {
    const v = state.view; const id = `${v.relX === 'initial_revenue' ? 'size' : 'mcap'}_${v.relY === 'revenue_cagr_pct' ? 'growth' : 'margin'}`;
    const pair = state.rel.pairs.find((p) => p.id === id);
    C.companyScatter($('#cRel'), state.summaries, { x: v.relX, y: v.relY, xLabel: v.relX === 'initial_revenue' ? 'Revenue in first year (log)' : 'Median market cap (log)',
      yLabel: v.relY === 'revenue_cagr_pct' ? 'Revenue CAGR' : 'Average net margin', xUnit: v.relX === 'initial_revenue' ? 'usd_m' : 'usd_bn', yUnit: 'pct',
      sizeKey: 'median_market_cap_bn', xLog: true, fit: pair && pair.fit, onClick: openProfile });
    setAria('#cRel', pair && U.isNum(pair.pearson.r) ? `${pair.label}: r = ${pair.pearson.r.toFixed(2)}, p = ${pair.pearson.p.toFixed(3)}, ${pair.pearson.n} companies.` : 'Not enough data.');
  }

  // ================================================================ data explorer
  const COLSETS = {
    key: ['ticker', 'company_name', 'category', 'year', 'revenue', 'net_income', 'net_margin_pct', 'revenue_growth_pct', 'roe_pct', 'eps', 'market_cap_bn'],
    statements: ['ticker', 'year', 'revenue', 'gross_profit', 'net_income', 'ebitda', 'equity', 'cfo', 'cfi', 'cff', 'employees'],
    ratios: ['ticker', 'year', 'gross_margin_pct', 'net_margin_pct', 'ebitda_margin_pct', 'roe_pct', 'roe_reported', 'roa_reported', 'debt_equity', 'current_ratio', 'cfo_to_net_income', 'price_to_sales'],
  };
  const LABELS = { company_name: 'Name', category: 'Category', gross_margin_pct: 'Gross margin %', net_margin_pct: 'Net margin %', ebitda_margin_pct: 'EBITDA margin %', roe_pct: 'ROE %',
    revenue_growth_pct: 'Revenue growth %', net_income_growth_pct: 'Net income growth %', cfo_to_net_income: 'Cash conversion (CFO/NI)', price_to_sales: 'Price/sales',
    revenue_per_employee_k: 'Revenue per employee (USD k)', gross_profit_valid: 'Gross profit (meaningful)', net_margin_change_pp: 'Net margin change (pp)', _src: 'Source' };
  function colDefs(set) {
    const keys = set === 'all' ? [...D.INPUT_KEYS, 'company_name', 'category', 'gross_margin_pct', 'net_margin_pct', 'ebitda_margin_pct', 'roe_pct', 'revenue_growth_pct', 'net_income_growth_pct', 'net_margin_change_pp', 'cfo_to_net_income', 'revenue_per_employee_k', 'price_to_sales', '_src'] : COLSETS[set];
    return keys.map((k) => { const f = D.FIELD_BY_KEY[k]; const numeric = !['ticker', 'company_name', 'category', 'category_source', '_src'].includes(k);
      return { key: k, label: LABELS[k] || (f ? f.label + (f.unit && !['USD m', '%', ''].includes(f.unit) ? ` (${f.unit})` : '') : k), num: numeric,
        f: (v) => (v === null || v === undefined ? '' : k === 'year' ? v : typeof v === 'number' ? U.fmtNum(v, Math.abs(v) < 100 && !Number.isInteger(v) ? 2 : 0) : esc(v)) }; });
  }
  function renderExplorer() {
    const t = state.view.table; const q = t.search.trim().toLowerCase();
    let rows = state.filtered.map((r) => ({ ...r, _src: r._batch && r._batch !== 'base' ? 'Upload' : 'Original' }));
    if (q) rows = rows.filter((r) => `${r.ticker} ${r.company_name} ${r.category} ${r.year}`.toLowerCase().includes(q));
    rows.sort((a, b) => cmp(a[t.sort], b[t.sort]) * t.dir || cmp(a.ticker, b.ticker) || a.year - b.year);
    const pages = Math.max(1, Math.ceil(rows.length / t.size)); t.page = Math.min(t.page, pages);
    const slice = rows.slice((t.page - 1) * t.size, t.page * t.size);
    const cols = colDefs(t.cols);
    $('#explorer').innerHTML = `<thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}" data-k="${c.key}" aria-sort="${t.sort === c.key ? (t.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${slice.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.f(r[c.key])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="empty">No records match.</td></tr>`}</tbody>`;
    $('#tCount').textContent = `${rows.length} of ${state.all.length} records (${state.filtered.length} after filters${q ? `, ${rows.length} matching "${t.search}"` : ''}). Page ${t.page} of ${pages}. Statement values in USD millions.`;
    const btn = (p, l, dis, cur) => `<button type="button" data-p="${p}" ${dis ? 'disabled' : ''} ${cur ? 'aria-current="page"' : ''}>${l}</button>`;
    let html = btn(t.page - 1, '‹ Prev', t.page === 1);
    for (let p = Math.max(1, t.page - 2); p <= Math.min(pages, t.page + 2); p++) html += btn(p, p, false, p === t.page);
    $('#pager').innerHTML = html + btn(t.page + 1, 'Next ›', t.page === pages);
  }
  const cmp = (a, b) => (a === b ? 0 : a === null || a === undefined ? 1 : b === null || b === undefined ? -1 : typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)));

  // generic sortable table (used by ratio table and scorecard)
  function sortableTable(el, id, cols, rows, defSort, defDir = 1) {
    const s = state.view.sorts[id] || (state.view.sorts[id] = { key: defSort || cols[0].key, dir: defDir });
    const data = rows.slice().sort((a, b) => cmp(a[s.key], b[s.key]) * s.dir);
    el.innerHTML = `<thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}" data-k="${c.key}" tabindex="0" aria-sort="${s.key === c.key ? (s.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${data.map((r) => `<tr>${cols.map((c) => { const v = r[c.key]; const out = c.f ? (c.f.length > 1 ? c.f(v, r) : c.f(v)) : v === null || v === undefined ? 'n/a' : esc(v);
        return `<td class="${c.num ? 'num' : ''}${c.wrap ? ' wrap' : ''}">${c.html || c.f ? out : esc(out)}</td>`; }).join('')}</tr>`).join('')}</tbody>`;
    el.onclick = el.onkeydown = (e) => { if (e.type === 'keydown' && e.key !== 'Enter') return; const th = e.target.closest('th[data-k]'); if (!th) return;
      const k = th.dataset.k; s.dir = s.key === k ? -s.dir : (cols.find((c) => c.key === k).num ? -1 : 1); s.key = k; sortableTable(el, id, cols, rows, defSort, defDir); };
  }

  // ================================================================ data management (upload)
  const MODE_LABEL = { append: 'Add new records', merge: 'Update or add', replace: 'Replace dataset' };
  const currentMode = () => $('input[name="mode"]:checked').value;
  async function handleFile(file) {
    busy(true, `Reading ${file.name}...`);
    try {
      const parsed = await D.readFile(file);
      const map = D.mapColumns(parsed.headers);
      if (map.missingRequired.length) {
        state.pending = null;
        $('#uploadPanel').innerHTML = `<div class="msg err"><b>Upload rejected: required columns missing.</b> "${esc(file.name)}" has no column for: ${map.missingRequired.map(esc).join(', ')}.
          <ul><li>Columns found: ${parsed.headers.map((h) => `"${esc(h)}"`).join(', ') || 'none'}</li><li>Rename the columns (see "Upload file format" under Methodology &amp; help) and try again. Nothing was changed.</li></ul></div>`;
        return;
      }
      const byTicker = new Map(); state.records.forEach((r) => byTicker.set(r.ticker, r));
      const v = D.validateRows(parsed.rows, map, byTicker);
      state.pending = { fileName: file.name, size: file.size, parsed, map, v };
      previewPending();
    } catch (e) {
      state.pending = null;
      $('#uploadPanel').innerHTML = `<div class="msg err"><b>The file could not be used.</b> ${esc(e instanceof D.UserError ? e.message : 'It may be damaged or in an unexpected format.')} Nothing was changed.</div>`;
      if (!(e instanceof D.UserError)) console.error(e);
    } finally { busy(false); $('#fileInput').value = ''; }
  }
  function previewPending() {
    const p = state.pending; if (!p) return;
    const mode = currentMode();
    const sim = D.applyBatch(state.records, p.v.accepted, mode, p.map.present, 'preview');
    p.mode = mode; p.sim = sim;
    const s = sim.summary, v = p.v;
    const invalid = v.rejected.filter((r) => r.type === 'invalid').length, dupFile = v.rejected.filter((r) => r.type === 'duplicate_in_file').length;
    const canApply = mode === 'replace' ? v.accepted.length > 0 : s.inserted + s.updated > 0;
    const problems = [...v.rejected, ...sim.skipped];
    $('#uploadPanel').innerHTML = `
      <p><b>${esc(p.fileName)}</b> · ${U.fmtBytes(p.size)} · mode: <b>${MODE_LABEL[mode]}</b></p>
      <div class="summary-grid">
        <div class="stat"><b>${p.parsed.rows.length}</b><span>rows in file</span></div>
        <div class="stat"><b>${v.accepted.length}</b><span>passed validation</span></div>
        <div class="stat"><b>${invalid}</b><span>invalid (rejected)</span></div>
        <div class="stat"><b>${dupFile + s.duplicatesExisting}</b><span>duplicates</span></div>
        ${mode === 'append' ? `<div class="stat"><b>${s.conflicts}</b><span>existing company-years with different values</span></div>` : ''}
        <div class="stat"><b>${s.inserted}</b><span>${mode === 'replace' ? 'records in new dataset' : 'new records to add'}</span></div>
        ${mode === 'merge' ? `<div class="stat"><b>${s.updated}</b><span>records to update</span></div><div class="stat"><b>${s.unchanged}</b><span>already identical</span></div>` : ''}
      </div>
      ${mode === 'replace' ? `<div class="msg warn">Replacing removes the current ${state.records.length} records from the analysis (you can undo this afterwards).</div>` : ''}
      ${!canApply ? '<div class="msg warn">There is nothing to apply: no new or changed records in this file for the chosen mode.</div>' : ''}
      <details class="more"><summary>Column mapping (${p.map.notes.length} matched${p.map.unknown.length ? `, ${p.map.unknown.length} ignored` : ''})</summary>
        <ul>${p.map.notes.map((n) => `<li>"${esc(n.header)}" → ${esc(n.field)} <small class="note">(${n.method})</small></li>`).join('')}
        ${p.map.unknown.map((h) => `<li>"${esc(h)}" → <i>not recognised, ignored</i></li>`).join('')}${p.map.clashes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
        ${p.map.missingOptional.length ? `<p class="note">Optional columns not in the file (stored as missing${mode === 'merge' ? ', existing values kept' : ''}): ${p.map.missingOptional.map(esc).join(', ')}.</p>` : ''}
      </details>
      ${problems.length ? `<details class="more" open><summary>Rows not used (${problems.length})</summary><div class="table-wrap"><table class="data compact"><thead><tr><th class="num">Row</th><th>Company-year</th><th>Reason</th></tr></thead><tbody>
        ${problems.slice(0, 200).map((r) => `<tr><td class="num">${r.row}</td><td>${esc(r.key)}</td><td class="wrap">${esc(r.reason)}</td></tr>`).join('')}</tbody></table></div>${problems.length > 200 ? '<p class="note">First 200 shown; download the validation results for all.</p>' : ''}</details>` : ''}
      ${v.warnings.length ? `<details class="more"><summary>Warnings (${v.warnings.length}, rows still accepted)</summary><ul>${v.warnings.slice(0, 100).map((w) => `<li>Row ${w.row}, ${esc(w.field)}: ${esc(w.message)}</li>`).join('')}</ul></details>` : ''}
      <div class="btn-row">
        <button class="btn btn-primary" type="button" id="btnApply" ${canApply ? '' : 'disabled'}>Apply upload</button>
        <button class="btn btn-ghost" type="button" id="btnCancel">Cancel</button>
        <button class="btn btn-ghost" type="button" id="btnValidation">Download validation results</button>
      </div>`;
    $('#btnApply').onclick = applyPending;
    $('#btnCancel').onclick = () => { state.pending = null; $('#uploadPanel').innerHTML = '<p class="empty">Upload cancelled. Nothing was changed.</p>'; };
    $('#btnValidation').onclick = () => window.FinExport.validationCsv({ fileName: p.fileName, rejected: problems, warnings: v.warnings });
  }
  async function applyPending() {
    const p = state.pending; if (!p) return;
    if (p.mode === 'replace' && !(await confirmBox(`Replace the current ${state.records.length} records with the ${p.v.accepted.length} valid records from "${p.fileName}"? You can undo this with "Undo last upload".`))) return;
    const id = `${Date.now().toString(36)}`;
    const res = D.applyBatch(state.records, p.v.accepted, p.mode, p.map.present, id);
    const s = res.summary, v = p.v;
    const dupFile = v.rejected.filter((r) => r.type === 'duplicate_in_file').length, invalid = v.rejected.filter((r) => r.type === 'invalid').length;
    const counts = { processed: p.parsed.rows.length, accepted: s.inserted + s.updated + s.unchanged, duplicates: dupFile + s.duplicatesExisting, rejected: invalid + s.conflicts,
      inserted: s.inserted, updated: s.updated, unchanged: s.unchanged, conflicts: s.conflicts, removed: s.removed };
    const batch = { id, file: p.fileName, size: p.size, mode: p.mode, at: new Date().toISOString(), counts, snapshot: state.records };
    state.records = res.next; state.batches.push(batch); state.updatedAt = batch.at; state.pending = null;
    const saved = await persist();
    recompute(p.mode === 'replace');
    const msg = `Data successfully ${p.mode === 'replace' ? 'replaced' : 'added'}. ${counts.processed} records were processed, ${counts.accepted} were accepted (${counts.inserted} added${p.mode === 'merge' ? `, ${counts.updated} updated` : ''}), ${counts.duplicates} duplicate${counts.duplicates === 1 ? ' was' : 's were'} detected and ${counts.rejected} record${counts.rejected === 1 ? ' was' : 's were'} rejected.`;
    $('#uploadPanel').innerHTML = `<div class="msg ok"><b>${esc(msg)}</b><br>All KPIs, charts, tables, the report and the exports now use the updated dataset.${saved ? ' Saved in this browser.' : ' <b>Not saved:</b> browser storage is unavailable, so the changes last until the page is closed.'}</div>`;
    toast(msg);
  }
  async function persist() {
    if (!state.storage) return false;
    const r = await S.save({ records: state.records, batches: state.batches, updatedAt: state.updatedAt });
    return r.ok;
  }
  async function undoLast() {
    const b = state.batches[state.batches.length - 1]; if (!b) return;
    if (!(await confirmBox(`Undo the upload of "${b.file}" (${MODE_LABEL[b.mode]}, ${new Date(b.at).toLocaleString('en-GB')})? The dataset returns to how it was before that upload.`))) return;
    state.records = b.snapshot; state.batches.pop(); state.updatedAt = state.batches.length ? state.batches[state.batches.length - 1].at : null;
    if (state.batches.length) await persist(); else await S.clear();
    recompute(b.mode === 'replace'); toast(`Upload of "${b.file}" undone.`);
  }
  async function resetAll() {
    if (!(await confirmBox('Remove all uploaded data from this browser and return to the original dataset? This cannot be undone.'))) return;
    await S.clear(); state.records = state.baseRecords.slice(); state.batches = []; state.updatedAt = null; state.pending = null;
    $('#uploadPanel').innerHTML = '<p class="empty">No file selected yet.</p>';
    recompute(true); toast('Back to the original dataset. Locally saved data was cleared.');
  }
  function renderDataTab() {
    const uploads = state.records.filter((r) => r._batch && r._batch !== 'base').length;
    $('#storeInfo').innerHTML = `<p>${state.batches.length ? `<b>${state.records.length}</b> records in the working dataset, of which <b>${uploads}</b> come from uploads.` : `Using the original dataset (<b>${state.records.length}</b> records). No uploads yet.`}
      ${state.storage ? 'Changes are saved in this browser (IndexedDB) and reloaded next time you open the dashboard here.' : '<b>Browser storage is unavailable</b> (for example in a private window), so changes last only until the page is closed.'}</p>`;
    $('#batchTable').innerHTML = state.batches.length ? `<thead><tr><th>#</th><th>When</th><th>File</th><th>Mode</th><th class="num">Rows</th><th class="num">Added</th><th class="num">Updated</th><th class="num">Duplicates</th><th class="num">Rejected</th></tr></thead><tbody>${
      state.batches.map((b, i) => `<tr><td>${i + 1}</td><td>${new Date(b.at).toLocaleString('en-GB')}</td><td>${esc(b.file)}</td><td>${MODE_LABEL[b.mode]}</td><td class="num">${b.counts.processed}</td>
        <td class="num">${b.counts.inserted}</td><td class="num">${b.counts.updated}</td><td class="num">${b.counts.duplicates}</td><td class="num">${b.counts.rejected}</td></tr>`).join('')}</tbody>` : '';
    $('#btnUndo').disabled = !state.batches.length; $('#btnClear').disabled = !state.batches.length;
  }

  // ================================================================ methodology tab and static content
  function renderMethod() {
    const all = state.all;
    const c = cleaningCounts(all);
    $('#cleanRules').innerHTML = `<thead><tr><th>Rule</th><th>What happens</th><th class="num">Records</th></tr></thead><tbody>${[
      ['C1 Column names', 'Header whitespace trimmed and names matched to the standard schema', all.length],
      ['C2 Categories', 'Labels standardised (BANK/Bank to Bank, ELEC to Electronics, FOOD to Food, LOGI to Logistics)', c.category],
      ['C3 Gross margin', 'Gross profit equal to revenue (no cost of sales): gross margin not meaningful', c.gross],
      ['C4 EBITDA', 'Placeholder value of 1 treated as missing', c.ebitda],
      ['C5 Current ratio', 'Placeholder of exactly 1.0 treated as missing', c.current],
      ['C6 Negative equity', 'Equity of zero or less: ROE and debt/equity not meaningful', c.equity],
      ['C7 Missing values', 'Kept missing, never imputed (market cap)', c.missingMcap],
    ].map((r) => `<tr><td>${r[0]}</td><td class="wrap">${r[1]}</td><td class="num">${r[2]}</td></tr>`).join('')}</tbody>`;
  }
  function renderStatic() {
    $('#srcName').textContent = window.BASE_DATASET.name;
    $('#kpiDefs').innerHTML = `<thead><tr><th>KPI</th><th>Formula</th><th>Comparison</th><th>Unit</th><th>Fields</th></tr></thead><tbody>${
      KPI_DEFS.map((k) => `<tr><td><b>${esc(k.name)}</b></td><td class="wrap">${esc(k.formula)}</td><td class="wrap">${esc(k.compare)}</td><td>${esc(k.unit)}</td><td>${esc(k.fields)}</td></tr>`).join('')}
      <tr><td><b>Revenue CAGR</b></td><td class="wrap">(last revenue / first revenue)^(1 / (last year - first year)) - 1, per company</td><td class="wrap">Ranking across companies</td><td>% a year</td><td>revenue, year</td></tr>
      <tr><td><b>Gross / net / EBITDA margin</b></td><td class="wrap">Gross profit, net income or EBITDA / revenue x 100</td><td class="wrap">Average of yearly values</td><td>%</td><td>statement lines</td></tr>
      <tr><td><b>Margin trend</b></td><td class="wrap">Least-squares slope of net margin on year (3+ years)</td><td class="wrap">pp per year</td><td>pp</td><td>net margin</td></tr>
      <tr><td><b>Growth volatility</b></td><td class="wrap">Standard deviation of year-on-year revenue growth</td><td class="wrap">Lower = steadier</td><td>pp</td><td>revenue</td></tr>
      <tr><td><b>Performance score</b></td><td class="wrap">Average percentile rank of CAGR, average net margin, median ROE and share of growth years among companies in view</td><td class="wrap">Relative (0-100)</td><td>score</td><td>derived</td></tr></tbody>`;
    const R = RULES;
    $('#ruleList').innerHTML = [
      `<b>Deteriorating</b> if any of: loss in the latest year in view; revenue CAGR below 0; net margin trend of ${R.deteriorating.marginTrendMax} pp a year or worse; net margin down ${-R.deteriorating.marginShiftMax} pp or more (average of the last 3 years vs the first 3).`,
      `<b>Consistently strong</b> if all of: revenue CAGR of ${R.strong.cagrMin}% or more; average net margin of ${R.strong.avgNetMarginMin}% or more; profitable in at least ${R.strong.profitableYearsMin}% of years; margin trend of ${R.strong.marginTrendMin} pp a year or better.`,
      '<b>Mixed</b>: everything else. The reason is shown next to every label.',
      `<b>Growth with margin decline</b>: a company-year in which revenue rose and net margin fell by more than ${-R.marginDeclineFlagPp} pp.`,
      `<b>Reference year</b>: the latest year in which at least ${R.referenceYearCoverage * 100}% of the companies in view report.`,
      '<b>Key findings</b> are produced by fixed rules (each shows its rule) from the current data; they are not AI-generated and contain no pre-written results.',
    ].map((t) => `<li>${t}</li>`).join('');
    $('#schemaTable').innerHTML = `<thead><tr><th>Field</th><th>Required</th><th>Type</th><th>Unit</th><th>Accepted column names</th></tr></thead><tbody>${
      FIELDS.map((f) => `<tr><td><b>${esc(f.label)}</b></td><td>${f.required ? 'Yes' : 'No'}</td><td>${f.type === 'int' ? 'whole number' : f.type === 'num' ? 'number' : 'text'}</td><td>${esc(f.unit)}</td><td class="wrap">${f.aliases.map(esc).join(', ')}</td></tr>`).join('')}</tbody>`;
    const trendOpts = Object.entries(METRICS).filter(([k]) => !['debt_equity', 'current_ratio', 'roa_reported'].includes(k));
    $('#trendMetric').innerHTML = trendOpts.map(([k, m]) => `<option value="${k}" ${k === state.view.trendMetric ? 'selected' : ''}>${m.label}</option>`).join('');
    $('#ratioMetric').innerHTML = ['roe_pct', 'roa_reported', 'net_margin_pct', 'gross_margin_pct', 'ebitda_margin_pct', 'debt_equity', 'current_ratio', 'eps', 'market_cap_bn']
      .map((k) => `<option value="${k}" ${k === state.view.ratioMetric ? 'selected' : ''}>${METRICS[k].label}</option>`).join('');
  }
  function cleaningCounts(rows) {
    return { category: rows.filter((r) => String(r.category_source).trim() !== r.category).length, gross: rows.filter((r) => r.flag_gross_margin_nm).length,
      ebitda: rows.filter((r) => r.flag_ebitda_placeholder).length, current: rows.filter((r) => r.flag_current_ratio_placeholder).length,
      equity: rows.filter((r) => r.flag_negative_equity).length, missingMcap: rows.filter((r) => !U.isNum(r.market_cap_bn)).length };
  }

  // ================================================================ report and data downloads
  function scopeData(scope) {
    const rows = scope === 'full' ? state.all : state.filtered;
    const summaries = scope === 'full' ? A.companySummaries(rows) : state.summaries;
    return { rows, summaries };
  }
  async function generateReport(scope) {
    const { rows, summaries } = scopeData(scope);
    if (!rows.length) { toast('No records in this scope: nothing to report.'); return; }
    busy(true, 'Building the PDF report...');
    try {
      const k = A.kpis(rows, summaries), rel = A.relationships(summaries, rows);
      const res = await window.FinReport.generate({
        scope, rows, summaries, kpis: k, rel, insights: A.insights(rows, summaries, k, rel), recs: A.recommendations(summaries, rel, rows),
        scopeLabel: scope === 'full' ? 'Entire available dataset' : 'Current filtered view', filtersDesc: scope === 'full' ? 'None (entire dataset)' : filtersDescription(),
        datasetStatus: datasetStatusText(), sourceName: `${window.BASE_DATASET.name}${state.batches.length ? ` plus ${state.batches.length} upload(s)` : ''}`,
        cleaningCounts: cleaningCounts(rows),
        uploads: state.batches.map((b) => ({ at: b.at, file: b.file, modeLabel: MODE_LABEL[b.mode], resultText: `${b.counts.inserted} added, ${b.counts.updated} updated, ${b.counts.duplicates} duplicates, ${b.counts.rejected} rejected` })),
      });
      toast(`Report downloaded: ${res.fname} (${res.pages} pages).`);
    } catch (e) { console.error(e); toast('The report could not be generated. Please try again.'); } finally { busy(false); }
  }
  async function downloadData(scope, fmt) {
    const { rows, summaries } = scopeData(scope);
    if (!rows.length) { toast('No records in this scope: nothing to download.'); return; }
    if (fmt === 'xlsx') { busy(true, 'Building the Excel file...'); try { await window.FinExport.dataXlsx(rows, summaries, scope, { filters: scope === 'full' ? 'None' : filtersDescription(), status: datasetStatusText() }); } finally { busy(false); } }
    else window.FinExport.dataCsv(rows, scope);
    toast(`Downloaded ${rows.length} records (${scope === 'full' ? 'full dataset' : 'filtered view'}, ${fmt.toUpperCase()}).`);
  }

  // ================================================================ helpers: toast, busy, confirm, aria, tabs
  let toastTimer;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 5200); }
  function busy(on, text) { $('#busy').hidden = !on; if (text) $('#busyText').textContent = text; }
  function confirmBox(text) {
    return new Promise((resolve) => { const d = $('#dlgConfirm'); $('#dlgConfirmText').textContent = text; d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }); d.showModal(); });
  }
  function setAria(sel, text) { const el = $(sel); if (el) el.setAttribute('aria-label', text); }
  function switchTab(tab) {
    state.view.tab = tab;
    $$('[role="tab"]').forEach((b) => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    $$('.tab-panel').forEach((p) => { p.hidden = p.id !== `tab-${tab}`; });
    renderTab(tab); requestAnimationFrame(C.resizeAll);
  }
  function templateCsv() {
    const head = ['Year', 'Company', 'Category', 'Market Cap(in B USD)', 'Revenue', 'Gross Profit', 'Net Income', 'Earning Per Share', 'EBITDA', 'Share Holder Equity', 'Cash Flow from Operating',
      'Cash Flow from Investing', 'Cash Flow from Financial Activities', 'Current Ratio', 'Debt/Equity Ratio', 'ROE', 'ROA', 'ROI', 'Net Profit Margin', 'Free Cash Flow per Share',
      'Return on Tangible Equity', 'Number of Employees', 'Inflation Rate(in US)'];
    return head.join(',') + '\r\n';
  }
  // Fictional test file: company "DEMO" is invented; it also contains one exact duplicate of an existing row and one invalid row,
  // so a user can see duplicate detection and validation messages working.
  function sampleCsv() {
    const lines = [templateCsv().trim()];
    let rev = 1200, eq = 900;
    for (let y = 2015; y <= 2022; y++) {
      rev = Math.round(rev * (1.12 + ((y % 3) - 1) * 0.04)); const ni = Math.round(rev * (0.08 + (y - 2015) * 0.006)); eq = Math.round(eq + ni * 0.6);
      lines.push([y, 'DEMO', 'IT', (rev * 4 / 1000).toFixed(2), rev, Math.round(rev * 0.55), ni, (ni / 300).toFixed(2), Math.round(rev * 0.2), eq, Math.round(ni * 1.3), -Math.round(rev * 0.1), -Math.round(ni * 0.4), 1.8, 0.4, '', '', '', '', '', '', 1500 + (y - 2015) * 150, ''].join(','));
    }
    const ex = state.baseRecords.find((r) => r.ticker === 'AAPL' && r.year === 2022);
    if (ex) lines.push([ex.year, ex.ticker, ex.category_source, ex.market_cap_bn, ex.revenue, ex.gross_profit, ex.net_income, ex.eps, ex.ebitda, ex.equity, ex.cfo, ex.cfi, ex.cff, ex.current_ratio, ex.debt_equity, ex.roe_reported, ex.roa_reported, ex.roi_reported, ex.net_margin_reported, ex.fcf_per_share, ex.rote_reported, ex.employees, ex.inflation_us_pct].join(','));
    lines.push(['20X3', 'DEMO', 'IT', '', 'abc', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''].join(','));
    return lines.join('\r\n') + '\r\n';
  }

  // ================================================================ event wiring
  function wire() {
    $('#tabList').addEventListener('click', (e) => { const b = e.target.closest('[role="tab"]'); if (b) switchTab(b.dataset.tab); });
    $('#tabList').addEventListener('keydown', (e) => { if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return; const tabs = $$('[role="tab"]'); const i = tabs.findIndex((t) => t.dataset.tab === state.view.tab);
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; n.focus(); switchTab(n.dataset.tab); });
    const onYear = () => { let a = +$('#fYearFrom').value, b = +$('#fYearTo').value; if (a > b) [a, b] = [b, a]; state.filters.yearFrom = a; state.filters.yearTo = b; buildFilterOptionsKeep(); refresh(); };
    $('#fYearFrom').onchange = onYear; $('#fYearTo').onchange = onYear;
    const multi = (box, key) => {
      $(box).addEventListener('change', () => { state.filters[key] = readMulti(box, $$(`${box} input`).length); refresh(); });
      $(box).addEventListener('click', (e) => { if (e.target.matches('[data-all],[data-none]')) { const on = e.target.matches('[data-all]'); $$(`${box} input`).forEach((i) => { i.checked = on; }); state.filters[key] = on ? [] : ['__none__']; refresh(); } });
    };
    multi('#fCategory', 'categories'); multi('#fCompany', 'tickers');
    document.addEventListener('click', (e) => { $$('details.multi[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; }); });
    $('#btnReset').onclick = () => { recompute(true); toast('Filters reset: showing all data.'); };
    $('#activeFilters').onclick = (e) => { const c = e.target.closest('[data-chip]'); if (!c) return; const k = c.dataset.chip; const years = state.all.map((r) => r.year);
      if (k === 'years') { state.filters.yearFrom = Math.min(...years); state.filters.yearTo = Math.max(...years); }
      else if (k === 'ticks') state.filters.tickers = [];
      else if (k.startsWith('cat:')) { const rest = state.filters.categories.filter((x) => x !== k.slice(4)); state.filters.categories = rest; }
      buildFilterOptionsKeep(); refresh(); };
    $('#trendMetric').onchange = (e) => { state.view.trendMetric = e.target.value; renderTrend(); };
    $('#trendMode').onchange = (e) => { state.view.trendMode = e.target.value; renderTrend(); };
    $('#trendLog').onchange = (e) => { state.view.trendLog = e.target.checked; renderTrend(); };
    $('#ratioMetric').onchange = (e) => { state.view.ratioMetric = e.target.value; renderRatioChart(); };
    $('#profileSelect').onchange = (e) => { state.view.profile = e.target.value; renderProfile(); };
    $('#relX').onchange = (e) => { state.view.relX = e.target.value; renderRel(); };
    $('#relY').onchange = (e) => { state.view.relY = e.target.value; renderRel(); };
    $('#tSearch').addEventListener('input', U.debounce((e) => { state.view.table.search = e.target.value; state.view.table.page = 1; renderExplorer(); }, 200));
    $('#tCols').onchange = (e) => { state.view.table.cols = e.target.value; renderExplorer(); };
    $('#tPage').onchange = (e) => { state.view.table.size = +e.target.value; state.view.table.page = 1; renderExplorer(); };
    $('#pager').onclick = (e) => { const b = e.target.closest('button[data-p]'); if (!b || b.disabled) return; state.view.table.page = +b.dataset.p; renderExplorer(); };
    $('#explorer').onclick = (e) => { const th = e.target.closest('th[data-k]'); if (!th) return; const t = state.view.table; t.dir = t.sort === th.dataset.k ? -t.dir : 1; t.sort = th.dataset.k; renderExplorer(); };
    // upload
    const drop = $('#drop'), input = $('#fileInput');
    drop.onclick = () => input.click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    input.onchange = () => { if (input.files[0]) handleFile(input.files[0]); };
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
    $$('input[name="mode"]').forEach((r) => { r.onchange = previewPending; });
    $('#btnUndo').onclick = undoLast; $('#btnClear').onclick = resetAll;
    $('#btnSummaryCsv').onclick = () => window.FinExport.summaryCsv(state.summaries, 'filtered');
    $('#templateLink').onclick = (e) => { e.preventDefault(); U.download(new Blob([templateCsv()], { type: 'text/csv' }), 'financial_statements_template.csv'); };
    $('#sampleLink').onclick = (e) => { e.preventDefault(); U.download(new Blob([sampleCsv()], { type: 'text/csv' }), 'test_upload_fictional_DEMO.csv'); };
    // downloads
    $('#btnReport').onclick = () => { $('#rScopeFiltered').textContent = `(${state.filtered.length} records)`; $('#rScopeFull').textContent = `(${state.all.length} records)`; $('#dlgReport').showModal(); };
    $('#dlgReport').addEventListener('close', () => { if ($('#dlgReport').returnValue === 'ok') generateReport($('input[name="rscope"]:checked').value); });
    $('#btnData').onclick = () => { $('#dScopeFiltered').textContent = `(${state.filtered.length} records)`; $('#dScopeFull').textContent = `(${state.all.length} records)`; $('#dlgData').showModal(); };
    $('#dlgData').addEventListener('close', () => { if ($('#dlgData').returnValue === 'ok') downloadData($('input[name="dscope"]:checked').value, $('input[name="dfmt"]:checked').value); });
    // theme, fullscreen, resize
    $('#btnTheme').onclick = () => { const dark = getComputedStyle(document.documentElement).getPropertyValue('color-scheme').trim() === 'dark';
      document.documentElement.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('fin-theme', document.documentElement.dataset.theme); } catch (e) { /* ignore */ }
      ['overview', 'growth', 'profit', 'ratios', 'drivers'].forEach((t) => state.dirty.add(t)); renderTab(state.view.tab); };
    document.addEventListener('click', (e) => { const b = e.target.closest('.fs'); if (!b) return; const card = b.closest('.card');
      if (document.fullscreenElement) document.exitFullscreen(); else if (card.requestFullscreen) card.requestFullscreen(); });
    document.addEventListener('fullscreenchange', () => setTimeout(C.resizeAll, 80));
    window.addEventListener('resize', U.debounce(C.resizeAll, 150));
  }
  function buildFilterOptionsKeep() { const years = state.all.map((r) => r.year); buildFilterOptions(Math.min(...years), Math.max(...years)); }

  // exposed for automated tests (read-only views of state)
  window.FinApp = { state, refresh, recompute };
  document.addEventListener('DOMContentLoaded', init);
})();

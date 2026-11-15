/* charts.js - ECharts builders. Colours come from CSS custom properties so light and dark mode share one code path.
   Rules followed: one y-axis per chart, at most 3 highlighted series (others drawn in grey), categorical colours
   in a fixed order, status colours reserved, values formatted with units in every tooltip. */
(function () {
  'use strict';
  const U = window.FinUtils;
  const { METRICS } = window.FinConfig;
  const instances = new Map();
  let animate = true;                       // switched off while charts are rendered for the PDF report
  const setAnimation = (on) => { animate = on; };

    // Colours are read from the chart element itself, so an element inside a light-themed container (the PDF report
  // canvas) gets light colours even when the page is in dark mode.
  function palette(el) {
    const cs = getComputedStyle(el || document.documentElement); const css = (n) => cs.getPropertyValue(n).trim();
    return {
      text: css('--text-primary'), text2: css('--text-secondary'), muted: css('--text-muted'), grid: css('--grid'), axis: css('--axis'),
      surface: css('--surface-1'), series: [css('--series-1'), css('--series-2'), css('--series-3')], other: css('--series-other'),
      pos: css('--div-pos'), neg: css('--div-neg'), mid: css('--div-mid'),
      cls: { 'Consistently strong': css('--series-1'), Mixed: css('--series-other'), Deteriorating: css('--series-2') },
    };
  }
  function get(el) {
    let c = instances.get(el);
    if (!c || c.isDisposed()) { c = window.echarts.init(el, null, { renderer: 'canvas' }); instances.set(el, c); }
    return c;
  }
  function render(el, option, onClick) {
    const c = get(el); c.clear();
    c.setOption({ aria: { enabled: true }, animation: animate, animationDuration: 300, textStyle: { fontFamily: 'Inter, system-ui, sans-serif' }, ...option }, true);
    c.off('click'); if (onClick) c.on('click', (p) => onClick(p));
    return c;
  }
  const axisCommon = (P) => ({ axisLine: { lineStyle: { color: P.axis } }, axisTick: { show: false }, axisLabel: { color: P.text2, fontSize: 11 }, splitLine: { lineStyle: { color: P.grid } }, nameTextStyle: { color: P.text2, fontSize: 11 } });
  const tip = (P) => ({ backgroundColor: P.surface, borderColor: P.axis, textStyle: { color: P.text, fontSize: 12 }, extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,.12);border-radius:8px;' });
  function axisFmt(unit) {
    return (v) => (unit === 'usd_m' ? (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(0)}bn` : `$${v}m`) : unit === 'usd_bn' ? `$${v}bn` : unit === 'pct' ? `${v}%` : unit === 'x' ? `${v}x` : unit === 'usd' ? `$${v}` : unit === 'pp' ? `${v} pp` : `${v}`);
  }
  function empty(el, msg) { render(el, { title: { text: msg, left: 'center', top: 'middle', textStyle: { color: palette(el).muted, fontSize: 13, fontWeight: 'normal' } } }); }

  // ---------------------------------------------------------------- trend explorer: grey context lines + up to 3 highlights
  function trend(el, rows, { metric, highlights = [], mode = 'abs', log = false, onClick }) {
    const P = palette(el), m = METRICS[metric];
    const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
    if (!years.length) return empty(el, 'No data for the current filters');
    const by = window.FinAnalytics.byTicker(rows);
    const indexed = mode === 'index' && m.level;
    const series = [];
    const hl = highlights.filter((t) => by.has(t)).slice(0, 3);
    [...by.keys()].sort((a, b) => (hl.includes(a) ? 1 : 0) - (hl.includes(b) ? 1 : 0)).forEach((t) => {
      const s = by.get(t); const base = s.find((r) => U.isNum(r[metric]) && r[metric] > 0);
      const data = years.map((y) => { const r = s.find((q) => q.year === y); if (!r || !U.isNum(r[metric])) return null;
        if (indexed) return base && r.year >= base.year && r[metric] > 0 ? +(r[metric] / base[metric] * 100).toFixed(2) : null;
        return log && r[metric] <= 0 ? null : r[metric]; });
      const h = hl.indexOf(t);
      series.push({ name: t, type: 'line', data, connectNulls: false, symbol: h >= 0 ? 'circle' : 'none', symbolSize: 6, z: h >= 0 ? 5 : 1,
        lineStyle: { width: h >= 0 ? 2.5 : 1.2, color: h >= 0 ? P.series[h] : P.other, opacity: h >= 0 ? 1 : 0.55 }, itemStyle: { color: h >= 0 ? P.series[h] : P.other },
        emphasis: { focus: 'series', lineStyle: { width: 3 } },
        endLabel: { show: h >= 0, formatter: '{a}', color: P.text, fontWeight: 600, fontSize: 11 } });
    });
    const unit = indexed ? 'idx' : m.unit;
    render(el, {
      grid: { left: 64, right: 60, top: 24, bottom: 36 },
      tooltip: { ...tip(P), trigger: 'axis', order: 'valueDesc', valueFormatter: (v) => (v === null || v === undefined ? 'n/a' : indexed ? `${v.toFixed(0)} (first year = 100)` : U.fmtByUnit(v, m.unit)) },
      xAxis: { type: 'category', data: years, boundaryGap: false, ...axisCommon(P), splitLine: { show: false } },
      yAxis: { type: log ? 'log' : 'value', scale: !m.level, ...axisCommon(P), axisLabel: { color: P.text2, fontSize: 11, formatter: axisFmt(unit) } },
      series,
    }, onClick && ((p) => p.seriesName && onClick(p.seriesName)));
  }

  // ---------------------------------------------------------------- ranked horizontal bars (single hue; diverging when signed)
  function rankBars(el, items, { valueKey, unit, labelKey = 'ticker', signed = false, onClick, note }) {
    const P = palette(el);
    const data = items.filter((d) => U.isNum(d[valueKey])).sort((a, b) => a[valueKey] - b[valueKey]);
    if (!data.length) return empty(el, 'No data for the current filters');
    render(el, {
      grid: { left: 64, right: 72, top: 8, bottom: 24 },
      tooltip: { ...tip(P), trigger: 'item', formatter: (p) => { const d = data[p.dataIndex]; return `<b>${U.esc(d.company_name || d[labelKey])}</b><br/>${U.fmtByUnit(d[valueKey], unit)}${note ? `<br/><span style="color:${P.muted}">${U.esc(note(d))}</span>` : ''}`; } },
      xAxis: { type: 'value', ...axisCommon(P), axisLabel: { color: P.text2, fontSize: 11, formatter: axisFmt(unit) } },
      yAxis: { type: 'category', data: data.map((d) => d[labelKey]), ...axisCommon(P), splitLine: { show: false }, axisLabel: { color: P.text, fontSize: 11 } },
      series: [{ type: 'bar', barMaxWidth: 18, data: data.map((d) => ({ value: d[valueKey], itemStyle: { color: signed ? (d[valueKey] >= 0 ? P.pos : P.neg) : P.series[0], borderRadius: d[valueKey] >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
        label: { show: true, position: 'right', color: P.text2, fontSize: 10, formatter: (p) => U.fmtByUnit(p.value, unit) } }],
    }, onClick && ((p) => onClick(data[p.dataIndex].ticker)));
  }

  // ---------------------------------------------------------------- grouped bars by year (combined revenue and net income)
  function yearTotals(el, rows) {
    const P = palette(el);
    const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
    if (!years.length) return empty(el, 'No data for the current filters');
    const agg = years.map((y) => { const a = rows.filter((r) => r.year === y); const rev = a.reduce((s, r) => s + r.revenue, 0); const ni = a.reduce((s, r) => s + r.net_income, 0); return { y, rev, ni, n: a.length }; });
    const nCo = new Set(rows.map((r) => r.ticker)).size; const thin = (a) => a.n < nCo / 2;
    render(el, {
      grid: { left: 64, right: 16, top: 36, bottom: 30 },
      legend: { top: 0, left: 0, textStyle: { color: P.text2 }, itemWidth: 12, itemHeight: 8 },
      tooltip: { ...tip(P), trigger: 'axis', formatter: (ps) => { const a = agg[ps[0].dataIndex]; return `<b>${a.y}</b> (${a.n} of ${nCo} companies report)<br/>Revenue: ${U.fmtUsdM(a.rev)}<br/>Net income: ${U.fmtUsdM(a.ni)}<br/>Net margin: ${U.fmtPct(a.ni / a.rev * 100)}`; } },
      xAxis: { type: 'category', data: years, ...axisCommon(P), splitLine: { show: false } },
      yAxis: { type: 'value', ...axisCommon(P), axisLabel: { color: P.text2, fontSize: 11, formatter: axisFmt('usd_m') } },
      series: [
        { name: 'Revenue', type: 'bar', data: agg.map((a) => ({ value: a.rev, itemStyle: { opacity: thin(a) ? 0.4 : 1 } })), itemStyle: { color: P.series[0], borderRadius: [4, 4, 0, 0] }, barGap: '10%', barMaxWidth: 22 },
        { name: 'Net income', type: 'bar', data: agg.map((a) => ({ value: a.ni, itemStyle: { opacity: thin(a) ? 0.4 : 1 } })), itemStyle: { color: P.series[1], borderRadius: [4, 4, 0, 0] }, barMaxWidth: 22 },
      ],
    });
  }

  // ---------------------------------------------------------------- heatmap of year-on-year revenue growth (diverging)
  function growthHeatmap(el, rows, onClick) {
    const P = palette(el);
    const years = [...new Set(rows.filter((r) => U.isNum(r.revenue_growth_pct)).map((r) => r.year))].sort((a, b) => a - b);
    const tickers = [...new Set(rows.map((r) => r.ticker))].sort().reverse();
    if (!years.length) return empty(el, 'Growth needs at least two consecutive years');
    const data = rows.filter((r) => U.isNum(r.revenue_growth_pct)).map((r) => [years.indexOf(r.year), tickers.indexOf(r.ticker), +r.revenue_growth_pct.toFixed(1)]);
    render(el, {
      grid: { left: 64, right: 16, top: 8, bottom: 64 },
      tooltip: { ...tip(P), formatter: (p) => `<b>${tickers[p.value[1]]} ${years[p.value[0]]}</b><br/>Revenue growth: ${U.fmtSignedPct(p.value[2])}` },
      xAxis: { type: 'category', data: years, ...axisCommon(P), splitArea: { show: false } },
      yAxis: { type: 'category', data: tickers, ...axisCommon(P), axisLabel: { color: P.text, fontSize: 11 } },
      visualMap: { min: -30, max: 30, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 140, itemWidth: 10, text: ['+30% or more', '-30% or less'], textStyle: { color: P.text2, fontSize: 10 },
        inRange: { color: [P.neg, P.mid, P.pos] } },
      series: [{ type: 'heatmap', data, label: { show: true, fontSize: 9, color: P.text, formatter: (p) => Math.round(p.value[2]) }, itemStyle: { borderColor: P.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: P.text, borderWidth: 1 } } }],
    }, onClick && ((p) => onClick(tickers[p.value[1]])));
  }

  // ---------------------------------------------------------------- labelled scatter of companies (classification colours)
  function companyScatter(el, summaries, { x, y, xLabel, yLabel, xUnit, yUnit, sizeKey, xLog = false, fit, onClick }) {
    const P = palette(el);
    const pts = summaries.filter((c) => U.isNum(c[x]) && U.isNum(c[y]) && (!xLog || c[x] > 0));
    if (pts.length < 2) return empty(el, 'Not enough companies with data');
    const maxSize = sizeKey ? Math.max(...pts.map((c) => c[sizeKey] || 0)) : 0;
    const groups = ['Consistently strong', 'Mixed', 'Deteriorating'];
    const series = groups.map((g) => ({ name: g, type: 'scatter', data: pts.filter((c) => c.classification === g).map((c) => ({ value: [c[x], c[y]], c,
      symbolSize: sizeKey && maxSize ? 10 + 30 * Math.sqrt((c[sizeKey] || 0) / maxSize) : 12 })),
      itemStyle: { color: P.cls[g], borderColor: P.surface, borderWidth: 2, opacity: 0.9 },
      label: { show: true, formatter: (p) => p.data.c.ticker, position: 'top', color: P.text, fontSize: 10, fontWeight: 600 }, labelLayout: { hideOverlap: true } }));
    if (fit && U.isNum(fit.b)) {
      const xs = pts.map((c) => c[x]); const lo = Math.min(...xs), hi = Math.max(...xs);
      const tx = (v) => (xLog ? Math.log10(v) : v);
      series.push({ name: 'Linear fit', type: 'line', symbol: 'none', silent: true, data: [[lo, fit.a + fit.b * tx(lo)], [hi, fit.a + fit.b * tx(hi)]], lineStyle: { type: 'dashed', color: P.muted, width: 1.5 } });
    }
    render(el, {
      grid: { left: 64, right: 24, top: 36, bottom: 48 },
      legend: { top: 0, left: 0, data: groups, textStyle: { color: P.text2 }, itemWidth: 10, itemHeight: 10 },
      tooltip: { ...tip(P), trigger: 'item', formatter: (p) => { const c = p.data && p.data.c; if (!c) return ''; return `<b>${U.esc(c.company_name)} (${U.esc(c.ticker)})</b><br/>${xLabel}: ${U.fmtByUnit(c[x], xUnit)}<br/>${yLabel}: ${U.fmtByUnit(c[y], yUnit)}${sizeKey ? `<br/>Median market cap: ${U.fmtUsdBn(c[sizeKey])}` : ''}<br/>${c.classification}`; } },
      xAxis: { type: xLog ? 'log' : 'value', name: xLabel, nameLocation: 'middle', nameGap: 30, scale: !xLog, ...axisCommon(P), axisLabel: { color: P.text2, fontSize: 11, formatter: axisFmt(xUnit) } },
      yAxis: { type: 'value', name: yLabel, nameLocation: 'middle', nameGap: 46, scale: true, ...axisCommon(P), axisLabel: { color: P.text2, fontSize: 11, formatter: axisFmt(yUnit) } },
      series,
    }, onClick && ((p) => p.data && p.data.c && onClick(p.data.c.ticker)));
  }

  // ---------------------------------------------------------------- company-year scatter: revenue growth vs net income growth
  function revVsIncome(el, rows, onClick) {
    const P = palette(el); const CLIP = 100;
    const pts = rows.filter((r) => U.isNum(r.revenue_growth_pct) && U.isNum(r.net_income_growth_pct));
    if (!pts.length) return empty(el, 'No measurable year-on-year changes');
    const clip = (v) => Math.max(-CLIP, Math.min(CLIP, v));
    const mk = (a) => a.map((r) => ({ value: [clip(r.revenue_growth_pct), clip(r.net_income_growth_pct)], r }));
    render(el, {
      grid: { left: 64, right: 24, top: 36, bottom: 48 },
      legend: { top: 0, left: 0, textStyle: { color: P.text2 }, itemWidth: 10, itemHeight: 10 },
      tooltip: { ...tip(P), trigger: 'item', formatter: (p) => { const r = p.data.r; return `<b>${U.esc(r.ticker)} ${r.year}</b><br/>Revenue growth: ${U.fmtSignedPct(r.revenue_growth_pct)}<br/>Net income growth: ${U.fmtSignedPct(r.net_income_growth_pct)}<br/>Net margin change: ${U.fmtPp(r.net_margin_change_pp)}`; } },
      xAxis: { type: 'value', name: 'Revenue growth (%)', nameLocation: 'middle', nameGap: 30, min: -CLIP / 2, max: CLIP, ...axisCommon(P), axisLabel: { color: P.text2, fontSize: 11, formatter: '{value}%' } },
      yAxis: { type: 'value', name: 'Net income growth (%)', nameLocation: 'middle', nameGap: 46, min: -CLIP, max: CLIP, ...axisCommon(P), axisLabel: { color: P.text2, fontSize: 11, formatter: '{value}%' } },
      series: [
        { name: 'Other company-years', type: 'scatter', data: mk(pts.filter((r) => !r.growth_with_margin_decline)), symbolSize: 8, itemStyle: { color: P.other, opacity: 0.7, borderColor: P.surface, borderWidth: 1 } },
        { name: 'Revenue up, net margin down > 1 pp', type: 'scatter', data: mk(pts.filter((r) => r.growth_with_margin_decline)), symbolSize: 9, itemStyle: { color: P.series[1], borderColor: P.surface, borderWidth: 1 },
          markLine: { silent: true, symbol: 'none', lineStyle: { color: P.axis, type: 'solid' }, label: { show: false }, data: [{ xAxis: 0 }, { yAxis: 0 }, [{ coord: [-CLIP / 2, -CLIP / 2] }, { coord: [CLIP, CLIP] }]] } },
      ],
    }, onClick && ((p) => p.data && p.data.r && onClick(p.data.r.ticker)));
  }

  // ---------------------------------------------------------------- two-series horizontal bars (average gross vs net margin)
  function marginBars(el, summaries, onClick) {
    const P = palette(el);
    const data = summaries.filter((c) => U.isNum(c.avg_net_margin_pct)).sort((a, b) => a.avg_net_margin_pct - b.avg_net_margin_pct);
    if (!data.length) return empty(el, 'No data for the current filters');
    render(el, {
      grid: { left: 64, right: 24, top: 30, bottom: 24 },
      legend: { top: 0, left: 0, textStyle: { color: P.text2 }, itemWidth: 12, itemHeight: 8 },
      tooltip: { ...tip(P), trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => (U.isNum(v) ? U.fmtPct(v) : 'not meaningful') },
      xAxis: { type: 'value', ...axisCommon(P), axisLabel: { color: P.text2, fontSize: 11, formatter: '{value}%' } },
      yAxis: { type: 'category', data: data.map((c) => c.ticker), ...axisCommon(P), splitLine: { show: false }, axisLabel: { color: P.text, fontSize: 11 } },
      series: [
        { name: 'Average gross margin', type: 'bar', data: data.map((c) => c.avg_gross_margin_pct), itemStyle: { color: P.series[0], borderRadius: [0, 3, 3, 0] }, barMaxWidth: 10 },
        { name: 'Average net margin', type: 'bar', data: data.map((c) => c.avg_net_margin_pct), itemStyle: { color: P.series[1], borderRadius: [0, 3, 3, 0] }, barMaxWidth: 10 },
      ],
    }, onClick && ((p) => onClick(data[p.dataIndex].ticker)));
  }

  // ---------------------------------------------------------------- company profile: four small multiples
  function profile(el, rows) {
    const P = palette(el);
    if (!rows.length) return empty(el, 'Select a company');
    const years = rows.map((r) => r.year);
    const panels = [
      { title: 'Revenue and net income', unit: 'usd_m', s: [['Revenue', 'revenue', 0, 'bar'], ['Net income', 'net_income', 1, 'bar']] },
      { title: 'Gross and net margin', unit: 'pct', s: [['Gross margin', 'gross_margin_pct', 0, 'line'], ['Net margin', 'net_margin_pct', 1, 'line']] },
      { title: 'Earnings per share', unit: 'usd', s: [['EPS', 'eps', 0, 'line']] },
      { title: 'Market capitalisation', unit: 'usd_bn', s: [['Market cap', 'market_cap_bn', 0, 'bar']] },
    ];
    const grid = [], xAxis = [], yAxis = [], series = [], title = [];
    panels.forEach((pn, i) => {
      const left = i % 2 ? '55%' : '7%', top = i < 2 ? '9%' : '58%';
      grid.push({ left, top, width: '40%', height: '30%', containLabel: false });
      title.push({ text: pn.title, left, top: i < 2 ? '1%' : '50%', textStyle: { fontSize: 12, fontWeight: 600, color: P.text } });
      xAxis.push({ type: 'category', gridIndex: i, data: years, ...axisCommon(P), splitLine: { show: false }, axisLabel: { color: P.text2, fontSize: 10 } });
      yAxis.push({ type: 'value', gridIndex: i, scale: pn.unit === 'pct' || pn.unit === 'usd', ...axisCommon(P), axisLabel: { color: P.text2, fontSize: 10, formatter: axisFmt(pn.unit) } });
      pn.s.forEach(([name, key, ci, type]) => series.push({ name, type, xAxisIndex: i, yAxisIndex: i, data: rows.map((r) => (U.isNum(r[key]) ? r[key] : null)),
        itemStyle: { color: P.series[ci], borderRadius: type === 'bar' ? [3, 3, 0, 0] : 0 }, lineStyle: { width: 2, color: P.series[ci] }, symbolSize: 5, barMaxWidth: 12, connectNulls: false,
        tooltip: { valueFormatter: (v) => U.fmtByUnit(v, pn.unit) } }));
    });
    render(el, { title, grid, xAxis, yAxis, series, tooltip: { ...tip(P), trigger: 'axis' }, axisPointer: { link: [{ xAxisIndex: 'all' }] } });
  }

  function resizeAll() { instances.forEach((c) => { if (!c.isDisposed()) c.resize(); }); }
  function image(el) { const c = instances.get(el); return c && !c.isDisposed() ? c.getDataURL({ type: 'jpeg', pixelRatio: 2, backgroundColor: '#ffffff' }) : null; }

  window.FinCharts = { trend, rankBars, yearTotals, growthHeatmap, companyScatter, revVsIncome, marginBars, profile, resizeAll, image, palette, setAnimation };
})();

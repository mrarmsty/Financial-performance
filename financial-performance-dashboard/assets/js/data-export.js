/* data-export.js - downloads of the data the dashboard is actually analysing (full or filtered), the company
   summary and the validation results of the latest upload. CSV text cells are protected against formula injection. */
(function () {
  'use strict';
  const U = window.FinUtils;
  const { FIELDS } = window.FinConfig;

  const COLUMNS = [
    ...FIELDS.map((f) => ({ key: f.key, label: f.key })),
    ...['company_name', 'category', 'gross_profit_valid', 'gross_margin_pct', 'net_margin_pct', 'ebitda_margin_pct', 'roe_pct', 'cfo_to_net_income',
      'revenue_per_employee_k', 'price_to_sales', 'revenue_growth_pct', 'net_income_growth_pct', 'net_margin_change_pp', 'is_loss',
      'growth_with_margin_decline', 'flag_gross_margin_nm', 'flag_ebitda_placeholder', 'flag_current_ratio_placeholder', 'flag_negative_equity'].map((k) => ({ key: k, label: k })),
    { key: '_source', label: 'record_source' },
  ];
  const SUMMARY_COLUMNS = ['ticker', 'company_name', 'category', 'first_year', 'last_year', 'years', 'revenue_first', 'revenue_last', 'revenue_cagr_pct',
    'net_income_cagr_pct', 'total_revenue', 'revenue_share_pct', 'total_gross_profit', 'total_net_income', 'avg_gross_margin_pct', 'avg_net_margin_pct',
    'median_roe_pct', 'net_margin_change_pp', 'net_margin_shift_pp', 'net_margin_trend_pp_per_year', 'pct_years_revenue_growth', 'revenue_growth_volatility_pp',
    'loss_years', 'pct_years_profitable', 'growth_with_margin_decline_years', 'median_market_cap_bn', 'latest_market_cap_bn', 'latest_eps',
    'classification', 'classification_reason', 'performance_score'].map((k) => ({ key: k, label: k }));

  const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
  const prep = (rows) => rows.map((r) => { const o = {}; COLUMNS.forEach((c) => { o[c.key] = round(c.key === '_source' ? (r._batch && r._batch !== 'base' ? `upload ${r._batch}` : 'base dataset') : r[c.key]); }); return o; });

  function dataCsv(rows, scope) {
    const csv = U.toCsv(prep(rows), COLUMNS);
    U.download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `financial_analysis_dataset_${scope}_${U.stamp()}.csv`);
    return { rows: rows.length, columns: COLUMNS.length };
  }
  function summaryCsv(summaries, scope) {
    const csv = U.toCsv(summaries.map((c) => Object.fromEntries(SUMMARY_COLUMNS.map((k) => [k.key, round(c[k.key])]))), SUMMARY_COLUMNS);
    U.download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `company_performance_summary_${scope}_${U.stamp()}.csv`);
  }
  function validationCsv(upload) {
    const cols = [{ key: 'row', label: 'file_row' }, { key: 'key', label: 'company_year' }, { key: 'outcome', label: 'outcome' }, { key: 'reason', label: 'reason' }];
    const rows = [
      ...upload.rejected.map((r) => ({ row: r.row, key: r.key, outcome: r.type === 'invalid' ? 'rejected' : 'not added (duplicate)', reason: r.reason })),
      ...upload.warnings.map((w) => ({ row: w.row, key: '', outcome: 'accepted with warning', reason: `${w.field}: ${w.message}` })),
    ];
    U.download(new Blob(['﻿' + U.toCsv(rows, cols)], { type: 'text/csv;charset=utf-8' }), `upload_validation_${(upload.fileName || 'file').replace(/[^\w.-]+/g, '_')}_${U.stamp()}.csv`);
  }
  async function dataXlsx(rows, summaries, scope, meta) {
    const wb = new window.ExcelJS.Workbook(); wb.creator = 'Financial Performance Dashboard'; wb.created = new Date();
    const add = (name, cols, data) => {
      const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: Math.min(28, Math.max(10, c.label.length + 2)) }));
      data.forEach((d) => ws.addRow(d));
      ws.getRow(1).font = { bold: true }; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    };
    add('Analysis data', COLUMNS, prep(rows));
    add('Company summary', SUMMARY_COLUMNS, summaries.map((c) => Object.fromEntries(SUMMARY_COLUMNS.map((k) => [k.key, round(c[k.key])]))));
    const about = wb.addWorksheet('About');
    [['Export scope', scope === 'full' ? 'Full analysis dataset' : 'Currently filtered dataset'], ['Filters', meta.filters], ['Records', rows.length],
      ['Generated', new Date().toISOString()], ['Dataset status', meta.status], ['Units', 'Statement values in USD millions; market cap in USD billions; ratios in %'],
      ['Definitions', 'See the Methodology tab of the dashboard and data/data_dictionary.md']].forEach((r) => about.addRow(r));
    about.getColumn(1).width = 18; about.getColumn(2).width = 90; about.getColumn(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    U.download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `financial_analysis_dataset_${scope}_${U.stamp()}.xlsx`);
  }

  window.FinExport = { dataCsv, dataXlsx, summaryCsv, validationCsv, COLUMNS };
})();

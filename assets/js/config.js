/* config.js - schema, column aliases, business rules and KPI definitions.
   Everything the other modules treat as a rule lives here so it can be documented and changed in one place. */
(function () {
  'use strict';

  // Canonical fields. type: int | num | text. required: must be present and valid or the row is rejected.
  const FIELDS = [
    { key: 'year', label: 'Year', type: 'int', required: true, unit: '', aliases: ['year', 'fiscalyear', 'fy'] },
    { key: 'ticker', label: 'Company', type: 'text', required: true, unit: '', aliases: ['company', 'ticker', 'symbol', 'companyticker', 'stock'] },
    { key: 'category_source', label: 'Category', type: 'text', required: false, unit: '', aliases: ['category', 'sector', 'industry'] },
    { key: 'market_cap_bn', label: 'Market Cap (USD bn)', type: 'num', unit: 'USD bn', min: 0, aliases: ['marketcapinbusd', 'marketcap', 'marketcapbusd', 'marketcapitalization', 'marketcapitalisation'] },
    { key: 'revenue', label: 'Revenue', type: 'num', required: true, unit: 'USD m', minExclusive: 0, aliases: ['revenue', 'totalrevenue', 'sales', 'netsales', 'revenues'] },
    { key: 'gross_profit', label: 'Gross Profit', type: 'num', unit: 'USD m', aliases: ['grossprofit'] },
    { key: 'net_income', label: 'Net Income', type: 'num', required: true, unit: 'USD m', aliases: ['netincome', 'netprofit', 'profitaftertax', 'netearnings'] },
    { key: 'eps', label: 'Earnings Per Share', type: 'num', unit: 'USD', aliases: ['earningpershare', 'earningspershare', 'eps'] },
    { key: 'ebitda', label: 'EBITDA', type: 'num', unit: 'USD m', aliases: ['ebitda'] },
    { key: 'equity', label: 'Shareholder Equity', type: 'num', unit: 'USD m', aliases: ['shareholderequity', 'shareholdersequity', 'totalequity', 'stockholdersequity', 'equity'] },
    { key: 'cfo', label: 'Cash Flow from Operating', type: 'num', unit: 'USD m', aliases: ['cashflowfromoperating', 'operatingcashflow', 'cashflowfromoperatingactivities'] },
    { key: 'cfi', label: 'Cash Flow from Investing', type: 'num', unit: 'USD m', aliases: ['cashflowfrominvesting', 'investingcashflow', 'cashflowfrominvestingactivities'] },
    { key: 'cff', label: 'Cash Flow from Financing', type: 'num', unit: 'USD m', aliases: ['cashflowfromfinancialactivities', 'cashflowfromfinancingactivities', 'financingcashflow', 'cashflowfromfinancing'] },
    { key: 'current_ratio', label: 'Current Ratio', type: 'num', unit: 'x', aliases: ['currentratio'] },
    { key: 'debt_equity', label: 'Debt/Equity Ratio', type: 'num', unit: 'x', aliases: ['debtequityratio', 'debttoequity', 'debttoequityratio', 'debtequity'] },
    { key: 'roe_reported', label: 'ROE (reported)', type: 'num', unit: '%', aliases: ['roe', 'returnonequity'] },
    { key: 'roa_reported', label: 'ROA (reported)', type: 'num', unit: '%', aliases: ['roa', 'returnonassets'] },
    { key: 'roi_reported', label: 'ROI (reported)', type: 'num', unit: '%', aliases: ['roi', 'returnoninvestment'] },
    { key: 'net_margin_reported', label: 'Net Profit Margin (reported)', type: 'num', unit: '%', aliases: ['netprofitmargin', 'netmargin'] },
    { key: 'fcf_per_share', label: 'Free Cash Flow per Share', type: 'num', unit: 'USD', aliases: ['freecashflowpershare', 'fcfpershare'] },
    { key: 'rote_reported', label: 'Return on Tangible Equity (reported)', type: 'num', unit: '%', aliases: ['returnontangibleequity', 'rote'] },
    { key: 'employees', label: 'Number of Employees', type: 'num', unit: 'people', min: 0, aliases: ['numberofemployees', 'employees', 'headcount'] },
    { key: 'inflation_us_pct', label: 'Inflation Rate (US, %)', type: 'num', unit: '%', aliases: ['inflationrateinus', 'inflationrate', 'inflation'] },
  ];

  // Category labels standardised case-insensitively. Unknown categories are accepted with a warning.
  const CATEGORY_MAP = { it: 'IT', elec: 'Electronics', electronics: 'Electronics', bank: 'Bank', fintech: 'FinTech', food: 'Food',
    logi: 'Logistics', logistics: 'Logistics', manufacturing: 'Manufacturing', finance: 'Finance' };

  // Public company names for the tickers in the supplied data (used for display only).
  const COMPANY_NAMES = { AAPL: 'Apple', MSFT: 'Microsoft', GOOG: 'Alphabet (Google)', PYPL: 'PayPal', AIG: 'American International Group',
    PCG: 'PG&E Corporation', SHLDQ: 'Sears Holdings', MCD: "McDonald's", BCS: 'Barclays', NVDA: 'NVIDIA', INTC: 'Intel', AMZN: 'Amazon' };

  // Business rules (documented in the Methodology tab and docs/methodology.md).
  const RULES = {
    marginDeclineFlagPp: -1,          // growth with margin decline: revenue up and net margin down by more than 1 pp
    strong: { cagrMin: 5, avgNetMarginMin: 10, profitableYearsMin: 90, marginTrendMin: -0.5 },
    deteriorating: { marginTrendMax: -1, marginShiftMax: -5 },
    referenceYearCoverage: 0.5,        // reference year = latest year in which at least half of the selected companies report
    minYearsForCagr: 2,
    maxFileBytes: 10 * 1024 * 1024,
    maxRows: 50000,
    yearMin: 1990,
    yearMax: 2100,
  };

  const KPI_DEFS = [
    { id: 'revenue', name: 'Combined revenue', unit: 'USD', formula: 'Sum of revenue of selected companies in the reference year',
      compare: 'Like-for-like change: companies reporting in both the reference year and the year before', fields: 'revenue' },
    { id: 'net_income', name: 'Combined net income', unit: 'USD', formula: 'Sum of net income in the reference year',
      compare: 'Like-for-like change versus the previous year', fields: 'net_income' },
    { id: 'net_margin', name: 'Aggregate net margin', unit: '%', formula: 'Sum of net income / sum of revenue x 100 (reference year)',
      compare: 'Change in percentage points, like-for-like', fields: 'net_income, revenue' },
    { id: 'cagr', name: 'Median revenue CAGR', unit: '% a year', formula: 'Median across companies of (last revenue / first revenue)^(1/years) - 1, over the selected years',
      compare: 'Range of company CAGRs', fields: 'revenue, year' },
    { id: 'roe', name: 'Median ROE', unit: '%', formula: 'Median of net income / year-end shareholder equity x 100 (reference year); companies with equity <= 0 excluded',
      compare: 'Median in the previous year', fields: 'net_income, equity' },
    { id: 'market_cap', name: 'Combined market cap', unit: 'USD', formula: 'Sum of market capitalisation in the reference year',
      compare: 'Like-for-like change versus the previous year', fields: 'market_cap_bn' },
    { id: 'classification', name: 'Performance mix', unit: 'companies', formula: 'Rule-based classification of each company over the selected years',
      compare: 'Counts of Consistently strong / Mixed / Deteriorating', fields: 'derived' },
  ];

  // Metrics offered in the trend and ratio selectors.
  const METRICS = {
    revenue: { label: 'Revenue', unit: 'usd_m', level: true },
    gross_profit_valid: { label: 'Gross profit', unit: 'usd_m', level: true },
    net_income: { label: 'Net income', unit: 'usd_m', level: true },
    ebitda: { label: 'EBITDA', unit: 'usd_m', level: true },
    cfo: { label: 'Operating cash flow', unit: 'usd_m', level: true },
    market_cap_bn: { label: 'Market capitalisation', unit: 'usd_bn', level: true },
    eps: { label: 'Earnings per share', unit: 'usd', level: false },
    gross_margin_pct: { label: 'Gross margin', unit: 'pct', level: false },
    net_margin_pct: { label: 'Net margin', unit: 'pct', level: false },
    ebitda_margin_pct: { label: 'EBITDA margin', unit: 'pct', level: false },
    roe_pct: { label: 'Return on equity (ROE)', unit: 'pct', level: false },
    roa_reported: { label: 'Return on assets (ROA, reported)', unit: 'pct', level: false },
    debt_equity: { label: 'Debt/equity ratio', unit: 'x', level: false },
    current_ratio: { label: 'Current ratio', unit: 'x', level: false },
    revenue_growth_pct: { label: 'Revenue growth (YoY)', unit: 'pct', level: false },
  };

  window.FinConfig = { FIELDS, CATEGORY_MAP, COMPANY_NAMES, RULES, KPI_DEFS, METRICS, APP_VERSION: '1.0.0' };
})();

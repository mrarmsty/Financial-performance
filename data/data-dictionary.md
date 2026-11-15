# Data dictionary

## Files

| File | What it is | Rows |
|---|---|---:|
| `raw/Financial_Statements.csv` | The supplied dataset, unchanged | 161 |
| `base-data.js` | The same raw file embedded in JavaScript, so the dashboard also runs when opened from disk | 161 |
| `processed/financials_cleaned.csv` | Cleaned records: standard column names, standardised categories, placeholders removed (rules C1-C7) | 161 |
| `processed/financials_analysis.csv` | Cleaned records plus every derived metric and flag used by the dashboard | 161 |
| `processed/company_summary.csv` | One row per company over all years: growth, margins, consistency, classification and score | 12 |
| `processed/cleaning_log.csv` | Cleaning rules and how many records each affected | 7 |
| `processed/reference_values.json` | KPI values computed independently in pandas; the automated tests compare the dashboard against them | - |

The dashboard's **Download Analysis Data** button exports the same columns as `financials_analysis.csv` for whatever data is currently loaded (including uploads), plus a `record_source` column.

**Grain:** one row per company per fiscal year. **Business key:** `ticker` + `year`. There are no duplicate keys in the source.
**Coverage:** AAPL, AIG, AMZN, BCS, GOOG, INTC, MCD and PCG 2009-2022; MSFT and NVDA 2009-2023; PYPL 2014-2022; SHLDQ 2009-2018.

## Source fields

| Source column | Field | Type | Unit | Description | Notes |
|---|---|---|---|---|---|
| Year | `year` | integer | - | Fiscal year as reported | Fiscal years end in different months by company |
| Company (header has a trailing space) | `ticker` | text | - | Stock ticker | Required; business key with year |
| Category | `category_source` | text | - | Category as supplied | Inconsistent casing and codes; see `category` |
| Market Cap(in B USD) | `market_cap_bn` | number | USD billions | Market capitalisation | 1 missing value (PYPL 2014), kept missing |
| Revenue | `revenue` | number | USD millions | Total revenue | Required; must be > 0 |
| Gross Profit | `gross_profit` | number | USD millions | Revenue minus cost of sales | Equals revenue for BCS (bank) |
| Net Income | `net_income` | number | USD millions | Profit after tax | Required; negative = loss |
| Earning Per Share | `eps` | number | USD | Earnings per share | |
| EBITDA | `ebitda` | number | USD millions | Earnings before interest, tax, depreciation and amortisation | BCS records 1 (placeholder) |
| Share Holder Equity | `equity` | number | USD millions | Year-end shareholder equity | Negative for MCD 2016-2022 and SHLDQ 2015-2018 |
| Cash Flow from Operating | `cfo` | number | USD millions | Operating cash flow | |
| Cash Flow from Investing | `cfi` | number | USD millions | Investing cash flow | |
| Cash Flow from Financial Activities | `cff` | number | USD millions | Financing cash flow | |
| Current Ratio | `current_ratio` | number | x | Current assets / current liabilities | Exactly 1.0 in every year for AIG and BCS (placeholder) |
| Debt/Equity Ratio | `debt_equity` | number | x | Debt / equity | Negative where equity is negative |
| ROE | `roe_reported` | number | % | Return on equity as supplied | Kept for reference; the dashboard recalculates ROE |
| ROA | `roa_reported` | number | % | Return on assets as supplied | Used as supplied; total assets are not in the data |
| ROI | `roi_reported` | number | % | Return on investment as supplied | Extreme values (SHLDQ up to 885%); not used in KPIs |
| Net Profit Margin | `net_margin_reported` | number | % | Net margin as supplied | Kept for reference; BCS differs from the recalculation by up to 2 pp |
| Free Cash Flow per Share | `fcf_per_share` | number | USD | Free cash flow per share | Extreme values (AIG); not used in KPIs |
| Return on Tangible Equity | `rote_reported` | number | % | As supplied | Extreme values; not used in KPIs |
| Number of Employees | `employees` | number | people | Headcount | |
| Inflation Rate(in US) | `inflation_us_pct` | number | % | US inflation that year | Context only |

## Derived fields

| Field | Definition | Rule for "not meaningful" |
|---|---|---|
| `company_name` | Public company name for the ticker (display only) | Ticker shown for unknown tickers |
| `category` | Standardised category: IT, Electronics, Bank, FinTech, Food, Logistics, Manufacturing, Finance | Unknown labels kept as written |
| `gross_profit_valid` | Gross profit, blank where it equals revenue | Blank for banks (no cost of sales) |
| `gross_margin_pct` | gross_profit_valid / revenue x 100 | Blank as above |
| `net_margin_pct` | net_income / revenue x 100 | |
| `ebitda_margin_pct` | ebitda / revenue x 100 | Blank where EBITDA is a placeholder |
| `roe_pct` | net_income / year-end equity x 100 | Blank where equity <= 0 |
| `cfo_to_net_income` | Operating cash flow / net income (cash conversion) | Blank where net income <= 0 |
| `revenue_per_employee_k` | revenue x 1000 / employees (USD thousands) | |
| `price_to_sales` | market_cap_bn x 1000 / revenue | |
| `revenue_growth_pct` | Revenue / previous year revenue - 1, x 100 | Only between consecutive years |
| `net_income_growth_pct` | Same for net income | Blank when the previous year was a loss |
| `net_margin_change_pp` | Net margin minus previous year's net margin | Consecutive years only |
| `is_loss` | 1 when net income < 0 | |
| `growth_with_margin_decline` | 1 when revenue grew and net margin fell by more than 1 pp | |
| `flag_gross_margin_nm`, `flag_ebitda_placeholder`, `flag_current_ratio_placeholder`, `flag_negative_equity` | 1 when the corresponding cleaning rule applied | |

## Company-level measures (company_summary.csv and the scorecard)

| Measure | Definition |
|---|---|
| `revenue_cagr_pct` | (last revenue / first revenue)^(1 / (last year - first year)) - 1, over the company's years in view |
| `net_income_cagr_pct` | Same for net income, only when both ends are positive |
| `revenue_share_pct` | Company revenue over the years in view / combined revenue of all companies in view |
| `avg_gross_margin_pct`, `avg_net_margin_pct` | Average of yearly margins |
| `median_roe_pct` | Median of yearly ROE (years with positive equity) |
| `net_margin_change_pp` | Last-year net margin minus first-year net margin |
| `net_margin_shift_pp` | Average net margin of the last 3 years minus the first 3 (fewer when data is short); used for classification |
| `net_margin_trend_pp_per_year` | Least-squares slope of net margin on year (3+ years) |
| `pct_years_revenue_growth` | Share of year-on-year changes with revenue growth |
| `revenue_growth_volatility_pp` | Standard deviation of year-on-year revenue growth |
| `loss_years`, `pct_years_profitable` | Count and share of years with net income >= 0 |
| `classification`, `classification_reason` | Consistently strong / Mixed / Deteriorating, with the rule that applied (see `documentation/methodology.md`) |
| `performance_score` | Average percentile rank (0-100) of CAGR, average net margin, median ROE and share of growth years, among companies in view |

## Upload format

Uploads use the same columns as the raw file. Column names are matched ignoring case, spaces and punctuation, and common alternatives are recognised (for example `Ticker` or `Symbol` for Company, `Total Revenue` or `Sales` for Revenue, `Net Profit` for Net Income). Required: Year, Company, Revenue, Net Income. Every other column is optional. The full list of accepted names is in the dashboard under **Methodology & help → Upload file format**.

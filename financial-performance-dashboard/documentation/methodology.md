# Methodology

## 1. Business problem and objective mapping

A Financial Data Analyst was asked to evaluate the financial performance of several listed companies over multiple years. Management wants to know:

- which companies are growing;
- which are becoming more profitable;
- how their financial positions are evolving;
- which show stronger and more consistent performance.

The dashboard is a decision-support tool for that comparison. It is a screening aid for where to look more closely, not an investment recommendation.

| Objective | Analytical question | Metric or analysis | Dashboard feature | Business value |
|---|---|---|---|---|
| 1. Revenue and profit trends | How has revenue changed? Which companies grew fastest? Consistent or fluctuating? Who contributes most revenue? | Revenue by year, revenue CAGR, YoY growth, growth volatility, share of combined revenue | Overview year chart and revenue share; Growth tab trend explorer (actual / index / log), CAGR ranking, growth heatmap, consistency scatter | Separates sustained growth from one-off jumps and size from growth |
| 2. Profitability across companies and periods | Highest gross profit? Highest gross and net margins? Does revenue growth bring net income growth? Growth with falling profitability? | Total gross profit, average gross and net margin, revenue vs net income growth, margin shift, growth-with-margin-decline flag | Profitability tab: gross profit ranking, margin bars, revenue-vs-income scatter, margin change, flagged company-years table | Shows whether growth is profitable |
| 3. Evolution of financial ratios | How do ROE, ROA, leverage, liquidity, EPS and market cap evolve? Strongest ROE? | Yearly ratios (recalculated where possible), median ROE | Ratios tab: ratio explorer, ROE ranking, latest-year ratio table, company profile (revenue/NI, margins, EPS, market cap) | Tracks financial position, not just income |
| 4. Consistently strong or deteriorating | Who is consistently strong? Who is deteriorating, and why? | Rule-based classification with reasons; performance score | KPI "performance mix", "Performance at a glance", scorecard, findings and recommendations | Turns many metrics into a short list for management |
| 5. Size, growth and profitability | Do bigger companies grow faster or earn more? | Pearson and Spearman correlations with p-values; least-squares fit; two size measures | Performance & drivers: bubble scatter with axis choice, correlation table | Tests a common assumption with evidence and caveats |
| 6. Executive dashboard | - | KPIs, findings, recommendations, PDF report, exports, data upload | The application itself | Lets non-technical users explore, extend and share the analysis |

## 2. Data preparation

The same JavaScript pipeline (`assets/js/data-processing.js`) processes both the base file and every upload. A separate Python pipeline (`scripts/prepare_data.py`) applies identical rules for the deliverable datasets and for testing.

| Rule | Issue | Action | Effect |
|---|---|---|---|
| C1 | Header `Company ` has a trailing space; names inconsistent with code | Trim headers, map to standard field names (aliases accepted for uploads) | All 161 rows |
| C2 | Category labels inconsistent (`BANK` and `Bank`; codes such as `ELEC`, `LOGI`) | Standardise case-insensitively; keep the supplied label as `category_source` | 71 rows relabelled |
| C3 | Barclays reports gross profit equal to revenue (banks have no cost of sales) | Gross profit and gross margin marked not meaningful | 14 rows |
| C4 | Barclays EBITDA recorded as 1 | Treated as missing | 14 rows |
| C5 | Current ratio exactly 1.0 every year for AIG and Barclays | Treated as missing | 28 rows |
| C6 | Negative shareholder equity (McDonald's 2016-22, Sears 2015-18) | ROE and debt/equity not meaningful | 11 rows |
| C7 | PayPal 2014 market cap missing | Kept missing, not imputed | 1 row |

**Not changed:**

- **PG&E and Sears categories.** PG&E (a utility) is labelled "Manufacturing" and Sears (a retailer) "Finance". These are kept as supplied and flagged in the documentation.
- **Extreme reported ratios** (ROI, ROTE, free cash flow per share). They are kept but not used in KPIs.
- **Barclays' reported net margins.** They differ from the recalculation by up to 2 pp, probably because of currency conversion. The recalculated margin is used for consistency.

**Recalculation:** margins and ROE are recalculated from statement lines. ROA is used as reported because total assets are not in the data.

## 3. Analytical methods

- **Growth.** CAGR between each company's first and last year in view. Year-on-year growth is calculated only between consecutive years. Net income growth is not calculated from a loss year.
- **Like-for-like KPIs.** The reference year is the latest year in which at least half of the companies in view report (2022 for the full data). Year-on-year KPI changes include only companies reporting in both years, so a company entering or leaving the data is not mistaken for growth or decline.
- **Profitability.**
  - Average of yearly gross, net and EBITDA margins.
  - Median ROE, because ROE is skewed: Apple reaches 197% as buybacks shrink its equity.
  - Margin trend: least-squares slope of net margin on year.
  - Margin shift: last-3 minus first-3 year averages, which is less sensitive to a single year than an endpoint comparison.
- **Consistency.** Share of years with revenue growth, and the standard deviation of year-on-year growth.
- **Classification.** Rules are applied in this order:
  1. **Deteriorating** if any of these holds:
     - loss in the latest year in view;
     - revenue CAGR below 0;
     - margin trend of -1 pp a year or worse;
     - margin shift of -5 pp or worse.
  2. **Consistently strong** if all of these hold:
     - revenue CAGR of 5% or more;
     - average net margin of 10% or more;
     - profitable in 90% or more of years;
     - margin trend of -0.5 pp a year or better.
  3. **Mixed** otherwise.

  The thresholds are analytical conventions, set in one place (`assets/js/config.js`), and the reason for every label is shown.
- **Performance score.** Average percentile rank of revenue CAGR, average net margin, median ROE and share of growth years, among the companies in view. It is a relative ranking, so it changes when companies are added or filtered.
- **Relationships (objective 5).** Pearson correlation, with a two-sided p-value from the t distribution, and Spearman rank correlation across companies. A least-squares line is drawn on the scatter. Two size measures are offered:
  - **Initial revenue** (first year in view). This is the preferred measure because it is set before the growth it is compared with.
  - **Median market capitalisation.** It is partly a result of growth and profitability, so its strong correlations are expected and are not evidence that size causes performance.
- **Revenue vs net income co-movement.** Among company-years with measurable growth in both, the share where revenue rose and net income also rose, and where it rose faster.
- **Rule-based insights and recommendations.** Generated from fixed, documented rules applied to the current data, and each shows its rule or evidence. They are not AI-generated and contain no pre-written results.

## 4. Verification

The dashboard's calculations were checked against the independent pandas/SciPy implementation:

- all 10 headline KPI values;
- 9 company-level metrics and the classification for all 12 companies;
- three correlation coefficients and their p-values;
- all 18 derived columns for all 161 rows.

All agree to within floating-point rounding. See `tests/test-report.md`.

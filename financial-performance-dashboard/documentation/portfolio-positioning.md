# Portfolio positioning

## Competencies demonstrated

| Competency | Evidence in this project |
|---|---|
| Business problem-solving | Turned management's four questions (growth, profitability, financial position, consistency) into an objective-to-feature map, KPIs and a rule-based classification with stated reasons |
| Financial statement analysis | Margins, ROE, cash conversion, leverage, liquidity, EPS and market value; recognised where ratios break down (banks without cost of sales, negative equity, placeholder values) |
| KPI design | Like-for-like year-on-year KPIs with a coverage-based reference year, so companies entering or leaving the data are not mistaken for growth or decline |
| Statistical reasoning | CAGR, least-squares trends, volatility, Pearson and Spearman correlations with p-values computed in JavaScript, and the reverse-causality problem in using market cap as a size measure |
| Data cleaning and validation | Seven documented cleaning rules; an upload validator with column-name mapping, type checks, required fields, in-file and cross-file duplicate detection, and per-row reasons |
| Dashboard development | Vanilla JavaScript application with modular files, 8 tabs, 14 interactive charts (Apache ECharts), cross-filtering to a company profile, sortable and paginated tables, light and dark themes, a responsive layout |
| Data management | Append, update-or-add and replace modes on a defensible business key (ticker + year); undo and reset; IndexedDB persistence; honest disclosure of browser-local storage |
| Reporting | Client-side PDF report (jsPDF) generated from current data and filters; CSV and Excel exports with formula-injection protection |
| Testing and QA | 108 automated browser checks (Playwright); KPIs and all derived columns cross-checked against an independent pandas/SciPy calculation |
| Communication | Findings separated into what the data shows, what it suggests and what needs investigation; recommendations carry their evidence |

## Relevant roles

| Role | Fit | Why |
|---|---|---|
| Financial Data Analyst | Strongest | Financial statement metrics, ratio pitfalls, company comparison and classification |
| Business Intelligence Analyst | Strong | KPI design, interactive dashboard, filters, drill-down, exports and refreshable data |
| Data Analyst / Senior Data Analyst | Strong | End-to-end: data assessment, cleaning, analysis, validation, reporting and stakeholder communication |
| Analytics Consultant | Good | A decision-support tool with documented rules and recommendations tied to evidence |
| Product Analyst / Analytics Engineer | Partial | JavaScript data pipeline, validation and automated testing |

## CV entry

**Financial Performance Dashboard** (HTML, CSS, JavaScript, Apache ECharts, jsPDF, ExcelJS, Playwright, Python/pandas)

- Built an interactive dashboard comparing revenue growth, profitability and financial ratios of 12 listed companies (161 company-years, 2009-2023) to show management who is growing, who is becoming more profitable and who is deteriorating.
- Designed like-for-like KPIs and a rule-based performance classification. Identified 4 consistently strong companies and 5 deteriorating ones, and found that net income rose in only 69% of the company-years where revenue rose.
- Implemented in-browser data upload (CSV, Excel, JSON) with schema mapping, validation, duplicate detection and append, merge and replace modes. Every KPI, chart, PDF report and export recalculates from the updated data, and the data is saved locally in IndexedDB.
- Verified the analysis with 108 automated browser tests and an independent pandas/SciPy cross-check of every KPI and 18 derived metrics across all 161 records.

## Interview questions and answers

**1. What problem does the dashboard solve?**
Management wanted to know which companies are growing, becoming more profitable and performing consistently. Revenue alone can't answer that. The dashboard puts growth, margins, ratios and consistency side by side and summarises them into a classification with reasons. That gives management a short list to investigate rather than a wall of numbers.

**2. What were the main data quality problems, and what did you do about them?**
There were four:

- **Placeholder values.** Barclays' EBITDA is recorded as 1, and AIG and Barclays have a current ratio of exactly 1.0 every year. I treated these as missing.
- **Not-meaningful ratios.** A bank's gross profit equals its revenue, so its gross margin means nothing. Where equity is negative, ROE flips sign and becomes meaningless. I excluded these ratios rather than letting them distort rankings.
- **Uneven coverage.** Companies start and stop in different years. I made the year-on-year KPIs like-for-like.
- **Inconsistent categories.** I standardised the labels, and flagged the ones that look wrong instead of silently changing them.

**3. Why "like-for-like" KPIs?**
Sears drops out after 2018, PayPal enters in 2014, and only two companies report 2023. A naive total for 2023 would show revenue collapsing. So the reference year is the latest year in which at least half of the companies report, and each change compares only companies present in both years.

**4. How does the classification work, and isn't it arbitrary?**
"Deteriorating" is checked first. It applies on a loss in the latest year, falling revenue, a margin trend of -1 pp a year or worse, or a margin 5 pp lower at the end than at the start. "Consistently strong" needs all four positives. The thresholds are conventions, so I made them explicit: they sit in one config file, and every label shows the rule that triggered it. For example, Amazon is flagged because of its 2022 loss despite 26% annual growth, and the reason is visible, so a user can disagree with the threshold on an informed basis.

**5. What did you find about size, growth and profitability?**
Initial size, measured as revenue in the first year, has a moderate negative but not significant relationship with growth (r = -0.42, p = 0.17): smaller companies tended to grow faster. Market cap correlates strongly with both growth and margin (r = 0.76 and 0.74). But market value is a result of past growth and profits, so that correlation says little about whether size drives performance. With 12 companies, I present all of this as indicative.

**6. Are revenue increases accompanied by net income increases?**
Not always. Net income rose in 69% of company-years with higher revenue, and rose faster than revenue in 45 of 93. Alphabet grew revenue while its net margin fell in six years, yet it still averages a 23% net margin. That is why I separate margin decline from low profitability.

**7. How does the upload work without a server?**
Everything happens in the browser:

1. Papa Parse reads CSV, ExcelJS reads Excel, and JSON is parsed natively.
2. Column names are normalised and matched against a list of accepted names.
3. Each row is validated: year, ticker, numbers, required fields and duplicates.
4. The user previews the result and applies it in one of three modes, keyed on ticker plus year.

The working dataset is saved in IndexedDB. Each upload stores a snapshot of the data before it, which is what makes undo possible.

**8. How do you know the uploaded data updates everything?**
There is one data flow: stored records → derive → filter → analytics → every view, report and export. Nothing is pre-computed. The automated tests upload files and then check:

- the record count, company count and KPIs;
- the filter options and scorecard;
- the PDF content;
- the exported rows.

**9. How did you test that the numbers are right?**
I wrote the analysis twice: once in JavaScript for the dashboard, and once in pandas/SciPy as a reference. Playwright tests compare all 10 headline KPIs, 9 metrics plus the classification for every company, and the correlations with their p-values. A Python script compares all 18 derived columns of the dashboard's export with pandas for all 161 rows. Everything matches.

**10. What security issues did you consider?**
Uploaded text is always escaped before display, and a test uploads an HTML payload to confirm nothing executes. Text cells that start with = + - or @ are prefixed in CSV exports to block spreadsheet formula injection. Files are type- and size-checked. No data leaves the browser.

**11. What would you do with more time or data?**
- Add total assets, debt and share counts, so ROA, leverage and per-share metrics could be recalculated.
- Analyse banks with sector-specific ratios.
- Add more companies per sector, so comparisons and correlations become meaningful within sectors.
- If users need to share uploads, add a small backend with authentication and a database.

**12. What was technically hardest?**
Making the tool robust to new data. It had to handle unknown categories, new companies, missing optional columns, merges that shouldn't erase existing values, and non-meaningful ratios, all without breaking any chart or the PDF.

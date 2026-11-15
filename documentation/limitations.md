# Limitations and assumptions

## Data

- **Small, uneven sample.** There are 12 companies and 161 company-years, chosen by the dataset author and spanning very different sectors. The results describe this group only and should not be generalised.
- **Uneven coverage.** MSFT and NVDA run to 2023, SHLDQ stops in 2018 (Sears went bankrupt) and PYPL starts in 2014 (after its spin-off). Combined totals move partly because companies enter or leave. KPIs use like-for-like comparisons, and charts mark thin years.
- **Survivorship.** Sears is the only failed company. Most of the others are large, successful technology firms, so the group's growth is not representative of listed companies in general.
- **Fiscal years.** "Year" is the fiscal year as reported. Fiscal years end in different months (for example NVIDIA's ends in January), so years are not perfectly aligned.
- **Units and currency.** Statement values are assumed to be USD millions and market cap USD billions, as labelled. Barclays' figures appear to be converted from GBP, and its reported margins differ slightly from the recalculated ones.
- **Sector comparability.** Gross margin, EBITDA and current ratio are not meaningful for the bank and insurer (Barclays, AIG). ROE and debt/equity are not meaningful where equity is negative (McDonald's, Sears). Two category labels look wrong (PG&E as Manufacturing, Sears as Finance) and are flagged rather than changed.
- **Missing fields.** There are no total assets (ROA is used as reported), no debt or interest figures, no segment data and no share counts. Several supplied ratios (ROI, ROTE, free cash flow per share) have extreme values and are kept only for reference.

## Analysis

- **Association, not causation.** Correlations across 12 companies are indicative and have low statistical power. Market capitalisation reflects past growth and profitability, so its correlation with them is expected.
- **Thresholds are conventions.** The classification thresholds and the relative performance score change with the companies in view. Labels can change when filters change.
- **Endpoint sensitivity.** CAGR depends on the first and last year in view. Margin shift (3-year averages) and margin trend (regression slope) are used to reduce the effect of single unusual years.
- **No forecasting.** Fourteen annual points per company are too few for a credible forecast, so none is shown.

## Technical

- **Local storage.** Uploaded data is stored in the browser's IndexedDB on one device. It is not shared with other visitors or devices; sharing would need a backend with authentication and a database.
- **Validation scope.** Uploads are checked for structure, types, required fields, plausible values and duplicates, not for factual accuracy.
- **Browser coverage.** Automated tests ran in Chromium. Firefox and Safari were not tested.
- **Report fonts.** The PDF uses the standard Helvetica font, which supports basic Latin characters. Non-ASCII characters in uploaded company or category names are dropped from the PDF (they still display in the dashboard).
- **Third-party libraries.** ExcelJS 4.4.0 depends on a `uuid` version with a moderate advisory (a buffer bounds check in v3/v5/v6 when a buffer argument is passed). ExcelJS does not use that call path to read or write files here, but the advisory is disclosed.

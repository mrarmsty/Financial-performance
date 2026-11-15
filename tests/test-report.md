# Test report

Automated run: 2026-11-09 18:28:45 UTC in Chromium (Playwright). Result: **108 of 108 checks passed**, 0 failed.

Every check below was executed by `tests/run_tests.js` against the running dashboard; nothing here is marked as passed without being run.
Independent calculation: `scripts/prepare_data.py` (pandas and SciPy) produced the reference values the KPI checks compare against, and `tests/check_export_vs_python.py` compared all 18 derived columns of the dashboard's export with pandas for all 161 rows (all matched).

## Acceptance checklist

| Requirement | Tests | Checks | Status |
|---|---|---:|---|
| Dashboard loads correctly | T01 | 18 | Passed |
| Charts render correctly | T02 | 17 | Passed |
| KPI calculations match the underlying data | T01 | 18 | Passed |
| Filters work correctly | T03 | 11 | Passed |
| Charts update when filters are applied | T03 | 11 | Passed |
| Tables reflect selected filters | T03 | 11 | Passed |
| Additional data can be uploaded | T05 T09 | 13 | Passed |
| Invalid data is handled correctly | T04 T05 | 12 | Passed |
| Duplicate records are handled appropriately | T07 | 3 | Passed |
| Successful uploads update all dependent metrics | T05 T08 | 13 | Passed |
| Local persistence works | T06 | 1 | Passed |
| Reset functionality works | T13 | 6 | Passed |
| Analysis report downloads successfully | T12 | 14 | Passed |
| Downloaded report reflects current data | T12 | 14 | Passed |
| Dataset export downloads successfully | T11 | 6 | Passed |
| Exported data matches the analysed dataset | T11 | 6 | Passed |
| Mobile and desktop layouts work | T14 | 6 | Passed |
| GitHub Pages deployment paths are valid | T15 | 3 | Passed |

**Not tested:** an actual publish to GitHub Pages. No repository was pushed from this environment. The checks in T15 confirm the conditions GitHub Pages needs: every asset path is relative, every referenced file exists, no server code is used, and the page works even when opened directly from disk. Browsers other than Chromium (Firefox, Safari) were not tested.

## All checks

### T01 load and KPI accuracy

| Check | Result | Detail |
|---|---|---|
| 161 records and 12 companies loaded | Pass | 161 records, 12 companies |
| reference year 2022, 11 companies | Pass |  |
| KPI revenue matches pandas | Pass | dashboard 1639070.6800000002 vs python 1639070.68 |
| KPI revenue_lfl_growth_pct matches pandas | Pass | dashboard 8.653820052200789 vs python 8.653820052200789 |
| KPI net_income matches pandas | Pass | dashboard 274413.349 vs python 274413.349 |
| KPI net_income_lfl_growth_pct matches pandas | Pass | dashboard -14.053917011561534 vs python -14.053917011561534 |
| KPI net_margin_pct matches pandas | Pass | dashboard 16.742008282400608 vs python 16.74200828240061 |
| KPI net_margin_change_pp matches pandas | Pass | dashboard -4.423390907148441 vs python -4.423390907148438 |
| KPI median_cagr_pct matches pandas | Pass | dashboard 7.120644429607004 vs python 7.120644429607005 |
| KPI median_roe_pct matches pandas | Pass | dashboard 17.672465198545805 vs python 17.672465198545805 |
| KPI market_cap_bn matches pandas | Pass | dashboard 6712.92 vs python 6712.919999999998 |
| KPI market_cap_lfl_growth_pct matches pandas | Pass | dashboard -36.20431588220705 vs python -36.20431588220706 |
| classification counts match pandas | Pass | {"Consistently strong":4,"Mixed":3,"Deteriorating":5} |
| company summaries (9 metrics + class) match pandas for all 12 companies | Pass |  |
| correlation size-growth r and p match scipy | Pass | r -0.421030231187923, p 0.17287941395242734 |
| correlation mcap-growth r and p match scipy | Pass |  |
| correlation growth-margin r and p match scipy | Pass |  |
| KPI cards show formatted values | Pass | Combined revenue iCombined revenueSum of revenue of selected companies in the reference year.Like-for-like change: compa |

### T02 charts render

| Check | Result | Detail |
|---|---|---|
| overview: cYearTotals has data series | Pass | 2 series |
| overview: cShare has data series | Pass | 1 series |
| growth: cTrend has data series | Pass | 12 series |
| growth: cCagr has data series | Pass | 1 series |
| growth: cConsistency has data series | Pass | 3 series |
| growth: cHeat has data series | Pass | 1 series |
| profit: cGrossProfit has data series | Pass | 1 series |
| profit: cMargins has data series | Pass | 2 series |
| profit: cRevNi has data series | Pass | 2 series |
| profit: cShift has data series | Pass | 1 series |
| ratios: cRatio has data series | Pass | 12 series |
| ratios: cRoe has data series | Pass | 1 series |
| ratios: cProfile has data series | Pass | 6 series |
| drivers: cRel has data series | Pass | 4 series |
| scorecard table lists 12 companies | Pass | 12 |
| index mode disabled for ratio metrics, enabled for level metrics | Pass |  |
| trend explorer: metric and index mode switch without errors | Pass |  |

### T03 filters

| Check | Result | Detail |
|---|---|---|
| year filter 2015-2023 keeps exactly the raw rows from 2015 on | Pass | 94 rows vs 94 in raw file |
| no filtered row before 2015 | Pass | 2015 |
| company filter: 3 companies in summaries | Pass | 3 |
| KPIs recalculated for the filter (reference year 2022/2023) | Pass | {"year":2023,"reporting":2,"companies":3} |
| active filter chips shown | Pass | Years 2015-2023 ✕Companies: AAPL, MSFT, NVDA ✕ |
| data explorer reflects filter | Pass | 26 of 161 records (26 after filters). Page 1 of 2. Statement values in USD millions. |
| explorer search narrows rows | Pass | 9 NVDA rows 2015-2023 |
| explorer sorting toggles ascending/descending | Pass | 4,682 / 394,328 |
| pagination controls rendered | Pass | 5 |
| removing a chip removes that filter | Pass | 12 |
| reset filters restores all 161 records | Pass |  |

### T04 invalid files

| Check | Result | Detail |
|---|---|---|
| missing required column rejected with explanation | Pass | Upload rejected: required columns missing. "02_missing_required_column.csv" has no column for: Revenue.           Columns found: "Year", "Co |
| wrong file type rejected | Pass | The file could not be used. "10_wrong_type.txt" is a .txt file. Please upload a CSV, Excel (.xlsx) or JSON file. Nothing |
| dataset unchanged after rejected files | Pass |  |

### T05 append upload

| Check | Result | Detail |
|---|---|---|
| preview counts: 10 rows, 9 valid, 1 invalid, 1 duplicate, 8 new | Pass | {"rows in file":10,"passed validation":9,"invalid (rejected)":1,"duplicates":1,"existing company-years with different values":0,"new records |
| rejection reasons listed | Pass |  |
| validation results downloadable | Pass | upload_validation_01_append_valid_with_duplicate_and_invalid.csv_2026-11-09.csv |
| confirmation sentence uses actual counts | Pass | Data successfully added. 10 records were processed, 8 were accepted (8 added), 1 duplicate was detected and 1 record was rejected.All KPIs,  |
| dataset grows to 169 records and 13 companies | Pass | 169/13 |
| KPIs recalculated (combined revenue includes DEMO 2022) | Pass | 1642741.38 > 1639070.68 |
| company filter gains DEMO | Pass |  |
| scorecard includes DEMO | Pass |  |
| header shows working dataset status | Pass | Working dataset: 169 records (1 upload in this browser) |

### T06 local persistence

| Check | Result | Detail |
|---|---|---|
| after reload the working dataset (169 records, 1 upload) is restored from IndexedDB | Pass | 169, 1 |

### T07 duplicate handling

| Check | Result | Detail |
|---|---|---|
| re-uploading the same file adds nothing and reports 9 duplicates | Pass | {"rows in file":10,"passed validation":9,"invalid (rejected)":1,"duplicates":9,"existing company-years with different values":0,"new records |
| apply button disabled when nothing to add | Pass |  |
| duplicate rows inside one file detected | Pass | {"rows in file":3,"passed validation":2,"invalid (rejected)":0,"duplicates":1,"existing company-years with different values":0,"new records  |

### T08 update or add (merge)

| Check | Result | Detail |
|---|---|---|
| append mode flags the changed existing row as a conflict | Pass | {"rows in file":2,"passed validation":2,"invalid (rejected)":0,"duplicates":0,"existing company-years with different values":1,"new records  |
| merge mode: 1 update, 1 insert | Pass | {"rows in file":2,"passed validation":2,"invalid (rejected)":0,"duplicates":0,"new records to add":1,"records to update":1,"already identica |
| MSFT 2022 revenue updated and margin recalculated | Pass | 200000, 36.369 |
| dataset now 170 records | Pass | 170 |

### T09 JSON, XLSX and alternative headers

| Check | Result | Detail |
|---|---|---|
| JSON: 4 records accepted | Pass | {"rows in file":4,"passed validation":4,"invalid (rejected)":0,"duplicates":0,"existing company-years with different values":0,"new records  |
| XLSX: 5 records accepted | Pass | {"rows in file":5,"passed validation":5,"invalid (rejected)":0,"duplicates":0,"existing company-years with different values":0,"new records  |
| alternative names mapped and reported | Pass |  |
| dataset now 179 records | Pass | 179 |

### T10 security

| Check | Result | Detail |
|---|---|---|
| HTML in uploaded text is shown as text, not executed | Pass | img elements 0, alerts 0 |
| exported CSV neutralises formula text | Pass |  |

### T11 data export

| Check | Result | Detail |
|---|---|---|
| full CSV export has every analysed record | Pass | 181 rows vs 181 |
| export includes uploaded records and source column | Pass |  |
| export has input, derived and flag columns | Pass | 43 columns |
| exported values match the source (AAPL 2022 revenue 394328) | Pass | 2022,AAPL,IT,2066.94,394328,170782,99803,6.11,130541,50672,1 |
| filtered CSV export matches filtered view | Pass | 47 vs 47; financial_analysis_dataset_filtered_2026-11-09.csv |
| XLSX export opens with data, summary and about sheets | Pass | ['Analysis data', 'Company summary', 'About'] 181 17 |

### T12 PDF report

| Check | Result | Detail |
|---|---|---|
| filtered report downloads as a valid PDF | Pass | 6 pages, financial_performance_report_filtered_2026-11-09.pdf |
| report states scope and filters | Pass |  |
| report has section "1. Business context" | Pass |  |
| report has section "3. Dataset overview" | Pass |  |
| report has section "4. Data preparation summary" | Pass |  |
| report has section "5. Analytical methods" | Pass |  |
| report has section "6. KPI definitions" | Pass |  |
| report has section "7. Important numerical results" | Pass |  |
| report has section "8. Key findings" | Pass |  |
| report has section "10. Recommendations" | Pass |  |
| report has section "11. Limitations" | Pass |  |
| report reflects uploaded data (DEMO and upload history) | Pass |  |
| full-dataset report covers every record | Pass | 181 company-years |
| report has embedded chart images | Pass |  |

### T13 undo and reset

| Check | Result | Detail |
|---|---|---|
| undo removes the last upload (SAFE) | Pass | 179, 4 |
| replace asks for confirmation | Pass |  |
| replace leaves only the 3 companies in the file | Pass | 3 companies, 43 records |
| undoing a replace restores the previous dataset | Pass | 179 |
| reset returns to the original 161 records | Pass |  |
| after reset and reload, local data is gone (161 records) | Pass |  |

### T14 layout and accessibility

| Check | Result | Detail |
|---|---|---|
| dark mode applied | Pass |  |
| arrow keys move between tabs | Pass |  |
| mobile 390px: no horizontal page scroll on overview | Pass | overflow 0px |
| mobile 390px: no horizontal page scroll on growth | Pass | overflow 0px |
| mobile 390px: no horizontal page scroll on data | Pass | overflow 0px |
| tablet 820px: no horizontal page scroll | Pass |  |

### T15 deployment

| Check | Result | Detail |
|---|---|---|
| all asset references are relative | Pass |  |
| every referenced file exists | Pass |  |
| dashboard also works opened directly from disk (file://) | Pass | 161 records;  |

### T16 console

| Check | Result | Detail |
|---|---|---|
| no JavaScript errors during the whole run | Pass |  |

## Test data

The upload test files in `tests/data/` (created by `tests/make_test_files.py`) use fictional companies (DEMO, TESTCO, ALIASCO, DUPCO, JSONCO, XLSXCO, SAFE) with invented figures, plus exact copies of existing rows to test duplicate detection. They are test fixtures, not financial data.

## How to re-run

```bash
python -m http.server 8765 &
python tests/make_test_files.py
node tests/run_tests.js
python tests/make_test_report.py
node tests/export_original.js && python tests/check_export_vs_python.py
```

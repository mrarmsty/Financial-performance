# Dashboard user guide

## Opening the dashboard

- **Online:** open the GitHub Pages address of the repository.
- **On your computer:** double-click `index.html`. No installation or internet connection is needed.

## Finding your way around

The tabs follow the story of the analysis:

| Tab | Use it to |
|---|---|
| **Overview** | See the headline KPIs, key findings, revenue share, the performance label of each company and the recommended actions |
| **Revenue & growth** | Compare revenue (or another metric) over time, see who grew fastest and how steady growth was |
| **Profitability** | Compare gross profit and margins, check whether revenue growth brought profit growth, and see who grew while profitability fell |
| **Ratios & market** | Follow ROE, ROA, leverage, liquidity, EPS and market cap over time, and open a one-company profile |
| **Performance & drivers** | Read the full scorecard and test whether size goes with growth or profitability |
| **Data explorer** | Search, sort and page through the underlying records |
| **Add data** | Upload more data, undo it or reset |
| **Methodology & help** | Definitions, rules and the upload file format |

Every KPI has an **i** button that explains how it is calculated.

## Filters

- **From / To** set the years.
- **Category** and **Companies** open checklists. Use **All** or **None** to select quickly.
- Active filters appear as chips beside the filters. Click a chip to remove that filter, or press **Reset filters**.
- All filters apply everywhere at once: KPIs, charts, tables, findings, the report and the filtered export.

## Investigating charts

- **Hover** over any chart for exact values.
- **Click** a company in a chart to open its profile on the Ratios & market tab.
- In the trend charts, click company names under **Highlight** to colour up to three companies. The others stay grey for context.
- Choose **Index (first year = 100)** to compare companies of very different size on the same scale, or **Log scale** to see small and large companies together.
- Press **⤢** on a chart to view it full screen. Press Esc to return.

## Adding data

1. Go to **Add data**. Drag a CSV, Excel (.xlsx) or JSON file onto the box, or click to browse.
2. The file needs at least the columns **Year, Company, Revenue, Net Income**. You can download a blank template, or a test file with a fictional company, from the links under the upload box.
3. Choose what should happen:
   - **Add new records** adds new company-years and never changes existing ones.
   - **Update or add** overwrites matching company-years and adds new ones. Blank cells keep the existing value.
   - **Replace the whole dataset** uses only your file. You will be asked to confirm.
4. Read the **Upload check**. It shows:
   - how many rows were read, passed validation, were rejected or were duplicates;
   - how many will be added or updated;
   - how each column was matched;
   - the reason for every row that will not be used.
5. Press **Apply upload**. A confirmation message reports the actual counts, and every KPI, chart and table updates immediately.

**If rows are rejected:**

| Problem | What to do |
|---|---|
| Missing required column | Rename your columns to the names in **Methodology & help → Upload file format** |
| Invalid year or company code | Use a 4-digit year and a ticker of up to 10 letters, digits, "." or "-" |
| Revenue or net income not a number | Remove text, notes or formulas from those cells |
| Duplicate in file | The same company and year appear twice; keep one row |
| Already exists with different values | Use **Update or add** if you meant to correct the data |

Press **Download validation results** for a CSV listing every issue.

## Report and data downloads

- **Generate Analysis Report** creates a PDF from the data loaded right now, including your uploads. Choose the current filtered view or the entire dataset; the report states which it covers.
- **Download Analysis Data** exports the cleaned records with all derived metrics, as CSV or Excel, for the full dataset or the filtered view. The file name says which. The Excel file also contains the company summary.
- **Download company summary (CSV)** on the Add data tab exports the scorecard.

## Where your uploads are kept and how to clear them

Uploads are saved only in this browser on this device (IndexedDB). They are never sent anywhere, and other visitors never see them. When you come back in the same browser, your working dataset reloads automatically.

- **Undo last upload** reverses the most recent upload. Repeat it to step back further.
- **Reset to the original dataset** deletes everything saved locally.
- Clearing the browser's site data for the page has the same effect as resetting.

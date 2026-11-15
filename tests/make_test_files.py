"""Creates the upload test files in tests/data/. All test companies (DEMO, TESTCO, ...) are fictional and their
figures are invented for testing the upload pipeline only; they are not real financial data."""
import json
from pathlib import Path
import openpyxl

OUT = Path(__file__).resolve().parent / "data"
OUT.mkdir(exist_ok=True)
H = ["Year", "Company ", "Category", "Market Cap(in B USD)", "Revenue", "Gross Profit", "Net Income", "Earning Per Share", "EBITDA",
     "Share Holder Equity", "Cash Flow from Operating", "Cash Flow from Investing", "Cash Flow from Financial Activities", "Current Ratio",
     "Debt/Equity Ratio", "ROE", "ROA", "ROI", "Net Profit Margin", "Free Cash Flow per Share", "Return on Tangible Equity",
     "Number of Employees", "Inflation Rate(in US)"]
raw = (Path(__file__).resolve().parents[1] / "data/raw/Financial_Statements.csv").read_text().splitlines()
aapl_2022 = raw[1]                                   # exact copy of an existing record (duplicate test)


def demo_rows(ticker, start=2015, end=2022, rev=1200.0):
    rows = []
    for y in range(start, end + 1):
        rev = round(rev * 1.15, 1); ni = round(rev * 0.1, 1)
        rows.append([y, ticker, "IT", round(rev * 4 / 1000, 2), rev, round(rev * 0.55, 1), ni, round(ni / 300, 2), round(rev * 0.2, 1),
                     round(rev * 0.8, 1), round(ni * 1.3, 1), -round(rev * 0.1, 1), -round(ni * 0.4, 1), 1.8, 0.4, "", "", "", "", "", "", 1500, ""])
    return rows


def csv(name, header, rows):
    lines = [",".join(header)] + [",".join(str(v) for v in r) if isinstance(r, list) else r for r in rows]
    (OUT / name).write_text("\n".join(lines) + "\n", encoding="utf-8")


# 1 valid append: 8 new DEMO rows + 1 exact duplicate of AAPL 2022 + 1 invalid row (bad year, non-numeric revenue)
csv("01_append_valid_with_duplicate_and_invalid.csv", H, demo_rows("DEMO") + [aapl_2022] + [["20X3", "DEMO", "IT", "", "abc"] + [""] * 18])
# 2 missing required column (no Revenue)
csv("02_missing_required_column.csv", [h for h in H if h != "Revenue"], [[2023, "DEMO", "IT", 5] + [""] * 18])
# 3 merge: changes MSFT 2022 revenue (test value) and adds TESTCO 2023
msft = raw[[i for i, l in enumerate(raw) if l.startswith("2022,MSFT")][0]].split(",")
msft[4] = "200000"
csv("03_merge_update_and_insert.csv", H, [msft, demo_rows("TESTCO", 2023, 2023)[0]])
# 4 alternative column names (mapping test)
csv("04_alias_headers.csv", ["Fiscal Year", "Ticker", "Sector", "Total Revenue", "Net Profit", "EPS"],
    [[2021, "ALIASCO", "Food", 5000, 400, 1.2], [2022, "ALIASCO", "Food", 5500, 420, 1.3]])
# 5 duplicates inside one file
csv("05_duplicate_rows_in_file.csv", H, demo_rows("DUPCO", 2020, 2021) + demo_rows("DUPCO", 2021, 2021))
# 6 replace: three companies only
csv("06_replace_three_companies.csv", H, [l for l in raw[1:] if l.split(",")[1].strip() in ("AAPL", "MSFT", "GOOG")])
# 7 security: formula text and HTML in a text field
csv("07_security_formula_and_html.csv", H, [[2022, "SAFE", '"=HYPERLINK(""http://example.com"")"', 10, 1000, 500, 100] + [""] * 16,
                                           [2021, "SAFE", "<img src=x onerror=alert(1)>", 10, 900, 450, 90] + [""] * 16])
# 8 JSON and 9 XLSX versions of valid data
(OUT / "08_valid.json").write_text(json.dumps({"records": [dict(zip(H, r)) for r in demo_rows("JSONCO", 2019, 2022)]}, indent=1))
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Data"; ws.append(H)
for r in demo_rows("XLSXCO", 2018, 2022): ws.append([None if v == "" else v for v in r])
wb.save(OUT / "09_valid.xlsx")
# 10 wrong file type
(OUT / "10_wrong_type.txt").write_text("not a data file\n")
print("\n".join(sorted(p.name for p in OUT.iterdir())))

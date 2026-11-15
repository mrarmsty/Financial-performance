"""Compares the dashboard's full CSV export (original data) with the pandas pipeline row by row.
Run after tests/export_original.js:  python tests/check_export_vs_python.py"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
js = pd.read_csv(ROOT / "tests/downloads/export_original_full.csv", encoding="utf-8-sig")
py = pd.read_csv(ROOT / "data/processed/financials_analysis.csv")
cols = ["revenue", "net_income", "gross_profit_valid", "gross_margin_pct", "net_margin_pct", "ebitda", "ebitda_margin_pct", "roe_pct", "debt_equity",
        "current_ratio", "cfo_to_net_income", "revenue_per_employee_k", "price_to_sales", "revenue_growth_pct", "net_income_growth_pct",
        "net_margin_change_pp", "is_loss", "growth_with_margin_decline"]
m = js.merge(py, on=["ticker", "year"], suffixes=("_js", "_py"), how="outer", indicator=True)
ok = True
print(f"rows: dashboard {len(js)}, pandas {len(py)}, matched {int((m['_merge'] == 'both').sum())}")
if (m["_merge"] != "both").any(): ok = False; print("unmatched rows", m.loc[m["_merge"] != "both", ["ticker", "year"]])
for c in cols:
    a, b = m[f"{c}_js"].astype(float), m[f"{c}_py"].astype(float)
    bad = ~(((a.isna()) & (b.isna())) | (np.abs(a - b) <= 1e-5 * np.maximum(1, np.abs(b))))
    print(f"{c:28s} {'OK' if not bad.any() else f'{int(bad.sum())} differences'}")
    ok &= not bad.any()
cat_ok = (m["category_js"] == m["category_py"]).all(); print(f"{'category':28s} {'OK' if cat_ok else 'differences'}"); ok &= cat_ok
print("ALL MATCH" if ok else "MISMATCHES FOUND"); sys.exit(0 if ok else 1)

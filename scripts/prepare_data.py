"""Reference data pipeline for the financial performance dashboard.

Produces the cleaned and analysis-ready datasets in data/processed/ from the raw CSV, using the same rules
as the dashboard's JavaScript pipeline (assets/js/data-processing.js and analytics.js). It is also the
independent calculation used to test the dashboard's KPIs (tests/check_kpis.py).

Run from the repository root:  python scripts/prepare_data.py
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "Financial_Statements.csv"
OUT = ROOT / "data" / "processed"

RENAME = {
    "Year": "year", "Company": "ticker", "Category": "category_source", "Market Cap(in B USD)": "market_cap_bn",
    "Revenue": "revenue", "Gross Profit": "gross_profit", "Net Income": "net_income", "Earning Per Share": "eps",
    "EBITDA": "ebitda", "Share Holder Equity": "equity", "Cash Flow from Operating": "cfo",
    "Cash Flow from Investing": "cfi", "Cash Flow from Financial Activities": "cff", "Current Ratio": "current_ratio",
    "Debt/Equity Ratio": "debt_equity", "ROE": "roe_reported", "ROA": "roa_reported", "ROI": "roi_reported",
    "Net Profit Margin": "net_margin_reported", "Free Cash Flow per Share": "fcf_per_share",
    "Return on Tangible Equity": "rote_reported", "Number of Employees": "employees",
    "Inflation Rate(in US)": "inflation_us_pct",
}
CATEGORY = {"it": "IT", "elec": "Electronics", "bank": "Bank", "fintech": "FinTech", "food": "Food",
            "logi": "Logistics", "manufacturing": "Manufacturing", "finance": "Finance"}
NAMES = {"AAPL": "Apple", "MSFT": "Microsoft", "GOOG": "Alphabet (Google)", "PYPL": "PayPal", "AIG": "American International Group",
         "PCG": "PG&E Corporation", "SHLDQ": "Sears Holdings", "MCD": "McDonald's", "BCS": "Barclays", "NVDA": "NVIDIA",
         "INTC": "Intel", "AMZN": "Amazon"}


def clean(raw: pd.DataFrame):
    log = []
    d = raw.copy()
    d.columns = d.columns.str.strip()
    log.append(("C1", "column names", "Trimmed header whitespace ('Company ' -> 'Company') and renamed to snake_case", len(d)))
    d = d.rename(columns=RENAME)
    d["ticker"] = d["ticker"].astype(str).str.strip().str.upper()
    src = d["category_source"].astype(str).str.strip()
    d["category"] = src.str.lower().map(CATEGORY).fillna(src)
    log.append(("C2", "category", "Standardised category labels: 'BANK'/'Bank' -> 'Bank', 'ELEC' -> 'Electronics', 'FOOD' -> 'Food', 'LOGI' -> 'Logistics'",
                int((src != d["category"]).sum())))
    d["company_name"] = d["ticker"].map(NAMES).fillna(d["ticker"])
    # placeholders and not-meaningful values
    gp_nm = (d["gross_profit"] - d["revenue"]).abs() < 1e-9
    d["gross_profit_valid"] = d["gross_profit"].where(~gp_nm)
    log.append(("C3", "gross_profit", "Gross profit equal to revenue (no cost of sales, bank) -> gross margin not meaningful", int(gp_nm.sum())))
    eb_ph = d["ebitda"].abs() <= 1
    d.loc[eb_ph, "ebitda"] = np.nan
    log.append(("C4", "ebitda", "EBITDA recorded as 1 (placeholder) -> missing", int(eb_ph.sum())))
    cr_ph = d["current_ratio"] == 1
    d.loc[cr_ph, "current_ratio"] = np.nan
    log.append(("C5", "current_ratio", "Current ratio of exactly 1.0 (placeholder for insurers/banks) -> missing", int(cr_ph.sum())))
    neg_eq = d["equity"] <= 0
    d.loc[neg_eq, "debt_equity"] = np.nan
    log.append(("C6", "debt_equity, roe", "Shareholder equity <= 0 -> D/E and ROE not meaningful (missing)", int(neg_eq.sum())))
    log.append(("C7", "market_cap_bn", "Missing market cap kept missing (not imputed)", int(d["market_cap_bn"].isna().sum())))
    return d, log


def derive(d: pd.DataFrame):
    d = d.sort_values(["ticker", "year"]).reset_index(drop=True)
    pct = lambda a, b: np.where(b != 0, a / b * 100, np.nan)
    d["gross_margin_pct"] = pct(d["gross_profit_valid"], d["revenue"])
    d["net_margin_pct"] = pct(d["net_income"], d["revenue"])
    d["ebitda_margin_pct"] = pct(d["ebitda"], d["revenue"])
    d["roe_pct"] = np.where(d["equity"] > 0, d["net_income"] / d["equity"] * 100, np.nan)
    d["cfo_to_net_income"] = np.where(d["net_income"] > 0, d["cfo"] / d["net_income"], np.nan)
    d["revenue_per_employee_k"] = np.where(d["employees"] > 0, d["revenue"] * 1000 / d["employees"], np.nan)
    d["price_to_sales"] = np.where(d["revenue"] > 0, d["market_cap_bn"] * 1000 / d["revenue"], np.nan)
    g = d.groupby("ticker")
    prev_year = g["year"].shift(1)
    consec = prev_year == d["year"] - 1
    pr, pn, pm = g["revenue"].shift(1), g["net_income"].shift(1), g["net_margin_pct"].shift(1)
    d["revenue_growth_pct"] = np.where(consec & (pr > 0), (d["revenue"] / pr - 1) * 100, np.nan)
    d["net_income_growth_pct"] = np.where(consec & (pn > 0), (d["net_income"] / pn - 1) * 100, np.nan)
    d["net_margin_change_pp"] = np.where(consec, d["net_margin_pct"] - pm, np.nan)
    d["is_loss"] = (d["net_income"] < 0).astype(int)
    d["growth_with_margin_decline"] = ((d["revenue_growth_pct"] > 0) & (d["net_margin_change_pp"] < -1)).astype(int)
    return d


def slope(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    m = ~np.isnan(y)
    if m.sum() < 3:
        return np.nan
    x, y = x[m], y[m]
    return float(((x - x.mean()) * (y - y.mean())).sum() / ((x - x.mean()) ** 2).sum())


def company_summary(d: pd.DataFrame):
    rows = []
    total_rev = d["revenue"].sum()
    for t, s in d.groupby("ticker"):
        s = s.sort_values("year")
        f, l = s.iloc[0], s.iloc[-1]
        span = l["year"] - f["year"]
        cagr = (l["revenue"] / f["revenue"]) ** (1 / span) * 100 - 100 if span >= 1 and f["revenue"] > 0 else np.nan
        ni_cagr = (l["net_income"] / f["net_income"]) ** (1 / span) * 100 - 100 if span >= 1 and f["net_income"] > 0 and l["net_income"] > 0 else np.nan
        gr = s["revenue_growth_pct"].dropna()
        k = max(1, min(3, len(s) // 2))   # periods averaged at each end for the margin shift
        rows.append(dict(
            ticker=t, company_name=f["company_name"], category=f["category"], first_year=int(f["year"]), last_year=int(l["year"]),
            years=len(s), revenue_first=f["revenue"], revenue_last=l["revenue"], revenue_cagr_pct=cagr, net_income_cagr_pct=ni_cagr,
            total_revenue=s["revenue"].sum(), revenue_share_pct=s["revenue"].sum() / total_rev * 100,
            total_gross_profit=s["gross_profit_valid"].sum(min_count=1), total_net_income=s["net_income"].sum(),
            avg_gross_margin_pct=s["gross_margin_pct"].mean(), avg_net_margin_pct=s["net_margin_pct"].mean(),
            median_roe_pct=s["roe_pct"].median(), net_margin_change_pp=l["net_margin_pct"] - f["net_margin_pct"],
            net_margin_shift_pp=s["net_margin_pct"].iloc[-k:].mean() - s["net_margin_pct"].iloc[:k].mean(),
            net_margin_trend_pp_per_year=slope(s["year"], s["net_margin_pct"]),
            pct_years_revenue_growth=(gr > 0).mean() * 100 if len(gr) else np.nan,
            revenue_growth_volatility_pp=gr.std(ddof=1) if len(gr) >= 2 else np.nan,
            loss_years=int(s["is_loss"].sum()), pct_years_profitable=(1 - s["is_loss"].mean()) * 100,
            growth_with_margin_decline_years=int(s["growth_with_margin_decline"].sum()),
            initial_revenue=f["revenue"], median_market_cap_bn=s["market_cap_bn"].median(),
            latest_market_cap_bn=l["market_cap_bn"], latest_eps=l["eps"], loss_in_last_year=int(l["is_loss"]),
        ))
    cs = pd.DataFrame(rows)

    def classify(r):            # same rules and wording as assets/js/analytics.js classify()
        reasons = []
        if r.loss_in_last_year: reasons.append(f"loss in {r.last_year}")
        if not np.isnan(r.revenue_cagr_pct) and r.revenue_cagr_pct < 0: reasons.append("revenue declining")
        if not np.isnan(r.net_margin_trend_pp_per_year) and r.net_margin_trend_pp_per_year <= -1: reasons.append("net margin falling by 1 pp or more a year")
        if r.net_margin_shift_pp <= -5: reasons.append("net margin down 5 pp or more (end vs start averages)")
        if reasons: return "Deteriorating", "; ".join(reasons)
        trend_ok = np.isnan(r.net_margin_trend_pp_per_year) or r.net_margin_trend_pp_per_year >= -0.5
        if r.revenue_cagr_pct >= 5 and r.avg_net_margin_pct >= 10 and r.pct_years_profitable >= 90 and trend_ok:
            return "Consistently strong", "revenue growth of 5%+ a year, average net margin of 10%+, profitable in 90%+ of years, margin stable or rising"
        miss = []
        if not r.revenue_cagr_pct >= 5: miss.append("growth below 5% a year")
        if not r.avg_net_margin_pct >= 10: miss.append("average net margin below 10%")
        if not r.pct_years_profitable >= 90: miss.append("losses in more than 10% of years")
        if not trend_ok: miss.append("margin drifting down")
        return "Mixed", "; ".join(miss) or "meets neither rule set"
    cs[["classification", "classification_reason"]] = cs.apply(lambda r: pd.Series(classify(r)), axis=1)

    # composite score: mean percentile rank of four metrics (missing values rank lowest)
    def prank(s):
        return s.rank(pct=True, method="average", na_option="top") * 100
    parts = [prank(cs.revenue_cagr_pct), prank(cs.avg_net_margin_pct), prank(cs.median_roe_pct), prank(cs.pct_years_revenue_growth)]
    cs["performance_score"] = sum(parts) / 4
    return cs.sort_values("performance_score", ascending=False)


def pearson(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    m = ~(np.isnan(x) | np.isnan(y)); x, y = x[m], y[m]
    n = len(x)
    r = float(np.corrcoef(x, y)[0, 1])
    t = r * math.sqrt((n - 2) / (1 - r * r))
    from scipy import stats
    p = float(2 * stats.t.sf(abs(t), n - 2))
    return r, p, n


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    raw = pd.read_csv(RAW)
    d, log = clean(raw)
    d = derive(d)
    base_cols = ["year", "ticker", "company_name", "category", "category_source", "market_cap_bn", "revenue", "gross_profit",
                 "net_income", "eps", "ebitda", "equity", "cfo", "cfi", "cff", "current_ratio", "debt_equity", "roe_reported",
                 "roa_reported", "roi_reported", "net_margin_reported", "fcf_per_share", "rote_reported", "employees", "inflation_us_pct"]
    d[base_cols].to_csv(OUT / "financials_cleaned.csv", index=False)
    d.to_csv(OUT / "financials_analysis.csv", index=False)
    cs = company_summary(d)
    cs.to_csv(OUT / "company_summary.csv", index=False)
    pd.DataFrame(log, columns=["rule", "field", "action", "rows_affected"]).to_csv(OUT / "cleaning_log.csv", index=False)

    # reference values for testing the dashboard (default view: all years, all companies)
    ref_year = 2022
    cur = d[d.year == ref_year]; prev = d[d.year == ref_year - 1]
    both = set(cur.ticker) & set(prev.ticker)
    c2, p2 = cur[cur.ticker.isin(both)], prev[prev.ticker.isin(both)]
    mc = d[d.year.isin([ref_year, ref_year - 1])].pivot(index="ticker", columns="year", values="market_cap_bn").dropna()
    cs_i = cs.set_index("ticker")
    size = np.log10(cs_i.initial_revenue)
    size_mc = np.log10(cs_i.median_market_cap_bn)
    ref = {
        "reference_year": ref_year, "companies_reporting": int(len(cur)),
        "combined_revenue": float(cur.revenue.sum()), "revenue_lfl_growth_pct": float((c2.revenue.sum() / p2.revenue.sum() - 1) * 100),
        "combined_net_income": float(cur.net_income.sum()), "net_income_lfl_growth_pct": float((c2.net_income.sum() / p2.net_income.sum() - 1) * 100),
        "aggregate_net_margin_pct": float(cur.net_income.sum() / cur.revenue.sum() * 100),
        "aggregate_net_margin_change_pp": float(c2.net_income.sum() / c2.revenue.sum() * 100 - p2.net_income.sum() / p2.revenue.sum() * 100),
        "median_revenue_cagr_pct": float(cs.revenue_cagr_pct.median()), "median_roe_pct": float(cur.roe_pct.median()),
        "combined_market_cap_bn": float(cur.market_cap_bn.sum()), "market_cap_lfl_growth_pct": float((mc[ref_year].sum() / mc[ref_year - 1].sum() - 1) * 100),
        "classification_counts": cs.classification.value_counts().to_dict(),
        "corr_size_growth": pearson(size, cs_i.revenue_cagr_pct),
        "corr_size_margin": pearson(size, cs_i.avg_net_margin_pct),
        "corr_mcap_growth": pearson(size_mc, cs_i.revenue_cagr_pct),
        "corr_mcap_margin": pearson(size_mc, cs_i.avg_net_margin_pct),
        "corr_growth_margin": pearson(cs_i.revenue_cagr_pct, cs_i.avg_net_margin_pct),
        "rows": int(len(d)), "companies": int(d.ticker.nunique()),
    }
    (OUT / "reference_values.json").write_text(json.dumps(ref, indent=1, default=float))
    print(json.dumps(ref, indent=1, default=float))
    print(cs[["ticker", "revenue_cagr_pct", "avg_net_margin_pct", "median_roe_pct", "net_margin_trend_pp_per_year", "classification", "performance_score"]].round(2).to_string())


if __name__ == "__main__":
    main()

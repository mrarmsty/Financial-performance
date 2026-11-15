"""Embeds data/raw/Financial_Statements.csv unchanged into data/base-data.js (loaded by index.html)."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT / "data/raw/Financial_Statements.csv").read_text(encoding="utf-8")
(ROOT / "data/base-data.js").write_text(
    "/* Base dataset: data/raw/Financial_Statements.csv embedded unchanged so the dashboard also works when opened\n"
    "   straight from disk (file://), where browsers block fetch(). Regenerate with: python scripts/build_base_data.py */\n"
    "window.BASE_DATASET = " + json.dumps({"name": "Financial_Statements.csv", "source": "data/raw/Financial_Statements.csv", "csv": raw}) + ";\n",
    encoding="utf-8")
print("wrote data/base-data.js")

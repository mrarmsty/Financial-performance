/* data-processing.js - reading files, mapping columns, validating rows, applying upload batches and deriving metrics.
   The base dataset and every upload go through exactly the same functions, so uploaded records are cleaned and
   derived in the same way as the original data. */
(function () {
  'use strict';
  const { FIELDS, CATEGORY_MAP, COMPANY_NAMES, RULES } = window.FinConfig;
  const { isNum } = window.FinUtils;
  const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
  const INPUT_KEYS = FIELDS.map((f) => f.key);
  const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const keyOf = (r) => `${r.ticker}|${r.year}`;

  // ---------------------------------------------------------------- reading files
  async function readFile(file) {
    const name = file.name || 'upload';
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (!['csv', 'xlsx', 'json'].includes(ext)) throw new UserError(`"${name}" is a .${ext} file. Please upload a CSV, Excel (.xlsx) or JSON file.`);
    if (file.size > RULES.maxFileBytes) throw new UserError(`The file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${RULES.maxFileBytes / 1048576} MB.`);
    if (file.size === 0) throw new UserError('The file is empty.');
    if (ext === 'csv') return readCsvText(await file.text());
    if (ext === 'json') return readJson(await file.text());
    return readXlsx(await file.arrayBuffer());
  }
  function readCsvText(text) {
    const res = window.Papa.parse(text, { header: true, skipEmptyLines: 'greedy', dynamicTyping: false, transformHeader: (h) => h });
    const fatal = res.errors.filter((e) => e.type === 'Delimiter' || e.type === 'Quotes');
    if (fatal.length && !res.data.length) throw new UserError(`The CSV could not be read: ${fatal[0].message}.`);
    return { headers: res.meta.fields || [], rows: res.data, parseWarnings: res.errors.map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`) };
  }
  function readJson(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new UserError('The JSON file is not valid JSON.'); }
    const arr = Array.isArray(data) ? data : Array.isArray(data?.records) ? data.records : Array.isArray(data?.data) ? data.data : null;
    if (!arr) throw new UserError('The JSON must be an array of records, or an object with a "records" array.');
    if (arr.some((r) => r === null || typeof r !== 'object' || Array.isArray(r))) throw new UserError('Every JSON record must be an object of field: value pairs.');
    const headers = [...new Set(arr.flatMap((r) => Object.keys(r)))];
    return { headers, rows: arr, parseWarnings: [] };
  }
  async function readXlsx(buffer) {
    const wb = new window.ExcelJS.Workbook();
    try { await wb.xlsx.load(buffer); } catch (e) { throw new UserError('The Excel file could not be opened. Save it as .xlsx and try again.'); }
    const ws = wb.worksheets[0];
    if (!ws || ws.rowCount < 2) throw new UserError('The first worksheet has no data rows.');
    const cellValue = (v) => {
      if (v === null || v === undefined) return '';
      if (v instanceof Date) return v.getUTCFullYear();
      if (typeof v === 'object') {
        if ('result' in v) return cellValue(v.result);          // formula cell
        if ('richText' in v) return v.richText.map((t) => t.text).join('');
        if ('text' in v) return v.text;
        if ('error' in v) return '';
      }
      return v;
    };
    const headers = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i - 1] = String(cellValue(c.value)); });
    const rows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r); if (!row.hasValues) continue;
      const o = {}; headers.forEach((h, i) => { o[h] = cellValue(row.getCell(i + 1).value); }); rows.push(o);
    }
    return { headers, rows, parseWarnings: [] };
  }

  // ---------------------------------------------------------------- column mapping
  function mapColumns(headers) {
    const mapping = {}, notes = [], unknown = [], clashes = [];
    const used = {};
    headers.forEach((h) => {
      const n = norm(h); if (!n) return;
      const f = FIELDS.find((x) => x.aliases.includes(n));
      if (!f) { unknown.push(h); return; }
      if (used[f.key]) { clashes.push(`"${h}" and "${used[f.key]}" both map to ${f.label}; "${h}" was ignored`); return; }
      used[f.key] = h; mapping[h] = f.key;
      notes.push({ header: h, field: f.label, method: n === f.aliases[0] ? 'standard name' : 'recognised alternative name' });
    });
    const missingRequired = FIELDS.filter((f) => f.required && !used[f.key]).map((f) => f.label);
    const missingOptional = FIELDS.filter((f) => !f.required && !used[f.key]).map((f) => f.label);
    return { mapping, notes, unknown, clashes, missingRequired, missingOptional, present: Object.keys(used) };
  }

  // ---------------------------------------------------------------- value parsing
  function parseNumber(v) {
    if (v === null || v === undefined) return { value: null, ok: true };
    if (typeof v === 'number') return Number.isFinite(v) ? { value: v, ok: true } : { value: null, ok: false };
    let s = String(v).trim();
    if (s === '' || /^(na|n\/a|nan|null|none|-|--)$/i.test(s)) return { value: null, ok: true };
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[$,%\s]/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return { value: null, ok: false };
    const n = Number(s) * (neg ? -1 : 1);
    return Number.isFinite(n) ? { value: n, ok: true } : { value: null, ok: false };
  }
  function standardCategory(raw) {
    const s = String(raw ?? '').trim(); if (!s) return null;
    return CATEGORY_MAP[s.toLowerCase()] || null;
  }

  // ---------------------------------------------------------------- row validation
  // existing: Map key -> record (current dataset). Used only to borrow a known company's category.
  function validateRows(rows, colMap, existingByTicker) {
    const accepted = [], rejected = [], warnings = [];
    const seen = new Map();
    if (rows.length > RULES.maxRows) throw new UserError(`The file has ${rows.length.toLocaleString()} rows. The limit is ${RULES.maxRows.toLocaleString()}.`);
    rows.forEach((raw, i) => {
      const rowNo = i + 2;                                   // spreadsheet row number (header is row 1)
      const rec = {}; const reasons = [];
      for (const [header, key] of Object.entries(colMap.mapping)) rec[key] = raw[header];
      // year
      const y = parseNumber(rec.year);
      if (!y.ok || y.value === null || !Number.isInteger(y.value) || y.value < RULES.yearMin || y.value > RULES.yearMax)
        reasons.push(`Year "${raw[colKey(colMap, 'year')] ?? ''}" is not a 4-digit year between ${RULES.yearMin} and ${RULES.yearMax}`);
      else rec.year = y.value;
      // ticker
      const t = String(rec.ticker ?? '').trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)) reasons.push(`Company "${rec.ticker ?? ''}" is not a valid ticker (1-10 letters, digits, "." or "-")`);
      else rec.ticker = t;
      // numeric fields
      for (const f of FIELDS) {
        if (f.type !== 'num' || !(f.key in rec)) continue;
        const p = parseNumber(rec[f.key]);
        if (!p.ok) {
          if (f.required) reasons.push(`${f.label} "${rec[f.key]}" is not a number`);
          else warnings.push({ row: rowNo, field: f.label, message: `"${rec[f.key]}" is not a number; stored as missing` });
          rec[f.key] = null; continue;
        }
        rec[f.key] = p.value;
        if (p.value !== null && f.min !== undefined && p.value < f.min) {
          warnings.push({ row: rowNo, field: f.label, message: `negative value ${p.value} is not valid; stored as missing` }); rec[f.key] = null;
        }
      }
      if (rec.revenue === null || rec.revenue === undefined) reasons.push('Revenue is missing');
      else if (rec.revenue <= 0) reasons.push(`Revenue ${rec.revenue} must be greater than zero`);
      if (rec.net_income === null || rec.net_income === undefined) reasons.push('Net income is missing');
      if (isNum(rec.gross_profit) && isNum(rec.revenue) && rec.gross_profit > rec.revenue + 1e-9)
        warnings.push({ row: rowNo, field: 'Gross Profit', message: 'gross profit exceeds revenue; kept but check the source' });
      // category
      const catRaw = String(rec.category_source ?? '').trim();
      if (catRaw) {
        rec.category_source = catRaw;
        if (!standardCategory(catRaw)) warnings.push({ row: rowNo, field: 'Category', message: `"${catRaw}" is a new category; accepted as written` });
      } else {
        const known = existingByTicker && existingByTicker.get(rec.ticker);
        rec.category_source = known ? known.category_source : 'Unclassified';
        warnings.push({ row: rowNo, field: 'Category', message: known ? `missing; used ${rec.ticker}'s existing category "${known.category_source}"` : 'missing; set to "Unclassified"' });
      }
      // optional fields not supplied
      for (const k of INPUT_KEYS) if (!(k in rec)) rec[k] = null;
      if (reasons.length) { rejected.push({ row: rowNo, key: `${rec.ticker || '?'} ${rec.year || '?'}`, reason: reasons.join('; '), type: 'invalid' }); return; }
      const k = keyOf(rec);
      if (seen.has(k)) { rejected.push({ row: rowNo, key: `${rec.ticker} ${rec.year}`, reason: `Duplicate of row ${seen.get(k)} in the same file (same company and year)`, type: 'duplicate_in_file' }); return; }
      seen.set(k, rowNo);
      rec._row = rowNo;
      accepted.push(rec);
    });
    return { accepted, rejected, warnings };
  }
  const colKey = (colMap, key) => Object.keys(colMap.mapping).find((h) => colMap.mapping[h] === key);

  // ---------------------------------------------------------------- applying a batch
  const sameValues = (a, b, keys) => keys.every((k) => (a[k] ?? null) === (b[k] ?? null) || (isNum(a[k]) && isNum(b[k]) && Math.abs(a[k] - b[k]) < 1e-9));
  function stripInternal(r) { const o = {}; INPUT_KEYS.forEach((k) => { o[k] = r[k] ?? null; }); return o; }

  // current: array of stored records; accepted: validated records; present: canonical keys present in the file.
  function applyBatch(current, accepted, mode, present, batchId) {
    const s = { inserted: 0, updated: 0, unchanged: 0, duplicatesExisting: 0, conflicts: 0, removed: 0 };
    const skipped = [];
    if (mode === 'replace') {
      s.removed = current.length;
      const next = accepted.map((r) => ({ ...stripInternal(r), _batch: batchId }));
      s.inserted = next.length;
      return { next, summary: s, skipped };
    }
    const byKey = new Map(current.map((r) => [keyOf(r), r]));
    const next = current.slice();
    const idx = new Map(next.map((r, i) => [keyOf(r), i]));
    const compareKeys = present.filter((k) => INPUT_KEYS.includes(k));
    for (const rec of accepted) {
      const k = keyOf(rec); const old = byKey.get(k); const clean = stripInternal(rec);
      if (!old) { next.push({ ...clean, _batch: batchId }); s.inserted++; continue; }
      if (mode === 'append') {
        if (sameValues(old, clean, compareKeys)) { s.duplicatesExisting++; skipped.push({ row: rec._row, key: `${rec.ticker} ${rec.year}`, reason: 'Already in the dataset with identical values (not added again)', type: 'duplicate_existing' }); }
        else { s.conflicts++; skipped.push({ row: rec._row, key: `${rec.ticker} ${rec.year}`, reason: 'Company-year already exists with different values. Use "Update or add" to overwrite it', type: 'conflict' }); }
        continue;
      }
      // merge: overwrite the columns present in the file; blank cells keep the existing value
      const merged = { ...old };
      compareKeys.forEach((c) => { if (clean[c] !== null && clean[c] !== undefined) merged[c] = clean[c]; });
      if (sameValues(old, merged, INPUT_KEYS)) { s.unchanged++; continue; }
      merged._batch = batchId; next[idx.get(k)] = merged; s.updated++;
    }
    return { next, summary: s, skipped };
  }

  // ---------------------------------------------------------------- cleaning rules and derived metrics
  function derive(records) {
    const rows = records.map((r) => {
      const o = { ...r };
      o.category = standardCategory(r.category_source) || String(r.category_source || 'Unclassified').trim();
      o.company_name = COMPANY_NAMES[r.ticker] || r.ticker;
      const gpNm = isNum(r.gross_profit) && isNum(r.revenue) && Math.abs(r.gross_profit - r.revenue) < 1e-9;
      o.flag_gross_margin_nm = gpNm ? 1 : 0;                             // C3
      o.gross_profit_valid = gpNm ? null : r.gross_profit;
      o.flag_ebitda_placeholder = isNum(r.ebitda) && Math.abs(r.ebitda) <= 1 ? 1 : 0;   // C4
      if (o.flag_ebitda_placeholder) o.ebitda = null;
      o.flag_current_ratio_placeholder = r.current_ratio === 1 ? 1 : 0;   // C5
      if (o.flag_current_ratio_placeholder) o.current_ratio = null;
      o.flag_negative_equity = isNum(r.equity) && r.equity <= 0 ? 1 : 0; // C6
      if (o.flag_negative_equity) o.debt_equity = null;
      const pct = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? (a / b) * 100 : null);
      o.gross_margin_pct = pct(o.gross_profit_valid, r.revenue);
      o.net_margin_pct = pct(r.net_income, r.revenue);
      o.ebitda_margin_pct = pct(o.ebitda, r.revenue);
      o.roe_pct = isNum(r.equity) && r.equity > 0 && isNum(r.net_income) ? (r.net_income / r.equity) * 100 : null;
      o.cfo_to_net_income = isNum(r.cfo) && isNum(r.net_income) && r.net_income > 0 ? r.cfo / r.net_income : null;
      o.revenue_per_employee_k = isNum(r.employees) && r.employees > 0 ? (r.revenue * 1000) / r.employees : null;
      o.price_to_sales = isNum(r.market_cap_bn) && r.revenue > 0 ? (r.market_cap_bn * 1000) / r.revenue : null;
      o.is_loss = isNum(r.net_income) && r.net_income < 0 ? 1 : 0;
      return o;
    });
    rows.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : a.year - b.year));
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], p = rows[i - 1];
      const consec = p && p.ticker === r.ticker && p.year === r.year - 1;
      r.revenue_growth_pct = consec && p.revenue > 0 ? (r.revenue / p.revenue - 1) * 100 : null;
      r.net_income_growth_pct = consec && p.net_income > 0 ? (r.net_income / p.net_income - 1) * 100 : null;
      r.net_margin_change_pp = consec && isNum(p.net_margin_pct) && isNum(r.net_margin_pct) ? r.net_margin_pct - p.net_margin_pct : null;
      r.growth_with_margin_decline = isNum(r.revenue_growth_pct) && r.revenue_growth_pct > 0 && isNum(r.net_margin_change_pp) && r.net_margin_change_pp < RULES.marginDeclineFlagPp ? 1 : 0;
    }
    return rows;
  }

  class UserError extends Error {}

  window.FinData = { readFile, readCsvText, mapColumns, validateRows, applyBatch, derive, parseNumber, keyOf, INPUT_KEYS, FIELD_BY_KEY, UserError };
})();

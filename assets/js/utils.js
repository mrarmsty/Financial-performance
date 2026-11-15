/* utils.js - formatting, safe HTML, statistics and file helpers shared by all modules. */
(function () {
  'use strict';

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // ---------- formatting ----------
  function fmtUsdM(v, digits = 1) {           // input in USD millions
    if (!isNum(v)) return 'n/a';
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}tn`;
    if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(digits)}bn`;
    return `${s}$${a.toFixed(0)}m`;
  }
  const fmtUsdBn = (v) => (isNum(v) ? fmtUsdM(v * 1000) : 'n/a');
  const fmtPct = (v, d = 1) => (isNum(v) ? `${v.toFixed(d)}%` : 'n/a');
  const fmtPp = (v, d = 1) => (isNum(v) ? `${v > 0 ? '+' : ''}${v.toFixed(d)} pp` : 'n/a');
  const fmtSignedPct = (v, d = 1) => (isNum(v) ? `${v > 0 ? '+' : ''}${v.toFixed(d)}%` : 'n/a');
  const fmtNum = (v, d = 0) => (isNum(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : 'n/a');
  const fmtX = (v, d = 2) => (isNum(v) ? `${v.toFixed(d)}x` : 'n/a');
  const fmtUsd = (v, d = 2) => (isNum(v) ? `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(d)}` : 'n/a');
  function fmtByUnit(v, unit) {
    switch (unit) {
      case 'usd_m': return fmtUsdM(v);
      case 'usd_bn': return fmtUsdBn(v);
      case 'pct': return fmtPct(v);
      case 'usd': return fmtUsd(v);
      case 'x': return fmtX(v);
      case 'pp': return fmtPp(v);
      case 'num': return fmtNum(v, 1);
      default: return fmtNum(v, 2);
    }
  }
  function fmtBytes(b) { return b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`; }

  // ---------- safety ----------
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  // CSV formula-injection guard: text cells starting with = + - @ tab or CR are prefixed with an apostrophe.
  // Numbers are written as numbers and are never prefixed.
  function csvCell(v) {
    if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
    if (typeof v === 'number') return String(v);
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCsv(rows, columns) {
    const head = columns.map((c) => csvCell(c.label || c.key)).join(',');
    const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(','));
    return [head, ...body].join('\r\n');
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);

  // ---------- statistics ----------
  const vals = (arr) => arr.filter(isNum);
  function mean(arr) { const a = vals(arr); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
  function median(arr) {
    const a = vals(arr).sort((x, y) => x - y); if (!a.length) return null;
    const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function stdev(arr) {                          // sample standard deviation
    const a = vals(arr); if (a.length < 2) return null; const m = mean(a);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
  }
  function slope(xs, ys) {                       // OLS slope; needs >= 3 points
    const p = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => isNum(x) && isNum(y));
    if (p.length < 3) return null;
    const mx = mean(p.map((q) => q[0])), my = mean(p.map((q) => q[1]));
    const den = p.reduce((s, [x]) => s + (x - mx) ** 2, 0);
    return den ? p.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / den : null;
  }
  function linreg(xs, ys) {
    const p = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => isNum(x) && isNum(y));
    const b = slope(p.map((q) => q[0]), p.map((q) => q[1])); if (b === null) return null;
    const a = mean(p.map((q) => q[1])) - b * mean(p.map((q) => q[0]));
    return { a, b, n: p.length };
  }
  // Regularised incomplete beta (continued fraction, Numerical Recipes) for Student t p-values.
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015;
    for (let j = 0; j < 6; j++) s += c[j] / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  const tTwoSidedP = (t, df) => ibeta(df / 2, 0.5, df / (df + t * t));
  function pearson(xs, ys) {
    const p = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => isNum(x) && isNum(y));
    const n = p.length; if (n < 4) return { r: null, p: null, n };
    const mx = mean(p.map((q) => q[0])), my = mean(p.map((q) => q[1]));
    let sxy = 0, sxx = 0, syy = 0;
    p.forEach(([x, y]) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
    if (!sxx || !syy) return { r: null, p: null, n };
    const r = sxy / Math.sqrt(sxx * syy);
    const t = Math.abs(r) >= 1 ? Infinity : r * Math.sqrt((n - 2) / (1 - r * r));
    return { r, p: Number.isFinite(t) ? tTwoSidedP(t, n - 2) : 0, n };
  }
  function ranks(a) {                            // average ranks for ties
    const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
    return r;
  }
  function spearman(xs, ys) {
    const p = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => isNum(x) && isNum(y));
    return pearson(ranks(p.map((q) => q[0])), ranks(p.map((q) => q[1])));
  }
  function percentRank(values) {                 // percentile rank 0-100, missing values rank lowest (pandas rank pct, average)
    const present = values.map((v, i) => [v, i]).filter(([v]) => isNum(v));
    const missing = values.length - present.length;
    const out = new Array(values.length);
    // missing values share the bottom ranks
    values.forEach((v, i) => { if (!isNum(v)) out[i] = ((missing + 1) / 2) / values.length * 100; });
    const r = ranks(present.map((q) => q[0]));
    present.forEach(([, i], k) => { out[i] = (r[k] + missing) / values.length * 100; });
    return out;
  }
  function describeCorr(r) {
    if (!isNum(r)) return 'not measurable';
    const a = Math.abs(r), dir = r > 0 ? 'positive' : 'negative';
    return a < 0.1 ? 'no meaningful' : a < 0.3 ? `weak ${dir}` : a < 0.5 ? `moderate ${dir}` : `strong ${dir}`;
  }
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  window.FinUtils = { isNum, fmtUsdM, fmtUsdBn, fmtPct, fmtPp, fmtSignedPct, fmtNum, fmtX, fmtUsd, fmtByUnit, fmtBytes, esc, csvCell, toCsv,
    download, stamp, mean, median, stdev, slope, linreg, pearson, spearman, ranks, percentRank, describeCorr, tTwoSidedP, debounce };
})();

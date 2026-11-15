/* End-to-end tests for the dashboard (Playwright + Chromium).
   Usage (from the repository root, with a static server running on port 8765):
     python -m http.server 8765 &   then   node tests/run_tests.js
   Results are written to tests/results.json; README screenshots to assets/images/. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const URL = process.env.DASH_URL || 'http://localhost:8765/index.html';
const DATA = (f) => path.join(ROOT, 'tests', 'data', f);
const IMG = (f) => path.join(ROOT, 'assets', 'images', f);
const DL = path.join(ROOT, 'tests', 'downloads'); fs.mkdirSync(DL, { recursive: true }); fs.mkdirSync(path.join(ROOT, 'assets', 'images'), { recursive: true });
const results = []; let current = '';
const check = (name, ok, detail = '') => { results.push({ test: current, check: name, pass: !!ok, detail: String(detail).slice(0, 300) }); console.log(`${ok ? 'PASS' : 'FAIL'}  [${current}] ${name}${detail ? ' - ' + String(detail).slice(0, 160) : ''}`); };
const close = (a, b, tol = 1e-6) => a !== null && b !== null && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// independent reference values from scripts/prepare_data.py (pandas)
const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed/reference_values.json')));
const pyCsv = fs.readFileSync(path.join(ROOT, 'data/processed/company_summary.csv'), 'utf8').trim().split('\n');
const pyHead = pyCsv[0].split(','); const py = Object.fromEntries(pyCsv.slice(1).map((l) => { const v = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '')); const o = Object.fromEntries(pyHead.map((h, i) => [h, v[i]])); return [o.ticker, o]; }));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; let alerts = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', async (d) => { alerts++; await d.dismiss(); });
  const S = (fn) => page.evaluate(fn);
  const st = () => S(() => { const s = window.FinApp.state; return { n: s.all.length, filtered: s.filtered.length, companies: s.summaries.length, k: s.kpis, batches: s.batches.length }; });
  const upload = async (file, mode = 'append') => { await page.click(`input[name="mode"][value="${mode}"]`); await page.setInputFiles('#fileInput', DATA(file)); await page.waitForTimeout(900); };
  const statText = () => page.$$eval('#uploadPanel .stat', (els) => Object.fromEntries(els.map((e) => [e.querySelector('span').textContent, +e.querySelector('b').textContent])));
  const tab = async (t) => { await page.click(`[data-tab="${t}"]`); await page.waitForTimeout(500); };
  const download = async (trigger) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), trigger()]); const p = path.join(DL, d.suggestedFilename()); await d.saveAs(p); return p; };

  // ------------------------------------------------------------ 1 load and KPIs vs independent calculation
  current = 'T01 load and KPI accuracy';
  await page.goto(URL); await page.waitForFunction(() => window.FinApp && window.FinApp.state.kpis, null, { timeout: 15000 });
  await page.evaluate(() => indexedDB.deleteDatabase('fin-dashboard')); await page.reload(); await page.waitForFunction(() => window.FinApp && window.FinApp.state.kpis);
  let s = await st();
  check('161 records and 12 companies loaded', s.n === 161 && s.companies === 12, `${s.n} records, ${s.companies} companies`);
  check('reference year 2022, 11 companies', s.k.ref.year === ref.reference_year && s.k.ref.reporting === ref.companies_reporting);
  const kmap = [['revenue', 'combined_revenue'], ['revenue_lfl_growth_pct', 'revenue_lfl_growth_pct'], ['net_income', 'combined_net_income'], ['net_income_lfl_growth_pct', 'net_income_lfl_growth_pct'],
    ['net_margin_pct', 'aggregate_net_margin_pct'], ['net_margin_change_pp', 'aggregate_net_margin_change_pp'], ['median_cagr_pct', 'median_revenue_cagr_pct'], ['median_roe_pct', 'median_roe_pct'],
    ['market_cap_bn', 'combined_market_cap_bn'], ['market_cap_lfl_growth_pct', 'market_cap_lfl_growth_pct']];
  kmap.forEach(([js, p]) => check(`KPI ${js} matches pandas`, close(s.k[js], ref[p]), `dashboard ${s.k[js]} vs python ${ref[p]}`));
  check('classification counts match pandas', ['Consistently strong', 'Mixed', 'Deteriorating'].every((c) => s.k.classification[c] === (ref.classification_counts[c] || 0)), JSON.stringify(s.k.classification));
  const sums = await S(() => window.FinApp.state.summaries);
  let mism = [];
  sums.forEach((c) => { const p = py[c.ticker];
    [['revenue_cagr_pct'], ['avg_net_margin_pct'], ['avg_gross_margin_pct'], ['median_roe_pct'], ['net_margin_trend_pp_per_year'], ['revenue_growth_volatility_pp'], ['revenue_share_pct'], ['performance_score'], ['net_margin_shift_pp']]
      .forEach(([k]) => { const a = c[k], b = p[k] === '' ? null : +p[k]; if (!((a === null && b === null) || close(a, b, 1e-6))) mism.push(`${c.ticker}.${k}: ${a} vs ${b}`); });
    if (c.classification !== p.classification) mism.push(`${c.ticker}.classification: ${c.classification} vs ${p.classification}`);
    if (c.classification_reason !== p.classification_reason) mism.push(`${c.ticker}.reason differs`); });
  check('company summaries (9 metrics + class) match pandas for all 12 companies', !mism.length, mism.slice(0, 5).join('; '));
  const rel = await S(() => window.FinApp.state.rel.pairs);
  const pr = (id) => rel.find((r) => r.id === id).pearson;
  check('correlation size-growth r and p match scipy', close(pr('size_growth').r, ref.corr_size_growth[0], 1e-9) && close(pr('size_growth').p, ref.corr_size_growth[1], 1e-6), `r ${pr('size_growth').r}, p ${pr('size_growth').p}`);
  check('correlation mcap-growth r and p match scipy', close(pr('mcap_growth').r, ref.corr_mcap_growth[0], 1e-9) && close(pr('mcap_growth').p, ref.corr_mcap_growth[1], 1e-6));
  check('correlation growth-margin r and p match scipy', close(pr('growth_margin').r, ref.corr_growth_margin[0], 1e-9) && close(pr('growth_margin').p, ref.corr_growth_margin[1], 1e-6));
  const kpiText = await page.textContent('#kpis');
  check('KPI cards show formatted values', kpiText.includes('$1.64tn') && kpiText.includes('16.7%') && kpiText.includes('+8.7%'), kpiText.slice(0, 120));
  await page.mouse.move(5, 5); await page.screenshot({ path: IMG('dashboard-overview.png'), fullPage: true });

  // ------------------------------------------------------------ 2 charts render on every tab
  current = 'T02 charts render';
  const chartIds = { overview: ['cYearTotals', 'cShare'], growth: ['cTrend', 'cCagr', 'cConsistency', 'cHeat'], profit: ['cGrossProfit', 'cMargins', 'cRevNi', 'cShift'], ratios: ['cRatio', 'cRoe', 'cProfile'], drivers: ['cRel'] };
  for (const [t, ids] of Object.entries(chartIds)) {
    await tab(t);
    for (const id of ids) { const n = await page.evaluate((i) => { const c = window.echarts.getInstanceByDom(document.getElementById(i)); return c ? c.getOption().series.length : 0; }, id);
      check(`${t}: ${id} has data series`, n > 0, `${n} series`); }
    await page.mouse.move(5, 5);
    if (t !== 'overview') await page.screenshot({ path: IMG(`dashboard-${t}.png`), fullPage: true });
  }
  const scoreRows = await page.$$eval('#scorecard tbody tr', (r) => r.length);
  check('scorecard table lists 12 companies', scoreRows === 12, scoreRows);
  await tab('growth');
  for (const m of ['net_margin_pct', 'eps', 'market_cap_bn']) { await page.selectOption('#trendMetric', m); await page.waitForTimeout(200); }
  check('index mode disabled for ratio metrics, enabled for level metrics', !(await page.$eval('#trendMode', (e) => e.disabled)));
  await page.selectOption('#trendMode', 'index'); await page.waitForTimeout(300);
  await page.selectOption('#trendMetric', 'revenue'); await page.waitForTimeout(300); await page.mouse.move(5, 5);
  await page.screenshot({ path: IMG('dashboard-growth-indexed.png') });
  await page.selectOption('#trendMode', 'abs');
  check('trend explorer: metric and index mode switch without errors', errors.length === 0, errors.join('; '));

  // ------------------------------------------------------------ 3 filters
  current = 'T03 filters';
  await tab('overview');
  await page.selectOption('#fYearFrom', '2015'); await page.waitForTimeout(300);
  s = await st();
  const exp2015 = fs.readFileSync(path.join(ROOT, 'data/raw/Financial_Statements.csv'), 'utf8').trim().split('\n').slice(1).filter((l) => +l.split(',')[0] >= 2015).length;
  check('year filter 2015-2023 keeps exactly the raw rows from 2015 on', s.filtered === exp2015, `${s.filtered} rows vs ${exp2015} in raw file`);
  const yrs = await S(() => Math.min(...window.FinApp.state.filtered.map((r) => r.year)));
  check('no filtered row before 2015', yrs === 2015, yrs);
  await page.click('#fCompanyBox summary'); await page.click('#fCompany [data-none]'); await page.waitForTimeout(200);
  for (const t of ['AAPL', 'MSFT', 'NVDA']) await page.check(`#fCompany input[value="${t}"]`);
  await page.waitForTimeout(400); await page.click('body', { position: { x: 5, y: 600 } });
  s = await st();
  check('company filter: 3 companies in summaries', s.companies === 3, s.companies);
  check('KPIs recalculated for the filter (reference year 2022/2023)', s.k.ref.companies === 3, JSON.stringify(s.k.ref));
  const chips = await page.textContent('#activeFilters');
  check('active filter chips shown', chips.includes('Years 2015-2023') && chips.includes('AAPL, MSFT, NVDA'), chips);
  await tab('explorer');
  const cnt = await page.textContent('#tCount');
  check('data explorer reflects filter', cnt.includes(`(${s.filtered} after filters`), cnt);
  await page.fill('#tSearch', 'NVDA'); await page.waitForTimeout(500);
  const nv = await page.$$eval('#explorer tbody tr', (r) => r.length);
  check('explorer search narrows rows', nv === 9, `${nv} NVDA rows 2015-2023`);
  await page.fill('#tSearch', ''); await page.waitForTimeout(400);
  await page.click('#explorer th[data-k="revenue"]'); await page.waitForTimeout(200);
  const first = await page.$eval('#explorer tbody tr td:nth-child(5)', (td) => td.textContent);
  await page.click('#explorer th[data-k="revenue"]'); await page.waitForTimeout(200);
  const firstDesc = await page.$eval('#explorer tbody tr td:nth-child(5)', (td) => td.textContent);
  check('explorer sorting toggles ascending/descending', first !== firstDesc, `${first} / ${firstDesc}`);
  await page.selectOption('#tPage', '10'); await page.waitForTimeout(200);
  const pages = await page.$$eval('#pager button[data-p]', (b) => b.length);
  check('pagination controls rendered', pages >= 3, pages);
  await page.screenshot({ path: IMG('dashboard-explorer.png'), fullPage: true });
  await page.click('#activeFilters [data-chip="ticks"]'); await page.waitForTimeout(300);
  s = await st(); check('removing a chip removes that filter', s.companies === 12, s.companies);
  await page.click('#btnReset'); await page.waitForTimeout(300);
  s = await st(); check('reset filters restores all 161 records', s.filtered === 161);

  // ------------------------------------------------------------ 4 invalid uploads
  current = 'T04 invalid files';
  await tab('data');
  await upload('02_missing_required_column.csv');
  let panel = await page.textContent('#uploadPanel');
  check('missing required column rejected with explanation', panel.includes('required columns missing') && panel.includes('Revenue'), panel.slice(0, 160));
  await upload('10_wrong_type.txt');
  panel = await page.textContent('#uploadPanel');
  check('wrong file type rejected', panel.includes('.txt file'), panel.slice(0, 120));
  s = await st(); check('dataset unchanged after rejected files', s.n === 161);

  // ------------------------------------------------------------ 5 valid append with duplicate and invalid rows
  current = 'T05 append upload';
  await upload('01_append_valid_with_duplicate_and_invalid.csv', 'append');
  let stats = await statText();
  check('preview counts: 10 rows, 9 valid, 1 invalid, 1 duplicate, 8 new', stats['rows in file'] === 10 && stats['passed validation'] === 9 && stats['invalid (rejected)'] === 1 && stats.duplicates === 1 && stats['new records to add'] === 8, JSON.stringify(stats));
  panel = await page.textContent('#uploadPanel');
  check('rejection reasons listed', panel.includes('not a 4-digit year') && panel.includes('identical values'), '');
  const vfile = await download(() => page.click('#btnValidation'));
  const vtxt = fs.readFileSync(vfile, 'utf8');
  check('validation results downloadable', vtxt.includes('rejected') && vtxt.includes('duplicate'), path.basename(vfile));
  await page.click('#btnApply'); await page.waitForTimeout(900);
  const okMsg = await page.textContent('#uploadPanel');
  check('confirmation sentence uses actual counts', okMsg.includes('10 records were processed, 8 were accepted (8 added), 1 duplicate was detected and 1 record was rejected'), okMsg.slice(0, 200));
  s = await st();
  check('dataset grows to 169 records and 13 companies', s.n === 169 && s.companies === 13, `${s.n}/${s.companies}`);
  check('KPIs recalculated (combined revenue includes DEMO 2022)', s.k.revenue > ref.combined_revenue, `${s.k.revenue} > ${ref.combined_revenue}`);
  const filt = await page.$$eval('#fCompany input', (i) => i.map((x) => x.value));
  check('company filter gains DEMO', filt.includes('DEMO'));
  await tab('drivers'); const sc = await page.textContent('#scorecard'); check('scorecard includes DEMO', sc.includes('DEMO'));
  await tab('overview'); const st2 = await page.textContent('#datasetStatus'); check('header shows working dataset status', st2.includes('Working dataset: 169'), st2);
  await tab('data'); await page.mouse.move(5, 5); await page.evaluate(() => document.getElementById('toast').classList.remove('show')); await page.waitForTimeout(300);
  await page.screenshot({ path: IMG('dashboard-data-upload.png'), fullPage: true });

  // ------------------------------------------------------------ 6 persistence
  current = 'T06 local persistence';
  await page.reload(); await page.waitForFunction(() => window.FinApp && window.FinApp.state.kpis);
  s = await st(); check('after reload the working dataset (169 records, 1 upload) is restored from IndexedDB', s.n === 169 && s.batches === 1, `${s.n}, ${s.batches}`);

  // ------------------------------------------------------------ 7 duplicates
  current = 'T07 duplicate handling';
  await tab('data');
  await upload('01_append_valid_with_duplicate_and_invalid.csv', 'append');
  stats = await statText();
  check('re-uploading the same file adds nothing and reports 9 duplicates', stats['new records to add'] === 0 && stats.duplicates === 9, JSON.stringify(stats));
  check('apply button disabled when nothing to add', await page.$eval('#btnApply', (b) => b.disabled));
  await page.click('#btnCancel');
  await upload('05_duplicate_rows_in_file.csv', 'append');
  stats = await statText();
  check('duplicate rows inside one file detected', stats.duplicates === 1 && stats['new records to add'] === 2, JSON.stringify(stats));
  await page.click('#btnCancel');

  // ------------------------------------------------------------ 8 merge
  current = 'T08 update or add (merge)';
  await upload('03_merge_update_and_insert.csv', 'append');
  stats = await statText(); check('append mode flags the changed existing row as a conflict', stats['existing company-years with different values'] === 1 && stats['new records to add'] === 1, JSON.stringify(stats));
  await page.click('input[name="mode"][value="merge"]'); await page.waitForTimeout(300);
  stats = await statText(); check('merge mode: 1 update, 1 insert', stats['records to update'] === 1 && stats['new records to add'] === 1, JSON.stringify(stats));
  await page.click('#btnApply'); await page.waitForTimeout(800);
  const msft = await S(() => window.FinApp.state.all.find((r) => r.ticker === 'MSFT' && r.year === 2022));
  check('MSFT 2022 revenue updated and margin recalculated', msft.revenue === 200000 && close(msft.net_margin_pct, 72738 / 200000 * 100), `${msft.revenue}, ${msft.net_margin_pct}`);
  s = await st(); check('dataset now 170 records', s.n === 170, s.n);

  // ------------------------------------------------------------ 9 other formats and column mapping
  current = 'T09 JSON, XLSX and alternative headers';
  await upload('08_valid.json'); stats = await statText(); check('JSON: 4 records accepted', stats['new records to add'] === 4, JSON.stringify(stats)); await page.click('#btnApply'); await page.waitForTimeout(600);
  await upload('09_valid.xlsx'); stats = await statText(); check('XLSX: 5 records accepted', stats['new records to add'] === 5, JSON.stringify(stats)); await page.click('#btnApply'); await page.waitForTimeout(600);
  await upload('04_alias_headers.csv'); panel = await page.textContent('#uploadPanel');
  check('alternative names mapped and reported', panel.includes('"Fiscal Year" → Year') && panel.includes('"Total Revenue" → Revenue') && panel.includes('recognised alternative name'), '');
  await page.click('#btnCancel');
  s = await st(); check('dataset now 179 records', s.n === 179, s.n);

  // ------------------------------------------------------------ 10 security
  current = 'T10 security';
  await upload('07_security_formula_and_html.csv'); await page.click('#btnApply'); await page.waitForTimeout(800);
  await tab('drivers'); await page.waitForTimeout(300); await tab('explorer'); await page.fill('#tSearch', 'SAFE'); await page.waitForTimeout(500);
  const imgs = await page.$$eval('#main img', (i) => i.length);
  check('HTML in uploaded text is shown as text, not executed', imgs === 0 && alerts === 0, `img elements ${imgs}, alerts ${alerts}`);
  await page.fill('#tSearch', '');
  const csvFile = await download(async () => { await page.click('#btnData'); await page.click('#dlgData button[value="ok"]'); });
  const csvTxt = fs.readFileSync(csvFile, 'utf8');
  check('exported CSV neutralises formula text', csvTxt.includes("'=HYPERLINK") && !/,=HYPERLINK/.test(csvTxt), '');

  // ------------------------------------------------------------ 11 data export
  current = 'T11 data export';
  const lines = csvTxt.replace(/^﻿/, '').trim().split(/\r\n/);
  s = await st();
  check('full CSV export has every analysed record', lines.length - 1 === s.n, `${lines.length - 1} rows vs ${s.n}`);
  check('export includes uploaded records and source column', csvTxt.includes('DEMO') && csvTxt.includes('upload '), '');
  const header = lines[0].split(',');
  check('export has input, derived and flag columns', ['revenue', 'net_margin_pct', 'roe_pct', 'revenue_growth_pct', 'flag_negative_equity', 'record_source'].every((h) => header.includes(h)), header.length + ' columns');
  const aapl = lines.find((l) => l.startsWith('2022,AAPL'));
  check('exported values match the source (AAPL 2022 revenue 394328)', aapl && aapl.split(',')[4] === '394328', aapl && aapl.slice(0, 60));
  await page.selectOption('#fYearFrom', '2020'); await page.waitForTimeout(300);
  s = await st();
  const fCsv = await download(async () => { await page.click('#btnData'); await page.check('input[name="dscope"][value="filtered"]'); await page.click('#dlgData button[value="ok"]'); });
  const fl = fs.readFileSync(fCsv, 'utf8').trim().split(/\r\n/).length - 1;
  check('filtered CSV export matches filtered view', fl === s.filtered && path.basename(fCsv).includes('filtered'), `${fl} vs ${s.filtered}; ${path.basename(fCsv)}`);
  const xFile = await download(async () => { await page.click('#btnData'); await page.check('input[name="dscope"][value="full"]'); await page.check('input[name="dfmt"][value="xlsx"]'); await page.click('#dlgData button[value="ok"]'); });
  const xl = execSync(`python3 -c "import openpyxl,sys; wb=openpyxl.load_workbook(sys.argv[1]); print(wb.sheetnames, wb['Analysis data'].max_row-1, wb['Company summary'].max_row-1)" "${xFile}"`).toString().trim();
  check('XLSX export opens with data, summary and about sheets', xl.includes("'Analysis data', 'Company summary', 'About'") && xl.includes(` ${s.n} `), xl);

  // ------------------------------------------------------------ 12 PDF report
  current = 'T12 PDF report';
  const pdfF = await download(async () => { await page.click('#btnReport'); await page.click('#dlgReportGo'); });
  const pdfTxt = execSync(`pdftotext -layout "${pdfF}" -`).toString();
  const pagesN = +execSync(`pdfinfo "${pdfF}" | grep Pages | awk '{print $2}'`).toString().trim();
  check('filtered report downloads as a valid PDF', pagesN >= 5, `${pagesN} pages, ${path.basename(pdfF)}`);
  check('report states scope and filters', pdfTxt.includes('Current filtered view') && pdfTxt.includes('years 2020-2023'), '');
  ['1. Business context', '3. Dataset overview', '4. Data preparation summary', '5. Analytical methods', '6. KPI definitions', '7. Important numerical results', '8. Key findings', '10. Recommendations', '11. Limitations'].forEach((h) => check(`report has section "${h}"`, pdfTxt.includes(h)));
  check('report reflects uploaded data (DEMO and upload history)', pdfTxt.includes('DEMO') && pdfTxt.includes('Data added during use'), '');
  await page.click('#btnReset'); await page.waitForTimeout(300);
  const pdfFull = await download(async () => { await page.click('#btnReport'); await page.check('input[name="rscope"][value="full"]'); await page.click('#dlgReportGo'); });
  const fullTxt = execSync(`pdftotext -layout "${pdfFull}" -`).toString();
  s = await st();
  check('full-dataset report covers every record', fullTxt.includes('Entire available dataset') && fullTxt.includes(`${s.n} company-years`), `${s.n} company-years`);
  check('report has embedded chart images', +execSync(`pdfimages -list "${pdfFull}" | tail -n +3 | wc -l`).toString().trim() >= 4);
  fs.copyFileSync(pdfFull, path.join(ROOT, 'tests', 'sample_generated_report.pdf'));

  // ------------------------------------------------------------ 13 undo and reset
  current = 'T13 undo and reset';
  await tab('data');
  await page.click('#btnUndo'); await page.click('#dlgConfirmGo'); await page.waitForTimeout(600);
  s = await st(); check('undo removes the last upload (SAFE)', s.n === 179 && s.batches === 4, `${s.n}, ${s.batches}`);
  await upload('06_replace_three_companies.csv', 'replace'); await page.click('#btnApply'); await page.waitForTimeout(300);
  check('replace asks for confirmation', await page.isVisible('#dlgConfirm'));
  await page.click('#dlgConfirmGo'); await page.waitForTimeout(800);
  s = await st(); check('replace leaves only the 3 companies in the file', s.companies === 3 && s.n === 43, `${s.companies} companies, ${s.n} records`);
  await page.click('#btnUndo'); await page.click('#dlgConfirmGo'); await page.waitForTimeout(600);
  s = await st(); check('undoing a replace restores the previous dataset', s.n === 179, s.n);
  await page.click('#btnClear'); await page.click('#dlgConfirmGo'); await page.waitForTimeout(800);
  s = await st(); check('reset returns to the original 161 records', s.n === 161 && s.batches === 0);
  await page.reload(); await page.waitForFunction(() => window.FinApp && window.FinApp.state.kpis);
  s = await st(); check('after reset and reload, local data is gone (161 records)', s.n === 161 && s.batches === 0);

  // ------------------------------------------------------------ 14 dark mode, keyboard, responsive
  current = 'T14 layout and accessibility';
  await page.click('#btnTheme'); await page.waitForTimeout(600); await page.mouse.move(5, 5);
  check('dark mode applied', (await S(() => getComputedStyle(document.documentElement).colorScheme)) === 'dark');
  await page.screenshot({ path: IMG('dashboard-dark-mode.png') });
  await page.click('#btnTheme'); await page.waitForTimeout(300);
  await page.focus('[data-tab="overview"]'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300);
  check('arrow keys move between tabs', await S(() => window.FinApp.state.view.tab) === 'growth');
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mp = await mob.newPage(); await mp.goto(URL); await mp.waitForFunction(() => window.FinApp && window.FinApp.state.kpis); await mp.waitForTimeout(800);
  for (const t of ['overview', 'growth', 'data']) {
    await mp.click(`[data-tab="${t}"]`); await mp.waitForTimeout(600);
    const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`mobile 390px: no horizontal page scroll on ${t}`, over <= 0, `overflow ${over}px`);
  }
  await mp.click('[data-tab="overview"]'); await mp.waitForTimeout(500); await mp.screenshot({ path: IMG('dashboard-mobile.png') });
  await mob.close();
  const tabCtx = await browser.newContext({ viewport: { width: 820, height: 1180 } }); const tp = await tabCtx.newPage(); await tp.goto(URL); await tp.waitForFunction(() => window.FinApp && window.FinApp.state.kpis);
  check('tablet 820px: no horizontal page scroll', (await tp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0); await tabCtx.close();

  // ------------------------------------------------------------ 15 deployment paths and file:// use
  current = 'T15 deployment';
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:'));
  check('all asset references are relative', refs.every((u) => !/^(\/|https?:)/.test(u)), refs.filter((u) => /^(\/|https?:)/.test(u)).join(', '));
  check('every referenced file exists', refs.every((u) => fs.existsSync(path.join(ROOT, u))), refs.filter((u) => !fs.existsSync(path.join(ROOT, u))).join(', '));
  const fctx = await browser.newContext(); const fp = await fctx.newPage(); const ferr = []; fp.on('pageerror', (e) => ferr.push(e.message));
  await fp.goto('file://' + path.join(ROOT, 'index.html')); await fp.waitForFunction(() => window.FinApp && window.FinApp.state.kpis, null, { timeout: 15000 }).catch(() => {});
  const fn = await fp.evaluate(() => (window.FinApp && window.FinApp.state.all.length) || 0);
  check('dashboard also works opened directly from disk (file://)', fn === 161 && !ferr.length, `${fn} records; ${ferr.join('; ')}`); await fctx.close();

  current = 'T16 console';
  check('no JavaScript errors during the whole run', errors.length === 0, errors.join(' | '));
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  fs.writeFileSync(path.join(ROOT, 'tests', 'results.json'), JSON.stringify({ run: new Date().toISOString(), browser: 'Chromium (Playwright)', passed: pass, failed: results.length - pass, results }, null, 1));
  console.log(`\n${pass}/${results.length} checks passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

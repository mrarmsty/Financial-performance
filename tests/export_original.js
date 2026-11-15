/* Produces, from the ORIGINAL dataset (no uploads): the sample PDF report and a full CSV export used by
   tests/check_export_vs_python.py. Usage: node tests/export_original.js (server on port 8765). */
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
  await p.goto(process.env.DASH_URL || 'http://localhost:8765/index.html');
  await p.evaluate(() => indexedDB.deleteDatabase('fin-dashboard')); await p.reload();
  await p.waitForFunction(() => window.FinApp && window.FinApp.state.kpis);
  const save = async (fn, to) => { const [d] = await Promise.all([p.waitForEvent('download'), fn()]); await d.saveAs(to); console.log('saved', to); };
  await save(async () => { await p.click('#btnReport'); await p.check('input[name="rscope"][value="full"]'); await p.click('#dlgReportGo'); }, path.join(ROOT, 'documentation', 'sample-generated-report.pdf'));
  await save(async () => { await p.click('#btnData'); await p.click('#dlgData button[value="ok"]'); }, path.join(ROOT, 'tests', 'downloads', 'export_original_full.csv'));
  await b.close();
})();

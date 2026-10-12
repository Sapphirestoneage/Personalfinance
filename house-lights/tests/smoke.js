/* House Lights regression: a nine-step tap-through on an iPhone profile.
   Run: node house-lights/tests/smoke.js   (needs playwright + a Chromium at
   /opt/pw-browsers/chromium or $SLAF_CHROMIUM; skips with exit 0 otherwise). */
let pw = null;
try { pw = require('playwright'); } catch (e) { try { pw = require('playwright-core'); } catch (e2) {} }
if (!pw) { console.log('house-lights smoke: playwright not installed, skipping'); process.exit(0); }
const { chromium, devices } = pw;
const EXECUTABLE = process.env.SLAF_CHROMIUM || '/opt/pw-browsers/chromium';
if (!require('fs').existsSync(EXECUTABLE)) { console.log('house-lights smoke: no Chromium at ' + EXECUTABLE + ', skipping'); process.exit(0); }
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const server = http.createServer((q, s) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { s.statusCode = 404; s.end(); return; } s.setHeader('content-type', 'text/html'); s.end(d); }); });
(async () => {
  await new Promise(r => server.listen(8772, r));
  const b = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ ...devices['iPhone 13'], hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const url = 'http://localhost:8772/house-lights/index.html';
  await p.goto(url, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(500);
  const text = async sel => (await p.textContent(sel)) || '';
  let failed = 0;
  const step = async (name, fn) => { try { await fn(); console.log('ok  ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message.split('\n')[0]); } };
  const must = (c, m) => { if (!c) throw new Error(m); };

  await step('full entry with cup + savings', async () => {
    await p.tap('.tab-btn[data-view="log"]');
    await p.tap('#showPicker .show-chip[data-s="Hadestown"]');
    must((await p.inputValue('#f-theatre')) === 'Walter Kerr Theatre', 'theatre autofill');
    await p.fill('#f-date', '2026-03-14'); await p.fill('#f-price', '47.5'); await p.fill('#f-qty', '2');
    await p.tap('#detailsToggle'); await p.tap('#stars .star[data-v="5"]');
    await p.selectOption('#f-company', 'Friend'); await p.fill('#f-withWho', 'Ari');
    await p.tap('.souv-chip[data-v="Souvenir cup"]'); await p.fill('#f-cupPrice', '18'); await p.fill('#f-merch', '43'); await p.fill('#f-face', '120');
    await p.selectOption('#f-seatLevel', 'Orchestra');
    await p.tap('#addBtn'); await p.waitForTimeout(400);
    const log = await text('#logList');
    must(/Hadestown/.test(log) && /\$95/.test(log) && /Saved \$145/.test(log) && /Souvenir cup/.test(log), 'entry content: ' + log.slice(0, 120));
  });
  await step('edit round-trip', async () => {
    const id = await p.getAttribute('#logList .log-entry', 'data-id');
    await p.tap(`#logList .le-edit[data-id="${id}"]`);
    must((await p.inputValue('#f-cupPrice')) === '18', 'cup price loads');
    await p.fill('#f-notes', 'Wait for me'); await p.tap('#addBtn'); await p.waitForTimeout(300);
    must(/Wait for me/.test(await text('#logList')), 'note saved');
    must((await text('#logList')).split('Hadestown').length === 2, 'no duplicate');
  });
  await step('merch shelf, guide, standalone item', async () => {
    await p.tap('.tab-btn[data-view="merch"]');
    must(/Hadestown/.test(await text('#cupShelf')), 'cup on shelf');
    const row = p.locator('#cupGuide .th-row', { hasText: 'Walter Kerr Theatre' });
    must(/✓ Cups/.test(await row.textContent()), 'house confirmed');
    must((await row.locator('.cg-price').inputValue()) === '18', 'price propagated');
    await p.fill('#m-show', 'Wicked'); await p.dispatchEvent('#m-show', 'input');
    must((await p.inputValue('#m-theatre')) === 'Gershwin Theatre', 'standalone theatre autofill');
    await p.selectOption('#m-item', 'Magnet'); await p.fill('#m-price', '12'); await p.tap('#merchAddBtn'); await p.waitForTimeout(200);
    must(/\$55/.test(await text('#merchStatGrid')), 'merch total 43+12');
  });
  await step('stats + budget', async () => {
    await p.tap('.tab-btn[data-view="stats"]');
    const g = await text('#statGrid'); must(/\$95/.test(g) && /\$145/.test(g), 'stat grid');
    await p.fill('#budgetInput', '1000'); await p.fill('#goalInput', '12'); await p.tap('#budgetSave'); await p.waitForTimeout(150);
    must(/of \$1,000/.test(await text('#budgetViz')), 'budget viz');
  });
  await step('results: type, badges, bingo, ranker, playbill', async () => {
    await p.tap('.tab-btn[data-view="showdb"]'); await p.tap('#sdbList .th-row[data-show="Hamilton"]'); await p.waitForTimeout(150);
    await p.tap('.tab-btn[data-view="results"]');
    must(/The /.test(await text('#typeCard .sc-type')), 'type');
    must(/Opening Night/.test(await text('#resultsArea')), 'badge');
    must((await p.locator('.bingo-sq:has-text("✓")').count()) >= 5, 'bingo auto squares');
    const w = await p.locator('.rk-btn').first().getAttribute('data-w'); await p.locator('.rk-btn').first().tap(); await p.waitForTimeout(100);
    must(/Your Top 2/.test(await text('#rankerBox')), 'ranker list');
    must(/Walter Kerr/.test(await text('#playbillDoc')), 'playbill houses');
  });
  await step('persists across reload + deep link', async () => {
    await p.goto(url + '#merch', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(500);
    must(await p.isVisible('#view-merch'), 'deep link');
    must(/Hadestown/.test(await text('#cupShelf')), 'cup persisted');
    await p.tap('.tab-btn[data-view="log"]'); must(/Hadestown/.test(await text('#logList')), 'shows persisted');
  });
  await step('delete + undo', async () => {
    const id = await p.getAttribute('#logList .log-entry', 'data-id');
    await p.tap(`#logList .le-del[data-id="${id}"]`); await p.waitForTimeout(100);
    must(!/Wait for me/.test(await text('#logList')), 'deleted');
    await p.tap('#hlToast button'); await p.waitForTimeout(100);
    must(/Wait for me/.test(await text('#logList')), 'undone');
  });
  await step('csv + json export, json re-import merges', async () => {
    await p.tap('.tab-btn[data-view="stats"]');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 3000 }), p.tap('#expCsv')]);
    must(/Hadestown/.test(fs.readFileSync(await dl.path(), 'utf8')), 'csv content');
    const [dj] = await Promise.all([p.waitForEvent('download', { timeout: 3000 }), p.tap('#expJson')]);
    const j = JSON.parse(fs.readFileSync(await dj.path(), 'utf8')); must(j.merch && j.cupReports, 'backup has merch+cups');
    p.once('dialog', d => d.accept()); await p.setInputFiles('#impJson', await dj.path()); await p.waitForTimeout(300);
    must(/^2\s*shows seen/.test(await text('#statGrid')), 'no duplicates on import: ' + (await text('#statGrid')).slice(0, 20));
  });
  await step('phone sizing', async () => {
    await p.tap('.tab-btn[data-view="log"]');
    const fs16 = await p.$eval('#f-show', e => getComputedStyle(e).fontSize); must(fs16 === '16px', 'input font ' + fs16);
    const ch = await p.$eval('#showPicker .show-chip', e => e.getBoundingClientRect().height); must(ch >= 36, 'chip height ' + ch);
    const st = await p.$eval('#stars .star', e => getComputedStyle(e).fontSize); must(st === '32px', 'star ' + st);
    const nav = await p.$eval('.tabs', e => getComputedStyle(e).position); must(nav === 'fixed', 'nav ' + nav);
  });
  console.log(errs.length ? 'ERRORS ' + errs.join(' | ') : 'no page errors');
  await b.close(); server.close();
  if (errs.length || failed) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });

/* ==========================================================================
   test/adventure.js — the section-6 gate, in a phone-shaped browser (D-176).
   --------------------------------------------------------------------------
   Loads The Long Way Round with the demo household; asserts screen one shows
   the way cards with deltas against Drift; taps House Hack; toggles the crash
   and the job loss; asserts the delta sentence changes and the URL updates;
   reloads the URL and asserts the same screen; pins the scenario and asserts
   it lands in the scenarios store without touching the household.

     python3 -m http.server 8765 &
     NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/adventure.js
   ========================================================================== */
const { chromium } = require('playwright');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';

let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? ' — ' + detail : '')); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('dialog', d => d.accept());

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  const btn = await page.$('#btn-example');
  if (btn) { await btn.click(); await page.waitForTimeout(700); }
  await page.evaluate(() => { try { localStorage.removeItem('slaf.scenarios.v1'); } catch (e) {} });
  /* The household's facts. meta (visited rooms, timestamps) is bookkeeping, not a fact. */
  const facts = () => page.evaluate(() => { const h = JSON.parse(JSON.stringify(SLAF.Spine.getProfile())); delete h.meta; return JSON.stringify(h); });
  const householdBefore = await facts();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test((m.location() && m.location().url) || '')) errors.push(m.text()); });

  /* Screen one. */
  await page.goto(BASE + '/rooms/adventure.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#pathlist .pathcard', { timeout: 15000 });
  const cards = await page.$$eval('#pathlist .pathcard', els => els.map(e => ({ id: e.getAttribute('data-path'), text: e.textContent })));
  check('screen one shows at least five cards', cards.length >= 5, 'saw ' + cards.length);
  check('Drift is the first card', cards[0] && cards[0].id === 'drift');
  check('every other card carries a delta against Drift', cards.slice(1).every(c => /than Drift|Drift never|same year as Drift/.test(c.text) && /after five years/.test(c.text)), cards.slice(1).map(c => c.id).join(','));
  check('every card shows the pot, the FI date, the hours and a tag', cards.every(c => /After 5 years/.test(c.text) && /FI/.test(c.text) && /Costs/.test(c.text)));
  check('the need sentence is plain text', /You’d need \$[\d,]+ to stop working: 25 years of what you spend/.test(await page.$eval('#need', e => e.textContent)));
  check('the FOO gate speaks in one sentence on the demo', /step 2/.test(await page.$eval('#gate', e => e.textContent)));
  check('no winner is highlighted', (await page.$$('#pathlist .best, #pathlist .is-best')).length === 0);
  check('the URL carries no path yet', !/path=/.test(page.url()));

  /* Tap House Hack. */
  await page.tap('#pathlist [data-path="househack"]'); await page.waitForTimeout(400);
  check('screen two shows', await page.$eval('#s-way', e => getComputedStyle(e).display !== 'none'));
  check('screen one is gone', await page.$eval('#s-ways', e => getComputedStyle(e).display === 'none'));
  check('the URL carries the path', /path=househack/.test(page.url()), page.url());
  const delta0 = await page.$eval('#delta', e => e.textContent);
  check('the delta sentence measures against Drift', /than Drift|Drift/.test(delta0), delta0);
  check('one chart with every way and the target rule', (await page.$$('#chart svg path.line')).length >= 5 && (await page.$$('#chart svg line.hline')).length === 1);
  check('the band is shaded behind the chosen way', (await page.$$('#chart svg path.band')).length === 1);
  check('headwinds and tailwinds are separate lists', (await page.$$('#headwinds .shock')).length === 3 && (await page.$$('#tailwinds .shock')).length === 1);
  check('steppers are buttons, no text input', (await page.$$('#steppers button')).length >= 2 && (await page.$$('input, textarea')).length === 0);
  check('savings rate with a link to Shockingly Simple Math', /Savings rate/.test(await page.$eval('#rate-line', e => e.textContent)) && !!(await page.$('#rate-line a[href*="financial-snapshot"]')));
  check('the walk is folded by default', await page.$eval('#walk', e => !e.open));

  /* Toggle crash and job loss. */
  await page.tap('#headwinds [data-shock="crash"]'); await page.waitForTimeout(300);
  await page.tap('#headwinds [data-shock="jobloss"]'); await page.waitForTimeout(300);
  const delta1 = await page.$eval('#delta', e => e.textContent);
  check('the delta sentence changes with the shocks', delta1 !== delta0 && /puts the finish line back|brings the finish line forward|costs nothing|does not arrive/.test(delta1), delta1);
  check('...and still says how it stands against Drift without them', /Without them/.test(delta1), delta1);
  check('the URL updates with the shocks', /shocks=crash%2Cjobloss|shocks=crash,jobloss/.test(page.url()), page.url());
  check('shock markers appear on the chart', (await page.$$('#chart svg line.mark')).length === 2);

  /* A stepper rewrites the sentence and the URL. */
  const assume0 = await page.$eval('#way-assume', e => e.textContent);
  await page.tap('#steppers [data-step="housing:-10"]'); await page.waitForTimeout(300);
  check('the housing stepper rewrites the assumption sentence', (await page.$eval('#way-assume', e => e.textContent)) !== assume0 && /30%/.test(await page.$eval('#way-assume', e => e.textContent)));
  check('...and the URL', /housing=30/.test(page.url()), page.url());
  const url = page.url();
  const delta2 = await page.$eval('#delta', e => e.textContent);
  const walkRows = await page.$$eval('#yearlist .yearrow', els => els.map(e => e.textContent));
  check('the year rows carry the event and the runway', walkRows.some(t => /Six months without work/.test(t) && /borrowing from month/.test(t)), walkRows.join(' | '));

  /* Reload the URL: the same screen. */
  await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  check('reloading the URL reproduces the screen', await page.$eval('#s-way', e => getComputedStyle(e).display !== 'none'));
  check('...the same delta sentence', (await page.$eval('#delta', e => e.textContent)) === delta2);
  check('...the same shocks pressed', (await page.$$eval('#s-way [data-shock][aria-pressed="true"]', els => els.map(e => e.getAttribute('data-shock')).sort().join(','))) === 'crash,jobloss');
  check('...the same stepper figure', /30%/.test(await page.$eval('#way-assume', e => e.textContent)));

  /* Pin it. */
  await page.tap('#pin'); await page.waitForTimeout(300);
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('slaf.scenarios.v1') || '{"items":[]}'));
  check('the pin lands in the scenarios store', store.items.length === 1 && /path=househack/.test(store.items[0].query) && /shocks=/.test(store.items[0].query), JSON.stringify(store).slice(0, 200));
  check('...with a label a person can read', /House Hack/.test(store.items[0].label) && /markets fall 30%/i.test(store.items[0].label), store.items[0].label);
  check('...and the household is untouched', (await facts()) === householdBefore);
  check('...and the pinned way is listed on the page', (await page.$$('#pins a')).length === 1);
  check('the copy-link button exists', !!(await page.$('#copylink')));

  /* Back to screen one clears the path from the URL. */
  await page.tap('#back-ways'); await page.waitForTimeout(300);
  check('back clears the path from the URL', !/path=/.test(page.url()), page.url());

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();

  console.log('\n' + '─'.repeat(66));
  if (failures.length === 0) { console.log('✓ ' + passed + ' checks passed — every way on a card, one chart, a link that keeps'); process.exit(0); }
  console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n'); failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f)); process.exit(1);
})();

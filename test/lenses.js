/* ==========================================================================
   test/lenses.js — the section-5 gate, in a phone-shaped browser (D-175).
   --------------------------------------------------------------------------
   Every lens in data/lenses.json renders on the demo household with no
   console errors; every lens carries a non-empty forWhom and notForWhom;
   "More ways to look at this" off leaves exactly one card per domain, on
   shows every lens; the framework-names toggle swaps the header.

     python3 -m http.server 8765 &
     NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/lenses.js
   ========================================================================== */
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const table = require(path.join(ROOT, 'data/lenses.json'));

let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? ' — ' + detail : '')); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  const btn = await page.$('#btn-example');
  if (btn) { await btn.click(); await page.waitForTimeout(700); }
  await page.evaluate(() => { try { localStorage.removeItem('slaf.prefs.v1'); } catch (e) {} });

  await page.goto(BASE + '/rooms/financial-snapshot.html#lenses', { waitUntil: 'networkidle' });
  await page.waitForSelector('#lenses-host .lens-card', { timeout: 15000 });

  const domains = table.domains.map(d => d.id);
  const count = () => page.$$eval('#lenses-host .lens-card', els => els.length);
  const perDomain = () => page.$$eval('#lenses-host .lens-domain', els => els.map(d => [d.getAttribute('data-domain'), d.querySelectorAll('.lens-card').length]));

  check('More ways off by default: one card per domain', await count() === domains.length, 'saw ' + await count());
  check('...every domain shows exactly one', (await perDomain()).every(x => x[1] === 1), JSON.stringify(await perDomain()));
  check('...and it is the domain default', (await page.$$eval('#lenses-host .lens-card', els => els.map(e => e.getAttribute('data-lens')))).join(',') === table.domains.map(d => d.default).join(','));

  await page.tap('#lens-more'); await page.waitForTimeout(300);
  check('More ways on: every lens renders', await count() === table.lenses.length, 'saw ' + await count());
  const cards = await page.$$eval('#lenses-host .lens-card', els => els.map(e => ({
    id: e.getAttribute('data-lens'), who: e.querySelector('.lens-who') ? e.querySelector('.lens-who').textContent : '',
    verdict: e.querySelector('.lens-verdict') ? e.querySelector('.lens-verdict').textContent.trim() : '', figure: e.querySelector('.lens-figure') ? e.querySelector('.lens-figure').textContent : ''
  })));
  for (const l of table.lenses) {
    const c = cards.find(x => x.id === l.id);
    check(l.id + ' renders', !!c);
    if (!c) continue;
    check(l.id + ' carries forWhom and notForWhom on screen', c.who.indexOf('For:') > -1 && c.who.indexOf('Not for:') > -1 && c.who.indexOf(l.forWhom.slice(0, 20)) > -1);
    check(l.id + ' has a verdict sentence, no unfilled token, no NaN', c.verdict.length > 5 && !/\{\w+\}|NaN|undefined/.test(c.verdict) && !/NaN|undefined/.test(c.figure));
  }
  check('every lens has a non-empty forWhom and notForWhom in the table', table.lenses.every(l => l.forWhom && l.notForWhom));

  await page.tap('#lens-more'); await page.waitForTimeout(300);
  check('toggling More ways off again leaves exactly one card per domain', await count() === domains.length, 'saw ' + await count());
  check('...the pick survives a reload as a preference', await (async () => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#lenses-host .lens-card'); return (await count()) === domains.length; })());

  const header = () => page.$eval('#lenses-host .lens-card[data-lens="fatwants"] header b', e => e.textContent);
  const before = await header();
  await page.tap('#lens-names'); await page.waitForTimeout(300);
  check('the framework-names toggle changes the header', (await header()) !== before, before + ' → ' + await header());
  await page.tap('#lens-names'); await page.waitForTimeout(300);
  check('...and back', (await header()) === before);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();

  console.log('\n' + '─'.repeat(66));
  if (failures.length === 0) { console.log('✓ ' + passed + ' checks passed — every lens renders, one card a domain until asked'); process.exit(0); }
  console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n'); failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f)); process.exit(1);
})();

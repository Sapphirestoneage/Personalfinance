/* ==========================================================================
   test/aftertax.js — the section-15.3 gate, in a phone-shaped browser (D-181).
   --------------------------------------------------------------------------
   On the Statement, the front door, the FIRE Number and the Financial
   Snapshot: the two-position control is there when the switch is on, the
   default position is after deferred tax, the deferred line prints the
   bill, tapping "As listed" shows the listed figure, and switching the
   feature off hides the control. The demo's investment line is marked
   pre-tax first so there is a bill to see: 48,000 × 12% = 5,760.

     python3 -m http.server 8765 &
     NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/aftertax.js
   ========================================================================== */
const { chromium } = require('playwright');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';

let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? ' — ' + detail : '')); }

(async () => {
  const browser = await chromium.launch(require('fs').existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test((m.location() && m.location().url) || '')) errors.push(m.text()); });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  const btn = await page.$('#btn-example');
  if (btn) { await btn.click(); await page.waitForTimeout(700); }
  await page.evaluate(() => {
    try { localStorage.removeItem('slaf.prefs.v1'); } catch (e) {}
    const h = SLAF.Spine.getProfile();
    const inv = h.assets.filter(a => a.category === 'investment')[0];
    SLAF.Spine.upsertAsset(Object.assign({}, inv, { taxCharacter: 'pretax' }));
  });

  async function unfold() { try { const more = await page.$('#showrest'); if (more) { await more.tap(); await page.waitForTimeout(200); } } catch (e) { /* no fold */ } }
  const money = s => (s || '').replace(/[^0-9$,−-]/g, '');

  /* ---- The Statement ------------------------------------------------------ */
  await page.goto(BASE + '/rooms/statement.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await unfold();
  check('statement: the control is there, two positions', (await page.$$('#nw-basis [data-basis]')).length === 2);
  check('statement: after deferred tax is the default', await page.$eval('#nw-basis [data-basis="afterTax"]', e => e.getAttribute('aria-pressed')) === 'true');
  check('statement: the figure is after tax (30,140)', money(await page.textContent('#nw-plain')) === '$30,140', await page.textContent('#nw-plain'));
  check('statement: the line prints the bill', /\$5,760 of this is the tax bill/.test(await page.textContent('#nw-deferred')), await page.textContent('#nw-deferred'));
  await page.tap('#nw-basis [data-basis="listed"]'); await page.waitForTimeout(300);
  check('statement: as listed shows 35,900', money(await page.textContent('#nw-plain')) === '$35,900', await page.textContent('#nw-plain'));
  check('statement: the position is remembered as a preference', await page.evaluate(() => SLAF.Prefs.get('netWorth.basis', null)) === 'listed');
  check('statement: the household did not change', await page.evaluate(() => SLAF.Spine.getProfile().assets.filter(a => a.category === 'investment')[0].valueCents) === 4800000);
  await page.tap('#nw-basis [data-basis="afterTax"]'); await page.waitForTimeout(300);

  /* ---- The front door ------------------------------------------------------ */
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  /* The instruments sit in the folded full panel (D-145): open it to tap. */
  await page.evaluate(() => { const d = document.getElementById('full-panel'); if (d) d.open = true; });
  await page.waitForTimeout(200);
  check('front door: the control is there', (await page.$$('#nw-basis [data-basis]')).length === 2);
  check('front door: the altitude tile is after tax', money(await page.textContent('#inst-netWorth .big')) === '$30,140', await page.textContent('#inst-netWorth .big'));
  check('front door: the sub-line says after tax of what is owned', /after tax of/.test(await page.textContent('#inst-netWorth .sub')));
  check('front door: the line prints the bill', /\$5,760/.test(await page.textContent('#nw-deferred')));
  await page.tap('#nw-basis [data-basis="listed"]'); await page.waitForTimeout(400);
  check('front door: as listed shows 35,900', money(await page.textContent('#inst-netWorth .big')) === '$35,900', await page.textContent('#inst-netWorth .big'));
  await page.tap('#nw-basis [data-basis="afterTax"]'); await page.waitForTimeout(300);

  /* ---- FIRE Number ---------------------------------------------------------- */
  await page.goto(BASE + '/rooms/fire.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check('fire: the control is there', (await page.$$('#nw-basis [data-basis]')).length === 2);
  const barAfter = await page.$eval('#progress-bar', e => parseFloat(e.style.width));
  check('fire: the bar says it counts investments after tax', /after the tax you’ll owe/.test(await page.textContent('#progress-basis')), await page.textContent('#progress-basis'));
  check('fire: 42,240 after tax, 48,000 as listed', /\$42,240 after tax, \$48,000 as listed/.test(await page.textContent('#progress-basis')));
  await page.tap('#nw-basis [data-basis="listed"]'); await page.waitForTimeout(400);
  const barListed = await page.$eval('#progress-bar', e => parseFloat(e.style.width));
  check('fire: as listed the bar is longer', barListed > barAfter, barAfter + ' vs ' + barListed);
  check('fire: ...and says so', /as listed/.test(await page.textContent('#progress-basis')));
  await page.tap('#nw-basis [data-basis="afterTax"]'); await page.waitForTimeout(300);

  /* ---- Financial Snapshot ---------------------------------------------------- */
  await page.goto(BASE + '/rooms/financial-snapshot.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check('snapshot: the control is there', (await page.$$('#nw-basis [data-basis]')).length === 2);
  check('snapshot: the figure is after tax', money(await page.textContent('#out-net-worth [data-figure]')) === '$30,140', await page.textContent('#out-net-worth [data-figure]'));
  check('snapshot: the line prints the bill', /\$5,760/.test(await page.textContent('#nw-deferred')));
  await page.tap('#nw-basis [data-basis="listed"]'); await page.waitForTimeout(400);
  check('snapshot: as listed shows 35,900', money(await page.textContent('#out-net-worth [data-figure]')) === '$35,900', await page.textContent('#out-net-worth [data-figure]'));

  /* ---- The switch off: no control, listed everywhere ---------------------- */
  await page.evaluate(() => SLAF.Features.set('afterTaxNetWorth', false));
  await page.goto(BASE + '/rooms/statement.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  check('switch off: no control on the Statement', await page.$eval('#nw-basis', e => e.hidden || e.children.length === 0));
  check('switch off: the listed figure', money(await page.textContent('#nw-plain')) === '$35,900', await page.textContent('#nw-plain'));
  check('switch off: no line', (await page.textContent('#nw-deferred')).trim() === '');
  await page.evaluate(() => { SLAF.Features.set('afterTaxNetWorth', null); try { localStorage.removeItem('slaf.prefs.v1'); } catch (e) {} });

  check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log('\n' + '─'.repeat(66));
  if (failures.length === 0) { console.log(`✓ ${passed} checks passed — net worth as listed or after deferred tax, on all four screens`); process.exit(0); }
  console.log(`✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
})().catch(e => { console.error('gate crashed:', e && e.stack || e); process.exit(1); });

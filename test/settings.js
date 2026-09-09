/* ==========================================================================
   test/settings.js — the section-14 gate, in a phone-shaped browser (D-180).
   --------------------------------------------------------------------------
   Every user-scope switch is a row on the Settings screen with its label,
   gloss, on/off and the rooms it shows up in; flipping every switch on and
   then off leaves the household hash unchanged; the beginner and FI paths
   set their starting sets.

     python3 -m http.server 8765 &
     NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/settings.js
   ========================================================================== */
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const table = require(path.join(ROOT, 'data/features.json'));

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
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test((m.location() && m.location().url) || '')) errors.push(m.text()); });
  await page.evaluate(() => { try { localStorage.removeItem('slaf.prefs.v1'); } catch (e) {} });

  await page.goto(BASE + '/rooms/settings.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('.sw li');
  /* The Advanced group sits in the folded tail (D-170): open it before tapping. */
  try { const more = await page.$('#showrest'); if (more) { await more.tap(); await page.waitForTimeout(200); } } catch (e) { /* no fold */ }
  const ids = Object.keys(table.features);
  const userIds = ids.filter(id => table.features[id].scope === 'user');
  const rows = await page.$$eval('.sw li', els => els.map(e => ({ id: e.getAttribute('data-row'), text: e.textContent, toggle: !!e.querySelector('button[role="switch"]'), links: e.querySelectorAll('.where a').length })));
  check('every switch is a row', ids.every(id => rows.some(r => r.id === id)), ids.filter(id => !rows.some(r => r.id === id)).join(','));
  check('every user-scope switch has an on/off button', userIds.every(id => rows.filter(r => r.id === id)[0].toggle));
  check('a situation-scope switch has no button, and says what sets it', rows.filter(r => r.id === 'equityComp')[0] && !rows.filter(r => r.id === 'equityComp')[0].toggle && /Set by your situation/.test(rows.filter(r => r.id === 'equityComp')[0].text));
  check('every row names where it shows up', rows.every(r => r.links >= 1), rows.filter(r => r.links < 1).map(r => r.id).join(','));
  check('every row carries its label and gloss', ids.every(id => { const r = rows.filter(x => x.id === id)[0]; return r && r.text.indexOf(table.features[id].label) > -1 && r.text.indexOf(table.features[id].gloss.slice(0, 20)) > -1; }));
  check('grouped under the four headings', (await page.$$eval('main > section', ss => ss.map(s => s.id).filter(id => id && id.indexOf('slaf-') !== 0 && id !== 'showrest').join(','))) === 'path,accuracy,household,horizon,advanced');

  /* Flip everything on, then off: the household is byte-identical. */
  const hash = () => page.evaluate(() => JSON.stringify(SLAF.Spine.getProfile()));
  const before = await hash();
  for (const id of userIds) {
    const state = await page.$eval('button[data-feature="' + id + '"]', b => b.getAttribute('aria-checked'));
    if (state !== 'true') { await page.tap('button[data-feature="' + id + '"]'); await page.waitForTimeout(80); }
  }
  check('every user switch is on', (await page.$$eval('button[role="switch"]', bs => bs.every(b => b.getAttribute('aria-checked') === 'true'))));
  for (const id of userIds) { await page.tap('button[data-feature="' + id + '"]'); await page.waitForTimeout(80); }
  check('...then every user switch is off', (await page.$$eval('button[role="switch"]', bs => bs.every(b => b.getAttribute('aria-checked') === 'false'))));
  check('...and the household is byte-identical', (await hash()) === before);
  check('...while the prefs hold the picks', await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('slaf.prefs.v1') || '{}'); return Object.keys(p).filter(k => k.indexOf('features.') === 0).length; }) === userIds.length);

  /* The two starting sets. */
  await page.tap('button[data-path="beginner"]'); await page.waitForTimeout(150);
  check('Beginner: only the default-on set', (await page.$$eval('button[role="switch"]', bs => bs.map(b => b.getAttribute('data-feature') + ':' + b.getAttribute('aria-checked')).sort().join(','))) === userIds.map(id => id + ':' + (table.features[id].default === 'on')).sort().join(','));
  await page.tap('button[data-path="fi"]'); await page.waitForTimeout(150);
  check('FI: Accuracy and Horizon all on', (await page.$$eval('button[role="switch"]', bs => bs.map(b => b.getAttribute('data-feature') + ':' + b.getAttribute('aria-checked')).sort().join(','))) === userIds.map(id => id + ':' + (['accuracy', 'horizon'].indexOf(table.features[id].group) > -1 || table.features[id].default === 'on')).sort().join(','));
  check('...the household still byte-identical', (await hash()) === before);
  check('Settings is in the sidebar under Upkeep', !!(await page.$('#slaf-menu [data-group="upkeep"] [data-room="settings"]')));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log('\n' + '─'.repeat(66));
  if (failures.length === 0) { console.log('✓ ' + passed + ' checks passed — every switch a row, the household untouched'); process.exit(0); }
  console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n'); failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f)); process.exit(1);
})();

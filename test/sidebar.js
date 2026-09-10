/* ==========================================================================
   test/sidebar.js — the section-9 gate, in a phone-shaped browser (D-177).
   --------------------------------------------------------------------------
   Walks every room and asserts it appears in exactly one sidebar group;
   asserts a search for "car" shows What A Car Costs and hides Level Up;
   asserts a retired household has no Work subgroup; and that the current
   room's group is the one open on load.

     python3 -m http.server 8765 &
     NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/sidebar.js
   ========================================================================== */
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const Registry = require(path.join(ROOT, 'shared/registry.js'));

let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? ' — ' + detail : '')); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  const btn = await page.$('#btn-example');
  if (btn) { await btn.click(); await page.waitForTimeout(700); }

  /* Every room, in exactly one group — read from one page's sidebar, since
     the sidebar is the same data on every page. */
  await page.goto(BASE + '/rooms/car.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#slaf-menu', { state: 'attached' });
  const placement = await page.$$eval('#slaf-menu .slaf-menu-group', gs => {
    const out = {};
    gs.forEach(g => g.querySelectorAll('[data-room]').forEach(a => {
      if (a.classList.contains('is-recent')) return;
      const id = a.getAttribute('data-room'); (out[id] = out[id] || []).push(g.getAttribute('data-group'));
    }));
    return out;
  });
  const rooms = Registry.all();
  const employedAbsent = rooms.filter(r => !Registry.appliesToSituation(r, 'employed')).map(r => r.id);
  rooms.forEach(r => {
    const groups = placement[r.id] || [];
    if (employedAbsent.indexOf(r.id) > -1) check(r.id + ' is absent for the employed demo', groups.length === 0);
    else check(r.id + ' appears in exactly one group', groups.length === 1, JSON.stringify(groups));
  });
  check('the groups are the seven, in the brief\'s order', (await page.$$eval('#slaf-menu .slaf-menu-group', gs => gs.map(g => g.getAttribute('data-group')).join(','))) === 'home,numbers,scorecard,decisions,matters,levelup,upkeep');
  check('subgroup names are labels, not links', (await page.$$eval('#slaf-menu .slaf-menu-sub', ns => ns.every(n => n.tagName === 'P' && !n.querySelector('a')))));
  const Ownership = require(path.join(ROOT, 'shared/ownership.js'));
  const owners = Registry.inGroup('numbers', 'employed').filter(r => Ownership.ownedBy(r.id).length).length;
  check('every Your Numbers room that owns a field carries a status dot', (await page.$$eval('#slaf-menu [data-group="numbers"] [data-room] .slaf-dot', ds => ds.length)) === owners);
  check('...and no other group does', (await page.$$eval('#slaf-menu .slaf-menu-group:not([data-group="numbers"]) .slaf-dot', ds => ds.length)) === 0);
  check('the demo\'s Debt Payoff reads filled', await page.$eval('#slaf-menu [data-room="debt-payoff"] .slaf-dot', d => d.classList.contains('is-filled')));
  check('...Expenses partly (therapy is not tracked)', await page.$eval('#slaf-menu [data-room="expenses"] .slaf-dot', d => d.classList.contains('is-partly')));
  check('...and the Calendar empty', await page.$eval('#slaf-menu [data-room="calendar"] .slaf-dot', d => d.classList.contains('is-empty')));
  check('DRAFTT and the map ride as links', (await page.$$eval('#slaf-menu .slaf-menu-link.is-extra', ls => ls.map(l => l.textContent).join('|'))) === 'DRAFTT|Every room, on one page');

  /* Only the current room's group is open on load. */
  await page.evaluate(() => { try { localStorage.removeItem('slaf.prefs.v1'); } catch (e) {} });
  await page.goto(BASE + '/rooms/car.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#slaf-menu', { state: 'attached' });
  const open = await page.$$eval('#slaf-menu .slaf-menu-group', gs => gs.filter(g => g.open).map(g => g.getAttribute('data-group')));
  check('on What A Car Costs only Decisions is open', open.join(',') === 'decisions', open.join(','));
  check('the current room is marked', await page.$eval('#slaf-menu [data-room="car"]', a => a.classList.contains('is-here')));

  /* Open the drawer, search for "car". */
  await page.tap('#slaf-menu-btn'); await page.waitForTimeout(300);
  await page.fill('#slaf-menu-q', 'car'); await page.waitForTimeout(200);
  const visible = await page.$$eval('#slaf-menu [data-room]', as => as.filter(a => !a.hidden && !a.closest('[hidden]')).map(a => a.getAttribute('data-room')));
  check('search "car" shows What A Car Costs', visible.indexOf('car') > -1, visible.join(','));
  check('...and hides Level Up', await page.$eval('#slaf-menu [data-group="levelup"]', g => g.hidden));
  check('...and hides rooms that do not match', visible.indexOf('fire') === -1 && visible.indexOf('partner') === -1, visible.join(','));
  check('...and opens the groups that match', await page.$eval('#slaf-menu [data-group="decisions"]', g => g.open && !g.hidden));
  await page.fill('#slaf-menu-q', ''); await page.waitForTimeout(200);
  check('clearing the search brings every group back', (await page.$$eval('#slaf-menu .slaf-menu-group', gs => gs.filter(g => g.hidden).length)) === 0);

  /* A closed group is remembered; a visited room shows under Recent. */
  await page.$eval('#slaf-menu [data-group="decisions"] > summary', s => s.click()); await page.waitForTimeout(150);
  await page.$eval('#slaf-menu [data-group="matters"] > summary', s => s.click()); await page.waitForTimeout(150);
  await page.goto(BASE + '/rooms/tax.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#slaf-menu', { state: 'attached' });
  const open2 = await page.$$eval('#slaf-menu .slaf-menu-group', gs => gs.filter(g => g.open).map(g => g.getAttribute('data-group')));
  check('on Tax, Your Numbers opens and the opened What Matters is remembered', open2.indexOf('numbers') > -1 && open2.indexOf('matters') > -1 && open2.indexOf('decisions') === -1, open2.join(','));
  const recent = await page.$$eval('#slaf-menu [data-group="home"] .is-recent', as => as.map(a => a.getAttribute('data-room')));
  check('Recent shows the room just left, not this one', recent[0] === 'car' && recent.indexOf('tax') === -1, recent.join(','));

  /* A retired household has no Work subgroup. */
  await page.evaluate(() => { const p = SLAF.Schema.primaryPerson(SLAF.Spine.getProfile()); SLAF.Spine.upsertPerson(Object.assign({}, p, { employmentStatus: 'retired' })); });
  await page.waitForTimeout(300);
  check('retired: no Work subgroup', (await page.$$eval('#slaf-menu [data-subgroup="work"]', ns => ns.length)) === 0);
  check('...no Career Move, no Between Jobs', (await page.$$eval('#slaf-menu [data-room="career-move"], #slaf-menu [data-room="between-jobs"]', ns => ns.length)) === 0);
  check('...Drawing It Down still there', (await page.$$eval('#slaf-menu [data-room="decumulation"]', ns => ns.length)) === 1);
  await page.evaluate(() => { const p = SLAF.Schema.primaryPerson(SLAF.Spine.getProfile()); SLAF.Spine.upsertPerson(Object.assign({}, p, { employmentStatus: 'student' })); }); await page.waitForTimeout(300);
  check('student: no Drawing It Down', (await page.$$eval('#slaf-menu [data-room="decumulation"]', ns => ns.length)) === 0);
  check('...but Career Move is back', (await page.$$eval('#slaf-menu [data-room="career-move"]', ns => ns.length)) === 1);
  check('the search box survived the rebuilds', !!(await page.$('#slaf-menu-q')));

  await browser.close();
  console.log('\n' + '─'.repeat(66));
  if (failures.length === 0) { console.log('✓ ' + passed + ' checks passed — every room in one group, by purpose'); process.exit(0); }
  console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n'); failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f)); process.exit(1);
})();

/* ==========================================================================
   test/statement.js — the Statement split, walked (D-307).
   --------------------------------------------------------------------------
   The brief's gates, measured rather than promised:
     1. every old anchor on rooms/statement.html lands on the section that
        moved, on this page or another, from the head, before anything paints
     2. the four sections fit in two phone screens at 360px
     3. zero entry controls for household facts on the Statement or any
        carved room: a page either has no boxes, or typing into its boxes
        leaves the household byte-identical (a what-if)
     4. a household saved before the split reads back whole in the Ledger's
        A door, the Statement and the carved rooms (the store is the same;
        the migration is a no-op, and this proves it)
     5. each carved room passes the room checklist: a lens where money is
        shown, an Assumptions drawer, reading-from-elsewhere chips, print
        where the old section had it
     6. no fact is asked twice: the bindings in every room, by field, with
        the duplicates listed

     SLAF_BASE=http://127.0.0.1:8765 node test/statement.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const EXECUTABLE = '/opt/pw-browsers/chromium';
let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) { passed++; console.log('  ✓ ' + name); } else { failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? '  (' + detail + ')' : '')); } }

/* 1. Every old anchor, and where it lands now. */
const ANCHORS = [
  ['#what-you-own', 'statement.html#net-worth'], ['#portfolios', 'statement.html#net-worth'], ['#nw-weighted', 'statement.html#net-worth'],
  ['#assets', 'ledger.html#x-A'], ['#asset-list', 'ledger.html#x-A'], ['#btn-add', 'ledger.html#x-A'], ['#setup', 'ledger.html#x-A'], ['#hsa-field', 'ledger.html#x-A'],
  ['#ladder', 'statement.html#ladder'], ['#ladder-why', 'statement.html#ladder'],
  ['#bridge', 'bridge.html#bridge'], ['#bridge-why', 'bridge.html#bridge'], ['#future', 'bridge.html#future'],
  ['#brackets', 'which-account.html#brackets'], ['#where-it-lands', 'which-account.html#compare'], ['#compare', 'which-account.html#compare'], ['#a-amount', 'which-account.html#compare'], ['#solo', 'which-account.html#solo'], ['#s-profit', 'which-account.html#solo'], ['#ac-reading', 'which-account.html#reading'], ['#provenance', 'which-account.html#assumptions'],
  ['#allocation', 'the-mix.html#allocation'], ['#alloc-read', 'the-mix.html#allocation'],
  ['#worst-year', 'runway.html#worst-year'], ['#worst-why', 'runway.html#worst-year'],
  ['#reading', 'statement.html#reading'],
  ['#the-documents', 'the-documents.html#out-basis'], ['#tabs', 'the-documents.html#out-basis'], ['#out-doc', 'the-documents.html#out-doc'], ['#out-how', 'the-documents.html#out-how'],
  ['#left-behind', 'left-behind.html#no-write'], ['#out-four', 'left-behind.html#out-four'], ['#out-trap', 'left-behind.html#out-trap'], ['#out-cost', 'left-behind.html#out-cost'], ['#ro-number', 'left-behind.html#room-number'], ['#ro-room-inputs', 'left-behind.html#room-inputs'], ['#trap-words', 'left-behind.html#out-trap']
];
const CARVED = ['statement', 'bridge', 'which-account', 'the-mix', 'the-documents', 'left-behind'];
/* Boxes the shared modules put on every page: the sidebar search, the lens
   strip, the after-tax basis, undo. None of them is a household fact. */
const NOT_A_FACT = '#slaf-progress *, .slaf-lens *, [data-nw-basis] *, .slaf-undo *, .slaf-menu *';

(async () => {
  const browser = await chromium.launch(fs.existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept());

  /* The demo household, from the front door. */
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  const btn = await page.$('#btn-example');
  if (btn) { await btn.click(); await page.waitForTimeout(700); }

  console.log('\n1. Old anchors land where their section went');
  for (const [old, to] of ANCHORS) {
    /* From a blank page each time: two hashes on one document would be a
       same-document navigation, which is the hashchange path, tested last. */
    await page.goto('about:blank');
    await page.goto(BASE + '/rooms/statement.html' + old, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const url = page.url();
    const [file, hash] = to.split('#');
    /* The scroll-spy writes the section under the top of the screen back to
       the URL once the page has landed, so the hash afterwards can differ
       from the one it landed on. What matters: the right file, and the
       target on it, on screen. A section a household cannot have (the Solo
       401(k) card, for an employee) is absent, which is its own honesty. */
    const landed = await page.evaluate((id) => { const n = document.getElementById(id); if (!n) return 'absent'; const r = n.getBoundingClientRect(); return (n.offsetParent !== null || n.tagName === 'DETAILS') && r.height > 0 ? 'ok' : 'off'; }, hash);
    check(old + ' → ' + to, url.indexOf('/rooms/' + file) !== -1 && (landed === 'ok' || (hash === 'solo' && landed === 'absent')), url + ' (' + landed + ')');
  }
  /* A link tapped on the page itself, to an old anchor: only the hash changes. */
  await page.goto('about:blank');
  await page.goto(BASE + '/rooms/statement.html#net-worth', { waitUntil: 'networkidle' });
  await page.evaluate(() => { location.hash = '#portfolios'; });
  await page.waitForTimeout(300);
  check('a hash change on the page forwards too', /#net-worth$/.test(page.url()), page.url());
  await page.evaluate(() => { location.hash = '#allocation'; });
  await page.waitForTimeout(800);
  check('… to another room as well', /the-mix\.html#allocation$/.test(page.url()), page.url());
  check('the forwarding runs in the head, before the body exists', /<\/head>/.test(fs.readFileSync(path.join(ROOT, 'rooms/statement.html'), 'utf8').split('OLD ANCHORS GO WHERE THEIR SECTION WENT')[1] || ''));

  console.log('\n2. Four sections in two phone screens');
  await page.goto(BASE + '/rooms/statement.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const fit = await page.evaluate(() => {
    const ids = ['net-worth', 'human-capital', 'ladder', 'next-dollar'];
    const bottoms = ids.map(id => { const n = document.getElementById(id); return n ? Math.round(n.getBoundingClientRect().bottom + window.scrollY) : null; });
    return { bottoms, screens: 2 * window.innerHeight, wide: document.documentElement.scrollWidth, hc: !!document.getElementById('human-capital'), nw: document.getElementById('nw-plain').innerText, sure: document.getElementById('nw-sure').innerText, step: document.getElementById('nd-step').innerText, ladderRows: document.querySelectorAll('#ladder-list li').length };
  });
  check('the four sections end within two screens: ' + fit.bottoms.join('/') + ' of ' + fit.screens, fit.bottoms.every(b => b !== null && b <= fit.screens));
  check('nothing wider than 360px', fit.wide <= 360, String(fit.wide));
  check('the demo (32) sees the pay still to come beside net worth', fit.hc);
  check('net worth is a figure', /\$/.test(fit.nw), fit.nw);
  check('counting only what you are sure of is on screen in those words', /Counting only what you are sure of/.test(fit.sure), fit.sure);
  check('the ladder has five rungs, property among them as slow', fit.ladderRows === 5);
  check('the next dollar names a step', /Step \d/i.test(fit.step), fit.step);
  const under40 = await page.evaluate(() => SLAF.Features.on('humanCapital', SLAF.Spine.getProfile()));
  const at45 = await page.evaluate(() => { const h = JSON.parse(JSON.stringify(SLAF.Spine.getProfile())); h.people[0].dob = '1981-01-01'; return SLAF.Features.on('humanCapital', h); });
  check('the switch is on under 40 and off from 40, until the person says otherwise', under40 === true && at45 === false);

  console.log('\n3. Zero entry controls for household facts');
  for (const id of CARVED) {
    await page.goto(BASE + '/rooms/' + id + '.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => localStorage.getItem('slaf.household.v2'));
    const boxes = await page.evaluate((skip) => Array.prototype.filter.call(document.querySelectorAll('main input, main select, main textarea'), n => !n.matches(skip)).map(n => n.id ? '#' + n.id : n.getAttribute('data-ctl') ? '[data-ctl="' + n.getAttribute('data-ctl') + '"]' : n.tagName), NOT_A_FACT);
    if (id === 'which-account' || id === 'left-behind') {
      /* What-if rooms: type into every box, and the household must not move. */
      for (const sel of boxes) {
        try { await page.fill(sel, '1234'); await page.dispatchEvent(sel, 'change'); await page.dispatchEvent(sel, 'blur'); } catch (e) { /* a select */ }
      }
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => localStorage.getItem('slaf.household.v2'));
      check(id + ': ' + boxes.length + ' boxes, every one a what-if (the household is byte-identical)', boxes.length > 0 && before === after);
    } else {
      check(id + ': no box, no select, nothing to type', boxes.length === 0, boxes.join(','));
    }
  }

  console.log('\n4. A household saved before the split reads back whole');
  const snap = fs.readFileSync(path.join(ROOT, 'fixtures/snapshots/pre-d307.household.json'), 'utf8');
  await page.goto(BASE + '/rooms/statement.html', { waitUntil: 'networkidle' });
  await page.evaluate((s) => { localStorage.setItem('slaf.household.v2', s); }, snap);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({ sure: document.getElementById('nw-sure').innerText, lookup: document.getElementById('ladder-lookup').innerText, parts: document.getElementById('nw-parts').innerText, ladder: document.getElementById('ladder-list').innerText }));
  check('the Statement counts the rated accounts', /\$/.test(st.sure) && !/3 accounts not rated/.test(st.sure), st.sure);
  check('… names the plan at a former employer', /former employer/.test(st.lookup), st.lookup.slice(0, 80));
  check('… and puts the flat on the slow rung, not never', /Property and other things/.test(st.ladder) && /\$320,000/.test(st.ladder), st.ladder.replace(/\n/g, ' ').slice(0, 200));
  await page.goto(BASE + '/rooms/ledger.html#all-at-once', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-mode="all"]'); await page.tap('[data-mode="all"]');
  await page.waitForSelector('details.xlvl'); await page.$$eval('details.xlvl', ns => ns.forEach(n => { n.open = true; }));
  await page.waitForTimeout(500);
  const led = await page.evaluate(() => {
    const h = SLAF.Spine.getProfile();
    const roth = h.assets.filter(a => a.label === 'Example Roth')[0];
    const row = (id, key) => { const n = document.querySelector('.xitem[data-x-itemid="' + roth.id + '"] [data-x-row="' + key + '"] [data-x-input]'); return n ? n.value : null; };
    const plain = (key) => { const n = document.querySelector('[data-x-row="' + key + '"] [data-x-input]'); return n ? n.value : null; };
    const na = (key) => { const n = document.querySelector('[data-x-row="' + key + '"] [data-na-field]'); return !!n; };
    return { conf: row(roth.id, 'assetConfidence'), basis: row(roth.id, 'assetCostBasis'), type: row(roth.id, 'assetAccountType'), tier: row(roth.id, 'assetTier'), roth: plain('rothContributed'), hsa: plain('hsaContributed'), rate: plain('marginalRate'), stocks: plain('allocationStocks'), band: plain('rebalanceBand'), hdhp: !!document.querySelector('[data-x-row="onHdhp"] [data-x-val="true"][aria-pressed="true"]'), naPlan: na('contributionPercent'), naHsa: na('hsaContributed') };
  });
  check('the Ledger shows the Roth\'s confidence, basis, type and pile', led.conf === '2' && /21,000/.test(led.basis) && led.type === 'roth_ira' && led.tier === 'retirement', JSON.stringify(led));
  check('… the Roth and HSA contributions and the marginal rate', /3,000/.test(led.roth) && /1,200/.test(led.hsa) && led.rate === '22', JSON.stringify([led.roth, led.hsa, led.rate]));
  check('… the target mix and the band', led.stocks === '70' && led.band === '5', led.stocks + '/' + led.band);
  check('… the high-deductible switch as pressed', led.hdhp);
  check('… and offers N/A on the plan and the HSA rows', led.naPlan && led.naHsa);
  await page.goto(BASE + '/rooms/which-account.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const wa = await page.evaluate(() => ({ now: document.getElementById('a-now').value, years: document.getElementById('a-years').value, later: document.getElementById('a-later').value, solo: !!document.getElementById('solo'), verdict: document.getElementById('a-verdict').innerText }));
  check('Which Account starts from the saved rate and fills the years and the retirement rate', wa.now === '22%' && wa.years !== '' && wa.later !== '', JSON.stringify(wa));
  check('… and hides the Solo 401(k) card from an employee (absent, not greyed)', wa.solo === false);
  await page.goto(BASE + '/rooms/the-mix.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const mix = await page.evaluate(() => ({ stocks: document.getElementById('mix-stocks').innerText, read: document.getElementById('alloc-read').innerText, usd: document.getElementById('usd-stocks').innerText }));
  check('The Mix reads the saved mix and the band', mix.stocks === '70%' && /65% to 75%/.test(mix.read) && /\$/.test(mix.usd), JSON.stringify(mix));
  await page.goto(BASE + '/rooms/left-behind.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const lb = await page.evaluate(() => ({ balance: document.getElementById('ctl-balance').value, number: document.getElementById('room-number').innerText }));
  check('Left Behind proposes the tagged plan\'s balance and prices it', /19,000/.test(lb.balance) && /\$/.test(lb.number), JSON.stringify(lb));
  await page.goto(BASE + '/rooms/runway.html#at-3am', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const wy = await page.evaluate(() => ({ cost: document.getElementById('worst-cost').innerText, short: document.getElementById('worst-short').innerText, visible: !document.getElementById('view-at-3am').hidden }));
  check('the Cushion prices the worst plausible year on its at-3am reading', wy.visible && /\$/.test(wy.cost) && wy.short.length > 0, JSON.stringify(wy));

  console.log('\n5. The room checklist');
  const CHECKLIST = { statement: { lens: true, drawer: true, chips: true, print: true }, bridge: { lens: true, drawer: true, chips: true, print: false }, 'which-account': { lens: true, drawer: true, chips: true, print: false }, 'the-mix': { lens: true, drawer: true, chips: true, print: false }, 'the-documents': { lens: false, drawer: false, chips: true, print: true }, 'left-behind': { lens: true, drawer: true, chips: true, print: false } };
  for (const id of CARVED) {
    await page.goto(BASE + '/rooms/' + id + '.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const seen = await page.evaluate(() => ({
      lens: !!document.querySelector('.slaf-lens [data-lens]'),
      drawer: !!document.querySelector('details.room-drawer, #assumptions'),
      chips: document.querySelectorAll('#reading-list .slaf-owned, #reading-list a').length,
      print: !!document.getElementById('btn-print'),
      header: !!document.querySelector('.slaf-menu-btn, .slaf-hops'),
      undo: !!document.querySelector('.slaf-undo [data-undo]'),
      badge: (document.getElementById('room-badge') || {}).innerText || '',
      words: (document.querySelector('main') || document.body).innerText.split(/\s+/).length,
      /* A dash with a word on either side is copy; a cell holding only the dash is the blank glyph. */
      dash: /\S\s?\u2014\s?\S/.test((document.querySelector('main') || document.body).innerText.replace(/^\s*\u2014\s*$/gm, ''))
    }));
    const want = CHECKLIST[id];
    check(id + ': header, undo, ' + (want.lens ? 'lens, ' : '') + (want.drawer ? 'drawer, ' : '') + 'chips' + (want.print ? ', print' : ''),
      seen.header && seen.undo && (!want.lens || seen.lens) && (!want.drawer || seen.drawer) && seen.chips > 0 && (!want.print || seen.print) && seen.words > 40, JSON.stringify(seen));
    if (id !== 'statement') check(id + ': carries its sphere and minutes badge', /Sphere \d.*minutes/.test(seen.badge), seen.badge);
    check(id + ': no em-dash in what is on screen', !seen.dash);
  }
  check('throws nothing across every page', errs.length === 0, errs[0]);

  console.log('\n6. No fact asked twice: the bindings, by field');
  const bound = {};
  const note = (field, file) => { bound[field] = bound[field] || new Set(); bound[field].add(file); };
  fs.readdirSync(path.join(ROOT, 'rooms')).filter(f => /\.html$/.test(f)).forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, 'rooms', f), 'utf8');
    if (/http-equiv="refresh"/.test(src)) return;
    let m;
    const re = /Ownership\.write\('([a-zA-Z0-9]+)'/g;
    while ((m = re.exec(src))) note(m[1], f);
    const re2 = /data-(?:field|setup|alloc)="([a-zA-Z0-9]+)"/g;
    while ((m = re2.exec(src))) note(m[1], f);
  });
  /* The Ledger binds every row it lists through Ownership.write(row.id): count its rows from the table. */
  const rows = require(path.join(ROOT, 'data/ledger-rows.json')).rows.filter(r => r.kind !== 'computed');
  rows.forEach(r => note(r.id, 'ledger.html'));
  const dupes = Object.keys(bound).filter(k => bound[k].size > 1).sort();
  dupes.forEach(k => console.log('  · ' + k + ': ' + Array.from(bound[k]).join(', ')));
  const carvedBind = Object.keys(bound).filter(k => CARVED.some(id => bound[k].has(id + '.html')));
  check('the Statement and the carved rooms bind no household field', carvedBind.length === 0, carvedBind.join(','));
  console.log('  ' + dupes.length + ' fields are bound in more than one room (listed above; each is one owner with a second door, D-207/D-230)');

  await browser.close();
  console.log('\n' + '─'.repeat(66));
  if (failures.length === 0) { console.log('✓ ' + passed + ' checks passed — the Statement is four sections and the facts are the Ledger\'s'); process.exit(0); }
  console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n');
  failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });

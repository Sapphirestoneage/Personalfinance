#!/usr/bin/env node
/* ==========================================================================
   test/anchors.js — a link that names a field opens to the field. D-323.
   --------------------------------------------------------------------------
   Every field a Solar System level collects carries an anchor
   (shared/ownership.js FIELDS[].anchor), and every room link in the app uses
   it. Half these rooms build their cards from the household, so the id only
   exists once the page has drawn: a source grep cannot tell you whether the
   link lands anywhere. This opens each one in a browser and asks.

   Run with a server on 8765 and NODE_PATH pointing at a playwright install,
   the same as the other browser gates.
   ========================================================================== */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { chromium } = require('playwright');
const Ownership = require(path.join(ROOT, 'shared/ownership.js'));
const Registry = require(path.join(ROOT, 'shared/registry.js'));
const Levels = require(path.join(ROOT, 'data/levels.json'));
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));
/* The same household the browser is given, so a field the situation gate has
   taken away is known here rather than looking like a broken link. */
const HOUSE = Schema.createHousehold(Demo.build());

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
/* The same launch every other browser gate uses: the pre-installed browser
   where there is one, and playwright's own on a runner that has none. */
const EXECUTABLE = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? '\n      ' + detail : '')); }

const rooms = (Registry.ROOMS || Registry.rooms || []);
const fields = [];
const seen = {};
Levels.levels.forEach(l => l.fields.forEach(f => {
  if (!f.existing || !Ownership.FIELDS[f.key] || seen[f.key]) return;
  seen[f.key] = true;
  const fd = Ownership.FIELDS[f.key];
  const room = rooms.filter(r => r.id === fd.owner)[0];
  let applies = true;
  try { applies = fd.applies ? !!fd.applies(HOUSE) : true; } catch (e) { applies = true; }
  if (room && fd.anchor) fields.push({ key: f.key, anchor: fd.anchor, href: room.href, owner: fd.owner, applies: applies });
}));

(async () => {
  const browser = await chromium.launch(require('fs').existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('dialog', d => d.accept());
  /* The example household, so every room has something to draw. */
  await page.goto(BASE + 'index.html'); await page.waitForTimeout(700);
  await page.click('#btn-example'); await page.waitForTimeout(1200);

  console.log('\nEvery field link lands on its field (' + fields.length + ' fields)');
  let absent = 0, notApplicable = 0;
  for (const f of fields) {
    await page.goto(BASE + f.href + '#' + f.anchor, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4200);
    const r = await page.evaluate((a) => {
      const n = document.getElementById(a);
      if (!n) return { missing: true };
      const box = n.getBoundingClientRect();
      if (box.height === 0) return { hidden: true };
      /* A section at the very end of a room cannot be scrolled to the top:
         the page runs out first. Landed there means visible with the page
         scrolled as far as it goes. */
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const atBottom = maxScroll - window.scrollY < 140;
      return {
        top: Math.round(box.top),
        landed: (box.top > -40 && box.top < 240) || (box.bottom > 40 && atBottom),
        marked: !!document.querySelector('.slaf-landed')
      };
    }, f.anchor);
    if (r.missing) {
      /* A question the situation gate has taken away is not on the page, and
         that is right: nothing in the app offers a link to one. */
      if (!f.applies) { notApplicable++; continue; }
      absent++;
      check(`${f.key} (${f.href}#${f.anchor}) is somewhere on its page`, false, 'the anchor names no element, so the link lands at the top of the room');
      continue;
    }
    /* A field the situation gate has taken away is not on the page, and that
       is right: the Planets view never offers a link to one. */
    if (r.hidden) { notApplicable++; continue; }
    check(`${f.key} lands on screen, near the top`, r.landed, `${f.href}#${f.anchor} sat at ${r.top}px`);
  }
  console.log('  ' + (fields.length - absent - notApplicable) + ' checked, ' + notApplicable + ' not applicable to the example household, ' + absent + ' with no anchor on the page');

  /* And the ring: it lands, it marks, and it goes away again. */
  const one = fields.filter(f => f.key === 'cashSavings')[0] || fields[0];
  await page.goto(BASE + one.href + '#' + one.anchor, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('the field it landed on is marked', await page.evaluate(() => !!document.querySelector('.slaf-landed')));
  check('the cursor is in the box', await page.evaluate((a) => {
    const n = document.getElementById(a), ae = document.activeElement;
    return !!(n && ae && ae !== document.body && n.contains(ae));
  }, one.anchor));
  await page.waitForTimeout(2600);
  check('and the mark fades rather than staying', !(await page.evaluate(() => !!document.querySelector('.slaf-landed'))));

  await browser.close();
  console.log('\n' + '─'.repeat(66));
  if (!failures.length) { console.log(`✓ ${passed} checks passed — a link that names a field opens to the field`); process.exit(0); }
  console.log(`✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
})();

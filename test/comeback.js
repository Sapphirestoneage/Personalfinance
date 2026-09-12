#!/usr/bin/env node
/* ==========================================================================
   test/comeback.js — the Comeback after 45 days (J2, D-214).
   --------------------------------------------------------------------------
   Set the clock 45 days ahead: the front door opens on Welcome Back, which
   asks only the moving rows, and no copy on it contains a word from the
   banned list. A missed month is never shown as a failure, a gap or a
   broken streak.

   Needs a server on :8765 —  python3 -m http.server 8765
   Run:  node test/comeback.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const rows = require(path.join(ROOT, 'data/ledger-rows.json')).rows;
const BANNED = ['haven\'t', 'havent', 'missed', 'missing', 'failed', 'failure', 'streak', 'gap', 'behind', 'should have', 'forgot', 'lapsed', 'overdue', 'late', 'neglect', 'abandon', 'you didn\'t', 'you did not'];

let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? ' — ' + detail : '')); }

(async () => {
  const browser = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  /* Day one: the demo household, a visit. */
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  const btn = await page.$('#btn-example');
  if (btn) { await btn.click(); await page.waitForTimeout(600); }
  const lastVisit = await page.evaluate(() => SLAF.Prefs.get('visit.last', null));
  check('the visit is recorded', typeof lastVisit === 'number');
  /* 45 days later. */
  const ahead = 45 * 86400000;
  await page.addInitScript((ahead) => {
    const Real = Date; const shift = ahead;
    class Fake extends Real { constructor(...a) { if (a.length === 0) super(Real.now() + shift); else super(...a); } static now() { return Real.now() + shift; } }
    window.Date = Fake;
  }, ahead);
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  /* Welcome Back is the Ledger's since-last-time view since D-228; the warm
     opening survived the merge and appears only when you were SENT here
     after a gap, which is the state this test sets up. */
  check('the front door opens on the since-last-time view', /rooms\/ledger\.html\?comeback=1#since-last-time/.test(page.url()), page.url());
  if (!/since-last-time/.test(page.url())) { await page.goto(BASE + '/rooms/ledger.html#since-last-time', { waitUntil: 'networkidle' }); }
  await page.waitForSelector('#rows-moving .row', { timeout: 10000 }).catch(() => null);
  const seen = await page.evaluate(() => ({
    fields: Array.from(document.querySelectorAll('#rows-moving input[data-field]')).map(i => i.getAttribute('data-field')),
    text: document.getElementById('view-since').innerText,
    title: document.getElementById('since-head').textContent,
    strip: (document.getElementById('strip') || {}).textContent
  }));
  const moving = {}; rows.forEach(r => { moving[r.id] = r.moves; });
  check('it asks only moving rows', seen.fields.length > 0 && seen.fields.every(f => moving[f] === true), seen.fields.filter(f => moving[f] !== true).join(','));
  check('it opens on Welcome back', /Welcome back/.test(seen.title));
  check('and the warm opening is only for a return, not for every visit',
    /id="since-head" hidden/.test(fs.readFileSync(path.join(ROOT, 'rooms/ledger.html'), 'utf8')));
  check('it says about 2 minutes', /About 2 minutes/.test(seen.text));
  const lower = seen.text.toLowerCase();
  const hits = BANNED.filter(w => lower.indexOf(w) !== -1);
  check('no banned word on the page', hits.length === 0, hits.join(','));
  const led = fs.readFileSync(path.join(ROOT, 'rooms/ledger.html'), 'utf8');
  const src = led.slice(led.indexOf('<section id="view-since"'), led.indexOf('<!-- ================= ARRANGEMENTS')).toLowerCase();
  const srcHits = BANNED.filter(w => src.indexOf(w) !== -1);
  check('and none in the page source copy', srcHits.length === 0, srcHits.join(','));
  check('it ends on the since-last-time strip', typeof seen.strip === 'string' && seen.strip.length > 10);
  /* Once: a second visit the same day does not come back here. */
  await page.goto(BASE + '/index.html?comeback=seen', { waitUntil: 'networkidle' });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  check('the Comeback shows once per return', !/since-last-time/.test(page.url()), page.url());
  await browser.close();
  console.log('\n' + '─'.repeat(66));
  if (failures.length) { console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n'); failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f)); process.exit(1); }
  console.log('✓ ' + passed + ' checks passed — the Comeback asks only what moves, kindly');
})().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/* ==========================================================================
   test/flow.js — a band is a run of questions, not a hunt. D-330.
   --------------------------------------------------------------------------
   The owner's words: "when I click on things it is very slow and doesn't
   immediately close. I want it to open the next thing immediately basically
   and automatically until the band or tier is done and then it's like congrats
   on completing x here is what you unlocked."

   So this walks band 1 of a planet the way a person does, and holds three
   promises:

     1. A tap answers within a breath. Opening a level, closing it and saving
        an answer each land inside BUDGET_MS, measured around the click.
     2. Answering the last fact of a level opens the next level of the band by
        itself, with the cursor in its first box. A level with two facts keeps
        you where you are until both are in.
     3. The last level of the band ends the run with a card that names the
        band, what it bought, and the way into the next one.

   Run with a server on 8765 and NODE_PATH pointing at a playwright install,
   the same as the other browser gates.
   ========================================================================== */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8765/';
const EXECUTABLE = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
/* Generous on purpose: this is a guard against the second-long redraw the
   owner felt, not a benchmark. A tap that takes this long is broken. */
const BUDGET_MS = 400;

let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) passed++; else failures.push(name + (detail ? '\n      ' + detail : '')); }

(async () => {
  const browser = await chromium.launch(require('fs').existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  /* An empty household, so band 1 is a real run of unanswered questions. */
  await page.goto(BASE + 'rooms/ledger.html#planets', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  const openNow = () => page.evaluate(() => {
    const d = document.querySelector('.sky-lv-detail');
    const btn = d && d.parentNode.querySelector('.sky-lv');
    return btn ? btn.getAttribute('data-level') : null;
  });
  async function timed(what, fn) {
    const started = Date.now();
    await fn();
    const took = Date.now() - started;
    check(`${what} answers the tap inside ${BUDGET_MS}ms`, took <= BUDGET_MS, took + 'ms');
    return took;
  }

  console.log('\nA band is a run of questions (band 1 on Expenses)');

  await timed('opening a planet', () => page.click('.sky-row[data-planet="expenses"]'));
  await timed('opening a level', () => page.click('.sky-lv[data-level="E1"]'));
  await timed('closing it again', () => page.click('.sky-lv[data-level="E1"]'));
  check('closing a level really closes it', (await openNow()) === null);
  await timed('opening it once more', () => page.click('.sky-lv[data-level="E1"]'));
  check('and the level it opens is the one that was tapped', (await openNow()) === 'E1');

  /* E1 asks one fact. Answering it should hand over to E2. */
  await page.fill('[data-sky-ask="wantsMonthly"] [data-ask-input]', '3150');
  await timed('saving an answer', () => page.click('[data-sky-ask="wantsMonthly"] [data-sky-save]'));
  check('answering a level opens the next one of the band', (await openNow()) === 'E2');
  check('with the cursor already in its box', await page.evaluate(() => {
    const a = document.activeElement;
    return !!(a && a.closest && a.closest('.sky-lv-detail') && /INPUT|SELECT|TEXTAREA/.test(a.tagName));
  }));

  await page.fill('[data-sky-ask="accommodationMonthly"] [data-ask-input]', '1500');
  await page.click('[data-sky-ask="accommodationMonthly"] [data-sky-save]');
  await page.waitForTimeout(250);
  check('and again, to the third', (await openNow()) === 'E3');

  /* E3 asks two. The first answer must not move anyone on. */
  await page.click('[data-sky-ask="spendingIncludesDebt"] [data-ask-val="false"]');
  await page.waitForTimeout(250);
  check('a level with two facts waits for both', (await openNow()) === 'E3');

  await page.click('[data-sky-ask="spendingIncludesSaving"] [data-ask-val="false"]');
  await page.waitForTimeout(400);
  check('the last answer of the band closes the run', (await openNow()) === null);

  const card = await page.evaluate(() => {
    const c = document.getElementById('sky-unlocked');
    if (!c || c.hidden) return null;
    return {
      text: c.textContent.replace(/\s+/g, ' '),
      heading: (c.querySelector('b') || {}).textContent || '',
      bought: c.querySelectorAll('li').length,
      onward: !!c.querySelector('[data-sky-nextband]')
    };
  });
  check('and a card says the band is done', !!card && /Band 1 on Expenses is done/.test(card.heading), card ? card.heading : 'no card');
  check('it names what the run bought', !!card && card.bought > 0, card ? String(card.bought) : 'no card');
  check('and carries the way into the next band', !!card && card.onward);

  await page.click('[data-sky-nextband]');
  await page.waitForTimeout(400);
  check('which opens the first question of band 2', (await openNow()) === 'E4');
  check('and the card steps out of the way', await page.evaluate(() => {
    const c = document.getElementById('sky-unlocked');
    return !c || c.hidden;
  }));

  console.log('\nBand 1 can be answered by someone who does not know the answer (D-336)');

  /* The owner, on the question that asks what goes away each month: "Im not
     sure." So the same run is walked again on Assets, using only the ways
     out a beginner has: the pieces added up, and saying so outright. */
  await page.click('.sky-row[data-planet="expenses"]');
  await page.click('.sky-row[data-planet="assets"]');
  await page.waitForTimeout(250);
  const asked = await page.textContent('.sky-lv[data-level="A3"]');
  check('the question is asked in plain words on the list',
    /How much money do you put away each month/.test(asked), asked.replace(/\s+/g, ' ').trim());

  await page.click('.sky-lv[data-level="A3"]');
  await page.waitForSelector('.d-sketch');
  const panel = (await page.textContent('.sky-lv-detail')).replace(/\s+/g, ' ');
  check('the panel says what the number means before it asks for it',
    /Anything that leaves your spending/.test(panel));
  check('and says what to do when nothing goes away', /type 0/.test(panel));
  check('the app\u2019s own words are still there, folded away',
    /What counts, and where to look/.test(panel) && /Unlocks\./.test(panel));

  await page.click('.d-addup > summary');
  const parts = await page.$$('[data-sky-part]');
  check('the sum is broken into pieces anyone can answer', parts.length === 3, String(parts.length));
  await parts[0].fill('250');
  await parts[2].fill('100');
  const running = await page.textContent('[data-sky-total]');
  check('the boxes that were filled add up in front of you', /\$350/.test(running), running.trim());
  check('and the empty one is left out rather than counted as nothing',
    /2 boxes you filled/.test(running), running.trim());

  await timed('using the total', () => page.click('[data-sky-usetotal]'));
  await page.waitForTimeout(300);
  const landed = await page.evaluate(() => {
    const h = SLAF.Spine.getProfile();
    const r = SLAF.Ownership.FIELDS.savedMonthly.read(h);
    return { value: r.value, meta: (h.meta.fields || {}).savedMonthly || null };
  });
  check('the total is written through the field\u2019s owner', landed.value === 35000, String(landed.value));
  check('and stands as rough, because it was added up rather than read off a statement',
    !!landed.meta && landed.meta.confidence === 'roughly', JSON.stringify(landed.meta));

  await page.click('.sky-row[data-planet="assets"]');
  await page.click('.sky-row[data-planet="taxes"]');
  await page.waitForTimeout(250);
  await page.click('.sky-lv[data-level="T3"]');
  await page.waitForSelector('.d-notsure');
  await page.click('.d-notsure');
  await page.waitForTimeout(300);
  const unsure = await page.evaluate(() => {
    const h = SLAF.Spine.getProfile();
    const r = SLAF.Ownership.FIELDS.refundLastYear.read(h);
    return { notSure: !!(h.meta.notSure || {}).refundLastYear, value: r.value, status: r.status };
  });
  check('"I am not sure" is recorded as an answer of its own', unsure.notSure);
  check('and no number is written in its place', unsure.value === null && unsure.status === 'incomplete', JSON.stringify(unsure));

  console.log('\nThe dashboard reads what has been answered (D-338)');

  await page.click('#sky-tabs [data-tab="dash"]');
  await page.waitForTimeout(400);
  const dash = await page.evaluate(() => {
    const box = document.getElementById('sky-dash');
    return {
      shown: !box.hidden,
      text: box.textContent.replace(/\s+/g, ' '),
      bars: box.querySelectorAll('.slaf-bars .row').length,
      rings: box.querySelectorAll('svg').length,
      labelled: [...box.querySelectorAll('.slaf-bars .row')].every(r => (r.querySelector('.val') || {}).textContent),
      tiles: box.querySelectorAll('.dash-tile').length
    };
  });
  check('the dashboard opens on its own tab', dash.shown);
  check('it counts the questions answered, not only the levels',
    /Questions answered/.test(dash.text) && /Levels answered/.test(dash.text), dash.text.slice(0, 120));
  check('every planet and every band has a bar', dash.bars >= 16, String(dash.bars));
  check('and every bar carries its own figure', dash.labelled);
  check('the headline tiles are there', dash.tiles >= 4, String(dash.tiles));
  check('a ring is drawn for the share answered', dash.rings >= 1, String(dash.rings));
  check('the figures it shows are the ones the band just bought',
    /Readings the app can make/.test(dash.text));
  /* A level named on the dashboard opens where it is answered. */
  const target = await page.$('#sky-dash [data-goto]');
  if (target) {
    const id = await target.getAttribute('data-goto');
    await target.click();
    await page.waitForTimeout(400);
    check('a level named on the dashboard opens on the planets tab',
      (await openNow()) === id, id + ' vs ' + (await openNow()));
  }

  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log('\n' + '─'.repeat(66));
  if (!failures.length) { console.log(`✓ ${passed} checks passed — a band runs from one question to the next`); await browser.close(); process.exit(0); }
  console.log(`✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  await browser.close();
  process.exit(1);
})();

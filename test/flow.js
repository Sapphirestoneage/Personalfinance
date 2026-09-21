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

  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log('\n' + '─'.repeat(66));
  if (!failures.length) { console.log(`✓ ${passed} checks passed — a band runs from one question to the next`); await browser.close(); process.exit(0); }
  console.log(`✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  await browser.close();
  process.exit(1);
})();

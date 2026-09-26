#!/usr/bin/env node
/* ==========================================================================
   safeword/test/browser.js, the phone walk. SF-010.
   --------------------------------------------------------------------------
   Opens every page in Chromium at phone width, blank and with the example
   numbers; types into a box, reloads, and expects the number kept; opens
   a "?"; and fails on any console error or horizontal scroll. Needs a
   server on 8765 (python3 -m http.server 8765) and playwright on NODE_PATH,
   the way the SPARKS browser gates do.

     node safeword/test/browser.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright');
const PAGES = ['index', 'streams', 'house', 'taxes', 'fund', 'rails', 'longgame', 'dynamic', 'family', 'play', 'plan'];
const BASE = process.env.SAFEWORD_BASE || 'http://127.0.0.1:8765/safeword/';
let passed = 0; const failures = [];
function ok(name, cond, detail) { if (cond) passed++; else failures.push(name + (detail ? ': ' + detail : '')); }
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  async function open(p) { await page.goto(BASE + p + '.html', { waitUntil: 'networkidle' }); await page.waitForSelector('.sw-nav'); }
  for (const mode of ['blank', 'demo']) {
    for (const p of PAGES) {
      await open(p);
      if (mode === 'demo' && p === 'index') { await page.click('#btn-demo'); await page.waitForSelector('.sw-banner'); }
      const horiz = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      ok(mode + ' ' + p + ' fits a phone', !horiz);
      ok(mode + ' ' + p + ' draws the header', await page.locator('.sw-nav a[aria-current="page"]').count() === 1);
      if (mode === 'demo') ok(p + ' shows no "not yet" with the example numbers', p === 'longgame' ? true : await page.locator('.sw-notyet').count() === 0, String(await page.locator('.sw-notyet').count()));
    }
  }
  /* Type, reload, keep. */
  await open('fund');
  await page.fill('#lean', '3100'); await page.dispatchEvent('#lean', 'input');
  await page.waitForTimeout(100);
  ok('typing drops the example banner', await page.evaluate(() => JSON.parse(localStorage.getItem('safeword.household.v1')).meta.demo === false));
  await open('fund');
  ok('a typed lean month survives a reload', await page.inputValue('#lean') === '3100');
  ok('and the target moved with it', (await page.locator('#stats').innerText()).indexOf('$') !== -1);
  /* A list page: add, type, remove. */
  await open('play');
  const before = await page.locator('#rows .sw-row').count();
  await page.click('#add');
  ok('add appends a row', await page.locator('#rows .sw-row').count() === before + 1);
  const rowId = await page.locator('#rows .sw-row').last().getAttribute('data-id');
  await page.fill('#' + rowId + '-year', '999'); await page.dispatchEvent('#' + rowId + '-year', 'input');
  await open('play');
  ok('the new row is kept', await page.inputValue('#' + rowId + '-year') === '999');
  await page.click('[data-remove="' + rowId + '"]');
  await open('play');
  ok('remove forgets it', await page.locator('#' + rowId + '-year').count() === 0);
  /* The words. */
  await open('streams');
  await page.locator('.help-btn').first().click();
  ok('a ? opens the words', await page.locator('.help-panel').count() === 1);
  await page.locator('.help-btn').first().click();
  ok('and closes them', await page.locator('.help-panel').count() === 0);
  /* Blank money is not zero. */
  await open('fund');
  await page.fill('#lean', ''); await page.dispatchEvent('#lean', 'input');
  ok('a cleared box is null, not zero', await page.evaluate(() => JSON.parse(localStorage.getItem('safeword.household.v1')).personal.leanMonthCents === null));
  await browser.close();
  ok('no console errors anywhere', errors.length === 0, errors.join(' | '));
  console.log(passed + ' passed, ' + failures.length + ' failed');
  failures.forEach(f => console.log('  FAIL ' + f));
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });

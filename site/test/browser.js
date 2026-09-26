#!/usr/bin/env node
/* ==========================================================================
   site/test/browser.js, the community front in a real browser. SD-001.
   --------------------------------------------------------------------------
   Serve the repo (python3 -m http.server 8765) and run:
     node site/test/browser.js
   Every page loads with a clean console at phone and desktop widths, the
   header and footer mount, the tables and lists fill from the data files,
   and the calculator answers the example numbers with the room's number.
   Needs playwright on NODE_PATH, as test/render.js does.
   ========================================================================== */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BASE = (process.env.SLAF_BASE || 'http://127.0.0.1:8765') + '/site/';
const EXE = '/opt/pw-browsers/chromium';

let pass = 0; const fails = [];
function check(name, ok, detail) { if (ok) pass++; else fails.push(name + (detail ? ': ' + detail : '')); }

(async () => {
  const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const pages = ['index.html', 'number.html', 'learn.html', 'tools.html', 'glossary.html', 'about.html'];
  for (const width of [390, 1100]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    for (const p of pages) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(BASE + p, { waitUntil: 'networkidle' });
      await page.waitForTimeout(150);
      check(p + ' @' + width + ' clean console', errors.length === 0, errors.join(' | ').slice(0, 200));
      check(p + ' @' + width + ' header mounted', await page.$eval('#site-head .site-nav', n => n.children.length === 6));
      check(p + ' @' + width + ' footer mounted', await page.$eval('#site-foot', n => /leaves your browser/.test(n.textContent)));
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      check(p + ' @' + width + ' no sideways scroll', !wide);
      check(p + ' @' + width + ' the current page is marked', await page.$eval('#site-head a[aria-current="page"]', a => !!a));
      if (p === 'learn.html') {
        check('learn: the savings-rate table filled', await page.$$eval('#rate-table tbody tr', r => r.length === 11));
        check('learn: the ladder has ten steps', await page.$$eval('#ladder li', r => r.length === 10));
        check('learn: six sizes', await page.$$eval('#variants li', r => r.length === 6));
      }
      if (p === 'tools.html') {
        check('tools: every registered room is a card', await page.$$eval('#groups .site-card', r => r.length) === require(path.join(ROOT, 'shared/registry.js')).ROOMS.length);
        check('tools: the questions drew', await page.$$eval('#questions-list .site-card', r => r.length >= 12));
      }
      if (p === 'glossary.html') {
        const n = await page.$$eval('#gloss dt', r => r.length);
        check('glossary: every term drew', n === JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/glossary.json'), 'utf8')).terms.length, String(n));
        await page.fill('#q', 'coast');
        check('glossary: search narrows', await page.$$eval('#gloss dt', r => r.length) < n);
        check('glossary: the box is the same box', await page.$eval('#q', i => i.value === 'coast'));
      }
      if (p === 'number.html') {
        check('number: empty says which box', await page.$eval('#out .big', n => /spend in a month/.test(n.textContent)));
        await page.click('#btn-example');
        await page.waitForTimeout(100);
        const Money = require(path.join(ROOT, 'shared/money.js'));
        const Fire = require(path.join(ROOT, 'engines/fire.js'));
        const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));
        const T = { fireVariants: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/fire_variants.json'), 'utf8')) };
        const want = Money.formatCents(Fire.calculateFIRE(Demo.build(), T).value);
        check('number: the example gives the room\'s number', await page.$eval('#out .big', n => n.textContent) === want, want);
        check('number: six rungs, Coast and Barista included when given', await page.$$eval('#out .site-rungs li', r => r.length === 5));
        await page.fill('#parttime', '15000');
        await page.waitForTimeout(100);
        check('number: barista joins with a part-time pay', await page.$$eval('#out .site-rungs li', r => r.length === 6));
        check('number: the sensitivity table drew', await page.$$eval('#out .site-table tbody tr', r => r.length === 4));
        check('number: the years are said', await page.$eval('#out', n => /years/.test(n.textContent)));
        check('number: the example figures stayed in their boxes', await page.$eval('#spend', i => i.value !== ''));
        await page.click('#btn-clear');
        await page.waitForTimeout(50);
        check('number: clear empties and says so', await page.$eval('#out .big', n => /spend in a month/.test(n.textContent)));
        check('number: nothing stored', await page.evaluate(() => Object.keys(localStorage).filter(k => k.indexOf('slaf.errlog') !== 0).length === 0));
      }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  console.log('site browser: ' + pass + ' checks passed' + (fails.length ? ', ' + fails.length + ' failed' : ''));
  fails.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

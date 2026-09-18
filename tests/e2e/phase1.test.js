#!/usr/bin/env node
/* ==========================================================================
   tests/e2e/phase1.test.js — the Phase 1 flow, end to end, in a real browser.
   --------------------------------------------------------------------------
   What Phase 1 is meant to be, and what this file holds the app to:

     A person arrives with nothing saved. They are put into onboarding —
     not the dashboard, not the map, not the room list. Onboarding offers
     three ways in (walked through, the whole form, example numbers). It
     asks for TWO numbers: what a month costs, and the cash on hand. With
     only those two the app can say how long the money lasts — the runway —
     and can suggest one next step.

   Every step takes a screenshot into tests/e2e/screenshots/ and records a
   pass or a fail. The run does NOT stop at the first failure: the point of
   the suite is the list of what is broken, not the first thing to break.

   Run:  npm run e2e        (from tests/)
         node tests/e2e/phase1.test.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const H = require('./harness.js');

const REPORT = path.join(__dirname, '..', 'reports', 'e2e.json');
const VIEWPORT = { width: 1000, height: 900 };

/* Two demo numbers, and nothing else. $3,200 a month out, $9,600 in the
   bank — exactly three months of runway, which is easy to read in a
   screenshot and easy to assert on. Demo values only (CLAUDE.md). */
const DEMO = { expenses: '3200', cash: '9600', expectMonths: 3 };

async function main() {
  const found = H.resolvePlaywright();
  if (!found.pw) {
    console.error('SKIPPED — ' + found.why);
    process.exitCode = 2;
    return;
  }
  const { chromium } = found.pw;

  H.resetShots();
  const site = await H.serve(H.ROOT);
  const browser = await chromium.launch();
  const run = H.Run('phase1');

  /** A browser that has never been here: no localStorage, no cookies. */
  async function fresh() {
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    /* Short, because half of what this suite does is prove something is
       missing. Thirty seconds a miss makes the run useless to watch. */
    page.setDefaultTimeout(8000);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    return { ctx, page };
  }

  async function capture(page, slug) {
    const name = await H.shot(page, slug);
    run.shot(name);
    return name;
  }

  /* Wrap each step so one thrown error cannot end the run. */
  async function step(title, fn) {
    run.step(title);
    process.stdout.write('  · ' + title + ' … ');
    try {
      await fn();
      const last = run.steps()[run.steps().length - 1];
      if (last.status === 'pending') last.status = 'pass';
      console.log(last.status === 'pass' ? 'pass' : 'FAIL');
    } catch (err) {
      run.fail('threw: ' + (err && err.message ? err.message : String(err)));
      console.log('FAIL (threw)');
    }
  }

  /** What screen index.html believes it is showing. */
  async function screenOf(page) {
    return page.evaluate(() => document.body.getAttribute('data-slaf-screen'));
  }

  /** Is this element on the page AND visible? */
  async function visible(page, selector) {
    return page.evaluate((sel) => {
      const n = document.querySelector(sel);
      if (!n) return false;
      if (n.hidden || n.closest('[hidden]')) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }, selector);
  }

  console.log('\nPhase 1 flow — ' + site.base + '\n');

  /* ---- 1. A fresh visit lands in onboarding ----------------------------- */
  await step('fresh visit with nothing saved opens onboarding', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.waitForTimeout(400);
    await capture(page, 'fresh-visit');

    const keys = await H.storedKeys(page);
    run.note('stored keys on arrival: ' + (keys.length ? keys.join(', ') : 'none'));

    const screen = await screenOf(page);
    const onboarding = await visible(page, '#landing');
    if (screen !== 'onboarding') run.fail('body data-slaf-screen is "' + screen + '", expected "onboarding"');
    else if (!onboarding) run.fail('the onboarding card (#landing) is not visible');
    else run.ok('onboarding is the first screen');
    await ctx.close();
  });

  /* ---- 2. …and offers exactly three ways in ----------------------------- */
  await step('onboarding offers all three paths', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.waitForTimeout(300);
    const paths = { walk: '#btn-start', form: '#btn-express', example: '#btn-example' };
    const missing = [];
    for (const [k, sel] of Object.entries(paths)) {
      if (!(await visible(page, sel))) missing.push(k + ' (' + sel + ')');
    }
    await capture(page, 'three-paths');
    if (missing.length) run.fail('paths not visible: ' + missing.join(', '));
    else run.ok('walked through, whole form, example numbers');
    await ctx.close();
  });

  /* ---- 3. No dashboard, no map, no room list before onboarding ---------- */
  await step('nothing of the dashboard or the map shows before onboarding', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.waitForTimeout(300);
    const leaks = await page.evaluate(() => {
      const out = [];
      const shown = (n) => {
        if (!n || n.hidden || n.closest('[hidden]')) return false;
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      if (Array.prototype.some.call(document.querySelectorAll('.dash'), shown)) out.push('a dashboard block (.dash)');
      Array.prototype.forEach.call(document.querySelectorAll('a[href]'), (a) => {
        const href = a.getAttribute('href') || '';
        if (!shown(a)) return;
        if (/(^|\/)map\.html/.test(href)) out.push('a link to the map: "' + a.textContent.trim() + '"');
      });
      /* The room list also hides behind the header's ☰ menu, which is a
         door to every room and so is a door past onboarding. */
      const menu = document.querySelector('.slaf-hops-host, .slaf-menu, [aria-label="Rooms"], .room-menu-btn, button[aria-controls]');
      if (shown(menu)) out.push('the rooms menu (' + (menu.className || menu.tagName) + ')');
      return out;
    });
    await capture(page, 'no-map-before-onboarding');
    if (leaks.length) run.fail('visible before onboarding: ' + leaks.join('; '));
    else run.ok('onboarding only');
    await ctx.close();
  });

  /* ---- 4. The map itself sends a new arrival back to onboarding --------- */
  await step('opening the map with nothing saved returns to onboarding', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/map.html');
    await page.waitForTimeout(800);
    await capture(page, 'map-redirect');
    const url = page.url();
    if (/map\.html/.test(url)) run.fail('still on the map: ' + url);
    else run.ok('sent to ' + url.replace(site.base, ''));
    await ctx.close();
  });

  /* ---- 5. Path one: walked through, and it asks for spending first ------ */
  await step('path 1 (walk me through it) asks what a month costs', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.click('#btn-start');
    await page.waitForLoadState('load');
    await H.slafReady(page);
    await page.waitForTimeout(500);
    await capture(page, 'path1-walk-through');
    const first = await page.evaluate(() => {
      const screens = Array.prototype.filter.call(document.querySelectorAll('.screen'), (s) => !s.hidden && !s.closest('[hidden]'));
      return screens.length ? { id: screens[0].id, text: (screens[0].innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160) } : null;
    });
    run.note('first screen: ' + JSON.stringify(first));
    if (!first) run.fail('no question screen is showing at ' + page.url());
    else if (first.id !== 'q-expenses') run.fail('first question is "' + first.id + '", expected "q-expenses"');
    else run.ok(first.text);
    await ctx.close();
  });

  /* ---- 6. Path two: the whole form, cut to Phase 1 ---------------------- */
  await step('path 2 (the whole form) shows only the two Phase 1 rows', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.click('#btn-express');
    await page.waitForLoadState('load');
    await H.slafReady(page);
    await page.waitForTimeout(900);
    await capture(page, 'path2-whole-form');
    const inputs = await page.evaluate(() => {
      const shown = (n) => {
        if (!n || n.hidden || n.closest('[hidden]')) return false;
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return Array.prototype.filter.call(document.querySelectorAll('#view-express input, #view-express select, #view-express textarea'), shown)
        .map((n) => {
          const row = n.closest('[data-x-row]');
          if (row) return row.getAttribute('data-x-row');
          return n.getAttribute('id') || n.getAttribute('aria-label') || n.type;
        });
    });
    run.note('visible inputs: ' + inputs.length + (inputs.length ? ' — ' + [...new Set(inputs)].slice(0, 12).join(', ') : ''));
    /* The month is READ as monthlyExpenses and WRITTEN as wantsMonthly —
       an unsplit month is "everything else" (shared/schema.js). The form
       shows the row you type into. */
    const wanted = ['wantsMonthly', 'cashSavings'];
    const extra = [...new Set(inputs.filter((i) => wanted.indexOf(i) === -1))];
    if (inputs.length === 0) run.fail('the whole-form view shows no inputs at all');
    else if (extra.length) run.fail('rows beyond expenses and cash are still showing: ' + extra.slice(0, 10).join(', '));
    else run.ok('expenses and cash, and nothing else');
    await ctx.close();
  });

  /* ---- 7. Path three: example numbers ----------------------------------- */
  await step('path 3 (example numbers) fills the household and moves on', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.click('#btn-example');
    await page.waitForTimeout(1200);
    await capture(page, 'path3-example-numbers');
    const keys = await H.storedKeys(page);
    const screen = await screenOf(page);
    run.note('screen after example numbers: ' + screen + '; stored: ' + keys.join(', '));
    if (!keys.some((k) => /household/.test(k))) run.fail('nothing was saved for the example household');
    else if (screen === 'onboarding') run.fail('still in onboarding after the example household loaded');
    else run.ok('example household loaded, screen is "' + screen + '"');
    await ctx.close();
  });

  /* ---- 8. Typing the two numbers produces a runway ---------------------- */
  await step('expenses + cash alone produce a runway on the last onboarding screen', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.click('#btn-start');
    await page.waitForLoadState('load');
    await H.slafReady(page);
    await page.waitForTimeout(500);

    await page.fill('#in-expenses', DEMO.expenses);
    await page.locator('#q-expenses [data-next]').click();
    await page.waitForTimeout(250);
    await capture(page, 'entered-expenses');

    await page.fill('#in-cash', DEMO.cash);
    await page.locator('#q-cash [data-next]').click();
    await page.waitForTimeout(900);
    await capture(page, 'runway-shown');

    const text = await H.bodyText(page);
    const saidRunway = /month/i.test(text) && new RegExp('\\b' + DEMO.expectMonths + '\\b').test(text);
    run.note('insight text: ' + text.slice(0, 220));
    if (!saidRunway) run.fail('no runway in months on screen after the two numbers');
    else run.ok(DEMO.expectMonths + ' months of runway from $' + DEMO.cash + ' against $' + DEMO.expenses + ' a month');
    await ctx.close();
  });

  /* ---- 9. The micro-dashboard: the runway and one next step ------------- */
  await step('the micro-dashboard shows the runway and a next step', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.click('#btn-start');
    await page.waitForLoadState('load');
    await H.slafReady(page);
    await page.waitForTimeout(400);
    await page.fill('#in-expenses', DEMO.expenses);
    await page.locator('#q-expenses [data-next]').click();
    await page.fill('#in-cash', DEMO.cash);
    await page.locator('#q-cash [data-next]').click();
    await page.waitForTimeout(600);

    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.waitForTimeout(800);
    await capture(page, 'micro-dashboard');

    const screen = await screenOf(page);
    const runway = await page.evaluate(() => {
      const n = document.querySelector('#micro-runway');
      return n ? (n.innerText || '').replace(/\s+/g, ' ').trim() : null;
    });
    const next = await page.evaluate(() => {
      const n = document.querySelector('#micro-next');
      return n && !n.hidden ? (n.innerText || '').replace(/\s+/g, ' ').trim() : null;
    });
    run.note('screen: ' + screen + '; runway: ' + runway + '; next: ' + next);
    const problems = [];
    if (screen !== 'micro') problems.push('screen is "' + screen + '", expected "micro"');
    if (!runway || !/month/i.test(runway)) problems.push('no runway figure in #micro-runway');
    if (!next) problems.push('no next-step suggestion in #micro-next');
    if (problems.length) run.fail(problems.join('; '));
    else run.ok(runway + ' — ' + next);
    await ctx.close();
  });

  /* ---- 9b. …and the rest of the app is still shut until asked for ------- */
  await step('the micro-dashboard keeps the rooms menu shut until unlocked', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.click('#btn-start');
    await page.waitForLoadState('load');
    await H.slafReady(page);
    await page.waitForTimeout(400);
    await page.fill('#in-expenses', DEMO.expenses);
    await page.locator('#q-expenses [data-next]').click();
    await page.fill('#in-cash', DEMO.cash);
    await page.locator('#q-cash [data-next]').click();
    await page.waitForTimeout(600);
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.waitForTimeout(700);

    const shutBefore = !(await visible(page, '.slaf-menu-btn'));
    await page.click('#btn-unlock');
    await page.waitForTimeout(600);
    await capture(page, 'unlocked');
    const openAfter = await visible(page, '.slaf-menu-btn');
    run.note('menu before unlock: ' + (shutBefore ? 'shut' : 'open') + '; after: ' + (openAfter ? 'open' : 'shut'));
    if (!shutBefore) run.fail('the rooms menu is on screen while Phase 1 is still locked');
    else if (!openAfter) run.fail('the rooms menu did not appear after "Open the rest of the app"');
    else run.ok('shut until asked for, open once asked');
    await ctx.close();
  });

  /* ---- 10. The Cushion room reads the same two numbers ------------------ */
  await step('The Cushion reads a real runway from the two numbers alone', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.click('#btn-start');
    await page.waitForLoadState('load');
    await H.slafReady(page);
    await page.waitForTimeout(400);
    await page.fill('#in-expenses', DEMO.expenses);
    await page.locator('#q-expenses [data-next]').click();
    await page.fill('#in-cash', DEMO.cash);
    await page.locator('#q-cash [data-next]').click();
    await page.waitForTimeout(600);

    await page.goto(site.base + '/rooms/runway.html');
    await H.slafReady(page);
    await page.waitForTimeout(1200);
    await capture(page, 'cushion-room');
    const figure = await page.evaluate(() => {
      const n = document.querySelector('#out-runway [data-figure]');
      return n ? (n.innerText || '').replace(/\s+/g, ' ').trim() : null;
    });
    run.note('The Cushion figure: ' + figure);
    if (!figure || figure === '—' || /add|enter|need/i.test(figure)) run.fail('The Cushion has no number: "' + figure + '"');
    else run.ok(figure);
    await ctx.close();
  });

  /* ---- 11. The progress bar moves on those two numbers ------------------ */
  await step('the progress bar reports progress from the two numbers', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.click('#btn-start');
    await page.waitForLoadState('load');
    await H.slafReady(page);
    await page.waitForTimeout(400);
    await page.fill('#in-expenses', DEMO.expenses);
    await page.locator('#q-expenses [data-next]').click();
    await page.fill('#in-cash', DEMO.cash);
    await page.locator('#q-cash [data-next]').click();
    await page.waitForTimeout(600);

    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    await page.waitForTimeout(700);
    const pct = await page.evaluate(() => {
      const n = document.querySelector('#micro-progress');
      if (!n) return null;
      return { value: n.getAttribute('data-phase1-complete'), text: (n.innerText || '').replace(/\s+/g, ' ').trim() };
    });
    await capture(page, 'progress-bar');
    run.note('progress: ' + JSON.stringify(pct));
    if (!pct) run.fail('no #micro-progress on the micro-dashboard');
    else if (pct.value !== '2') run.fail('progress says "' + pct.value + '" of the two Phase 1 numbers, expected "2"');
    else run.ok(pct.text);
    await ctx.close();
  });

  /* ---- 13. The tradeoff cards: one direction, and a legend saying which -- */
  await step('the tradeoff cards mark every metric the same way, with a legend', async () => {
    const { ctx, page } = await fresh();
    await page.goto(site.base + '/index.html');
    await H.slafReady(page);
    /* The Long Way Round needs a whole household, so take the example one
       and open the gate — this step is about the cards, not the gate. */
    await page.evaluate(() => {
      const d = window.SLAF.DemoPersona.build();
      window.SLAF.Spine.updateProfile({ people: d.people, filingStatus: d.filingStatus, state: d.state,
        assets: d.assets, debts: d.debts, expenses: d.expenses, capturingFullMatch: d.capturingFullMatch,
        retirement: d.retirement, insurance: d.insurance });
      window.SLAF.Phase1.unlock();
    });
    await page.goto(site.base + '/rooms/adventure.html');
    await H.slafReady(page);
    await page.waitForTimeout(2500);
    await capture(page, 'tradeoff-legend');

    const legend = await visible(page, '#legend');
    const cards = await page.evaluate(() => [...document.querySelectorAll('.pathcard')].map((n) => ({
      label: (n.querySelector('b') || {}).innerText || '',
      baseline: n.classList.contains('is-baseline'),
      better: n.querySelectorAll('.dir.is-better').length,
      worse: n.querySelectorAll('.dir.is-worse').length
    })));
    run.note('legend visible: ' + legend + '; cards: ' + JSON.stringify(cards));
    const problems = [];
    if (!legend) problems.push('no legend on screen');
    if (!cards.length) problems.push('no cards rendered');
    if (cards.some((c) => c.baseline && (c.better || c.worse))) problems.push('the baseline is marked better or worse than itself');
    /* The whole point: one card that costs hours reads WORSE on hours while
       reading BETTER on money. Before this, both were plain numbers. */
    if (!cards.some((c) => !c.baseline && c.better > 0 && c.worse > 0)) {
      problems.push('no card shows a better and a worse metric together, so the convention is not being exercised');
    }
    if (problems.length) run.fail(problems.join('; '));
    else run.ok(cards.length + ' cards, one direction each, legend on screen');
    await ctx.close();
  });

  await browser.close();
  await site.close();

  /* ---- The record ------------------------------------------------------- */
  const report = run.report();
  report.ranAt = new Date().toISOString();
  report.playwrightFrom = found.from;
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');

  console.log('\n' + '─'.repeat(66));
  for (const s of report.steps) {
    console.log((s.status === 'pass' ? '  ✓ ' : '  ✗ ') + s.title);
    for (const n of s.notes) console.log('      ' + n);
  }
  console.log('─'.repeat(66));
  console.log(report.pass + ' of ' + report.total + ' steps pass. Screenshots in tests/e2e/screenshots/.');
  console.log('Report: tests/reports/e2e.json\n');
  process.exitCode = report.fail ? 1 : 0;
}

main().catch((err) => { console.error(err); process.exit(3); });

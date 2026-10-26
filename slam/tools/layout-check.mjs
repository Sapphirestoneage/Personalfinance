// Layout check (S-109): runs with tools/screens-check.mjs (and on its own).
// For every screen and Insights tab on every test household, at phone width
// (390 x 844), it fails when:
//   - a screen is taller than 6 phone screens (Review: 5, S-129; Review's fill gaps: 2 for Riley);
//   - a section heading or chart title appears more than once in the app;
//   - Insights has a data input (only pickers marked data-picker are allowed);
//   - Track has a setup input (accounts, paydays, bill dates, the cushion...);
//   - a screen has more than 12 sections;
//   - Today has a chart, or lacks a one-tap link to any Insights tab (lesson 7);
//   - a health coverage question appears anywhere but Setup, Health coverage (S-117).
// It prints the inventory (height, sections, charts, inputs, buttons) before
// the S-106 menu (tools/inventory-before.json) and now.
//
// Run from the repo root, with the slam folder served:
//   (cd slam && python3 -m http.server 8765 &) ; node slam/tools/layout-check.mjs

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PHONE = { width: 390, height: 844 };
const HOUSEHOLDS = [['maya', 'Maya, 26'], ['luis', 'Luis, 33'], ['tasha', 'Tasha, 29'], ['sam', 'Sam, 24'], ['jordan', 'Jordan, 31'], ['riley', 'Riley, 31'], ['dana', 'Dana, 34']];
const TABS = ['where', 'compared', 'time', 'cash', 'networth', 'you'];
const SECTIONS = ['basics', 'coverage', 'income', 'bills', 'categories', 'tags', 'coach', 'notes', 'future'];
// Every state a person can land on: [label, hash, data-key to click after].
export const STATES = [
  ['Today', 'today'], ['Accounts', 'accounts'], ['Plan: next month', 'plan', 'plan-view-plan'], ['Plan: estimates', 'plan', 'plan-view-estimates'], ['Track', 'track'], ['Review', 'review'],
  ...TABS.map((t) => ['Insights: ' + t, 'insights', 'tab-' + t]),
  ...SECTIONS.map((s) => ['Setup: ' + s, 'setup', 'setup-' + s])
];
const LIMIT_SCREENS = 6;
// Review is lighter (S-129): Month in review shows its headline numbers until opened.
const LIMIT_BY_STATE = { Review: 5 };
const LIMIT_SECTIONS = 12;
const LIMIT_FILL_GAPS_RILEY = 2;
// Inputs that belong to Setup (one-time setup); none may sit on Track.
const SETUP_KEY = /^(payday:|nextpay:|acct-inc:|acct-line:|acct-debt:|paywith:|add-acct-|future-tools|coach-notes|materiality|no-debts|add-debt|sit-|profile-state|living-with|filing)/;
const SETUP_PATH = /^\["(balances|income|debts|profile|household|cashflow|accounts)"|"(dueDay|dueMonth)"\]$/;

// What one screen holds, counted the same way as the inventory taken before S-106.
async function measure(page) {
  return page.evaluate(([setupKey, setupPath]) => {
    const m = document.querySelector('#main');
    const vis = (e) => e.offsetParent !== null;
    const inputs = [...m.querySelectorAll('input, select, textarea')].filter((e) => e.type !== 'file' && vis(e));
    const fg = document.getElementById('fill-gaps');
    return {
      height: +(document.documentElement.scrollHeight / innerHeight).toFixed(1),
      sections: [...m.querySelectorAll('.card')].filter((c) => !c.parentElement.closest('.card')).length,
      charts: m.querySelectorAll('.chart svg').length,
      inputs: inputs.length,
      buttons: [...m.querySelectorAll('button')].filter(vis).length,
      headings: [...m.querySelectorAll('h2, .card > h3, .card > .spread > h3')].filter(vis).map((x) => x.textContent.trim()),
      dataInputs: inputs.filter((e) => !e.hasAttribute('data-picker')).map((e) => e.getAttribute('data-key') || e.getAttribute('aria-label') || e.tagName),
      setupInputs: inputs.filter((e) => setupKey.test(e.getAttribute('data-key') || '') || setupPath.test(e.getAttribute('data-path') || '')).map((e) => e.getAttribute('data-key')),
      fillGaps: fg ? +(fg.getBoundingClientRect().height / innerHeight).toFixed(2) : null,
      // Health coverage questions (S-117): the coverage inputs, the old parent's plan box, a premium line's amount.
      coverageInputs: inputs.filter((e) => /^(coverage-|parents-plan)/.test(e.getAttribute('data-key') || '') || /^\["coverage"|^\["line","premiums","(estimate|actual)"/.test(e.getAttribute('data-path') || '')).map((e) => e.getAttribute('data-key') || e.getAttribute('data-path'))
    };
  }, [SETUP_KEY, SETUP_PATH]);
}

async function open(page, url, button) {
  await page.goto(url + '#clients');
  await page.getByText(button).first().click();
  await page.waitForSelector('#headline');
}

async function visit(page, [, hash, click]) {
  await page.evaluate((x) => { location.hash = x; }, hash);
  await page.waitForSelector('#main[data-screen="' + hash + '"]');
  if (click) await page.click('[data-key="' + click + '"]');
  await page.waitForTimeout(150);
}

const fmt = (x) => x.height + ' screens, ' + x.sections + ' sections, ' + x.charts + ' charts, ' + x.inputs + ' inputs, ' + x.buttons + ' buttons';

export async function layoutCheck(browser, url) {
  let failures = 0;
  const fail = (msg) => { failures += 1; console.log('  FAIL ' + msg); };
  const after = {};
  for (const [id, button] of HOUSEHOLDS) {
    const page = await browser.newPage({ viewport: PHONE });
    await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));
    await open(page, url, button);
    const seen = {};
    after[id] = {};
    for (const st of STATES) {
      await visit(page, st);
      const x = await measure(page);
      after[id][st[0]] = x;
      const limit = LIMIT_BY_STATE[st[0]] || LIMIT_SCREENS;
      if (x.height > limit) fail(id + ', ' + st[0] + ': ' + x.height + ' phone screens tall (limit ' + limit + ')');
      if (x.sections > LIMIT_SECTIONS) fail(id + ', ' + st[0] + ': ' + x.sections + ' sections (limit ' + LIMIT_SECTIONS + ')');
      if (st[1] === 'insights' && x.dataInputs.length) fail(id + ', ' + st[0] + ': data inputs in Insights: ' + x.dataInputs.join(', '));
      if (st[1] === 'track' && x.setupInputs.length) fail(id + ', ' + st[0] + ': setup inputs on Track: ' + x.setupInputs.join(', '));
      // Lesson 7 (S-116): Today shows numbers, not charts, and links to every chart tab in one tap.
      if (st[1] === 'today') {
        if (x.charts) fail(id + ', Today: ' + x.charts + ' charts (Today shows numbers, not charts)');
        const links = await page.$$eval('[data-key^="today-chart:"]', (bs) => bs.map((b) => b.getAttribute('data-key').slice(12)));
        const missing = TABS.filter((t) => !links.includes(t));
        if (missing.length) fail(id + ', Today: no one-tap link to Insights ' + missing.join(', '));
      }
      if (st[0] !== 'Setup: coverage' && x.coverageInputs.length) fail(id + ', ' + st[0] + ': a health coverage question outside Setup, Health coverage: ' + x.coverageInputs.join(', '));
      if (st[1] === 'review' && id === 'riley' && x.fillGaps > LIMIT_FILL_GAPS_RILEY) fail('riley, fill gaps: ' + x.fillGaps + ' phone screens (limit ' + LIMIT_FILL_GAPS_RILEY + ')');
      // The same section can be visited twice (Plan has two views); a heading counts once per state.
      for (const t of new Set(x.headings)) (seen[t] = seen[t] || []).push(st[0]);
      for (const t of x.headings.filter((v, i, a) => a.indexOf(v) !== i)) fail(id + ', ' + st[0] + ': heading "' + t + '" twice on one screen');
    }
    for (const [t, where] of Object.entries(seen)) {
      const screens = [...new Set(where.map((w) => w.split(':')[0]))];
      // Plan's two views share the page header; anything else is a second copy.
      if (where.length > 1 && !(screens.length === 1 && screens[0] === 'Plan' && where.length === 2 && t === 'About how much do you spend a month?')) fail(id + ': heading "' + t + '" appears on ' + where.join(' and '));
    }
    await page.close();
  }
  // The inventory, before (Clients / Fill in / Budget / Analyze) and after (the loop).
  const before = JSON.parse(readFileSync(new URL('./inventory-before.json', import.meta.url), 'utf8'));
  for (const [id, key] of [['riley', 'Riley, 31'], ['maya', 'Maya, 26']]) {
    console.log('\nInventory, ' + id + ', phone (390 x 844). Before:');
    for (const [screen, x] of Object.entries(before[key])) console.log('  ' + screen.padEnd(22) + fmt(x));
    console.log('After:');
    for (const [screen, x] of Object.entries(after[id])) console.log('  ' + screen.padEnd(22) + fmt(x) + (x.fillGaps !== null ? ' (fill gaps ' + x.fillGaps + ')' : ''));
  }
  console.log(failures ? '\nLayout: ' + failures + ' FAILED' : '\nLayout: every screen within its limits.');
  return { failures, after };
}

// Run on its own.
if (process.argv[1] && process.argv[1].endsWith('layout-check.mjs')) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); } catch (e) { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }
  const browser = await playwright.chromium.launch();
  const { failures } = await layoutCheck(browser, process.env.SLAM_URL || 'http://localhost:8765/clients.html');
  await browser.close();
  process.exit(failures ? 1 : 0);
}

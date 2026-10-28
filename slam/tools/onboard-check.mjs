// The onboarding check (owner's ask, 2026-10-28): three mock first passes at 375px, run the way the coach would on a
// call, each from a blank client file (test/clients/*-start.json, made up): Maya (27, renter, one W-2 job), Dre (31,
// self-employed, a card balance), and Jordan and Sam (a couple, two jobs, a car loan). Counts every tap and every
// key pressed, times the script, estimates the live length at a coach's pace, and then checks that the finish
// screen's numbers are the ones Today and My numbers show. Run from the repo root with slam served on 8765:
//   (cd slam && python3 -m http.server 8765 &) ; node slam/tools/onboard-check.mjs
// Exits 1 when a check fails or a pass would take 20 minutes or more.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = process.env.SLAM_URL || 'http://localhost:8765/';
const file = (n) => fileURLToPath(new URL('../test/clients/' + n, import.meta.url));
// A coach's pace on a call: a tap 4 seconds; a number the client says from memory and the coach types, 15 seconds;
// a name, 8 seconds. Enter and Tab are free (the coach's hands are on the keys already).
const EST = { tap: 4, number: 15, name: 8 };
const LIMIT_MINUTES = 20;

let failed = 0;
const check = (ok, words) => { if (!ok) { failed++; console.log('  FAIL: ' + words); } };
const num = (text) => { const m = /-?\$?([\d,]+(?:\.\d+)?)/.exec(String(text || '').replace(/−/g, '-')); return m ? +(m[0].replace(/[$,]/g, '')) : null; };

async function pass(browser, who, plan) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const n = { tap: 0, keys: 0, number: 0, name: 0 }, notes = [];
  const t0 = Date.now();
  const settle = (ms = 220) => page.waitForTimeout(ms);
  const k = {
    page, notes,
    go: async (href) => { await page.goto(BASE + href, { waitUntil: 'networkidle' }); await settle(); },
    tap: async (sel) => { n.tap++; await page.locator(sel).first().click(); await settle(); },
    // A pick list: open and choose, two taps.
    pick: async (sel, value) => { n.tap += 2; await page.selectOption(sel, value); await settle(); },
    // Type into a box, Enter to move on. The box gets a tap only when the focus is not already in it.
    type: async (id, text, kind = 'number') => {
      const focused = await page.evaluate((x) => document.activeElement && document.activeElement.id === x, id);
      if (!focused) { n.tap++; await page.locator('#' + id).click(); }
      await page.keyboard.type(String(text)); n.keys += String(text).length;
      await page.keyboard.press('Enter'); n.keys++;
      n[kind]++;
      await settle(300);
    },
    // Enter to move on: from a box to the next box; from the last box to the Next button, then once more to the next
    // step. next() presses until the step changes.
    enter: async () => { n.keys++; await page.keyboard.press('Enter'); await settle(400); },
    next: async () => { const was = await page.evaluate(() => document.querySelector('.onb-step')?.dataset.step); for (let i = 0; i < 3; i++) { n.keys++; await page.keyboard.press('Enter'); await settle(400); if ((await page.evaluate(() => document.querySelector('.onb-step')?.dataset.step)) !== was) return; } notes.push('Enter did not move on from ' + was); },
    read: async (sel = '#app') => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' '),
    has: async (sel) => (await page.locator(sel).count()) > 0,
    check: (ok, w) => check(ok, who + ': ' + w)
  };
  // The blank client file, then Start onboarding on Home.
  await k.go('dashboard.html');
  n.tap++; await page.setInputFiles('input[aria-label="Your household file"]', file(who + '-start.json')); await settle(500);
  k.check(await k.has('a.btn.primary:text-is("Start onboarding")'), 'Home offers Start onboarding to a new client');
  await k.tap('a.btn.primary:text-is("Start onboarding")');
  await page.waitForURL(/ledger\.html#\/onboard/);
  await settle(400);
  k.check(/1 Profile 2 Income 3 Debt 4 Assets 5 Needs 6 Goals 7 Finish/.test(await k.read()), 'the step bar across the top');
  let finish = {};
  try { finish = await plan(k); } catch (err) {
    failed++;
    const shot = fileURLToPath(new URL('../tools/gallery/onboard-' + who + '-failed.png', import.meta.url));
    try { await page.screenshot({ path: shot, fullPage: true }); } catch { /* no screenshot */ }
    console.log('  FAIL: ' + who + ': the pass broke: ' + String(err.message).split('\n').slice(0, 8).join(' | ') + ' (see ' + shot + ')');
  }
  const secs = Math.round((Date.now() - t0) / 100) / 10;
  const minutes = Math.round((n.tap * EST.tap + n.number * EST.number + n.name * EST.name) / 6) / 10;
  k.check(!errs.length, 'no page errors (' + errs.join('; ') + ')');
  k.check(minutes < LIMIT_MINUTES, 'under ' + LIMIT_MINUTES + ' minutes at a coach\'s pace (' + minutes + ')');
  await ctx.close();
  return { who, secs, taps: n.tap, keys: n.keys, numbers: n.number, names: n.name, minutes, finish, notes };
}

// The finish screen's lines, as numbers, then Done and the same numbers on Today and My numbers.
async function finishAndCompare(k) {
  const lines = {};
  for (const li of await k.page.locator('.onb-step .sum-line').all()) {
    const [label, value] = (await li.innerText()).split('\n');
    lines[label.trim()] = value.trim();
  }
  k.check(Object.keys(lines).length === 7, 'the finish screen lists seven numbers (' + Object.keys(lines).join(', ') + ')');
  await k.tap('#onb-done');
  await k.page.waitForURL(/dashboard\.html/);
  await k.page.waitForTimeout(400);
  const home = await k.read();
  k.check(!(await k.has('a.btn.primary:text-is("Start onboarding")')), 'Home no longer offers Start onboarding');
  await k.tap('.gear > summary');
  k.check(/Run onboarding again/.test(await k.page.locator('.gear').innerText()), 'the gear menu offers Run onboarding again');
  await k.tap('.gear > summary');
  // Today's net worth tile, liquid and total; its surplus screen's take-home.
  const nw = await k.read('#tile-networth');
  const liq = /Liquid\s*(-?\$[\d,]+|missing)/.exec(nw), tot = /Total\s*(-?\$[\d,]+|missing)/.exec(nw);
  k.check(liq && num(liq[1]) === num(lines['Net worth, liquid']), 'liquid net worth: Today ' + (liq && liq[1]) + ' vs finish ' + lines['Net worth, liquid']);
  k.check(tot && num(tot[1]) === num(lines['Net worth, total']), 'total net worth: Today ' + (tot && tot[1]) + ' vs finish ' + lines['Net worth, total']);
  await k.go('dashboard.html#/surplus');
  const th = /Take-home\s*(-?\$[\d,.]+|missing)/.exec(await k.read());
  k.check(th && num(th[1]) === num(lines['Monthly take-home']), 'take-home: Today ' + (th && th[1]) + ' vs finish ' + lines['Monthly take-home']);
  // My numbers: Debt's total, the FI number on Goals, and Needs' lines marked need.
  await k.go('ledger.html');
  const debt = await k.read('a.go-row[href="#/debt"]');
  const owed = /(\$[\d,]+) owed|(\d+ of \d+ filled in)/.exec(debt);
  k.check(owed && (owed[1] ? num(owed[1]) === num(lines['Total owed']) : num(lines['Total owed']) === null || num(lines['Total owed']) === 0), 'total owed: My numbers "' + debt + '" vs finish ' + lines['Total owed']);
  await k.go('ledger.html#/goals');
  const fi = /FI number: today's spending\s*(\$[\d,]+|Missing)/.exec(await k.read());
  k.check(fi && num(fi[1]) === num(lines['FI number']), 'FI number: My numbers ' + (fi && fi[1]) + ' vs finish ' + lines['FI number']);
  void home;
  return lines;
}

// One of the four answers on a row box: Rough, Not now or Not for me.
const answer = (k, id, words) => k.tap('#' + id + ' ~ .ans button:text-is("' + words + '")');

const maya = async (k) => {
  // Profile: she is single (the default), 27, in NY (the default), renting (the default), a job (the default).
  await k.type('ob-name-0', 'Maya', 'name');
  await k.type('ob-age-0', 27);
  await k.next(); // on State: the defaults stand, Enter reaches Next, Enter again opens Income
  k.check(/Income/.test(await k.read('h1')), 'Enter on the last Profile box moved to Income');
  // Income: one job, take-home $2,150 every 2 weeks (the default way and schedule).
  await k.tap('button[aria-label="One more: W-2 job"]');
  await k.type('r-income-paycheck-name', 'Hudson Valley Health', 'name');
  await k.type('r-income-paycheck-amount', 2150);
  await k.next(); // How often: every 2 weeks, keep it
  k.check(/Debt/.test(await k.read('h1')), 'Enter past the last box moved to Debt');
  k.check(await k.has('#r-income-paycheck-amount') === false, 'left the Income step');
  // Debt: none. Next.
  await k.next();
  // Assets: checking and savings.
  await k.tap('button[aria-label="One more: Checking"]');
  await k.type('r-accounts-checking-name', 'Chase checking', 'name');
  await k.type('r-accounts-checking-balance', 2400);
  await k.tap('button[aria-label="One more: Savings or HYSA"]');
  await k.type('r-accounts-savings-name', 'Ally savings', 'name');
  await k.type('r-accounts-savings-balance', 3100);
  await k.next();
  k.check(/Needs/.test(await k.read('h1')), 'Enter past the last box moved to Needs');
  // Needs: seven rough numbers.
  for (const [cat, v] of [['housing', 1650], ['food', 600], ['around', 132], ['bills', 195], ['health', 60], ['fun', 220], ['other', 150]]) await k.type('est-' + cat, v);
  await k.next();
  k.check(/Goals/.test(await k.read('h1')), 'Enter after the seventh number moved to Goals');
  // Goals: an emergency fund and travel, with amounts; FI: curious.
  await k.tap('#ob-goals-emergency'); await k.tap('#ob-goals-travel'); await k.tap('#ob-fi-curious');
  await k.type('ob-goal-goal-emergency-target', 9000);
  await k.type('ob-goal-goal-travel-target', 1500);
  await k.next();
  k.check(/Finish/.test(await k.read('h1')), 'on the finish screen');
  return finishAndCompare(k);
};

const dre = async (k) => {
  await k.type('ob-name-0', 'Dre', 'name');
  await k.type('ob-age-0', 31);
  await k.tap('#ob-work-self');
  await k.tap('#onb-next');
  // Income: self-employed, $4,300 a month before tax.
  await k.tap('button[aria-label="One more: Self-employed or side income"]');
  await k.type('r-income-self-employed-pay-name', 'Design work', 'name');
  await k.type('r-income-self-employed-pay-amount', 4300);
  await answer(k, 'r-income-self-employed-pay-amount', 'Rough');
  await k.tap('#onb-next');
  // Debt: one card, with the rate marked rough; the second card parked for later, then deleted.
  await k.tap('button[aria-label="One more: Credit cards"]');
  await k.type('r-debts-credit-card-name', 'Chase Freedom', 'name');
  await k.type('r-debts-credit-card-balance', 4200);
  await k.type('r-debts-credit-card-apr', 24.99);
  await answer(k, 'r-debts-credit-card-apr', 'Rough');
  await k.type('r-debts-credit-card-minimum', 120);
  await k.tap('#irow-credit-card button:text-is("Duplicate")');
  // The copy is named after the card ("Chase Freedom copy"), so its row is found by that name.
  k.check(await k.has('#irow-chase-freedom-copy'), 'Duplicate made a second card row');
  k.check((await k.page.locator('#r-debts-chase-freedom-copy-apr').inputValue()) === '24.99', 'the copy keeps the rate, not the balance');
  await answer(k, 'r-debts-chase-freedom-copy-balance', 'Not now');
  await k.tap('#irow-chase-freedom-copy button:text-is("Delete")');
  k.check(!(await k.has('#irow-chase-freedom-copy')), 'Delete took the copy away');
  await k.tap('#irow-credit-card summary');
  k.check(/Interest rate|Credit limit|Due day/i.test(await k.read('#irow-credit-card')), 'More detail opens the card\'s full rows');
  await k.tap('#irow-credit-card summary');
  await k.tap('#onb-next');
  // Assets: checking only; a car, worth about $9,000, rough.
  await k.tap('button[aria-label="One more: Checking"]');
  await k.type('r-accounts-checking-name', 'Checking', 'name');
  await k.type('r-accounts-checking-balance', 1800);
  await k.tap('button[aria-label="One more: Car"]');
  await k.type('r-accounts-car-name', 'Civic', 'name');
  await answer(k, 'r-accounts-car-balance', 'Rough');
  await k.type('r-accounts-car-balance', 9000);
  await k.tap('#onb-next');
  for (const [cat, v] of [['housing', 1400], ['food', 820], ['around', 400], ['bills', 150], ['health', 90], ['fun', 300], ['other', 200]]) await k.type('est-' + cat, v);
  await k.next();
  await k.tap('#ob-goals-debtFree'); await k.tap('#ob-goals-emergency'); await k.tap('#ob-fi-notNow');
  await k.type('ob-goal-goal-emergency-target', 8000);
  await k.tap('#onb-next');
  return finishAndCompare(k);
};

const jordanSam = async (k) => {
  await k.tap('#ob-who-couple');
  await k.type('ob-name-0', 'Jordan', 'name');
  await k.type('ob-age-0', 31);
  await k.type('ob-name-1', 'Sam', 'name');
  await k.type('ob-age-1', 29);
  await k.pick('#ob-state', 'IL');
  k.check(await k.page.locator('#ob-filing-mfj').getAttribute('aria-pressed') === 'true', 'a couple is suggested married filing jointly');
  await k.tap('#onb-next');
  // Two jobs: Jordan twice a month, Sam every 2 weeks; both as take-home.
  await k.tap('button[aria-label="One more: W-2 job"]');
  await k.type('r-income-paycheck-name', 'Jordan at Acme', 'name');
  await k.type('r-income-paycheck-amount', 2400);
  await k.pick('#r-income-paycheck-often', 'semimonthly');
  await k.tap('button[aria-label="One more: W-2 job"]');
  await k.type('r-income-paycheck-2-name', 'Sam at the clinic', 'name');
  await k.type('r-income-paycheck-2-amount', 1900);
  await k.tap('#onb-next');
  // A car loan and a student loan whose balance is rough.
  await k.tap('button[aria-label="One more: Car loans"]');
  await k.type('r-debts-auto-loan-name', 'Car loan', 'name');
  await k.type('r-debts-auto-loan-balance', 9800);
  await k.type('r-debts-auto-loan-apr', 6.5);
  await k.type('r-debts-auto-loan-minimum', 310);
  await k.tap('button[aria-label="One more: Student loans"]');
  await k.type('r-debts-federal-student-loan-name', 'Sam\'s student loan', 'name');
  await answer(k, 'r-debts-federal-student-loan-balance', 'Rough');
  await k.type('r-debts-federal-student-loan-balance', 14000);
  await answer(k, 'r-debts-federal-student-loan-apr', 'Not now');
  await k.type('r-debts-federal-student-loan-minimum', 160);
  await k.tap('#onb-next');
  await k.tap('button[aria-label="One more: Checking"]');
  await k.type('r-accounts-checking-name', 'Joint checking', 'name');
  await k.type('r-accounts-checking-balance', 3200);
  await k.tap('button[aria-label="One more: Savings or HYSA"]');
  await k.type('r-accounts-savings-name', 'Savings', 'name');
  await k.type('r-accounts-savings-balance', 8000);
  await k.tap('button[aria-label="One more: 401(k) or 403(b)"]');
  await k.type('r-accounts-401-k-traditional-name', 'Jordan 401(k)', 'name');
  await k.type('r-accounts-401-k-traditional-balance', 12000);
  await k.tap('button[aria-label="One more: Crypto"]');
  await answer(k, 'r-accounts-crypto-balance', 'Not for me');
  await k.tap('#onb-next');
  for (const [cat, v] of [['housing', 1900], ['food', 700], ['around', 450], ['bills', 220], ['health', 150], ['fun', 300], ['other', 250]]) await k.type('est-' + cat, v);
  await k.next();
  await k.tap('#ob-goals-emergency'); await k.tap('#ob-goals-home'); await k.tap('#ob-fi-yes');
  await k.type('ob-goal-goal-emergency-target', 10000);
  await k.type('ob-goal-goal-home-target', 40000);
  await k.tap('#onb-next');
  return finishAndCompare(k);
};

const browser = await playwright.chromium.launch();
const results = [];
// SLAM_WHO=dre runs one client.
for (const [who, plan] of [['maya', maya], ['dre', dre], ['jordan-sam', jordanSam]].filter(([w]) => !process.env.SLAM_WHO || process.env.SLAM_WHO === w)) results.push(await pass(browser, who, plan));
await browser.close();
console.log('\n| Client | Script seconds | Taps | Keys | Numbers | Names | Estimated live minutes |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) console.log('| ' + [r.who, r.secs, r.taps, r.keys, r.numbers, r.names, r.minutes].join(' | ') + ' |');
for (const r of results) { console.log('\n' + r.who + ' finish: ' + Object.entries(r.finish).map(([k, v]) => k + ' ' + v).join('; ')); for (const x of r.notes) console.log('  note: ' + x); }
console.log('\nPace: a tap ' + EST.tap + ' s, a number ' + EST.number + ' s, a name ' + EST.name + ' s; Enter and Tab free.');
console.log(failed ? failed + ' checks failed' : 'All checks passed');
process.exit(failed ? 1 : 0);

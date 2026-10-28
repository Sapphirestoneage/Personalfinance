// The client test (Phase 2.5, Batch 10): two mock first sessions, typed the way a coach would, timed. Maya (27,
// renter, anxious) and Dre (31, self-employed, lumpy pay, a card balance) each start from a client answers file
// (test/clients/*-answers.json, made up) and the Profile. Then a navigation test: four levels down, the phone's back to
// the top, three undos in a row. Run from the repo root with slam served on 8765:
//   (cd slam && python3 -m http.server 8765 &) ; node slam/tools/client-check.mjs
// Prints, per client: the seconds the script took, the taps, typed answers and results read aloud, an estimated
// session length at a coach's pace (EST), and every place a step needed explaining (notes). Exits 1 when a check fails.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = process.env.SLAM_URL || 'http://localhost:8765/';
const file = (n) => fileURLToPath(new URL('../test/clients/' + n, import.meta.url));
// A coach's pace: a tap (pick an answer, open a screen) 5 seconds; a typed answer 45 seconds (asking it, the client
// finding it, typing it); a result read aloud and talked through 60 seconds.
const EST = { tap: 5, type: 45, read: 60 };

let failed = 0;
const check = (ok, words) => { if (!ok) { failed++; console.log('  FAIL: ' + words); } };

async function session(browser, who, plan) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const n = { tap: 0, type: 0, read: 0 }, notes = [];
  const t0 = Date.now();
  const settle = () => page.waitForTimeout(200);
  const k = {
    page, notes,
    go: async (href) => { n.tap++; await page.goto(BASE + href, { waitUntil: 'networkidle' }); await settle(); },
    tap: async (sel) => { n.tap++; await page.locator(sel).first().click(); await settle(); },
    pick: async (sel, value) => { n.tap++; await page.selectOption(sel, value); await settle(); },
    type: async (sel, v) => { n.type++; await page.locator(sel).first().fill(String(v)); await page.keyboard.press('Tab'); await settle(); },
    read: async (sel = 'main') => { n.read++; return (await page.locator(sel).first().innerText()).replace(/\s+/g, ' '); },
    has: async (sel) => (await page.locator(sel).count()) > 0,
    check: (ok, w) => check(ok, who + ': ' + w)
  };
  // The new client's file, then the answers they sent from "Before our first call".
  await k.go('dashboard.html');
  n.tap++; await page.setInputFiles('input[aria-label="Your household file"]', file(who + '-start.json')); await page.waitForTimeout(500);
  await k.go('profile.html');
  n.tap++; await page.setInputFiles('input[aria-label="The client\'s answers file"]', file(who + '-answers.json')); await page.waitForTimeout(500);
  k.check(/answers loaded/.test(await k.read()), 'the answers loaded');
  await plan(k);
  const secs = Math.round((Date.now() - t0) / 100) / 10;
  const minutes = Math.round((n.tap * EST.tap + n.type * EST.type + n.read * EST.read) / 60);
  k.check(!errs.length, 'no page errors (' + errs.join('; ') + ')');
  k.check(minutes < 60, 'under an hour (' + minutes + ' min)');
  await ctx.close();
  return { who, secs, ...n, minutes, notes };
}

// Type each line that shows; a line with no box is noted (the coach would have to find where it goes).
async function needs(k, lines) {
  await k.go('session.html#/needs');
  for (const [key, v] of lines) { if (await k.has('#n-' + key)) await k.type('#n-' + key, v); else k.notes.push('Needs: no box for ' + key); }
}
async function addIncome(k, { type, basis, name, amount, often }) {
  await k.go('session.html#/income');
  await k.tap('#i-add');
  await k.pick('#add-type', type);
  if (basis) { if (await k.has('#add-basis')) await k.pick('#add-basis', basis); else k.notes.push('Income: no pay question for ' + type); }
  if (often && await k.has('#add-schedule')) await k.pick('#add-schedule', often);
  await k.type('#add-name', name);
  await k.type('#add-amount', amount);
  await k.tap('.add-form button[type="submit"]');
}
async function addAccounts(k, list) {
  await k.go('session.html#/assets');
  for (const [button, balance] of list) {
    await k.tap('.card .edit-actions button:text-is("' + button + '")');
    const boxes = k.page.locator('[id^="a-bal-"]');
    await k.type('[id^="a-bal-"] >> nth=' + ((await boxes.count()) - 1), balance);
  }
}
async function goals(k, amounts) {
  await k.go('session.html#/goals');
  for (const [id, v] of amounts) { if (await k.has('#g-t-' + id)) await k.type('#g-t-' + id, v); else k.notes.push('Goals: ' + id + ' was not set up from the answers'); }
}
async function level2(k, marks) {
  for (const [area, label, status] of marks) {
    await k.go('profile.html#/ask/' + area);
    const card = k.page.locator('section.card', { hasText: label }).first();
    if (!(await card.count())) { k.notes.push('Level 2: no question "' + label + '"'); continue; }
    await card.locator('button.seg-btn', { hasText: status }).first().click(); await k.page.waitForTimeout(200);
  }
}

const maya = async (k) => {
  await k.go('session.html');
  k.check(/To ask today/.test(await k.read()), 'the Session lists what to ask today');
  await needs(k, [['rent', 1650], ['renters-insurance', 15], ['utilities', 90], ['internet', 60], ['phone', 45], ['groceries', 380], ['eating-out', 220], ['transit', 132]]);
  k.check(!(await k.has('#n-mortgage')) && !(await k.has('#n-car-gas')), 'a renter on transit is not asked about a mortgage or gas');
  await addIncome(k, { type: 'w2', basis: 'salary', name: 'Salary', amount: 2150, often: 'biweekly' });
  await addAccounts(k, [['Checking', 2400], ['Savings', 3100]]);
  await goals(k, [['goal-emergency', 9000], ['goal-travel', 1500]]);
  await level2(k, [['k401', 'What goes in', 'look it up'], ['k401', 'The match formula', 'look it up']]);
  await k.go('dashboard.html');
  const today = await k.read();
  k.check(/Monthly surplus/.test(today) && /\$[\d,]+/.test(today), 'Today shows her numbers');
  await k.go('onepager.html');
  k.check(/Your to-dos/.test(await k.read()), 'her to-dos print on the One-pager');
};

const dre = async (k) => {
  await needs(k, [['rent', 1400], ['utilities', 110], ['internet', 70], ['phone', 80], ['groceries', 520], ['eating-out', 300], ['car-insurance', 180], ['car-gas', 160], ['car-upkeep', 60]]);
  await addIncome(k, { type: '1099', basis: 'lumpy', name: 'Design work', amount: 52000 });
  await k.go('session.html#/debt');
  await k.tap('#dq-credit_card');
  for (const [p, v] of [['d-bal-', 4200], ['d-apr-', 24.99], ['d-min-', 120], ['d-day-', 14]]) await k.type('[id^="' + p + '"]', v);
  await addAccounts(k, [['Checking', 1800]]);
  await goals(k, [['goal-emergency', 8000]]);
  // An irregular month: a lump comes in late; the Calendar's Did these happen? marks what landed.
  await k.go('calendar.html');
  k.check(/Cash today/.test(await k.read()), 'the Calendar opens on the three numbers');
  await level2(k, [['cards', 'Each card', 'look it up'], ['work', 'Business structure', 'Not sure']]);
  await k.go('dashboard.html');
  const today = await k.read();
  k.check(/Monthly surplus/.test(today), 'Today shows his numbers');
  await k.go('spending.html');
  k.check(/Add a bank statement/.test(await k.read()), 'Spending opens on importing a statement (he uses statements)');
};

// Four levels down in My numbers, the phone's back to the top, then three undos in a row.
async function navigation(browser) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(BASE + 'ledger.html', { waitUntil: 'networkidle' });
  const start = page.url();
  for (const sel of ['a.go-row[href*="debt"]', '.go-list a.go-row >> nth=0', '.go-list a.go-row >> nth=0', '.row-main >> nth=0']) { await page.locator(sel).first().click(); await page.waitForTimeout(250); }
  const deep = page.url();
  for (let i = 0; i < 3; i++) { await page.goBack(); await page.waitForTimeout(250); }
  check(page.url() === start || page.url() === start.replace(/#.*$/, ''), 'navigation: back reaches the top (' + deep + ' to ' + page.url() + ')');
  // Three changes, then three undos in a row.
  await page.goto(BASE + 'session.html#/needs', { waitUntil: 'networkidle' });
  const before = await page.locator('.step-total').innerText();
  for (const [key, v] of [['groceries', 111], ['phone', 22], ['gym', 33]]) { await page.fill('#n-' + key, String(v)); await page.keyboard.press('Tab'); await page.waitForTimeout(250); }
  // The header's Undo, three taps in a row (inside a typing box, Ctrl+Z is the box's own undo).
  for (let i = 0; i < 3; i++) { await page.locator('header.top button[aria-label^="Undo"]').first().click(); await page.waitForTimeout(250); }
  check(await page.locator('.step-total').innerText() === before, 'navigation: three undos give back the total before (' + before + ')');
  await ctx.close();
}

const b = await playwright.chromium.launch();
const rows = [await session(b, 'maya', maya), await session(b, 'dre', dre)];
await navigation(b);
await b.close();
for (const r of rows) console.log(r.who + ': ' + r.secs + ' s scripted; ' + r.tap + ' taps, ' + r.type + ' typed, ' + r.read + ' read aloud; about ' + r.minutes + ' min at a coach\'s pace' + (r.notes.length ? '\n  needed explaining: ' + r.notes.join('; ') : ''));
console.log(failed ? failed + ' checks failed' : 'Every check passed');
process.exit(failed ? 1 : 0);

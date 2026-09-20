/* ==========================================================================
   test/opening.js — the five-input opening, walked (D-312).
   --------------------------------------------------------------------------
   The brief's quality gates, measured rather than promised: for each of the
   four synthetic households, a fresh browser at 360px types the five inputs
   into rooms/ledger.html#round-1 and the walk counts every tap and every
   box, times it, and checks the answer that appears. Then a reload restores
   every box, and undo and redo work on an input.

     SLAF_BASE=http://127.0.0.1:8765 node test/opening.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright');
const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const EXECUTABLE = '/opt/pw-browsers/chromium';
let passed = 0; const failures = [];
function check(name, ok, detail) { if (ok) { passed++; console.log('  ✓ ' + name); } else { failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? '  (' + detail + ')' : '')); } }

/* The four households the brief names (1.7), as the boxes they type. */
const HOUSEHOLDS = [
  { id: 'a', story: '23, $0 invested, $28k student debt, positive savings', situation: 'employed', age: '23', take: '3800', spend: '3000', inv: '0', cash: '2000', debt: { type: 'student_loan', balance: '28000', rate: '6.5' },
    expect: { head: /FI in about/, state: 'ok', stage: /income and savings rate/ } },
  { id: 'b', story: '28, $150k invested, no debt', situation: 'employed', age: '28', take: '6000', spend: '3500', inv: '150000', cash: '20000', debt: null,
    expect: { head: /FI in about/, state: 'ok', coast: /Age \d+/ } },
  { id: 'c', story: '26, between jobs, $9k cash', situation: 'unemployed', age: '26', take: null, spend: '2500', inv: '0', cash: '9000', debt: null,
    expect: { head: /months of runway/, state: 'noIncome' } },
  { id: 'd', story: '25, spending above take-home', situation: 'employed', age: '25', take: '3000', spend: '3400', inv: '1000', cash: '500', debt: null,
    expect: { head: /No date yet/, state: 'noDate', next: /First:/ } }
];

(async () => {
  const browser = await chromium.launch(require('fs').existsSync(EXECUTABLE) ? { executablePath: EXECUTABLE } : {});
  const timings = [];

  for (const hh of HOUSEHOLDS) {
    console.log('\n(' + hh.id + ') ' + hh.story);
    /* A fresh browser context a household: a new arrival, nothing stored. */
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(BASE + '/rooms/ledger.html#round-1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    errs.length = 0;
    const t0 = Date.now(); let taps = 0, fields = 0;
    const tap = async (sel) => { await page.tap(sel); taps++; await page.waitForTimeout(120); };
    const type = async (sel, v) => { await page.fill(sel, v); await page.dispatchEvent(sel, 'change'); fields++; await page.waitForTimeout(200); };
    await tap('[data-situation="' + hh.situation + '"]');
    await type('#in-age', hh.age);
    if (hh.take !== null) await type('#in-take', hh.take);
    await type('#in-spend', hh.spend);
    await type('#in-inv', hh.inv);
    await type('#in-cash', hh.cash);
    if (hh.debt) {
      await tap('[data-debt="yes"]');
      await page.waitForTimeout(200);
      await page.selectOption('[data-debt-field="type"]', hh.debt.type); taps++;
      await type('[data-debt-field="balance"]', hh.debt.balance);
      await type('[data-debt-field="rate"]', hh.debt.rate);
    } else {
      await tap('[data-debt="no"]');
    }
    await page.waitForTimeout(500);
    const ms = Date.now() - t0;
    timings.push({ id: hh.id, taps, fields, interactions: taps + fields, seconds: Math.round(ms / 100) / 10 });
    const seen = await page.evaluate(() => ({
      head: document.getElementById('op-headline').innerText,
      stage: document.getElementById('op-stage').innerText,
      coast: document.getElementById('op-coast').innerText,
      next: document.getElementById('op-next-big').innerText,
      bands: document.querySelectorAll('#op-band .slaf-band').length,
      levers: document.querySelectorAll('#op-levers li').length,
      wide: document.documentElement.scrollWidth,
      undo: !!document.querySelector('.slaf-undo [data-undo]') && !!document.querySelector('.slaf-undo [data-redo]'),
      /* The five numbers are rough until marked exact; the situation and a
         yes or no are what they are. */
      rough: (function () { const f = SLAF.Spine.getProfile().meta.fields || {}; return ['dob', 'takeHomeMonthly', 'wantsMonthly', 'investments', 'cashSavings', 'debtBalance', 'debtRate'].filter(k => f[k]).every(k => f[k].confidence === 'roughly'); })()
    }));
    check('throws nothing', errs.length === 0, errs[0]);
    check('under twelve taps and boxes: ' + (taps + fields), taps + fields < 12);
    check('under two minutes: ' + Math.round(ms / 1000) + 's', ms < 120000);
    check('the answer: ' + JSON.stringify(seen.head.slice(0, 40)), hh.expect.head.test(seen.head), seen.head);
    if (hh.expect.stage) check('the stage line', hh.expect.stage.test(seen.stage), seen.stage);
    if (hh.expect.coast) check('a coast date', hh.expect.coast.test(seen.coast), seen.coast);
    if (hh.expect.next) check('the next card points at the biggest lever', hh.expect.next.test(seen.next), seen.next);
    if (hh.expect.state === 'ok') check('three ways, three levers', seen.bands === 3 && seen.levers === 3, seen.bands + '/' + seen.levers);
    check('nothing wider than 360px', seen.wide <= 360, String(seen.wide));
    check('undo and redo are mounted', seen.undo);
    check('every write is rough until marked exact', seen.rough);

    /* Reload restores everything. */
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const back = await page.evaluate(() => ({
      age: document.getElementById('in-age').value, take: document.getElementById('in-take').value, spend: document.getElementById('in-spend').value,
      inv: document.getElementById('in-inv').value, cash: document.getElementById('in-cash').value,
      debts: document.querySelectorAll('#op-debts [data-debt-id]').length, head: document.getElementById('op-headline').innerText,
      situation: (document.querySelector('[data-situation][aria-pressed="true"]') || {}).getAttribute && document.querySelector('[data-situation][aria-pressed="true"]').getAttribute('data-situation')
    }));
    const money = (s) => s.replace(/[^\d]/g, '');
    check('reload restores every box', back.age === hh.age && money(back.spend) === hh.spend && money(back.inv) === hh.inv && money(back.cash) === hh.cash && (hh.take === null || money(back.take) === hh.take) && back.debts === (hh.debt ? 1 : 0) && back.situation === hh.situation, JSON.stringify(back));
    check('and the same answer', hh.expect.head.test(back.head), back.head);

    /* Undo and redo on an input: the last write (cash, or the debt rate) comes back. */
    const before = await page.evaluate(() => SLAF.Schema.cashCents(SLAF.Spine.getProfile()).value);
    await type('#in-cash', String(Number(hh.cash) + 100));
    const changed = await page.evaluate(() => SLAF.Schema.cashCents(SLAF.Spine.getProfile()).value);
    await page.tap('.slaf-undo [data-undo]'); await page.waitForTimeout(300);
    const undone = await page.evaluate(() => SLAF.Schema.cashCents(SLAF.Spine.getProfile()).value);
    await page.tap('.slaf-undo [data-redo]'); await page.waitForTimeout(300);
    const redone = await page.evaluate(() => SLAF.Schema.cashCents(SLAF.Spine.getProfile()).value);
    check('undo brings the earlier cash back, redo the later', changed === before + 10000 && undone === before && redone === changed, [before, changed, undone, redone].join('/'));
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + '─'.repeat(66));
  console.log('Walk-through, per household (taps + boxes, seconds, scripted at 360px):');
  timings.forEach(t => console.log('  (' + t.id + ') ' + t.taps + ' taps + ' + t.fields + ' boxes = ' + t.interactions + ' · ' + t.seconds + 's'));
  if (failures.length === 0) { console.log('✓ ' + passed + ' checks passed — the opening answers in under twelve moves'); process.exit(0); }
  console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n');
  failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });

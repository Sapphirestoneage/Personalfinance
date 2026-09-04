#!/usr/bin/env node
/* ==========================================================================
   test/forms.js — typing must survive, and the keyboard must stay up.
   --------------------------------------------------------------------------
   The bug this exists to prevent, reported from a real phone:

     "when I type things don't enter or a keypad doesn't pop up"

   Cause: a room rebuilt its list of inputs on every edit, so tapping from
   one field to the next destroyed the node the tap was headed for. Focus
   was then restored programmatically — which on Android and iOS does NOT
   raise the soft keyboard. The keyboard closed and typing went nowhere.

   The check that catches it: tag every field with a unique attribute, tap
   from one field to another, and assert the tapped node is STILL THE SAME
   NODE afterwards. A replaced node comes back with no tag, which is the
   signature of the failure regardless of how the rebuild was triggered.

   Runs against a mobile emulation with touch, because the failure needs a
   tap — a desktop click resolves too fast to show it, and a programmatic
   .focus() hides it entirely.

   Needs a server on :8765 —  python3 -m http.server 8765
   Run:  node test/forms.js
   ========================================================================== */
'use strict';

let chromium = null, devices = null;
try {
  const pw = require('playwright');
  chromium = pw.chromium; devices = pw.devices;
} catch (e) { /* handled below */ }

const path = require('path');
const ROOT = path.join(__dirname, '..');
const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));

const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const EXECUTABLE = process.env.SLAF_CHROMIUM || '/opt/pw-browsers/chromium';

/* Each case: open the room, make sure the form has at least one row, then
   walk the fields in order, tapping each one and typing into it. */
const CASES = [
  {
    room: '/rooms/debt-payoff.html',
    container: '#debt-list',
    seed: 'empty',
    prepare: async (page) => { await page.tap('#btn-add'); },
    fields: [
      { sel: '#debt-list input[data-field="label"]', type: 'Amex blue business' },
      { sel: '#debt-list input[data-field="balanceCents"]', type: '3200' },
      { sel: '#debt-list input[data-field="rate"]', type: '22.9' },
      { sel: '#debt-list input[data-field="minPaymentCents"]', type: '95' }
    ],
    expect: async (page) => {
      const d = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem('slaf.household.v2')) || {}).debts[0]);
      return [
        ['the name was kept', d.label, 'Amex blue business'],
        ['the balance was kept', d.balanceCents, 320000],
        ['the rate was kept', Math.round(d.rate * 10000) / 10000, 0.229],
        ['the minimum was kept', d.minPaymentCents, 9500]
      ];
    }
  },
  {
    room: '/rooms/net-worth.html',
    container: '#asset-list',
    seed: 'demo',
    prepare: async (page) => { await page.tap('#btn-add'); },
    fields: [
      { sel: '#asset-list input[data-field="label"]', type: 'The car' },
      { sel: '#asset-list input[data-field="valueCents"]', type: '5000' }
    ],
    expect: async (page) => {
      const a = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem('slaf.household.v2')) || {}).assets
          .filter(x => x.category === 'real_estate' || x.category === 'vehicle').pop());
      return [
        ['the name was kept', a.label, 'The car'],
        ['the value was kept', a.valueCents, 500000]
      ];
    }
  },
  {
    room: '/rooms/goals.html',
    container: '#goal-list',
    seed: 'demo',
    prepare: async (page) => {
      await page.tap('#picker [data-template]');
      await page.waitForTimeout(300);
    },
    fields: [
      { sel: '#goal-list input[data-field="name"]', type: 'The wedding', clearFirst: true },
      { sel: '#goal-list input[data-field="savedCents"]', type: '2500' },
      { sel: '#goal-list input[data-field="monthlyContributionCents"]', type: '400' }
    ],
    expect: async (page) => {
      const g = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem('slaf.household.v2')) || {}).goals[0]);
      return [
        ['the name was kept', g.name, 'The wedding'],
        ['the amount saved was kept', g.savedCents, 250000],
        ['the monthly figure was kept', g.monthlyContributionCents, 40000]
      ];
    }
  },
  {
    /* The front page. It is the most input-heavy page in the repo and it is
       hand-built vanilla — the exact place the keyboard bug would come back
       if the build-once rule slipped. */
    room: '/',
    container: '.wrap',
    seed: 'demo',
    fields: [
      { sel: 'input[aria-label="Cash on hand"]', type: '1500' },
      { sel: 'input[aria-label="Highest deductible"]', type: '3000' },
      { sel: 'input[aria-label="You contribute"]', type: '4' },
      { sel: 'input[aria-label="Roth so far this yr"]', type: '0' }
    ],
    expect: async (page) => {
      /* These are page-local, not household data, so read them back off the
         inputs — which is also the check that a re-render did not wipe them. */
      const v = await page.evaluate(() => {
        const g = l => (document.querySelector(`input[aria-label="${l}"]`) || {}).value;
        return { cash: g('Cash on hand'), ded: g('Highest deductible'),
                 pct: g('You contribute'), roth: g('Roth so far this yr') };
      });
      const step1 = await page.evaluate(() =>
        document.body.innerText.includes('$1,500 short of your highest deductible.')
        || document.body.innerText.includes('on hand covers your'));
      return [
        ['cash on hand was kept', v.cash, '1500'],
        ['the deductible was kept', v.ded, '3000'],
        ['the contribution % was kept', v.pct, '4'],
        ['a typed zero survives as zero, not blank', v.roth, '0'],
        ['and step 1 recalculated from what was typed', step1, true]
      ];
    }
  },
  {
    /* Worth It. Free-text, money, and a plain number in one card, plus two
       rating selects in the same container — the densest live form in the
       repo after the front page. */
    room: '/rooms/worth.html',
    container: '#thing-list',
    seed: 'demo',
    prepare: async (page) => { await page.tap('#btn-add'); },
    fields: [
      { sel: '#thing-list input[data-field="label"]', type: 'Exercise bike' },
      { sel: '#thing-list input[data-field="costCents"]', type: '2000' },
      { sel: '#thing-list input[data-field="hoursSpent"]', type: '20' }
    ],
    expect: async (page) => {
      const w = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem('slaf.household.v2')) || {}).worthChecks[0]);
      return [
        ['the name was kept', w.label, 'Exercise bike'],
        ['the price was kept, in cents', w.costCents, 200000],
        ['the hours were kept', w.hoursSpent, 20],
        ['and nothing invented a rating', w.actualRating, null]
      ];
    }
  },
  {
    /* The Windfall stores nothing — every input is page-local. So the check
       is that what you typed is still in the box after the page has
       recomputed around it, which is the failure the guard exists for. */
    room: '/rooms/windfall.html',
    container: '#the-money',
    seed: 'demo',
    fields: [
      { sel: 'input[data-in="amount"]', type: '25000' },
      { sel: 'input[data-in="cashRate"]', type: '4' },
      { sel: 'input[data-in="returnRate"]', type: '6.5', clearFirst: true }
    ],
    expect: async (page) => {
      const v = await page.evaluate(() => {
        const g = k => (document.querySelector(`input[data-in="${k}"]`) || {}).value;
        return { amount: g('amount'), cash: g('cashRate'), ret: g('returnRate'),
                 when: (document.querySelector('#out-when [data-figure]') || {}).textContent };
      });
      return [
        ['the amount was kept and formatted', v.amount, '$25,000'],
        ['the cash rate was kept', v.cash, '4'],
        ['the return assumption was kept', v.ret, '6.5'],
        ['and the threshold followed the cash rate', v.when, 'Below 4.0% a year']
      ];
    }
  },
  {
    room: '/rooms/cash-flow.html',
    container: '#buckets',
    seed: 'demo',
    fields: [
      { sel: '#buckets input[data-cat="housing"]', type: '1500' },
      { sel: '#buckets input[data-cat="groceries"]', type: '450' },
      { sel: '#buckets input[data-cat="dining_out"]', type: '260' }
    ],
    expect: async (page) => {
      const cents = await page.evaluate(() => {
        const h = JSON.parse(localStorage.getItem('slaf.household.v2')) || {};
        const of = id => (h.expenses.entries.filter(e => e.categoryId === id)[0] || {}).amountCents;
        return { housing: of('housing'), groceries: of('groceries'), dining: of('dining_out') };
      });
      return [
        ['housing was kept', cents.housing, 150000],
        ['groceries was kept', cents.groceries, 45000],
        ['eating out was kept', cents.dining, 26000]
      ];
    }
  }
];

/* Rooms whose live controls are selects rather than text fields. A rebuilt
   select loses the tap the same way; there is nothing to type, so the check
   is that the node survives and the choice sticks. */
const SELECT_CASES = [
  {
    room: '/rooms/values.html',
    container: '#assign-list',
    seed: 'spending',
    prepare: async (page) => {
      await page.evaluate(() => SLAF.Spine.updateProfile({ valuesProfile:
        { stated: ['freedom', 'health', 'connection'], assignments: {} } }));
      await page.waitForTimeout(300);
    },
    picks: [
      ['#assign-list select[data-category="housing"]', 'freedom'],
      ['#assign-list select[data-category="groceries"]', 'health'],
      ['#assign-list select[data-category="dining_out"]', 'connection']
    ],
    read: () => JSON.parse(localStorage.getItem('slaf.household.v2')).valuesProfile.assignments
  },
  {
    room: '/rooms/fulfillment.html',
    container: '#rate-list',
    seed: 'spending',
    picks: [
      ['#rate-list select[data-rating-item="housing"]', '6'],
      ['#rate-list select[data-rating-item="groceries"]', '7'],
      ['#rate-list select[data-rating-item="dining_out"]', '9']
    ],
    read: () => JSON.parse(localStorage.getItem('slaf.household.v2')).ratings.joy
  },
  {
    /* The same purchase carries TWO ratings, which is the only place in the
       app where one item does. Tapping from the first straight to the
       second is exactly the sequence a rebuild would eat. */
    room: '/rooms/worth.html',
    container: '#thing-list',
    seed: 'demo',
    prepare: async (page) => { await page.tap('#btn-add'); },
    picks: [
      ['#thing-list select[data-rating-slot="predicted"]', '9'],
      ['#thing-list select[data-rating-slot="actual"]', '2']
    ],
    read: () => {
      const c = JSON.parse(localStorage.getItem('slaf.household.v2')).worthChecks[0];
      return { predicted: c.predictedRating, actual: c.actualRating };
    }
  },
  {
    room: '/rooms/hassle.html',
    container: '#preset-list',
    seed: 'demo',
    picks: [
      ['#preset-list select[data-rating-item="bank_bonus"]', '4'],
      ['#preset-list select[data-rating-item="bill_negotiate"]', '9']
    ],
    read: () => JSON.parse(localStorage.getItem('slaf.household.v2')).ratings.hassle
  }
];

let passed = 0;
const failures = [];
function check(name, actual, expected) {
  if (actual === expected) { passed++; console.log('  ✓ ' + name); return; }
  failures.push(`${name}\n      expected: ${expected}\n      actual:   ${actual}`);
  console.log('  ✗ ' + name + `  (expected ${expected}, got ${actual})`);
}

async function seed(page, kind) {
  await page.evaluate((k) => { localStorage.removeItem('slaf.household.v2'); }, kind);
  if (kind === 'empty') return;
  await page.evaluate((blob) => localStorage.setItem('slaf.household.v2', blob),
    JSON.stringify(Demo.build()));
  if (kind === 'spending') {
    await page.evaluate((entries) => {
      const h = JSON.parse(localStorage.getItem('slaf.household.v2'));
      h.expenses.entries = entries;
      localStorage.setItem('slaf.household.v2', JSON.stringify(h));
    }, Demo.buildSpending());
  }
}

/* Give every control in the container a tag we can look for afterwards. */
async function tagFields(page, container) {
  return page.evaluate((sel) => {
    let n = 0;
    document.querySelectorAll(sel + ' input, ' + sel + ' select').forEach((el) => {
      el.setAttribute('data-livetag', 'live' + (++n));
    });
    return n;
  }, container);
}

(async () => {
  if (!chromium) {
    console.log('SKIPPED — playwright is not installed.\n'
      + '  npm install playwright   (Chromium already lives at /opt/pw-browsers/chromium\n'
      + '  in the dev container; elsewhere: npx playwright install chromium)');
    return;
  }
  let browser;
  try {
    browser = await chromium.launch(require('fs').existsSync(EXECUTABLE)
      ? { executablePath: EXECUTABLE } : {});
  } catch (e) {
    console.log('SKIPPED — could not launch Chromium: ' + e.message);
    process.exit(0);
  }
  try {
    const probe = await browser.newContext(devices['Pixel 7']);
    await (await probe.newPage()).goto(BASE, { timeout: 4000 });
    await probe.close();
  } catch (e) {
    console.log('SKIPPED — nothing serving at ' + BASE
      + '.\n  Start one with: python3 -m http.server 8765');
    await browser.close();
    process.exit(0);
  }

  for (const c of CASES) {
    console.log('\n' + c.room + '  ' + c.container);
    const ctx = await browser.newContext(devices['Pixel 7']);
    ctx.setDefaultTimeout(6000);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try {
    await page.goto(BASE + c.room, { waitUntil: 'networkidle' });
    await seed(page, c.seed);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    if (c.prepare) { await c.prepare(page); await page.waitForTimeout(400); }

    await tagFields(page, c.container);

    for (const f of c.fields) {
      const before = await page.getAttribute(f.sel, 'data-livetag');
      check(`${f.sel.split(' ').pop()} is tagged before the tap`, before !== null, true);
      await page.tap(f.sel);
      await page.waitForTimeout(250);

      const after = await page.evaluate(() => {
        const a = document.activeElement;
        return a && a.getAttribute ? a.getAttribute('data-livetag') : null;
      });
      check(`${f.sel.split(' ').pop()} survives the tap (same node keeps focus)`,
        after, before);

      /* Type the way a person does — one key at a time into whatever the
         browser thinks is focused. */
      if (f.clearFirst) {
        await page.evaluate(() => {
          const a = document.activeElement;
          if (a && a.setSelectionRange) a.setSelectionRange(0, a.value.length);
        });
      }
      await page.keyboard.type(f.type, { delay: 15 });
      await page.waitForTimeout(120);
    }

    /* Leave the form so the deferred rebuild runs. */
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(400);

    for (const [name, actual, expected] of await c.expect(page)) {
      check(name, actual, expected);
    }
    check('no page errors', errs.join('; '), '');
    /* A room that catches its own boot error and turns it into a notice
       shows no console error at all — which is how a page that rendered
       nothing but em dashes passed a clean sweep. Check the notice too. */
    check('no error notice on the page',
      await page.evaluate(() => {
        const n = document.getElementById('load-notice');
        return n && !n.hidden ? n.textContent.trim() : '';
      }), '');
    } catch (err) {
      /* A detached-element timeout IS the bug: the node the tap was headed
         for stopped existing. Report it as a failure rather than crashing. */
      failures.push(`${c.room} — ${String(err.message).split('\n')[0]}`);
      console.log('  ✗ ' + c.room + ' — ' + String(err.message).split('\n')[0]);
    }
    await ctx.close();
  }

  for (const c of SELECT_CASES) {
    console.log('\n' + c.room + '  ' + c.container);
    const ctx = await browser.newContext(devices['Pixel 7']);
    ctx.setDefaultTimeout(6000);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try {
    await page.goto(BASE + c.room, { waitUntil: 'networkidle' });
    await seed(page, c.seed);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    if (c.prepare) { await c.prepare(page); await page.waitForTimeout(400); }

    await tagFields(page, c.container);

    /* The failure is not "the row eventually redraws" — it should, once the
       user has stopped. It is "the redraw lands between one control and the
       next and eats the tap". So change one, then go straight for the next
       the way a finger does, and check the control that was tapped is the
       one that ended up with focus. */
    for (let i = 0; i < c.picks.length; i++) {
      const [sel, value] = c.picks[i];
      const before = await page.getAttribute(sel, 'data-livetag');
      check(`${sel.split(' ').pop()} is tagged before the tap`, before !== null, true);
      await page.tap(sel);
      await page.waitForTimeout(60);
      const focused = await page.evaluate(() => {
        const a = document.activeElement;
        return a && a.getAttribute ? a.getAttribute('data-livetag') : null;
      });
      check(`${sel.split(' ').pop()} survives the tap that reaches it`, focused, before);
      await page.selectOption(sel, value);
      await page.waitForTimeout(60);
    }

    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(400);
    const stored = await page.evaluate(c.read);
    for (const [sel, value] of c.picks) {
      const key = sel.match(/"([^"]+)"/)[1];
      check(`${key} kept its choice`, String(stored[key]), value);
    }
    check('no page errors', errs.join('; '), '');
    } catch (err) {
      failures.push(`${c.room} — ${String(err.message).split('\n')[0]}`);
      console.log('  ✗ ' + c.room + ' — ' + String(err.message).split('\n')[0]);
    }
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + '─'.repeat(66));
  if (failures.length === 0) {
    console.log(`✓ ${passed} checks passed — typing survives in every room`);
    process.exit(0);
  }
  console.log(`✗ ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
})();

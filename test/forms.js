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

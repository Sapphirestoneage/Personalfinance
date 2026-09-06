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

/* A D&D character to seed /dnd/campaign.html with. Built through Schema so the
   room reads it exactly as it reads one the sheet wrote — demo numbers only. */
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const DND_CHARACTER = (() => {
  const h = Schema.createHousehold();
  h.filingStatus = 'single';
  const p = Schema.createPerson({ id: 'dnd_person', role: 'adult' });
  p.incomeSources = [Schema.createIncomeSource({
    id: 'dnd_income', personId: 'dnd_person', grossAnnualIncomeCents: 7200000, type: 'w2' })];
  h.people = [p];
  h.assets = [
    Schema.createAsset({ id: 'dnd_asset_cash', category: 'cash', valueCents: 950000, liquid: true }),
    Schema.createAsset({ id: 'dnd_asset_investments', category: 'investment', valueCents: 4800000, liquid: false })
  ];
  h.debts = [Schema.createDebt({ id: 'dnd_debt_total', balanceCents: 2160000, rate: 0.22, type: 'credit_card' })];
  h.expenses = { monthlyEssential: { estimatedValueCents: 315000, trackedValueCents: null, source: 'estimated' }, entries: [] };
  h.dndProfile = { fixedCostShare: 0.55, yearsSustained: 4, disruptionSurvived: true,
    healthCoverage: 2, automatedSaving: 'most' };
  return h;
})();

const BASE = process.env.SLAF_BASE || 'http://127.0.0.1:8765';
const EXECUTABLE = process.env.SLAF_CHROMIUM || '/opt/pw-browsers/chromium';

/* Each case: open the room, make sure the form has at least one row, then
   walk the fields in order, tapping each one and typing into it. */
const CASES = [
  {
    /* THE CHARACTER SCREEN, which repaints on every answer given to it.
       It holds the optional name box AND the finisher fields, and paintResult()
       runs on each of them. Static markup plus writing .value is what keeps it
       safe (D-034) — the moment anything starts rebuilding that container, a
       finger typing a name loses the keyboard. This is where that shows. */
    room: '/dnd/campaign.html',
    container: '#create-result',
    seed: 'empty',
    prepare: async (page) => {
      for (let i = 0; i < 5; i++) {
        const q = await page.$('#q-options [data-answer]');
        if (!q) break;
        await q.tap();
        await page.waitForTimeout(110);
      }
      const on = await page.$('#btn-qr-next');
      if (on) { await on.tap(); await page.waitForTimeout(200); }
      const pb = await page.$('[data-route="pointBuy"]');
      if (pb) { await pb.tap(); await page.waitForTimeout(220); }
      for (let i = 0; i < 60; i++) {
        const id = await page.evaluate(() => {
          const b = [...document.querySelectorAll('#pb-rows [data-pb="up"]')].find(x => !x.disabled);
          return b ? b.getAttribute('data-abil') : null;
        });
        if (!id) break;
        await page.tap('[data-pb="up"][data-abil="' + id + '"]');
      }
      const next = await page.$('#btn-abil-next');
      if (next) { await next.tap(); await page.waitForTimeout(350); }
      /* A bought character has all six scored, so the finisher stays shut —
         correctly. Open it, because its fields are what this case is for. */
      if (await page.isHidden('#res-finish')) {
        await page.tap('#btn-finish-toggle');
        await page.waitForTimeout(250);
      }
    },
    fields: [
      { sel: '#c-name', type: 'Brenda of Flat 3B' },
      { sel: '#x-income3', type: '44000' },
      { sel: '#x-side', type: '0' }
    ],
    expect: async (page) => {
      const p = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem('dnd.character.v1')) || {}).dndProfile || {});
      return [
        ['the name was kept', p.characterName, 'Brenda of Flat 3B'],
        ['and so was the older income', p.incomeThreeYearsAgoCents, 4400000],
        /* Zero is an answer here, and it has to survive as zero and not blank. */
        ['a typed zero stayed zero', p.sideIncomeAnnualCents, 0]
      ];
    }
  },
  {
    /* The campaign's CREATION step — five money boxes on a phone, typed into
       in order. This is the room's front door now, so it is the one place a
       lost keyboard would cost the most: someone typing their income into a
       node that gets replaced mid-tap never gets the keyboard back, and they
       leave. LIVE-FORM: built once at boot, only .value written after. */
    room: '/dnd/campaign.html',
    container: '#basics-fields',
    seed: 'empty',
    prepare: async (page) => {
      /* The run through opens on five questions now, so the money boxes are
         several taps deeper. Walk in the way a person does — reaching past
         the front of a flow is how a test stops testing the real thing. */
      for (let i = 0; i < 5; i++) {
        const q = await page.$('#q-options [data-answer]');
        if (!q) break;
        await q.tap();
        await page.waitForTimeout(120);
      }
      const next = await page.$('#btn-qr-next');
      if (next) { await next.tap(); await page.waitForTimeout(200); }
      const real = await page.$('[data-route="real"]');
      if (real) { await real.tap(); await page.waitForTimeout(200); }
    },
    fields: [
      { sel: '#c-income', type: '52000' },
      { sel: '#c-expenses', type: '2800' },
      { sel: '#c-cash', type: '6000' },
      { sel: '#c-investments', type: '15000' },
      { sel: '#c-debt', type: '3400' }
    ],
    expect: async (page) => {
      const d = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('dnd.character.v1')) || {});
      const asset = (cat) => (d.assets || []).find(a => a.category === cat) || {};
      return [
        ['income reached the person', d.people[0].incomeSources[0].grossAnnualIncomeCents, 5200000],
        ['spending reached the household', d.expenses.monthlyEssential.estimatedValueCents, 280000],
        ['cash landed as a liquid asset', asset('cash').valueCents, 600000],
        ['investments landed', asset('investment').valueCents, 1500000],
        /* Debt has its own writer; getting it through setMoney would throw. */
        ['debt landed through setDebt', (d.debts || [])[0].balanceCents, 340000],
        ['and the five answers were kept', Object.keys(d.dndProfile.quiz5 || {}).length, 5]
      ];
    }
  },
  {
    /* The D&D sheet puts its inputs INSIDE the sheet that re-renders on every
       keystroke — the exact shape of the bug D-034 exists for. If paint() ever
       starts replacing a node instead of writing to it, this is where it shows
       up: the tapped input comes back untagged. */
    room: '/dnd/sheet.html',
    container: '#sheet-area',
    seed: 'empty',
    fields: [
      { sel: '#f-income', type: '72000' },
      { sel: '#f-expenses', type: '3150' },
      { sel: '#f-cash', type: '9500' },
      { sel: '#f-investments', type: '48000' },
      { sel: '#f-debt', type: '21600' }
    ],
    expect: async (page) => {
      const d = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('dnd.character.v1')) || {});
      const asset = (cat) => (d.assets || []).find(a => a.category === cat) || {};
      return [
        ['income landed on the person', d.people[0].incomeSources[0].grossAnnualIncomeCents, 7200000],
        ['spending landed', d.expenses.monthlyEssential.estimatedValueCents, 315000],
        ['cash landed', asset('cash').valueCents, 950000],
        ['investments landed', asset('investment').valueCents, 4800000],
        ['debt landed', (d.debts || [])[0].balanceCents, 2160000]
      ];
    }
  },
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
    /* The Refresh page: every box opens holding the current figure, and
       typing over it must replace it, not append to it — a phone selects
       nothing on tap, so the case types with clearFirst. */
    room: '/rooms/refresh.html',
    container: '#fields',
    seed: 'demo',
    fields: [
      { sel: 'input[data-field="cashSavings"]', type: '9800', clearFirst: true },
      { sel: 'input[data-field="investments"]', type: '50000', clearFirst: true },
      { sel: 'input[data-field="debtBalance"]', type: '18000', clearFirst: true }
    ],
    expect: async (page) => {
      const h = await page.evaluate(() => JSON.parse(localStorage.getItem('slaf.household.v2')) || {});
      const cash = h.assets.filter(a => a.category === 'cash')[0];
      const inv = h.assets.filter(a => a.category === 'investment')[0];
      return [
        ['cash was rewritten in place', cash.valueCents, 980000],
        ['and there is still exactly one cash record', h.assets.filter(a => a.category === 'cash').length, 1],
        ['investments were rewritten', inv.valueCents, 5000000],
        ['the first debt balance was rewritten', h.debts[0].balanceCents, 1800000],
        ['and cash got a fresh stamp', typeof h.meta.confirmedAt.cashSavings, 'string']
      ];
    }
  },
  {
    room: '/rooms/sleep-at-night.html',
    container: '#coverage',
    seed: 'demo',
    fields: [
      { sel: '#c-oop', type: '8000' },
      { sel: '#c-life', type: '500000' },
      { sel: '#c-disability', type: '3000' }
    ],
    expect: async (page) => {
      const i = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem('slaf.household.v2')) || {}).insurance || {});
      return [
        ['the out-of-pocket maximum was stored', i.oopMaxCents, 800000],
        ['the term life was stored', i.termLifeCents, 50000000],
        ['the disability benefit was stored', i.disabilityMonthlyCents, 300000],
        ['and the deductible from Start Here was left alone', i.highestDeductibleCents, 250000]
      ];
    }
  },
  {
    room: '/rooms/accounts.html',
    container: '#allocation',
    seed: 'demo',
    fields: [
      { sel: '[data-alloc="stocks"]', type: '70' },
      { sel: '[data-alloc="bonds"]', type: '20' },
      { sel: '[data-alloc="cash"]', type: '10' },
      { sel: '[data-alloc="rebalanceBand"]', type: '5' }
    ],
    expect: async (page) => {
      const a = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem('slaf.household.v2')) || {}).allocation || {});
      const read = await page.evaluate(() => document.getElementById('alloc-read').textContent);
      return [
        ['stocks stored as a share of one', a.stocks, 0.7],
        ['bonds too', a.bonds, 0.2],
        ['cash too', a.cash, 0.1],
        ['the band too', a.rebalanceBand, 0.05],
        ['and the read-out names the band', /65%–75%/.test(read), true]
      ];
    }
  },
  {
    room: '/rooms/rerank.html',
    container: '#cost-list',
    seed: 'demo',
    /* Stage 1: a proposed line and a custom one, typed. The lists appear
       once the tables have loaded, so wait for the first line. */
    prepare: async (page) => { await page.waitForSelector('#cost-list .line'); await page.tap('#btn-add'); },
    fields: [
      { sel: '#cost-list input[data-line="rent_or_mortgage"]', type: '1400' },
      { sel: '#cost-list input[data-custom-label]', type: 'Allotment', clearFirst: true },
      { sel: '#cost-list .line.custom input[data-line]', type: '25' }
    ],
    expect: async (page) => {
      const s = await page.evaluate(() => {
        const h = JSON.parse(localStorage.getItem('slaf.household.v2')) || {};
        const of = id => (h.expenses.entries.filter(e => e.id === id)[0] || {});
        const custom = h.expenses.entries.filter(e => e.source === 'rerank' && !/^rr_/.test(e.id))[0] || {};
        return { rent: of('rr_rent_or_mortgage').amountCents, rentSource: of('rr_rent_or_mortgage').source,
          customLabel: custom.descriptor, customCents: custom.amountCents };
      });
      return [
        ['the proposed rent became a line', s.rent, 140000],
        ['with source rerank', s.rentSource, 'rerank'],
        ['the custom line kept its name', s.customLabel, 'Allotment'],
        ['and its amount', s.customCents, 2500]
      ];
    }
  },
  {
    room: '/rooms/rerank.html',
    container: '#rate-list',
    seed: 'spending',
    /* Stages 2-4 on the demo month: the rating and the two selects survive
       the tap; then an arrow on stage 3, and stage 4 shows a figure. */
    prepare: async (page) => { await page.waitForSelector('#rate-list .rate-row'); },
    fields: [
      { sel: '#rate-list select[data-rating-item="housing"]', type: '' },
      { sel: '#rate-list select[data-row="housing"][data-field="miss"]', type: '' },
      { sel: '#rate-list select[data-row="housing"][data-field="who"]', type: '' }
    ],
    expect: async (page) => {
      await page.selectOption('#rate-list select[data-rating-item="housing"]', '7');
      await page.waitForTimeout(500);
      await page.selectOption('#rate-list select[data-row="housing"][data-field="miss"]', 'some');
      await page.waitForTimeout(500);
      await page.tap('#rank-list [data-move="down"]:not([disabled])');
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => {
        const h = JSON.parse(localStorage.getItem('slaf.household.v2')) || {};
        return { joy: (h.ratings.rerank || {}).housing,
          miss: ((h.rerank.rows || []).filter(r => r.id === 'housing')[0] || {}).miss,
          ranked: (h.rerank.rows || []).filter(r => r.valueRank !== null).length,
          gap: document.getElementById('gap-annual').textContent };
      });
      return [
        ['the rating was stored in the one ratings store', s.joy, 7],
        ['would-you-miss-it was stored', s.miss, 'some'],
        ['the arrow wrote a hand order for every rated line', s.ranked, 9],
        ['and stage 4 shows a figure', /\$/.test(s.gap), true]
      ];
    }
  },
  {
    room: '/rooms/what-if-life.html',
    container: '#question-list',
    seed: 'demo',
    prepare: async (page) => { await page.waitForSelector('#question-list input[data-q="months"]'); },
    fields: [
      { sel: '#question-list input[data-q="months"]', type: '4' },
      { sel: '#question-list select[data-q="where"]', type: '' },
      { sel: '#question-list input[data-q="startsOn"]', type: '2' }
    ],
    expect: async (page) => {
      const cols = await page.evaluate(() => document.getElementById('cols').innerText.replace(/\s+/g, ' '));
      return [
        ['three columns rendered', /DREAM.*DEFAULT.*DISASTER/i.test(cols), true],
        ['and nothing was stored', await page.evaluate(() => (JSON.parse(localStorage.getItem('slaf.household.v2')).scenarios || []).length), 0]
      ];
    }
  },
  {
    room: '/rooms/stacker.html',
    container: '#today-list',
    seed: 'spending',
    /* Take the suggestion on, then log a day: the tap lands, the row is
       written, and the figure moves. There is nothing typed here; the
       controls are buttons, and the check is that they survive a tap. */
    prepare: async (page) => {
      await page.waitForSelector('#browse-list .line');
      await page.tap('#btn-next');
      await page.waitForTimeout(300);
      await page.tap('#browse-list [data-equip="cook-dinner"]');
      await page.waitForTimeout(300);
    },
    fields: [],
    expect: async (page) => {
      await page.tap('#today-list [data-log="did"][data-skill="cook-dinner"]');
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => {
        const h = JSON.parse(localStorage.getItem('slaf.household.v2')) || {};
        /* Done lives in the Skill Tree now (D-131); the Stacker record keeps
           only the practice states and who proved it. */
        const tree = (h.skillTree && h.skillTree.state) || {};
        return { on: Object.keys(h.skills).filter(k => ['trial', 'practicing'].includes(h.skills[k].state)).length,
          done: Object.keys(tree).filter(k => tree[k].state === 'done').length,
          byProof: Object.keys(tree).filter(k => tree[k].by === 'proof').length,
          rows: (h.practiceLedger || []).length, cents: (h.practiceLedger || [{}])[0].cents,
          fig: document.getElementById('fig-today').textContent };
      });
      return [
        ['two skills on', s.on, 2],
        ['at least three proven done from the demo, in the tree', s.done >= 3, true],
        ['… and marked as proved by the household, not by hand', s.byProof >= 3, true],
        ['one ledger row', s.rows, 1],
        ['worth 93,600 ÷ 365', s.cents, 256],
        ['and the figure shows it', s.fig, '$2.56']
      ];
    }
  },
  {
    room: '/rooms/start.html',
    container: '#q-unemployed',
    seed: 'demo',
    /* Between jobs: the card appears once the status says so; the tap on
       "Getting it" opens the benefit boxes, and typing into them survives. */
    prepare: async (page) => {
      await page.evaluate(() => {
        const p = SLAF.Schema.primaryPerson(SLAF.Spine.getProfile());
        SLAF.Spine.upsertPerson({ id: p.id, employmentStatus: 'unemployed' });
      });
      await page.goto(page.url().split('#')[0] + '#q-unemployed');
      await page.waitForTimeout(400);
      await page.tap('[data-choices="benefitStatus"] [data-value="receiving"]');
      await page.waitForTimeout(400);
    },
    fields: [
      { sel: '[data-ctl="weekly"]', type: '350' },
      { sel: '[data-ctl="weeks"]', type: '20' },
      { sel: '[data-ctl="severance"]', type: '4000' }
    ],
    expect: async (page) => {
      const u = await page.evaluate(() => SLAF.Schema.unemploymentOf(SLAF.Spine.getProfile()));
      return [
        ['the status was stored', u.benefitStatus, 'receiving'],
        ['the weekly benefit in cents', u.benefitWeeklyCents, 35000],
        ['the weeks left', u.benefitWeeksLeft, 20],
        ['the severance', u.severanceCents, 400000]
      ];
    }
  },
  {
    /* The fine-tune drawer: "one person" opens the ages box; typing into
       it lands as a list of ages. Then a paste, imported as one batch. */
    room: '/rooms/start.html',
    container: '#q-fine-tune',
    seed: 'demo',
    prepare: async (page) => {
      await page.evaluate(() => { document.getElementById('q-fine-tune').open = true; });
      await page.waitForTimeout(200);
      await page.tap('[data-choices="dependents"] [data-value="2"]');
      await page.waitForTimeout(300);
    },
    fields: [
      { sel: '[data-ctl="ages"]', type: '4, 9' },
      { sel: '[data-ctl="secondJob"]', type: '8000' }
    ],
    expect: async (page) => {
      const before = await page.evaluate(() => SLAF.Spine.historySize().undo);
      await page.evaluate(() => { document.getElementById('q-import').open = true; document.getElementById('import-text').value = 'checking 4,120\n401k 31k'; });
      await page.tap('#btn-import');
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => { const S = SLAF; const h = S.Spine.getProfile(); return { deps: JSON.stringify(h.dependents), second: S.Schema.primaryPerson(h).incomeSources.filter(s => s.id === 'intake_second_job').map(s => s.grossAnnualIncomeCents)[0], cash: S.Schema.cashCents(h).value, inv: S.Schema.investmentsCents(h).value, entries: S.Spine.historySize().undo, label: S.Spine.peekUndo().label }; });
      return [
        ['two dependents with the ages typed', r.deps, '[{"age":4},{"age":9}]'],
        ['the second job is a source of its own', r.second, 800000],
        ['the paste set cash', r.cash, 412000],
        ['and investments', r.inv, 3100000],
        ['as one undo entry', r.entries - before, 1],
        ['that says so', r.label, 'Imported 2 numbers']
      ];
    }
  },
  {
    /* The template room (D-097): inputs built once from the spec; typing
       into two of them lands in person.work, each as its own undo entry. */
    room: '/rooms/real-hourly-wage.html',
    container: '#room-inputs',
    seed: 'demo',
    fields: [
      { sel: '[data-ctl="contractedHoursPerWeek"]', type: '35' },
      { sel: '[data-ctl="workCostsMonthlyCents"]', type: '650' }
    ],
    expect: async (page) => {
      const r = await page.evaluate(() => { const S = SLAF; const w = S.Schema.workProfile(S.Schema.primaryPerson(S.Spine.getProfile())); return { hours: w.contractedHoursPerWeek, costs: w.workCostsMonthlyCents, label: S.Spine.peekUndo().label, number: document.getElementById('room-number').innerText }; });
      return [
        ['the paid hours landed', r.hours, 35],
        ['the costs landed, in cents', r.costs, 65000],
        ['the last write is a labelled undo entry', r.label, 'Costs of working, a month → $650'],
        ['and the number is there', r.number.indexOf('/h') !== -1, true]
      ];
    }
  },
  {
    /* Giving (D-098): two boxes, both owned; the target wins over the share. */
    room: '/rooms/giving.html',
    container: '#room-inputs',
    seed: 'demo',
    fields: [
      { sel: '[data-ctl="pctOfIncome"]', type: '5' },
      { sel: '[data-ctl="annualTargetCents"]', type: '1200' }
    ],
    expect: async (page) => {
      const r = await page.evaluate(() => { const S = SLAF; const g = S.Spine.getProfile().giving; return { pct: g.pctOfIncome, target: g.annualTargetCents, number: document.getElementById('room-number').innerText }; });
      return [
        ['the share landed as a ratio', r.pct, 0.05],
        ['the target landed, in cents', r.target, 120000],
        ['and the number is the target with the share worked back', r.number.indexOf('$1,200') !== -1 && r.number.indexOf('1.7%') !== -1, true]
      ];
    }
  },
  {
    /* Between Jobs (D-098): the two owned boxes land on person.unemployment. */
    room: '/rooms/between-jobs.html',
    container: '#room-inputs',
    seed: 'demo',
    prepare: async (page) => {
      await page.evaluate(() => {
        const p = SLAF.Schema.primaryPerson(SLAF.Spine.getProfile());
        SLAF.Spine.upsertPerson({ id: p.id, employmentStatus: 'unemployed', unemployment: { since: '2026-07-01', benefitStatus: 'receiving', benefitWeeklyCents: 35000, benefitWeeksLeft: 12, severanceCents: 400000 } });
      });
      await page.waitForTimeout(400);
    },
    fields: [
      { sel: '[data-ctl="expectedSearchMonths"]', type: '6' },
      { sel: '[data-ctl="floorMonthlyCents"]', type: '2500' }
    ],
    expect: async (page) => {
      const u = await page.evaluate(() => SLAF.Schema.unemploymentOf(SLAF.Spine.getProfile()));
      return [
        ['the expected search landed', u.expectedSearchMonths, 6],
        ['the floor landed, in cents', u.floorMonthlyCents, 250000],
        ['the rest of the card survived', u.severanceCents, 400000]
      ];
    }
  },
  {
    /* Protection (D-098): a select and a money box, the room's own two. */
    room: '/rooms/protection.html',
    container: '#room-inputs',
    seed: 'demo',
    prepare: async (page) => { await page.selectOption('[data-ctl="healthType"]', 'employer'); await page.waitForTimeout(300); },
    fields: [
      { sel: '[data-ctl="healthMonthly"]', type: '350' }
    ],
    expect: async (page) => {
      const h = await page.evaluate(() => SLAF.Spine.getProfile().insurance.health);
      return [
        ['the monthly cost landed, in cents', h.monthlyCents, 35000],
        ['and the kind chosen landed', h.type, 'employer']
      ];
    }
  },
  {
    room: '/rooms/fire.html',
    container: '#targets',
    seed: 'demo',
    fields: [
      { sel: '#t-retire', type: '55' },
      { sel: '#t-coast', type: '60' }
    ],
    expect: async (page) => {
      const t = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem('slaf.household.v2')) || {}).targets || {});
      return [
        ['the stop age was stored', t.retireAge, 55],
        ['the coast age was stored', t.coastAge, 60]
      ];
    }
  },
  {
    room: '/rooms/statement.html',
    container: '#asset-list',
    seed: 'demo',
    prepare: async (page) => { await page.tap('#btn-add'); },
    fields: [
      /* The first cards are Start Here's cash and investments, whose names
         and values are read-only here; the tap on #btn-add appends ours. */
      { sel: '#asset-list .asset:last-child input[data-field="label"]', type: 'The car' },
      { sel: '#asset-list .asset:last-child input[data-field="valueCents"]', type: '5000' }
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
    /* The Timeline's period list. This is the room where a rebuilt container
       would hurt most: you type a name, then an amount, then a start date,
       and every write changes the data the list is drawn from — so if the
       LiveForm guard were not doing its job the keyboard would close between
       every field. D-034, D-152. */
    room: '/rooms/timeline.html',
    container: '#period-list',
    seed: 'demo',
    prepare: async (page) => { await page.tap('#btn-add'); await page.waitForTimeout(200); },
    fields: [
      { sel: '#period-list .asset:last-child input[data-field="label"]', type: 'The new job', clearFirst: true },
      { sel: '#period-list .asset:last-child input[data-field="monthlyCents"]', type: '4200' },
      { sel: '#period-list .asset:last-child input[data-field="startsAtAge"]', type: '40' }
    ],
    expect: async (page) => {
      const f = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem('slaf.household.v2')) || {}).futureIncome.pop());
      return [
        ['the name was kept', f.label, 'The new job'],
        ['the amount was kept as cents', f.monthlyCents, 420000],
        ['the age was kept', f.startsAtAge, 40],
        ['and the kind the Add button set', f.kind, 'job']
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
    room: '/rooms/foo-ladder.html',
    container: '.wrap',
    seed: 'demo',
    prepare: async (page) => {
      /* The deductible is a stored fact now, owned by Sleep At Night. Give
         the household one so step 1 has both halves. D-052. */
      await page.evaluate(() => {
        const h = JSON.parse(localStorage.getItem('slaf.household.v2'));
        h.insurance = { highestDeductibleCents: 300000 };
        localStorage.setItem('slaf.household.v2', JSON.stringify(h));
      });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
    },
    /* The ladder used to collect the deductible, contribution %, Roth and
       HSA itself and forget them all. Those are facts, owned by Where It
       Goes and Sleep At Night now, so what is left here is genuinely local
       to the plan. D-052. */
    fields: [
      { sel: 'input[aria-label="Prepaid goal"]', type: '20000' },
      { sel: 'input[aria-label="Saved toward it"]', type: '0' }
    ],
    expect: async (page) => {
      /* These are page-local, not household data, so read them back off the
         inputs — which is also the check that a re-render did not wipe them. */
      const v = await page.evaluate(() => {
        const g = l => (document.querySelector(`input[aria-label="${l}"]`) || {}).value;
        return { goal: g('Prepaid goal'), saved: g('Saved toward it'),
                 borrowedDeductible: Array.from(document.querySelectorAll('.slaf-label'))
                   .some(l => l.textContent === 'Highest deductible') };
      });
      /* Step 1 measures the SAME cash & savings balance step 4 does — there
         is no separate "cash on hand" input any more, because two boxes for
         one pot of money let them contradict each other. D-049. */
      const step1 = await page.evaluate(() =>
        document.body.innerText.includes('in cash & savings covers your')
        || document.body.innerText.includes('in cash & savings.'));
      const oneCashRow = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.slaf-label'))
          .filter(l => /cash/i.test(l.textContent)).length);
      return [
        ['the prepaid goal was kept', v.goal, '20000'],
        ['a typed zero survives as zero, not blank', v.saved, '0'],
        ['the deductible is borrowed, not asked for again', v.borrowedDeductible, true],
        ['step 1 reads the shared cash balance', step1, true],
        ['and there is exactly one cash row on the page', oneCashRow, 1]
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
    /* What A Car Costs stores nothing at all — every box is page state,
       because a car someone is considering is a what-if, not a fact about
       them (D-052). So the check is that what was typed is still in the box
       after the room has recomputed around it, and that the household is
       untouched. */
    room: '/rooms/car.html',
    container: '#room-inputs',
    seed: 'demo',
    fields: [
      { sel: '[data-ctl="price"]', type: '30000' },
      { sel: '[data-ctl="down"]', type: '6000' },
      { sel: '[data-ctl="rate"]', type: '6' }
    ],
    expect: async (page) => {
      const v = await page.evaluate(() => {
        const g = k => (document.querySelector(`[data-ctl="${k}"]`) || {}).value;
        return { price: g('price'), down: g('down'), rate: g('rate'),
                 undo: SLAF.Spine.historySize().undo,
                 number: document.getElementById('room-number').innerText,
                 verdict: document.getElementById('loan-verdict').textContent };
      });
      return [
        ['the price was kept and formatted', v.price, '$30,000'],
        ['the deposit was kept', v.down, '$6,000'],
        ['the rate was kept', v.rate, '6'],
        ['and nothing reached the household', v.undo, 0],
        /* $30,000 still worth 0.60 of it after three years is $18,000. */
        ['the loss follows from the price', v.number.indexOf('$12,000') !== -1, true],
        ['and no term is assumed for you', v.verdict, 'Pick how long the loan runs.']
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
    /* The Runway. Its two borrowed figures arrive prefilled from the
       household, so this also checks that typing over a prefilled field
       survives — the case where a repaint would put the old value back. */
    room: '/rooms/runway.html',
    container: '#the-plan',
    seed: 'demo',
    fields: [
      { sel: 'input[data-in="cushion"]', type: '20000', clearFirst: true },
      { sel: 'input[data-in="cut"]', type: '300' },
      { sel: 'input[data-in="severance"]', type: '8000' }
    ],
    expect: async (page) => {
      const v = await page.evaluate(() => {
        const g = k => (document.querySelector(`input[data-in="${k}"]`) || {}).value;
        return { cushion: g('cushion'), cut: g('cut'), sev: g('severance'),
                 runway: (document.querySelector('#out-runway [data-figure]') || {}).textContent };
      });
      return [
        ['the cushion override was kept', v.cushion, '$20,000'],
        ['the cut was kept', v.cut, '$300'],
        ['the payout was kept', v.sev, '$8,000'],
        /* $28,000 against $3,150 − $300 = $2,850 a month is 9 whole months. */
        ['and the runway followed from them', v.runway, '9 months']
      ];
    }
  },
  {
    /* Start Here, landing on a question that ALREADY has an answer.
       This is the bug a person reported as "it resets everything I enter":
       the question auto-focused and select()'d the saved figure, so the
       first keystroke replaced all of it. On a phone the keyboard covers
       the field and you never see the selection before it is gone. */
    room: '/rooms/start.html',
    container: '#q-income',
    seed: 'demo',
    prepare: async (page) => {
      /* Land on the income question with its answer already saved. */
      await page.evaluate(() => { location.hash = '#q-income'; });
      await page.waitForTimeout(400);
    },
    fields: [
      { sel: '#q-income input[data-ctl="pay"]', type: '1' }
    ],
    expect: async (page) => {
      const v = await page.evaluate(() => {
        const n = document.querySelector('#q-income input[data-ctl="pay"]');
        return { value: n.value, settled: !n.hasAttribute('data-suggested') };
      });
      const stored = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('slaf.household.v2')).people[0]
          .incomeSources[0].grossAnnualIncomeCents);
      return [
        /* $72,000 with a 1 typed into it, NOT a bare "1". The exact digits
           depend on where the caret landed; what matters is that the saved
           figure is still in there. */
        ['the saved answer was not wiped by typing', v.value.replace(/[^0-9]/g, '').replace('1', '') === '72000', true],
        ['and the new keystroke landed too', v.value.replace(/[^0-9]/g, '').length > 5, true],
        ['it saved on blur without a Next tap', stored > 0, true],
        ['and the field settles again afterwards', v.settled, true]
      ];
    }
  },
  {
    /* The pay-basis row and the job list live in the same card as a live
       text input, and the list is rebuilt whenever a rate changes — exactly
       the shape that eats a tap if it is not guarded. */
    room: '/rooms/start.html',
    container: '#q-income',
    seed: 'empty',
    prepare: async (page) => {
      /* An empty spine has no situation, so no cards: pick one first. */
      await page.tap('[data-situation="employed"]');
      await page.waitForTimeout(400);
      await page.evaluate(() => { location.hash = '#q-income'; });
      await page.waitForTimeout(300);
      await page.selectOption('[data-ctl="basis"]', 'hourly');
      await page.waitForTimeout(300);
    },
    fields: [
      { sel: '#q-income input[data-ctl="pay"]', type: '26' },
      { sel: '#q-income input[data-ctl="hours"]', type: '40' }
    ],
    expect: async (page) => {
      const src = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('slaf.household.v2')).people[0].incomeSources[0]);
      const out = await page.evaluate(() => document.querySelector('#q-income [data-note="pay"]').innerText);
      return [
        ['the hourly rate was kept, in cents', src.rateCents, 2600],
        ['the hours were kept', src.hoursPerWeek, 40],
        ['the basis was kept', src.frequency, 'hourly'],
        /* 26 x 40 x 48 paid weeks */
        ['and it became a year', src.grossAnnualIncomeCents, 4992000],
        ['which the page states', out.indexOf('$49,920') !== -1, true]
      ];
    }
  },
  {
    /* The 401(k) card opens with the match boxes holding a SUGGESTION
       (D-060) and a chip beside them. Tapping from a suggested box into
       the next one, typing over the proposal, must land — and the chip
       coming and going must not move anything under the finger. */
    room: '/rooms/start.html',
    container: '#q-plan',
    seed: 'demo',
    prepare: async (page) => {
      /* Clear the demo's match so the suggestion shows. */
      await page.evaluate(() => {
        const h = JSON.parse(localStorage.getItem('slaf.household.v2'));
        h.people[0].incomeSources[0].employerMatch = { matchPercent: null, matchCapPercentOfSalary: null };
        h.retirement.contributionPercent = null;
        localStorage.setItem('slaf.household.v2', JSON.stringify(h));
        location.hash = '#q-plan';
      });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
    },
    fields: [
      { sel: '#q-plan input[data-ctl="matchPercent"]', type: '100' },
      { sel: '#q-plan input[data-ctl="matchCap"]', type: '4' },
      { sel: '#q-plan input[data-ctl="contribution"]', type: '5' }
    ],
    expect: async (page) => {
      const h = await page.evaluate(() => JSON.parse(localStorage.getItem('slaf.household.v2')));
      const m = h.people[0].incomeSources[0].employerMatch;
      const suggestedBefore = await page.evaluate(() => document.querySelectorAll('#q-plan [data-suggested]').length);
      return [
        ['the typed match replaced the suggestion', m.matchPercent, 1],
        ['and the cap', Math.round(m.matchCapPercentOfSalary * 100), 4],
        ['and the contribution was kept', h.retirement.contributionPercent, 5],
        ['nothing is still only suggested', suggestedBefore, 0]
      ];
    }
  },
  {
    /* The Income room's entry form: built once, saved on a tap. */
    room: '/rooms/income.html',
    container: '#add-form',
    seed: 'demo',
    fields: [
      { sel: '#f-label', type: 'Day job' },
      { sel: '#f-amount', type: '2400' }
    ],
    expect: async (page) => {
      await page.selectOption('#f-frequency', 'fortnightly');
      await page.tap('#btn-save');
      await page.waitForTimeout(300);
      const e = await page.evaluate(() => ((JSON.parse(localStorage.getItem('slaf.household.v2')) || {}).ledger || {}).income[0]);
      const listed = await page.evaluate(() => document.querySelectorAll('#entries li').length);
      return [
        ['the entry was saved', e && e.label, 'Day job'],
        ['with its amount', e && e.amountCents, 240000],
        ['every two weeks', e && e.frequency, 'fortnightly'],
        ['and is listed at once', listed, 1]
      ];
    }
  },
  {
    /* The expense log's form on the same page: built once, saved on a tap. */
    room: '/rooms/cash-flow.html',
    container: '#log-form',
    seed: 'demo',
    fields: [
      { sel: '#l-amount', type: '64.20' },
      { sel: '#l-note', type: 'Trader Joes' }
    ],
    expect: async (page) => {
      await page.tap('#btn-log');
      await page.waitForTimeout(300);
      const e = await page.evaluate(() => (JSON.parse(localStorage.getItem('slaf.household.v2')) || {}).expenses.entries.filter(x => x.source === 'log')[0]);
      return [
        ['the receipt was logged', e && e.amountCents, 6420],
        ['with its note', e && e.descriptor, 'Trader Joes'],
        ['as a personal expense', e && e.linkedIncomeId, null],
        ['and not deductible', e && e.deductible, false]
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
  },
  {
    /* The Account You Left Behind. Two boxes on the template that are
       deliberately NOT owned by anybody: an old plan's balance and the age
       you turned in the year you left. Both are what-ifs, so as well as the
       usual "did the tapped node survive", this asserts the opposite of
       every other case here — that nothing reached the household (D-052).
       The pinned $14,500 is the demo persona's cash-out cost: $8,800 federal
       at 22%, $1,700 North Carolina at 4.25%, $4,000 penalty on $40,000. */
    room: '/rooms/rollover.html',
    container: '#room-inputs',
    seed: 'demo',
    fields: [
      { sel: '[data-ctl="balance"]', type: '40000' },
      { sel: '[data-ctl="leftAtAge"]', type: '56' }
    ],
    expect: async (page) => {
      const r = await page.evaluate(() => ({
        number: document.getElementById('room-number').innerText,
        rows: document.getElementById('cost-rows').innerText,
        blob: localStorage.getItem('slaf.household.v2') || ''
      }));
      const undo = (JSON.parse(r.blob).meta.undoStack || []).map(e => e.label).join(' | ');
      return [
        ['the cash-out cost is worked out', r.number.indexOf('$14,500') !== -1, true],
        ['the 20% withheld is shown apart from it', r.rows.indexOf('$8,000') !== -1, true],
        ['and what the balance would have been, left alone', r.rows.indexOf('left alone') !== -1, true],
        ['the what-if balance reached no stored field', r.blob.indexOf('4000000') !== -1, false],
        ['and left no undo entry behind', /old plan|year you left/.test(undo), false]
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
    /* Switching scenario toggles whole field groups. If that were done by
       rebuilding the card instead of toggling [hidden], the very next tap
       would land on a node that no longer exists. */
    room: '/rooms/runway.html',
    container: '#the-plan',
    seed: 'demo',
    picks: [
      ['select[data-in="preset"]', 'business'],
      ['select[data-in="rampShape"]', 'hockey']
    ],
    read: () => ({
      preset: document.querySelector('select[data-in="preset"]').value,
      rampShape: document.querySelector('select[data-in="rampShape"]').value
    })
  },
  {
    /* The campaign's prologue. Its two selects are built once at boot and only
       ever read (D-034) — every other view in the room is rebuilt freely, which
       is safe precisely because none of them holds an input. If the prologue
       ever starts being re-rendered alongside them, the tapped select comes
       back untagged and this is where it shows. */
    room: '/dnd/campaign.html',
    container: '#pro-questions',
    seed: 'empty',
    prepare: async (page) => {
      await page.evaluate((blob) => localStorage.setItem('dnd.character.v1', blob),
        JSON.stringify(DND_CHARACTER));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      /* The prologue is now the LAST screen of a five-phase run through, so a
         seeded character still has to be walked all the way to it. */
      for (let i = 0; i < 5; i++) {
        const q = await page.$('#q-options [data-answer]');
        if (!q) break;
        await q.tap();
        await page.waitForTimeout(120);
      }
      const toMethod = await page.$('#btn-qr-next');
      if (toMethod) { await toMethod.tap(); await page.waitForTimeout(200); }
      const real = await page.$('[data-route="real"]');
      if (real) { await real.tap(); await page.waitForTimeout(200); }
      const onward = await page.$('#btn-basics-next');
      if (onward) { await onward.tap(); await page.waitForTimeout(200); }
      for (let i = 0; i < 60; i++) {
        const id = await page.evaluate(() => {
          const b = [...document.querySelectorAll('#pb-rows [data-pb="up"]')].find(x => !x.disabled);
          return b ? b.getAttribute('data-abil') : null;
        });
        if (!id) break;
        await page.tap('[data-pb="up"][data-abil="' + id + '"]');
      }
      const toStats = await page.$('#btn-abil-next');
      if (toStats) { await toStats.tap(); await page.waitForTimeout(300); }
      const toImprove = await page.$('#btn-result-next');
      if (toImprove) { await toImprove.tap(); await page.waitForTimeout(250); }
      const toFocus = await page.$('#btn-improve-next');
      if (toFocus) { await toFocus.tap(); await page.waitForTimeout(250); }
      const anyStat = await page.$('#btn-focus-any');
      if (anyStat) { await anyStat.tap(); await page.waitForTimeout(300); }
    },
    picks: [
      ['#q-match', 'half6'],
      ['#q-capturing', 'no']
    ],
    read: () => ({
      'q-match': document.querySelector('#q-match').value,
      'q-capturing': document.querySelector('#q-capturing').value,
      /* Answering both is what unlocks the button — a placement it can act on. */
      canBegin: document.querySelector('#btn-begin').disabled === false
    }),
    also: (stored) => [['answering both unlocks the campaign', stored.canBegin, true]]
  },
  {
    /* What A Car Costs. The term select has no default on purpose (the term
       is the leg of 20/3/8 a monthly payment hides), so this also checks that
       choosing one lands and the room notices. */
    room: '/rooms/car.html',
    container: '#room-inputs',
    seed: 'demo',
    picks: [
      ['select[data-ctl="term"]', '60']
    ],
    read: () => ({
      term: document.querySelector('select[data-ctl="term"]').value,
      verdict: document.getElementById('loan-verdict').textContent
    }),
    also: (stored) => [['picking a term stops the room asking for one',
      stored.verdict.indexOf('Pick how long') === -1, true]]
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
      /* The key is the quoted part of a [data-…="x"] selector, or the id when
         the control is addressed by one. */
      const m = sel.match(/"([^"]+)"/) || sel.match(/#([\w-]+)$/);
      const key = m[1];
      check(`${key} kept its choice`, String(stored[key]), value);
    }
    /* Anything else the room should be true of once the picks have landed. */
    if (c.also) { for (const [name, actual, expected] of c.also(stored)) check(name, actual, expected); }
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

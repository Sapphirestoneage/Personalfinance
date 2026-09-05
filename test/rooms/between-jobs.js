/* ==========================================================================
   test/rooms/between-jobs.js — the runway against the search, by hand.
   --------------------------------------------------------------------------
   The household: single, NC, no debt; between jobs since July 2026,
   receiving $350 a week with 12 weeks left, $4,000 severance in hand,
   $6,000 cash, $3,000 a month going out. Every figure below is worked
   longhand, never copied from the engine.

     benefit a month   350 × 52 ÷ 12 = 1,516.67 → 151,667 cents
     benefit months    12 ÷ (52 ÷ 12) = 2.77 → 2.8 → rounds to 3
     start             6,000 + 4,000 = 10,000
     month 1           10,000 + 1,516.67 − 3,000 = 8,516.67
     month 2           8,516.67 + 1,516.67 − 3,000 = 7,033.34
     month 3           7,033.34 + 1,516.67 − 3,000 = 5,550.01
     month 4           5,550.01 − 3,000 = 2,550.01
     month 5           2,550.01 − 3,000 = −449.99   → runs out in month 5
     runway            4 months = 4 × 30.4375 = 121.75 → 122 days
     the floor         70% of 3,000 = 2,100
     floor months      10,000 → 9,416.67 → 8,833.34 → 8,250.01 → 6,150.01
                       → 4,050.01 → 1,950.01 → −149.99  → 6 months
   ========================================================================== */
'use strict';

module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Registry, Ownership, Gate, Runway, TABLES } = t;
  const BetweenJobs = require(path.join(ROOT, 'engines/betweenjobs.js'));
  const NOW = new Date(2026, 8, 5).getTime();   /* 5 September 2026, local */

  function household(over) {
    const u = Object.assign({ since: '2026-07-01', benefitStatus: 'receiving', benefitWeeklyCents: 35000, benefitWeeksLeft: 12, severanceCents: 400000 }, (over && over.unemployment) || {});
    const h = Schema.createHousehold({ state: 'NC', filingStatus: 'single', meta: { hasDebt: false },
      people: [Schema.createPerson({ id: 'you', role: 'adult', employmentStatus: 'unemployed', dob: '1990-06-01', unemployment: u })],
      assets: [Schema.createAsset({ category: 'cash', valueCents: (over && over.cash) !== undefined ? over.cash : 600000 })] });
    h.expenses.monthlyEssential.estimatedValueCents = (over && over.spend) !== undefined ? over.spend : 300000;
    return h;
  }

  section('Between Jobs — the runway against the search, by hand');

  /* -- The household above ------------------------------------------------ */
  {
    const h = household();
    check('the benefit a month is 350 × 52 ÷ 12', Schema.benefitMonthlyCents(h).value, 151667);
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    checkTrue('the plan is ok', Money.isOk(p), p.reason);
    check('month 1: 10,000 + 1,516.67 − 3,000', p.base.rows[0].balanceCents, 851667);
    check('month 2', p.base.rows[1].balanceCents, 703334);
    check('month 3: the last month the benefit pays', p.base.rows[2].balanceCents, 555001);
    check('month 4: spending alone', p.base.rows[3].balanceCents, 255001);
    check('month 5: below zero', p.base.rows[4].balanceCents, -44999);
    check('the runway is 4 whole months', p.runwayMonths, 4);
    check('which is 122 days at 365.25 ÷ 12 a month', p.value, 122);
    checkTrue('not sustainable', !p.sustainable);
    check('the cash runs out on the same day of the month, four months on', p.cashOutDate, '2027-01-05');
    check('the benefit is counted', p.benefit.state, 'counted');
    check('for 3 months', p.benefit.months, 3);
    check('and ends 12 weeks from now', p.benefitEndDate, '2026-11-28');
    check('no floor typed: 70% of spending stands in', p.floorCents, 210000);
    check('and says so', p.floorSource, 'convention');
    check('the floor run lasts 6 months', p.floorRunwayMonths, 6);
    check('month 7 at the floor is below zero', p.floorRun.rows[6].balanceCents, -14999);
    check('two months gained at the floor', p.floorGainMonths, 2);
    check('no search typed: the typical one stands in', p.expectedSource, 'typical');
    check('at the table median', p.expectedSearchMonths, TABLES.reentryGap.medianMonths);
    check('4 − 2.3 = 1.7 months to spare', p.gapMonths, 1.7);
    check('which is good', p.zone, 'good');
    check('severance is counted', p.startingCents, 1000000);
    check('no other income', p.other.basis, 'none');
    check('the same days as the dashboard lead', t.Instruments.compute(h, TABLES, NOW).byId.runwayDays.result.value, p.value);
  }

  /* -- Typed inputs win over the stand-ins --------------------------------- */
  {
    const h = household({ unemployment: { expectedSearchMonths: 6, floorMonthlyCents: 250000 } });
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    check('the search typed is the one compared', p.expectedSearchMonths, 6);
    check('and is yours', p.expectedSource, 'yours');
    check('4 − 6: short by 2 months', p.gapMonths, -2);
    check('which is out', p.zone, 'out');
    check('the floor typed is the one run', p.floorCents, 250000);
    check('and is yours', p.floorSource, 'yours');
    /* 10,000 → 9,016.67 → 8,033.34 → 7,050.01 → 4,550.01 → 2,050.01 → −449.99 */
    check('at 2,500 the floor run lasts 5 months', p.floorRunwayMonths, 5);
  }
  {
    const h = household({ unemployment: { expectedSearchMonths: 3.5 } });
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    check('4 − 3.5: half a month to spare is watch', p.zone, 'watch');
    check('gap 0.5', p.gapMonths, 0.5);
  }

  /* -- No benefit: not applied or ineligible is zero, said plainly --------- */
  ['notApplied', 'ineligible'].forEach(function (status) {
    const h = household({ unemployment: { benefitStatus: status, benefitWeeklyCents: null, benefitWeeksLeft: null } });
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    check(status + ': the benefit state is none', p.benefit.state, 'none');
    check(status + ': nothing a month', p.benefit.monthlyCents, 0);
    /* 10,000 → 7,000 → 4,000 → 1,000 → −2,000 */
    check(status + ': three months on cash and severance', p.runwayMonths, 3);
    check(status + ': no benefit end date', p.benefitEndDate, null);
  });
  {
    const h = household({ unemployment: { benefitStatus: 'receiving', benefitWeeklyCents: 35000, benefitWeeksLeft: null } });
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    check('receiving with no weeks left typed: not counted, and says why', p.benefit.state, 'noWeeks');
    check('so the runway is on cash and severance alone', p.runwayMonths, 3);
  }
  {
    const h = household({ unemployment: { benefitStatus: null } });
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    check('status not asked: unknown, not zero', p.benefit.state, 'unknown');
    checkTrue('with the schema’s reason', /whether/.test(p.benefit.reason));
  }

  /* -- No severance ---------------------------------------------------------- */
  {
    const h = household({ unemployment: { severanceCents: null } });
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    check('starts on cash alone', p.startingCents, 600000);
    /* 6,000 → 4,516.67 → 3,033.34 → 1,550.01 → −1,449.99 */
    check('three months', p.runwayMonths, 3);
    check('severance is zero, not missing', p.severanceCents, 0);
  }

  /* -- A partner's pay: Runway is handed it, and it can make the month ------ */
  {
    const h = household();
    h.people.push(Schema.createPerson({ id: 'partner', role: 'adult', employmentStatus: 'employed',
      incomeSources: [Schema.createIncomeSource({ id: 'ps', personId: 'partner', type: 'w2', grossAnnualIncomeCents: 6000000 })] }));
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    check('the partner’s pay is after tax', p.other.basis, 'takeHome');
    const partnerOnly = Object.assign({}, h, { people: [h.people[1]] });
    const take = t.Tier0.takeHomeMonthlyCents(partnerOnly, TABLES);
    check('and is Tier0’s take-home on the partner alone', p.other.cents, take.value);
    checkTrue('the person between jobs is not in that figure', take.grossAnnualIncomeCents === 6000000);
    checkTrue('$60,000 after tax covers $3,000 a month', p.other.cents > 300000);
    checkTrue('so the runway is sustainable', p.sustainable);
    check('at the horizon', p.runwayMonths, Runway.HORIZON_MONTHS);
    check('no cash-out date', p.cashOutDate, null);
    check('no gap to speak of', p.gapMonths, null);
    check('and the zone is good', p.zone, 'good');
    check('Runway was handed the partner’s income', p.base.otherMonthlyIncomeCents, take.value);
  }
  {
    const h = household();
    h.filingStatus = null;
    h.people.push(Schema.createPerson({ id: 'partner', role: 'adult', employmentStatus: 'employed',
      incomeSources: [Schema.createIncomeSource({ id: 'ps', personId: 'partner', type: 'w2', grossAnnualIncomeCents: 2400000 })] }));
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    check('no filing status: the partner’s pay counts before tax, and says so', p.other.basis, 'gross');
    check('2,000 a month', p.other.cents, 200000);
    /* 10,000 + 1,516.67 + 2,000 − 3,000 each of months 1–3, then +2,000 − 3,000 */
    check('month 1', p.base.rows[0].balanceCents, 1051667);
    check('month 3', p.base.rows[2].balanceCents, 1155001);
    /* then −1,000 a month: 11,550.01 lasts 11 more months → runway 14 */
    check('the runway is 14 months', p.runwayMonths, 14);
  }

  /* -- Sustainable on the benefit alone ------------------------------------ */
  {
    const h = household({ spend: 150000 });
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    /* the benefit 1,516.67 covers 1,500 a month for 3 months, then −1,500 a month
       from 10,050.01: months 4–9 stay above zero (10,050 − 6 × 1,500 = 1,050),
       month 10 goes under */
    check('not sustainable once the benefit stops', p.sustainable, false);
    check('nine months', p.runwayMonths, 9);
  }

  /* -- The search longer than the runway ----------------------------------- */
  {
    const h = household({ unemployment: { expectedSearchMonths: 12 } });
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    check('short by 8', p.gapMonths, -8);
    check('out', p.zone, 'out');
  }

  /* -- The floor equal to spending: no gain -------------------------------- */
  {
    const h = household({ unemployment: { floorMonthlyCents: 300000 } });
    const p = BetweenJobs.plan(h, TABLES, { now: NOW });
    check('the floor run is the same run', p.floorRunwayMonths, p.runwayMonths);
    check('nothing gained', p.floorGainMonths, 0);
    checkTrue('and it is flagged', p.floorAtOrAboveSpending);
  }

  /* -- Empty household: says why, never throws ------------------------------ */
  {
    const empty = Schema.createHousehold({});
    let p = null, threw = false;
    try { p = BetweenJobs.plan(empty, TABLES, { now: NOW }); } catch (e) { threw = true; }
    checkTrue('an empty household does not throw', !threw);
    check('and is incomplete', p && p.status, 'incomplete');
    checkTrue('with a reason that points at Start Here', /Start Here/.test(p.reason));
    const vouched = BetweenJobs.plan(empty, TABLES, { now: NOW, asBetweenJobs: true });
    check('vouched for as between jobs, it still needs the cash', vouched.status, 'incomplete');
    checkTrue('and says so', /saved/.test(vouched.reason));
    const noSpend = household({ spend: null });
    noSpend.expenses.monthlyEssential.estimatedValueCents = null;
    const q = BetweenJobs.plan(noSpend, TABLES, { now: NOW });
    check('no spending: incomplete', q.status, 'incomplete');
    checkTrue('naming the expenses', q.missing.indexOf('monthlyExpenses') >= 0);
    check('proposing a floor with no spending gives nothing', BetweenJobs.proposeFloorCents(noSpend), null);
  }

  /* -- The six-situation rule: nothing for anyone not between jobs ---------- */
  {
    const employed = t.Demo.build();
    const p = BetweenJobs.plan(employed, TABLES, { now: NOW });
    check('the demo (employed) is refused', p.status, 'incomplete');
    checkTrue('and told which answer Start Here holds', /employed/.test(p.reason));
    checkTrue('the room is not in the employed map', !Registry.forHousehold(employed).some(r => r.id === 'between-jobs'));
    checkTrue('and is in the between-jobs map', Registry.forHousehold(household()).some(r => r.id === 'between-jobs'));
    checkTrue('the gate agrees', Gate.exists(household(), 'unemployment') && !Gate.exists(employed, 'unemployment'));
    const html = fs.readFileSync(path.join(ROOT, 'rooms/between-jobs.html'), 'utf8');
    const why = /why: function \(h, T, situation\) \{[\s\S]*?\}\[situation\] \|\| ''/.exec(html);
    checkTrue('the why paragraph exists only for betweenJobs and is empty otherwise', !!why && /betweenJobs:/.test(why[0]) && !/employed:|retired:|student:|selfEmployed:|mixed:/.test(why[0]));
  }

  /* -- The stand-alone render: a guessed person is treated as between jobs -- */
  {
    const filled = Gate.fillGuesses(Schema.createHousehold({}), TABLES);
    checkTrue('fillGuesses invents an employed person on an empty spine', filled.meta.standalone.indexOf('employmentStatus') >= 0);
    const p = BetweenJobs.plan(filled, TABLES, { now: NOW, asBetweenJobs: true });
    checkTrue('vouched for, the guessed household renders a number', Money.isOk(p), p.reason);
    check('with the invented pay NOT counted as income', p.other.cents, 0);
    check('and no benefit', p.benefit.monthlyCents, 0);
    /* one month of cash at the guessed spending: 1 month */
    check('one month of guessed cash lasts one month', p.runwayMonths, 1);
  }

  /* -- The proposals are the engine's own stand-ins ------------------------- */
  {
    const s = BetweenJobs.proposeSearchMonths(TABLES);
    check('the search proposed is the table median', s.value, TABLES.reentryGap.medianMonths);
    checkTrue('with its confidence in the source', s.source.indexOf(TABLES.reentryGap.confidence) >= 0);
    const f = BetweenJobs.proposeFloorCents(household());
    check('the floor proposed is 70% of spending', f.value, 210000);
    checkTrue('named as a convention', /convention/.test(f.source));
    check('and FLOOR_SHARE is that 70%', BetweenJobs.FLOOR_SHARE, 0.7);
  }

  /* -- The chart points --------------------------------------------------- */
  {
    const p = BetweenJobs.plan(household(), TABLES, { now: NOW });
    const pts = BetweenJobs.balancePoints(p.base, 12);
    check('starts at month 0 with cash plus severance', pts[0].join(','), '0,1000000');
    check('stops at the first month below zero', pts[pts.length - 1].join(','), '5,-44999');
    check('six points', pts.length, 6);
    check('a short horizon clips', BetweenJobs.balancePoints(p.base, 2).length, 3);
  }

  /* -- Dates ---------------------------------------------------------------- */
  {
    check('Jan 31 + 1 month clamps to Feb 28', BetweenJobs.addMonths(new Date(2027, 0, 31).getTime(), 1), '2027-02-28');
    check('a year on', BetweenJobs.addMonths(NOW, 12), '2027-09-05');
    check('seven days on', BetweenJobs.addDays(NOW, 7), '2026-09-12');
  }

  /* -- The page, the registry and the ownership rows ------------------------ */
  {
    const html = fs.readFileSync(path.join(ROOT, 'rooms/between-jobs.html'), 'utf8');
    ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id => checkTrue('the page has the deep link #' + id, new RegExp('id="' + id + '"').test(html)));
    t.Room.IDS.concat(['room-standalone', 'load-notice']).forEach(id => checkTrue('the page has the host ' + id, html.indexOf('id="' + id + '"') >= 0));
    checkTrue('the page mounts the template', /Room\.mount\(\{/.test(html));
    checkTrue('with the room id', /id: 'between-jobs'/.test(html));
    const tag = f => html.indexOf('<script src="../' + f + '"></script>');
    checkTrue('loads the runway engine before its own', tag('engines/runway.js') > 0 && tag('engines/runway.js') < tag('engines/betweenjobs.js'));
    checkTrue('and its own before the lens', tag('engines/betweenjobs.js') < tag('shared/lens.js'));
    checkTrue('is built once', html.indexOf('LIVE-FORM: built once') >= 0);
    checkTrue('never writes health', !/insurance\.health\s*=|upsertInsurance|health\.monthlyCents\s*=/.test(html));
    checkTrue('writes only person.unemployment', /unemployment: Object\.assign\(\{\}, current, patch\)/.test(html) && !/upsertAsset|upsertIncomeSource|updateProfile\(/.test(html));
    checkTrue('the scope line is the one', html.indexOf('This room does not file for benefits, price COBRA against the marketplace, or plan the search itself.') >= 0);
    const room = Registry.byId('between-jobs');
    check('the registry needs the between-jobs facts, spending and cash', room.needs.join(','), 'unemployment,monthlyExpenses,cashSavings');
    check('the room requires the unemployment branch', Registry.requires('between-jobs').join(','), 'unemployment');
    check('expectedSearchMonths is owned here', Ownership.field('expectedSearchMonths').owner, 'between-jobs');
    check('floorMonthly is owned here', Ownership.field('floorMonthly').owner, 'between-jobs');
    check('health cover is not', Ownership.field('healthCover').owner, 'protection');
    const h = household({ unemployment: { expectedSearchMonths: 4, floorMonthlyCents: 220000 } });
    check('the ownership row reads the months back', Ownership.field('expectedSearchMonths').read(h).value, 4);
    check('and the floor', Ownership.field('floorMonthly').read(h).value, 220000);
    check('the reentry gap table is registered', t.TABLES.reentryGap.id, 'reentry_gap');
    ['version', 'asOf', 'source', 'confidence', 'confidenceNote', 'note'].forEach(k => checkTrue('reentry_gap.json has ' + k, typeof t.TABLES.reentryGap[k] === 'string'));
  }
};

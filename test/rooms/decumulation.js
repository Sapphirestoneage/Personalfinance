/* test/rooms/decumulation.js — the Decumulation room (D-098). Run by
   test/run.js's room-test loader with its context. Every expected figure
   below is worked by hand from the persona, never copied from the engine. */
module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Ratios, Projection, Vpw, Room, Gate, TABLES } = t;
  const Decumulation = require(path.join(ROOT, 'engines/decumulation.js'));

  section('Decumulation (D-098): the draw, the rate, VPW, and the age the money lasts to');

  /* Today for the tests: 2026-09-05. Born 1958-03-01 → 68. */
  const AS_OF = '2026-09-05';
  const NOW = Date.parse(AS_OF + 'T12:00:00Z');
  const OPTS = { asOf: AS_OF, now: NOW };

  function retiree(extra) {
    const h = Schema.createHousehold(Object.assign({ state: 'NC', filingStatus: 'single', meta: { hasDebt: false, noRent: false },
      people: [Schema.createPerson({ role: 'adult', employmentStatus: 'retired', dob: '1958-03-01',
        incomeSources: [Schema.createIncomeSource({ grossAnnualIncomeCents: 2400000 })] })],
      assets: [Schema.createAsset({ category: 'cash', valueCents: 1800000 }), Schema.createAsset({ category: 'investment', valueCents: 42000000 })] }, extra || {}));
    h.expenses.monthlyEssential.estimatedValueCents = 310000;
    return h;
  }

  /* ---- The persona, by hand ------------------------------------------------
     Investments $420,000; spending $3,100 × 12 = $37,200; income $24,000.
     Draw = $37,200 − $24,000 = $13,200. Rate = 13,200 / 420,000 = 3.142…%,
     inside the 4% band. At 5% real, growth ($21,000 in year one) beats the
     draw: never empties. At 0% real: 420,000 / 13,200 = 31.8 years, age 68
     + 31.8 → 100. */
  const base = retiree();
  const p = Decumulation.plan(base, TABLES, OPTS);
  checkTrue('the persona plans', Money.isOk(p), p.reason);
  check('the draw is spending not covered by income: $13,200', p.drawCents, 1320000);
  check('… not planned, computed', p.planned, false);
  check('the rate is 13,200 / 420,000 = 3.14%', Math.round(p.withdrawalRate * 10000) / 10000, 0.0314);
  const ratioRow = Ratios.all(base, TABLES, { now: NOW }).rows.filter(r => r.id === 'withdrawalRate')[0];
  check('… and equals the ratio registry’s withdrawalRate exactly', p.withdrawalRate, ratioRow.value);
  check('… inside the 4% band: good', p.zone, 'good');
  check('the age today is 68', p.age, 68);
  checkTrue('at 5% real it never empties', p.never === true);
  check('… so the age it lasts to is not a number', p.lastsToAge, null);
  check('… and the value is the projection cap', p.value, Projection.DEFAULT_MAX_YEARS);

  const flat = retiree({ assumptions: { returnReal: 0 } });
  const p0 = Decumulation.plan(flat, TABLES, OPTS);
  check('at 0% real: 420,000 / 13,200 = 31.8 years', Math.round(p0.yearsUntilEmpty * 10) / 10, 31.8);
  check('… which is age 68 + 31.8 → 100', p0.lastsToAge, 100);
  check('… the same years the dashboard’s loop gives', p0.yearsUntilEmpty, Projection.yearsUntilEmptyCents({ startCents: 42000000, annualDrawCents: 1320000, annualRate: 0 }).value);

  /* ---- VPW at 68, 60% stocks, by hand ---------------------------------------
     Table: 65 → 5.5%, 70 → 6.1%. At 68: 5.5% + 0.6% × 3/5 = 5.86%.
     Allowed: $420,000 × 5.86% = $24,612. */
  check('the stock share defaults to the table’s middle column', p.stockShare, 0.6);
  check('… and is not marked entered', p.stockShareEntered, false);
  check('VPW at 68, 60% stocks: 5.5% + (6.1% − 5.5%) × 3/5 = 5.86%', Math.round(p.vpw.percentage * 10000) / 10000, 0.0586);
  check('… allowing $420,000 × 5.86% = $24,612 this year', p.vpw.allowedCents, 2461200, 1);
  check('… the same figure Vpw.percentageAt gives', p.vpw.percentage, Vpw.percentageAt(TABLES.vpwTable, 68, 0.6));
  const forty = Decumulation.plan(retiree({ decumulation: { stockShare: 0.4 } }), TABLES, OPTS);
  check('at 40% stocks the other column: 5.1% + 0.7% × 3/5 = 5.52%', Math.round(forty.vpw.percentage * 10000) / 10000, 0.0552);
  check('… allowing $23,184', forty.vpw.allowedCents, 2318400, 1);

  /* ---- The chart’s paths ----------------------------------------------------
     Planned path replays balance × (1 + r) − draw. Year one at 0%:
     420,000 − 13,200 = 406,800. Year one at 5%: 441,000 − 13,200 = 427,800.
     Horizon: to age 100 from 68 is 32 years. */
  check('the horizon runs to age 100: 32 years from 68', p.horizonYears, 32);
  check('the planned path starts at the investments', p.path[0].balanceCents, 42000000);
  check('… year one at 5%: 420,000 × 1.05 − 13,200 = $427,800', p.path[1].balanceCents, 42780000);
  check('… year one at 0%: 420,000 − 13,200 = $406,800', p0.path[1].balanceCents, 40680000);
  check('… and at 0% the path reaches zero in year 32 (31.8 rounded up)', p0.path[p0.path.length - 1].year + '/' + p0.path[p0.path.length - 1].balanceCents, '32/0');
  check('… a point for every year to the horizon at 5%', p.path.length, 33);
  checkTrue('the VPW path exists when the age is known', Array.isArray(p.vpwPath) && p.vpwPath.length === 33);
  check('… starting at the investments', p.vpwPath[0].balanceCents, 42000000);
  check('… first year’s draw is what VPW allows', p.vpwPath[0].withdrawalCents, 2461200, 1);
  check('… and after year one (420,000 − 24,612) × 1.05 = $415,157', p.vpwPath[1].balanceCents, 41515740, 1);
  checkTrue('a young household is capped at forty years', Decumulation.plan(retiree({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'retired', dob: '1976-03-01', incomeSources: [Schema.createIncomeSource({ grossAnnualIncomeCents: 2400000 })] })] }), TABLES, OPTS).horizonYears === 40);

  /* ---- Edge cases ------------------------------------------------------------- */
  /* Income covers spending: spending $2,000 × 12 = $24,000 = income → draw 0, rate 0, never. */
  const covered = retiree(); covered.expenses.monthlyEssential.estimatedValueCents = 200000;
  const pc = Decumulation.plan(covered, TABLES, OPTS);
  check('income covering spending draws nothing', pc.drawCents, 0);
  check('… rate zero, not blank', pc.withdrawalRate, 0);
  checkTrue('… covered, and it outlasts you', pc.covered === true && pc.never === true);
  check('… zero is inside the band', pc.zone, 'good');

  /* No investments: incomplete, says why. */
  const noInv = retiree({ assets: [Schema.createAsset({ category: 'cash', valueCents: 1800000 })] });
  const pn = Decumulation.plan(noInv, TABLES, OPTS);
  checkTrue('no investments is incomplete, not a number', !Money.isOk(pn) && pn.reason === 'Add your investments to see this.' && pn.missing[0] === 'investments');
  const zeroInv = retiree({ assets: [Schema.createAsset({ category: 'investment', valueCents: 0 })] });
  checkTrue('zero invested says there is nothing to draw from', !Money.isOk(Decumulation.plan(zeroInv, TABLES, OPTS)) && /Nothing invested/.test(Decumulation.plan(zeroInv, TABLES, OPTS).reason));

  /* A planned draw typed overrides the computed one: $20,000 / 420,000 = 4.76% → watch.
     At 5% real: year one 441,000 − 20,000 = 421,000 — still growing, never. At 0%: 21 years → 89. */
  const planned = retiree({ decumulation: { plannedAnnualDrawCents: 2000000 } });
  const pp = Decumulation.plan(planned, TABLES, OPTS);
  check('a planned $20,000 replaces the computed draw', pp.drawCents, 2000000);
  check('… and says it is planned', pp.planned, true);
  check('… keeping the computed figure beside it', pp.computedDrawCents, 1320000);
  check('… rate 20,000 / 420,000 = 4.76%: watch', Math.round(pp.withdrawalRate * 10000) / 10000 + '/' + pp.zone, '0.0476/watch');
  const pp0 = Decumulation.plan(retiree({ decumulation: { plannedAnnualDrawCents: 2000000 }, assumptions: { returnReal: 0 } }), TABLES, OPTS);
  check('… at 0% real 420,000 / 20,000 = 21 years, age 89', pp0.yearsUntilEmpty + '/' + pp0.lastsToAge, '21/89');
  const bigDraw = Decumulation.plan(retiree({ decumulation: { plannedAnnualDrawCents: 4200000 } }), TABLES, OPTS);
  check('a planned 10% draw is out of the band', bigDraw.zone, 'out');
  check('a planned zero is covered', Decumulation.plan(retiree({ decumulation: { plannedAnnualDrawCents: 0 } }), TABLES, OPTS).covered, true);

  /* Stock share outside 0–1 is clamped, and the Result says so. */
  const over = Decumulation.plan(retiree({ decumulation: { stockShare: 1.5 } }), TABLES, OPTS);
  check('a stock share above 1 is clamped to 1', over.stockShare, 1);
  checkTrue('… and flagged', over.stockShareClamped === true && over.stockShareEntered === true);
  check('… reading the 60% column (the nearer)', over.vpw.percentage, Vpw.percentageAt(TABLES.vpwTable, 68, 0.6));
  check('a share below 0 is clamped to 0', Decumulation.plan(retiree({ decumulation: { stockShare: -0.2 } }), TABLES, OPTS).stockShare, 0);
  check('an in-range share is not flagged', Decumulation.plan(retiree({ decumulation: { stockShare: 0.55 } }), TABLES, OPTS).stockShareClamped, false);
  check('clamp01 is the one clamp the room’s write uses too', Decumulation.clamp01(1.5) + '/' + Decumulation.clamp01(-1) + '/' + Decumulation.clamp01(0.7), '1/0/0.7');

  /* Age missing: years, not an age; no VPW; forty-year horizon. */
  const noDob = retiree({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'retired', incomeSources: [Schema.createIncomeSource({ grossAnnualIncomeCents: 2400000 })] })], assumptions: { returnReal: 0 } });
  const pa = Decumulation.plan(noDob, TABLES, OPTS);
  checkTrue('without a birth date the plan still runs', Money.isOk(pa));
  check('… years instead of an age', Math.round(pa.yearsUntilEmpty * 10) / 10 + '/' + pa.lastsToAge, '31.8/null');
  check('… no VPW figure without an age', pa.vpw, null);
  check('… no VPW path either', pa.vpwPath, null);
  check('… and the horizon is forty years', pa.horizonYears, 40);

  /* Social Security: a timing note when the claim age is ahead, never an amount. */
  const ss = Decumulation.plan(retiree({ decumulation: { socialSecurityAt: 70 } }), TABLES, OPTS);
  check('Social Security at 70 is two years ahead at 68', ss.socialSecurityInYears, 2);
  check('… already claimed at 65 is no note', Decumulation.plan(retiree({ decumulation: { socialSecurityAt: 65 } }), TABLES, OPTS).socialSecurityInYears, null);
  check('… and with no age there is nothing to compare', Decumulation.plan(retiree({ people: noDob.people, decumulation: { socialSecurityAt: 70 } }), TABLES, OPTS).socialSecurityInYears, null);
  checkTrue('no benefit amount appears anywhere in the Result', Object.keys(ss).every(k => !/benefit|ssCents|ssMonthly/i.test(k)));

  /* Empty household: reasons, not throws. */
  let empty = null, threw = false;
  try { empty = Decumulation.plan(Schema.createHousehold({}), TABLES, OPTS); } catch (e) { threw = true; }
  checkTrue('an empty household gets a reason, not a throw', !threw && empty && !Money.isOk(empty) && typeof empty.reason === 'string' && empty.reason.length > 0);
  checkTrue('… and no tables at all is still a reason', (function () { try { const r = Decumulation.plan(Schema.createHousehold({}), {}, OPTS); return !Money.isOk(r) && !!r.reason; } catch (e) { return false; } })());
  checkTrue('an employed household is told this is a retiree’s number', (function () {
    const h = retiree({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'employed', dob: '1990-06-01', incomeSources: [Schema.createIncomeSource({ grossAnnualIncomeCents: 6000000 })] })] });
    const r = Decumulation.plan(h, TABLES, OPTS);
    return !Money.isOk(r) && /retiree/.test(r.reason);
  })());
  checkTrue('the Result never carries a status key in its extras', Object.keys(p).filter(k => k === 'status').length === 1);

  /* The guesses path: an empty spine filled by the gate as retired still renders a plan. */
  const guessed = Gate.fillGuesses(Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'retired' })] }), TABLES);
  const pg = Decumulation.plan(guessed, TABLES, OPTS);
  checkTrue('with the intake’s guesses for a retiree the room has a number', Money.isOk(pg), pg.reason);

  /* ---- The page ------------------------------------------------------------ */
  const html = fs.readFileSync(path.join(ROOT, 'rooms/decumulation.html'), 'utf8');
  Room.IDS.forEach(id => checkTrue(`Decumulation has #${id}`, new RegExp('id="' + id + '"').test(html)));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading'].forEach(id => checkTrue(`… and the deep link #${id}`, new RegExp('id="' + id + '"').test(html)));
  checkTrue('it mounts the template as decumulation', /Room\.mount\(\{/.test(html) && /id: 'decumulation'/.test(html) && html.indexOf('STUB') === -1);
  checkTrue('with a number, a chart, inputs, amounts, assumptions, why and scope', ['number:', 'chart:', 'inputs:', 'amounts:', 'assumptions:', 'why:', 'scope:'].every(k => html.indexOf(k) !== -1));
  check('three inputs: the stock share, the planned draw, Social Security from', ['stockShare', 'plannedAnnualDrawCents', 'socialSecurityAt'].filter(c => html.indexOf("ctl: '" + c + "'") !== -1).length, 3);
  checkTrue('it writes only its own three paths', (html.match(/Spine\.set\('decumulation\.' \+ key/g) || []).length === 1 && !/Spine\.(upsert|setMonthlyExpenses|set\('(?!decumulation))/.test(html));
  checkTrue('it loads the engines it calls', ['engines/ratios.js', 'engines/vpw.js', 'engines/projection.js', 'engines/decumulation.js'].every(s => html.indexOf(s) !== -1));
  checkTrue('one chart: an area', (html.match(/Charts\.area\(/g) || []).length === 2 && !/Charts\.(donut|bars|stacked)\(/.test(html));
  checkTrue('it says what it does not do', /scope: 'This room does not model taxes on withdrawals, Medicare, or sequence-of-returns risk\.'/.test(html));
  checkTrue('it declares its live-form discipline and a place for a theme', /LIVE-FORM: built once/.test(html) && /THEMING:/.test(html));
  checkTrue('it says plainly that withdrawals are not taxed here', /Tax on withdrawals/.test(html) && /none modelled/.test(html));
  checkTrue('the why speaks to the retired only', /retired: 'Retired,/.test(html) && /employed: ''/.test(html));
};

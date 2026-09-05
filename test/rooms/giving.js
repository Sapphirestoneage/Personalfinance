/* ==========================================================================
   test/rooms/giving.js — the Giving room, re-derived by hand. D-098.
   ========================================================================== */
'use strict';

module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, Registry, Ownership, Gate, Lens, Room, TABLES } = t;
  const Giving = require(path.join(ROOT, 'engines/giving.js'));
  const T = TABLES;

  section('Giving — the table, the engine, the room (D-098)');

  /* ---- The table --------------------------------------------------------- */
  const table = T.givingConventions;
  checkTrue('the conventions table is loaded', !!table && Array.isArray(table.shares));
  check('it is a convention, not a finding', table.confidence, 'convention');
  check('four shares, in order', table.shares.map(s => s.pct).join(','), '0.01,0.02,0.05,0.1');
  check('each has a label and a note', table.shares.every(s => s.label && s.note && s.id), true);
  checkTrue('the tithe is named a religious convention', /religious convention/.test((table.shares.find(s => s.id === 'tithe') || {}).note || ''));
  checkTrue('the 2% row is the US average', /US average/.test((table.shares.find(s => s.id === 'average') || {}).note || ''));
  checkTrue('the deduction note says only when itemising, with no rates', /itemising/.test(table.deduction.note) && table.deduction.rates === null);
  check('the proposed share is the average', Giving.proposedShare(T).value, 0.02);

  /* ---- Hand-derived: $62,000 gross, 2% ------------------------------------- */
  /* 62,000 × 0.02 = 1,240.00 a year → 124,000 cents; ÷ 12 = 103.33 → 10,333 cents.
     The conventions: 620 / 1,240 / 3,100 / 6,200 dollars. */
  function withIncome(grossDollars, giving, status) {
    return Schema.createHousehold({
      people: [Schema.createPerson({ id: 'p1', role: 'adult', employmentStatus: status || 'employed',
        incomeSources: [Schema.createIncomeSource({ id: 'i1', personId: 'p1', type: 'w2', grossAnnualIncomeCents: Money.toCents(grossDollars) })] })],
      giving: giving
    });
  }
  const p = Giving.plan(withIncome(62000, { pctOfIncome: 0.02 }), T);
  check('2% of $62,000 is $1,240 a year', p.value, 124000);
  check('… $103.33 a month', p.monthlyCents, 10333);
  check('… the share is the one entered', p.share, 0.02);
  check('… from the share, not a target', p.mode + '/' + p.shareDerived, 'share/false');
  check('the conventions in dollars for $62,000', p.conventions.map(c => c.cents).join(','), '62000,124000,310000,620000');
  check('the tithe on $62,000 is $6,200', p.conventions.find(c => c.id === 'tithe').cents, 620000);
  checkTrue('the conventions come from the table, not literals', p.conventions.every((c, i) => c.pct === table.shares[i].pct && c.label === table.shares[i].label));
  checkTrue('the lens says whether FI moves (no investments here, so it says why)', !Money.isOk(p.pushed) && /investments|income|saved|FI/.test(p.pushed.reason));

  /* ---- The demo persona: $72,000, and FI actually moves ------------------- */
  const demo = Demo.build();
  demo.giving = { pctOfIncome: 0.02, annualTargetCents: null };
  const d = Giving.plan(demo, T);
  check('2% of the demo’s $72,000 is $1,440', d.value, 144000);
  check('… $120 a month', d.monthlyCents, 12000);
  checkTrue('the FI cost is a number of months, not negative', Money.isOk(d.pushed) && typeof d.pushed.value === 'number' && d.pushed.value >= 0);
  check('… and is exactly the lens’s own answer for the same dollars', d.pushed.value, Lens.apply(144000, 'pushed', demo, T).value);
  check('… in months', d.pushed.unit, 'months');
  checkTrue('hours of life at the real hourly wage', Money.isOk(d.hours) && d.hours.value > 0 && d.hours.unit === 'hours');
  check('… the lens’s own hours', d.hours.value, Lens.apply(144000, 'hours', demo, T).value, 1e-9);
  /* By hand: the demo's real hourly wage is the hourly engine's; the hours are cents ÷ wage. */
  const Hourly = t.Hourly;
  const w = Hourly.realHourlyWage(demo, T, {});
  check('… = the year given ÷ the real wage', d.hours.value, 144000 / w.value, 1e-9);

  /* ---- A target typed over the share wins, and the share is derived -------- */
  const tgt = Giving.plan(withIncome(72000, { pctOfIncome: 0.02, annualTargetCents: 120000 }), T);
  check('$1,200 typed over 2% gives $1,200', tgt.value, 120000);
  check('… $100 a month', tgt.monthlyCents, 10000);
  check('… and the share is worked back: 1,200 ÷ 72,000', tgt.share, 120000 / 7200000, 1e-12);
  check('… 1.7% when formatted', Money.formatRate(tgt.share, { decimals: 1 }), '1.7%');
  check('… marked derived', tgt.mode + '/' + tgt.shareDerived, 'target/true');
  check('… the entered share is still reported', tgt.enteredShare, 0.02);

  /* ---- Share 0: nothing given, FI unmoved ------------------------------------ */
  const zero = Giving.plan(Object.assign(Demo.build(), { giving: { pctOfIncome: 0, annualTargetCents: null } }), T);
  check('a share of 0 is $0 given, not missing', zero.status + '/' + zero.value, 'ok/0');
  check('… and says nothing given', zero.nothing, true);
  check('… FI unmoved', zero.pushed.value, 0);
  check('… the lens says so in words', zero.pushed.display, 'FI unmoved');

  /* ---- No income ------------------------------------------------------------- */
  const noInc = Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'employed' })], giving: { pctOfIncome: 0.05 } });
  const ni = Giving.plan(noInc, T);
  check('a share with no income is incomplete', ni.status, 'incomplete');
  check('… missing the income', ni.missing.join(','), 'grossAnnualIncome');
  const niT = Giving.plan(Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'employed' })], giving: { pctOfIncome: 0.05, annualTargetCents: 50000 } }), T);
  check('a target with no income still shows dollars', niT.value, 50000);
  check('… with no share to derive', niT.share, null);
  check('… and conventions with no dollars', niT.conventions.map(c => c.cents).join(','), ',,,');
  checkTrue('… but the shares still named', niT.conventions.length === 4 && niT.conventions[3].label === '10%');

  /* ---- Between jobs: target-only mode ---------------------------------------- */
  const bj = Schema.createHousehold({ people: [Schema.createPerson({ role: 'adult', employmentStatus: 'unemployed' })], giving: { pctOfIncome: 0.02, annualTargetCents: null } });
  const bjFilled = Gate.fillGuesses(bj, T);
  checkTrue('between jobs, no pay is invented for the room', !Money.isOk(Schema.grossAnnualIncomeCents(bjFilled)));
  check('… so a share alone is incomplete', Giving.plan(bjFilled, T).status, 'incomplete');
  bjFilled.giving.annualTargetCents = 30000;
  check('… and a typed target is the plan', Giving.plan(bjFilled, T).value, 30000);
  check('… $25 a month', Giving.plan(bjFilled, T).monthlyCents, 2500);

  /* ---- Empty household: says why, never throws ------------------------------- */
  let threw = false, e = null;
  try { e = Giving.plan(Schema.createHousehold({}), T); } catch (err) { threw = true; }
  checkTrue('an empty household does not throw', !threw);
  check('… it is incomplete', e.status, 'incomplete');
  check('… naming both inputs', e.missing.join(','), 'pctOfIncome,annualTargetCents');
  let threw2 = false;
  try { Giving.lastMonth(Schema.createHousehold({}), T); Giving.conventions(null, T); Giving.plan(undefined, T); Giving.plan({}, {}); } catch (err) { threw2 = true; }
  checkTrue('nor do the helpers, even without tables', !threw2);
  check('no table → incomplete, not a throw', Giving.conventions(6200000, {}).status, 'incomplete');

  /* ---- Last month's gifts, through the ratios engine ------------------------- */
  check('without a categorised month there is no last month', Giving.lastMonth(Demo.build(), T).status, 'incomplete');
  const tracked = Demo.build();
  tracked.expenses.entries = Demo.buildSpending().concat([Schema.createExpenseEntry({ categoryId: 'gifts', amountCents: 17100 })]);
  const lm = Giving.lastMonth(tracked, T);
  check('$171 of gifts is read back in dollars', lm.giftsMonthlyCents, 17100);
  check('… as a share of take-home', lm.rate, 17100 / t.Tier0.takeHomeMonthlyCents(tracked, T).value, 1e-12);
  check('… the ratios engine’s own figure', lm.rate, t.Ratios.all(tracked, T).rows.find(r => r.id === 'givingRate').value, 1e-12);

  /* ---- Ownership and the spine ----------------------------------------------- */
  check('the share is owned by Giving', Ownership.field('givingPct').owner, 'giving');
  check('the target is owned by Giving', Ownership.field('givingTarget').owner, 'giving');
  check('… both anchored at the inputs', Ownership.field('givingPct').anchor + '/' + Ownership.field('givingTarget').anchor, 'inputs/inputs');
  check('the registry row needs income', Registry.byId('giving').needs.join(','), 'grossAnnualIncome');
  check('giving starts unanswered', JSON.stringify(Schema.createHousehold({}).giving), JSON.stringify({ pctOfIncome: null, annualTargetCents: null }));

  /* ---- The page ---------------------------------------------------------------- */
  const html = fs.readFileSync(path.join(ROOT, 'rooms/giving.html'), 'utf8');
  Room.IDS.forEach(id => checkTrue(`Giving has #${id}`, new RegExp('id="' + id + '"').test(html)));
  ['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading', 'room-standalone', 'load-notice'].forEach(id => checkTrue(`… and #${id}`, new RegExp('id="' + id + '"').test(html)));
  checkTrue('it mounts the template as giving', /Room\.mount\(\{\s*id: 'giving'/.test(html));
  checkTrue('no stub marker remains', html.indexOf('STUB') === -1 && html.indexOf('Hourly.realHourlyWage') === -1);
  checkTrue('two inputs: the share and the target', /ctl: 'pctOfIncome'/.test(html) && /ctl: 'annualTargetCents'/.test(html));
  checkTrue('it writes only through Spine.set on giving.*', /Spine\.set\('giving\.' \+ key, value\)/.test(html) && !/upsertPerson|updateProfile/.test(html));
  checkTrue('one chart, bars', (html.match(/Charts\.bars\(/g) || []).length >= 1 && !/Charts\.(area|donut|stacked)\(/.test(html));
  checkTrue('the FI cost comes from the lens, not a literal', /Lens\.apply\(annual, 'pushed'/.test(fs.readFileSync(path.join(ROOT, 'engines/giving.js'), 'utf8')));
  checkTrue('the conventions are read from the table in the engine', /tables\.givingConventions/.test(fs.readFileSync(path.join(ROOT, 'engines/giving.js'), 'utf8')) && !/0\.01|0\.05|0\.10/.test(fs.readFileSync(path.join(ROOT, 'engines/giving.js'), 'utf8')));
  checkTrue('it declares its live-form discipline and a place for a theme', /LIVE-FORM: built once/.test(html) && /THEMING:/.test(html));
  checkTrue('the scope line says what it does not do', /scope: 'This room does not track individual gifts, model the tax deduction, or judge what counts\.'/.test(html));
  checkTrue('why is written for all six situations', ['employed', 'selfEmployed', 'mixed', 'student', 'retired', 'betweenJobs'].every(s => new RegExp(s + ": '").test(html)));
  checkTrue('the scripts it needs, in order', (function () {
    const order = ['shared/gate.js', 'engines/projection.js', 'engines/tier0.js', 'engines/cashflow.js', 'engines/ratios.js', 'engines/hourly.js', 'shared/lens.js', 'engines/giving.js', 'shared/charts.js', 'shared/room.js'];
    const idx = order.map(s => html.indexOf('<script src="../' + s + '"'));
    return idx.every((v, i) => v !== -1 && (i === 0 || v > idx[i - 1]));
  })());
};

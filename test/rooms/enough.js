/* ==========================================================================
   test/rooms/enough.js — Enough as the denominator, by hand.
   --------------------------------------------------------------------------
   The household: single, NC, $72,000 a year, $3,150 a month, $48,000
   invested, a 50% match on the first 6% with 4% going in. Every figure
   below is worked longhand, never copied from the engine.

     withdrawal rate  4% (the default)
     FI on spending   3,150 × 12 ÷ 0.04 = 37,800 ÷ 0.04 = 945,000
     enough typed     2,600
     FI on enough     2,600 × 12 ÷ 0.04 = 31,200 ÷ 0.04 = 780,000
     the gap          945,000 − 780,000 = 165,000
     the gap a month  3,150 − 2,600 = 550

     this year's savings (the lens's basis, with the match):
       tax at 19%     72,000 × 0.19 = 13,680
       saved          72,000 − 37,800 − 13,680 = 20,520
       match          50% of the first 6% of 72,000 = 0.5 × 4,320 = 2,160
                      (Schema.employerMatchCents counts the match at its cap)
       basis          20,520 + 2,160 = 22,680 — the lens's including-match
                      figure, the one the dashboard's climb uses
     years, closed form, n = ln((T + C/r) ÷ (P + C/r)) ÷ ln(1 + r)
       C/r            22,680 ÷ 0.05 = 453,600
       P + C/r        48,000 + 453,600 = 501,600
       to 945,000     ln(1,398,600 ÷ 501,600) ÷ ln 1.05 = ln 2.78828 ÷ 0.048790
                      = 1.02540 ÷ 0.048790 = 21.02
       to 780,000     ln(1,233,600 ÷ 501,600) ÷ ln 1.05 = ln 2.45933 ÷ 0.048790
                      = 0.89983 ÷ 0.048790 = 18.44
       the gap        21.02 − 18.44 = 2.58 years

   The categorised month for the curve (six lines, six ratings):
     housing 1,500 (joy 6, essential)   groceries 450 (7, essential)
     dining out 260 (3)                 subscriptions 45 (2)
     entertainment 90 (8)               transportation 220 (4, essential)
     spend line      median of 45, 90, 220, 260, 450, 1,500 = (220 + 260) ÷ 2 = 240
     joy line        5.5
     quadrants       housing worth_it · groceries worth_it · dining out
                     expensive (> 240, < 5.5) · subscriptions small_meh ·
                     entertainment cheap_joy · transportation small_meh
     dropped         dining out + subscriptions = 305; transportation is
                     low-joy too but essential, so it stays
     spend           1,500 + 450 + 260 + 45 + 90 + 220 = 2,565
     enough          2,565 − 305 = 2,260
   ========================================================================== */
'use strict';

module.exports = function (t) {
  const { section, check, checkTrue, ROOT, fs, path, Money, Schema, Demo, Registry, Ownership, Spine, Tier0, TABLES } = t;
  const Enough = require(path.join(ROOT, 'engines/enough.js'));
  const Fulfillment = require(path.join(ROOT, 'engines/fulfillment.js'));
  const CAT = TABLES.expenseCategories;

  function household(over) {
    const o = over || {};
    const h = Schema.createHousehold({ state: 'NC', filingStatus: 'single', meta: { hasDebt: false },
      people: [Schema.createPerson({ id: 'you', role: 'adult', employmentStatus: 'employed', dob: '1994-04-12',
        incomeSources: [Schema.createIncomeSource({ id: 'pay', personId: 'you', type: 'w2', grossAnnualIncomeCents: 7200000,
          employerMatch: { matchPercent: 0.5, matchCapPercentOfSalary: 0.06, capturingFullMatch: false }, contributionPercent: 4 })] })],
      assets: o.investments === null ? [] : [Schema.createAsset({ id: 'inv', category: 'investment', valueCents: o.investments === undefined ? 4800000 : o.investments })] });
    h.expenses.monthlyEssential.estimatedValueCents = o.spend === undefined ? 315000 : o.spend;
    if (o.enough !== undefined) h.enough = { monthlyCents: o.enough, source: o.source || 'entered' };
    return h;
  }
  function closedForm(T, P, C, r) { return Math.log((T + C / r) / (P + C / r)) / Math.log(1 + r); }

  section('Enough — the second FI number, by hand');

  /* -- The room, the row --------------------------------------------------- */
  {
    const room = Registry.byId('enough');
    checkTrue('Enough is a room', !!room);
    check('needing a month of spending and investments', (room.needs || []).slice().sort().join(','), 'investments,monthlyExpenses');
    const f = Ownership.field('enoughMonthly');
    check('the field is owned by the room', f && f.owner, 'enough');
    check('anchored at its inputs', f && f.anchor, 'inputs');
    check('unset it reads incomplete, not zero', Ownership.field('enoughMonthly').read(Schema.createHousehold({})).status, 'incomplete');
    check('the schema shapes the branch', JSON.stringify(Schema.createEnough({})), '{"monthlyCents":null,"source":null}');
    check('and refuses a source it does not know', Schema.createEnough({ monthlyCents: 100, source: 'guess' }).source, null);
  }

  /* -- The household above, enough typed at 2,600 ---------------------------- */
  {
    const h = household({ enough: 260000 });
    const basis = Tier0.savingsRate(h, TABLES).includingMatch;
    check('this year’s savings with the match is 22,680', basis.annualSavingsCents, 2268000);
    const cur = Enough.current(h, TABLES);
    check('enough is the typed figure', cur.value, 260000);
    check('and is entered', cur.source, 'entered');
    checkTrue('not a proposal', cur.proposed === false);

    const two = Enough.fiTwo(h, TABLES);
    checkTrue('the two numbers compute', Money.isOk(two), two.reason);
    check('FI on spending: 37,800 ÷ 0.04', two.spendFiCents, 94500000);
    check('FI on enough: 31,200 ÷ 0.04', two.enoughFiCents, 78000000);
    check('the gap: 945,000 − 780,000', two.value, 16500000);
    check('and the same on the result', two.gapCents, 16500000);
    check('the gap a month: 3,150 − 2,600', two.monthlyGapCents, 55000);
    check('spending a month reads back', two.spendMonthlyCents, 315000);
    check('at the default withdrawal rate', two.swrRate, 0.04);
    checkTrue('enough sits below spending', two.enoughBelowSpending && !two.enoughAboveSpending);
    check('FI on spending is Tier0’s own number', two.spendFiCents, Tier0.fireNumber(h).value);

    check('the years use the real return', two.contribution.rate, 0.05);
    check('and this year’s savings, with the match', two.contribution.annualSavingsCents, 2268000);
    check('from the investments', two.contribution.investmentsCents, 4800000);
    check('years to FI on spending, closed form 21.02', two.yearsToSpend.value, closedForm(94500000, 4800000, 2268000, 0.05), 0.1);
    check('which is 21.0', Math.round(two.yearsToSpend.value * 10) / 10, 21.0);
    check('years to FI on enough, closed form 18.44', two.yearsToEnough.value, closedForm(78000000, 4800000, 2268000, 0.05), 0.1);
    check('which is 18.4', Math.round(two.yearsToEnough.value * 10) / 10, 18.4);
    check('the gap in years: 2.58', two.yearsGap, 2.58, 0.1);
    check('the same years the lens counts', two.yearsToSpend.value, t.Lens.fiInputs(h, TABLES) && (function () {
      const fi = t.Lens.fiInputs(h, TABLES);
      return t.Projection.yearsToTargetCents({ startCents: fi.investmentsCents, targetCents: fi.targetCents, annualRate: fi.rate, annualContributionCents: fi.annualSavingsCents, fractional: true }).value;
    })());
  }

  /* -- The demo persona: the same numbers ------------------------------------ */
  {
    const h = Demo.build();
    h.enough = { monthlyCents: 260000, source: 'entered' };
    const two = Enough.fiTwo(h, TABLES);
    check('the demo spends 3,150: FI 945,000', two.spendFiCents, 94500000);
    check('and 2,600 of enough: FI 780,000', two.enoughFiCents, 78000000);
    check('the gap 165,000', two.value, 16500000);
    check('years to spending within 0.1 of the closed form', two.yearsToSpend.value, 21.02, 0.1);
    check('years to enough within 0.1 of the closed form', two.yearsToEnough.value, 18.44, 0.1);
  }

  /* -- No ratings: the 85% convention stands in ------------------------------ */
  {
    const h = household({});
    const p = Enough.propose(h, TABLES);
    checkTrue('a proposal exists', Money.isOk(p), p.reason);
    check('85% of 3,150 = 2,677.50', p.value, 267750);
    check('and is named a convention', p.basis, 'convention');
    checkTrue('the source says so', /convention/.test(p.source));
    checkTrue('and carries the curve’s reason', /Categorise a month/.test(p.curveReason));
    const cur = Enough.current(h, TABLES);
    check('so enough is the proposal', cur.value, 267750);
    check('with the convention as its source', cur.source, 'convention');
    checkTrue('marked proposed', cur.proposed === true);
    const two = Enough.fiTwo(h, TABLES);
    check('FI on the proposal: 32,130 ÷ 0.04', two.enoughFiCents, 80325000);
    check('the gap: 945,000 − 803,250', two.value, 14175000);
    checkTrue('and the number says it is proposed', two.proposed === true);
    check('nothing was written to the household', h.enough.monthlyCents, null);
    check('the share is 85%', Enough.CONVENTION_SHARE, 0.85);
  }

  /* -- The curve: the same arithmetic as Fulfillment, by hand ---------------- */
  {
    const h = household({});
    h.ratings = { joy: { housing: 6, groceries: 7, dining_out: 3, subscriptions: 2, entertainment: 8, transportation: 4 } };
    h.expenses.entries = [['housing', 150000], ['groceries', 45000], ['dining_out', 26000], ['subscriptions', 4500], ['entertainment', 9000], ['transportation', 22000]]
      .map(function (row, i) { return Schema.createExpenseEntry({ id: 'e' + i, categoryId: row[0], amountCents: row[1] }); });
    const curve = Fulfillment.curve(h, CAT);
    checkTrue('Fulfillment draws the curve', Money.isOk(curve), curve.reason);
    check('six rated', curve.value, 6);
    check('the spend line is the median, 240', curve.spendLineCents, 24000);
    check('the joy line is 5.5', curve.joyLine, 5.5);
    const q = {};
    curve.plotted.forEach(function (p) { q[p.categoryId] = p.quadrantId; });
    check('dining out is an expensive habit', q.dining_out, 'expensive');
    check('subscriptions are small and forgettable', q.subscriptions, 'small_meh');
    check('transportation is small and forgettable too', q.transportation, 'small_meh');
    check('entertainment is cheap joy', q.entertainment, 'cheap_joy');
    check('housing is worth it', q.housing, 'worth_it');

    const c = Enough.fromCurve(h, TABLES);
    checkTrue('the knee computes', Money.isOk(c), c.reason);
    check('spending across the month: 2,565', c.spendMonthlyCents, 256500);
    check('dropped: dining out + subscriptions = 305', c.droppedMonthlyCents, 30500);
    check('enough: 2,565 − 305 = 2,260', c.value, 226000);
    check('the dropped lines, by name', c.dropped.map(function (d) { return d.categoryId; }).sort().join(','), 'dining_out,subscriptions');
    checkTrue('transportation is low-joy but essential, so it stays', c.kept.some(function (k) { return k.categoryId === 'transportation'; }));
    check('the same as Fulfillment’s own quadrant totals less the essential line',
      c.value, curve.spendMonthlyCents - (curve.byQuadrant.expensive.monthlyCents + curve.byQuadrant.small_meh.monthlyCents - 22000));
    check('the low-joy quadrants are the two below the joy line', Enough.LOW_JOY.slice().sort().join(','), 'expensive,small_meh');

    const p = Enough.propose(h, TABLES);
    check('the proposal is the curve’s', p.value, 226000);
    check('and says so', p.basis, 'curve');
    checkTrue('with the curve as its source', /joy curve/.test(p.source));
    const cur = Enough.current(h, TABLES);
    check('enough is the curve’s figure when nothing is typed', cur.value, 226000);
    check('sourced from the curve', cur.source, 'curve');
    const two = Enough.fiTwo(h, TABLES);
    check('FI on the curve’s enough: 27,120 ÷ 0.04', two.enoughFiCents, 67800000);
    check('the gap against 3,150 of spending: 945,000 − 678,000', two.value, 26700000);

    /* Typed wins over the curve. */
    h.enough = { monthlyCents: 300000, source: 'entered' };
    const typed = Enough.current(h, TABLES);
    check('typed beats the curve', typed.value, 300000);
    check('and is entered', typed.source, 'entered');
    checkTrue('the curve is still there to read', Money.isOk(Enough.fromCurve(h, TABLES)));
  }

  /* -- Typed above spending: the gap runs the other way ---------------------- */
  {
    const h = household({ enough: 400000 });
    const two = Enough.fiTwo(h, TABLES);
    check('FI on 4,000: 48,000 ÷ 0.04', two.enoughFiCents, 120000000);
    check('the gap is negative: 945,000 − 1,200,000', two.value, -25500000);
    checkTrue('and says enough is above spending', two.enoughAboveSpending === true && two.enoughBelowSpending === false);
    check('the gap a month is negative too', two.monthlyGapCents, -85000);
    checkTrue('the years gap runs negative', two.yearsGap < 0);
    check('years to the bigger number, closed form', two.yearsToEnough.value, closedForm(120000000, 4800000, 2268000, 0.05), 0.1);
    const html = fs.readFileSync(path.join(ROOT, 'rooms/enough.html'), 'utf8');
    checkTrue('the page words it "enough above spending"', /enough above spending/.test(html));
    checkTrue('and never colours it good', /zone: two\.enoughBelowSpending \? 'good' : null/.test(html));
  }
  {
    const h = household({ enough: 315000 });
    const two = Enough.fiTwo(h, TABLES);
    check('enough equal to spending: no gap', two.value, 0);
    checkTrue('neither above nor below', !two.enoughAboveSpending && !two.enoughBelowSpending);
    check('and no years between', two.yearsGap, 0);
  }

  /* -- No investments: years incomplete, the numbers still shown ------------- */
  {
    const h = household({ enough: 260000, investments: null });
    const two = Enough.fiTwo(h, TABLES);
    checkTrue('the two numbers still compute', Money.isOk(two), two.reason);
    check('FI on spending', two.spendFiCents, 94500000);
    check('FI on enough', two.enoughFiCents, 78000000);
    check('the gap in dollars', two.value, 16500000);
    check('years to spending are incomplete', two.yearsToSpend.status, 'incomplete');
    check('years to enough are incomplete', two.yearsToEnough.status, 'incomplete');
    check('no years gap', two.yearsGap, null);
    check('no contribution', two.contribution, null);
    checkTrue('and it says why', /investments/.test(two.yearsReason));
    check('the path cannot be drawn', Enough.path(h, TABLES).status, 'incomplete');
  }
  {
    const h = household({ enough: 260000, spend: 700000 });   /* spending above income: nothing saved */
    const two = Enough.fiTwo(h, TABLES);
    checkTrue('spending more than the pay: the numbers still compute', Money.isOk(two));
    check('but the years do not count down', two.yearsToSpend.status, 'incomplete');
    checkTrue('and it says so', /Nothing is being saved/.test(two.yearsReason));
  }
  {
    const h = household({ enough: 260000, investments: 90000000 });
    const two = Enough.fiTwo(h, TABLES);
    checkTrue('past the enough number already', two.yearsToEnough.alreadyThere === true);
    check('zero years', two.yearsToEnough.value, 0);
    checkTrue('but not past the spending number', !two.yearsToSpend.alreadyThere && two.yearsToSpend.value > 0);
  }

  /* -- The empty household: a reason, never a throw --------------------------- */
  {
    const e = Schema.createHousehold({});
    let threw = false, cur, two, p, pr;
    try { cur = Enough.current(e, TABLES); two = Enough.fiTwo(e, TABLES); p = Enough.path(e, TABLES); pr = Enough.propose(e, TABLES); } catch (err) { threw = true; }
    checkTrue('nothing throws on an empty household', !threw);
    check('enough is incomplete', cur.status, 'incomplete');
    checkTrue('with a reason', typeof cur.reason === 'string' && cur.reason.length > 0);
    check('the two numbers are incomplete', two.status, 'incomplete');
    check('the path is incomplete', p.status, 'incomplete');
    check('the proposal is incomplete', pr.status, 'incomplete');
    check('asking for spending', pr.missing.join(','), 'monthlyExpenses');
    let threw2 = false;
    try { Enough.fiTwo(null, null); Enough.current(undefined, undefined); Enough.fromCurve({}, null); } catch (err) { threw2 = true; }
    checkTrue('nor on nothing at all', !threw2);
  }

  /* -- The view is a view ------------------------------------------------------ */
  {
    const h = household({ enough: 260000 });
    const v = Enough.withMonth(h, 260000);
    check('the view’s month is enough', Schema.monthlyExpensesCents(v).value, 260000);
    check('the household’s month is untouched', Schema.monthlyExpensesCents(h).value, 315000);
    check('FI on the view is FI on enough', Tier0.fireNumber(v).value, 78000000);
    checkTrue('the view shares everything else', v.people === h.people && v.assets === h.assets);
  }

  /* -- The path: the crossings agree with the years ---------------------------- */
  {
    const h = household({ enough: 260000 });
    const p = Enough.path(h, TABLES);
    checkTrue('the path draws', Money.isOk(p), p.reason);
    check('one row a year from year zero', p.rows[0].year, 0);
    check('starting at the investments', p.rows[0].balanceCents, 4800000);
    check('a month of savings: 22,680 ÷ 12', p.monthlyContributionCents, 189000);
    check('at the real return', p.rate, 0.05);
    /* The path compounds month by month, so it crosses a touch before the
       yearly closed form's 21.02: the first yearly row at or past the
       number is the crossing, whichever year that is. */
    checkTrue('spending is crossed at the first yearly row past the number (' + p.crossSpendYear + ')', p.crossSpendYear >= 21 && p.crossSpendYear <= 22
      && p.rows[p.crossSpendYear].balanceCents >= p.spendFiCents && p.rows[p.crossSpendYear - 1].balanceCents < p.spendFiCents);
    check('enough in the year after 18.44', p.crossEnoughYear, 19);
    check('three years past the later crossing', p.value, 25);
    check('so 26 rows', p.rows.length, 26);
    checkTrue('the balance at the enough crossing is at or past the number', p.rows[p.crossEnoughYear].balanceCents >= 78000000 && p.rows[p.crossEnoughYear - 1].balanceCents < 78000000);
    const far = Enough.path(household({ enough: 260000, investments: 100 }), TABLES);
    checkTrue('a long climb is capped at forty years', far.value <= 40);
  }

  /* -- Writing through the spine: one entry, both fields ----------------------- */
  {
    Spine.reset();
    Spine.registerRoom('enough');
    Spine.batch('Enough, a month → $2,600', function () {
      Spine.set('enough.monthlyCents', 260000);
      Spine.set('enough.source', 'entered');
    });
    const h = Spine.getProfile();
    check('the figure lands', h.enough.monthlyCents, 260000);
    check('and its source with it', h.enough.source, 'entered');
    check('as one undo entry, named for the box', Spine.peekUndo().label, 'Enough, a month → $2,600');
    check('the owned field reads it', Ownership.field('enoughMonthly').read(h).value, 260000);
    Spine.undo();
    check('undo clears both', Spine.getProfile().enough.monthlyCents, null);
    check('… and the source', Spine.getProfile().enough.source, null);
    Spine.reset();
  }

  /* -- The page ------------------------------------------------------------------ */
  {
    const html = fs.readFileSync(path.join(ROOT, 'rooms/enough.html'), 'utf8');
    t.Room.IDS.concat(['number', 'chart', 'inputs', 'amounts', 'assumptions', 'reading', 'room-standalone', 'load-notice']).forEach(function (id) {
      checkTrue('the page has #' + id, new RegExp('id="' + id + '"').test(html));
    });
    checkTrue('mounted on the template', /mounted = Room\.mount\(\{/.test(html) && /Room\.mount\(\{/.test(html));
    checkTrue('as the enough room', /id: 'enough'/.test(html));
    checkTrue('declares its live-form discipline and a place for a theme', /LIVE-FORM: built once/.test(html) && /THEMING:/.test(html));
    const order = ['shared/money.js', 'shared/schema.js', 'shared/registry.js', 'shared/reference.js', 'shared/spine-v2.js', 'shared/ownership.js', 'shared/suggest.js', 'shared/progress.js', 'shared/undo.js', 'shared/gate.js', 'shared/rating.js', 'engines/projection.js', 'engines/tier0.js', 'engines/cashflow.js', 'engines/fulfillment.js', 'engines/hourly.js', 'engines/enough.js', 'shared/lens.js', 'shared/charts.js', 'shared/room.js'];
    const positions = order.map(function (s) { return html.indexOf('src="../' + s + '"'); });
    checkTrue('every script is included', positions.every(function (p) { return p >= 0; }));
    checkTrue('in dependency order', positions.every(function (p, i) { return i === 0 || p > positions[i - 1]; }));
    const writes = html.match(/Spine\.set\('([^']+)'/g) || [];
    check('two spine writes', writes.length, 2);
    checkTrue('both under enough.*', writes.every(function (w) { return /Spine\.set\('enough\./.test(w); }));
    checkTrue('no other write helper is used', !/Spine\.upsert|Spine\.remove/.test(html));
    checkTrue('two inputs: the figure and where it came from', /ctl: 'monthlyCents'/.test(html) && /ctl: 'source'/.test(html) && /kind: 'choice'/.test(html));
    checkTrue('the choice offers the curve and typed', /\['curve', 'From the joy curve'\], \['entered', 'Typed'\]/.test(html));
    checkTrue('the figure proposes through Suggest', /propose: function \(h, T\) \{ var p = Enough\.propose/.test(html));
    checkTrue('one chart, an area', (html.match(/Charts\.area\(/g) || []).length === 2 && !/Charts\.(donut|bars|stacked)\(/.test(html));
    checkTrue('with two lines and dots', /hLines: \[/.test(html) && /FI on spending/.test(html) && /FI on enough/.test(html) && /dots: dots/.test(html));
    checkTrue('reads spending and investments as chips', /reads: \['monthlyExpenses', 'investments'\]/.test(html));
    checkTrue('the scope line is the honest one', /scope: 'This room does not judge what is enough; it prices the number you give it against the one you spend\.'/.test(html));
    checkTrue('why speaks to every situation', ['employed', 'selfEmployed', 'mixed', 'student', 'retired', 'betweenJobs'].every(function (s) { return new RegExp(s + ": '").test(html); }));
    checkTrue('and points between jobs at its room', /Registry\.byId\('between-jobs'\)/.test(html));
    checkTrue('the drawer names the withdrawal rate, the real return, the quadrants and the convention', /Withdrawal rate/.test(html) && /Real return/.test(html) && /lines the curve drops/.test(html) && /The stand-in/.test(html));
    checkTrue('no real financial data', !/\$\d{2,3},\d{3},\d{3}/.test(html));
  }
};

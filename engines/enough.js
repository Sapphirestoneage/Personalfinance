/* ==========================================================================
   engines/enough.js — Enough as the denominator.
   BRIEF §8, DECISIONS.md D-093 (the draft), D-101 (the room).
   --------------------------------------------------------------------------
   Enough is the monthly figure you would live on by choice. It is typed, or
   it is proposed: from the joy curve (engines/fulfillment.js) — what you
   spend, less the rated lines in the two low-joy quadrants that are not
   essential — or, until a month is categorised and rated, as 85% of
   spending, a convention and named as one. Either way it becomes a second
   FI number beside the one spending makes, and the distance between the
   two, in dollars and in years, is the cost of not knowing your enough.

   Nothing here is a formula of its own. The FI number is Tier0.fireNumber
   on a view of the household whose month is Enough — one function, the
   same withdrawal rate. The years are Projection.yearsToTargetCents at the
   real return with this year's savings, fractional, exactly the way the
   lens (shared/lens.js fiInputs/yearsFrom) counts months bought and pushed,
   so the years here and the months there agree. The path is
   Projection.pathCents, the loop the dashboard's climb draws.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'),
             Tier0: require('./tier0.js'), Projection: require('./projection.js'), Fulfillment: require('./fulfillment.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, Projection: S.Projection, Fulfillment: S.Fulfillment || null };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Projection, deps.Fulfillment);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Enough = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Projection, Fulfillment) {
  'use strict';

  var MONTHS = 12;
  /* The two quadrants the curve drops: real money that barely registers,
     and small money that does not either. Never an essential line. */
  var LOW_JOY = ['expensive', 'small_meh'];
  /* Until the curve can speak: most people's enough sits under their
     spending. A convention, not a finding, and the drawer says so. */
  var CONVENTION_SHARE = 0.85;
  var PATH_MIN_YEARS = 10, PATH_MAX_YEARS = 40, PATH_TAIL_YEARS = 3;

  /**
   * The knee of the joy curve: spending less the rated lines in the two
   * low-joy quadrants that are not essential. Needs the curve, which needs
   * a categorised month and four ratings; incomplete with the curve's own
   * reason until then.
   */
  function fromCurve(household, tables) {
    if (!Fulfillment) return Money.incomplete('The joy engine is not loaded.', ['fulfillment']);
    var catalog = tables && tables.expenseCategories;
    var c = Fulfillment.curve(household, catalog);
    if (!Money.isOk(c)) return c;
    var essential = {};
    ((catalog && catalog.categories) || []).forEach(function (cat) { essential[cat.id] = !!cat.essential; });
    var dropped = [], kept = [], droppedCents = 0;
    c.plotted.forEach(function (p) {
      if (LOW_JOY.indexOf(p.quadrantId) >= 0 && !essential[p.categoryId]) { dropped.push(p); droppedCents += p.monthlyCents; }
      else kept.push(p);
    });
    return Money.ok(c.spendMonthlyCents - droppedCents, {
      spendMonthlyCents: c.spendMonthlyCents, droppedMonthlyCents: droppedCents,
      dropped: dropped, kept: kept, unrated: c.unrated, ratedCount: c.value,
      spendLineCents: c.spendLineCents, joyLine: c.joyLine
    });
  }

  /**
   * What the box proposes when nothing is typed: the curve's knee when the
   * curve computes, else 85% of spending. `basis` says which; `source` is
   * the sentence the Suggest chip shows.
   */
  function propose(household, tables) {
    var c = fromCurve(household, tables);
    if (Money.isOk(c)) {
      return Money.ok(c.value, { basis: 'curve', curve: c,
        source: 'your joy curve: spending less the low-joy lines' });
    }
    var spend = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(spend)) return Money.incomplete('Add your monthly expenses to propose an enough.', ['monthlyExpenses']);
    return Money.ok(Math.round(spend.value * CONVENTION_SHARE), { basis: 'convention', curveReason: c.reason,
      source: 'most people’s enough sits under their spending (convention)' });
  }

  /**
   * What Enough is right now: typed, else the proposal, else incomplete.
   * `source` is 'entered' | 'curve' | 'convention'; `proposed` says whether
   * it is the person's own figure or a stand-in that was never written.
   */
  function current(household, tables) {
    var e = (household && household.enough) || {};
    if (Money.isEntered(e.monthlyCents)) return Money.ok(e.monthlyCents, { source: e.source || 'entered', proposed: false });
    var p = propose(household, tables);
    if (Money.isOk(p)) return Money.ok(p.value, { source: p.basis, proposed: true, curve: p.curve || null, proposalSource: p.source });
    return Money.incomplete('Set your Enough — type it, or add your monthly expenses so one can be proposed.', ['enough']);
  }

  /* A view of the household whose month is `monthlyCents`, so Tier0's FIRE
     number prices Enough with the one formula and the one withdrawal rate.
     A view, never a write: the spine is untouched. */
  function withMonth(household, monthlyCents) {
    var h = household || {};
    return Object.assign({}, h, { expenses: Object.assign({}, h.expenses || {}, {
      monthlyEssential: { trackedValueCents: monthlyCents, estimatedValueCents: null } }) });
  }

  /* Years to a target at this year's savings and the real return — the
     lens's arithmetic (shared/lens.js fiInputs + yearsFrom), fractional so
     a small change moves it a small amount. */
  function contribution(household, tables) {
    var inv = Schema.investmentsCents(household);
    if (!Money.isOk(inv)) return Money.incomplete('Add your investments to see the years.', ['investments']);
    var rates = Tier0.savingsRate(household, tables);
    var basis = Money.isOk(rates.includingMatch) ? rates.includingMatch : rates.excludingMatch;
    if (!Money.isOk(basis)) return Money.incomplete('Add your income to see the years.', basis.missing);
    if (basis.annualSavingsCents <= 0) return Money.incomplete('Nothing is being saved, so the years do not count down.', ['savingsRate']);
    var a = Schema.resolveAssumptions(household);
    return Money.ok(basis.annualSavingsCents, { investmentsCents: inv.value, annualSavingsCents: basis.annualSavingsCents, rate: a.returnReal, basis: basis.variant });
  }
  function yearsTo(targetCents, c) {
    if (c.investmentsCents >= targetCents) return Money.ok(0, { alreadyThere: true });
    return Projection.yearsToTargetCents({ startCents: Math.max(0, c.investmentsCents), targetCents: targetCents,
      annualRate: c.rate, annualContributionCents: c.annualSavingsCents, fractional: true });
  }

  /**
   * The two FI numbers and the distance between them. `value` is the gap
   * in cents — FI on spending less FI on enough, the cost of not knowing
   * your enough; negative when enough sits above spending. The years to
   * each ride along as Results, incomplete on their own (no investments,
   * nothing saved) without taking the numbers with them.
   */
  function fiTwo(household, tables) {
    var cur = current(household, tables);
    if (!Money.isOk(cur)) return cur;
    var spendFi = Tier0.fireNumber(household);
    if (!Money.isOk(spendFi)) return spendFi;
    var enoughFi = Tier0.fireNumber(withMonth(household, cur.value));
    if (!Money.isOk(enoughFi)) return enoughFi;
    var spendMonthly = Math.round(spendFi.annualExpensesCents / MONTHS);
    var gap = spendFi.value - enoughFi.value;

    var c = contribution(household, tables);
    var toSpend = Money.isOk(c) ? yearsTo(spendFi.value, c) : c;
    var toEnough = Money.isOk(c) ? yearsTo(enoughFi.value, c) : c;
    var yearsGap = Money.isOk(toSpend) && Money.isOk(toEnough) ? toSpend.value - toEnough.value : null;

    return Money.ok(gap, {
      enoughMonthlyCents: cur.value, spendMonthlyCents: spendMonthly, monthlyGapCents: spendMonthly - cur.value,
      spendFiCents: spendFi.value, enoughFiCents: enoughFi.value, gapCents: gap,
      swrRate: spendFi.swrRate, source: cur.source, proposed: cur.proposed, curve: cur.curve || null,
      enoughAboveSpending: cur.value > spendMonthly, enoughBelowSpending: cur.value < spendMonthly,
      yearsToSpend: toSpend, yearsToEnough: toEnough, yearsGap: yearsGap,
      contribution: Money.isOk(c) ? { investmentsCents: c.investmentsCents, annualSavingsCents: c.annualSavingsCents, rate: c.rate, basis: c.basis } : null,
      yearsReason: Money.isOk(c) ? null : c.reason
    });
  }

  /**
   * Investments year by year at the lens's rate and contribution, far
   * enough to see both numbers crossed (or forty years), with the year each
   * is crossed. Projection.pathCents is the loop; nothing is grown here.
   */
  function path(household, tables) {
    var two = fiTwo(household, tables);
    if (!Money.isOk(two)) return two;
    if (!two.contribution) return Money.incomplete(two.yearsReason || 'Add your investments to draw the path.', ['investments']);
    var c = two.contribution;
    var furthest = [two.yearsToSpend, two.yearsToEnough].filter(Money.isOk).map(function (r) { return r.value; });
    var years = furthest.length ? Math.ceil(Math.max.apply(null, furthest)) + PATH_TAIL_YEARS : PATH_MAX_YEARS;
    years = Math.max(PATH_MIN_YEARS, Math.min(PATH_MAX_YEARS, years));
    var p = Projection.pathCents({ startCents: c.investmentsCents, monthlyContributionCents: Math.round(c.annualSavingsCents / MONTHS),
      annualRate: c.rate, years: years });
    if (!Money.isOk(p)) return p;
    function crossing(target) {
      for (var i = 0; i < p.years.length; i++) if (p.years[i].balanceCents >= target) return p.years[i].year;
      return null;
    }
    return Money.ok(years, { rows: p.years, crossSpendYear: crossing(two.spendFiCents), crossEnoughYear: crossing(two.enoughFiCents),
      spendFiCents: two.spendFiCents, enoughFiCents: two.enoughFiCents, rate: c.rate, monthlyContributionCents: Math.round(c.annualSavingsCents / MONTHS) });
  }

  return { LOW_JOY: LOW_JOY, CONVENTION_SHARE: CONVENTION_SHARE, fromCurve: fromCurve, propose: propose, current: current,
    withMonth: withMonth, contribution: contribution, yearsTo: yearsTo, fiTwo: fiTwo, path: path };
});

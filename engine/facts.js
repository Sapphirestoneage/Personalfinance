/* ==========================================================================
   engine/facts.js, what the household and its blocks say about each
   year, before any arithmetic. D-341.
   --------------------------------------------------------------------------
   build(household, assumptions, blocks) reads the stored shape once:
     the adults (shared/schema.js adults), their dates of birth, their
     income sources by type, the employer match, the three FAT boxes and
     the wants line, the health cover, the debts, and every block's
     windows (shared/blocks.js windowsAt, the one place a block's dates
     are read).
   forYear(facts, year, opts) says, for one year, in nominal cents:
     ages at year end, earned income per person (grown, stopped at the
     retire age or by opts), pensions, rental, other income, spending,
     the state, which blocks are open, and the one-off moves (cash in or
     out, a new debt, a new account) that start this year.
   A block's monthly and annual lines count for the months of the year
   its window covers; its one-off lines count once, in the year the
   window opens. That is the flow reading of a block; shared/blocks.js's
   applyAll is the state reading a room draws today.
   Nothing here touches the DOM or localStorage.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) deps = { Schema: require('../shared/schema.js'), Money: require('../shared/money.js'), Blocks: require('../shared/blocks.js') };
  else deps = { Schema: root.SLAF && root.SLAF.Schema, Money: root.SLAF && root.SLAF.Money, Blocks: root.SLAF && root.SLAF.Blocks };
  var api = factory(deps.Schema, deps.Money, deps.Blocks);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Facts = api; }
})(typeof self !== 'undefined' ? self : null, function (Schema, Money, Blocks) {
  'use strict';

  var MONTHS = 12;
  function entered(v) { return Money.isEntered(v); }
  function cents(v) { return entered(v) ? v : 0; }

  /* Income source types onto the engine's income lines. */
  var TYPE_LINE = { w2: 'wages', equity: 'wages', '1099': 'selfEmployment', passive: 'rental', benefit: 'other', pension: 'pension', socialSecurity: 'socialSecurity' };

  function personIndex(facts, ownerIds) {
    var ids = ownerIds || [];
    if (ids.length === 1) { for (var i = 0; i < facts.people.length; i++) if (facts.people[i].id === ids[0]) return i; }
    return 0;
  }

  /** Age at the end of `year` from a date of birth; null when none. */
  function ageAtYearEnd(dob, year) {
    if (!dob) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob));
    if (!m) return null;
    return year - parseInt(m[1], 10);
  }
  /** Age in years at 1 July of `year`, to a half year, for the 59 and a
      half and 55 tests: a January birthday reaches 59.5 by July. */
  function ageMidYear(dob, year) {
    if (!dob) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob));
    if (!m) return null;
    var y = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    return (year - y) + (mo <= 6 ? 0 : -0.5);
  }

  function build(household, A, blocks) {
    var h = household || {};
    var adults = Schema.adults(h);
    var people = adults.map(function (p, i) {
      var lines = { wages: 0, selfEmployment: 0, rental: 0, other: 0, pension: 0, socialSecurity: 0, sideHustle: 0 };
      var match = null, nonTaxable = 0;
      (p.incomeSources || []).forEach(function (s) {
        var g = cents(s.grossAnnualIncomeCents);
        if (s.netOfTax) { nonTaxable += g; return; }
        var line = TYPE_LINE[s.type] || 'wages';
        lines[line] += g;
        var m = s.employerMatch || {};
        if (line === 'wages' && entered(m.matchPercent) && entered(m.matchCapPercentOfSalary)) {
          match = match || { matchPercent: 0, capPercent: 0, wagesCents: 0 };
          match.matchPercent = m.matchPercent; match.capPercent = m.matchCapPercentOfSalary; match.wagesCents += g;
        }
      });
      return { index: i, id: p.id, label: p.label || (i ? 'Partner' : 'You'), dob: p.dob || null,
        birthYear: Schema.birthYearOf(p), retireAge: A.retireAges[i] !== undefined ? A.retireAges[i] : A.retireAge,
        employmentStatus: p.employmentStatus || null, lines: lines, nonTaxableCents: nonTaxable, match: match,
        ss: A.socialSecurity[i] || { monthlyAtFraCents: null, claimAge: 67 } };
    });
    if (!people.length) people.push({ index: 0, id: null, label: 'You', dob: null, birthYear: null, retireAge: A.retireAge, employmentStatus: null,
      lines: { wages: 0, selfEmployment: 0, rental: 0, other: 0, pension: 0, socialSecurity: 0, sideHustle: 0 }, nonTaxableCents: 0, match: null, ss: { monthlyAtFraCents: null, claimAge: 67 } });

    /* Rentals from the property register: rent less running costs and vacancy. */
    var rental = 0;
    (h.property || []).forEach(function (pr) {
      if (!entered(pr.rentMonthlyCents)) return;
      var vac = entered(pr.vacancyRate) ? pr.vacancyRate : 0.08;
      rental += Math.round((pr.rentMonthlyCents * (1 - vac) - cents(pr.opexMonthlyCents)) * MONTHS);
    });
    people[0].lines.rental += rental;

    var fat = Schema.fat(h);
    var needs = 0;
    ['food', 'accommodation', 'transportation'].forEach(function (k) { if (Money.isOk(fat[k])) needs += fat[k].value; });
    var wants = Money.isOk(fat.wants) ? fat.wants.value : 0;
    var dependents = Array.isArray(h.dependents) ? h.dependents.length : 0;
    var r = h.retirement || {};

    var debts = Schema.aggregatableDebts(h).map(function (d) {
      return { id: d.id, label: d.label || d.type || 'Debt', type: d.type || 'other', balanceCents: cents(d.balanceCents),
        rate: entered(d.rate) ? d.rate : 0, minPaymentCents: cents(d.minPaymentCents), owner: personIndex({ people: people }, d.ownerIds) };
    }).filter(function (d) { return d.balanceCents > 0; });

    var blockList = (blocks || []).filter(function (b) { return b && b.active !== false; }).map(function (b) {
      var windows = Blocks.windowsAt(b, blocks).map(function (w) {
        var s = /^(\d{4})-(\d{2})$/.exec(w.start), e = w.end ? /^(\d{4})-(\d{2})$/.exec(w.end) : null;
        return { startYear: +s[1], startMonth: +s[2], endYear: e ? +e[1] : null, endMonth: e ? +e[2] : null };
      });
      return { id: b.id, label: b.label || b.type, type: b.type, windows: windows, lines: b.lines || [] };
    });

    return {
      people: people, filingStatus: Schema.filingStatusOf(h.filingStatus) || (people.length > 1 ? 'married_joint' : 'single'),
      state: h.state || null, dependents: dependents, householdSize: people.length + dependents,
      spending: { needsMonthlyCents: needs, wantsMonthlyCents: wants, entered: Money.isOk(fat.totalCents) || needs > 0 },
      retirement: { contributionPercent: entered(r.contributionPercent) ? r.contributionPercent / 100 : 0, has401k: r.has401k !== false,
        onHdhp: !!r.onHdhp, hsaFamilyPlan: !!r.hsaFamilyPlan },
      debts: debts, blocks: blockList, futureIncome: h.futureIncome || []
    };
  }

  /** Months of `year` a window covers (0 to 12). */
  function monthsCovered(w, year) {
    var from = w.startYear < year ? 1 : (w.startYear === year ? w.startMonth : 13);
    var to = w.endYear === null ? 13 : (w.endYear > year ? 13 : (w.endYear === year ? w.endMonth : 1));
    return Math.max(0, Math.min(13, to) - Math.max(1, from));
  }

  /**
   * forYear(facts, A, year, opts)
   *   opts.stopEarnedIncomeFromYear   FI test: no wages or profit from this year
   *   opts.workUntilYear              Coast test: work to this year whatever the stop age
   * Returns the year's facts in nominal cents.
   */
  function forYear(facts, A, year, opts) {
    var o = opts || {};
    var n = year - A.baseYear;
    var infl = Math.pow(1 + A.inflation, n);
    var wageGrow = Math.pow(1 + A.wageGrowthNominal, n);
    var ages = facts.people.map(function (p) { return ageAtYearEnd(p.dob, year); });
    var agesMid = facts.people.map(function (p) { return ageMidYear(p.dob, year); });
    var out = { year: year, ages: ages, agesMid: agesMid, inflator: infl, people: [], activeBlocks: [], oneOffs: [],
      state: facts.state, spending: {}, income: { pension: 0, other: 0, nonTaxable: 0, rental: 0, socialSecurity: 0 } };
    var earnedStopped = o.stopEarnedIncomeFromYear !== undefined && o.stopEarnedIncomeFromYear !== null && year >= o.stopEarnedIncomeFromYear;

    facts.people.forEach(function (p, i) {
      var retired = o.workUntilYear !== undefined && o.workUntilYear !== null ? year >= o.workUntilYear : (ages[i] !== null && ages[i] >= p.retireAge);
      var working = !retired && !earnedStopped && p.employmentStatus !== 'retired';
      var wages = working ? Math.round(p.lines.wages * wageGrow) : 0;
      var se = working ? Math.round(p.lines.selfEmployment * wageGrow) : 0;
      out.people.push({ index: i, age: ages[i], ageMid: agesMid[i], working: working, wagesCents: wages, seProfitCents: se,
        match: working && p.match ? p.match : null, retireAge: p.retireAge });
      out.income.pension += Math.round(p.lines.pension * infl);
      out.income.other += Math.round(p.lines.other * infl);
      out.income.rental += Math.round(p.lines.rental * infl);
      out.income.nonTaxable += working ? Math.round(p.nonTaxableCents * infl) : 0;
      /* A benefit already being received stays; one not yet claimed starts at the claim age. */
      if (p.lines.socialSecurity) out.income.socialSecurity += Math.round(p.lines.socialSecurity * infl);
    });

    /* Dated future income (a pension that starts at an age, a benefit). */
    (facts.futureIncome || []).forEach(function (f) {
      if (!entered(f.monthlyCents)) return;
      var age0 = ages[0];
      var starts = f.startsOn ? +String(f.startsOn).slice(0, 4) : (entered(f.startsAtAge) && age0 !== null ? year - age0 + f.startsAtAge : A.baseYear);
      var ends = f.endsOn ? +String(f.endsOn).slice(0, 4) : (entered(f.endsAtAge) && age0 !== null ? year - age0 + f.endsAtAge : null);
      if (year < starts || (ends !== null && year >= ends)) return;
      var amt = Math.round(f.monthlyCents * MONTHS * (f.inflationAdjusted === false ? 1 : infl));
      if (f.kind === 'job') { if (!earnedStopped) out.people[0].wagesCents += amt; }
      else if (f.kind === 'benefit') out.income.pension += amt;
      else out.income.other += amt;
    });

    var needs = Math.round(facts.spending.needsMonthlyCents * MONTHS * infl);
    var wants = Math.round(facts.spending.wantsMonthlyCents * MONTHS * infl);
    var sideNet = 0, wagesDelta = 0;

    facts.blocks.forEach(function (b) {
      var months = 0, opensThisYear = false;
      b.windows.forEach(function (w) { months += monthsCovered(w, year); if (w.startYear === year) opensThisYear = true; });
      if (!months && !opensThisYear) return;
      if (months) out.activeBlocks.push({ id: b.id, label: b.label, type: b.type, months: months });
      b.lines.forEach(function (line) {
        var d = line.delta;
        if (d === null || d === undefined) return;
        var p = line.path, extra = line.extra || {};
        if (line.kind === 'oneoff') {
          if (!opensThisYear) return;
          if (p === 'assets.cashCents') out.oneOffs.push({ kind: 'cash', cents: Math.round(d * infl), label: line.label, block: b.label });
          else if (p === 'debt.items') out.oneOffs.push({ kind: 'debt', cents: Math.round(d * infl), rate: entered(extra.rate) ? extra.rate : 0, minPaymentCents: Math.round(cents(extra.minPaymentCents) * infl), label: line.label, block: b.label, type: extra.type || 'other', id: 'block_' + b.id + '_' + (line.id || 'debt') });
          else if (p === 'assets.invested') out.oneOffs.push({ kind: 'invested', cents: Math.round(d * infl), taxCharacter: extra.taxCharacter || 'taxable', label: line.label, block: b.label });
          else if (p === 'assets.property' || p === 'assets.vehicles') out.oneOffs.push({ kind: p === 'assets.property' ? 'home' : 'vehicle', cents: Math.round(d * infl), label: line.label, block: b.label });
          return;
        }
        if (!months) return;
        var annual = line.kind === 'annual' ? d : d * MONTHS;
        var share = months / MONTHS;
        if (p === 'expenses.needs.*') { needs += Math.round(needs * d * share); return; }
        if (p === 'taxes.state') { if (extra.state) out.state = extra.state; return; }
        var amt = Math.round(annual * share * infl);
        if (p.indexOf('expenses.needs.') === 0) needs += amt;
        else if (p === 'expenses.wants' || p === 'expenses.applied' || p === 'expenses') wants += amt;
        else if (p === 'income.grossAnnualCents') { if (!earnedStopped) wagesDelta += Math.round(annual * share * wageGrow); }
        else if (p === 'income.netMonthlyCents' || p === 'income.extraMonthlyCents') sideNet += amt;
      });
    });
    if (wagesDelta) out.people[0].wagesCents = Math.max(0, out.people[0].wagesCents + wagesDelta);
    out.spending = { needsCents: Math.max(0, needs), wantsCents: Math.max(0, wants) };
    out.income.sideHustle = sideNet;
    return out;
  }

  return { build: build, forYear: forYear, ageAtYearEnd: ageAtYearEnd, ageMidYear: ageMidYear, monthsCovered: monthsCovered, personIndex: personIndex };
});

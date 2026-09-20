/* ==========================================================================
   engines/opening.js, the five-input opening. DECISIONS.md D-312.
   --------------------------------------------------------------------------
   One question first: "When can I stop needing a paycheck, and what moves
   that date?" Five facts answer it, age, take-home, spending, what is
   invested and in cash, any debt, and this engine turns them into:

     the FI number       a year of spending over the withdrawal rate
     the band            years to FI at the worst, likely and best real
                         returns (data/opening.json), likely emphasised
     the coast date      when the pot, left alone, would reach the number
                         by the coast age (engines/coast.js, the one walk)
     the savings rate    (take-home − spending) ÷ take-home, "from take-home"
     the stage           under a year of spending invested, income and the
                         rate are the whole outcome; over five, the
                         portfolio does real work (thresholds in the file)
     the levers          the change in the likely date for each opening
                         lever in data/levers.json, ranked by months saved

   Everything is real (today's money). Every figure the household did not
   type comes from data/opening.json, and the room shows each one with its
   source. Nothing here writes.

     Opening.read(household, tables, opts) →
       { status, missing, situation, incomeless, model, savings, fi, band,
         coast, runway, stage, levers, state }

   opts: expectedTakeHomeMonthlyCents (between jobs or a student: what pay
   would look like once it is back, rough), withdrawalRate, realReturns,
   coastTargetAge (session overrides; never stored).
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Coast: require('./coast.js'),
      Debt: require('./debt.js'), Projection: require('./projection.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema, Coast: root.SLAF && root.SLAF.Coast,
      Debt: root.SLAF && root.SLAF.Debt, Projection: root.SLAF && root.SLAF.Projection };
  }
  var api = factory(deps.Money, deps.Schema, deps.Coast, deps.Debt, deps.Projection);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Opening = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Coast, Debt, Projection) {
  'use strict';
  var MONTHS = 12;
  /* The file's figures, in case a page reads before the table is at hand:
     the same values, so a room never shows a different default. */
  var FALLBACK = {
    withdrawalRate: 0.035, withdrawalPoints: { convention: 0.04, likely: 0.035, floor: 0.0325 },
    realReturns: { worst: 0.03, likely: 0.05, best: 0.07 }, coastTargetAge: 65, unknownSpendingShare: 0.7,
    raiseRateReal: 0.02, incomeStepMonthlyCents: 50000, spendingCutShare: 0.10, returnBump: 0.01, debtPayoffYears: 5, horizonYears: 60,
    stages: [
      { id: 'early', investedBelowYears: 1, line: 'Right now income and savings rate are almost all of your outcome. Returns barely matter yet.', returnLeversLast: true },
      { id: 'middle', investedBelowYears: 5, line: null, returnLeversLast: false },
      { id: 'late', investedBelowYears: null, line: 'Your portfolio now does real work. Fees, allocation, and which account you use start to matter.', returnLeversLast: false }
    ],
    leverIds: ['payStep', 'spendCut', 'clearDearest', 'halfRaise', 'returnUp']
  };
  function table(tables) { return (tables && tables.opening) || FALLBACK; }
  function pick(t, key) { return t[key] === undefined ? FALLBACK[key] : t[key]; }

  /* ---- Situation ------------------------------------------------------------ */
  function situationOf(h) {
    var p = Schema.primaryPerson(h);
    var s = p && p.employmentStatus;
    return s === 'retired' ? 'retired' : s === 'unemployed' ? 'betweenJobs' : s === 'student' ? 'student'
      : s === 'selfEmployed' ? 'selfEmployed' : s === 'both' ? 'mixed' : s ? 'employed' : null;
  }

  /* ---- The five inputs, read off the household --------------------------------
     Each is a Result: a blank stays incomplete and names its Ledger row. */
  function inputs(h, tables) {
    var hh = h || {};
    var age = Schema.primaryAge(hh);
    var takeHome = Schema.takeHomeMonthlyCents(hh, tables);
    var spending = Schema.monthlyExpensesCents(hh);
    var invested = Schema.investmentsCents(hh);
    var cash = Schema.cashCents(hh);
    var debts = Schema.aggregatableDebts(hh).filter(function (d) { return Money.isEntered(d.balanceCents) && d.balanceCents > 0; });
    var spendingConfidence = Money.isOk(spending) ? Schema.precisionOf(hh, ['foodMonthly', 'accommodationMonthly', 'transportationMonthly', 'wantsMonthly']).confidence : null;
    return {
      age: Money.isEntered(age) ? Money.ok(age) : Money.incomplete('Add your age.', ['dob']),
      takeHome: takeHome,
      spending: spending,
      spendingRough: spendingConfidence !== null && spendingConfidence !== 'sure',
      invested: invested,
      cash: cash,
      debts: debts,
      hasDebt: hh.meta && hh.meta.hasDebt === true ? true : hh.meta && hh.meta.hasDebt === false ? false : (debts.length ? true : null)
    };
  }

  /* ---- Arithmetic ------------------------------------------------------------- */
  function fiNumberCents(spendingMonthlyCents, withdrawalRate) {
    if (!Money.isEntered(spendingMonthlyCents) || !Money.isEntered(withdrawalRate) || withdrawalRate <= 0) return null;
    return Math.round(spendingMonthlyCents * MONTHS / withdrawalRate);
  }

  /** Months until a pot reaches the number: monthly compounding at the real
   *  rate, the month's saving added at its end. `savingAt(year)` lets a lever
   *  grow the saving. null = never within the horizon; 0 = already there.
   *  Zero return and zero or negative saving are ordinary inputs here. */
  function monthsToFi(investedCents, savingMonthlyCents, annualRate, targetCents, opts) {
    var o = opts || {};
    var horizon = (o.horizonYears || FALLBACK.horizonYears) * MONTHS;
    if (!Money.isEntered(investedCents) || !Money.isEntered(targetCents) || !Money.isEntered(annualRate)) return null;
    if (investedCents >= targetCents) return 0;
    var savingAt = typeof o.savingAt === 'function' ? o.savingAt : function () { return savingMonthlyCents; };
    var rm = Math.pow(1 + annualRate, 1 / MONTHS) - 1;
    var pot = investedCents;
    for (var m = 1; m <= horizon; m++) {
      var before = pot;
      var s = savingAt((m - 1) / MONTHS);
      pot = pot * (1 + rm) + s;
      if (pot >= targetCents) {
        /* Inside the month, by straight line, so two runs a few dollars
           apart do not land on the same whole month. */
        return (m - 1) + (pot > before ? (targetCents - before) / (pot - before) : 1);
      }
      /* Shrinking and below the line: it will never get there. */
      if (pot <= before && pot < targetCents && s <= 0) return null;
    }
    return null;
  }
  function yearsToFi(investedCents, savingMonthlyCents, annualRate, targetCents, opts) {
    var m = monthsToFi(investedCents, savingMonthlyCents, annualRate, targetCents, opts);
    return m === null ? null : m / MONTHS;
  }

  /* The payment a debt frees when it is gone: the entered minimum, the
     convention's minimum, or a level payment over the file's payoff years
     at the debt's rate (a stated stand-in, flagged). */
  function paymentOf(d, tables, t) {
    var rules = tables && tables.debtRules;
    if (rules && Debt && typeof Debt.minimumPaymentCents === 'function') {
      var m = Debt.minimumPaymentCents(d, rules);
      if (Money.isOk(m) && m.value > 0) return { cents: m.value, derived: m.derived === true, standIn: false };
    }
    if (Money.isEntered(d.minPaymentCents) && d.minPaymentCents > 0) return { cents: d.minPaymentCents, derived: false, standIn: false };
    var years = pick(t, 'debtPayoffYears');
    var lp = Projection.levelPaymentCents({ principalCents: d.balanceCents, annualRate: Money.isEntered(d.rate) ? d.rate : 0, months: years * MONTHS });
    return { cents: Money.isOk(lp) ? Math.round(lp.value) : 0, derived: true, standIn: true, years: years };
  }

  /* ---- The model: the numbers one run works from ------------------------------ */
  function model(inp, h, tables, opts) {
    var o = opts || {}, t = table(tables);
    var a = Schema.resolveAssumptions(h, null, tables);
    var takeHome = Money.isOk(inp.takeHome) ? inp.takeHome.value : null;
    var s = situationOf(h);
    var incomeless = (takeHome === null || takeHome <= 0) && (s === 'betweenJobs' || s === 'student');
    /* Between jobs or a student with nothing coming in: the FI view is what
       it looks like once income is back, from a figure they may name. */
    if (incomeless && Money.isEntered(o.expectedTakeHomeMonthlyCents) && o.expectedTakeHomeMonthlyCents > 0) takeHome = o.expectedTakeHomeMonthlyCents;
    var returns = Object.assign({}, pick(t, 'realReturns'), o.realReturns || {});
    var w = Money.isEntered(o.withdrawalRate) ? o.withdrawalRate : pick(t, 'withdrawalRate');
    var debts = inp.debts.map(function (d) {
      var p = paymentOf(d, tables, t);
      return { id: d.id, label: d.label || null, type: d.type || 'other', balanceCents: d.balanceCents, rate: Money.isEntered(d.rate) ? d.rate : null,
        paymentCents: p.cents, paymentStandIn: p.standIn, paymentYears: p.years || null };
    });
    return {
      age: Money.isOk(inp.age) ? inp.age.value : null,
      situation: s,
      incomeless: incomeless,
      expectedTakeHome: incomeless && takeHome !== null && takeHome > 0,
      takeHomeMonthlyCents: takeHome,
      takeHomeSource: Money.isOk(inp.takeHome) ? (inp.takeHome.source || null) : null,
      spendingMonthlyCents: Money.isOk(inp.spending) ? inp.spending.value : null,
      spendingRough: !!inp.spendingRough,
      investedCents: Money.isOk(inp.invested) ? inp.invested.value : null,
      cashCents: Money.isOk(inp.cash) ? inp.cash.value : null,
      debts: debts,
      withdrawalRate: w,
      withdrawalPoints: pick(t, 'withdrawalPoints'),
      returns: returns,
      inflation: a.inflation,
      raiseRateReal: pick(t, 'raiseRateReal'),
      coastTargetAge: Money.isEntered(o.coastTargetAge) ? o.coastTargetAge : pick(t, 'coastTargetAge'),
      horizonYears: pick(t, 'horizonYears')
    };
  }

  function savingMonthly(m) {
    if (!Money.isEntered(m.takeHomeMonthlyCents) || !Money.isEntered(m.spendingMonthlyCents)) return null;
    return m.takeHomeMonthlyCents - m.spendingMonthlyCents;
  }

  /* ---- The band: three runs, the likely one first ------------------------------ */
  function bandOf(m) {
    var fi = fiNumberCents(m.spendingMonthlyCents, m.withdrawalRate);
    var s = savingMonthly(m);
    var out = { fiNumberCents: fi, savingMonthlyCents: s, runs: {}, hasDate: false, alreadyThere: false, reason: null };
    if (fi === null || s === null || !Money.isEntered(m.investedCents)) { out.reason = 'Not every input is in yet.'; return out; }
    if (m.investedCents >= fi) { out.alreadyThere = true; out.hasDate = true; }
    else if (s <= 0) { out.reason = 'Spending is at or above take-home, so nothing is being saved: no date yet.'; return out; }
    ['worst', 'likely', 'best'].forEach(function (k) {
      var months = monthsToFi(m.investedCents, s, m.returns[k], fi, { horizonYears: m.horizonYears });
      out.runs[k] = { returnReal: m.returns[k], months: months, years: months === null ? null : months / MONTHS,
        age: months === null || !Money.isEntered(m.age) ? null : m.age + months / MONTHS };
    });
    out.hasDate = out.hasDate || out.runs.likely.months !== null;
    if (!out.hasDate) out.reason = 'At this pace the number is not reached within ' + m.horizonYears + ' years.';
    return out;
  }

  /* ---- Coast: the one walk in engines/coast.js -------------------------------- */
  function coastOf(m, h, tables) {
    var fi = fiNumberCents(m.spendingMonthlyCents, m.withdrawalRate);
    var s = savingMonthly(m);
    if (fi === null || !Money.isEntered(m.investedCents) || !Money.isEntered(m.age)) return Money.incomplete('Age, spending and what is invested are the three the coast date needs.', ['dob', 'wantsMonthly', 'investments']);
    if (m.coastTargetAge <= m.age) return Money.incomplete('The coast age is behind you; pick a later one.', ['coastTargetAge']);
    return Coast.date(h, tables, { age: m.age, targetAge: m.coastTargetAge, returnReal: m.returns.likely, fiNumberCents: fi,
      investmentsCents: m.investedCents, annualContributionCents: Math.max(0, (s || 0) * MONTHS) });
  }

  /* ---- The stage ---------------------------------------------------------------- */
  function stageOf(m, tables) {
    var stages = pick(table(tables), 'stages');
    if (!Money.isEntered(m.investedCents) || !Money.isEntered(m.spendingMonthlyCents) || m.spendingMonthlyCents <= 0) return null;
    var years = m.investedCents / (m.spendingMonthlyCents * MONTHS);
    for (var i = 0; i < stages.length; i++) {
      var st = stages[i];
      if (!Money.isEntered(st.investedBelowYears) || years < st.investedBelowYears) {
        return { id: st.id, line: st.line || null, returnLeversLast: st.returnLeversLast === true, investedYears: years };
      }
    }
    return null;
  }

  /* ---- The levers: what each does to the likely date ---------------------------- */
  function leverTable(tables) {
    var lv = tables && tables.levers;
    return lv && lv.levers ? lv.levers : null;
  }
  function applyLever(id, L, m, t) {
    var out = Object.assign({}, m, { debts: m.debts.slice() });
    var note = null, savingAt = null;
    var moves = L.moves || {};
    Object.keys(moves).forEach(function (key) {
      var v = moves[key];
      if (key === 'income.takeHomeMonthlyCents') out.takeHomeMonthlyCents = (out.takeHomeMonthlyCents || 0) + v;
      else if (key === 'expenses.*') out.spendingMonthlyCents = Math.max(0, Math.round(out.spendingMonthlyCents * (1 + v)));
      else if (key === 'assumptions.returnReal') out.returns = { worst: m.returns.worst + v, likely: m.returns.likely + v, best: m.returns.best + v };
      else if (key === 'debt.dearest') {
        var dearest = m.debts.slice().sort(function (a, b) { return (b.rate || 0) - (a.rate || 0); })[0];
        if (dearest) {
          out.takeHomeMonthlyCents = (out.takeHomeMonthlyCents || 0) + dearest.paymentCents;
          out.debts = m.debts.filter(function (d) { return d.id !== dearest.id; });
          note = 'Once ' + (dearest.label || 'the dearest debt') + ' is gone its ' + Money.formatCents(dearest.paymentCents) + ' a month is yours again'
            + (dearest.paymentStandIn ? ' (priced as ' + dearest.paymentYears + ' years of level payments; enter its real payment in Debt)' : '') + '.';
        }
      } else if (key === 'income.raiseKeptShare') {
        var base = m.takeHomeMonthlyCents || 0, g = m.raiseRateReal;
        savingAt = function (year) { return savingMonthly(m) + v * base * (Math.pow(1 + g, year) - 1); };
        note = 'Half of every raise, at ' + Math.round(g * 100) + '% a year over inflation, goes to the pot.';
      }
    });
    return { model: out, note: note, savingAt: savingAt };
  }
  function likelyMonths(m, savingAt) {
    var fi = fiNumberCents(m.spendingMonthlyCents, m.withdrawalRate);
    var s = savingMonthly(m);
    if (fi === null || s === null || !Money.isEntered(m.investedCents)) return null;
    if (m.investedCents >= fi) return 0;
    if (s <= 0 && !savingAt) return null;
    return monthsToFi(m.investedCents, s, m.returns.likely, fi, { horizonYears: m.horizonYears, savingAt: savingAt });
  }
  function rankLevers(m, h, tables, stage) {
    var t = table(tables), lv = leverTable(tables);
    if (!lv) return { ranked: [], all: [], baseMonths: null, payFirst: null };
    var base = likelyMonths(m, null);
    var payFirst = null;
    var nominal = m.returns.likely + (m.inflation || 0);
    var all = pick(t, 'leverIds').map(function (id) {
      var L = lv[id];
      if (!L) return null;
      if (L.kind === 'debt' && !m.debts.length) return null;
      var ap = applyLever(id, L, m, t);
      var withMonths = likelyMonths(ap.model, ap.savingAt);
      var saved = base === null || withMonths === null ? null : Math.round(base - withMonths);
      /* What the lever adds to the month's saving, so a household with no
         date yet can still be told which lever moves it most: the first
         job there is one dollar on the right side of zero. */
      var s0 = savingMonthly(m), s1 = savingMonthly(ap.model);
      var gain = s0 === null || s1 === null ? null : Math.round(s1 - s0);
      return { id: id, label: L.label, kind: L.kind || 'other', room: L.room || null, anchor: L.anchor || null,
        monthsSaved: saved, monthsWith: withMonths, givesADate: base === null && withMonths !== null, monthlyGainCents: gain, note: ap.note };
    }).filter(Boolean);
    /* A debt dearer than the expected nominal return is paid first, whatever
       the months say: the guaranteed return beats the hoped-for one. */
    var dearest = m.debts.slice().sort(function (a, b) { return (b.rate || 0) - (a.rate || 0); })[0];
    if (dearest && Money.isEntered(dearest.rate) && dearest.rate > nominal) {
      payFirst = { id: dearest.id, label: dearest.label || 'the dearest debt', rate: dearest.rate, nominalReturn: nominal };
    }
    var returnLast = !!(stage && stage.returnLeversLast);
    var ranked = all.slice().sort(function (a, b) {
      var af = payFirst && a.kind === 'debt' ? 1 : 0, bf = payFirst && b.kind === 'debt' ? 1 : 0;
      if (af !== bf) return bf - af;
      var ar = returnLast && a.kind === 'return' ? 1 : 0, br = returnLast && b.kind === 'return' ? 1 : 0;
      if (ar !== br) return ar - br;
      if (base === null) {
        /* No date to move yet: a lever that gives one first, then by the
           dollars it puts on the right side of zero. */
        if (a.givesADate !== b.givesADate) return a.givesADate ? -1 : 1;
        return (b.monthlyGainCents || 0) - (a.monthlyGainCents || 0);
      }
      var am = a.monthsSaved === null ? -Infinity : a.monthsSaved, bm = b.monthsSaved === null ? -Infinity : b.monthsSaved;
      return bm - am;
    });
    return { ranked: ranked.slice(0, 3), all: all, baseMonths: base, payFirst: payFirst };
  }

  /* ---- The whole reading --------------------------------------------------------- */
  function read(household, tables, opts) {
    var h = household || {};
    var inp = inputs(h, tables);
    var m = model(inp, h, tables, opts);
    var missing = [];
    if (!Money.isOk(inp.age)) missing.push('dob');
    if (!Money.isOk(inp.takeHome) && !m.incomeless) missing.push('takeHomeMonthly');
    if (!Money.isOk(inp.spending)) missing.push('wantsMonthly');
    if (!Money.isOk(inp.invested)) missing.push('investments');
    if (!Money.isOk(inp.cash)) missing.push('cashSavings');
    if (inp.hasDebt === null) missing.push('hasDebt');

    var s = savingMonthly(m);
    var savings = s === null || !m.takeHomeMonthlyCents ? null : {
      monthlyCents: s, annualCents: s * MONTHS,
      rate: m.takeHomeMonthlyCents > 0 ? s / m.takeHomeMonthlyCents : null,
      basis: 'take-home',
      pretaxNote: 'Pretax retirement contributions are not counted yet: the Ledger does not hold them until the workplace plan is entered.'
    };
    var fi = fiNumberCents(m.spendingMonthlyCents, m.withdrawalRate);
    var points = {};
    Object.keys(m.withdrawalPoints).forEach(function (k) { points[k] = { rate: m.withdrawalPoints[k], numberCents: fiNumberCents(m.spendingMonthlyCents, m.withdrawalPoints[k]) }; });
    var band = bandOf(m);
    var coast = fi === null ? null : coastOf(m, h, tables);
    var stage = stageOf(m, tables);
    var levers = rankLevers(m, h, tables, stage);
    var runway = null;
    if (Money.isEntered(m.cashCents) && Money.isEntered(m.spendingMonthlyCents) && m.spendingMonthlyCents > 0) {
      runway = { months: m.cashCents / m.spendingMonthlyCents, cashCents: m.cashCents, spendingMonthlyCents: m.spendingMonthlyCents };
    }
    var state = 'ok';
    if (m.incomeless) state = 'noIncome';
    else if (band.alreadyThere) state = 'pastFi';
    else if (s !== null && s <= 0) state = 'noDate';
    else if (coast && Money.isOk(coast) && coast.reachedNow) state = 'pastCoast';
    var status = missing.length ? 'incomplete' : 'ok';
    return {
      status: status, missing: missing,
      situation: m.situation, incomeless: m.incomeless, expectedTakeHome: m.expectedTakeHome,
      model: m, savings: savings,
      fi: fi === null ? null : { numberCents: fi, withdrawalRate: m.withdrawalRate, points: points, annualSpendingCents: m.spendingMonthlyCents * MONTHS },
      band: band, coast: coast, runway: runway, stage: stage,
      levers: levers.ranked, leversAll: levers.all, baseMonths: levers.baseMonths, payFirst: levers.payFirst,
      state: state,
      negativeNetWorth: Money.isEntered(m.investedCents) && Money.isEntered(m.cashCents)
        ? (m.investedCents + m.cashCents - m.debts.reduce(function (t, d) { return t + d.balanceCents; }, 0)) < 0 : null
    };
  }

  return { read: read, inputs: inputs, model: model, monthsToFi: monthsToFi, yearsToFi: yearsToFi, fiNumberCents: fiNumberCents,
    band: bandOf, coast: coastOf, stage: stageOf, rank: rankLevers, situationOf: situationOf, FALLBACK: FALLBACK };
});

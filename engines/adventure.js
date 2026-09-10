/* ==========================================================================
   engines/adventure.js — five years, several ways, and what shocks them.
   --------------------------------------------------------------------------
   A sandbox over the household's real numbers: pick a way through, walk five
   years, and see where the finish line moves. It WRITES NOTHING. Every figure
   it shows is derived from what the owning rooms already hold, so there is
   no field here for another room to fight over (D-017).

   Money is integer cents throughout. A missing baseline figure produces an
   incomplete result naming what is absent — never a zero, and never a silent
   `|| 0`, because a projection built on an assumed nought is a lie told
   confidently. DECISIONS.md D-167.

   A path is a composition of LEVERS (data/levers.json, shared/levers.js):
   which ones it pulls and how hard. The raise, the extra income and the
   housing cut are read from the levers, never held here, and each path's
   assumption sentence is written from their figures. D-174.

   v2 (D-176): saving is take-home minus spending, never gross. The baseline
   splits cash from what is invested; a crash hits the invested pot only; a
   job loss draws on cash first and reports the runway, and when the cash is
   gone the row says "borrowing from month N" — the pot never goes quietly
   negative. Levers that survive a job loss keep paying through it. The share
   of a raise not kept is spent, which moves the target. Returns run three
   ways from data/return_bands.json. Drift is the baseline every other way is
   measured against; relocate and careermove are offered only when their
   lever applies. Shocks are headwinds or tailwinds. Below the FOO's
   high-interest-debt step, side income goes to that debt first.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/money.js'), require('../shared/schema.js'), require('../shared/levers.js'), require('../shared/bands.js'), require('./foo.js'));
  } else {
    root.SLAF = root.SLAF || {};
    root.SLAF.Adventure = factory(root.SLAF.Money, root.SLAF.Schema, root.SLAF.Levers, root.SLAF.Bands, root.SLAF.Foo || null);
  }
}(typeof self !== 'undefined' ? self : this, function (Money, Schema, Levers, Bands, Foo) {
  'use strict';

  var MONTHS = 12;

  function table(tables) { return (tables && tables.adventurePaths) || null; }
  function lever(tables, id) {
    if (tables && tables.levers) Levers.use(tables.levers);
    return Levers.get(id);
  }

  /** The ways through, straight from data — never inlined here. With a
      household, a way marked `onlyIf` shows only when that lever applies. */
  function paths(tables, household) {
    var t = table(tables);
    if (!t) return [];
    return t.paths.filter(function (p) {
      if (!p.onlyIf || !household) return true;
      if (tables && tables.levers) Levers.use(tables.levers);
      return Levers.applies(p.onlyIf, household);
    });
  }
  function pathById(tables, id) {
    return (table(tables) ? table(tables).paths : []).filter(function (p) { return p.id === id; })[0] || null;
  }
  function baselinePath(tables) {
    return (table(tables) ? table(tables).paths : []).filter(function (p) { return p.baseline; })[0] || null;
  }
  function contingencies(tables) { var t = table(tables); return t ? t.contingencies.slice() : []; }
  function headwinds(tables) { return contingencies(tables).filter(function (c) { return c.kind !== 'tailwind'; }); }
  function tailwinds(tables) { return contingencies(tables).filter(function (c) { return c.kind === 'tailwind'; }); }

  /* ---- Levers, composed ---------------------------------------------------
     A path's levers are `[{ id, scale }]`. What each one does to the walk is
     read from its `moves` (D-174):
       income.grossAnnualCents + raiseKeptShare   a raise every year, the
                                                  unkept share spent
       income.grossAnnualCents, no raiseKeptShare a one-off jump in year one
       income.extraMonthlyCents                   net extra income, ramping
                                                  over `rampYears`
       expenses.needs.<line>                      a share off that line
       expenses.needs.*                           a share off every needs line
     `overrides` (D-176) move a lever's figure without touching the table:
       hustleMonthlyCents, housingShare, hustleHoursPerWeek. */
  function pathLevers(path) {
    return (path.levers || []).map(function (x) {
      var id = typeof x === 'string' ? x : x.id;
      var scale = typeof x === 'object' && Money.isEntered(x.scale) ? x.scale : 1;
      return { id: id, scale: scale };
    });
  }
  function compose(path, tables, overrides) {
    var ov = overrides || {};
    var c = { raiseShare: 0, raiseKeptShare: 1, jumpShare: 0, extraMonthlyCents: 0, extraSurvives: false, rampYears: 0, cuts: [], levers: [], hoursPerWeek: 0, flex: [] };
    var missing = [];
    pathLevers(path).forEach(function (x) {
      var L = lever(tables, x.id);
      if (!L) { missing.push('lever:' + x.id); return; }
      var hours = Money.isEntered(L.hoursPerWeek) ? L.hoursPerWeek : 0;
      if (x.id === 'hustle' && Money.isEntered(ov.hustleHoursPerWeek)) hours = ov.hustleHoursPerWeek;
      c.levers.push({ lever: L, scale: x.scale, hoursPerWeek: hours * x.scale });
      c.hoursPerWeek += hours * x.scale;
      if (L.flex && L.flex !== 'unchanged' && c.flex.indexOf(L.flex) === -1) c.flex.push(L.flex);
      Object.keys(L.moves).forEach(function (m) {
        var base = L.moves[m];
        if (x.id === 'hustle' && m === 'income.extraMonthlyCents' && Money.isEntered(ov.hustleMonthlyCents)) base = ov.hustleMonthlyCents;
        if (x.id === 'househack' && m === 'expenses.needs.accommodation' && Money.isEntered(ov.housingShare)) base = -Math.abs(ov.housingShare);
        var v = base * x.scale;
        if (m === 'income.grossAnnualCents') {
          if (Money.isEntered(L.raiseKeptShare)) { c.raiseShare += v; c.raiseKeptShare = L.raiseKeptShare; }
          else c.jumpShare += v;
        } else if (m === 'income.extraMonthlyCents') {
          c.extraMonthlyCents += v;
          c.extraSurvives = c.extraSurvives || L.survivesJobLoss === true;
          c.rampYears = Math.max(c.rampYears, Money.isEntered(L.rampYears) ? L.rampYears : 0);
        } else if (m === 'expenses.needs.*') {
          Schema.FAT_NEEDS.forEach(function (k) { c.cuts.push({ key: k, share: -v, survives: L.survivesJobLoss === true }); });
        } else if (m.indexOf('expenses.needs.') === 0) {
          c.cuts.push({ key: m.slice('expenses.needs.'.length), share: -v, survives: L.survivesJobLoss === true });
        }
      });
    });
    if (missing.length) return Money.incomplete('A lever this path pulls is not in data/levers.json.', missing);
    return Money.ok(c);
  }

  /** One lever, one plain sentence, from its own figures (or the figures the
      steppers moved them to). Used for the path cards and the assumptions
      drawer alike, so they cannot disagree. */
  function leverSentence(L, scale, overrides) {
    var s = Money.isEntered(scale) ? scale : 1;
    var ov = overrides || {};
    var pct = function (v) { return Math.round(Math.abs(v) * 100) + '%'; };
    var out = [];
    Object.keys(L.moves).forEach(function (m) {
      var base = L.moves[m];
      if (L.id === 'hustle' && m === 'income.extraMonthlyCents' && Money.isEntered(ov.hustleMonthlyCents)) base = ov.hustleMonthlyCents;
      if (L.id === 'househack' && m === 'expenses.needs.accommodation' && Money.isEntered(ov.housingShare)) base = -Math.abs(ov.housingShare);
      var v = base * s;
      if (m === 'income.grossAnnualCents' && Money.isEntered(L.raiseKeptShare)) {
        out.push('A ' + pct(v) + ' real raise a year, ' + (L.raiseKeptShare >= 1 ? 'every raise saved rather than spent'
          : L.raiseKeptShare <= 0 ? 'every raise spent' : pct(L.raiseKeptShare) + ' of each raise saved') + '.');
      } else if (m === 'income.grossAnnualCents') {
        out.push('Pay ' + pct(v) + ' ' + (v >= 0 ? 'higher' : 'lower') + ' from year one.');
      } else if (m === 'income.extraMonthlyCents') {
        var hours = L.id === 'hustle' && Money.isEntered(ov.hustleHoursPerWeek) ? ov.hustleHoursPerWeek : L.hoursPerWeek;
        var ramp = Money.isEntered(L.rampYears) && L.rampYears > 0
          ? (L.rampYears === 1 ? ', half in year one and in full from year two' : ', ramping over the first ' + L.rampYears + ' years') : '';
        out.push(Money.formatCents(v) + ' a month net of its own costs and tax' + ramp + (hours ? ', for ' + Math.round(hours * s * 10) / 10 + ' hours a week' : '') + '.');
      } else if (m === 'expenses.needs.*') {
        out.push('Every needs line ' + (v < 0 ? 'down' : 'up') + ' ' + pct(v) + '.');
      } else if (m === 'expenses.needs.accommodation') {
        out.push('Housing ' + (v < 0 ? 'down' : 'up') + ' ' + pct(v) + ' - your rent or mortgage line, read from Cash Flow.');
      } else if (m.indexOf('expenses.needs.') === 0) {
        out.push('The ' + m.slice('expenses.needs.'.length) + ' line ' + (v < 0 ? 'down' : 'up') + ' ' + pct(v) + '.');
      }
    });
    return out.join(' ');
  }

  /** The path's assumption, written from its levers' figures. */
  function describe(path, tables, overrides) {
    var c = compose(path, tables, overrides);
    if (!Money.isOk(c)) return c.reason;
    return c.value.levers.map(function (x) { return leverSentence(x.lever, x.scale, overrides); }).join(' ');
  }

  /** Every lever any path pulls, once each, in first-use order. */
  function leversUsed(tables) {
    var seen = [], out = [];
    (table(tables) ? table(tables).paths : []).forEach(function (p) {
      pathLevers(p).forEach(function (x) {
        if (seen.indexOf(x.id) > -1) return;
        var L = lever(tables, x.id);
        if (L) { seen.push(x.id); out.push(L); }
      });
    });
    return out;
  }

  /* ---- Where the household stands ---------------------------------------- */
  /**
   * The run's opening position. Incomplete unless income, spending and a
   * portfolio are all really known. Cash and invested are kept apart: a
   * crash hits one, a job loss draws on the other.
   */
  function baseline(household, tables) {
    /* Take-home, never gross: saving is what is left after tax AND
       spending, and the tax is estimated in one place (Schema, D-171). */
    var income = Schema.takeHomeAnnualCents(household, tables);
    var monthly = Schema.monthlyExpensesCents(household);
    var invested = Schema.investmentsCents(household);
    var cash = Schema.cashCents(household);

    var missing = [];
    if (!Money.isOk(income)) missing = missing.concat(income.missing && income.missing.length ? income.missing : ['grossAnnualIncome']);
    if (!Money.isOk(monthly)) missing.push('monthlyExpenses');
    if (!Money.isOk(invested) && !Money.isOk(cash)) missing.push('investments');
    if (missing.length) {
      return Money.incomplete('Five years needs what you earn, what you spend and what you have.', missing);
    }
    var t = table(tables);
    var annualSpend = monthly.value * MONTHS;
    /* An unknown balance is not a zero balance: it simply does not join in,
       and the row says which side is unknown. */
    var investedCents = Money.isOk(invested) ? invested.value : null;
    var cashCents = Money.isOk(cash) ? cash.value : null;
    return Money.ok({
      annualIncomeCents: income.value,
      /* 15.4: the share of pay that keeps coming when the job goes (rent,
         a pension, contract work), as take-home. D-181. */
      survivingAnnualIncomeCents: (function () { var s = Schema.survivingGrossAnnualIncomeCents(household); return Money.isOk(s) ? Math.round(income.value * s.share) : 0; })(),
      grossAnnualIncomeCents: income.grossAnnualIncomeCents,
      estimatedTaxCents: income.estimatedTaxCents,
      annualSpendCents: annualSpend,
      monthlySpendCents: monthly.value,
      investedCents: investedCents,
      cashCents: cashCents,
      portfolioCents: (investedCents || 0) + (cashCents || 0),
      targetCents: t ? targetCents(annualSpend, t.withdrawalRate) : null,
      targetYears: t ? Math.round(1 / t.withdrawalRate) : null
    });
  }

  /** Annual spending times 25 — the same arithmetic the FIRE room uses. */
  function targetCents(annualSpendCents, withdrawalRate) {
    return Math.round(annualSpendCents / withdrawalRate);
  }

  /* ---- The applies-to-you gate ------------------------------------------- */
  /**
   * Below or at the FOO's high-interest-debt step, this room says so in one
   * sentence and routes side income to that debt first. Reads the ladder
   * through engines/foo.js; with no rules loaded it stands aside.
   */
  function gate(household, tables) {
    var rules = tables && tables.fooRules;
    if (!Foo || !rules || !rules.ladder) return { blocked: false, known: false, debtCents: 0 };
    var e = Foo.evaluate(household, tables);
    if (e.status !== 'ok' || !e.placement) return { blocked: false, known: false, debtCents: 0 };
    var debtStep = (rules.ladder.filter(function (r) { return r.key === 'high_interest_debt'; })[0] || {}).step;
    if (!Money.isEntered(debtStep)) return { blocked: false, known: true, debtCents: 0 };
    var blocked = e.placement.step <= debtStep;
    var above = Foo.highInterestDebts(household, rules.thresholds || {}).above;
    var debtCents = above.reduce(function (t, d) { return t + d.balanceCents; }, 0);
    return {
      blocked: blocked, known: true, step: e.placement.step, label: e.placement.label, debtCents: debtCents,
      sentence: blocked
        ? 'The Financial Order of Operations puts you at step ' + e.placement.step + ' (' + e.placement.label + '), before the high-interest-debt step. '
          + 'So in this room any side income pays ' + (debtCents > 0 ? Money.formatCents(debtCents) + ' of high-interest debt' : 'that step') + ' first, and joins the pot only after.'
        : null
    };
  }

  /* ---- The walk ------------------------------------------------------------ */
  /**
   * Walk the years. Returns one row per year plus a summary.
   *   opts.pathId, opts.shockIds, opts.returnRate (else the table's),
   *   opts.overrides { hustleMonthlyCents, housingShare, hustleHoursPerWeek },
   *   opts.routeToDebt (default: what gate() says), opts.debtCents.
   */
  function run(household, tables, opts) {
    var t = table(tables);
    if (!t) return Money.incomplete('The strategy table is not loaded.', ['adventurePaths']);
    var o = opts || {};
    var base = baseline(household, tables);
    if (!Money.isOk(base)) return base;

    var path = pathById(tables, o.pathId);
    if (!path) return Money.incomplete('Pick a way through first.', ['path']);
    var composed = compose(path, tables, o.overrides);
    if (!Money.isOk(composed)) return composed;
    var L = composed.value;

    var shocks = {};
    (o.shockIds || []).forEach(function (id) {
      var c = contingencies(tables).filter(function (x) { return x.id === id; })[0];
      if (c) shocks[c.id] = c;
    });

    var g = o.routeToDebt === undefined || o.debtCents === undefined ? gate(household, tables) : null;
    var routeToDebt = o.routeToDebt === undefined ? g.blocked : !!o.routeToDebt;
    var debtLeft = routeToDebt ? (o.debtCents === undefined ? g.debtCents : o.debtCents) : 0;

    var b = base.value;
    var income = b.annualIncomeCents;
    var survivingIncome = b.survivingAnnualIncomeCents || 0;
    var spend = b.annualSpendCents;
    var invested = b.investedCents === null ? 0 : b.investedCents;
    var cash = b.cashCents;                  /* null = unknown, never zero */
    var borrowed = 0;
    var rate = Money.isEntered(o.returnRate) ? o.returnRate : t.returnRateReal;

    /* A cut reads the REAL line from FAT (D-172). Only when the
       accommodation line is blank does it fall back to the table's share of
       spending, and then it says so beside the number. Any other blank line
       makes the run incomplete, naming the line. */
    var housingBasis = null, assumedShare = null, cutMonthly = 0;
    var fat = L.cuts.length ? Schema.fat(household) : null;
    for (var i = 0; i < L.cuts.length; i++) {
      var cut = L.cuts[i], line = fat[cut.key];
      if (line && Money.isOk(line)) {
        var c = Math.round(line.value * cut.share);
        spend = Math.max(0, spend - c * MONTHS);
        cutMonthly += c;
        if (cut.key === 'accommodation') housingBasis = 'accommodation';
      } else if (cut.key === 'accommodation') {
        assumedShare = t.accommodationShareFallback;
        var c2 = Math.round(spend / MONTHS * assumedShare * cut.share);
        spend = Math.max(0, spend - c2 * MONTHS);
        cutMonthly += c2;
        housingBasis = 'assumed';
      } else {
        return Money.incomplete('This way cuts the ' + cut.key + ' line, which is not filled in.', [cut.key + 'Monthly']);
      }
    }
    /* A job change is a one-off jump before year one, taken on take-home
       at the same effective rate: the walk is on what you keep. */
    if (L.jumpShare) income = Math.round(income * (1 + L.jumpShare));

    var rows = [];
    for (var year = 1; year <= t.years; year++) {
      var events = [];
      var borrowedInYear = 0;
      /* The raise is real; the share of it not kept is spent from then on. */
      var raise = Math.round(income * L.raiseShare);
      income += raise;
      spend += Math.round(raise * (1 - L.raiseKeptShare));
      /* New side income rarely arrives at full size: it ramps over the
         lever's rampYears (one year: half in year one, full from two). */
      var ramp = L.rampYears > 0 && year <= L.rampYears ? year / (L.rampYears + 1) : 1;
      var extra = Math.round(L.extraMonthlyCents * MONTHS * ramp);

      if (shocks.inflation) { spend = Math.round(spend * (1 + shocks.inflation.spendingDriftReal)); events.push(shocks.inflation.label); }
      if (shocks.raise && shocks.raise.shockYear === year) { income = Math.round(income * (1 + shocks.raise.incomeJumpShare)); events.push(shocks.raise.label); }

      /* Side income below the debt step goes to the debt first. */
      var debtPaid = 0;
      if (routeToDebt && debtLeft > 0 && extra > 0) {
        debtPaid = Math.min(debtLeft, extra);
        debtLeft -= debtPaid;
        extra -= debtPaid;
        events.push(debtLeft > 0 ? 'side income to debt' : 'high-interest debt cleared');
      }

      var earned = income + extra;
      var lostMonths = 0, runwayMonths = null, borrowingFromMonth = null;
      var saved;
      if (shocks.jobloss && shocks.jobloss.shockYear === year) {
        /* The job stops for part of the year. Spending continues. Levers
           that survive keep paying. The gap comes out of cash, month by
           month; when the cash is gone the row says so, and the pot is
           never quietly drawn below zero. */
        lostMonths = Math.round(MONTHS * shocks.jobloss.incomeLostShareOfYear);
        events.push(shocks.jobloss.label);
        var monthlySpend = spend / MONTHS;
        /* 15.4: the sources that survive a job loss keep paying (D-181). */
        var survivingMonthly = (L.extraSurvives ? extra / MONTHS : 0) + Math.min(income, survivingIncome) / MONTHS;
        var gapMonthly = Math.max(0, monthlySpend - survivingMonthly);
        var workingShare = (MONTHS - lostMonths) / MONTHS;
        var workingSaved = Math.round((income + extra) * workingShare - spend * workingShare);
        earned = Math.round(income * workingShare + extra * workingShare + survivingMonthly * lostMonths);
        var covered = 0;
        if (cash !== null && gapMonthly > 0) {
          runwayMonths = Math.floor(cash / gapMonthly);
          covered = Math.min(lostMonths, runwayMonths);
          cash -= Math.round(gapMonthly * covered);
        } else if (gapMonthly > 0) {
          runwayMonths = 0;
        }
        if (gapMonthly > 0 && covered < lostMonths) {
          borrowingFromMonth = covered + 1;
          borrowedInYear = Math.round(gapMonthly * (lostMonths - covered));
          borrowed += borrowedInYear;
        }
        saved = workingSaved - Math.round(gapMonthly * lostMonths);
        /* The working months' saving repays what was borrowed first. */
        if (workingSaved > 0 && borrowed > 0) { var repay = Math.min(borrowed, workingSaved); borrowed -= repay; workingSaved -= repay; }
        invested = Math.round(invested * (1 + rate)) + Math.max(0, workingSaved);
      } else {
        saved = earned - spend;
        if (saved >= 0) {
          var toPot = saved;
          if (borrowed > 0) { var rp = Math.min(borrowed, saved); borrowed -= rp; toPot = saved - rp; }
          invested = Math.round(invested * (1 + rate)) + toPot;
        } else {
          /* Spending past income: cash first, then borrowing. The pot grows
             on its own and is not sold down. */
          invested = Math.round(invested * (1 + rate));
          var gap = -saved;
          if (cash !== null && cash > 0) { var fromCash = Math.min(cash, gap); cash -= fromCash; gap -= fromCash; }
          if (gap > 0) { borrowed += gap; borrowedInYear = gap; borrowingFromMonth = borrowingFromMonth || 1; }
        }
      }
      if (shocks.crash && shocks.crash.shockYear === year) { invested = Math.round(invested * (1 + shocks.crash.portfolioShockShare)); events.push(shocks.crash.label); }

      var target = targetCents(spend, t.withdrawalRate);
      var pot = invested + (cash === null ? 0 : cash) - borrowed;
      rows.push({
        year: year,
        incomeCents: earned,
        spendCents: spend,
        savedCents: saved,
        investedCents: invested,
        cashCents: cash,
        borrowedCents: borrowed,
        borrowedInYearCents: borrowedInYear,
        debtPaidCents: debtPaid,
        debtLeftCents: routeToDebt ? debtLeft : null,
        portfolioCents: pot,
        targetCents: target,
        events: events,
        lostMonths: lostMonths || null,
        runwayMonths: runwayMonths,
        borrowingFromMonth: borrowingFromMonth,
        /* Negative saving is a real answer, not an error: it is what a job loss
           or runaway spending actually does, and hiding it would be the lie. */
        savingsRate: earned > 0 ? saved / earned : null,
        shareOfTarget: target > 0 ? pot / target : null
      });
    }

    var last = rows[rows.length - 1];
    var steadySaved = last.incomeCents - last.spendCents;      /* a clean final year, no shock in it */
    var gainMonthly = Math.round(L.extraMonthlyCents) + cutMonthly;
    var hourly = L.hoursPerWeek > 0 ? Levers.hourlyFor(gainMonthly, L.hoursPerWeek) : Money.incomplete('This way costs no extra hours.', ['hoursPerWeek']);
    return Money.ok({
      pathId: path.id,
      label: path.label,
      baseline: !!path.baseline,
      assumption: describe(path, tables, o.overrides),
      levers: L.levers.map(function (x) { return { id: x.lever.id, label: x.lever.label, scale: x.scale, hoursPerWeek: x.hoursPerWeek }; }),
      hoursPerWeek: Math.round(L.hoursPerWeek * 10) / 10,
      monthlyGainCents: gainMonthly,
      impliedHourlyCents: Money.isOk(hourly) ? hourly.value : null,
      flex: L.flex.length ? L.flex.join(', ') : 'unchanged',
      housingBasis: housingBasis,
      assumedAccommodationShare: assumedShare,
      accommodationNote: housingBasis === 'assumed'
        ? 'assumed ' + Math.round(assumedShare * 100) + '% of spending because accommodation is not filled in' : null,
      routedToDebt: routeToDebt,
      debtLeftCents: routeToDebt ? debtLeft : null,
      returnRate: rate,
      rows: rows,
      portfolioCents: last.portfolioCents,
      investedCents: last.investedCents,
      cashCents: last.cashCents,
      borrowedCents: last.borrowedCents,
      targetCents: last.targetCents,
      shareOfTarget: last.shareOfTarget,
      savingsRate: last.incomeCents > 0 ? steadySaved / last.incomeCents : null,
      yearsAfter: yearsFrom(last.portfolioCents, last.targetCents, steadySaved, rate)
    });
  }

  /**
   * Years from the end of the walk to the target, at the final year's saving.
   * Null when the target is already met, and null - never Infinity, and never
   * a cheerful large number - when nothing is being saved and it never arrives.
   */
  function yearsFrom(potCents, targetCents2, annualSavedCents, rate) {
    if (potCents >= targetCents2) return 0;
    if (annualSavedCents <= 0 && rate <= 0) return null;
    var pot = potCents, years = 0;
    while (pot < targetCents2 && years < 100) {
      pot = Math.round(pot * (1 + rate)) + annualSavedCents;
      years++;
      if (pot <= potCents && annualSavedCents <= 0) return null;   /* going nowhere */
    }
    return years >= 100 ? null : years;
  }

  /** The same walk at the low, likely and high real return (D-170). */
  function threeWays(household, tables, opts) {
    return Bands.threeWays(tables, function (r) {
      return run(household, tables, Object.assign({}, opts || {}, { returnRate: r }));
    });
  }

  /** Every path this household is offered, run the same way, for the side-by-side. */
  function compare(household, tables, shockIds, opts) {
    var o = Object.assign({}, opts || {});
    return paths(tables, household).map(function (p) {
      var r = run(household, tables, Object.assign({}, o, { pathId: p.id, shockIds: shockIds || [] }));
      return { pathId: p.id, label: p.label, line: p.line, baseline: !!p.baseline, result: r };
    });
  }

  /**
   * Screen one: one card a way, every card already carrying the pot after
   * five years, the years to FI after that, the hours a week it costs, what
   * an hour of the extra earns, one flexibility tag, and its delta against
   * Drift. No winner. Sorted by opts.sort: 'fi' (default) | 'hours' | 'dollars'.
   */
  function cards(household, tables, opts) {
    var o = opts || {};
    var rows = compare(household, tables, o.shockIds || [], o).filter(function (c) { return Money.isOk(c.result); });
    var drift = rows.filter(function (c) { return c.baseline; })[0] || null;
    var yearsToFI = function (v) { return v.yearsAfter === null ? null : (table(tables).years + v.yearsAfter); };
    var out = rows.map(function (c) {
      var v = c.result.value;
      var d = drift ? drift.result.value : null;
      var mine = yearsToFI(v), theirs = d ? yearsToFI(d) : null;
      return {
        pathId: c.pathId, label: c.label, line: c.line, baseline: c.baseline,
        assumption: v.assumption,
        potCents: v.portfolioCents,
        yearsAfter: v.yearsAfter,
        yearsToFI: mine,
        hoursPerWeek: v.hoursPerWeek,
        impliedHourlyCents: v.impliedHourlyCents,
        monthlyGainCents: v.monthlyGainCents,
        flex: v.flex,
        delta: !d || c.baseline ? null : {
          potCents: v.portfolioCents - d.portfolioCents,
          years: mine === null || theirs === null ? null : theirs - mine      /* positive = sooner */
        }
      };
    });
    var sort = o.sort || 'fi';
    var key = function (x) {
      if (sort === 'hours') return x.hoursPerWeek;
      if (sort === 'dollars') return -x.potCents;
      return x.yearsToFI === null ? 1e9 : x.yearsToFI;
    };
    var rest = out.filter(function (x) { return !x.baseline; }).sort(function (a, b) { return key(a) - key(b); });
    return out.filter(function (x) { return x.baseline; }).concat(rest);
  }

  return {
    baseline: baseline,
    paths: paths,
    pathById: pathById,
    baselinePath: baselinePath,
    pathLevers: pathLevers,
    compose: compose,
    describe: describe,
    leverSentence: leverSentence,
    leversUsed: leversUsed,
    contingencies: contingencies,
    headwinds: headwinds,
    tailwinds: tailwinds,
    gate: gate,
    run: run,
    threeWays: threeWays,
    compare: compare,
    cards: cards,
    yearsFrom: yearsFrom,
    targetCents: targetCents
  };
}));

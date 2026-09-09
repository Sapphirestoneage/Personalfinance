/* ==========================================================================
   engines/adventure.js — five years, four ways, and what shocks them.
   --------------------------------------------------------------------------
   A sandbox over the household's real numbers: pick a strategy, walk five
   years one at a time, and see where the finish line moves. It WRITES NOTHING.
   Every figure it shows is derived from what the owning rooms already hold, so
   there is no field here for another room to fight over (D-017).

   Money is integer cents throughout. A missing baseline figure produces an
   incomplete result naming what is absent — never a zero, and never a silent
   `|| 0`, because a projection built on an assumed nought is a lie told
   confidently. DECISIONS.md D-167.

   A path is a composition of LEVERS (data/levers.json, shared/levers.js):
   which ones it pulls and how hard. The raise, the extra income and the
   housing cut are read from the levers, never held here, and each path's
   assumption sentence is written from their figures. D-174.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../shared/money.js'), require('../shared/schema.js'), require('../shared/levers.js'));
  } else {
    root.SLAF = root.SLAF || {};
    root.SLAF.Adventure = factory(root.SLAF.Money, root.SLAF.Schema, root.SLAF.Levers);
  }
}(typeof self !== 'undefined' ? self : this, function (Money, Schema, Levers) {
  'use strict';

  function table(tables) { return (tables && tables.adventurePaths) || null; }
  function lever(tables, id) {
    if (tables && tables.levers) Levers.use(tables.levers);
    return Levers.get(id);
  }

  /** The four strategies, straight from data — never inlined here. */
  function paths(tables) { var t = table(tables); return t ? t.paths.slice() : []; }

  /* ---- Levers, composed ---------------------------------------------------
     A path's levers are `[{ id, scale }]`. What each one does to the walk is
     read from its `moves` (D-174):
       income.grossAnnualCents + raiseKeptShare   a raise every year, the
                                                  unkept share spent
       income.grossAnnualCents, no raiseKeptShare a one-off jump in year one
       income.extraMonthlyCents                   net extra income, ramping
                                                  over `rampYears`
       expenses.needs.<line>                      a share off that line
       expenses.needs.*                           a share off every needs line */
  function pathLevers(path) {
    return (path.levers || []).map(function (x) {
      var id = typeof x === 'string' ? x : x.id;
      var scale = typeof x === 'object' && Money.isEntered(x.scale) ? x.scale : 1;
      return { id: id, scale: scale };
    });
  }
  function compose(path, tables) {
    var c = { raiseShare: 0, raiseKeptShare: 1, jumpShare: 0, extraMonthlyCents: 0, rampYears: 0, cuts: [], levers: [] };
    var missing = [];
    pathLevers(path).forEach(function (x) {
      var L = lever(tables, x.id);
      if (!L) { missing.push('lever:' + x.id); return; }
      c.levers.push({ lever: L, scale: x.scale });
      Object.keys(L.moves).forEach(function (m) {
        var v = L.moves[m] * x.scale;
        if (m === 'income.grossAnnualCents') {
          if (Money.isEntered(L.raiseKeptShare)) { c.raiseShare += v; c.raiseKeptShare = L.raiseKeptShare; }
          else c.jumpShare += v;
        } else if (m === 'income.extraMonthlyCents') {
          c.extraMonthlyCents += v;
          c.rampYears = Math.max(c.rampYears, Money.isEntered(L.rampYears) ? L.rampYears : 0);
        } else if (m === 'expenses.needs.*') {
          Schema.FAT_NEEDS.forEach(function (k) { c.cuts.push({ key: k, share: -v }); });
        } else if (m.indexOf('expenses.needs.') === 0) {
          c.cuts.push({ key: m.slice('expenses.needs.'.length), share: -v });
        }
      });
    });
    if (missing.length) return Money.incomplete('A lever this path pulls is not in data/levers.json.', missing);
    return Money.ok(c);
  }

  /** One lever, one plain sentence, from its own figures. Used for the path
      cards and the assumptions drawer alike, so they cannot disagree. */
  function leverSentence(L, scale) {
    var s = Money.isEntered(scale) ? scale : 1;
    var pct = function (v) { return Math.round(Math.abs(v) * 100) + '%'; };
    var out = [];
    Object.keys(L.moves).forEach(function (m) {
      var v = L.moves[m] * s;
      if (m === 'income.grossAnnualCents' && Money.isEntered(L.raiseKeptShare)) {
        out.push('A ' + pct(v) + ' real raise a year, ' + (L.raiseKeptShare >= 1 ? 'every raise saved rather than spent'
          : L.raiseKeptShare <= 0 ? 'every raise spent' : pct(L.raiseKeptShare) + ' of each raise saved') + '.');
      } else if (m === 'income.grossAnnualCents') {
        out.push('Pay ' + pct(v) + ' ' + (v >= 0 ? 'higher' : 'lower') + ' from year one.');
      } else if (m === 'income.extraMonthlyCents') {
        var ramp = Money.isEntered(L.rampYears) && L.rampYears > 0
          ? (L.rampYears === 1 ? ', half in year one and in full from year two' : ', ramping over the first ' + L.rampYears + ' years') : '';
        out.push(Money.formatCents(v) + ' a month net of its own costs and tax' + ramp + '.');
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
  function describe(path, tables) {
    var c = compose(path, tables);
    if (!Money.isOk(c)) return c.reason;
    return c.value.levers.map(function (x) { return leverSentence(x.lever, x.scale); }).join(' ');
  }

  /** Every lever any path pulls, once each, in first-use order. */
  function leversUsed(tables) {
    var seen = [], out = [];
    paths(tables).forEach(function (p) {
      pathLevers(p).forEach(function (x) {
        if (seen.indexOf(x.id) > -1) return;
        var L = lever(tables, x.id);
        if (L) { seen.push(x.id); out.push(L); }
      });
    });
    return out;
  }
  function pathById(tables, id) {
    return paths(tables).filter(function (p) { return p.id === id; })[0] || null;
  }
  function contingencies(tables) { var t = table(tables); return t ? t.contingencies.slice() : []; }

  /**
   * Where the household stands today, as the run's opening position.
   * Incomplete unless income, spending and a portfolio are all really known.
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
    /* Cash counts towards the pot only when it is known; an unknown balance is
       not a zero balance, so it simply does not join in. */
    var pot = (Money.isOk(invested) ? invested.value : 0) + (Money.isOk(cash) ? cash.value : 0);
    return Money.ok({
      annualIncomeCents: income.value,
      grossAnnualIncomeCents: income.grossAnnualIncomeCents,
      estimatedTaxCents: income.estimatedTaxCents,
      annualSpendCents: monthly.value * 12,
      portfolioCents: pot
    });
  }

  /** Annual spending times 25 — the same arithmetic the FIRE room uses. */
  function targetCents(annualSpendCents, withdrawalRate) {
    return Math.round(annualSpendCents / withdrawalRate);
  }

  /**
   * Walk the years. Returns one row per year plus a summary.
   * `shockIds` is a list of contingency ids to apply on the way through.
   */
  function run(household, tables, opts) {
    var t = table(tables);
    if (!t) return Money.incomplete('The strategy table is not loaded.', ['adventurePaths']);
    var o = opts || {};
    var base = baseline(household, tables);
    if (!Money.isOk(base)) return base;

    var path = pathById(tables, o.pathId);
    if (!path) return Money.incomplete('Pick a way through first.', ['path']);
    var composed = compose(path, tables);
    if (!Money.isOk(composed)) return composed;
    var L = composed.value;

    var shocks = {};
    (o.shockIds || []).forEach(function (id) {
      var c = contingencies(tables).filter(function (x) { return x.id === id; })[0];
      if (c) shocks[c.id] = c;
    });

    var b = base.value;
    var income = b.annualIncomeCents;
    var spend = b.annualSpendCents;
    var pot = b.portfolioCents;
    /* The table's rate unless the caller asks for another - the three-way
       band line runs the same walk at the low and high returns. D-170. */
    var rate = Money.isEntered(o.returnRate) ? o.returnRate : t.returnRateReal;

    /* A cut reads the REAL line from FAT (D-172). Only when the
       accommodation line is blank does it fall back to the table's share of
       spending, and then it says so beside the number. Any other blank line
       makes the run incomplete, naming the line. */
    var housingBasis = null, assumedShare = null;
    var fat = L.cuts.length ? Schema.fat(household) : null;
    for (var i = 0; i < L.cuts.length; i++) {
      var cut = L.cuts[i], line = fat[cut.key];
      if (line && Money.isOk(line)) {
        spend = Math.max(0, spend - Math.round(line.value * 12 * cut.share));
        if (cut.key === 'accommodation') housingBasis = 'accommodation';
      } else if (cut.key === 'accommodation') {
        assumedShare = t.accommodationShareFallback;
        spend = Math.round(spend * (1 - (assumedShare * cut.share)));
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
      /* The raise is real; the share of it not kept is spent from then on. */
      var raise = Math.round(income * L.raiseShare);
      income += raise;
      spend += Math.round(raise * (1 - L.raiseKeptShare));
      /* New side income rarely arrives at full size: it ramps over the
         lever's rampYears (one year: half in year one, full from two). */
      var ramp = L.rampYears > 0 && year <= L.rampYears ? year / (L.rampYears + 1) : 1;
      var extra = Math.round(L.extraMonthlyCents * 12 * ramp);

      if (shocks.inflation) spend = Math.round(spend * (1 + shocks.inflation.spendingDriftReal));
      if (shocks.raise && shocks.raise.shockYear === year) {
        income = Math.round(income * (1 + shocks.raise.incomeJumpShare));
      }

      var earned = income + extra;
      if (shocks.jobloss && shocks.jobloss.shockYear === year) {
        earned = Math.round(earned * (1 - shocks.jobloss.incomeLostShareOfYear));
      }

      var saved = earned - spend;
      pot = Math.round(pot * (1 + rate)) + saved;
      if (shocks.crash && shocks.crash.shockYear === year) {
        pot = Math.round(pot * (1 + shocks.crash.portfolioShockShare));
      }

      var target = targetCents(spend, t.withdrawalRate);
      rows.push({
        year: year,
        incomeCents: earned,
        spendCents: spend,
        savedCents: saved,
        portfolioCents: pot,
        targetCents: target,
        /* Negative saving is a real answer, not an error: it is what a job loss
           or runaway spending actually does, and hiding it would be the lie. */
        savingsRate: earned > 0 ? saved / earned : null,
        shareOfTarget: target > 0 ? pot / target : null
      });
    }

    var last = rows[rows.length - 1];
    return Money.ok({
      pathId: path.id,
      label: path.label,
      assumption: describe(path, tables),
      levers: L.levers.map(function (x) { return { id: x.lever.id, label: x.lever.label, scale: x.scale }; }),
      housingBasis: housingBasis,
      assumedAccommodationShare: assumedShare,
      accommodationNote: housingBasis === 'assumed'
        ? 'assumed ' + Math.round(assumedShare * 100) + '% of spending because accommodation is not filled in' : null,
      rows: rows,
      portfolioCents: last.portfolioCents,
      targetCents: last.targetCents,
      shareOfTarget: last.shareOfTarget,
      yearsAfter: yearsFrom(last.portfolioCents, last.targetCents, last.savedCents, rate)
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

  /** Every path run on the same household, for the side-by-side. */
  function compare(household, tables, shockIds) {
    return paths(tables).map(function (p) {
      var r = run(household, tables, { pathId: p.id, shockIds: shockIds || [] });
      return { pathId: p.id, label: p.label, line: p.line, result: r };
    });
  }

  return {
    baseline: baseline,
    paths: paths,
    pathById: pathById,
    pathLevers: pathLevers,
    compose: compose,
    describe: describe,
    leverSentence: leverSentence,
    leversUsed: leversUsed,
    contingencies: contingencies,
    run: run,
    compare: compare,
    yearsFrom: yearsFrom,
    targetCents: targetCents
  };
}));

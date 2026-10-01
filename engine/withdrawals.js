/* ==========================================================================
   engine/withdrawals.js, where a year's shortfall comes from, and what
   each draw costs in tax and penalty. D-341.
   --------------------------------------------------------------------------
   The order (editable in assumptions.withdrawalOrder), default:
     1. cash above the emergency-fund floor
     2. taxable, realising the gain share against basis
     3. Roth IRA contribution basis (always free)
     4. seasoned conversion layers (five tax years old, or owner past 59.5)
     5. pretax: ordinary income, plus the 10% penalty before 59.5 unless
        the Rule of 55 (workplace plan, left work at 55 or later) or a
        72(t) SEPP exception is on
     6. Roth earnings: free after 59.5 and the five-year rule, otherwise
        ordinary income plus the penalty
     7. HSA: free up to the year's healthcare, otherwise ordinary income
        plus a 20% penalty before 65
   When the order is exhausted the cash floor is spent, then unseasoned
   conversion layers (penalty, no tax), and whatever is still short is
   reported as unmet: the balance never goes negative, the warning does.
   Required minimum distributions are worked out here too (rmd), from the
   age that applies to each person's birth year.
   Pure: draw() reads the state and returns amounts; apply() moves them.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) deps = { Accounts: require('./accounts.js') };
  else deps = { Accounts: root.SLAF && root.SLAF.Engine && root.SLAF.Engine.Accounts };
  var api = factory(deps.Accounts);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Engine = root.SLAF.Engine || {}; root.SLAF.Engine.Withdrawals = api; }
})(typeof self !== 'undefined' ? self : null, function (Accounts) {
  'use strict';

  function dollars(c) { return '$' + Math.round(c / 100).toLocaleString('en-US'); }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function sum(a) { return a.reduce(function (t, v) { return t + v; }, 0); }

  function penaltyFreePretax(p, isK401, A) {
    if (p.ageMid !== null && p.ageMid >= 59.5) return true;
    if (A.exceptions.sepp) return true;
    if (A.exceptions.ruleOf55 && isK401 && !p.working && p.ageMid !== null && p.ageMid >= 55) return true;
    return false;
  }

  /** The required minimum distribution per person for the year, from the
      start-of-year pretax balances. */
  function rmd(state, people, tax, year) {
    var R = tax.federal.requiredMinimumDistributions;
    return people.map(function (p, i) {
      if (p.age === null || p.birthYear === null) return 0;
      var startAge = null;
      for (var k = 0; k < R.startAgeByBirthYear.length; k++) {
        var row = R.startAgeByBirthYear[k];
        if (row.bornUpTo === null || p.birthYear <= row.bornUpTo) { startAge = row.age; break; }
      }
      if (startAge === null || p.age < startAge) return 0;
      var divisor = R.uniformLifetimeTable[String(Math.min(110, Math.max(72, p.age)))];
      if (!divisor) return 0;
      return Math.round((state.pretax401k[i] + state.pretaxIra[i]) / divisor);
    });
  }

  function empty(n) {
    return { cashCents: 0, taxable: { grossCents: 0, gainCents: 0, basisCents: 0 }, rothBasis: zeros(n), seasonedConversions: zeros(n),
      unseasonedConversions: zeros(n), pretax401k: zeros(n), pretaxIra: zeros(n), rothEarnings: zeros(n), hsa: zeros(n),
      totalCents: 0, unmetCents: 0, ordinaryIncomeCents: 0, longTermGainsCents: 0, penaltyBaseCents: 0, hsaPenaltyCents: 0,
      rothEarningsTaxableCents: 0, hsaTaxableCents: 0, pretaxByPerson: zeros(n), layersTaken: zeros(n).map(function () { return []; }), fromAccountsCents: 0, warnings: [], explain: [] };
  }

  /**
   * draw(needCents, state, ctx)
   *   ctx: { year, people: [{ index, age, ageMid, working, label }], A, cashFloorCents, healthcareCents }
   */
  function draw(needCents, state, ctx) {
    var n = state.pretax401k.length, A = ctx.A, people = ctx.people;
    var out = empty(n);
    var left = Math.max(0, Math.round(needCents));
    if (!left) return out;
    var cashTaken = 0;
    var layersTaken = state.rothIra.map(function () { return []; });

    function takePretax(i, isK401, amount) {
      var bal = isK401 ? state.pretax401k[i] : state.pretaxIra[i];
      var take = Math.min(amount, Math.max(0, bal - (isK401 ? out.pretax401k[i] : out.pretaxIra[i])));
      if (take <= 0) return 0;
      if (isK401) out.pretax401k[i] += take; else out.pretaxIra[i] += take;
      out.pretaxByPerson[i] += take;
      out.ordinaryIncomeCents += take;
      if (!penaltyFreePretax(people[i], isK401, A)) { out.penaltyBaseCents += take; out.warnings.push('Withdrawal before 59 and a half triggers the 10% penalty in ' + ctx.year + ' (' + dollars(take) + ' from ' + (isK401 ? 'the workplace plan' : 'the IRA') + ').'); }
      return take;
    }

    (A.withdrawalOrder || []).forEach(function (step) {
      if (left <= 0) return;
      if (step === 'cash') {
        var avail = Math.max(0, state.cash - ctx.cashFloorCents - cashTaken);
        var t = Math.min(left, avail);
        if (t > 0) { cashTaken += t; left -= t; out.explain.push(dollars(t) + ' from cash above the emergency fund.'); }
        else if (left > 0 && state.cash > 0) out.explain.push('Cash is at or under the emergency fund floor, so other accounts come first.');
      } else if (step === 'taxable') {
        var avT = Math.max(0, state.taxable.value - out.taxable.grossCents);
        var tt = Math.min(left, avT);
        if (tt > 0) {
          var gainShare = state.taxable.value > 0 ? Math.max(0, 1 - state.taxable.basis / state.taxable.value) : 0;
          var gain = Math.round(tt * gainShare);
          out.taxable.grossCents += tt; out.taxable.gainCents += gain; out.taxable.basisCents += tt - gain;
          out.longTermGainsCents += gain; left -= tt;
          out.explain.push(dollars(tt) + ' sold from the taxable account, of which ' + dollars(gain) + ' is long-term gain.');
        }
      } else if (step === 'rothBasis') {
        people.forEach(function (p, i) {
          if (left <= 0) return;
          var av = Math.max(0, state.rothIra[i].basis - out.rothBasis[i]);
          var t2 = Math.min(left, av);
          if (t2 > 0) { out.rothBasis[i] += t2; left -= t2; out.explain.push(dollars(t2) + ' of Roth IRA contributions, tax and penalty free.'); }
        });
      } else if (step === 'seasonedConversions') {
        people.forEach(function (p, i) {
          state.rothIra[i].layers.forEach(function (l, k) {
            if (left <= 0) return;
            var seasoned = ctx.year >= l.year + 5 || (p.ageMid !== null && p.ageMid >= 59.5);
            if (!seasoned) return;
            var used = layersTaken[i][k] || 0;
            var t3 = Math.min(left, Math.max(0, l.cents - used));
            if (t3 > 0) { layersTaken[i][k] = used + t3; out.seasonedConversions[i] += t3; left -= t3; out.explain.push(dollars(t3) + ' from the ' + l.year + ' conversion layer, seasoned.'); }
          });
        });
      } else if (step === 'pretax') {
        /* The person whose draw is penalty free goes first. */
        var orderP = people.slice().sort(function (a, b) { return (penaltyFreePretax(b, false, A) ? 1 : 0) - (penaltyFreePretax(a, false, A) ? 1 : 0); });
        orderP.forEach(function (p) {
          if (left <= 0) return;
          var i = p.index;
          var first = A.exceptions.ruleOf55 && penaltyFreePretax(p, true, A) && !penaltyFreePretax(p, false, A);
          left -= takePretax(i, first, left);
          if (left > 0) left -= takePretax(i, !first, left);
        });
      } else if (step === 'rothEarnings') {
        people.forEach(function (p, i) {
          if (left <= 0) return;
          var av = Math.max(0, state.rothIra[i].earnings - out.rothEarnings[i]);
          var t4 = Math.min(left, av);
          if (t4 <= 0) return;
          var fiveYears = A.rothOpenedYear === null || ctx.year - A.rothOpenedYear >= 5;
          var qualified = p.ageMid !== null && p.ageMid >= 59.5 && fiveYears;
          out.rothEarnings[i] += t4; left -= t4;
          if (qualified) out.explain.push(dollars(t4) + ' of Roth earnings, qualified, tax free.');
          else { out.rothEarningsTaxableCents += t4; out.ordinaryIncomeCents += t4; if (p.ageMid === null || p.ageMid < 59.5) out.penaltyBaseCents += t4; out.warnings.push('Roth earnings taken early in ' + ctx.year + ' are taxed' + (p.ageMid === null || p.ageMid < 59.5 ? ' and penalised' : '') + '.'); }
        });
      } else if (step === 'hsa') {
        people.forEach(function (p, i) {
          if (left <= 0) return;
          var av = Math.max(0, state.hsa[i] - out.hsa[i]);
          var t5 = Math.min(left, av);
          if (t5 <= 0) return;
          var free = Math.min(t5, Math.max(0, (ctx.healthcareCents || 0) - sum(out.hsa)));
          var taxed = t5 - free;
          out.hsa[i] += t5; left -= t5;
          if (taxed > 0) { out.hsaTaxableCents += taxed; out.ordinaryIncomeCents += taxed; if (p.age !== null && p.age < 65) out.hsaPenaltyCents += Math.round(taxed * 0.2); }
          out.explain.push(dollars(free) + ' from the HSA for healthcare' + (taxed ? ', and ' + dollars(taxed) + ' more, taxed' : '') + '.');
        });
      }
    });
    /* Last resorts. */
    if (left > 0) {
      var floorCash = Math.max(0, state.cash - cashTaken);
      var t6 = Math.min(left, floorCash);
      if (t6 > 0) { cashTaken += t6; left -= t6; out.warnings.push('The emergency fund is drawn down in ' + ctx.year + '.'); out.explain.push(dollars(t6) + ' from the emergency fund.'); }
    }
    if (left > 0) {
      people.forEach(function (p, i) {
        state.rothIra[i].layers.forEach(function (l, k) {
          if (left <= 0) return;
          var used = layersTaken[i][k] || 0;
          var t7 = Math.min(left, Math.max(0, l.cents - used));
          if (t7 > 0) { layersTaken[i][k] = used + t7; out.unseasonedConversions[i] += t7; left -= t7; if (p.ageMid === null || p.ageMid < 59.5) out.penaltyBaseCents += t7; out.warnings.push('An unseasoned ' + l.year + ' conversion layer is drawn in ' + ctx.year + ' and penalised.'); }
        });
      });
    }
    out.cashCents = cashTaken;
    out.unmetCents = left;
    out.layersTaken = layersTaken;
    roundAll(out);
    out.totalCents = cashTaken + out.taxable.grossCents + sum(out.rothBasis) + sum(out.seasonedConversions) + sum(out.unseasonedConversions)
      + sum(out.pretax401k) + sum(out.pretaxIra) + sum(out.rothEarnings) + sum(out.hsa);
    out.fromAccountsCents = out.totalCents - cashTaken;
    if (left > 0) out.warnings.push('Money runs out in ' + ctx.year + ': ' + dollars(left) + ' of spending has nothing to come from.');
    return out;
  }

  /** Whole cents on every figure a row will carry. */
  function roundAll(o) {
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (typeof v === 'number') o[k] = Math.round(v);
      else if (Array.isArray(v)) v.forEach(function (x, i) { if (typeof x === 'number') v[i] = Math.round(x); else if (x && typeof x === 'object') roundAll(x); });
      else if (v && typeof v === 'object') roundAll(v);
    });
  }

  /** Move the drawn amounts out of the balances (not the cash: the caller
      settles cash as the residual of the year's flows). */
  function apply(state, d) {
    state.taxable.value -= d.taxable.grossCents; state.taxable.basis -= d.taxable.basisCents;
    if (state.taxable.value < 1) { state.taxable.value = 0; state.taxable.basis = 0; }
    for (var i = 0; i < state.pretax401k.length; i++) {
      state.pretax401k[i] -= d.pretax401k[i]; state.pretaxIra[i] -= d.pretaxIra[i];
      state.rothIra[i].basis -= d.rothBasis[i]; state.rothIra[i].earnings -= d.rothEarnings[i]; state.hsa[i] -= d.hsa[i];
      (d.layersTaken[i] || []).forEach(function (t, k) { if (t) state.rothIra[i].layers[k].cents -= t; });
      state.rothIra[i].layers = state.rothIra[i].layers.filter(function (l) { return l.cents > 0.5; });
      /* A rounded draw can leave a fraction of a cent: that is zero. */
      if (state.pretax401k[i] < 1) state.pretax401k[i] = 0;
      if (state.pretaxIra[i] < 1) state.pretaxIra[i] = 0;
      if (state.hsa[i] < 1) state.hsa[i] = 0;
      if (state.rothIra[i].basis < 1) state.rothIra[i].basis = 0;
      if (state.rothIra[i].earnings < 1) state.rothIra[i].earnings = 0;
    }
  }

  return { draw: draw, apply: apply, rmd: rmd, penaltyFreePretax: penaltyFreePretax };
});

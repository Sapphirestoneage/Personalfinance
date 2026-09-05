/* ==========================================================================
   engines/ledger.js — the tax engine for dated income, and the month it adds
   up to. DECISIONS.md D-128.
   --------------------------------------------------------------------------
   An income ENTRY (shared/schema.js createIncomeEntry) is a dated event with
   a kind, an amount, a frequency and a tax method. This module is the one
   place an entry becomes a net figure:

     none   a gift, or anything unticked as taxable: net = gross.
     w2     withholding: gross × the household's effective rate — the same
            blended federal-plus-FICA lookup Tier 0 uses for take-home
            (data/effective_tax_rates_2026.json), read at the household's
            annual gross so a $2,000 paycheque is withheld at the rate the
            year's pay lands in, not at the rate $2,000 a year would.
     se     self-employment: profit = gross − the costs of producing it (the
            entry's own deductible costs plus any expense logged against it
            and marked deductible); SE tax on the annualised profit through
            engines/selfemployed.js (the wage base already used by W-2 pay
            counted), scaled back to the entry; income tax on profit less
            half the SE tax at the effective rate less the employee FICA
            share — the same arithmetic quarterlyEstimated() does, so there
            is one of it.

   Three entries with the same gross come back three different ways, and
   none is a passthrough. The month: how many times a recurring entry lands
   in a YYYY-MM from its received-on day and frequency, a one-time entry on
   its date, archived entries never, hidden ones always.

   Money is integer cents. A missing amount is missing, never zero.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Reference: require('../shared/reference.js'),
             Income: require('./income.js'), SelfEmployed: require('./selfemployed.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Reference: S.Reference, Income: S.Income, SelfEmployed: S.SelfEmployed };
  }
  var api = factory(deps.Money, deps.Schema, deps.Reference, deps.Income, deps.SelfEmployed);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Ledger = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Reference, Income, SelfEmployed) {
  'use strict';

  var MONTHS = 12;
  var MS_PER_DAY = 86400000;

  /* ---- Frequencies ---------------------------------------------------------
     Times a year each frequency lands: engines/income.js's own bases, so a
     fortnight is 26 and twice a month would be 24 here as it is there. */
  function periodsPerYear(frequency) {
    if (frequency === 'once') return null;
    var b = Income.basisById(frequency);
    return b && Money.isEntered(b.periods) ? b.periods : null;
  }
  /** Gross a year for a recurring entry; a one-time entry is its amount. */
  function annualGrossCents(entry) {
    if (!entry || !Money.isEntered(entry.amountCents)) return null;
    var p = periodsPerYear(entry.frequency);
    return p === null ? entry.amountCents : Math.round(entry.amountCents * p);
  }
  /** Gross a month, for a recurring entry only. */
  function monthlyGrossCents(entry) {
    var p = periodsPerYear(entry && entry.frequency);
    if (p === null || !Money.isEntered(entry.amountCents)) return null;
    return Math.round(entry.amountCents * p / MONTHS);
  }

  /* ---- Lists ---------------------------------------------------------------- */
  function entries(household) { return ((household && household.ledger && household.ledger.income) || []); }
  function activeEntries(household) { return entries(household).filter(function (e) { return e && e.active !== false; }); }
  function byId(household, id) { return entries(household).filter(function (e) { return e.id === id; })[0] || null; }
  /** Expense log rows linked to an income entry. */
  function linkedExpenses(household, entryId) {
    return ((household && household.expenses && household.expenses.entries) || []).filter(function (x) { return x && x.linkedIncomeId === entryId; });
  }

  /* ---- Costs ----------------------------------------------------------------
     The costs of producing an entry: its own sub-table, plus what was logged
     against it in the Expenses section — deductible ones only count toward
     the tax base; all of them count toward "what it cost". */
  function costs(entry, household) {
    var own = ((entry && entry.costs) || []).filter(function (c) { return Money.isEntered(c.amountCents); });
    var linked = entry ? linkedExpenses(household, entry.id).filter(function (x) { return Money.isEntered(x.amountCents) && x.active !== false; }) : [];
    var sum = function (list, pred) { return list.filter(pred || function () { return true; }).reduce(function (t, c) { return t + c.amountCents; }, 0); };
    return {
      allCents: sum(own) + sum(linked),
      deductibleCents: sum(own, function (c) { return c.deductible !== false; }) + sum(linked, function (x) { return x.deductible === true; }),
      ownCents: sum(own), linkedCents: sum(linked),
      ownCount: own.length, linkedCount: linked.length
    };
  }

  /* ---- The household's rate ------------------------------------------------
     The effective rate the year's pay lands in. The household's annual
     gross first (Start Here's sources); failing that, the ledger's own
     recurring entries annualised; failing that, this entry alone. */
  function householdAnnualGross(household, entry) {
    var g = Schema.grossAnnualIncomeCents(household);
    if (Money.isOk(g) && g.value > 0) return { cents: g.value, basis: 'sources' };
    var sum = 0, any = false;
    activeEntries(household).forEach(function (e) {
      if (e.frequency === 'once' || e.taxMethod === 'none') return;
      var a = annualGrossCents(e);
      if (Money.isEntered(a)) { sum += a; any = true; }
    });
    if (any) return { cents: sum, basis: 'ledger' };
    var own = annualGrossCents(entry);
    return { cents: Money.isEntered(own) ? own : null, basis: 'entry' };
  }
  function w2AnnualWages(household) {
    var sum = 0;
    activeEntries(household).forEach(function (e) {
      if (e.frequency === 'once' || e.taxMethod !== 'w2') return;
      var a = annualGrossCents(e);
      if (Money.isEntered(a)) sum += a;
    });
    if (sum === 0) {
      var g = Schema.grossAnnualIncomeCents(household);
      if (Money.isOk(g)) sum = g.value;
    }
    return sum;
  }

  /**
   * netOf(entry, household, tables) — the entry netted by its method.
   *   value              netCents: gross − costs − tax
   *   grossCents, costsCents (deductible), allCostsCents, taxableCents,
   *   taxCents, takeHomeCents (gross − tax), effectiveRate (tax ÷ gross),
   *   method, pieces { seTaxCents, incomeTaxCents, rate, basis }
   */
  function netOf(entry, household, tables) {
    var T = tables || {};
    if (!entry) return Money.incomplete('No income entry.', ['entry']);
    if (!Money.isEntered(entry.amountCents)) return Money.incomplete('Add the amount to see what it nets.', ['amountCents']);
    var gross = entry.amountCents;
    var c = costs(entry, household);
    var costsCents = Schema.costsAllowed(entry.kind) ? c.deductibleCents : 0;
    var allCosts = Schema.costsAllowed(entry.kind) ? c.allCents : 0;
    var method = entry.taxable === false ? 'none' : entry.taxMethod;
    var done = function (tax, taxable, pieces) {
      var t = Math.max(0, Math.round(tax));
      return Money.ok(gross - allCosts - t, {
        grossCents: gross, costsCents: costsCents, allCostsCents: allCosts, taxableCents: taxable,
        taxCents: t, takeHomeCents: gross - t, effectiveRate: gross > 0 ? t / gross : 0,
        method: method, pieces: pieces || {}
      });
    };
    if (method === 'none') return done(0, 0, { why: entry.kind === 'gift' ? 'A gift is not income to the one who receives it.' : 'Marked not taxable.' });

    var fs = household && household.filingStatus;
    if (!fs) return Money.incomplete('Choose a filing status in Start Here to net this.', ['filingStatus']);
    if (!T.effectiveTaxRates) return Money.incomplete('The tax rate table is not loaded.', ['effectiveTaxRates']);
    var annual = householdAnnualGross(household, entry);
    if (!Money.isEntered(annual.cents)) return Money.incomplete('Add your income to place this in a tax band.', ['grossAnnualIncome']);
    var rate = Reference.lookupEffectiveTaxRate(T.effectiveTaxRates, annual.cents / 100, fs);
    if (!Money.isOk(rate)) return rate;

    if (method === 'w2') {
      /* Withholding at the year's blended rate: federal plus the employee
         half of FICA, which is what the table blends. */
      return done(gross * rate.value, gross, { rate: rate.value, basis: annual.basis, annualGrossCents: annual.cents, referenceVersion: rate.referenceVersion || T.effectiveTaxRates.version });
    }
    /* se: profit after costs, SE tax on the annualised profit (the wage base
       already used by W-2 pay counted), scaled back; income tax on the
       profit less half the SE tax, at the rate less the FICA share. */
    if (!T.seTax) return Money.incomplete('The self-employment tax table is not loaded.', ['seTax']);
    var profit = Math.max(0, gross - costsCents);
    var p = periodsPerYear(entry.frequency);
    var scale = p === null ? 1 : p;
    var annualProfit = Math.round(profit * scale);
    var se = SelfEmployed.selfEmploymentTax(annualProfit, fs, T.seTax, { priorWagesCents: w2AnnualWages(household) });
    if (!Money.isOk(se)) return se;
    var seHere = se.value / scale;
    var halfHere = (se.deductibleHalfCents || 0) / scale;
    var incomeRate = Math.max(0, rate.value - (T.seTax.employeeFicaRate || 0));
    var incomeTax = Math.max(0, profit - halfHere) * incomeRate;
    return done(seHere + incomeTax, profit, {
      seTaxCents: Math.round(seHere), incomeTaxCents: Math.round(incomeTax), rate: rate.value, incomeRate: incomeRate,
      basis: annual.basis, annualProfitCents: annualProfit, referenceVersion: T.seTax.version
    });
  }

  /* ---- The month ------------------------------------------------------------ */
  function ym(date) { return typeof date === 'string' && date.length >= 7 ? date.slice(0, 7) : null; }
  function thisMonth(now) { var d = now ? new Date(now) : new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1); }
  function daysIn(year, monthIndex) { return new Date(year, monthIndex + 1, 0).getDate(); }
  function iso(y, m, d) { return y + '-' + (m + 1 < 10 ? '0' : '') + (m + 1) + '-' + (d < 10 ? '0' : '') + d; }
  function parseYm(s) { var m = /^(\d{4})-(\d{2})$/.exec(s || ''); return m ? { y: +m[1], m: +m[2] - 1 } : null; }

  /**
   * occurrences(entry, 'YYYY-MM') — the dates the entry lands in that
   * month. A one-time entry: its date, if in the month. Weekly and
   * fortnightly: every 7 / 14 days from the received-on day, forward and
   * back, so a fortnightly cheque lands two or three times. Monthly: the
   * received-on day of the month, clamped. Annual: the received-on day in
   * its month. No received-on date: an average share, undated.
   */
  function occurrences(entry, month) {
    var p = parseYm(month);
    if (!entry || !p || !Money.isEntered(entry.amountCents)) return [];
    var dim = daysIn(p.y, p.m);
    var first = new Date(p.y, p.m, 1), last = new Date(p.y, p.m, dim);
    var anchor = entry.receivedOn ? new Date(entry.receivedOn + 'T00:00:00') : null;
    if (anchor && isNaN(anchor.getTime())) anchor = null;
    var out = [];
    if (entry.frequency === 'once') {
      if (ym(entry.receivedOn) === month) out.push({ date: entry.receivedOn, cents: entry.amountCents });
      return out;
    }
    if (!anchor) {
      /* Undated recurring: its average month, on the 1st, marked estimated. */
      var avg = monthlyGrossCents(entry);
      if (Money.isEntered(avg)) out.push({ date: iso(p.y, p.m, 1), cents: avg, estimated: true });
      return out;
    }
    if (entry.frequency === 'monthly') {
      var d = Math.min(anchor.getDate(), dim);
      out.push({ date: iso(p.y, p.m, d), cents: entry.amountCents });
      return out;
    }
    if (entry.frequency === 'annual') {
      if (anchor.getMonth() === p.m) out.push({ date: iso(p.y, p.m, Math.min(anchor.getDate(), dim)), cents: entry.amountCents });
      return out;
    }
    var step = entry.frequency === 'weekly' ? 7 : 14;
    var a0 = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    var offset = Math.round((first - a0) / MS_PER_DAY);
    var k = Math.floor(offset / step);
    for (var i = k - 1; ; i++) {
      var day = new Date(a0.getFullYear(), a0.getMonth(), a0.getDate() + i * step);
      if (day > last) break;
      if (day < first) continue;
      out.push({ date: iso(day.getFullYear(), day.getMonth(), day.getDate()), cents: entry.amountCents });
    }
    return out;
  }

  /**
   * month(household, tables, 'YYYY-MM') — every active entry's landings in
   * the month, each netted: { grossCents, netCents, taxCents, costsCents,
   * rows: [{ entry, occurrences, grossCents, netCents, taxCents }] }.
   * Archived entries never count; hidden ones always do.
   */
  function month(household, tables, monthId) {
    var m = monthId || thisMonth();
    var rows = [], gross = 0, net = 0, tax = 0, costsTotal = 0, takeHome = 0, incomplete = [];
    activeEntries(household).forEach(function (e) {
      var occ = occurrences(e, m);
      if (!occ.length) return;
      var one = netOf(e, household, tables);
      var count = occ.length;
      var g = occ.reduce(function (t, o) { return t + o.cents; }, 0);
      if (!Money.isOk(one)) { incomplete.push({ id: e.id, label: e.label, reason: one.reason }); rows.push({ entry: e, occurrences: occ, grossCents: g, netCents: null, taxCents: null, costsCents: null, reason: one.reason }); gross += g; return; }
      /* Costs are per entry, not per landing: they come off once. */
      var n = one.takeHomeCents * count - one.allCostsCents;
      var t = one.taxCents * count;
      rows.push({ entry: e, occurrences: occ, grossCents: g, netCents: n, taxCents: t, takeHomeCents: one.takeHomeCents * count, costsCents: one.allCostsCents, net: one });
      gross += g; net += n; tax += t; costsTotal += one.allCostsCents; takeHome += one.takeHomeCents * count;
    });
    /* takeHomeCents is gross less tax — what the budget's Income bucket
       counts; the costs of earning it are the expense side's business. */
    return Money.ok(net, { month: m, label: Schema.monthLabel(m), grossCents: gross, netCents: net, takeHomeCents: takeHome, taxCents: tax, costsCents: costsTotal, rows: rows, incomplete: incomplete, count: rows.length });
  }

  /* ---- The year, by method — what the Tax room reads ------------------------
     Recurring entries annualised and split the way Tax.estimate wants them:
     wages (w2), self-employment profit net of costs (se), and what is not
     taxed. One-time entries in the last twelve months count once. */
  function annualByMethod(household, now) {
    var cutoff = new Date(now || Date.now()); cutoff.setFullYear(cutoff.getFullYear() - 1);
    var out = { wagesCents: 0, selfEmploymentCents: 0, untaxedCents: 0, counted: 0 };
    activeEntries(household).forEach(function (e) {
      var a;
      if (e.frequency === 'once') {
        if (!e.receivedOn || new Date(e.receivedOn + 'T00:00:00') < cutoff) return;
        a = e.amountCents;
      } else a = annualGrossCents(e);
      if (!Money.isEntered(a)) return;
      out.counted++;
      if (e.taxable === false || e.taxMethod === 'none') out.untaxedCents += a;
      else if (e.taxMethod === 'se') {
        var c = costs(e, household);
        var perYear = e.frequency === 'once' ? 1 : 1;
        out.selfEmploymentCents += Math.max(0, a - c.deductibleCents * perYear);
      } else out.wagesCents += a;
    });
    return out;
  }
  function hasRecurring(household) {
    return activeEntries(household).some(function (e) { return e.frequency !== 'once' && Money.isEntered(e.amountCents); });
  }

  /** The figure shown on an entry: gross less every cost of producing it. */
  function netOfCostsCents(entry, household) {
    if (!entry || !Money.isEntered(entry.amountCents)) return null;
    return entry.amountCents - (Schema.costsAllowed(entry.kind) ? costs(entry, household).allCents : 0);
  }

  return {
    periodsPerYear: periodsPerYear,
    annualGrossCents: annualGrossCents,
    monthlyGrossCents: monthlyGrossCents,
    entries: entries,
    activeEntries: activeEntries,
    byId: byId,
    linkedExpenses: linkedExpenses,
    costs: costs,
    netOf: netOf,
    netOfCostsCents: netOfCostsCents,
    occurrences: occurrences,
    month: month,
    thisMonth: thisMonth,
    annualByMethod: annualByMethod,
    hasRecurring: hasRecurring
  };
});

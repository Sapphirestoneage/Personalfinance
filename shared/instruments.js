/* ==========================================================================
   shared/instruments.js — the six numbers on the dashboard's first screen,
   and the one place a snapshot learns what to freeze.
   --------------------------------------------------------------------------
   The dashboard shows six instruments above the fold; a snapshot has to
   carry every one of them so that "since last time" never means re-running
   an old input against a newer reference table (D-056). If the two lists
   lived in two files they would drift, so this is the list, and both the
   dashboard and the Refresh page read it.

   Nothing is computed here. Every value is a call into an engine that
   already owns the formula — Tier0, Ratios, Foo — and comes back as the
   Result it produced. BRIEF §1.5.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('./money.js'),
      Schema: require('./schema.js'),
      Spine: require('./spine-v2.js'),
      Reference: require('./reference.js'),
      Tier0: require('../engines/tier0.js'),
      Ratios: require('../engines/ratios.js'),
      Foo: require('../engines/foo.js'),
      CashFlow: require('../engines/cashflow.js'),
      Events: require('../engines/events.js'),
      Skills: require('../engines/skills.js')
    };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Spine: S.Spine, Reference: S.Reference,
             Tier0: S.Tier0, Ratios: S.Ratios, Foo: S.Foo, CashFlow: S.CashFlow, Events: S.Events, Skills: S.Skills || null };
  }
  var api = factory(deps.Money, deps.Schema, deps.Spine, deps.Reference, deps.Tier0, deps.Ratios, deps.Foo, deps.CashFlow, deps.Events, deps.Skills);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Instruments = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Spine, Reference, Tier0, Ratios, Foo, CashFlow, Events, Skills) {
  'use strict';

  var MS_PER_DAY = 86400000;

  /* The six, in the order they sit on the panel. `cap` is the eyebrow,
     `label` the plain name, `unit` how to format, `band` which
     ratio_benchmarks row colours it (null = no colour). */
  /* `requires` names the gate branch an instrument needs (Gate.exists);
     none means everyone. `lead` is the Gate.lead id it answers to, so the
     dashboard can put the situation's number first. D-096. */
  var INSTRUMENTS = [
    { id: 'netWorth',            cap: 'Altitude', label: 'Net worth',    unit: 'cents',  band: null,  requires: null },
    { id: 'savingsRate',         cap: 'Thrust',   label: 'Savings rate', sub: 'of everything you earn, going into savings and investments', unit: 'rate',   band: 'savingsRate', requires: 'savingsRate', lead: 'savingsRate' },
    { id: 'emergencyFundMonths', cap: 'Fuel',     label: 'Runway',       unit: 'months', band: 'emergencyFundMonths', requires: null },
    { id: 'debtToIncome',        cap: 'Load',     label: 'Debt-to-income', sub: 'what share of your pay is already promised to debt', unit: 'rate', band: 'debtToIncome', requires: 'debt' },
    { id: 'fiEtaYear',           cap: 'Distance', label: 'Financial independence year', sub: 'the year work could become optional', unit: 'year',   band: null,  requires: 'savingsRate' },
    { id: 'fooStep',             cap: 'Heading',  label: 'Step on the money ladder', sub: 'which of the nine steps your next dollar belongs to', unit: 'step',   band: null,  requires: null },
    /* The situation leads: one each for self-employed, between jobs, a
       student and a retiree. Absent for everyone else. */
    { id: 'ownersPay',           cap: 'Pay',      label: 'Owner\u2019s pay, a month', unit: 'cents', band: null, requires: 'ownWork', lead: 'ownersPay' },
    { id: 'runwayDays',          cap: 'Runway',   label: 'Days the money lasts', unit: 'days', band: null, requires: 'unemployment', lead: 'runwayDays', replaces: 'emergencyFundMonths' },
    { id: 'loanTrajectory',      cap: 'Loans',    label: 'Loans clear in', unit: 'year',   band: null,  requires: 'studentLoans', lead: 'loanTrajectory' },
    { id: 'withdrawalRate',      cap: 'Draw',     label: 'Withdrawal rate', unit: 'rate', band: 'withdrawalRate', requires: 'decumulation', lead: 'withdrawalRate' }
  ];
  var DAYS_PER_MONTH = 365.25 / 12;

  /* Late-bound: the gate, runway and debt engines load after this file on
     some pages and are not needed by the snapshot path at all. */
  function lazy(name, file) {
    if (typeof module === 'object' && module.exports) { try { return require(file); } catch (e) { return null; } }
    var g = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined') ? window : null;
    return g && g.SLAF && g.SLAF[name] ? g.SLAF[name] : null;
  }
  function existsFor(household, key) {
    var G = lazy('Gate', './gate.js');
    return !key || !G ? true : G.exists(household, key);
  }
  function ownersPay(household, tables) {
    var t = Tier0.takeHomeMonthlyCents(household, tables);
    if (!Money.isOk(t)) return t;
    return Money.ok(t.value, { grossAnnualIncomeCents: t.grossAnnualIncomeCents, estimatedTaxCents: t.estimatedTaxCents, effectiveRate: t.effectiveRate });
  }
  function runwayDays(household, tables) {
    var R = lazy('Runway', '../engines/runway.js');
    if (!R) return Money.incomplete('The runway engine is not loaded.', []);
    var u = Schema.unemploymentOf(household);
    var ben = Schema.benefitMonthlyCents(household);
    /* A partner's pay keeps the month going: the Between Jobs engine is
       the one owner of that reading, so the lead and the room agree. */
    var BJ = lazy('BetweenJobs', '../engines/betweenjobs.js');
    var other = BJ && BJ.otherIncome ? BJ.otherIncome(household, tables) : null;
    var r = R.project(household, tables, { preset: 'laid_off',
      severanceCents: Money.isEntered(u.severanceCents) ? u.severanceCents : null,
      benefitMonthlyCents: Money.isOk(ben) ? ben.value : null,
      benefitMonths: Money.isOk(ben) && ben.months !== null ? Math.round(ben.months) : null,
      otherMonthlyIncomeCents: other && Money.isEntered(other.cents) && other.cents > 0 ? other.cents : null });
    if (!Money.isOk(r)) return r;
    var sustainable = r.runwayMonths >= R.HORIZON_MONTHS;
    return Money.ok(Math.round(r.runwayMonths * DAYS_PER_MONTH), { months: r.runwayMonths, sustainable: sustainable, ranOutInMonth: r.ranOutInMonth });
  }
  function loanTrajectory(household, tables, now) {
    var D = lazy('Debt', '../engines/debt.js');
    if (!D || !tables || !tables.debtRules) return Money.incomplete('The debt engine is not loaded.', []);
    var debts = Schema.aggregatableDebts(household);
    if (!debts.length) return Money.incomplete(household.meta && household.meta.hasDebt === false ? 'No loans \u2014 nothing to clear.' : 'Add what you owe to see when it clears.', ['totalDebt']);
    var sim = D.simulate(household, tables.debtRules, { strategyId: 'avalanche' });
    if (!Money.isOk(sim)) return sim;
    var nowMs = now === undefined ? Date.now() : now;
    var year = new Date(nowMs + sim.months * DAYS_PER_MONTH * MS_PER_DAY).getFullYear();
    return Money.ok(year, { months: sim.months, totalInterestCents: sim.totalInterestCents });
  }
  function withdrawalRate(household, tables) {
    var all = Ratios.all(household, tables, { snapshots: Spine.listSnapshots() });
    var row = all.rows.filter(function (r) { return r.id === 'withdrawalRate'; })[0];
    return row ? row.result : Money.incomplete('No withdrawal rate ratio.', []);
  }

  function etaYear(household, tables, now) {
    var y = Tier0.yearsToFire(household, tables);
    if (!Money.isOk(y)) return y;
    var nowMs = now === undefined ? Date.now() : now;
    var year = new Date(nowMs + y.value * 365.25 * MS_PER_DAY).getFullYear();
    return Money.ok(year, {
      years: y.value,
      alreadyThere: y.alreadyThere === true,
      contributionBasis: y.contributionBasis,
      expectedReturnRate: y.expectedReturnRate
    });
  }

  function fooStep(household, tables) {
    var foo = Foo.evaluate(household, tables);
    if (foo.status !== 'ok' && !foo.placement) {
      return Money.incomplete(foo.reason || 'Not enough entered to place you on the ladder yet.', []);
    }
    if (!foo.placement || !Money.isEntered(foo.placement.step)) {
      return Money.incomplete((foo.placement && foo.placement.reason) || 'Not enough entered to place you on the ladder yet.', []);
    }
    return Money.ok(foo.placement.step, {
      title: foo.placement.title || foo.placement.label || null,
      flags: foo.flags || []
    });
  }

  /**
   * compute(h, tables, now?) → { rows: [...], byId: {...}, foo }
   * Each row: the INSTRUMENTS entry plus `result` (a Result) and `verdict`
   * from the ratio bands where one applies.
   */
  function compute(household, tables, now) {
    var rates = Tier0.savingsRate(household, tables);
    var ratios = Ratios.all(household, tables, { snapshots: Spine.listSnapshots() });
    function ratioRow(id) {
      return ratios.rows.filter(function (r) { return r.id === id; })[0] || null;
    }
    var results = {
      netWorth: Tier0.netWorth(household),
      /* The CONTRIBUTED rate is the headline when the 401(k) percentage is
         known — what actually went somewhere — and the residual (gross
         less spending less tax) stands in until then. D-080. */
      savingsRate: (function () {
        var c = CashFlow.savingsRateContributed(household, tables);
        return Money.isOk(c) ? c : rates.excludingMatch;
      })(),
      emergencyFundMonths: Tier0.emergencyFundMonths(household),
      debtToIncome: Tier0.debtToIncome(household),
      fiEtaYear: etaYear(household, tables, now),
      fooStep: fooStep(household, tables),
      ownersPay: existsFor(household, 'ownWork') ? ownersPay(household, tables) : Money.incomplete('No own work.', []),
      runwayDays: existsFor(household, 'unemployment') ? runwayDays(household, tables) : Money.incomplete('Not between jobs.', []),
      loanTrajectory: existsFor(household, 'studentLoans') ? loanTrajectory(household, tables, now) : Money.incomplete('No student loans branch.', []),
      withdrawalRate: existsFor(household, 'decumulation') ? withdrawalRate(household, tables) : Money.incomplete('Not drawing down.', [])
    };
    var G = lazy('Gate', './gate.js');
    var lead = G ? G.lead(household) : 'savingsRate';
    /* Between jobs, "add your income" is the wrong thing to say: income is
       not being asked. The instruments that need one say why instead. D-092. */
    var betweenJobs = Schema.isUnemployed && Schema.isUnemployed(household);
    var byId = {};
    var rows = INSTRUMENTS.map(function (spec) {
      var band = spec.band ? ratioRow(spec.band) : null;
      var result = results[spec.id];
      if (betweenJobs && !Money.isOk(result) && (result.missing || []).some(function (m) { return /income/i.test(m); })) {
        result = Money.incomplete('Between jobs \u2014 nothing to measure against an income yet.', result.missing);
      }
      /* The verdict used to be borrowed wholesale from the ratio row named
         in `band` — so the savings-rate instrument showed the CONTRIBUTED
         rate (13.8%) and coloured it green from the RESIDUAL rate (28.5%),
         a number that only appears in the panel. Judge the figure actually
         on screen against the same thresholds. D-145. */
      var ownVerdict = null;
      if (spec.band) {
        ownVerdict = Money.isOk(result)
          ? Ratios.verdict(spec.band, result.value, tables && tables.ratioBenchmarks)
          : (band ? { zone: 'none', band: band.verdict ? band.verdict.band : null } : null);
      }
      var row = {
        id: spec.id, cap: spec.cap, label: spec.label, blurb: spec.sub || null, unit: spec.unit,
        result: result,
        ok: Money.isOk(result),
        verdict: ownVerdict,
        bandRow: band,
        /* Does this instrument exist for this household? The dashboard
           shows only the ones that do; a snapshot freezes them all. */
        exists: existsFor(household, spec.requires),
        isLead: spec.lead === lead
      };
      byId[spec.id] = row;
      return row;
    });
    /* A lead that answers the same question as a general instrument (the
       runway in days, with the benefit counted, against cash months)
       stands in for it rather than beside it. */
    INSTRUMENTS.forEach(function (spec) {
      if (spec.replaces && byId[spec.id].exists && byId[spec.replaces]) byId[spec.replaces].exists = false;
    });
    /* The situation's number first, then the rest in panel order. */
    var shown = rows.filter(function (r) { return r.exists; }).sort(function (a, b) { return (b.isLead ? 1 : 0) - (a.isLead ? 1 : 0); });
    return { rows: rows, byId: byId, savingsRates: rates, shown: shown, lead: lead };
  }

  /** Flat { id: Result } — what a snapshot freezes as computedOutputs. */
  function outputs(household, tables, now) {
    var c = compute(household, tables, now);
    var out = {};
    c.rows.forEach(function (r) { out[r.id] = r.result; });
    /* Both savings-rate variants, so a delta on either is possible later. */
    out.savingsRateIncludingMatch = c.savingsRates.includingMatch;
    /* The practice ledger's running total, so an Annual Review can say
       what a year of logged days added up to. D-090. */
    if (Skills) out.practiceLedgerCents = Money.ok(Skills.ledgerTotalCents(household));
    return out;
  }

  /** Take a snapshot carrying every instrument. Returns the record. */
  function snapshot(household, tables, extra) {
    var h = household || Spine.getProfile();
    return Spine.appendSnapshot(Object.assign({
      rawInputs: {
        people: h.people, assets: h.assets, debts: h.debts,
        expenses: h.expenses, filingStatus: h.filingStatus, state: h.state,
        capturingFullMatch: h.capturingFullMatch,
        retirement: h.retirement, insurance: h.insurance
      },
      assumptionsUsed: Schema.resolveAssumptions(h),
      referenceVersions: Reference.versionsOf(tables),
      computedOutputs: outputs(h, tables)
    }, extra || {}));
  }

  /** { id: snapshotDelta } for every instrument; null entries where none. */
  function deltas(household, tables, now) {
    var c = compute(household, tables, now);
    var out = {};
    c.rows.forEach(function (r) { out[r.id] = Spine.snapshotDelta(r.id, r.result); });
    return out;
  }

  function format(row) {
    var r = row.result;
    if (!Money.isOk(r)) return Money.EM_DASH;
    switch (row.unit) {
      case 'cents':  return Money.formatCents(r.value);
      case 'rate':   return Money.formatRate(r.value, { decimals: 1 });
      case 'months': return Money.formatMonths(r.value);
      case 'year':   return r.alreadyThere ? 'Now' : String(r.value);
      case 'days':   return r.sustainable ? 'Covered' : r.value.toLocaleString('en-US') + ' days';
      case 'step':   return 'Step ' + r.value;
      default:       return String(r.value);
    }
  }

  /** A signed, unit-aware delta string, or '' when there is nothing to say. */
  function formatDelta(row, delta) {
    if (!delta || delta.delta === null || delta.delta === 0) return '';
    var d = delta.delta, sign = d > 0 ? '+' : '−', a = Math.abs(d);
    switch (row.unit) {
      case 'cents':  return sign + Money.formatCents(a);
      case 'rate':   return sign + (Math.round(a * 1000) / 10) + ' pts';
      case 'months': return sign + (Math.round(a * 10) / 10) + ' mo';
      case 'year':   return sign + a + ' yr';
      case 'step':   return sign + a + ' step' + (a === 1 ? '' : 's');
      default:       return sign + a;
    }
  }

  /* ---- 3D: every instrument three ways (BRIEF §6.4, D-089) ----------------
     The events engine on the EMPTY template — the Triple D bundles on the
     baseline, no event — read back per instrument at the horizon. Load
     and debt-to-income do not move with returns or income-after, and the
     FOO step is a placement, not a projection: those three stay as they
     are and say so. */
  function threeD(household, tables) {
    if (!Events) return Money.incomplete('The events engine is not loaded.', ['events']);
    var all = Events.runAll(household, Events.EMPTY, {}, { tables: tables });
    var order = (tables && tables.tripleD && tables.tripleD.order) || ['dream', 'default', 'disaster'];
    var bad = order.filter(function (d) { return !Money.isOk(all[d]); });
    if (bad.length) return all[bad[0]];
    var out = { order: order, horizonYears: all['default'].horizonMonths / 12, columns: {} };
    order.forEach(function (d) {
      var r = all[d];
      var first = r.monthly[0], last = r.monthly[r.monthly.length - 1];
      var grossThen = r.ctx.takeHomeMonthlyCents > 0 ? (first.incomeCents + first.contributionCents) / r.ctx.takeHomeMonthlyCents * r.ctx.grossMonthlyCents : null;
      var saved = first.incomeCents - first.expensesCents + first.contributionCents + first.matchCents;
      out.columns[d] = {
        label: r.bundle.label,
        netWorth: Money.ok(last.netWorthCents),
        savingsRate: grossThen ? Money.ok(saved / grossThen) : Money.incomplete('No income.', ['grossAnnualIncome']),
        emergencyFundMonths: last.expensesCents > 0 ? Money.ok(Math.max(0, last.cashCents) / last.expensesCents) : Money.incomplete('No spending.', ['monthlyExpenses']),
        debtToIncome: Money.incomplete('Does not move with returns or income-after.', []),
        fiEtaYear: r.fiMonthsFromNow === null ? Money.incomplete('No FI number yet.', ['monthlyExpenses'])
          : Money.ok(new Date(Date.now() + r.fiMonthsFromNow * 30.4375 * MS_PER_DAY).getFullYear()),
        fooStep: Money.incomplete('A placement, not a projection.', [])
      };
    });
    return Money.ok(order.length, out);
  }

  return {
    INSTRUMENTS: INSTRUMENTS,
    compute: compute,
    outputs: outputs,
    snapshot: snapshot,
    deltas: deltas,
    format: format,
    formatDelta: formatDelta,
    threeD: threeD
  };
});

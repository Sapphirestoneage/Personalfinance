/* ==========================================================================
   engines/protection.js — the Protection room's checkup.
   DECISIONS.md D-098 (the tranche rooms on the template).
   --------------------------------------------------------------------------
   Four lines, each a need against what is held:

     badYear     what a bad health year costs (the out-of-pocket maximum,
                 or the highest deductible standing in for it) — against cash
     disability  what you would need a month if you could not work (a share
                 of gross pay, the convention's 60%) — against the disability
                 benefit in force. Not a line between jobs or retired: there
                 is no pay to replace.
     life        what someone who lives on this income would need if it
                 stopped for good (the convention's 10x gross) — against term
                 life in force. Not a line when nobody depends on the income.
     cushion     the emergency cushion, three months of spending as the floor
                 and six as the full cushion — against cash

   A line is { id, label, applies, reason, needCents, heldCents, gapCents,
   period }. `applies: false` says why in `reason`. A need or a held that is
   not entered stays null with a reason — empty is not zero, so a gap is
   only computed when both sides are entered. The headline is the biggest
   known gap; a monthly gap is ranked by its yearly cost so a lump and a
   monthly figure can be compared.

   Nothing here re-derives a figure another engine owns: income, spending
   and cash come from the schema readers, the cushion months from tier0.
   Every figure that is not the person's is read from
   data/protection_conventions.json.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Gate: require('../shared/gate.js'), Tier0: require('./tier0.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Gate: S.Gate, Tier0: S.Tier0 };
  }
  var api = factory(deps.Money, deps.Schema, deps.Gate, deps.Tier0);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Protection = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Gate, Tier0) {
  'use strict';

  var MONTHS = 12;

  /* Where an unknown side is fixed: the owning room and its anchor, the
     same ones the ownership map links to. */
  var COVERAGE = { room: 'sleep-at-night', anchor: 'coverage' };
  var START_CASH = { room: 'start', anchor: 'q-cash' };
  var START_INCOME = { room: 'start', anchor: 'q-income' };
  var START_EXPENSES = { room: 'start', anchor: 'q-expenses' };
  var START_DEDUCTIBLE = { room: 'start', anchor: 'q-deductible' };
  var START_DEPENDENTS = { room: 'start', anchor: 'q-fine-tune' };

  /* The conventions, with the table's own numbers or nothing: a missing
     table is a reason, not a fallback figure. */
  function conventions(tables) {
    var t = tables && tables.protectionConventions;
    if (!t) return null;
    var keys = ['disabilityReplacementShare', 'lifeCoverMultiple', 'cushionFloorMonths', 'cushionFullMonths'];
    for (var i = 0; i < keys.length; i++) if (!Money.isEntered(t[keys[i]])) return null;
    return t;
  }

  function gapOf(need, held) {
    return Money.isEntered(need) && Money.isEntered(held) ? need - held : null;
  }

  /** One line of the checkup, built from its two sides. */
  function line(id, label, period, need, held, extra) {
    var l = {
      id: id, label: label, period: period, applies: true, reason: null,
      needCents: Money.isEntered(need.cents) ? need.cents : null,
      heldCents: Money.isEntered(held.cents) ? held.cents : null,
      needReason: need.reason || null,
      heldReason: held.reason || null,
      needFix: need.fix || null,
      heldFix: held.fix || null,
      gapCents: null
    };
    l.gapCents = gapOf(l.needCents, l.heldCents);
    if (l.gapCents === null) { l.reason = l.needCents === null ? l.needReason : l.heldReason; l.fix = l.needCents === null ? l.needFix : l.heldFix; }
    /* For ranking a monthly gap against a lump: a year of it. */
    l.rankCents = l.gapCents === null ? null : (period === 'month' ? l.gapCents * MONTHS : l.gapCents);
    return Object.assign(l, extra || {});
  }
  function notApplicable(id, label, period, why) {
    return { id: id, label: label, period: period, applies: false, reason: why, needCents: null, heldCents: null, gapCents: null, rankCents: null, needReason: null, heldReason: null, needFix: null, heldFix: null, fix: null };
  }

  /* ---- The four lines ------------------------------------------------------- */

  function badYearLine(h, cash) {
    var ins = h.insurance || {};
    var usesOopMax = Money.isEntered(ins.oopMaxCents);
    var need = usesOopMax ? { cents: ins.oopMaxCents }
      : Money.isEntered(ins.highestDeductibleCents) ? { cents: ins.highestDeductibleCents }
      : { cents: null, reason: 'Add your highest deductible in Start Here to size a bad year', fix: START_DEDUCTIBLE };
    var health = ins.health || {};
    return line('badYear', 'A bad health year', 'once', need, cash, {
      usesOopMax: usesOopMax,
      noHealthCover: health.type === 'none'
    });
  }

  function disabilityLine(h, situation, gross, conv) {
    if (situation === 'betweenJobs') return notApplicable('disability', 'If you could not work', 'month', 'Between jobs there is no pay to replace yet; this line returns with the next job.');
    if (situation === 'retired') return notApplicable('disability', 'If you could not work', 'month', 'Retired, there is no pay to replace: what you draw does not stop when you cannot work.');
    var need = Money.isOk(gross) ? { cents: Math.round(gross.value * conv.disabilityReplacementShare / MONTHS) }
      : { cents: null, reason: 'Add your income in Start Here to size what you would need a month', fix: START_INCOME };
    var v = (h.insurance || {}).disabilityMonthlyCents;
    var held = Money.isEntered(v) ? { cents: v } : { cents: null, reason: 'Your disability benefit is not entered yet', fix: COVERAGE };
    return line('disability', 'If you could not work', 'month', need, held, { share: conv.disabilityReplacementShare });
  }

  function lifeLine(h, gross, conv) {
    var deps = Schema.createDependents(h.dependents);
    if (deps && deps.length === 0) return notApplicable('life', 'If you died', 'once', 'Nobody depends on your income, so term life is not a gap.');
    var need = deps === null ? { cents: null, reason: 'Say in Start Here whether anyone depends on your income', fix: START_DEPENDENTS }
      : Money.isOk(gross) ? { cents: gross.value * conv.lifeCoverMultiple }
      : { cents: null, reason: 'Add your income in Start Here to size life cover', fix: START_INCOME };
    var v = (h.insurance || {}).termLifeCents;
    var held = Money.isEntered(v) ? { cents: v } : { cents: null, reason: 'Term life in force is not entered yet', fix: COVERAGE };
    return line('life', 'If you died', 'once', need, held, { multiple: conv.lifeCoverMultiple, dependents: deps ? deps.length : null });
  }

  function cushionLine(h, spend, cash, conv) {
    var need = Money.isOk(spend) ? { cents: spend.value * conv.cushionFloorMonths }
      : { cents: null, reason: 'Add a month of spending in Start Here to size the cushion', fix: START_EXPENSES };
    var months = Tier0.emergencyFundMonths(h);
    return line('cushion', 'The cushion', 'once', need, cash, {
      floorMonths: conv.cushionFloorMonths,
      fullMonths: conv.cushionFullMonths,
      fullCents: Money.isOk(spend) ? spend.value * conv.cushionFullMonths : null,
      monthsHeld: Money.isOk(months) ? months.value : null
    });
  }

  /* ---- The checkup ----------------------------------------------------------- */

  /**
   * checkup(household, tables) → Result
   *   value        the biggest known gap in cents (0 when every line is covered)
   *   lines        the four lines, in order
   *   biggest      the line with the biggest gap, or null when none is short
   *   zone         'good' | 'watch' | 'out' — no gap, one, two or more
   *   short        the applying lines with a gap > 0
   *   unknown      the applying lines whose gap cannot be computed yet
   *   healthType   insurance.health.type
   *   healthFlag   'none' when there is no health cover; 'cobra' when on
   *                COBRA between jobs; else null
   * Incomplete, with the first line's reason, when no line can be computed.
   */
  function checkup(household, tables) {
    var h = household || {};
    var conv = conventions(tables);
    if (!conv) return Money.incomplete('The protection conventions table is missing.', ['protectionConventions']);
    var situation = Gate.situationOf(h);
    var gross = Schema.grossAnnualIncomeCents(h);
    var spend = Schema.monthlyExpensesCents(h);
    var cashResult = Schema.cashCents(h);
    var cash = Money.isOk(cashResult) ? { cents: cashResult.value } : { cents: null, reason: 'Add your cash in Start Here to see what stands behind you', fix: START_CASH };

    var lines = [
      badYearLine(h, cash),
      disabilityLine(h, situation, gross, conv),
      lifeLine(h, gross, conv),
      cushionLine(h, spend, cash, conv)
    ];
    var applying = lines.filter(function (l) { return l.applies; });
    var known = applying.filter(function (l) { return l.gapCents !== null; });
    var unknown = applying.filter(function (l) { return l.gapCents === null; });
    var health = (h.insurance || {}).health || {};
    var healthFlag = health.type === 'none' ? 'none' : (health.type === 'cobra' && situation === 'betweenJobs') ? 'cobra' : null;

    if (!known.length) {
      /* Incomplete, but the lines still say what each one is waiting for,
         so a room can draw the rows empty rather than blank. */
      var first = unknown[0];
      var inc = Money.incomplete(first ? first.reason : 'Nothing to check yet.', unknown.map(function (l) { return l.id; }));
      inc.lines = lines; inc.unknown = unknown;
      return inc;
    }
    var short = known.filter(function (l) { return l.gapCents > 0; });
    var biggest = short.reduce(function (best, l) { return !best || l.rankCents > best.rankCents ? l : best; }, null);
    return Money.ok(biggest ? biggest.gapCents : 0, {
      lines: lines,
      biggest: biggest,
      short: short,
      unknown: unknown,
      zone: short.length === 0 ? 'good' : short.length === 1 ? 'watch' : 'out',
      situation: situation,
      healthType: health.type || null,
      healthMonthlyCents: Money.isEntered(health.monthlyCents) ? health.monthlyCents : null,
      healthFlag: healthFlag,
      conventions: conv
    });
  }

  return {
    checkup: checkup,
    conventions: conventions
  };
});

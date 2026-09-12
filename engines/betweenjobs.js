/* ==========================================================================
   engines/betweenjobs.js — the runway against the search.
   --------------------------------------------------------------------------
   The one question a person between jobs has: does the money outlast the
   search? Everything here is that question put to engines that already
   own the arithmetic —

     • engines/runway.js  Runway.project with the laid-off preset, fed the
       household's own facts (cash, spending, severance, the benefit and
       its weeks) exactly as the dashboard's "Days the money lasts" lead
       feeds it (shared/instruments.js runwayDays), plus a partner's
       take-home as the income that does not stop. Run twice: once at what
       you spend now, once at the floor — the bare-minimum month.
     • shared/schema.js   Schema.benefitMonthlyCents for the benefit as a
       month (weekly × 52 ÷ 12) and how many months it runs.
     • engines/tier0.js   Tier0.takeHomeMonthlyCents, on a view of the
       household without the person who is between jobs, for the partner's
       pay after tax. One formula, one function: the tax is that lookup and
       no other.

   What is this room's own: the expected length of the search and the
   floor (person.unemployment.expectedSearchMonths / floorMonthlyCents),
   the gap between the runway and the search, and the two dates — the
   day the cash runs out, the day the benefit stops.

   WHAT IT DOES NOT GUESS: the benefit (yours to look up; Start Here asks),
   and the search itself. When the person has not said how long they expect
   the search to take, the comparison uses the typical search from
   data/reentry_gap.json and SAYS it is typical, not theirs. When no floor
   has been typed, the floor run uses 70% of spending and says so. Neither
   stand-in is ever written.

   Money is integer cents. Months are whole months from Runway; days are
   months × 365.25 ÷ 12, the same constant the dashboard lead uses.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'),
             Tier0: require('./tier0.js'), Runway: require('./runway.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Tier0: S.Tier0, Runway: S.Runway };
  }
  var api = factory(deps.Money, deps.Schema, deps.Tier0, deps.Runway);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.BetweenJobs = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Tier0, Runway) {
  'use strict';

  var MONTHS = 12;
  var DAYS_PER_MONTH = 365.25 / 12;
  var MS_PER_DAY = 86400000;
  /* The floor, when none has been typed: a bare-minimum month at 70% of
     spending. A convention, not a benchmark — the drawer says so. */
  var FLOOR_SHARE = 0.70;

  /* ---- Dates ---------------------------------------------------------------- */

  function iso(d) {
    var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  /** The same day of the month, `months` whole months on (clamped to the
      month's length: Jan 31 + 1 → Feb 28). Local time, as a date string. */
  function addMonths(nowMs, months) {
    var d = new Date(nowMs);
    var target = new Date(d.getFullYear(), d.getMonth() + months, 1);
    var last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d.getDate(), last));
    return iso(target);
  }
  function addDays(nowMs, days) { return iso(new Date(nowMs + days * MS_PER_DAY)); }

  /* ---- The dates the last day worked fixes (D-213) ------------------------
     One typed date answers four questions nothing else in the app can
     answer: when the benefit runs out, when the two 60-day windows close,
     and how long the search has already run. Every one of them is counted
     from `people[].unemployment.lastDayWorked`; without it this is
     incomplete and names the field, because a deadline guessed from a
     month is a deadline shown on the wrong day.

     Nothing here is a fact about the household and nothing is stored. The
     benefit duration comes from the sourced DOL columns in data/states.json
     and the waiting week from the convention beside them (D-220), but what
     a claim actually pays follows base-period wages, so `estimated` is true
     on the way out and the room prints the state agency link beside it. */
  /* Whole days, local midnight to local midnight. Counting from a
     timestamp instead put every deadline half a day out and so one day
     wrong for half of each day, which on a 60-day window is the
     difference between "closes tomorrow" and "closed" (D-204, D-213). */
  function dayDiff(fromIso, toIso) {
    var a = new Date(fromIso + 'T00:00:00'), b = new Date(toIso + 'T00:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
  }
  function dates(household, tables, opts) {
    var o = opts || {};
    var h = household || {};
    var t = tables || {};
    var nowMs = Money.isEntered(o.now) ? o.now : Date.now();
    var u = Schema.unemploymentOf(h);
    var last = u.lastDayWorked;
    if (!last || isNaN(new Date(last + 'T00:00:00').getTime())) {
      return Money.incomplete('Add the last day you worked and the dates fall out of it.', ['lastDayWorked']);
    }
    var lastMs = new Date(last + 'T00:00:00').getTime();
    var today = Schema.localDay ? Schema.localDay(new Date(nowMs)) : iso(new Date(nowMs));
    var elapsedDays = dayDiff(last, today);

    /* The benefit: a waiting week, then the state's weeks. */
    var ui = t.uiBenefits || null;
    var row = ui && ui.states ? ui.states[h.state] : null;
    var waitWeeks = ui && Money.isEntered(ui.waitingWeeks) ? ui.waitingWeeks : null;
    var weeks = row && Money.isEntered(row.weeks) ? row.weeks : null;
    var claimStart = waitWeeks === null ? null : addDays(lastMs, waitWeeks * 7);
    var benefitEnd = (weeks === null || waitWeeks === null) ? null : addDays(lastMs, (waitWeeks + weeks) * 7);

    /* The two windows, each its own statutory count of days from the last
       day worked (data/protection_conventions.json). */
    var pc = t.protectionConventions || {};
    function cell(v) { return v && typeof v === 'object' && Money.isEntered(v.value) ? v.value : (Money.isEntered(v) ? v : null); }
    var cobraDays = cell(pc.cobraElectionDays);
    var acaDays = cell(pc.marketplaceSpecialEnrolmentDays);
    var cobraBy = cobraDays === null ? null : addDays(lastMs, cobraDays);
    var acaBy = acaDays === null ? null : addDays(lastMs, acaDays);

    /* Severance runs out on a date too, once there is a pay rate to divide
       it by: the last pay a year over 52. PTO paid out lands the same way. */
    var weekly = Money.isEntered(u.lastGrossAnnualCents) && u.lastGrossAnnualCents > 0
      ? u.lastGrossAnnualCents / 52 : null;
    var lump = (Money.isEntered(u.severanceCents) ? u.severanceCents : 0)
      + (Money.isEntered(u.ptoPayoutCents) ? u.ptoPayoutCents : 0);
    var severanceWeeks = weekly && lump > 0 ? lump / weekly : null;
    var severanceThrough = severanceWeeks === null ? null : addDays(lastMs, severanceWeeks * 7);

    return Money.ok(Math.max(0, Math.round((elapsedDays / 7) * 10) / 10), {
      lastDayWorked: last,
      today: today,
      daysElapsed: elapsedDays,
      weeksElapsed: Math.max(0, Math.round((elapsedDays / 7) * 10) / 10),
      claimStart: claimStart,
      benefitWeeks: weeks,
      waitingWeeks: waitWeeks,
      benefitEndDate: benefitEnd,
      benefitWeeksLeft: benefitEnd === null ? null : Math.max(0, Math.round(dayDiff(today, benefitEnd) / 7 * 10) / 10),
      cobraElectionBy: cobraBy,
      cobraDaysLeft: cobraBy === null ? null : dayDiff(today, cobraBy),
      cobraClosed: cobraBy === null ? null : dayDiff(today, cobraBy) < 0,
      marketplaceBy: acaBy,
      marketplaceDaysLeft: acaBy === null ? null : dayDiff(today, acaBy),
      marketplaceClosed: acaBy === null ? null : dayDiff(today, acaBy) < 0,
      severanceWeeks: severanceWeeks === null ? null : Math.round(severanceWeeks * 10) / 10,
      severanceThroughDate: severanceThrough,
      /* Already in the store as a status, so it is read, never asked twice. */
      claimFiled: u.benefitStatus === null ? null : (u.benefitStatus === 'receiving' || u.benefitStatus === 'applied'),
      /* The cap and the weeks are sourced (D-220), but what you are actually
         paid follows your base-period wages, so this is still an estimate. */
      estimated: true,
      benefitSource: ui ? 'data/states.json v' + (ui.version || '?') + ' (' + (ui.confidence || 'unverified') + ')' : null,
      missingState: !h.state,
      windowSource: 'data/protection_conventions.json'
    });
  }

  /* ---- The stand-ins, named so the room proposes exactly what the engine uses -- */

  /** The typical search, from the reentry gap table: { value, source } or null. */
  function proposeSearchMonths(tables) {
    var g = tables && tables.reentryGap;
    if (!g || !Money.isEntered(g.medianMonths)) return null;
    var v = Math.round(g.medianMonths * 10) / 10;
    return { value: v, source: 'typical search, ' + v + ' months (' + g.confidence + ')' };
  }
  /** A bare-minimum month at 70% of spending: { value, source } or null. */
  function proposeFloorCents(household) {
    var spend = Schema.monthlyExpensesCents(household);
    if (!Money.isOk(spend) || spend.value <= 0) return null;
    return { value: Math.round(spend.value * FLOOR_SHARE),
             source: 'a bare-minimum month, ' + Math.round(FLOOR_SHARE * 100) + '% of your spending (convention)' };
  }

  /* ---- The income that does not stop ------------------------------------------ */

  /**
   * A partner's pay, as a month after tax. Runway.project takes "other
   * income" as an option and does not read the household for it, so this
   * is where a second adult's pay is found. The person between jobs is
   * left out of the view; whatever pay is still on their record is not
   * income now.
   */
  function otherIncome(household, tables) {
    var you = Schema.primaryPerson(household);
    /* 15.4: a partner's pay, and your own sources that survive a job loss
       (rent, a pension, contract work). Only the job stops. D-181. */
    var sources = Schema.allIncomeSources(household).filter(function (s) { return !you || s.personId !== you.id || Schema.survivesJobLoss(s); });
    if (!sources.length) return { cents: 0, basis: 'none', reason: null };
    var view = Object.assign({}, household, { people: (household.people || []).map(function (p) {
      if (!you || p.id !== you.id) return p;
      return Object.assign({}, p, { incomeSources: (p.incomeSources || []).filter(Schema.survivesJobLoss) });
    }).filter(function (p) { return (p.incomeSources || []).length || !you || p.id !== you.id; }) });
    var take = Tier0.takeHomeMonthlyCents(view, tables);
    if (Money.isOk(take)) return { cents: take.value, basis: 'takeHome', grossAnnualCents: take.grossAnnualIncomeCents, effectiveRate: take.effectiveRate, reason: null };
    var gross = Schema.grossAnnualIncomeCents(view);
    if (Money.isOk(gross)) return { cents: Math.round(gross.value / MONTHS), basis: 'gross', grossAnnualCents: gross.value, effectiveRate: null, reason: take.reason };
    return { cents: 0, basis: 'none', reason: null };
  }

  /* ---- The benefit, as the runway wants it ------------------------------------- */

  function benefitFor(household) {
    var ben = Schema.benefitMonthlyCents(household);
    if (!Money.isOk(ben)) return { monthlyCents: 0, months: 0, weeksLeft: null, state: 'unknown', reason: ben.reason, status: null };
    if (ben.value === 0) return { monthlyCents: 0, months: 0, weeksLeft: 0, state: 'none', reason: null, status: ben.benefitStatus };
    if (ben.months === null) return { monthlyCents: ben.value, months: 0, weeksLeft: null, state: 'noWeeks', reason: 'Add how many weeks of it are left, and it will be counted.', status: ben.benefitStatus };
    return { monthlyCents: ben.value, months: Math.round(ben.months), weeksLeft: ben.weeksLeft, state: 'counted', reason: null, status: ben.benefitStatus };
  }

  /* ---- The plan ------------------------------------------------------------------ */

  /**
   * plan(household, tables, opts) → Result whose value is the DAYS the
   * money lasts at current spending (the dashboard lead's number), with:
   *
   *   sustainable          what comes in covers what goes out; "Covered"
   *   runwayMonths, floorRunwayMonths, floorGainMonths
   *   monthlyExpensesCents, floorCents, floorSource 'yours' | 'convention'
   *   expectedSearchMonths, expectedSource 'yours' | 'typical' | null
   *   gapMonths            runway − search; positive = to spare, negative = short
   *   zone                 'good' | 'watch' | 'out' | null
   *   cashOutDate          ISO, the first day of the month the cash cannot cover
   *   benefit              { monthlyCents, months, weeksLeft, state, reason, status }
   *   benefitEndDate       ISO, or null
   *   other                { cents, basis, … } the partner's pay a month
   *   severanceCents, startingCents
   *   base, floorRun       the two Runway.project results (rows for the chart)
   *
   * opts.now              ms, for the dates (tests pass a fixed one)
   * opts.asBetweenJobs    the caller vouches the household is between jobs
   *                       even though no status says so — the template's
   *                       standalone render, where the person is a guess.
   */
  function plan(household, tables, opts) {
    var o = opts || {};
    var h = household || {};
    var nowMs = Money.isEntered(o.now) ? o.now : Date.now();

    if (!Schema.isUnemployed(h) && !o.asBetweenJobs) {
      var you = Schema.primaryPerson(h);
      var row = you && you.employmentStatus ? Schema.employmentStatus(you.employmentStatus) : null;
      return row
        ? Money.incomplete('This room is for someone between jobs — Start Here says ' + row.short.toLowerCase() + '.', ['employmentStatus'])
        : Money.incomplete('Say you are between jobs in Start Here to see the runway against the search.', ['employmentStatus']);
    }

    var u = Schema.unemploymentOf(h);
    var benefit = benefitFor(h);
    var other = o.asBetweenJobs && !Schema.isUnemployed(h) ? { cents: 0, basis: 'none', reason: null } : otherIncome(h, tables);
    var severance = Money.isEntered(u.severanceCents) ? u.severanceCents : null;

    var shared = { preset: 'laid_off', severanceCents: severance,
      benefitMonthlyCents: benefit.monthlyCents, benefitMonths: benefit.months,
      otherMonthlyIncomeCents: other.cents, rates: o.rates || null };
    var base = Runway.project(h, tables, shared);
    if (!Money.isOk(base)) return base;

    var spend = base.monthlyExpensesCents;
    var floorSource = Money.isEntered(u.floorMonthlyCents) ? 'yours' : 'convention';
    var floorCents = floorSource === 'yours' ? u.floorMonthlyCents : Math.round(spend * FLOOR_SHARE);
    var floorRun = Runway.project(h, tables, Object.assign({}, shared, { monthlyExpensesCents: floorCents, expenseBasis: 'floor' }));
    if (!Money.isOk(floorRun)) return floorRun;

    var typical = proposeSearchMonths(tables);
    var expectedSource = Money.isEntered(u.expectedSearchMonths) ? 'yours' : typical ? 'typical' : null;
    var expected = expectedSource === 'yours' ? u.expectedSearchMonths : typical ? typical.value : null;

    var sustainable = base.sustainable;
    var runway = base.runwayMonths;
    var gap = sustainable || expected === null ? null : Math.round((runway - expected) * 10) / 10;
    var zone = sustainable ? 'good' : gap === null ? null : gap < 0 ? 'out' : gap < 1 ? 'watch' : 'good';

    /* Days, like the dashboard lead: at the horizon when sustainable, which
       the caller reads as "at least" and words as Covered. */
    return Money.ok(Math.round(runway * DAYS_PER_MONTH), {
      sustainable: sustainable,
      horizonMonths: base.horizonMonths,
      runwayMonths: runway,
      floorRunwayMonths: floorRun.runwayMonths,
      floorSustainable: floorRun.sustainable,
      floorGainMonths: floorRun.runwayMonths - runway,
      monthlyExpensesCents: spend,
      floorCents: floorCents,
      floorSource: floorSource,
      floorAtOrAboveSpending: floorCents >= spend,
      expectedSearchMonths: expected,
      expectedSource: expectedSource,
      gapMonths: gap,
      zone: zone,
      cashOutDate: sustainable ? null : addMonths(nowMs, runway),
      floorCashOutDate: floorRun.sustainable ? null : addMonths(nowMs, floorRun.runwayMonths),
      benefit: benefit,
      benefitEndDate: benefit.state === 'counted' && Money.isEntered(benefit.weeksLeft) ? addDays(nowMs, benefit.weeksLeft * 7) : null,
      other: other,
      severanceCents: base.severanceCents,
      startingCents: base.startingCents,
      cushionCents: base.cushionCents,
      /* 15.8: the piles behind the cash, from the one runway function. */
      beyondCash: base.tiers,
      since: u.since,
      base: base,
      floorRun: floorRun
    });
  }

  /**
   * The balance month by month for a chart: [[0, start], [1, …], …] up to
   * `horizon`, stopping at the first month below zero so the crossing is
   * drawn and the fall past it is not.
   */
  function balancePoints(run, horizon) {
    var pts = [[0, run.startingCents]];
    for (var i = 0; i < run.rows.length && run.rows[i].month <= horizon; i++) {
      pts.push([run.rows[i].month, run.rows[i].balanceCents]);
      if (run.rows[i].balanceCents < 0) break;
    }
    return pts;
  }

  return {
    DAYS_PER_MONTH: DAYS_PER_MONTH,
    FLOOR_SHARE: FLOOR_SHARE,
    addMonths: addMonths,
    addDays: addDays,
    dates: dates,
    proposeSearchMonths: proposeSearchMonths,
    proposeFloorCents: proposeFloorCents,
    otherIncome: otherIncome,
    plan: plan,
    balancePoints: balancePoints
  };
});

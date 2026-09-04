/* ==========================================================================
   engines/income.js — how you are actually paid, turned into a year.
   --------------------------------------------------------------------------
   `shared/schema.js` has carried `incomeSource.frequency` since the model was
   written, with the comment "stored annual; converted at the edge". Nothing
   ever did the converting. This is the edge.

   Almost nobody knows their gross annual income to the dollar. They know
   "$26 an hour", or "$4,200 a month", or "about two grand a fortnight" —
   and asking for a year forces a piece of mental arithmetic that this app
   exists to do. Worse, the arithmetic is the part people get wrong: hourly
   to annual is not "times 2080" for anyone part-time, and a fortnight is
   not half a month.

   TWO ANNUAL FIGURES, AND THEY ARE NOT THE SAME NUMBER.

   If you spent five months on one job and seven on another, there are two
   honest answers to "what do you earn":

     • What you EARNED — the two stints blended by how long each lasted.
       This is the right number for savings rate, debt-to-income, and
       anything asking what actually happened to your money this year.
     • Your RUN RATE — what the job you hold now pays, annualised, as if
       you had held it all year. This is the right number for projecting
       forward.

   A calculator that quietly picks one is answering a question it was not
   asked. This computes both, says which is which, and leaves the choice
   where it belongs.

   Money is integer cents. A missing rate is missing, never zero.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema
    };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Income = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var MONTHS_PER_YEAR = 12;

  /**
   * The ways people are actually paid.
   *
   * `periods` is how many times that pay lands in a year, and every one of
   * them is exact arithmetic rather than a convention — except `hourly`,
   * which cannot be, and says so.
   *
   * fortnightly and semimonthly are BOTH here and are deliberately not the
   * same row. Every two weeks is 26 pay packets; twice a month is 24. People
   * conflate them constantly and it is an 8% error in the annual figure.
   */
  var BASES = [
    { id: 'annual',      label: 'a year',      short: 'yr',  periods: 1 },
    { id: 'monthly',     label: 'a month',     short: 'mo',  periods: 12 },
    { id: 'semimonthly', label: 'twice a month', short: '½mo', periods: 24,
      note: 'Twice a month — 24 payslips. Not the same as every two weeks.' },
    { id: 'fortnightly', label: 'every 2 weeks', short: '2wk', periods: 26,
      note: 'Every two weeks — 26 payslips, because a year is not 24 fortnights.' },
    { id: 'weekly',      label: 'a week',      short: 'wk',  periods: 52 },
    { id: 'hourly',      label: 'an hour',     short: 'hr',  periods: null,
      needsHours: true,
      note: 'Needs your hours a week — there is no honest hourly-to-yearly number without them.' },
    /* Not earning. This is a real answer and it is NOT the same as leaving
       the question blank: blank means "I have not told you", this means
       "the number is zero". Everything downstream depends on knowing which
       — a savings rate cannot be computed from either, but only one of them
       should be met with "add your income". DECISIONS.md D-048. */
    { id: 'none',        label: 'not earning right now', short: '—', periods: 0,
      noPay: true,
      note: 'A deliberate zero. Different from skipping the question.' }
  ];

  function basisById(id) {
    for (var i = 0; i < BASES.length; i++) { if (BASES[i].id === id) return BASES[i]; }
    return null;
  }

  /**
   * annualise(source, work) — one pay rate, as a year.
   *
   * `work` supplies weeksPerYear for the hourly case. It is the SAME work
   * profile engines/hourly.js reads, deliberately: the number of weeks you
   * are paid for is one fact about your job, and two rooms disagreeing
   * about it would be worse than either being wrong.
   *
   * Falls back to a stored grossAnnualIncomeCents when no rate is entered,
   * so a household saved before this existed annualises to exactly what it
   * already said.
   */
  function annualise(source, work) {
    var s = source || {};
    var basis = basisById(s.frequency) || basisById('annual');

    /* Not earning needs no rate, and must not ask for one. */
    if (basis.noPay) {
      return Money.ok(0, { basis: basis, rateCents: null, notEarning: true, assumesWeeks: false });
    }

    if (!Money.isEntered(s.rateCents)) {
      /* No rate entered. An annual figure typed straight in is still a
         perfectly good answer — that is the simple path, and the path
         every household stored before this feature is on. */
      if (Money.isEntered(s.grossAnnualIncomeCents)) {
        return Money.ok(s.grossAnnualIncomeCents, {
          basis: basisById('annual'), fromStoredAnnual: true, rateCents: null
        });
      }
      return Money.incomplete('Add what you earn to see this.', ['rateCents']);
    }
    if (s.rateCents < 0) {
      return Money.incomplete('Pay cannot be less than nothing.', ['rateCents']);
    }

    if (basis.needsHours) {
      if (!Money.isEntered(s.hoursPerWeek)) {
        return Money.incomplete(
          'An hourly rate needs the hours you work a week — without them there is no '
            + 'yearly figure, only a guess.', ['hoursPerWeek']);
      }
      if (s.hoursPerWeek <= 0) {
        return Money.incomplete('Hours a week need to be more than zero.', ['hoursPerWeek']);
      }
      var weeks = (work && Money.isEntered(work.weeksPerYear))
        ? work.weeksPerYear : Schema.WORK_DEFAULTS.weeksPerYear;
      if (weeks <= 0) {
        return Money.incomplete('Weeks worked need to be more than zero.', ['weeksPerYear']);
      }
      return Money.ok(Math.round(s.rateCents * s.hoursPerWeek * weeks), {
        basis: basis, rateCents: s.rateCents, hoursPerWeek: s.hoursPerWeek,
        weeksPerYear: weeks,
        /* Said out loud because it is the one conversion here that rests on
           an assumption rather than on the calendar. */
        assumesWeeks: true
      });
    }

    return Money.ok(s.rateCents * basis.periods, {
      basis: basis, rateCents: s.rateCents, periods: basis.periods, assumesWeeks: false
    });
  }

  /** How much of the year this stint covers. Absent means the whole of it. */
  function monthsOf(source) {
    var m = source && source.monthsWorked;
    if (!Money.isEntered(m)) return MONTHS_PER_YEAR;
    return Math.max(0, Math.min(MONTHS_PER_YEAR, m));
  }

  /**
   * summarise(sources, work) — every stint, and the two annual figures.
   *
   * The Result's value is the EARNED figure, because that is what the rest
   * of the app means by "gross annual income": what went through your hands
   * over the year. `runRateCents` sits beside it for anything looking
   * forward.
   */
  function summarise(sources, work) {
    var list = (sources || []).slice();
    if (!list.length) {
      return Money.incomplete('Add what you earn to see this.', ['grossAnnualIncome']);
    }

    var rows = [], earned = 0, runRate = 0;
    var counted = 0, ongoingCounted = 0, monthsCovered = 0;

    list.forEach(function (s) {
      var full = annualise(s, work);
      var months = monthsOf(s);
      var ongoing = s.ongoing === undefined ? true : !!s.ongoing;
      var row = {
        id: s.id,
        label: s.source || null,
        ok: Money.isOk(full),
        reason: Money.isOk(full) ? null : full.reason,
        missing: Money.isOk(full) ? [] : full.missing,
        frequency: (basisById(s.frequency) || basisById('annual')).id,
        basis: Money.isOk(full) ? full.basis : basisById(s.frequency) || basisById('annual'),
        rateCents: Money.isEntered(s.rateCents) ? s.rateCents : null,
        hoursPerWeek: Money.isEntered(s.hoursPerWeek) ? s.hoursPerWeek : null,
        monthsWorked: months,
        ongoing: ongoing,
        /* This stint at its own rate, as if held all year. */
        annualisedCents: Money.isOk(full) ? full.value : null,
        /* What it actually contributed, given how long it lasted. */
        contributedCents: Money.isOk(full)
          ? Math.round(full.value * months / MONTHS_PER_YEAR) : null,
        assumesWeeks: Money.isOk(full) ? full.assumesWeeks === true : false
      };
      row.notEarning = Money.isOk(full) && full.notEarning === true;
      rows.push(row);
      if (!row.ok) return;
      counted++;
      monthsCovered += months;
      earned += row.contributedCents;
      if (ongoing) { runRate += row.annualisedCents; ongoingCounted++; }
    });

    if (counted === 0) {
      var first = rows[0];
      return Money.incomplete(first.reason || 'Add what you earn to see this.',
        first.missing.length ? first.missing : ['grossAnnualIncome']);
    }

    /* Months are NOT validated to sum to twelve, on purpose. Over twelve
       means two jobs at once, which is a real life and a common one. Under
       twelve means a gap — also real. Both are reported rather than
       corrected, because "correcting" either would be inventing income the
       person did not have or deleting a job they did. */
    var overlap = monthsCovered > MONTHS_PER_YEAR;
    var gap = monthsCovered < MONTHS_PER_YEAR;

    /* Every job ended, and none is ongoing. The run rate is not UNKNOWN
       here — it is zero. Someone who stopped working in August earns
       nothing now, and reporting that as "we cannot say" would hide the
       single most important fact about their year. Only a household with
       nothing computable at all has an unknown run rate, and that case has
       already returned above. */
    var notEarning = rows.every(function (r) { return !r.ok || r.notEarning; });

    return Money.ok(earned, {
      rows: rows,
      earnedCents: earned,
      runRateCents: runRate,
      /* True when nothing is coming in now: every stint has ended, or every
         one of them is a deliberate "not earning". */
      earningNothingNow: ongoingCounted === 0 || runRate === 0,
      notEarningAtAll: notEarning,
      /* They differ only when a stint is part-year or has ended. When they
         agree there is nothing to choose between and the room says nothing. */
      differ: runRate !== earned,
      sourceCount: rows.length,
      countedCount: counted,
      incompleteCount: rows.length - counted,
      ongoingCount: ongoingCounted,
      monthsCovered: monthsCovered,
      overlapping: overlap,
      hasGap: gap,
      gapMonths: gap ? MONTHS_PER_YEAR - monthsCovered : 0,
      /* True when any row leaned on the weeks-per-year assumption, so a
         room can name it rather than letting it hide. */
      assumesWeeks: rows.some(function (r) { return r.assumesWeeks; })
    });
  }

  /**
   * Which of the two figures feeds the household, given a stated preference.
   * 'earned' (the default) is what actually happened; 'runRate' is what the
   * current job pays annualised. An unknown preference falls back to earned
   * rather than throwing — a bad stored value should not blank the app.
   */
  function chosenAnnualCents(summary, basisPreference) {
    if (!Money.isOk(summary)) return summary;
    if (basisPreference === 'runRate' && Money.isEntered(summary.runRateCents)) {  /* zero is entered */
      return Money.ok(summary.runRateCents, { used: 'runRate' });
    }
    return Money.ok(summary.earnedCents, { used: 'earned' });
  }

  /** Everything for one household's primary earner, in one call. */
  function forHousehold(household, opts) {
    var o = opts || {};
    var person = o.personId
      ? Schema.personById(household, o.personId)
      : Schema.primaryPerson(household);
    if (!person) {
      return Money.incomplete('Add what you earn to see this.', ['grossAnnualIncome']);
    }
    return summarise(person.incomeSources, Schema.workProfile(person));
  }

  return {
    MONTHS_PER_YEAR: MONTHS_PER_YEAR,
    BASES: BASES,
    basisById: basisById,
    annualise: annualise,
    monthsOf: monthsOf,
    summarise: summarise,
    chosenAnnualCents: chosenAnnualCents,
    forHousehold: forHousehold
  };
});

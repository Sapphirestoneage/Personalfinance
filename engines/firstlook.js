/* ==========================================================================
   engines/firstlook.js — the whole of First Look's arithmetic, in one place.
   --------------------------------------------------------------------------
   DECISIONS.md D-234. The front door asks four to seven questions and then
   has to say something true about the answers. This is that step, and it is
   a pure function: household in, Results out, nothing read from the DOM and
   nothing written anywhere.

   EVERY FIGURE HERE IS TODAY'S MONEY. The return is real, after inflation;
   the FI number is priced in today's dollars; nothing is grown for pay
   rises, and the result screen says so once, at the top.

     takeHomeMonthly = entered, or grossAnnual / 12 * 0.75          [rough]
     living          = entered, or max($600, takeHomeMonthly * 0.45) [rough]
     T (income/yr)   = takeHomeMonthly * 12
     E (costs/yr)    = (housing + living) * 12
     S (surplus/yr)  = T - E
     savingsRate     = S / T
     w               = 0.045 stop early · 0.03 work optional · 0.03 undecided
     r               = the real return (0.05 median band), 0 to 0.12
     fiNumber        = E / w
     A[0] = what is saved;  A[y] = A[y-1] * (1 + r) + S   for y = 1..60
     yearsToFI       = first y where A[y] >= fiNumber, only while S > 0
     runwayMonths    = A[0] / (-S / 12)                   only while S < 0

   Past the FI year the pot stops taking S in and starts paying the costs
   out, plus a health cover line of $7,200 a year — a rough national figure,
   labelled as one, and the only thing here that is not entered or assumed
   on screen.

   NOTHING IS CLAMPED. A negative surplus is the answer, not an error: it
   comes back as `ok` with a negative value and the runway beside it, and
   the room leads with it. An input that was never given comes back
   incomplete with the field id that would fix it, never as a zero.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.FirstLook = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var MONTHS = 12;
  var WALK_YEARS = 60;

  /* The four situations screen one offers. They are the app's own
     employment statuses, minus `retired` and `both`, which First Look does
     not ask about: a stranger who is already retired is not the person this
     door was built for, and they are better served by the Back Half. */
  var SITUATIONS = [
    { id: 'employed',     label: 'Working a job',      sourceLabel: 'Work' },
    { id: 'unemployed',   label: 'Between jobs',       sourceLabel: 'Coming in' },
    { id: 'selfEmployed', label: 'Working for myself', sourceLabel: 'Your work' },
    { id: 'student',      label: 'Studying',           sourceLabel: 'Work' }
  ];
  function situation(id) { return SITUATIONS.filter(function (s) { return s.id === id; })[0] || null; }

  /* Which questions exist at all. A field that does not apply is ABSENT,
     not hidden and not disabled: the flow is built from this list, so a
     person between jobs is never asked what their salary is and never sees
     a box greyed out to tell them so. */
  var STEPS = [
    { id: 'situation',  anchor: 'q-situation', asks: ['employed', 'unemployed', 'selfEmployed', 'student'], question: 'Where are you right now?' },
    { id: 'takehome',   anchor: 'q-takehome',  asks: ['employed', 'selfEmployed', 'student'],               question: 'What lands in your account each month?' },
    { id: 'coming-in',  anchor: 'q-coming-in', asks: ['unemployed'],                                        question: 'What is coming in right now?' },
    { id: 'housing',    anchor: 'q-housing',   asks: ['employed', 'unemployed', 'selfEmployed', 'student'], question: 'What does housing cost you?' },
    { id: 'living',     anchor: 'q-living',    asks: ['employed', 'unemployed', 'selfEmployed', 'student'], question: 'Everything else, roughly?' },
    { id: 'savings',    anchor: 'q-savings',   asks: ['employed', 'unemployed', 'selfEmployed', 'student'], question: 'What do you have saved or invested?' },
    { id: 'match',      anchor: 'q-match',     asks: ['employed', 'selfEmployed'],                          question: 'Does your job match retirement contributions?' },
    { id: 'finish',     anchor: 'q-finish',    asks: ['employed', 'unemployed', 'selfEmployed', 'student'], question: 'Which finish line are you aiming at?' }
  ];
  /** The steps this situation actually asks, in order. Four to seven of them. */
  function steps(situationId) {
    return STEPS.filter(function (s) { return s.asks.indexOf(situationId) !== -1; });
  }

  /* The three estimates, and the one figure that is neither entered nor
     assumed on screen. Each is named on the result screen beside the
     number it moves. */
  var TAKE_HOME_SHARE = 0.75;              /* of gross, when only a salary was given */
  var LIVING_SHARE = 0.45;                 /* of take-home, when "I do not know" was ticked */
  var LIVING_FLOOR_CENTS = 60000;          /* $600 a month, the floor under that estimate */
  var HEALTH_COVER_ANNUAL_CENTS = 720000;  /* $7,200 a year, once the pay stops */

  var FINISH_LINES = [
    { id: 'early',     label: 'Stop as early as possible',      rate: 0.045, gloss: 'a 4.5% withdrawal: earlier, with less room if a decade goes badly' },
    { id: 'optional',  label: 'Reach work optional and keep going', rate: 0.03, gloss: 'a 3% withdrawal: later, with more room' },
    { id: 'undecided', label: 'Not decided yet',                rate: 0.03, gloss: 'the cautious 3% is assumed until you choose' }
  ];
  function finishLine(id) { return FINISH_LINES.filter(function (f) { return f.id === id; })[0] || null; }
  var RETURN_MIN = 0, RETURN_MAX = 0.12;

  /* ---- Reading the answers back ------------------------------------------
     Everything here reads the household the same way the boxes do, so
     re-running First Look shows what was said last time rather than an
     empty form, and changes the same facts rather than adding new ones. */

  function situationOf(household) {
    var p = Schema.primaryPerson(household || {});
    var v = p && p.employmentStatus;
    return situation(v) ? v : null;
  }

  /* An estimate that has been WRITTEN is still an estimate: it is stored as
     a fact so that the Ledger holds it and Refresh asks about it, and it
     carries the field it was worked out from. Read straight off the stored
     facts rather than through the field map, so this stays a pure module
     that an engine test can load on its own. */
  function derivedFrom(household, fieldId) {
    var f = (((household || {}).meta || {}).fields || {})[fieldId];
    return f && f.derivedFrom ? f.derivedFrom : null;
  }

  /** Take-home a month: entered, or three quarters of the salary. */
  function takeHomeMonthly(household) {
    var entered = Schema.enteredTakeHomeMonthlyCents(household);
    if (entered !== null) {
      var from = derivedFrom(household, 'takeHomeMonthly');
      return Money.ok(entered, { rough: !!from, derivedFrom: from, share: from ? TAKE_HOME_SHARE : null });
    }
    var gross = Schema.grossAnnualIncomeCents(household);
    if (!Money.isOk(gross)) return Money.incomplete('Say what lands in your account each month.', ['takeHomeMonthly']);
    return Money.ok(Math.round(gross.value / MONTHS * TAKE_HOME_SHARE), {
      rough: true, derivedFrom: 'grossAnnualIncome', share: TAKE_HOME_SHARE, grossAnnualCents: gross.value
    });
  }

  function housingMonthly(household) {
    var f = Schema.fat(household || {});
    var a = f.accommodation;
    return Money.isOk(a) ? Money.ok(a.value, { rough: false }) : Money.incomplete('Say what housing costs you.', ['accommodationMonthly']);
  }

  /** Everything else a month: entered, or 45% of take-home with a floor. */
  function livingMonthly(household) {
    var f = Schema.fat(household || {});
    if (Money.isOk(f.wants)) {
      var from = derivedFrom(household, 'wantsMonthly');
      return Money.ok(f.wants.value, { rough: !!from, derivedFrom: from, share: from ? LIVING_SHARE : null });
    }
    var take = takeHomeMonthly(household);
    if (!Money.isOk(take)) return Money.incomplete('Say roughly what everything else costs.', ['wantsMonthly']);
    return Money.ok(Math.max(LIVING_FLOOR_CENTS, Math.round(take.value * LIVING_SHARE)), {
      rough: true, derivedFrom: 'takeHomeMonthly', share: LIVING_SHARE, floorCents: LIVING_FLOOR_CENTS
    });
  }

  /** The pot: cash plus anything invested. One question, two places it can
      already be sitting, counted once each. */
  function savedCents(household) {
    var cash = Schema.cashCents(household);
    var inv = Schema.investmentsCents(household);
    if (!Money.isOk(cash) && !Money.isOk(inv)) return Money.incomplete('Say what you have saved.', ['cashSavings']);
    var total = (Money.isOk(cash) ? cash.value : 0) + (Money.isOk(inv) ? inv.value : 0);
    return Money.ok(total, { cashCents: Money.isOk(cash) ? cash.value : null, investedCents: Money.isOk(inv) ? inv.value : null });
  }

  /** Is a credit-card balance being carried? A card on the debt list says
      yes; nothing on the list is not the same as a no, so it reads back as
      null until the question has been answered one way or the other. */
  function cardCarried(household) {
    var debts = (household && household.debts) || [];
    if (debts.some(function (d) { return d.type === 'credit_card'; })) return true;
    var said = (household && household.meta || {}).hasDebt;
    return said === false ? false : null;
  }

  /** full · partial · none · unsure · null (never asked). */
  function matchAnswer(household) {
    var h = household || {};
    if (Schema.notSure && Schema.notSure(h, 'employerMatch')) return 'unsure';
    if (h.capturingFullMatch === true) return 'full';
    if (h.capturingFullMatch === false) return 'partial';
    var p = Schema.primaryPerson(h);
    var s = p && p.incomeSources && p.incomeSources[0];
    var m = (s && s.employerMatch) || {};
    if (Money.isEntered(m.matchPercent) && m.matchPercent === 0) return 'none';
    return null;
  }

  /** The finish line, read back off the one assumption it sets. */
  function finishOf(household) {
    var over = (household && household.assumptionOverrides) || {};
    if (!Money.isEntered(over.swrRate)) return 'undecided';
    return Math.abs(over.swrRate - 0.045) < 1e-9 ? 'early' : Math.abs(over.swrRate - 0.03) < 1e-9 ? 'optional' : 'custom';
  }
  /** The withdrawal rate in force: what was set, else the cautious 3%. */
  function withdrawalRate(household, opts) {
    var o = opts || {};
    if (Money.isEntered(o.withdrawalRate)) return o.withdrawalRate;
    var over = (household && household.assumptionOverrides) || {};
    return Money.isEntered(over.swrRate) ? over.swrRate : finishLine('undecided').rate;
  }
  /** The real return in force: what was set, else the median band. */
  function realReturn(household, tables, opts) {
    var o = opts || {};
    if (Money.isEntered(o.returnReal)) return o.returnReal;
    return Schema.resolveAssumptions(household || {}, null, tables).returnReal;
  }

  /** Everything the room read out of the household, in one object. */
  function inputs(household, tables, opts) {
    var h = household || {};
    return {
      situation: situationOf(h),
      takeHome: takeHomeMonthly(h),
      housing: housingMonthly(h),
      living: livingMonthly(h),
      saved: savedCents(h),
      card: cardCarried(h),
      match: matchAnswer(h),
      finish: finishOf(h),
      withdrawalRate: withdrawalRate(h, opts),
      returnReal: realReturn(h, tables, opts)
    };
  }

  /* ---- The walk -----------------------------------------------------------
     Sixty years of a pot that takes the surplus in and, once it is big
     enough to live on, pays the costs out instead. One loop, so the chart,
     the year figure and the FI date can never disagree. */
  function walk(startCents, surplusAnnual, rate, costsAnnual, fiNumberCents) {
    var rows = [], pot = startCents, fiYear = null;
    if (Money.isEntered(fiNumberCents) && pot >= fiNumberCents) fiYear = 0;
    rows.push({ year: 0, potCents: Math.round(pot), postFi: fiYear === 0 });
    for (var y = 1; y <= WALK_YEARS; y++) {
      if (fiYear === null) pot = pot * (1 + rate) + surplusAnnual;
      else pot = pot * (1 + rate) - (costsAnnual + HEALTH_COVER_ANNUAL_CENTS);
      if (fiYear === null && Money.isEntered(fiNumberCents) && surplusAnnual > 0 && pot >= fiNumberCents) fiYear = y;
      rows.push({ year: y, potCents: Math.round(pot), postFi: fiYear !== null && y >= fiYear });
    }
    return { rows: rows, fiYear: fiYear };
  }

  /* ---- The result ---------------------------------------------------------
     One call, everything the screen shows. Incomplete only when a question
     that was asked has no answer yet; never a zero standing in for one. */
  function result(household, tables, opts) {
    var h = household || {};
    var i = inputs(h, tables, opts);
    if (!i.situation) return Money.incomplete('Say where you are right now to see this.', ['employmentStatus']);

    var missing = [];
    if (!Money.isOk(i.takeHome)) missing.push('takeHomeMonthly');
    if (!Money.isOk(i.housing)) missing.push('accommodationMonthly');
    if (!Money.isOk(i.living)) missing.push('wantsMonthly');
    if (!Money.isOk(i.saved)) missing.push('cashSavings');
    if (missing.length) {
      return Money.incomplete('A few answers still to give: ' + missing.length + ' of them.', missing);
    }

    var takeHome = i.takeHome.value;
    var housing = i.housing.value;
    var living = i.living.value;
    var startCents = i.saved.value;

    var incomeAnnual = takeHome * MONTHS;
    var costsMonthly = housing + living;
    var costsAnnual = costsMonthly * MONTHS;
    var surplusAnnual = incomeAnnual - costsAnnual;
    var w = i.withdrawalRate;
    var r = Math.min(RETURN_MAX, Math.max(RETURN_MIN, i.returnReal));
    var fiNumberCents = w > 0 ? Math.round(costsAnnual / w) : null;

    /* A rate of zero income is a real answer between jobs, so the savings
       rate is a ratio that may not exist; it is never faked at zero. */
    var savingsRate = Money.safeDivide(surplusAnnual, incomeAnnual, {
      zeroReason: 'Nothing is coming in this month, so there is no share of it to measure.',
      denominatorName: 'takeHomeMonthly'
    });

    var wk = walk(startCents, surplusAnnual, r, costsAnnual, fiNumberCents);
    var yearsToFI = wk.fiYear;
    /* The runway: how long what is saved covers the gap. Only when the
       month is short — a surplus has no runway, it has a date. */
    var runwayMonths = surplusAnnual < 0 ? startCents / (-surplusAnnual / MONTHS) : null;

    var estimated = [];
    if (i.takeHome.rough) estimated.push({ fieldId: 'takeHomeMonthly', label: 'what lands each month', derivedFrom: i.takeHome.derivedFrom, how: 'three quarters of the salary you gave' });
    if (i.living.rough) estimated.push({ fieldId: 'wantsMonthly', label: 'everything else', derivedFrom: i.living.derivedFrom, how: '45% of your take-home, never under $600' });

    var out = {
      situation: i.situation,
      situationLabel: (situation(i.situation) || {}).label || i.situation,
      sourceLabel: (situation(i.situation) || {}).sourceLabel || 'Work',
      takeHomeMonthlyCents: takeHome,
      housingMonthlyCents: housing,
      livingMonthlyCents: living,
      costsMonthlyCents: costsMonthly,
      incomeAnnualCents: incomeAnnual,
      costsAnnualCents: costsAnnual,
      surplusAnnualCents: surplusAnnual,
      surplusMonthlyCents: Math.round(surplusAnnual / MONTHS),
      savingsRate: savingsRate,
      savedCents: startCents,
      cashCents: i.saved.cashCents,
      investedCents: i.saved.investedCents,
      withdrawalRate: w,
      returnReal: r,
      finish: i.finish,
      fiNumberCents: fiNumberCents,
      yearsToFI: yearsToFI,
      runwayMonths: runwayMonths,
      rows: wk.rows,
      estimated: estimated,
      card: i.card,
      match: i.match,
      healthCoverAnnualCents: HEALTH_COVER_ANNUAL_CENTS
    };
    out.headline = headline(out);
    out.next = nextStep(out);
    /* The value of the Result is the one figure the headline leads on, so
       a caller that only wants a number has one. */
    return Money.ok(out.headline.valueCents === undefined ? surplusAnnual : out.headline.valueCents, out);
  }

  /* ---- The headline -------------------------------------------------------
     Chosen by the situation first and the numbers second, because a person
     between jobs is not helped by a savings rate and a person whose month
     is short is not helped by a date thirty years out. */
  function headline(r) {
    if (r.situation === 'unemployed') {
      if (r.surplusAnnualCents >= 0) {
        return { id: 'more-coming-in', valueCents: r.surplusMonthlyCents,
          words: 'More is arriving than going out.' };
      }
      return { id: 'runway', months: r.runwayMonths, valueCents: r.savedCents,
        words: 'What you can reach covers about ' + Money.formatMonths(r.runwayMonths) + '.' };
    }
    if (r.surplusAnnualCents < 0) {
      return { id: 'gap', valueCents: -r.surplusMonthlyCents, months: r.runwayMonths,
        words: 'You are ' + Money.formatCents(-r.surplusMonthlyCents) + ' short each month.' };
    }
    return { id: 'rate', rate: Money.isOk(r.savingsRate) ? r.savingsRate.value : null,
      years: r.yearsToFI, valueCents: r.surplusMonthlyCents,
      words: Money.isOk(r.savingsRate) ? Money.formatRate(r.savingsRate.value) + ' of what lands is being kept.' : 'Nothing is coming in yet.' };
  }

  /* ---- One next step ------------------------------------------------------
     Never a list, never a verdict. The first rule that matches wins and the
     rest are not shown, because a person who has just given seven answers
     can act on one thing.

     Rule 1 asks about the situation as well as the surplus: a month that
     does not cover itself is the news for somebody working, but for
     somebody between jobs it is the definition of being between jobs, and
     the step that fits them is rule 5. */
  function nextStep(r) {
    var oneMonth = r.costsMonthlyCents;
    var threeMonths = r.costsMonthlyCents * 3;
    if (r.surplusAnnualCents < 0 && r.situation !== 'unemployed') {
      return { id: 'close-the-gap', room: 'expenses',
        title: 'Close the ' + Money.formatCents(-r.surplusMonthlyCents) + ' a month gap',
        reason: 'More is going out than coming in, so every other plan waits behind this one.',
        figureCents: -r.surplusMonthlyCents };
    }
    if (r.card === true) {
      return { id: 'clear-the-card', room: 'debt-payoff',
        title: 'Clear the card',
        reason: r.surplusMonthlyCents > 0
          ? 'A card charges more than savings pay, and you have ' + Money.formatCents(r.surplusMonthlyCents) + ' a month to point at it.'
          : 'A card charges more than savings pay, so it comes before the cushion.',
        figureCents: r.surplusMonthlyCents > 0 ? r.surplusMonthlyCents : null };
    }
    if (r.savedCents < oneMonth) {
      var toGo = oneMonth - r.savedCents;
      var months = r.surplusMonthlyCents > 0 ? toGo / r.surplusMonthlyCents : null;
      return { id: 'one-month', room: 'runway',
        title: 'Build one month of costs, ' + Money.formatCents(oneMonth),
        reason: 'You have ' + Money.formatCents(r.savedCents) + ' against a ' + Money.formatCents(oneMonth) + ' month'
          + (months === null ? '.' : ', about ' + Money.formatMonths(months) + ' away at this pace.'),
        figureCents: oneMonth, haveCents: r.savedCents, months: months };
    }
    if (r.match === 'partial') {
      return { id: 'claim-the-match', room: 'foo-ladder',
        title: 'Claim the rest of the match',
        reason: 'Match your employer offers and you do not take is the only money in this room that is free.' };
    }
    if (r.match === 'unsure') {
      return { id: 'find-the-match', room: 'foo-ladder',
        title: 'Find out what the match is',
        reason: 'It is one line in the plan documents, and it is the only money in this room that is free.' };
    }
    if (r.situation === 'unemployed') {
      return { id: 'protect-the-runway', room: 'runway',
        title: 'Protect the runway',
        reason: 'The cash is the plan until pay starts again. A low-income year is also the cheapest year there is to move money into a Roth.',
        months: r.runwayMonths };
    }
    if (r.savedCents < threeMonths) {
      var gap = threeMonths - r.savedCents;
      return { id: 'three-months', room: 'runway',
        title: 'Get to three months, ' + Money.formatCents(threeMonths),
        reason: 'You have ' + Money.formatCents(r.savedCents) + '; three months of costs is ' + Money.formatCents(threeMonths) + ', so ' + Money.formatCents(gap) + ' to go.',
        figureCents: threeMonths, haveCents: r.savedCents,
        months: r.surplusMonthlyCents > 0 ? gap / r.surplusMonthlyCents : null };
    }
    return { id: 'where-the-surplus-goes', room: 'foo-ladder',
      title: 'Put the ' + Money.formatCents(r.surplusMonthlyCents) + ' a month where it grows',
      reason: 'The month covers itself and the cushion is there. The open question is which account it goes into, which is the next room.',
      figureCents: r.surplusMonthlyCents };
  }

  /* ---- The picture --------------------------------------------------------
     One year of the walk as a flow: where the money comes from on the left,
     where it goes on the right. Dragging the year across the FI line turns
     Work into Your portfolio, which is the whole reason the screen exists.
     Amounts are a month, because that is the unit a person recognises. */
  function flow(r, year) {
    var y = Math.max(0, Math.min(WALK_YEARS, Math.round(Money.isEntered(year) ? year : 0)));
    var row = r.rows[y] || r.rows[0];
    var post = !!row.postFi;
    var sources = [], outflows = [];
    if (r.situation === 'unemployed' && !post) {
      /* Two sources: what arrives, and the cash making up the difference. */
      var shortfall = Math.max(0, r.costsMonthlyCents - r.takeHomeMonthlyCents);
      if (r.takeHomeMonthlyCents > 0) sources.push({ id: 'coming-in', label: 'Coming in', monthlyCents: r.takeHomeMonthlyCents });
      if (shortfall > 0) sources.push({ id: 'cash', label: 'Your cash', monthlyCents: shortfall });
      outflows.push({ id: 'housing', label: 'Housing', monthlyCents: r.housingMonthlyCents });
      outflows.push({ id: 'living', label: 'Everything else', monthlyCents: r.livingMonthlyCents });
    } else if (post) {
      var health = Math.round(HEALTH_COVER_ANNUAL_CENTS / MONTHS);
      sources.push({ id: 'portfolio', label: 'Your portfolio', monthlyCents: r.costsMonthlyCents + health });
      outflows.push({ id: 'housing', label: 'Housing', monthlyCents: r.housingMonthlyCents });
      outflows.push({ id: 'living', label: 'Everything else', monthlyCents: r.livingMonthlyCents });
      outflows.push({ id: 'health', label: 'Health cover', monthlyCents: health, rough: true });
    } else {
      sources.push({ id: 'work', label: r.sourceLabel, monthlyCents: r.takeHomeMonthlyCents });
      outflows.push({ id: 'housing', label: 'Housing', monthlyCents: r.housingMonthlyCents });
      outflows.push({ id: 'living', label: 'Everything else', monthlyCents: r.livingMonthlyCents });
      if (r.surplusMonthlyCents > 0) outflows.push({ id: 'saving', label: 'Saving and investing', monthlyCents: r.surplusMonthlyCents });
    }
    return { year: y, postFi: post, potCents: row.potCents, sources: sources, outflows: outflows };
  }

  /** How far the scrubber runs: this year to about FI plus fifteen, and
   *  never so short that there is nothing to drag. */
  function scrubberYears(r) {
    var end = Money.isEntered(r.yearsToFI) ? r.yearsToFI + 15 : 30;
    return Math.max(10, Math.min(WALK_YEARS, Math.round(end)));
  }

  return {
    SITUATIONS: SITUATIONS, STEPS: STEPS, FINISH_LINES: FINISH_LINES,
    TAKE_HOME_SHARE: TAKE_HOME_SHARE, LIVING_SHARE: LIVING_SHARE, LIVING_FLOOR_CENTS: LIVING_FLOOR_CENTS,
    HEALTH_COVER_ANNUAL_CENTS: HEALTH_COVER_ANNUAL_CENTS, WALK_YEARS: WALK_YEARS,
    RETURN_MIN: RETURN_MIN, RETURN_MAX: RETURN_MAX,
    situation: situation, situationOf: situationOf, steps: steps, finishLine: finishLine, derivedFrom: derivedFrom,
    takeHomeMonthly: takeHomeMonthly, housingMonthly: housingMonthly, livingMonthly: livingMonthly,
    savedCents: savedCents, cardCarried: cardCarried, matchAnswer: matchAnswer, finishOf: finishOf,
    withdrawalRate: withdrawalRate, realReturn: realReturn,
    inputs: inputs, walk: walk, result: result, headline: headline, nextStep: nextStep,
    flow: flow, scrubberYears: scrubberYears
  };
});

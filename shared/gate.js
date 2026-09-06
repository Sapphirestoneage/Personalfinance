/* ==========================================================================
   shared/gate.js — the one gate, and what exists behind it.
   --------------------------------------------------------------------------
   "What's your situation?" decides which fields exist on the one-pager —
   not hidden, absent — and what each one is guessed at before you touch
   it. This file is the whole of that logic, pure, so the page, the
   dashboard and the tests read the same answer:

     SITUATIONS            the six, each mapped to an employment status
     situationOf(h)        which one this household chose (null until then)
     fieldsFor(id, h)      the cards that exist for it, in order — never
                           more than ten — each saying which controls it
                           holds and which ownership fields it writes
     guesses(id, h, T)     a sane default for every guessable field, with
                           its source, from data/onepager_defaults.json and
                           the tables, so the page can propose them (D-060)
                           and "See my dashboard" can commit what is left
                           as guesses, flagged as such (D-094)

   The rule that matters: anything downstream of an absent field is absent
   too. No employer → no match, no contribution, no capture; the ownership
   rows already say so (couldHaveEmployerMatch), and this file only ever
   lists a card whose fields apply.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money, Schema: root.SLAF && root.SLAF.Schema };
  }
  var api = factory(deps.Money, deps.Schema);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Gate = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema) {
  'use strict';

  var MAX_FIELDS = 10;
  var MONTHS = 12;

  /* lead: the dashboard's first number for this situation (the brief's
     table): savings rate and the FI date, owner's pay and the quarterly,
     runway in days, the loan trajectory, the withdrawal rate. */
  var SITUATIONS = [
    { id: 'employed',     label: 'Employed — a W-2 job',        status: 'employed',     lead: 'savingsRate',    blurb: 'A paycheque, and maybe a 401(k) with a match.' },
    { id: 'selfEmployed', label: 'Self-employed or 1099',            status: 'selfEmployed', lead: 'ownersPay',      blurb: 'Your own work. No employer, so no match — and tax is yours to set aside.' },
    { id: 'betweenJobs',  label: 'Between jobs',                     status: 'unemployed',   lead: 'runwayDays',     blurb: 'The runway is the number now.' },
    { id: 'student',      label: 'Student',                          status: 'student',      lead: 'loanTrajectory', blurb: 'Little coming in, maybe loans, maybe family behind you.' },
    { id: 'retired',      label: 'Retired',                          status: 'retired',      lead: 'withdrawalRate', blurb: 'Money coming in from what you built.' },
    { id: 'mixed',        label: 'Mixed — a job and my own work', status: 'both',         lead: 'savingsRate',    blurb: 'Two kinds of income; the job’s plan still counts.' }
  ];

  /* ---- exists(h, key): does this branch exist for this household? ---------
     The one check every room and every computation calls. Absent means
     absent: not rendered, not counted, not nudged. Unanswered situation:
     everything exists — the map before the intake shows every room. */
  var BRANCHES = {
    income:        function (h, s) { return s === null || s !== 'betweenJobs' || Money.isOk(Schema.grossAnnualIncomeCents(h)); },
    retirement:    function (h, s) { return (s === null || s === 'employed' || s === 'mixed') && Schema.couldHaveEmployerMatch(h); },
    employerMatch: function (h, s) { return BRANCHES.retirement(h, s); },
    payroll:       function (h, s) { return BRANCHES.retirement(h, s); },
    ownWork:       function (h, s) { return s === null || s === 'selfEmployed' || s === 'mixed'; },
    variableIncome: function (h, s) { return BRANCHES.ownWork(h, s); },
    quarterlyTax:  function (h, s) { return BRANCHES.ownWork(h, s); },
    unemployment:  function (h, s) { return s === 'betweenJobs'; },
    pension:       function (h, s) { return s === null || s === 'retired'; },
    stipend:       function (h, s) { return s === null || s === 'student'; },
    partner:       function (h) { return hasPartner(h); },
    hours:         function (h, s) { return s === null || s === 'employed' || s === 'selfEmployed' || s === 'mixed' || s === 'student'; },
    realHourlyWage: function (h, s) { return BRANCHES.hours(h, s); },
    career:        function (h, s) { return s === null || s === 'employed' || s === 'selfEmployed' || s === 'mixed' || s === 'student'; },
    savingsRate:   function (h, s) { return s === null || (s !== 'retired' && s !== 'betweenJobs'); },
    decumulation:  function (h, s) { return s === null || s === 'retired'; },
    protection:    function (h, s) { return s !== 'student'; },
    dependents:    function (h) { return Array.isArray(h.dependents) && h.dependents.length > 0; },
    childcare:     function (h) { return Array.isArray(h.dependents) && h.dependents.some(function (d) { return Money.isEntered(d.age) && d.age < 5; }); },
    daySchool:     function (h) { return !!(h.community && h.community.daySchool === true) && BRANCHES.dependents(h); },
    debt:          function (h) { return !(h.meta && h.meta.hasDebt === false); },
    studentLoans:  function (h, s) { return (s === null || s === 'student') && BRANCHES.debt(h); }
  };
  /* ---- why(h, key): the sentence a room says when it does not apply -------
     `exists` decides; this says it out loud. The two live together on
     purpose: a branch added here without a sentence would leave a room
     hiding itself for no stated reason, which is the thing this app is not
     allowed to do. Written to be true of any situation the branch is false
     in, and the situation is named separately by the caller. D-142. */
  var WHY = {
    income:         'There is nothing coming in yet to work from.',
    retirement:     'This one is about a workplace retirement plan. There is no employer here to run one.',
    employerMatch:  'A match comes from an employer. There is no employer here.',
    payroll:        'This one reads a payslip. There is no payroll here.',
    ownWork:        'This one is about work you do for yourself.',
    variableIncome: 'This one smooths income that changes month to month. There is no such income here.',
    quarterlyTax:   'Quarterly tax is something you set aside on your own work.',
    unemployment:   'This one is about the money that comes in between jobs.',
    pension:        'This one is about drawing a pension.',
    stipend:        'This one is about a student stipend.',
    partner:        'This one is about two adults sharing a household. There is only one adult here.',
    hours:          'This one prices the hours a job takes. There is no job to price yet.',
    realHourlyWage: 'This one prices the hours a job takes. There is no job to price yet.',
    career:         'This one is about moving a career forward from inside a job.',
    savingsRate:    'A savings rate is a share of what comes in. There is nothing coming in to take a share of.',
    decumulation:   'This one is about drawing down what you built, which comes after work.',
    protection:     'This one is about insuring an income and the people who depend on it.',
    dependents:     'This one is about children or others who depend on you. You have not named any.',
    childcare:      'This one is about childcare for a child under five.',
    daySchool:      'This one is about day-school fees.',
    debt:           'You said there is nothing owed.',
    studentLoans:   'This one is about student loans.'
  };
  /** The first reason this room does not apply, or null if it does. */
  function why(household, keys) {
    var list = [].concat(keys || []);
    for (var i = 0; i < list.length; i++) {
      if (!exists(household, list[i])) return WHY[list[i]] || 'This one does not apply to your situation.';
    }
    return null;
  }
  function exists(household, key) {
    var h = household || {};
    var fn = BRANCHES[key];
    if (!fn) return true;
    return !!fn(h, situationOf(h));
  }
  function lead(household) {
    var s = byId(situationOf(household));
    return s ? s.lead : 'savingsRate';
  }
  /** Every branch key with its answer, for a walk-through. */
  function branches(household) {
    var out = {};
    Object.keys(BRANCHES).forEach(function (k) { out[k] = exists(household, k); });
    return out;
  }

  function byId(id) {
    for (var i = 0; i < SITUATIONS.length; i++) if (SITUATIONS[i].id === id) return SITUATIONS[i];
    return null;
  }
  function byStatus(status) {
    for (var i = 0; i < SITUATIONS.length; i++) if (SITUATIONS[i].status === status) return SITUATIONS[i];
    return null;
  }

  /** The situation this household chose, from the primary person's status. */
  function situationOf(household) {
    var p = Schema.primaryPerson(household || {});
    if (!p || !p.employmentStatus) return null;
    var s = byStatus(p.employmentStatus);
    return s ? s.id : null;
  }

  function adults(h) { return (h && h.people || []).filter(function (p) { return p.role === 'adult'; }); }
  function hasPartner(h) { return adults(h).length >= 2; }

  /* ---- The cards ---------------------------------------------------------
     id           the card's element id on the page (and the anchor the
                  ownership rows link to)
     label        what it asks
     fields       the ownership fields it writes
     controls     what is on it — the page builds from this list
     when         a predicate on the household; absent → the card exists
  ------------------------------------------------------------------------ */
  var CARDS = {
    about:        { id: 'q-about',      label: 'About you',                      fields: ['dob', 'state', 'filingStatus'],
                    controls: ['month', 'year', 'state', 'household', 'filing'] },
    pay:          { id: 'q-income',     label: 'What you earn',                  fields: ['grossAnnualIncome'], controls: ['pay', 'basis'] },
    ownWork:      { id: 'q-own-work',   label: 'What your own work brings in',   fields: ['grossAnnualIncome'], controls: ['pay2', 'basis2'] },
    retiredPay:   { id: 'q-income',     label: 'What comes in, a month',         fields: ['grossAnnualIncome'], controls: ['pay', 'basis'] },
    studentPay:   { id: 'q-income',     label: 'Anything coming in?',            fields: ['grossAnnualIncome'], controls: ['pay', 'basis'] },
    betweenJobs:  { id: 'q-unemployed', label: 'Between jobs',                   fields: ['unemployment'], controls: ['since', 'benefitStatus', 'weekly', 'weeks', 'severance', 'lastPay'] },
    partnerPay:   { id: 'q-partner',    label: 'The other of you',               fields: ['grossAnnualIncome'], controls: ['partnerLabel', 'partnerStatus', 'partnerPay', 'partnerBasis'],
                    when: function (h) { return hasPartner(h); } },
    spending:     { id: 'q-expenses',   label: 'What goes out, a month',         fields: ['monthlyExpenses'], controls: ['spending', 'noRent', 'oneOff'] },
    cash:         { id: 'q-cash',       label: 'Cash, and the first thing it covers', fields: ['cashSavings', 'highestDeductible'], controls: ['cash', 'deductible'] },
    investments:  { id: 'q-investments', label: 'Investments and retirement',     fields: ['investments'], controls: ['investments'] },
    plan:         { id: 'q-plan',       label: 'Your 401(k)',                    fields: ['employerMatch', 'contributionPercent', 'capturingFullMatch'], controls: ['matchPercent', 'matchCap', 'contribution'],
                    when: function (h) { return Schema.couldHaveEmployerMatch(h); } },
    debt:         { id: 'q-debt',       label: 'What you owe',                   fields: ['hasDebt', 'totalDebt', 'monthlyDebtPayments'], controls: ['hasDebt', 'debtBalance', 'debtMinimum', 'debtRate'] }
  };

  /* The order per situation. Ten at most, with the partner card only when
     there are two of you — it is the one card that appears on an answer
     given on this page. */
  var ORDER = {
    employed:     ['about', 'pay', 'partnerPay', 'spending', 'cash', 'investments', 'plan', 'debt'],
    selfEmployed: ['about', 'pay', 'partnerPay', 'spending', 'cash', 'investments', 'debt'],
    betweenJobs:  ['about', 'betweenJobs', 'partnerPay', 'spending', 'cash', 'investments', 'debt'],
    student:      ['about', 'studentPay', 'partnerPay', 'spending', 'cash', 'investments', 'debt'],
    retired:      ['about', 'retiredPay', 'partnerPay', 'spending', 'cash', 'investments', 'debt'],
    mixed:        ['about', 'pay', 'ownWork', 'partnerPay', 'spending', 'cash', 'investments', 'plan', 'debt']
  };

  /** The cards that exist for a situation and this household, in order. */
  function fieldsFor(situationId, household) {
    var order = ORDER[situationId];
    if (!order) return [];
    var h = household || {};
    return order.map(function (key) { return Object.assign({ key: key }, CARDS[key]); })
      .filter(function (card) { return !card.when || card.when(h); });
  }

  /** Every card any situation could show — for the page to build once. */
  function allCards() {
    var seen = {}, out = [];
    Object.keys(ORDER).forEach(function (s) { ORDER[s].forEach(function (k) { if (!seen[k]) { seen[k] = true; out.push(Object.assign({ key: k }, CARDS[k])); } }); });
    return out;
  }

  /* ---- Guesses ------------------------------------------------------------- */

  function milestoneMultiple(table, age) {
    if (!table || !table.milestones || !Money.isEntered(age)) return null;
    var rows = table.milestones.slice().sort(function (a, b) { return a.age - b.age; });
    if (age <= rows[0].age) return rows[0].multiple * (age / rows[0].age);
    for (var i = 1; i < rows.length; i++) {
      if (age <= rows[i].age) {
        var a = rows[i - 1], b = rows[i];
        return a.multiple + (b.multiple - a.multiple) * (age - a.age) / (b.age - a.age);
      }
    }
    return rows[rows.length - 1].multiple;
  }

  /**
   * guesses(situationId, household, tables) → { fieldKey: { value, display?, source } }
   * A sane default for every guessable control, with where it came from.
   * Values are in the unit the control writes (cents, percent, an id).
   * Nothing here is stored: the page proposes, the person decides, and
   * "See my dashboard" commits what is left as guesses.
   */
  function guesses(situationId, household, tables) {
    var d = tables && tables.onepagerDefaults;
    if (!d) return {};
    var h = household || {};
    var age = Schema.primaryAge(h);
    var out = {};
    var conf = ' (' + d.confidence + ')';
    var grossCents = null;

    if (situationId === 'employed' || situationId === 'mixed') {
      grossCents = Math.round(d.medianW2AnnualDollars * 100);
      out.pay = { value: grossCents, basis: 'annual', source: 'the US median full-time pay, ' + Money.formatCents(grossCents) + ' a year' + conf };
    } else if (situationId === 'selfEmployed') {
      grossCents = Math.round(d.selfEmployedAnnualDollars * 100);
      out.pay = { value: grossCents, basis: 'annual', source: 'a typical self-employed profit, ' + Money.formatCents(grossCents) + ' a year' + conf };
    } else if (situationId === 'retired') {
      grossCents = Math.round(d.retiredMonthlyDollars * 100 * MONTHS);
      out.pay = { value: Math.round(d.retiredMonthlyDollars * 100), basis: 'monthly', source: 'a typical retired household’s income, ' + Money.formatCents(Math.round(d.retiredMonthlyDollars * 100)) + ' a month' + conf };
    } else if (situationId === 'student') {
      grossCents = Math.round(d.studentMonthlyDollars * 100 * MONTHS);
      out.pay = { value: Math.round(d.studentMonthlyDollars * 100), basis: 'monthly', source: 'a part-time job’s worth, ' + Money.formatCents(Math.round(d.studentMonthlyDollars * 100)) + ' a month' + conf };
    }
    if (situationId === 'mixed') {
      out.ownWork = { value: Math.round(d.sideWorkAnnualDollars * 100), basis: 'annual', source: 'a typical side income, ' + Money.formatCents(Math.round(d.sideWorkAnnualDollars * 100)) + ' a year' + conf };
    }
    /* Spending: a share of gross, floored — or, with no rent, a smaller
       share; with nothing coming in, the floor. */
    var known = Schema.grossAnnualIncomeCents(h);
    var base = Money.isOk(known) ? known.value : grossCents;
    var share = h.meta && h.meta.noRent ? d.spendingShareNoRent : d.spendingShareOfGross;
    var spend = base ? Math.max(Math.round(d.spendingFloorDollars * 100), Math.round(base / MONTHS * share)) : Math.round(d.spendingFloorDollars * 100);
    if (situationId === 'student') spend = Math.round(d.studentSpendingDollars * 100);
    out.spending = { value: spend, source: situationId === 'student' ? 'a typical student month' + conf
      : (base ? Math.round(share * 100) + '% of gross, a month' : 'a typical month’s essentials, ' + Money.formatCents(spend)) + conf };
    out.cash = { value: spend * d.cashMonths, source: d.cashMonths + ' month' + (d.cashMonths === 1 ? '' : 's') + ' of that spending' + conf };
    out.deductible = { value: Math.round(d.deductibleDollars * 100), source: 'a common health-plan deductible' + conf };
    var mult = milestoneMultiple(tables.retirementMilestones, age);
    var invBase = base || 0;
    out.investments = { value: situationId === 'student' ? 0 : (mult !== null && invBase ? Math.round(invBase * mult) : Math.round(d.investmentsFallbackDollars * 100)),
      source: situationId === 'student' ? 'nothing yet, usually' + conf
        : mult !== null && invBase ? (Math.round(mult * 10) / 10) + '× income, the age-' + age + ' milestone (' + tables.retirementMilestones.confidence + ')' : 'a round starting figure' + conf };
    if (situationId === 'employed' || situationId === 'mixed') {
      var md = tables.matchDefaults && tables.matchDefaults.mostCommon;
      out.matchPercent = { value: md ? Math.round(md.matchPercent * 100) : 50, source: 'the most common match, ' + (md ? Math.round(md.matchPercent * 100) + '% of the first ' + Math.round(md.matchCapPercentOfSalary * 100) + '%' : '50% of 6%') + (tables.matchDefaults ? ' (' + tables.matchDefaults.confidence + ')' : '') };
      out.matchCap = { value: md ? Math.round(md.matchCapPercentOfSalary * 100) : 6, source: out.matchPercent.source };
      out.contribution = { value: d.contributionPercent, source: 'enough to take the whole match' + conf };
    }
    out.filing = { value: hasPartner(h) ? 'married_joint' : 'single', source: hasPartner(h) ? 'two of you, so joint' : 'one of you' };
    out.hasDebt = { value: situationId === 'student' ? 'yes' : 'no', source: situationId === 'student' ? 'most students carry a loan' + conf : 'no debt, until you say otherwise' };
    if (situationId === 'betweenJobs') {
      var ui = tables.uiBenefits, st = h.state && ui && ui.states && ui.states[h.state];
      if (st) {
        out.weekly = { value: Math.round(st.maxWeeklyDollars * 100), source: 'up to the ' + h.state + ' cap of $' + st.maxWeeklyDollars + ' a week (' + ui.confidence + ')' };
        out.weeks = { value: st.weeks, source: h.state + ' pays up to ' + st.weeks + ' weeks (' + ui.confidence + ')' };
      }
      out.lastPay = { value: Math.round(d.medianW2AnnualDollars * 100), source: 'the US median full-time pay' + conf };
    }
    return out;
  }

  /* ---- Import: pasted text or a CSV, one line a number ----------------------
     "Salary, 62,000" / "checking $4,120" / "401k: 31k" — each line that
     names a thing the one-pager asks and carries an amount becomes a row.
     Pure: the page decides what to write, and writes it as one batch so
     one undo takes the whole import back. D-095. */
  var IMPORT_KEYS = [
    { key: 'pay',         words: ['salary', 'income', 'wage', 'wages', 'gross', 'pay', 'earn', 'earnings', 'paycheck', 'paycheque'] },
    { key: 'spending',    words: ['spend', 'spending', 'expense', 'expenses', 'rent', 'bills', 'budget', 'outgoing', 'outgoings', 'costs'] },
    { key: 'cash',        words: ['cash', 'savings', 'saving', 'checking', 'chequing', 'emergency', 'hysa', 'current account'] },
    { key: 'investments', words: ['invest', 'invested', 'investments', '401', '403', 'ira', 'roth', 'brokerage', 'retirement', 'hsa', 'portfolio', 'index fund', 'pension pot', 'tsp'] },
    { key: 'debtBalance', words: ['debt', 'loan', 'loans', 'credit card', 'card balance', 'owe', 'owed', 'balance owed', 'student loan'] },
    { key: 'deductible',  words: ['deductible'] },
    { key: 'severance',   words: ['severance'] },
    { key: 'weekly',      words: ['unemployment', 'benefit', 'ui benefit'] }
  ];
  var MONTHLY_HINT = /\/\s*mo\b|\bmonth|\bmonthly\b|\bper mo\b|\bpm\b/i;
  function amountIn(line) {
    var m = /(-?)\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i.exec(line);
    if (!m) return null;
    var n = Number(m[2].replace(/,/g, ''));
    if (isNaN(n)) return null;
    if (m[3]) n = n * 1000;
    return Math.round(n * 100) * (m[1] ? -1 : 1);
  }
  function parseImport(text) {
    var rows = [], unmatched = [];
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var lower = line.toLowerCase();
      /* A header row of a CSV names columns, not amounts. */
      if (/^(label|name|item|category)\s*[,;\t]\s*(amount|value|balance)/.test(lower)) return;
      var cents = amountIn(line.replace(/\b(401|403)\s*\(?k\)?\b/i, ''));
      var hit = null;
      for (var i = 0; i < IMPORT_KEYS.length && !hit; i++) {
        for (var j = 0; j < IMPORT_KEYS[i].words.length; j++) {
          if (lower.indexOf(IMPORT_KEYS[i].words[j]) !== -1) { hit = IMPORT_KEYS[i].key; break; }
        }
      }
      if (!hit || cents === null) { unmatched.push(line); return; }
      if (rows.some(function (r) { return r.key === hit; })) { unmatched.push(line); return; }
      rows.push({ key: hit, cents: Math.abs(cents), basis: hit === 'pay' ? (MONTHLY_HINT.test(line) ? 'monthly' : 'annual') : null, line: line });
    });
    return { rows: rows, unmatched: unmatched };
  }

  /* ---- Standalone: a room opened by deep link with an empty spine ---------
     fillGuesses(h, T) → a COPY of the household with the intake's guesses
     standing in for whatever is missing — a pay source, a month's
     spending, cash, investments, the deductible — for the situation
     chosen, or an employed one when none is. `meta.standalone` lists what
     was filled so the room can say "shown with guesses". Nothing is
     stored: the caller renders from the copy and the spine is untouched.
     The room template (shared/room.js) is the only caller. D-097. */
  function fillGuesses(household, tables, situation) {
    var h = JSON.parse(JSON.stringify(household || Schema.createHousehold({})));
    /* A room that exists for one situation (retired, between jobs) asks
       for that situation to be guessed when none is chosen — its
       `guessAs`; a chosen situation always wins. D-101. */
    var sit = situationOf(h) || (byId(situation) ? situation : null) || 'employed';
    var g = guesses(sit, h, tables);
    var filled = [];
    var people = h.people || (h.people = []);
    var you = Schema.primaryPerson(h);
    if (!you) {
      you = Schema.createPerson({ id: 'guess_person', label: 'You', role: 'adult', employmentStatus: byId(sit).status });
      people.push(you); filled.push('employmentStatus');
    }
    if (!Money.isOk(Schema.grossAnnualIncomeCents(h)) && g.pay && sit !== 'betweenJobs') {
      var annual = g.pay.basis === 'monthly' ? g.pay.value * MONTHS : g.pay.value;
      you.incomeSources = (you.incomeSources || []).concat([Schema.createIncomeSource({ id: 'guess_income', personId: you.id, type: 'w2', grossAnnualIncomeCents: annual, rateCents: g.pay.value, frequency: g.pay.basis || 'annual' })]);
      filled.push('grossAnnualIncome');
    }
    if (!Money.isOk(Schema.monthlyExpensesCents(h)) && g.spending) {
      h.expenses = h.expenses || {}; h.expenses.monthlyEssential = h.expenses.monthlyEssential || {};
      h.expenses.monthlyEssential.estimatedValueCents = g.spending.value; filled.push('monthlyExpenses');
    }
    if (!Money.isOk(Schema.cashCents(h)) && g.cash) {
      h.assets = (h.assets || []).concat([Schema.createAsset({ id: 'guess_cash', category: 'cash', liquid: true, valueCents: g.cash.value })]); filled.push('cashSavings');
    }
    if (!Money.isOk(Schema.investmentsCents(h)) && g.investments) {
      h.assets = (h.assets || []).concat([Schema.createAsset({ id: 'guess_inv', category: 'investment', valueCents: g.investments.value })]); filled.push('investments');
    }
    if (!Money.isEntered((h.insurance || {}).highestDeductibleCents) && g.deductible) {
      h.insurance = h.insurance || {}; h.insurance.highestDeductibleCents = g.deductible.value; filled.push('highestDeductible');
    }
    if (!h.filingStatus && g.filing) { h.filingStatus = g.filing.value; filled.push('filingStatus'); }
    if (h.meta && h.meta.hasDebt === null) { h.meta.hasDebt = false; filled.push('hasDebt'); }
    h.meta = h.meta || {};
    h.meta.standalone = filled;
    return h;
  }

  return {
    MAX_FIELDS: MAX_FIELDS,
    IMPORT_KEYS: IMPORT_KEYS,
    fillGuesses: fillGuesses,
    parseImport: parseImport,
    SITUATIONS: SITUATIONS,
    CARDS: CARDS,
    ORDER: ORDER,
    BRANCHES: Object.keys(BRANCHES),
    exists: exists,
    lead: lead,
    branches: branches,
    byId: byId,
    byStatus: byStatus,
    situationOf: situationOf,
    WHY: WHY,
    why: why,
    hasPartner: hasPartner,
    fieldsFor: fieldsFor,
    allCards: allCards,
    milestoneMultiple: milestoneMultiple,
    guesses: guesses
  };
});

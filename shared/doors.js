/* ==========================================================================
   shared/doors.js — the six doors: what each holds, its headline, how far
   along it is, and which one to open next. DECISIONS.md D-206.
   --------------------------------------------------------------------------
   The Ledger's rows (data/ledger-rows.json) each carry a door (D, A, I, T,
   E or you) and a level 1 to 4. This module reads them back as doors:

     DOORS                        the six, in order, with the letter, the
                                  label, the say line (shared/daite.js) and
                                  which row is the headline
     LEVELS                       the four depths every door shares
     rows(h, tables, door)        the applicable rows behind a door, with
                                  status, in level order
     counts(h, tables, door, sug) { known, total, suggested, byLevel }
     headline(h, tables, door)    { display, rough, result } — "not entered
                                  yet" when blank, never $0
     recommend(h, tables, sug)    { door, reason } — the most expensive
                                  unknown, in one sentence
     firstInsight(h, tables)      the one card after the first round: rough
                                  runway in months, from cash and spending,
                                  plus the benefit between jobs

   Every figure is a Result from the owner's reader or an engine; a blank
   stays incomplete. Suggestions (shared/suggest.js) are read only where
   the caller hands them in, and anything built on one says rough.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js'), Schema: require('./schema.js'), Ownership: require('./ownership.js'), LedgerRows: require('./ledger-rows.js'), Daite: require('./daite.js'),
      Suggest: (function () { try { return require('./suggest.js'); } catch (e) { return null; } })() };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Ownership: S.Ownership, LedgerRows: S.LedgerRows, Daite: S.Daite, Suggest: S.Suggest };
  }
  var api = factory(deps.Money, deps.Schema, deps.Ownership, deps.LedgerRows, deps.Daite, deps.Suggest);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Doors = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Ownership, LedgerRows, Daite, Suggest) {
  'use strict';
  var MONTHS = 12;

  function family(id) { return (Daite && Daite.FAMILIES ? Daite.FAMILIES : []).filter(function (f) { return f.id === id; })[0] || {}; }
  var DOORS = [
    { id: 'D', letter: 'D', label: 'Debt',     say: family('debt').say || 'what you owe',      headlineRow: 'totalDebt',        headlineLabel: 'total owed' },
    { id: 'A', letter: 'A', label: 'Assets',   say: family('assets').say || 'what you own',    headlineRow: 'netWorth',         headlineLabel: 'net worth' },
    { id: 'I', letter: 'I', label: 'Income',   say: family('income').say || 'what comes in',   headlineRow: 'takeHomeMonthly',  headlineLabel: 'money in, a month' },
    { id: 'T', letter: 'T', label: 'Taxes',    say: family('taxes').say || 'what the state takes', headlineRow: 'marginalRate', headlineLabel: 'marginal rate' },
    { id: 'E', letter: 'E', label: 'Expenses', say: family('expenses').say || 'what goes out', headlineRow: 'monthlyExpenses',  headlineLabel: 'money out, a month' },
    { id: 'you', letter: 'You', label: 'You',  say: 'who this is for',                          headlineRow: 'employmentStatus', headlineLabel: 'situation' }
  ];
  var LEVELS = [
    { n: 1, label: 'How much',                              gloss: 'the total' },
    { n: 2, label: 'Where it sits',                         gloss: 'which account, lender or source, and how it is taxed' },
    { n: 3, label: 'What it is made of',                    gloss: 'the parts inside: holdings, rates, categories' },
    { n: 4, label: 'What it costs and where it came from',  gloss: 'fees, basis, contributions against growth' }
  ];
  function byId(id) { return DOORS.filter(function (d) { return d.id === id; })[0] || null; }

  /* ---- The rows behind a door ------------------------------------------- */
  function rows(household, tables, door) {
    var all = LedgerRows.rows(household, tables, { filter: 'all' });
    return all.filter(function (r) { return r.door === door; })
      .sort(function (a, b) { return (a.level - b.level) || (all.indexOf(a) - all.indexOf(b)); });
  }
  function suggestedKeys(sug) {
    var m = {};
    (sug || []).forEach(function (s) { m[s.rowId] = s; });
    return m;
  }
  /* known = entered or worked out; total = every applicable row; a row with
     a live suggestion counts apart so the ring can show what one tap adds. */
  function counts(household, tables, door, sug) {
    var list = rows(household, tables, door);
    var known = 0, total = 0, suggested = 0, byLevel = {};
    var sm = suggestedKeys(sug);
    list.forEach(function (r) {
      var isKnown = r.status === 'sure' || r.status === 'roughly' || r.status === 'stale' || (r.status === 'computed' && Money.isOk(r.result));
      total++;
      if (isKnown) known++;
      else if (sm[r.id] && !sm[r.id].na) suggested++;
      var L = byLevel[r.level] || (byLevel[r.level] = { known: 0, total: 0, suggested: 0 });
      L.total++; if (isKnown) L.known++; else if (sm[r.id] && !sm[r.id].na) L.suggested++;
    });
    return { known: known, total: total, suggested: suggested, byLevel: byLevel, rows: list };
  }

  /* ---- Headlines ---------------------------------------------------------
     One number a door; "not entered yet" until it exists. Take-home a month
     is worked out from the pay through the DAITE view (one place, D-171). */
  function takeHomeMonthly(household, tables) {
    var v = Daite && Daite.view ? Daite.view(household, tables) : null;
    if (!v) return Money.incomplete('No income view.', ['grossAnnualIncome']);
    var t = v.income.takeHomeAnnualCents;
    if (Money.isOk(t)) return Money.ok(Math.round(t.value / MONTHS), { basis: 'take-home' });
    var g = v.income.grossAnnualCents;
    if (Money.isOk(g)) return Money.ok(Math.round(g.value / MONTHS), { basis: 'gross' });
    return Money.incomplete('Not entered yet.', ['grossAnnualIncome']);
  }
  function headline(household, tables, door, opts) {
    var d = typeof door === 'string' ? byId(door) : door;
    var o = opts || {};
    var h = o.household || household;         /* a caller may hand in an overlay */
    if (!d) return { display: 'not entered yet', rough: false, result: Money.incomplete('No such door.', []) };
    var result, display;
    if (d.headlineRow === 'takeHomeMonthly') {
      result = takeHomeMonthly(h, tables);
      display = Money.isOk(result) ? Money.formatCents(result.value) + ' a month' : null;
    } else {
      var f = Ownership.FIELDS[d.headlineRow];
      result = f ? f.read(h) : Money.incomplete('No reader.', [d.headlineRow]);
      if (Money.isOk(result)) {
        if (d.id === 'E') display = Money.formatCents(result.value) + ' a month';
        else if (d.id === 'you') display = f.format ? f.format(result.value) : String(result.value);
        else display = f.format ? f.format(result.value) : String(result.value);
      } else display = null;
    }
    if (d.id === 'D' && Money.isOk(result) && Schema.saidNoDebt && Schema.saidNoDebt(h)) display = 'none';
    return { display: display || 'not entered yet', rough: !!o.rough, result: result, label: d.headlineLabel };
  }

  /* ---- Which door next -----------------------------------------------------
     The most expensive unknown, in one sentence. Debt first: a card whose
     minimum is a guess costs more than any other blank. Then the benefit
     between jobs, then spending (the runway rests on it), then what is
     invested, then the tax facts, then the person. */
  function recommend(household, tables, sug) {
    var h = household || {};
    var sm = suggestedKeys(sug);
    var debts = h.debts || [];
    var cardNoMin = debts.filter(function (d) { return d.type === 'credit_card' && Money.isEntered(d.balanceCents) && !Money.isEntered(d.minPaymentCents); });
    if (cardNoMin.length) return { door: 'D', reason: 'Debt: your most expensive unknown is ' + (cardNoMin[0].label ? cardNoMin[0].label + '’s' : 'a card’s') + ' minimum.' };
    if ((h.meta || {}).hasDebt === null || (h.meta || {}).hasDebt === undefined) return { door: 'D', reason: 'Debt: whether you owe anything changes every other number.' };
    if (Schema.isUnemployed(h) && !Money.isEntered(Schema.unemploymentOf(h).benefitWeeklyCents)) return { door: 'I', reason: 'Income: the benefit is a guess until you enter what the state pays.' };
    if (!Money.isOk(Schema.monthlyExpensesCents(h))) return { door: 'E', reason: 'Expenses: a month’s spending is the number the runway rests on.' };
    if (!Money.isOk(Schema.investmentsCents(h))) return { door: 'A', reason: 'Assets: what is invested sets the FI number and the reachable money.' };
    if (!h.filingStatus || !h.state) return { door: 'T', reason: 'Taxes: filing status and state set the marginal rate.' };
    var open = DOORS.map(function (d) { return { d: d, c: counts(h, tables, d.id, sug) }; }).filter(function (x) { return x.c.total > x.c.known; })
      .sort(function (a, b) { return (b.c.total - b.c.known) - (a.c.total - a.c.known); })[0];
    if (open) return { door: open.d.id, reason: open.d.label + ': ' + (open.c.total - open.c.known) + ' rows still to fill, ' + (open.c.suggested ? open.c.suggested + ' of them one tap.' : 'each a small one.') };
    return { door: 'you', reason: 'Every door is filled. Sharpen the rough ones when you have a minute.' };
  }

  /* ---- The first insight ---------------------------------------------------
     After five answers: about how many months the cash covers, with spending
     suggested where it is not entered, and the benefit added between jobs.
     Rough whenever a suggestion went into it. Never a number from nothing:
     without cash, or without any spending figure, it says what it needs. */
  function firstInsight(household, tables) {
    var h = household || {};
    var sug = Suggest && Suggest.suggestions ? Suggest.suggestions(h, tables) : [];
    var ov = Suggest && Suggest.overlay ? Suggest.overlay(h, tables) : { household: h, used: [] };
    var cash = Schema.cashCents(h);
    if (!Money.isOk(cash)) return { ok: false, reason: 'Cash on hand is the one number the runway needs.', door: recommend(h, tables, sug) };
    var spend = Schema.monthlyExpensesCents(ov.household);
    if (!Money.isOk(spend) || spend.value <= 0) return { ok: false, reason: 'A month’s spending is the other number the runway needs.', door: recommend(h, tables, sug) };
    var benefitMonthly = 0, benefitNote = null;
    if (Schema.isUnemployed(h)) {
      var u = Schema.unemploymentOf(ov.household);
      if (Money.isEntered(u.benefitWeeklyCents)) { benefitMonthly = Math.round(u.benefitWeeklyCents * 52 / MONTHS); benefitNote = Money.formatCents(u.benefitWeeklyCents) + ' a week of unemployment'; }
    }
    var net = spend.value - benefitMonthly;
    var months = net > 0 ? cash.value / net : null;
    var rough = ov.used.length > 0;
    var headline = months === null ? 'The benefit covers the month' : (months >= 24 ? 'Two years or more of runway' : 'About ' + (Math.round(months * 10) / 10) + ' months of runway');
    var line = Money.formatCents(cash.value) + ' in cash against ' + Money.formatCents(spend.value) + ' a month' + (benefitNote ? ', with ' + benefitNote + ' coming in' : '') + '.';
    return { ok: true, headline: headline, months: months === null ? null : Math.round(months * 10) / 10, rough: rough, line: line,
      usedSuggestions: ov.used, door: recommend(h, tables, sug), cashCents: cash.value, spendCents: spend.value, benefitMonthlyCents: benefitMonthly };
  }

  return { DOORS: DOORS, LEVELS: LEVELS, byId: byId, rows: rows, counts: counts, headline: headline, recommend: recommend, firstInsight: firstInsight };
});

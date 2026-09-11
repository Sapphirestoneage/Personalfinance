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
      var isKnown = r.status === 'sure' || r.status === 'roughly' || r.status === 'memory' || r.status === 'stale' || (r.status === 'computed' && Money.isOk(r.result));
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

  /* ---- How much of the picture is understood (Phase E, D-207) --------------
     Over every applicable, enterable row: a confirmed number counts in
     full, a rough one most of the way, a stale one less, a suggestion the
     person has not confirmed half, a blank nothing. The weights live in
     data/confidence_weights.json (rowStates); nothing here is a badge, the
     line only says how much of the picture the numbers cover. */
  function understanding(household, tables, sug, weights) {
    var w = (weights && weights.rowStates) || { sure: 1, roughly: 0.85, memory: 0.75, stale: 0.7, suggested: 0.5, notSure: 0.25, missing: 0 };
    var sm = suggestedKeys(sug);
    var all = LedgerRows.rows(household, tables, { filter: 'all' }).filter(function (r) { return r.kind !== 'computed' && !/^prefs\./.test(r.path); });
    var sum = 0, byDoor = {};
    all.forEach(function (r) {
      var k = r.status === 'sure' ? 'sure' : r.status === 'roughly' ? 'roughly' : r.status === 'memory' ? 'memory' : r.status === 'stale' ? 'stale'
        : (sm[r.id] && !sm[r.id].na ? 'suggested' : r.status === 'notSure' ? 'notSure' : 'missing');
      var v = w[k] || 0;
      sum += v;
      var d = byDoor[r.door] || (byDoor[r.door] = { sum: 0, n: 0 });
      d.sum += v; d.n++;
    });
    var percent = all.length ? Math.round(sum / all.length * 100) : 0;
    Object.keys(byDoor).forEach(function (k) { byDoor[k].percent = byDoor[k].n ? Math.round(byDoor[k].sum / byDoor[k].n * 100) : 0; });
    return { percent: percent, counted: all.length, byDoor: byDoor };
  }

  /* ---- The level a door is on ----------------------------------------------
     The lowest level with an enterable row still blank; 4 when none is.
     The next level's unlocks are read off its rows, so the line under the
     level is always what finishing it changes. */
  /* A one-line-per-item row is blank while any item lacks the value. */
  var ITEM_MISSING = {
    debtMinPayment: function (d) { return !Money.isEntered(d.minPaymentCents); },
    debtRate: function (d) { return !Money.isEntered(d.rate); },
    debtBalance: function (d) { return !Money.isEntered(d.balanceCents); },
    assetValue: function (a) { return !Money.isEntered(a.valueCents); },
    assetCharacter: function (a) { return !a.taxCharacter; },
    assetTier: function (a) { return !a.tier; },
    assetCostBasis: function (a) { return !Money.isEntered(a.costBasisCents); },
    incomeType: function (s) { return !s.type; },
    paySurvives: function (s) { return s.survivesJobLoss === null || s.survivesJobLoss === undefined; }
  };
  function itemsMissing(household, row) {
    if (!row.repeat || !ITEM_MISSING[row.id]) return [];
    return (LedgerRows.items(household, row) || []).filter(ITEM_MISSING[row.id]);
  }
  function isBlank(household, row) {
    if (row.kind === 'computed') return false;
    if (row.repeat && ITEM_MISSING[row.id]) return itemsMissing(household, row).length > 0;
    return row.status === 'missing' || row.status === 'notSure';
  }
  function levelOf(list, household) {
    for (var L = 1; L <= 4; L++) {
      if (list.some(function (r) { return r.level === L && isBlank(household, r); })) return L;
    }
    return 4;
  }
  function unlocksOf(list, L) {
    var seen = {}, out = [];
    list.filter(function (r) { return r.level === L && r.unlocks; }).forEach(function (r) { if (!seen[r.unlocks]) { seen[r.unlocks] = true; out.push(r.unlocks); } });
    return out;
  }

  /* ---- The insight a level unlocks (Phase C2) --------------------------------
     Only where an engine backs it; otherwise null and the door shows what the
     level's rows unlock in words. Every one is a Result-shaped object:
     { headline, line, rough, missing } — rough when an input is a guess or
     absent, and `missing` names it. Never a number from an assumed zero. */
  function engine(name) {
    if (typeof module === 'object' && module.exports) { try { return require('../engines/' + name + '.js'); } catch (e) { return null; } }
    var g = typeof self !== 'undefined' ? self : null;
    var S = g && g.SLAF ? g.SLAF : {};
    return S[{ statement: 'Statement', debt: 'Debt', hourly: 'Hourly' }[name]] || null;
  }
  function fmt(c) { return Money.formatCents(c); }
  function levelInsight(household, tables, door, level, sug) {
    var h = household || {}, T = tables || {};
    var sm = suggestedKeys(sug);
    if (door === 'D') {
      var debts = (h.debts || []).filter(function (d) { return Money.isEntered(d.balanceCents) && d.balanceCents > 0; });
      if (level === 1) {
        var tot = Schema.totalDebtCents(h);
        if (!Money.isOk(tot)) return null;
        var mins = Schema.monthlyDebtPaymentsCents(h);
        return { headline: fmt(tot.value) + ' owed', line: Money.isOk(mins) ? fmt(mins.value) + ' a month goes to minimums before anything else.' : 'The minimums are not all in yet, so the month’s debt line is open.', rough: !Money.isOk(mins), missing: Money.isOk(mins) ? [] : ['minimum payments'] };
      }
      if (level === 3 && debts.length) {
        var Debt = engine('debt');
        var noRate = debts.filter(function (d) { return !Money.isEntered(d.rate); });
        var interest = debts.reduce(function (s, d) { return s + (Money.isEntered(d.rate) ? Math.round(d.balanceCents * d.rate / MONTHS) : 0); }, 0);
        var order = null;
        if (Debt && T.debtRules) {
          var strat = (T.debtRules.strategies || []).filter(function (x) { return x.id === 'avalanche'; })[0];
          if (strat) order = Debt.orderDebts(debts, strat, T.debtRules, 1, Schema.localDay()).map(function (d) { return d.label || d.type; });
        }
        return { headline: (noRate.length ? 'At least ' : 'About ') + fmt(interest) + ' a month in interest', line: order ? 'Highest rate first: ' + order.join(', then ') + '.' : 'The payoff order follows the rates.', rough: noRate.length > 0, missing: noRate.map(function (d) { return 'the rate on ' + (d.label || 'a debt'); }) };
      }
      return null;
    }
    if (door === 'A') {
      var St = engine('statement');
      if (level === 1) {
        var nw = Ownership.FIELDS.netWorth.read(h);
        return Money.isOk(nw) ? { headline: fmt(nw.value) + ' net worth', line: 'What you own less what you owe.', rough: false, missing: [] } : null;
      }
      if (level === 2 && St && T.accessRules) {
        var lad = St.liquidityLadder(h, T.accessRules);
        if (!Money.isOk(lad)) return null;
        var unknown = lad.rows.filter(function (r) { return r.asset.taxCharacter === 'unknown' || !r.asset.taxCharacter; });
        return { headline: fmt(lad.cumulative.thisYear) + ' reachable in an emergency', line: fmt(lad.bands.today) + ' today, ' + fmt(lad.cumulative.thisMonth) + ' within the month, ' + fmt(lad.gatedCents) + ' locked until retirement age.', rough: unknown.length > 0, missing: unknown.map(function (r) { return 'how ' + (r.asset.label || 'an account') + ' is taxed'; }) };
      }
      if (level === 4) {
        var roth = (h.assets || []).filter(function (a) { return a.taxCharacter === 'roth' && Money.isEntered(a.valueCents); });
        if (!roth.length) return null;
        var known = roth.filter(function (a) { return Money.isEntered(a.costBasisCents); });
        var blank = roth.filter(function (a) { return !Money.isEntered(a.costBasisCents); });
        var free = known.reduce(function (s, a) { return s + Math.min(a.costBasisCents, a.valueCents); }, 0);
        if (!known.length) return { headline: 'Roth contributions: not known yet', line: 'Roth contributions come out tax and penalty free, so a Roth that is mostly contributions is mostly reachable. That needs the contributions figure.', rough: true, missing: blank.map(function (a) { return 'contributions to ' + (a.label || 'the Roth'); }) };
        return { headline: fmt(free) + ' of Roth money reachable now', line: 'Contributions come out tax and penalty free; only the growth waits.' + (blank.length ? ' Rough: one Roth has no contributions figure yet.' : ''), rough: blank.length > 0, missing: blank.map(function (a) { return 'contributions to ' + (a.label || 'the Roth'); }) };
      }
      return null;
    }
    if (door === 'I') {
      if (level === 1) {
        var th = takeHomeMonthly(h, T);
        return Money.isOk(th) ? { headline: fmt(th.value) + ' a month' + (th.basis === 'gross' ? ', before tax' : ' take-home'), line: th.basis === 'gross' ? 'Filing status and state turn this into take-home.' : 'After the tax estimate.', rough: th.basis === 'gross', missing: th.basis === 'gross' ? ['filing status', 'state'] : [] } : null;
      }
      if (level === 4) {
        var Hr = engine('hourly');
        if (!Hr) return null;
        var rh = Hr.realHourlyWage(h, T);
        return Money.isOk(rh) ? { headline: fmt(rh.value) + ' an hour, really', line: 'Every hour the job takes and everything it costs, against what it pays after tax.', rough: !!(rh.assumed && rh.assumed.length), missing: rh.assumed || [] } : null;
      }
      return null;
    }
    if (door === 'T' && level === 1) {
      var tax = Schema.estimatedAnnualTaxCents ? Schema.estimatedAnnualTaxCents(h, T) : null;
      var mr = Ownership.FIELDS.marginalRate.read(h);
      if (!tax || !Money.isOk(tax)) return null;
      return { headline: fmt(tax.value) + ' a year to tax', line: Money.isOk(mr) ? 'The next dollar is taxed at ' + Math.round(mr.value * 1000) / 10 + '%.' : 'The marginal rate is suggested from the brackets; confirm it below.', rough: !Money.isOk(mr), missing: Money.isOk(mr) ? [] : ['marginal rate'] };
    }
    if (door === 'E') {
      if (level === 1) {
        var sp = Schema.monthlyExpensesCents(h);
        if (Money.isOk(sp)) return { headline: fmt(sp.value) + ' a month out', line: sp.source === 'closed' ? 'From the months you closed.' : 'From the four buckets.', rough: false, missing: [] };
        var sg = sm.wantsMonthly;
        return sg ? { headline: 'About ' + fmt(sg.value) + ' a month, suggested', line: 'A starting guess from your pay; the buckets replace it.', rough: true, missing: ['a month’s spending'] } : null;
      }
      if (level === 4) {
        var entries = ((h.expenses || {}).entries || []).filter(function (e) { return e && e.active !== false && ['subscriptions', 'platform_fees', 'contractor_fees'].indexOf(e.categoryId) !== -1; });
        if (!entries.length) return null;
        var monthly = entries.reduce(function (s, e) { var c = Money.isEntered(e.everyCents) && e.every ? Schema.monthlyFromEvery(e.everyCents, e.every) : (Money.isEntered(e.amountCents) ? e.amountCents : 0); return s + (Money.isEntered(c) ? c : 0); }, 0);
        return { headline: fmt(monthly * MONTHS) + ' a year in subscriptions and fees', line: entries.length + (entries.length === 1 ? ' line' : ' lines') + ' that repeat: the leak line.', rough: false, missing: [] };
      }
      return null;
    }
    if (door === 'you' && level === 1) {
      var age = Schema.primaryAge(h), p = Schema.primaryPerson(h);
      if (!p) return null;
      var bits = [];
      if (Money.isEntered(age)) bits.push(age + ' years old');
      if (p.employmentStatus) bits.push({ employed: 'working', unemployed: 'between jobs', selfEmployed: 'self-employed', both: 'a job and your own work', student: 'a student', retired: 'retired' }[p.employmentStatus] || p.employmentStatus);
      if (h.state) bits.push('in ' + h.state);
      return bits.length ? { headline: bits.join(', '), line: 'What every other door reads first.', rough: false, missing: [] } : null;
    }
    return null;
  }

  /* ---- One door, opened --------------------------------------------------- */
  function doorView(household, tables, door, sug) {
    var list = rows(household, tables, door);
    var sm = suggestedKeys(sug);
    var level = levelOf(list, household);
    var suggestedRow = function (r) { return (sug || []).some(function (s) { return s.rowId === r.id && !s.na; }); };
    var confirm = (sug || []).filter(function (s) { return s.door === door && !s.na && s.level <= level; });
    var add = list.filter(function (r) { return r.level === level && isBlank(household, r) && !suggestedRow(r); }).slice(0, 3);
    var deeper = list.filter(function (r) { return r.level > level && isBlank(household, r); }).length;
    var na = (sug || []).filter(function (s) { return s.door === door && s.na; });
    /* The level's own insight first; then any deeper one that already
       computes from what is entered (a Roth's basis is worth seeing at
       level 3). Two at most. */
    var insights = [];
    for (var L = 1; L <= 4; L++) {
      var ins = levelInsight(household, tables, door, L, sug);
      if (ins) insights.push(Object.assign({ level: L }, ins));
    }
    var current = insights.filter(function (i) { return i.level === level; })[0] || null;
    var others = insights.filter(function (i) { return i.level !== level; }).sort(function (a, b) { return b.level - a.level; });
    return {
      door: byId(door), level: level, levelInfo: LEVELS[level - 1], next: level < 4 ? { level: level + 1, info: LEVELS[level], unlocks: unlocksOf(list, level + 1) } : null,
      insight: current, insights: (current ? [current] : []).concat(others).slice(0, 2), confirm: confirm, add: add, more: deeper, na: na,
      counts: counts(household, tables, door, sug), rows: list
    };
  }

  return { DOORS: DOORS, LEVELS: LEVELS, byId: byId, rows: rows, counts: counts, headline: headline, recommend: recommend, firstInsight: firstInsight,
    understanding: understanding, levelOf: levelOf, levelInsight: levelInsight, doorView: doorView, itemsMissing: itemsMissing, isBlank: isBlank };
});

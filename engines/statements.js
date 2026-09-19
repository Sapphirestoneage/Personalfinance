/* ==========================================================================
   engines/statements.js — the three statements, and the year in review.
   --------------------------------------------------------------------------
   A household running for years has no equivalent of the documents a company
   produces every quarter. This builds them:

     incomeStatement(h, T, o)   what came in, what it cost, what was left
     cashFlowStatement(h, T, o) operating / investing / financing, the way a
                                cash flow statement is actually laid out
     balanceSheet(h, T, o)      what is owned, what is owed, what is left
     review(h, T, o)            the same period said in sentences, with the
                                handful of figures worth remembering

   THE BASIS IS PART OF THE ANSWER. Every statement comes back with a
   `basis`, and it is never decoration:

     'recorded' — built from dated entries over a period that actually
                  happened. This is a record.
     'standing' — built from the figures you keep current, annualised. This
                  is an ESTIMATE OF A TYPICAL YEAR, not a record of one, and
                  every caller must say so. A company would not file it.

   A statement whose basis is 'standing' is still useful — most people have
   standing figures long before they have twelve closed months — but calling
   it a record would be a lie, and the whole app is built on not telling
   that kind of lie.

   EMPTY IS NOT ZERO, AND HERE IT MATTERS MOST. A statement with no income
   entered is INCOMPLETE. It is not a statement showing zero revenue. Zero
   revenue is a fact about a person; a blank field is a fact about the app.
   Every line carries `entered: false` rather than a zero when nothing is
   there, and the totals refuse rather than sum around it.

   ONE FORMULA, ONE FUNCTION. Nothing here recomputes what another engine
   already owns: spending comes from engines/cashflow.js, portfolios and the
   ladder from engines/statement.js, tax from engines/tax.js, totals from
   shared/schema.js. This file arranges; it does not calculate twice.

   PURE. No storage, no DOM. The clock arrives through opts.now.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    var opt = function (p) { try { return require(p); } catch (e) { return null; } };
    deps = {
      Money: require('../shared/money.js'),
      Schema: require('../shared/schema.js'),
      CashFlow: require('./cashflow.js'),
      /* The FIRE statement's engines (D-254); optional, each a dash when absent. */
      Fire: opt('./fire.js'), Tier0: opt('./tier0.js'), Gap: opt('./gap.js')
    };
  } else {
    deps = {
      Money: root.SLAF && root.SLAF.Money,
      Schema: root.SLAF && root.SLAF.Schema,
      CashFlow: root.SLAF && root.SLAF.CashFlow,
      Fire: root.SLAF && root.SLAF.Fire, Tier0: root.SLAF && root.SLAF.Tier0, Gap: root.SLAF && root.SLAF.Gap
    };
  }
  var api = factory(deps.Money, deps.Schema, deps.CashFlow, deps.Fire, deps.Tier0, deps.Gap);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.Statements = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, CashFlow, Fire, Tier0, Gap) {
  'use strict';

  var MONTHS = 12;

  function line(label, cents, opts) {
    var o = opts || {};
    return {
      label: label,
      /* The figure, in the line's unit: cents unless `unit` says a rate, a
         number of years or a multiple (D-254). Blank stays null. */
      cents: Money.isEntered(cents) ? cents : null,
      entered: Money.isEntered(cents),
      unit: o.unit || 'cents',
      note: o.note || null,
      href: o.href || null,
      /* 'in' adds, 'out' subtracts, 'total' is a rule under the ones above. */
      kind: o.kind || 'in',
      indent: !!o.indent,
      /* What the line opens to (D-254): one sentence on how it is worked
         out, the parts it is made of, and where its number lives — an
         ownership field id, or a room and anchor. The page builds the link. */
      how: o.how || null,
      parts: o.parts || null,
      field: o.field || null,
      room: o.room || null,
      anchor: o.anchor || null
    };
  }
  /* A part of a line: label and cents, or a blank that says so. */
  function part(label, cents) { return { label: label, cents: Money.isEntered(cents) ? cents : null, entered: Money.isEntered(cents) }; }

  /* Sum only the lines that were actually entered, and say how many were
     not. A total that silently treats a blank as zero is the single most
     common way a statement lies. */
  function sum(lines) {
    var total = 0, missing = [];
    lines.forEach(function (l) {
      if (!l.entered) { missing.push(l.label); return; }
      total += (l.kind === 'out' ? -l.cents : l.cents);
    });
    return { cents: total, missing: missing, complete: missing.length === 0 };
  }

  /* ---- Which period, and on what basis ------------------------------------ */

  /**
   * The period a statement covers.
   *   { basis, months, label, closed }
   * 'recorded' needs closed months in the ledger. Everything else is
   * 'standing' — and says so.
   */
  function period(household, opts) {
    var o = opts || {};
    var closed = ((household && household.ledger && household.ledger.months) || [])
      .filter(function (m) { return m && m.actual; });
    if (closed.length >= 1 && !o.forceStanding) {
      return {
        basis: 'recorded',
        months: closed.length,
        closed: closed.length,
        label: closed.length === 1 ? 'the one month you have closed'
          : 'the ' + closed.length + ' months you have closed'
      };
    }
    return {
      basis: 'standing',
      months: MONTHS,
      closed: closed.length,
      label: 'a typical year at the figures you keep current'
    };
  }

  /* ---- Income statement ---------------------------------------------------
     Revenue, what it costs to earn, what the government takes, what living
     costs, and what is left. The order a person can follow top to bottom. */

  function incomeStatement(household, tables, opts) {
    var h = household || {};
    var p = period(h, opts);
    var gross = Schema.grossAnnualIncomeCents(h);
    var monthlySpend = Schema.monthlyExpensesCents(h);

    if (!Money.isOk(gross)) {
      return Money.incomplete('Nothing to report yet — no income has been entered.',
        ['grossAnnualIncome'], { basis: p.basis, period: p });
    }

    var months = p.months;
    var revenue = Math.round(gross.value / MONTHS * months);
    var match = Schema.employerMatchCents(h);

    var lines = [];
    var person = Schema.primaryPerson ? Schema.primaryPerson(h) : null;
    var sources = ((person && person.incomeSources) || []).filter(function (x) { return Money.isEntered(x.grossAnnualIncomeCents); });
    lines.push(line('What you earned', revenue, { kind: 'in', field: 'grossAnnualIncome',
      how: 'Gross pay before anything is taken out, from Start Here or the income log' + (months === MONTHS ? '.' : ', scaled to ' + months + ' months.'),
      parts: sources.length > 1 ? sources.map(function (x) { return part(x.label || 'Pay', Math.round(x.grossAnnualIncomeCents / MONTHS * months)); }) : null }));
    if (Money.isOk(match) && match.value > 0) {
      lines.push(line('Employer match', Math.round(match.value / MONTHS * months),
        { kind: 'in', indent: true, note: 'Money you were paid that never touched your account.', field: 'employerMatch',
          how: 'The employer\'s formula applied to what you put in, from Accounts.' }));
    }
    var revenueTotal = sum(lines);

    /* What the government took (D-254): the one estimate every take-home
       reading uses, or the logged difference between gross and net. */
    var takeHome = Schema.takeHomeAnnualCents(h, tables);
    var taxes = [line('What the government took', Money.isOk(takeHome) ? Math.round(takeHome.estimatedTaxCents / MONTHS * months) : null, {
      kind: 'out', field: 'marginalRate',
      how: Money.isOk(takeHome) && takeHome.source === 'logged'
        ? 'The difference between the gross and the net on the paychecks you logged.'
        : 'Estimated at the effective rate for your pay, filing status and state (the tax tables in data/), the same figure every take-home reading uses.',
      note: Money.isOk(takeHome) && Money.isEntered(takeHome.effectiveRate) ? Math.round(takeHome.effectiveRate * 1000) / 10 + '% of gross' + (takeHome.source === 'logged' ? ', as logged' : ', estimated') : null
    })];
    var taxTotal = sum(taxes);
    var takeHomeTotal = { cents: revenueTotal.cents + taxTotal.cents, missing: revenueTotal.missing.concat(taxTotal.missing), complete: revenueTotal.complete && taxTotal.complete };

    var out = [];
    var spend = Money.isOk(monthlySpend) ? Math.round(monthlySpend.value * months) : null;
    var f = Schema.fat ? Schema.fat(h) : null;
    var buckets = f ? [f.food, f.accommodation, f.transportation, f.wants].concat(f.therapy ? [f.therapy] : []) : [];
    out.push(line('What living cost', spend, {
      kind: 'out', field: 'monthlyExpenses',
      how: Money.isOk(monthlySpend) && monthlySpend.source === 'closed' ? 'The average of the months you have closed in Budget.' : 'The month you keep in Expenses: food, rent or mortgage, getting around, everything else' + (months === MONTHS ? ', times twelve.' : ', times ' + months + '.'),
      parts: buckets.filter(function (b) { return b && Money.isOk(b); }).length ? buckets.filter(function (b) { return b; }).map(function (b) { return part(b.label || 'Line', Money.isOk(b) ? Math.round(b.value * months) : null); }) : null,
      note: Money.isOk(monthlySpend) ? null : 'Not entered, so nothing below it can be totalled.'
    }));
    var debtPay = Schema.monthlyDebtPaymentsCents(h);
    if (Money.isOk(debtPay) && debtPay.value > 0) {
      out.push(line('Debt payments', Math.round(debtPay.value * months), { kind: 'out', field: 'monthlyDebtPayments',
        how: 'Every minimum in Debt Payoff, times the months. Interest is a cost; the principal is a transfer, and the cash flow statement says so.' }));
    }
    var spendTotal = sum(out);

    var left = null, leftComplete = takeHomeTotal.complete && spendTotal.complete;
    if (leftComplete) left = takeHomeTotal.cents + spendTotal.cents;

    return Money.ok({
      basis: p.basis,
      period: p,
      revenue: lines,
      revenueTotal: revenueTotal,
      taxes: taxes,
      taxesTotal: taxTotal,
      takeHomeTotal: takeHomeTotal,
      costs: out,
      costsTotal: spendTotal,
      leftOver: left,
      leftOverComplete: leftComplete,
      /* The margin a company would call operating margin. Same idea: of every
         pound that came in, how much survived the year. */
      marginRate: (leftComplete && revenueTotal.cents > 0)
        ? left / revenueTotal.cents : null
    }, { basis: p.basis });
  }

  /* ---- Cash flow statement ------------------------------------------------
     Operating, investing, financing — the three sections a real cash flow
     statement has, mapped onto a household without stretching the metaphor.
     Operating is living. Investing is what you put away. Financing is debt. */

  function cashFlowStatement(household, tables, opts) {
    var h = household || {};
    var p = period(h, opts);
    var inc = incomeStatement(h, tables, opts);
    if (!Money.isOk(inc)) return inc;
    var s = inc.value;
    var months = p.months;

    /* Cash, not earnings (D-254): what landed in the account is take-home,
       so the match (never paid to you) and the tax (never yours) stay out. */
    var operating = [];
    operating.push(line('Take-home pay that landed', s.takeHomeTotal.complete ? s.takeHomeTotal.cents : null, { kind: 'in', field: 'grossAnnualIncome',
      how: 'Gross less what the government took. The employer match is not here: it goes straight into the plan and never touches your account.' }));
    s.costs.forEach(function (l) { operating.push(l); });
    var opTotal = sum(operating);

    var investing = [];
    var contrib = contributionsCents(h, months);
    investing.push(line('Put into investments', contrib, {
      kind: 'out', field: 'contributionPercent',
      how: 'Your contribution rate in Accounts applied to gross pay, the same line the savings rate reads.',
      note: Money.isEntered(contrib) ? 'Leaves your cash, but you still own it.'
        : 'No contribution rate entered.'
    }));
    var invTotal = sum(investing);

    var financing = [];
    var dp = Schema.monthlyDebtPaymentsCents(h);
    financing.push(line('Debt paid down', Money.isOk(dp) ? Math.round(dp.value * months) : null, {
      kind: 'out', field: 'monthlyDebtPayments',
      how: 'The minimums in Debt Payoff, times the months.',
      note: 'Shown again here because a payment is both a cost and a transfer — '
        + 'it leaves your account and it reduces what you owe.'
    }));
    var finTotal = sum(financing);

    return Money.ok({
      basis: p.basis,
      period: p,
      operating: operating, operatingTotal: opTotal,
      investing: investing, investingTotal: invTotal,
      financing: financing, financingTotal: finTotal,
      /* Change in cash is operating less what left cash for investments. The
         debt line is NOT subtracted again — it is already inside living
         costs. Double-counting it is the classic error here, so it is stated
         rather than summed. */
      netChange: (opTotal.complete && invTotal.complete)
        ? opTotal.cents + invTotal.cents : null,
      netChangeComplete: opTotal.complete && invTotal.complete
    }, { basis: p.basis });
  }

  /* contributionPercent is stored as a PERCENT (4 means 4%), not a fraction.
     Writing `gross * percent` rather than `gross * percent / 100` put the
     demo persona's contributions at $432,000 a year on a $72,000 salary and
     turned the cash flow statement into nonsense. engines/cashflow.js:416
     is the one place that conversion belongs; this matches it exactly. */
  function contributionsCents(household, months) {
    var r = (household && household.retirement) || {};
    var gross = Schema.grossAnnualIncomeCents(household);
    if (!Money.isOk(gross) || !Money.isEntered(r.contributionPercent)) return null;
    var annual = Math.round(gross.value * r.contributionPercent / 100);
    return Math.round(annual / MONTHS * months);
  }

  /* ---- Balance sheet ------------------------------------------------------ */

  function balanceSheet(household, tables, opts) {
    var h = household || {};
    var cash = Schema.cashCents(h);
    var inv = Schema.investmentsCents(h);
    var other = Schema.otherAssetsCents(h);
    var debt = Schema.totalDebtCents(h);

    var assets = (h.assets || []);
    var listOf = function (cats) { return assets.filter(function (a) { return cats.indexOf(a.category) !== -1 && Money.isEntered(a.valueCents); }); };
    var named = function (a) { return part((a.label || a.category) + (Schema.whereItSits && Schema.whereItSits(a) ? ' \u00b7 ' + Schema.whereItSits(a) : ''), a.valueCents); };
    var cashList = listOf(['cash']), invList = listOf(['investment', 'retirement']), otherList = listOf(['real_estate', 'vehicle', 'other']);
    var current = [line('Cash and savings', Money.isOk(cash) ? cash.value : null,
      { note: 'What you could spend this week.', field: 'cashSavings', how: 'Every cash account on The Statement, added up.', parts: cashList.length > 1 ? cashList.map(named) : null })];
    var nonCurrent = [
      line('Investments', Money.isOk(inv) ? inv.value : null,
        { note: 'Owned, but not spendable today without cost.', field: 'investments', how: 'Every investment and retirement account on The Statement, at the value you last confirmed.', parts: invList.length > 1 ? invList.map(named) : null })
    ];
    /* "Nothing else owned" is a real answer, not a missing one. Listing it as
       a blank line made the whole assets side incomplete and the net worth
       refuse — while the dashboard, reading Schema.totalAssetsCents, showed
       $35,900 quite happily. The total therefore comes from that same
       function (one formula, one function) and the itemised lines are a
       BREAKDOWN of it, shown only where entered. */
    if (Money.isOk(other)) nonCurrent.push(line('Everything else owned', other.value, { field: 'otherAssets', how: 'A house, a car, anything else listed on The Statement.', parts: otherList.length > 1 ? otherList.map(named) : null }));
    var totalAssets = Schema.totalAssetsCents(h);
    var assetsTotal = Money.isOk(totalAssets)
      ? { cents: totalAssets.value, missing: [], complete: true }
      : { cents: 0, missing: ['what you own'], complete: false };

    var debts = (h.debts || []).filter(function (d) { return Money.isEntered(d.balanceCents) && !d.archived; });
    var liabilities = [line('Everything owed', Money.isOk(debt) ? debt.value : null, { kind: 'in', field: 'totalDebt', how: 'Every balance in Debt Payoff, added up.', parts: debts.length > 1 ? debts.map(function (d) { return part(d.label || d.type || 'Debt', d.balanceCents); }) : null })];
    var liabTotal = sum(liabilities);

    if (!assetsTotal.complete && !liabTotal.complete) {
      return Money.incomplete('Nothing is entered on either side yet.',
        ['cashSavings', 'totalDebt']);
    }
    var net = (assetsTotal.complete && liabTotal.complete)
      ? assetsTotal.cents - liabTotal.cents : null;

    return Money.ok({
      current: current, nonCurrent: nonCurrent, assetsTotal: assetsTotal,
      liabilities: liabilities, liabilitiesTotal: liabTotal,
      netWorth: net,
      netWorthComplete: assetsTotal.complete && liabTotal.complete,
      /* What share of what you own is actually yours rather than borrowed
         against — a company would call it equity ratio. */
      equityRate: (net !== null && assetsTotal.cents > 0) ? net / assetsTotal.cents : null
    });
  }

  /* ---- The FIRE statement (D-254) -------------------------------------------
     The readings FIRE people expect, on one page, each read off the engine
     that owns it and linked to the room where its input lives. Nothing is
     computed here that another engine already computes: the FI number is
     engines/fire's, the savings rate engines/tier0's, the gap engines/gap's.
     A missing input is a dash, never a zero. */
  function fireStatement(household, tables, opts) {
    var h = household || {};
    var spend = Schema.monthlyExpensesCents(h);
    var inv = Schema.investmentsCents(h);
    if (!Money.isOk(spend) && !Money.isOk(inv)) {
      return Money.incomplete('Nothing to report yet — add a month of spending and what is invested.', ['monthlyExpenses', 'investments']);
    }
    var A = Schema.resolveAssumptions ? Schema.resolveAssumptions(h) : {};
    var annual = Money.isOk(spend) ? spend.value * MONTHS : null;
    var ok = function (r) { return r && Money.isOk(r); };
    var v = function (r) { return ok(r) ? r.value : null; };
    var variant = function (id) { return Fire ? Fire.calculateFIRE(h, tables, { variantId: id }) : null; };
    var fi = variant('standard'), lean = variant('lean'), fat = variant('fat'), coast = variant('coast');
    var prog = Fire ? Fire.progressToward(h, tables, { variantId: 'standard' }) : null;
    var rates = Tier0 ? Tier0.savingsRate(h, tables) : null;
    var sr = rates && ok(rates.includingMatch) ? rates.includingMatch : rates ? rates.excludingMatch : null;
    var gap = Gap ? Gap.levels(h, tables) : null;
    var assets = Schema.totalAssetsCents(h), debt = Schema.totalDebtCents(h);
    var net = ok(assets) && ok(debt) ? assets.value - debt.value : null;
    var years = ok(prog) && prog.yearsAway && Money.isOk(prog.yearsAway) ? prog.yearsAway.value : null;
    var coastReached = ok(coast) && ok(inv) ? inv.value >= coast.value : null;

    var target = [
      line('A year of spending', annual, { field: 'monthlyExpenses', how: 'The month you keep in Expenses, times twelve; closed months in Budget replace it.' }),
      line('Withdrawal rate assumed', Money.isEntered(A.swrRate) ? A.swrRate : null, { unit: 'rate', room: 'fire', anchor: 'assumptions', how: 'The share of the pot drawn each year once you stop. Four percent is the convention the FI number rests on.' }),
      line('Your FI number', v(fi), { room: 'fire', anchor: 'map', how: 'A year of spending divided by the withdrawal rate: at four percent, twenty-five years of spending.', note: ok(fi) ? null : (fi ? fi.reason : null) }),
      line('Lean FI', v(lean), { indent: true, room: 'fire', anchor: 'map', how: 'The same sum at the lean variant\'s spending.' }),
      line('Fat FI', v(fat), { indent: true, room: 'fire', anchor: 'map', how: 'The same sum at the fat variant\'s spending.' })
    ];
    var standing = [
      line('Invested today', v(inv), { field: 'investments', how: 'Every investment and retirement account on The Statement.' }),
      line('FI ratio', ok(prog) ? prog.value : null, { unit: 'rate', room: 'fire', anchor: 'map', how: 'Invested today divided by your FI number: how much of the way there you are.' }),
      line('Years of spending saved', ok(inv) && annual ? inv.value / annual : null, { unit: 'years', room: 'fire', anchor: 'map', how: 'Invested today divided by a year of spending. Twenty-five is the FI number at four percent.' }),
      line('Coast FI number', v(coast), { room: 'coast-date', how: 'What you would need invested today for growth alone to reach the FI number by the target age.', note: coastReached === null ? null : coastReached ? 'Reached: what is invested can coast from here.' : 'Not yet reached.' }),
      line('Net worth', net, { field: 'netWorth', how: 'Everything owned less everything owed, from The Statement and Debt Payoff.' })
    ];
    var pace = [
      line('Savings rate', ok(sr) ? sr.value : null, { unit: 'rate', room: 'dashboard', anchor: 'up-next', how: 'What is saved in a year divided by gross pay, the match included where it is known (engines/tier0).' }),
      line('Saved in a year', ok(sr) ? sr.annualSavingsCents : null, { room: 'dashboard', anchor: 'up-next', how: 'Take-home less spending less the minimums, plus what goes into the plan.' }),
      line('The monthly gap', gap && Money.isEntered(gap.gapCents) ? gap.gapCents : null, { room: 'dashboard', anchor: 'up-next', how: gap && gap.current ? 'Level ' + gap.current.n + ' of the gap: ' + (gap.current.basis || 'take-home less spending less the minimums') + '.' : 'Take-home less spending less the minimums, refined level by level on the front page.' }),
      line('Years to FI', years, { unit: 'years', room: 'fire', anchor: 'map', how: 'How long the pot takes to reach the FI number at the savings rate and the assumed return (engines/projection).', note: ok(prog) && prog.yearsAway && prog.yearsAway.alreadyThere ? 'Already there.' : null })
    ];
    var assumptions = [
      line('Real return assumed', Money.isEntered(A.expectedReturnRate) ? A.expectedReturnRate : null, { unit: 'rate', room: 'settings', anchor: 'assumptions', how: 'The median of the return bands table after inflation, unless you set one in Settings.' }),
      line('Inflation assumed', Money.isEntered(A.inflation) ? A.inflation : null, { unit: 'rate', room: 'settings', anchor: 'assumptions', how: 'Set in Settings; every figure in today\'s money reads it.' })
    ];
    return Money.ok({
      target: target, standing: standing, pace: pace, assumptions: assumptions,
      fiRatio: ok(prog) ? prog.value : null, fiNumberCents: v(fi), yearsToFI: years, coastReached: coastReached
    });
  }

  /* ---- The year in review -------------------------------------------------
     The same period, said in sentences. Every card is derived from a figure
     above — nothing here is a new calculation, and nothing is invented when
     a figure is missing: the card is simply not produced. */

  function review(household, tables, opts) {
    var o = opts || {};
    var p = period(household, opts);
    var inc = incomeStatement(household, tables, opts);
    var bal = balanceSheet(household, tables, opts);
    var cards = [];

    if (Money.isOk(inc)) {
      var s = inc.value;
      if (s.revenueTotal.complete) {
        cards.push({
          id: 'earned', eyebrow: 'What came in',
          figure: s.revenueTotal.cents, format: 'money',
          say: p.basis === 'recorded'
            ? 'Across ' + p.label + '.'
            : 'Over a year, at what you earn now.'
        });
      }
      if (s.leftOverComplete) {
        cards.push({
          id: 'kept', eyebrow: s.leftOver >= 0 ? 'What you kept' : 'What you went short',
          figure: Math.abs(s.leftOver), format: 'money',
          say: s.leftOver >= 0
            ? 'After tax and everything living cost. That is the part that becomes next year.'
            : 'More went out than came in. That gap is the whole story of the period.'
        });
      }
      if (s.marginRate !== null) {
        cards.push({
          id: 'margin', eyebrow: 'Of every dollar you earned',
          figure: s.marginRate, format: 'rate',
          say: 'survived the year. A company would call this its margin.'
        });
      }
    }
    if (Money.isOk(bal) && bal.value.netWorthComplete) {
      cards.push({
        id: 'worth', eyebrow: 'What you are worth',
        figure: bal.value.netWorth, format: 'money',
        say: 'Everything owned, less everything owed, on the day you last confirmed it.'
      });
      if (bal.value.equityRate !== null) {
        cards.push({
          id: 'equity', eyebrow: 'Of what you own',
          figure: bal.value.equityRate, format: 'rate',
          say: 'is actually yours. The rest is borrowed against.'
        });
      }
    }

    /* Movement needs two readings. With one, there is nothing to compare —
       and inventing a starting point would make up a whole year of history. */
    var snaps = (o.snapshots || []).slice().sort(function (a, b) {
      return String(a.takenAt || '').localeCompare(String(b.takenAt || ''));
    });
    if (snaps.length >= 2 && Money.isOk(bal) && bal.value.netWorthComplete) {
      var first = snaps[0], last = snaps[snaps.length - 1];
      var a = first && first.netWorthCents, b = last && last.netWorthCents;
      if (Money.isEntered(a) && Money.isEntered(b)) {
        cards.push({
          id: 'moved', eyebrow: b - a >= 0 ? 'Up over the period' : 'Down over the period',
          figure: Math.abs(b - a), format: 'money',
          say: 'Between your first snapshot and your most recent one.'
        });
      }
    }

    return Money.ok({
      basis: p.basis, period: p, cards: cards,
      /* Said plainly at the top of the room, because a review of a period
         you have not recorded is a different document. */
      caveat: p.basis === 'recorded' ? null
        : 'These are not a record of a year that happened. They are what a year '
          + 'looks like at the figures you keep current — close some months in '
          + 'Budget and this becomes a real statement.'
    }, { basis: p.basis });
  }

  return {
    MONTHS: MONTHS,
    period: period,
    incomeStatement: incomeStatement,
    cashFlowStatement: cashFlowStatement,
    balanceSheet: balanceSheet,
    fireStatement: fireStatement,
    review: review
  };
});

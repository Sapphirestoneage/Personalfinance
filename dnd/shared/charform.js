/* ==========================================================================
   shared/charform.js — the character-creation fields, declared once. DD-025.
   --------------------------------------------------------------------------
   Two rooms now put a character together: the sheet, and the campaign's own
   creation flow. That is a deliberate exception to one-editor-per-field (see
   DECISIONS.md DD-025) and this file is the thing that makes it safe.

   The exception is only survivable because BOTH rooms render from the field
   list below and write through Store.setMoney / Store.patchProfile — never
   with their own idea of what a field is called, what unit it is in, or what
   an empty box means. If the two ever disagree about a number, they are not
   reading this file, and that is the bug.

   NOTHING HERE TOUCHES THE DOM. It is field declarations and arithmetic, so
   it can be tested without a browser and so a room stays free to build its
   controls once and only write their .value (D-034).
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('./money.js') };
  } else {
    deps = { Money: root.SLAF && root.SLAF.Money };
  }
  var api = factory(deps.Money);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.DND = root.DND || {}; root.DND.CharForm = api; }
})(typeof self !== 'undefined' ? self : null, function (Money) {
  'use strict';

  /* ---- the five numbers -------------------------------------------------
     `field` is the name Store.setMoney knows. `placeholder` is FORMAT ONLY —
     never a default value, because empty is not zero (SPEC §4, §5).        */
  var MONEY = [
    { id: 'income', field: 'grossAnnualIncomeCents', writer: 'money', label: 'What do you earn a year, before tax?',
      hint: 'Everything you are paid, gross. If it varies, your best honest average.',
      placeholder: '50,000', unit: 'year' },
    { id: 'expenses', writer: 'money', field: 'monthlyExpensesCents', label: 'What do you spend in a normal month?',
      hint: 'Rent or mortgage, food, transport, bills — the ordinary run of a month.',
      placeholder: '2,500', unit: 'month' },
    { id: 'cash', writer: 'money', field: 'cashCents', label: 'How much cash could you reach this week?',
      hint: 'Current account, savings, anything you could actually spend by Friday.',
      placeholder: '5,000', unit: 'total' },
    { id: 'investments', writer: 'money', field: 'investmentsCents', label: 'How much is invested or in a pension?',
      hint: 'Anything you own that is not cash and not the roof over your head.',
      placeholder: '20,000', unit: 'total' },
    /* Debt has its OWN writer on the Store — Store.setDebt, not setMoney,
       because it is one summary record and it carries a rate. The rate is not
       cosmetic: whether any balance is above the high-interest line is what
       Debt Burden keys off, and Debt Burden comes straight off your HP. So
       the follow-up is asked here rather than assumed. */
    { id: 'debt', field: 'debtCents', writer: 'debt',
      label: 'What do you owe, not counting a mortgage?',
      hint: 'Cards, loans, finance, overdraft. Enter 0 if none — 0 and blank are not the same thing.',
      placeholder: '0', unit: 'total',
      follow: { id: 'debtrate', label: 'Is any of it above about 7.5% interest?',
                hint: 'Credit cards almost always are. This is what decides whether the debt is a wound or a weight.',
                choices: [['yes', 'Yes — a card, or a loan at a high rate'], ['no', 'No, all of it is cheap']] } }
  ];

  /* ---- context that is not money but gates it ---------------------------
     Filing status is here because without it there is no tax estimate, and
     without a tax estimate there is no savings rate — which means no
     Constitution and no place on the ladder. It looks like a detail and it
     blocks a third of the character, so it is asked first, not buried.     */
  var CONTEXT = [
    { id: 'filing', writer: 'filing', label: 'How do you file your taxes?',
      hint: 'Needed to estimate what you keep. Without it there is no savings rate, and Constitution cannot be scored.',
      choices: [['single', 'Single'], ['married_joint', 'Married, filing jointly'],
                ['married_separate', 'Married, filing separately'], ['head_of_household', 'Head of household']] }
  ];

  /* ---- the extras that finish STR, DEX and CON --------------------------
     Deliberately NOT in the required path. A character is playable without
     them; each one just moves an ability from partial to measured, and the
     room says which. `writes` is the dndProfile key, or 'money' for a figure
     Store.setMoney owns.                                                   */
  var EXTRAS = [
    { id: 'income3', writes: 'incomeThreeYearsAgoCents', kind: 'money',
      label: 'What did you earn three years ago?', completes: 'Income Trajectory',
      hint: 'The comparison is the whole point — it is growth that scores, not the amount.',
      placeholder: '44,000' },
    { id: 'side', writes: 'sideIncomeAnnualCents', kind: 'money',
      label: 'Anything you earn outside the day job, a year?', completes: 'Hustle Capacity',
      hint: 'Enter 0 if none. 0 scores; blank cannot.', placeholder: '0' },
    { id: 'fixed', writes: 'fixedCostShare', kind: 'fraction',
      label: 'Roughly what share of your spending is fixed?', completes: 'Obligation Flexibility',
      hint: 'Rent, loans, insurance — the parts you cannot cut this month.',
      choices: [['0.3', 'About a third'], ['0.5', 'About half'], ['0.7', 'About two thirds'], ['0.85', 'Nearly all of it']] },
    { id: 'years', writes: 'yearsSustained', kind: 'number',
      label: 'How long have you saved at roughly this rate?', completes: 'Consistency',
      choices: [['0', 'Just started'], ['1', 'About a year'], ['3', 'About three years'], ['5', 'Five years or more']] },
    { id: 'disruption', writes: 'disruptionSurvived', kind: 'boolean',
      label: 'Have you held that rate through a bad year?', completes: 'Consistency',
      hint: 'A job loss, an illness, a move. Untested is capped — not punished, just untested.',
      choices: [['yes', 'Yes, it survived one'], ['no', 'Not yet tested']] }
  ];

  /* ---- point buy, exactly D&D Beyond's ---------------------------------- */
  function pointBuyRules(tables) { return tables.dndScoring.pointBuy; }

  function costOf(rules, score) {
    var c = rules.costs[String(score)];
    return Money.isEntered(c) ? c : null;
  }

  /** Points spent by a full set of six. Null if any score is off the table. */
  function spent(rules, scores) {
    var total = 0;
    for (var i = 0; i < rules.over.length; i++) {
      var c = costOf(rules, scores[rules.over[i]]);
      if (c === null) return null;
      total += c;
    }
    return total;
  }

  function remaining(rules, scores) {
    var s = spent(rules, scores);
    return s === null ? null : rules.pool - s;
  }

  /** Can this ability go up by one without overspending or breaking the cap? */
  function canRaise(rules, scores, id) {
    var next = scores[id] + 1;
    if (next > rules.max) return false;
    var after = {};
    Object.keys(scores).forEach(function (k) { after[k] = scores[k]; });
    after[id] = next;
    var r = remaining(rules, after);
    return r !== null && r >= 0;
  }

  function canLower(rules, scores, id) { return scores[id] - 1 >= rules.min; }

  /** Everyone starts at the floor, which is where 5e starts them. */
  function startingScores(rules) {
    var out = {};
    rules.over.forEach(function (id) { out[id] = rules.min; });
    return out;
  }

  /* A cost table is only legible next to what it buys. */
  function ladder(rules) {
    return Object.keys(rules.costs).map(Number).sort(function (a, b) { return a - b; })
      .map(function (score) { return { score: score, cost: rules.costs[String(score)] }; });
  }

  /* ---- reading dollars a person typed -----------------------------------
     One parser, so the sheet and the campaign cannot disagree about what
     "1,200" or "" means. Blank is null — NOT zero.                         */
  function parseDollars(text) {
    var t = String(text === null || text === undefined ? '' : text).replace(/[$,\s]/g, '');
    if (t === '') return null;
    if (!/^-?\d*\.?\d+$/.test(t)) return null;
    return Math.round(parseFloat(t) * 100);
  }

  return {
    MONEY: MONEY, EXTRAS: EXTRAS, CONTEXT: CONTEXT,
    pointBuyRules: pointBuyRules, costOf: costOf, spent: spent, remaining: remaining,
    canRaise: canRaise, canLower: canLower, startingScores: startingScores, ladder: ladder,
    parseDollars: parseDollars
  };
});

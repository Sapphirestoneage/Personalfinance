/* ==========================================================================
   engines/taxroom.js — the Tax room's picture of a year of pay.
   DECISIONS.md D-098 (the tranche rooms on the template).
   --------------------------------------------------------------------------
   Nothing here walks a bracket ladder. The room reads one function,
   picture(h, T), which assembles what the engines that own each piece
   already compute:

     engines/tax.js        Tax.estimate — ordinary federal tax, the employee
                           FICA, self-employment tax (through
                           engines/selfemployed.js), the state schedule
     shared/reference.js   Reference.marginalBracket — the bracket the next
                           ordinary dollar lands in and the room left in it
     engines/tier0.js      Tier0.estimatedAnnualTaxCents — the blunter
                           effective-rate lookup the rest of the app uses,
                           shown beside the computed figure so the two are
                           never confused

   What this file adds is the room's own arithmetic, none of it a tax
   formula: which part of gross is wages and which is self-employment
   profit (from the person's employment status and the income sources'
   types); the workplace pre-tax contribution as a share of wages
   (contributionPercent is a whole percent — 6, not 0.06 — see
   Schema.capturingFullMatchDerived); the two facts the room owns
   (household.tax.otherPreTaxAnnualCents, household.tax.withheldAnnualCents);
   the refund-or-owe difference; and the shares of a dollar of pay the
   chart draws.

   Money is integer cents. A missing input is incomplete, never zero.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../shared/money.js'), Schema: require('../shared/schema.js'), Reference: require('../shared/reference.js'),
             Tax: require('./tax.js'), Tier0: require('./tier0.js'), Ledger: require('./ledger.js') };
  } else {
    var S = root.SLAF || {};
    deps = { Money: S.Money, Schema: S.Schema, Reference: S.Reference, Tax: S.Tax, Tier0: S.Tier0, Ledger: S.Ledger || null };
  }
  var api = factory(deps.Money, deps.Schema, deps.Reference, deps.Tax, deps.Tier0, deps.Ledger);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TaxRoom = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Schema, Reference, Tax, Tier0, Ledger) {
  'use strict';

  var MONTHS = 12;

  /* ---- Wages or profit? ------------------------------------------------------
     Self-employed: everything is profit, whatever the source's type says —
     Start Here files a sole earner's pay under the ordinary pay card.
     Mixed: the sources say which is which ('1099' is the own-work card);
     with no 1099 source yet, all of it is wages and the picture says so.
     Anyone else: wages.                                                      */
  function splitIncome(h) {
    var sources = Schema.allIncomeSources(h);
    var row = Schema.householdEmployment(h);
    var status = row ? row.id : null;
    /* The ledger first (D-128): when dated income entries exist and
       recur, the year is theirs — wages by withholding, self-employment
       profit net of the costs logged against it — read through the one
       tax engine for entries, engines/ledger.js. Households without a
       ledger read their sources exactly as before. */
    if (Ledger && Ledger.hasRecurring(h)) {
      var y = Ledger.annualByMethod(h);
      return { wagesCents: y.wagesCents, selfEmploymentCents: y.selfEmploymentCents, counted: y.counted, status: status,
        mixedWithoutOwnWork: false, fromLedger: true, untaxedCents: y.untaxedCents };
    }
    var wages = 0, se = 0, counted = 0;
    sources.forEach(function (s) {
      if (!Money.isEntered(s.grossAnnualIncomeCents)) return;
      counted++;
      if (status === 'selfEmployed' || (status === 'both' && s.type === '1099')) se += s.grossAnnualIncomeCents;
      else wages += s.grossAnnualIncomeCents;
    });
    return { wagesCents: wages, selfEmploymentCents: se, counted: counted, status: status,
      mixedWithoutOwnWork: status === 'both' && se === 0 && counted > 0 };
  }

  /**
   * picture(household, tables) — the whole year in one Result.
   *   value                     the effective rate, total tax ÷ gross
   *   grossCents                what came in
   *   wagesCents / selfEmploymentCents
   *   workplacePreTaxCents      wages × contributionPercent ÷ 100
   *   otherPreTaxCents          the room's own input (0 when blank, flagged)
   *   preTaxCents               the two together
   *   federalCents, stateCents, ficaCents, selfEmploymentTaxCents, totalTaxCents
   *   state                     the state Result — incomplete says why
   *   stateIncluded             whether stateCents is in the total
   *   taxableIncomeCents, agiCents, deductionCents
   *   bracket                   { rate, roomCents (null in the top bracket), nextRate }
   *   withheldCents, refundCents (withheld − what the return settles; null when blank)
   *   takeHomeCents             gross − tax − pre-tax
   *   shares                    { takeHome, federal, state, fica, preTax } of gross
   *   blunt                     Tier0's effective-rate lookup, for the drawer
   */
  function picture(household, tables) {
    var h = household || {};
    var T = tables || {};
    var gross = Schema.grossAnnualIncomeCents(h);
    if (!Money.isOk(gross)) return Money.incomplete('Add your income in Start Here to estimate tax.', ['grossAnnualIncome']);
    if (gross.value <= 0) return Money.incomplete('With nothing coming in there is no tax to estimate.', ['grossAnnualIncome']);
    if (!h.filingStatus) return Money.incomplete('Choose a filing status in Start Here to estimate tax.', ['filingStatus']);
    if (!T.federalBrackets || !T.seTax) return Money.incomplete('The tax tables are not loaded.', ['federalBrackets', 'seTax']);

    var split = splitIncome(h);
    var pct = (h.retirement || {}).contributionPercent;
    var workplaceKnown = Money.isEntered(pct);
    var workplace = workplaceKnown && pct > 0 && split.wagesCents > 0 ? Math.round(split.wagesCents * pct / 100) : 0;
    var facts = h.tax || {};
    var otherKnown = Money.isEntered(facts.otherPreTaxAnnualCents);
    var other = otherKnown ? Math.max(0, facts.otherPreTaxAnnualCents) : 0;
    var preTax = Math.min(gross.value, workplace + other);

    var est = Tax.estimate(h, T, { wagesCents: split.wagesCents, selfEmploymentCents: split.selfEmploymentCents, deferralCents: preTax });
    if (!Money.isOk(est)) return est;

    var ord = est.components.ordinary;
    var state = est.components.state || Tax.stateTax(T.stateBrackets, h.state, est.taxableIncomeCents, h.filingStatus);
    var stateIncluded = !!est.stateIncluded;

    /* The bracket the next ordinary dollar lands in — the same lookup the
       Statement's ladder and the bracketRoom ratio use, entered at AGI so
       the pre-tax money has already come off. */
    var b = Reference.marginalBracket(T.federalBrackets, est.agiCents / 100, h.filingStatus);
    var bracket = Money.isOk(b)
      ? { rate: b.value, roomCents: b.roomBeforeNextBracketDollars === null ? null : Math.round(b.roomBeforeNextBracketDollars * 100), nextRate: b.nextRate, topCents: b.bracketTopDollars === null ? null : Math.round(b.bracketTopDollars * 100) }
      : { rate: est.marginalRate, roomCents: null, nextRate: null, topCents: null };

    /* What the return settles: federal income tax, the SE tax (paid in
       estimates, never withheld), and state when it is in. The employee
       FICA is taken from every cheque and never comes back, so it is not
       in the comparison. */
    var settled = est.federalIncomeTaxCents + est.selfEmploymentTaxCents + (stateIncluded ? est.stateCents : 0);
    var withheldKnown = Money.isEntered(facts.withheldAnnualCents);
    var refund = withheldKnown ? facts.withheldAnnualCents - settled : null;

    var total = est.value;
    var takeHome = gross.value - total - preTax;
    var g = gross.value;
    var payrollLike = est.ficaCents + est.selfEmploymentTaxCents;

    var blunt = Tier0.estimatedAnnualTaxCents(h, T);

    return Money.ok(total / g, {
      grossCents: g,
      wagesCents: split.wagesCents,
      selfEmploymentCents: split.selfEmploymentCents,
      employment: split.status,
      mixedWithoutOwnWork: split.mixedWithoutOwnWork,
      workplacePercent: workplaceKnown ? pct : null,
      workplacePreTaxCents: workplace,
      otherPreTaxCents: other,
      otherPreTaxKnown: otherKnown,
      preTaxCents: preTax,
      federalCents: est.federalIncomeTaxCents,
      stateCents: stateIncluded ? est.stateCents : null,
      state: state,
      stateIncluded: stateIncluded,
      stateType: state && state.type ? state.type : null,
      ficaCents: est.ficaCents,
      selfEmploymentTaxCents: est.selfEmploymentTaxCents,
      payrollCents: payrollLike,
      totalTaxCents: total,
      monthlyTaxCents: Math.round(total / MONTHS),
      agiCents: est.agiCents,
      taxableIncomeCents: est.taxableIncomeCents,
      deductionCents: ord.deductionCents,
      deductionKind: ord.deductionKind,
      belowDeduction: est.taxableIncomeCents <= 0,
      bracket: bracket,
      withheldCents: withheldKnown ? facts.withheldAnnualCents : null,
      settledCents: settled,
      refundCents: refund,
      takeHomeCents: takeHome,
      shares: {
        takeHome: Math.max(0, takeHome) / g,
        federal: est.federalIncomeTaxCents / g,
        state: (stateIncluded ? est.stateCents : 0) / g,
        fica: payrollLike / g,
        preTax: preTax / g
      },
      blunt: Money.isOk(blunt) ? { cents: blunt.value, rate: blunt.effectiveRate } : null,
      notModelled: est.notModelled,
      confidence: est.confidence
    });
  }

  return { picture: picture, splitIncome: splitIncome };
});

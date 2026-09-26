/* ==========================================================================
   toolbox/engines/planloan.js, borrowing from your own 401(k) (TB-010).
   --------------------------------------------------------------------------
   The interest goes back to you, so a plan loan looks free. It is not free;
   its cost is what the money did not earn while it was out. This tool puts
   a number on that and on the two things that make a plan loan dangerous:
     paused     contributions stopped while repaying never come back
     leaving    lose or leave the job and the balance is due; what is not
                repaid becomes a distribution, taxed at your rate plus the
                penalty before 59 and a half
   Then the alternative: a personal loan at a market rate, its interest
   simply paid to a bank. The limits (the lesser of $50,000 and half the
   vested balance, five years) come from toolbox/data/plan_loan_rules_2026.json.
   ========================================================================== */
(function (root, factory) {
  var deps;
  if (typeof module === 'object' && module.exports) {
    deps = { Money: require('../../shared/money.js'), Projection: require('../../engines/projection.js'), Loan: require('./loan.js') };
  } else {
    deps = { Money: root.SLAF.Money, Projection: root.SLAF.Projection, Loan: root.SLAF.TB.Loan };
  }
  var api = factory(deps.Money, deps.Projection, deps.Loan);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SLAF = root.SLAF || {}; root.SLAF.TB = root.SLAF.TB || {}; root.SLAF.TB.PlanLoan = api; }
})(typeof self !== 'undefined' ? self : null, function (Money, Projection, Loan) {
  'use strict';

  function cost(opts, rules) {
    var o = opts || {};
    if (!rules) return Money.incomplete('The plan loan rules are not loaded.', ['rules']);
    var missing = Money.missingFrom({ loanCents: o.loanCents, vestedCents: o.vestedCents, loanRate: o.loanRate, months: o.months, marketRate: o.marketRate });
    if (missing.length) return Money.incomplete('Add the loan, your vested balance, the loan rate, the term and the return you expect.', missing);
    if (o.loanCents <= 0) return Money.incomplete('The loan has to be more than zero.', ['loanCents']);
    if (o.months <= 0) return Money.incomplete('The term needs at least a month.', ['months']);

    var allowed = Math.min(rules.maxLoanCents, Math.max(Math.round(o.vestedCents * rules.maxShareOfVested), Math.min(rules.smallBalanceFloorCents || 0, o.vestedCents)));
    var lp = Projection.levelPaymentCents({ principalCents: o.loanCents, annualRate: o.loanRate, months: o.months });
    if (!Money.isOk(lp)) return lp;
    var sim = Loan.simulate({ principalCents: o.loanCents, annualRate: o.loanRate, paymentCents: lp.value });

    /* Left invested, the loan would have grown at the market. Repaid, each payment grows from the month it lands. */
    var stayed = Projection.futureValueMonthlyCents({ startCents: o.loanCents, monthlyContributionCents: 0, annualRate: o.marketRate, months: o.months });
    var repaid = Projection.futureValueMonthlyCents({ startCents: 0, monthlyContributionCents: lp.value, annualRate: o.marketRate, months: o.months });
    if (!Money.isOk(stayed) || !Money.isOk(repaid)) return Money.incomplete('Could not project the balance.', ['marketRate']);
    var lostGrowth = stayed.value - repaid.value;

    var paused = Money.isEntered(o.pausedMonthlyCents) && o.pausedMonthlyCents > 0
      ? Projection.futureValueMonthlyCents({ startCents: 0, monthlyContributionCents: o.pausedMonthlyCents, annualRate: o.marketRate, months: o.months }) : null;
    var pausedCost = paused && Money.isOk(paused) ? paused.value : 0;
    var pausedPutIn = paused && Money.isOk(paused) ? paused.contributedCents : 0;

    var leave = null;
    if (Money.isEntered(o.leaveAfterMonths) && o.leaveAfterMonths >= 0 && o.leaveAfterMonths < o.months) {
      var outstanding = Loan.balanceAfter(sim, o.leaveAfterMonths);
      var marginal = Money.isEntered(o.marginalRate) ? o.marginalRate : null;
      var ageThen = Money.isEntered(o.age) ? o.age + o.leaveAfterMonths / 12 : null;
      var penalised = ageThen !== null ? ageThen < rules.penaltyAge : null;
      leave = {
        afterMonths: o.leaveAfterMonths, outstandingCents: outstanding,
        taxCents: marginal === null ? null : Math.round(outstanding * marginal),
        penaltyCents: penalised === null ? null : (penalised ? Math.round(outstanding * rules.penaltyRate) : 0),
        penalised: penalised, ageThen: ageThen
      };
      leave.billCents = leave.taxCents === null ? null : leave.taxCents + (leave.penaltyCents || 0);
    }

    var personal = null;
    if (Money.isEntered(o.personalLoanRate)) {
      var pl = Projection.levelPaymentCents({ principalCents: o.loanCents, annualRate: o.personalLoanRate, months: o.months });
      if (Money.isOk(pl)) personal = { rate: o.personalLoanRate, paymentCents: pl.value, interestCents: pl.totalInterestCents };
    }

    var total = lostGrowth + pausedCost;
    return Money.ok(total, {
      allowedCents: allowed, overLimit: o.loanCents > allowed, overTerm: o.months > rules.maxMonths,
      paymentCents: lp.value, interestToSelfCents: lp.totalInterestCents,
      stayedInvestedCents: stayed.value, repaidGrowsToCents: repaid.value, lostGrowthCents: lostGrowth,
      pausedCostCents: pausedCost, pausedPutInCents: pausedPutIn,
      leave: leave, personal: personal,
      personalCheaper: personal ? personal.interestCents < total : null,
      rules: { maxLoanCents: rules.maxLoanCents, maxShareOfVested: rules.maxShareOfVested, maxMonths: rules.maxMonths, penaltyRate: rules.penaltyRate, penaltyAge: rules.penaltyAge, version: rules.version }
    });
  }

  return { cost: cost };
});

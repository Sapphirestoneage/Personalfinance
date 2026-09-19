'use strict';
/* Property tests for engines/debt.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, TABLES, buildComplete, arbCompleteSpec, prop } = H;
const Debt = H.engine('debt');
const ok = (r) => Money.isOk(r);
const withDebts = arbCompleteSpec.filter((s) => s.debts.length > 0);

const props = H.generic('debt').concat([
  prop('a payoff pays back at least every balance, and interest is never negative', withDebts, (s) => {
    const r = Debt.simulate(buildComplete(s), TABLES.debtRules, { strategyId: 'avalanche' });
    if (!ok(r)) return true;
    if (r.totalInterestCents < 0) return 'negative interest ' + r.totalInterestCents;
    if (r.totalPaidCents < r.startingBalanceCents) return 'paid ' + r.totalPaidCents + ' < owed ' + r.startingBalanceCents;
    if (r.totalPaidCents !== r.startingBalanceCents + r.totalInterestCents) return 'paid != owed + interest';
    return true;
  }),
  prop('avalanche never costs more interest than snowball', withDebts, (s) => {
    const h = buildComplete(s);
    const a = Debt.simulate(h, TABLES.debtRules, { strategyId: 'avalanche' });
    const b = Debt.simulate(h, TABLES.debtRules, { strategyId: 'snowball' });
    if (!ok(a) || !ok(b)) return true;
    return a.totalInterestCents <= b.totalInterestCents || ('avalanche ' + a.totalInterestCents + ' > snowball ' + b.totalInterestCents);
  }),
  prop('more extra a month never takes more months or costs more interest', fc.tuple(withDebts, fc.integer({ min: 1, max: 300000 })), ([s, extra]) => {
    const h = buildComplete(s);
    const a = Debt.simulate(h, TABLES.debtRules, { strategyId: 'avalanche' });
    const b = Debt.simulate(h, TABLES.debtRules, { strategyId: 'avalanche', extraMonthlyCents: extra });
    if (!ok(a) || !ok(b)) return true;
    if (b.months > a.months) return 'extra ' + extra + ' a month, months went ' + a.months + ' -> ' + b.months;
    if (b.totalInterestCents > a.totalInterestCents) return 'extra ' + extra + ' a month, interest went ' + a.totalInterestCents + ' -> ' + b.totalInterestCents;
    return true;
  }),
  prop('the cheapest strategy in a comparison really is the cheapest', withDebts, (s) => {
    const r = Debt.compareStrategies(buildComplete(s), TABLES.debtRules);
    if (!ok(r)) return true;
    const results = Object.keys(r.results).map((k) => r.results[k]).filter(ok);
    const min = Math.min.apply(null, results.map((x) => x.totalInterestCents));
    return (r.value === min && r.spreadCents >= 0) || ('cheapest says ' + r.value + ', min is ' + min);
  })
]);
module.exports = H.suite('debt', props);
if (require.main === module) H.main(module.exports);

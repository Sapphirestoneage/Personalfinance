'use strict';
/* Property tests for engines/tier0.js (lane 2, section 2, L-2). */
const H = require('./_harness.js');
const { fc, Money, Schema, TABLES, buildComplete, withField, arbCompleteSpec, prop } = H;
const Tier0 = H.engine('tier0');

const ok = (r) => Money.isOk(r);
const props = H.generic('tier0').concat([
  prop('take-home never exceeds gross, and the estimated tax is never negative', arbCompleteSpec, (s) => {
    const h = buildComplete(s);
    const gross = Schema.grossAnnualIncomeCents(h), th = Schema.takeHomeAnnualCents(h, TABLES), tax = Schema.estimatedAnnualTaxCents(h, TABLES);
    if (!ok(gross) || !ok(th) || !ok(tax)) return 'incomplete on a complete household: ' + (th.reason || tax.reason);
    if (th.value > gross.value) return 'take-home ' + th.value + ' > gross ' + gross.value;
    if (tax.value < 0) return 'tax ' + tax.value + ' < 0';
    if (th.value + tax.value !== gross.value) return 'take-home + tax != gross';
    return true;
  }),
  prop('annual savings never exceed take-home (excluding and including match)', arbCompleteSpec, (s) => {
    const h = buildComplete(s);
    const th = Schema.takeHomeAnnualCents(h, TABLES), r = Tier0.savingsRate(h, TABLES);
    if (!ok(th) || !ok(r.excludingMatch)) return 'incomplete: ' + r.excludingMatch.reason;
    if (r.excludingMatch.annualSavingsCents > th.value) return 'excluding-match savings ' + r.excludingMatch.annualSavingsCents + ' > take-home ' + th.value;
    if (ok(r.includingMatch)) {
      const match = Schema.employerMatchCents(h);
      if (r.includingMatch.annualSavingsCents > th.value + match.value) return 'including-match savings exceed take-home plus the match';
    }
    return true;
  }, 'The including-match figure may exceed take-home by exactly the match, which lands in the account without passing through the paycheque.'),
  prop('FI target rises when spending rises and falls when it falls, everything else fixed', fc.tuple(arbCompleteSpec, fc.integer({ min: 1, max: 5000 })), ([s, more]) => {
    const a = Tier0.fireNumber(buildComplete(s));
    const b = Tier0.fireNumber(buildComplete(withField(s, 'wants', s.wants + more)));
    if (!ok(a) || !ok(b)) return 'incomplete: ' + (a.reason || b.reason);
    if (b.value <= a.value) return 'spending up by $' + more + ' a month, FI target went ' + a.value + ' -> ' + b.value;
    return true;
  }),
  prop('years to FI never move earlier when spending rises or income falls', fc.tuple(arbCompleteSpec, fc.integer({ min: 1, max: 3000 }), fc.integer({ min: 1, max: 50000 })), ([s, more, less]) => {
    const base = Tier0.yearsToFire(buildComplete(s));
    if (!ok(base)) return true;                                      /* nothing to compare against */
    const spendUp = Tier0.yearsToFire(buildComplete(withField(s, 'wants', s.wants + more)), TABLES);
    const incomeDown = Tier0.yearsToFire(buildComplete(withField(s, 'gross', Math.max(1, s.gross - less))), TABLES);
    const b = Tier0.yearsToFire(buildComplete(s), TABLES);
    if (!ok(b)) return true;
    if (ok(spendUp) && spendUp.value < b.value) return 'spending up, years to FI went ' + b.value + ' -> ' + spendUp.value;
    if (ok(incomeDown) && incomeDown.value < b.value) return 'income down, years to FI went ' + b.value + ' -> ' + incomeDown.value;
    return true;
  }, 'A run that becomes incomplete (the pot can no longer get there) is not counted as earlier.'),
  prop('emergency-fund months fall when cash falls and ignore property and vehicles', fc.tuple(arbCompleteSpec, fc.integer({ min: 1, max: 100000 })), ([s, less]) => {
    const h = buildComplete(s);
    const a = Tier0.emergencyFundMonths(h);
    if (!ok(a)) return true;
    const lessCash = Tier0.emergencyFundMonths(buildComplete(withField(s, 'cash', Math.max(0, s.cash - less))));
    if (ok(lessCash) && lessCash.value > a.value) return 'less cash, more months: ' + a.value + ' -> ' + lessCash.value;
    const moreProperty = Tier0.emergencyFundMonths(buildComplete(withField(withField(s, 'property', (s.property || 0) + 500000), 'vehicle', (s.vehicle || 0) + 20000)));
    if (!ok(moreProperty) || moreProperty.value !== a.value) return 'a house and a car changed the months from ' + a.value + ' to ' + (moreProperty.value);
    return true;
  }),
  prop('net worth is assets minus debts, counted once each', arbCompleteSpec, (s) => {
    const h = buildComplete(s);
    const nw = Tier0.netWorth(h), a = Schema.totalAssetsCents(h), d = Schema.totalDebtCents(h);
    if (!ok(nw) || !ok(a) || !ok(d)) return 'incomplete: ' + nw.reason;
    return nw.value === a.value - d.value || ('net worth ' + nw.value + ' != ' + a.value + ' - ' + d.value);
  })
]);

module.exports = H.suite('tier0', props);
if (require.main === module) H.main(module.exports);

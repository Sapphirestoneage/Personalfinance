/* Safety net: cash comes from Investments (never re-entered), insurance,
   unemployment estimate, ability to cut. Publishes the Rule of 5 target,
   runway at three spending levels, the gap and the monthly to close it. Level 8
   (MR-047): the roommate gap is its own line of the target, and runway shows
   "if it all falls on you" when there is a roommate. */
import { q, U, needs, isNeeds } from '../units.js';
import { fieldQ, monthlyCents, num, val } from './common.js';
import { ageAt } from '../format.js';

export function run(ctx) {
  const { rows, reader, asm, today } = ctx;
  const birth = reader.fact('birthDate');
  const cash = reader.slot('invest.cashBalances');
  const spending = reader.slot('spending.baselineMonthly');
  const fat = reader.slot('spending.fatFloorMonthly');
  const fixed = reader.slot('spending.fixedMonthly');
  let premiums = q(0, U.monthlyAfter);
  const insurance = [];
  rows.forEach(r => {
    if (r.type === 'insurance') {
      const p = fieldQ(r, 'premium', U.monthlyAfter, asm);
      const viaPayroll = !!(r.f.premium && r.f.premium.cad === 'paycheck');
      insurance.push({ rowId: r.id, name: r.nickname, type: val(r, 'insuranceType'), coverage: num(r, 'coverage'), premiumMonthly: p ? p.cents : null, deductible: num(r, 'deductible'), viaPayroll });
      if (p && !viaPayroll) premiums = q(premiums.cents + p.cents, U.monthlyAfter, { confidence: Math.min(premiums.confidence, p.confidence), rough: premiums.rough || p.rough });
    }
  });
  const fullSpend = spending && !isNeeds(spending) ? q(spending.cents + premiums.cents, U.monthlyAfter, { confidence: spending.confidence, rough: spending.rough, range: spending.range ? { low: spending.range.low + premiums.cents, high: spending.range.high + premiums.cents } : null }) : null;
  const age = birth && birth.v ? ageAt(birth.v, today) : null;
  const months = age !== null ? age / 5 : null;
  let target = months !== null && fullSpend ? q(Math.round(fullSpend.cents * months), U.oneoff, { confidence: fullSpend.confidence, rough: fullSpend.rough }) : needs([age === null ? 'birth date' : null, fullSpend ? null : 'monthly spending'].filter(Boolean));
  /* the roommate gap (MR-047): the roommate's part of the shared bills for the months until someone new moves in */
  const sharedFull = reader.slot('spending.sharedFullMonthly'); const sharedShare = reader.slot('spending.sharedShareMonthly');
  const roommates = ctx.record && ctx.record.household ? (ctx.record.household.roommates || []).length : 0;
  const gapMonthly = roommates && sharedFull && !isNeeds(sharedFull) && sharedShare && !isNeeds(sharedShare) ? Math.max(0, sharedFull.cents - sharedShare.cents) : 0;
  const roommateGap = roommates && gapMonthly > 0 ? q(Math.round(gapMonthly * (asm.roommateMonthsToReplace || 2)), U.oneoff, { confidence: Math.min(sharedFull.confidence, sharedShare.confidence), rough: sharedFull.rough || sharedShare.rough }) : null;
  const target0 = target;
  target = !isNeeds(target0) && roommateGap ? q(target0.cents + roommateGap.cents, U.oneoff, { confidence: target0.confidence, rough: target0.rough }) : target0;
  const cashCents = cash && !isNeeds(cash) ? cash.cents : null;
  const runway = {
    full: cashCents !== null && fullSpend && fullSpend.cents ? cashCents / fullSpend.cents : null,
    draftt: cashCents !== null && fixed && !isNeeds(fixed) && (fixed.cents + premiums.cents) ? cashCents / (fixed.cents + premiums.cents) : null,
    fat: cashCents !== null && fat && !isNeeds(fat) && fat.cents ? cashCents / fat.cents : null,
    /* if it all falls on you: the same cash against spending with the roommate's part added */
    fullAlone: roommates && gapMonthly > 0 && cashCents !== null && fullSpend ? cashCents / (fullSpend.cents + gapMonthly) : null,
    gapMonthly,
  };
  const gap = !isNeeds(target) && cashCents !== null ? q(Math.max(0, target.cents - cashCents), U.oneoff, { confidence: target.confidence, rough: target.rough }) : needs(isNeeds(target) ? target.needs : ['cash accounts']);
  const unemp = rows.find(r => r.type === 'unemployment');
  const weekly = unemp ? fieldQ(unemp, 'unemploymentWeekly', U.oneoff, asm) : null;
  const cut = rows.find(r => r.type === 'cut');
  return {
    outputs: {
      ruleOf5Months: months,
      ruleOf5Target: target,
      runway,
      gap,
      monthlyToClose: !isNeeds(gap) ? q(Math.round(gap.cents / 12), U.monthlyAfter, { confidence: gap.confidence, rough: gap.rough }) : gap,
      insurance,
      premiumsMonthly: premiums,
      unemploymentMonthly: weekly ? q(Math.round(weekly.cents * 52 / 12), U.monthlyAfter, { confidence: weekly.confidence, rough: weekly.rough }) : null,
      cutAbilityMonthly: cut ? fieldQ(cut, 'cutAbility', U.monthlyAfter, asm) : null,
      spendingWithPremiums: fullSpend,
      roommateGap,
    },
    enriched: [],
  };
}

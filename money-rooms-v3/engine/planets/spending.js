/* Spending: DRAFTT lines, wants, irregular, mistakes, savings transfers.
   Detail overrides a rough total; the gap is published. */
import { q, U, add, sum, needs, ratio, isNeeds } from '../units.js';
import { fieldQ, monthlyCents, val } from './common.js';

export const CATEGORIES = ['accommodation', 'food', 'transportation', 'therapy', 'utilities', 'wants', 'irregular', 'mistakes', 'other'];

/* Which earn category a spending line maps to for the wallet math. */
export function earnCategoryOf(category, nickname) {
  const n = (nickname || '').toLowerCase();
  if (category === 'food') return /restaurant|dining|takeout|take-out|eating out/.test(n) ? 'dining' : 'groceries';
  if (category === 'transportation') return /gas|fuel/.test(n) ? 'gas' : 'travel';
  if (category === 'utilities') return /stream/.test(n) ? 'streaming' : 'other';
  if (category === 'irregular') return /travel|flight|hotel|trip/.test(n) ? 'travel' : 'other';
  return 'other';
}

export function run(ctx) {
  const { rows, reader, asm } = ctx;
  const byCategory = {};
  CATEGORIES.forEach(c => { byCategory[c] = q(0, U.monthlyAfter); });
  let total = q(0, U.monthlyAfter), fat = q(0, U.monthlyAfter), fixed = q(0, U.monthlyAfter), mistakes = q(0, U.monthlyAfter), landing = q(0, U.monthlyAfter);
  let lines = 0;
  const cardSpend = {};
  rows.forEach(r => {
    if (r.type === 'line') {
      const a = fieldQ(r, 'amount', U.monthlyAfter, asm);
      if (!a) return;
      lines++;
      const cat = val(r, 'category') || 'other';
      byCategory[cat] = add(byCategory[cat] || q(0, U.monthlyAfter), a);
      total = add(total, a);
      if (val(r, 'fatFloor') === true) fat = add(fat, a);
      if (val(r, 'needWant') === 'need') fixed = add(fixed, a);
      if (val(r, 'mistake') === 'mistake') mistakes = add(mistakes, a);
      const card = val(r, 'primaryCard');
      if (card) {
        const ec = earnCategoryOf(cat, r.nickname);
        cardSpend[card] = cardSpend[card] || {};
        cardSpend[card][ec] = (cardSpend[card][ec] || 0) + a.cents;
      }
    }
    if (r.type === 'savings') {
      const s = fieldQ(r, 'savingsLanding', U.monthlyAfter, asm);
      if (s) landing = add(landing, s);
    }
    if (r.type === 'other') {
      const o = fieldQ(r, 'otherSpending', U.monthlyAfter, asm);
      if (o) { lines++; byCategory.other = add(byCategory.other, o); total = add(total, o); }
    }
  });
  const summaryRow = rows.find(r => r.type === 'summary');
  const summaryQ = summaryRow ? fieldQ(summaryRow, 'summaryTotal', U.monthlyAfter, asm) : null;
  const baseline = lines ? total : (summaryQ || needs(['monthly spending']));
  const take = reader.slot('income.takeHomeMonthly');
  const shares = {};
  ['accommodation', 'food', 'transportation', 'therapy'].forEach(c => {
    const numer = c === 'accommodation' ? add(byCategory.accommodation, byCategory.utilities) : byCategory[c];
    shares[c] = take && !isNeeds(take) && lines ? ratio(numer, take) : needs(take && !isNeeds(take) ? ['spending lines'] : ['take-home pay']);
  });
  return {
    outputs: {
      baselineMonthly: baseline,
      summaryTotalMonthly: summaryQ || null,
      detailGapMonthly: summaryQ && lines ? q(total.cents - summaryQ.cents, U.monthlyAfter) : null,
      byCategory,
      drafttShares: shares,
      fatFloorMonthly: lines ? fat : needs(['spending lines flagged in the FAT floor']),
      fixedMonthly: lines ? fixed : needs(['spending lines marked need']),
      mistakesAnnual: q(mistakes.cents * 12, U.annualAfter, { confidence: mistakes.confidence, rough: mistakes.rough }),
      savingsLandingMonthly: landing,
      cardSpendByCategory: cardSpend,
    },
    enriched: [],
  };
}

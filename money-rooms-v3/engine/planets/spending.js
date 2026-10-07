/* Spending: DRAFTT lines, wants, irregular, mistakes, savings transfers.
   Detail overrides a rough total; the gap is published. Level 8 (MR-046,
   MR-047): a shared line counts the client's share only; an area with no
   real lines stands in its gut anchor, else its guess (when guesses are on);
   lines in an anchored area publish their gap to the anchor. */
import { q, U, add, sum, needs, ratio, isNeeds } from '../units.js';
import { fieldQ, monthlyCents, val, num } from './common.js';
import { isGuessRow, realCategories } from '../guesses.js';
import { shareOf, peopleOf } from '../household.js';
import { AREAS } from '../anchors.js';
import { scale } from '../units.js';

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
  const gut = (ctx.record && ctx.record.anchors && ctx.record.anchors.gut) || {};
  const guessesOn = !(asm && asm.fillGapsWithGuesses === false);
  const hh = (ctx.record && ctx.record.household) || {};
  const realIn = ctx.record ? realCategories(ctx.record) : {};
  let sharedFull = q(0, U.monthlyAfter), sharedShare = q(0, U.monthlyAfter);
  const standIns = {}; const anchorGap = {};
  rows.forEach(r => {
    if (r.type === 'line') {
      const cat0 = val(r, 'category') || 'other';
      /* a guess stays out of the math when guesses are off, or when the area already has the client's own figure or anchor */
      if (isGuessRow(r) && (!guessesOn || realIn[cat0] || gut['spending:' + cat0])) return;
      const full = fieldQ(r, 'amount', U.monthlyAfter, asm);
      if (!full) return;
      const shared = val(r, 'shared') === true;
      const share = shared ? shareOf(hh, num(r, 'myShare')) : 1;
      const a = shared ? scale(full, share) : full;
      if (shared) { sharedFull = add(sharedFull, full); sharedShare = add(sharedShare, a); }
      lines++;
      if (isGuessRow(r)) standIns[cat0] = 'guess';
      const cat = cat0;
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
  /* stand-ins: an area with no real lines takes its gut anchor as a rough figure (never a guess once an anchor exists) */
  AREAS.forEach(cat => {
    const a = gut['spending:' + cat];
    if (realIn[cat]) { if (a) anchorGap[cat] = q(byCategory[cat].cents - a.cents, U.monthlyAfter); return; }
    if (!a || typeof a.cents !== 'number') return;
    const sq = q(a.cents, U.monthlyAfter, { confidence: 0.6, rough: true });
    byCategory[cat] = add(byCategory[cat] || q(0, U.monthlyAfter), sq); total = add(total, sq); lines++;
    if (['accommodation', 'food', 'transportation'].includes(cat)) fat = add(fat, sq);
    if (cat !== 'wants' && cat !== 'irregular') fixed = add(fixed, sq);
    standIns[cat] = 'anchor';
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
      sharedFullMonthly: sharedFull, sharedShareMonthly: sharedShare, standIns, anchorGapByCategory: anchorGap,
    },
    enriched: [],
  };
}

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
import { resolveTotal, snapshotFromField, rowFromField, rowStateOf } from '../resolve.js';

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
  const items = []; /* MR-108: every counted line as a resolver row, with the split it belongs to */
  /* MR-117: the split is selected on the line (Fixed, Variable, Annual, or Part fixed with a fixed share); blank lets Need or Want and the category decide */
  const ruleSplit = (r, cat) => { const nw = val(r, 'needWant'); if (cat === 'irregular') return 'annual'; if (nw === 'need') return 'fixed'; if (nw === 'want') return 'variable'; return ['accommodation', 'utilities', 'transportation', 'therapy'].includes(cat) ? 'fixed' : 'variable'; };
  const splitOf = (r, cat) => { const sk = val(r, 'splitKind'); if (sk === 'fixed' || sk === 'variable' || sk === 'annual') return sk; if (sk === 'mixed') { const sh = num(r, 'fixedShare'); return typeof sh === 'number' ? 'mixed' : ruleSplit(r, cat); } return ruleSplit(r, cat); };
  const fixedShareOf = r => { const sh = num(r, 'fixedShare'); return typeof sh === 'number' ? Math.min(1, Math.max(0, sh)) : null; };
  const feelingKeys = ((ctx.data && ctx.data.fields && ctx.data.fields.fields.feeling && ctx.data.fields.fields.feeling.options) || []).map(o => o[0]);
  const byFeeling = {}; feelingKeys.concat(['untagged']).forEach(k => { byFeeling[k] = q(0, U.monthlyAfter); });
  let sharedFull = q(0, U.monthlyAfter), sharedShare = q(0, U.monthlyAfter);
  const standIns = {}; const anchorGap = {};
  rows.forEach(r => {
    if (r.type === 'line') {
      const cat0 = val(r, 'category') || 'other';
      /* a guess stays out of the math when guesses are off, or when the area already has the client's own figure or anchor */
      if (isGuessRow(r) && (!guessesOn || realIn[cat0] || gut['spending:' + cat0])) return;
      const full = fieldQ(r, 'amount', U.monthlyAfter, asm);
      if (!full) { if (r.f.amount && rowStateOf(r.f.amount) === 'notYet' && !isGuessRow(r)) items.push(Object.assign(rowFromField(r.id, r.nickname || cat0, r.f.amount, null, null), { split: splitOf(r, cat0), category: cat0 })); return; } /* a Not yet line counts in the coverage read, not the money */
      const shared = val(r, 'shared') === true;
      const share = shared ? shareOf(hh, num(r, 'myShare')) : 1;
      const a = shared ? scale(full, share) : full;
      if (shared) { sharedFull = add(sharedFull, full); sharedShare = add(sharedShare, a); }
      lines++;
      items.push(Object.assign(rowFromField(r.id, r.nickname || cat0, r.f.amount, a.cents, a.range), { split: splitOf(r, cat0), fixedShare: splitOf(r, cat0) === 'mixed' ? fixedShareOf(r) : null, guess: isGuessRow(r), category: cat0, feeling: val(r, 'feeling') || null }));
      if (isGuessRow(r)) standIns[cat0] = 'guess';
      { const fe = val(r, 'feeling'); const fk = fe && byFeeling[fe] ? fe : 'untagged'; byFeeling[fk] = add(byFeeling[fk], a); }
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
      if (o) { lines++; byCategory.other = add(byCategory.other, o); total = add(total, o); items.push(Object.assign(rowFromField(r.id, r.nickname || 'Other', r.f.otherSpending, o.cents, o.range), { split: 'variable', category: 'other' })); byFeeling.untagged = add(byFeeling.untagged, o); }
    }
  });
  /* stand-ins: an area with no real lines takes its gut anchor as a rough figure (never a guess once an anchor exists) */
  AREAS.forEach(cat => {
    const a = gut['spending:' + cat];
    if (realIn[cat]) { if (a) anchorGap[cat] = q(byCategory[cat].cents - a.cents, U.monthlyAfter); return; }
    if (!a || typeof a.cents !== 'number') return;
    const sq = q(a.cents, U.monthlyAfter, { confidence: 0.6, rough: true });
    byCategory[cat] = add(byCategory[cat] || q(0, U.monthlyAfter), sq); total = add(total, sq); lines++;
    items.push({ id: 'anchor:' + cat, label: cat + ' (what you said)', cents: a.cents, range: null, state: 'rough', source: 'discovery', rowState: 'estimated', split: splitOf({ f: {} }, cat), category: cat });
    if (['accommodation', 'food', 'transportation'].includes(cat)) fat = add(fat, sq);
    if (cat !== 'wants' && cat !== 'irregular') fixed = add(fixed, sq);
    standIns[cat] = 'anchor';
  });
  const summaryRow = rows.find(r => r.type === 'summary');
  const summaryQ = summaryRow ? fieldQ(summaryRow, 'summaryTotal', U.monthlyAfter, asm) : null;
  /* MR-108: the snapshot (all in, or fixed, variable and annual) resolves against the lines: itemized plus the unitemized remainder, never one or the other */
  const W = ctx.data && ctx.data.weights; const snapOf = (fid, units) => { if (!summaryRow) return null; const fq = fieldQ(summaryRow, fid, units, asm); return fq ? snapshotFromField(summaryRow.f[fid], fq.cents) : null; };
  /* a part-fixed line is two resolver rows, its fixed share and the rest; the all-in total still counts it once */
  const scaled = (i, k, suffix, split) => Object.assign({}, i, { id: i.id + suffix, split, cents: i.cents === null ? null : Math.round(i.cents * k), range: i.range ? { low: Math.round(i.range.low * k), high: Math.round(i.range.high * k) } : null });
  const parts = items.flatMap(i => i.split === 'mixed' ? [scaled(i, i.fixedShare, ':fixed', 'fixed'), scaled(i, 1 - i.fixedShare, ':variable', 'variable')] : [i]);
  const annualRows = parts.filter(i => i.split === 'annual').map(i => Object.assign({}, i, { cents: i.cents === null ? null : i.cents * 12, range: i.range ? { low: i.range.low * 12, high: i.range.high * 12 } : null }));
  const resolved = {
    expenses: resolveTotal({ snapshot: snapOf('summaryTotal', U.monthlyAfter), rows: items }, { weights: W }),
    expensesFixed: resolveTotal({ snapshot: snapOf('fixedMonthly', U.monthlyAfter), rows: parts.filter(i => i.split === 'fixed') }, { weights: W }),
    expensesVariable: resolveTotal({ snapshot: snapOf('variableMonthly', U.monthlyAfter), rows: parts.filter(i => i.split === 'variable') }, { weights: W }),
    expensesAnnual: resolveTotal({ snapshot: snapOf('annualIrregular', U.annualAfter), rows: annualRows }, { weights: W }),
  };
  /* MR-117: the lines by split (a month each, the annual ones spread over twelve) and by feeling, the itemized figures only */
  const bySplit = { fixed: q(resolved.expensesFixed.itemized, U.monthlyAfter), variable: q(resolved.expensesVariable.itemized, U.monthlyAfter), annual: q(Math.round(resolved.expensesAnnual.itemized / 12), U.monthlyAfter) };
  const splitSnap = ['expensesFixed', 'expensesVariable', 'expensesAnnual'].some(k => resolved[k].hasSnapshot);
  /* the lines keep their own figure and band; only what the snapshot says is still unitemized is added on top, as a rough figure with the snapshot's band */
  const remQ = (r, perYear) => { if (r.status !== 'ok' || r.remainder <= 0) return null; const k = perYear ? 12 : 1; const low = Math.max(0, r.range.low - r.itemized), high = Math.max(0, r.range.high - r.itemized); return q(Math.round(r.remainder / k), U.monthlyAfter, { confidence: 0.6, rough: true, range: { low: Math.round(low / k), high: Math.round(high / k) } }); };
  let baseline; let remainderMonthly = 0;
  const rems = splitSnap ? [remQ(resolved.expensesFixed), remQ(resolved.expensesVariable), remQ(resolved.expensesAnnual, true)].filter(Boolean) : [remQ(resolved.expenses)].filter(Boolean);
  if (rems.length) { let b = lines ? total : q(0, U.monthlyAfter); rems.forEach(r => { b = add(b, r); remainderMonthly += r.cents; }); baseline = b; }
  else baseline = lines ? total : (summaryQ || needs(['monthly spending']));
  const take = reader.slot('income.takeHomeMonthly');
  const shares = {};
  ['accommodation', 'food', 'transportation', 'therapy'].forEach(c => {
    const numer = c === 'accommodation' ? add(byCategory.accommodation, byCategory.utilities) : byCategory[c];
    shares[c] = take && !isNeeds(take) && lines ? ratio(numer, take) : needs(take && !isNeeds(take) ? ['spending lines'] : ['take-home pay']);
  });
  return {
    outputs: {
      baselineMonthly: baseline,
      resolved, remainderMonthly: q(remainderMonthly, U.monthlyAfter, { rough: remainderMonthly > 0, confidence: remainderMonthly > 0 ? 0.6 : 1 }),
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
      bySplit, byFeeling,
    },
    enriched: [],
  };
}

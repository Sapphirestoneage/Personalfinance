// The bill negotiation list (overnight Track H): the bills worth one phone call (phone, internet, TV, insurance, gym,
// from data/negotiable-<year>.json) and every card charging more than the table's rate, each with what it costs now,
// what is typical, a call script, and, once "I called" is answered, the call and the new price. Pure: the reference
// table is passed in.
//
// Morning answer 5 (S-247): until the table is sourced (its `placeholder` flag is false), no bill is compared with a
// typical price: every negotiable bill is listed with its script and "I called", typical and above are null, and the
// bills rank by what they cost a month.
//
// Compatibility: lifeChanges gains entries of kind "called" ({ id, date, kind, path, label, from, to }); older files
// have none.

import { valueOf as v, round2, getAt } from './spine.js';
import { editExpense, editFact } from './edits.js';
import { rateOn } from './debt.js';

const rateWords = (r) => Math.round(r * 10000) / 100 + '%';

// [{ id, kind: 'bill'|'card', label, path, now, typical, above, stake, script, words, called }] most at stake first.
export function negotiationList(spine, cf, ref) {
  if (!ref) return [];
  const calls = (spine.lifeChanges || []).filter((c) => c.kind === 'called');
  const lastCall = (path) => calls.filter((c) => c.path === path).sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
  const out = [];
  for (const i of cf.expenses.items) {
    if (!(i.amount > 0)) continue;
    const kind = ref.kinds.find((k) => new RegExp(k.match, 'i').test(i.label));
    if (!kind) continue;
    const path = 'expenses.' + i.id + '.amount';
    const sourced = ref.placeholder === false;
    out.push({ id: i.id, kind: 'bill', type: kind.id, label: i.label, path, now: i.amount, typical: sourced ? kind.typical : null, above: sourced ? round2(i.amount - kind.typical) : null, words: kind.words, script: kind.script, called: lastCall(path) });
  }
  for (const d of spine.debts || []) {
    const apr = v(d.apr), bal = v(d.balance);
    if (d.type !== 'credit_card' || typeof apr !== 'number' || apr < ref.cardRateAbove || !(bal > 0)) continue;
    const path = 'debts.' + d.id + '.apr';
    const r = rateOn(d, spine.meta.asOf);
    // A card on an intro rate (round 2): the rate to call about is the one after; the words say when it starts.
    out.push({ id: d.id, kind: 'card', type: 'card', label: v(d.name) || d.id, path, now: apr, promo: r.promo ? { rate: r.rate, ends: v(d.promoEnds) } : null, typical: ref.cardRateAbove, above: null, yearCost: round2(bal * apr), words: 'Card rate', script: ref.cardScript.replace('{rate}', rateWords(apr)), called: lastCall(path) });
  }
  // Ranked by dollars a month at stake (round 1, money logic: dollars lost a month): a card's interest a month, a
  // bill's amount above typical; a bill at or under typical last.
  // With no sourced typical price, a bill's stake is what it costs a month.
  for (const x of out) x.stake = x.kind === 'card' ? round2(x.yearCost / 12) : x.above === null ? x.now : Math.max(0, x.above);
  return out.sort((a, b) => b.stake - a.stake || a.label.localeCompare(b.label));
}

// "I called": the new price (a bill's monthly amount, or a card's rate) goes into My numbers as known, and the call is
// kept as a dated life change with what it was before. The same price again records the call and changes nothing.
export function recordCall(spine, row, newValue, today) {
  const was = v(getAt(spine, row.path));
  let s = spine;
  if (newValue !== was) s = row.kind === 'card' ? editFact(s, row.path, 'set', { value: newValue, kind: 'known', today }) : editExpense(s, row.id, { amount: newValue, kind: 'known' }, today);
  const log = [...(s.lifeChanges || [])];
  log.push({ id: 'lc-' + (log.length + 1), date: today, kind: 'called', path: row.path, label: row.label, from: was ?? null, to: newValue });
  return { ...s, lifeChanges: log };
}

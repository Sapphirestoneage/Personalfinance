/* The invisible balance sheet (MR-083): who each goal is really for, and
   what kind of obligation it is. Two tags on the Life plan's goals (forWhom,
   goalKind) group the goal plan by person: a promise to a partner, a wish
   for the kids, something owed to a future self. Pure: reads the goal plan
   the engine already computed; the only arithmetic is the sum of each
   group's targets and of what the plan gives them a month. Nothing here
   writes; the tags are edited in the Goals room like any fact. */

export const WHOM = Object.freeze([
  ['me-now', 'Me, now', 'you, now'], ['me-later', 'Me, later', 'you, later'], ['partner', 'My partner', 'your partner'], ['kids', 'My kids', 'your kids'],
  ['parents', 'My parents', 'your parents'], ['family', 'Family', 'family'], ['friends', 'Friends', 'friends'], ['other', 'Someone else', 'someone else'],
]);
export const KINDS = Object.freeze([
  ['promise', 'A promise I made', 'a promise'], ['expected', 'Expected of me', 'expected'], ['wish', 'Something I want', 'a wish'], ['coming', 'Coming either way', 'coming either way'],
]);
export const UNSORTED = 'unsorted';

export function whomLabel(id, client) { const w = WHOM.find(x => x[0] === id); return w ? (client ? w[2] : w[1]) : (id === UNSORTED ? 'Not yet sorted' : ''); }
export function kindLabel(id, short) { const k = KINDS.find(x => x[0] === id); return k ? (short ? k[2] : k[1]) : ''; }

const pos = c => typeof c === 'number' ? Math.max(0, Math.round(c)) : 0;

/* invisibleSheet(record, result) -> { groups, unsorted, totals, count, sorted }.
   A group: { id, label, items, targetCents, remainingCents, monthlyNow, targetKnown }.
   An item: the goal plan's own life item plus kind, what the plan gives it a month, and when it lands. */
export function invisibleSheet(record, result) {
  const plan = result && result.goalPlan; if (!plan) return null;
  const life = plan.input.items.filter(i => /^life:/.test(i.id));
  const itemOf = i => {
    const g = plan.run && plan.run.goals ? plan.run.goals[i.id] : null; const a = plan.assessment ? plan.assessment[i.id] : null;
    return { id: i.id, rowId: i.rowId, name: i.name, type: i.type, forWhom: i.forWhom || null, goalKind: i.goalKind || null, targetCents: typeof i.targetCents === 'number' ? i.targetCents : null, balanceCents: pos(i.balanceCents), remainingCents: typeof i.targetCents === 'number' ? pos(i.targetCents - pos(i.balanceCents)) : null, targetDate: i.targetDate || null, monthlyNow: g ? pos(g.monthlyNow) : 0, status: a ? a.status : null, finishMonth: a && a.finishMonth ? a.finishMonth : null, needs: i.needs || [] };
  };
  const items = life.map(itemOf);
  const sum = (list, k) => list.reduce((s, x) => s + (typeof x[k] === 'number' ? x[k] : 0), 0);
  const group = (id, list) => ({ id, label: whomLabel(id, false), clientLabel: whomLabel(id, true), items: list, targetCents: sum(list, 'targetCents'), remainingCents: sum(list, 'remainingCents'), monthlyNow: sum(list, 'monthlyNow'), targetKnown: list.every(x => x.targetCents !== null) });
  const groups = WHOM.map(([id]) => group(id, items.filter(x => x.forWhom === id))).filter(g => g.items.length);
  const unsortedItems = items.filter(x => !x.forWhom || !WHOM.some(w => w[0] === x.forWhom));
  const sorted = items.filter(x => WHOM.some(w => w[0] === x.forWhom));
  const forOthers = sorted.filter(x => x.forWhom !== 'me-now' && x.forWhom !== 'me-later');
  const kinds = KINDS.map(([id]) => ({ id, label: kindLabel(id), count: items.filter(x => x.goalKind === id).length })).filter(k => k.count);
  return {
    groups, unsorted: unsortedItems.length ? group(UNSORTED, unsortedItems) : null, kinds,
    totals: { targetCents: sum(sorted, 'targetCents'), remainingCents: sum(sorted, 'remainingCents'), monthlyNow: sum(sorted, 'monthlyNow'), forOthersCents: sum(forOthers, 'targetCents'), forOthersMonthly: sum(forOthers, 'monthlyNow'), surplusMonthly: plan.surplusKnown ? plan.input.surplusMonthly : null },
    count: items.length, sorted: sorted.length, people: groups.length,
  };
}

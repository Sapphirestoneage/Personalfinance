// The step map (Batch 8, S-278): what each Session step and My numbers section is for, what it needs (each a live
// checkmark), what the client has once it is in ("You now have ...") and what it opens next ("Next this unlocks ...").
// Pure: spine and the summary in, words and true / false out. Ids match the Session steps and the My numbers slugs.

import { valueOf as v } from './spine.js';

const known = (f) => !!f && f.kind !== 'missing' && f.kind !== 'notForMe' && f.value !== null && f.value !== undefined;
const all = (list, test) => list.length > 0 && list.every(test);

// unlocks: the next step in Guide me's order (Needs, Debt, Income, Assets, Goals, Protection, then End call).
export const STEP_MAP = {
  debt: { purpose: 'Everything owed, so the plan knows what to pay first and what it costs.', have: 'the total owed and the payoff order', unlocks: ['income', 'take-home pay'] },
  assets: { purpose: 'What you own and where it sits, so we know your cushion and what can be reached.', have: 'net worth and your cash runway', unlocks: ['goals', 'your FI date'] },
  taxes: { purpose: 'How you file and where you live, so take-home and the tax bill are right.', have: 'the tax due at tax time', unlocks: ['income', 'take-home pay'] },
  income: { purpose: 'Every paycheck and other money in, before tax.', have: 'take-home a month', unlocks: ['assets', 'net worth'] },
  needs: { purpose: 'What a month costs: bills, food, getting around.', have: 'what is left a month and the savings rate', unlocks: ['debt', 'the total owed'] },
  goals: { purpose: 'What the money is for, with an amount and a date.', have: 'years to FI and the plan\'s steps', unlocks: ['protection', 'the protection checks'] },
  protection: { purpose: 'Insurance that keeps one bad event from undoing the plan.', have: 'the protection checks on the Plan', unlocks: ['end', 'the one-pager'] }
};

// The checkmarks: [{ words, done }]. Each reads the household as it is now.
export function stepChecks(spine, s, id) {
  const debts = spine.debts || [], accts = spine.accounts || [], inc = spine.income || [], exp = spine.expenses || [];
  const hh = spine.household || {};
  if (id === 'debt') return [
    { words: 'Every debt listed (or none)', done: debts.length > 0 },
    { words: 'A balance on each', done: all(debts, (d) => known(d.balance)) },
    { words: 'A rate on each', done: all(debts, (d) => known(d.apr)) },
    { words: 'A monthly payment on each', done: all(debts, (d) => known(d.minimum)) }];
  if (id === 'assets') return [
    { words: 'Checking and savings', done: accts.some((a) => a.family === 'cash') },
    { words: 'A balance on each account', done: all(accts, (a) => known(a.balance)) },
    { words: 'Retirement accounts, if any', done: accts.some((a) => ['employerRetirement', 'ira'].includes(a.family)) }];
  if (id === 'taxes') return [
    { words: 'How you file', done: known(hh.filingStatus) },
    { words: 'Where you live', done: known(hh.state) }];
  if (id === 'income') return [
    { words: 'Every paycheck or money in', done: inc.length > 0 },
    { words: 'An amount on each', done: all(inc, (x) => known(x.amount)) },
    { words: 'How often each comes', done: all(inc, (x) => !!x.cadence) }];
  if (id === 'needs') return [
    { words: 'Housing', done: exp.some((e) => e.fat === 'accommodation' && known(e.amount)) },
    { words: 'Food', done: exp.some((e) => e.fat === 'food' && known(e.amount)) },
    { words: 'An amount on every bill', done: all(exp, (e) => known(e.amount)) }];
  if (id === 'goals') return [
    { words: 'Yearly spending for FI', done: (spine.goals || []).some((g) => g.type === 'fi' && known(g.annualSpending)) },
    { words: 'A goal with an amount and a date', done: (spine.goals || []).some((g) => g.type !== 'fi' && known(g.target) && !!(g.by || g.targetDate)) }];
  if (id === 'protection') return [
    { words: 'Health coverage', done: (hh.healthCoverage || []).length > 0 },
    { words: 'Any policies listed', done: (spine.policies || []).length > 0 },
    { words: 'A premium on each', done: all(spine.policies || [], (p) => known(p.premium)) }];
  return [];
}

/* Life plan: goals in date order, promoted events, retirement multipliers and age,
   plus the FI facts: part-time income at FI, dream FI age, dream and gut spending. */
import { fieldQ, num, val } from './common.js';
import { U } from '../units.js';

export function run(ctx) {
  const { rows, asm } = ctx;
  const goals = rows.filter(r => r.type === 'goal').map(r => {
    const cost = fieldQ(r, 'goalCost', U.oneoff, asm);
    return { id: r.id, name: r.nickname, cents: cost ? cost.cents : null, costQ: cost, targetDate: val(r, 'targetDate'), priority: val(r, 'priority') || '2', notesShared: r.notesShared };
  }).sort((a, b) => (a.targetDate || '9999') < (b.targetDate || '9999') ? -1 : 1);
  const ret = rows.find(r => r.type === 'retirement');
  const retirementAge = ret ? num(ret, 'retirementAge') : null;
  const mult = {
    gogo: ret && num(ret, 'gogo') !== null ? num(ret, 'gogo') : asm.gogo,
    slowgo: ret && num(ret, 'slowgo') !== null ? num(ret, 'slowgo') : asm.slowgo,
    nogo: ret && num(ret, 'nogo') !== null ? num(ret, 'nogo') : asm.nogo,
  };
  const events = (ctx.record.scenarios || []).filter(s => s.promoted).map(s => ({ id: s.id, type: s.type, name: s.name, startYear: s.startYear, cents: s.cents }));
  /* Level 9 (MR-040) and the Level 8 stand-ins: all optional, null when not typed */
  const baristaIncomeMonthly = ret ? fieldQ(ret, 'baristaIncome', U.monthlyAfter, asm) : null;
  const dreamFiAge = ret ? num(ret, 'dreamFiAge') : null;
  const dreamSpendingMonthly = ret ? fieldQ(ret, 'dreamSpending', U.monthlyAfter, asm) : null;
  const gutSpendingMonthly = ret ? fieldQ(ret, 'gutSpending', U.monthlyAfter, asm) : null;
  return { outputs: { goals, events, retirementMultipliers: mult, retirementAge, baristaIncomeMonthly, dreamFiAge, dreamSpendingMonthly, gutSpendingMonthly }, enriched: [] };
}

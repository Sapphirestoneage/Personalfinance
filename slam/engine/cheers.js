// Celebrations, warm but calm (Part 7, S-286): the real milestones a change can reach, each as one line ("Visa: paid
// off"). Only these four: a debt paid off, a goal reached, a cushion step reached, a new headline number unlocked
// (one of the strip's four going from "Not yet" to a number). Pure: reached(before, after) compares two households
// (and their summaries, passed in when the screen already has them) and returns the lines; the shell shows them.

import { summarize } from './summary.js';
import { goalsView } from './plan.js';
import { valueOf as v } from './spine.js';

const nameOf = (x) => v(x.name) || x.label || x.id;
const STRIP = [['netWorth', (s) => s.sheet.netWorth.value, 'Net worth'], ['surplus', (s) => s.cashflow.monthlySurplus.value, 'What is left a month'], ['savingsRate', (s) => s.cashflow.savingsRate.net.value, 'Savings rate'], ['fi', (s) => s.fi.yearsToFi.value, 'The FI date']];

// [{ id, words }], in the order found; empty when nothing was reached.
export function reached(before, after, rules, { sBefore = null, sAfter = null } = {}) {
  if (!before || !after || before === after) return [];
  const out = [];
  // A debt paid off: a balance above zero that is zero now (the debt still listed).
  for (const d of after.debts || []) {
    const was = (before.debts || []).find((x) => x.id === d.id);
    if (was && (v(was.balance) ?? 0) > 0 && v(d.balance) === 0) out.push({ id: 'paid:' + d.id, words: nameOf(d) + ': paid off' });
  }
  let a = sAfter, b = sBefore;
  const summaryOf = (spine, have) => have || summarize(spine, rules, { flags: false });
  try {
    a = summaryOf(after, a); b = summaryOf(before, b);
    // A goal reached: a target with money still to go that is fully there now.
    const goalsB = goalsView(before, rules, b).rows, goalsA = goalsView(after, rules, a).rows;
    for (const g of goalsA) { const was = goalsB.find((x) => x.id === g.id); if (was && was.toGo > 0 && g.toGo === 0 && g.target !== null) out.push({ id: 'goal:' + g.id, words: g.label + ': reached' }); }
    // A cushion step reached.
    (a.emergency.cushion || []).forEach((c, i) => { const was = (b.emergency.cushion || [])[i]; if (was && was.reached === false && c.reached === true) out.push({ id: 'cushion:' + c.id, words: 'Cushion: ' + c.label.toLowerCase() + ' reached' }); });
    // A headline number unlocked.
    for (const [id, read, label] of STRIP) if (read(b) === null && read(a) !== null) out.push({ id: 'unlocked:' + id, words: label + ': unlocked' });
  } catch { /* a household the engines cannot read yet: the debt lines alone */ }
  return out;
}

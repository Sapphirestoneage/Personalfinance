// Their money in words, and what moves it (S-286). Pure: every number comes from engine/summary.js.
//   moneySentence(spine, s)            one sentence for the top of Home, "about" when it rests on guesses
//   homeLevers(spine)                  the three sliders on Home: rent, saved a month, pay (each null when not there)
//   pullLevers(spine, levers, values)  the household with the sliders' values, for a live preview or for Keep this
//   milestones(before, after, spine)   the real milestones a change just reached, in one short line each
//   fiMovers(start, now, rules)        the changes since the call started that moved the FI date most

import { setAt, valueOf as v, listFacts, round2 } from './spine.js';
import { summarize } from './summary.js';
import { putFact } from './edits.js';

const dollars = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');
const rough = (r) => !!r && (r.kind === 'rough' || (Array.isArray(r.rough) && r.rough.length > 0));
const val = (r) => (r && typeof r === 'object' ? r.value : r ?? null);

export function moneySentence(spine, s) {
  const left = s.cashflow.monthlySurplus, rate = s.cashflow.savingsRate.net, years = s.fi.yearsToFi;
  if (val(left) === null) return null;
  const about = [left, rate, years].some(rough) ? 'about ' : '';
  const year = val(years) === null ? null : +spine.meta.asOf.slice(0, 4) + Math.round(val(years));
  const parts = [val(left) >= 0 ? 'You keep ' + about + dollars(val(left)) + ' a month after bills and debt payments' : 'You spend ' + about + dollars(val(left)) + ' a month more than comes in'];
  if (val(rate) !== null && val(rate) > 0) parts.push('you save ' + about + Math.round(val(rate) * 100) + '% of your pay');
  parts.push(year === null ? 'at this pace work does not stop on its own yet' : 'at this pace you could stop working ' + (about ? 'about ' : 'in ') + year);
  return parts.slice(0, -1).join(', ') + (parts.length > 1 ? ', and ' : '') + parts.at(-1) + '.';
}

// The sliders: the rent (or mortgage) line, the biggest monthly contribution, the biggest paycheck.
export function homeLevers(spine) {
  const rent = (spine.expenses || []).find((e) => /\b(rent|mortgage)\b/i.test(e.label) && typeof v(e.amount) === 'number');
  const saver = (spine.accounts || []).filter((a) => typeof v(a.monthlyContribution) === 'number').sort((a, b) => v(b.monthlyContribution) - v(a.monthlyContribution))[0];
  const pay = (spine.income || []).filter((i) => typeof v(i.amount) === 'number' && v(i.amount) > 0).sort((a, b) => v(b.amount) - v(a.amount))[0];
  const lever = (id, label, path, now, min, max, step) => ({ id, label, path, now, min, max, step });
  const top = (x) => Math.max(100, Math.ceil(x / 100) * 100);
  return [
    rent ? lever('rent', rent.label + ' a month', 'expenses.' + rent.id + '.amount', v(rent.amount), 0, top(v(rent.amount) * 2), 25) : null,
    saver ? lever('saved', 'Saved a month', 'accounts.' + saver.id + '.monthlyContribution', v(saver.monthlyContribution), 0, top(v(saver.monthlyContribution) * 3 + 500), 25) : null,
    pay ? lever('pay', pay.label + (pay.cadence === 'monthly' ? ' a month' : ' a paycheck'), 'income.' + pay.id + '.amount', v(pay.amount), 0, top(v(pay.amount) * 2), pay.cadence === 'monthly' ? 50 : 25) : null
  ].filter(Boolean);
}
export function pullLevers(spine, levers, values, today, kind = 'rough') {
  let s = spine;
  for (const l of levers) if (values[l.id] !== undefined && values[l.id] !== l.now) s = putFact(s, l.path, round2(values[l.id]), kind, today);
  return s;
}

// Real milestones only: a debt paid off, net worth above zero, the cushion full, saving a fifth of pay, FI a whole
// year sooner. before and after are summaries; the spine names the debts.
export function milestones(before, after, beforeSpine, afterSpine) {
  const out = [];
  for (const d of afterSpine.debts || []) {
    const was = (beforeSpine.debts || []).find((x) => x.id === d.id);
    if (was && typeof v(was.balance) === 'number' && v(was.balance) > 0 && v(d.balance) === 0) out.push((v(d.name) || d.label || 'That debt') + ' is paid off.');
  }
  const crossed = (a, b, at) => typeof a === 'number' && typeof b === 'number' && a < at && b >= at;
  if (crossed(val(before.sheet.netWorth), val(after.sheet.netWorth), 0)) out.push('Your net worth is above zero.');
  if (typeof val(before.emergency.gap) === 'number' && val(before.emergency.gap) > 0 && val(after.emergency.gap) === 0) out.push('Your cushion is full.');
  if (crossed(val(before.cashflow.savingsRate.net), val(after.cashflow.savingsRate.net), 0.2)) out.push('You save a fifth of your pay.');
  const y0 = val(before.fi.yearsToFi), y1 = val(after.fi.yearsToFi);
  if (typeof y0 === 'number' && typeof y1 === 'number' && Math.floor(y0) - Math.floor(y1) >= 1) out.push('Free to stop working about ' + (Math.round(y0 - y1) || 1) + (Math.round(y0 - y1) > 1 ? ' years' : ' year') + ' sooner.');
  return out;
}

// What moved the FI date since the call started: each changed number (or added or removed item) put back alone, and
// how much sooner or later FI would be without it. The biggest three first. At most 30 changes are weighed.
export function fiMovers(start, now, rules, max = 3) {
  const years = (sp) => val(summarize(sp, rules, { flags: false }).fi.yearsToFi);
  const yNow = years(now), yStart = years(start);
  const was = new Map(listFacts(start).map((x) => [x.path, x.fact]));
  const items = (sp) => new Set(['accounts', 'debts', 'expenses', 'income', 'goals'].flatMap((c) => (sp[c] || []).map((x) => c + '.' + x.id)));
  const startItems = items(start), nowItems = items(now);
  const changes = [];
  for (const { path, fact } of listFacts(now)) {
    const item = path.split('.').slice(0, 2).join('.');
    if (!startItems.has(item) && nowItems.has(item) && /^(accounts|debts|expenses|income|goals)\./.test(path)) continue;
    const f0 = was.get(path);
    if (!f0 || f0.value === fact.value || typeof fact.value !== 'number') continue;
    changes.push({ path, from: f0.value, to: fact.value, undo: (sp) => setAt(sp, path, f0) });
  }
  for (const item of nowItems) if (!startItems.has(item)) changes.push({ path: item, added: true, undo: (sp) => { const [c, id] = item.split('.'); return { ...sp, [c]: sp[c].filter((x) => x.id !== id) }; } });
  const weighed = changes.slice(0, 30).map((c) => {
    const y = yNow === null ? null : years(c.undo(now));
    return { ...c, years: y === null || yNow === null ? null : round2(y - yNow) };
  }).filter((c) => c.years !== null && Math.abs(c.years) >= 0.05);
  weighed.sort((a, b) => Math.abs(b.years) - Math.abs(a.years));
  return { yearsNow: yNow, yearsStart: yStart, movers: weighed.slice(0, max) };
}

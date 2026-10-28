// A paycheck in the first pass (owner's ask, 2026-10-28): typed as take-home with the gross solved for it, or typed
// before tax with the withholding estimated from the tax tables, as if the paycheck were the household's only income
// (the way a W-4 withholds). Both the solved gross and the estimated withholding read rough until a paystub says.
// Pure; the count-first Income rows (ui/items.js) and onboarding read it.

import { getAt, setAt, valueOf as v, fact, round2 } from './spine.js';
import { PER_YEAR } from './schema.js';
import { putFact, editIncome } from './edits.js';
import { taxInputs, computeTax } from './tax.js';
import { money } from '../src/ui/format.js';

const SOURCE = 'onboarding';
const stamp = (today) => ({ asOf: today, source: SOURCE });

// Pay with tax taken out of it (W-2, tips) also pays FICA; other taxed income has tax taken out but no FICA.
const FICA_TYPES = ['w2', 'tips'];
const WITHHELD = ['w2', 'tips', 'other', 'pension', 'rental'];
export const hasBasisChoice = (s) => WITHHELD.includes(s.type);
// FICA on one paycheck: Social Security up to the wage base spread over the year's paychecks, Medicare on all of it.
export function ficaOn(gross, cadence, rules, year) {
  const per = PER_YEAR[cadence] || 12;
  return round2(Math.min(gross, rules.get('SS_WAGE', year) / per) * rules.get('FICA_SS_RATE', year) + gross * rules.get('FICA_MED_RATE', year));
}
// What an employer would take out of one paycheck at this gross, as if this were the household's only income (the
// way a W-4 withholds): the year's federal and state income tax on it, spread over the paychecks. null when the tax
// cannot be figured (no filing status yet). Pay with nothing taken out reads 0, not estimated.
export function withholdingFor(spine, rules, id, gross) {
  const s = (spine.income || []).find((x) => x.id === id);
  if (!s) throw new Error('No income ' + id);
  if (!WITHHELD.includes(s.type)) return { federal: 0, state: 0, estimated: false };
  const asOf = spine.meta.asOf, year = +asOf.slice(0, 4);
  const alone = { ...spine, income: spine.income.map((x) => (x.id === id ? { ...x, amount: fact(gross, { kind: 'known', asOf, source: SOURCE }) } : { ...x, amount: fact(0, { kind: 'known', asOf, source: SOURCE }) })), taxYears: [] };
  const { inputs } = taxInputs(alone, rules, year);
  if (!inputs.filingStatus) return null;
  const lines = computeTax(inputs, rules, year).lines;
  const per = PER_YEAR[s.cadence] || 12;
  const yearly = lines.grossIncome.value || 0;
  // The paycheck's share of the year's tax: a line that runs part of the year still withholds at the full-year rate.
  const share = yearly > 0 ? gross / (yearly / per) : 0;
  const fed = round2(Math.max(0, (lines.federalIncomeTax.value || 0) / per * share));
  const st = lines.stateTax.value === null ? null : round2(Math.max(0, lines.stateTax.value / per * share));
  return { federal: fed, state: st ?? 0, stateUnknown: st === null, estimated: true };
}
// One paycheck after what is taken out: gross less the withholding on file less FICA. null without a gross.
export function takeHomeOf(spine, rules, id) {
  const s = (spine.income || []).find((x) => x.id === id);
  const g = s ? v(s.amount) : null;
  if (g === null) return null;
  const year = +spine.meta.asOf.slice(0, 4);
  const w = s.withholding || {};
  return round2(g - (v(w.federal) ?? 0) - (v(w.state) ?? 0) - (FICA_TYPES.includes(s.type) ? ficaOn(g, s.cadence, rules, year) : 0));
}
// The gross that leaves this take-home after the estimated withholding and FICA, to the cent.
export function grossFromTakeHome(spine, rules, id, takeHome) {
  const s = (spine.income || []).find((x) => x.id === id);
  if (!s) throw new Error('No income ' + id);
  const year = +spine.meta.asOf.slice(0, 4);
  const fica = (g) => (FICA_TYPES.includes(s.type) ? ficaOn(g, s.cadence, rules, year) : 0);
  let g = takeHome / 0.75;
  for (let i = 0; i < 40; i++) {
    const w = withholdingFor(spine, rules, id, g) || { federal: 0, state: 0 };
    const next = takeHome + w.federal + w.state + fica(g);
    if (Math.abs(next - g) < 0.001) { g = next; break; }
    g = next;
  }
  g = round2(g);
  const w = withholdingFor(spine, rules, id, g) || { federal: 0, state: 0, estimated: false };
  // The cent of rounding lands on the federal withholding, which is a guess anyway, so the take-home reads as typed.
  const diff = round2(g - w.federal - w.state - fica(g) - takeHome);
  return { gross: g, federal: round2(w.federal + diff), state: w.state, estimated: w.estimated, stateUnknown: !!w.stateUnknown };
}
const OFTEN_WORDS = { weekly: 'a week', biweekly: 'every 2 weeks', semimonthly: 'twice a month', monthly: 'a month', quarterly: 'a quarter', yearly: 'a year' };
// The first-pass answer on an income line: how often, and the amount as gross (before tax) or as take-home, the
// app solving for the other. kind: known or rough (rough keeps the number and flags it); amount null clears it, and
// with kind notForMe marks it does not apply. The withholding lands beside it as a guess until a paystub says.
export function setIncomeFirstPass(spine, rules, id, { amount, basis = 'gross', cadence, kind = 'known' }, today) {
  const s0 = (spine.income || []).find((x) => x.id === id);
  if (!s0) throw new Error('No income ' + id);
  let s = spine;
  const base = 'income.' + id;
  if (cadence && cadence !== s0.cadence) s = editIncome(s, id, { amount: v(s0.amount), cadence, kind: s0.amount.kind === 'rough' ? 'rough' : 'known' }, today);
  if (amount === undefined) return s;
  const cur = getAt(s, base);
  if (amount === null) {
    s = editIncome(s, id, { amount: null, cadence: cur.cadence }, today);
    if (kind === 'notForMe') s = putFact(s, base + '.amount', null, 'notForMe', today);
    return s;
  }
  const W = (value, estimated) => ({ value, kind: estimated ? 'rough' : 'known', ...stamp(today), ...(estimated ? { note: 'estimated from the tax tables; a paystub has the real number' } : {}) });
  if (basis === 'takeHome') {
    const r = grossFromTakeHome(s, rules, id, amount);
    s = editIncome(s, id, { amount: r.gross, cadence: cur.cadence, kind: 'rough' }, today);
    s = setAt(s, base + '.amount', { ...getAt(s, base + '.amount'), source: SOURCE, note: 'figured from take-home of ' + money(amount) + ' ' + (OFTEN_WORDS[cur.cadence] || '') });
    s = setAt(s, base + '.withholding', { federal: W(r.federal, r.estimated), state: W(r.state, r.estimated) });
    return s;
  }
  s = editIncome(s, id, { amount, cadence: cur.cadence, kind: kind === 'rough' ? 'rough' : 'known' }, today);
  const w = withholdingFor(s, rules, id, amount);
  if (w) s = setAt(s, base + '.withholding', { federal: W(w.federal, w.estimated), state: W(w.state, w.estimated) });
  return s;
}


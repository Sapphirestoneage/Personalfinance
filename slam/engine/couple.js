// Couples on screen (Batch 7, S-277). The engine's couple rules stay as they are (per-person pay, joint filing, payroll
// saving from the owner's pay, the couple's IRA limits; S-211 to S-216). This adds what the screens need: a partner,
// whose each item is, how shared bills split between the two, and each person's own numbers. The split never changes
// the household's numbers; it only divides them for "each person's own".
//
// Compatibility: household.coupleSplit and an expense's coupleSplit ('half' | 'income' | 'me' | 'partner') are new and
// optional; with none, a shared bill splits half each, as before.

import { valueOf as v, round2, accountOwner, incomeOwner, setAt } from './spine.js';
import { putFact } from './edits.js';
import { answersOf, ans, applyAnswer } from './profile.js';
import { payrollShares } from './cashflow.js';

export const isCouple = (spine) => ((spine.household && spine.household.people) || []).length >= 2;
export const peopleOf = (spine) => (spine.household && spine.household.people) || [];
export const FILINGS = [['mfj', 'Married filing jointly'], ['mfs', 'Married filing separately'], ['single', 'Not married (each files on their own)']];
export const SPLITS = [['half', 'Half each'], ['income', 'By take-home'], ['me', 'One pays: first'], ['partner', 'One pays: second']];
export const STYLES = { joint: { whose: 'joint', split: 'half' }, separate: { whose: 'me', split: 'income' }, mixed: { whose: 'joint', split: 'half' } };

// Adds the partner (one change): a second person, the filing status, and "lives with a partner" on the Profile.
export function addPartner(spine, { name, birthDate = null, filing = 'mfj' }, today) {
  if (isCouple(spine)) return spine;
  const nm = String(name || '').trim() || 'Partner';
  const id = nm.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'partner';
  const F = (value, kind) => ({ value, kind, asOf: today, source: 'ledger' });
  let s = { ...spine, household: { ...spine.household, people: [...peopleOf(spine), { id: peopleOf(spine).some((p) => p.id === id) ? id + '-2' : id, name: nm, birthDate: birthDate ? F(birthDate, 'known') : F(null, 'missing') }] } };
  s = putFact(s, 'household.filingStatus', filing === 'single' ? 'single' : filing, 'known', today);
  const lw = ans(answersOf(s), 'livesWith');
  const list = Array.isArray(lw) ? lw.filter((x) => x !== 'alone') : [];
  return list.includes('partner') ? s : applyAnswer(s, 'livesWith', [...list, 'partner'], { today, by: 'coach' });
}

// Whose an item is: 'me' | 'partner' | 'joint' (income is never joint).
export function whoseOf(spine, coll, x) {
  const ps = peopleOf(spine);
  if (coll === 'income') return incomeOwner(spine, x) === (ps[1] || {}).id ? 'partner' : 'me';
  const o = x.owner ? v(x.owner) : null;
  if (o === 'joint') return 'joint';
  return accountOwner(spine, x) === ps[1] ? 'partner' : 'me';
}
export function setWhose(spine, coll, id, who, today) {
  const ps = peopleOf(spine);
  if (coll === 'income') return setAt(spine, 'income.' + id + '.personId', who === 'partner' && ps[1] ? ps[1].id : ps[0].id);
  return putFact(spine, coll + '.' + id + '.owner', who === 'joint' ? 'joint' : who === 'partner' ? 'partner' : 'me', 'known', today);
}
// The money style (the Profile's one question) sets the first whose and split; never the math.
export const styleOf = (spine) => STYLES[ans(answersOf(spine), 'moneyStyle')] || null;
export const splitOf = (spine, e) => (e && e.coupleSplit ? v(e.coupleSplit) : null) || (spine.household.coupleSplit ? v(spine.household.coupleSplit) : null) || (styleOf(spine) || {}).split || 'half';

// Each person's own numbers: their income and take-home, their accounts (and half of joint ones) less their debts (and
// half of joint ones), their share of spending and minimums, and what is left. which: 0 or 1. Formatting reads these.
export function personView(spine, s, which) {
  const ps = peopleOf(spine), me = ps[which];
  if (!me) return null;
  const mine = (o) => (which === 0 ? o === 'me' : o === 'partner') ? 1 : o === 'joint' ? 0.5 : 0;
  const streams = s.cashflow.income.streams.filter((x) => x.included !== false);
  const ownerOfStream = (st) => { const line = (spine.income || []).find((x) => x.id === st.id); return line && incomeOwner(spine, line) === me.id; };
  const gross = round2(streams.filter(ownerOfStream).reduce((a, x) => a + (x.gross || 0), 0));
  // Each paycheck's take-home less the saving that comes out of it, so the two add up to the household's take-home.
  const saved = payrollShares(spine, s.cashflow);
  const takeHomes = ps.map((p) => streams.filter((st) => { const line = (spine.income || []).find((x) => x.id === st.id); return line && incomeOwner(spine, line) === p.id; }).reduce((a, x) => a + (x.takeHome || 0) - (saved[x.id] || 0), 0));
  const totalTH = takeHomes.reduce((a, x) => a + x, 0), myTH = round2(takeHomes[which] || 0);
  const shareOf = (split) => (split === 'half' ? 0.5 : split === 'income' ? (totalTH > 0 ? takeHomes[which] / totalTH : 0.5) : split === (which === 0 ? 'me' : 'partner') ? 1 : 0);
  let spending = 0;
  for (const it of s.cashflow.expenses.items) { const e = (spine.expenses || []).find((x) => x.id === it.id); spending += (it.amount || 0) * shareOf(splitOf(spine, e)); }
  let minimums = 0;
  for (const m of s.cashflow.debtMinimums.items || []) { const d = (spine.debts || []).find((x) => x.id === m.id); minimums += (m.amount || 0) * (d ? mine(whoseOf(spine, 'debts', d)) : 0.5); }
  const assets = (spine.accounts || []).reduce((a, x) => a + (v(x.balance) || 0) * mine(whoseOf(spine, 'accounts', x)), 0);
  const debts = (spine.debts || []).reduce((a, x) => a + (v(x.balance) || 0) * mine(whoseOf(spine, 'debts', x)), 0);
  return { id: me.id, name: me.name, gross, takeHome: myTH, spending: round2(spending), minimums: round2(minimums), left: round2(myTH - spending - minimums), assets: round2(assets), debts: round2(debts), netWorth: round2(assets - debts) };
}
// Yours, theirs and joint, for the one-pager: net worth, retirement accounts, debts.
export function splitTotals(spine) {
  const out = { me: { netWorth: 0, retirement: 0, debts: 0 }, partner: { netWorth: 0, retirement: 0, debts: 0 }, joint: { netWorth: 0, retirement: 0, debts: 0 } };
  for (const a of spine.accounts || []) { const w = whoseOf(spine, 'accounts', a), b = v(a.balance) || 0; out[w].netWorth += b; if (['employerRetirement', 'ira'].includes(a.family)) out[w].retirement += b; }
  for (const d of spine.debts || []) { const w = whoseOf(spine, 'debts', d), b = v(d.balance) || 0; out[w].netWorth -= b; out[w].debts += b; }
  for (const k of Object.keys(out)) for (const f of Object.keys(out[k])) out[k][f] = round2(out[k][f]);
  return out;
}

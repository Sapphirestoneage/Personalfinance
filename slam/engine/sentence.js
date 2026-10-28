// Their money in one sentence (Part 7, S-286): one plain sentence about where the household stands, from the engines'
// real numbers: what is kept a month (the strip's Left a month), when the debt is gone (the Plan's own payoff,
// planPayoff) and when work can stop (the FI projection). It says "about" before any part that rests on a guess.
// Pure: sentencePieces reads the household; sentenceWords turns the pieces into the sentence with the caller's money
// format, so Home, the sliders' preview and the tests all read the same sentence.

import { summarize } from './summary.js';
import { planPayoff } from './plan.js';
import { ageOn, valueOf as v } from './spine.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// "June" this year, "June 2027" another year: easy to hold (S-283).
export const monthWords = (ym, asOf) => MONTHS[+ym.slice(5, 7) - 1] + (ym.slice(0, 4) === asOf.slice(0, 4) ? '' : ' ' + ym.slice(0, 4));
const isRough = (r) => !!r && (r.kind === 'rough' || r.kind === 'incomplete' || (Array.isArray(r.rough) && r.rough.length > 0));
const roughFact = (f) => !!f && f.kind === 'rough';

// The three pieces: { empty, about, keep: { value, rough }, debt: { kind, ym, rough }, fi: { kind, years, age, year, rough } }.
// debt.kind: cards (every debt is a card), hi (high-rate debt gone first), all (debt-free), never (not shrinking).
// fi.kind: on (a date), there (invested money already covers it), notYet (the projection never gets there).
export function sentencePieces(spine, rules, s = summarize(spine, rules, { flags: false }), payoff = null) {
  const cf = s.cashflow, asOf = s.asOf;
  const hasIncome = (spine.income || []).some((x) => v(x.amount) !== null), hasBills = (spine.expenses || []).some((e) => v(e.amount) !== null);
  if (!hasIncome && !hasBills) return { empty: true, about: false, keep: null, debt: null, fi: null };
  const keep = cf.monthlySurplus.value === null ? null : { value: cf.monthlySurplus.value, rough: isRough(cf.monthlySurplus) };
  const owing = (spine.debts || []).filter((d) => (v(d.balance) ?? 0) > 0);
  let debt = null;
  if (owing.length) {
    const p = payoff || planPayoff(spine, rules, s);
    const rough = owing.some((d) => roughFact(d.balance) || roughFact(d.apr) || roughFact(d.minimum));
    const cardsOnly = owing.every((d) => d.type === 'credit_card');
    if (p.none) debt = null;
    else if (cardsOnly && p.allYm) debt = { kind: 'cards', ym: p.allYm, rough };
    else if (p.hasHi && p.hiYm) debt = { kind: 'hi', ym: p.hiYm, rough };
    else if (p.allYm) debt = { kind: 'all', ym: p.allYm, rough };
    else debt = { kind: 'never', ym: null, rough };
  }
  const years = s.fi.yearsToFi.value;
  const person = ((spine.household && spine.household.people) || [])[0] || {};
  const birth = v(person.birthDate);
  let fi;
  if (years === null) fi = { kind: 'notYet', years: null, age: null, year: null, rough: false };
  else if (years === 0) fi = { kind: 'there', years: 0, age: null, year: +asOf.slice(0, 4), rough: isRough(s.fi.yearsToFi) };
  else fi = { kind: 'on', years, age: birth ? Math.round(ageOn(birth, asOf) + years) : null, year: +asOf.slice(0, 4) + Math.round(years), rough: isRough(s.fi.yearsToFi) };
  const about = !!((keep && keep.rough) || (debt && debt.rough) || fi.rough);
  return { empty: false, about, keep, debt, fi, asOf };
}

// The sentence. money(x) formats a dollar amount ("$686").
export function sentenceWords(p, money) {
  if (!p || p.empty) return 'Add a paycheck and a bill, and this sentence writes itself.';
  const about = (rough) => (rough ? 'about ' : '');
  const parts = [];
  if (p.keep) parts.push(p.keep.value >= 0 ? 'you keep ' + about(p.keep.rough) + money(p.keep.value) + ' a month' : 'you are short ' + about(p.keep.rough) + money(-p.keep.value) + ' a month');
  if (p.debt) {
    const by = p.debt.ym ? ' by ' + about(p.debt.rough) + monthWords(p.debt.ym, p.asOf) : '';
    parts.push(p.debt.kind === 'cards' ? 'your cards are gone' + by : p.debt.kind === 'hi' ? 'your high-rate debt is gone' + by : p.debt.kind === 'all' ? 'you are debt-free' + by : 'your debt is not shrinking at this pace');
  }
  if (p.fi) {
    if (p.fi.kind === 'there') parts.push('you could stop working now');
    else if (p.fi.kind === 'notYet') parts.push('stopping work is out of reach at today\'s pace');
    else parts.push('you are on track to stop working ' + (p.fi.age !== null ? 'at ' + about(p.fi.rough) + p.fi.age : 'in ' + about(p.fi.rough) + p.fi.year));
  }
  if (!parts.length) return 'Add a paycheck and a bill, and this sentence writes itself.';
  const text = parts.length === 1 ? parts[0] : parts.length === 2 ? parts[0] + ', and ' + parts[1] : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

export const moneySentence = (spine, rules, money, s) => sentenceWords(sentencePieces(spine, rules, s), money);

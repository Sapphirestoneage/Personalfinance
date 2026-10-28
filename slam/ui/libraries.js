// The picker's libraries (S-284), fetched once (offline or missing: the picker offers what is typed and the client's
// own, nothing breaks), and the entries each kind of field picks from.

import { cardEntries, fundEntries, institutionEntries, placeEntries } from '../engine/library.js';
import { planFor, knownEmployers } from './employer-plans.js';

const get = async (name) => { try { const r = await fetch(new URL('../data/' + name, import.meta.url), { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } };
export const LIB = { cards: null, funds: null, institutions: null, places: null, presets: null };
[LIB.cards, LIB.funds, LIB.institutions, LIB.places, LIB.presets] = await Promise.all(['library-cards-2026.json', 'library-funds-2026.json', 'library-institutions-2026.json', 'library-places-2026.json', 'session-presets.json'].map(get));

const mine = (list) => list.filter(Boolean).map((words) => ({ words, from: 'mine' }));
const nameOf = (x) => (x && x.name && typeof x.name === 'object' ? x.name.value : x && x.name) || (x && x.label) || null;
// Bills and subscriptions people have (Needs): their group, need or want, a subscription mark and a typical amount.
export function expenseEntries(spine) {
  const p = LIB.presets, typical = p && p.typical && p.typical.elsewhere ? p.typical.elsewhere.amounts : {};
  const out = [];
  for (const cat of (p && p.needs) || []) for (const it of cat.items) for (const x of [it, ...(it.subs || [])]) out.push({ words: x.label, aliases: x.key ? [x.key.replace(/-/g, ' ')] : [], hint: (x.need === false ? 'a want' : 'a need') + (typical[x.key] ? ', about $' + typical[x.key] + ' a month' : ''), from: 'library', value: { fat: cat.fat || null, need: x.need !== false, subscription: !!x.subscription, amount: typical[x.key] ?? null } });
  return [...mine((spine.expenses || []).map((e) => e.label)), ...out];
}
export const GOALS = [['Emergency fund', 'savings', ['cushion', 'rainy day']], ['Pay off my cards', 'payoff', ['credit cards', 'debt']], ['Pay off student loans', 'payoff', ['student loans']], ['Financial independence', 'fi', ['fi', 'retire', 'retirement', 'stop working']], ['House down payment', 'savings', ['house', 'home']], ['New car', 'savings', ['car']], ['Wedding', 'savings', []], ['Travel', 'savings', ['vacation', 'trip']], ['Kids\' college', 'savings', ['529', 'college']], ['Start a business', 'other', ['business']]];
export const goalEntries = (spine) => [...mine((spine.goals || []).map((g) => g.label)), ...GOALS.map(([words, type, aliases]) => ({ words, aliases, hint: { savings: 'a savings goal', payoff: 'pay something off', fi: 'financial independence', other: 'another goal' }[type], from: 'library', value: { type } }))];
// Names for a new item by its kind: a card from the card list, a loan's servicer or lender, a bank, a fund.
const INVESTED = ['employerRetirement', 'ira', 'taxable', 'education', 'hsaFsa'];
export function nameEntries(spine, collection, family, type) {
  const own = mine([...(spine[collection] || []).map(nameOf)]);
  if (collection === 'debts' && type === 'credit_card' && LIB.cards) return [...own, ...cardEntries(LIB.cards).map((e) => ({ ...e, from: 'library' }))];
  if (collection === 'debts' && LIB.institutions) return [...own, ...institutionEntries(LIB.institutions, /student/.test(type) ? ['servicer'] : ['lender', 'bank']).map((e) => ({ ...e, from: 'library' }))];
  if (collection === 'accounts' && INVESTED.includes(family)) return [...own, ...(LIB.funds ? fundEntries(LIB.funds).map((e) => ({ ...e, from: 'library' })) : []), ...(LIB.institutions ? institutionEntries(LIB.institutions, ['bank']).map((e) => ({ ...e, from: 'library' })) : [])];
  if (collection === 'accounts' && LIB.institutions) return [...own, ...institutionEntries(LIB.institutions, ['bank']).map((e) => ({ ...e, from: 'library' }))];
  if (collection === 'expenses') return expenseEntries(spine);
  if (collection === 'goals') return goalEntries(spine);
  if (collection === 'income') return [...own, ...employerEntries()];
  return own;
}
// Employers seen before in this browser (their plan details come with them).
export const employerEntries = () => (knownEmployers ? knownEmployers() : []).map((n) => ({ words: n, hint: planFor(n) ? 'plan details remembered' : null, from: 'recent', value: { employer: n } }));
// A field on an item's screen with a known set of answers.
export function fieldEntries(spine, field) {
  if (field === 'institution' && LIB.institutions) return [...mine([...new Set([...(spine.accounts || []), ...(spine.debts || [])].map((x) => (x.institution && x.institution.value) || null))]), ...institutionEntries(LIB.institutions).map((e) => ({ ...e, from: 'library' }))];
  if ((field === 'servicer') && LIB.institutions) return institutionEntries(LIB.institutions, ['servicer']).map((e) => ({ ...e, from: 'library' }));
  if ((field === 'insurer') && LIB.institutions) return institutionEntries(LIB.institutions, ['insurer']).map((e) => ({ ...e, from: 'library' }));
  if (field === 'employerName') return employerEntries();
  return null;
}
export const placeLibEntries = () => (LIB.places ? placeEntries(LIB.places).map((e) => ({ ...e, from: 'library' })) : []);

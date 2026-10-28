// Onboarding (owner's ask, 2026-10-28): the first pass over a whole client in one guided flow, Profile, Income,
// Debt, Assets, Needs, Goals, then a finish screen. The screens are ui/onboard.js; this file holds what they save
// and figure: the profile answers in one call, the finish screen's headline numbers (the same summary every page
// reads, so nothing can disagree), and the rough and not-now items grouped by section. A paycheck typed as
// take-home is engine/paycheck.js. Pure.

import { getAt, setAt, valueOf as v, fact, ageOn, inForce, addMonths, listFacts, whoSupplies } from './spine.js';
import { putFact } from './edits.js';
import { applyAnswer, answersOf, NOT_SURE } from './profile.js';
import { labelFor, groupFor, GROUPS } from './labels.js';

export const STEPS = [['profile', 'Profile'], ['income', 'Income'], ['debt', 'Debt'], ['assets', 'Assets'], ['needs', 'Needs'], ['goals', 'Goals'], ['finish', 'Finish']];
export const stepAfter = (id) => { const i = STEPS.findIndex(([k]) => k === id); return i >= 0 && STEPS[i + 1] ? STEPS[i + 1][0] : null; };
export const stepBefore = (id) => { const i = STEPS.findIndex(([k]) => k === id); return i > 0 ? STEPS[i - 1][0] : null; };

// Done or not: spine.onboarding { complete, completedOn }. Nothing else is stored for it.
export const isComplete = (spine) => !!(spine && spine.onboarding && spine.onboarding.complete === true);
export const markComplete = (spine, today) => (isComplete(spine) && spine.onboarding.completedOn === today ? spine : { ...spine, onboarding: { complete: true, completedOn: today } });

// ---------------------------------------------------------------- the Profile step
// [key, words, the situation it sets, the Profile's work answer]
export const WORK = [['w2', 'A job (W-2)', 'employed', 'w2'], ['self', 'Self-employed', 'self_employed', 'self'], ['between', 'Between jobs', 'between_jobs', 'between'], ['student', 'Student', 'student', 'student'], ['mixed', 'Mixed', 'mixed', 'both'], ['retired', 'Retired', 'retired', 'retired']];
export const HOMES = [['rent', 'Rent'], ['own', 'Own'], ['roommates', 'Roommates'], ['family', 'With family']];
export const FILING = [['single', 'Single'], ['mfj', 'Married, filing jointly'], ['mfs', 'Married, filing separately'], ['hoh', 'Head of household']];
const SOURCE = 'onboarding';
const stamp = (today) => ({ asOf: today, source: SOURCE });

// What the step shows: the household's answers so far, with the recommended default where there is none yet.
// A default is only a suggestion until Next or a tap saves it (applyProfile).
export function profileOf(spine, today) {
  const a = answersOf(spine), h = spine.household || {}, people = h.people || [];
  const age = (p) => { const b = p ? v(p.birthDate) : null; return b ? ageOn(b, today) : null; };
  const name = (p) => (p && p.name && p.name !== 'You' ? p.name : '');
  const couple = people.length > 1;
  const now = inForce(h.situation, today);
  const sit = now && now.value ? v(now.value) : null;
  const work = (WORK.find(([, , s, w]) => a.work === w) || WORK.find(([, , s]) => s === sit) || WORK[0])[0];
  return {
    couple, names: [name(people[0]), name(people[1])], ages: [age(people[0]), age(people[1])],
    state: v(h.state) || (a.state && a.state !== NOT_SURE ? a.state : null) || 'NY',
    home: HOMES.some(([k]) => k === a.home) ? a.home : 'rent',
    work, filing: v(h.filingStatus) || (couple ? 'mfj' : 'single'),
    answered: { couple, state: v(h.state) !== null, home: HOMES.some(([k]) => k === a.home), work: !!(a.work || sit), filing: v(h.filingStatus) !== null }
  };
}

const putIf = (s, path, value, today) => { const f = getAt(s, path); return f && f.kind === 'known' && v(f) === value ? s : putFact(s, path, value, 'known', today); };
function situationNow(s, value, today) {
  const tl = s.household.situation || [];
  const now = inForce(tl, today) || tl.find((e) => e.from === null);
  if (!now) return setAt(s, 'household.situation', [...tl, { id: 'now', from: null, value: fact(value, { kind: 'known', ...stamp(today) }) }]);
  if (now.value && v(now.value) === value && now.value.kind === 'known') return s;
  return setAt(s, 'household.situation.' + now.id + '.value', fact(value, { kind: 'known', ...stamp(today) }));
}
// Save the Profile step, any part of it (a tap saves one answer; Next saves them all, profileOf's suggested ones
// included): the people (a couple adds the second person, single drops it), ages as a birth date (July 1 of that
// year, rough, kept when a real date already has that year), the state, home, work and filing status. The Profile's
// own answers are written too (each a life change), so the Session and the rest see the same picture. Returns the
// same household when nothing changed.
export function applyProfile(spine, p, today) {
  let s = spine;
  const yy = +today.slice(0, 4);
  const people = s.household.people || [];
  let list = people.slice();
  const names = p.names || [], ages = p.ages || [];
  const first = { ...list[0] };
  const n0 = String(names[0] || '').trim();
  if (n0 && n0 !== first.name) { first.name = n0; delete first.nameFrom; }
  list[0] = first;
  if (p.couple === true && !list[1]) list[1] = { id: list.some((x) => x.id === 'partner') ? 'partner-2' : 'partner', name: 'Partner', birthDate: fact(null, stamp(today)) };
  else if (p.couple === false && list.length > 1) list = list.slice(0, 1);
  const n1 = String(names[1] || '').trim();
  if (list[1] && n1 && n1 !== list[1].name) list[1] = { ...list[1], name: n1 };
  list = list.map((q, i) => {
    const age = ages[i];
    if (!Number.isInteger(age) || age < 0 || age > 120) return q;
    const year = yy - age, cur = v(q.birthDate);
    if (cur && +cur.slice(0, 4) === year) return q;
    return { ...q, birthDate: fact(year + '-07-01', { kind: 'rough', ...stamp(today), by: 'coach', note: 'from the age given at onboarding; the real birth date makes it exact' }) };
  });
  if (JSON.stringify(list) !== JSON.stringify(people)) s = { ...s, household: { ...s.household, people: list } };
  const opts = { today, by: 'coach', source: SOURCE };
  if (n0) s = applyAnswer(s, 'firstName', n0, opts);
  if (Number.isInteger(ages[0])) s = applyAnswer(s, 'birthYear', yy - ages[0], opts);
  if (p.state) { s = applyAnswer(s, 'state', p.state, opts); s = putIf(s, 'household.state', p.state, today); }
  if (p.home) s = applyAnswer(s, 'home', p.home, opts);
  const w = WORK.find(([k]) => k === p.work);
  if (w) { s = applyAnswer(s, 'work', w[3], opts); s = situationNow(s, w[2], today); }
  if (p.filing) s = putIf(s, 'household.filingStatus', p.filing, today);
  return s;
}

// ---------------------------------------------------------------- the finish screen
// Every number here is the summary's own (engine/summary.js), the same one Today and My numbers draw.
export function finishNumbers(spine, rules, s) {
  const cf = s.cashflow, sh = s.sheet, fi = s.fi;
  const months = fi.yearsToFi && fi.yearsToFi.value !== null ? Math.round(fi.yearsToFi.value * 12) : null;
  return { takeHome: cf.income.takeHome, owed: sh.debts, liquid: sh.liquidNetWorth, total: sh.netWorth, needs: cf.expenses.need, spending: cf.expenses.total, fiNumber: fi.fiNumber, fiMonths: months, fiYm: months === null ? null : addMonths(s.ym, months), fiNever: !!fi.neverAtThisRate };
}
// The rough and the not-now answers, each grouped by its section: the client's and the coach's, not the app's own
// guesses (house defaults and the assumed main checking links are counted apart). isLater(path): the not-now mark.
export function openItems(spine, isLater = () => false) {
  const rough = [], later = [];
  let defaults = 0;
  for (const { path, fact: f } of listFacts(spine)) {
    if (path.startsWith('profile.')) continue;
    const app = whoSupplies(f) === 'default' || f.source === 'mainChecking';
    const item = { path, label: labelFor(spine, path), section: groupFor(path) };
    if (isLater(path) && (f.kind === 'missing' || f.kind === 'rough')) { later.push(item); continue; }
    if (f.kind !== 'rough') continue;
    if (app) defaults++; else rough.push(item);
  }
  const group = (list) => GROUPS.map((g) => ({ id: g.id, label: g.label, items: list.filter((x) => x.section === g.id) })).filter((g) => g.items.length);
  return { rough: group(rough), later: group(later), roughCount: rough.length, laterCount: later.length, defaults };
}

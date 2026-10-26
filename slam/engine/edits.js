// Editing the spine: one Fact at a time, and an undo/redo history of whole
// documents (households are small; S-003 does the same for the Budget).

import { getAt, setAt, isFact, valueOf } from './spine.js';
import { PRESETS, INCOME_TYPES, PER_YEAR, PAY_BASES } from './schema.js';

// Text typed in the Ledger to a stored value. Rates are typed as percents
// ("25" or "25%" is 0.25). Returns { ok, value } or { ok: false, message }.
export function parseInput(type, text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { ok: false, message: 'Type a value, or use Not for me' };
  if (type === 'money' || type === 'int' || type === 'rate') {
    const n = Number(raw.replace(/[$,%\s]/g, ''));
    if (!Number.isFinite(n)) return { ok: false, message: 'Type a number' };
    if (type === 'int' && !Number.isInteger(n)) return { ok: false, message: 'Type a whole number' };
    return { ok: true, value: type === 'rate' ? Math.round(n * 1e6) / 1e8 : n };
  }
  if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? { ok: true, value: raw } : { ok: false, message: 'Use YYYY-MM-DD' };
  if (type === 'bool') return /^(yes|true)$/i.test(raw) ? { ok: true, value: true } : /^(no|false)$/i.test(raw) ? { ok: true, value: false } : { ok: false, message: 'Yes or no' };
  if (type.startsWith('choice:')) return type.slice(7).split('|').includes(raw) ? { ok: true, value: raw } : { ok: false, message: 'Pick one of the choices' };
  if (type === 'list') { try { const v = JSON.parse(raw); return Array.isArray(v) ? { ok: true, value: v } : { ok: false, message: 'A list in [ ]' }; } catch { return { ok: false, message: 'A list in [ ]' }; } }
  return { ok: true, value: raw };
}

// The reverse: a stored value as the text an input box starts with.
export function inputText(type, value) {
  if (value === null || value === undefined) return '';
  if (type === 'rate') return String(Math.round(value * 1e8) / 1e6);
  if (type === 'list') return JSON.stringify(value);
  return String(value);
}

// The Ledger's three actions on a Fact. Each returns a new spine.
// set: a typed value, kept as known or rough. confirm: the current value
// becomes known. notForMe: does not apply (value null).
export function editFact(spine, path, action, { value, kind = 'known', today }) {
  const f = getAt(spine, path);
  if (!isFact(f)) throw new Error('No field at ' + path);
  const stamp = { asOf: today, source: 'ledger' };
  let next;
  if (action === 'set') next = { value, kind, ...stamp };
  else if (action === 'confirm') { if (f.value === null) throw new Error('Nothing to confirm at ' + path); next = { value: f.value, kind: 'known', ...stamp }; }
  else if (action === 'notForMe') next = { value: null, kind: 'notForMe', ...stamp };
  else if (action === 'clear') next = { value: null, kind: 'missing', ...stamp };
  else throw new Error('Unknown edit ' + action);
  const s = setAt(spine, path, next);
  // An HSA's "paid in from" and its through-payroll switch say the same thing (answer 47).
  const m = /^accounts\.([^.]+)\.fundedFrom$/.exec(path);
  const a = m ? getAt(s, 'accounts.' + m[1]) : null;
  return a && a.type === 'hsa' && action === 'set' ? setAt(s, 'accounts.' + m[1] + '.throughPayroll', { value: value === 'paycheck', kind: 'known', ...stamp }) : s;
}

// An HSA through payroll or from take-home (answer 47): the switch, with "paid in from" kept in step (from take-home,
// the house guess of the main checking account fills it again).
export function setThroughPayroll(spine, id, on, today) {
  const base = 'accounts.' + id;
  const a = getAt(spine, base);
  if (!a) throw new Error('No account ' + id);
  let s = putFact(spine, base + '.throughPayroll', !!on, 'known', today);
  if (on) s = putFact(s, base + '.fundedFrom', 'paycheck', 'known', today);
  else if (a.fundedFrom && valueOf(a.fundedFrom) === 'paycheck') { const next = { ...getAt(s, base) }; delete next.fundedFrom; s = setAt(s, base, next); }
  return s;
}

// ---------------------------------------------------------------- contributions by year (S-211)
// What went into a tax-advantaged account for a tax year: one entry added to its
// contributions by year, the field made when the account has none yet. kind:
// contribution (left out of the entry), rollover or conversion (never count
// against a limit), from529 (a 529 rolled into a Roth IRA, counts), employer
// (a Solo 401(k)'s or SEP's employer part).
export function addContribution(spine, accountId, { year, amount, kind = 'contribution' }, today) {
  const path = 'accounts.' + accountId + '.contributions';
  if (!getAt(spine, 'accounts.' + accountId)) throw new Error('No account ' + accountId);
  if (!Number.isInteger(year) || typeof amount !== 'number' || !(amount > 0)) throw new Error('A year and an amount above $0');
  const f = getAt(spine, path);
  const list = isFact(f) && Array.isArray(f.value) ? f.value : [];
  return setAt(spine, path, { value: [...list, { year, amount, ...(kind && kind !== 'contribution' ? { kind } : {}) }], kind: 'known', asOf: today, source: 'ledger' });
}

// The total that went in for a year, as one entry (S-211): a contribution total replaces the year's contribution
// entries and an employer total the year's employer entries, so the monthly guess never stands beside a part of it.
// A rollover, a conversion and money rolled in from a 529 are events: each is added as its own entry.
export const TOTAL_KINDS = ['contribution', 'employer'];
export function recordContribution(spine, accountId, { year, amount, kind = 'contribution' }, today) {
  if (!TOTAL_KINDS.includes(kind)) return addContribution(spine, accountId, { year, amount, kind }, today);
  const path = 'accounts.' + accountId + '.contributions';
  if (!getAt(spine, 'accounts.' + accountId)) throw new Error('No account ' + accountId);
  if (!Number.isInteger(year) || typeof amount !== 'number' || !(amount >= 0)) throw new Error('A year and an amount of $0 or more');
  const f = getAt(spine, path);
  const part = (c) => (kind === 'employer' ? c.kind === 'employer' : !c.kind || c.kind === 'contribution');
  const kept = (isFact(f) && Array.isArray(f.value) ? f.value : []).filter((c) => !(c.year === year && part(c)));
  // The total is through the household's as-of date: the monthly amount adds what goes in after it (S-214).
  const through = (spine.meta && spine.meta.asOf) || today;
  return setAt(spine, path, { value: [...kept, { year, amount, ...(kind === 'employer' ? { kind } : {}), through }], kind: 'known', asOf: today, source: 'ledger' });
}

// ---------------------------------------------------------------- card rate
// The Ledger's one "Interest rate" panel for a card (S-161). Typed text in:
// { apr, hasIntro, introRate, introEnds }. A blank APR is allowed: the house
// default fills it in as rough (engine/defaults.js). A blank intro rate is 0.
export function parseCardRate({ apr, hasIntro, introRate, introEnds }) {
  const out = { apr: null, intro: null };
  if (String(apr ?? '').trim() !== '') {
    const p = parseInput('rate', apr);
    if (!p.ok) return { ok: false, message: (hasIntro ? 'Rate after intro: ' : 'Interest rate: ') + p.message };
    out.apr = p.value;
  }
  if (hasIntro) {
    const r = String(introRate ?? '').trim() === '' ? { ok: true, value: 0 } : parseInput('rate', introRate);
    if (!r.ok) return { ok: false, message: 'Intro rate: ' + r.message };
    const e = parseInput('date', introEnds);
    if (!e.ok) return { ok: false, message: 'Intro ends: pick a date' };
    out.intro = { rate: r.value, ends: e.value };
  }
  return { ok: true, value: out };
}

// set: { apr, intro } from parseCardRate, kept as known or rough; with no
// intro, intro fields that exist become not for me. confirm: every rate field
// in use becomes known. notForMe: the card charges no interest.
export function editCardRate(spine, cardId, action, { value, kind = 'known', today }) {
  const base = 'debts.' + cardId;
  const card = getAt(spine, base);
  if (!card || card.type !== 'credit_card') throw new Error('No card ' + cardId);
  const stamp = { asOf: today, source: 'ledger' };
  const put = (s, k, f) => setAt(s, base + '.' + k, { ...f, ...stamp });
  let s = spine;
  if (action === 'set') {
    s = put(s, 'apr', value.apr === null ? { value: null, kind: 'missing' } : { value: value.apr, kind });
    if (value.intro) {
      s = put(s, 'promoApr', { value: value.intro.rate, kind });
      s = put(s, 'promoEnds', { value: value.intro.ends, kind });
    } else for (const k of ['promoApr', 'promoEnds']) if (card[k]) s = put(s, k, { value: null, kind: 'notForMe' });
  } else if (action === 'confirm') {
    for (const k of ['apr', 'promoApr', 'promoEnds']) if (card[k] && card[k].value !== null) s = put(s, k, { value: card[k].value, kind: 'known' });
  } else if (action === 'notForMe') {
    for (const k of ['apr', 'promoApr', 'promoEnds']) if (k === 'apr' || card[k]) s = put(s, k, { value: null, kind: 'notForMe' });
  } else throw new Error('Unknown edit ' + action);
  return s;
}

// Set a field that may not exist yet (a new tag such as "paid by someone else").
export function putFact(spine, path, value, kind, today) {
  return setAt(spine, path, { value, kind, asOf: today, source: 'ledger' });
}

// One expense, as its panel saves it (S-175, S-176): amount and how often, and
// who pays. sharing: null (keep), or { shared, sharedWith, yourShare, whoPays };
// yourShare null means an even split. A choice that matches the section default
// is not copied onto the expense, so the expense keeps following the default.
// coveredBy: a name when someone else covers it (counts $0), null when not; a
// name not on the household's list is added to it.
export function editExpense(spine, id, { amount, cadence, sharing = null, coveredBy = undefined, kind = 'known', label = null, subscription = undefined, start = undefined, end = undefined }, today) {
  const base = 'expenses.' + id;
  const e = getAt(spine, base);
  if (!e) throw new Error('No expense ' + id);
  const F = (value, k = kind) => ({ value, kind: value === null ? 'missing' : k, asOf: today, source: 'ledger' });
  let s = setAt(spine, base + '.amount', F(amount));
  // When it starts and ends (S-199): dates on the item, null for open-ended.
  if (start !== undefined) s = setAt(s, base + '.start', checkDate(start, 'start'));
  if (end !== undefined) s = setAt(s, base + '.end', checkDate(end, 'end'));
  if (getAt(s, base).start && getAt(s, base).end && getAt(s, base).end < getAt(s, base).start) throw new Error('It ends before it starts');
  // A subscription (S-191) asks when it next charges and when it was last
  // reviewed; unmarking it drops all three.
  if (subscription !== undefined) {
    const next = { ...getAt(s, base) };
    if (subscription) {
      next.subscription = F(true, 'known');
      if (!next.renews) next.renews = { value: null, kind: 'missing', asOf: today, source: 'ledger' };
      if (!next.reviewed) next.reviewed = { value: null, kind: 'missing', asOf: today, source: 'ledger' };
    } else { delete next.subscription; delete next.renews; delete next.reviewed; }
    s = setAt(s, base, next);
  }
  // A new name keeps the id, so links and history still point at it.
  if (label && label.trim() && label.trim() !== e.label) s = setAt(s, base, { ...getAt(s, base), label: label.trim() });
  if (cadence && cadence !== e.cadence) s = setAt(s, base + '.cadence', cadence);
  // A one-time or total line pays no debt (answer 35): changing to one drops the link, so the line counts as itself.
  if (cadence && !PER_YEAR[cadence] && getAt(s, base).paysDebt) { const next = { ...getAt(s, base) }; delete next.paysDebt; s = setAt(s, base, next); }
  if (sharing) {
    const def = (spine.household.expenseDefaults || {})[e.fat || 'other'] || {};
    const dv = (k) => (def[k] ? def[k].value : null);
    const want = { shared: !!sharing.shared, sharedWith: sharing.shared ? sharing.sharedWith ?? null : null, yourShare: sharing.shared ? sharing.yourShare ?? null : null, whoPays: sharing.shared ? sharing.whoPays || 'part' : null };
    const sameAsDefault = want.shared === (dv('shared') === true) && (!want.shared || (want.sharedWith === dv('sharedWith') && want.yourShare === dv('yourShare') && want.whoPays === (dv('whoPays') || 'part')));
    const cur = getAt(s, base);
    const next = { ...cur };
    for (const k of SHARE_KEYS) delete next[k];
    if (!sameAsDefault) {
      next.shared = F(want.shared, 'known');
      if (want.shared) {
        next.sharedWith = F(want.sharedWith, 'known');
        if (want.yourShare !== null) next.yourShare = F(want.yourShare, 'known');
        next.whoPays = F(want.whoPays, 'known');
      }
    }
    s = setAt(s, base, next);
  }
  if (coveredBy !== undefined) {
    const next = { ...getAt(s, base) };
    if (coveredBy) {
      next.covered = F(true, 'known'); next.coveredBy = F(coveredBy, 'known');
      for (const k of SHARE_KEYS) delete next[k];
      const known = spine.household.payers || [];
      if (!PAYERS.includes(coveredBy) && !known.includes(coveredBy)) s = { ...s, household: { ...s.household, payers: [...known, coveredBy] } };
    } else { delete next.covered; delete next.coveredBy; }
    s = setAt(s, base, next);
  }
  return s;
}
const SHARE_KEYS = ['shared', 'sharedWith', 'yourShare', 'whoPays'];
const PAYERS = ['Parents', 'Partner', 'Roommate', 'Employer', 'Family'];

// A date typed in a panel: YYYY-MM-DD, or null (blank) for open-ended.
function checkDate(d, what) {
  if (d === null || d === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) throw new Error(what + ': use YYYY-MM-DD');
  return d;
}

// One income stream, as its panel saves it (S-199): the amount and how often,
// when it starts and ends (blank is open-ended), and the day of the month it
// is paid (payDay, for monthly and less often; twice a month, payDay2 is the
// second day, S-226; weekly and biweekly pay dates
// follow the start date). A new name keeps the id.
export function editIncome(spine, id, { amount, cadence, start = undefined, end = undefined, payDay = undefined, payDay2 = undefined, personId = undefined, kind = 'known', label = null }, today) {
  const base = 'income.' + id;
  const x = getAt(spine, base);
  if (!x) throw new Error('No income ' + id);
  const stamp = { asOf: today, source: 'ledger' };
  let s = setAt(spine, base + '.amount', { value: amount, kind: amount === null ? 'missing' : kind, ...stamp });
  const next = { ...getAt(s, base) };
  if (cadence) next.cadence = cadence;
  if (start !== undefined) next.start = checkDate(start, 'start');
  if (end !== undefined) next.end = checkDate(end, 'end');
  if ((next.cadence === 'total' || next.cadence === 'once') && !next.start) throw new Error(next.cadence === 'once' ? 'A one-time amount needs the date it is paid' : 'A total needs the dates it runs from and to');
  if (next.cadence === 'total' && !next.end) throw new Error('A total needs the date it runs to');
  if (next.start && next.end && next.end < next.start) throw new Error('It ends before it starts');
  if (label && label.trim() && label.trim() !== x.label) next.label = label.trim();
  // Whose pay it is (S-211): one of the household's people.
  if (personId !== undefined) {
    if (!(spine.household.people || []).some((p) => p.id === personId)) throw new Error('No such person');
    next.personId = personId;
  }
  if (payDay !== undefined) {
    if (payDay === null) delete next.payDay;
    else {
      if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) throw new Error('Day paid: 1 to 31');
      next.payDay = { value: payDay, kind, ...stamp };
    }
  }
  // Twice a month, the second day (S-226): kept only for twice-a-month pay with a first day, and never the same day.
  if (next.cadence !== 'semimonthly' || !next.payDay) delete next.payDay2;
  else if (payDay2 === null) delete next.payDay2;
  else if (payDay2 !== undefined) {
    if (!Number.isInteger(payDay2) || payDay2 < 1 || payDay2 > 31) throw new Error('Second day paid: 1 to 31');
    next.payDay2 = { value: payDay2, kind, ...stamp };
  }
  if (next.payDay2 && next.payDay2.value === next.payDay.value) throw new Error('The second day paid is a different day from the first');
  return setAt(s, base, next);
}

// A section's sharing default; new and untouched expenses there follow it.
export function setSectionSharing(spine, tag, { shared, sharedWith = null, yourShare = null, whoPays = 'part' }, today) {
  const F = (value) => ({ value, kind: value === null ? 'missing' : 'known', asOf: today, source: 'ledger' });
  const d = shared ? { shared: F(true), sharedWith: F(sharedWith), whoPays: F(whoPays), ...(yourShare !== null ? { yourShare: F(yourShare) } : {}) } : { shared: F(false) };
  return { ...spine, household: { ...spine.household, expenseDefaults: { ...(spine.household.expenseDefaults || {}), [tag]: d } } };
}

// ---------------------------------------------------------------- history
export const MAX_STEPS = 200;

export function createHistory(doc) {
  return { past: [], present: doc, future: [] };
}
// max: how many steps back are kept (the shell keeps the household's last 25, S-230).
export function commit(h, doc, label = '', max = MAX_STEPS) {
  const past = [...h.past, { doc: h.present, label }];
  return { past: past.slice(-max), present: doc, future: [] };
}
export function undo(h) {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev.doc, future: [{ doc: h.present, label: prev.label }, ...h.future] };
}
export function redo(h) {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, { doc: h.present, label: next.label }], present: next.doc, future: rest };
}
export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;
export const undoLabel = (h) => (h.past.length ? h.past[h.past.length - 1].label : null);
export const redoLabel = (h) => (h.future.length ? h.future[0].label : null);

// ---------------------------------------------------------------- add, remove, many at once (S-169)
// How a pay line is figured (Batch 3): basis 'salary' (yearly salary), 'hourly' (rate x hours a week) or 'lumpy' (the
// last 12 months' total, paid monthly, a guess). The amount on each payday follows from them, rounded to the cent;
// any part blank leaves the amount missing, never $0. null for basis clears it (the amount is typed directly).
// A part left undefined keeps what the line already holds: a salary or a 12-month total starts from the amount it has now.
export function setPay(spine, id, { basis, salary, hourlyRate, hoursPerWeek, yearTotal, cadence }, today) {
  const base = 'income.' + id;
  const x = getAt(spine, base);
  if (!x) throw new Error('No income ' + id);
  const F = (value, kind = 'known') => ({ value, kind: value === null ? 'missing' : kind, asOf: today, source: 'session' });
  const was = (k) => (x[k] ? x[k].value : null);
  const nowYearly = x.amount && x.amount.value !== null && PER_YEAR[x.cadence] ? Math.round(x.amount.value * PER_YEAR[x.cadence] * 100) / 100 : null;
  if (salary === undefined) salary = was('salary') ?? nowYearly;
  if (yearTotal === undefined) yearTotal = was('yearTotal') ?? nowYearly;
  if (hourlyRate === undefined) hourlyRate = was('hourlyRate');
  if (hoursPerWeek === undefined) hoursPerWeek = was('hoursPerWeek');
  const next = { ...x };
  // Cleared, every part goes; switched, the parts of the other ways are kept, so switching back finds them.
  if (!basis) { for (const k of ['payBasis', 'salary', 'hourlyRate', 'hoursPerWeek', 'yearTotal']) delete next[k]; return setAt(spine, base, next); }
  if (!PAY_BASES.includes(basis)) throw new Error('Not a way of being paid: ' + basis);
  // A line typed as an amount (or as a salary) keeps that salary when it switches to another way, so switching back
  // finds it.
  if (basis !== 'salary' && salary !== null && !x.salary && (!x.payBasis || was('payBasis') === 'salary')) next.salary = F(salary);
  next.payBasis = F(basis);
  // Steady (1099 or side money about the same each month): the amount is typed as it is.
  if (basis === 'steady') return setAt(spine, base, next);
  const often = basis === 'lumpy' ? 'monthly' : cadence || x.cadence;
  if (!PER_YEAR[often]) throw new Error('Paid how often: weekly, every two weeks, twice a month or monthly');
  next.cadence = often;
  let yearly = null, kind = 'known';
  if (basis === 'salary') { next.salary = F(salary); yearly = salary; }
  if (basis === 'hourly') { next.hourlyRate = F(hourlyRate); next.hoursPerWeek = F(hoursPerWeek); yearly = hourlyRate === null || hoursPerWeek === null ? null : hourlyRate * hoursPerWeek * 52; }
  if (basis === 'lumpy') { next.yearTotal = F(yearTotal); yearly = yearTotal; kind = 'rough'; }
  next.amount = F(yearly === null ? null : Math.round(yearly / PER_YEAR[often] * 100) / 100, kind);
  return setAt(spine, base, next);
}

// Fields a new item starts with, as missing Facts, by family or collection.
const STARTING_FIELDS = {
  cash: ['institution', 'balance', 'apy'], fixedTerm: ['institution', 'balance', 'rate', 'maturityDate'],
  employerRetirement: ['institution', 'balance', 'monthlyContribution'], ira: ['institution', 'balance', 'monthlyContribution'],
  hsaFsa: ['institution', 'balance', 'monthlyContribution'], education: ['institution', 'balance', 'beneficiary'],
  taxable: ['institution', 'balance', 'costBasis'], otherAssets: ['balance', 'appreciationRate'],
  debt: ['institution', 'balance', 'apr', 'minimum']
};

function newId(list, label) {
  const base = String(label || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'item';
  const taken = new Set((list || []).map((x) => x.id));
  let id = base, n = 2;
  while (taken.has(id)) id = base + '-' + n++;
  return id;
}

// addItem(spine, { collection, type, label, cadence, fat }, today) -> { spine, id, firstPath }
// A new account, debt, income stream, expense or goal, with its starting
// fields missing (red) so the Ledger asks for them. House defaults run after.
export function addItem(spine, { collection, type, label, cadence = 'monthly', fat = null }, today) {
  const stamp = { asOf: today, source: 'ledger' };
  const M = () => ({ value: null, kind: 'missing', ...stamp });
  const K = (value) => ({ value, kind: 'known', ...stamp });
  const list = spine[collection] || [];
  const id = newId(list, label);
  let item, first;
  if (collection === 'accounts' || collection === 'debts') {
    const preset = PRESETS[type];
    if (!preset || (collection === 'debts') !== (preset.family === 'debt')) throw new Error('Not a ' + collection + ' type: ' + type);
    item = { id, family: preset.family, type, name: K(label || preset.label) };
    for (const k of STARTING_FIELDS[preset.family] || ['balance']) item[k] = M();
    if (type === 'roth_ira') item.basis = M();
    if (type === 'student_loan') item.plan = M();
    if (type === 'credit_card') Object.assign(item, { limit: M(), business: M(), reportsToPersonalCredit: M() });
    first = collection + '.' + id + '.balance';
  } else if (collection === 'income') {
    if (!INCOME_TYPES.includes(type)) throw new Error('Not an income type: ' + type);
    // Nothing is withheld from self-employment pay, side money or money from a person (Batch 3).
    const noWithholding = type === '1099' || type === 'side' || type === 'person';
    item = { id, type, label: label || type, personId: spine.household.people[0].id, amount: M(), cadence, start: null, end: null,
      withholding: { federal: noWithholding ? K(0) : M(), state: noWithholding ? K(0) : M() } };
    if (type === 'maybeMoney') item.likelihood = M();
    if (type === 'person') Object.assign(item, { from: M(), purpose: M() });
    first = 'income.' + id + '.amount';
  } else if (collection === 'expenses') {
    item = { id, label: label || 'New expense', amount: M(), cadence, start: null, end: null, fixed: null, need: M(), fat };
    first = 'expenses.' + id + '.amount';
  } else if (collection === 'goals') {
    item = { id, type: type || 'savings', label: label || 'New goal' };
    if (item.type === 'fi') item.fiNumber = M(); else item.target = M();
    first = 'goals.' + id + (item.type === 'fi' ? '.fiNumber' : '.target');
  } else throw new Error('Cannot add to ' + collection);
  return { spine: { ...spine, [collection]: [...list, item] }, id, firstPath: first };
}

// An expense's payment (S-189): the account or card, and the day (blank clears it). paysDebt (S-226): the debt the
// line pays (its payment is then counted once, under debt payments), null to unlink, undefined to keep.
export function editPayment(spine, id, { from, day = null, paysDebt = undefined, kind = 'known' }, today) {
  const base = 'expenses.' + id;
  if (!getAt(spine, base)) throw new Error('No expense ' + id);
  const stamp = { asOf: today, source: 'ledger' };
  let s = setAt(spine, base + '.paidFrom', { value: from, kind, ...stamp });
  const e = getAt(s, base);
  if (day === null) { if (e.payDay) { const next = { ...e }; delete next.payDay; s = setAt(s, base, next); } }
  else s = setAt(s, base + '.payDay', { value: day, kind, ...stamp });
  if (paysDebt === null) { const x = getAt(s, base); if (x.paysDebt) { const next = { ...x }; delete next.paysDebt; s = setAt(s, base, next); } }
  else if (paysDebt !== undefined) {
    if (!(spine.debts || []).some((d) => d.id === paysDebt)) throw new Error('No debt ' + paysDebt);
    if (!PER_YEAR[getAt(s, base).cadence]) throw new Error('A line that pays a debt repeats: set how often it is paid first');
    const other = (spine.expenses || []).find((x) => x.id !== id && x.paysDebt && x.paysDebt.value === paysDebt);
    if (other) throw new Error('The ' + other.label + ' line already pays that debt');
    s = setAt(s, base + '.paysDebt', { value: paysDebt, kind: 'known', ...stamp });
  }
  return s;
}

// Duplicate an item (S-190): everything copied (how often, sharing, who
// pays, links, rates) except its name, which is the one given (blank when none
// is), and its amount, which starts missing so the Ledger asks for it.
// Returns { spine, id, firstPath }: firstPath is the amount to fill in.
const AMOUNT_OF = { accounts: 'balance', debts: 'balance', income: 'amount', expenses: 'amount' };
export function duplicateItem(spine, collection, id, today, name = '') {
  const list = spine[collection] || [];
  const src = list.find((x) => x.id === id);
  if (!src) throw new Error('No ' + collection + ' item ' + id);
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = newId(list, name || (typeof src.label === 'string' ? src.label : valueOf(src.name) || id) + ' copy');
  const stamp = { asOf: today, source: 'ledger' };
  const amount = collection === 'goals' ? ('fiNumber' in copy ? 'fiNumber' : 'target') : AMOUNT_OF[collection];
  if (amount && amount in copy) copy[amount] = { value: null, kind: 'missing', ...stamp, note: 'duplicated: fill this in' };
  if (typeof copy.label === 'string') copy.label = name;
  if (copy.name && isFact(copy.name)) copy.name = name ? { value: name, kind: 'known', ...stamp } : { value: null, kind: 'missing', ...stamp };
  // One line pays a debt (S-226): the copy does not.
  delete copy.paysDebt;
  return { spine: { ...spine, [collection]: [...list, copy] }, id: copy.id, firstPath: collection + '.' + copy.id + '.' + amount };
}

// Remove one item (undo brings it back).
export function removeItem(spine, collection, id) {
  if (!(spine[collection] || []).some((x) => x.id === id)) throw new Error('No ' + collection + ' item ' + id);
  const out = { ...spine, [collection]: spine[collection].filter((x) => x.id !== id) };
  // A removed debt: the line that paid it is an expense again (S-226).
  if (collection === 'debts') out.expenses = (spine.expenses || []).map((e) => { if (!(e.paysDebt && e.paysDebt.value === id)) return e; const next = { ...e }; delete next.paysDebt; return next; });
  // A removed job: a plan paid through it goes back to the sponsoring job (S-227).
  if (collection === 'income') out.accounts = (spine.accounts || []).map((a) => { if (!(a.paidThrough && a.paidThrough.value === id)) return a; const next = { ...a }; delete next.paidThrough; return next; });
  return out;
}

// Many fields at once: confirm (those with a value become known), rough (those
// with a value become rough), notForMe. rows: [{ path, type }] from the Ledger.
export function bulkEdit(spine, rows, action, today) {
  let s = spine;
  for (const r of rows) {
    if (r.type === 'cardRate') {
      const cardId = r.path.split('.')[1];
      if (action === 'rough') {
        for (const k of ['apr', 'promoApr', 'promoEnds']) { const f = getAt(s, 'debts.' + cardId + '.' + k); if (f && f.value !== null) s = setAt(s, 'debts.' + cardId + '.' + k, { ...f, kind: 'rough', asOf: today, source: 'ledger' }); }
      } else s = editCardRate(s, cardId, action, { today });
      continue;
    }
    const f = getAt(s, r.path);
    if (!isFact(f)) continue;
    if (action === 'notForMe') s = editFact(s, r.path, 'notForMe', { today });
    else if (f.value !== null && action === 'confirm') s = editFact(s, r.path, 'confirm', { today });
    else if (f.value !== null && action === 'rough') s = editFact(s, r.path, 'set', { value: f.value, kind: 'rough', today });
  }
  return s;
}

// ---------------------------------------------------------------- the calendar's timing decisions (S-204)
// Overrides, locks and the maybe tray live in spine.calendar as plain values (S-203): a
// decision about one occurrence, not a fact about the household. Each returns a new spine.
const calOf = (spine) => ({ overrides: {}, maybe: [], locks: {}, ...(spine.calendar || {}) });
const withCal = (spine, cal) => ({ ...spine, calendar: cal });
const isoDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d));

// Move one occurrence to another day. A locked occurrence refuses.
export function moveOccurrence(spine, key, date) {
  if (!isoDate(date)) throw new Error('Use YYYY-MM-DD');
  const cal = calOf(spine);
  if (cal.locks[key]) throw new Error('This one is locked; unlock it first');
  const orig = key.split('|')[1];
  const cur = cal.overrides[key] || {};
  const next = { ...cur };
  if (date === orig) delete next.date; else next.date = date;
  delete next.skip;
  const overrides = { ...cal.overrides };
  if (Object.keys(next).length) overrides[key] = next; else delete overrides[key];
  return withCal(spine, { ...cal, overrides });
}
// Skip one occurrence (it stays in the rule), or put it back.
export function skipOccurrence(spine, key, skip = true) {
  const cal = calOf(spine);
  if (cal.locks[key]) throw new Error('This one is locked; unlock it first');
  const overrides = { ...cal.overrides };
  const next = { ...(overrides[key] || {}) };
  if (skip) next.skip = true; else delete next.skip;
  if (Object.keys(next).length) overrides[key] = next; else delete overrides[key];
  // Skipped and happened cannot both be true: skipping takes back a "happened" entry for it (S-209).
  const log = skip ? (spine.log || []).filter((x) => x.importKey !== occurrenceLogKey(key)) : spine.log;
  return withCal({ ...spine, log }, { ...cal, overrides });
}
// Re-price one occurrence (null puts the rule's amount back).
export function repriceOccurrence(spine, key, amount) {
  const cal = calOf(spine);
  if (cal.locks[key]) throw new Error('This one is locked; unlock it first');
  if (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount))) throw new Error('Type a number');
  const overrides = { ...cal.overrides };
  const next = { ...(overrides[key] || {}) };
  if (amount === null) delete next.amount; else next.amount = amount;
  if (Object.keys(next).length) overrides[key] = next; else delete overrides[key];
  return withCal(spine, { ...cal, overrides });
}
// Lock or unlock one occurrence so a drag cannot move it.
export function lockOccurrence(spine, key, on = true) {
  const cal = calOf(spine);
  const locks = { ...cal.locks };
  if (on) locks[key] = true; else delete locks[key];
  return withCal(spine, { ...cal, locks });
}
// Maybe money (the tray): add an item, put it on a date or back in the tray, remove it.
export function addMaybe(spine, { label, amount, likelihood = 0.5, direction = 'in', date = null }) {
  if (!label || !String(label).trim()) throw new Error('Give it a name');
  if (typeof amount !== 'number' || !(amount > 0)) throw new Error('How much: more than $0');
  if (typeof likelihood !== 'number' || likelihood < 0 || likelihood > 1) throw new Error('How likely: 0 to 100%');
  if (date !== null && !isoDate(date)) throw new Error('Use YYYY-MM-DD');
  const cal = calOf(spine);
  const base = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'maybe';
  let id = base, n = 2;
  while (cal.maybe.some((m) => m.id === id)) id = base + '-' + n++;
  return { spine: withCal(spine, { ...cal, maybe: [...cal.maybe, { id, label: String(label).trim(), amount, likelihood, direction, date }] }), id };
}
export function setMaybeDate(spine, id, date) {
  if (date !== null && !isoDate(date)) throw new Error('Use YYYY-MM-DD');
  const cal = calOf(spine);
  if (!cal.maybe.some((m) => m.id === id)) throw new Error('No maybe item ' + id);
  return withCal(spine, { ...cal, maybe: cal.maybe.map((m) => (m.id === id ? { ...m, date } : m)) });
}
export function removeMaybe(spine, id) {
  const cal = calOf(spine);
  return withCal(spine, { ...cal, maybe: cal.maybe.filter((m) => m.id !== id) });
}

// ---------------------------------------------------------------- the spend log and check-ins (S-206)
// A log entry is a record of what happened, plain values: the amount typed,
// the day, a tag or the expense it belongs to, the merchant (cleaned), what
// paid it. A check-in records real balances against the forecast and
// re-anchors the household to that day.
const nextId = (list, prefix) => prefix + ((list || []).reduce((m, x) => Math.max(m, +String(x.id).replace(/^\D+/, '') || 0), 0) + 1);
export function logSpend(spine, { amount, date, kind = 'spend', tag = null, expenseId = null, merchant = null, note = null, paidWith = null, source = 'typed', importKey = null }) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error('An amount is a number, zero or more');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('A day is YYYY-MM-DD');
  if (!['spend', 'refund', 'income'].includes(kind)) throw new Error('spend, refund or income');
  const list = spine.log || [];
  const id = nextId(list, 'l');
  const entry = { id, date, amount: Math.round(amount * 100) / 100, kind, tag, expenseId, merchant: merchant ? String(merchant).trim() || null : null, note: note ? String(note).trim() || null : null, paidWith, source, ...(importKey ? { importKey } : {}) };
  return { spine: { ...spine, log: [...list, entry] }, id };
}
export function removeLog(spine, id) { return { ...spine, log: (spine.log || []).filter((x) => x.id !== id) }; }
export function checkIn(spine, { date, balances, forecast = {} }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('A day is YYYY-MM-DD');
  const ids = Object.keys(balances || {});
  if (!ids.length) throw new Error('At least one balance');
  let out = spine;
  for (const id of ids) {
    const amt = balances[id];
    if (typeof amt !== 'number' || !Number.isFinite(amt)) throw new Error('A balance is a number');
    if (!(out.accounts || []).some((a) => a.id === id)) throw new Error('No account ' + id);
    out = putFact(out, 'accounts.' + id + '.balance', Math.round(amt * 100) / 100, 'known', date);
  }
  const entry = { id: nextId(out.checkins, 'c'), date, balances: Object.fromEntries(ids.map((id) => [id, Math.round(balances[id] * 100) / 100])), forecast: Object.fromEntries(ids.map((id) => [id, forecast[id] === undefined || forecast[id] === null ? null : Math.round(forecast[id] * 100) / 100])) };
  // Re-anchor: the household is now as of this day.
  return { ...out, meta: { ...out.meta, asOf: date }, checkins: [...(out.checkins || []), entry] };
}
export function setSweep(spine, { on, to = null, keep = 0 }) {
  if (typeof keep !== 'number' || !Number.isFinite(keep) || keep < 0) throw new Error('Keep is a number, zero or more');
  const cal = { ...(spine.calendar || {}), sweep: { on: on === true, to: to || null, keep: Math.round(keep * 100) / 100 } };
  return { ...spine, calendar: cal };
}

// ---------------------------------------------------------------- did it happen (S-209)
// A calendar occurrence confirmed from the calendar: it happened (at the planned
// amount), a different amount, or it did not happen (skipped once). Happening
// writes one log entry keyed to the occurrence, so it is never logged twice and
// estimated vs actual sees it; undoing removes that entry.
export const occurrenceLogKey = (key) => 'sched:' + key;
export function confirmOccurrence(spine, key, { amount, date = null } = {}) {
  if (!/^[^|]+\|\d{4}-\d{2}-\d{2}$/.test(key || '')) throw new Error('Not an occurrence key');
  const [sourceId, orig] = key.split('|');
  if ((spine.log || []).some((x) => x.importKey === occurrenceLogKey(key))) throw new Error('Already logged as happened');
  const inc = (spine.income || []).find((x) => x.id === sourceId);
  const exp = inc ? null : (spine.expenses || []).find((x) => x.id === sourceId);
  if (!inc && !exp) throw new Error('Only a paycheck or a bill can be logged as happened');
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error('An amount is a number, zero or more');
  const label = inc ? inc.label : exp.label;
  // With no date given it happened on the day it is on the calendar: the moved day if it was moved.
  const moved = ((spine.calendar || {}).overrides || {})[key];
  // A bill paid on a card was charged to the card, not paid from checking (S-209 review).
  const payer = exp && exp.paidFrom ? valueOf(exp.paidFrom) : null;
  const onCard = payer && (spine.debts || []).some((d) => d.id === payer && d.type === 'credit_card') ? payer : null;
  return logSpend(spine, { amount, date: date || (moved && moved.date) || orig, kind: inc ? 'income' : 'spend', tag: null, expenseId: exp ? exp.id : null, merchant: null, note: label, paidWith: onCard, source: 'scheduled', importKey: occurrenceLogKey(key) }).spine;
}
export function unconfirmOccurrence(spine, key) {
  return { ...spine, log: (spine.log || []).filter((x) => x.importKey !== occurrenceLogKey(key)) };
}

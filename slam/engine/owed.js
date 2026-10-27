// Shared bills with arrangements, and Owed to you (shared bills brief, 2026-10-27).
//
// A shared bill lists the other people on it (expense.sharers, a Fact whose value is a list), one record each:
//   { id, name, share: { mode: even | percent | amount, value }, payBack, every, start, month, askOn, since,
//     paidThrough, credit, payments: [{ date, amount, into }] }
// share: an even split of the bill (with you), a part (0.25), or dollars each charge.
// payBack, only when you pay all of it (expense.whoPays "whole"):
//   each    owes their share every charge until marked paid
//   ahead   paid ahead through paidThrough; owes again after it
//   every   settles every `every` months from `start`; owes a growing balance in between
//   yearly  one payment a year, in `month` (1 to 12)
//   cover   you cover them: their share is your cost and is never owed
// paidThrough: every charge on or before this day is settled; credit: dollars paid toward the next charges.
// What is owed is never stored: it is figured from the bill's charge days, so it can never drift.
//
// Money lent directly (spine.lent): [{ id, person, amount (Fact), date, due (Fact date or null), kind: loan | gift,
//   repaid }]. A gift is never owed.
//
// Compatibility: a bill shared the old way (sharedWith, yourShare, whoPays, no sharers) loads unchanged and reads as
// the same arrangement (arrangementOf): the other people as "Person 2", "Person 3", their parts making up the rest,
// paid back each time from the file's date, so nothing is owed until a charge after it. Its cost to you is the same.

import { valueOf as v, getAt, setAt, fact, addDays, addMonths, round2, daysInMonth } from './spine.js';
import { shareOf, theirAmount, yourPart } from './sharing.js';
export { theirAmount, yourPart };

export const PAYBACK = ['each', 'ahead', 'every', 'yearly', 'cover'];
export const SHARE_MODES = ['even', 'percent', 'amount'];
export const PAYBACK_WORDS = { each: 'Each time', ahead: 'Paid ahead', every: 'Every few months', yearly: 'Once a year', cover: 'I cover them' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthWord = (iso) => MONTHS[+iso.slice(5, 7) - 1];
const monthYear = (iso, asOf) => monthWord(iso) + (iso.slice(0, 4) !== asOf.slice(0, 4) ? ' ' + iso.slice(0, 4) : '');
const dollars = (x) => '$' + Math.round(x).toLocaleString('en-US');
const dim = (ym) => daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7));
// A day n months on, kept inside its month (Jan 31 plus 1 is Feb 28).
const addMonthsIso = (iso, n) => { const ym = addMonths(iso.slice(0, 7), n); return ym + '-' + String(Math.min(+iso.slice(8, 10), dim(ym))).padStart(2, '0'); };

// ---------------------------------------------------------------- the bill's charge days
// The day of the month a bill charges: its pay day, else the day it renews, else its start's day, else the 1st.
function chargeDay(e) {
  if (e.payDay && v(e.payDay)) return v(e.payDay);
  if (e.renews && v(e.renews)) return +v(e.renews).slice(8, 10);
  if (e.start) return +e.start.slice(8, 10);
  return 1;
}
const STEP_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
// Every charge of a bill on a day from `from` to `to`, both included, as ISO dates.
export function chargeDates(e, from, to) {
  if (!from || !to || from > to) return [];
  const out = [];
  const startOk = (d) => (!e.start || d >= e.start) && (!e.end || d <= e.end);
  if (STEP_MONTHS[e.cadence]) {
    const step = STEP_MONTHS[e.cadence], day = chargeDay(e);
    // Anchored on the renewal (or start) month, so a yearly bill charges in its own month.
    const anchor = (e.renews && v(e.renews)) || e.start || from;
    let ym = anchor.slice(0, 7);
    while (ym > from.slice(0, 7)) ym = addMonths(ym, -step);
    for (let i = 0; i < 1200 && ym <= to.slice(0, 7); i++, ym = addMonths(ym, step)) {
      const d = ym + '-' + String(Math.min(day, dim(ym))).padStart(2, '0');
      if (d >= from && d <= to && startOk(d)) out.push(d);
    }
    return out;
  }
  if (e.cadence === 'semimonthly') {
    for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = addMonths(ym, 1)) for (const d of [ym + '-01', ym + '-15']) if (d >= from && d <= to && startOk(d)) out.push(d);
    return out;
  }
  const step = { weekly: 7, biweekly: 14 }[e.cadence];
  if (!step) return [];
  let d = e.start || from;
  while (d < from) d = addDays(d, step);
  for (let i = 0; i < 2000 && d <= to; i++, d = addDays(d, step)) if (startOk(d)) out.push(d);
  return out;
}

// ---------------------------------------------------------------- the arrangement
const cleanPerson = (p, i) => ({
  id: p.id || 'p' + (i + 1), name: p.name || 'Person ' + (i + 2),
  share: p.share && SHARE_MODES.includes(p.share.mode) ? { mode: p.share.mode, value: p.share.mode === 'even' ? null : p.share.value ?? null } : { mode: 'even', value: null },
  payBack: PAYBACK.includes(p.payBack) ? p.payBack : 'each',
  every: Number.isInteger(p.every) && p.every >= 1 ? p.every : 3, start: p.start || null,
  month: Number.isInteger(p.month) && p.month >= 1 && p.month <= 12 ? p.month : null,
  askOn: p.askOn || null, since: p.since || null, paidThrough: p.paidThrough || null,
  credit: typeof p.credit === 'number' && p.credit > 0 ? p.credit : 0, payments: Array.isArray(p.payments) ? p.payments : []
});
// How a bill is shared: { shared, whoPays: part | whole, people: [...], fromOld }. Not shared: people is empty.
export function arrangementOf(spine, e) {
  const list = e.sharers ? v(e.sharers) : null;
  const sh = shareOf(spine, e);
  if (Array.isArray(list) && list.length) return { shared: true, whoPays: sh.whoPays === 'whole' ? 'whole' : 'part', people: list.map(cleanPerson), fromOld: false };
  if (!sh.shared || !sh.people || sh.people < 2) return { shared: !!sh.shared, whoPays: sh.whoPays || 'part', people: [], fromOld: false };
  // The old way: N people with you, your part as a percent (or even). Each other person takes an equal piece of the rest.
  const others = sh.people - 1, since = spine.meta.asOf;
  const theirs = sh.share === null ? null : (1 - sh.share) / others;
  const people = Array.from({ length: others }, (_, i) => cleanPerson({ id: 'p' + (i + 1), name: 'Person ' + (i + 2), share: theirs === null || Math.abs(theirs - 1 / sh.people) < 1e-9 ? { mode: 'even' } : { mode: 'percent', value: theirs }, payBack: 'each', since, paidThrough: since }, i));
  return { shared: true, whoPays: sh.whoPays === 'whole' ? 'whole' : 'part', people, fromOld: true };
}
// A shared bill's three numbers for one charge: what leaves your account, your part (anyone you cover included), and
// what comes back. Null when a part or the amount is missing.
export function billNumbers(arr, bill) {
  if (bill === null || bill === undefined) return null;
  const mine = yourPart(arr, bill);
  if (mine === null) return null;
  const yours = round2(bill * mine);
  return arr.whoPays === 'whole' ? { leaves: bill, yours, back: round2(bill - yours), share: mine } : { leaves: yours, yours, back: 0, share: mine };
}

// ---------------------------------------------------------------- what one person owes
// When to ask: the person's own day when they picked one, else by how they pay back.
function askDay(p, firstUnpaid, nextCharge) {
  if (p.askOn && (!p.paidThrough || p.askOn > p.paidThrough)) return p.askOn;
  const after = firstUnpaid || nextCharge;
  if (!after) return null;
  if (p.payBack === 'each') return after;
  if (p.payBack === 'ahead') return p.paidThrough ? addDays(p.paidThrough, 1) : after;
  if (p.payBack === 'every') {
    const start = p.start || p.since || after;
    let d = start;
    for (let i = 0; i < 600 && d < after; i++) d = addMonthsIso(start, p.every * (i + 1));
    return d;
  }
  if (p.payBack === 'yearly') {
    const m = p.month || +after.slice(5, 7);
    let d = after.slice(0, 4) + '-' + String(m).padStart(2, '0') + '-01';
    if (d < after) d = (+after.slice(0, 4) + 1) + d.slice(4);
    return d;
  }
  return null;
}
// { owed, charges: [{ date, amount }], askOn, coveredThrough, status } for one person on a bill, as of a day.
export function personStatus(spine, e, arr, p, asOf) {
  const bill = v(e.amount);
  const each = theirAmount(arr, p, bill);
  if (arr.whoPays !== 'whole') return { owed: 0, charges: [], askOn: null, coveredThrough: null, each, status: 'Pays their own part' };
  if (p.payBack === 'cover') return { owed: 0, charges: [], askOn: null, coveredThrough: null, each, status: 'You cover them' };
  if (each === null) return { owed: null, charges: [], askOn: null, coveredThrough: null, each, status: 'Their part is not set yet' };
  const from = p.paidThrough ? addDays(p.paidThrough, 1) : p.since || asOf;
  const due = from <= asOf ? chargeDates(e, from, asOf) : [];
  let credit = p.credit;
  const charges = [];
  for (const d of due) { const left = round2(Math.max(0, each - credit)); credit = round2(Math.max(0, credit - each)); if (left > 0) charges.push({ date: d, amount: left }); }
  const owed = round2(charges.reduce((t, c) => t + c.amount, 0));
  const next = chargeDates(e, addDays(asOf, 1), addMonthsIso(asOf, 13))[0] || null;
  const askOn = askDay(p, charges.length ? charges[0].date : null, next);
  const coveredThrough = p.paidThrough && p.paidThrough >= asOf ? p.paidThrough : null;
  let status;
  if (coveredThrough && !owed) status = (p.payBack === 'ahead' ? 'Covered through ' : 'Paid through ') + monthYear(coveredThrough, asOf);
  else if (owed > 0) status = 'Owes ' + dollars(owed) + ' since ' + monthWord(charges[0].date);
  else status = askOn ? 'Ask on ' + monthWord(askOn) + ' ' + +askOn.slice(8, 10) : 'Nothing owed';
  return { owed, charges, askOn, coveredThrough, each, status };
}
// The friendly line to send on the ask day: "Hey! Your share of Netflix for Sep to Nov is $13."
export function askMessage(e, p, st) {
  const span = st.charges.length ? monthWord(st.charges[0].date) + (st.charges.length > 1 ? ' to ' + monthWord(st.charges[st.charges.length - 1].date) : '') : null;
  return 'Hey! Your share of ' + e.label + (span ? ' for ' + span : '') + ' is ' + dollars(st.owed || st.each || 0) + '.';
}

// ---------------------------------------------------------------- Owed to you
// Every person, totaled across every bill they share and money lent to them, oldest line first:
// [{ key, name, total, lines: [{ kind: bill | loan, label, amount, since, expenseId?, personId?, lentId? }] }].
export function owedToYou(spine, asOf = spine.meta.asOf) {
  const people = new Map();
  const put = (name, line) => {
    const key = name.trim().toLowerCase();
    if (!people.has(key)) people.set(key, { key, name: name.trim(), total: 0, lines: [] });
    const x = people.get(key);
    x.lines.push(line); x.total = round2(x.total + (line.amount || 0));
  };
  for (const e of spine.expenses || []) {
    const arr = arrangementOf(spine, e);
    if (arr.whoPays !== 'whole') continue;
    for (const p of arr.people) {
      const st = personStatus(spine, e, arr, p, asOf);
      if (st.owed > 0) put(p.name, { kind: 'bill', label: e.label, amount: st.owed, since: st.charges[0].date, expenseId: e.id, personId: p.id, status: st.status, askOn: st.askOn });
    }
  }
  for (const l of spine.lent || []) {
    if (l.kind === 'gift') continue;
    const left = round2((v(l.amount) || 0) - (l.repaid || 0));
    if (left > 0) put(l.person, { kind: 'loan', label: 'Lent on ' + l.date, amount: left, since: l.date, lentId: l.id, due: l.due ? v(l.due) : null });
  }
  for (const x of people.values()) x.lines.sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0));
  return [...people.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
export const owedTotal = (spine, asOf) => round2(owedToYou(spine, asOf).reduce((t, x) => t + x.total, 0));
// Names already used on bills and loans, for the name box.
export const sharerNames = (spine) => [...new Set([...(spine.expenses || []).flatMap((e) => arrangementOf(spine, e).people.map((p) => p.name)), ...(spine.lent || []).map((l) => l.person)].filter((n) => n && !/^Person \d+$/.test(n)))].sort();

// ---------------------------------------------------------------- changes
const sharersPath = (id) => 'expenses.' + id + '.sharers';
// Put a bill's people (and who pays) in the new shape; an old bill's fields go, since the list now says it all.
export function setSharers(spine, expenseId, people, whoPays, today) {
  const e = (spine.expenses || []).find((x) => x.id === expenseId);
  if (!e) throw new Error('No expense ' + expenseId);
  const next = { ...e, shared: fact(people.length > 0, { kind: 'known', asOf: today, source: 'typed' }), whoPays: fact(whoPays === 'whole' ? 'whole' : 'part', { kind: 'known', asOf: today, source: 'typed' }) };
  delete next.sharedWith; delete next.yourShare;
  if (people.length) next.sharers = fact(people.map((p, i) => { return cleanPerson({ since: today, ...p }, i); }), { kind: 'known', asOf: today, source: 'typed' });
  else delete next.sharers;
  return { ...spine, expenses: spine.expenses.map((x) => (x.id === expenseId ? next : x)) };
}
const withPerson = (spine, expenseId, personId, fn, today) => {
  const e = (spine.expenses || []).find((x) => x.id === expenseId);
  const arr = arrangementOf(spine, e);
  const people = arr.people.map((p) => (p.id === personId ? fn(p, e, arr) : p));
  return setSharers(spine, expenseId, people, arr.whoPays, today);
};
// A payment from a person: the oldest charges first; whole charges move paidThrough, the rest is credit. With
// `into`, the money lands in that account (its balance goes up), so it only counts as cash once it has landed.
export function markPaid(spine, expenseId, personId, amount, { today, into = null, asOf = spine.meta.asOf }) {
  let s = withPerson(spine, expenseId, personId, (p, e, arr) => {
    let left = round2(amount + p.credit), through = p.paidThrough;
    const each = theirAmount(arr, p, v(e.amount));
    // Every charge owed, then (paying ahead) the ones after today.
    const owedDays = chargeDates(e, p.paidThrough ? addDays(p.paidThrough, 1) : p.since || asOf, asOf);
    const ahead = chargeDates(e, addDays(asOf, 1), addMonthsIso(asOf, 36));
    for (const d of [...owedDays, ...ahead]) { if (!(each > 0) || left + 1e-9 < each) break; left = round2(left - each); through = d; }
    return { ...p, paidThrough: through, credit: left, payments: [...p.payments, { date: today, amount, into }] };
  }, today);
  if (into) s = landIn(s, into, amount, today);
  return s;
}
// Paid ahead: "paid N months" or "paid through a day".
export const setPaidThrough = (spine, expenseId, personId, through, today) => withPerson(spine, expenseId, personId, (p) => ({ ...p, paidThrough: through, credit: 0 }), today);
function landIn(spine, accountId, amount, today) {
  const path = 'accounts.' + accountId + '.balance', f = getAt(spine, path);
  if (!f) return spine;
  return setAt(spine, path, fact(round2((v(f) || 0) + amount), { kind: f.kind === 'missing' ? 'rough' : f.kind, asOf: today, source: 'typed' }));
}
// Money lent directly.
export function addLent(spine, { person, amount, date, due = null, kind = 'loan' }, today) {
  const list = spine.lent || [];
  let n = list.length + 1;
  while (list.some((x) => x.id === 'lent' + n)) n++;
  const item = { id: 'lent' + n, person: person.trim(), amount: fact(amount, { kind: 'known', asOf: today, source: 'typed' }), date, due: due ? fact(due, { kind: 'known', asOf: today, source: 'typed' }) : null, kind: kind === 'gift' ? 'gift' : 'loan', repaid: 0 };
  return { ...spine, lent: [...list, item] };
}
export const setLentKind = (spine, id, kind) => ({ ...spine, lent: (spine.lent || []).map((x) => (x.id === id ? { ...x, kind: kind === 'gift' ? 'gift' : 'loan' } : x)) });
export function repayLent(spine, id, amount, { today, into = null }) {
  let s = { ...spine, lent: (spine.lent || []).map((x) => (x.id === id ? { ...x, repaid: round2((x.repaid || 0) + amount) } : x)) };
  if (into) s = landIn(s, into, amount, today);
  return s;
}
// Settled up: every line a person owes, paid in full (one change, so one Undo).
export function settleUp(spine, name, { today, into = null, asOf = spine.meta.asOf }) {
  const who = owedToYou(spine, asOf).find((x) => x.key === name.trim().toLowerCase());
  if (!who) return spine;
  let s = spine;
  for (const l of who.lines) s = l.kind === 'bill' ? markPaid(s, l.expenseId, l.personId, l.amount, { today, asOf }) : repayLent(s, l.lentId, l.amount, { today });
  if (into) s = landIn(s, into, who.total, today);
  return s;
}

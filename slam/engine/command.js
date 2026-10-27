// The command bar (overnight Track B): a line typed in plain words, read as one change, said before it is made.
//   "visa 2700"                       sets the Visa balance
//   "rent 1950"                       sets the Rent amount
//   "add netflix 15.99 on the 12th"   adds a subscription charged on the 12th
//   "go to plan"                      opens a screen (screens are passed in, with their addresses)
//   "mark rent happened"              logs this month's rent as happened, at its planned amount
//   "undo"                            the last change
// parseCommand returns null (not a command; the bar searches instead) or { kind, words, run?, href? }. run is a
// function from the household to the next one, so the page makes it through change() and Undo takes it back.

import { getAt, valueOf as v } from './spine.js';
import { editFact, parseInput, markSubscription, setChargeDay, confirmOccurrence } from './edits.js';
import { addWithAnswers } from './add.js';
import { calendar } from './calendar.js';

const dollars = (x) => '$' + (Math.round(x * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 });
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nameOf = (x) => (x && x.name && typeof x.name === 'object' ? v(x.name) : x && x.name) || (x && x.label) || '';

// Everything a name can point at: [{ words, path, what, label }].
function targets(spine) {
  const out = [];
  for (const a of spine.accounts || []) out.push({ words: nameOf(a), path: 'accounts.' + a.id + '.balance', what: 'balance', label: nameOf(a) });
  for (const d of spine.debts || []) out.push({ words: nameOf(d), path: 'debts.' + d.id + '.balance', what: 'balance', label: nameOf(d) });
  for (const e of spine.expenses || []) out.push({ words: e.label, path: 'expenses.' + e.id + '.amount', what: 'amount', label: e.label, expense: e });
  for (const i of spine.income || []) out.push({ words: i.label, path: 'income.' + i.id + '.amount', what: 'amount', label: i.label, income: i });
  for (const g of spine.goals || []) if (g.target) out.push({ words: g.label, path: 'goals.' + g.id + '.target', what: 'target', label: g.label });
  return out.filter((t) => t.words);
}
// The one best match for a name: the same words, else the start of the words, else inside them; ties are no match.
export function findTarget(spine, name) {
  const q = norm(name);
  if (!q) return null;
  const all = targets(spine);
  for (const test of [(w) => w === q, (w) => w.startsWith(q), (w) => w.split(' ').some((x) => x.startsWith(q)), (w) => w.includes(q)]) {
    const hits = all.filter((t) => test(norm(t.words)));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}
const ORD = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

export function parseCommand(spine, rules, text, { today, screens = [] } = {}) {
  const t = String(text || '').trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (/^(undo|undo that|take that back)$/.test(low)) return { kind: 'undo', words: 'Undo the last change' };
  let m = low.match(/^(?:go to|open|show)\s+(.+)$/);
  if (m) {
    const q = norm(m[1]);
    const hit = screens.find(([w]) => norm(w) === q) || screens.find(([w]) => norm(w).startsWith(q)) || screens.find(([w]) => norm(w).includes(q));
    return hit ? { kind: 'go', words: 'Open ' + hit[0], href: hit[1] } : null;
  }
  m = t.match(/^mark\s+(.+?)\s+(?:as\s+)?(?:happened|paid|done)$/i);
  if (m) {
    const target = findTarget(spine, m[1]);
    if (!target || !(target.expense || target.income)) return null;
    const id = (target.expense || target.income).id;
    const ym = today.slice(0, 7);
    const ev = calendar(spine, rules, { from: ym, months: 1 }).months[0].events.filter((e) => e.sourceId === id && e.key && e.date && e.date <= today && !e.logged).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!ev) return { kind: 'none', words: target.label + ' has nothing due by today to mark' };
    return { kind: 'change', words: target.label + ' on ' + ev.date + ' happened: ' + dollars(ev.amount), run: (s) => confirmOccurrence(s, ev.key, { amount: ev.amount }) };
  }
  m = t.match(/^add\s+(.+?)\s+\$?([\d.,]+k?)(?:\s+(?:a|per|each)\s+(month|year|week))?(?:\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?)?$/i);
  if (m) {
    const a = parseInput('money', m[2]);
    if (!a.ok) return null;
    const label = m[1].replace(/\b\w/g, (c) => c.toUpperCase());
    const cadence = { month: 'monthly', year: 'yearly', week: 'weekly' }[(m[3] || 'month').toLowerCase()];
    const day = m[4] ? +m[4] : null;
    if (day !== null && (day < 1 || day > 31)) return null;
    return { kind: 'change', words: 'Add ' + label + ': ' + dollars(a.value) + ' a ' + (m[3] || 'month').toLowerCase() + (day ? ', charged on the ' + ORD(day) : ''),
      run: (s) => {
        const made = addWithAnswers(s, { collection: 'expenses', type: null, label, amount: a.value, cadence, fat: null }, today);
        let n = made.spine;
        if (day) { n = markSubscription(n, made.id, true, today); n = setChargeDay(n, made.id, day, today); }
        return n;
      } };
  }
  m = t.match(/^(.+?)\s+(?:to\s+|is\s+|=\s*)?\$?(-?[\d.,]+k?)$/i);
  if (m) {
    const target = findTarget(spine, m[1]);
    const a = parseInput('money', m[2]);
    if (!target || !a.ok) return null;
    const now = getAt(spine, target.path), was = now ? v(now) : null;
    const value = a.value;
    return { kind: 'change', words: 'Set ' + target.label + ' ' + target.what + ' to ' + dollars(value) + (typeof was === 'number' ? ' (now ' + dollars(was) + ')' : ''), run: (s) => editFact(s, target.path, 'set', { value, kind: 'known', today }) };
  }
  return null;
}

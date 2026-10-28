// The command bar (overnight Track B): a line typed in plain words, read as one change, said before it is made.
//   "visa 2700"                       sets the Visa balance
//   "rent 1950"                       sets the Rent amount
//   "add netflix 15.99 on the 12th"   adds a subscription charged on the 12th
//   "go to plan"                      opens a screen (screens are passed in, with their addresses)
//   "mark rent happened"              logs this month's rent as happened, at its planned amount
//   "undo"                            the last change
//   "amex gold 2000 24%"              adds a card from the card list: owed $2,000 at 24%, its fee as a guess (S-285)
//   "vtsax 18k roth"                  adds a Roth IRA holding that fund: $18,000, its fee and mix as guesses
//   "gym 45"                          adds a bill people have, when the household has none by that name
// parseCommand returns null (not a command; the bar searches instead) or { kind, words, run?, href? }. run is a
// function from the household to the next one, so the page makes it through change() and Undo takes it back.

import { getAt, valueOf as v } from './spine.js';
import { editFact, parseInput, markSubscription, setChargeDay, confirmOccurrence } from './edits.js';
import { addWithAnswers } from './add.js';
import { addMore } from './add.js';
import { calendar } from './calendar.js';
import { setAt } from './spine.js';
import { matchScore, cardFills, fundFills, LIBRARY_SOURCE } from './library.js';
import { readMoney, readRate } from './natural.js';

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

// A new item typed in one line (S-285), from the libraries passed in ({ cards, funds, expenses }): a card, a fund in an
// account, or a bill people have. The name must be the library's name or a short form of it; the rest is an amount,
// then a rate ("24%"), a due day ("the 15th") or the kind of account ("roth", "ira", "401k", "hsa").
const WRAPPERS = { roth: 'roth_ira', ira: 'traditional_ira', '401k': 'k401', '401(k)': 'k401', hsa: 'hsa', brokerage: 'brokerage', taxable: 'brokerage' };
const WRAP_WORDS = { roth_ira: 'Roth IRA', traditional_ira: 'IRA', k401: '401(k)', hsa: 'HSA', brokerage: 'brokerage account' };
export function quickAdd(spine, text, { library = {}, today }) {
  const m = String(text || '').trim().match(/^(.+?)\s+(\$?\d[\d,]*(?:\.\d+)?k?)((?:\s+\S+)*)$/i);
  if (!m) return null;
  const amount = readMoney(m[2]);
  if (!amount.ok) return null;
  const rest = m[3].trim().toLowerCase().split(/\s+/).filter(Boolean);
  let rate = null, day = null, wrap = null;
  for (let i = 0; i < rest.length; i++) {
    const w = rest[i];
    if (/^\d+(\.\d+)?%$/.test(w)) rate = readRate(w).value;
    else if (/^(\d{1,2})(st|nd|rd|th)$/.test(w) && +w.match(/\d+/)[0] <= 31) day = +w.match(/\d+/)[0];
    else if (WRAPPERS[w]) wrap = WRAPPERS[w];
    else if (!['due', 'on', 'the', 'at', 'in', 'a', 'apr'].includes(w)) return null;
  }
  const best = (list, words) => list.map((x) => ({ x, s: matchScore(words(x), m[1]) })).filter((y) => y.s !== null && y.s <= 1).sort((a, b) => a.s - b.s)[0]?.x || null;
  const guess = (sp, path, value) => (value === null || value === undefined ? sp : setAt(sp, path, { value, kind: 'rough', asOf: today, source: LIBRARY_SOURCE }));
  const card = !wrap && library.cards ? best(library.cards, (c) => ({ words: c.name, aliases: c.aliases })) : null;
  if (card) {
    return { kind: 'change', words: 'Add ' + card.name + ': owed ' + dollars(amount.value) + (rate !== null ? ' at ' + Math.round(rate * 10000) / 100 + '%' : ', rate a guess') + (day ? ', due the ' + ORD(day) : ''),
      run: (s) => {
        let made = addWithAnswers(s, { collection: 'debts', type: 'credit_card', label: card.name, amount: amount.value }, today);
        made = addMore(made, { rate, dueDay: day }, today);
        const base = 'debts.' + made.id, f = cardFills(card);
        let n = made.spine;
        for (const k of ['annualFee', 'rewardsRate', 'institution']) n = guess(n, base + '.' + k, f[k]);
        if (rate === null) n = guess(n, base + '.apr', f.apr);
        return n;
      } };
  }
  const fund = library.funds && rate === null && day === null ? best(library.funds.funds, (f) => ({ words: f.ticker || f.name, aliases: [f.name, ...f.aliases] })) : null;
  if (fund) {
    const type = wrap || 'brokerage';
    const label = WRAP_WORDS[type] + ' (' + (fund.ticker || fund.name) + ')';
    return { kind: 'change', words: 'Add a ' + WRAP_WORDS[type] + ' holding ' + (fund.ticker ? fund.ticker + ', ' : '') + fund.name + ': ' + dollars(amount.value),
      run: (s) => {
        const made = addWithAnswers(s, { collection: 'accounts', type, label, amount: amount.value }, today);
        const f = fundFills(fund, library.funds, +today.slice(0, 4));
        let n = made.spine;
        for (const k of ['expenseRatio', 'stockShare']) n = guess(n, 'accounts.' + made.id + '.' + k, f[k]);
        return n;
      } };
  }
  const bill = !wrap && rate === null && library.expenses ? best(library.expenses, (e) => e) : null;
  if (bill) {
    const v = bill.value || {};
    return { kind: 'change', words: 'Add ' + bill.words + ': ' + amount.words + (day ? ', charged on the ' + ORD(day) : ''),
      run: (s) => {
        const made = addWithAnswers(s, { collection: 'expenses', type: null, label: bill.words, amount: amount.value, cadence: 'monthly', fat: v.fat || null }, today);
        let n = made.spine;
        if (v.need === false) n = editFact(n, 'expenses.' + made.id + '.need', 'set', { value: false, kind: 'known', today });
        if (day || v.subscription) { n = markSubscription(n, made.id, true, today); if (day) n = setChargeDay(n, made.id, day, today); }
        return n;
      } };
  }
  return null;
}

export function parseCommand(spine, rules, text, { today, screens = [], library = null } = {}) {
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
    if (!target || !a.ok) return library ? quickAdd(spine, t, { library, today }) : null;
    const now = getAt(spine, target.path), was = now ? v(now) : null;
    const value = a.value;
    return { kind: 'change', words: 'Set ' + target.label + ' ' + target.what + ' to ' + dollars(value) + (typeof was === 'number' ? ' (now ' + dollars(was) + ')' : ''), run: (s) => editFact(s, target.path, 'set', { value, kind: 'known', today }) };
  }
  return library ? quickAdd(spine, t, { library, today }) : null;
}

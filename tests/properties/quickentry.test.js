'use strict';
/* Property tests for engines/quickentry.js (Coach Mode quick entry, D-340).
   The parser takes no household first, so the generic four do not apply;
   its own rules are checked directly: an amount reads back to the exact
   cents typed, a line that names no row or carries no number is a note
   (never a number), nothing is ever written that the line did not say,
   and the same line always gives the same plan. */
const H = require('./_harness.js');
const { fc, prop, TABLES } = H;
const Q = H.engine('quickentry');
const T = TABLES.quickEntry;

const words = [].concat.apply([], T.entries.map((e) => e.words));
const dollarsCents = fc.integer({ min: 0, max: 99999999 });
function typed(cents) { const d = Math.floor(cents / 100), c = cents % 100; return c ? d + '.' + String(c).padStart(2, '0') : String(d); }
const junk = fc.stringMatching(/^[a-z]{3,9}$/).filter((w) => !words.some((x) => x === w || x.split(' ')[0] === w) && ['match', 'left', 'mo', 'month', 'year', 'yr', 'monthly', 'yearly', 'annual', 'annually', 'weekly', 'payments', 'months'].indexOf(w) === -1);

const props = [
  prop('an amount typed in dollars and cents reads back to exactly those cents', dollarsCents, (cents) => {
    const r = Q.amountCents(typed(cents), null);
    return r === cents || ('typed ' + typed(cents) + ' read ' + r);
  }),
  prop('k and m multiply exactly, and a fraction finer than a cent is refused', fc.record({ n: fc.integer({ min: 0, max: 99999 }), d: fc.integer({ min: 0, max: 9 }), s: fc.constantFrom('k', 'm') }), (o) => {
    const r = Q.amountCents(o.n + '.' + o.d, o.s);
    const want = (o.n * 10 + o.d) * (o.s === 'k' ? 1000 : 1000000) * 10;
    return r === (Number.isSafeInteger(want) ? want : null) || ('got ' + r + ' want ' + want);
  }),
  prop('a line that starts with no known word is a note, whole, and writes nothing', fc.tuple(junk, fc.array(fc.oneof(dollarsCents.map(typed), junk), { maxLength: 4 })), (t) => {
    const line = [t[0]].concat(t[1]).join(' ');
    const p = Q.parse(line, T, {});
    return (p.kind === 'note' && p.writes.length === 0 && p.add === null && p.note === line) || JSON.stringify(p);
  }),
  prop('a known word with no number is a note, never a zero', fc.tuple(fc.constantFrom.apply(fc, words), fc.array(junk, { maxLength: 3 })), (t) => {
    const line = [t[0]].concat(t[1]).join(' ');
    const p = Q.parse(line, T, {});
    return (p.kind === 'note' && p.writes.length === 0) || JSON.stringify(p);
  }),
  prop('a single-amount row writes exactly the typed cents, once', fc.tuple(fc.constantFrom.apply(fc, T.entries.filter((e) => e.kind === 'field' && e.period === 'month').map((e) => e.words[0])), dollarsCents), (t) => {
    const p = Q.parse(t[0] + ' ' + typed(t[1]), T, {});
    return (p.kind === 'rows' && p.writes.length === 1 && p.writes[0].value === t[1]) || JSON.stringify(p);
  }),
  prop('a debt line: every figure written is one the line said, and nothing is worked back', fc.record({ w: fc.constantFrom('car', 'card', 'student loan', 'mortgage'), bal: fc.option(dollarsCents, { nil: null }), pay: fc.option(dollarsCents, { nil: null }), rate: fc.option(fc.integer({ min: 0, max: 3500 }), { nil: null }), left: fc.option(fc.integer({ min: 1, max: 360 }), { nil: null }) }), (o) => {
    const parts = [o.w];
    if (o.bal !== null) parts.push(typed(o.bal));
    if (o.pay !== null) parts.push(typed(o.pay) + '/mo');
    if (o.rate !== null) parts.push((o.rate / 100) + '%');
    if (o.left !== null) parts.push(o.left + ' left');
    const p = Q.parse(parts.join(' '), T, {});
    if (o.bal === null && o.pay === null && o.rate === null) return p.kind === 'note' || 'no number, but ' + p.kind;
    const by = {}; p.writes.forEach((w) => { by[w.field] = w.value; });
    if (o.bal !== null && by.debtBalance !== o.bal) return 'balance ' + by.debtBalance;
    if (o.bal === null && 'debtBalance' in by) return 'a balance nobody said';
    if (o.pay !== null && by.debtMinPayment !== o.pay) return 'payment ' + by.debtMinPayment;
    if (o.rate !== null && Math.abs(by.debtRate - o.rate / 10000) > 1e-12) return 'rate ' + by.debtRate;
    if (o.left !== null && !(p.note && p.note.indexOf(o.left + ' payments left') !== -1)) return 'the payments left were not kept as a note';
    return true;
  }),
  prop('the same line gives the same plan twice', fc.string({ maxLength: 40 }), (s) => JSON.stringify(Q.parse(s, T, {})) === JSON.stringify(Q.parse(s, T, {})) || 'differs')
];
module.exports = H.suite('quickentry', props);
if (require.main === module) H.main(module.exports);

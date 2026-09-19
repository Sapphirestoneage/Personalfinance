'use strict';
/* Property tests for engines/merchants.js (D-306). The four generic
   properties, plus: every log line lands in exactly one merchant and the
   merchants add up to the log; a rule files a merchant and refile names
   only the lines it moves; the slope's two lines cumulate to the same total
   when nothing was bought ahead or paid late, and part by exactly what was. */
const H = require('./_harness.js');
const { fc, prop, Schema, TABLES, arbSpec, build } = H;
const M = H.engine('merchants');

function withLog(spec, entries) {
  const h = build(spec);
  h.expenses = Schema.createExpenses(h.expenses);
  h.expenses.entries = entries;
  return h;
}
const pad = (n) => String(n).padStart(2, '0');
const arbLine = fc.record({
  who: fc.constantFrom('STREAMFLIX', 'CORNER MARKET 12', 'CITY TRANSIT', 'POWER CO', 'BOOKS AND MORE'),
  cents: fc.integer({ min: 100, max: 50000 }),
  day: fc.integer({ min: 1, max: 28 }),
  ahead: fc.integer({ min: -10, max: 10 })
});

const props = H.generic('merchants').concat([
  prop('every dated line lands in exactly one merchant, and the merchants add up to the log', fc.record({ spec: arbSpec, lines: fc.array(arbLine, { minLength: 0, maxLength: 12 }) }), (o) => {
    const entries = o.lines.map((l, i) => Schema.createExpenseEntry({ id: 'e' + i, categoryId: 'other', period: 'once', amountCents: l.cents, date: '2026-09-' + pad(l.day), descriptor: l.who }));
    const list = M.list(withLog(o.spec, entries), TABLES);
    const count = list.reduce((s, m) => s + m.count, 0);
    if (count !== entries.length) return count + ' lines across merchants for ' + entries.length;
    const total = list.reduce((s, m) => s + m.totalCents, 0);
    const sum = entries.reduce((s, e) => s + e.amountCents, 0);
    if (total !== sum) return 'merchants total ' + total + ' for a log of ' + sum;
    const keys = list.map((m) => m.key);
    if (new Set(keys).size !== keys.length) return 'a merchant twice';
    for (let i = 1; i < list.length; i++) if (list[i].totalCents > list[i - 1].totalCents) return 'not largest first';
    return true;
  }),
  prop('a rule files its merchant, refile names only the lines it moves, and removing the rule moves nothing', fc.record({ spec: arbSpec, lines: fc.array(arbLine, { minLength: 1, maxLength: 10 }), cat: fc.constantFrom('groceries', 'transportation', 'utilities', 'subscriptions') }), (o) => {
    const entries = o.lines.map((l, i) => Schema.createExpenseEntry({ id: 'e' + i, categoryId: 'other', period: 'once', amountCents: l.cents, date: '2026-09-' + pad(l.day), descriptor: l.who }));
    const h = withLog(o.spec, entries);
    const k = M.key(o.lines[0].who);
    h.expenses.rules = M.setRule(h.expenses.rules, k, o.cat, o.lines[0].who);
    const m = M.list(h, TABLES).filter((x) => x.key === k)[0];
    if (!m || !m.ruled || m.categoryId !== o.cat) return 'the merchant does not file by its rule: ' + JSON.stringify(m && { ruled: m.ruled, categoryId: m.categoryId });
    const moves = M.refile(h);
    const expected = entries.filter((e) => M.key(e.descriptor) === k).length;
    if (moves.length !== expected) return moves.length + ' moves for ' + expected + ' lines of that merchant';
    if (!moves.every((x) => x.categoryId === o.cat)) return 'a move to the wrong category';
    if (M.categoryFor(o.lines[0].who, h) !== o.cat) return 'categoryFor disagrees';
    h.expenses.rules = M.setRule(h.expenses.rules, k, null);
    return (h.expenses.rules.length === 0 && M.refile(h).length === 0) || 'the rule did not go';
  }),
  prop('the slope cumulates to the log, never falls, and parts by exactly what was bought ahead or paid late', fc.record({ spec: arbSpec, lines: fc.array(arbLine, { minLength: 0, maxLength: 12 }) }), (o) => {
    const entries = o.lines.map((l, i) => {
      const d = new Date(2026, 8, l.day + l.ahead);
      const f = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      return Schema.createExpenseEntry({ id: 'e' + i, categoryId: 'other', period: 'once', amountCents: l.cents, date: '2026-09-' + pad(l.day), forDate: l.ahead ? f : null, descriptor: l.who });
    });
    const s = M.slope(withLog(o.spec, entries), { month: '2026-09', today: '2026-10-15' });
    if (s.days.length !== 30) return s.days.length + ' days in September';
    const sum = entries.reduce((a, e) => a + e.amountCents, 0);
    if (s.paidCents !== sum) return 'paid ' + s.paidCents + ' for a log of ' + sum;
    for (let i = 1; i < s.days.length; i++) if (s.days[i].cumPaidCents < s.days[i - 1].cumPaidCents || s.days[i].cumForCents < s.days[i - 1].cumForCents) return 'a line fell on ' + s.days[i].date;
    if (s.days.length && s.days[s.days.length - 1].cumPaidCents !== s.paidCents) return 'the paid line does not reach its total';
    const ahead = entries.filter((e) => e.forDate && e.forDate > e.date), behind = entries.filter((e) => e.forDate && e.forDate < e.date);
    if (s.aheadCount !== ahead.length || s.behindCount !== behind.length) return 'ahead ' + s.aheadCount + '/' + ahead.length + ', behind ' + s.behindCount + '/' + behind.length;
    if (s.aheadCents !== ahead.reduce((a, e) => a + e.amountCents, 0)) return 'aheadCents off';
    const inWindow = entries.filter((e) => (e.forDate || e.date) >= '2026-09-01' && (e.forDate || e.date) <= '2026-09-30').reduce((a, e) => a + e.amountCents, 0);
    return s.forCents === inWindow || ('for ' + s.forCents + ' vs ' + inWindow);
  })
]);
module.exports = H.suite('merchants', props);
if (require.main === module) H.main(module.exports);

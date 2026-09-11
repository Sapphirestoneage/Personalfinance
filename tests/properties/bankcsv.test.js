'use strict';
/* Property tests for engines/bankcsv.js (lane 2, section 2, L-2). parse,
   signature, guessMap and cents take text, not a household, so they are
   checked directly; entries is checked with a built household. */
const H = require('./_harness.js');
const { fc, prop, TABLES, arbSpec, build, same } = H;
const B = H.engine('bankcsv');
const arbRow = fc.record({
  y: fc.integer({ min: 2024, max: 2026 }), m: fc.integer({ min: 1, max: 12 }), d: fc.integer({ min: 1, max: 28 }),
  desc: fc.stringMatching(/^[A-Z][A-Z0-9 .#*-]{0,20}$/), cents: fc.integer({ min: -50000000, max: 50000000 })
});
const csvOf = (rows) => 'Date,Description,Amount\n' + rows.map((r) => r.y + '-' + String(r.m).padStart(2, '0') + '-' + String(r.d).padStart(2, '0') + ',' + r.desc + ',' + (r.cents / 100).toFixed(2)).join('\n') + '\n';

const props = [
  prop('a file of dated rows parses to the same number of rows under its three headers, and the map finds all three columns', fc.array(arbRow, { minLength: 0, maxLength: 12 }), (rows) => {
    const p = B.parse(csvOf(rows));
    if (p.delimiter !== ',') return 'delimiter ' + JSON.stringify(p.delimiter);
    if (!same(p.headers, ['Date', 'Description', 'Amount'])) return 'headers ' + JSON.stringify(p.headers);
    if (p.rows.length !== rows.length) return p.rows.length + ' rows for ' + rows.length;
    const m = B.guessMap(p.headers);
    if (m.date !== 0 || m.description !== 1 || m.amount !== 2) return 'map ' + JSON.stringify(m);
    return true;
  }),
  prop('the signature depends on the headers only, and an amount parses to whole cents with its sign', fc.record({ h1: fc.constantFrom('Date', 'Posted', 'Transaction Date'), cents: fc.integer({ min: -50000000, max: 50000000 }) }), (o) => {
    const a = B.signature([o.h1, 'Description', 'Amount']), b = B.signature([o.h1, 'Description', 'Amount']);
    if (a !== b || typeof a !== 'string' || !a) return 'signature unstable: ' + a + ' / ' + b;
    const c = B.cents((o.cents / 100).toFixed(2));
    if (!Number.isInteger(c)) return 'cents(' + (o.cents / 100).toFixed(2) + ') = ' + c;
    return Math.abs(c) === Math.abs(o.cents) || ('cents(' + (o.cents / 100).toFixed(2) + ') = ' + c);
  }),
  prop('previewing a file never touches the household, gives one line per row, the same twice, in whole cents', fc.record({ spec: arbSpec, rows: fc.array(arbRow, { minLength: 0, maxLength: 8 }) }), (o) => {
    const h = build(o.spec);
    const before = JSON.stringify(h);
    const p = B.parse(csvOf(o.rows));
    const m = B.guessMap(p.headers);
    let lines;
    try { lines = B.entries(p, m, h, TABLES); } catch (e) { return 'threw: ' + e.message; }
    if (JSON.stringify(h) !== before) return 'the household changed';
    if (!Array.isArray(lines) || lines.length !== o.rows.length) return (lines && lines.length) + ' lines for ' + o.rows.length + ' rows';
    if (!same(lines, B.entries(p, m, h, TABLES))) return 'differs between calls';
    const frac = H.fractionalCents(lines, 'lines', new Set(), 0);
    return !frac.length || frac[0];
  })
];
module.exports = H.suite('bankcsv', props);
if (require.main === module) H.main(module.exports);

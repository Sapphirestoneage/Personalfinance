'use strict';
/* Property tests for shared/csv.js and the CSV round trip in
   shared/csvexport.js (lane 2, section 2, L-2). The one claim worth proving
   by machine: whatever a person or a spreadsheet puts in a cell, the reader
   either gives back the value the writer meant or says it cannot read it —
   it never invents a number, and it never turns a blank into a zero. */
const fs = require('fs');
const path = require('path');
const H = require('./_harness.js');
const { fc, TABLES, arbSpec, build, prop, same } = H;
const C = require(H.ROOT + '/shared/csv.js');
const Csv = require(H.ROOT + '/shared/csvexport.js');
const LR = require(H.ROOT + '/shared/ledger-rows.js');
LR.use(TABLES.ledgerRows);

/* A cell as any spreadsheet might hold one: text, quotes, delimiters,
   newlines, the odd unicode. */
const arbCell = fc.oneof(
  fc.string({ maxLength: 12 }).map((s) => s.replace(/^\s+|\s+$/g, '')),
  fc.constantFrom('', 'a,b', 'he said "hi"', 'line\nbreak', 'semi;colon', 'tab\there', '  padded  ', '1,234.56', '—', 'Ünïcode'),
  fc.integer({ min: -99999, max: 99999 }).map(String)
);
const arbTable = fc.array(fc.array(arbCell, { minLength: 1, maxLength: 5 }), { minLength: 2, maxLength: 8 })
  .map((rows) => rows.map((r) => { const w = rows[0].length; const c = r.slice(0, w); while (c.length < w) c.push(''); return c; }))
  .filter((rows) => rows[0].every((h, i) => h !== '' && rows[0].indexOf(h) === i));

/* Every way a number reaches a cell, and the number meant by it. */
const arbAmount = fc.record({ cents: fc.integer({ min: 0, max: 99999999 }), style: fc.integer({ min: 0, max: 5 }) });
function writeAmount(o) {
  const d = (o.cents / 100).toFixed(2);
  const grouped = d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  switch (o.style) {
    case 0: return d;
    case 1: return '$' + grouped;
    case 2: return grouped;
    case 3: return '$ ' + grouped + ' ';
    case 4: return "'" + d;                                   /* Excel's text marker */
    default: return d.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d),)/g, '.');   /* 1.234,56 */
  }
}
const BLANKS = ['', '  ', '-', '--', 'n/a', 'N/A', 'none', 'None', '?', 'TBD', 'unknown', 'not sure'];
const NOT_NUMBERS = ['abc', '=B2*12', '=SUM(A1:A9)', '@', 'yes', '1.2.3', 'twelve', '$$', '%%'];

const props = [
  prop('any table of cells written by cell() and read back by parse() comes back exactly as it went in', arbTable, (rows) => {
    const text = rows.map((r) => r.map(C.cell).join(',')).join('\r\n') + '\r\n';
    const p = C.parse(text);
    /* Two deliberate changes on the way through: a cell a spreadsheet would
       read as a formula (= + - @) is written with a leading apostrophe, and
       space around a cell is dropped on the way back (it is what lets a
       hand-spaced sheet read at all). */
    const asWritten = (c) => (/^[=+\-@]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c) ? "'" + c : c).trim();
    if (!same(p.headers, rows[0].map(asWritten))) return 'headers ' + JSON.stringify(p.headers) + ' for ' + JSON.stringify(rows[0]);
    /* An all-blank row carries nothing and is dropped on purpose. */
    const want = rows.slice(1).filter((r) => r.some((c) => c !== '')).map((r) => r.map(asWritten));
    if (p.rows.length !== want.length) return p.rows.length + ' rows for ' + want.length;
    for (let i = 0; i < want.length; i++) if (!same(p.rows[i], want[i])) return 'row ' + i + ': ' + JSON.stringify(p.rows[i]) + ' for ' + JSON.stringify(want[i]);
    return true;
  }),
  prop('the same text read twice gives the same table, and a file with no lines is no lines, never a throw', arbTable, (rows) => {
    const text = rows.map((r) => r.map(C.cell).join(',')).join('\n');
    let a, b;
    try { a = C.parse(text); b = C.parse(text); } catch (e) { return 'threw: ' + e.message; }
    if (!same(a, b)) return 'differs between calls';
    return same(C.parse('').rows, []) || 'an empty file gave rows';
  }),
  prop('an amount written any way a person or a spreadsheet writes it reads back to the same cents', arbAmount, (o) => {
    const text = writeAmount(o);
    const got = C.amount(text);
    if (got === null) return JSON.stringify(text) + ' read as blank';
    if (got === undefined) return JSON.stringify(text) + ' could not be read';
    return got === o.cents || (JSON.stringify(text) + ' → ' + got + ', meant ' + o.cents);
  }),
  prop('a word for nothing is blank and a word that is not a number is refused: neither is ever a number, and never zero', fc.constantFrom.apply(fc, BLANKS.concat(NOT_NUMBERS)), (text) => {
    const got = C.amount(text);
    const wantBlank = BLANKS.indexOf(text) > -1;
    if (wantBlank) return got === null || (JSON.stringify(text) + ' read as ' + got + ', not blank');
    return got === undefined || (JSON.stringify(text) + ' read as ' + got + ', not refused');
  }),
  prop('a date written any common way reads to the day meant, and a day that does not exist is refused', fc.record({ y: fc.integer({ min: 1950, max: 2099 }), m: fc.integer({ min: 1, max: 12 }), d: fc.integer({ min: 1, max: 28 }), style: fc.integer({ min: 0, max: 3 }) }), (o) => {
    const p2 = (n) => (n < 10 ? '0' + n : String(n));
    const iso = o.y + '-' + p2(o.m) + '-' + p2(o.d);
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const text = [iso, o.m + '/' + o.d + '/' + o.y, o.d + ' ' + MON[o.m - 1] + ' ' + o.y, MON[o.m - 1] + ' ' + o.d + ', ' + o.y][o.style];
    const got = C.date(text);
    if (got !== iso) return JSON.stringify(text) + ' → ' + got + ', meant ' + iso;
    return C.date(o.y + '-' + p2(o.m) + '-32') === undefined || 'a 32nd of the month was read as a date';
  }),
  prop('every row of an export reads back as the value it was written from: the round trip changes no number', arbSpec, (spec) => {
    const h = build(spec);
    let lines;
    try { lines = Csv.rows(h, TABLES); } catch (e) { return 'rows threw: ' + e.message; }
    for (const l of lines) {
      if (l.value === '') continue;
      const row = LR.byId(l.row);
      if (!row) return 'no row ' + l.row;
      const back = Csv.read(row, l.value, TABLES);
      if (back.bad) return l.row + ' wrote ' + JSON.stringify(l.value) + ', which reads as: ' + back.bad;
      if (back.blank) return l.row + ' wrote ' + JSON.stringify(l.value) + ', which reads as blank';
      const again = Csv.valueText(row, back.value);
      if (again !== l.value) return l.row + ': wrote ' + JSON.stringify(l.value) + ', reads back as ' + JSON.stringify(again);
    }
    return true;
  }),
  prop('planning an import never touches the household, and a file nobody edited asks for no change', arbSpec, (spec) => {
    const h = build(spec);
    const before = JSON.stringify(h);
    let text, p;
    try { text = Csv.single(h, TABLES); p = Csv.plan(text, h, TABLES); } catch (e) { return 'threw: ' + e.message; }
    if (JSON.stringify(h) !== before) return 'the household changed while planning';
    const moves = p.entries.filter((e) => e.status === 'change' || e.status === 'add');
    if (moves.length) return moves.length + ' line(s) would change on a file nobody edited, first: ' + moves[0].row + ' ' + JSON.stringify(moves[0].text);
    if (p.problems) return p.problems + ' line(s) of an untouched export need a look, first: ' + p.entries.filter((e) => e.why && e.status !== 'skip' && e.status !== 'same')[0].row;
    return true;
  }),
  prop('any text at all can be handed to the importer: it answers, it never throws', fc.tuple(arbSpec, fc.oneof(fc.string({ maxLength: 300 }), fc.constantFrom('', 'row,value\n', '\n\n\n', 'a;b;c', '"unclosed', 'sep=;\n', '\r\r\r', 'row,label,value\n,,\n'))), ([spec, text]) => {
    const h = build(spec);
    try {
      const p = Csv.plan(text, h, TABLES);
      if (!p || !Array.isArray(p.entries)) return 'no entries';
      if (!p.entries.length && !p.problem) return 'no entries and no reason given';
      return true;
    } catch (e) { return 'threw: ' + e.message; }
  }),
  prop('a workbook of any household opens as a zip, and its rows read back as the text the sheet shows', arbSpec, (spec) => {
    const h = build(spec);
    let book;
    try { book = Csv.workbook(h, TABLES); } catch (e) { return 'workbook threw: ' + e.message; }
    const Zipfile = require(H.ROOT + '/shared/zipfile.js');
    if (!Zipfile.isZip(book)) return 'not a zip';
    /* Reading is a promise, so the round trip itself is checked in
       test/xlsx.js; here the shape and the sheet names, which are pure. */
    const text = Zipfile.text(book);
    if (text.indexOf('xl/workbook.xml') < 0) return 'no workbook part';
    if (text.indexOf('xl/styles.xml') < 0) return 'no styles part';
    return true;
  }),
  prop('a workbook read into rows plans exactly as the same rows in a CSV would', fc.constant(null), () => {
    const h = build({ people: [{ year: 1990, status: 'employed', income: [{ gross: 60000, type: 'w2' }] }], filingStatus: 'single', state: 'NC', assets: [{ category: 'cash', value: 5000 }], debts: [], fat: { food: 400, accommodation: 1200, transportation: 200, wants: 300 } });
    const lines = Csv.rows(h, TABLES);
    const sheets = [{ name: 'Assets', rows: [['What it is', 'Which one', 'Your number', 'row id', 'item id']].concat(
      lines.filter((l) => l.door === 'A').map((l) => [l.label, l.item, l.value, l.row, l.item_id])) }];
    const viaBook = Csv.plan(Csv.fromWorkbook(sheets), h, TABLES);
    const viaCsv = Csv.plan(Csv.csv(lines.filter((l) => l.door === 'A')), h, TABLES);
    const sig = (p) => p.entries.map((e) => e.row + ':' + e.item + ':' + e.status).join('|');
    return sig(viaBook) === sig(viaCsv) || ('workbook ' + sig(viaBook) + ' vs csv ' + sig(viaCsv));
  }),
  prop('the bank importer and the sheet importer read one file the same way, through the one reader', fc.constantFrom('bank-a.csv', 'bank-b.csv', 'bank-c.csv'), (name) => {
    const text = fs.readFileSync(path.join(H.ROOT, 'test/fixtures', name), 'utf8');
    const B = H.engine('bankcsv');
    const a = B.parse(text), b = C.parse(text);
    if (a.delimiter !== b.delimiter) return 'delimiters differ: ' + a.delimiter + ' / ' + b.delimiter;
    if (!same(a.headers, b.headers)) return 'headers differ';
    return same(a.rows, b.rows) || 'rows differ';
  })
];

module.exports = H.suite('csv', props);
if (require.main === module) H.main(module.exports);

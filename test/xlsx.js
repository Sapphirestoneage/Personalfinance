#!/usr/bin/env node
/* ==========================================================================
   test/xlsx.js — a real spreadsheet out, and a real spreadsheet back in.
   DECISIONS.md D-222.
   --------------------------------------------------------------------------
   The owner should never be handed code. This checks the file that leaves
   Your Data is one a spreadsheet opens: a workbook with a tab a door, money
   in money cells, a percent in a percent cell, headings in words — and that
   the same file, re-saved by any other spreadsheet (every part compressed,
   its strings shared, a row typed at the bottom), comes back and lands.

   Unzipping is a promise, so this lives beside test/run.js rather than in it.

   Run:  node test/xlsx.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');

const Zipfile = require(path.join(ROOT, 'shared/zipfile.js'));
const Xlsx = require(path.join(ROOT, 'shared/xlsx.js'));
const Schema = require(path.join(ROOT, 'shared/schema.js'));
const Demo = require(path.join(ROOT, 'shared/demo-persona.js'));
const LR = require(path.join(ROOT, 'shared/ledger-rows.js'));
const Ref = require(path.join(ROOT, 'shared/reference.js'));
const Csv = require(path.join(ROOT, 'shared/csvexport.js'));

const T = {};
Object.keys(Ref.TABLE_FILES).forEach((k) => { try { T[k] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', Ref.TABLE_FILES[k]), 'utf8')); } catch (e) { /* skip */ } });
LR.use(T.ledgerRows);

let passed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
}
function eq(name, a, b) { ok(name, a === b, a === b ? '' : 'got ' + JSON.stringify(a) + ', wanted ' + JSON.stringify(b)); }
function section(t) { console.log('\n' + t + '\n' + '─'.repeat(Math.min(66, t.length))); }

/* A household that can be written to, for the applying half. */
const store = {};
Object.defineProperty(global, 'localStorage', {
  value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } },
  configurable: true, writable: true
});
const Spine = require(path.join(ROOT, 'shared/spine-v2.js'));

/* The way every other spreadsheet writes a workbook: each part compressed. */
function repackDeflated(files) {
  const le16 = (v) => [v & 0xFF, (v >>> 8) & 0xFF];
  const le32 = (v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
  const chunks = [], central = [];
  let offset = 0;
  const names = Object.keys(files);
  names.forEach((name) => {
    const raw = Buffer.from(typeof files[name] === 'string' ? Buffer.from(files[name], 'utf8') : Buffer.from(files[name]));
    const data = zlib.deflateRawSync(raw);
    const nm = Buffer.from(name, 'utf8');
    const crc = Zipfile.crc32(new Uint8Array(raw));
    const head = Buffer.from([].concat([0x50, 0x4B, 0x03, 0x04], le16(20), le16(0x0800), le16(8), le16(0), le16(0), le32(crc), le32(data.length), le32(raw.length), le16(nm.length), le16(0)));
    chunks.push(head, nm, data);
    central.push(Buffer.from([].concat([0x50, 0x4B, 0x01, 0x02], le16(20), le16(20), le16(0x0800), le16(8), le16(0), le16(0), le32(crc), le32(data.length), le32(raw.length), le16(nm.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset))), nm);
    offset += head.length + nm.length + data.length;
  });
  const cd = Buffer.concat(central);
  const end = Buffer.from([].concat([0x50, 0x4B, 0x05, 0x06], le16(0), le16(0), le16(names.length), le16(names.length), le32(cd.length), le32(offset), le16(0)));
  return new Uint8Array(Buffer.concat([Buffer.concat(chunks), cd, end]));
}

(async function () {
  section('One zip writer and reader for the app');
  const z = Zipfile.write({ 'a.txt': 'hello', 'deep/b.txt': 'there' });
  ok('a zip is written whole, with its index at the end', Zipfile.isZip(z) && z[z.length - 22] === 0x50 && z[z.length - 21] === 0x4B);
  eq('CRC-32 of a known string', Zipfile.crc32(Zipfile.utf8('123456789')).toString(16), 'cbf43926');
  const back = await Zipfile.read(z);
  eq('and read back by name, to the byte', Object.keys(back).sort().join(',') + '|' + Zipfile.text(back['deep/b.txt']), 'a.txt,deep/b.txt|there');
  const deflated = await Zipfile.read(repackDeflated({ 'a.txt': 'hello there, at some length so it is worth compressing'.repeat(4) }));
  ok('a compressed zip, as every other tool writes one, reads too', /^hello there/.test(Zipfile.text(deflated['a.txt'])) && Zipfile.text(deflated['a.txt']).length === 216);
  ok('the CSV export carries no second copy of the zip writer', !/CRC_TABLE|0xEDB88320/.test(fs.readFileSync(path.join(ROOT, 'shared/csvexport.js'), 'utf8')));
  ok('nothing in either module reaches the network', !/fetch\(|XMLHttpRequest|sendBeacon/.test(fs.readFileSync(path.join(ROOT, 'shared/xlsx.js'), 'utf8')) && !/fetch\(|XMLHttpRequest|sendBeacon/.test(fs.readFileSync(path.join(ROOT, 'shared/zipfile.js'), 'utf8')));

  section('The file that leaves is a spreadsheet, not code');
  const demo = Demo.build();
  const book = Csv.workbook(demo, T);
  ok('it is a real .xlsx: a zip carrying the parts a spreadsheet looks for', Xlsx.isXlsx(book));
  eq('named for the day it was made', Csv.workbookName('2026-09-12'), 'money-rooms-2026-09-12.xlsx');
  const parts = await Zipfile.read(book);
  ok('the content types, the workbook, its styles and a sheet a door', ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet6.xml'].every((n) => n in parts));
  const wbXml = Zipfile.text(parts['xl/workbook.xml']);
  eq('the tabs are named in words, a door each, and a page of notes last', (wbXml.match(/<sheet name="([^"]*)"/g) || []).map((s) => s.slice(13, -1)).join(', '), 'Debt, Assets, Income, Taxes, Expenses, You, How to use this');
  const assets = Zipfile.text(parts['xl/worksheets/sheet2.xml']);
  ok('the heading row stays put when the sheet scrolls, and the columns filter', /state="frozen"/.test(assets) && /<autoFilter/.test(assets));
  ok('money sits in a money cell and a percent in a percent cell: numbers, not text', /s="3"><v>9500<\/v>/.test(assets) && /s="4"><v>0.04<\/v>/.test(assets));
  const styles = Zipfile.text(parts['xl/styles.xml']);
  ok('...under the formats that show them as $9,500.00 and 4.00%', /&quot;\$&quot;#,##0\.00/.test(styles) && /formatCode="0\.00%"/.test(styles));
  ok('a date sits in a date cell', /yyyy/.test(styles) && /s="5"><v>\d{5}<\/v>/.test(Zipfile.text(parts['xl/worksheets/sheet6.xml'])));

  section('And it reads back as what a person sees');
  const sheets = await Xlsx.read(book);
  eq('the same tabs', sheets.map((s) => s.name).join(','), 'Debt,Assets,Income,Taxes,Expenses,You,How to use this');
  eq('headings in words, with the two ids the app needs kept at the end', sheets[1].rows[0].join(' | '), 'What it is | Which one | Your number | In | How sure | Last checked | Came from | row id | item id');
  const cash = sheets[1].rows.filter((r) => r[0] === 'Cash and savings')[0];
  eq('the money plain and the unit in words', cash[2] + ' ' + cash[3], '9500 dollars');
  eq('a percent cell comes back a percent, because the sheet says it is one', sheets[1].rows.filter((r) => /Workplace contribution/.test(r[0]))[0][2], '4%');
  eq('a choice reads in words, not in its id', sheets[5].rows.filter((r) => r[0] === 'Working situation')[0][2], 'Employed');
  eq('a date reads as a date', sheets[5].rows.filter((r) => /Month and year you were born/.test(r[0]))[0][2], '1994-04-12');

  section('Out and back, with nothing changed');
  const text = await Csv.fromFile(book);
  const plain = Csv.plan(text, demo, T);
  ok('a spreadsheet nobody edited asks for no change and needs no look', !plain.counts.change && !plain.counts.add && plain.problems === 0 && plain.entries.length > 40);
  ok('every line says which tab and row it came from', /^Assets, row \d+$/.test(plain.entries.filter((e) => e.row === 'cashSavings')[0].line));

  section('A sheet re-saved and edited somewhere else');
  const edited = {};
  Object.keys(parts).forEach((n) => { edited[n] = parts[n]; });
  edited['xl/worksheets/sheet2.xml'] = Zipfile.text(parts['xl/worksheets/sheet2.xml']).replace(/(<c r="C4"[^>]*><v>)9500(<\/v>)/, '$112500$2');
  const debt = Zipfile.text(parts['xl/worksheets/sheet1.xml']);
  const nRows = (debt.match(/<row\b/g) || []).length;
  edited['xl/worksheets/sheet1.xml'] = debt.replace('</sheetData>',
    '<row r="' + (nRows + 1) + '"><c r="A' + (nRows + 1) + '" t="s"><v>0</v></c><c r="B' + (nRows + 1) + '" t="s"><v>1</v></c><c r="C' + (nRows + 1) + '" s="3"><v>12000</v></c></row>'
    + '<row r="' + (nRows + 2) + '"><c r="A' + (nRows + 2) + '" t="s"><v>2</v></c><c r="B' + (nRows + 2) + '" t="s"><v>1</v></c><c r="C' + (nRows + 2) + '" s="4"><v>0.0625</v></c></row>'
    + '</sheetData>');
  edited['xl/sharedStrings.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3"><si><t>Balance</t></si><si><t>Car loan</t></si><si><t>Interest rate</t></si></sst>';
  const repacked = repackDeflated(edited);
  ok('the re-saved file is written the other way: every part compressed', repacked.length !== book.length);
  const text2 = await Csv.fromFile(repacked);
  Spine.updateProfile(Demo.build());
  const p2 = Csv.plan(text2, Spine.getProfile(), T);
  ok('it reads: the edited balance, and a debt typed at the bottom with no ids at all', p2.entries.filter((e) => e.row === 'assetValue' && e.status === 'change')[0].value === 1250000 && p2.entries.filter((e) => e.item === 'Car loan' && e.status === 'add').length === 2);
  ok('a shared string is read like any other word', p2.entries.filter((e) => e.item === 'Car loan')[0].label === 'Balance');
  const r = Csv.apply(p2, Spine);
  const h = Spine.getProfile();
  ok('applying lands both, through the rooms that own them', r.failed.length === 0 && h.assets.filter((a) => a.id === 'demo_asset_cash')[0].valueCents === 1250000 && h.debts.filter((d) => d.label === 'Car loan').length === 1);
  Spine.undo();
  ok('and one undo takes the whole spreadsheet back', Spine.getProfile().debts.length === 2 && Schema.cashCents(Spine.getProfile()).value === 950000);

  section('The wrong file');
  let said = '';
  try { await Csv.fromFile(Zipfile.write({ 'notes.txt': 'hello' })); } catch (e) { said = e.message; }
  ok('a zip that is not a spreadsheet says so, rather than half-reading it', /not a spreadsheet/.test(said));
  said = '';
  try { await Zipfile.read(Zipfile.utf8('just some text')); } catch (e) { said = e.message; }
  ok('a file that is not a zip at all says so', /not a zip/.test(said));
  const csvText = await Csv.fromFile(Zipfile.utf8('label,value\nCash and savings,4000\n'));
  eq('a plain CSV still goes through the same door', Csv.plan(csvText, demo, T).entries[0].status, 'change');

  section('Your Data');
  const html = fs.readFileSync(path.join(ROOT, 'rooms/data.html'), 'utf8');
  ok('leads with the spreadsheet, keeps plain text beside it, takes either back', /btn-xlsx/.test(html) && /Download the spreadsheet</.test(html) && /Plain text instead \(CSV\)/.test(html) && /accept="\.xlsx,\.csv/.test(html) && /readAsArrayBuffer/.test(html) && /CsvExport\.fromFile\(/.test(html));
  ok('the zip of one CSV a door is gone: the workbook has a tab a door instead', !/btn-sheet/.test(html));
  ok('and the page loads the two modules it now needs', /shared\/zipfile\.js/.test(html) && /shared\/xlsx\.js/.test(html));

  console.log('\n' + '─'.repeat(66));
  if (!failures.length) { console.log('✓ ' + passed + ' checks passed — the file that leaves is a spreadsheet'); process.exit(0); }
  console.log('✗ ' + failures.length + ' failed, ' + passed + ' passed\n');
  failures.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f));
  process.exit(1);
})().catch((e) => { console.error('\nthrew: ' + (e && e.stack ? e.stack : e)); process.exit(1); });

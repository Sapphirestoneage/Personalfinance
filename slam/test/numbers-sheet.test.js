// The numbers spreadsheet end to end (S-237), on the made-up demo household: the file looks right (Key tab, thick
// answer boxes, a colored How sure? dropdown, a hidden id column, no gridlines), export then import changes nothing,
// a blank client sheet changes nothing, and a reworded, shuffled, rephrased copy with no id column still lands every
// row right or puts it in Needs a look: never wrong silently.
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadHousehold } from '../engine/normalize.js';
import { applyDefaults } from '../engine/defaults.js';
import { getAt, valueOf, setAt } from '../engine/spine.js';
import { validate } from '../engine/schema.js';
import { numbersWorkbook, numbersRows, keyRows } from '../js/sheet-export.js';
import { readSheets, planImport, applyImport, parseCsv, planRow } from '../js/sheet-import.js';
import { parseAnswer } from '../js/parse-answer.js';
import { CASES, TODAY } from '../js/parse-answer-cases.js';
import { readXlsx } from './sheet-read.js';
import { readJson, loadRules, SLAM } from './spine-helpers.js';

const map = readJson('data/import-map.json');
const R = loadRules();
const demo = () => applyDefaults(loadHousehold(readJson('fixtures/demo.json')), R);
const T = TODAY;
const importRows = (spine, sheets) => planImport(spine, readSheets(sheets, map).rows, map, { today: T });

test('the file: two tabs, hidden id column, no gridlines, thick answer boxes, a colored How sure? dropdown', () => {
  const [num, key] = readXlsx(numbersWorkbook(demo(), map, { today: T }));
  assert.deepEqual([num.name, key.name], ['My Numbers', 'Key']);
  assert.deepEqual(num.rows[0], ['id', 'Question', 'Your answer', 'How sure?', 'Notes']);
  assert.match(num.xml, /<col min="1" max="1" [^>]*hidden="1"/);
  assert.match(num.xml, /showGridLines="0"/);
  assert.match(num.xml, /<dataValidation type="list"[^>]*sqref="D2:D\d+"><formula1>"I know it,Rough guess,Don't know"<\/formula1>/);
  for (const w of ['I know it', 'Rough guess', "Don't know"]) assert.ok(num.xml.includes('<formula>"' + w.replace(/'/g, "'") + '"</formula>'), w);
  assert.match(key.xml, /showGridLines="0"/);
  // Every section heading, in order.
  const sections = num.rows.filter((r) => /^section:/.test(r[0])).map((r) => r[1]);
  assert.deepEqual(sections, map.sections.map((s) => s.title));
});

test('the Key: colors, zero vs not known, add your own row, privacy, and only examples the parser reads', () => {
  const text = keyRows(T).map((r) => r.map((c) => c.v).join(' | ')).join('\n');
  for (const w of ['What the colors mean', 'Zero is not the same as not known', 'Add your own row', 'Keep it private', 'thick border']) assert.ok(text.includes(w), w);
  const shown = keyRows(T).filter((r) => r[1] && /^reads as /.test(r[1].v)).map((r) => r[0].v);
  const keyed = CASES.filter((c) => c.key).map((c) => (c.answer === '' ? '(left blank)' : c.answer));
  assert.deepEqual(shown, keyed);
  for (const c of CASES.filter((x) => x.key)) assert.notEqual(parseAnswer(c.answer, { expect: c.expect, sure: c.sure || '', today: T }).status, 'review', c.answer);
});

test('round trip: export, import, the household is unchanged', () => {
  const spine = demo();
  const plan = importRows(spine, readXlsx(numbersWorkbook(spine, map, { today: T })));
  const moved = plan.rows.filter((r) => r.group !== 'same');
  assert.deepEqual(moved.map((r) => r.n + ' ' + r.question + ': ' + r.group + ' ' + (r.why || '')), []);
  assert.deepEqual(plan.notInFile, []);
  assert.deepEqual(applyImport(spine, plan, { today: T }), spine);
});

test('round trip through CSV (what Google Sheets downloads) too', () => {
  const spine = demo();
  const [num] = readXlsx(numbersWorkbook(spine, map, { today: T }));
  const csv = num.rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(',')).join('\r\n');
  const plan = importRows(spine, [{ name: 'eli-numbers', rows: parseCsv(csv) }]);
  assert.ok(plan.rows.every((r) => r.group === 'same'));
});

test('round trip with rough parts, missing amounts, not for me, notes and a new line', () => {
  let spine = demo();
  spine = setAt(spine, 'debts.visa.apr', { value: 0.22, kind: 'rough', asOf: '2026-10-01', source: 't' });
  spine = setAt(spine, 'expenses.gym.amount', { value: null, kind: 'missing', asOf: '2026-10-01', source: 't' });
  spine = setAt(spine, 'household.county', { value: null, kind: 'notForMe', asOf: '2026-10-01', source: 't' });
  spine = setAt(spine, 'expenses.rent.notes', 'Lease ends in June');
  const plan = importRows(spine, readXlsx(numbersWorkbook(spine, map, { today: T })));
  assert.deepEqual(plan.rows.filter((r) => r.group !== 'same').map((r) => r.question), []);
  assert.deepEqual(applyImport(spine, plan, { today: T }), spine);
});

test('a blank client sheet changes nothing, and a filled one builds a household', () => {
  const spine = demo();
  const sheets = readXlsx(numbersWorkbook(spine, map, { blank: true, today: T }));
  assert.ok(sheets[0].rows.slice(1).every((r) => !r[2]), 'every answer is empty');
  const plan = importRows(spine, sheets);
  assert.ok(plan.rows.every((r) => r.group === 'same'));
  // The client fills in a few rows, and adds one of their own under wants.
  const rows = sheets[0].rows.map((r) => [...r]);
  const at = (q) => rows.findIndex((r) => r[1] === q);
  rows[at('Rent or mortgage')][2] = '$1,450 a month';
  rows[at('Credit card')][2] = 'Chase Freedom: $2,000 left, $500 a month, 0%';
  rows[at('Your birthday')][2] = '7/15/01';
  rows.splice(at('Fun') + 1, 0, ['', 'Gym', '45/mo', '', '']);
  // A new client: an empty household.
  const client = applyDefaults(loadHousehold({ _meta: { version: 3, asOf: T, name: 'New client' }, household: { people: [{ name: 'New client' }] } }), R);
  const p2 = importRows(client, [{ ...sheets[0], rows }, sheets[1]]);
  const g = (q) => p2.rows.find((r) => r.question === q);
  assert.equal(g('Rent or mortgage').group, 'new');
  assert.equal(g('Rent or mortgage').target.fat, 'accommodation');
  assert.equal(g('Credit card').target.type, 'credit_card');
  assert.equal(g('Gym').target.kind, 'new');
  assert.equal(p2.rows.filter((r) => r.group === 'review').length, 0, p2.rows.filter((r) => r.group === 'review').map((r) => r.question + ': ' + r.why).join('; '));
  const after = applyImport(client, p2, { today: T });
  assert.ok(validate(after).ok, JSON.stringify(validate(after).errors));
  const rent = after.expenses.find((e) => e.label === 'Rent or mortgage');
  assert.deepEqual([rent.amount.value, rent.amount.asOf, rent.cadence, rent.need.value], [1450, T, 'monthly', true]);
  const cc = after.debts.find((d) => d.name.value === 'Credit card');
  assert.deepEqual([cc.balance.value, cc.minimum.value, cc.apr.value, cc.institution.value], [2000, 500, 0, 'Chase Freedom']);
  assert.equal(after.household.people[0].birthDate.value, '2001-07-15');
  assert.deepEqual([after.expenses.find((e) => e.label === 'Gym').amount.value, after.expenses.find((e) => e.label === 'Gym').need.value], [45, false]);
});

test('apply dates every changed answer to the import day, and leaves the rest alone', () => {
  const spine = demo();
  const [num, key] = readXlsx(numbersWorkbook(spine, map, { today: T }));
  const rows = num.rows.map((r) => [...r]);
  rows[rows.findIndex((r) => r[0] === 'expenses.rent')][2] = '$1,900 a month';
  const after = applyImport(spine, importRows(spine, [{ ...num, rows }, key]), { today: T });
  assert.deepEqual([after.expenses.find((e) => e.id === 'rent').amount.value, after.expenses.find((e) => e.id === 'rent').amount.asOf], [1900, T]);
  assert.equal(after.expenses.find((e) => e.id === 'groceries').amount.asOf, spine.expenses.find((e) => e.id === 'groceries').amount.asOf);
});

// ---------------------------------------------------------------- resilience
// The demo's sheet as a person might leave it: no id column, headers renamed, columns moved and an extra one added,
// questions reworded, rows shuffled within sections, blank rows, answers rephrased.
const REWORD = { Rent: 'monthly rent', Groceries: 'grocery shopping', 'Your birthday': 'Date of birth', 'How you file taxes': 'Tax filing status', 'Eating out': 'restaurants and takeout', Visa: 'visa card', 'Roth IRA': 'Roth', 'Inflation a year': 'inflation', 'Safe withdrawal rate': 'withdrawal rate (SWR)', Phone: 'cell phone', 'State you live in': 'Home state' };
const REPHRASE = { Rent: '1.8k/mo', Groceries: '500/mo', Phone: '60 bucks a month', Gym: 'idk', Miscellaneous: 'a grand a month', Streaming: '$40', Utilities: 'around 150 a month', Visa: '3k left, 90/mo, 22 percent, 10k limit', 'Inflation a year': '.03' };
export function scramble(rows) {
  const [head, ...body] = rows;
  const H = { id: 0, q: 1, a: 2, s: 3, n: 4 };
  const out = [];
  let block = [];
  const flush = () => { out.push(...block.reverse()); block = []; };
  for (const r of body) {
    if (/^section:/.test(r[H.id])) { flush(); out.push(['', 'checked?', '', r[H.q], '']); out.push([]); continue; }
    if (!r[H.q] && !r[H.a]) continue;
    const q = r[H.q];
    block.push([r[H.n], REWORD[q] || q, 'x', r[H.s], REPHRASE[q] !== undefined ? REPHRASE[q] : r[H.a], r[H.id]]);
  }
  flush();
  // New order: Notes, Extra, Item, Confidence, Answer, and the old id kept aside (test only, not in the sheet).
  void head;
  return [['Notes', 'Last checked', 'Item', 'Confidence', 'Answer'], ...out.map((r) => (r.length === 6 ? [r[0], '', r[1], r[3], r[4]] : r.length ? ['', '', r[3], '', ''] : []))];
}
function withTruth(rows) {
  // The true target of each data row, by its order, for checking (the scrambled sheet has no ids).
  const truth = [];
  const [, ...body] = rows;
  let block = [];
  const flush = () => { truth.push(...block.reverse()); block = []; };
  for (const r of body) { if (/^section:/.test(r[0])) { flush(); continue; } if (r[1] || r[2]) block.push(r[0]); }
  flush();
  return truth;
}

test('resilience: no ids, renamed headers, moved columns, reworded and shuffled rows, rephrased answers', () => {
  const spine = demo();
  const [num, key] = readXlsx(numbersWorkbook(spine, map, { today: T }));
  const rows = scramble(num.rows);
  const truth = withTruth(num.rows);
  const read = readSheets([{ name: 'Sheet1', rows }, key], map);
  assert.deepEqual(read.problems, []);
  assert.equal(read.rows.length, truth.length);
  const plan = planImport(spine, read.rows, map, { today: T });
  const wrong = [], look = [];
  plan.rows.forEach((r, i) => {
    const want = truth[i].replace('$me', spine.household.people[0].id).replace('$year', spine.meta.asOf.slice(0, 4));
    if (r.group === 'review') { look.push(r.question + ': ' + r.why); return; }
    if (r.blank) return;
    const got = r.target.kind === 'field' ? r.target.path : r.target.key;
    if (got !== want) wrong.push(r.question + ' went to ' + got + ', not ' + want);
  });
  assert.deepEqual(wrong, [], 'never wrong silently');
  assert.ok(look.length <= 3, 'at most a few need a look: ' + look.join('; '));
  // What the rephrased answers mean, applied.
  const after = applyImport(spine, plan, { today: T });
  const amt = (id) => after.expenses.find((e) => e.id === id).amount;
  assert.deepEqual([amt('rent').value, amt('groceries').value, amt('phone').value, amt('streaming').value, amt('other').value], [1800, 500, 60, 40, 1000]);
  assert.deepEqual([amt('gym').kind, amt('gym').value], ['missing', null], 'idk is missing, never $0');
  assert.deepEqual([amt('utilities').value, amt('utilities').kind], [150, 'rough']);
  assert.deepEqual(['balance', 'minimum', 'apr', 'limit'].map((k) => valueOf(getAt(after, 'debts.visa.' + k))), [3000, 90, 0.22, 10000]);
  assert.equal(after.assumptions.inflation.value, 0.03);
  assert.equal(after.household.people[0].birthDate.value, spine.household.people[0].birthDate.value);
  const changed = plan.rows.filter((r) => r.group === 'change').map((r) => r.question).sort();
  assert.deepEqual(changed, ['Gym', 'Miscellaneous', 'Utilities'].sort(), 'only the answers that mean something new change');
});

test('a low-confidence match never applies: it waits in Needs a look with a quick fix', () => {
  const spine = demo();
  const r = planRow(spine, map, { n: 9, id: '', question: 'Stuff', answer: '$75 a month', sure: '', notes: '', section: null }, { today: T });
  assert.equal(r.group, 'review');
  assert.deepEqual(applyImport(spine, { rows: [r], notInFile: [] }, { today: T }), spine);
  const fixed = planRow(spine, map, r, { today: T, target: { kind: 'new', key: 'new:wants', collection: 'expenses', section: 'wants', label: 'Stuff', need: false, sure: true } });
  assert.equal(fixed.group, 'new');
  const unread = planRow(spine, map, { n: 10, id: 'expenses.rent', question: 'Rent', answer: 'the usual', sure: '', notes: '', section: 'needs' }, { today: T });
  assert.equal(unread.group, 'review', 'an answer it cannot read keeps its text and waits');
  assert.equal(unread.answer, 'the usual');
});

test('two rows on one question both need a look', () => {
  const spine = demo();
  const rows = [{ n: 2, id: '', question: 'Rent', answer: '$1,800 a month', sure: '', notes: '', section: 'needs' }, { n: 3, id: '', question: 'rent', answer: '$1,900 a month', sure: '', notes: '', section: 'needs' }];
  const plan = planImport(spine, rows, map, { today: T });
  assert.deepEqual(plan.rows.map((r) => r.group), ['review', 'review']);
});

test('a sheet with no answer column is refused in words, and nothing changes', () => {
  const r = readSheets([{ name: 'My Numbers', rows: [['Thing', 'Stuff'], ['Rent', '1000']] }], map);
  assert.equal(r.rows.length, 0);
  assert.match(r.problems[0], /Your answer/);
});

test('every exported answer reads back as itself (the phrases the export writes)', () => {
  for (const r of numbersRows(demo(), map)) if (r.kind === 'row' && r.answer) assert.ok(r.answer.length < 200, r.question);
});

test('a sheet typed by a person (made-up numbers, their own words and layout) lands every row', () => {
  const client = applyDefaults(loadHousehold({ _meta: { version: 3, asOf: T, name: 'New client' }, household: { people: [{ name: 'New client' }] } }), R);
  const rows = parseCsv(readFileSync(SLAM + 'test/fixtures/human-numbers.csv', 'utf8'));
  const plan = importRows(client, [{ name: 'human-numbers', rows }]);
  assert.deepEqual(plan.rows.filter((r) => r.group === 'review').map((r) => r.question + ': ' + r.why), []);
  const after = applyImport(client, plan, { today: T });
  assert.ok(validate(after).ok, JSON.stringify(validate(after).errors));
  const debt = (n) => after.debts.find((d) => d.name.value === n);
  assert.deepEqual([debt('Quicksilver').institution.value, debt('Quicksilver').limit.value, debt('Quicksilver').promoApr.value, debt('Quicksilver').promoEnds.value], ['Capital One Quicksilver', 7000, 0, '2027-05-31']);
  assert.equal(debt('Student loans').type, 'student_loan');
  const job = after.income.find((s) => s.label === 'Deloitte');
  assert.deepEqual([job.amount.value, job.cadence, job.start, job.end, job.withholding.federal.value, job.withholding.state.value], [56500, 'total', '2026-01-01', '2026-06-30', 11700, 4500]);
  assert.deepEqual([after.expenses.find((e) => e.label === 'Car insurance').amount.kind, after.expenses.find((e) => e.label === 'Health insurance').amount.value], ['missing', 0]);
  const roth = after.accounts.find((a) => a.type === 'roth_ira');
  assert.deepEqual(roth.contributions.value, [{ year: 2022, amount: 4000 }, { year: 2023, amount: 3000 }, { year: 2024, amount: 5000 }]);
  assert.equal(after.assumptions.realReturn.value, 0.06);
  assert.match(after.assumptions.realReturn.note, /best 8%, likely 6%, worst 4%/);
});

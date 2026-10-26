// Writing the numbers spreadsheet (S-237): the same layout the importer reads, from the household (Download my
// numbers) or empty (Download blank sheet for a client). Answers are natural phrases ("$2,000 left, $500 a month, 0%")
// that js/parse-answer.js reads back to the same values, so export then import changes nothing. The Key tab's
// examples come from the parser's own cases (js/parse-answer-cases.js), so it never promises a format it cannot read.

import { dollars, percent, parseAnswer } from './parse-answer.js';
import { CASES, TODAY } from './parse-answer-cases.js';
import { writeXlsx } from './xlsx-write.js';
import { fieldPath, itemLabel } from './sheet-import.js';
import { getAt, isFact, valueOf } from '../engine/spine.js';
import { PRESETS } from '../engine/schema.js';

export const SURE = { known: 'I know it', rough: 'Rough guess', missing: "Don't know", computed: 'Worked out', notForMe: '' };
export const HEADERS = ['id', 'Question', 'Your answer', 'How sure?', 'Notes'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A day in words the parser reads back exactly: "Jul 15, 2001".
export const dayWords = (d) => MON[+d.slice(5, 7) - 1] + ' ' + +d.slice(8, 10) + ', ' + d.slice(0, 4);
const CADENCE = { weekly: 'a week', biweekly: 'every 2 weeks', semimonthly: 'twice a month', monthly: 'a month', quarterly: 'a quarter', yearly: 'a year', once: 'one time', total: 'in total' };

// ---------------------------------------------------------------- one field
function fieldAnswer(f, fct) {
  if (f.type === 'name') return { answer: fct || '', sure: fct ? SURE.known : '' };
  if (!isFact(fct)) return { answer: '', sure: '' };
  if (fct.kind === 'missing') return { answer: '', sure: SURE.missing };
  if (fct.kind === 'notForMe') return { answer: 'Not for me', sure: '' };
  const v = fct.value;
  let a;
  if (f.type === 'money') a = dollars(v);
  else if (f.type === 'rate') a = percent(v);
  else if (f.type === 'date') a = dayWords(v);
  else if (f.type === 'bool') a = v ? 'Yes' : 'No';
  else if (f.type === 'choice') a = ((f.choices || {})[v] || [v])[0];
  else a = String(v);
  return { answer: a, sure: SURE[fct.kind] || SURE.known };
}

// ---------------------------------------------------------------- one item
// Parts of an answer, each with its Fact's kind: a rough part reads "about ..." when the row says I know it.
function itemParts(collection, it) {
  const P = [];
  const add = (fct, words) => { if (isFact(fct) && fct.kind !== 'missing' && fct.kind !== 'notForMe' && fct.kind !== 'computed') P.push({ kind: fct.kind, words: words(fct.value) }); };
  const dates = () => { if (it.start) P.push({ words: 'from ' + dayWords(it.start) }); if (it.end) P.push({ words: 'until ' + dayWords(it.end) }); };
  if (collection === 'income' || collection === 'expenses') {
    add(it.amount, (v) => dollars(v) + (CADENCE[it.cadence] ? ' ' + CADENCE[it.cadence] : ''));
    if (collection === 'income' && it.withholding) {
      add(it.withholding.federal, (v) => dollars(v) + ' federal withheld');
      add(it.withholding.state, (v) => dollars(v) + ' state withheld');
    }
    if (P.length) dates();
  } else if (collection === 'debts') {
    add(it.balance, (v) => dollars(v) + ' left');
    add(it.minimum, (v) => dollars(v) + ' a month');
    add(it.apr, (v) => percent(v));
    add(it.limit, (v) => dollars(v) + ' limit');
    if (isFact(it.promoApr) && valueOf(it.promoApr) !== null && valueOf(it.promoEnds)) P.push({ kind: it.promoApr.kind === 'rough' || it.promoEnds.kind === 'rough' ? 'rough' : 'known', words: percent(it.promoApr.value) + ' intro until ' + dayWords(it.promoEnds.value) });
    add(it.payoffDate, (v) => 'paid off by ' + dayWords(v));
  } else if (collection === 'accounts') {
    add(it.balance, (v) => dollars(v));
    const rf = { cash: 'apy', fixedTerm: 'rate', taxable: 'expectedReturn', otherAssets: 'appreciationRate' }[it.family];
    if (rf) add(it[rf], (v) => percent(v) + ' a year');
    add(it.monthlyContribution, (v) => dollars(v) + ' a month in');
    add(it.contributions, (v) => (v || []).map((c) => c.year + ': ' + dollars(c.amount)).join(', '));
  } else if (collection === 'goals') {
    add(it.type === 'fi' ? it.fiNumber : it.target, (v) => dollars(v) + ' target');
    add(it.annualSpending, (v) => dollars(v) + ' a year');
    if (it.by && P.length) P.push({ words: 'by ' + dayWords(it.by) });
  }
  return P.filter((x) => x.words);
}
export function itemAnswer(collection, it) {
  const parts = itemParts(collection, it);
  const kinds = parts.filter((x) => x.kind).map((x) => x.kind);
  if (!kinds.length) return { answer: '', sure: SURE.missing };
  const allRough = kinds.every((k) => k === 'rough');
  const words = parts.map((x) => (!allRough && x.kind === 'rough' ? 'about ' + x.words : x.words)).join(', ');
  const lender = collection === 'debts' && valueOf(it.institution) ? valueOf(it.institution) + ': ' : '';
  return { answer: lender + words, sure: allRough ? SURE.rough : SURE.known };
}

// ---------------------------------------------------------------- the rows
// [{ id, question, answer, sure, notes, kind: 'section' | 'row' }]. blank: the client's empty sheet.
export function numbersRows(spine, map, { blank = false } = {}) {
  const rows = [];
  for (const sec of map.sections) {
    rows.push({ kind: 'section', id: 'section:' + sec.id, question: sec.title, answer: '', sure: '', notes: '' });
    for (const f of map.fields.filter((x) => x.section === sec.id && x.exportAs !== 'never')) {
      const a = blank ? { answer: '', sure: '' } : fieldAnswer(f, getAt(spine, fieldPath(spine, f)));
      rows.push({ kind: 'row', id: f.path, question: f.question, ...a, notes: '' });
    }
    if (!sec.collection) continue;
    if (blank) { for (const q of (map.starters || {})[sec.id] || []) rows.push({ kind: 'row', id: '', question: q, answer: '', sure: '', notes: '' }); continue; }
    for (const it of spine[sec.collection] || []) {
      if (sec.collection === 'expenses' && (valueOf(it.need) === false ? 'wants' : 'needs') !== sec.id) continue;
      rows.push({ kind: 'row', id: sec.collection + '.' + it.id, question: itemLabel(it, sec.collection), ...itemAnswer(sec.collection, it), notes: typeof it.notes === 'string' ? it.notes : '' });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- the Key
export function keyRows(today = TODAY) {
  const R = [];
  const line = (text, style = 'text', more = []) => R.push([{ v: text, style }, ...more]);
  line('How to fill in My Numbers', 'title');
  line('');
  line('What the colors mean', 'subhead');
  R.push([{ v: 'A box with a thick border is yours to fill in. Everything else is the question.', style: 'text' }, { v: 'Your answer', style: 'swatchAnswer' }]);
  R.push([{ v: 'Green: you know this number.', style: 'text' }, { v: SURE.known, style: 'swatchKnown' }]);
  R.push([{ v: 'Yellow: a rough guess for now. Fine to start with.', style: 'text' }, { v: SURE.rough, style: 'swatchRough' }]);
  R.push([{ v: 'Gray: you do not know it yet. It stays blank, never $0.', style: 'text' }, { v: SURE.missing, style: 'swatchMissing' }]);
  R.push([{ v: 'Blue rows are section headings. Leave them as they are.', style: 'text' }, { v: 'About you', style: 'section' }]);
  line('');
  line('Answers you can type (and how they are read)', 'subhead');
  const groups = [];
  for (const c of CASES.filter((x) => x.key)) if (!groups.includes(c.key)) groups.push(c.key);
  for (const g of groups) {
    line(g, 'section');
    for (const c of CASES.filter((x) => x.key === g)) {
      const r = parseAnswer(c.answer, { expect: c.expect, sure: c.sure || '', spending: !!c.spending, today });
      R.push([{ v: c.answer === '' ? '(left blank)' : c.answer, style: 'swatchAnswer' }, { v: 'reads as ' + r.reading.replace(/ \(rough: [^)]*\)$/, ''), style: 'notes' }]);
    }
  }
  line('');
  line('Zero is not the same as not known', 'subhead');
  line('Type $0 or none when the real number is zero (no car payment). That counts as zero.');
  line("Leave it blank, or type don't know, idk, ?, n/a or not sure, when you do not know yet. That is never counted as $0.");
  line('');
  line('Add your own row', 'subhead');
  line('Type a new row under the right section heading: the thing in Question (like "Gym" under Monthly spending: wants) and the amount in Your answer. Leave the first column empty. Rows can go in any order.');
  line('');
  line('Keep it private', 'subhead');
  line('This file holds real numbers. Keep it on your own computer or your own drive, and do not email or post it. SLAM reads it in your browser; it is never uploaded.');
  return R;
}

// ---------------------------------------------------------------- the workbook
export function numbersWorkbook(spine, map, { blank = false, today = TODAY } = {}) {
  const rows = numbersRows(spine, map, { blank });
  const out = [HEADERS.map((h) => ({ v: h, style: 'header' }))];
  for (const r of rows) {
    if (r.kind === 'section') out.push([{ v: r.id, style: 'id' }, { v: r.question, style: 'section' }, { v: '', style: 'section' }, { v: '', style: 'section' }, { v: '', style: 'section' }]);
    else out.push([{ v: r.id, style: 'id' }, { v: r.question, style: 'question' }, { v: r.answer, style: 'answer' }, { v: r.sure, style: 'sure' }, { v: r.notes, style: 'notes' }]);
  }
  // Room to add rows at the end, boxed like the rest.
  for (let i = 0; i < 10; i++) out.push([{ v: '', style: 'id' }, { v: '', style: 'question' }, { v: '', style: 'answer' }, { v: '', style: 'sure' }, { v: '', style: 'notes' }]);
  const last = out.length;
  const ref = 'D2:D' + last;
  const numbers = {
    name: 'My Numbers', gridlines: false, freezeRows: 1, rows: out,
    cols: [{ width: 4, hidden: true }, { width: 44 }, { width: 46 }, { width: 14 }, { width: 36 }],
    dropdowns: [{ ref, list: [SURE.known, SURE.rough, SURE.missing] }],
    colorIf: [{ ref, equals: SURE.known, color: 'known' }, { ref, equals: SURE.rough, color: 'rough' }, { ref, equals: SURE.missing, color: 'missing' }]
  };
  const key = { name: 'Key', gridlines: false, rows: keyRows(today), cols: [{ width: 70 }, { width: 50 }] };
  return writeXlsx([numbers, key]);
}
export const fileNameFor = (spine, blank) => (blank ? 'numbers-blank.xlsx' : 'my-numbers-' + spine.meta.asOf + '.local.xlsx');
export { PRESETS };

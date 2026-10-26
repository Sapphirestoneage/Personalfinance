// The numbers spreadsheet on My numbers (S-237): Import numbers spreadsheet (primary), Download my numbers and
// Download blank sheet for a client. An import shows a preview in plain words before anything changes, grouped as
// Will change, New, Needs a look (each with a quick fix) and Not in this file; Apply takes a snapshot first and
// offers Undo import after. Formatting and file handling only: matching and reading are js/sheet-import.js and
// js/parse-answer.js, the file is js/sheet-export.js. The file is read in this browser and never sent anywhere.

import { h, chip } from './view.js';
import { readSheets, planImport, planRow, applyImport, pickTargets, changeWords, targetWords, parseCsv } from '../js/sheet-import.js';
import { numbersWorkbook, fileNameFor } from '../js/sheet-export.js';

// SheetJS reads .xlsx (Google Sheets downloads either .xlsx or .csv). Loaded only when a spreadsheet is picked.
const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let sheetjs = null;
function loadSheetJs() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  if (!sheetjs) sheetjs = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = SHEETJS; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => (globalThis.XLSX ? ok(globalThis.XLSX) : fail(new Error('The spreadsheet reader did not load.')));
    s.onerror = () => { sheetjs = null; fail(new Error('The spreadsheet reader could not load (no internet?). A .csv file works without it.')); };
    document.head.append(s);
  });
  return sheetjs;
}
let mapP = null;
const loadMap = () => (mapP = mapP || fetch(new URL('../data/import-map.json', import.meta.url)).then((r) => { if (!r.ok) throw new Error('The question list (data/import-map.json) could not load.'); return r.json(); }));

// A picked file as sheets of text rows.
export async function fileSheets(file) {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return [{ name: file.name.replace(/\.csv$/i, ''), rows: parseCsv(await file.text()) }];
  const X = await loadSheetJs();
  const wb = X.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  return wb.SheetNames.map((name) => ({ name, rows: X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: true }) }));
}

function download(bytes, name) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// What the page holds: the preview being looked at, and the last import (its snapshot, for Undo import).
let preview = null, last = null;
// The quick-fix forms, built once per row while the preview is open (LIVE-FORM: built once), so a redraw never
// drops what is typed in one.
let fixForms = new Map();

// ctx: { spine: () => household, change(next, text), go(levels), say(text), refresh(), today: () => YYYY-MM-DD, canLeave }
export function sheetButtons(ctx, { primary = true } = {}) {
  const input = h('input', { type: 'file', id: 'sheet-file', accept: '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv', hidden: true, 'aria-label': 'Your numbers spreadsheet' });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    ctx.say('Reading ' + file.name + '...');
    try {
      const [map, sheets] = await Promise.all([loadMap(), fileSheets(file)]);
      const read = readSheets(sheets, map);
      if (read.problems.length) { ctx.say(read.problems[0] + ' Nothing changed.'); return; }
      preview = { file: file.name, map, plan: planImport(ctx.spine(), read.rows, map, { today: ctx.today() }), at: ctx.spine() };
      fixForms = new Map();
      ctx.say('Read ' + read.rows.length + ' rows from ' + file.name + '. Nothing has changed yet.');
      ctx.go(['import']);
    } catch (err) { console.warn(err); ctx.say('Could not read ' + file.name + ': ' + (err && err.message ? err.message : err) + ' Nothing changed.'); }
  });
  const dl = async (blank) => {
    try { const map = await loadMap(); download(numbersWorkbook(ctx.spine(), map, { blank, today: ctx.today() }), fileNameFor(ctx.spine(), blank)); ctx.say(blank ? 'Saved a blank sheet to your downloads' : 'Saved your numbers to your downloads. The file holds real numbers: keep it private'); }
    catch (err) { ctx.say('Could not make the sheet: ' + err.message); }
  };
  return [
    h('button', { type: 'button', class: primary ? 'btn primary' : 'btn', onclick: () => { if (ctx.canLeave()) input.click(); } }, 'Import numbers spreadsheet'), input,
    h('button', { type: 'button', class: 'btn', onclick: () => dl(false) }, 'Download my numbers'),
    h('button', { type: 'button', class: 'btn', onclick: () => dl(true) }, 'Download blank sheet for a client')
  ];
}

// The card after an import, on the top screen: what came in, and Undo import.
export function undoImportCard(ctx) {
  if (!last) return null;
  return h('section', { class: 'card', 'aria-labelledby': 'imported-h' },
    h('h2', { id: 'imported-h' }, 'Imported ' + last.file),
    h('p', { class: 'muted' }, last.count + (last.count === 1 ? ' answer' : ' answers') + ' changed or added, dated ' + last.today + '.'),
    h('div', { class: 'edit-actions' },
      h('button', { type: 'button', class: 'btn danger', onclick: () => { const snap = last.snapshot; last = null; ctx.change(snap, 'Import of the numbers spreadsheet undone'); } }, 'Undo import'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { last = null; ctx.refresh(); } }, 'Hide')));
}

// ---------------------------------------------------------------- the preview screen
const quote = (r) => "I read '" + (r.question ? r.question + ': ' : '') + (r.answer || '(blank)') + "' as " + r.reading + '.';
function notesOf(r) { return r.parse.notes.length ? h('p', { class: 'muted import-note' }, 'Assumed: ' + r.parse.notes.join('; ') + '.') : null; }

function rowItem(r, kind) {
  return h('li', { class: 'import-row' },
    h('p', {}, h('strong', {}, r.target ? targetWords(r.target) : r.question || 'Row ' + r.n), ' ', h('span', { class: 'muted' }, '(row ' + r.n + ')')),
    h('p', {}, quote(r)),
    kind === 'change' ? h('ul', { class: 'import-changes' }, r.changes.map((c) => h('li', {}, changeWords(c)))) : null,
    notesOf(r));
}

function fixForm(ctx, r) {
  if (fixForms.has(r.n)) return fixForms.get(r.n);
  const groups = pickTargets(preview.at, preview.map, r);
  const flat = [];
  const select = h('select', { 'aria-label': 'This row is about' },
    h('option', { value: '' }, r.target ? 'Keep: ' + targetWords(r.target) : 'Pick what this row is about'),
    ...groups.map((g) => h('optgroup', { label: g.group }, g.options.map((o) => { flat.push(o.target); return h('option', { value: String(flat.length - 1) }, o.label); }))));
  const input = h('input', { type: 'text', value: r.answer, 'aria-label': 'Your answer', autocomplete: 'off' });
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const form = h('form', { class: 'editor import-fix', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const target = select.value === '' ? (r.target || undefined) : flat[+select.value];
    if (!target) { msg.textContent = 'Pick what this row is about first.'; select.focus(); return; }
    const next = planRow(preview.at, preview.map, r, { today: ctx.today(), target, answer: input.value });
    if (next.group === 'review') { msg.textContent = next.why + '. Try other words, or pick another question.'; return; }
    preview.plan.rows = preview.plan.rows.map((x) => (x.n === r.n ? next : x));
    fixForms.delete(r.n);
    ctx.refresh();
  } },
    h('label', {}, 'This row is about', select),
    h('label', {}, 'Your answer', input, h('span', { class: 'muted hint' }, 'Like $1,000 a month, 6%, or Jan 2027')),
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Use this reading'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { preview.plan.rows = preview.plan.rows.map((x) => (x.n === r.n ? { ...x, group: 'skip' } : x)); fixForms.delete(r.n); ctx.refresh(); } }, 'Leave it out')),
    msg);
  fixForms.set(r.n, form);
  return form;
}

export function importScreen(ctx) {
  if (!preview) return [h('section', { class: 'card' }, h('p', {}, 'Nothing to preview. Choose Import numbers spreadsheet on My numbers.'))];
  const rows = preview.plan.rows;
  const by = (g) => rows.filter((r) => r.group === g);
  const change = by('change'), fresh = by('new'), look = by('review'), skipped = by('skip'), same = by('same');
  const n = change.length + fresh.length;
  const stale = ctx.spine() !== preview.at;
  const apply = () => {
    if (!n) return;
    const snapshot = ctx.spine();
    const next = applyImport(snapshot, preview.plan, { today: ctx.today() });
    last = { file: preview.file, snapshot, count: n, today: ctx.today() };
    preview = null; fixForms = new Map();
    ctx.change(next, 'Imported ' + n + (n === 1 ? ' answer' : ' answers') + ' from ' + last.file);
    ctx.go([]);
  };
  const section = (id, title, sub, rows, kind) => (rows.length ? h('section', { class: 'card', 'aria-labelledby': id }, h('h2', { id }, title + ' (' + rows.length + ')'), sub ? h('p', { class: 'muted' }, sub) : null, h('ul', { class: 'flow-list import-list' }, rows.map(kind))) : null);
  return [
    h('p', { class: 'muted' }, 'From ' + preview.file + '. Nothing has changed yet: look it over, then apply.'),
    stale ? h('p', { class: 'edit-msg', role: 'alert' }, 'Your numbers changed since this file was read. Cancel and import it again to see the changes against them.') : null,
    section('imp-change', 'Will change', 'Old value, then the new one.', change, (r) => rowItem(r, 'change')),
    section('imp-new', 'New', 'Answers that were blank here, and new lines.', fresh, (r) => rowItem(r, 'new')),
    section('imp-look', 'Needs a look', 'These are left out unless you fix them. Pick the right question, or edit the answer so it reads right.', look, (r) => h('li', { class: 'import-row' },
      h('p', {}, h('strong', {}, r.question || 'Row ' + r.n), ' ', h('span', { class: 'muted' }, '(row ' + r.n + ')'), ' ', chip('incomplete')),
      h('p', {}, r.why + '.'),
      r.answer ? h('p', { class: 'muted' }, quote(r)) : null,
      fixForm(ctx, r))),
    (same.length || skipped.length || preview.plan.notInFile.length) ? h('section', { class: 'card', 'aria-labelledby': 'imp-left' },
      h('h2', { id: 'imp-left' }, 'Left as is'),
      same.length ? h('details', { class: 'flow-list' }, h('summary', {}, 'Same as now, or blank in the file (' + same.length + ')'), h('ul', {}, same.map((r) => h('li', {}, (r.question || 'Row ' + r.n) + (r.answer ? ': ' + r.answer : ': blank'))))) : null,
      skipped.length ? h('details', { class: 'flow-list' }, h('summary', {}, 'You left out (' + skipped.length + ')'), h('ul', {}, skipped.map((r) => h('li', {}, (r.question || 'Row ' + r.n) + ': ' + (r.answer || 'blank'))))) : null,
      preview.plan.notInFile.length ? h('details', { class: 'flow-list' }, h('summary', {}, 'Not in this file (' + preview.plan.notInFile.length + ')'), h('ul', {}, preview.plan.notInFile.map((x) => h('li', {}, x.label)))) : null) : null,
    h('div', { class: 'edit-actions import-actions' },
      h('button', { type: 'button', class: 'btn primary', disabled: !n || stale, onclick: apply }, n ? 'Apply these changes' : 'Apply these changes'),
      h('button', { type: 'button', class: 'btn', onclick: () => { preview = null; fixForms = new Map(); ctx.go([]); ctx.say('Import cancelled. Nothing changed'); } }, 'Cancel'),
      !n ? h('span', { class: 'disabled-why' }, look.length ? 'Nothing to apply yet: fix a row under Needs a look first.' : 'Nothing to apply: the file matches your numbers.') : stale ? h('span', { class: 'disabled-why' }, 'Import the file again first.') : null)
  ];
}

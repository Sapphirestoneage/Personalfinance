/* Shared pieces of the calculator screens (Level 13, MR-067): the one-line
   answer in large type, the compact input panel with every field's state
   (hers, known, rough, guess, set here) and its one-line note, sliders
   paired with exact fields, money fields that take what people type
   ("1,650", "1.6k", "350 a month"), the detail table, and "Add this to my
   plan", which makes a scenario block and a goal through the record API.
   Views never do math; every number here was computed upstream. */
import { h, clear } from './dom.js';
import * as F from '../engine/format.js';
import { parseSaid } from '../engine/parse.js';
import { parseTyped } from './typed.js';
import { setCalculator } from '../engine/calculators.js';
import { newBlock } from '../engine/scenarios.js';

export const STATE_WORDS = { hers: 'Hers', known: 'Known', rough: 'Rough', guess: 'Average', set: 'Set here', missing: 'Missing' };
export function stateChip(state, name) { const w = state === 'hers' && name ? name + '’s' : STATE_WORDS[state] || state; return h('span', { class: 'chip calc-state state-' + state }, w); }

/* The answer at the top: one big number, one read-aloud sentence. */
export function answer(host, big, sentence, opts) { const o = opts || {}; clear(host); host.appendChild(h('div', { class: 'calc-answer' }, h('div', { class: 'calc-answer-label' }, o.label || ''), h('div', { class: 'calc-answer-big' + (o.small ? ' small' : '') }, big), sentence ? h('p', { class: 'read-aloud' }, sentence) : null)); return host; }
/* A missing-inputs card: what is needed, each a link into the room. */
export function needsCard(app, needs, hrefs) { return h('section', { class: 'panel calc-needs' }, h('h2', null, app.view === 'client' ? 'A few facts first' : 'Needs'), h('ul', null, needs.map(n => h('li', null, h('a', { href: (hrefs && hrefs[n]) || '#/ledger/income' }, n))))); }

const fmt = (f, v) => v === null || v === undefined || v === '' ? '' : f.kind === 'money' ? F.dollarsWhole(v) : f.kind === 'percent' ? F.percent(v, { places: v < 0.01 || Math.round(v * 10000) % 100 ? 2 : (Math.round(v * 1000) % 10 ? 1 : 0) }) : f.kind === 'int' ? F.integer(v) : String(v);
const raw = (f, v) => v === null || v === undefined ? '' : f.kind === 'money' ? String(v / 100) : f.kind === 'percent' ? String(Math.round(v * 10000) / 100) : String(v);
function parseField(f, text) {
  if (f.kind === 'money') { const p = parseSaid(text, { defaultCadence: 'month' }); if (!p || p.cents === null) return null; return p.cents; }
  if (f.kind === 'percent') { const p = parseTyped('percent', text); return p ? p.v : null; }
  if (f.kind === 'int') { const p = parseTyped('int', text); return p ? p.v : null; }
  return String(text).trim();
}
/* One field: label, control (slider + exact box when the field has one), state chip and note. */
export function fieldRow(app, calcId, f, onChange, clientName) {
  const commit = v => { app.change(rec => setCalculator(rec, calcId, { [f.id]: v }, { session: app.session }), { reason: 'calc', silent: true }); if (onChange) onChange(f.id, v); };
  let control;
  if (f.kind === 'bool') control = h('label', { class: 'calc-switch' }, h('input', { type: 'checkbox', checked: !!f.value, 'aria-label': f.label, onChange: e => commit(e.target.checked) }), h('span', null, f.value ? 'On' : 'Off'));
  else if (f.kind === 'choice') control = h('select', { class: 'select', 'aria-label': f.label, onChange: e => { const o = (f.options || []).find(x => String(x[0]) === e.target.value); commit(o ? o[0] : e.target.value); } }, (f.options || []).map(o => h('option', { value: String(o[0]), selected: String(o[0]) === String(f.value) }, o[1])));
  else {
    const input = h('input', { class: 'input' + (f.kind === 'text' ? '' : ' num') + (f.value === null || f.value === undefined ? ' is-empty' : ''), value: fmt(f, f.value), 'aria-label': f.label, inputmode: f.kind === 'text' ? null : 'decimal', title: f.value === null || f.value === undefined ? (f.kind === 'money' ? 'Amount' : 'Not entered') : null });
    input.addEventListener('focus', () => { if (f.kind !== 'text') { input.value = raw(f, f.value); input.select(); } });
    input.addEventListener('change', e => { try { const v = parseField(f, e.target.value); if (v === null) { input.value = fmt(f, f.value); return; } commit(v); } catch (err) { app.toast(err.message); input.value = fmt(f, f.value); } });
    input.addEventListener('blur', () => { input.value = fmt(f, f.value); });
    control = h('div', { class: 'calc-control' }, input);
    if (f.slider && f.value !== null && f.value !== undefined) { const s = h('input', { type: 'range', class: 'calc-slider', min: String(f.slider.min), max: String(f.slider.max), step: String(f.slider.step), value: String(f.value), 'aria-label': f.label + ' slider', onInput: e => { input.value = fmt(f, Number(e.target.value)); }, onChange: e => commit(Number(e.target.value)) }); control.appendChild(s); }
  }
  return h('div', { class: 'calc-field', dataset: { field: f.id } }, h('label', null, f.label), control, h('div', { class: 'calc-meta' }, stateChip(f.state, clientName), f.note ? h('span', { class: 'calc-note' }, f.note) : null, f.state === 'set' ? h('button', { class: 'linklike small', onClick: () => commit(null) }, 'Reset') : null));
}
/* The input panel: fields grouped under small headings, folded on a phone. */
export function inputPanel(app, calcId, fields, groups, opts) {
  const o = opts || {}; const name = o.clientName || null;
  const panel = h('section', { class: 'panel calc-inputs' }, h('h2', null, o.title || 'Inputs', h('span', { class: 'tag' }, o.tag || 'each with where it came from')));
  groups.forEach(([gid, label]) => { const list = fields.filter(f => f.group === gid && !f.hidden); if (!list.length) return; const open = o.openGroups ? o.openGroups.includes(gid) : true; const d = h('details', { class: 'calc-group', open: open || null, onToggle: e => { if (o.onToggle) o.onToggle(gid, e.target.open); } }, h('summary', null, label, h('span', { class: 'small muted' }, ' ' + list.length)), h('div', { class: 'calc-fields' }, list.map(f => fieldRow(app, calcId, f, o.onChange, name)))); panel.appendChild(d); });
  return panel;
}
/* A detail table from rows of [label, value, ...]. */
export function detailTable(head, rows, opts) { const o = opts || {}; return h('div', { class: 'tablewrap' }, h('table', { class: 'data calc-table' }, h('thead', null, h('tr', null, head.map((c, i) => h('th', { class: i ? 'num' : '' }, c)))), h('tbody', null, rows.map(r => h('tr', { class: r.cls || '' }, r.cells.map((c, i) => h('td', { class: i ? 'num' : 'wrap' }, c))))), o.foot ? h('tfoot', null, h('tr', null, o.foot.map((c, i) => h('td', { class: i ? 'num' : '' }, c)))) : null)); }
/* A chart card: name as heading, takeaway line, the drawing. */
export function chartCard(title, line, draw) { const body = h('div', { class: 'calc-chart-body' }); const card = h('section', { class: 'panel chart-panel calc-chart' }, h('header', null, h('h3', null, title)), line ? h('p', { class: 'takeaway' }, line) : null, body); setTimeout(() => draw(body), 0); return card; }
/* Add this to my plan: a scenario block (and a goal when asked), through the record API. */
export function addToPlan(app, q) {
  const defs = app.data.scenarioBlocks; const inp = app.result.projectionInputs; const year = (inp ? inp.year : new Date().getFullYear()) + (q.yearsOut || 1);
  const b = newBlock(q.blockType, defs, year, q.startMonth || null); b.name = q.name || b.name; Object.assign(b.answers, q.answers || {});
  app.mutate(rec => { rec.scenarios = rec.scenarios || []; rec.scenarios.push(b); }, 'scenarios');
  if (q.goal && q.goal.targetCents > 0) { const extras = (app.record.goals.extras || []).concat([{ id: 'x' + Date.now().toString(36), name: q.goal.name, targetCents: q.goal.targetCents, targetDate: q.goal.targetDate || null }]); app.goals({ extras }); }
  app.toast((q.name || b.name) + ' added to the plan' + (q.goal ? ', with a ' + q.goal.name.toLowerCase() + ' goal' : '') + '.', { label: 'See it', action: () => { location.hash = q.goal ? '#/goals' : '#/scenarios'; } });
  return b;
}
export function planButton(app, label, onClick) { return app.view === 'client' ? null : h('button', { class: 'btn primary', onClick }, label || 'Add this to my plan'); }
export const months = n => n === null || n === undefined ? 'not yet' : n === 0 ? 'now' : n < 12 ? n + (n === 1 ? ' month' : ' months') : (Math.round(n / 12 * 10) / 10) + ' years';
export const fiWords = e => !e || e.deltaMonths === null || e.deltaMonths === undefined ? 'no FI date yet' : Math.abs(e.deltaMonths) < 0.5 ? 'leaves the FI date where it is' : (e.deltaMonths > 0 ? 'moves the FI date ' + F.months(Math.abs(e.deltaMonths)) + ' later' : 'brings the FI date ' + F.months(Math.abs(e.deltaMonths)) + ' closer');

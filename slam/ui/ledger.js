// The Ledger: scan every field, grouped by DAITE; tap one to edit it, confirm
// it, or mark it not for me. Every edit can be undone. The list at the top is
// every rough and missing field, ordered by how much it changes the results.

import { ledgerRows, stillGuessing } from '../engine/ledger.js';
import { parseInput, inputText, editFact, createHistory, commit, undo, redo, canUndo, canRedo, undoLabel, redoLabel } from '../engine/edits.js';
import { getAt } from '../engine/spine.js';
import { loadAll, save, forgetSaved, SOURCE_WORDS } from './household.js';
import { h, chip, showValue, money, words, shortDate } from './view.js';

const MOVE_WORDS = { surplus: 'monthly surplus', netWorth: 'net worth', outlook: 'cash in 24 months', fiImplied: 'FI number from spending', taxDue: 'tax due' };
const BLOCK_WORDS = { surplus: 'surplus', runway: 'runway', yearsToFi: 'years to FI', taxDue: 'tax', outlook: '24-month outlook', utilization: 'utilization', netWorth: 'net worth', fiPercent: 'FI percent', fiNumber: 'FI number', fiImplied: 'FI from spending', promoMonthly: 'promo plan' };

let rules, hist, source, open = null, showAll = false, guess = null;
const today = () => new Date().toISOString().slice(0, 10);
const app = document.getElementById('app');

function apply(next, label) {
  hist = commit(hist, next, label);
  source = 'saved';
  save(hist.present);
  guess = null;
  render();
}

function step(fn) {
  const before = hist;
  hist = fn(hist);
  if (hist !== before) { save(hist.present); source = 'saved'; guess = null; render(); }
}

function editor(row) {
  const f = getAt(hist.present, row.path);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  let input;
  if (row.type.startsWith('choice:') || row.type === 'bool') {
    const opts = row.type === 'bool' ? [['true', 'Yes'], ['false', 'No']] : row.type.slice(7).split('|').map((x) => [x, words(x)]);
    input = h('select', { id: 'edit-input' }, h('option', { value: '' }, 'Choose'), ...opts.map(([v, t]) => h('option', { value: v, selected: f.value !== null && String(f.value) === v }, t)));
  } else if (row.type === 'list') {
    input = h('textarea', { id: 'edit-input', rows: 3 });
    input.value = inputText(row.type, f.value);
  } else {
    input = h('input', { id: 'edit-input', type: row.type === 'date' ? 'date' : 'text', inputmode: ['money', 'rate', 'int'].includes(row.type) ? 'decimal' : null, autocomplete: 'off' });
    input.value = inputText(row.type, f.value);
  }
  const hint = row.type === 'rate' ? 'As a percent: 25 means 25%' : row.type === 'list' ? 'A list, for example [{"year": 2026, "amount": 4000}]' : null;
  const doSet = (kind) => {
    const typed = row.type === 'bool' ? (input.value === '' ? '' : input.value === 'true' ? 'yes' : 'no') : input.value;
    const p = parseInput(row.type, typed);
    if (!p.ok) { msg.textContent = p.message; input.focus(); return; }
    open = null;
    apply(editFact(hist.present, row.path, 'set', { value: p.value, kind, today: today() }), row.label);
  };
  return h('div', { class: 'editor' },
    h('label', { for: 'edit-input', class: 'edit-label' }, row.label),
    input,
    hint && h('p', { class: 'edit-hint' }, hint),
    msg,
    h('div', { class: 'edit-actions' },
      h('button', { class: 'btn primary', onclick: () => doSet('known') }, 'Save'),
      h('button', { class: 'btn', onclick: () => doSet('rough') }, 'Save as a guess'),
      f.value !== null && f.kind !== 'known' && h('button', { class: 'btn', onclick: () => { open = null; apply(editFact(hist.present, row.path, 'confirm', { today: today() }), row.label); } }, 'Confirm'),
      f.kind !== 'notForMe' && h('button', { class: 'btn', onclick: () => { open = null; apply(editFact(hist.present, row.path, 'notForMe', { today: today() }), row.label); } }, 'Not for me'),
      h('button', { class: 'btn ghost', onclick: () => { open = null; render(); } }, 'Cancel')
    ));
}

function rowEl(row) {
  const f = row.fact;
  const shown = f.kind === 'notForMe' ? 'Does not apply' : f.value === null ? 'Not given yet' : showValue(f.value, row.type);
  const isOpen = open === row.path;
  return h('li', { class: 'row kind-' + f.kind + (isOpen ? ' open' : ''), id: 'f-' + row.path },
    h('button', { class: 'row-main', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { open = isOpen ? null : row.path; render(); } },
      h('span', { class: 'row-label' }, row.label),
      h('span', { class: 'row-value' + (f.value === null ? ' empty' : '') }, shown),
      chip(f.kind)),
    isOpen && editor(row));
}

function guessList() {
  if (!guess) guess = stillGuessing(hist.present, rules);
  const items = guess.items;
  const list = showAll ? items : items.slice(0, 8);
  const why = (it) => {
    if (it.kind === 'missing') return it.blocks.length ? 'Needed for ' + it.blocks.map((b) => BLOCK_WORDS[b] || b).join(', ') : 'Not needed by a result yet';
    const top = Object.entries(it.moves).filter(([k, d]) => MOVE_WORDS[k] && Math.abs(d) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    return top ? 'Off by ' + Math.round(guess.swing * 100) + '%, moves ' + MOVE_WORDS[top[0]] + ' by ' + money(Math.abs(top[1])) : 'Changes little';
  };
  return h('section', { class: 'card guessing', 'aria-labelledby': 'g-title' },
    h('h2', { id: 'g-title' }, 'Still guessing ', h('span', { class: 'count' }, String(items.length))),
    h('p', { class: 'muted' }, 'Missing first, then rough numbers, biggest effect on the results first.'),
    h('ol', { class: 'guess-list' }, list.map((it) => h('li', {},
      h('a', { href: '#' + it.path, onclick: (e) => { e.preventDefault(); openField(it.path); } }, chip(it.kind), ' ', it.label),
      h('span', { class: 'why' }, why(it))))),
    items.length > 8 && h('button', { class: 'btn ghost', onclick: () => { showAll = !showAll; render(); } }, showAll ? 'Show fewer' : 'Show all ' + items.length));
}

function openField(path) {
  open = path;
  render();
  const el = document.getElementById('f-' + path);
  if (el) { el.scrollIntoView({ block: 'center' }); const i = document.getElementById('edit-input'); if (i) i.focus({ preventScroll: true }); }
}

function render() {
  const spine = hist.present;
  const groups = ledgerRows(spine);
  const focusId = document.activeElement && document.activeElement.id;
  app.replaceChildren(
    h('header', { class: 'top' },
      h('div', {},
        h('h1', {}, 'Ledger'),
        h('p', { class: 'muted' }, spine.meta.name, ' · numbers as of ', shortDate(spine.meta.asOf), ' · ', SOURCE_WORDS[source])),
      h('nav', { class: 'top-actions' },
        h('button', { class: 'btn', disabled: !canUndo(hist), title: canUndo(hist) ? 'Undo ' + undoLabel(hist) : null, onclick: () => step(undo) }, 'Undo'),
        h('button', { class: 'btn', disabled: !canRedo(hist), title: canRedo(hist) ? 'Redo ' + redoLabel(hist) : null, onclick: () => step(redo) }, 'Redo'),
        h('a', { class: 'btn primary', href: 'dashboard.html' }, 'Dashboard'))),
    guessList(),
    ...groups.map((g) => {
      const red = g.rows.filter((r) => r.fact.kind === 'missing').length, yellow = g.rows.filter((r) => r.fact.kind === 'rough').length;
      return h('section', { class: 'card group', id: 'group-' + g.id, 'aria-labelledby': 'h-' + g.id },
        h('h2', { id: 'h-' + g.id }, h('span', { class: 'daite' }, g.id), ' ', g.label,
          h('span', { class: 'group-counts' }, red ? h('span', { class: 'dot dot-missing' }, red + ' missing') : null, yellow ? h('span', { class: 'dot dot-rough' }, yellow + ' rough') : null)),
        h('ul', { class: 'rows' }, g.rows.map(rowEl)));
    }),
    h('footer', { class: 'foot' },
      source === 'saved' && h('button', { class: 'btn ghost', onclick: resetAsk }, 'Go back to the file (drop edits saved in this browser)'))
  );
  if (focusId === 'edit-input') { const i = document.getElementById('edit-input'); if (i) i.focus({ preventScroll: true }); }
}

function resetAsk(e) {
  const box = h('span', { class: 'confirm' }, 'Drop every edit saved in this browser? ',
    h('button', { class: 'btn danger', onclick: async () => { forgetSaved(); await start(); } }, 'Drop them'),
    h('button', { class: 'btn ghost', onclick: () => render() }, 'Keep them'));
  e.currentTarget.replaceWith(box);
}

document.addEventListener('keydown', (e) => {
  if (!hist || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
  if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
  e.preventDefault();
  step(e.shiftKey ? redo : undo);
});
window.addEventListener('hashchange', () => { const p = decodeURIComponent(location.hash.slice(1)); if (p && hist) openField(p); });

async function start() {
  const loaded = await loadAll();
  rules = loaded.rules; source = loaded.source; hist = createHistory(loaded.spine); guess = null; open = null;
  render();
  const p = decodeURIComponent(location.hash.slice(1));
  if (p && getAt(hist.present, p)) openField(p);
}

start().catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The Ledger could not load: ' + err.message)); });

// The Ledger: scan every field, grouped by DAITE; tap one to edit it, confirm
// it, or mark it not for me. Every edit can be undone. The list at the top is
// every rough and missing field, ordered by how much it changes the results.

import { ledgerRows, stillGuessing, rowPathFor } from '../engine/ledger.js';
import { parseInput, inputText, editFact, parseCardRate, editCardRate, createHistory, commit, undo, redo, canUndo, canRedo, undoLabel, redoLabel } from '../engine/edits.js';
import { applyDefaults } from '../engine/defaults.js';
import { getAt } from '../engine/spine.js';
import { loadAll, save, forgetSaved, SOURCE_WORDS } from './household.js';
import { h, chip, showValue, money, words, shortDate } from './view.js';

const MOVE_WORDS = { surplus: 'monthly surplus', netWorth: 'net worth', outlook: 'cash in 24 months', fiImplied: 'FI number from spending', taxDue: 'tax due' };
const BLOCK_WORDS = { surplus: 'surplus', runway: 'runway', yearsToFi: 'years to FI', taxDue: 'tax', outlook: '24-month outlook', utilization: 'utilization', netWorth: 'net worth', fiPercent: 'FI percent', fiNumber: 'FI number', fiImplied: 'FI from spending', promoMonthly: 'promo plan' };

let rules, hist, source, open = null, showAll = false, guess = null;
// dirty: something was typed in the open editor and not saved yet (S-164).
// lastSaved: the line under the header that says what was just saved.
let dirty = false, lastSaved = null;
const today = () => new Date().toISOString().slice(0, 10);
const app = document.getElementById('app');

function apply(next, label, shown = null) {
  // House defaults (a card's default APR) refill any blank after every edit.
  hist = commit(hist, applyDefaults(next, rules), label);
  source = 'saved';
  const ok = save(hist.present);
  dirty = false;
  lastSaved = ok ? 'Saved in this browser: ' + label + (shown ? ' is ' + shown : '') + '.' : 'Could not save in this browser (storage is blocked), so this edit lasts only until the page closes.';
  guess = null;
  render();
}

function step(fn, verb) {
  const before = hist;
  hist = fn(hist);
  if (hist !== before) { save(hist.present); source = 'saved'; guess = null; dirty = false; lastSaved = verb; render(); }
}

// Leaving an editor with unsaved typing is refused with a message, never silent.
function canLeave() {
  if (!open || !dirty) return true;
  const msg = document.querySelector('.row.open .edit-msg');
  if (msg) msg.textContent = 'Not saved yet. Choose Save, Save as a guess, or Cancel.';
  const i = document.getElementById('edit-input');
  if (i) { i.scrollIntoView({ block: 'center' }); i.focus({ preventScroll: true }); }
  return false;
}

// An editor is a form: Enter saves (as known), typing marks it unsaved.
function editorForm(onSubmit, ...kids) {
  return h('form', { class: 'editor', novalidate: true, onsubmit: (e) => { e.preventDefault(); onSubmit(); }, oninput: () => { dirty = true; }, onchange: () => { dirty = true; } }, ...kids);
}
const cancel = () => { open = null; dirty = false; render(); };

// One panel for a card's interest rate (S-161): the APR, a switch for an intro
// rate, and when it is on, the intro rate and its end date; the APR then reads
// "Rate after intro". The switch shows and hides fields in place, so nothing
// typed is lost.
function cardRateEditor(row) {
  const cardId = row.path.split('.')[1];
  const cur = row.fact.value || { apr: null, intro: null };
  const startOn = !!cur.intro;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const fallback = showValue(rules.get('DEFAULT_CARD_APR', +hist.present.meta.asOf.slice(0, 4)), 'rate');
  const apr = h('input', { id: 'edit-input', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  apr.value = inputText('rate', cur.apr);
  const aprLabel = h('label', { for: 'edit-input', class: 'edit-label' }, startOn ? 'Rate after intro' : 'Interest rate (APR)');
  const afterNote = h('span', {}, startOn ? 'Starts the day after the intro ends. ' : '');
  const aprHint = h('p', { class: 'edit-hint' }, afterNote, 'As a percent: 25 means 25%. Left blank, the house assumption of ' + fallback + ' is used and marked rough.');
  const introRate = h('input', { id: 'intro-rate', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  introRate.value = cur.intro ? inputText('rate', cur.intro.rate) : '0';
  const introEnds = h('input', { id: 'intro-ends', type: 'date' });
  introEnds.value = (cur.intro && cur.intro.ends) || '';
  const introBox = h('div', { class: 'intro-fields', hidden: !startOn },
    h('label', { for: 'intro-rate', class: 'edit-label' }, 'Intro rate'), introRate,
    h('label', { for: 'intro-ends', class: 'edit-label' }, 'Intro ends'), introEnds);
  const state = h('span', { class: 'switch-state' }, startOn ? 'Yes' : 'No');
  const sw = h('button', {
    type: 'button', class: 'switch', role: 'switch', id: 'intro-switch', 'aria-checked': String(startOn), 'aria-labelledby': 'intro-switch-label',
    onclick: () => {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(on));
      state.textContent = on ? 'Yes' : 'No';
      introBox.hidden = !on;
      aprLabel.textContent = on ? 'Rate after intro' : 'Interest rate (APR)';
      afterNote.textContent = on ? 'Starts the day after the intro ends. ' : '';
      dirty = true;
      if (on) introRate.focus();
    }
  }, h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-knob' })), state);
  const doSet = (kind) => {
    const p = parseCardRate({ apr: apr.value, hasIntro: sw.getAttribute('aria-checked') === 'true', introRate: introRate.value, introEnds: introEnds.value });
    if (!p.ok) { msg.textContent = p.message; return; }
    open = null;
    apply(editCardRate(hist.present, cardId, 'set', { value: p.value, kind, today: today() }), row.label, showValue({ apr: p.value.apr ?? rules.get('DEFAULT_CARD_APR', +hist.present.meta.asOf.slice(0, 4)), intro: p.value.intro }, 'cardRate') + (kind === 'rough' ? ' (a guess)' : ''));
  };
  const act = (action) => { open = null; apply(editCardRate(hist.present, cardId, action, { today: today() }), row.label, action === 'notForMe' ? 'not for me' : 'confirmed'); };
  return editorForm(() => doSet('known'),
    aprLabel, apr, aprHint,
    h('div', { class: 'switch-row' }, h('span', { id: 'intro-switch-label', class: 'edit-label' }, 'Has an intro rate?'), sw),
    introBox,
    msg,
    h('div', { class: 'edit-actions' },
      h('button', { type: 'submit', class: 'btn primary' }, 'Save'),
      h('button', { type: 'button', class: 'btn', onclick: () => doSet('rough') }, 'Save as a guess'),
      row.fact.value !== null && row.fact.kind === 'rough' && h('button', { type: 'button', class: 'btn', onclick: () => act('confirm') }, 'Confirm'),
      row.fact.kind !== 'notForMe' && h('button', { type: 'button', class: 'btn', onclick: () => act('notForMe') }, 'Not for me'),
      h('button', { type: 'button', class: 'btn ghost', onclick: cancel }, 'Cancel')
    ));
}

function editor(row) {
  if (row.type === 'cardRate') return cardRateEditor(row);
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
    apply(editFact(hist.present, row.path, 'set', { value: p.value, kind, today: today() }), row.label, showValue(p.value, row.type) + (kind === 'rough' ? ' (a guess)' : ''));
  };
  return editorForm(() => doSet('known'),
    h('label', { for: 'edit-input', class: 'edit-label' }, row.label),
    input,
    hint && h('p', { class: 'edit-hint' }, hint),
    msg,
    h('div', { class: 'edit-actions' },
      h('button', { type: 'submit', class: 'btn primary' }, 'Save'),
      h('button', { type: 'button', class: 'btn', onclick: () => doSet('rough') }, 'Save as a guess'),
      f.value !== null && f.kind !== 'known' && h('button', { type: 'button', class: 'btn', onclick: () => { open = null; apply(editFact(hist.present, row.path, 'confirm', { today: today() }), row.label, 'confirmed'); } }, 'Confirm'),
      f.kind !== 'notForMe' && h('button', { type: 'button', class: 'btn', onclick: () => { open = null; apply(editFact(hist.present, row.path, 'notForMe', { today: today() }), row.label, 'not for me'); } }, 'Not for me'),
      h('button', { type: 'button', class: 'btn ghost', onclick: cancel }, 'Cancel')
    ));
}

function rowEl(row) {
  const f = row.fact;
  const shown = f.kind === 'notForMe' ? 'Does not apply' : f.value === null ? 'Not given yet' : showValue(f.value, row.type);
  const isOpen = open === row.path;
  return h('li', { class: 'row kind-' + f.kind + (isOpen ? ' open' : ''), id: 'f-' + row.path },
    h('button', { class: 'row-main', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { if (!canLeave()) return; open = isOpen ? null : row.path; dirty = false; render(); } },
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
  path = rowPathFor(hist.present, path);
  if (open !== path && !canLeave()) return;
  if (open !== path) dirty = false;
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
        h('button', { class: 'btn', disabled: !canUndo(hist), title: canUndo(hist) ? 'Undo ' + undoLabel(hist) : null, onclick: () => step(undo, 'Undone: ' + undoLabel(hist) + '.') }, 'Undo'),
        h('button', { class: 'btn', disabled: !canRedo(hist), title: canRedo(hist) ? 'Redo ' + redoLabel(hist) : null, onclick: () => step(redo, 'Redone: ' + redoLabel(hist) + '.') }, 'Redo'),
        h('a', { class: 'btn primary', href: 'dashboard.html' }, 'Dashboard'))),
    h('p', { class: 'saved-line', role: 'status', 'aria-live': 'polite' }, lastSaved || ''),
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
  if (e.shiftKey) step(redo, 'Redone: ' + redoLabel(hist) + '.');
  else step(undo, 'Undone: ' + undoLabel(hist) + '.');
});
// Closing or leaving the page with unsaved typing asks first.
window.addEventListener('beforeunload', (e) => { if (open && dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', () => { const p = decodeURIComponent(location.hash.slice(1)); if (p && hist) openField(p); });

async function start() {
  const loaded = await loadAll();
  rules = loaded.rules; source = loaded.source; hist = createHistory(loaded.spine); guess = null; open = null;
  render();
  const p = decodeURIComponent(location.hash.slice(1));
  if (p && getAt(hist.present, rowPathFor(hist.present, p))) openField(p);
}

start().catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The Ledger could not load: ' + err.message)); });

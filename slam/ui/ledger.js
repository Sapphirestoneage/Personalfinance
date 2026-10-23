// The Ledger: every field, grouped by DAITE and then by kind, institution and
// account (S-169); tap one to edit it, confirm it, or mark it not for me; add
// and remove accounts, debts, income, expenses and goals; select several to
// confirm or mark them at once. Every edit can be undone. The list at the top is
// every rough and missing field, ordered by how much it changes the results.

import { ledgerRows, stillGuessing, rowPathFor, previewCost } from '../engine/ledger.js';
import { payersOf, shareOf } from '../engine/sharing.js';
import { ledgerTree } from '../engine/ledger-tree.js';
import { PRESETS, INCOME_TYPES, CADENCES, FAT } from '../engine/schema.js';
import { parseInput, inputText, editFact, putFact, parseCardRate, editCardRate, editExpense, setSectionSharing, addItem, removeItem, bulkEdit, createHistory, commit, undo, redo, canUndo, canRedo, undoLabel, redoLabel } from '../engine/edits.js';
import { applyDefaults } from '../engine/defaults.js';
import { getAt, valueOf } from '../engine/spine.js';
import { loadAll, save, forgetSaved, SOURCE_WORDS } from './household.js';
import { h, chip, showValue, money, words, shortDate } from './view.js';

const MOVE_WORDS = { surplus: 'monthly surplus', netWorth: 'net worth', outlook: 'cash in 24 months', fiImplied: 'FI number from spending', taxDue: 'tax due' };
const BLOCK_WORDS = { surplus: 'surplus', runway: 'runway', yearsToFi: 'years to FI', taxDue: 'tax', outlook: '24-month outlook', utilization: 'utilization', netWorth: 'net worth', fiPercent: 'FI percent', fiNumber: 'FI number', fiImplied: 'FI from spending', promoMonthly: 'promo plan' };

let rules, hist, source, inst, open = null, showAll = false, guess = null;
// The tree (S-169): which items are open, which add form is open, and select mode.
let openItems = new Set(), adding = null, selecting = false, selected = new Set();
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

// The expense panel (S-175, S-176): one question at a time. How much, and how
// often. Who pays: I pay all of it; I share it (how many people, my share, who
// pays the bill); or someone else covers it (pick who, or add a name). A live
// line says what it costs you a month. The switch between answers shows and
// hides fields in place, so nothing typed is lost.
const HOW_OFTEN = [['monthly', 'a month'], ['weekly', 'a week'], ['biweekly', 'every two weeks'], ['semimonthly', 'twice a month'], ['quarterly', 'a quarter'], ['yearly', 'a year']];
function expenseEditor(row) {
  const id = row.path.split('.')[1];
  const e = getAt(hist.present, 'expenses.' + id);
  const cur = row.fact.value || {};
  const sh = shareOf(hist.present, e);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const amount = h('input', { id: 'edit-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0' });
  amount.value = inputText('money', valueOf(e.amount));
  const often = h('select', { id: 'exp-often', 'aria-label': 'How often' }, HOW_OFTEN.map(([k, w]) => h('option', { value: k, selected: e.cadence === k }, w)));
  const startMode = cur.covered ? 'covered' : sh.shared ? 'shared' : 'me';
  const mode = h('select', { id: 'exp-mode' },
    h('option', { value: 'me', selected: startMode === 'me' }, 'I pay all of it'),
    h('option', { value: 'shared', selected: startMode === 'shared' }, 'I share it with others'),
    h('option', { value: 'covered', selected: startMode === 'covered' }, 'Someone else covers it'));
  // Shared details
  const people = h('input', { id: 'exp-people', type: 'text', inputmode: 'numeric', autocomplete: 'off' });
  people.value = sh.shared && sh.people ? String(sh.people) : '2';
  const share = h('input', { id: 'exp-share', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'even split' });
  share.value = sh.shared && valueOf(e.yourShare) !== null && e.yourShare ? inputText('rate', valueOf(e.yourShare)) : '';
  const whole = h('input', { type: 'radio', name: 'exp-who', value: 'whole', checked: sh.whoPays === 'whole' });
  const part = h('input', { type: 'radio', name: 'exp-who', value: 'part', checked: sh.whoPays !== 'whole' });
  const sharedBox = h('fieldset', { class: 'sub-fields', hidden: startMode !== 'shared' },
    h('legend', {}, 'Sharing it'),
    h('label', { for: 'exp-people', class: 'edit-label' }, 'How many people share it, you included?'), people,
    h('label', { for: 'exp-share', class: 'edit-label' }, 'Your share, as a percent'), share,
    h('p', { class: 'edit-hint' }, 'Leave blank for an even split.'),
    h('span', { class: 'edit-label' }, 'Who pays the bill?'),
    h('label', { class: 'radio' }, part, ' Each of us pays our own part'),
    h('label', { class: 'radio' }, whole, ' I pay all of it and get paid back'),
    sh.fromDefault ? h('p', { class: 'edit-hint' }, 'Bills in this section are shared by default.') : null);
  // Covered by
  const payers = payersOf(hist.present);
  const by = h('select', { id: 'exp-by' }, payers.map((p) => h('option', { value: p, selected: cur.coveredBy === p }, p)), h('option', { value: '__other' }, 'Other / add a name...'));
  const other = h('input', { id: 'exp-other', type: 'text', autocomplete: 'off', placeholder: 'Who covers it?', hidden: true, 'aria-label': 'Who covers it' });
  by.addEventListener('change', () => { other.hidden = by.value !== '__other'; if (!other.hidden) other.focus(); });
  const coveredBox = h('fieldset', { class: 'sub-fields', hidden: startMode !== 'covered' },
    h('legend', {}, 'Covered'),
    h('label', { for: 'exp-by', class: 'edit-label' }, 'Covered by'), by, other,
    h('p', { class: 'edit-hint' }, 'A covered expense counts $0 toward your spending.'));
  const amountLabel = h('label', { for: 'edit-input', class: 'edit-label' }, startMode === 'shared' ? 'How much is the whole bill?' : 'How much is it?');
  const yours = h('p', { class: 'edit-preview', 'aria-live': 'polite' });
  const readShare = () => { const p = parseInput('int', people.value); const y = share.value.trim() ? parseInput('rate', share.value) : { ok: true, value: null }; return { people: p.ok ? p.value : null, share: y.ok ? y.value : null }; };
  const preview = () => {
    const a = parseInput('money', amount.value);
    if (!a.ok) { yours.textContent = ''; return; }
    if (mode.value === 'covered') { yours.textContent = 'Costs you $0 a month.'; return; }
    const r = readShare();
    const m = previewCost(a.value, often.value, mode.value === 'shared', r.people, r.share);
    yours.textContent = m === null ? '' : 'Costs you ' + money(m) + ' a month.';
  };
  mode.addEventListener('change', () => {
    sharedBox.hidden = mode.value !== 'shared'; coveredBox.hidden = mode.value !== 'covered';
    amountLabel.textContent = mode.value === 'shared' ? 'How much is the whole bill?' : 'How much is it?';
    preview();
  });
  for (const el of [amount, often, people, share]) el.addEventListener('input', preview);
  often.addEventListener('change', preview);
  preview();
  const doSet = (kind) => {
    const a = amount.value.trim() === '' && mode.value === 'covered' ? { ok: true, value: valueOf(e.amount) } : parseInput('money', amount.value);
    if (!a.ok) { msg.textContent = 'How much: ' + a.message; amount.focus(); return; }
    let sharing = null, coveredBy = null;
    if (mode.value === 'shared') {
      const r = readShare();
      if (!r.people || r.people < 2) { msg.textContent = 'How many people: 2 or more, you included'; people.focus(); return; }
      sharing = { shared: true, sharedWith: r.people, yourShare: r.share, whoPays: whole.checked ? 'whole' : 'part' };
    } else if (mode.value === 'me') sharing = { shared: false };
    if (mode.value === 'covered') {
      coveredBy = by.value === '__other' ? other.value.trim() : by.value;
      if (!coveredBy) { msg.textContent = 'Who covers it?'; other.focus(); return; }
      sharing = null;
    }
    open = null;
    apply(editExpense(hist.present, id, { amount: a.value, cadence: often.value, sharing, coveredBy: mode.value === 'covered' ? coveredBy : null, kind }, today()), e.label, yours.textContent.replace(/^Costs you /, '').replace(/\.$/, '') + (kind === 'rough' ? ' (a guess)' : ''));
  };
  return editorForm(() => doSet('known'),
    h('p', { class: 'edit-title' }, e.label),
    amountLabel, h('div', { class: 'amount-row' }, amount, often),
    h('label', { for: 'exp-mode', class: 'edit-label' }, 'Who pays?'), mode,
    sharedBox, coveredBox, yours, msg,
    h('div', { class: 'edit-actions' },
      h('button', { type: 'submit', class: 'btn primary' }, 'Save'),
      h('button', { type: 'button', class: 'btn', onclick: () => doSet('rough') }, 'Save as a guess'),
      row.fact.value !== null && row.fact.kind === 'rough' && h('button', { type: 'button', class: 'btn', onclick: () => { open = null; apply(editFact(hist.present, row.path, 'confirm', { today: today() }), e.label, 'confirmed'); } }, 'Confirm'),
      row.fact.kind !== 'notForMe' && h('button', { type: 'button', class: 'btn', onclick: () => { open = null; apply(editFact(hist.present, row.path, 'notForMe', { today: today() }), e.label, 'not for me'); } }, 'Not for me'),
      h('button', { type: 'button', class: 'btn ghost', onclick: cancel }, 'Cancel')));
}

// A section's sharing default (S-175): "Bills here are just mine" or "shared",
// with the details new and untouched expenses here follow.
let sharingOpen = null;
function sectionSharing(n) {
  const tag = n.key.startsWith('E:') ? n.key.slice(2) : null;
  if (!tag || tag === 'health' || selecting) return null;
  const d = (hist.present.household.expenseDefaults || {})[tag];
  const on = !!d && d.shared && d.shared.value === true;
  const words = on ? 'Shared by default with ' + ((d.sharedWith && d.sharedWith.value) || '?') + ' people' : 'Not shared by default';
  if (sharingOpen !== tag) return h('p', { class: 'section-default' }, words, ' ', h('button', { type: 'button', class: 'btn ghost small', onclick: () => { if (!canLeave()) return; sharingOpen = tag; render(); } }, 'Change'));
  const people = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'People sharing, you included' });
  people.value = on && d.sharedWith && d.sharedWith.value ? String(d.sharedWith.value) : '2';
  const sw = h('select', { 'aria-label': 'Default for this section' }, h('option', { value: 'no', selected: !on }, 'Just mine'), h('option', { value: 'yes', selected: on }, 'Shared'));
  const whole = h('select', { 'aria-label': 'Who pays the bill' }, h('option', { value: 'part' }, 'Each pays their own part'), h('option', { value: 'whole', selected: on && d.whoPays && d.whoPays.value === 'whole' }, 'I pay it all and get paid back'));
  const details = h('div', { class: 'sub-fields', hidden: !on }, h('label', { class: 'edit-label' }, 'People sharing, you included'), people, h('label', { class: 'edit-label' }, 'Who pays the bills'), whole);
  sw.addEventListener('change', () => { details.hidden = sw.value !== 'yes'; });
  return h('form', { class: 'editor section-default-form', onsubmit: (ev) => {
    ev.preventDefault();
    const p = parseInput('int', people.value);
    if (sw.value === 'yes' && (!p.ok || p.value < 2)) return;
    sharingOpen = null;
    apply(setSectionSharing(hist.present, tag, { shared: sw.value === 'yes', sharedWith: sw.value === 'yes' ? p.value : null, whoPays: whole.value }, today()), n.label + ' bills', sw.value === 'yes' ? 'shared by default' : 'not shared by default');
  } }, h('label', { class: 'edit-label' }, n.label + ' bills are'), sw, details,
  h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'), h('button', { type: 'button', class: 'btn ghost', onclick: () => { sharingOpen = null; render(); } }, 'Cancel')));
}

function editor(row) {
  if (row.type === 'cardRate') return cardRateEditor(row);
  if (row.type === 'expense') return expenseEditor(row);
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
  const isOpen = open === row.path && !selecting;
  const label = row.field || row.label;
  if (selecting) {
    const on = selected.has(row.path);
    return h('li', { class: 'row kind-' + f.kind + (on ? ' picked' : ''), id: 'f-' + row.path },
      h('label', { class: 'row-main row-pick' },
        h('input', { type: 'checkbox', checked: on, onchange: () => { if (on) selected.delete(row.path); else selected.add(row.path); render(); } }),
        h('span', { class: 'row-label' }, label),
        h('span', { class: 'row-value' + (f.value === null ? ' empty' : '') }, shown),
        chip(f.kind)));
  }
  return h('li', { class: 'row kind-' + f.kind + (isOpen ? ' open' : ''), id: 'f-' + row.path },
    h('button', { class: 'row-main', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { if (!canLeave()) return; open = isOpen ? null : row.path; dirty = false; render(); } },
      h('span', { class: 'row-label' }, label),
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
  selecting = false;
  for (const key of itemKeysFor(path)) openItems.add(key);
  render();
  const el = document.getElementById('f-' + path);
  if (el) { el.scrollIntoView({ block: 'center' }); const i = document.getElementById('edit-input'); if (i) i.focus({ preventScroll: true }); }
}

// ---------------------------------------------------------------- view filters (S-168)
// Which kinds show, a search, and folded groups. A per-browser convenience:
// kept in localStorage when it can be, and the page works without it.
const VIEW_KEY = 'slam-ledger-view:v1';
const KIND_ORDER = ['missing', 'rough', 'known', 'computed', 'notForMe'];
const KIND_LABEL = { missing: 'Missing', rough: 'Rough', known: 'Known', computed: 'Computed', notForMe: 'Not for me' };
let view = (() => {
  try { const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'); if (v && Array.isArray(v.kinds)) return { kinds: v.kinds, q: '', folded: v.folded || [] }; } catch { /* storage blocked */ }
  return { kinds: [...KIND_ORDER], q: '', folded: [] };
})();
const keepView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ kinds: view.kinds, folded: view.folded })); } catch { /* storage blocked */ } };
const setView = (patch) => { if (!canLeave()) return; view = { ...view, ...patch }; keepView(); render(); };
const onlyKind = (k) => setView({ kinds: [k], folded: [] });
const shows = (row) => view.kinds.includes(row.fact.kind) && (!view.q || (row.label + ' ' + row.path).toLowerCase().includes(view.q.toLowerCase()));

const filtering = () => view.q !== '' || view.kinds.length !== KIND_ORDER.length;

// The tree keys of the item (and its parents) that hold a field.
function itemKeysFor(path) {
  const keys = [];
  const walk = (n, trail) => {
    if (n.item) { if (n.rows.some((r) => r.path === path)) keys.push(...trail, n.key); return; }
    for (const c of n.children) walk(c, [...trail, n.key]);
  };
  for (const g of ledgerTree(hist.present, inst)) walk(g, []);
  return keys;
}

function filterBar(tree) {
  const all = tree.flatMap((g) => g.allRows);
  const n = (k) => all.filter((r) => r.fact.kind === k).length;
  const showing = all.filter(shows).length;
  const toggle = (k) => setView({ kinds: view.kinds.includes(k) ? view.kinds.filter((x) => x !== k) : [...view.kinds, k] });
  const search = h('input', { id: 'ledger-search', type: 'search', placeholder: 'Find a field (press /)', autocomplete: 'off', 'aria-label': 'Find a field' });
  search.value = view.q;
  search.addEventListener('input', () => { view = { ...view, q: search.value }; render(); });
  const itemKeys = tree.flatMap(function keys(nd) { return nd.item ? [nd.key] : nd.children.flatMap(keys); });
  return h('section', { class: 'card filters', 'aria-label': 'Show fields' },
    h('div', { class: 'filter-row' },
      h('span', { class: 'filter-label' }, 'Show:'),
      ...KIND_ORDER.filter((k) => n(k)).map((k) => h('button', { type: 'button', class: 'filter-chip chip-' + k, 'aria-pressed': String(view.kinds.includes(k)), onclick: () => toggle(k), title: (view.kinds.includes(k) ? 'Hide ' : 'Show ') + KIND_LABEL[k].toLowerCase() + ' fields' }, KIND_LABEL[k] + ' ' + n(k)))),
    h('div', { class: 'filter-row' },
      h('button', { type: 'button', class: 'btn', onclick: () => setView({ kinds: KIND_ORDER.filter((k) => k !== 'known' && k !== 'computed') }) }, 'Hide known'),
      h('button', { type: 'button', class: 'btn', onclick: () => onlyKind('missing') }, 'Only missing'),
      h('button', { type: 'button', class: 'btn', onclick: () => setView({ kinds: [...KIND_ORDER], q: '' }) }, 'Show everything'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { if (!canLeave()) return; if (openItems.size) openItems = new Set(); else openItems = new Set(itemKeys); render(); } }, openItems.size ? 'Close all items' : 'Open all items'),
      h('button', { type: 'button', class: 'btn' + (selecting ? ' primary' : ''), 'aria-pressed': String(selecting), onclick: () => { if (!canLeave()) return; selecting = !selecting; selected = new Set(); open = null; render(); } }, selecting ? 'Done selecting' : 'Select several')),
    search,
    h('p', { class: 'muted', role: 'status' }, 'Showing ' + showing + ' of ' + all.length + ' fields.'),
    h('nav', { class: 'jump', 'aria-label': 'Jump to a group' }, tree.map((g) => h('a', { href: '#group-' + g.key, onclick: (e) => { e.preventDefault(); if (view.folded.includes(g.key)) setView({ folded: view.folded.filter((x) => x !== g.key) }); document.getElementById('group-' + g.key)?.scrollIntoView({ block: 'start' }); } }, g.label))));
}

// The counts are buttons: tapping "8 missing" shows only missing fields (S-168).
const countBtns = (c) => h('span', { class: 'group-counts' },
  c.missing ? h('button', { type: 'button', class: 'dot dot-missing', onclick: (e) => { e.stopPropagation(); onlyKind('missing'); }, title: 'Show only missing fields' }, c.missing + ' missing') : null,
  c.rough ? h('button', { type: 'button', class: 'dot dot-rough', onclick: (e) => { e.stopPropagation(); onlyKind('rough'); }, title: 'Show only rough fields' }, c.rough + ' rough') : null);

const ADD_WORDS = { debts: 'a debt', accounts: 'an account', income: 'income', expenses: 'an expense', goals: 'a goal' };
const GOAL_WORDS = { savings: 'Savings target', payoff: 'Pay something off', fi: 'Financial independence', other: 'Other goal' };

// An add form, built once when opened (S-169): a type when there is a choice,
// a name, how often for money that repeats.
function addForm(n) {
  const { collection, types = [], fat } = n.add;
  const typeSel = types.length > 1 ? h('select', { id: 'add-type-' + n.key, 'aria-label': 'Kind' }, types.map((t) => h('option', { value: t }, collection === 'income' ? words(t) : collection === 'goals' ? GOAL_WORDS[t] : PRESETS[t].label))) : null;
  const name = h('input', { type: 'text', id: 'add-name', placeholder: collection === 'expenses' ? 'What it is for' : 'Name, for example Chase Freedom', autocomplete: 'off', 'aria-label': 'Name' });
  const cad = collection === 'income' || collection === 'expenses' ? h('select', { 'aria-label': 'How often' }, CADENCES.filter((c) => c !== 'total').map((c) => h('option', { value: c, selected: c === 'monthly' }, words(c)))) : null;
  const fatSel = collection === 'expenses' && fat === null && n.key === 'E' ? h('select', { 'aria-label': 'Kind of spending' }, h('option', { value: '' }, 'Not food, housing or transportation'), FAT.map((t) => h('option', { value: t }, words(t)))) : null;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  return h('form', { class: 'editor add-form', onsubmit: (e) => {
    e.preventDefault();
    const label = name.value.trim();
    if (!label) { msg.textContent = 'Give it a name'; name.focus(); return; }
    const type = typeSel ? typeSel.value : types[0];
    const made = addItem(hist.present, { collection, type, label, cadence: cad ? cad.value : 'monthly', fat: fatSel ? fatSel.value || null : fat ?? null }, today());
    adding = null;
    apply(made.spine, 'Added ' + label);
    openField(made.firstPath);
  } }, typeSel, name, cad, fatSel, msg,
  h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add'), h('button', { type: 'button', class: 'btn ghost', onclick: () => { adding = null; render(); } }, 'Cancel')));
}

function addButton(n) {
  if (!n.add || selecting) return null;
  if (adding === n.key) return addForm(n);
  const what = n.add.types && n.add.types.length === 1 && PRESETS[n.add.types[0]] ? 'a ' + PRESETS[n.add.types[0]].label.toLowerCase() : ADD_WORDS[n.add.collection];
  return h('button', { type: 'button', class: 'btn add', onclick: () => { if (!canLeave()) return; adding = n.key; render(); document.getElementById('add-name')?.focus(); } }, '+ Add ' + what);
}

// An expense someone else pays counts $0 toward spending (S-171).
function coveredBtn(it) {
  if (it.collection !== 'expenses') return null;
  const path = 'expenses.' + it.id + '.covered';
  const f = getAt(hist.present, path);
  const on = !!f && f.value === true;
  return h('button', { type: 'button', class: 'btn small', onclick: () => apply(putFact(hist.present, path, !on, 'known', today()), it.label, on ? 'paid by you' : 'paid by someone else (counts $0)') }, on ? 'I pay this' : 'Paid by someone else');
}

// One item: a header with its headline value that opens and closes it, its
// fields, and Remove (undo brings it back).
function itemEl(it) {
  const rows = it.rows.filter(shows);
  if (filtering() && !rows.length) return null;
  const isOpen = openItems.has(it.key) || (filtering() && rows.length > 0) || it.single;
  const main = it.summary && it.rows.find((r) => r.path === it.summary);
  const mainText = main ? (main.fact.value === null ? (main.fact.kind === 'notForMe' ? 'does not apply' : 'not given') : showValue(main.fact.value, main.type)) : '';
  if (it.single) return rows.map(rowEl).map((li) => { li.querySelector('.row-label').textContent = it.label; return li; });
  const toggle = () => { if (!canLeave()) return; if (openItems.has(it.key)) openItems.delete(it.key); else openItems.add(it.key); render(); };
  const remove = it.collection ? h('button', { type: 'button', class: 'btn ghost small', onclick: (e) => {
    const box = h('span', { class: 'confirm' }, 'Remove ' + it.label + '? ',
      h('button', { type: 'button', class: 'btn danger', onclick: () => { open = null; openItems.delete(it.key); apply(removeItem(hist.present, it.collection, it.id), 'Removed ' + it.label); } }, 'Remove'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => render() }, 'Keep'));
    e.currentTarget.replaceWith(box);
  } }, 'Remove') : null;
  const pickAll = selecting ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => { const all = rows.every((r) => selected.has(r.path)); for (const r of rows) all ? selected.delete(r.path) : selected.add(r.path); render(); } }, 'Select these') : null;
  return h('li', { class: 'item' + (isOpen ? ' open' : ''), id: 'item-' + it.key },
    h('div', { class: 'item-head' },
      h('button', { type: 'button', class: 'fold item-fold', 'aria-expanded': String(isOpen), onclick: toggle },
        h('span', { class: 'fold-mark', 'aria-hidden': 'true' }, isOpen ? '-' : '+'), h('span', { class: 'item-name' }, it.label), mainText ? h('span', { class: 'item-main' }, mainText) : null),
      countBtns(it.counts), pickAll),
    isOpen ? h('ul', { class: 'rows' }, rows.length ? rows.map(rowEl) : h('li', { class: 'muted' }, 'Nothing to fill in here.')) : null,
    isOpen && !selecting ? h('div', { class: 'item-actions' }, remove) : null);
}

// A section or sub-section: its label and counts, its add button, its children.
function nodeEl(n, depth) {
  if (n.item) return itemEl(n);
  const kids = n.children.flatMap((c) => [nodeEl(c, depth + 1)]).flat().filter(Boolean);
  if (filtering() && !kids.length) return null;
  const folded = view.folded.includes(n.key);
  const fold = () => setView({ folded: folded ? view.folded.filter((x) => x !== n.key) : [...view.folded, n.key] });
  const Tag = depth === 1 ? 'h3' : 'h4';
  const pickAll = selecting ? h('button', { type: 'button', class: 'btn ghost small', onclick: () => { const rows = n.allRows.filter(shows); const all = rows.every((r) => selected.has(r.path)); for (const r of rows) all ? selected.delete(r.path) : selected.add(r.path); render(); } }, 'Select all here') : null;
  return h('li', { class: 'node depth-' + depth, id: 'node-' + n.key },
    h('div', { class: 'node-head' },
      h(Tag, {}, h('button', { type: 'button', class: 'fold', 'aria-expanded': String(!folded), onclick: fold }, h('span', { class: 'fold-mark', 'aria-hidden': 'true' }, folded ? '+' : '-'), n.label)),
      countBtns(n.counts), pickAll),
    folded ? null : sectionSharing(n),
    folded ? null : h('ul', { class: 'tree' }, kids),
    folded ? null : addButton(n));
}

function groupEl(g) {
  const kids = g.children.flatMap((c) => [nodeEl(c, 1)]).flat().filter(Boolean);
  if (filtering() && !kids.length) return null;
  const folded = view.folded.includes(g.key);
  const fold = () => setView({ folded: folded ? view.folded.filter((x) => x !== g.key) : [...view.folded, g.key] });
  return h('section', { class: 'card group', id: 'group-' + g.key, 'aria-labelledby': 'h-' + g.key },
    h('h2', { id: 'h-' + g.key },
      h('button', { type: 'button', class: 'fold', 'aria-expanded': String(!folded), onclick: fold, title: folded ? 'Open this group' : 'Fold this group' }, h('span', { class: 'daite' }, g.key), ' ', g.label, h('span', { class: 'fold-mark', 'aria-hidden': 'true' }, folded ? '+' : '-')),
      countBtns(g.counts)),
    folded ? null : h('ul', { class: 'tree' }, kids.length ? kids : h('li', { class: 'muted' }, 'Nothing here yet.')),
    folded ? null : addButton(g));
}

// Select mode's action bar: what to do with every picked field at once.
function bulkBar(tree) {
  if (!selecting) return null;
  const rows = tree.flatMap((g) => g.allRows).filter((r) => selected.has(r.path));
  const run = (action, word) => { if (!rows.length) return; const n = rows.length; apply(bulkEdit(hist.present, rows, action, today()), word + ' ' + n + ' field' + (n === 1 ? '' : 's')); selected = new Set(); };
  return h('div', { class: 'bulk-bar', role: 'region', 'aria-label': 'Selected fields' },
    h('span', { class: 'bulk-count' }, rows.length + ' selected'),
    h('button', { type: 'button', class: 'btn primary', disabled: !rows.length, onclick: () => run('confirm', 'Confirmed') }, 'Confirm'),
    h('button', { type: 'button', class: 'btn', disabled: !rows.length, onclick: () => run('rough', 'Marked rough:') }, 'Mark rough'),
    h('button', { type: 'button', class: 'btn', disabled: !rows.length, onclick: () => run('notForMe', 'Not for me:') }, 'Not for me'),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => { selected = new Set(tree.flatMap((g) => g.allRows).filter(shows).map((r) => r.path)); render(); } }, 'Select all shown'),
    h('button', { type: 'button', class: 'btn ghost', onclick: () => { selected = new Set(); render(); } }, 'Clear'));
}

function render() {
  const spine = hist.present;
  const tree = ledgerTree(spine, inst);
  const focusId = document.activeElement && document.activeElement.id;
  const caret = focusId === 'ledger-search' ? document.activeElement.selectionStart : null;
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
    filterBar(tree),
    ...tree.map(groupEl).filter(Boolean),
    bulkBar(tree),
    h('footer', { class: 'foot' },
      h('a', { class: 'btn ghost', href: '#' }, 'Back to top'),
      source === 'saved' && h('button', { class: 'btn ghost', onclick: resetAsk }, 'Go back to the file (drop edits saved in this browser)'))
  );
  if (focusId === 'edit-input') { const i = document.getElementById('edit-input'); if (i) i.focus({ preventScroll: true }); }
  if (focusId === 'ledger-search') { const i = document.getElementById('ledger-search'); if (i) { i.focus({ preventScroll: true }); i.setSelectionRange(caret, caret); } }
}

function resetAsk(e) {
  const box = h('span', { class: 'confirm' }, 'Drop every edit saved in this browser? ',
    h('button', { class: 'btn danger', onclick: async () => { forgetSaved(); await start(); } }, 'Drop them'),
    h('button', { class: 'btn ghost', onclick: () => render() }, 'Keep them'));
  e.currentTarget.replaceWith(box);
}

// "/" jumps to the field search (S-168).
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || (e.target && /input|textarea|select/i.test(e.target.tagName))) return;
  const i = document.getElementById('ledger-search');
  if (i) { e.preventDefault(); i.focus(); }
});
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
  rules = loaded.rules; source = loaded.source; inst = loaded.institutions; hist = createHistory(loaded.spine); guess = null; open = null;
  if (loaded.problem) lastSaved = loaded.problem;
  render();
  const p = decodeURIComponent(location.hash.slice(1));
  if (p && getAt(hist.present, rowPathFor(hist.present, p))) openField(p);
}

start().catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The Ledger could not load: ' + err.message)); });

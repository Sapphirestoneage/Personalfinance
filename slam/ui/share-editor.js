// The people on a shared bill (shared bills brief): one row each, name, their part and how they pay you back, inside
// the expense editor. LIVE-FORM: built once when the editor opens; Add a person and Remove change the list in place, so
// nothing typed is lost. read() gives { whoPays, people, problem }; the engine (engine/owed.js) figures the rest.
// Formatting only.

import { h, money } from './view.js';
import { dateBox } from './understood.js';
import { parseInput, inputText } from '../engine/edits.js';
import { arrangementOf, personStatus, sharerNames, billNumbers, PAYBACK_WORDS } from '../engine/owed.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let seq = 0;

export function shareEditor(spine, e, { onChange = () => {} } = {}) {
  const arr = arrangementOf(spine, e);
  const asOf = spine.meta.asOf;
  const list = h('ul', { class: 'share-people', 'aria-label': 'People on this bill' });
  const names = h('datalist', { id: 'share-names' }, sharerNames(spine).map((n) => h('option', { value: n })));
  const whole = h('input', { type: 'radio', name: 'share-who', value: 'whole', checked: arr.whoPays === 'whole' });
  const part = h('input', { type: 'radio', name: 'share-who', value: 'part', checked: arr.whoPays !== 'whole' });
  const whoPays = () => (whole.checked ? 'whole' : 'part');
  const rows = [];

  function personRow(p) {
    const n = ++seq, id = (k) => 'sp-' + n + '-' + k;
    const name = h('input', { id: id('name'), type: 'text', list: 'share-names', autocomplete: 'off', maxlength: '40', placeholder: 'e.g. Sam' });
    name.value = p && !/^Person \d+$/.test(p.name) ? p.name : '';
    const mode = h('select', { id: id('mode') }, [['even', 'Even split'], ['percent', 'A percent'], ['amount', 'Dollars']].map(([k, w]) => h('option', { value: k, selected: (p ? p.share.mode : 'even') === k }, w)));
    const val = h('input', { id: id('val'), type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 9' });
    if (p && p.share.mode === 'percent' && p.share.value !== null) val.value = inputText('rate', p.share.value);
    if (p && p.share.mode === 'amount' && p.share.value !== null) val.value = inputText('money', p.share.value);
    const valBox = h('div', { class: 'share-val', hidden: mode.value === 'even' }, h('label', { for: id('val'), class: 'edit-label' }, 'Their part'), val);
    const back = h('select', { id: id('back') }, Object.entries(PAYBACK_WORDS).map(([k, w]) => h('option', { value: k, selected: (p ? p.payBack : 'each') === k }, w)));
    // The details each way of paying back needs, shown only for it.
    // The date boxes read a date typed any way (S-285), each held once it reads.
    let throughIso = p && p.paidThrough && p.payBack === 'ahead' ? p.paidThrough : '', startIso = p && p.start ? p.start : '', askIso = p && p.askOn ? p.askOn : '';
    const through = dateBox(id('through'), throughIso, (v) => { throughIso = v; });
    const every = h('input', { id: id('every'), type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 3' }); every.value = p && p.payBack === 'every' ? String(p.every) : '';
    const start = dateBox(id('start'), startIso, (v) => { startIso = v; });
    const month = h('select', { id: id('month') }, MONTH_NAMES.map((m, i) => h('option', { value: String(i + 1), selected: p && p.month === i + 1 }, m)));
    const askOn = dateBox(id('ask'), askIso, (v) => { askIso = v; });
    const field = (label, input) => h('div', { class: 'share-field' }, h('label', { for: input.id, class: 'edit-label' }, label), input);
    const ways = {
      ahead: field('Paid through', through),
      every: h('div', { class: 'share-pair' }, field('Every how many months', every), field('Starting', start)),
      yearly: field('In which month', month)
    };
    const wayBox = h('div', { class: 'share-way' }, Object.values(ways));
    const askBox = field('Ask on a day you pick (optional)', askOn);
    const backBox = h('div', { class: 'share-back' }, field('How they pay you back', back), wayBox, askBox);
    const sync = (fire = true) => {
      valBox.hidden = mode.value === 'even';
      backBox.hidden = whoPays() !== 'whole';
      for (const [k, el] of Object.entries(ways)) el.hidden = back.value !== k;
      askBox.hidden = back.value === 'cover';
      if (fire) onChange();
    };
    for (const el of [mode, back]) el.addEventListener('change', sync);
    for (const el of [name, val, every]) el.addEventListener('input', onChange);
    // Its status, for a person already saved ("Owes $13 since Sep", "Covered through Aug 2027").
    const st = p && p.name && arr.people.includes(p) ? personStatus(spine, e, arr, p, asOf) : null;
    const li = h('li', { class: 'share-person' },
      h('div', { class: 'share-top' }, field('Name', name), h('div', { class: 'share-field' }, h('label', { for: id('mode'), class: 'edit-label' }, 'Their share'), mode), valBox),
      st && arr.whoPays === 'whole' ? h('p', { class: 'share-status' }, st.status) : null,
      backBox,
      h('button', { type: 'button', class: 'btn small danger', onclick: () => { const i = rows.indexOf(row); if (i >= 0) rows.splice(i, 1); li.remove(); onChange(); } }, 'Remove'));
    const read = () => {
      const nm = name.value.trim();
      if (!nm) return { problem: 'Each person needs a name' };
      let share = { mode: mode.value, value: null };
      if (mode.value === 'percent') { const r = parseInput('rate', val.value); if (!r.ok || r.value > 1) return { problem: nm + ': type their part as a percent, like 25' }; share.value = r.value; }
      if (mode.value === 'amount') { const r = parseInput('money', val.value); if (!r.ok) return { problem: nm + ': type their part in dollars' }; share.value = r.value; }
      const out = { ...(p || {}), name: nm, share, payBack: back.value };
      const unread = (box, iso, words) => (box.value.trim() && !iso ? nm + ': ' + words + ', type a date like Dec 6' : null);
      if (back.value === 'ahead') { const bad = unread(through, throughIso, 'paid through'); if (bad) return { problem: bad }; out.paidThrough = throughIso || null; }
      if (back.value === 'every') { const r = parseInput('int', every.value || '3'); if (!r.ok || r.value < 1) return { problem: nm + ': every how many months, 1 or more' }; out.every = r.value; const bad = unread(start, startIso, 'starting'); if (bad) return { problem: bad }; out.start = startIso || null; }
      if (back.value === 'yearly') out.month = +month.value;
      if (back.value !== 'cover') { const bad = unread(askOn, askIso, 'ask on'); if (bad) return { problem: bad }; }
      out.askOn = back.value === 'cover' ? null : askIso || null;
      return { person: out };
    };
    const row = { li, read, sync };
    sync(false);
    return row;
  }
  const addRow = (p) => { const r = personRow(p); rows.push(r); list.append(r.li); return r; };
  for (const p of arr.people) addRow(p);
  if (!arr.people.length) addRow(null);
  for (const el of [whole, part]) el.addEventListener('change', () => { for (const r of rows) r.sync(); onChange(); });

  const el = h('div', { class: 'share-editor' },
    h('span', { class: 'edit-label' }, 'Who pays the bill?'),
    h('label', { class: 'radio' }, part, ' Each of us pays our own part'),
    h('label', { class: 'radio' }, whole, ' I pay all of it and get paid back'),
    names, list,
    h('button', { type: 'button', class: 'btn small add', onclick: () => { const r = addRow(null); r.li.querySelector('input').focus(); onChange(); } }, '+ Add a person'));
  return {
    el,
    read() {
      if (!rows.length) return { problem: 'Add at least one other person, or untick Shared' };
      const people = [];
      for (const r of rows) { const x = r.read(); if (x.problem) return { problem: x.problem }; people.push(x.person); }
      return { whoPays: whoPays(), people };
    },
    // The three numbers for a bill amount (engine/owed.js billNumbers): what leaves, your part, what comes back.
    numbers(bill) { const r = this.read(); return r.problem ? null : billNumbers(r, bill); }
  };
}
export const threeNumbers = (x, often) => (x ? 'Leaves your account ' + money(x.leaves) + ' ' + often + '. Your share ' + money(x.yours) + '. Comes back ' + money(x.back) + '.' : '');

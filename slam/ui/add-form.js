// The add form (S-237): one form for every item type, used by the Session and by My numbers. It asks first (what kind,
// then the questions for that kind), then the name, then the amount, which is always there. Every dropdown shows
// plain words. The answers go to engine/add.js addWithAnswers, so both screens save the same thing.
// LIVE-FORM: built once. Picking a kind or an answer redraws only the questions under it, never the name or amount.

import { addWithAnswers, INCOME_FIRST, INCOME_MORE, OFTEN_WORDS, PAY_SCHEDULE, W2_BASIS, SELF_BASIS, namePlaceholder, amountWords, firstIncomeType } from '../engine/add.js';
import { parseInput } from '../engine/edits.js';
import { PRESETS, FAT, PERSON_PURPOSE_WORDS } from '../engine/schema.js';
import { payersOf } from '../engine/sharing.js';
import { h } from './view.js';

const GOAL_WORDS = { savings: 'Savings target', payoff: 'Pay something off', fi: 'Financial independence', other: 'Other goal' };
const FAT_WORDS = { food: 'Food', accommodation: 'Housing', transportation: 'Transportation' };

const field = (id, label, control, hint) => h('div', { class: 'add-field' }, h('label', { for: id, class: 'edit-label' }, label), control, hint ? h('p', { class: 'edit-hint' }, hint) : null);
const select = (id, options, value) => h('select', { id }, options.map(([k, w]) => h('option', { value: k, selected: k === value || null }, w)));

// addForm({ spine (the household, or a function returning it), collection, types, fat, today, onDone, onCancel }) -> a <form>
//   onDone(made, label): made is { spine, id, firstPath, collection } from addWithAnswers.
export function addForm({ spine: spineOf, collection, types = [], fat = null, today, onDone, onCancel }) {
  // The household is read when it is needed, so edits made while the form is open are kept.
  const now = () => (typeof spineOf === 'function' ? spineOf() : spineOf);
  const spine = now();
  const income = collection === 'income';
  const typeList = income
    ? [...INCOME_FIRST, ...INCOME_MORE].filter(([k]) => !types.length || types.includes(k))
    : types.map((t) => [t, collection === 'goals' ? GOAL_WORDS[t] : PRESETS[t] ? PRESETS[t].label : t]);
  const first = income && typeList.some(([k]) => k === firstIncomeType(spine, today)) ? firstIncomeType(spine, today) : (typeList[0] || [null])[0];
  const typeSel = typeList.length > 1 ? select('add-type', typeList, first) : null;
  const kind = () => (typeSel ? typeSel.value : first);

  const name = h('input', { type: 'text', id: 'add-name', autocomplete: 'off' });
  const amount = h('input', { type: 'text', id: 'add-amount', inputmode: 'decimal', autocomplete: 'off', placeholder: '$' });
  const amountLabel = h('label', { for: 'add-amount', class: 'edit-label' });
  const often = income || collection === 'expenses' ? select('add-often', OFTEN_WORDS, 'monthly') : null;
  if (often) often.setAttribute('aria-label', 'How often');
  const fatSel = collection === 'expenses' && fat === null ? select('add-fat', [['', 'Something else (not food, housing or transportation)'], ...FAT.map((t) => [t, FAT_WORDS[t] || t])], '') : null;
  const qs = h('div', { class: 'add-questions' });
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  // The answers, kept while the kind changes so switching back finds them.
  const ans = { payBasis: null, schedule: 'biweekly', hours: '', weeks: '', endDate: '', from: '', purpose: '' };

  const pick = (id, label, options, key) => { const s = select(id, [['', 'Pick one'], ...options], ans[key] || ''); s.addEventListener('change', () => { ans[key] = s.value || null; draw(); }); return field(id, label, s); };
  const text = (id, label, key, attrs = {}, hint) => { const b = h('input', { id, type: 'text', autocomplete: 'off', ...attrs }); b.value = ans[key] || ''; b.addEventListener('input', () => { ans[key] = b.value; }); return field(id, label, b, hint); };

  function draw() {
    const t = kind();
    name.placeholder = namePlaceholder(collection, t);
    name.setAttribute('aria-label', 'Name');
    amountLabel.textContent = amountWords(collection, t, ans);
    const out = [];
    let showOften = !!often;
    if (income && t === 'w2') {
      out.push(pick('add-basis', 'How are you paid?', W2_BASIS, 'payBasis'));
      if (ans.payBasis === 'hourly') out.push(text('add-hours', 'Hours a week', 'hours', { inputmode: 'numeric', placeholder: 'hours' }));
      const sched = select('add-schedule', PAY_SCHEDULE, ans.schedule);
      sched.addEventListener('change', () => { ans.schedule = sched.value; });
      out.push(field('add-schedule', 'Paid how often', sched));
      showOften = false;
    }
    if (income && (t === '1099' || t === 'side')) {
      out.push(pick('add-basis', 'Does it come in steady or in lumps?', SELF_BASIS, 'payBasis'));
      if (ans.payBasis === 'lumpy') showOften = false;
    }
    if (income && t === 'unemployment') {
      out.push(text('add-weeks', 'Weeks of benefits left', 'weeks', { inputmode: 'numeric', placeholder: 'weeks' }, 'Or give the end date below.'));
      out.push(field('add-end', 'Last week paid (optional)', (() => { const d = h('input', { id: 'add-end', type: 'date' }); d.value = ans.endDate; d.addEventListener('input', () => { ans.endDate = d.value; }); return d; })()));
      showOften = false;
    }
    if (income && t === 'person') {
      const list = h('datalist', { id: 'add-from-list' }, payersOf(spine).map((n) => h('option', { value: n })));
      out.push(text('add-from', 'Who it is from', 'from', { list: 'add-from-list', placeholder: 'e.g. Parents' }), list);
      out.push(pick('add-purpose', 'What it is for', Object.entries(PERSON_PURPOSE_WORDS), 'purpose'));
      if (ans.purpose === 'loan') out.push(h('p', { class: 'edit-hint' }, 'A loan is money you owe, so it goes under Debt.'));
    }
    if (often) often.hidden = !showOften;
    if (ans.payBasis && income && !((t === 'w2' && W2_BASIS.some(([k]) => k === ans.payBasis)) || ((t === '1099' || t === 'side') && SELF_BASIS.some(([k]) => k === ans.payBasis)))) ans.payBasis = null;
    qs.replaceChildren(...out);
  }
  if (typeSel) typeSel.addEventListener('change', () => { ans.payBasis = null; draw(); });
  draw();

  const submit = (e) => {
    e.preventDefault();
    msg.textContent = '';
    const t = kind();
    const a = amount.value.trim() === '' ? { ok: true, value: null } : parseInput('money', amount.value);
    if (!a.ok) { msg.textContent = 'How much: ' + a.message; amount.focus(); return; }
    const answers = { payBasis: ans.payBasis, from: ans.from, purpose: ans.purpose || null };
    if (t === 'w2' && ans.payBasis === 'hourly' && String(ans.hours).trim()) {
      const n = parseInput('int', ans.hours);
      if (!n.ok || n.value < 1 || n.value > 100) { msg.textContent = 'Hours a week: a number from 1 to 100'; return; }
      answers.hoursPerWeek = n.value;
    }
    if (t === 'unemployment') {
      if (String(ans.weeks).trim()) { const n = parseInput('int', ans.weeks); if (!n.ok || n.value < 0 || n.value > 99) { msg.textContent = 'Weeks left: a number from 0 to 99'; return; } answers.weeksLeft = n.value; }
      if (ans.endDate) answers.endDate = ans.endDate;
    }
    const cadence = t === 'w2' ? ans.schedule : often && !often.hidden ? often.value : 'monthly';
    let made;
    try { made = addWithAnswers(now(), { collection, type: t, label: name.value, amount: a.value, cadence, fat: fatSel ? fatSel.value || null : fat, answers }, today); } catch (err) { msg.textContent = err.message; return; }
    const label = name.value.trim() || (typeList.find(([k]) => k === t) || [t, t])[1];
    onDone(made, label);
  };

  return h('form', { class: 'editor add-form', onsubmit: submit },
    typeSel ? field('add-type', income ? 'What kind of income?' : 'What kind?', typeSel) : null,
    qs,
    field('add-name', 'Name', name),
    h('div', { class: 'add-field' }, amountLabel, h('div', { class: 'amount-row' }, amount, often), h('p', { class: 'edit-hint' }, 'Blank is fine for now.')),
    fatSel ? field('add-fat', 'Type of spending', fatSel) : null,
    msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add'), h('button', { type: 'button', class: 'btn ghost', onclick: onCancel }, 'Cancel')));
}

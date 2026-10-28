// The add form (S-237): one form for every item type, used by the Session and by My numbers. Slim by default: the name
// and the amount first ("$" in the box; "1k", "1,000" and "$1,000" all read), then what kind only for a general Add (an
// Add from a group starts on that group's kind), then the questions for that kind, and the rest under More options
// (institution, rate, minimum and due day, as of, a note). A hint shows only while its box is empty. Enter adds, Esc
// cancels. The answers go to engine/add.js addWithAnswers and addMore, so every screen saves the same thing.
// LIVE-FORM: built once. Picking a kind or an answer redraws only the questions under it, never the name or amount.

import { planFor } from './employer-plans.js';
import { inlineTicks, featuresForType, typeName } from './ticks.js';
import { tickFeature } from '../engine/features.js';
import { applyTemplate } from '../engine/employer-plans.js';
import { addWithAnswers, addMore, moreFields, INCOME_FIRST, INCOME_MORE, OFTEN_WORDS, PAY_SCHEDULE, W2_BASIS, SELF_BASIS, namePlaceholder, amountWords, firstIncomeType } from '../engine/add.js';
import { parseInput, addMaybe, putFact } from '../engine/edits.js';
import { setAt } from '../engine/spine.js';
import { PRESETS, FAT, PERSON_PURPOSE_WORDS, POLICY_TYPES } from '../engine/schema.js';
import { payersOf } from '../engine/sharing.js';
import { h } from './view.js';

const GOAL_WORDS = { savings: 'Savings target', payoff: 'Pay something off', fi: 'Financial independence', other: 'Other goal' };
const FAT_WORDS = { food: 'Food', accommodation: 'Housing', transportation: 'Transportation' };

// A labeled box; its hint shows only while the box (input) is empty. short: half width on a computer.
const field = (id, label, control, hint, input = null, short = false) => {
  const tip = hint ? h('p', { class: 'edit-hint' }, hint) : null;
  if (tip && input) { const sync = () => { tip.hidden = input.value.trim() !== ''; }; input.addEventListener('input', sync); sync(); }
  return h('div', { class: 'add-field' + (short ? ' short' : '') }, h('label', { for: id, class: 'edit-label' }, label), control, tip);
};
const box = (id, attrs = {}) => h('input', { type: 'text', id, autocomplete: 'off', ...attrs });
// "$" inside a money box, "%" at the end of a rate box.
const dollars = (input) => h('div', { class: 'affix' }, h('span', { class: 'affix-sym', 'aria-hidden': 'true' }, '$'), input);
const percent = (input) => h('div', { class: 'affix affix-end' }, input, h('span', { class: 'affix-sym', 'aria-hidden': 'true' }, '%'));
// Opening a form never scrolls the page.
export const focusAdd = () => (document.getElementById('add-type') || document.getElementById('add-name'))?.focus({ preventScroll: true });
const select = (id, options, value) => h('select', { id }, options.map(([k, w]) => h('option', { value: k, selected: k === value || null }, w)));
// The account picker (S-262): groups in a set order, the 401(k)s together and the IRAs together; the Roth twins are
// left out (the Roth box picks them); a few shorter names where Roth is the box.
const ACCOUNT_GROUPS = [
  ['Cash', ['checking', 'savings', 'hysa', 'money_market']],
  ['Bonds and CDs', ['cd', 'treasury', 'i_bond']],
  ['401(k) and workplace plans', ['k401', 'solo_k401', 'after_tax_k401', 'k403b', 'k457b', 'tsp']],
  ['IRAs', ['traditional_ira', 'rollover_ira', 'spousal_ira', 'inherited_ira', 'sep_ira', 'simple_ira']],
  ['HSA and FSA', ['hsa', 'health_fsa', 'lp_fsa', 'dc_fsa']],
  ['Investing', ['brokerage', 'joint_brokerage', 'espp', 'rsu', 'crypto']],
  ['Education and kids', ['k529', 'coverdell', 'utma', 'custodial_roth', 'able', 'trump']]
];
const ACCOUNT_NAMES = { k401: '401(k)', traditional_ira: 'IRA' };
const ROTH_TWINS = ['roth_k401', 'roth_ira'];
function accountSelect(types, value) {
  const have = new Set(types.filter((t) => !ROTH_TWINS.includes(t)));
  const named = (t) => ACCOUNT_NAMES[t] || (PRESETS[t] ? PRESETS[t].label : t);
  const placed = new Set(ACCOUNT_GROUPS.flatMap(([, ts]) => ts));
  const groups = [...ACCOUNT_GROUPS.map(([g, ts]) => [g, ts.filter((t) => have.has(t))]), ['Other', [...have].filter((t) => !placed.has(t))]].filter(([, ts]) => ts.length);
  const v = ROTH_TWINS.includes(value) ? { roth_k401: 'k401', roth_ira: 'traditional_ira' }[value] : value;
  return h('select', { id: 'add-type' }, groups.map(([g, ts]) => h('optgroup', { label: g }, ts.map((t) => h('option', { value: t, selected: t === v || null }, named(t))))));
}

// addForm({ spine (the household, or a function returning it), collection, types, fat, today, onDone, onCancel }) -> a <form>
//   onDone(made, label): made is { spine, id, firstPath, collection } from addWithAnswers.
export function addForm({ spine: spineOf, collection, types = [], fat = null, today, onDone, onCancel }) {
  // The household is read when it is needed, so edits made while the form is open are kept.
  const now = () => (typeof spineOf === 'function' ? spineOf() : spineOf);
  const spine = now();
  const income = collection === 'income';
  const typeList = income
    ? [...INCOME_FIRST, ...INCOME_MORE].filter(([k]) => !types.length || types.includes(k))
    : types.map((t) => [t, collection === 'goals' ? GOAL_WORDS[t] : collection === 'policies' ? POLICY_TYPES[t] : PRESETS[t] ? PRESETS[t].label : t]);
  const first = income && typeList.some(([k]) => k === firstIncomeType(spine, today)) ? firstIncomeType(spine, today) : (typeList[0] || [null])[0];
  // Accounts (owner's ask, 2026-10-27, S-262): grouped by kind (all the 401(k)s together, all the IRAs together), and
  // Roth is a tick box, not its own line: a 401(k) or an IRA with Roth ticked is the Roth version.
  const accounts = collection === 'accounts';
  const ROTH_OF = { k401: 'roth_k401', traditional_ira: 'roth_ira' };
  const typeSel = typeList.length > 1 ? (accounts ? accountSelect(typeList.map(([k]) => k), first) : select('add-type', typeList, first)) : null;
  const roth = accounts ? h('input', { type: 'checkbox', id: 'add-roth' }) : null;
  const rothRow = roth ? h('label', { class: 'check-row', for: 'add-roth' }, roth, ' Roth (money goes in after tax)') : null;
  const syncRoth = () => { if (rothRow) rothRow.hidden = !ROTH_OF[typeSel ? typeSel.value : first]; };
  const kind = () => { const k = typeSel ? typeSel.value : first; return roth && roth.checked && ROTH_OF[k] ? ROTH_OF[k] : k; };

  const name = box('add-name');
  const amount = box('add-amount', { inputmode: 'decimal', placeholder: 'e.g. 1,200 or 1.2k' });
  const amountLabel = h('label', { for: 'add-amount', class: 'edit-label' });
  const often = (income || collection === 'expenses') && collection !== 'maybe' ? select('add-often', OFTEN_WORDS, 'monthly') : null;
  if (often) often.setAttribute('aria-label', 'How often');
  const fatSel = collection === 'expenses' && fat === null ? select('add-fat', [['', 'Something else (not food, housing or transportation)'], ...FAT.map((t) => [t, FAT_WORDS[t] || t])], '') : null;
  const qs = h('div', { class: 'add-questions' });
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  // The answers, kept while the kind changes so switching back finds them.
  const ans = { payBasis: null, schedule: 'biweekly', hours: '', weeks: '', endDate: '', from: '', purpose: '', dir: 'in', likely: 0.5, date: '', by: '' };
  const maybe = collection === 'maybe';

  const pick = (id, label, options, key) => { const s = select(id, [['', 'Pick one'], ...options], ans[key] || ''); s.addEventListener('change', () => { ans[key] = s.value || null; draw(); }); return field(id, label, s); };
  const text = (id, label, key, attrs = {}, hint) => { const b = h('input', { id, type: 'text', autocomplete: 'off', ...attrs }); b.value = ans[key] || ''; b.addEventListener('input', () => { ans[key] = b.value; }); return field(id, label, b, hint); };

  function draw() {
    const t = kind();
    name.placeholder = maybe ? 'e.g. Tax refund' : namePlaceholder(collection, t);
    name.setAttribute('aria-label', 'Name');
    amountLabel.textContent = (typeSel ? '2. ' : '') + (maybe ? 'How much' : amountWords(collection, t, ans));
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
    // Maybe money (the Calendar's tray): in or out, how likely, and the day if known.
    if (maybe) {
      const seg = (opts, key, label) => { const btns = opts.map(([k, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(ans[key] === k), onclick: () => { ans[key] = k; for (const [i, b] of btns.entries()) b.setAttribute('aria-pressed', String(opts[i][0] === k)); } }, h('span', { class: 'seg-label' }, w))); return h('div', { class: 'add-field' }, h('p', { class: 'edit-label' }, label), h('div', { class: 'segmented', role: 'group', 'aria-label': label }, btns)); };
      out.push(seg([['in', 'Money in'], ['out', 'Money out']], 'dir', 'In or out'), seg([[0.75, 'Likely'], [0.5, 'Maybe'], [0.25, 'Unlikely']], 'likely', 'How likely?'));
      out.push(field('add-date', 'When, if you know', (() => { const d = h('input', { id: 'add-date', type: 'date' }); d.value = ans.date; d.addEventListener('input', () => { ans.date = d.value; }); return d; })(), null, null, true));
    }
    // A goal: by when, if there is a date.
    if (collection === 'goals') out.push(field('add-by', 'By when (optional)', (() => { const d = h('input', { id: 'add-by', type: 'date' }); d.value = ans.by; d.addEventListener('input', () => { ans.by = d.value; }); return d; })(), null, null, true));
    if (often) often.hidden = !showOften;
    if (ans.payBasis && income && !((t === 'w2' && W2_BASIS.some(([k]) => k === ans.payBasis)) || ((t === '1099' || t === 'side') && SELF_BASIS.some(([k]) => k === ans.payBasis)))) ans.payBasis = null;
    qs.replaceChildren(...out);
  }
  if (typeSel) typeSel.addEventListener('change', () => { ans.payBasis = null; draw(); });
  draw();

  // More options: built once; which boxes show follows the kind.
  const more = {
    institution: box('add-inst', { placeholder: 'e.g. Chase' }), last4: box('add-last4', { inputmode: 'numeric', maxlength: '4', placeholder: 'e.g. 4417' }), rate: box('add-rate', { inputmode: 'decimal', placeholder: 'e.g. 22.9' }),
    minimum: box('add-min', { inputmode: 'decimal', placeholder: 'e.g. 35' }), annualFee: box('add-fee', { inputmode: 'decimal', placeholder: 'e.g. 95' }), dueDay: box('add-due', { inputmode: 'numeric', placeholder: '1 to 31' }),
    asOf: h('input', { type: 'date', id: 'add-asof', value: today }), note: box('add-note', { maxlength: '200' })
  };
  const moreBox = {
    institution: field('add-inst', 'Bank or lender', more.institution, null, null, true),
    last4: field('add-last4', 'Last 4 digits (optional)', more.last4, 'Only the last four, never the whole number.', null, true),
    rate: field('add-rate', collection === 'debts' ? 'APR' : 'Rate', percent(more.rate), null, null, true),
    minimum: field('add-min', 'Minimum payment', dollars(more.minimum), null, null, true),
    dueDay: field('add-due', 'Due day of the month', more.dueDay, null, null, true),
    annualFee: field('add-fee', 'Annual fee', dollars(more.annualFee), null, null, true),
    asOf: field('add-asof', 'Amount as of', more.asOf, null, null, true),
    note: field('add-note', 'Note', more.note)
  };
  // What does it have? (S-270, replacing the fixed details of S-264): the type's questions from data/type-features.json,
  // folded to one line; a Yes opens its boxes in place. Answers and boxes are kept here until Add, then put on the new
  // item as a tick (Yes, No, Not sure) and a known number each. LIVE-FORM: only the ticks' own box is drawn again, on a
  // kind change or an answer; what was typed is kept in tickState first (each box saves on change).
  const tickState = { answers: {}, values: {}, open: false };
  const ticksBox = h('div', { class: 'add-ticks' });
  const tickColl = accounts ? 'accounts' : collection === 'debts' ? 'debts' : income ? 'income' : collection === 'policies' ? 'policies' : null;
  const drawTicks = () => {
    if (!tickColl) return;
    const t = kind(), features = featuresForType(t, tickColl);
    ticksBox.replaceChildren(features.length ? inlineTicks({ title: typeName(t, tickColl), features, ticks: tickState.answers, idBase: 'add-tk', open: tickState.open,
      ontoggle: (e) => { tickState.open = e.target.open; },
      onAnswer: (f, a) => { if (a === null) delete tickState.answers[f.id]; else tickState.answers[f.id] = a; tickState.open = true; drawTicks(); },
      get: (field) => (field in tickState.values ? tickState.values[field] : null),
      onSet: (field, x) => { tickState.values[field] = x; } }) : '');
  };
  const showDetails = drawTicks;
  const showMore = () => { const on = moreFields(collection, kind()); for (const [k, el] of Object.entries(moreBox)) el.hidden = !on.includes(k); showDetails(); };
  if (roth) roth.addEventListener('change', showDetails);
  if (typeSel) typeSel.addEventListener('change', showMore);
  if (typeSel && rothRow) { typeSel.addEventListener('change', syncRoth); syncRoth(); }
  showMore();

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
    if (maybe) {
      if (!name.value.trim()) { msg.textContent = 'What is it: a name, for example Tax refund'; name.focus(); return; }
      if (a.value === null) { msg.textContent = 'How much: type an amount'; amount.focus(); return; }
      const r = addMaybe(now(), { label: name.value, amount: a.value, likelihood: ans.likely, direction: ans.dir, date: ans.date || null });
      onDone({ spine: r.spine, id: r.id, collection: 'maybe', date: ans.date || null }, name.value.trim());
      return;
    }
    const cadence = t === 'w2' ? ans.schedule : often && !often.hidden ? often.value : 'monthly';
    let made;
    try { made = addWithAnswers(now(), { collection, type: t, label: name.value, amount: a.value, cadence, fat: fatSel ? fatSel.value || null : fat, answers }, today); } catch (err) { msg.textContent = err.message; return; }
    const extra = {}, on = moreFields(made.collection, t);
    const read = (k, type, words, ok = () => true) => {
      if (!on.includes(k) || !more[k].value.trim()) return true;
      const r = parseInput(type, more[k].value);
      if (!r.ok || !ok(r.value)) { msg.textContent = words + ': ' + (r.ok ? 'check the number' : r.message); more[k].focus(); return false; }
      extra[k] = r.value; return true;
    };
    if (!read('rate', 'rate', 'Rate', (x) => x >= 0 && x <= 1) || !read('minimum', 'money', 'Minimum', (x) => x >= 0) || !read('annualFee', 'money', 'Annual fee', (x) => x >= 0) || !read('dueDay', 'int', 'Due day', (x) => x >= 1 && x <= 31)) return;
    if (on.includes('institution') && more.institution.value.trim()) extra.institution = more.institution.value.trim();
    if (on.includes('last4') && more.last4.value.trim()) { const l4 = parseInput('last4', more.last4.value); if (!l4.ok) { msg.textContent = 'Last 4 digits: ' + l4.message; more.last4.focus(); return; } extra.last4 = l4.value; }
    if (more.asOf.value) extra.asOf = more.asOf.value;
    if (more.note.value.trim()) extra.note = more.note.value.trim();
    made = addMore(made, extra, today);
    // The ticks answered and the boxes typed (S-270): each answer as the item's tick, each number as known.
    if (tickColl && made.collection === tickColl) {
      const base = made.firstPath.split('.').slice(0, 2).join('.');
      let sp = made.spine;
      for (const f of featuresForType(t, tickColl)) if (tickState.answers[f.id]) sp = tickFeature(sp, base, f, tickState.answers[f.id], { rules: null, today });
      for (const [k, x] of Object.entries(tickState.values)) if (x !== null && x !== undefined) sp = putFact(sp, base + '.' + k, x, 'known', today);
      // A plan seen before at this employer (S-267) fills the rest of its details, as guesses.
      const tpl = tickState.values.employerName ? planFor(tickState.values.employerName) : null;
      if (tpl && tickColl === 'accounts') sp = applyTemplate(sp, base, tpl, today);
      made = { ...made, spine: sp };
    }
    if (made.collection === 'goals' && ans.by) made = { ...made, spine: setAt(made.spine, 'goals.' + made.id + '.by', ans.by) };
    const label = name.value.trim() || (typeList.find(([k]) => k === t) || [t, t])[1];
    onDone(made, label);
  };

  const amountHint = h('p', { class: 'edit-hint', hidden: maybe }, 'Blank is fine for now.');
  amount.addEventListener('input', () => { amountHint.hidden = amount.value.trim() !== ''; });
  return h('form', { class: 'editor add-form', onsubmit: submit, onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } } },
    // Small steps (S-282): what kind first, then how much; the name is optional (the kind's name until one is typed),
    // and everything else is guessed and shown on the item, ready for Looks right. A kind-less list (a bill, a goal)
    // starts with its name.
    typeSel ? field('add-type', income ? '1. What kind of income?' : '1. What kind?', typeSel) : null,
    rothRow,
    h('div', { class: 'add-grid' },
      typeSel ? null : field('add-name', 'Name', name, null, null, true),
      h('div', { class: 'add-field short' }, amountLabel, h('div', { class: 'amount-row' }, dollars(amount), often), amountHint),
      typeSel ? field('add-name', 'Name (optional)', name, null, null, true) : null),
    qs,
    fatSel ? field('add-fat', 'Type of spending', fatSel) : null,
    maybe ? null : h('details', { class: 'add-more' }, h('summary', {}, 'More options'), h('div', { class: 'add-grid' }, Object.values(moreBox))),
    msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add'), h('button', { type: 'button', class: 'btn', onclick: onCancel }, 'Cancel')));
}

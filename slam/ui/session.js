// Session (S-230, Batch 3): a first session in under an hour. Five steps in call order, each its own screen
// (session.html#/needs): Needs, Debt, Income (with the two tax questions), Assets, Goals (with the assumptions). Each
// step shows its DATING letter and its running total, Back and Next, and the shell's trail. Every step can be skipped.
// Type a number and it is saved (monthly unless changed); who pays, sharing, a cover and dates sit in a small closed
// "More" on the right. Needs starts from tick lists (Yes, No, Skip) and three presets whose amounts land as guesses.
// Every change goes through the shell's change() with words, so Undo takes it back. Formatting only: the totals come
// from the engines (summary.js sessionSteps, networth.js, fi.js, emergency.js).

import { foldRow } from './rows.js';
import { mathButton } from './math-panel.js';
import { startPage, change, said, say, refresh, go, current } from './shell.js';
import { summarize, sessionSteps } from '../engine/summary.js';
import { addItem, editExpense, editIncome, putFact, removeItem, parseInput, inputText, setPay } from '../engine/edits.js';
import { setAt, getAt, valueOf as v, addDays, whoSupplies } from '../engine/spine.js';
import { PRESETS, FILING_STATUSES, PERSON_PURPOSE_WORDS, isSelfEmployment } from '../engine/schema.js';
import { payersOf } from '../engine/sharing.js';
import { withScenario, scenarioAssumptions, SCENARIO_WORDS } from '../engine/scenarios.js';
import { pickedScenario, pick, scenarioBar } from './scenario.js';
import { answersOf, showsKey, waitsOn, syncProfile, questionById, level2, startsShared, hiddenLine } from '../engine/profile.js';
import { h, chip, money, pct, shortDate } from './view.js';
import { addNote, removeNote, setShared, sessionNotes } from '../engine/notes.js';
import { guessesFor, mapOf, worthNow } from './urgency.js';
import { addForm, focusAdd } from './add-form.js';
import { INCOME_FIRST } from '../engine/add.js';

// The tick lists, the presets and the withdrawal rates with their sources (data/session-presets.json).
let DATA = { needs: [], presets: [], withdrawal: [] };
try { const r = await fetch(new URL('../data/session-presets.json', import.meta.url), { cache: 'no-store' }); if (r.ok) DATA = await r.json(); } catch { /* the steps still list what is in your numbers */ }

const STEPS = [['needs', 'N', 'Needs'], ['debt', 'D', 'Debt'], ['income', 'I', 'Income'], ['assets', 'A', 'Assets'], ['goals', 'G', 'Goals']];
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const lower = (x) => String(x || '').trim().toLowerCase();
const drop = (obj, key) => { const n = { ...obj }; delete n[key]; return n; };

// ---------------------------------------------------------------- a row's pieces
// A box saves after the browser has moved the focus on (Tab), so the redraw keeps it on the next box.
const later = (fn) => setTimeout(fn, 0);
// A money box: blank is missing (never $0); a typed value is saved when the box is left.
function moneyBox(id, value, label, onSet, placeholder = 'Amount') {
  const box = h('input', { id, class: 'amt', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder, 'aria-label': label });
  box.value = inputText('money', value);
  box.addEventListener('change', () => {
    const t = box.value.trim();
    if (t === '') { later(() => onSet(null)); return; }
    const p = parseInput('money', t);
    if (!p.ok) { say(label + ': ' + p.message); box.focus(); return; }
    later(() => onSet(p.value));
  });
  return box;
}
// A small whole-number box (a day of the month, a year).
function intBox(id, value, label, onSet, { placeholder = 'Due day', min = 1, max = 31 } = {}) {
  const box = h('input', { id, class: 'day-box', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder, 'aria-label': label });
  box.value = value === null || value === undefined ? '' : String(value);
  box.addEventListener('change', () => {
    const t = box.value.trim();
    if (t === '') { later(() => onSet(null)); return; }
    const p = parseInput('int', t);
    if (!p.ok || p.value < min || p.value > max) { say(label + ': a whole number from ' + min + ' to ' + max); box.focus(); return; }
    later(() => onSet(p.value));
  });
  return box;
}
// A rate box: 25 means 25%.
function rateBox(id, value, label, onSet) {
  const box = h('input', { id, class: 'rate-box', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '%', 'aria-label': label });
  box.value = inputText('rate', value);
  box.addEventListener('change', () => {
    const t = box.value.trim();
    if (t === '') { later(() => onSet(null)); return; }
    const p = parseInput('rate', t);
    if (!p.ok) { say(label + ': ' + p.message); box.focus(); return; }
    later(() => onSet(p.value));
  });
  return box;
}
const pickBox = (id, label, options, value, onPick) => {
  const s = h('select', { id, class: 'pick-box', 'aria-label': label, onchange: () => onPick(s.value) }, options.map(([val, words]) => h('option', { value: val, selected: val === value }, words)));
  return s;
};
// A guess says so on its row.
// Only a guess worth checking now gets a chip (Rough now and later); one that is fine for now shows a small gray dot,
// so a first session ends with a short list, not dozens of chips.
let marks = null, marksFresh = false;
const guessChip = (f, path) => {
  if (f && (f.kind === 'rough' || f.kind === 'missing') && !worthNow(marks, path, f.kind, marksFresh)) return h('span', { class: 'dot-fine', role: 'img', 'aria-label': 'A guess, fine for now', title: 'Fine for now' });
  return f && f.kind === 'rough' ? h('span', { class: 'chip chip-rough' }, whoSupplies(f) === 'default' ? 'Eli\'s default' : 'guess') : f && f.kind === 'missing' ? chip('missing') : null;
};
// A small closed fold on the right of a row: who pays, sharing, a cover, dates.
// What is open stays open when a change redraws the screen.
const openMore = new Set();
function more(label, ...body) {
  const d = h('details', { class: 'row-more', open: openMore.has(label) || null }, h('summary', { id: 'more-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), 'aria-label': 'More about ' + label }, 'More'), h('div', { class: 'row-more-body' }, ...body));
  d.addEventListener('toggle', () => { if (!d.isConnected) return; if (d.open) openMore.add(label); else openMore.delete(label); });
  return d;
}
const lineRow = (cls, ...kids) => h('li', { class: 'srow ' + (cls || '') }, ...kids);

// ---------------------------------------------------------------- the step frame
// Each step's total, as its formula (Track L): the same registry ids My numbers' sections use.
const STEP_METRIC = { needs: 'expenses', debt: 'debts', income: 'gross', assets: 'assets' };
function frame(ctx, id, body) {
  const s = summarize(ctx.spine, ctx.rules, { flags: false });
  const steps = sessionSteps(ctx.spine, s);
  const i = STEPS.findIndex((x) => x[0] === id), step = steps.find((x) => x.id === id);
  const prev = STEPS[i - 1], next = STEPS[i + 1];
  return [
    h('section', { class: 'card step-head', 'aria-label': 'Step ' + (i + 1) + ' of ' + STEPS.length },
      h('span', { class: 'go-mark', 'aria-hidden': 'true' }, STEPS[i][1]),
      h('span', { class: 'step-name' }, 'Step ' + (i + 1) + ' of ' + STEPS.length + ': ' + STEPS[i][2]),
      h('span', { class: 'step-total' }, totalWords(step)),
      STEP_METRIC[id] ? mathButton([STEP_METRIC[id]], () => ({ spine: ctx.spine, rules: ctx.rules, s })) : null),
    ...[].concat(body(s)),
    h('div', { class: 'step-nav' },
      h('button', { type: 'button', class: 'btn', onclick: () => go(prev ? [prev[0]] : []) }, '‹ Back'),
      next ? h('button', { type: 'button', class: 'btn primary', onclick: () => go([next[0]]) }, 'Next: ' + next[2] + ' ›')
        : h('a', { class: 'btn primary', href: 'dashboard.html' }, 'Done: see Today ›')),
    h('p', { class: 'muted step-skip' }, 'Nothing here is required. Next skips ahead.')
  ];
}
const WORDS = { needs: ' a month', debt: ' owed', income: ' a month before tax', assets: ' owned', goals: ' in goals' };
function totalWords(step) {
  const r = step.result;
  if (r.value === null) return h('span', { class: 'empty' }, 'Nothing yet');
  return h('span', {}, h('strong', {}, money(r.value)), WORDS[step.id], r.kind === 'rough' || r.kind === 'incomplete' ? [' ', chip(r.kind)] : null);
}

// ---------------------------------------------------------------- Needs
const NO_KEY = 'slam-session-no:v1';
const noList = () => { try { return JSON.parse(localStorage.getItem(NO_KEY) || '[]'); } catch { return []; } };
function setNo(key, on) { try { const l = new Set(noList()); if (on) l.add(key); else l.delete(key); localStorage.setItem(NO_KEY, JSON.stringify([...l])); } catch { /* lasts until the page closes */ } refresh(); }
const findExpense = (spine, label) => (spine.expenses || []).find((e) => lower(e.label) === lower(label)) || null;

// A starter line added: its tag, need or want, and a subscription mark from the list.
function addLine(spine, item, fat, today) {
  const r = addItem(spine, { collection: 'expenses', label: item.label, fat }, today);
  // The starter line's key (rent, utilities) goes with it, so the Profile knows which line it is whatever its name.
  let s = putFact(setAt(r.spine, 'expenses.' + r.id + '.key', item.key), 'expenses.' + r.id + '.need', item.need !== false, 'known', today);
  if (item.subscription) s = editExpense(s, r.id, { amount: null, subscription: true }, today);
  // With a partner or other adults at home (Profile), a housing or food line starts shared, half each.
  if (startsShared(answersOf(s), fat)) s = editExpense(s, r.id, { amount: null, sharing: { shared: true, sharedWith: 2, whoPays: 'part' } }, today);
  return { spine: s, id: r.id };
}
function setLineAmount(item, fat, value, kind = 'known') {
  const today = todayIso();
  change((spine) => {
    let s = spine, e = findExpense(spine, item.label);
    if (!e) { if (value === null) return spine; const r = addLine(s, item, fat, today); s = r.spine; e = getAt(s, 'expenses.' + r.id); }
    return editExpense(s, e.id, { amount: value, kind }, today);
  }, value === null ? item.label + ' cleared' : said.changed(item.label, money(value) + ' a month'));
}
function setLineDay(e, day) {
  change((spine) => (day === null ? setAt(spine, 'expenses.' + e.id, drop(getAt(spine, 'expenses.' + e.id), 'payDay')) : putFact(spine, 'expenses.' + e.id + '.payDay', day, 'known', todayIso())), day === null ? e.label + ': day cleared' : said.changed(e.label + ' day', 'the ' + day + suffix(day)));
}
const suffix = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
function whoPays(spine, e) {
  const amount = v(e.amount), kind = e.amount ? e.amount.kind : 'missing', today = todayIso();
  const now = e.covered && v(e.covered) ? 'covered' : e.shared && v(e.shared) ? 'shared' : 'me';
  const names = payersOf(spine);
  const cover = (e.coveredBy && v(e.coveredBy)) || names[0];
  const set = (how, name = cover) => change((s) => editExpense(s, e.id, how === 'covered' ? { amount, kind: kind === 'missing' ? 'known' : kind, coveredBy: name } : { amount, kind: kind === 'missing' ? 'known' : kind, coveredBy: null, sharing: { shared: how === 'shared', sharedWith: 2, whoPays: 'part' } }, today),
    said.changed(e.label + ': who pays', how === 'covered' ? name : how === 'shared' ? 'shared, half each' : 'me'));
  return [
    h('label', { class: 'mini-label', for: 'who-' + e.id }, 'Who pays'),
    pickBox('who-' + e.id, 'Who pays ' + e.label, [['me', 'Me'], ['shared', 'Shared, half each'], ['covered', 'Someone covers it']], now, (x) => set(x)),
    now === 'covered' ? [h('label', { class: 'mini-label', for: 'by-' + e.id }, 'Covered by'), pickBox('by-' + e.id, e.label + ' covered by', names.map((n) => [n, n]), cover, (x) => set('covered', x))] : null,
    h('p', { class: 'edit-hint' }, h('a', { href: 'ledger.html#' + encodeURIComponent('expenses.' + e.id + '.amount') }, 'Dates and the rest in My numbers'))
  ];
}
// One line: its name, the amount, a day, More; a line not in your numbers yet also offers Yes, No and Skip.
function needRow(spine, item, fat, key, sub = false) {
  const e = findExpense(spine, item.label);
  const no = !e && noList().includes(key);
  if (no) return null;
  const by = e && e.covered && v(e.covered) ? v(e.coveredBy) : null;
  const name = h('span', { class: 'srow-name' }, item.label, e ? guessChip(e.amount, 'expenses.' + e.id + '.amount') : null, by ? h('span', { class: 'chip chip-notForMe' }, 'covered by ' + by) : null);
  const amt = moneyBox('n-' + key, e ? v(e.amount) : null, item.label + ', a month', (x) => setLineAmount(item, fat, x));
  // Not in your numbers yet: Need or Want adds it as that, No hides it.
  if (!e) return lineRow(sub ? 'sub' : '', name, amt,
    h('span', { class: 'tick', role: 'group', 'aria-label': item.label + ': do you have it?' },
      h('button', { type: 'button', class: 'btn small', onclick: () => change((s) => addLine(s, { ...item, need: true }, fat, todayIso()).spine, said.added(item.label + ', a need')) }, 'Need'),
      h('button', { type: 'button', class: 'btn small', onclick: () => change((s) => addLine(s, { ...item, need: false }, fat, todayIso()).spine, said.added(item.label + ', a want')) }, 'Want'),
      h('button', { type: 'button', class: 'btn small', onclick: () => setNo(key, true) }, 'No')));
  return lineRow(sub ? 'sub' : '', name, amt, intBox('nd-' + key, v(e.payDay), item.label + ': day of the month', (d) => setLineDay(e, d)), needWant(e), more(item.label, ...whoPays(spine, e)));
}
// Need or want, on every line in plain sight (S-231): two pressed-or-not buttons.
function needWant(e) {
  const need = v(e.need) !== false;
  const set = (x) => { if (x !== need) change((s) => putFact(s, 'expenses.' + e.id + '.need', x, 'known', todayIso()), said.changed(e.label, x ? 'a need' : 'a want')); };
  return h('span', { class: 'segmented nw-seg', role: 'group', 'aria-label': e.label + ': need or want' },
    h('button', { type: 'button', id: 'nw-' + e.id, class: 'seg-btn', 'aria-pressed': String(need), onclick: () => set(true) }, h('span', { class: 'seg-label' }, 'Need')),
    h('button', { type: 'button', id: 'nw-' + e.id + '-want', class: 'seg-btn', 'aria-pressed': String(!need), onclick: () => set(false) }, h('span', { class: 'seg-label' }, 'Want')));
}
// A question as a row of buttons; the answer is pressed. Answering changes which lines show and what they mean.
function question(id, label, options, value, onPick) {
  return h('div', { class: 'q', role: 'group', 'aria-labelledby': 'q-' + id },
    h('p', { class: 'q-label', id: 'q-' + id }, label),
    h('div', { class: 'segmented q-seg' }, options.map(([k, w]) => h('button', { type: 'button', id: 'q-' + id + '-' + k, class: 'seg-btn', 'aria-pressed': String(value === k), onclick: () => { if (value !== k) onPick(k); } }, h('span', { class: 'seg-label' }, w)))));
}
// A line shows unless the Profile hides it (engine/profile.js): with no answer yet, every line shows.
// Before the Profile says where they live, a filled rent or mortgage line answers it for this list: renters do not
// see the mortgage lines, owners do not see rent. Nothing is stored; a line already in their numbers still shows.
const RENT_KEYS = ['rent', 'renters-insurance'], OWN_KEYS = ['mortgage', 'property-tax', 'home-insurance'];
function seenAnswers(spine) {
  const a = answersOf(spine);
  if (a.home) return a;
  const filled = (keys) => allItems().some((x) => keys.includes(x.key) && ((e) => e && v(e.amount) !== null)(findExpense(spine, x.label)));
  const rent = filled(RENT_KEYS), own = filled(OWN_KEYS);
  return rent && !own ? { ...a, home: 'rent' } : own && !rent ? { ...a, home: 'own' } : a;
}
const applies = (spine, item) => showsKey(seenAnswers(spine), item.key);
const allItems = () => DATA.needs.flatMap((c) => c.items.flatMap((x) => [x, ...(x.subs || [])]));
// Typical amounts for the lines that fit the answers, on empty lines only, marked guess.
function fillTypical(t) {
  const today = todayIso();
  change((spine) => {
    let s = spine;
    for (const cat of DATA.needs) {
      if (findExpense(s, cat.label)) continue;
      for (const item of cat.items) {
        // Housing and getting-around lines wait for their Profile answer, so a guess never lands on the wrong home.
        if (!applies(s, item) || (waitsOn(item.key) && !answersOf(s)[waitsOn(item.key)])) continue;
        const amt = t.amounts[item.key];
        if (amt === undefined) continue;
        let e = findExpense(s, item.label);
        if (e && v(e.amount) !== null) continue;
        if (!e && noList().includes(item.key)) continue;
        if (!e) { const r = addLine(s, item, cat.fat, today); s = r.spine; e = getAt(s, 'expenses.' + r.id); }
        s = editExpense(s, e.id, { amount: amt, kind: 'rough' }, today);
      }
    }
    // The Profile's covers (living with family) land on the new lines too.
    return syncProfile(s, { today });
  }, 'Typical amounts for ' + t.label.toLowerCase() + ' added as guesses');
}
function needs(ctx) {
  const spine = ctx.spine, hh = spine.household;
  const known = new Set(allItems().map((x) => lower(x.label)));
  const extra = (fat) => (spine.expenses || []).filter((e) => !known.has(lower(e.label)) && !DATA.needs.some((c) => lower(c.label) === lower(e.label)) && (fat === 'other' ? !['food', 'accommodation', 'transportation'].includes(e.fat) : e.fat === fat));
  const hidden = noList().filter((k) => allItems().some((x) => x.key === k));
  const a = answersOf(spine);
  const said1 = (id) => { const q = questionById(id), x = a[id]; return x === undefined ? 'not answered yet' : x === 'notSure' ? 'not sure' : (q.options.find(([k]) => k === x) || [x, x])[1]; };
  return frame(ctx, 'needs', () => [
    h('section', { class: 'card qs' },
      // Where you live and how you get around are Profile answers (Phase 2.5 B3): shown here, changed there.
      h('p', { class: 'q-said' }, 'Where you live: ', h('strong', {}, said1('home')), '. Getting around: ', h('strong', {}, said1('getAround')), '. ', h('a', { href: 'profile.html#/home' }, 'Change in Profile')),
      // Fill typical amounts (High-cost city, Elsewhere) is off for now (owner's ask, 2026-10-27); fillTypical stays.
      null),
    ...DATA.needs.map((cat) => {
      const catLine = findExpense(spine, cat.label);
      // One number for the whole category, or its lines: never both, so nothing counts twice.
      const catOn = !!catLine && v(catLine.amount) !== null;
      const anyLine = cat.items.some((item) => [item, ...(item.subs || [])].some((x) => { const e = findExpense(spine, x.label); return e && v(e.amount) !== null; }));
      const lines = catOn ? [] : cat.items.filter((item) => applies(spine, item) || ((e) => e && !hiddenLine(spine, e))(findExpense(spine, item.label))).flatMap((item) => [needRow(spine, item, cat.fat, item.key), ...(item.subs || []).map((x) => (findExpense(spine, item.label) && !findExpense(spine, x.label) ? null : needRow(spine, x, cat.fat, x.key, true)))]);
      const others = extra(cat.fat || 'other').filter(() => cat.id === (cat.fat ? cat.id : 'misc'));
      const oneNumber = cat.items.length > 1 && !anyLine ? lineRow('cat-one', h('span', { class: 'srow-name muted' }, catOn ? 'All of it, one number (split it later in My numbers)' : 'Or one number for all of it'), moneyBox('c-' + cat.id, catLine ? v(catLine.amount) : null, cat.label + ', one number a month', (x) => setLineAmount({ key: cat.id, label: cat.label }, cat.fat, x))) : null;
      return h('section', { class: 'card', 'aria-labelledby': 'cat-' + cat.id },
        h('h2', { id: 'cat-' + cat.id }, cat.label),
        h('ul', { class: 'srows' }, ...lines, ...others.map((e) => needRow(spine, { label: e.label }, e.fat, 'x-' + e.id)), oneNumber));
    }),
    hidden.length ? h('p', { class: 'muted' }, hidden.length + ' marked No. ', h('button', { type: 'button', class: 'btn small', onclick: () => { for (const k of hidden) setNo(k, false); } }, 'Show them again')) : null
  ]);
}

// ---------------------------------------------------------------- Debt
const DEBT_ADD = [['credit_card', 'Credit card'], ['student_loan', 'Student loan'], ['auto_loan', 'Car loan'], ['personal_loan', 'Personal loan'], ['medical', 'Medical bill'], ['family_iou', 'Money owed to a person']];
const DEBT_QS = [['credit_card', 'Any credit cards?', 'Credit card'], ['student_loan', 'Student loans?', 'Student loan'], ['auto_loan', 'A car loan?', 'Car loan'], ['family_iou', 'Owe money to a person?', 'Money owed to a person']];
const putF = (path, value, words, kind = 'known') => change((s) => (value === null ? putFact(s, path, null, 'missing', todayIso()) : putFact(s, path, value, kind, todayIso())), words);
function addDebt(type, label) {
  change((spine) => {
    const r = addItem(spine, { collection: 'debts', type, label }, todayIso());
    later(() => document.getElementById('d-bal-' + r.id)?.focus());
    let s = r.spine;
    // A car loan takes over a "Car payment" line in Needs, so the payment counts once.
    const pay = type === 'auto_loan' ? findExpense(s, 'Car payment') : null;
    if (pay && !pay.paysDebt) s = putFact(s, 'expenses.' + pay.id + '.paysDebt', r.id, 'known', todayIso());
    return s;
  }, said.added(label));
}
function debt(ctx) {
  const spine = ctx.spine;
  const list = spine.debts || [];
  // One question per kind of debt: Yes adds one (and then offers another); a kind you have reads Yes.
  const asks = DEBT_QS.map(([type, q, label]) => {
    const have = list.filter((d) => d.type === type).length;
    return h('div', { class: 'q q-inline' }, h('p', { class: 'q-label' }, q),
      have ? h('span', { class: 'q-have' }, 'Yes, ' + have, ' ', h('button', { type: 'button', class: 'btn small', onclick: () => addDebt(type, label) }, 'Add another'))
        : noList().includes('debt-' + type) ? h('span', { class: 'q-have' }, 'No', ' ', h('button', { type: 'button', class: 'btn small', onclick: () => setNo('debt-' + type, false) }, 'Change'))
        : h('span', { class: 'tick' }, h('button', { type: 'button', class: 'btn small', id: 'dq-' + type, onclick: () => addDebt(type, label) }, 'Yes'), h('button', { type: 'button', class: 'btn small', id: 'dqn-' + type, onclick: () => setNo('debt-' + type, true) }, 'No')));
  });
  return frame(ctx, 'debt', () => [
    h('section', { class: 'card qs' }, ...asks),
    h('section', { class: 'card' },
      list.length ? h('ul', { class: 'srows' }, list.map((d) => {
        const name = v(d.name) || d.id, p = 'debts.' + d.id;
        return lineRow('debt', h('span', { class: 'srow-name' }, name, guessChip(d.balance, 'debts.' + d.id + '.balance')),
          moneyBox('d-bal-' + d.id, v(d.balance), name + ': balance', (x) => putF(p + '.balance', x, said.changed(name + ' balance', x === null ? 'blank' : money(x))), 'owed'),
          rateBox('d-apr-' + d.id, v(d.apr), name + ': interest rate', (x) => putF(p + '.apr', x, said.changed(name + ' rate', x === null ? 'blank' : pct(x, 2)))),
          moneyBox('d-min-' + d.id, v(d.minimum), name + ': monthly payment', (x) => putF(p + '.minimum', x, said.changed(name + ' payment', x === null ? 'blank' : money(x))), 'a month'),
          intBox('d-day-' + d.id, v(d.dueDay), name + ': due day', (x) => putF(p + '.dueDay', x, said.changed(name + ' due day', x === null ? 'blank' : 'the ' + x + suffix(x)))),
          // A card: paid in full every month, or carried? It decides whether the balance costs interest.
          d.type === 'credit_card' ? pickBox('d-pay-' + d.id, name + ': paid in full each month?', [['', 'Paid in full? Not set (counted as carried)'], ['statement', 'Paid in full each month'], ['minimum', 'I carry a balance']], v(d.payPolicy) || '', (k) => putF(p + '.payPolicy', k || null, said.changed(name, k === 'statement' ? 'paid in full each month' : k === 'minimum' ? 'carries a balance' : 'blank'))) : null);
      })) : h('p', { class: 'muted' }, 'No debts yet.'),
      list.length ? h('p', { class: 'edit-hint' }, 'Owed, the rate, the monthly payment and the due day. Blank is fine for now.') : null),
    h('section', { class: 'card' }, h('p', { class: 'edit-label' }, 'Something else'), h('div', { class: 'edit-actions' }, DEBT_ADD.filter(([t]) => !DEBT_QS.some(([q]) => q === t)).map(([type, label]) => h('button', { type: 'button', class: 'btn small', onclick: () => addDebt(type, label) }, label))))
  ]);
}

// ---------------------------------------------------------------- Income (and the two tax questions)
// Adding income (S-237): the same form My numbers uses (ui/add-form.js), questions first, built once while open.
let addingIncome = false, incomeFormEl = null;
function incomeAdd(spine, today) {
  if (!addingIncome) { incomeFormEl = null; return h('button', { type: 'button', id: 'i-add', class: 'btn add', onclick: () => { addingIncome = true; refresh(); focusAdd(); } }, '+ Add income'); }
  if (!incomeFormEl) incomeFormEl = addForm({ spine: () => current().spine, collection: 'income', types: INCOME_FIRST.map(([k]) => k), today,
    onDone: (made, label) => { addingIncome = false; incomeFormEl = null; change(made.spine, said.added(label)); },
    onCancel: () => { addingIncome = false; incomeFormEl = null; refresh(); } });
  return incomeFormEl;
}
const OFTEN = [['monthly', 'a month'], ['weekly', 'a week'], ['biweekly', 'every 2 weeks'], ['semimonthly', 'twice a month'], ['yearly', 'a year']];
function setIncome(x, patch, words) {
  change((s) => editIncome(s, x.id, { amount: v(x.amount), cadence: x.cadence, kind: x.amount && x.amount.kind !== 'missing' ? x.amount.kind : 'known', ...patch }, todayIso()), words);
}
// Money from a person: who and what for. A loan becomes a debt; money paid straight to a bill covers that bill.
function personBits(spine, x) {
  const p = 'income.' + x.id, today = todayIso();
  const who = v(x.from), purpose = v(x.purpose);
  const names = payersOf(spine);
  const name = x.label;
  const toLoan = () => change((s) => {
    const amt = v(x.amount);
    const r = addItem(removeItem(s, 'income', x.id), { collection: 'debts', type: 'family_iou', label: 'Owed to ' + (who || 'a person') }, today);
    return amt === null ? r.spine : putFact(r.spine, 'debts.' + r.id + '.balance', amt, 'known', today);
  }, name + ' is a loan now, under Debt');
  const toBill = (id) => {
    const e = (spine.expenses || []).find((y) => y.id === id);
    if (!e) return;
    change((s) => removeItem(editExpense(s, e.id, { amount: v(e.amount), kind: e.amount.kind === 'missing' ? 'known' : e.amount.kind, coveredBy: who || names[0] }, today), 'income', x.id), e.label + ' is covered by ' + (who || names[0]) + ' now');
  };
  return [
    h('label', { class: 'mini-label', for: 'pf-' + x.id }, 'Who'),
    pickBox('pf-' + x.id, name + ': who it is from', [['', 'Pick a name'], ...names.map((n) => [n, n])], who || '', (n) => putF(p + '.from', n || null, said.changed(name + ' from', n || 'blank'))),
    h('label', { class: 'mini-label', for: 'pp-' + x.id }, 'What it is for'),
    pickBox('pp-' + x.id, name + ': what it is for', [['', 'Pick one'], ...Object.entries(PERSON_PURPOSE_WORDS)], purpose || '', (k) => (k === 'loan' ? toLoan() : change((sp) => { let n = putFact(sp, p + '.purpose', k || null, k ? 'known' : 'missing', today); if (k === 'allowance' && !v(x.allowanceMode)) n = putFact(n, p + '.allowanceMode', 'gift', 'known', today); return n; }, said.changed(name, k ? PERSON_PURPOSE_WORDS[k].toLowerCase() : 'blank')))),
    purpose === 'alimony' ? [h('label', { class: 'mini-label', for: 'py-' + x.id }, 'Year of the divorce decree'), intBox('py-' + x.id, v(x.decreeYear), name + ': year of the decree', (y) => putF(p + '.decreeYear', y, said.changed(name + ' decree year', y === null ? 'blank' : String(y))), { placeholder: 'year', min: 1950, max: 2100 })] : null,
    purpose === 'allowance' ? [h('label', { class: 'mini-label', for: 'pa-' + x.id }, 'It is'), pickBox('pa-' + x.id, name + ': gift or pay', [['gift', 'A gift (not taxed)'], ['time', 'Pay for my time (taxed)']], v(x.allowanceMode) || 'gift', (m) => putF(p + '.allowanceMode', m, said.changed(name, m === 'time' ? 'pay for your time' : 'a gift')))] : null,
    h('p', { class: 'edit-hint' }, taxWords(x)),
    (spine.expenses || []).length ? [h('label', { class: 'mini-label', for: 'pb-' + x.id }, 'Paid straight to a bill (optional)'), pickBox('pb-' + x.id, name + ': paid straight to a bill', [['', 'No, it comes to me'], ...spine.expenses.map((e) => [e.id, e.label])], '', toBill)] : null
  ];
}
function taxWords(x) {
  const purpose = v(x.purpose);
  if (purpose === null) return 'Pick what it is for to see if it is taxed.';
  if (purpose === 'alimony') { const y = v(x.decreeYear); return y === null ? 'Alimony is taxed only under a decree from before 2019. Add the year.' : y >= 2019 ? 'Not taxed: the decree is from 2019 or later.' : 'Taxed: the decree is from before 2019.'; }
  if (purpose === 'allowance') return v(x.allowanceMode) === 'time' ? 'Taxed as self-employment, with tax set aside from each payment.' : 'Not taxed.';
  return 'Not taxed.';
}
// How a line is paid, asked first, so the right boxes show and the number means the right thing.
const PAY_OFTEN = [['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['semimonthly', 'Twice a month'], ['monthly', 'Monthly']];
const extraLabel = (x) => x.label + ': tips, overtime, commission';
function payWith(x, patch, words) {
  const now = { basis: v(x.payBasis), cadence: x.cadence };
  change((s) => setPay(s, x.id, { ...now, ...patch }, todayIso()), words);
}
function w2Bits(spine, x) {
  const basis = v(x.payBasis), name = x.label;
  const extra = (spine.income || []).find((y) => y.label === extraLabel(x));
  const pick = basis === 'hourly' || basis === 'salary' ? basis : null;
  const choose = (k) => change((s) => setPay(s, x.id, { basis: k, cadence: PER_YEAR_OK(x.cadence) ? x.cadence : 'biweekly' }, todayIso()), said.changed(name, k === 'hourly' ? 'paid by the hour' : 'a salary'));
  // Tips, overtime or commission on top: a line of its own, so the steady part stays steady.
  const toggleExtra = () => change((s) => (extra ? removeItem(s, 'income', extra.id) : addItem(s, { collection: 'income', type: 'tips', label: extraLabel(x) }, todayIso()).spine), extra ? extraLabel(x) + ' removed' : said.added(extraLabel(x)));
  const often = pickBox('i-often-' + x.id, name + ': paid how often', PAY_OFTEN, x.cadence, (c) => payWith(x, { cadence: c }, said.changed(name + ' paid', PAY_OFTEN.find(([k]) => k === c)[1].toLowerCase())));
  return [
    question('pay-' + x.id, 'How is ' + name + ' paid?', [['salary', 'Salary'], ['hourly', 'By the hour']], pick, choose),
    h('button', { type: 'button', id: 'i-extra-' + x.id, class: 'btn small toggle', 'aria-pressed': String(!!extra), onclick: toggleExtra }, extra ? 'Plus tips or overtime: on' : 'Plus tips or overtime'),
    basis === 'salary' ? h('div', { class: 'srow-fields' }, h('label', { class: 'mini-label', for: 'i-sal-' + x.id }, 'Yearly salary, before tax'), moneyBox('i-sal-' + x.id, v(x.salary), name + ': yearly salary', (a) => payWith(x, { salary: a }, said.changed(name + ' salary', a === null ? 'blank' : money(a) + ' a year'))), often) : null,
    basis === 'hourly' ? h('div', { class: 'srow-fields' }, h('label', { class: 'mini-label', for: 'i-rate-' + x.id }, 'Per hour, and hours a week'), moneyBox('i-rate-' + x.id, v(x.hourlyRate), name + ': per hour', (a) => payWith(x, { hourlyRate: a }, said.changed(name + ' hourly rate', a === null ? 'blank' : money(a, true) + ' an hour')), '$ an hour'), intBox('i-hrs-' + x.id, v(x.hoursPerWeek), name + ': hours a week', (n) => payWith(x, { hoursPerWeek: n }, said.changed(name + ' hours', n === null ? 'blank' : n + ' a week')), { placeholder: 'hours', min: 1, max: 100 }), often) : null,
    basis ? h('p', { class: 'edit-hint' }, v(x.amount) === null ? 'Each paycheck: fill in the boxes above.' : 'Each paycheck before tax: ' + money(v(x.amount)) + '.') : null
  ];
}
function selfBits(x) {
  const lumpy = v(x.payBasis) === 'lumpy', name = x.label;
  return [
    question('sp-' + x.id, 'Does ' + name + ' come in steady or in lumps?', [['steady', 'About the same each month'], ['lumpy', 'In lumps']], !x.payBasis && v(x.amount) === null ? null : lumpy ? 'lumpy' : 'steady',
      (k) => change((s) => (k === 'lumpy' ? setPay(s, x.id, { basis: 'lumpy' }, todayIso()) : setPay(s, x.id, { basis: 'steady' }, todayIso())), (k === 'lumpy' ? name + ' comes in lumps now' : name + ' is about the same each month now'))),
    lumpy ? h('div', { class: 'srow-fields' }, h('label', { class: 'mini-label', for: 'i-yr-' + x.id }, 'All of it over the last 12 months'), moneyBox('i-yr-' + x.id, v(x.yearTotal), name + ': last 12 months', (a) => payWith(x, { yearTotal: a }, said.changed(name + ' last 12 months', a === null ? 'blank' : money(a)))), h('p', { class: 'edit-hint' }, v(x.amount) === null ? 'Counted as a monthly average, a guess.' : 'Counted as ' + money(v(x.amount)) + ' a month on average, a guess.')) : null,
    h('div', { class: 'srow-fields' }, h('label', { class: 'mini-label', for: 'i-be-' + x.id }, 'Business costs a month (optional)'), moneyBox('i-be-' + x.id, v(x.businessExpenses), name + ': business costs a month', (a) => putF('income.' + x.id + '.businessExpenses', a, said.changed(name + ' business costs', a === null ? 'blank' : money(a))))),
    h('p', { class: 'muted mini-note' }, 'Nothing is withheld, so tax is set aside from each payment.')
  ];
}
function unemploymentBits(x) {
  const name = x.label, asOf = todayIso();
  const weeksLeft = x.end ? Math.max(0, Math.round((Date.parse(x.end) - Date.parse(asOf)) / 6048e5)) : null;
  return [h('div', { class: 'srow-fields' }, h('label', { class: 'mini-label', for: 'i-wk-' + x.id }, 'Weeks of benefits left'),
    intBox('i-wk-' + x.id, weeksLeft, name + ': weeks left', (n) => setIncome(x, { end: n === null ? null : addDays(asOf, n * 7) }, said.changed(name + ' weeks left', n === null ? 'blank' : String(n))), { placeholder: 'weeks', min: 0, max: 99 }))];
}
const PER_YEAR_OK = (c) => ['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(c);
function incomeRows(spine) {
  return (spine.income || []).filter((x) => x.type !== 'maybeMoney').map((x) => {
    const asked = (x.type === 'w2' && v(x.payBasis)) || (isSelfEmployment(x) && v(x.payBasis) === 'lumpy');
    const amountBox = asked ? null : [
      moneyBox('i-amt-' + x.id, v(x.amount), x.label + ': how much, before tax', (a) => setIncome(x, { amount: a }, said.changed(x.label, a === null ? 'blank' : money(a)))),
      pickBox('i-often-' + x.id, x.label + ': how often', OFTEN.some(([k]) => k === x.cadence) ? OFTEN : [[x.cadence, x.cadence], ...OFTEN], x.cadence, (c) => setIncome(x, { cadence: c }, said.changed(x.label + ' how often', OFTEN.find(([k]) => k === c)[1])))];
    return lineRow('income' + (x.type === 'w2' || isSelfEmployment(x) || x.type === 'unemployment' ? ' asks' : ''), h('span', { class: 'srow-name' }, x.label, guessChip(x.amount, 'income.' + x.id + '.amount')),
      amountBox,
      x.cadence === 'monthly' || x.cadence === 'semimonthly' ? intBox('i-day-' + x.id, v(x.payDay), x.label + ': day paid', (d) => setIncome(x, { payDay: d }, said.changed(x.label + ' day paid', d === null ? 'blank' : 'the ' + d + suffix(d)))) : null,
      x.type === 'w2' ? h('div', { class: 'srow-q' }, ...w2Bits(spine, x)) : null,
      isSelfEmployment(x) && x.type !== 'person' ? h('div', { class: 'srow-q' }, ...selfBits(x)) : null,
      x.type === 'unemployment' ? h('div', { class: 'srow-q' }, ...unemploymentBits(x)) : null,
      x.type === 'person' && v(x.purpose) === null ? (openMore.add(x.label), more(x.label, ...personBits(spine, x))) : x.type === 'person' ? more(x.label, ...personBits(spine, x)) : null);
  });
}
function income(ctx) {
  const spine = ctx.spine, hh = spine.household, today = todayIso();
  const last = v(hh.lastRefund) ?? null;
  // A refund or an amount owed with no amount yet stays missing (never $0); the choice waits here for the amount.
  const lastHow = last === null ? (hh.lastRefund && hh.lastRefund.kind === 'notForMe' ? 'none' : lastPending) : last >= 0 ? 'refund' : 'owed';
  const setLast = (how, amt) => {
    lastPending = how === 'refund' || how === 'owed' ? how : '';
    if ((how === 'refund' || how === 'owed') && amt === null) { if (last === null) { refresh(); return; } }
    change((s) => (how === 'none' ? putFact(s, 'household.lastRefund', null, 'notForMe', today) : how === '' || amt === null ? putFact(s, 'household.lastRefund', null, 'missing', today) : putFact(s, 'household.lastRefund', how === 'owed' ? -Math.abs(amt) : Math.abs(amt), 'known', today)),
      said.changed('Last year\'s tax', how === 'refund' ? 'a refund of ' + money(Math.abs(amt)) : how === 'owed' ? money(Math.abs(amt)) + ' owed' : how === 'none' ? 'did not file' : 'not sure'));
  };
  return frame(ctx, 'income', () => [
    h('section', { class: 'card' },
      (spine.income || []).length ? h('ul', { class: 'srows' }, incomeRows(spine)) : h('p', { class: 'muted' }, 'No income yet.'),
      incomeAdd(spine, today)),
    h('section', { class: 'card', 'aria-labelledby': 'tax-h' },
      h('h2', { id: 'tax-h' }, h('span', { class: 'go-mark', 'aria-hidden': 'true' }, 'T'), 'Taxes'),
      h('ul', { class: 'srows' },
        lineRow('', h('label', { class: 'srow-name', for: 't-filing' }, 'Filing status'),
          pickBox('t-filing', 'Filing status', [['', 'Pick one'], ...FILING_STATUSES.map((f) => [f, FILING_WORDS[f]])], v(hh.filingStatus) || '', (f) => putF('household.filingStatus', f || null, said.changed('Filing status', f ? FILING_WORDS[f] : 'blank')))),
        lineRow('', h('label', { class: 'srow-name', for: 't-last' }, 'Last year'),
          pickBox('t-last', 'Last year\'s tax', [['', 'Not sure'], ['refund', 'Got a refund'], ['owed', 'Owed'], ['none', 'Did not file']], lastHow, (how) => setLast(how, last === null ? null : Math.abs(last))),
          lastHow === 'refund' || lastHow === 'owed' ? moneyBox('t-last-amt', last === null ? null : Math.abs(last), 'How much', (a) => setLast(lastHow, a)) : null)),
      h('p', { class: 'edit-hint' }, 'The rest of taxes can wait for a later session.'))
  ]);
}
let lastPending = '';
const FILING_WORDS = { single: 'Single', mfj: 'Married, filing jointly', mfs: 'Married, filing separately', hoh: 'Head of household' };

// ---------------------------------------------------------------- Assets
const IRA_TYPES = [['roth_ira', 'Roth'], ['traditional_ira', 'Traditional'], ['sep_ira', 'SEP'], ['simple_ira', 'SIMPLE']];
const ASSET_ADD = [['checking', 'Checking'], ['savings', 'Savings'], ['hysa', 'High-yield savings'], ['k401', '401(k)'], ['hsa', 'HSA'], ['brokerage', 'Brokerage'], ['car', 'Car'], ['home', 'Home']];
// Liquid or not, as the balance sheet counts it (summary.js sheet.liquid).
const liquidPart = (s, a) => { const it = s.sheet.liquid.items.find((x) => x.id === a.id); return it ? it.part : null; };
const HOLD = [['ticker', 'Ticker', 'text'], ['share', 'Share of the account', 'rate'], ['expenseRatio', 'Expense ratio', 'rate'], ['managedBy', 'Managed by', 'text'], ['advisoryFee', 'Advisory fee', 'rate']];
function holdings(a) {
  const p = 'accounts.' + a.id + '.holdings', name = v(a.name) || a.id;
  const list = v(a.holdings) || [];
  const save = (next, words) => putF(p, next, words);
  return more(name + ' holdings',
    h('p', { class: 'mini-label' }, 'Holdings (optional)'),
    h('ul', { class: 'srows holds' }, list.map((row, i) => lineRow('hold', ...HOLD.map(([k, label, type]) => {
      const id = 'h-' + a.id + '-' + i + '-' + k;
      const box = h('input', { id, class: type === 'rate' ? 'rate-box' : 'text-box', type: 'text', autocomplete: 'off', placeholder: type === 'rate' ? label + ' %' : label, 'aria-label': name + ' holding ' + (i + 1) + ': ' + label });
      box.value = row[k] === null || row[k] === undefined ? '' : type === 'rate' ? inputText('rate', row[k]) : String(row[k]);
      box.addEventListener('change', () => {
        const t = box.value.trim();
        let val = t === '' ? null : t;
        if (val !== null && type === 'rate') { const q = parseInput('rate', t); if (!q.ok) { say(label + ': ' + q.message); return; } val = q.value; }
        later(() => save(list.map((r, j) => (j === i ? { ...r, [k]: k === 'ticker' && val ? val.toUpperCase() : val } : r)), said.changed(name + ' holding ' + (i + 1) + ' ' + label.toLowerCase(), val === null ? 'blank' : String(t))));
      });
      return box;
    }), h('button', { type: 'button', class: 'btn small', 'aria-label': 'Remove holding ' + (i + 1), onclick: () => save(list.filter((_, j) => j !== i), name + ': holding ' + (i + 1) + ' removed') }, 'Remove')))),
    h('button', { type: 'button', class: 'btn small', onclick: () => save([...list, { ticker: null, share: null, expenseRatio: null, managedBy: null, advisoryFee: null }], name + ': a holding added') }, 'Add a holding'));
}
const lastMatch = {};
function assets(ctx) {
  const spine = ctx.spine, today = todayIso();
  let iraPick = 'roth_ira';
  const addAcct = (type, label) => change((s) => addItem(s, { collection: 'accounts', type, label }, today).spine, said.added(label));
  const accts = spine.accounts || [];
  const work = accts.filter((a) => a.family === 'employerRetirement');
  const saved = accts.filter((a) => a.family === 'cash' && a.type !== 'checking');
  return frame(ctx, 'assets', (s) => [
    h('section', { class: 'card qs' },
      h('div', { class: 'q q-inline' }, h('p', { class: 'q-label' }, 'A retirement plan at work?'), work.length ? h('span', { class: 'q-have' }, 'Yes, ' + work.length) : h('button', { type: 'button', class: 'btn small', id: 'aq-work', onclick: () => addAcct('k401', '401(k)') }, 'Yes')),
      h('div', { class: 'q q-inline' }, h('p', { class: 'q-label' }, 'Savings outside checking?'), saved.length ? h('span', { class: 'q-have' }, 'Yes, ' + saved.length) : h('button', { type: 'button', class: 'btn small', id: 'aq-save', onclick: () => addAcct('savings', 'Savings') }, 'Yes'))),
    h('section', { class: 'card' },
      (spine.accounts || []).length ? h('ul', { class: 'srows' }, spine.accounts.map((a) => {
        const name = v(a.name) || a.id, p = 'accounts.' + a.id, part = liquidPart(s, a), on = part !== null;
        return lineRow('asset', h('span', { class: 'srow-name' }, name, guessChip(a.balance, 'accounts.' + a.id + '.balance')),
          moneyBox('a-bal-' + a.id, v(a.balance), name + ': balance', (x) => putF(p + '.balance', x, said.changed(name + ' balance', x === null ? 'blank' : money(x)))),
          h('button', { type: 'button', class: 'btn small toggle liquid-tag', 'aria-pressed': String(on), title: on ? 'Counted in liquid net worth' : 'Not counted in liquid net worth', onclick: () => change((sp) => (!on === (s.sheet.liquid.defaults[a.id] !== 'none') ? setAt(sp, p, drop(getAt(sp, p), 'liquid')) : putFact(sp, p + '.liquid', !on, 'known', today)), said.changed(name, on ? 'not liquid' : 'liquid')) }, on ? (part === 'contributions' ? 'Liquid: contributions' : 'Liquid') : 'Not liquid'),
          a.family === 'taxable' ? holdings(a) : null,
          // A plan at work: does the employer match, and up to what share of pay?
          a.family === 'employerRetirement' ? h('div', { class: 'srow-q' },
            question('m-' + a.id, 'Does your employer match?', [['yes', 'Yes'], ['no', 'No']], a.matchRate ? (v(a.matchRate) === 0 ? 'no' : 'yes') : null,
              (k) => { if (k === 'no' && v(a.matchRate)) lastMatch[a.id] = v(a.matchRate); const back = k === 'yes' ? lastMatch[a.id] ?? null : 0; putF(p + '.matchRate', back, said.changed(name + ' match', k === 'no' ? 'none' : back ? pct(back) : 'yes, the rate to come')); }),
            a.matchRate && v(a.matchRate) !== 0 ? h('div', { class: 'srow-fields' }, h('label', { class: 'mini-label', for: 'a-mr-' + a.id }, 'They match this share of what you put in, up to this share of pay'),
              rateBox('a-mr-' + a.id, v(a.matchRate), name + ': match rate', (x) => putF(p + '.matchRate', x, said.changed(name + ' match', x === null ? 'blank' : pct(x)))),
              rateBox('a-mc-' + a.id, v(a.matchCap), name + ': match up to', (x) => putF(p + '.matchCap', x, said.changed(name + ' match cap', x === null ? 'blank' : pct(x) + ' of pay')))) : null) : null);
      })) : h('p', { class: 'muted' }, 'Nothing yet.'),
      h('p', { class: 'edit-hint' }, 'Liquid: money you can reach without a penalty or selling something you live with. Tap to change it.')),
    h('section', { class: 'card' }, h('p', { class: 'edit-label' }, 'Add one'),
      h('div', { class: 'edit-actions' }, ASSET_ADD.map(([type, label]) => h('button', { type: 'button', class: 'btn small', onclick: () => addAcct(type, label) }, label))),
      h('div', { class: 'edit-actions' },
        pickBox('a-ira', 'IRA type', IRA_TYPES, iraPick, (x) => { iraPick = x; }),
        h('button', { type: 'button', class: 'btn small', onclick: () => addAcct(iraPick, PRESETS[iraPick].label) }, 'Add an IRA')))
  ]);
}

// ---------------------------------------------------------------- Goals (and the assumptions)
function goals(ctx) {
  const spine = ctx.spine, rules = ctx.rules, today = todayIso();
  return frame(ctx, 'goals', () => {
    const s = summarize(withScenario(spine, rules, pickedScenario()), rules, { flags: false });
    const fi = s.fi, em = s.emergency, cards = s.sheet.cards;
    const yearly = fi.yearlySpending;
    const list = (spine.goals || []).filter((g) => g.type !== 'fi');
    const order = v(spine.household.goalOrder) || 'oneAtATime';
    // + Add a goal opens the shared add form (slim by default); it never sits open.
    const goalForm = goalAdding ? addForm({ spine: () => current().spine, collection: 'goals', types: ['savings'], today, onCancel: () => { goalAdding = false; refresh(); },
      onDone: (made, label) => { goalAdding = false; change(made.spine, said.added('Goal ' + label)); } }) : null;
    const wr = v(spine.assumptions.withdrawalRate), own = pickedScenario() === 'best';
    return [
      h('section', { class: 'card fi-card', 'aria-label': 'Financial independence' },
        h('h2', {}, 'Financial independence'),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Yearly spending'), h('dd', {}, yearly.kind === 'notForMe' ? 'set by your FI number' : yearly.value === null ? 'missing' : [money(yearly.value) + (fi.goalSource === 'spending' ? ' (your goal)' : ''), yearly.kind === 'rough' || yearly.kind === 'incomplete' ? [' ', chip(yearly.kind)] : null]),
          h('dt', {}, 'FI number'), h('dd', {}, fi.fiNumber.value === null ? 'missing' : money(fi.fiNumber.value)),
          // FI % reads today's FI number (B2), so it says which number it is measured against.
          h('dt', {}, 'There so far'), h('dd', {}, fi.fiPercent.value === null ? 'missing' : pct(fi.fiPercent.value, 1) + ' of ' + money(fi.today.value) + ' at today\'s spending'))),
      h('section', { class: 'card', 'aria-labelledby': 'g-h' },
        h('h2', { id: 'g-h' }, 'Goals'),
        h('ul', { class: 'srows' },
          lineRow('', h('span', { class: 'srow-name' }, 'The cushion'), h('span', { class: 'srow-val' }, em.targetDollars.value === null ? 'missing a birth date' : money(s.sheet.cash.value) + ' of ' + money(em.targetDollars.value))),
          lineRow('', h('span', { class: 'srow-name' }, 'Cards paid off'), h('span', { class: 'srow-val' }, (cards.missing || []).length ? 'missing a balance' : cards.value ? money(cards.value) + ' to go' : 'Done')),
          ...list.map((g) => lineRow('', h('span', { class: 'srow-name' }, g.label, guessChip(g.target, 'goals.' + g.id + '.target')),
            moneyBox('g-t-' + g.id, v(g.target), g.label + ': amount', (x) => putF('goals.' + g.id + '.target', x, said.changed('Goal ' + g.label, x === null ? 'blank' : money(x)))),
            (() => { const d = h('input', { id: 'g-by-' + g.id, type: 'date', 'aria-label': g.label + ': by when' }); d.value = g.by || ''; d.addEventListener('change', () => change((sp) => setAt(sp, 'goals.' + g.id + '.by', d.value || null), said.changed('Goal ' + g.label + ' by', d.value || 'no date'))); return d; })()))),
        goalForm || h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn add', onclick: () => { goalAdding = true; refresh(); requestAnimationFrame(focusAdd); } }, '+ Add a goal')),
        h('p', { class: 'edit-label' }, 'Fund goals'),
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Fund goals' }, [['oneAtATime', 'One at a time'], ['byDeadline', 'By deadline']].map(([k, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(order === k), onclick: () => { if (order !== k) putF('household.goalOrder', k, said.changed('Goals', w.toLowerCase())); } }, h('span', { class: 'seg-label' }, w))))),
      scenarioBar(spine, rules, pickedScenario(), () => refresh()),
      h('section', { class: 'card', 'aria-labelledby': 'wr-h' },
        h('h2', { id: 'wr-h' }, 'Withdrawal rate'),
        // Only Your own takes a withdrawal rate of its own; the other sets each have theirs.
        own ? h('ul', { class: 'srows' }, DATA.withdrawal.map((w) => lineRow('', h('label', { class: 'check-row wr-pick' }, h('input', { type: 'radio', name: 'wr', checked: wr === w.rate, onchange: () => change((sp) => putFact(sp, 'assumptions.withdrawalRate', w.rate, 'known', today), said.changed('Withdrawal rate', w.label)) }), h('span', {}, h('strong', {}, w.label + (w.default ? ' (standard)' : '')), h('span', { class: 'choice-sub' }, w.source))))))
          : [h('p', {}, 'The ' + SCENARIO_WORDS[pickedScenario()].toLowerCase() + ' set uses ' + pct(scenarioAssumptions(spine, rules, pickedScenario()).withdrawalRate.value, 1) + '.'), h('button', { type: 'button', class: 'btn small', onclick: () => { pick('best'); refresh(); } }, 'Choose my own')])
    ];
  });
}

// ---------------------------------------------------------------- the top screen
// Krug pass: one list, the five steps, each with how many of the Profile's open questions belong to it; the questions
// themselves sit at the top of each step. "Start with Needs" leads.
const STEP_AREAS = { needs: ['health', 'statements'], debt: ['cards', 'student', 'car', 'mortgage', 'debtAll'], income: ['work'], assets: ['k401', 'ira', 'hsa', 'brokerage'], goals: ['goalsAll'] };
const openAreas = (spine, step) => { const a = answersOf(spine); return Object.keys(a).length ? level2(a).filter((x) => STEP_AREAS[step].includes(x.area)) : []; };
const qCount = (areas) => areas.reduce((n, x) => n + x.questions.length, 0);
function stepQuestions(spine, step) {
  const areas = openAreas(spine, step);
  if (!areas.length) return null;
  return h('ul', { class: 'go-list', 'aria-label': 'Questions for this step' }, areas.map((x) => h('li', {}, h('a', { class: 'go-row plain', href: 'profile.html#/ask/' + x.area }, h('span', { class: 'go-name' }, x.label), h('span', { class: 'go-sub' }, x.questions.length + (x.questions.length === 1 ? ' question' : ' questions'))))));
}

function overview(ctx) {
  const steps = sessionSteps(ctx.spine, summarize(ctx.spine, ctx.rules, { flags: false }));
  return [
    h('div', { class: 'step-nav' }, h('button', { type: 'button', class: 'btn primary', onclick: () => go(['needs']) }, 'Start with Needs ›')),
    h('ol', { class: 'go-list', 'aria-label': 'The steps, in order' }, steps.map((st) => { const n = qCount(openAreas(ctx.spine, st.id)); return h('li', {}, h('a', { class: 'go-row', href: '#/' + st.id },
      h('span', { class: 'go-mark', 'aria-hidden': 'true' }, st.letter),
      h('span', { class: 'go-name' }, st.label),
      h('span', { class: 'go-sub' }, totalWords(st), n ? ' · ' + n + (n === 1 ? ' question' : ' questions') : ''))); }))
  ];
}

// Session notes (Track I): what was said on the call, dated. "Share with the client" puts a note on the One-pager.
// LIVE-FORM: built once. The box and its tick live across redraws (the guesses land after the page draws), so what is
// typed is never lost; only the list under them redraws.
const noteBox = h('textarea', { id: 'session-note', rows: 3, placeholder: 'e.g. Next call: bring the pay stub', 'aria-describedby': 'session-note-hint' });
const noteShare = h('input', { type: 'checkbox', id: 'session-note-share' });
function sessionNotesRow(ctx) {
  const list = sessionNotes(ctx.spine), shared = list.filter((n) => n.shared).length;
  const add = (e) => { e.preventDefault(); const t = noteBox.value.trim(); if (!t) { say('Type the note first'); noteBox.focus(); return; } const sh = noteShare.checked; noteBox.value = ''; noteShare.checked = false; change((x) => addNote(x, { text: t, shared: sh }, todayIso()), said.added(sh ? 'A shared note' : 'A note')); };
  return foldRow('session-notes', 'Session notes', list.length ? list.length + (list.length === 1 ? ' note' : ' notes') + (shared ? ', ' + shared + ' on the One-pager' : '') : 'What was said, dated', () => [
    h('form', { class: 'note-form', novalidate: true, onsubmit: add },
      h('label', { for: 'session-note', class: 'edit-label' }, 'A note from this session'), noteBox,
      h('p', { class: 'edit-hint', id: 'session-note-hint' }, 'Dated today.'),
      h('label', { class: 'check-row' }, noteShare, ' Share with the client (prints on the One-pager)'),
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn small' }, 'Add the note'))),
    list.length ? h('ul', { class: 'note-list' }, list.map((n) => h('li', {}, h('span', { class: 'note-date' }, shortDate(n.date)), h('span', { class: 'note-text' }, n.text, n.shared ? [' ', h('span', { class: 'pill' }, 'on the One-pager')] : null),
      h('span', { class: 'note-acts' },
        h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(n.shared), onclick: () => change((x) => setShared(x, n.id, !n.shared), said.changed('The note', n.shared ? 'not shared' : 'shared on the One-pager')) }, n.shared ? 'Stop sharing' : 'Share'),
        h('button', { type: 'button', class: 'btn small danger', onclick: () => change((x) => removeNote(x, n.id), said.deleted('The note')) }, 'Delete'))))) : null,
    h('p', { class: 'muted' }, h('a', { href: 'onepager.html' }, 'See the One-pager'))]);
}

const SCREENS = { needs, debt, income, assets, goals };
let goalAdding = false;
function render(ctx) {
  // The shared ranking (ui/urgency.js): the last answer stands until the new one lands, then one redraw.
  const r = guessesFor(ctx.spine, ctx.rules, () => { if (current().spine === ctx.spine) refresh(); });
  if (r) { marks = mapOf(r, ctx.spine); marksFresh = true; } else marksFresh = false;
  const id = ctx.levels[0];
  return id ? [stepQuestions(ctx.spine, id), SCREENS[id](ctx), sessionNotesRow(ctx)] : [overview(ctx), sessionNotesRow(ctx)];
}
const name = (levels) => (levels.length === 1 ? (STEPS.find((x) => x[0] === levels[0]) || [])[2] || null : null);

startPage({ tab: 'session', title: 'Session', render, name });

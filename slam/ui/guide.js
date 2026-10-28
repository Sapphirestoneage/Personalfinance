// Guide me (S-280; was the Session page, S-230): a mode of Numbers, not a page. On, Numbers walks its six sections in
// order (Needs, Debt, Income with the two tax questions, Assets, Goals, Protection) with Back and Next, each step
// showing only its screen-one boxes, what it is for, and "You now have / Next this unlocks". Off, Numbers is free to
// roam. Same screens, same data: every change goes through the shell's change() with words, so Undo takes it back.
// Formatting only: the totals come from the engines (summary.js sessionSteps, networth.js, fi.js, emergency.js).

import { echo } from './understood.js';
import { attachPicker } from './picker.js';
import { placeLibEntries, nameEntries, LIB } from './libraries.js';
import { placeOf, cardFills, applyFills } from '../engine/library.js';
import { foldRow } from './rows.js';
import { mathButton } from './math-panel.js';
import { startPage, change, said, say, refresh, go, current } from './shell.js';
import { summarize, sessionSteps } from '../engine/summary.js';
import { stepper, purposeCard, nowHave } from './stepper.js';
import { STEP_MAP, stepChecks } from '../engine/step-map.js';
import { addItem, editExpense, editIncome, putFact, removeItem, parseInput, inputText, setPay, bulkEdit } from '../engine/edits.js';
import { setAt, getAt, valueOf as v, addDays, whoSupplies, listFacts } from '../engine/spine.js';
import { PRESETS, FILING_STATUSES, PERSON_PURPOSE_WORDS, isSelfEmployment } from '../engine/schema.js';
import { payersOf } from '../engine/sharing.js';
import { withScenario, scenarioAssumptions, SCENARIO_WORDS } from '../engine/scenarios.js';
import { pickedScenario, pick, scenarioBar } from './scenario.js';
import { answersOf, showsKey, waitsOn, syncProfile, questionById, level2, startsShared, hiddenLine } from '../engine/profile.js';
import { h, chip, money, pct, shortDate, showValue } from './view.js';
import { addNote, removeNote, setShared, sessionNotes } from '../engine/notes.js';
import { guessesFor, mapOf, worthNow } from './urgency.js';
import { openQuestions, openCounts } from '../engine/questions.js';
import { addForm, focusAdd } from './add-form.js';
import { INCOME_FIRST, namePlaceholder } from '../engine/add.js';
import { endCallScreen, fiReveal } from './end-call.js';
import { headlineStrip } from './strip.js';
import { catalog, inlineTicks, tickWords } from './ticks.js';
import { featuresOf, tickFeature } from '../engine/features.js';
import { rememberStep, currentClient } from './clients.js';
import { ledgerHref } from './view.js';
import { isCouple, peopleOf, FILINGS, SPLITS, addPartner, whoseOf, setWhose, styleOf, splitOf } from '../engine/couple.js';

// The tick lists, the presets and the withdrawal rates with their sources (data/session-presets.json).
let DATA = { needs: [], presets: [], withdrawal: [] };
try { const r = await fetch(new URL('../data/session-presets.json', import.meta.url), { cache: 'no-store' }); if (r.ok) DATA = await r.json(); } catch { /* the steps still list what is in your numbers */ }

// The steps, in the order of Numbers' second-level tabs: [id, letter, words].
export const STEPS = [['needs', 'N', 'Needs'], ['debt', 'D', 'Debt'], ['income', 'I', 'Income'], ['assets', 'A', 'Assets'], ['goals', 'G', 'Goals'], ['protection', 'P', 'Protection']];
export const GUIDE_IDS = STEPS.map((x) => x[0]);
// Guide me on or off, kept in this browser; ?guide=1 on the address turns it on (the old Session links).
const GUIDE_KEY = 'slam-guide:v1';
export const guideOn = () => { try { if (/[?&]guide=1\b/.test(location.search)) localStorage.setItem(GUIDE_KEY, '1'); return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return false; } };
export const setGuide = (on) => { try { localStorage.setItem(GUIDE_KEY, on ? '1' : '0'); if (/[?&]guide=1\b/.test(location.search)) history.replaceState(history.state, '', location.pathname + location.hash); } catch { /* lasts until the page closes */ } };
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
  echo(box, 'money');
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
// A box with its own visible label above it (owner, 2026-10-28: boxes in a row never go unnamed). A row with one box
// uses the row's name as its label; a row with more names each one. DESIGN.md "Fields never collide".
const cell = (cap, box, id = box.id) => h('div', { class: 'field-cell' }, h('label', { class: 'field-cap', for: id }, cap), box);
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
// Every saved row can be deleted (owner's ask, 2026-10-27): a red-outline Delete, one change, so Undo brings it back.
const delBtn = (collection, id, name) => h('button', { type: 'button', class: 'btn small danger srow-del', 'aria-label': 'Delete ' + name, onclick: () => change((s) => removeItem(s, collection, id), said.deleted(name)) }, 'Delete');

// What it has (S-270): an item's screen-one ticks under its row, folded to one line; a Yes opens its boxes in place.
// The rest of its ticks are on its screen in My numbers. Every answer and box goes through change(), so Undo works.
const openTicks = new Set();
const ON_ROW = { debts: ['balance', 'apr', 'minimum', 'dueDay'], income: ['amount', 'cadence', 'payDay'], accounts: ['balance'] };
function coreTicks(spine, rules, coll, x, called = null) {
  if (!catalog) return null;
  // A box the row already has (a card's rate and payment) is not asked again under it (owner, 2026-10-28).
  const onRow = ON_ROW[coll] || [];
  const features = featuresOf(catalog, x, coll).filter((f) => f.tier === 'core').map((f) => ({ ...f, reveals: f.reveals.filter((r) => !onRow.includes(r.field)) })).filter((f) => f.reveals.length);
  if (!features.length) return null;
  const base = coll + '.' + x.id, name = called || (coll === 'income' ? x.label : v(x.name) || x.id);
  return inlineTicks({ title: name, features, ticks: x.ticks || {}, idBase: 'tk-' + x.id, open: openTicks.has(base),
    ontoggle: (e) => { if (e.target.open) openTicks.add(base); else openTicks.delete(base); },
    onAnswer: (f, a) => { openTicks.add(base); change((s) => tickFeature(s, base, f, a, { rules, today: todayIso() }), tickWords(name, f, a)); },
    get: (field) => v(x[field]),
    onSet: (field, val, r) => putF(base + '.' + field, val, said.changed(name + ': ' + r.label.toLowerCase(), val === null ? 'blank' : showValue(val, r.type))) });
}

// ---------------------------------------------------------------- the step frame
// Each step's total, as its formula (Track L): the same registry ids My numbers' sections use.
const STEP_METRIC = { needs: 'expenses', debt: 'debts', taxes: 'taxBalanceDue', income: 'gross', assets: 'assets' };
// A step is done when something was entered in it (friction audit: an empty household read 4 of 6 done, its $0 totals
// counted as answers).
function entered(spine, id) {
  if (id === 'debt') return (spine.debts || []).length > 0 || noList().some((k) => k.startsWith('debt-'));
  if (id === 'assets') return (spine.accounts || []).length > 0;
  if (id === 'taxes') return !!v(spine.household.filingStatus);
  if (id === 'income') return (spine.income || []).length > 0;
  if (id === 'needs') return (spine.expenses || []).some((e) => v(e.amount) !== null);
  if (id === 'goals') return (spine.goals || []).some((g) => g.type !== 'fi');
  if (id === 'protection') return (spine.policies || []).length > 0;
  return false;
}
// What is in a step, under its name on the bar (owner, 2026-10-28: say what the checkmark means).
const count = (n, one, many) => n + ' ' + (n === 1 ? one : many);
function stepSub(spine, id) {
  if (!entered(spine, id)) return id === 'debt' && noList().some((k) => k.startsWith('debt-')) ? 'No debts' : 'Nothing yet';
  if (id === 'debt') return (spine.debts || []).length ? count(spine.debts.length, 'debt', 'debts') : 'No debts';
  if (id === 'assets') return count(spine.accounts.length, 'account', 'accounts');
  if (id === 'taxes') return 'Filing status in';
  if (id === 'income') return count(spine.income.length, 'income', 'incomes');
  if (id === 'needs') { const all = spine.expenses || [], n = all.filter((e) => v(e.amount) !== null).length; return n + ' of ' + all.length + ' bills'; }
  if (id === 'goals') return count(spine.goals.filter((g) => g.type !== 'fi').length, 'goal', 'goals');
  if (id === 'protection') return count((spine.policies || []).length, 'policy', 'policies');
  return '';
}
// The Next card (practical run, S-269): the numbers worth filling now, ranked by how much each moves the headline
// numbers (the shared ranking, ui/urgency.js). One big #1, then #2 and #3 smaller; each opens its number.
function nextCard(ctx) {
  const g = guessesFor(ctx.spine, ctx.rules, () => { if (current().spine === ctx.spine) refresh(); });
  const top = (openQuestions(ctx.spine, g) || []).slice(0, 3);
  if (!top.length) return null;
  const words = (q) => q.label + (q.kind === 'missing' ? ', not given yet' : ', a guess worth checking');
  return h('section', { class: 'card next-card', 'aria-label': 'Next to fill' },
    h('a', { class: 'next-one', href: ledgerHref(top[0].row || top[0].path) }, h('span', { class: 'next-kicker' }, 'Next: worth the most now'), h('strong', {}, words(top[0])), h('span', { class: 'next-go', 'aria-hidden': 'true' }, '\u203A')),
    top.length > 1 ? h('ol', { class: 'next-more', start: 2 }, top.slice(1).map((q) => h('li', {}, h('a', { href: ledgerHref(q.row || q.path) }, words(q))))) : null);
}
// Looks right in a step (S-282): every guess in this step's lists kept at once (Enter does it too). Next stays the
// one filled button.
const STEP_LISTS = { needs: ['expenses'], debt: ['debts'], income: ['income', 'household'], assets: ['accounts'], goals: ['goals'], protection: ['policies'] };
function stepLooksRight(spine, id) {
  const rough = listFacts(spine).filter(({ path, fact }) => STEP_LISTS[id] && STEP_LISTS[id].includes(path.split('.')[0]) && fact.kind === 'rough' && fact.value !== null && fact.value !== undefined);
  if (!rough.length) return null;
  const n = rough.length;
  return h('div', { class: 'looks-right-bar' },
    h('button', { type: 'button', class: 'btn', id: 'looks-right', onclick: () => change((x) => bulkEdit(x, rough.map((r) => ({ path: r.path })), 'confirm', todayIso()), n === 1 ? 'One guess kept' : n + ' guesses kept') }, 'Looks right'),
    h('span', { class: 'muted' }, (n === 1 ? '1 guess' : n + ' guesses') + ' in this step. Enter keeps them all; change any one first.'));
}
// The six steps' totals: the summary's (sessionSteps) in Guide me's order, and Protection's monthly premiums.
function guideSteps(spine, s) {
  const all = sessionSteps(spine, s);
  return STEPS.map(([id, letter, label]) => all.find((x) => x.id === id) || { id, letter, label, result: { value: (spine.policies || []).length ? (spine.policies || []).length : null, kind: 'known', count: true } });
}
function frame(ctx, id, body) {
  const s = summarize(ctx.spine, ctx.rules, { flags: false });
  // Inside another step (Income holds the two tax questions): its body only.
  if (ctx.bare) return [].concat(body(s));
  const steps = guideSteps(ctx.spine, s);
  const i = STEPS.findIndex((x) => x[0] === id), step = steps.find((x) => x.id === id);
  const prev = STEPS[i - 1], next = STEPS[i + 1];
  return [
    // The progress tracker (S-265): every step, done when its total is in, each a tap away; Back and Next stay below.
    stepper(STEPS.map(([sid, , label]) => { const st = steps.find((x) => x.id === sid); return { label, href: '#/' + sid, sub: stepSub(ctx.spine, sid), state: sid === id ? 'current' : entered(ctx.spine, sid) && st && st.result && st.result.value !== null ? 'done' : 'todo' }; }), i, { nav: false, doneWord: 'started', doneMeans: '\u2713 means something is in that step, not that it is finished. Tap any step to go there.' }),
    h('section', { class: 'card step-head', 'aria-label': STEPS[i][2] },
      h('span', { class: 'go-mark', 'aria-hidden': 'true' }, STEPS[i][1]),
      h('span', { class: 'step-name' }, STEPS[i][2]),
      h('span', { class: 'step-total' }, totalWords(step, s.sheet.owed)),
      STEP_METRIC[id] ? mathButton([STEP_METRIC[id]], () => ({ spine: ctx.spine, rules: ctx.rules, s })) : null),
    // What this step is for, with a live checkmark for each thing it needs (S-278), folded.
    STEP_MAP[id] ? purposeCard(STEP_MAP[id].purpose, stepChecks(ctx.spine, s, id)) : null,
    stepLooksRight(ctx.spine, id),
    ...[].concat(body(s)),
    STEP_MAP[id] ? nowHave(STEP_MAP[id].have, STEP_MAP[id].unlocks[1], '#/' + STEP_MAP[id].unlocks[0]) : null,
    h('div', { class: 'step-nav' },
      h('button', { type: 'button', class: 'btn', onclick: () => go(prev ? [prev[0]] : []) }, '‹ Back'),
      next ? h('button', { type: 'button', class: 'btn primary', onclick: () => go([next[0]]) }, 'Next: ' + next[2] + ' ›')
        : h('a', { class: 'btn primary', href: 'dashboard.html#/end' }, 'End the call ›')),
    h('p', { class: 'muted step-skip' }, 'Nothing here is required. Next skips ahead.')
  ];
}
const WORDS = { needs: ' a month', debt: ' owed', taxes: ' due at tax time', income: ' a month before tax', assets: ' owned', goals: ' in goals' };
// owed: what others owe the household (round 3: Assets less Debt visibly makes net worth, as in My numbers).
function totalWords(step, owed = 0) {
  const r = step.result;
  if (r.value === null) return h('span', { class: 'empty' }, 'Nothing yet');
  if (step.id === 'protection') return h('span', {}, h('strong', {}, String(r.value)), r.value === 1 ? ' policy' : ' policies');
  // Taxes below zero is money back (a refund), said so.
  if (step.id === 'taxes' && r.value < 0) return h('span', {}, h('strong', {}, money(-r.value)), ' back at tax time', r.kind === 'rough' || r.kind === 'incomplete' ? [' ', chip(r.kind)] : null);
  return h('span', {}, h('strong', {}, money(r.value)), WORDS[step.id], step.id === 'assets' && owed ? ', plus ' + money(owed) + ' owed to you' : null, r.kind === 'rough' || r.kind === 'incomplete' ? [' ', chip(r.kind)] : null);
}

// ---------------------------------------------------------------- Needs
// Per client (S-269): one client's No is not another's.
const NO_KEY = 'slam-session-no:v1' + ((currentClient() || {}).id ? ':' + currentClient().id : '');
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
    isCouple(spine) ? [h('label', { class: 'mini-label', for: 'split-' + e.id }, 'Between the two of you'),
      pickBox('split-' + e.id, e.label + ': split between the two of you', [['', 'As the household: ' + splitWords(spine, splitOf(spine, null)).toLowerCase()], ...splitOptions(spine)], e.coupleSplit ? v(e.coupleSplit) : '',
        (x) => change((sp) => (x ? putFact(sp, 'expenses.' + e.id + '.coupleSplit', x, 'known', today) : { ...sp, expenses: sp.expenses.map((i) => (i.id === e.id ? drop(i, 'coupleSplit') : i)) }), said.changed(e.label + ': split', x ? splitWords(spine, x) : 'as the household')))] : null,
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
  return lineRow(sub ? 'sub' : '', name, cell('A month', amt), cell('Day paid', intBox('nd-' + key, v(e.payDay), item.label + ': day of the month', (d) => setLineDay(e, d), { placeholder: 'e.g. 5' })), needWant(e), more(item.label, ...whoPays(spine, e)), delBtn('expenses', e.id, e.label));
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
// The Needs groups by their names on screen (S-283); the stored category names stay (a line can be named like one).
const CAT_TITLE = { Accommodation: 'Housing', Transportation: 'Getting around', 'Health and fitness': 'Health', Subscriptions: 'Bills and subscriptions', Miscellaneous: 'Other' };
const openCats = new Set();
function needs(ctx) {
  const spine = ctx.spine, hh = spine.household;
  const known = new Set(allItems().map((x) => lower(x.label)));
  const extra = (fat) => (spine.expenses || []).filter((e) => !known.has(lower(e.label)) && !DATA.needs.some((c) => lower(c.label) === lower(e.label)) && (fat === 'other' ? !['food', 'accommodation', 'transportation'].includes(e.fat) : e.fat === fat));
  const hidden = noList().filter((k) => allItems().some((x) => x.key === k));
  const a = answersOf(spine);
  const said1 = (id) => { const q = questionById(id), x = a[id]; return x === undefined ? 'not answered yet' : x === 'notSure' ? 'not sure' : (q.options.find(([k]) => k === x) || [x, x])[1]; };
  return frame(ctx, 'needs', (sum) => [
    // A shared bill counts the household's part in the total (round 3: the lines then add up to it).
    (() => { const sh = sum.cashflow.expenses.items.filter((i) => i.shared && i.full !== i.amount); return sh.length ? h('p', { class: 'muted' }, 'Shared bills count your part in the total: ' + sh.map((i) => i.label + ' ' + money(i.amount) + ' of ' + money(i.full)).join(', ') + '.') : null; })(),
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
      // Chunked (S-283): each group folds to its name and total, and opens on tap; what is open stays open.
      const total = [cat, ...cat.items.flatMap((item) => [item, ...(item.subs || [])])].reduce((n, x) => { const e = findExpense(spine, x.label); return n + (e && !hiddenLine(spine, e) ? v(e.amount) || 0 : 0); }, 0) + others.reduce((n, e) => n + (v(e.amount) || 0), 0);
      const isOpen = openCats.has(cat.id) || (!openCats.size && cat === DATA.needs[0]);
      const d = h('details', { class: 'card done-group need-group', open: isOpen || null, 'aria-labelledby': 'cat-' + cat.id },
        h('summary', {}, h('h2', { id: 'cat-' + cat.id, class: 'group-h' }, CAT_TITLE[cat.label] || cat.label), h('span', { class: 'go-total' }, total ? money(total) + ' a month' : 'Nothing yet')),
        // A line named like the category with lines of its own beside it (round 2: the demo's Miscellaneous $300 was in
        // the total and on no row): it shows as its own row, so the lines add up to the total.
        h('ul', { class: 'srows' }, ...lines, ...others.map((e) => needRow(spine, { label: e.label }, e.fat, 'x-' + e.id)), catOn && anyLine ? needRow(spine, { label: cat.label }, cat.fat, 'rest-' + cat.id) : null, oneNumber));
      d.addEventListener('toggle', () => { if (!d.isConnected) return; if (d.open) openCats.add(cat.id); else openCats.delete(cat.id); });
      return d;
    }),
    hidden.length ? h('p', { class: 'muted' }, hidden.length + ' marked No. ', h('button', { type: 'button', class: 'btn small', onclick: () => { for (const k of hidden) setNo(k, false); } }, 'Show them again')) : null
  ]);
}

// ---------------------------------------------------------------- the two of you (Batch 7, S-277)
// The first step asks "Single, or a couple?" (plain words, owner 2026-10-28); a couple adds the partner (name, birth date, filing). Then every debt,
// account and income has a Whose box (names, and Joint but for income), and a new one starts as whoever was picked
// last, else as the money style says, else the first person. Shared bills split half each unless set otherwise, for
// the household and on a line; the split only divides each person's own numbers, never the household's.
let lastWhose = null, partnerOpen = false;
const firstName = (p) => String((p && p.name) || '').trim().split(/\s+/)[0] || 'Partner';
const whoseOptions = (spine, coll) => { const [a, b] = peopleOf(spine); const o = [['me', firstName(a)], ['partner', firstName(b)]]; return coll === 'income' ? o : [...o, ['joint', 'Joint']]; };
function whoseBox(spine, coll, x, name) {
  if (!isCouple(spine)) return null;
  const opts = whoseOptions(spine, coll);
  return cell('Whose', pickBox('w-' + x.id, name + ': whose', opts, whoseOf(spine, coll, x), (w) => { lastWhose = w; change((s) => setWhose(s, coll, x.id, w, todayIso()), said.changed(name + ': whose', (opts.find(([k]) => k === w) || [w, w])[1])); }));
}
const newWhose = (spine, coll) => { const w = lastWhose || (styleOf(spine) || {}).whose || 'me'; return coll === 'income' && w === 'joint' ? 'me' : w; };
const withWhose = (s, coll, id) => (isCouple(s) && id ? setWhose(s, coll, id, newWhose(s, coll), todayIso()) : s);
const splitWords = (spine, k) => { const [a, b] = peopleOf(spine); return { half: 'Half each', income: 'By take-home', me: firstName(a) + ' pays', partner: firstName(b) + ' pays' }[k] || k; };
const splitOptions = (spine) => SPLITS.map(([k]) => [k, splitWords(spine, k)]);
function whoCard(ctx) {
  const spine = ctx.spine, ps = peopleOf(spine), today = todayIso();
  const q = (label, ...rest) => h('div', { class: 'q q-inline' }, h('p', { class: 'q-label' }, label), ...rest);
  if (isCouple(spine)) {
    const fs = v(spine.household.filingStatus);
    return h('section', { class: 'card qs who-card', 'aria-label': 'Who this is for' },
      q('Who this is for', h('span', { class: 'q-have' }, ps.map(firstName).join(' and ') + ', ' + ((FILINGS.find(([k]) => k === fs) || [fs, 'filing not set'])[1]).toLowerCase())),
      q('Shared bills split', pickBox('split-all', 'Shared bills split', splitOptions(spine), splitOf(spine, null), (x) => change((sp) => putFact(sp, 'household.coupleSplit', x, 'known', today), said.changed('Shared bills split', splitWords(spine, x))))));
  }
  if (noList().includes('just-me')) return h('section', { class: 'card qs who-card' }, q('Single, or a couple?', h('span', { class: 'q-have' }, 'Single', ' ', h('button', { type: 'button', class: 'btn small', onclick: () => setNo('just-me', false) }, 'Change'))));
  if (!partnerOpen) return h('section', { class: 'card qs who-card' }, q('Single, or a couple?', h('span', { class: 'tick' },
    h('button', { type: 'button', class: 'btn small', id: 'who-me', onclick: () => setNo('just-me', true) }, 'Single'),
    h('button', { type: 'button', class: 'btn small', id: 'who-two', onclick: () => { partnerOpen = true; refresh(); later(() => document.getElementById('p-name')?.focus()); } }, 'A couple'))));
  const nm = h('input', { id: 'p-name', type: 'text', autocomplete: 'off', placeholder: 'e.g. Sam' });
  const bd = h('input', { id: 'p-birth', type: 'date' });
  const fl = pickBox('p-filing', 'How you file', FILINGS, 'mfj', () => {});
  const msg = h('span', { class: 'edit-msg', role: 'alert' });
  const add = (e) => { e.preventDefault(); const name = nm.value.trim(); if (!name) { msg.textContent = 'Type a name first'; nm.focus(); return; } partnerOpen = false; change((sp) => addPartner(sp, { name, birthDate: bd.value || null, filing: fl.value }, today), said.added(name)); };
  return h('form', { class: 'card who-card', novalidate: true, onsubmit: add },
    h('p', { class: 'edit-label' }, 'The two of you'),
    h('div', { class: 'srow' }, cell('Partner\'s name', nm), cell('Birth date', bd), cell('How you file', fl)),
    msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn small' }, 'Add ' + 'partner'), h('button', { type: 'button', class: 'btn small', onclick: () => { partnerOpen = false; refresh(); } }, 'Cancel')));
}

// ---------------------------------------------------------------- Debt
// Each kind's words, one and many (S-291): the add buttons, the heading over a kind's rows and an unnamed row's words read from here.
const DEBT_KINDS = { credit_card: ['Credit card', 'Credit cards'], student_loan: ['Student loan', 'Student loans'], private_student_loan: ['Private student loan', 'Private student loans'], auto_loan: ['Car loan', 'Car loans'], mortgage: ['Mortgage', 'Mortgages'], heloc: ['Home equity line', 'Home equity lines'], personal_loan: ['Personal loan', 'Personal loans'], medical: ['Medical bill', 'Medical bills'], family_iou: ['Money owed to a person', 'Money owed to people'] };
const kindWords = (type, many = false) => (DEBT_KINDS[type] ? DEBT_KINDS[type][many ? 1 : 0] : (PRESETS[type] || {}).label || type);
// A row still called by its kind: the Session's words, or a preset's label (a loan added in My numbers is "Federal student loan").
const KIND_NAMES = new Set([...Object.values(DEBT_KINDS).map(([one]) => lower(one)), ...Object.values(PRESETS).filter((p) => p.family === 'debt').map((p) => lower(p.label))]);
const isKindName = (t) => KIND_NAMES.has(lower(t));
const DEBT_ADD = ['credit_card', 'student_loan', 'auto_loan', 'mortgage', 'personal_loan', 'medical', 'family_iou'].map((t) => [t, kindWords(t)]);
const DEBT_QS = [['credit_card', 'Any credit cards?', 'Credit card', true], ['student_loan', 'Student loans?', 'Student loan'], ['auto_loan', 'A car loan?', 'Car loan'], ['mortgage', 'A mortgage?', 'Mortgage'], ['family_iou', 'Owe money to a person?', 'Money owed to a person']];
const putF = (path, value, words, kind = 'known') => change((s) => (value === null ? putFact(s, path, null, 'missing', todayIso()) : putFact(s, path, value, kind, todayIso())), words);
function addDebt(type, label) {
  change((spine) => {
    const r = addItem(spine, { collection: 'debts', type, label }, todayIso());
    later(() => document.getElementById('d-name-' + r.id)?.focus());
    let s = withWhose(r.spine, 'debts', r.id);
    // A car loan takes over a "Car payment" line in Needs, so the payment counts once.
    const pay = type === 'auto_loan' ? findExpense(s, 'Car payment') : null;
    if (pay && !pay.paysDebt) s = putFact(s, 'expenses.' + pay.id + '.paysDebt', r.id, 'known', todayIso());
    return s;
  }, said.added(label));
}
// Several at once (owner, 2026-10-28): on a kind that comes in handfuls (cards), "Add several" turns the question into "How many more
// credit cards?" (2 to 6) and adds that many blank rows in one change, the first one's Name box focused.
let severalOpen = null;
const SEVERAL = [2, 3, 4, 5, 6];
function addDebts(type, label, n) {
  severalOpen = null;
  change((spine) => {
    let s = spine, first = null;
    for (let i = 0; i < n; i++) { const r = addItem(s, { collection: 'debts', type, label }, todayIso()); s = withWhose(r.spine, 'debts', r.id); if (!first) first = r.id; }
    later(() => document.getElementById('d-name-' + first)?.focus());
    return s;
  }, said.added(n + ' ' + label.toLowerCase() + 's'));
}
// A debt's name in its row (owner, 2026-10-28, S-291): a card's name, or a loan's servicer or lender, from the same picker
// and libraries as the Add form. A row still called by its kind shows a blank box asking for the name; clearing the box
// puts the kind's words back (a name is never blank). A card picked from the library brings its issuer, typical rate and
// annual fee as guesses, never over a number already typed, in the same change as the name (one Undo).
function debtNameBox(d, name, kind) {
  const id = 'd-name-' + d.id, p = 'debts.' + d.id, today = todayIso();
  const box = h('input', { id, class: 'name-box', type: 'text', autocomplete: 'off', placeholder: namePlaceholder('debts', d.type), 'aria-label': name + ': name' });
  const shown = (stored) => (isKindName(stored) ? '' : stored);
  box.value = shown(v(d.name) || '');
  const setName = (text, fills = null) => {
    const t = String(text || '').trim().slice(0, 80) || kind;
    change((s) => applyFills(putFact(s, p + '.name', t, 'known', today), p, fills, today), said.changed(name, t));
  };
  // Typed and left (Tab, a tap elsewhere): saved unless it is what is there already (a pick has saved itself by then).
  const liveName = () => { const x = (current().spine.debts || []).find((y) => y.id === d.id); return x ? v(x.name) || '' : null; };
  box.addEventListener('change', () => { const t = box.value.trim(), now = liveName(); if (now === null || t === shown(now)) return; later(() => setName(t)); });
  // The rows still called by their kind are not offered as names.
  const wrap = attachPicker(box, { source: 'name:debts', entries: () => nameEntries(current().spine, 'debts', 'debt', d.type).filter((e) => e.from !== 'mine' || !isKindName(e.words)),
    onPick: (e) => setName(e.words, e.source === 'card' ? cardFills(e.value) : e.source === 'institution' ? { institution: e.value.name } : null),
    onFree: (t) => setName(t) });
  const c = cell('Name', wrap, id);
  c.classList.add('name-cell');
  return c;
}
// One debt's row: its name first, then the four numbers, a card's paid-in-full choice, Delete, and its questions folded.
// A row still called by its kind, among several, is "Credit card 2" wherever it is spoken of (its labels, the Undo bar).
function debtRow(ctx, d, i, n) {
  const spine = ctx.spine, kind = kindWords(d.type), p = 'debts.' + d.id, stored = v(d.name) || '';
  const name = stored && !isKindName(stored) ? stored : n > 1 ? kind + ' ' + (i + 1) : kind;
  return lineRow('debt', debtNameBox(d, name, kind),
    whoseBox(spine, 'debts', d, name),
    // The balance's guess chip sits on the Owed label, the number it is about.
    cell(['Owed', ' ', guessChip(d.balance, p + '.balance')], moneyBox('d-bal-' + d.id, v(d.balance), name + ': balance', (x) => putF(p + '.balance', x, said.changed(name + ' balance', x === null ? 'blank' : money(x))), 'e.g. 4,200')),
    cell('Rate (%)', rateBox('d-apr-' + d.id, v(d.apr), name + ': interest rate', (x) => putF(p + '.apr', x, said.changed(name + ' rate', x === null ? 'blank' : pct(x, 2))))),
    cell('Payment a month', moneyBox('d-min-' + d.id, v(d.minimum), name + ': monthly payment', (x) => putF(p + '.minimum', x, said.changed(name + ' payment', x === null ? 'blank' : money(x))), 'e.g. 120')),
    cell('Due day', intBox('d-day-' + d.id, v(d.dueDay), name + ': due day', (x) => putF(p + '.dueDay', x, said.changed(name + ' due day', x === null ? 'blank' : 'the ' + x + suffix(x))), { placeholder: 'e.g. 15' })),
    // A card: paid in full every month, or carried? It decides whether the balance costs interest.
    d.type === 'credit_card' ? cell('Paid in full each month?', pickBox('d-pay-' + d.id, name + ': paid in full each month?', [['', 'Not set yet'], ['statement', 'Yes, in full'], ['minimum', 'No, I carry a balance']], v(d.payPolicy) || '', (k) => putF(p + '.payPolicy', k || null, said.changed(name, k === 'statement' ? 'paid in full each month' : k === 'minimum' ? 'carries a balance' : 'blank')))) : null,
    delBtn('debts', d.id, name),
    coreTicks(spine, ctx.rules, 'debts', d, name));
}
function debt(ctx) {
  const spine = ctx.spine;
  const list = spine.debts || [];
  // The rows sit under their kind's heading, kinds in the order the questions ask (S-291).
  const kinds = [];
  for (const d of list) { let g = kinds.find((x) => x.type === d.type); if (!g) { g = { type: d.type, rows: [] }; kinds.push(g); } g.rows.push(d); }
  const rank = (t) => { const i = DEBT_ADD.findIndex(([k]) => k === t); return i < 0 ? DEBT_ADD.length : i; };
  kinds.sort((a, b) => rank(a.type) - rank(b.type));
  // One question per kind of debt: Yes adds one (and then offers another); a kind you have reads Yes.
  const asks = DEBT_QS.map(([type, q, label, several]) => {
    const have = list.filter((d) => d.type === type).length;
    const open = have && severalOpen === type;
    return h('div', { class: 'q q-inline' }, h('p', { class: 'q-label' }, open ? 'How many more ' + label.toLowerCase() + 's?' : q),
      open ? h('span', { class: 'tick' }, ...SEVERAL.map((n) => h('button', { type: 'button', class: 'btn small', id: 'dqs-' + type + '-' + n, onclick: () => addDebts(type, label, n) }, String(n))), h('button', { type: 'button', class: 'btn small', onclick: () => { severalOpen = null; refresh(); } }, 'Cancel'))
        : have ? h('span', { class: 'q-have' }, 'Yes, ' + have, ' ', h('button', { type: 'button', class: 'btn small', onclick: () => addDebt(type, label) }, 'Add another'), several ? h('button', { type: 'button', class: 'btn small', id: 'dqs-' + type, onclick: () => { severalOpen = type; refresh(); later(() => document.getElementById('dqs-' + type + '-2')?.focus()); } }, 'Add several') : null)
        : noList().includes('debt-' + type) ? h('span', { class: 'q-have' }, 'No', ' ', h('button', { type: 'button', class: 'btn small', onclick: () => setNo('debt-' + type, false) }, 'Change'))
        : h('span', { class: 'tick' }, h('button', { type: 'button', class: 'btn small', id: 'dq-' + type, onclick: () => addDebt(type, label) }, 'Yes'), h('button', { type: 'button', class: 'btn small', id: 'dqn-' + type, onclick: () => setNo('debt-' + type, true) }, 'No')));
  });
  return frame(ctx, 'debt', () => [
    whoCard(ctx),
    h('section', { class: 'card qs' }, ...asks),
    h('section', { class: 'card' },
      list.length ? h('ul', { class: 'srows' }, kinds.flatMap((g) => [
        h('li', { class: 'srow kind-head' }, h('p', { class: 'kind-title', id: 'dk-' + g.type }, g.rows.length > 1 ? kindWords(g.type, true) + ' (' + g.rows.length + ')' : kindWords(g.type))),
        ...g.rows.map((d, i) => debtRow(ctx, d, i, g.rows.length))
      ])) : h('p', { class: 'muted' }, 'No debts yet.'),
      list.length ? h('p', { class: 'edit-hint' }, 'A name for each one (the card, or who you pay), what is owed, the rate, the monthly payment and the due day. Blank is fine for now.') : null),
    h('section', { class: 'card' }, h('p', { class: 'edit-label' }, 'Something else'), h('div', { class: 'edit-actions' }, DEBT_ADD.filter(([t]) => !DEBT_QS.some(([q]) => q === t)).map(([type, label]) => h('button', { type: 'button', class: 'btn small', onclick: () => addDebt(type, label) }, label))))
  ]);
}

// ---------------------------------------------------------------- Income (and the two tax questions)
// Adding income (S-237): the same form My numbers uses (ui/add-form.js), questions first, built once while open.
let addingIncome = false, incomeFormEl = null;
function incomeAdd(spine, today) {
  if (!addingIncome) { incomeFormEl = null; return h('button', { type: 'button', id: 'i-add', class: 'btn add', onclick: () => { addingIncome = true; refresh(); focusAdd(); } }, '+ Add income'); }
  if (!incomeFormEl) incomeFormEl = addForm({ spine: () => current().spine, collection: 'income', types: INCOME_FIRST.map(([k]) => k), today,
    onDone: (made, label) => { addingIncome = false; incomeFormEl = null; change(withWhose(made.spine, 'income', made.id), said.added(label)); },
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
function incomeRows(spine, rules) {
  return (spine.income || []).filter((x) => x.type !== 'maybeMoney').map((x) => {
    const asked = (x.type === 'w2' && v(x.payBasis)) || (isSelfEmployment(x) && v(x.payBasis) === 'lumpy');
    const amountBox = asked ? null : [
      cell('Before tax', moneyBox('i-amt-' + x.id, v(x.amount), x.label + ': how much, before tax', (a) => setIncome(x, { amount: a }, said.changed(x.label, a === null ? 'blank' : money(a))), 'e.g. 2,600')),
      cell('How often', pickBox('i-often-' + x.id, x.label + ': how often', OFTEN.some(([k]) => k === x.cadence) ? OFTEN : [[x.cadence, x.cadence], ...OFTEN], x.cadence, (c) => setIncome(x, { cadence: c }, said.changed(x.label + ' how often', OFTEN.find(([k]) => k === c)[1]))))];
    return lineRow('income' + (x.type === 'w2' || isSelfEmployment(x) || x.type === 'unemployment' ? ' asks' : ''), h('span', { class: 'srow-name' }, x.label, guessChip(x.amount, 'income.' + x.id + '.amount')),
      whoseBox(spine, 'income', x, x.label),
      amountBox,
      delBtn('income', x.id, x.label),
      x.cadence === 'monthly' || x.cadence === 'semimonthly' ? cell('Day paid', intBox('i-day-' + x.id, v(x.payDay), x.label + ': day paid', (d) => setIncome(x, { payDay: d }, said.changed(x.label + ' day paid', d === null ? 'blank' : 'the ' + d + suffix(d))), { placeholder: 'e.g. 15' })) : null,
      x.type === 'w2' ? h('div', { class: 'srow-q' }, ...w2Bits(spine, x)) : null,
      isSelfEmployment(x) && x.type !== 'person' ? h('div', { class: 'srow-q' }, ...selfBits(x)) : null,
      x.type === 'unemployment' ? h('div', { class: 'srow-q' }, ...unemploymentBits(x)) : null,
      x.type === 'person' && v(x.purpose) === null ? (openMore.add(x.label), more(x.label, ...personBits(spine, x))) : x.type === 'person' ? more(x.label, ...personBits(spine, x)) : null,
      coreTicks(spine, rules, 'income', x));
  });
}
function income(ctx) {
  const spine = ctx.spine, today = todayIso();
  return frame(ctx, 'income', () => [
    h('section', { class: 'card' },
      (spine.income || []).length ? h('ul', { class: 'srows' }, incomeRows(spine, ctx.rules)) : h('p', { class: 'muted' }, 'No income yet.'),
      incomeAdd(spine, today))
  ]);
}
// ---------------------------------------------------------------- Taxes (its own step, DATING order, S-258)
// The place picker: a city from the list, or any ZIP code typed (S-284).
function placeBox(today) {
  const box = h('input', { id: 't-place', type: 'text', placeholder: 'e.g. Brooklyn or 11215', 'aria-describedby': 't-place-hint' });
  const apply = (pl) => {
    if (!pl) { say('Not a place I know: pick Where you live below'); return; }
    change((s) => { let x = putFact(s, 'household.state', pl.state, 'known', today); x = putFact(x, 'household.nycResident', pl.locality === 'nyc', 'known', today); return putFact(x, 'household.yonkersResident', pl.locality === 'yonkers', 'known', today); }, said.changed('Where you live', pl.words));
  };
  const wrap = attachPicker(box, { source: 'place', entries: placeLibEntries, onPick: (e) => apply(LIB.places ? placeOf(e.words, LIB.places) : null), onFree: (t) => apply(LIB.places ? placeOf(t, LIB.places) : null) });
  return h('div', { class: 'place-pick' }, wrap, h('p', { class: 'edit-hint', id: 't-place-hint' }, 'Fills the state, and New York City or Yonkers tax.'));
}
function taxes(ctx) {
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
  return frame(ctx, 'taxes', () => [
    h('section', { class: 'card', 'aria-label': 'Taxes' },
      h('ul', { class: 'srows' },
        lineRow('', h('label', { class: 'srow-name', for: 't-filing' }, 'Filing status'),
          pickBox('t-filing', 'Filing status', [['', 'Pick one'], ...FILING_STATUSES.map((f) => [f, FILING_WORDS[f]])], v(hh.filingStatus) || '', (f) => putF('household.filingStatus', f || null, said.changed('Filing status', f ? FILING_WORDS[f] : 'blank')))),
        // City or ZIP (S-284): picks the state and whether New York City or Yonkers tax applies, in one change.
        lineRow('', h('label', { class: 'srow-name', for: 't-place' }, 'City or ZIP'), placeBox(today)),
        // Where in New York (S-272): New York City and Yonkers add their own income tax.
        lineRow('', h('label', { class: 'srow-name', for: 't-where' }, 'Where you live'),
          pickBox('t-where', 'Where you live', [['', 'Pick one'], ['nyc', 'New York City'], ['yonkers', 'Yonkers'], ['ny', 'Elsewhere in New York'], ['other', 'Another state']],
            v(hh.nycResident) === true ? 'nyc' : v(hh.yonkersResident) === true ? 'yonkers' : v(hh.state) === 'NY' && v(hh.nycResident) === false ? 'ny' : v(hh.state) && v(hh.state) !== 'NY' ? 'other' : '',
            (w) => change((s) => { if (!w) return s; let x = putFact(s, 'household.nycResident', w === 'nyc', 'known', today); x = putFact(x, 'household.yonkersResident', w === 'yonkers', 'known', today); return w === 'other' ? x : putFact(x, 'household.state', 'NY', 'known', today); }, said.changed('Where you live', { nyc: 'New York City', yonkers: 'Yonkers', ny: 'elsewhere in New York', other: 'another state' }[w] || 'not set')))),
        lineRow('', h('label', { class: 'srow-name', for: 't-last' }, 'Last year'),
          pickBox('t-last', 'Last year\'s tax', [['', 'Pick one'], ['refund', 'Got a refund'], ['owed', 'Owed'], ['none', 'Did not file']], lastHow, (how) => setLast(how, last === null ? null : Math.abs(last))),
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
function assets(ctx) {
  const spine = ctx.spine, today = todayIso();
  let iraPick = 'roth_ira';
  const addAcct = (type, label) => change((s) => { const r = addItem(s, { collection: 'accounts', type, label }, today); return withWhose(r.spine, 'accounts', r.id); }, said.added(label));
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
          whoseBox(spine, 'accounts', a, name),
          cell('Balance', moneyBox('a-bal-' + a.id, v(a.balance), name + ': balance', (x) => putF(p + '.balance', x, said.changed(name + ' balance', x === null ? 'blank' : money(x))))),
          delBtn('accounts', a.id, name),
          h('button', { type: 'button', class: 'btn small toggle liquid-tag', 'aria-pressed': String(on), title: on ? 'Counted in liquid net worth' : 'Not counted in liquid net worth', onclick: () => change((sp) => (!on === (s.sheet.liquid.defaults[a.id] !== 'none') ? setAt(sp, p, drop(getAt(sp, p), 'liquid')) : putFact(sp, p + '.liquid', !on, 'known', today)), said.changed(name, on ? 'not liquid' : 'liquid')) }, on ? (part === 'contributions' ? 'Liquid: contributions' : 'Liquid') : 'Not liquid'),
          a.family === 'taxable' ? holdings(a) : null,
          // A plan at work: the match tier by tier, vesting and the rest of its screen-one questions (S-270).
          coreTicks(spine, ctx.rules, 'accounts', a));
      })) : h('p', { class: 'muted' }, 'Nothing yet.'),
      h('p', { class: 'edit-hint' }, 'Liquid: money you can reach without a penalty or selling something you live with. Tap to change it.')),
    h('section', { class: 'card' }, h('p', { class: 'edit-label' }, 'Add one'),
      h('div', { class: 'edit-actions' }, ASSET_ADD.map(([type, label]) => h('button', { type: 'button', class: 'btn small', onclick: () => addAcct(type, label) }, label))),
      h('div', { class: 'edit-actions' },
        cell('IRA type', pickBox('a-ira', 'IRA type', IRA_TYPES, iraPick, (x) => { iraPick = x; })),
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
            delBtn('goals', g.id, 'Goal ' + g.label),
            (() => { const d = h('input', { id: 'g-by-' + g.id, type: 'date', 'aria-label': g.label + ': by when' }); d.value = g.by || ''; d.addEventListener('change', () => change((sp) => setAt(sp, 'goals.' + g.id + '.by', d.value || null), said.changed('Goal ' + g.label + ' by', d.value || 'no date'))); return d; })()))),
        goalForm || h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn add', onclick: () => { goalAdding = true; refresh(); requestAnimationFrame(focusAdd); } }, '+ Add a goal')),
        h('p', { class: 'edit-label' }, 'Fund goals'),
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Fund goals' }, [['oneAtATime', 'One at a time'], ['byDeadline', 'By deadline']].map(([k, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(order === k), onclick: () => { if (order !== k) putF('household.goalOrder', k, said.changed('Goals', w.toLowerCase())); } }, h('span', { class: 'seg-label' }, w))))),
      scenarioBar(spine, rules, pickedScenario(), () => refresh()),
      h('section', { class: 'card', 'aria-labelledby': 'wr-h' },
        h('h2', { id: 'wr-h' }, 'Withdrawal rate'),
        // Only Your own takes a withdrawal rate of its own; the other sets each have theirs.
        own ? h('ul', { class: 'srows' }, DATA.withdrawal.map((w) => lineRow('', h('label', { class: 'check-row wr-pick' }, h('input', { type: 'radio', name: 'wr', checked: wr === w.rate, onchange: () => change((sp) => putFact(sp, 'assumptions.withdrawalRate', w.rate, 'known', today), said.changed('Withdrawal rate', w.label)) }), h('span', {}, h('strong', {}, w.label + (w.default ? ' (standard)' : '')), h('span', { class: 'choice-sub' }, w.source), w.note ? h('span', { class: 'choice-sub' }, w.note) : null)))))
          : [h('p', {}, 'The ' + SCENARIO_WORDS[pickedScenario()].toLowerCase() + ' set uses ' + pct(scenarioAssumptions(spine, rules, pickedScenario()).withdrawalRate.value, 1) + '.'), h('button', { type: 'button', class: 'btn small', onclick: () => { pick('best'); refresh(); } }, 'Choose my own')])
    ];
  });
}

// ---------------------------------------------------------------- the top screen
// Krug pass: one list, the five steps, each with how many of the Profile's open questions belong to it; the questions
// themselves sit at the top of each step. "Start with Needs" leads.
const STEP_AREAS = { protection: [], needs: ['health', 'statements'], taxes: [], debt: ['cards', 'student', 'car', 'mortgage', 'debtAll'], income: ['work'], assets: ['k401', 'ira', 'hsa', 'brokerage'], goals: ['goalsAll'] };
const openAreas = (spine, step) => { const a = answersOf(spine); return Object.keys(a).length ? level2(a).filter((x) => STEP_AREAS[step].includes(x.area)) : []; };
function stepQuestions(spine, step) {
  const areas = openAreas(spine, step);
  if (!areas.length) return null;
  return h('ul', { class: 'go-list', 'aria-label': 'Questions for this step' }, areas.map((x) => h('li', {}, h('a', { class: 'go-row plain', href: 'profile.html#/ask/' + x.area }, h('span', { class: 'go-name' }, x.label), h('span', { class: 'go-sub' }, x.questions.length + (x.questions.length === 1 ? ' question' : ' questions'))))));
}

function overview(ctx) {
  const sum = summarize(ctx.spine, ctx.rules, { flags: false }), steps = guideSteps(ctx.spine, sum);
  // Each step's open questions (morning answer 10): the one list My numbers counts, once the ranking is in.
  const g = guessesFor(ctx.spine, ctx.rules, () => { if (current().spine === ctx.spine) refresh(); });
  const open = openCounts(openQuestions(ctx.spine, g));
  return [
    h('div', { class: 'step-nav' }, h('button', { type: 'button', class: 'btn primary', onclick: () => go([STEPS[0][0]]) }, 'Start with ' + STEPS[0][2] + ' ›')),
    h('ol', { class: 'go-list', 'aria-label': 'The steps, in order' }, steps.map((st) => { const n = open ? open[st.id] : null; return h('li', {}, h('a', { class: 'go-row', href: '#/' + st.id },
      h('span', { class: 'go-mark', 'aria-hidden': 'true' }, st.letter),
      h('span', { class: 'go-name' }, st.label),
      h('span', { class: 'go-sub' }, totalWords(st, sum.sheet.owed), n ? [' · ', h('span', { 'data-metric': 'list:open:' + st.id }, String(n)), ' to answer'] : ''))); }))
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

// Income holds the two tax questions first (how you file, where you live), then the paychecks.
const incomeStep = (ctx) => frame(ctx, 'income', () => [...taxes({ ...ctx, bare: true }), ...income({ ...ctx, bare: true })]);
const SCREENS = { debt, assets, income: incomeStep, needs, goals };
let goalAdding = false;
// One step of Guide me: its screen-one boxes inside the step frame. protection(): Numbers' own Protection screen.
export function guideStep(ctx, id, { protection = () => [] } = {}) {
  const r = guessesFor(ctx.spine, ctx.rules, () => { if (current().spine === ctx.spine) refresh(); });
  if (r) { marks = mapOf(r, ctx.spine); marksFresh = true; } else marksFresh = false;
  rememberStep(id);
  const body = id === 'protection' ? frame(ctx, 'protection', () => [].concat(protection())) : SCREENS[id](ctx);
  return [stepQuestions(ctx.spine, id), body, sessionNotesRow(ctx)];
}
// The top of Guide me: the steps in order, Start with the first.
export function guideTop(ctx) { return [overview(ctx), sessionNotesRow(ctx)]; }
export { nextCard, sessionNotesRow };
// End call (on Home, S-280): the end-of-call screen, with the session notes.
export function endCall(ctx) {
  const r = guessesFor(ctx.spine, ctx.rules, () => { if (current().spine === ctx.spine) refresh(); });
  return [fiReveal(ctx.spine, ctx.rules), endCallScreen(ctx.spine, r, catalog, todayIso()), sessionNotesRow(ctx)];
}

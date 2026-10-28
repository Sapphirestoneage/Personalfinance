// Guide me (S-280; was the Session page, S-230): a mode of Numbers, not a page. On, Numbers walks its six sections in
// order (Needs, Debt, Income with the two tax questions, Assets, Goals, Protection) with Back and Next, each step
// showing only its screen-one boxes, what it is for, and "You now have / Next this unlocks". Off, Numbers is free to
// roam. Same screens, same data: every change goes through the shell's change() with words, so Undo takes it back.
// Formatting only: the totals come from the engines (summary.js sessionSteps, networth.js, fi.js, emergency.js).

import { echo } from './understood.js';
import { attachPicker } from './picker.js';
import { placeLibEntries, goalEntries, LIB } from './libraries.js';
import { placeOf, placeFacts } from '../engine/library.js';
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
import { answersOf, showsKey, waitsOn, syncProfile, questionById, level2, startsShared, hiddenLine, applyAnswer } from '../engine/profile.js';
import { h, chip, money, pct, shortDate, showValue } from './view.js';
import { addNote, removeNote, setShared, sessionNotes } from '../engine/notes.js';
import { guessesFor, mapOf, worthNow } from './urgency.js';
import { openQuestions, openCounts, sessionOf } from '../engine/questions.js';
import { endCallScreen, fiReveal } from './end-call.js';
import { headlineStrip } from './strip.js';
import { catalog, inlineTicks, tickWords } from './ticks.js';
import { featuresOf, tickFeature } from '../engine/features.js';
import { rememberStep, currentClient } from './clients.js';
import { ledgerHref } from './view.js';
import { isCouple, peopleOf, FILINGS, SPLITS, whoseOf, setWhose, styleOf, splitOf } from '../engine/couple.js';

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
const cell = (cap, box) => h('div', { class: 'field-cell' }, h('label', { class: 'field-cap', for: box.id }, cap), box);
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
function coreTicks(spine, rules, coll, x) {
  if (!catalog) return null;
  // A box the row already has (a card's rate and payment) is not asked again under it (owner, 2026-10-28).
  const onRow = ON_ROW[coll] || [];
  const features = featuresOf(catalog, x, coll).filter((f) => f.tier === 'core').map((f) => ({ ...f, reveals: f.reveals.filter((r) => !onRow.includes(r.field)) })).filter((f) => f.reveals.length);
  if (!features.length) return null;
  const base = coll + '.' + x.id, name = coll === 'income' ? x.label : v(x.name) || x.id;
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
  if (id === 'protection') return (spine.policies || []).length > 0 || ['health', 'disability', 'lifeInsurance'].some((k) => answersOf(spine)[k] !== undefined);
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
  if (id === 'needs') return count((spine.expenses || []).filter((e) => v(e.amount) !== null && !(e.covered && v(e.covered))).length, 'bill', 'bills');
  if (id === 'goals') return count(spine.goals.filter((g) => g.type !== 'fi').length, 'goal', 'goals');
  if (id === 'protection') { const n = ['health', 'disability', 'lifeInsurance'].filter((k) => answersOf(spine)[k] !== undefined).length; return n + ' of 3 answered'; }
  return '';
}
// The Next card (practical run, S-269): the numbers worth filling now, ranked by how much each moves the headline
// numbers (the shared ranking, ui/urgency.js). One big #1, then #2 and #3 smaller; each opens its number.
function nextCard(ctx) {
  const g = guessesFor(ctx.spine, ctx.rules, () => { if (current().spine === ctx.spine) refresh(); });
  // This session's numbers only (owner, 2026-10-28): detail like a Roth's basis waits for the next one.
  const top = (openQuestions(ctx.spine, g) || []).filter((q) => sessionOf(q.path) === 'this').slice(0, 3);
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
      // Needs keeps its count and total in the bar that stays on screen (owner, 2026-10-28), so nobody scrolls up for them.
      id === 'needs' ? h('span', { class: 'step-sum', role: 'status' }, stepSub(ctx.spine, 'needs'), step && step.result && step.result.value !== null ? [', ', h('strong', {}, money(step.result.value)), ' a month'] : null) : null,
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

// A starter line added: its key and a subscription mark from the list. Need or want is not asked in the first session
// (owner, 2026-10-28): that is a later pass, so no tag is written here.
function addLine(spine, item, fat, today) {
  const r = addItem(spine, { collection: 'expenses', label: item.label, fat }, today);
  // The starter line's key (rent, utilities) goes with it, so the Profile knows which line it is whatever its name.
  let s = setAt(r.spine, 'expenses.' + r.id + '.key', item.key);
  if (item.subscription) s = editExpense(s, r.id, { amount: null, subscription: true }, today);
  // With a partner at home (Profile), a housing or food line starts shared, half each.
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
// How a line is paid, its own chips (owner, 2026-10-28): each line gets the answers that fit it. Split means the amount
// is your share; Included in rent and Covered count nothing; Skip hides the line (Show them again brings it back).
const HOW_PAID = {
  rent: [['pay', 'Pay it'], ['split', 'Split']],
  'renters-insurance': [['pay', 'Have it'], ['plan', 'Plan to get'], ['skip', 'Skip']],
  'home-insurance': [['pay', 'Have it'], ['plan', 'Plan to get'], ['skip', 'Skip']],
  utilities: [['pay', 'Pay it'], ['included', 'Included in rent'], ['split', 'Split']],
  internet: [['pay', 'Pay it'], ['split', 'Split'], ['covered', 'Covered']],
  phone: [['pay', 'Pay it'], ['covered', 'Covered by someone']]
};
const howPaidOf = (e) => (!e ? null : e.howPaid && v(e.howPaid) ? v(e.howPaid) : e.covered && v(e.covered) ? (v(e.coveredBy) === 'Included in rent' ? 'included' : 'covered') : null);
function setHowPaid(item, fat, key, how, words) {
  if (how === 'skip') { setNo(key, true); return; }
  const today = todayIso();
  change((spine) => {
    let s = spine, e = findExpense(s, item.label);
    if (!e) { const r = addLine(s, item, fat, today); s = r.spine; e = getAt(s, 'expenses.' + r.id); }
    const amount = v(e.amount), kind = e.amount && e.amount.kind !== 'missing' ? e.amount.kind : 'known';
    const cover = how === 'included' ? 'Included in rent' : how === 'covered' ? (e.coveredBy && v(e.coveredBy) && v(e.coveredBy) !== 'Included in rent' ? v(e.coveredBy) : payersOf(s)[0]) : null;
    s = editExpense(s, e.id, { amount, kind, coveredBy: cover, sharing: { shared: false } }, today);
    // Included in rent or covered with no amount: nothing to ask, so the amount is not-for-me, never a to-do.
    if (cover && amount === null) s = putFact(s, 'expenses.' + e.id + '.amount', null, 'notForMe', today);
    return putFact(s, 'expenses.' + e.id + '.howPaid', how, 'known', today);
  }, said.changed(item.label, words.toLowerCase()));
}
function howPaidChips(spine, item, fat, key, e) {
  const opts = HOW_PAID[item.key];
  if (!opts) return null;
  const now = howPaidOf(e);
  return h('span', { class: 'segmented how-seg', role: 'group', 'aria-label': item.label + ': how it is paid' }, opts.map(([k, w]) => h('button', { type: 'button', id: 'hp-' + key + '-' + k, class: 'seg-btn', 'aria-pressed': String(now === k), onclick: () => { if (now !== k) setHowPaid(item, fat, key, k, w); } }, h('span', { class: 'seg-label' }, w))));
}
// One line: its name, the amount (typing saves it; no Add), its own chips, and the rest behind More (owner, 2026-10-28).
function needRow(spine, item, fat, key, sub = false) {
  const e = findExpense(spine, item.label);
  const no = !e && noList().includes(key);
  if (no) return null;
  const how = howPaidOf(e);
  const by = e && e.covered && v(e.covered) && how !== 'included' ? v(e.coveredBy) : null;
  const counted = how !== 'included' && how !== 'covered';
  const name = h('span', { class: 'srow-name' }, item.label, e && counted ? guessChip(e.amount, 'expenses.' + e.id + '.amount') : null, by ? h('span', { class: 'chip chip-notForMe' }, 'covered by ' + by) : null);
  const amt = counted ? moneyBox('n-' + key, e ? v(e.amount) : null, item.label + (how === 'split' ? ', your share a month' : ', a month'), (x) => setLineAmount(item, fat, x)) : null;
  const chips = howPaidChips(spine, item, fat, key, e);
  const coverWho = how === 'covered' ? cell('Covered by', pickBox('cb-' + key, item.label + ' covered by', payersOf(spine).map((n) => [n, n]), v(e.coveredBy), (n) => change((s) => editExpense(s, e.id, { amount: v(e.amount), kind: e.amount.kind === 'missing' ? 'known' : e.amount.kind, coveredBy: n }, todayIso()), said.changed(item.label + ' covered by', n)))) : null;
  if (!e) return lineRow(sub ? 'sub' : '', name, amt ? cell('A month', amt) : null, chips);
  return lineRow(sub ? 'sub' : '', name, amt ? cell(how === 'split' ? 'Your share' : 'A month', amt) : h('span', { class: 'srow-val muted' }, how === 'included' ? 'In the rent' : 'Not yours to pay'), chips, coverWho,
    more(item.label, cell('Day paid', intBox('nd-' + key, v(e.payDay), item.label + ': day of the month', (d) => setLineDay(e, d), { placeholder: 'e.g. 5' })), ...(chips ? [] : whoPays(spine, e))), delBtn('expenses', e.id, e.label));
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
// The rent and home lines wait for Rent or own? (owner, 2026-10-28): until it is answered they do not show, unless one
// already has an amount.
const applies = (spine, item) => (waitsOn(item.key) === 'home' && !seenAnswers(spine).home ? false : showsKey(seenAnswers(spine), item.key));
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
    whoCard(ctx),
    h('section', { class: 'card qs' },
      // Rent or own is asked first (owner, 2026-10-28), so only rent or only the mortgage lines show. It is the Profile's
      // Where do you live? answer, saved here as it is tapped.
      question('home', 'Rent or own?', [['rent', 'Rent'], ['own', 'Own'], ['family', 'Live with family']], a.home === 'notSure' ? null : a.home || null, (k) => change((s) => applyAnswer(s, 'home', k, { today: todayIso(), by: 'coach' }), said.changed('Rent or own', { rent: 'rent', own: 'own', family: 'lives with family' }[k]))),
      h('p', { class: 'q-said' }, 'Getting around: ', h('strong', {}, said1('getAround')), '. ', h('a', { href: 'profile.html#/around' }, 'Change in Profile'))),
    ...DATA.needs.map((cat) => {
      const catLine = findExpense(spine, cat.label);
      // One number for the whole category, or its lines: never both, so nothing counts twice.
      const catOn = !!catLine && v(catLine.amount) !== null;
      const anyLine = cat.items.some((item) => [item, ...(item.subs || [])].some((x) => { const e = findExpense(spine, x.label); return e && v(e.amount) !== null; }));
      const lines = catOn ? [] : cat.items.filter((item) => applies(spine, item) || ((e) => e && !hiddenLine(spine, e))(findExpense(spine, item.label))).flatMap((item) => [needRow(spine, item, cat.fat, item.key), ...(item.subs || []).map((x) => (findExpense(spine, item.label) && !findExpense(spine, x.label) ? null : needRow(spine, x, cat.fat, x.key, true)))]);
      const others = extra(cat.fat || 'other').filter(() => cat.id === (cat.fat ? cat.id : 'misc'));
      const oneNumber = cat.items.length > 1 && !anyLine ? lineRow('cat-one', h('span', { class: 'srow-name muted' }, catOn ? 'All of it, one number (split it later in My numbers)' : 'Or one number for all of it'), moneyBox('c-' + cat.id, catLine ? v(catLine.amount) : null, cat.label + ', one number a month', (x) => setLineAmount({ key: cat.id, label: cat.label }, cat.fat, x))) : null;
      // Chunked (S-283): each group folds to its name and total, and opens on tap; what is open stays open.
      const total = [cat, ...cat.items.flatMap((item) => [item, ...(item.subs || [])])].reduce((n, x) => { const e = findExpense(spine, x.label); return n + (e && !hiddenLine(spine, e) && !(e.covered && v(e.covered)) ? v(e.amount) || 0 : 0); }, 0) + others.reduce((n, e) => n + (v(e.amount) || 0), 0);
      const isOpen = openCats.has(cat.id) || (!openCats.size && cat === DATA.needs[0]);
      const d = h('details', { class: 'card done-group need-group', open: isOpen || null, 'aria-labelledby': 'cat-' + cat.id },
        h('summary', {}, h('h2', { id: 'cat-' + cat.id, class: 'group-h' }, CAT_TITLE[cat.label] || cat.label), h('span', { class: 'go-total' }, total ? money(total) + ' a month' : 'Nothing yet')),
        // A line named like the category with lines of its own beside it (round 2: the demo's Miscellaneous $300 was in
        // the total and on no row): it shows as its own row, so the lines add up to the total.
        h('ul', { class: 'srows' }, ...lines, ...others.map((e) => needRow(spine, { label: e.label }, e.fat, 'x-' + e.id)), catOn && anyLine ? needRow(spine, { label: cat.label }, cat.fat, 'rest-' + cat.id) : null, oneNumber));
      // Kept on the tap itself, not on toggle: a redraw that lands between the tap and its toggle event (a number just
      // typed) would otherwise close the group again. Housing, open by default, stays open when another opens.
      d.querySelector('summary').addEventListener('click', () => { if (!openCats.size) openCats.add(DATA.needs[0].id); if (d.open) openCats.delete(cat.id); else openCats.add(cat.id); });
      d.addEventListener('toggle', () => { if (!d.isConnected) return; if (d.open) openCats.add(cat.id); else openCats.delete(cat.id); });
      return d;
    }),
    hidden.length ? h('p', { class: 'muted' }, hidden.length + ' marked No. ', h('button', { type: 'button', class: 'btn small', onclick: () => { for (const k of hidden) setNo(k, false); } }, 'Show them again')) : null
  ]);
}

// ---------------------------------------------------------------- the two of you (Batch 7, S-277)
// Single or a couple is asked when the client is created (ui/page.js); a couple adds the partner. Then every debt,
// account and income has a Whose box (names, and Joint but for income), and a new one starts as whoever was picked
// last, else as the money style says, else the first person. Shared bills split half each unless set otherwise, for
// the household and on a line; the split only divides each person's own numbers, never the household's.
let lastWhose = null;
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
  // Single or a couple is asked once, when the client is created (owner, 2026-10-28); a partner added later comes in
  // through the Profile (Who lives with you: A partner).
  return null;
}

// ---------------------------------------------------------------- Debt
const DEBT_ADD = [['credit_card', 'Credit card'], ['student_loan', 'Student loan'], ['auto_loan', 'Car loan'], ['mortgage', 'Mortgage'], ['personal_loan', 'Personal loan'], ['medical', 'Medical bill'], ['family_iou', 'Money owed to a person']];
const DEBT_QS = [['credit_card', 'Any credit cards?', 'Credit card'], ['student_loan', 'Student loans?', 'Student loan'], ['auto_loan', 'A car loan?', 'Car loan'], ['mortgage', 'A mortgage?', 'Mortgage'], ['family_iou', 'Owe money to a person?', 'Money owed to a person']];
const putF = (path, value, words, kind = 'known') => change((s) => (value === null ? putFact(s, path, null, 'missing', todayIso()) : putFact(s, path, value, kind, todayIso())), words);
// New debt rows of a kind, as one change. A car loan takes over a "Car payment" line in Needs, so the payment counts once.
function withDebtRows(spine, type, label, n, today) {
  let s = spine;
  for (let i = 0; i < n; i++) {
    const r = addItem(s, { collection: 'debts', type, label }, today);
    s = withWhose(r.spine, 'debts', r.id);
    const pay = type === 'auto_loan' ? findExpense(s, 'Car payment') : null;
    if (pay && !pay.paysDebt && !(s.expenses || []).some((e) => e.paysDebt && v(e.paysDebt) === r.id)) s = putFact(s, 'expenses.' + pay.id + '.paysDebt', r.id, 'known', today);
  }
  return s;
}
// Quick mode (owner, 2026-10-28): a kind of debt is Yes or No, then how many, the total balance and a rough rate, with
// the names optional. The count makes that many rows at once (10 makes 10, no page jump); the total is spread evenly
// as a guess until each one's balance is typed under the caret; the rate goes on every one. Each debt's own balance,
// payment and due day, and a student loan's federal and forgiveness questions, wait behind the caret.
const ofType = (spine, type) => (spine.debts || []).filter((d) => d.type === type);
function setDebtCount(type, label, n) {
  const today = todayIso();
  change((spine) => {
    const have = ofType(spine, type);
    if (n > have.length) return withDebtRows(spine, type, label, n - have.length, today);
    let s = spine;
    for (const d of have.slice(n)) s = removeItem(s, 'debts', d.id);
    return s;
  }, said.changed(label + 's', String(n)));
}
function spreadTotal(type, label, total) {
  const today = todayIso();
  change((spine) => {
    const rows = ofType(spine, type);
    if (!rows.length) return spine;
    const n = rows.length, each = total === null ? null : Math.floor((total * 100) / n) / 100;
    return rows.reduce((s, d, i) => (each === null ? putFact(s, 'debts.' + d.id + '.balance', null, 'missing', today)
      : putFact(s, 'debts.' + d.id + '.balance', i === 0 ? Math.round((total - each * (n - 1)) * 100) / 100 : each, n === 1 ? 'known' : 'rough', today)), spine);
  }, said.changed(label + 's owed', total === null ? 'blank' : money(total) + ' in all'));
}
function setTypeRate(type, label, rate) {
  const today = todayIso();
  change((spine) => ofType(spine, type).reduce((s, d) => putFact(s, 'debts.' + d.id + '.apr', rate, rate === null ? 'missing' : 'known', today), spine), said.changed(label + ' rate', rate === null ? 'blank' : pct(rate, 2)));
}
function setTypeNames(type, label, text) {
  const today = todayIso(), names = String(text || '').split(',').map((x) => x.trim()).filter(Boolean);
  change((spine) => ofType(spine, type).reduce((s, d, i) => putFact(s, 'debts.' + d.id + '.name', names[i] || (ofType(spine, type).length > 1 ? label + ' ' + (i + 1) : label), 'known', today), spine), said.changed(label + ' names', names.join(', ') || 'blank'));
}
const openDetail = new Set();
function eachDebtRow(spine, rules, d) {
  const name = v(d.name) || d.id, p = 'debts.' + d.id;
  return lineRow('debt', h('span', { class: 'srow-name' }, name, guessChip(d.balance, 'debts.' + d.id + '.balance')),
    whoseBox(spine, 'debts', d, name),
    cell('Owed', moneyBox('d-bal-' + d.id, v(d.balance), name + ': balance', (x) => putF(p + '.balance', x, said.changed(name + ' balance', x === null ? 'blank' : money(x))), 'e.g. 4,200')),
    cell('Rate (%)', rateBox('d-apr-' + d.id, v(d.apr), name + ': interest rate', (x) => putF(p + '.apr', x, said.changed(name + ' rate', x === null ? 'blank' : pct(x, 2))))),
    cell('Payment a month', moneyBox('d-min-' + d.id, v(d.minimum), name + ': monthly payment', (x) => putF(p + '.minimum', x, said.changed(name + ' payment', x === null ? 'blank' : money(x))), 'e.g. 120')),
    cell('Due day', intBox('d-day-' + d.id, v(d.dueDay), name + ': due day', (x) => putF(p + '.dueDay', x, said.changed(name + ' due day', x === null ? 'blank' : 'the ' + x + suffix(x))), { placeholder: 'e.g. 15' })),
    // A card: paid in full every month, or carried? It decides whether the balance costs interest.
    d.type === 'credit_card' ? cell('Paid in full each month?', pickBox('d-pay-' + d.id, name + ': paid in full each month?', [['', 'Not set yet'], ['statement', 'Yes, in full'], ['minimum', 'No, I carry a balance']], v(d.payPolicy) || '', (k) => putF(p + '.payPolicy', k || null, said.changed(name, k === 'statement' ? 'paid in full each month' : k === 'minimum' ? 'carries a balance' : 'blank')))) : null,
    delBtn('debts', d.id, name),
    coreTicks(spine, rules, 'debts', d));
}
function debtGroup(spine, rules, type, q, label) {
  const rows = ofType(spine, type);
  const head = h('p', { class: 'q-label' }, q);
  if (!rows.length) {
    const no = noList().includes('debt-' + type);
    return h('div', { class: 'q q-inline debt-q' }, head, no ? h('span', { class: 'q-have' }, 'No', ' ', h('button', { type: 'button', class: 'btn small', onclick: () => setNo('debt-' + type, false) }, 'Change'))
      : h('span', { class: 'tick' }, h('button', { type: 'button', class: 'btn small', id: 'dq-' + type, onclick: () => { change((sp) => withDebtRows(sp, type, label, 1, todayIso()), said.added(label)); later(() => document.getElementById('dc-' + type)?.focus()); } }, 'Yes'), h('button', { type: 'button', class: 'btn small', id: 'dqn-' + type, onclick: () => setNo('debt-' + type, true) }, 'No')));
  }
  const bal = rows.map((d) => v(d.balance)), aprs = [...new Set(rows.map((d) => v(d.apr)))];
  const total = bal.every((x) => x === null) ? null : Math.round(bal.reduce((n, x) => n + (x || 0), 0) * 100) / 100;
  const names = rows.map((d) => v(d.name) || '').filter((x) => x && !new RegExp('^' + label + '( \\d+)?$').test(x)).join(', ');
  const nameBox = h('input', { id: 'dn-' + type, class: 'text-box names-box', type: 'text', autocomplete: 'off', placeholder: type === 'credit_card' ? 'e.g. Chase, Amex' : 'e.g. Navient', 'aria-label': label + ' names, in order, with commas' });
  nameBox.value = names;
  nameBox.addEventListener('change', () => { const t = nameBox.value; later(() => setTypeNames(type, label, t)); });
  const det = h('details', { class: 'row-more debt-each', open: openDetail.has(type) || null },
    h('summary', { id: 'de-' + type }, 'Each ' + label.toLowerCase() + ': balance, payment, due day'),
    h('ul', { class: 'srows' }, rows.map((d) => eachDebtRow(spine, rules, d))));
  det.addEventListener('toggle', () => { if (!det.isConnected) return; if (det.open) openDetail.add(type); else openDetail.delete(type); });
  return h('div', { class: 'q debt-q' }, head,
    h('div', { class: 'srow debt-quick' },
      cell('How many', intBox('dc-' + type, rows.length, label + ': how many', (n) => { if (n !== null && n !== rows.length) setDebtCount(type, label, n); }, { placeholder: 'e.g. 3', min: 1, max: 40 })),
      cell(rows.length > 1 ? 'Total owed' : 'Owed', moneyBox('dt-' + type, total, label + ': total owed', (x) => spreadTotal(type, label, x), 'e.g. 20,000')),
      cell('Rough rate (%)', rateBox('dr-' + type, aprs.length === 1 ? aprs[0] : null, label + ': rough interest rate', (x) => setTypeRate(type, label, x))),
      cell('Names (optional)', nameBox)),
    rows.length > 1 && rows.some((d) => d.balance && d.balance.kind === 'rough') ? h('p', { class: 'edit-hint' }, 'The total is spread evenly as a guess. Type each one under the caret when you know it.') : null,
    det);
}
const OTHER_DEBT = [['personal_loan', 'Personal loan'], ['medical', 'Medical bill'], ['bnpl', 'Buy now, pay later'], ['heloc', 'Home equity line'], ['tax_debt', 'Taxes owed']];
function debt(ctx) {
  const spine = ctx.spine;
  const others = [...new Set((spine.debts || []).map((d) => d.type))].filter((t) => !DEBT_QS.some(([q]) => q === t));
  const otherOpts = [['', 'Pick a type'], ...DEBT_ADD.filter(([t]) => !DEBT_QS.some(([q]) => q === t)).concat(OTHER_DEBT.filter(([t]) => PRESETS[t] && !DEBT_ADD.some(([x]) => x === t)))];
  return frame(ctx, 'debt', () => [
    h('section', { class: 'card qs' }, ...DEBT_QS.map(([type, q, label]) => debtGroup(spine, ctx.rules, type, q, label)),
      ...others.map((t) => debtGroup(spine, ctx.rules, t, (otherOpts.find(([k]) => k === t) || [t, PRESETS[t] ? PRESETS[t].label : t])[1], (otherOpts.find(([k]) => k === t) || [t, PRESETS[t] ? PRESETS[t].label : t])[1])),
      // Other debt (owner, 2026-10-28): the type is picked inside; picking it adds one, with the same quick boxes.
      h('div', { class: 'q q-inline debt-q' }, h('label', { class: 'q-label', for: 'd-other' }, 'Other debt?'),
        pickBox('d-other', 'Other debt: which type', otherOpts, '', (t) => { if (!t) return; const w = (otherOpts.find(([k]) => k === t) || [t, t])[1]; change((sp) => withDebtRows(sp, t, w, 1, todayIso()), said.added(w)); }))),
    h('p', { class: 'edit-hint' }, 'How many, the total and a rough rate are enough for today. Blank is fine.')
  ]);
}

// ---------------------------------------------------------------- Income (and the two tax questions)
// Money coming in (owner, 2026-10-28): a tap on its kind puts the row in place, and every box saves as it is typed; there
// is no Add step. Unemployment comes in weekly with no name to type; its weeks left set the last payment.
const INCOME_KINDS = [['w2', 'A job (W-2)', 'Job', 'biweekly'], ['1099', 'Self-employed', 'Self-employed work', 'monthly'], ['unemployment', 'Unemployment', 'Unemployment', 'weekly'], ['person', 'Money from a person', 'Money from a person', 'monthly'], ['side', 'Something else', 'Other income', 'monthly']];
function incomeAdd(spine, today) {
  const add = ([type, , label, cadence]) => {
    change((sp) => {
      const r = addItem(sp, { collection: 'income', type, label: (sp.income || []).some((x) => x.label === label) ? label + ' ' + ((sp.income || []).filter((x) => x.type === type).length + 1) : label, cadence }, today);
      later(() => document.getElementById('i-amt-' + r.id)?.focus());
      return withWhose(r.spine, 'income', r.id);
    }, said.added(label));
  };
  return h('div', { class: 'q q-inline' }, h('p', { class: 'q-label' }, (spine.income || []).length ? 'More money coming in?' : 'What money comes in?'),
    h('span', { class: 'tick kinds-wrap' }, INCOME_KINDS.map((k) => h('button', { type: 'button', class: 'btn small', id: 'i-new-' + k[0], onclick: () => add(k) }, k[1]))));
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
    intBox('i-wk-' + x.id, weeksLeft, name + ': weeks left', (n) => setIncome(x, { end: n === null ? null : addDays(asOf, n * 7) }, said.changed(name + ' weeks left', n === null ? 'blank' : String(n))), { placeholder: 'weeks', min: 0, max: 99 }),
    x.end ? h('span', { class: 'edit-hint' }, 'Last payment about ' + shortDate(x.end) + '.') : null)];
}
const PER_YEAR_OK = (c) => ['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(c);
function incomeRows(spine, rules) {
  return (spine.income || []).filter((x) => x.type !== 'maybeMoney').map((x) => {
    const asked = (x.type === 'w2' && v(x.payBasis)) || (isSelfEmployment(x) && v(x.payBasis) === 'lumpy');
    const amountBox = asked ? null : [
      cell('Before tax', moneyBox('i-amt-' + x.id, v(x.amount), x.label + ': how much, before tax', (a) => setIncome(x, { amount: a }, said.changed(x.label, a === null ? 'blank' : money(a))), 'e.g. 2,600')),
      cell('How often', pickBox('i-often-' + x.id, x.label + ': how often', OFTEN.some(([k]) => k === x.cadence) ? OFTEN : [[x.cadence, x.cadence], ...OFTEN], x.cadence, (c) => setIncome(x, { cadence: c }, said.changed(x.label + ' how often', OFTEN.find(([k]) => k === c)[1]))))];
    // A name only where it tells two apart (owner, 2026-10-28): unemployment has none to type.
    const nameBox = x.type === 'unemployment' ? null : (() => { const b = h('input', { id: 'i-name-' + x.id, class: 'text-box', type: 'text', autocomplete: 'off', placeholder: x.type === 'person' ? 'e.g. Parents' : 'e.g. Acme Co', 'aria-label': x.label + ': name' }); b.value = x.label; b.addEventListener('change', () => { const t = b.value.trim(); if (t && t !== x.label) later(() => change((s) => ({ ...s, income: s.income.map((i) => (i.id === x.id ? { ...i, label: t } : i)) }), said.changed('Income name', t))); }); return cell('Name', b); })();
    return lineRow('income' + (x.type === 'w2' || isSelfEmployment(x) || x.type === 'unemployment' ? ' asks' : ''), h('span', { class: 'srow-name' }, x.label, guessChip(x.amount, 'income.' + x.id + '.amount')),
      nameBox,
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
// The place: a ZIP code (or a city from the list) fills the state, the county and whether New York City or Yonkers tax
// applies (S-284; the county from the ZIP, owner 2026-10-28). Under it, in words, what it filled.
function placeWords(hh) {
  const st = v(hh.state), county = v(hh.county), zip = v(hh.zip);
  if (!st) return 'Not given yet. Fills the state and county.';
  const city = v(hh.nycResident) === true ? 'New York City' : v(hh.yonkersResident) === true ? 'Yonkers' : null;
  return [zip ? 'ZIP ' + zip : null, city || (county ? county + ' County' : null), st].filter(Boolean).join(', ') + (st === 'NY' ? (city ? ': ' + city + ' income tax applies.' : ': no city income tax.') : '.');
}
function placeBox(hh, today) {
  const box = h('input', { id: 't-place', type: 'text', inputmode: 'numeric', placeholder: 'e.g. 10977', 'aria-describedby': 't-place-hint' });
  box.value = v(hh.zip) || '';
  const apply = (pl) => {
    if (!pl) { say('Not a ZIP code I know: type the 5 digits'); return; }
    change((s) => placeFacts(pl).reduce((x, [path, val]) => putFact(x, path, val, 'known', today), s), said.changed('Where you live', pl.words));
  };
  const wrap = attachPicker(box, { source: 'place', entries: placeLibEntries, onPick: (e) => apply(LIB.places ? placeOf(e.words, LIB.places) : null), onFree: (t) => apply(LIB.places ? placeOf(t, LIB.places) : null) });
  return h('div', { class: 'place-pick' }, wrap, h('p', { class: 'edit-hint', id: 't-place-hint' }, placeWords(hh)));
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
        // Filing status as chips (owner, 2026-10-28): one tap, not a list to pick from.
        h('li', { class: 'srow' }, question('filing', 'Filing status', FILING_STATUSES.map((f) => [f, FILING_WORDS[f]]), v(hh.filingStatus) || null, (f) => putF('household.filingStatus', f, said.changed('Filing status', FILING_WORDS[f])))),
        // ZIP (S-284, county owner 2026-10-28): the state, the county and New York City or Yonkers tax, in one change.
        lineRow('', h('label', { class: 'srow-name', for: 't-place' }, 'ZIP code'), placeBox(hh, today)),
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
  const addAcct = (type, label) => change((s) => { const r = addItem(s, { collection: 'accounts', type, label }, today); later(() => document.getElementById('a-bal-' + r.id)?.focus()); return withWhose(r.spine, 'accounts', r.id); }, said.added(label));
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
          // Where it is held, optional, behind the caret (owner, 2026-10-28).
          more(name + ' institution', cell('Institution (optional)', (() => { const b = h('input', { id: 'a-inst-' + a.id, class: 'text-box', type: 'text', autocomplete: 'off', placeholder: 'e.g. Fidelity', 'aria-label': name + ': institution' }); b.value = v(a.institution) || ''; b.addEventListener('change', () => { const t = b.value.trim(); later(() => putF(p + '.institution', t || null, said.changed(name + ' institution', t || 'blank'))); }); return b; })())),
          a.family === 'taxable' ? holdings(a) : null,
          // A plan at work: the match tier by tier, vesting and the rest of its screen-one questions (S-270).
          coreTicks(spine, ctx.rules, 'accounts', a));
      })) : h('p', { class: 'muted' }, 'Nothing yet.'),
      h('p', { class: 'edit-hint' }, 'Liquid: money you can reach without a penalty or selling something you live with. Tap to change it.')),
    // One tap puts the account in place, its balance box ready (owner, 2026-10-28: no Add step).
    h('section', { class: 'card' }, h('p', { class: 'edit-label' }, 'Other accounts'),
      h('div', { class: 'edit-actions' }, [...ASSET_ADD.slice(0, 5), ...IRA_TYPES.slice(0, 2).map(([t]) => [t, PRESETS[t].label]), ...ASSET_ADD.slice(5)].map(([type, label]) => h('button', { type: 'button', class: 'btn small', id: 'a-new-' + type, onclick: () => addAcct(type, label) }, label))))
  ]);
}

// ---------------------------------------------------------------- Goals (and the assumptions)
// Goals save as they are typed (owner, 2026-10-28): the new goal's name box suggests as you type, and leaving it puts
// the goal in place; its amount, what is saved so far and the date are boxes on its row. No Add step.
const goalTypeOf = (words) => (/pay ?off|debt/i.test(words) ? 'payoff' : 'savings');
function newGoalBox(spine) {
  const box = h('input', { id: 'g-new', type: 'text', autocomplete: 'off', placeholder: 'e.g. Emergency fund or Start a business', 'aria-describedby': 'g-new-hint' });
  const make = (words) => { const t = String(words || '').trim(); if (!t) return; box.value = ''; change((sp) => { const r = addItem(sp, { collection: 'goals', type: goalTypeOf(t), label: t }, todayIso()); later(() => document.getElementById('g-t-' + r.id)?.focus()); return r.spine; }, said.added('Goal ' + t)); };
  const wrap = attachPicker(box, { source: 'goals', entries: () => goalEntries(spine), onPick: (e) => make(e.words), onFree: (t) => make(t) });
  // Leaving the box keeps what was typed, as every other box does (Tab, or a tap elsewhere).
  box.addEventListener('change', () => { const t = box.value; later(() => make(t)); });
  return lineRow('goal-new', h('label', { class: 'srow-name', for: 'g-new' }, (spine.goals || []).some((g) => g.type !== 'fi') ? 'Another goal' : 'A goal'), h('div', { class: 'goal-new' }, wrap, h('p', { class: 'edit-hint', id: 'g-new-hint' }, 'Suggests as you type. Enter or Tab keeps it.')));
}
// Your own long-run numbers (owner, 2026-10-28): the return typed, the withdrawal rate a chip (3, 4, 4.7 or 5.2%) or typed.
// Changing either uses Your own.
function ownAssumptions(spine, today) {
  const A = spine.assumptions || {}, wr = v(A.withdrawalRate), ret = v(A.realReturn);
  const set = (path, x, words) => { pick('best'); change((sp) => putFact(sp, path, x, x === null ? 'missing' : 'known', today), words); };
  const chips = (DATA.withdrawalChips || [0.03, 0.04, 0.047, 0.052]);
  return h('section', { class: 'card', 'aria-labelledby': 'own-h' },
    h('h2', { id: 'own-h' }, 'Your own numbers'),
    h('ul', { class: 'srows' },
      lineRow('', h('label', { class: 'srow-name', for: 'own-ret' }, 'Real return, after inflation'), rateBox('own-ret', ret, 'Real return a year, after inflation', (x) => set('assumptions.realReturn', x, said.changed('Real return', x === null ? 'blank' : pct(x, 1))))),
      lineRow('', h('span', { class: 'srow-name', id: 'own-wr-l' }, 'Withdrawal rate'),
        h('span', { class: 'segmented how-seg', role: 'group', 'aria-labelledby': 'own-wr-l' }, chips.map((r) => h('button', { type: 'button', class: 'seg-btn', id: 'own-wr-' + String(r).replace('.', '_'), 'aria-pressed': String(wr === r), onclick: () => set('assumptions.withdrawalRate', r, said.changed('Withdrawal rate', pct(r, 1))) }, h('span', { class: 'seg-label' }, pct(r, 1))))),
        cell('Or type it', rateBox('own-wr', chips.includes(wr) ? null : wr, 'Withdrawal rate, your own', (x) => set('assumptions.withdrawalRate', x, said.changed('Withdrawal rate', x === null ? 'blank' : pct(x, 1))))))));
}
function goals(ctx) {
  const spine = ctx.spine, rules = ctx.rules, today = todayIso();
  return frame(ctx, 'goals', () => {
    const s = summarize(withScenario(spine, rules, pickedScenario()), rules, { flags: false });
    const fi = s.fi, em = s.emergency, cards = s.sheet.cards;
    const yearly = fi.yearlySpending;
    const list = (spine.goals || []).filter((g) => g.type !== 'fi');
    const order = v(spine.household.goalOrder) || 'oneAtATime';
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
            cell('Amount', moneyBox('g-t-' + g.id, v(g.target), g.label + ': amount', (x) => putF('goals.' + g.id + '.target', x, said.changed('Goal ' + g.label, x === null ? 'blank' : money(x))), 'e.g. 30,000')),
            g.linkedAccount ? null : cell('Saved so far', moneyBox('g-s-' + g.id, v(g.saved), g.label + ': saved so far', (x) => putF('goals.' + g.id + '.saved', x, said.changed('Goal ' + g.label + ' saved so far', x === null ? 'blank' : money(x))), 'e.g. 2,000')),
            cell('By when', (() => { const d = h('input', { id: 'g-by-' + g.id, type: 'date', 'aria-label': g.label + ': by when' }); d.value = g.by || ''; d.addEventListener('change', () => change((sp) => setAt(sp, 'goals.' + g.id + '.by', d.value || null), said.changed('Goal ' + g.label + ' by', d.value || 'no date'))); return d; })()),
            delBtn('goals', g.id, 'Goal ' + g.label))),
          newGoalBox(spine)),
        h('p', { class: 'edit-label' }, 'Fund goals'),
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Fund goals' }, [['oneAtATime', 'One at a time'], ['byDeadline', 'By deadline']].map(([k, w]) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(order === k), onclick: () => { if (order !== k) putF('household.goalOrder', k, said.changed('Goals', w.toLowerCase())); } }, h('span', { class: 'seg-label' }, w))))),
      scenarioBar(spine, rules, pickedScenario(), () => refresh()),
      ownAssumptions(spine, today)
    ];
  });
}

// ---------------------------------------------------------------- Protection
// The first session asks one question per kind of cover (owner, 2026-10-28): covered by parents, an employer, their own
// policy, none, or need to look. The answers are the Profile's (health, disability, life insurance), so its steps and
// gaps read them. The premium, deductible, out-of-pocket maximum and the rest wait behind each one's caret.
const LOOK = ['notSure', 'Need to look'];
const COVERS = [
  ['health', 'Health insurance', [['parent', 'Covered by parents'], ['work', 'Employer'], ['own', 'Own policy'], ['none', 'None'], LOOK]],
  ['disability', 'Disability insurance', [['work', 'Employer'], ['own', 'Own policy'], ['none', 'None'], LOOK]],
  ['lifeInsurance', 'Life insurance', [['work', 'Employer'], ['own', 'Own policy'], ['none', 'None'], LOOK]]
];
const POLICY_OF = { disability: { work: 'ltd', own: 'ltd', all: ['ltd', 'std'] }, lifeInsurance: { work: 'group_life', own: 'term_life', all: ['term_life', 'whole_life', 'group_life'] } };
// A policy's box: the first policy of that cover, made when its first number is typed.
function policyBox(spine, id, ans, field, label, kind) {
  const pol = (spine.policies || []).find((p) => POLICY_OF[id].all.includes(p.type));
  const set = (x) => change((sp) => {
    let s = sp, p = pol;
    if (!p) { if (x === null) return sp; const type = POLICY_OF[id][ans === 'work' ? 'work' : 'own']; const r = addItem(s, { collection: 'policies', type, label: PRESETS_POLICY(type) }, todayIso()); s = r.spine; p = getAt(s, 'policies.' + r.id); if (ans === 'work') s = putFact(s, 'policies.' + p.id + '.throughWork', true, 'known', todayIso()); }
    return putFact(s, 'policies.' + p.id + '.' + field, x, x === null ? 'missing' : 'known', todayIso());
  }, said.changed(label, x === null ? 'blank' : money(x)));
  return cell(label, kind === 'money' ? moneyBox('pr-' + id + '-' + field, pol ? v(pol[field]) : null, label, set, field === 'premium' ? 'e.g. 30' : 'e.g. 50,000') : null);
}
function protection(ctx) {
  const spine = ctx.spine, a = answersOf(spine), today = todayIso(), hh = spine.household;
  const hp = findExpense(spine, 'Health insurance premium');
  const details = {
    health: () => [
      cell('Premium a month', moneyBox('pr-health-premium', hp ? v(hp.amount) : null, 'Health insurance premium a month', (x) => setLineAmount({ key: 'health-premium', label: 'Health insurance premium' }, null, x), 'e.g. 250')),
      cell('Deductible', moneyBox('pr-health-ded', v(hh.deductible), 'Health plan deductible', (x) => putF('household.deductible', x, said.changed('Deductible', x === null ? 'blank' : money(x))), 'e.g. 1,500')),
      cell('Out-of-pocket max', moneyBox('pr-health-oop', v(hh.healthOopMax), 'Health plan out-of-pocket maximum', (x) => putF('household.healthOopMax', x, said.changed('Out-of-pocket maximum', x === null ? 'blank' : money(x))), 'e.g. 5,000'))],
    disability: (ans) => [policyBox(spine, 'disability', ans, 'premium', 'Premium a month', 'money'), policyBox(spine, 'disability', ans, 'coverage', 'Pays a month', 'money')],
    lifeInsurance: (ans) => [policyBox(spine, 'lifeInsurance', ans, 'premium', 'Premium a month', 'money'), policyBox(spine, 'lifeInsurance', ans, 'coverage', 'Coverage', 'money')]
  };
  return frame(ctx, 'protection', () => [
    h('section', { class: 'card qs' }, COVERS.map(([id, label, opts]) => {
      const now = a[id] === undefined ? null : a[id];
      const d = h('details', { class: 'row-more', open: openMore.has('cover-' + id) || null }, h('summary', { id: 'cover-more-' + id }, 'Premium, deductible and the rest'), h('div', { class: 'srow' }, ...details[id](now)));
      d.addEventListener('toggle', () => { if (!d.isConnected) return; if (d.open) openMore.add('cover-' + id); else openMore.delete('cover-' + id); });
      return h('div', { class: 'cover-q' }, question('cv-' + id, label, opts, now, (k) => change((s) => applyAnswer(s, id, k, { today, by: 'coach' }), said.changed(label, (opts.find(([x]) => x === k) || [k, k])[1].toLowerCase()))), d);
    })),
    h('p', { class: 'edit-hint' }, 'Renters or home insurance is a line in Needs. ', h('a', { href: 'ledger.html#/protection' }, 'Every policy in My numbers'), '.')
  ]);
}
const PRESETS_POLICY = (t) => ({ ltd: 'Disability insurance', std: 'Disability insurance', group_life: 'Life insurance through work', term_life: 'Life insurance' }[t] || 'Policy');

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
const SCREENS = { debt, assets, income: incomeStep, needs, goals, protection };
// One step of Guide me: its screen-one boxes inside the step frame. protection(): Numbers' own Protection screen.
export function guideStep(ctx, id) {
  const r = guessesFor(ctx.spine, ctx.rules, () => { if (current().spine === ctx.spine) refresh(); });
  if (r) { marks = mapOf(r, ctx.spine); marksFresh = true; } else marksFresh = false;
  rememberStep(id);
  const body = SCREENS[id](ctx);
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

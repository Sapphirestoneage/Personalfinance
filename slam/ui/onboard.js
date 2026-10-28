// Onboarding (owner's ask, 2026-10-28): the first pass over a whole client, run by the coach on the call. Screens of
// My numbers (ledger.html#/onboard, then #/onboard/income and so on) with a slim step bar across the top: Profile,
// Income, Debt, Assets, Needs, Goals, Finish; any step can be tapped, Back and Next are on every step, and Enter
// moves on (to the next box, then to the next step). The Income, Debt, Assets and Needs steps are the same
// count-first rows the section screens show (ui/items.js), lent by the page (H), so the second pass happens on the
// same rows later. Formatting only: engine/onboard.js saves the Profile, solves a paycheck and reads the finish
// numbers from the one summary every page uses.

import { h, chip, money, said, monthWords } from './view.js';
import { change, go } from './shell.js';
import { textBox, intBox, pickBox, later } from './boxes.js';
import { answerField } from './answers.js';
import { questionEl } from './profile-q.js';
import { STEPS, stepAfter, stepBefore, markComplete, profileOf, applyProfile, WORK, HOMES, FILING, finishNumbers, openItems } from '../engine/onboard.js';
import { STATES, answersOf, applyAnswer, questionById } from '../engine/profile.js';
import { addItem, removeItem } from '../engine/edits.js';
import { putFact } from '../engine/edits.js';
import { valueOf as v, setAt, getAt } from '../engine/spine.js';
import { rowPathFor } from '../engine/ledger.js';
import { isLaterPath } from './later.js';

const wordsOf = (id) => (STEPS.find(([k]) => k === id) || [])[1] || null;
export const stepName = (levels) => (levels.length === 1 ? 'Onboarding' : levels.length === 2 ? wordsOf(levels[1]) : null);
export const levelsOf = (step) => (step === 'profile' ? ['onboard'] : ['onboard', step]);
const hrefOf = (step) => '#/' + levelsOf(step).join('/');

// Leaving a step: the Profile saves its answers (the suggested ones too) as one change, then the next step opens.
function commitProfile(H) { const t = H.today(); change((s) => applyProfile(s, profileOf(s, t), t), 'Profile saved'); }
function leave(from, to, H) { if (from === 'profile') commitProfile(H); go(levelsOf(to)); }

function stepBar(step, H) {
  return h('nav', { class: 'steps', 'aria-label': 'Onboarding steps' }, h('ol', {}, STEPS.map(([id, w], i) => h('li', {},
    h('a', { class: 'step-link', href: hrefOf(id), 'aria-current': id === step ? 'step' : null, onclick: (e) => { e.preventDefault(); if (id !== step) leave(step, id, H); } },
      h('span', { class: 'step-n', 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'step-w' }, w))))));
}
function nav(step, H) {
  const prev = stepBefore(step), next = stepAfter(step);
  return h('div', { class: 'step-nav' },
    h('button', { type: 'button', class: 'btn', onclick: () => (prev ? leave(step, prev, H) : location.assign('dashboard.html')) }, '‹ ' + (prev ? 'Back' : 'Back to Home')),
    next ? h('button', { type: 'button', class: 'btn primary', id: 'onb-next', onclick: () => leave(step, next, H) }, 'Next: ' + wordsOf(next) + ' ›') : null);
}
const cell = (label, control) => h('div', { class: 'cell' }, h('label', { class: 'mini-label', for: control.id }, label), control);
const segQ = (id, label, options, value, onPick) => h('div', { class: 'q', role: 'group', 'aria-labelledby': 'q-' + id },
  h('p', { class: 'q-label', id: 'q-' + id }, label),
  h('div', { class: 'segmented q-seg' }, options.map(([k, w]) => h('button', { type: 'button', id: 'ob-' + id + '-' + k, class: 'seg-btn', 'aria-pressed': String(value === k), onclick: () => { if (value !== k) onPick(k); } }, h('span', { class: 'seg-label' }, w)))));
const pick = (options, k) => (options.find(([x]) => x === k) || [k, k])[1];

// ---------------------------------------------------------------- Profile
function profile(ctx, H) {
  const t = H.today(), p = profileOf(ctx.spine, t);
  const save = (patch, words) => change((s) => applyProfile(s, patch, t), words);
  return [
    h('p', { class: 'lede' }, 'A quick first pass over the whole picture, about 20 minutes. The suggested answer is already picked; Next keeps it.'),
    h('section', { class: 'card qs' },
      segQ('who', 'Who is in the household?', [['single', 'Just me'], ['couple', 'A couple']], p.couple ? 'couple' : 'single', (k) => save({ couple: k === 'couple' }, said.changed('Household', k === 'couple' ? 'a couple' : 'one person'))),
      h('div', { class: 'onb-grid' },
        cell('Your first name', textBox('ob-name-0', p.names[0], 'Your first name', (x) => save({ names: [x || '', p.names[1]] }, said.changed('Name', x || 'blank')), 'First name')),
        cell('Your age', intBox('ob-age-0', p.ages[0], 'Your age', (x) => save({ ages: [x, p.ages[1]] }, said.changed('Age', x === null ? 'blank' : String(x))), { placeholder: 'age', min: 0, max: 120 })),
        p.couple ? cell('Partner\'s first name', textBox('ob-name-1', p.names[1], 'Partner\'s first name', (x) => save({ names: [p.names[0], x || ''] }, said.changed('Partner\'s name', x || 'blank')), 'First name')) : null,
        p.couple ? cell('Partner\'s age', intBox('ob-age-1', p.ages[1], 'Partner\'s age', (x) => save({ ages: [p.ages[0], x] }, said.changed('Partner\'s age', x === null ? 'blank' : String(x))), { placeholder: 'age', min: 0, max: 120 })) : null,
        cell('State', pickBox('ob-state', 'State', STATES.map((x) => [x, x]), p.state, (x) => save({ state: x }, said.changed('State', x))))),
      segQ('home', 'Home', HOMES, p.home, (k) => save({ home: k }, said.changed('Home', pick(HOMES, k).toLowerCase()))),
      segQ('work', 'Work', WORK.map(([k, w]) => [k, w]), p.work, (k) => save({ work: k }, said.changed('Work', pick(WORK, k).toLowerCase()))),
      segQ('filing', 'Tax filing status', FILING, p.filing, (k) => save({ filing: k }, said.changed('Filing status', pick(FILING, k).toLowerCase()))),
      h('p', { class: 'edit-hint' }, 'These answers decide what the next steps ask. Anything that does not apply is left out.'))
  ];
}

// ---------------------------------------------------------------- Income, Debt, Assets, Needs: the count-first rows
const counted = (collection, words) => (ctx, H) => [h('p', { class: 'lede' }, words), H.countSection(collection)];
const income = counted('income', 'How many of each? Then one row each: the name, the amount as take-home or before tax (the other is figured), and how often.');
const debt = counted('debts', 'How many of each? A count of 0 means not for me. Then one row each: name, owed, rate and the monthly payment. Rough is fine.');
const assets = counted('accounts', 'How many of each? Then one row each: the name and what is in it. Rough is fine.');
const needs = (ctx, H) => [H.needsSection()];

// ---------------------------------------------------------------- Goals
function goalRow(spine, g, t) {
  const p = 'goals.' + g.id;
  const by = h('input', { id: 'ob-goal-' + g.id + '-by', type: 'date', 'aria-label': g.label + ': by when' });
  by.value = g.by || '';
  by.addEventListener('change', () => change((s) => setAt(s, p + '.by', by.value || null), said.changed('Goal ' + g.label + ' by', by.value || 'no date')));
  return h('li', { class: 'irow' },
    h('div', { class: 'irow-cells' },
      cell('Goal', textBox('ob-goal-' + g.id + '-name', g.label, 'Goal name', (x) => change((s) => setAt(s, p, { ...getAt(s, p), label: x || 'Goal' }), said.changed('Goal', x || 'blank')), 'e.g. Emergency fund')),
      answerField({ id: 'ob-goal-' + g.id + '-target', label: 'How much', path: p + '.target', fact: g.target, onSet: (val, kind) => change((s) => putFact(s, p + '.target', val, kind, t), said.changed('Goal ' + g.label, val === null ? (kind === 'notForMe' ? 'not for me' : 'blank') : money(val) + (kind === 'rough' ? ' (rough)' : ''))) }),
      cell('By when (optional)', by)),
    h('div', { class: 'irow-btns' }, h('button', { type: 'button', class: 'btn danger small', onclick: () => change((s) => removeItem(s, 'goals', g.id), said.deleted('Goal ' + g.label)) }, 'Delete')));
}
function goals(ctx, H) {
  const spine = ctx.spine, t = H.today(), a = answersOf(spine), s = H.summaryOf(spine);
  const goalsQ = questionById('goals'), fiQ = questionById('fi');
  const answer = (q) => (x) => change((sp) => applyAnswer(sp, q.id, x, { today: t, by: 'coach', source: 'onboarding' }), q.label + (x === null ? ' cleared' : ' answered'));
  const list = (spine.goals || []).filter((g) => g.type !== 'fi');
  const fi = s.fi.today;
  return [
    h('p', { class: 'lede' }, 'Pick up to three, then an amount for each. Rough is fine.'),
    h('section', { class: 'card qs' }, questionEl(goalsQ, a.goals ?? null, answer(goalsQ), { idPrefix: 'ob' }), questionEl(fiQ, a.fi ?? null, answer(fiQ), { idPrefix: 'ob' }),
      h('p', { class: 'edit-hint' }, 'Financial independence at today\'s spending: ' + (fi.value === null ? 'needs the Needs step first' : money(fi.value)) + '.')),
    h('section', { class: 'card' },
      list.length ? h('ul', { class: 'irows' }, list.map((g) => goalRow(spine, g, t))) : h('p', { class: 'muted' }, 'No goals yet. Pick from the list above, or add one.'),
      h('button', { type: 'button', class: 'btn add', onclick: () => { const r = addItem(spine, { collection: 'goals', type: 'savings', label: 'New goal' }, t); if (change(r.spine, said.added('A goal'))) later(() => document.getElementById('ob-goal-' + r.id + '-name')?.select()); } }, '+ Add a goal'))
  ];
}

// ---------------------------------------------------------------- Finish
function finish(ctx, H) {
  const spine = ctx.spine, t = H.today(), s = H.summaryOf(spine), n = finishNumbers(spine, H.rules(), s);
  const open = openItems(spine, (p) => isLaterPath(rowPathFor(spine, p)));
  const line = (label, r) => h('li', { class: 'sum-line' }, h('span', {}, label), h('span', { class: 'num' }, r.value === null ? h('span', { class: 'empty' }, 'not enough yet') : [money(r.value), r.kind === 'rough' || r.kind === 'incomplete' ? chip(r.kind) : null]));
  const fiDate = n.fiNumber.value === null ? 'needs the FI number' : n.fiYm ? 'around ' + monthWords(n.fiYm) : n.fiNever ? 'not at this pace' : 'needs more numbers';
  const group = (title, groups, count) => h('section', { class: 'card', 'aria-label': title },
    h('h2', {}, title, ' ', h('span', { class: 'count' }, String(count))),
    count ? groups.map((g) => [h('h3', { class: 'part-h' }, g.label), h('ul', { class: 'flow-list' }, g.items.map((it) => h('li', {}, H.fieldLink(it.path, it.label))))]) : h('p', { class: 'muted' }, 'None.'));
  return [
    h('section', { class: 'card', 'aria-label': 'What we have now' }, h('h2', {}, 'What we have now'),
      h('ul', { class: 'sum-lines' }, line('Monthly take-home', n.takeHome), line('Total owed', n.owed), line('Net worth, liquid', n.liquid), line('Net worth, total', n.total), line('Monthly needs', n.needs), line('FI number', n.fiNumber),
        h('li', { class: 'sum-line' }, h('span', {}, 'FI date'), h('span', { class: 'num' }, fiDate)))),
    group('Rough, to firm up later', open.rough, open.roughCount),
    group('Not now, parked for a later session', open.later, open.laterCount),
    open.defaults ? h('p', { class: 'muted' }, 'Also ' + open.defaults + (open.defaults === 1 ? ' number uses' : ' numbers use') + ' Eli\'s defaults until the real ones are entered.') : null,
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', id: 'onb-done', onclick: () => { change((sp) => markComplete(sp, t), 'Onboarding done'); location.assign('dashboard.html'); } }, 'Done, go to Home'))
  ];
}

const SCREENS = { profile, income, debt, assets, needs, goals, finish };
// H: what the page lends the steps: { cur, rules, today, summaryOf, fieldLink, countSection(collection), needsSection() }.
export function onboardScreen(ctx, H) {
  const step = ctx.levels[1] || 'profile';
  if (!SCREENS[step]) return null;
  return [stepBar(step, H), h('div', { class: 'onb-step', 'data-step': step }, ...[].concat(SCREENS[step](ctx, H)).flat(Infinity).filter(Boolean)), nav(step, H)];
}

// Enter moves on: in a box, to the next box on the step (the value saves as the focus leaves); on the last box, to
// the Next button, so one more Enter opens the next step; anywhere else, to the next step. Buttons and links keep
// their own Enter.
let bound = false;
const visible = (el) => el.offsetParent !== null;
export function bindKeys() {
  if (bound) return;
  bound = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const step = document.querySelector('.onb-step');
    if (!step) return;
    const t = e.target;
    if (t && ['BUTTON', 'A', 'TEXTAREA'].includes(t.tagName)) return;
    const typed = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT');
    if (typed && !step.contains(t)) return;
    e.preventDefault();
    if (typed) {
      const all = [...step.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled])')].filter(visible);
      const next = all[all.indexOf(t) + 1];
      if (next) { next.focus(); return; }
      t.blur();
      const btn = document.getElementById('onb-next');
      if (btn) { btn.focus(); return; }
    }
    document.getElementById('onb-next')?.click();
  });
}

// Got extra money? (the Windfall page, S-201; on the shell, S-230): type a lump sum, say whether tax is still owed on
// it and where it came from, and see where it goes, one step at a time. Each step opens as its own screen (Plan › Got
// extra money? › 3. Cash up to the stage 1 floor) with why, what it reads in My numbers and Show the math. The page
// sits under Plan, which opens it from a card: its Back returns to Plan where you were. The amount and the answers
// are kept in this browser only and nothing is written to the household, so nothing here is a change to undo.
// Formatting only: the engine is engine/windfall.js.

import { startPage, refresh, keep, kept } from './shell.js';
import { summarize } from '../engine/summary.js';
import { windfall, WINDFALL_FROM } from '../engine/windfall.js';
import { mathButton } from './math-panel.js';
import { parseInput } from '../engine/edits.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { labelFor } from '../engine/labels.js';
import { h, chip, money, ledgerHref } from './view.js';

const KEY = 'slam-windfall:v1';
// One data color per step, in the fixed order (DESIGN.md 8); the tax steps share one, the cash steps share one.
const COLOR = { taxOnIt: 'viz-4', taxBill: 'viz-4', cashFloor: 'viz-3', promos: 'viz-2', cards: 'viz-2', cushion: 'viz-3', roth: 'viz-5', left: 'viz-0' };
const LEGEND = [['viz-4', 'Tax'], ['viz-3', 'Cash'], ['viz-2', 'Debt'], ['viz-5', 'Roth IRA'], ['viz-0', 'Not assigned yet']];
const kindChip = (k) => chip(k === 'computed' ? 'known' : k);

// What is asked (morning answer 9): how much, and where it came from; the tax follows from where (WINDFALL_FROM). An
// answer saved by the old two-question form reads as "Something else" until asked again.
let ask = (() => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v.amount === 'number') return { amount: v.amount, from: WINDFALL_FROM[v.from] ? v.from : 'other' }; } catch { /* storage blocked */ } return { amount: null, from: 'bonus' }; })();
const remember = () => { try { localStorage.setItem(KEY, JSON.stringify(ask)); } catch { /* storage blocked: lasts until the page closes */ } };

// One run per household and answer (a redraw, a level change and the trail's names reuse it).
let memo = {};
function model(base, rules) {
  const scenario = pickedScenario();
  if (memo.base === base && memo.rules === rules && memo.scenario === scenario && memo.ask === ask) return memo;
  const spine = withScenario(base, rules, scenario);
  const s = summarize(spine, rules, { flags: false });
  memo = { base, rules, scenario, ask, spine, s, w: ask.amount === null ? null : windfall(spine, rules, s, ask) };
  return memo;
}
// A step's screen is its id in words (#/cash-floor).
const slug = (id) => id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const indexOf = (m, level) => (m.w ? m.w.steps.findIndex((st) => slug(st.id) === level) : -1);

// Show the math, kept open when the screen is come back to.
function math(key, ids, ctx) {
  const el = mathButton(ids, ctx);
  const btn = el.querySelector('button');
  if ((kept().math || []).includes(key)) btn.click();
  btn.addEventListener('click', () => { const open = kept().math || []; keep({ math: open.includes(key) ? open.filter((k) => k !== key) : [...open, key] }); });
  return el;
}
// A row that opens My numbers: the whole row is the target, with a chevron.
const goRow = (href, name, sub) => h('li', {}, h('a', { class: 'go-row plain', href }, h('span', { class: 'go-name' }, name), h('span', { class: 'go-sub' }, sub)));

function form() {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const amount = h('input', { id: 'wf-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 5,000' });
  amount.value = ask.amount === null ? '' : String(ask.amount);
  // One question (morning answer 9): where it came from sets the tax; the step says which rule applied.
  const src = (val) => h('label', { class: 'choice-card' }, h('input', { type: 'radio', name: 'wf-from', value: val, checked: ask.from === val }), h('span', { class: 'choice-text' }, h('strong', {}, WINDFALL_FROM[val].words)));
  const srcBox = h('fieldset', { class: 'choice-group' }, h('legend', { class: 'edit-label' }, 'Where did it come from?'), ...Object.keys(WINDFALL_FROM).map(src));
  // The screen's one job is this question, so the form is its main action (the tester allows a main form open).
  return h('form', { class: 'editor windfall-form', 'data-main-form': '', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const p = parseInput('money', amount.value);
    if (!p.ok || p.value <= 0) { msg.textContent = 'How much: ' + (p.ok ? 'more than $0' : p.message); amount.focus(); return; }
    ask = { amount: p.value, from: srcBox.querySelector('input:checked').value };
    remember();
    refresh();
    document.getElementById('wf-result')?.scrollIntoView({ block: 'start' });
  } },
    h('label', { for: 'wf-amount', class: 'edit-label' }, 'How much is coming in?'),
    h('div', { class: 'amount-row' }, h('span', { class: 'unit', 'aria-hidden': 'true' }, '$'), amount),
    srcBox, msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Show where it goes')));
}

// Nothing here: the step needs nothing, or the money ran out before it.
const amountWords = (st) => (st.amount === null ? 'Cannot figure yet' : st.amount === 0 ? (st.need > 0 ? 'Nothing left for it' : 'Nothing needed') : money(st.amount, !Number.isInteger(st.amount)));

function stepRow(st, i) {
  const zero = !st.amount;
  return h('li', {}, h('a', { class: 'go-row' + (zero ? ' zero' : ''), href: '#/' + slug(st.id) },
    h('span', { class: 'wf-num ' + COLOR[st.id], 'aria-hidden': 'true' }, String(i + 1)),
    h('span', { class: 'go-name' }, st.label),
    h('span', { class: 'go-sub' }, h('span', { class: 'go-total' }, amountWords(st)), st.short > 0 ? 'short by ' + money(st.short) : null, ['rough', 'incomplete', 'missing'].includes(st.kind) ? kindChip(st.kind) : null)));
}

function result(m) {
  if (!m.w) return h('section', { class: 'card', id: 'wf-result' }, h('p', { class: 'muted' }, 'Where it goes shows here.'));
  const w = m.w;
  const segs = w.steps.filter((x) => x.amount > 0);
  const used = new Set(segs.map((x) => COLOR[x.id]));
  return h('section', { class: 'card', id: 'wf-result', 'aria-labelledby': 'wf-h' },
    h('h2', { id: 'wf-h' }, 'Where ' + money(w.amount) + ' goes'),
    h('p', { class: 'tile-sub' }, (w.fromWords ? w.fromWords + ': ' + (w.taxed ? 'no tax held back. ' : 'tax held back first. ') : w.taxed ? 'Tax already taken out. ' : 'Tax still owed on it. ') + money(w.assigned) + ' has a job' + (w.left > 0 ? ' and ' + money(w.left) + ' is left to give one.' : '.') + (w.kind === 'incomplete' ? ' A step could not be figured: open it to see what it needs.' : w.kind === 'rough' ? ' Some steps rest on rough numbers.' : '')),
    h('div', { class: 'wf-bar', role: 'img', 'aria-label': 'The money split by step; the same amounts are listed below' }, segs.map((x) => h('span', { class: 'wf-seg ' + COLOR[x.id], style: 'width:' + (x.amount / w.amount * 100) + '%', title: x.label + ': ' + money(x.amount) }))),
    h('ul', { class: 'flow-legend', 'aria-label': 'What the colors mean' }, LEGEND.filter(([c]) => used.has(c)).map(([c, t]) => h('li', {}, h('span', { class: 'sw ' + c, 'aria-hidden': 'true' }), t))),
    h('ol', { class: 'go-list' }, w.steps.map(stepRow)),
    h('p', { class: 'tile-note' }, 'The order: tax first, then the floor under your cash, then the debt that costs the most, then the cushion and the Roth. This shows where the money goes in that order; it is not advice about your situation.'));
}

function stepScreen(m, st) {
  const many = st.items && st.items.length > 1 ? st.items : [];
  const seen = new Set();
  const once = (p) => (p && !seen.has(p) ? (seen.add(p), true) : false);
  const rows = [
    ...many.filter((x) => once(x.path)).map((x) => goRow(ledgerHref(x.path), x.name, money(x.pay) + ' from this money')),
    ...(st.kind === 'missing' ? st.missing.slice(0, 3) : []).filter(once).map((p) => goRow(ledgerHref(p), labelFor(m.spine, p), 'Missing: fill it in My numbers')),
    once(st.path) ? goRow(ledgerHref(st.path), labelFor(m.spine, st.path), 'Open it in My numbers') : null
  ].filter(Boolean);
  const plain = many.filter((x) => !x.path);
  return h('section', { class: 'card', 'aria-label': st.label },
    h('p', { class: 'max-big' + (st.amount === null ? ' missing-text' : '') }, amountWords(st)),
    h('p', {}, kindChip(st.kind), ' ', st.why),
    st.short > 0 ? h('p', { class: 'wf-short' }, 'Short by ' + money(st.short) + ': the money runs out here.') : null,
    plain.length ? h('ul', { class: 'wf-items' }, plain.map((x) => h('li', {}, x.label || x.name))) : null,
    rows.length ? h('ul', { class: 'go-list' }, rows) : null,
    math('step', ['windfall:' + st.id], { spine: m.spine, rules: m.rules, s: m.s, windfall: m.w }));
}

// The words for a level, or null when it is not there (no amount yet, or a step that is gone): the shell goes up.
function name(levels, { spine, rules }) {
  if (levels.length !== 1) return null;
  const m = model(spine, rules), i = indexOf(m, levels[0]);
  return i < 0 ? null : (i + 1) + '. ' + m.w.steps[i].label;
}

function render({ spine, rules, levels }) {
  const m = model(spine, rules);
  if (levels.length) return stepScreen(m, m.w.steps[indexOf(m, levels[0])]);
  return [
    h('section', { class: 'card', 'aria-labelledby': 'wf-ask' }, h('h2', { id: 'wf-ask' }, 'A lump sum is coming in'), form()),
    result(m)
  ];
}

startPage({ tab: 'plan', title: 'Got extra money?', parent: ['Plan', 'plan.html'], name, render });

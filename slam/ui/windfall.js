// The Windfall room (S-201): type a lump sum, say whether tax is still owed on
// it, and see where it goes in the house order, each step with its amount,
// why, the Ledger fields behind it and Show the math. The amount and the tax
// answer are kept in this browser only; nothing is written to the household.
// Formatting only: the engine is engine/windfall.js.

import { summarize } from '../engine/summary.js';
import { windfall } from '../engine/windfall.js';
import { mathButton } from './math-panel.js';
import { parseInput } from '../engine/edits.js';
import { loadAll, SOURCE_WORDS } from './household.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { h, chip, money, shortDate, ledgerHref } from './view.js';

const app = document.getElementById('app');
const KEY = 'slam-windfall:v1';
// One data color per step, in the fixed order (DESIGN.md 8); the tax steps share one, the cash steps share one.
const COLOR = { taxOnIt: 'viz-4', taxBill: 'viz-4', cashFloor: 'viz-3', promos: 'viz-2', cards: 'viz-2', cushion: 'viz-3', roth: 'viz-5', left: 'viz-0' };
const LEGEND = [['viz-4', 'Tax'], ['viz-3', 'Cash'], ['viz-2', 'Debt'], ['viz-5', 'Roth IRA'], ['viz-0', 'Not assigned yet']];

let base, rules, source;
let ask = (() => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v.amount === 'number') return { amount: v.amount, taxed: v.taxed !== false }; } catch { /* storage blocked */ } return { amount: null, taxed: true }; })();
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(ask)); } catch { /* storage blocked: lasts until the page closes */ } };

function form() {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const amount = h('input', { id: 'wf-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '5,000' });
  amount.value = ask.amount === null ? '' : String(ask.amount);
  const choice = (val, text, sub) => h('label', { class: 'choice-card' }, h('input', { type: 'radio', name: 'wf-taxed', value: val, checked: ask.taxed === (val === 'yes') }), h('span', { class: 'choice-text' }, h('strong', {}, text), h('span', { class: 'choice-sub' }, sub)));
  const taxBox = h('fieldset', { class: 'choice-group' }, h('legend', { class: 'edit-label' }, 'Is tax already taken out of it?'),
    choice('yes', 'Yes, or none is owed', 'A bonus with tax withheld, a gift, an inheritance, a tax refund, a sale of your own things'),
    choice('no', 'No, tax is still owed on it', 'Contract or 1099 pay, a prize, a bonus paid with nothing withheld'));
  return h('form', { class: 'editor windfall-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const p = parseInput('money', amount.value);
    if (!p.ok || p.value <= 0) { msg.textContent = 'How much: ' + (p.ok ? 'more than $0' : p.message); amount.focus(); return; }
    ask = { amount: p.value, taxed: taxBox.querySelector('input:checked').value === 'yes' };
    keep();
    render();
    document.getElementById('wf-result')?.scrollIntoView({ block: 'start' });
  } },
    h('label', { for: 'wf-amount', class: 'edit-label' }, 'How much is coming in?'),
    h('div', { class: 'amount-row' }, h('span', { class: 'unit', 'aria-hidden': 'true' }, '$'), amount),
    h('p', { class: 'edit-hint' }, 'A lump sum: a bonus, a gift, a tax refund, contract pay, a sale. Nothing here changes the Ledger.'),
    taxBox, msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Show where it goes')));
}

function stepEl(st, i, ctx) {
  const zero = st.amount === 0 || st.amount === null;
  // Nothing here: the step needs nothing, or the windfall ran out before it.
  const amt = st.amount === null ? 'Cannot figure yet' : zero ? (st.need > 0 ? 'Nothing left for it' : 'Nothing needed') : money(st.amount, !Number.isInteger(st.amount));
  return h('li', { class: 'wf-step ' + COLOR[st.id] + (zero ? ' zero' : ''), id: 'wf-' + st.id },
    h('span', { class: 'wf-num', 'aria-hidden': 'true' }, String(i + 1)),
    h('div', { class: 'wf-head' }, h('span', { class: 'wf-label' }, st.label), h('span', { class: 'wf-amt' }, amt)),
    h('div', { class: 'wf-body' },
      h('p', { class: 'wf-why' }, chip(st.kind === 'computed' ? 'known' : st.kind), ' ', st.why),
      st.items && st.items.length > 1 ? h('ul', { class: 'wf-items' }, st.items.map((x) => h('li', {}, h('a', { href: ledgerHref(x.path) }, x.name), ': ' + money(x.pay)))) : null,
      st.short > 0 ? h('p', { class: 'wf-short' }, 'Short by ' + money(st.short) + ': the windfall runs out here.') : null,
      st.kind === 'missing' && st.missing.length ? h('p', { class: 'wf-short' }, 'Needs: ', ...st.missing.slice(0, 3).flatMap((p, k) => [k ? ', ' : '', h('a', { href: ledgerHref(p) }, p.split('.').slice(-2).join(' '))])) : null,
      h('div', { class: 'wf-links' }, st.path ? h('a', { href: ledgerHref(st.path) }, 'View in the Ledger ›') : null),
      mathButton(['windfall:' + st.id], ctx)));
}

function result(spine, s) {
  if (ask.amount === null) return h('section', { class: 'card', id: 'wf-result' }, h('p', { class: 'muted' }, 'Type an amount above to see where it goes.'));
  const w = windfall(spine, rules, s, ask);
  const ctx = { spine, rules, s, windfall: w };
  const segs = w.steps.filter((x) => x.amount > 0);
  const used = new Set(segs.map((x) => COLOR[x.id]));
  return h('section', { class: 'card', id: 'wf-result', 'aria-labelledby': 'wf-h' },
    h('h2', { id: 'wf-h' }, 'Where ' + money(w.amount) + ' goes'),
    h('p', { class: 'tile-sub' }, (w.taxed ? 'Tax already taken out. ' : 'Tax still owed on it. ') + money(w.assigned) + ' is assigned' + (w.left > 0 ? ' and ' + money(w.left) + ' is left to give a job.' : '.') + (w.kind === 'incomplete' ? ' A step could not be figured: it says what it needs.' : w.kind === 'rough' ? ' Some steps rest on rough numbers.' : '')),
    h('div', { class: 'wf-bar', role: 'img', 'aria-label': 'The windfall split by step; the same amounts are listed below' }, segs.map((x) => h('span', { class: 'wf-seg ' + COLOR[x.id], style: 'width:' + (x.amount / w.amount * 100) + '%', title: x.label + ': ' + money(x.amount) }))),
    h('ul', { class: 'flow-legend', 'aria-label': 'What the colors mean' }, LEGEND.filter(([c]) => used.has(c)).map(([c, t]) => h('li', {}, h('span', { class: 'sw ' + c, 'aria-hidden': 'true' }), t))),
    h('ol', { class: 'wf-steps' }, w.steps.map((st, i) => stepEl(st, i, ctx))),
    h('p', { class: 'tile-note' }, 'The order is a house rule (', h('a', { href: 'math.html#rule-WINDFALL_ORDER' }, 'WINDFALL_ORDER'), '): tax first, then the floor under your cash, then debt that costs the most, then the cushion and the Roth. Every number comes from the Ledger and the same engines as the Dashboard. This is where the money goes under that rule, not advice about your situation.'));
}

function render() {
  const spine = withScenario(base, rules, pickedScenario());
  const s = summarize(spine, rules, { flags: false });
  app.replaceChildren(
    h('nav', { class: 'page-links', 'aria-label': 'Pages' }, h('a', { href: 'dashboard.html' }, 'Dashboard'), h('a', { href: 'ledger.html' }, 'Ledger'), h('a', { href: 'calendar.html' }, 'Calendar'), h('a', { href: 'spending.html' }, 'Spending'), h('a', { href: 'math.html' }, 'All formulas')),
    h('header', { class: 'top' },
      h('div', {}, h('h1', {}, 'Windfall'), h('p', { class: 'muted' }, spine.meta.name, ' · numbers as of ', shortDate(s.asOf), ' · ', SOURCE_WORDS[source]))),
    h('section', { class: 'card', 'aria-labelledby': 'wf-ask' }, h('h2', { id: 'wf-ask' }, 'A lump sum is coming in'), form()),
    result(spine, s));
}

loadAll().then((loaded) => {
  base = loaded.spine; rules = loaded.rules; source = loaded.source;
  render();
  if (loaded.problem) app.prepend(h('p', { class: 'card', role: 'alert' }, loaded.problem));
}).catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The Windfall room could not load: ' + err.message)); });

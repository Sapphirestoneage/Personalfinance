// The Plan page (S-208, Batch F; on the shell, S-230). The top screen is the Financial Order of Operations, one row a
// step, each opening its own screen (Plan › 3. High-interest debt), then "Got extra money?" (the Windfall page) and
// the rest of the plan, each on its own screen: the surplus step by step, the paychecks (each its own screen), how
// much to max it, goals, what it takes to get there, the real hourly wage, DRAFTT, if income stopped, the outlook,
// life events, saved scenarios, and download or import. The shell draws the tabs, the header with Undo and Redo, Back
// and the trail, and the bar; every change to the household goes through its change(), in words. What a screen has
// open (Show the math, a solve age, a picked event) is kept with its history entry, so coming back restores it.
// Every number comes from engine/plan.js and the engines under it, with Show the math. Formatting only.

import { startPage, change, said, keep, kept, refresh, say, numbersHref } from './shell.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { forecast, fixButton, lowWords } from './forecast.js';
import { rankSteps } from '../engine/next-step.js';
import { fooLadder, surplusWaterfall, allocator, solvers, realHourlyWage, draftt, fixedFloor, outlook, goalsView, applyLifeEvent, removeLifeEvent, diffSpines, exportJson, importJson, exportCsv } from '../engine/plan.js';
import { STEP_LABELS } from '../engine/windfall.js';
import { putFact, parseInput, recordDebtPayment } from '../engine/edits.js';
import { valueOf } from '../engine/spine.js';
import { keptMath } from './math-panel.js';
import { maxItCard, maxItFor } from './maxit-panel.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { labelFor } from '../engine/labels.js';
import { h, chip, money, pct, shortDate, monthWords, ledgerHref, showValue } from './view.js';
import { typeFor } from '../engine/ledger.js';

const kindChip = (k) => chip(k === 'computed' ? 'known' : k);
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const SCEN_KEY = 'slam-scenarios:v1';
const pc = (f) => Math.round(f * 1000) / 10 + '%';
const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many);
const readScenarios = () => { try { return JSON.parse(localStorage.getItem(SCEN_KEY) || '[]'); } catch { return []; } };
const keepScenarios = (list) => { try { localStorage.setItem(SCEN_KEY, JSON.stringify(list)); return true; } catch { return false; } };
// A file read for import and waiting for Apply or Discard (not kept across a reload: it can be large).
let pending = null;

// The life events to pick from, read before the page starts so every screen draws at once (and its scroll comes back).
const templates = await fetch(new URL('../data/life-events.json', import.meta.url), { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : {})).then((x) => x.templates || []).catch(() => []);

// ---------------------------------------------------------------- one run per household
// The household under the picked assumption set, its summary, the next three months day by day and the steps, worked
// out once per household (a redraw, a level change and the trail's names all reuse it).
let memo = {};
function model(base, rules) {
  const scenario = pickedScenario();
  if (memo.base === base && memo.rules === rules && memo.scenario === scenario) return memo;
  const spine = withScenario(base, rules, scenario);
  const s = summarize(spine, rules, { flags: false });
  const sim = cashsim(spine, rules, { months: 3 });
  // The steps read the same "How much to max it?" rows as its card (one run).
  const foo = fooLadder(spine, rules, s, { sim: maxItFor(spine, rules).sim });
  // NEXT is the one ranking's first step (engine/next-step.js), the same as Today's Next step and Do first.
  const rank = rankSteps(spine, rules, s, { foo });
  memo = { base, rules, scenario, spine, s, sim, rank, foo: { ...foo, current: rank.first && rank.first.rung ? rank.first.rung : foo.current } };
  return memo;
}
const allocOf = (m) => m.alloc || (m.alloc = allocator(m.spine, m.rules, m.sim, m.s));
// What Show the math reads, built when a panel opens.
const mathCtx = (m) => (extra = {}) => ({ spine: m.spine, rules: m.rules, s: m.s, sim: m.sim, plan: { foo: m.foo, wage: realHourlyWage(m.spine, m.rules, m.s), draftt: draftt(m.spine, m.rules, m.s), floor: fixedFloor(m.spine, m.rules, m.s, null), goals: goalsView(m.spine, m.rules, m.s), alloc: allocOf(m) }, ...extra });

// Show the math, kept open when the screen is come back to (Back, the trail, the browser's back, a tab, a reload).
const math = keptMath;

// A row that opens another screen or page: the whole row is the target, with a chevron.
const goRow = (href, name, sub) => h('li', {}, h('a', { class: 'go-row plain', href }, h('span', { class: 'go-name' }, ...[name].flat(Infinity)), sub ? h('span', { class: 'go-sub' }, ...[sub].flat(Infinity)) : null));

// ---------------------------------------------------------------- the screens and their names
// A step's screen is its id in words (#/high-interest); every other screen has its own word.
const slug = (id) => id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const SCREENS = {
  surplus: 'Your surplus, step by step', paychecks: 'Paychecks', 'max-it': 'How much to max it', goals: 'Goals',
  solve: 'What it takes to get there', wage: 'Real hourly wage', draftt: 'DRAFTT', floor: 'If income stopped',
  outlook: 'Outlook', events: 'Life events', scenarios: 'Saved scenarios', file: 'Download or import'
};
const payId = (p) => p.date + '-' + p.streamId;
const stepOf = (m, level) => m.foo.rungs.find((r) => slug(r.id) === level) || null;
const paycheckOf = (m, level) => allocOf(m).paychecks.find((p) => payId(p) === level) || null;

// The words for a level, or null when it is not there (the shell then goes up to the deepest one that is).
function name(levels, { spine, rules }) {
  const m = model(spine, rules);
  const [a, b] = levels;
  if (levels.length === 1) { if (SCREENS[a]) return SCREENS[a]; const r = stepOf(m, a); return r ? r.rung + '. ' + r.label : null; }
  if (levels.length === 2 && a === 'paychecks') { const p = paycheckOf(m, b); return p ? shortDate(p.date) + ': ' + p.label : null; }
  return null;
}

function render({ spine: base, rules, levels }) {
  const m = model(base, rules);
  const [a, b] = levels;
  if (!a) return top(m);
  if (a === 'paychecks') return b ? paycheckScreen(m, paycheckOf(m, b)) : paychecksScreen(m);
  const screen = { surplus: surplusScreen, 'max-it': (x) => maxItCard(x.spine, x.rules), goals: goalsScreen, solve: solveScreen, wage: wageScreen, draftt: drafttScreen, floor: floorScreen, outlook: outlookScreen, events: eventsScreen, scenarios: scenariosScreen, file: fileScreen }[a];
  return screen ? screen(m) : stepScreen(m, stepOf(m, a));
}

// ---------------------------------------------------------------- the top: the steps, Got extra money?, the rest
function stepRow(r, current) {
  const status = r.need === null ? [chip('missing')]
    : r.done ? ['Done']
      : [h('span', { class: 'go-total' }, money(r.need) + (r.flow ? ' a month' : '')), r.completes ? 'about ' + monthWords(r.completes.slice(0, 7)) : r.months === null ? 'no surplus to fund it yet' : null, r.kind === 'rough' || r.kind === 'incomplete' ? kindChip(r.kind) : null];
  return h('li', {}, h('a', { class: 'go-row' + (r.done ? ' is-done' : '') + (r.id === current ? ' is-current' : ''), href: '#/' + slug(r.id) },
    h('span', { class: 'go-mark', 'aria-hidden': 'true' }, r.done ? '✓' : String(r.rung)),
    h('span', { class: 'go-name' }, r.label, r.flow ? [' ', h('span', { class: 'pill' }, 'a month')] : null, r.id === current ? [' ', h('span', { class: 'pill pill-locked' }, 'Next')] : null),
    h('span', { class: 'go-sub' }, ...status.filter(Boolean))));
}

// The outlook in one sentence (Batch 8); the runs are behind Show the math and on its own screen.
// It leads with the one forecast every screen reads (ui/forecast.js), so the Plan names the same lowest day as Today,
// the Calendar and Spending; the runs (good and bad months) are on the outlook's own screen.
function outlookLine(m) {
  const { story } = forecast(m.base, m.rules);
  if (!story) return null;
  return [h('p', { class: 'tile-sub outlook-line', id: 'cash-low' }, lowWords(story) + ' ', h('a', { href: '#/outlook' }, 'Good and bad months')),
    story.under ? h('div', { class: 'edit-actions' }, fixButton(story)) : null];
}
function top(m) {
  const f = m.foo, surplus = m.s.cashflow.surplus.value;
  const w = surplusWaterfall(m.spine, m.rules, m.s);
  const a = allocOf(m), g = goalsView(m.spine, m.rules, m.s), wage = realHourlyWage(m.spine, m.rules, m.s), fl = fixedFloor(m.spine, m.rules, m.s, null);
  const events = [...new Set([...(m.base.income || []), ...(m.base.expenses || [])].map((x) => x.lifeEvent).filter(Boolean))];
  const saved = readScenarios();
  return [
    // The steps are paid from what is left after saving (cashflow.surplus), never called the monthly surplus.
    h('p', { class: 'lede' }, surplus === null ? 'What is left after saving is not known yet, so the steps have no dates.'
      : surplus <= 0 ? 'Nothing is left after saving to put toward the steps yet.'
        : 'Your ' + money(surplus) + ' a month left after saving goes to these steps, one at a time.'),
    outlookLine(m),
    h('section', { 'aria-labelledby': 'foo-h' },
      h('h2', { id: 'foo-h' }, 'Your steps, in order'),
      h('ol', { class: 'go-list' }, f.rungs.map((r) => stepRow(r, f.current))),
      h('p', { class: 'tile-note' }, kindChip(f.kind), ' "A month" steps take some of the surplus every month.'),
      math('foo', f.rungs.filter((r) => r.need !== null).map((r) => 'plan:foo:' + r.id), mathCtx(m))),
    // The Windfall page sits under Plan: the whole card is the way in.
    h('section', { class: 'card has-target', 'aria-labelledby': 'extra-h' },
      h('h2', { id: 'extra-h' }, h('a', { class: 'card-link', href: 'windfall.html' }, h('span', {}, 'Got extra money?'), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'))),
      h('p', { class: 'tile-sub' }, 'A bonus, a gift or a tax refund: see where it would go, step by step.')),
    h('section', { 'aria-labelledby': 'more-h' },
      h('h2', { id: 'more-h' }, 'More about your plan'),
      h('ul', { class: 'go-list' },
        goRow('#/surplus', SCREENS.surplus, w.note || [h('span', { class: 'go-total' }, money(w.surplus)), 'a month']),
        a.paychecks.length ? goRow('#/paychecks', SCREENS.paychecks, plural(a.paychecks.length, 'paycheck') + ' in the next three months: what each one covers') : null,
        goRow('#/max-it', SCREENS['max-it'], 'Room left in each retirement account'),
        goRow('#/goals', SCREENS.goals, g.rows.length ? [h('span', { class: 'go-total' }, plural(g.rows.length, 'goal')), g.setAsideTotal ? money(g.setAsideTotal) + ' a month set aside' : null] : 'No goals beyond financial independence yet'),
        goRow('#/solve', SCREENS.solve, 'Pick an age, see what it takes'),
        goRow('#/wage', SCREENS.wage, wage.wage === null ? [chip('missing'), 'Needs your hours worked a week'] : [h('span', { class: 'go-total' }, money(wage.wage, true)), 'an hour, after work costs']),
        goRow('#/draftt', SCREENS.draftt, 'Your big costs as shares of take-home'),
        goRow('#/floor', SCREENS.floor, fl.floor === null ? [chip('missing'), 'Needs the amount of a fixed cost'] : [h('span', { class: 'go-total' }, money(fl.floor)), 'a month of fixed costs']),
        goRow('#/outlook', SCREENS.outlook, 'How the next three months could go'),
        goRow('#/events', SCREENS.events, events.length ? plural(events.length, 'event') + ' in your numbers' : 'A new job, a move, a baby'),
        goRow('#/scenarios', SCREENS.scenarios, saved.length ? plural(saved.length, 'scenario') + ' saved in this browser' : 'Save today to compare later'),
        goRow('#/file', SCREENS.file, 'Download your numbers, or read in a file')))
  ];
}

// ---------------------------------------------------------------- one step
function deductibleForm(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const ded = h('input', { id: 'foo-ded', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '2,500', 'aria-describedby': 'foo-ded-hint' });
  ded.value = m.foo.setup.deductible === null ? '' : String(m.foo.setup.deductible);
  return h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    if (!ded.value.trim()) { msg.textContent = 'Type an amount, like 2,500'; ded.focus(); return; }
    const p = parseInput('money', ded.value);
    if (!p.ok) { msg.textContent = p.message; ded.focus(); return; }
    change((x) => putFact(x, 'household.deductible', p.value, 'known', todayIso()), said.changed('Biggest deductible', money(p.value)));
  } },
    h('label', { for: 'foo-ded', class: 'edit-label' }, 'The biggest insurance deductible (health, car or home)'), ded,
    h('p', { class: 'edit-hint', id: 'foo-ded-hint' }, 'In dollars, like 2,500.'), msg,
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save the deductible')));
}

function stepScreen(m, r) {
  const f = m.foo;
  const big = r.need === null ? h('p', { class: 'max-big missing-text' }, 'Missing') : h('p', { class: 'max-big' }, r.done ? 'Done' : money(r.need) + (r.flow ? ' a month' : ''));
  const when = r.need === null || r.done ? null : r.completes ? (r.flow ? 'From about ' : 'Done about ') + monthWords(r.completes.slice(0, 7)) + '.' : r.months === null ? 'No surplus to fund it yet.' : null;
  const links = [
    r.id === 'employerMatch' ? goRow(numbersHref('assets'), 'Your accounts', 'Open them in My numbers') : null,
    r.id === 'rothHsa' || r.id === 'maxRetirement' ? goRow('#/max-it', SCREENS['max-it'], 'Each account\'s room and deadline') : null,
    r.id === 'prepaid' ? goRow('#/goals', SCREENS.goals, 'Each goal, its target and by when') : null,
    r.path && r.id !== 'deductibles' ? goRow(ledgerHref(r.path), labelFor(m.spine, r.path), 'Open it in My numbers') : null
  ].filter(Boolean);
  return h('section', { class: 'card', 'aria-label': r.label },
    r.id === f.current ? h('p', {}, h('span', { class: 'pill pill-locked' }, 'Your next step')) : null,
    big,
    when ? h('p', { class: 'tile-sub' }, when) : null,
    // The deductible's own box is right below, so its step says to type it there.
    h('p', {}, kindChip(r.kind), ' ', r.id === 'deductibles' && r.need === null ? 'Type the biggest deductible below.' : r.why),
    r.flow ? h('p', { class: 'tile-note' }, 'A monthly amount: once the surplus gets here, this much goes to it every month.') : null,
    r.id === 'deductibles' ? deductibleForm(m) : null,
    r.id === 'highInterest' ? hiDebts(m, r) : null,
    r.need === null && r.path && r.id !== 'deductibles' ? inlineFix(m, r) : null,
    r.id === 'employerMatch' ? h('p', { class: 'tile-sub' }, f.setup.match ? 'Your employer match is entered on your workplace account.' : 'Enter the match rate and cap on your workplace account in My numbers (Assets, then the 401(k)).') : null,
    r.id === 'reserves' ? h('p', { class: 'tile-sub' }, f.setup.reserveMonths === null ? 'The Rule of 5 target needs a birth date.' : 'Your target: the Rule of 5, ' + f.setup.reserveMonths.toFixed(1) + ' months of spending.') : null,
    links.length ? h('ul', { class: 'go-list' }, links) : null,
    r.need !== null ? math('step', ['plan:foo:' + r.id], mathCtx(m)) : null);
}

// The missing number a step needs, typed right here (Batch 8): a money, a whole number or a rate; anything else links
// to its place in My numbers.
const FIX_TYPES = ['money', 'int', 'rate', 'date'];
function inlineFix(m, r) {
  let type = 'text';
  try { type = typeFor(m.base, r.path); } catch { /* not a field this form can type */ }
  if (!FIX_TYPES.includes(type)) return null;
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const box = h('input', { id: 'fix-' + r.id, type: type === 'date' ? 'date' : 'text', inputmode: type === 'date' ? null : 'decimal', autocomplete: 'off' });
  return h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const p = parseInput(type, box.value);
    if (!box.value.trim() || !p.ok) { msg.textContent = p.ok ? 'Type it first' : p.message; box.focus(); return; }
    change((x) => putFact(x, r.path, p.value, 'known', todayIso()), said.changed(labelFor(m.base, r.path), showValue(p.value, type)));
  } }, h('label', { for: 'fix-' + r.id, class: 'edit-label' }, labelFor(m.base, r.path)), box, msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save it')));
}
// High-interest debt (Batch 8): each debt at or above the line, with Record a payment right here, and Add a debt.
function hiDebts(m, r) {
  // The same debts the step counts (its rate today, so a 0% promo is not on it).
  const list = (r.ids || []).map((id) => (m.base.debts || []).find((d) => d.id === id)).filter(Boolean);
  const row = (d) => {
    const name = valueOf(d.name) || d.id;
    const msg = h('p', { class: 'edit-msg', role: 'alert' });
    const box = h('input', { id: 'pay-' + d.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '$', 'aria-label': 'Payment on ' + name });
    return h('li', { class: 'hi-debt' }, h('p', {}, h('strong', {}, name), ' ' + money(valueOf(d.balance)) + ' at ' + pct(valueOf(d.apr), 1)),
      h('form', { class: 'inline-form', novalidate: true, onsubmit: (e) => {
        e.preventDefault();
        const p = parseInput('money', box.value);
        if (!box.value.trim() || !p.ok || !(p.value > 0)) { msg.textContent = 'Type the payment, like 200'; box.focus(); return; }
        change((x) => recordDebtPayment(x, d.id, p.value, todayIso()), said.added('Payment of ' + money(p.value) + ' on ' + name));
      } }, box, h('button', { type: 'submit', class: 'btn small' }, 'Record a payment'), msg));
  };
  return h('div', {}, list.length ? h('ul', { class: 'hi-list' }, list.map(row)) : null,
    h('p', { class: 'edit-hint' }, 'A payment lowers the debt, and checking when its balance is in. A payment above the balance pays the balance.'),
    h('div', { class: 'edit-actions' }, h('a', { class: 'btn', href: numbersHref('debt') }, 'Add a debt')));
}

// ---------------------------------------------------------------- the rest of the plan, a screen each
function surplusScreen(m) {
  const w = surplusWaterfall(m.spine, m.rules, m.s);
  return h('section', { class: 'card', 'aria-label': SCREENS.surplus },
    w.note ? h('p', { class: 'muted' }, w.note) : null,
    h('ol', { class: 'tiers' }, w.steps.map((st) => h('li', {}, h('span', {}, STEP_LABELS[st.id] || st.id, h('span', { class: 'rung-why' }, st.why)), h('span', { class: 'tier-amt' }, st.need === null ? 'missing' : money(st.amount) + (st.need > (st.amount || 0) ? ' of ' + money(st.need) : '')), h('span', { class: 'tier-cum' }, st.months ? st.months + ' months' : '')))),
    math('surplus', w.steps.map((st) => 'windfall:' + st.id), () => ({ ...mathCtx(m)(), windfall: w })));
}

function paychecksScreen(m) {
  const a = allocOf(m);
  if (!a.paychecks.length) return h('p', { class: 'card muted' }, 'No paychecks in the next three months.');
  return [
    h('p', { class: 'lede' }, 'What each paycheck covers until the next one.' + (a.bonusMonths.length ? ' Three-paycheck months: ' + a.bonusMonths.map(monthWords).join(', ') + '.' : '')),
    h('ul', { class: 'go-list' }, a.paychecks.map((p) => goRow('#/paychecks/' + encodeURIComponent(payId(p)), [shortDate(p.date) + ': ' + p.label, p.bonus ? [' ', h('span', { class: 'pill' }, 'bonus paycheck')] : null],
      [h('span', { class: 'go-total' }, money(p.amount)), p.short ? h('span', { class: 'missing-row' }, 'short by ' + money(-p.free)) : money(p.free) + ' free'])))
  ];
}

function paycheckScreen(m, p) {
  return h('section', { class: 'card', 'aria-label': shortDate(p.date) + ': ' + p.label },
    h('p', { class: 'max-big' }, money(p.amount)),
    h('p', { class: 'tile-sub' }, (p.bonus ? 'A bonus paycheck. ' : '') + (p.short ? 'Short by ' + money(-p.free) + ' before the next one.' : money(p.free) + ' free after the bills until the next one.')),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Envelope'), h('th', {}, 'Due'), h('th', { class: 'num' }, 'Amount'))),
      h('tbody', {}, p.is1099 ? h('tr', {}, h('td', {}, 'Tax set aside (' + pct(p.setAsideRate, 1) + ' of a 1099 deposit)' + (p.setAsideMissing ? '; the rate is partly missing' : '')), h('td', {}, 'on arrival'), h('td', { class: 'num' }, money(p.setAside))) : null, ...p.envelopes.map((e) => h('tr', {}, h('td', {}, e.label), h('td', {}, shortDate(e.date)), h('td', { class: 'num' }, money(e.amount)))), h('tr', {}, h('td', {}, 'Everyday spending until the next paycheck'), h('td', {}, ''), h('td', { class: 'num' }, money(p.everyday)))),
      h('tfoot', {}, h('tr', {}, h('td', {}, h('strong', {}, p.short ? 'Short by' : 'Free')), h('td', {}), h('td', { class: 'num' }, money(Math.abs(p.free))))))),
    math('pay', ['plan:pay:' + p.date + ':' + p.streamId], mathCtx(m)));
}

function goalsScreen(m) {
  const g = goalsView(m.spine, m.rules, m.s);
  return h('section', { class: 'card', 'aria-label': SCREENS.goals },
    g.setAsideTotal ? h('p', { class: 'muted' }, money(g.setAsideTotal) + ' a month goes to goals.') : null,
    g.rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Goal'), h('th', { class: 'num' }, 'Target'), h('th', { class: 'num' }, 'There'), h('th', { class: 'num' }, 'To go'), h('th', {}, 'Reached'), h('th', {}, 'Costs the FI date'))),
      h('tbody', {}, g.rows.map((r) => h('tr', { class: r.onTime === false ? 'tight' : '' }, h('td', {}, h('a', { href: ledgerHref(r.path) }, r.label), r.sinking ? [' ', h('span', { class: 'pill' }, 'sinking fund')] : null, r.priority !== null ? [' ', h('span', { class: 'pill' }, 'priority ' + r.priority)] : null, r.repeat ? [' ', h('span', { class: 'pill' }, 'yearly')] : null), h('td', { class: 'num' }, r.target === null ? 'missing' : money(r.target)), h('td', { class: 'num' }, r.held === null ? '' : money(r.held)), h('td', { class: 'num' }, r.toGo === null ? 'missing' : money(r.toGo)), h('td', {}, r.toGo === 0 ? 'done' : r.reached ? monthWords(r.reached.slice(0, 7)) + (r.by ? (r.onTime ? ', in time for ' : ', after ') + shortDate(r.by) : '') + (r.neededMonthly && r.onTime === false ? '; ' + money(r.neededMonthly) + ' a month would make it' : '') : r.by ? 'no set-aside yet; ' + (r.neededMonthly === null ? '' : money(r.neededMonthly) + ' a month by ' + shortDate(r.by)) : 'no set-aside yet'), h('td', {}, r.fiCostMonths === null ? '' : plural(r.fiCostMonths, 'month') + ' later')))))) : h('p', { class: 'muted' }, 'No goals beyond financial independence yet.'),
    h('ul', { class: 'go-list' }, goRow(numbersHref('goals'), 'Your goals in My numbers', 'Add a goal or change one')),
    g.rows.length ? math('goals', g.rows.filter((r) => r.toGo !== null).map((r) => 'plan:goal:' + r.id), mathCtx(m)) : null);
}

function solveScreen(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const byAge = kept().byAge || '';
  const age = h('input', { id: 'solve-age', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '60' });
  age.value = byAge;
  const parsed = byAge.trim() === '' ? { ok: true, value: null } : parseInput('int', byAge);
  const x = solvers(m.spine, m.rules, m.s, { byAge: parsed.ok ? parsed.value : null });
  return h('section', { class: 'card', 'aria-label': SCREENS.solve },
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const p = age.value.trim() === '' ? { ok: true } : parseInput('int', age.value); if (!p.ok) { msg.textContent = p.message; return; } keep({ byAge: age.value.trim() }); refresh(); } },
      h('label', { for: 'solve-age', class: 'edit-label' }, 'Financially independent by age'), age, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Solve'))),
    x.rows.length ? [h('p', { class: 'tile-sub' }, 'To reach ' + money(x.fiNumber) + ' by ' + x.targetAge + ' (' + Math.round(x.years) + ' years from ' + x.age + ') from ' + money(x.invested) + ' invested at ' + pct(x.realReturn, 1) + ' real' + (x.yearsNow !== null ? '; on the saving as it is, about ' + x.yearsNow.toFixed(1) + ' years' : '; on the saving as it is, never') + '.'),
      h('ul', {}, x.rows.map((r) => h('li', {}, h('strong', {}, r.label + ': '), r.value === null ? r.words : (r.unit === 'ratio' ? pct(r.value, 1) : money(r.value) + ' a month') + ' (' + r.words + ')'))),
      h('p', { class: 'tile-note' }, kindChip(x.kind), ' Each answer changes one thing and holds everything else the same.'),
      math('solve', x.rows.filter((r) => r.value !== null).map((r) => 'plan:solve:' + r.id), () => mathCtx(m)({ solvers: x }))] : h('p', { class: 'muted missing-row' }, x.note));
}

function wageScreen(m) {
  const w = realHourlyWage(m.spine, m.rules, m.s);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const hours = h('input', { id: 'wage-hours', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '40' }); hours.value = w.hoursWeek === null ? '' : String(w.hoursWeek);
  const commute = h('input', { id: 'wage-commute', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 45' }); commute.value = m.base.household.commuteHoursPerWeek && m.base.household.commuteHoursPerWeek.value !== null ? String(m.base.household.commuteHoursPerWeek.value) : '';
  return h('section', { class: 'card', 'aria-label': SCREENS.wage },
    h('p', { class: 'muted' }, 'What you keep for each hour of work and commute.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const a = parseInput('int', hours.value); if (!a.ok) { msg.textContent = 'Hours: ' + a.message; hours.focus(); return; }
      const c = commute.value.trim() === '' ? { ok: true, value: 0 } : parseInput('int', commute.value); if (!c.ok) { msg.textContent = 'Commute: ' + c.message; commute.focus(); return; }
      change((x) => putFact(putFact(x, 'household.workHoursPerWeek', a.value, 'known', todayIso()), 'household.commuteHoursPerWeek', c.value, 'known', todayIso()), said.changed('Hours worked a week', a.value + ', with a commute of ' + c.value));
    } },
      h('label', { for: 'wage-hours', class: 'edit-label' }, 'Hours worked a week'), hours,
      h('label', { for: 'wage-commute', class: 'edit-label' }, 'Commute hours a week'), commute, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'))),
    h('p', { class: 'tile-sub' }, kindChip(w.kind), ' ', w.wage === null ? h('span', { class: 'missing-row' }, 'Missing: hours worked a week' + (w.takeHome === null ? ' and take-home pay' : '')) : h('strong', {}, money(w.wage, true) + ' an hour of life'), w.wage !== null ? ' (' + money(w.takeHome) + ' take-home less ' + money(w.costMonthly) + ' of work costs, over ' + w.hoursMonthly + ' hours a month' + (w.naive !== w.wage ? '; ' + money(w.naive, true) + ' before the commute and the costs' : '') + '). The Spending page can show every amount as hours.' : ''),
    w.costs.length ? h('p', { class: 'tile-note' }, 'Costs of working: ' + w.costs.map((c) => c.label + ' ' + money(c.amount)).join(', ') + '.') : null,
    w.wage !== null ? math('wage', ['plan:wage'], mathCtx(m)) : null);
}

// Housing beside the 35% line, in dollars (Batch 8): a reference, never a verdict.
function housingOver(d) {
  const a = d.rows.find((r) => r.key === 'accommodation');
  if (!a || a.overReference === undefined) return null;
  return h('p', { class: 'tile-sub' }, a.overReference > 0 ? 'Housing is ' + money(a.overReference) + ' a month above the ' + pct(d.housingReference) + ' line.' : 'Housing is at or below the ' + pct(d.housingReference) + ' line.');
}
function drafttScreen(m) {
  const d = draftt(m.spine, m.rules, m.s);
  if (d.base.amount === null) return h('section', { class: 'card', 'aria-label': SCREENS.draftt }, h('p', { class: 'muted missing-row' }, 'Missing: take-home pay.'));
  const max = Math.max(0.01, ...d.rows.map((r) => r.share));
  return h('section', { class: 'card', 'aria-label': SCREENS.draftt },
    h('p', { class: 'muted' }, 'Debt, Retirement, Accommodation, Food, Transportation' + (d.rows.some((r) => r.key === 'therapy') ? ', Therapy' : '') + ', each as a share of take-home (Retirement of gross). The mark on housing is ' + pct(d.housingReference) + ' of take-home, for reference, not a target.'),
    h('ul', { class: 'letters' }, d.rows.map((r) => h('li', {}, h('span', { class: 'letter' }, r.letter), h('span', { class: 'lbar', role: 'img', 'aria-label': r.label + ' ' + pct(r.share, 1) }, h('span', { class: 'lfill', style: 'width:' + pc(Math.min(1, r.share / max)) }), r.reference ? h('span', { class: 'lref', style: 'left:' + pc(Math.min(1, r.reference / max)), title: 'reference ' + pct(r.reference) }) : null), h('span', { class: 'lamt' }, money(r.amount) + ' (' + pct(r.share, 1) + ')')))),
    housingOver(d),
    h('p', { class: 'tile-sub' }, kindChip(d.kind), ' DRAFTT is ' + pct(d.totalShare, 1) + ' of ' + money(d.base.takeHome) + ' take-home; everything else ' + money(d.everythingElse) + '; left over ' + (d.leftOver === null ? 'unknown' : money(d.leftOver)) + '.'),
    math('draftt', d.rows.map((r) => 'plan:draftt:' + r.key), mathCtx(m)));
}

function floorScreen(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const shock = kept().shockMonths || '';
  const months = h('input', { id: 'shock-months', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '3' }); months.value = shock;
  const p = shock.trim() === '' ? { ok: true, value: null } : parseInput('int', shock);
  const f = fixedFloor(m.spine, m.rules, m.s, m.sim, { months: p.ok ? p.value : null });
  return h('section', { class: 'card', 'aria-label': SCREENS.floor },
    h('p', { class: 'tile-sub' }, kindChip(f.kind), ' ', f.floor === null ? h('span', { class: 'missing-row' }, 'Missing: the amount of a fixed cost') : 'Fixed costs ' + money(f.floor) + ' a month (' + f.items.map((i) => i.label).join(', ') + (f.items.length ? ', plus' : '') + ' minimum payments ' + money(f.minimums) + '). ' + (f.runwayMonths === null ? '' : 'Cash (' + money(f.cash) + ') covers it for ' + f.runwayMonths + ' months.' + (f.setAsideNote ? ' ' + f.setAsideNote : ''))),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const q = months.value.trim() === '' ? { ok: true } : parseInput('int', months.value); if (!q.ok) { msg.textContent = q.message; return; } keep({ shockMonths: months.value.trim() }); refresh(); } },
      h('label', { for: 'shock-months', class: 'edit-label' }, 'If every paycheck stopped for this many months'), months, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Run it'))),
    f.shock ? h('div', { class: 'tool-result' + (f.shock.firstBad ? ' bad' : '') }, f.shock.firstBad ? 'With no income for ' + f.shock.months + ' months from ' + shortDate(f.shock.from) + ', checking goes under the floor on ' + shortDate(f.shock.firstBad) + ' (' + f.shock.runwayDays + ' days). At risk: ' + f.shock.atRisk.map((x) => x.label + ' ' + money(x.amount) + ' on ' + shortDate(x.date)).join('; ') + '.' : 'With no income for ' + f.shock.months + ' months from ' + shortDate(f.shock.from) + ', checking stays above the floor (lowest ' + money(f.shock.low.amount) + ' on ' + shortDate(f.shock.low.date) + ').') : null,
    h('p', { class: 'tile-note' }, 'A fixed cost is a line marked fixed in My numbers. This plays out your next months day by day with every paycheck taken away.'),
    math('floor', ['plan:floor'], mathCtx(m)));
}

function outlookScreen(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const want = kept().outlookRuns || '';
  const runs = h('input', { id: 'outlook-runs', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '200' }); runs.value = want;
  const p = want.trim() === '' ? { ok: true, value: null } : parseInput('int', want);
  const o = outlook(m.spine, m.rules, m.sim, { runs: p.ok && p.value ? Math.min(1000, Math.max(10, p.value)) : null });
  return h('section', { class: 'card', 'aria-labelledby': 'outlook-h' },
    h('h2', { id: 'outlook-h' }, o.runs + ' runs'),
    h('p', { class: 'muted' }, 'Your next three months, run many times with amounts up to ' + pct(o.wobble) + ' higher or lower. A bad run is worse than 9 in 10; a good run is better than 9 in 10.'),
    h('div', { class: 'clear-grid' }, h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, money(o.low.bad)), h('span', { class: 'clear-label' }, 'Lowest day, bad run')), h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, money(o.low.typical)), h('span', { class: 'clear-label' }, 'Lowest day, typical')), h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, money(o.low.good)), h('span', { class: 'clear-label' }, 'Lowest day, good run')), h('div', { class: 'clear-tile' + (o.shareBelowFloor > 0.2 ? ' beyond' : '') }, h('span', { class: 'clear-date' }, pct(o.shareBelowFloor)), h('span', { class: 'clear-label' }, 'of runs go under the floor'))),
    h('p', { class: 'tile-sub' }, kindChip(o.kind), ' Checking at the end: ' + money(o.end.bad) + ' bad, ' + money(o.end.typical) + ' typical, ' + money(o.end.good) + ' good. Card interest ' + money(o.interest.low) + ' to ' + money(o.interest.high) + '.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const q = runs.value.trim() === '' ? { ok: true } : parseInput('int', runs.value); if (!q.ok) { msg.textContent = q.message; return; } keep({ outlookRuns: runs.value.trim() }); refresh(); } }, h('label', { for: 'outlook-runs', class: 'edit-label' }, 'Runs (10 to 1,000)'), runs, msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Run again'))),
    math('outlook', ['plan:outlook'], () => mathCtx(m)({ outlook: o })));
}

function eventsScreen(m) {
  const k = kept();
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const pick = h('select', { id: 'event-pick' }, h('option', { value: '' }, 'Pick a life event'), ...templates.map((t) => h('option', { value: t.id }, t.label)));
  pick.value = k.event || '';
  const date = h('input', { id: 'event-date', type: 'date' }); date.value = k.eventDate || todayIso();
  const applied = [...new Set([...(m.base.income || []), ...(m.base.expenses || [])].map((x) => x.lifeEvent).filter(Boolean))];
  const chosen = templates.find((t) => t.id === pick.value);
  const labelOf = (id) => (templates.find((t) => t.id === id) || { label: id }).label;
  pick.addEventListener('change', () => { keep({ event: pick.value }); refresh(); });
  date.addEventListener('change', () => keep({ eventDate: date.value }));
  return h('section', { class: 'card', 'aria-label': SCREENS.events },
    h('p', { class: 'muted' }, 'Pick an event to see how it changes your plan.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const t = templates.find((x) => x.id === pick.value);
      if (!t) { msg.textContent = 'Pick an event'; pick.focus(); return; }
      if (!date.value) { msg.textContent = 'Pick a date'; date.focus(); return; }
      keep({ event: pick.value, eventDate: date.value });
      change((s) => applyLifeEvent(s, t, date.value).spine, said.added(t.label + ' from ' + shortDate(date.value)));
    } },
      h('label', { for: 'event-pick', class: 'edit-label' }, 'Event'), pick,
      chosen ? h('p', { class: 'edit-hint' }, chosen.summary + ' Lines: ' + chosen.items.map((i) => i.label + ' ' + (i.direction === 'in' ? '+' : '-') + money(i.cents / 100) + (EVENT_OFTEN[i.cadence] || '')).join('; ') + '.') : null,
      h('label', { for: 'event-date', class: 'edit-label' }, 'From'), date, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add it to my numbers'))),
    applied.length ? [h('h3', { class: 'month-h' }, 'In your numbers now'), h('ul', { class: 'restore-list' }, applied.map((id) => h('li', {}, h('strong', {}, labelOf(id)),
      h('button', { type: 'button', class: 'btn danger small', onclick: () => change((s) => removeLifeEvent(s, id), said.deleted(labelOf(id))) }, 'Remove'))))] : null);
}

// A life event's line, how often, in words ("a month", "every two weeks"); once says nothing.
const EVENT_OFTEN = { month: ' a month', monthly: ' a month', biweekly: ' every two weeks', weekly: ' a week', semimonthly: ' twice a month', quarterly: ' a quarter', yearly: ' a year', year: ' a year' };

function scenariosScreen(m) {
  const list = readScenarios();
  const k = kept();
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const nameBox = h('input', { id: 'scen-name', type: 'text', autocomplete: 'off', placeholder: 'Before the move' });
  const pick = h('select', { id: 'scen-pick' }, h('option', { value: '' }, 'Compare today with a saved one'), ...list.map((x) => h('option', { value: x.id }, x.name + ' (' + shortDate(x.savedAt.slice(0, 10)) + ')')));
  pick.value = list.some((x) => x.id === k.compareWith) ? k.compareWith : '';
  pick.addEventListener('change', () => { keep({ compareWith: pick.value }); refresh(); });
  const other = list.find((x) => x.id === pick.value);
  const diff = other ? diffSpines(other.spine, m.base) : null;
  // Saved scenarios live in this browser, outside the household: Undo (the bar, the header or Ctrl/Cmd+Z) puts the
  // list back, and Redo the list after the change.
  const putBack = (was, now, words) => say(words, () => { keepScenarios(was); refresh(); }, () => { keepScenarios(now); refresh(); });
  return h('section', { class: 'card', 'aria-label': SCREENS.scenarios },
    h('p', { class: 'muted' }, 'A scenario is a copy of your numbers as they are now, saved in this browser under a name. Compare one with today, or load it to go back to it.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      if (!nameBox.value.trim()) { msg.textContent = 'Give it a name'; nameBox.focus(); return; }
      const entry = { id: 's' + Date.now(), name: nameBox.value.trim(), savedAt: new Date().toISOString(), spine: m.base };
      if (!keepScenarios([...list, entry])) { msg.textContent = 'This browser will not keep it (storage is blocked)'; return; }
      refresh();
      putBack(list, [...list, entry], said.added('Scenario ' + entry.name));
    } },
      h('label', { for: 'scen-name', class: 'edit-label' }, 'Save today as'), nameBox, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save the scenario'))),
    list.length ? [h('label', { for: 'scen-pick', class: 'edit-label' }, 'Compare'), pick,
      h('ul', { class: 'restore-list' }, list.map((x) => h('li', {}, h('strong', {}, x.name), h('span', { class: 'when' }, shortDate(x.savedAt.slice(0, 10))),
        h('button', { type: 'button', class: 'btn small', onclick: () => change(() => x.spine, said.changed('Your numbers', 'the scenario ' + x.name)) }, 'Load it'),
        h('button', { type: 'button', class: 'btn danger small', onclick: () => { const now = list.filter((y) => y.id !== x.id); keepScenarios(now); if (kept().compareWith === x.id) keep({ compareWith: '' }); refresh(); putBack(list, now, said.deleted('Scenario ' + x.name)); } }, 'Delete'))))] : null,
    diff ? [h('h3', { class: 'month-h' }, other.name + ' against today: ' + plural(diff.length, 'change')), diff.length ? diffList(m.base, other.spine, diff, 60) : h('p', { class: 'muted' }, 'Nothing differs.')] : null);
}
// A value in a diff, worded by its field's type ($1,950, 24%, Nov 3, 2026), as My numbers words it.
const typeAt = (a, b, p) => { try { const t = typeFor(a, p); return t === 'text' ? typeFor(b, p) : t; } catch { return 'text'; } };
const show = (x, type) => (x === null || x === undefined ? 'missing' : typeof x === 'object' ? JSON.stringify(x) : typeof x === 'number' && (type === 'text' || type === 'int') ? String(Math.round(x * 100) / 100) : showValue(x, type) || String(x));
const labelPath = (a, b, p) => { try { return labelFor(a, p) || labelFor(b, p) || p; } catch { return p; } };
const diffList = (a, b, diff, n) => h('ul', { class: 'diff-list' }, diff.slice(0, n).map((d) => { const t = typeAt(a, b, d.path); return h('li', {}, h('span', { class: 'd-path' }, labelPath(a, b, d.path)), h('span', {}, d.change === 'added' ? 'added: ' + show(d.after, t) : d.change === 'removed' ? 'removed (was ' + show(d.before, t) + ')' : show(d.before, t) + ' to ' + show(d.after, t))); }));

function fileScreen(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const file = h('input', { id: 'import-file', type: 'file', accept: '.json,application/json', 'aria-label': 'A household file' });
  const download = (text, fileName, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const stamp = todayIso();
  const preview = pending ? (() => { try { const r = importJson(pending.text); return { ok: true, r, diff: diffSpines(m.base, r.spine) }; } catch (err) { return { ok: false, message: err.message }; } })() : null;
  return h('section', { class: 'card', 'aria-label': SCREENS.file },
    h('p', { class: 'muted' }, 'Download your numbers, or read in a file. You see what changes before anything is saved.'),
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: () => download(exportJson(m.base, { exportedAt: stamp }), 'slam-household-' + stamp + '.json', 'application/json') }, 'Download my numbers'), h('button', { type: 'button', class: 'btn', onclick: () => download(exportCsv(m.base, 'log'), 'slam-log-' + stamp + '.csv', 'text/csv') }, 'Download the log (CSV)'), h('button', { type: 'button', class: 'btn', onclick: () => download(exportCsv(m.base, 'lines'), 'slam-lines-' + stamp + '.csv', 'text/csv') }, 'Download the lines (CSV)')),
    h('div', { class: 'file-row' }, h('label', { for: 'import-file', class: 'edit-label' }, 'Read in a household file'), file, h('button', { type: 'button', class: 'btn', onclick: () => { const f = file.files && file.files[0]; if (!f) { msg.textContent = 'Pick a file first'; return; } f.text().then((t) => { pending = { text: t, name: f.name }; refresh(); }); } }, 'Read it')), msg,
    preview ? (preview.ok ? [h('p', { class: 'tile-sub' }, pending.name + ': a household file' + (preview.r.migrated ? ', brought up to date' : '') + (preview.r.exportedAt ? ', downloaded ' + shortDate(preview.r.exportedAt.slice(0, 10)) : '') + '. ' + plural(preview.diff.length, 'change') + ' against today.'),
      preview.diff.length ? diffList(m.base, preview.r.spine, preview.diff, 40) : null,
      // A file with nothing different has nothing to apply, so it records no step to undo.
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', disabled: !preview.diff.length, onclick: () => { const r = preview.r, fileName = pending.name; pending = null; change(() => r.spine, said.changed('Your numbers', 'the file ' + fileName)); } }, preview.diff.length ? 'Apply the file' : 'Nothing to apply'), h('button', { type: 'button', class: 'btn ghost', onclick: () => { pending = null; refresh(); } }, 'Discard'))] : h('p', { class: 'edit-msg', role: 'alert' }, pending.name + ': ' + preview.message)) : null);
}

startPage({ tab: 'plan', title: 'Plan', name, render });

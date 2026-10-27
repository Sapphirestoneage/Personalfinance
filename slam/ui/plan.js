// The Plan page (S-208, Batch F; on the shell, S-230). The top screen is the Financial Order of Operations, one row a
// step, each opening its own screen (Plan › 3. High-interest debt), then "Got extra money?" (the Windfall page) and
// the rest of the plan, each on its own screen: the surplus step by step, the paychecks (each its own screen), how
// much to max it, goals, what it takes to get there, the real hourly wage, DRAFTT, if income stopped, the outlook,
// life events, saved scenarios, and download or import. The shell draws the tabs, the header with Undo and Redo, Back
// and the trail, and the bar; every change to the household goes through its change(), in words. What a screen has
// open (Show the math, a solve age, a picked event) is kept with its history entry, so coming back restores it.
// Every number comes from engine/plan.js and the engines under it, with Show the math. Formatting only.

import { foldRow } from './rows.js';
import { whatIf, movedSpine } from '../engine/whatif.js';
import { negotiationList, recordCall } from '../engine/negotiate.js';
import { goalsCard, savingsCurveCard, fiPathCard, scenarioCard } from './chart-cards.js';
import { chartCard, bars } from './chart.js';
import { goalBars, savingsCurve, fiPath, scenarioLines } from '../engine/charts.js';
import { startPage, change, said, keep, kept, refresh, say, numbersHref } from './shell.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { forecast, fixButton, lowWords } from './forecast.js';
import { rankSteps } from '../engine/next-step.js';
import { fooLadder, surplusWaterfall, allocator, paycheckPlan, solvers, realHourlyWage, draftt, fixedFloor, outlook, goalsView, applyLifeEvent, removeLifeEvent, diffSpines, exportJson, importJson, exportCsv } from '../engine/plan.js';
import { STEP_LABELS } from '../engine/windfall.js';
import { putFact, parseInput, recordDebtPayment } from '../engine/edits.js';
import { valueOf } from '../engine/spine.js';
import { mainChecking } from '../engine/defaults.js';
import { keptMath } from './math-panel.js';
import { maxItCard, maxItFor } from './maxit-panel.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { labelFor } from '../engine/labels.js';
import { h, chip, money, pct, shortDate, monthWords, ledgerHref, showValue, metric } from './view.js';
import { typeFor } from '../engine/ledger.js';
import { readScenarios, keepScenarios, targetId, keepTarget, saveScenario } from './scenarios-store.js';

const kindChip = (k) => chip(k === 'computed' ? 'known' : k);
const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const pc = (f) => Math.round(f * 1000) / 10 + '%';
const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many);
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
  surplus: 'Left after saving, step by step', paychecks: 'Paychecks', 'max-it': 'How much to max it', goals: 'Goals',
  solve: 'What it takes to get there', whatif: 'What if', calls: 'Bills worth a call', wage: 'Real hourly wage', draftt: 'Where your take-home goes', floor: 'If income stopped',
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
  const screen = { surplus: surplusScreen, 'max-it': (x) => maxItCard(x.spine, x.rules), goals: goalsScreen, solve: solveScreen, whatif: whatIfScreen, calls: callsScreen, wage: wageScreen, draftt: drafttScreen, floor: floorScreen, outlook: outlookScreen, events: eventsScreen, scenarios: scenariosScreen, file: fileScreen }[a];
  return screen ? screen(m) : stepScreen(m, stepOf(m, a));
}

// ---------------------------------------------------------------- the top: the steps, Got extra money?, the rest
// One step (Krug pass): no "a month" or "Next" pills. The current step is open, with "Now" and its reason; a step
// waiting on a number is a question, not a red chip; steps that finish in the same month say so once.
const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
function stepRow(r, current, together = null) {
  const now = r.id === current && !r.done;
  const when = r.completes ? 'about ' + monthWords(r.completes.slice(0, 7)) : r.months === null ? 'no surplus to fund it yet' : null;
  const status = r.need === null ? ['Answer one question to finish this step']
    : r.done ? ['Done']
      : [now ? 'Now: ' : null, h('span', { class: 'go-total' }, money(r.need) + (r.flow ? ' a month' : '')), when, r.kind === 'rough' || r.kind === 'incomplete' ? kindChip(r.kind) : null];
  return h('li', {}, h('a', { class: 'go-row' + (r.done ? ' is-done' : '') + (now ? ' is-current' : '') + (r.need === null ? ' is-question' : ''), href: '#/' + slug(r.id) },
    h('span', { class: 'go-mark', 'aria-hidden': 'true' }, r.done ? '✓' : r.need === null ? '?' : String(r.rung)),
    h('span', { class: 'go-name' }, r.label),
    h('span', { class: 'go-sub' }, ...status.filter(Boolean)),
    now && r.why ? h('span', { class: 'go-why' }, r.why) : null,
    together ? h('span', { class: 'go-why' }, 'These ' + (NUM[together.n] || together.n) + ' run together from ' + monthWords(together.from) + ', sharing the surplus.') : null));
}
// Steps that finish in the same month: the first of them carries the one line that says why.
function togetherOf(rungs) {
  const open = rungs.filter((r) => !r.done && r.need !== null && r.completes);
  const by = new Map();
  for (const r of open) { const k = r.completes.slice(0, 7); by.set(k, [...(by.get(k) || []), r]); }
  const out = new Map();
  for (const list of by.values()) if (list.length > 1) out.set(list[0].id, { n: list.length, from: (list.map((r) => r.starts || r.completes).sort()[0] || list[0].completes).slice(0, 7) });
  return out;
}

// The outlook in one sentence (Batch 8); the runs are behind Show the math and on its own screen.
// It leads with the one forecast every screen reads (ui/forecast.js), so the Plan names the same lowest day as Today,
// the Calendar and Spending; the runs (good and bad months) are on the outlook's own screen.
function outlookLine(m) {
  const { story } = forecast(m.base, m.rules);
  if (!story) return null;
  return [h('p', { class: 'tile-sub outlook-line', id: 'cash-low' }, lowWords(story) + ' ', h('a', { href: '#/outlook' }, 'Good and bad months')),
    story.under ? h('div', { class: 'edit-actions' }, fixButton(story, 'btn small')) : null];
}
// Protection gaps rank with the steps (engine/next-step.js) but are not steps of the order: one line, each a link.
function protectLine(rank) {
  const p = rank.steps.filter((x) => x.id.startsWith('protect:'));
  if (!p.length) return null;
  return h('p', { class: 'tile-sub' }, (rank.first && rank.first.id.startsWith('protect:') ? 'Next, before these: ' : 'Also on your list: '), p.map((x, i) => [i ? ', ' : '', h('a', { href: x.href }, x.label.toLowerCase())]), '.');
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
        : [metric('leftAfterSaving', money(surplus)), ' a month left after saving goes to these steps, in order.']),
    outlookLine(m),
    h('section', { 'aria-labelledby': 'foo-h' },
      h('h2', { id: 'foo-h' }, 'Your steps, in order'),
      h('ol', { class: 'go-list' }, (() => { const t = togetherOf(f.rungs); return f.rungs.map((r) => stepRow(r, f.current, t.get(r.id) || null)); })()),
      protectLine(m.rank),
      math('foo', f.rungs.filter((r) => r.need !== null).map((r) => 'plan:foo:' + r.id), mathCtx(m))),
    // The Windfall page sits under Plan: the whole card is the way in.
    h('ul', { class: 'go-list' }, goRow('windfall.html', 'Got extra money?', 'Bonus, gift or refund')),
    // More about your plan (Krug pass): three rows that open, each saying its most useful fact on the closed line;
    // open or closed is kept with the screen.
    h('section', { 'aria-label': 'More about your plan' },
      fold('month', 'Your money each month', [h('span', { class: 'go-total', 'data-metric': 'leftAfterSaving' }, money(w.surplus)), ' a month left'],
        h('ul', { class: 'go-list' },
          goRow('#/surplus', SCREENS.surplus, w.note || [h('span', { class: 'go-total' }, money(w.surplus)), 'a month']),
          a.paychecks.length ? goRow('#/paychecks', SCREENS.paychecks, plural(a.paychecks.length, 'paycheck') + ' in the next three months: what each one covers') : null,
          goRow('#/wage', SCREENS.wage, wage.wage === null ? [chip('missing'), 'Needs your hours worked a week'] : [h('span', { class: 'go-total' }, money(wage.wage, true)), 'an hour, after work costs']),
          goRow('#/draftt', SCREENS.draftt, 'Your big costs as shares of take-home'),
          goRow('#/calls', SCREENS.calls, callsFact(m)),
          goRow('#/floor', SCREENS.floor, fl.floor === null ? [chip('missing'), 'Needs the amount of a fixed cost'] : [h('span', { class: 'go-total' }, money(fl.floor)), 'a month of fixed costs']))),
      fold('future', 'Your future', g.rows.length ? plural(g.rows.length, 'goal') + (events.length ? ', ' + plural(events.length, 'event') : '') : events.length ? plural(events.length, 'event') : 'Goals, retirement room, what-ifs',
        h('ul', { class: 'go-list' },
          goRow('#/max-it', SCREENS['max-it'], 'Room left in each retirement account'),
          goRow('#/goals', SCREENS.goals, g.rows.length ? [h('span', { class: 'go-total' }, plural(g.rows.length, 'goal')), g.setAsideTotal ? money(g.setAsideTotal) + ' a month set aside' : null] : 'No goals beyond financial independence yet'),
          goRow('#/whatif', SCREENS.whatif, 'Spend less, earn more, pay debt faster: watch the dates move'),
          goRow('#/solve', SCREENS.solve, 'Pick an age, see what it takes'),
          goRow('#/outlook', SCREENS.outlook, 'How the next three months could go'),
          goRow('#/events', SCREENS.events, events.length ? plural(events.length, 'event') + ' in your numbers' : 'A new job, a move, a baby'))),
      fold('files', 'Saved and files', saved.length ? plural(saved.length, 'scenario') + ' saved' : 'Download or read in a file',
        h('ul', { class: 'go-list' },
          goRow('#/scenarios', SCREENS.scenarios, saved.length ? plural(saved.length, 'scenario') + ' saved in this browser' : 'Save today to compare later'),
          goRow('#/file', SCREENS.file, 'Download your numbers, or read in a file'))))
  ];
}
// A row that opens in place: its title and one fact on the closed line.
const fold = (key, title, fact, body) => h('details', { class: 'card done-group plan-fold', open: (kept().folds || {})[key] || null, ontoggle: (e) => { const f = { ...(kept().folds || {}) }; if (!!f[key] === e.target.open) return; f[key] = e.target.open; keep({ folds: f }); } },
  h('summary', {}, h('span', {}, title), h('span', { class: 'count' }, fact)), body);

// ---------------------------------------------------------------- one step
function deductibleForm(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const ded = h('input', { id: 'foo-ded', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 2,500', 'aria-describedby': 'foo-ded-hint' });
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
    r.id === 'reserves' ? h('p', { class: 'tile-sub' }, f.setup.reserveMonths === null ? 'The cushion target needs a birth date.' : 'Your target: ' + f.setup.reserveMonths.toFixed(1) + ' months of spending (a month for every five years of age).') : null,
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
    const box = h('input', { id: 'pay-' + d.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 200', 'aria-label': 'Payment on ' + name });
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

// Paychecks (Track D): every dollar of each one has a job. A stacked bar per paycheck (bills, everyday, tax, kept for a
// later paycheck, the Plan's step), an arrow where one paycheck carries a later short one, and three-paycheck months
// marked. Tap a paycheck for its jobs line by line.
const JOB = { bill: [1, 'Bills'], everyday: [3, 'Everyday spending'], tax: [4, 'Tax set aside'], carry: [5, 'Kept for a later paycheck'], plan: [2, 'To the Plan'] };
const jobLabel = (j) => (j.kind === 'carry' ? 'Kept for the ' + shortDate(j.to) + ' paycheck' : j.label);
const checkingNow = (m) => { const id = mainChecking(m.spine); const a = id && (m.spine.accounts || []).find((x) => x.id === id); return a ? valueOf(a.balance) ?? null : null; };
const planOf = (m) => m.pplan || (m.pplan = paycheckPlan(allocOf(m), { checking: checkingNow(m), step: (() => { const r = m.foo.rungs.find((x) => x.id === m.foo.current); return r ? { id: r.id, label: 'Plan step: ' + r.label } : null; })() }));
function paychecksScreen(m) {
  const a = planOf(m);
  if (!a.paychecks.length) return h('p', { class: 'card muted' }, 'No paychecks in the next three months.');
  const third = (p) => p.bonus ? h('span', { class: 'pill' }, (p.cadence === 'weekly' ? '5th' : '3rd') + ' paycheck in ' + monthWords(p.ym).split(' ')[0]) : null;
  const totals = (p) => Object.keys(JOB).map((k) => ({ k, v: p.byKind[k] })).filter((x) => x.v > 0);
  const chart = chartCard({ id: 'paycheck-jobs', question: 'What does each paycheck pay for?',
    summary: 'Every dollar of each paycheck has a job until the next one.' + (a.paychecks.some((p) => p.carryOut) ? ' Where one would come up short, the one before it keeps the difference.' : '') + (a.fromChecking ? ' ' + money(a.fromChecking) + ' has to be in checking already' + (a.shortBy ? '; checking holds ' + money(a.checking) + ', so it comes up ' + money(a.shortBy) + ' short before the next paycheck. The Calendar runs every day and every card, so its lowest day is the one to act on.' : '.') : ''),
    draw: (w) => bars({ width: w, rows: a.paychecks.map((p) => ({ label: shortDate(p.date).replace(/, \d{4}$/, ''), segs: totals(p).map((x) => ({ v: x.v, c: JOB[x.k][0], tip: shortDate(p.date) + ', ' + JOB[x.k][1].toLowerCase() + ': ' + money(x.v) })), value: money(p.assigned) })), label: 'Each paycheck by its jobs' }),
    legend: Object.values(JOB).map(([c, words]) => ({ c, words })),
    table: { head: ['Paycheck', ...Object.values(JOB).map((x) => x[1]), 'In all'], rows: a.paychecks.map((p) => [shortDate(p.date) + ': ' + p.label, ...Object.keys(JOB).map((k) => money(p.byKind[k])), money(p.assigned)]) } });
  return [
    h('p', { class: 'lede' }, 'Every dollar of each paycheck, assigned until the next one. The last one shown counts no bills after the three months, so more of it reads as going to the Plan.' + (a.bonusMonths.length ? ' Three-paycheck months: ' + a.bonusMonths.map(monthWords).join(', ') + '.' : '')),
    h('ul', { class: 'go-list pay-list' }, a.paychecks.flatMap((p) => [
      goRow('#/paychecks/' + encodeURIComponent(payId(p)), [shortDate(p.date) + ': ' + p.label, third(p) ? [' ', third(p)] : null],
        [h('span', { class: 'go-total' }, money(p.amount)), p.carryIn ? ' plus ' + money(p.carryIn) + ' carried in' : '', (p.left > 0.004 ? '· ' + money(p.left) + ' to the Plan' : '· all to bills and spending')]),
      p.carryOut ? h('li', { class: 'pay-arrow', 'aria-label': money(p.carryOut) + ' carried to the ' + shortDate(p.carryTo) + ' paycheck' }, h('span', { 'aria-hidden': 'true' }, '\u2193'), ' ' + money(p.carryOut) + ' carried to the ' + shortDate(p.carryTo) + ' paycheck') : null])),
    h('section', { class: 'card' }, chart)
  ];
}

function paycheckScreen(m, p0) {
  const p = planOf(m).paychecks.find((x) => payId(x) === payId(p0)) || p0;
  const jobs = p.jobs || [];
  return h('section', { class: 'card', 'aria-label': shortDate(p.date) + ': ' + p.label },
    h('p', { class: 'max-big' }, money(p.amount)),
    h('p', { class: 'tile-sub' }, (p.bonus ? 'A bonus paycheck: monthly bills are already covered by the others. ' : '') + (p.carryIn ? money(p.carryIn) + ' carried in from ' + (p.carryInFrom === 'checking' ? 'checking already there' : 'the ' + shortDate(p.carryInFrom) + ' paycheck') + '. ' : '') + 'Every dollar has a job until the next paycheck.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Job'), h('th', {}, 'Due'), h('th', { class: 'num' }, 'Amount'))),
      h('tbody', {}, p.carryIn ? h('tr', { class: 'muted' }, h('td', {}, 'Carried in'), h('td', {}, ''), h('td', { class: 'num' }, '+' + money(p.carryIn))) : null,
        ...jobs.map((j) => h('tr', {}, h('td', {}, j.kind === 'tax' ? 'Tax set aside (' + pct(p.setAsideRate, 1) + ' of a 1099 deposit)' + (p.setAsideMissing ? '; the rate is partly missing' : '') : j.kind === 'plan' && j.step ? h('a', { href: '#/' + slug(j.step) }, jobLabel(j)) : jobLabel(j)), h('td', {}, j.date ? shortDate(j.date) : j.kind === 'carry' ? shortDate(j.to) : ''), h('td', { class: 'num' }, money(j.amount))))),
      h('tfoot', {}, h('tr', {}, h('td', {}, h('strong', {}, 'Assigned')), h('td', {}), h('td', { class: 'num' }, money(p.assigned)))))),
    math('pay', ['plan:pay:' + p.date + ':' + p.streamId], mathCtx(m)));
}

function goalsScreen(m) {
  const g = goalsView(m.spine, m.rules, m.s);
  const bars = goalsCard(goalBars(g));
  return [bars ? h('section', { class: 'card' }, bars) : null, h('section', { class: 'card', 'aria-label': SCREENS.goals },
    g.setAsideTotal ? h('p', { class: 'muted' }, money(g.setAsideTotal) + ' a month goes to goals.') : null,
    g.rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Goal'), h('th', { class: 'num' }, 'Target'), h('th', { class: 'num' }, 'There'), h('th', { class: 'num' }, 'To go'), h('th', {}, 'Reached'), h('th', {}, 'Costs the FI date'))),
      h('tbody', {}, g.rows.map((r) => h('tr', { class: r.onTime === false ? 'tight' : '' }, h('td', {}, h('a', { href: ledgerHref(r.path) }, r.label), r.sinking ? [' ', h('span', { class: 'pill' }, 'sinking fund')] : null, r.priority !== null ? [' ', h('span', { class: 'pill' }, 'priority ' + r.priority)] : null, r.repeat ? [' ', h('span', { class: 'pill' }, 'yearly')] : null), h('td', { class: 'num' }, r.target === null ? 'missing' : money(r.target)), h('td', { class: 'num' }, r.held === null ? 'none yet' : money(r.held)), h('td', { class: 'num' }, r.toGo === null ? 'missing' : money(r.toGo)), h('td', {}, r.toGo === 0 ? 'done' : r.reached ? monthWords(r.reached.slice(0, 7)) + (r.by ? (r.onTime ? ', in time for ' : ', after ') + shortDate(r.by) : '') + (r.neededMonthly && r.onTime === false ? '; ' + money(r.neededMonthly) + ' a month would make it' : '') : r.by ? 'no set-aside yet; ' + (r.neededMonthly === null ? '' : money(r.neededMonthly) + ' a month by ' + shortDate(r.by)) : 'no set-aside yet'), h('td', {}, r.fiCostMonths === null ? '' : plural(r.fiCostMonths, 'month') + ' later')))))) : h('p', { class: 'muted' }, 'No goals beyond financial independence yet.'),
    h('ul', { class: 'go-list' }, goRow(numbersHref('goals'), 'Your goals in My numbers', 'Add a goal or change one')),
    g.rows.length ? math('goals', g.rows.filter((r) => r.toGo !== null).map((r) => 'plan:goal:' + r.id), mathCtx(m)) : null)];
}

// What if (Track F): four sliders move a copy of the numbers in memory; the dates move as they slide. Nothing changes
// in My numbers; "Save as a scenario" keeps the moved copy beside the others (Undo takes the save back).
// LIVE-FORM: built once. A slide redraws only the results under the sliders, never the sliders.
const MOVES = [
  ['spendLess', 'Spend less a month', 0, 1000, 25, 'Off the everyday lines (not rent or other fixed costs), shared by their size'],
  ['earnMore', 'Earn more a month, before tax', 0, 2000, 50, 'On your biggest paycheck, taxed like the rest of it'],
  ['extraDebt', 'Extra to debt a month', 0, 1000, 25, 'On top of the extra already set, in the plan\'s order'],
  ['windfall', 'A windfall, once', 0, 50000, 500, 'Sent where Got extra money? would send it']
];
function whatIfScreen(m) {
  const moves = { spendLess: 0, earnMore: 0, extraDebt: 0, windfall: 0, ...(kept().moves || {}) };
  const out = h('div', { class: 'wi-out', 'aria-live': 'polite' });
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  let last = null, timer = null;
  const months = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  const row = (label, now, then, words) => h('div', { class: 'wi-row' + (now !== then ? ' is-moved' : '') }, h('span', { class: 'wi-label' }, label), h('span', { class: 'wi-now' }, now), h('span', { class: 'wi-arrow', 'aria-hidden': 'true' }, '\u2192'), h('span', { class: 'wi-then' }, then), words ? h('span', { class: 'wi-words' }, words) : null);
  const draw = () => {
    // Read under the picked assumption set, as the rest of the Plan is (round 1: one FI year everywhere).
    last = whatIf(m.spine, m.rules, moves, todayIso());
    const a = last.now, b = last.then;
    const free = (x) => (x.neverPaysOff ? 'not at this pace' : x.debtFreeYm ? monthWords(x.debtFreeYm) : 'no debt');
    const dm = a.debtFreeYm && b.debtFreeYm ? months(b.debtFreeYm, a.debtFreeYm) : 0;
    out.replaceChildren(
      row('Left after saving, a month', money(a.surplus), money(b.surplus)),
      row('Debt free', free(a), free(b), dm > 0 ? plural(dm, 'month') + ' sooner' : dm < 0 ? plural(-dm, 'month') + ' later' : null),
      row('Interest on the way', money(a.interest), money(b.interest)),
      row('Financial independence', a.fiYear === null ? 'not at this pace' : 'about ' + a.fiYear, b.fiYear === null ? 'not at this pace' : 'about ' + b.fiYear, a.fiYear !== null && b.fiYear !== null && a.fiYear !== b.fiYear ? plural(Math.abs(a.fiYear - b.fiYear), 'year') + (b.fiYear < a.fiYear ? ' sooner' : ' later') : null));
  };
  const saveBtn = h('button', { type: 'submit', class: 'btn primary' }, 'Save as a scenario');
  const why = h('p', { class: 'edit-hint' });
  const canSave = () => { const any = Object.values(moves).some((x) => x > 0); saveBtn.disabled = !any; why.textContent = any ? '' : 'Slide something first: at zero it is today.'; };
  const soon = () => { canSave(); clearTimeout(timer); timer = setTimeout(() => { keep({ moves: { ...moves } }); draw(); }, 120); };
  const sliders = MOVES.map(([key, label, min, max, step, hint]) => {
    const read = h('output', { class: 'wi-value', for: 'wi-' + key }, money(moves[key]));
    const r = h('input', { type: 'range', id: 'wi-' + key, min, max, step, value: moves[key], 'aria-describedby': 'wi-' + key + '-hint' });
    r.addEventListener('input', () => { moves[key] = +r.value; read.textContent = money(moves[key]); soon(); });
    return h('div', { class: 'wi-field' }, h('div', { class: 'wi-head' }, h('label', { for: 'wi-' + key, class: 'edit-label' }, label), read), r, h('p', { class: 'edit-hint', id: 'wi-' + key + '-hint' }, hint));
  });
  const name = h('input', { id: 'wi-name', type: 'text', autocomplete: 'off', placeholder: 'e.g. Cut back and pay debt' });
  const save = (e) => {
    e.preventDefault();
    if (!Object.values(moves).some((x) => x > 0)) { msg.textContent = 'Move a slider first'; return; }
    const before = readScenarios();
    const entry = saveScenario(name.value.trim() || 'What if: ' + MOVES.filter(([k]) => moves[k] > 0).map(([k, label]) => label.toLowerCase().replace(/ a month.*|, once/, '') + ' ' + money(moves[k])).join(', '), movedSpine(m.base, m.rules, moves, todayIso()));
    if (!entry) { msg.textContent = 'This browser will not keep it (storage is blocked)'; return; }
    msg.textContent = '';
    say(said.added('Scenario ' + entry.name), () => { keepScenarios(before); refresh(); }, () => { keepScenarios([...before, entry]); refresh(); });
  };
  draw(); canSave();
  return h('section', { class: 'card', 'aria-label': SCREENS.whatif },
    h('p', { class: 'muted' }, 'Slide to see what moves. Your numbers stay as they are.'),
    h('div', { class: 'wi-sliders' }, sliders),
    out,
    h('form', { class: 'tool-form', novalidate: true, onsubmit: save },
      h('label', { for: 'wi-name', class: 'edit-label' }, 'Name it (optional)'), name, msg,
      why,
      h('div', { class: 'edit-actions' }, saveBtn,
        h('button', { type: 'button', class: 'btn', onclick: () => { keep({ moves: null }); refresh(); } }, 'Set all back to zero'))),
    h('ul', { class: 'go-list' }, goRow('#/scenarios', SCREENS.scenarios, 'Compare or load a saved one')));
}

// Bills worth a call (Track H): phone, internet, TV, insurance, the gym and cards charging more than the table's rate
// (data/negotiable-<year>.json), each with what it costs against typical, a call script, and "I called" with the new
// price (it goes into My numbers; the call is kept with its date; Undo takes it back).
let negotiable = null;
try { const r = await fetch(new URL('../data/negotiable-2026.json', import.meta.url), { cache: 'no-store' }); if (r.ok) negotiable = await r.json(); } catch { /* offline: no list */ }
const callsOf = (m) => m.calls || (m.calls = negotiationList(m.base, summarize(m.base, m.rules, { flags: false }).cashflow, negotiable));
function callsFact(m) {
  const list = callsOf(m), over = list.filter((x) => x.above > 0);
  return !negotiable ? 'The list of typical prices did not load' : !list.length ? 'Nothing on the list' : over.length ? plural(over.length, 'bill') + ' above typical' : plural(list.length, 'bill') + ' worth a look';
}
const rateWords = (r) => Math.round(r * 10000) / 100 + '%';
const nowWords = (x) => (x.kind === 'card' ? rateWords(x.now) + ' a year' : money(x.now) + ' a month');
function callsScreen(m) {
  const list = callsOf(m);
  if (!negotiable) return h('section', { class: 'card' }, h('p', { class: 'muted' }, 'The list of typical prices did not load. Try again when online.'));
  if (!list.length) return h('section', { class: 'card' }, h('p', { class: 'muted' }, 'No phone, internet, TV, insurance or gym bills, and no card above ' + pct(negotiable.cardRateAbove, 0) + '.'));
  const call = (x) => {
    const box = h('input', { id: 'call-' + x.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: x.kind === 'card' ? 'e.g. 18%' : 'e.g. 45', 'aria-describedby': 'call-' + x.id + '-hint' });
    const msg = h('p', { class: 'edit-msg', role: 'alert' });
    const save = (e) => {
      e.preventDefault();
      const p = parseInput(x.kind === 'card' ? 'rate' : 'money', box.value);
      if (!p.ok || p.value === null) { msg.textContent = p.message || 'Type the new price'; return; }
      change((sp) => recordCall(sp, x, p.value, todayIso()), said.changed(x.label + (x.kind === 'card' ? ' rate' : ''), x.kind === 'card' ? pct(p.value, 1) + ' after a call' : money(p.value) + ' a month after a call'));
    };
    return h('details', { class: 'call-fold' }, h('summary', { class: 'btn small' }, 'I called'), h('form', { class: 'tool-form call-form', novalidate: true, onsubmit: save },
      h('label', { for: 'call-' + x.id, class: 'edit-label' }, x.kind === 'card' ? 'New rate after the call' : 'New price a month after the call'), box,
      h('p', { class: 'edit-hint', id: 'call-' + x.id + '-hint' }, x.kind === 'card' ? 'Now ' + rateWords(x.now) + '; type the same if it did not change' : 'Now ' + money(x.now) + '; type the same if it did not change'), msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn small primary' }, 'Save the new price'))));
  };
  const bills = list.filter((x) => x.kind === 'bill');
  return [
    h('section', { class: 'card', 'aria-label': SCREENS.calls },
      h('p', { class: 'muted' }, 'One call each, most dollars a month at stake first. Typical prices are a starting table to check, not a promise.'),
      h('ol', { class: 'audit-list' }, list.map((x) => h('li', { class: 'audit-row' },
        h('div', { class: 'audit-head' }, h('a', { href: ledgerHref(x.path) }, x.label), h('span', { class: 'audit-cost' }, nowWords(x))),
        h('p', { class: 'tile-sub' }, x.kind === 'card' ? (x.promo ? 'Intro ' + rateWords(x.promo.rate) + ' until ' + shortDate(x.promo.ends) + ', then ' + rateWords(x.now) + ': about ' + money(x.yearCost) + ' of interest a year at this balance after that' : 'Above ' + pct(x.typical, 0) + '; about ' + money(x.yearCost) + ' of interest a year at this balance') : x.above > 0 ? money(x.above) + ' a month above a typical ' + money(x.typical) : 'About typical (' + money(x.typical) + ')'),
        x.called ? h('p', { class: 'tile-sub' }, 'Called ' + shortDate(x.called.date) + ': ' + (x.kind === 'card' ? rateWords(x.called.from) + ' to ' + rateWords(x.called.to) : money(x.called.from) + ' to ' + money(x.called.to))) : null,
        h('details', { class: 'script-fold' }, h('summary', {}, 'Call script'), h('p', { class: 'script' }, x.script),
          h('button', { type: 'button', class: 'btn small', onclick: () => { try { navigator.clipboard.writeText(x.script); say('Script copied'); } catch { say('Copy did not work here; select the words instead'); } } }, 'Copy the script')),
        call(x))))),
    bills.length ? h('section', { class: 'card' }, chartCard({ id: 'calls-chart', question: 'Which bills are above typical?',
      summary: bills.filter((x) => x.above > 0).length ? bills.filter((x) => x.above > 0).map((x) => x.label + ' by ' + money(x.above)).join('; ') + '.' : 'Every bill on the list is at or under typical.',
      draw: (w) => bars({ width: w, rows: bills.map((x) => ({ label: x.label, range: { v0: 0, v1: x.typical }, segs: [{ v: x.now, c: x.above > 0 ? 2 : 1, tip: x.label + ': ' + money(x.now) + ' a month, typical ' + money(x.typical) }], target: x.typical, targetTip: 'Typical: ' + money(x.typical), value: money(x.now) })), label: 'Bills against typical' }),
      legend: [{ c: 1, words: 'At or under typical' }, { c: 2, words: 'Above typical' }, { c: 0, words: 'Typical (the tick)', cls: 'sw-band' }],
      table: { head: ['Bill', 'A month', 'Typical', 'Above'], rows: bills.map((x) => [x.label, money(x.now), money(x.typical), x.above > 0 ? money(x.above) : '']) } })) : null
  ];
}

// The curve's target dot only for an age that was typed (round 2: no answer for an age nobody asked about).
const noTarget = (c, drop) => (c && drop ? { ...c, target: null } : c);
function solveScreen(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const byAge = kept().byAge || '';
  const age = h('input', { id: 'solve-age', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 60' });
  age.value = byAge;
  const parsed = byAge.trim() === '' ? { ok: true, value: null } : parseInput('int', byAge);
  const x = solvers(m.spine, m.rules, m.s, { byAge: parsed.ok ? parsed.value : null });
  return [h('section', { class: 'card', 'aria-label': SCREENS.solve },
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const p = age.value.trim() === '' ? { ok: true } : parseInput('int', age.value); if (!p.ok) { msg.textContent = p.message; return; } keep({ byAge: age.value.trim() }); refresh(); } },
      h('label', { for: 'solve-age', class: 'edit-label' }, 'Financially independent by age'), age, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Solve'))),
    !byAge.trim() ? h('p', { class: 'muted' }, 'Type the age you want to be financially independent by, and this says what it takes: the savings rate, the spending, the take-home or the return.') : x.rows.length ? [h('p', { class: 'tile-sub' }, 'To reach ' + money(x.fiNumber) + ' by ' + x.targetAge + ' (' + Math.round(x.years) + ' years from ' + x.age + ') from ' + money(x.invested) + ' invested at ' + pct(x.realReturn, 1) + ' real' + (x.yearsNow !== null ? '; on the saving as it is, about ' + x.yearsNow.toFixed(1) + ' years' : '; on the saving as it is, never') + '.'),
      h('ul', {}, x.rows.map((r) => h('li', {}, h('strong', {}, r.label + ': '), r.value === null ? r.words : (r.unit === 'ratio' ? pct(r.value, 1) : money(r.value) + ' a month') + ' (' + r.words + ')'))),
      h('p', { class: 'tile-note' }, kindChip(x.kind), ' Each answer changes one thing and holds everything else the same.'),
      math('solve', x.rows.filter((r) => r.value !== null).map((r) => 'plan:solve:' + r.id), () => mathCtx(m)({ solvers: x }))] : h('p', { class: 'muted missing-row' }, x.note)),
  // The same answer as two charts (Track C): years to FI at each savings rate, and the path to the FI number.
  x.rows.length ? h('section', { class: 'card' }, savingsCurveCard(noTarget(savingsCurve(x), !byAge.trim()), { yearsToFi: m.s.fi.yearsToFi.value }), fiPathCard(fiPath(m.spine, m.rules, m.s))) : null];
}

function wageScreen(m) {
  const w = realHourlyWage(m.spine, m.rules, m.s);
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const hours = h('input', { id: 'wage-hours', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 40' }); hours.value = w.hoursWeek === null ? '' : String(w.hoursWeek);
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
    h('p', { class: 'muted' }, h('span', { class: 'pill' }, 'DRAFTT'), ' Debt, Retirement, Accommodation, Food, Transportation' + (d.rows.some((r) => r.key === 'therapy') ? ', Therapy' : '') + ', each as a share of take-home (Retirement of gross). The mark on housing is ' + pct(d.housingReference) + ' of take-home, for reference, not a target.'),
    h('ul', { class: 'letters' }, d.rows.map((r) => h('li', {}, h('span', { class: 'letter' }, r.letter), h('span', { class: 'lbar', role: 'img', 'aria-label': r.label + ' ' + pct(r.share, 1) }, h('span', { class: 'lfill', style: 'width:' + pc(Math.min(1, r.share / max)) }), r.reference ? h('span', { class: 'lref', style: 'left:' + pc(Math.min(1, r.reference / max)), title: 'reference ' + pct(r.reference) }) : null), h('span', { class: 'lamt' }, money(r.amount) + ' (' + pct(r.share, 1) + ')')))),
    housingOver(d),
    h('p', { class: 'tile-sub' }, kindChip(d.kind), ' These six together are ' + pct(d.totalShare, 1) + ' of ' + money(d.base.takeHome) + ' take-home; everything else ' + money(d.everythingElse) + '; left over ' + (d.leftOver === null ? 'unknown' : money(d.leftOver)) + '.'),
    math('draftt', d.rows.map((r) => 'plan:draftt:' + r.key), mathCtx(m)));
}

function floorScreen(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const shock = kept().shockMonths || '';
  const months = h('input', { id: 'shock-months', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 3' }); months.value = shock;
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
  const runs = h('input', { id: 'outlook-runs', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 200' }); runs.value = want;
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
  return [h('section', { class: 'card', 'aria-label': SCREENS.scenarios },
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
      h('ul', { class: 'restore-list' }, list.map((x) => h('li', {}, h('strong', {}, x.name), x.id === targetId() ? h('span', { class: 'chip chip-default' }, 'Budget target') : null, h('span', { class: 'when' }, shortDate(x.savedAt.slice(0, 10))),
        h('button', { type: 'button', class: 'btn small', onclick: () => change(() => x.spine, said.changed('Your numbers', 'the scenario ' + x.name)) }, 'Load it'),
        h('button', { type: 'button', class: 'btn danger small', onclick: () => { const now = list.filter((y) => y.id !== x.id); keepScenarios(now); if (kept().compareWith === x.id) keep({ compareWith: '' }); refresh(); putBack(list, now, said.deleted('Scenario ' + x.name)); } }, 'Delete'))))] : h('p', { class: 'muted' }, 'None saved yet. Save today above, or slide What if and save that.'),
    diff ? [h('h3', { class: 'month-h' }, other.name + ' against today: ' + plural(diff.length, 'change')), diff.length ? diffList(m.base, other.spine, diff, 60) : h('p', { class: 'muted' }, 'Nothing differs.')] : null),
  // The futures side by side (Track C): each assumption set and up to two saved scenarios, as lines.
  foldRow('scenario-chart', 'The futures side by side', 'Net worth under each, as a chart', () => scenarioCard(scenarioLines(m.base, m.rules, { saved: list })))];
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

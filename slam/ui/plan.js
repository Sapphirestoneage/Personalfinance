// The Plan page (S-208, Batch F; on the shell, S-230). The top screen is the Financial Order of Operations, one row a
// step, each opening its own screen (Plan › 3. High-interest debt), then "Got extra money?" (the Windfall page) and
// the rest of the plan, each on its own screen: the surplus step by step, the paychecks (each its own screen), how
// much to max it, goals, what it takes to get there, the real hourly wage, DRAFTT, if income stopped, the outlook,
// life events, saved scenarios, and download or import. The shell draws the tabs, the header with Undo and Redo, Back
// and the trail, and the bar; every change to the household goes through its change(), in words. What a screen has
// open (Show the math, a solve age, a picked event) is kept with its history entry, so coming back restores it.
// Every number comes from engine/plan.js and the engines under it, with Show the math. Formatting only.

import { saveFile } from './save-file.js';
import { taxBuckets, allocation, feesInDollars, bracketRoom, sources } from '../engine/planner.js';
import { protectionChecks, protectionLine } from '../engine/protection.js';
import { foldRow } from './rows.js';
import { dateBox } from './understood.js';
import { whatIf, movedSpine } from '../engine/whatif.js';
import { negotiationList, recordCall } from '../engine/negotiate.js';
import { ssEstimates, SS_NOT_COUNTED } from '../engine/ss.js';
import { goalsCard, savingsCurveCard, fiPathCard, scenarioCard } from './chart-cards.js';
import { chartCard, bars } from './chart.js';
import { goalBars, savingsCurve, fiPath, scenarioLines } from '../engine/charts.js';
import { startPage, change, said, keep, kept, refresh, say, numbersHref } from './shell.js';
import { stepper } from './stepper.js';
import { debtTab } from './debt-tab.js';
import { headlineStrip } from './strip.js';
import { isCouple } from '../engine/couple.js';
import { summarize } from '../engine/summary.js';
import { cashsim } from '../engine/cashsim.js';
import { forecast, cashCard, lowWords } from './forecast.js';
import { rankSteps } from '../engine/next-step.js';
import { fooLadder, surplusWaterfall, allocator, paycheckPlan, planPayoff, solvers, realHourlyWage, draftt, fixedFloor, outlook, goalsView, applyLifeEvent, removeLifeEvent, diffSpines, exportJson, importJson, exportCsv, starterBasisOf, STARTER_WORDS, stepPaces } from '../engine/plan.js';
import { planClearDates } from '../engine/debtview.js';
import { STEP_LABELS } from '../engine/windfall.js';
import { putFact, parseInput, recordDebtPayment } from '../engine/edits.js';
import { valueOf } from '../engine/spine.js';
import { mainChecking } from '../engine/defaults.js';
import { keptMath } from './math-panel.js';
import { maxItCard, maxItFor } from './maxit-panel.js';
import { withScenario } from '../engine/scenarios.js';
import { pickedScenario } from './scenario.js';
import { labelFor } from '../engine/labels.js';
import { h, chip, money, pct, shortDate, monthWords, ledgerHref, showValue, metric, MISSING_WORDS } from './view.js';
import { whose } from './household.js';
import { slugOf } from '../engine/blank.js';
import { typeFor, cardRateRow } from '../engine/ledger.js';
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
  solve: 'What it takes to get there', whatif: 'Watch the dates move', calls: 'Bills worth a call', wage: 'Real hourly wage', draftt: 'Where your take-home goes', floor: 'If income stopped',
  outlook: 'Outlook', events: 'Life events', scenarios: 'Saved scenarios', file: 'Download or import', sources: 'Where each number came from',
  // The second-level tabs (S-280): the Plan's cards split by what the client wants to know; nothing removed.
  debt: 'Debt', retirement: 'Retirement', protection: 'Protection'
};
// Which second-level tab a Plan screen sits under.
const TAB_OF_STEP = { highInterest: 'debt', lowInterest: 'debt', employerMatch: 'retirement', rothHsa: 'retirement', maxRetirement: 'retirement', hyper: 'retirement' };
const subtabOf = (levels) => { const a = levels[0]; if (!a) return 'overview'; if (['debt', 'retirement', 'protection'].includes(a)) return a; if (a === 'max-it') return 'retirement'; if (a === 'sources') return null; const id = Object.keys(TAB_OF_STEP).find((k) => slug(k) === a); return id ? TAB_OF_STEP[id] : 'overview'; };
const payId = (p) => p.date + '-' + p.streamId;
const stepOf = (m, level) => m.foo.rungs.find((r) => slug(r.id) === level) || null;
const paycheckOf = (m, level) => allocOf(m).paychecks.find((p) => payId(p) === level) || null;

// The words for a level, or null when it is not there (the shell then goes up to the deepest one that is).
function name(levels, { spine, rules }) {
  const m = model(spine, rules);
  const [a, b] = levels;
  if (levels.length === 1) { if (SCREENS[a]) return SCREENS[a]; const r = stepOf(m, a); return r ? r.label : null; }
  if (levels.length === 2 && a === 'paychecks') { const p = paycheckOf(m, b); return p ? shortDate(p.date) + ': ' + p.label : null; }
  return null;
}

function render({ spine: base, rules, levels }) {
  const m = model(base, rules);
  const [a, b] = levels;
  // A couple (Batch 7, S-277): the headline numbers with the Together / each person toggle above the Plan's cards.
  if (!a) return isCouple(base) ? [headlineStrip(base, rules), top(m)] : top(m);
  if (a === 'paychecks') return b ? paycheckScreen(m, paycheckOf(m, b)) : paychecksScreen(m);
  if (a === 'debt') return debtPlan(m);
  if (a === 'retirement') return retirementPlan(m);
  if (a === 'protection') return protectionPlan(m);
  const screen = { sources: sourcesScreen, surplus: surplusScreen, 'max-it': (x) => maxItCard(x.spine, x.rules), goals: goalsScreen, solve: solveScreen, whatif: whatIfScreen, calls: callsScreen, wage: wageScreen, draftt: drafttScreen, floor: floorScreen, outlook: outlookScreen, events: eventsScreen, scenarios: scenariosScreen, file: fileScreen }[a];
  return screen ? screen(m) : stepScreen(m, stepOf(m, a));
}

// ---------------------------------------------------------------- the top: the steps, Got extra money?, the rest
// One step (Krug pass): no "a month" or "Next" pills. The current step is open, with "Now" and its reason; a step
// waiting on a number is a question, not a red chip; steps that finish in the same month say so once.
const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
function stepRow(r, current, together = null) {
  const now = r.id === current && !r.done;
  // The debt steps' months are the payoff dates everywhere (morning answer 1), tagged for the agreement check.
  const DEBT_TAG = { highInterest: 'plan:hiFreeYm', lowInterest: 'plan:allFreeYm' };
  const when = r.completes ? ['about ', h('span', { 'data-metric': !r.done && r.need > 0 ? DEBT_TAG[r.id] || null : null }, monthWords(r.completes.slice(0, 7)))] : r.months === null ? 'no surplus to fund it yet' : null;
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
// Under the floor it is the one floor card Home draws (ui/forecast.js cashCard), with the runs link as its last row.
function outlookLine(m) {
  const { story } = forecast(m.base, m.rules);
  if (!story) return null;
  const runs = (lead) => h('p', { class: 'tile-sub outlook-line', id: story.under ? null : 'cash-low' }, lead, 'Good and bad months are in the ', h('a', { href: '#/outlook' }, SCREENS.outlook), '.');
  if (story.under) return cashCard(m.base, m.rules, runs(''));
  const low = lowWords(story);
  return runs(low + (low.endsWith('.') ? ' ' : '. '));
}
// Protection gaps rank with the steps (engine/next-step.js) but are not steps of the order: one line, each a link.
function protectLine(rank) {
  const p = rank.steps.filter((x) => x.id.startsWith('protect:'));
  if (!p.length) return null;
  return h('p', { class: 'tile-sub' }, (rank.first && rank.first.id.startsWith('protect:') ? 'Next, before these: ' : 'Also on your list: '), p.map((x, i) => [i ? ', ' : '', h('a', { href: x.href }, x.label.toLowerCase())]), '.');
}
function top(m) {
  const f = m.foo, surplus = m.s.cashflow.surplus.value;
  // Home's "left a month" is before the saving already set up; the steps get what is free after it.
  const left = m.s.cashflow.monthlySurplus.value, alreadySaving = left === null || surplus === null ? 0 : left - surplus;
  const w = surplusWaterfall(m.spine, m.rules, m.s);
  const a = allocOf(m), g = goalsView(m.spine, m.rules, m.s), wage = realHourlyWage(m.spine, m.rules, m.s), fl = fixedFloor(m.spine, m.rules, m.s, null);
  const events = [...new Set([...(m.base.income || []), ...(m.base.expenses || [])].map((x) => x.lifeEvent).filter(Boolean))];
  const saved = readScenarios();
  return [
    // The steps are paid from what is left after saving (cashflow.surplus), never called the monthly surplus.
    h('p', { class: 'lede' }, surplus === null ? 'What is left after saving is not known yet, so the steps have no dates.'
      : surplus <= 0 ? 'Nothing is left after saving to put toward the steps yet.'
        : alreadySaving > 0.005 ? ['Of the ' + money(left) + ' left a month, ', metric('leftAfterSaving', money(surplus)), ' is free after the ' + money(alreadySaving) + ' you already save; it goes to these steps, in order.']
          : [metric('leftAfterSaving', money(surplus)), ' a month is free after saving; it goes to these steps, in order.']),
    outlookLine(m),
    h('section', { 'aria-labelledby': 'foo-h' },
      h('h2', { id: 'foo-h' }, 'What do I do next?'),
      // Show the math is the last item of the list it explains, as on every other card.
      h('ol', { class: 'go-list' }, (() => { const t = togetherOf(f.rungs); return f.rungs.map((r) => stepRow(r, f.current, t.get(r.id) || null)); })(),
        h('li', { class: 'math-row' }, math('foo', f.rungs.filter((r) => r.need !== null && !r.done).map((r) => 'plan:foo:' + r.id), mathCtx(m)))),
      protectLine(m.rank)),
    // More about your plan (Krug pass): three rows that open, each saying its most useful fact on the closed line;
    // open or closed is kept with the screen.
    h('section', { 'aria-label': 'More about your plan' },
      fold('month', 'Your money each month', [h('span', { class: 'go-total', 'data-metric': 'leftAfterSaving' }, money(w.surplus)), ' free a month'],
        h('ul', { class: 'go-list' },
          goRow('#/surplus', SCREENS.surplus, w.note || [h('span', { class: 'go-total' }, money(w.surplus)), 'a month free after saving, in the Extra money order']),
          a.paychecks.length ? goRow('#/paychecks', SCREENS.paychecks, plural(a.paychecks.length, 'paycheck') + ' in the next three months: what each one covers') : null,
          goRow('#/wage', SCREENS.wage, wage.wage === null ? [chip('missing'), 'Needs your hours worked a week'] : [h('span', { class: 'go-total' }, money(wage.wage, true)), 'an hour, after work costs']),
          goRow('#/draftt', SCREENS.draftt, 'Your big costs as shares of take-home'),
          goRow('#/calls', SCREENS.calls, callsFact(m)),
          goRow('#/floor', SCREENS.floor, fl.floor === null ? [chip('missing'), 'Needs the amount of a fixed cost'] : [h('span', { class: 'go-total' }, money(fl.floor)), 'a month of fixed costs']))),
      fold('future', 'Your future', g.rows.length ? plural(g.rows.length, 'goal') + (events.length ? ', ' + plural(events.length, 'event') : '') : events.length ? plural(events.length, 'event') : 'goals and what-ifs',
        h('ul', { class: 'go-list' },
          goRow('#/goals', SCREENS.goals, g.rows.length ? [h('span', { class: 'go-total' }, plural(g.rows.length, 'goal')), g.setAsideTotal ? money(g.setAsideTotal) + ' a month set aside' : null] : 'No goals beyond financial independence yet'),
          goRow('#/whatif', SCREENS.whatif, 'Spend less, earn more, pay debt faster'),
          goRow('#/solve', SCREENS.solve, 'Pick an age, see what it takes'),
          goRow('#/outlook', SCREENS.outlook, 'How the next three months could go'),
          goRow('#/events', SCREENS.events, events.length ? plural(events.length, 'event') + ' in your numbers' : 'A new job, a move, a baby'))),
      fold('files', 'Saved and files', saved.length ? plural(saved.length, 'scenario') + ' saved' : 'nothing saved yet',
        h('ul', { class: 'go-list' },
          goRow('#/scenarios', SCREENS.scenarios, saved.length ? plural(saved.length, 'scenario') + ' saved in this browser' : 'Save today to compare later'),
          goRow('#/file', SCREENS.file, 'Download a backup, or open a backup file'))))
  ];
}
// ---------------------------------------------------------------- the second-level tabs (S-280)
// Debt: the payoff steps and the payoff dates (the same Debt tab My numbers folds, engine/debtview.js).
function stepsOf(m, ids) { const t = togetherOf(m.foo.rungs); return h('ol', { class: 'go-list' }, m.foo.rungs.filter((r) => ids.includes(r.id)).map((r) => stepRow(r, m.foo.current, t.get(r.id) || null))); }
function debtPlan(m) {
  // The payoff toolkit sits behind one closed line (DESIGN.md 20), saying what My numbers' Payoff dates says.
  const sim = forecast(m.spine, m.rules, 12).sim;
  const cd = planClearDates(planPayoff(m.spine, m.rules, m.s, { sim }));
  return [
    h('section', { 'aria-labelledby': 'pd-h' }, h('h2', { id: 'pd-h' }, 'Pay off my debt'), stepsOf(m, ['highInterest', 'lowInterest'])),
    foldRow('debt-payoff', 'Payoff dates', cd.none ? 'No debt on your plan' : cd.allYm ? 'All debt gone ' + monthWords(cd.allYm) + ' on your plan' : 'Not yet on your plan',
      () => debtTab({ c: { sim }, spine: m.spine, rules: m.rules, mathCtx: () => ({ spine: m.spine, rules: m.rules, s: m.s }), rerender: refresh }))
  ];
}
// Retirement: when they could stop working, the saving steps, how much to max each account, and the planner views.
function retirementPlan(m) {
  return [
    h('section', { 'aria-labelledby': 'pr-h' }, h('h2', { id: 'pr-h' }, 'When can I stop working?'),
      h('p', { class: 'plan-answer' }, m.s.fi.yearsToFi.value === null ? 'Not at this pace yet. These steps bring it closer:' : 'At this pace, ' + (m.s.fi.yearsToFi.kind === 'rough' ? 'about ' : 'in ') + (+m.spine.meta.asOf.slice(0, 4) + Math.round(m.s.fi.yearsToFi.value)) + '. These steps bring it sooner:'),
      stepsOf(m, ['employerMatch', 'rothHsa', 'maxRetirement', 'hyper'])),
    h('ul', { class: 'go-list' }, goRow('#/max-it', SCREENS['max-it'], 'Room left in each retirement account'), goRow('#/sources', SCREENS.sources, sourcesFact(m))),
    // The planner views (S-274): each folded to its headline, each with Show the math.
    ...plannerViews(m)
  ];
}
// Protection (S-275): the four checks, each folded to its headline, with its method and Show the math.
function protectionPlan(m) {
  return protectionChecks(m.spine, m.rules, m.s).map((c) => fold('protect-' + c.id, { life: 'Life insurance', disability: 'If you cannot work', liability: 'If someone sues', gaps: 'Gaps' }[c.id],
    // No stage: the check is not needed now (no chip) or waits on a number (Missing).
    [c.stage ? h('span', { class: 'stage-chip stage-' + c.stage }, { green: 'Covered', yellow: 'Worth a look', red: 'Check this' }[c.stage]) : /^Not needed/.test(c.headline) ? null : chip('missing'), ' ' + c.headline],
    h('div', {}, c.lines.length ? h('ul', {}, c.lines.map((l) => h('li', {}, l))) : null, h('p', { class: 'tile-note' }, 'How: ' + c.method),
      h('p', {}, h('a', { href: 'ledger.html#/protection' }, 'Your policies in Numbers')), math('protect-' + c.id, ['plan:protect:' + c.id], mathCtx(m))), ' fold-sentence'));
}

// ---------------------------------------------------------------- the planner views (S-274)
const pctW = (x) => (x === null || x === undefined ? 'not known' : Math.round(x * 100) + '%');
// The one fact on the Where each number came from row: how many numbers, and how sure.
const sourcesFact = (m) => { const src = sources(m.spine, m.s), known = src.filter((x) => x.kind === 'known').length; return src.length + ' numbers: ' + known + ' known, ' + (src.length - known) + ' rough, guessed or missing'; };
function plannerViews(m) {
  const b = taxBuckets(m.spine), al = allocation(m.spine), fe = feesInDollars(m.spine, m.s, m.rules), room = bracketRoom(m.spine, m.rules);
  const top = [...b.buckets].sort((x, y) => y.amount - x.amount)[0];
  return [
    fold('buckets', 'Your tax buckets', b.total ? [h('span', { class: 'go-total' }, pctW(top.share)), ' ' + top.words.split(' (')[0].toLowerCase()] : 'No invested money yet',
      h('div', {}, b.total ? [
        h('div', { class: 'bucket-bar', role: 'img', 'aria-label': b.buckets.filter((x) => x.amount).map((x) => x.words.split(' (')[0] + ' ' + pctW(x.share)).join(', ') },
          b.buckets.filter((x) => x.amount).map((x) => h('span', { class: 'bucket bucket-' + x.id, style: 'width:' + (x.share * 100).toFixed(2) + '%' }))),
        h('ul', { class: 'bucket-key' }, b.buckets.map((x) => h('li', {}, h('span', { class: 'sw bucket-' + x.id, 'aria-hidden': 'true' }), x.words + ': ' + money(x.amount) + ' (' + pctW(x.share) + ')'))),
        h('p', { class: 'tile-sub' }, 'Money in more than one bucket gives you choices about which tax you pay, and when, once you draw on it.')] : h('p', { class: 'muted' }, 'Add an account with money invested to see it here.'),
        b.missing.length ? h('p', { class: 'missing-row' }, 'Missing: ' + b.missing.length + ' balance' + (b.missing.length === 1 ? '' : 's')) : null,
        math('buckets', ['plan:buckets'], mathCtx(m)))),
    fold('alloc', 'Stocks, bonds and cash', al.total ? (al.unknown ? [h('span', { class: 'go-total' }, money(al.unknown)), ' with no mix given'] : [h('span', { class: 'go-total' }, pctW(al.stocks / al.total)), ' in stocks']) : 'Nothing invested yet',
      h('div', {},
        h('p', {}, al.stocks + al.bonds === 0 && al.unknown > 0 ? 'No mix given yet for ' + money(al.unknown) + '; ' + money(al.cash) + ' is cash.' : 'Across everything: ' + money(al.stocks) + ' in stocks, ' + money(al.bonds) + ' in bonds, ' + money(al.cash) + ' in cash' + (al.unknown ? ', and ' + money(al.unknown) + ' where the mix is not given yet.' : '.')),
        h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Account'), h('th', { class: 'num' }, 'Balance'), h('th', { class: 'num' }, 'Stocks'), h('th', { class: 'num' }, 'Bonds'), h('th', { class: 'num' }, 'Cash'))),
          h('tbody', {}, al.rows.map((r) => h('tr', {}, h('td', {}, r.mix === null ? h('a', { href: ledgerHref(r.path) }, r.name + ' (add its mix)') : r.name), h('td', { class: 'num' }, money(r.amount)), h('td', { class: 'num' }, r.stocks === null ? MISSING_WORDS : money(r.stocks)), h('td', { class: 'num' }, r.bonds === null ? MISSING_WORDS : money(r.bonds)), h('td', { class: 'num' }, r.mix === null ? MISSING_WORDS : money(r.cash))))))),
        math('stocks', ['plan:stocks'], mathCtx(m)))),
    fold('fees', 'Fees in dollars', fe.rows.length ? [h('span', { class: 'go-total' }, money(fe.yearly)), ' a year'] : 'Fees not given yet',
      h('div', {},
        fe.rows.length ? h('p', { class: 'tile-value-line' }, 'You pay ' + money(fe.yearly) + ' a year in fees.' + (fe.byFi ? ' By the time you reach FI (about ' + Math.round(fe.byFi.years) + ' years), they cost about ' + money(fe.byFi.cost) + ' of growth, in today\'s dollars.' : '')) : null,
        fe.rows.length ? h('ul', {}, fe.rows.map((r) => h('li', {}, r.name + ': ' + money(r.yearly) + ' a year (' + (Math.round(r.rate * 10000) / 100) + '% of ' + money(r.amount) + ')'))) : null,
        fe.missing.length ? h('p', { class: 'muted' }, 'Fees not given for ' + fe.missing.length + ' account' + (fe.missing.length === 1 ? '' : 's') + ': add the fund fee (expense ratio) on each.') : null,
        math('fees', ['plan:fees'], mathCtx(m)))),
    fold('room', 'Room in your tax bracket', room && room.room !== null ? [h('span', { class: 'go-total' }, money(room.room)), ' at ' + pctW(room.rate)] : 'Needs your filing status and income',
      h('div', {}, room ? [
        h('p', {}, room.room === null ? 'You are in the top federal bracket (' + pctW(room.rate) + ').' : 'This year you can add about ' + money(room.room) + ' more taxable income (a Roth conversion, a bonus) and it is taxed at ' + pctW(room.rate) + '; past that, at ' + pctW(room.nextRate) + '.'),
        math('room', ['plan:room'], mathCtx(m))] : h('p', { class: 'muted' }, 'Add your filing status and income to see it.')))
  ];
}
// Where each number came from (S-274): every input to the headline numbers with its kind, source and date; sortable;
// printable as an audit trail. Coach notes are never in it.
function sourcesScreen(m) {
  const by = (kept().srcSort || 'kind');
  const order = { missing: 0, guess: 1, rough: 2, known: 3, computed: 4, notForMe: 5 };
  const list = [...sources(m.spine, m.s)].sort((a, b) => (by === 'kind' ? order[a.kind] - order[b.kind] : by === 'date' ? String(a.asOf || '').localeCompare(String(b.asOf || '')) : a.label.localeCompare(b.label)) || a.label.localeCompare(b.label));
  const KIND = { known: 'Known', rough: 'Rough', guess: 'Rough (house guess)', missing: 'Missing', computed: 'Worked out', notForMe: 'Not for me' };
  const sortBtn = (k, words) => h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(by === k), onclick: () => { keep({ srcSort: k }); refresh(); } }, h('span', { class: 'seg-label' }, words));
  return h('section', { class: 'card sources-card', 'aria-label': 'Where each number came from' },
    h('p', { class: 'muted' }, 'Every number your headline figures use: what it is, how sure it is, where it came from and when.'),
    h('div', { class: 'segmented', role: 'group', 'aria-label': 'Sort by' }, sortBtn('kind', 'Least sure'), sortBtn('name', 'Name'), sortBtn('date', 'Oldest')),
    h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Number'), h('th', {}, 'How sure'), h('th', {}, 'Where from'), h('th', {}, 'As of'), h('th', {}, 'Used in'))),
      h('tbody', {}, list.map((x) => h('tr', {}, h('td', {}, h('a', { href: ledgerHref(x.path) }, x.label)), h('td', {}, KIND[x.kind] || x.kind), h('td', {}, x.source || ''), h('td', {}, x.asOf ? shortDate(x.asOf) : ''), h('td', {}, x.uses.join(', '))))))),
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => window.print() }, 'Print this list')));
}
// A row that opens in place: its title and one fact on the closed line.
const fold = (key, title, fact, body, cls = '') => h('details', { class: 'card done-group plan-fold' + cls, open: (kept().folds || {})[key] || null, ontoggle: (e) => { const f = { ...(kept().folds || {}) }; if (!!f[key] === e.target.open) return; f[key] = e.target.open; keep({ folds: f }); } },
  h('summary', {}, h('span', {}, title), h('span', { class: 'count' }, fact)), body);

// ---------------------------------------------------------------- one step
// Step 1's choice (owner, 2026-10-27, S-261): which starter cushion this client builds first. One change, Undo.
function starterChoice(m) {
  const now = starterBasisOf(m.base);
  return h('div', { class: 'q' }, h('p', { class: 'q-label', id: 'starter-l' }, 'The first cushion is'),
    h('div', { class: 'segmented q-seg', role: 'group', 'aria-labelledby': 'starter-l' }, Object.entries(STARTER_WORDS).map(([k, w]) =>
      h('button', { type: 'button', class: 'seg-btn', id: 'starter-' + k, 'aria-pressed': String(now === k), onclick: () => { if (now !== k) change((x) => putFact(x, 'household.starterBasis', k, 'known', todayIso()), said.changed('The first cushion', w.toLowerCase())); } },
        h('span', { class: 'seg-label' }, k === 'fixed' ? w + ' (' + money(m.rules.get('APP_STARTER_FUND', +m.base.meta.asOf.slice(0, 4))) + ')' : w)))));
}
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
    h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save')));
}

// A step's screen leads with the progress tracker (S-265): where this step sits among all nine, each one a tap away.
function stepScreen(m, r) {
  const f = m.foo, state = (x) => (x.done ? 'done' : x.need === null ? 'question' : x.id === f.current ? 'current' : 'todo');
  const steps = f.rungs.map((x) => ({ label: x.label, href: '#/' + slug(x.id), state: state(x) }));
  return [stepper(steps, f.rungs.indexOf(r)), stepBody(m, r)];
}
function stepBody(m, r) {
  const f = m.foo;
  const big = r.need === null ? h('p', { class: 'max-big missing-text' }, 'Missing') : h('p', { class: 'max-big' }, r.done ? 'Done' : money(r.need) + (r.flow ? ' a month' : ''));
  const when = r.need === null || r.done ? null : r.completes ? (r.flow ? 'From about ' : 'Done about ') + monthWords(r.completes.slice(0, 7)) + '.' : r.months === null ? 'No surplus to fund it yet.' : null;
  const links = [
    r.id === 'employerMatch' && !r.path ? goRow(numbersHref('assets'), 'Your accounts', 'Open them in Numbers') : null,
    r.id === 'rothHsa' || r.id === 'maxRetirement' ? goRow('#/max-it', SCREENS['max-it'], 'Each account\'s room and deadline') : null,
    r.id === 'prepaid' ? goRow('#/goals', SCREENS.goals, 'Each goal, its target and by when') : null,
    r.path && r.id !== 'deductibles' ? goRow(ledgerHref(r.path), labelFor(m.spine, r.path), 'Open it in Numbers') : null
  ].filter(Boolean);
  return h('section', { class: 'card', 'aria-label': r.label },
    r.id === f.current ? h('p', {}, h('span', { class: 'pill pill-locked' }, 'Your next step')) : null,
    big,
    when ? h('p', { class: 'tile-sub' }, when) : null,
    // How long the gap takes at a few paces (S-263), so a step with no surplus yet still has a date to aim at.
    (() => { const ps = stepPaces(r, f.surplus, m.base.meta.asOf); return ps.length ? h('div', { class: 'paces' }, h('p', { class: 'edit-label' }, money(r.need) + ' to go, at a pace you choose'),
      h('ul', { class: 'flow-list' }, ps.map((x) => h('li', {}, h('strong', {}, money(x.perMonth) + ' a month'), x.label ? ' (' + x.label + ')' : '', ': done by ' + monthWords(x.by) + ', ' + x.months + (x.months === 1 ? ' month' : ' months')))),
      r.completes ? h('p', { class: 'tile-note' }, 'Each counts from now. The Plan\'s own date above is later when the steps before this one take the money first.') : null) : null; })(),
    // The deductible's own box is right below, so its step says to type it there.
    h('p', {}, kindChip(r.kind), ' ', r.id === 'deductibles' && r.need === null && starterBasisOf(m.base) === 'deductible' ? 'Type the biggest deductible below.' : r.why),
    r.flow && !r.done ? h('p', { class: 'tile-note' }, 'A monthly amount: once the surplus gets here, this much goes to it every month.') : null,
    r.id === 'deductibles' ? starterChoice(m) : null,
    r.id === 'deductibles' && starterBasisOf(m.base) === 'deductible' ? deductibleForm(m) : null,
    r.id === 'deductibles' && ['housing', 'needs'].includes(starterBasisOf(m.base)) ? h('ul', { class: 'go-list' }, goRow(numbersHref('needs'), 'Needs', 'Where the month is figured from, in Numbers')) : null,
    r.id === 'highInterest' ? hiDebts(m, r) : null,
    r.need === null && r.path && r.id !== 'deductibles' ? inlineFix(m, r) : null,
    r.id === 'employerMatch' ? h('p', { class: 'tile-sub' }, f.setup.match ? 'Your employer match is entered on your workplace account.' : 'Enter the match rate and cap on your workplace account in Numbers (Assets, then the 401(k)).') : null,
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
  // A date takes "dec 6" or "the 15th" (S-285); fixIso holds the day it read.
  let fixIso = '';
  const box = type === 'date' ? dateBox('fix-' + r.id, '', (v) => { fixIso = v; }) : h('input', { id: 'fix-' + r.id, type: 'text', inputmode: 'decimal', autocomplete: 'off' });
  return h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const p = type === 'date' ? (fixIso ? { ok: true, value: fixIso } : { ok: false, message: 'Type a day, like Dec 6' }) : parseInput(type, box.value);
    if (!box.value.trim() || !p.ok) { msg.textContent = p.ok ? 'Type it first' : p.message; box.focus(); return; }
    change((x) => putFact(x, r.path, p.value, 'known', todayIso()), said.changed(labelFor(m.base, r.path), showValue(p.value, type)));
  } }, h('label', { for: 'fix-' + r.id, class: 'edit-label' }, labelFor(m.base, r.path)), box, msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save')));
}
// A rate in words: a whole percent when it is one or a hair under it (29.99% reads 30%), else with its decimals.
const rateWords = (r) => { const x = Math.round(r * 10000) / 100, f = x - Math.floor(x); return f < 0.005 || f > 0.985 ? Math.round(x) + '%' : x + '%'; };
// High-interest debt (Batch 8): each debt at or above the line, with Record a payment right here, and Add a debt.
function hiDebts(m, r) {
  // The same debts the step counts (its rate today, so a 0% promo is not on it).
  const list = (r.ids || []).map((id) => (m.base.debts || []).find((d) => d.id === id)).filter(Boolean);
  const row = (d) => {
    const name = valueOf(d.name) || d.id;
    const msg = h('p', { class: 'edit-msg', role: 'alert' });
    const box = h('input', { id: 'pay-' + d.id, type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 200' });
    // The rate as the step's row says it: an intro rate still running (to its end date, as the engine counts it), then the rate after.
    const cr = cardRateRow(m.spine, d).fact.value, intro = cr && cr.intro && cr.intro.ends && cr.intro.rate !== null && m.spine.meta.asOf <= cr.intro.ends ? cr.intro : null;
    const rate = !cr || cr.apr === null ? 'a rate not given yet' : intro ? rateWords(intro.rate) + ' until ' + shortDate(intro.ends) + ', then ' + rateWords(cr.apr) : rateWords(cr.apr);
    return h('li', { class: 'hi-debt' }, h('p', {}, h('strong', {}, name), ' ' + money(valueOf(d.balance)) + ' at ' + rate),
      h('label', { for: 'pay-' + d.id, class: 'edit-label' }, 'Payment on ' + name),
      h('form', { class: 'inline-form', novalidate: true, onsubmit: (e) => {
        e.preventDefault();
        const p = parseInput('money', box.value);
        if (!box.value.trim() || !p.ok || !(p.value > 0)) { msg.textContent = 'Type the payment, like 200'; box.focus(); return; }
        change((x) => recordDebtPayment(x, d.id, p.value, todayIso()), said.added('Payment of ' + money(p.value) + ' on ' + name));
      } }, box, h('button', { type: 'submit', class: 'btn small' }, 'Record a payment'), msg));
  };
  return h('div', {}, list.length ? h('ul', { class: 'hi-list' }, list.map(row)) : null,
    h('p', { class: 'edit-hint' }, 'Lowers the balance, and checking if its balance is entered. More than the balance pays it off.'),
    h('div', { class: 'edit-actions' }, h('a', { class: 'btn add', href: numbersHref('debt') }, '+ Add a debt in Numbers')));
}

// ---------------------------------------------------------------- the rest of the plan, a screen each
function surplusScreen(m) {
  const w = surplusWaterfall(m.spine, m.rules, m.s);
  return h('section', { class: 'card', 'aria-label': SCREENS.surplus },
    h('p', { class: 'muted' }, w.note || 'Each month\'s ' + money(w.surplus) + ', sent in the same order Extra money uses.'),
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
// After a month's last paycheck, the month added up, and how it stands against the Plan's monthly figure (round 4).
const monthEnd = (a, p) => { const i = a.paychecks.indexOf(p); return !a.paychecks[i + 1] || a.paychecks[i + 1].ym !== p.ym; };
const monthLine = (m, a, ym) => { const x = a.byMonth.find((y) => y.ym === ym); return x ? monthWords(ym).split(' ')[0] + ': ' + money(x.toPlan) + ' to the Plan' + (x.kept ? ', ' + money(x.kept) + ' kept for the next month\'s first paycheck' : '') + '.' : ''; };
function paychecksScreen(m) {
  const a = planOf(m);
  if (!a.paychecks.length) return h('p', { class: 'card muted' }, 'No paychecks in the next three months.');
  const third = (p) => p.bonus ? h('span', { class: 'pill' }, (p.cadence === 'weekly' ? '5th' : '3rd') + ' paycheck in ' + monthWords(p.ym).split(' ')[0]) : null;
  const totals = (p) => Object.keys(JOB).map((k) => ({ k, v: p.byKind[k] })).filter((x) => x.v > 0);
  const chart = chartCard({ id: 'paycheck-jobs', question: 'What does each paycheck pay for?',
    summary: 'Every dollar of each paycheck has a job until the next one.' + (a.paychecks.some((p) => p.carryOut) ? ' Where one would come up short, the one before it keeps the difference.' : '') + (a.fromChecking ? ' ' + money(a.fromChecking) + ' has to be in checking already' + (a.shortBy ? ', more than checking holds; the Calendar\'s lowest day says by how much and when.' : '.') : ''),
    draw: (w) => bars({ width: w, rows: a.paychecks.map((p) => ({ label: shortDate(p.date).replace(/, \d{4}$/, ''), segs: totals(p).map((x) => ({ v: x.v, c: JOB[x.k][0], tip: shortDate(p.date) + ', ' + JOB[x.k][1].toLowerCase() + ': ' + money(x.v) })), value: money(p.assigned) })), label: 'Each paycheck by its jobs' }),
    legend: Object.values(JOB).map(([c, words]) => ({ c, words })),
    table: { head: ['Paycheck', ...Object.values(JOB).map((x) => x[1]), 'In all'], rows: a.paychecks.map((p) => [shortDate(p.date) + ': ' + p.label, ...Object.keys(JOB).map((k) => money(p.byKind[k])), money(p.assigned)]) } });
  return [
    h('p', { class: 'lede' }, 'Every dollar of each paycheck, assigned until the next one. The Plan\'s ', h('span', { 'data-metric': 'leftAfterSaving' }, money(m.foo.surplus)), ' a month is the month as a whole; one paycheck sends more or less as the bills fall between paydays. The last one shown counts no bills after the three months, so more of it reads as going to the Plan.' + (a.bonusMonths.length ? ' Three-paycheck months: ' + a.bonusMonths.map(monthWords).join(', ') + '.' : '')),
    h('ul', { class: 'go-list pay-list' }, a.paychecks.flatMap((p) => [
      goRow('#/paychecks/' + encodeURIComponent(payId(p)), [shortDate(p.date) + ': ' + p.label, third(p) ? [' ', third(p)] : null],
        [h('span', { class: 'go-total' }, money(p.amount)), p.carryIn ? ' plus ' + money(p.carryIn) + ' carried in' : '', (p.left > 0.004 ? ' · ' + money(p.left) + ' to the Plan' : ' · all to bills and spending')]),
      monthEnd(a, p) ? h('li', { class: 'pay-month' }, monthLine(m, a, p.ym)) : null,
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
        ...jobs.map((j) => h('tr', {}, h('td', {}, j.kind === 'tax' ? 'Held back for tax on this 1099 deposit (' + pct(p.setAsideRate, 1) + ')' + (p.setAsideMissing ? '; the rate is partly missing' : '') : j.kind === 'plan' && j.step ? h('a', { href: '#/' + slug(j.step) }, jobLabel(j)) : jobLabel(j)), h('td', {}, j.date ? shortDate(j.date) : j.kind === 'carry' ? shortDate(j.to) : ''), h('td', { class: 'num' }, money(j.amount))))),
      h('tfoot', {}, h('tr', {}, h('td', {}, h('strong', {}, 'Assigned')), h('td', {}), h('td', { class: 'num' }, money(p.assigned)))))),
    math('pay', ['plan:pay:' + p.date + ':' + p.streamId], mathCtx(m)));
}

// When the Plan's step for big costs dates a goal with no set-aside of its own (round 3), the table says so.
const planDate = (m, r) => { const st = m.foo.rungs.find((x) => x.id === 'prepaid'); return st && st.completes && r.toGo > 0 ? '; the Plan\'s step ' + st.rung + ' puts it about ' + monthWords(st.completes.slice(0, 7)) : ''; };
function goalsScreen(m) {
  const g = goalsView(m.spine, m.rules, m.s);
  const bars = goalsCard(goalBars(g));
  return [bars ? h('section', { class: 'card' }, bars) : null, h('section', { class: 'card', 'aria-label': SCREENS.goals },
    g.setAsideTotal ? h('p', { class: 'muted' }, money(g.setAsideTotal) + ' a month goes to goals.') : null,
    g.rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Goal'), h('th', { class: 'num' }, 'Target'), h('th', { class: 'num' }, 'There'), h('th', { class: 'num' }, 'To go'), h('th', {}, 'Reached'), h('th', {}, 'Costs the FI date'))),
      h('tbody', {}, g.rows.map((r) => h('tr', { class: r.onTime === false ? 'tight' : '' }, h('td', {}, h('a', { href: ledgerHref(r.path) }, r.label), r.sinking ? [' ', h('span', { class: 'pill' }, 'sinking fund')] : null, r.priority !== null ? [' ', h('span', { class: 'pill' }, 'priority ' + r.priority)] : null, r.repeat ? [' ', h('span', { class: 'pill' }, 'yearly')] : null), h('td', { class: 'num' }, r.target === null ? 'missing' : money(r.target)), h('td', { class: 'num' }, r.held === null ? 'none yet' : money(r.held)), h('td', { class: 'num' }, r.toGo === null ? 'missing' : money(r.toGo)), h('td', {}, r.toGo === 0 ? 'done' : r.reached ? monthWords(r.reached.slice(0, 7)) + (r.by ? (r.onTime ? ', in time for ' : ', after ') + shortDate(r.by) : '') + (r.neededMonthly && r.onTime === false ? '; ' + money(r.neededMonthly) + ' a month would make it' : '') : r.by ? 'no set-aside yet; ' + (r.neededMonthly === null ? '' : money(r.neededMonthly) + ' a month by ' + shortDate(r.by)) : 'no set-aside yet' + planDate(m, r)), h('td', {}, r.fiCostMonths === null ? 'not figured: no set-aside a month' : plural(r.fiCostMonths, 'month') + ' later')))))) : h('p', { class: 'muted' }, 'No goals beyond financial independence yet.'),
    h('ul', { class: 'go-list' }, goRow(numbersHref('goals'), 'Your goals in Numbers', 'Add a goal or change one')),
    g.rows.length ? math('goals', g.rows.filter((r) => r.toGo !== null).map((r) => 'plan:goal:' + r.id), mathCtx(m)) : null)];
}

// What if (Track F): four sliders move a copy of the numbers in memory; the dates move as they slide. Nothing changes
// in My numbers; "Save as a scenario" keeps the moved copy beside the others (Undo takes the save back).
// LIVE-FORM: built once. A slide redraws only the results under the sliders, never the sliders.
const MOVES = [
  ['spendLess', 'Spend less a month', 0, 1000, 25, 'Off the everyday lines (not rent or other fixed costs), shared by their size'],
  ['earnMore', 'Earn more a month, before tax', 0, 2000, 50, 'On your biggest paycheck, taxed like the rest of it'],
  ['extraDebt', 'Extra to debt a month', 0, 1000, 25, 'On top of the extra already set, in the plan\'s order'],
  ['windfall', 'A windfall, once', 0, 50000, 500, 'Sent where Extra money would send it']
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
      a.hasHi || b.hasHi ? row('High-interest debt gone', a.hiYm ? monthWords(a.hiYm) : a.hasHi ? 'not at this pace' : 'none left', b.hiYm ? monthWords(b.hiYm) : b.hasHi ? 'not at this pace' : 'none left') : null,
      row('All debt gone, on your plan', free(a), free(b), dm > 0 ? plural(dm, 'month') + ' sooner' : dm < 0 ? plural(-dm, 'month') + ' later' : null),
      row('Interest on the way', money(a.interest), money(b.interest)),
      row('Financial independence', a.fiYear === null ? 'not at this pace' : 'about ' + a.fiYear, b.fiYear === null ? 'not at this pace' : 'about ' + b.fiYear, a.fiYear !== null && b.fiYear !== null && a.fiYear !== b.fiYear ? plural(Math.abs(a.fiYear - b.fiYear), 'year') + (b.fiYear < a.fiYear ? ' sooner' : ' later') : null));
  };
  const saveBtn = h('button', { type: 'submit', class: 'btn primary' }, 'Save as a scenario');
  const why = h('p', { class: 'edit-hint' });
  const resetBtn = h('button', { type: 'button', class: 'btn', onclick: () => { keep({ moves: null }); refresh(); } }, 'Put it back');
  const canSave = () => { const any = Object.values(moves).some((x) => x > 0); saveBtn.disabled = !any; resetBtn.disabled = !any; resetBtn.title = any ? '' : 'Everything is at zero already'; why.textContent = any ? '' : 'Slide something first: at zero it is today.'; };
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
        resetBtn)),
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
  return !negotiable ? 'The list of bills to call about did not load' : !list.length ? 'Nothing on the list' : over.length ? plural(over.length, 'bill') + ' above typical' : plural(list.length, list.every((x) => x.kind === 'card') ? 'card' : 'bill') + ' worth a call';
}
const nowWords = (x) => (x.kind === 'card' ? rateWords(x.now) + ' a year' : money(x.now) + ' a month');
function callsScreen(m) {
  const list = callsOf(m);
  if (!negotiable) return h('section', { class: 'card' }, h('p', { class: 'muted' }, 'The list of bills to call about did not load. Try again when online.'));
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
      h('p', { class: 'muted' }, negotiable.placeholder === false ? 'One call each, most dollars a month at stake first. Typical prices are a starting table to check, not a promise.' : 'One call each, the biggest first. Each has a script; after the call, tap I called and type the new price.'),
      h('ol', { class: 'audit-list' }, list.map((x) => h('li', { class: 'audit-row' },
        h('div', { class: 'audit-head' }, h('a', { href: ledgerHref(x.path) }, x.label), h('span', { class: 'audit-cost' }, nowWords(x))),
        h('p', { class: 'tile-sub' }, x.kind === 'card' ? (x.promo ? 'Intro ' + rateWords(x.promo.rate) + ' until ' + shortDate(x.promo.ends) + ', then ' + rateWords(x.now) + ' (see Home: interest held back now may be charged if any is left then); about ' + money(x.stake) + ' a month after that' : 'Above ' + pct(x.typical, 0) + '; about ' + money(x.yearCost) + ' of interest a year at this balance') : x.typical === null ? 'Worth one call: a bill like this often comes down when you ask.' : x.above > 0 ? money(x.above) + ' a month above a typical ' + money(x.typical) : 'About typical (' + money(x.typical) + ')'),
        x.called ? h('p', { class: 'tile-sub' }, 'Called ' + shortDate(x.called.date) + ': ' + (x.kind === 'card' ? rateWords(x.called.from) + ' to ' + rateWords(x.called.to) : money(x.called.from) + ' to ' + money(x.called.to))) : null,
        h('details', { class: 'script-fold' }, h('summary', {}, 'Call script'), h('p', { class: 'script' }, x.script),
          h('button', { type: 'button', class: 'btn small', onclick: () => { try { navigator.clipboard.writeText(x.script); say('Script copied'); } catch { say('Copy did not work here; select the words instead'); } } }, 'Copy the script')),
        call(x))))),
    // The chart against typical prices waits for a sourced table (morning answer 5).
    bills.some((x) => x.typical !== null) ? h('section', { class: 'card' }, chartCard({ id: 'calls-chart', question: 'Which bills are above typical?',
      summary: bills.filter((x) => x.above > 0).length ? bills.filter((x) => x.above > 0).map((x) => x.label + ' by ' + money(x.above)).join('; ') + '.' : 'Every bill on the list is at or under typical.',
      draw: (w) => bars({ width: w, rows: bills.filter((x) => x.typical !== null).map((x) => ({ label: x.label, range: { v0: 0, v1: x.typical }, segs: [{ v: x.now, c: x.above > 0 ? 2 : 1, tip: x.label + ': ' + money(x.now) + ' a month, typical ' + money(x.typical) }], target: x.typical, targetTip: 'Typical: ' + money(x.typical), value: money(x.now) })), label: 'Bills against typical' }),
      legend: [{ c: 1, words: 'At or under typical' }, { c: 2, words: 'Above typical' }, { c: 0, words: 'Typical (the tick)', cls: 'sw-band' }],
      table: { head: ['Bill', 'A month', 'Typical', 'Above'], rows: bills.filter((x) => x.typical !== null).map((x) => [x.label, money(x.now), money(x.typical), x.above > 0 ? money(x.above) : '']) } })) : null
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
    // No age typed (morning answer 7): it solves for the FI assumptions' age, else 65 as a guess, and says which.
    !byAge.trim() ? h('p', { class: 'tile-sub', id: 'solve-from' }, x.ageFrom === 'assumptions' ? 'By ' + x.targetAge + ', the age in your FI assumptions. ' : 'By ' + x.targetAge + ', a guess (no age in your FI assumptions yet). ', x.ageFrom === 'guess' ? kindChip('rough') : null, ' ',
      h('button', { type: 'button', class: 'btn small', onclick: () => { age.focus(); age.select(); } }, 'Change')) : null,
    x.rows.length ? [h('p', { class: 'tile-sub' }, 'To reach ' + money(x.fiNumber) + ' by ' + x.targetAge + ' (' + Math.round(x.years) + ' years from ' + x.age + ') from ' + money(x.invested) + ' invested at ' + pct(x.realReturn, 1) + ' real' + (x.yearsNow !== null ? '; on the saving as it is, about ' + x.yearsNow.toFixed(1) + ' years' : '; on the saving as it is, never') + '.'),
      h('ul', {}, x.rows.map((r) => h('li', {}, h('strong', {}, r.label + ': '), r.value === null ? r.words : (r.unit === 'ratio' ? pct(r.value, 1) : money(r.value) + ' a month') + ' (' + r.words + ')'))),
      h('p', { class: 'tile-note' }, kindChip(x.kind), ' Each answer changes one thing and holds everything else the same.'),
      math('solve', x.rows.filter((r) => r.value !== null).map((r) => 'plan:solve:' + r.id), () => mathCtx(m)({ solvers: x }))] : h('p', { class: 'muted missing-row' }, x.note)),
  // The same answer as two charts (Track C): years to FI at each savings rate, and the path to the FI number.
  ssEstimates(m.spine).length ? h('p', { class: 'tile-note' }, SS_NOT_COUNTED + ' Your estimate is in the Profile.') : null,
  x.rows.length ? h('section', { class: 'card' }, savingsCurveCard(noTarget(savingsCurve(x), !byAge.trim() && x.ageFrom === 'guess'), { yearsToFi: m.s.fi.yearsToFi.value }), fiPathCard(fiPath(m.spine, m.rules, m.s))) : null];
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
    h('p', { class: 'tile-sub' }, kindChip(w.kind), ' ', w.wage === null ? h('span', { class: 'missing-row' }, 'Needs your hours worked a week' + (w.takeHome === null ? ' and take-home pay' : '')) : h('strong', {}, money(w.wage, true) + ' an hour of life'), w.wage !== null ? ' (' + money(w.takeHome) + ' take-home less ' + money(w.costMonthly) + ' of work costs, over ' + w.hoursMonthly + ' hours a month' + (w.naive !== w.wage ? '; ' + money(w.naive, true) + ' before the commute and the costs' : '') + '). The Spending page can show every amount as hours.' : ''),
    w.costs.length ? h('p', { class: 'tile-note' }, 'Costs of working: ' + w.costs.map((c) => c.label + ' ' + money(c.amount)).join(', ') + '.') : null,
    w.wage !== null ? math('wage', ['plan:wage'], mathCtx(m)) : null);
}

// Housing beside the housing line (30% with a car, 35% without), in dollars (Batch 8): a reference, never a verdict.
function housingOver(d) {
  const a = d.rows.find((r) => r.key === 'accommodation');
  if (!a || a.overReference === undefined) return null;
  return h('p', { class: 'tile-sub' }, a.overReference > 0 ? 'Housing is ' + money(a.overReference) + ' a month above the ' + pct(d.housingReference) + ' line.' : 'Housing is at or below the ' + pct(d.housingReference) + ' line.');
}
// Each bar is named in words, as the sentence above names them (plan-18): housing, not "A" or "Accommodation".
const DRAFTT_WORDS = { accommodation: 'Housing' };
function drafttScreen(m) {
  const d = draftt(m.spine, m.rules, m.s);
  if (d.base.amount === null) return h('section', { class: 'card', 'aria-label': SCREENS.draftt }, h('p', { class: 'muted missing-row' }, 'Missing: take-home pay.'));
  const max = Math.max(0.01, ...d.rows.map((r) => r.share));
  return h('section', { class: 'card', 'aria-label': SCREENS.draftt },
    h('p', { class: 'muted' }, 'Debt, retirement, housing, food' + (d.rows.some((r) => r.key === 'therapy') ? ', transportation and therapy' : ' and transportation') + ' as shares of your take-home (retirement of gross). The mark on housing is ' + pct(d.housingReference) + ' of take-home, for reference, not a target.'),
    h('ul', { class: 'letters' }, d.rows.map((r) => h('li', {}, h('span', { class: 'letter' }, DRAFTT_WORDS[r.key] || r.label), h('span', { class: 'lbar', role: 'img', 'aria-label': r.label + ' ' + pct(r.share, 1) }, h('span', { class: 'lfill', style: 'width:' + pc(Math.min(1, r.share / max)) }), r.reference ? h('span', { class: 'lref', style: 'left:' + pc(Math.min(1, r.reference / max)), title: 'reference ' + pct(r.reference) }) : null), h('span', { class: 'lamt' }, money(r.amount) + ' (' + pct(r.share, 1) + ')')))),
    housingOver(d),
    h('p', { class: 'tile-sub' }, kindChip(d.kind), ' These ' + (NUM[d.rows.length] || d.rows.length) + ' together are ' + pct(d.totalShare, 1) + ' of ' + money(d.base.takeHome) + ' take-home; everything else ' + money(d.everythingElse) + '; left over ' + (d.leftOver === null ? 'unknown' : money(d.leftOver)) + '.'),
    math('draftt', d.rows.map((r) => 'plan:draftt:' + r.key), mathCtx(m)));
}

function floorScreen(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const shock = kept().shockMonths || '';
  const p = shock.trim() === '' ? { ok: true, value: null } : parseInput('int', shock);
  const f = fixedFloor(m.spine, m.rules, m.s, m.sim, { months: p.ok ? p.value : null });
  // The empty box names the months the run uses (the house default) so the result below is never a surprise.
  const months = h('input', { id: 'shock-months', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: (f.shock ? f.shock.months : m.rules.get('APP_SHOCK_MONTHS', +m.spine.meta.asOf.slice(0, 4))) + ' unless you type another' }); months.value = shock;
  return h('section', { class: 'card', 'aria-label': SCREENS.floor },
    h('p', { class: 'tile-sub' }, kindChip(f.kind), ' ', f.floor === null ? h('span', { class: 'missing-row' }, 'Missing: the amount of a fixed cost') : 'Fixed costs ' + money(f.floor) + ' a month (' + f.items.map((i) => i.label).join(', ') + (f.items.length ? ', plus' : '') + ' minimum payments ' + money(f.minimums) + '). ' + (f.runwayMonths === null ? '' : 'Cash (' + money(f.cash) + ') covers it for ' + Math.round(f.runwayMonths * 10) / 10 + ' months.' + (f.setAsideNote ? ' ' + f.setAsideNote : ''))),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const q = months.value.trim() === '' ? { ok: true } : parseInput('int', months.value); if (!q.ok) { msg.textContent = q.message; return; } keep({ shockMonths: months.value.trim() }); refresh(); } },
      h('label', { for: 'shock-months', class: 'edit-label' }, 'If every paycheck stopped for this many months'), months, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Run it'))),
    f.shock ? h('div', { class: 'tool-result' + (f.shock.firstBad ? ' bad' : '') }, f.shock.firstBad ? 'With no income for ' + f.shock.months + ' months from ' + shortDate(f.shock.from) + ', checking goes under the floor on ' + shortDate(f.shock.firstBad) + ' (' + f.shock.runwayDays + ' days). At risk: ' + f.shock.atRisk.map((x) => x.label + ': ' + money(x.amount) + ' short on ' + shortDate(x.date)).join('; ') + '.' : 'With no income for ' + f.shock.months + ' months from ' + shortDate(f.shock.from) + ', checking stays above the floor (lowest ' + money(f.shock.low.amount) + ' on ' + shortDate(f.shock.low.date) + ').') : null,
    h('p', { class: 'tile-note' }, 'A fixed cost is a line marked fixed in Numbers. This plays out your next months day by day with every paycheck taken away.'),
    math('floor', ['plan:floor'], mathCtx(m)));
}

function outlookScreen(m) {
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const want = kept().outlookRuns || '';
  const runs = h('input', { id: 'outlook-runs', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 200' }); runs.value = want;
  const p = want.trim() === '' ? { ok: true, value: null } : parseInput('int', want);
  const o = outlook(m.spine, m.rules, m.sim, { runs: p.ok && p.value ? Math.min(1000, Math.max(10, p.value)) : null });
  return h('section', { class: 'card', 'aria-labelledby': 'outlook-h' },
    h('h2', { id: 'outlook-h' }, 'Your next three months, run ' + o.runs + ' ways'),
    h('p', { class: 'muted' }, 'Each run moves every amount up to ' + pct(o.wobble) + ' higher or lower. A bad run is worse than 9 in 10; a good run is better than 9 in 10.'),
    h('div', { class: 'clear-grid' }, h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, money(o.low.bad)), h('span', { class: 'clear-label' }, 'Lowest day, bad run')), h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, money(o.low.typical)), h('span', { class: 'clear-label' }, 'Lowest day, typical')), h('div', { class: 'clear-tile' }, h('span', { class: 'clear-date' }, money(o.low.good)), h('span', { class: 'clear-label' }, 'Lowest day, good run')), h('div', { class: 'clear-tile' + (o.shareBelowFloor > 0.2 ? ' beyond' : '') }, h('span', { class: 'clear-date' }, pct(o.shareBelowFloor)), h('span', { class: 'clear-label' }, 'of runs go under the floor'))),
    // The runs top checking up from savings before a dip (house default), so their lowest day is the floor while the
    // Overview's line is the dip before that move.
    (() => { const { story } = forecast(m.base, m.rules); return h('p', { class: 'tile-sub' }, 'A run moves money from savings before checking would dip, so its lowest day sits at your floor whenever savings can cover it' + (story && story.under ? '; the ' + money(story.low.amount) + ' on the Overview is the dip before that move.' : '.')); })(),
    h('p', { class: 'tile-sub' }, kindChip(o.kind), ' Checking at the end: ' + money(o.end.bad) + ' bad, ' + money(o.end.typical) + ' typical, ' + money(o.end.good) + ' good. Card interest ' + (o.interest.low === o.interest.high ? money(o.interest.low) : money(o.interest.low) + ' to ' + money(o.interest.high)) + '.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); const q = runs.value.trim() === '' ? { ok: true } : parseInput('int', runs.value); if (!q.ok) { msg.textContent = q.message; return; } keep({ outlookRuns: runs.value.trim() }); refresh(); } }, h('label', { for: 'outlook-runs', class: 'edit-label' }, 'Runs (10 to 1,000)'), runs, msg, h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Run again'))),
    math('outlook', ['plan:outlook'], () => mathCtx(m)({ outlook: o })));
}

function eventsScreen(m) {
  const k = kept();
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const pick = h('select', { id: 'event-pick' }, h('option', { value: '' }, 'Pick a life event'), ...templates.map((t) => h('option', { value: t.id }, t.label)));
  pick.value = k.event || '';
  // The date box takes "dec 6" or "the 15th" (S-285); from holds the day it read.
  let from = k.eventDate || todayIso();
  const date = dateBox('event-date', from, (iso) => { from = iso; if (iso) keep({ eventDate: iso }); });
  const applied = [...new Set([...(m.base.income || []), ...(m.base.expenses || [])].map((x) => x.lifeEvent).filter(Boolean))];
  const chosen = templates.find((t) => t.id === pick.value);
  const labelOf = (id) => (templates.find((t) => t.id === id) || { label: id }).label;
  pick.addEventListener('change', () => { keep({ event: pick.value }); refresh(); });
  return h('section', { class: 'card', 'aria-label': SCREENS.events },
    h('p', { class: 'muted' }, 'Pick an event to see how it changes your plan.'),
    h('form', { class: 'tool-form', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const t = templates.find((x) => x.id === pick.value);
      if (!t) { msg.textContent = 'Pick an event'; pick.focus(); return; }
      if (!from) { msg.textContent = 'Type a date, like Dec 6'; date.focus(); return; }
      keep({ event: pick.value, eventDate: from });
      change((s) => applyLifeEvent(s, t, from).spine, said.added(t.label + ' from ' + shortDate(from)));
    } },
      h('label', { for: 'event-pick', class: 'edit-label' }, 'Event'), pick,
      chosen ? h('p', { class: 'edit-hint' }, chosen.summary + ' Lines: ' + chosen.items.map((i) => i.label + ' ' + (i.direction === 'in' ? '+' : '-') + money(i.cents / 100) + (EVENT_OFTEN[i.cadence] || '')).join('; ') + '.') : null,
      h('label', { for: 'event-date', class: 'edit-label' }, 'From'), date, msg,
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Add'))),
    applied.length ? [h('h3', { class: 'month-h' }, 'In your numbers now'), h('ul', { class: 'restore-list' }, applied.map((id) => h('li', {}, h('strong', {}, labelOf(id)),
      h('button', { type: 'button', class: 'btn danger small', onclick: () => change((s) => removeLifeEvent(s, id), said.deleted(labelOf(id))) }, 'Remove'))))] : null);
}

// A life event's line, how often, in words ("a month", "every two weeks"); once says nothing.
const EVENT_OFTEN = { month: ' a month', monthly: ' a month', biweekly: ' every two weeks', weekly: ' a week', semimonthly: ' twice a month', quarterly: ' a quarter', yearly: ' a year', year: ' a year' };

function scenariosScreen(m) {
  const list = readScenarios();
  const k = kept();
  const msg = h('p', { class: 'edit-msg', role: 'alert' });
  const nameBox = h('input', { id: 'scen-name', type: 'text', autocomplete: 'off', placeholder: 'e.g. Before the move' });
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
      h('div', { class: 'edit-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save'))),
    list.length ? [h('label', { for: 'scen-pick', class: 'edit-label' }, 'Compare'), pick,
      h('ul', { class: 'restore-list' }, list.map((x) => h('li', {}, h('strong', {}, x.name), x.id === targetId() ? h('span', { class: 'chip chip-default' }, 'Budget target') : null, h('span', { class: 'when' }, shortDate(x.savedAt.slice(0, 10))),
        h('button', { type: 'button', class: 'btn small', onclick: () => change(() => x.spine, said.changed('Your numbers', 'the scenario ' + x.name)) }, 'Load it'),
        h('button', { type: 'button', class: 'btn danger small', onclick: () => { const now = list.filter((y) => y.id !== x.id); keepScenarios(now); if (kept().compareWith === x.id) keep({ compareWith: '' }); refresh(); putBack(list, now, said.deleted('Scenario ' + x.name)); } }, 'Delete'))))] : h('p', { class: 'muted' }, 'None saved yet. Save today above, or open ' + SCREENS.whatif + ', slide, and save that.'),
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
  const file = h('input', { id: 'import-file', type: 'file', accept: '.json,application/json', 'aria-label': 'A backup file' });
  const download = (text, fileName, type) => { if (saveFile(fileName, text, type) !== 'saved') say('This window can\'t save files; open SLAM in its own tab to download it'); };
  const stamp = todayIso();
  const preview = pending ? (() => { try { const r = importJson(pending.text); return { ok: true, r, diff: diffSpines(m.base, r.spine) }; } catch (err) { return { ok: false, message: err.message }; } })() : null;
  return h('section', { class: 'card', 'aria-label': SCREENS.file },
    h('p', { class: 'muted' }, 'Download a backup of your numbers, or open a backup file. You see what changes before anything is saved.'),
    h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: preview ? 'btn' : 'btn primary', onclick: () => download(exportJson(m.base, { exportedAt: stamp }), slugOf(whose(m.base).name) + '-' + stamp + '.json', 'application/json') }, 'Download a backup'), h('button', { type: 'button', class: 'btn', onclick: () => download(exportCsv(m.base, 'log'), 'slam-log-' + stamp + '.csv', 'text/csv') }, 'Download the spending log as a spreadsheet'), h('button', { type: 'button', class: 'btn', onclick: () => download(exportCsv(m.base, 'lines'), 'slam-lines-' + stamp + '.csv', 'text/csv') }, 'Download every line as a spreadsheet')),
    h('div', { class: 'file-row' }, h('label', { for: 'import-file', class: 'edit-label' }, 'Open a backup file'), file, h('button', { type: 'button', class: 'btn', onclick: () => { const f = file.files && file.files[0]; if (!f) { msg.textContent = 'Pick a file first'; return; } f.text().then((t) => { pending = { text: t, name: f.name }; refresh(); }); } }, 'Open it')), msg,
    preview ? (preview.ok ? [h('p', { class: 'tile-sub' }, pending.name + ': a backup file' + (preview.r.migrated ? ', brought up to date' : '') + (preview.r.exportedAt ? ', downloaded ' + shortDate(preview.r.exportedAt.slice(0, 10)) : '') + '. ' + plural(preview.diff.length, 'change') + ' against today.'),
      preview.diff.length ? diffList(m.base, preview.r.spine, preview.diff, 40) : null,
      // A file with nothing different has nothing to apply, so it records no step to undo.
      h('div', { class: 'edit-actions' }, h('button', { type: 'button', class: 'btn primary', disabled: !preview.diff.length, onclick: () => { const r = preview.r, fileName = pending.name; pending = null; change(() => r.spine, said.changed('Your numbers', 'the file ' + fileName)); } }, preview.diff.length ? 'Apply the file' : 'Nothing to apply'), h('button', { type: 'button', class: 'btn ghost', onclick: () => { pending = null; refresh(); } }, 'Discard'))] : h('p', { class: 'edit-msg', role: 'alert' }, pending.name + ': ' + preview.message)) : null);
}

startPage({ tab: 'plan', title: 'Plan', subtab: subtabOf, name, render });

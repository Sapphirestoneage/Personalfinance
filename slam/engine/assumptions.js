// Every number the app assumes, in one list (the Assumptions page): Eli's method (house defaults), the order money
// goes in, the future guesses, the typical amounts and the law. Each row names itself plainly, says what it means and
// where it is used. Two levels: "for everyone" is the house default (data/house-defaults.json, changed on the Builder);
// "for this client" is an override saved on the household (spine.assumptionOverrides), read by every engine through
// withClient(rules, spine). Neither ever touches a number the client typed.
//
// Compatibility: spine.assumptionOverrides is new and optional ({ <rule id>: { value, asOf } }); a file without it reads
// every house default as it is.

import { setAt } from './spine.js';
import { METRICS, explainMetric } from './math.js';
import { summarize } from './summary.js';
import { withScenario } from './scenarios.js';
import { applyDefaults } from './defaults.js';

const T = 'dashboard.html', P = 'plan.html', N = 'ledger.html', C = 'calendar.html', S = 'spending.html', W = 'windfall.html', SE = 'ledger.html?guide=1', PR = 'profile.html';
const used = (...xs) => xs.map(([label, href]) => ({ label, href }));
// A row: the rule id, a plain name, one line on what it means, and the screens that read it.
const row = (id, name, means, screens) => ({ id, name, means, screens: used(...screens) });

export const GROUPS = [
  { id: 'method', label: 'Your method', note: 'How you fill a gap until the client\'s own number is in.', rows: [
    row('DEFAULT_CARD_APR', 'Card interest rate when unknown', 'A card with no rate typed uses this, marked as a guess.', [['Numbers, Debt', N + '#/debt'], ['Plan', P], ['Calendar', C]]),
    row('DEFAULT_DUE_DAY', 'Due day when unknown', 'A debt with no due day is due on this day of the month, as a guess.', [['Calendar', C], ['Numbers, Debt', N + '#/debt']]),
    row('APP_RULE_OF_5', 'Cushion: age divided by', 'Months of expenses in the cushion = age divided by this (age 32 / 5 = 6.4 months), before income security adds more.', [['Home', T], ['Plan', P]]),
    row('CUSHION_OKAY_EXTRA', 'Extra cushion months, income okay', 'Added to the cushion when income is okay but not rock solid.', [['Home', T], ['Plan', P]]),
    row('CUSHION_SHAKY_EXTRA', 'Extra cushion months, income shaky', 'Added to the cushion when income is shaky.', [['Home', T], ['Plan', P]]),
    row('APP_HOUSING_REF_CAR', 'Housing line, with a car', 'The share of take-home housing is compared with when there is a car. A reference, not a grade.', [['Plan', P], ['Spending', S]]),
    row('APP_HOUSING_REF', 'Housing line, no car', 'The share of take-home housing is compared with when there is no car. A reference, not a grade.', [['Plan', P], ['Spending', S]]),
    row('APP_STARTER_FUND', 'Starter fund', 'The Plan\'s first step when it is a fixed amount: cash to reach before anything else.', [['Plan', P]]),
    row('APP_MATERIALITY', 'Too small to matter', 'A difference under this reads as on plan; and smallest balance first is recommended over highest rate first when it costs no more interest than this.', [['Spending', S], ['Home', T], ['Numbers, Debt', N + '#/debt']]),
    row('APP_BUDGET_SHARE', 'Budget: a difference worth marking', 'A Budget row is marked over or under only when the difference is at least this share of its plan, or the too-small-to-matter amount, whichever is larger.', [['Spending, Budget', S + '#see']]),
    row('APP_TREND_PCT', 'Trend line for variable spending', 'A variable expense is going up or down once its latest month is this far from its average.', [['Spending', S + '#see']]),
    row('DEFAULT_PHONE_PLAN_1', 'Phone plan for one line', 'The standard plan a phone line can fill in with one tap, as a guess.', [['Numbers, Needs', N + '#/needs']]),
    row('DEFAULT_VEHICLE_DEPRECIATION', 'A car\'s yearly loss of value', 'How much a car is guessed to lose each year when its value is not updated.', [['Numbers, Assets', N + '#/assets']]),
    row('DEFAULT_APY', 'Rate on a plain account', 'A cash account with no rate typed earns this, as a guess.', [['Numbers, Assets', N + '#/assets']]),
    row('APP_CARD_MIN_PCT', 'Card minimum, share of the balance', 'A card\'s minimum when none is typed: this share of the balance.', [['Calendar', C], ['Plan', P]]),
    row('APP_CARD_MIN_FLOOR', 'Card minimum, the least', 'The smallest minimum a card asks for.', [['Calendar', C], ['Plan', P]]),
    row('APP_HI_RATE', 'High-rate debt line', 'Debt at or above this rate is paid down before saving past the match.', [['Plan', P]])
  ] },
  { id: 'stages', label: 'When a stage turns red, yellow or green', note: 'The lines the stage colours and nudges use.', rows: [
    row('STAGE_RUNWAY_RED_MONTHS', 'Runway that reads red', 'Fewer months of cash than this is a red stage.', [['Home', T], ['Plan', P]]),
    row('STAGE_UTIL_RED', 'Card use that reads red', 'Using more than this share of card limits is red.', [['Home', T], ['Numbers, Debt', N + '#/debt']]),
    row('STAGE_UTIL_GREEN', 'Card use that reads green', 'Using less than this share of card limits is green.', [['Home', T]]),
    row('STAGE_FI_YELLOW_RATIO', 'FI progress that reads yellow', 'Invested over the FI number past this share is yellow.', [['Home', T]]),
    row('STAGE_FI_GREEN_RATIO', 'FI progress that reads green', 'Invested over the FI number past this share is green.', [['Home', T]]),
    row('STAGE_REPLACE_YELLOW', 'Income replaced that reads yellow', 'Investments replacing this share of spending is yellow.', [['Home', T]]),
    row('STAGE_COVERAGE_RED_DAYS', 'Days without coverage that read red', 'More days than this without health cover is red.', [['Home', T]]),
    row('STAGE_CLIFF_MONTHS', 'Income ending soon', 'Income that stops within this many months shows a warning.', [['Home', T], ['Calendar', C]])
  ] },
  { id: 'order', label: 'Order and allocations', note: 'Where the next dollar goes.', rows: [
    row('FOO_RUNGS', 'The order money goes in', 'The steps money climbs, one at a time.', [['Plan', P], ['Home', T]]),
    row('WINDFALL_ORDER', 'Extra money order', 'Where extra money goes first.', [['Extra money', W]]),
    row('FOO_HYPER_RATE', 'Invest-more mark, of gross (how this rule is defined)', 'Saving this share of gross pay reaches the invest-more step.', [['Plan', P]]),
    { id: 'REF_503020', name: '50/30/20 reference', means: 'Needs, wants and saving as a share of pay, shown as a reference line, never a grade.', screens: used(['Spending', S + '#see']), reference: 'benchmarks' }
  ] },
  { id: 'future', label: 'Future guesses', note: 'The sets every FI number reads. The client\'s own guesses are their numbers, on Numbers.', rows: [
    row('SCENARIO_LIKELY_RETURN', 'Standard set: real return', 'A year\'s return after inflation in the Standard set.', [['Home', T], ['Plan', P], ['Numbers, Goals', N + '#/goals']]),
    row('SCENARIO_LIKELY_WR', 'Standard set: withdrawal rate', 'The share taken out a year in the Standard set; it sets the FI number.', [['Home', T], ['Plan', P], ['Numbers, Goals', N + '#/goals']]),
    row('SCENARIO_WORST_RETURN', 'Conservative set: real return', 'A year\'s return after inflation in the Conservative set.', [['Home', T], ['Plan', P]]),
    row('SCENARIO_WORST_WR', 'Conservative set: withdrawal rate', 'The withdrawal rate in the Conservative set.', [['Home', T], ['Plan', P]]),
    row('SCENARIO_OPT_RETURN', 'Optimistic set: real return', 'A year\'s return after inflation in the Optimistic set.', [['Home', T], ['Plan', P]]),
    row('SCENARIO_OPT_WR', 'Optimistic set: withdrawal rate', 'The withdrawal rate in the Optimistic set.', [['Home', T], ['Plan', P]]),
    row('APP_COAST_AGE', 'Coast age', 'The age Coast FI counts to when the client has not said.', [['Plan', P], ['Numbers, Goals', N + '#/goals']]),
    row('APP_FAT_FI_MULT', 'Fat FI: dream spending', 'Dream yearly spending as a multiple of today\'s, until the FI goal says.', [['Numbers, Goals', N + '#/goals']]),
    row('APP_BARISTA_SHARE', 'Barista FI: part-time work covers', 'The share of today\'s spending part-time work pays, until the FI goal says.', [['Numbers, Goals', N + '#/goals']])
  ], own: [
    ['inflation', 'Inflation'], ['realReturn', 'Real return'], ['withdrawalRate', 'Withdrawal rate'], ['lifeExpectancy', 'Life expectancy'], ['coastAge', 'Coast age']
  ] },
  { id: 'typical', label: 'Typical amounts', note: 'Published averages Guide me can fill blank lines with, always marked as a guess and called typical.', typical: true, screens: used(['Guide me', SE]) },
  { id: 'law', label: 'Rules', note: 'The law: limits, brackets and dates, listed and changed on the Builder\'s Rules page.', law: true }
];
export const ROWS = GROUPS.flatMap((g) => g.rows || []);
export const rowById = (id) => ROWS.find((r) => r.id === id) || null;
export const PROFILE_HREF = PR;

// ---------------------------------------------------------------- for this client
export const clientOverrides = (spine) => (spine && spine.assumptionOverrides && typeof spine.assumptionOverrides === 'object' ? spine.assumptionOverrides : {});
// The rules with this client's overrides laid over the house defaults: get() and meta() read the override; the rest is
// the same object, so a page that passes rules on reads the client's numbers everywhere.
export function withClient(rules, spine) {
  const own = clientOverrides(spine);
  if (!rules || !Object.keys(own).length) return rules;
  const has = (id) => Object.prototype.hasOwnProperty.call(own, id) && own[id] && 'value' in own[id];
  return {
    ...rules,
    house: rules.house || rules,
    get: (id, year) => (has(id) ? own[id].value : rules.get(id, year)),
    meta: (id, year) => (has(id) ? { ...rules.meta(id, year), value: own[id].value, client: true } : rules.meta(id, year))
  };
}
// The household's own rules registry, never the client one, for the "your default" side of a row.
export const houseOf = (rules) => (rules && rules.house) || rules;

export function setClientAssumption(spine, id, value, today) {
  if (!rowById(id)) throw new Error('Not an assumption that can change for a client: ' + id);
  return setAt(spine, 'assumptionOverrides', { ...clientOverrides(spine), [id]: { value, asOf: today } });
}
export function resetClientAssumption(spine, id) {
  const own = { ...clientOverrides(spine) };
  if (!(id in own)) return spine;
  delete own[id];
  if (Object.keys(own).length) return setAt(spine, 'assumptionOverrides', own);
  const next = { ...spine };
  delete next.assumptionOverrides;
  return next;
}

// ---------------------------------------------------------------- which formulas read a rule, and what a change moves
// Every formula that reads each rule on this household: Map(rule id -> [{ id, label }]).
// scenario: the assumption set picked (the FI numbers read it), so the set's own rows count as read.
export function formulasByRule(ctx, { scenario = null } = {}) {
  const out = new Map();
  if (scenario) ctx = { ...ctx, spine: withScenario(ctx.spine, ctx.rules, scenario) };
  if (!ctx.s) ctx = { ...ctx, s: summarize(ctx.spine, ctx.rules, { flags: false }) };
  for (const m of METRICS) {
    let e = null;
    try { e = explainMetric(m.id, ctx); } catch { e = null; }
    for (const id of (e && e.rules) || []) { if (!out.has(id)) out.set(id, []); out.get(id).push({ id: m.id, label: m.label }); }
  }
  return out;
}

// Before and after a change, on this household: the first `limit` numbers that move, else the formulas that read it.
// rules: the ones in use now (this client's own values included). Each side fills blanks from its own defaults and
// applies the picked assumption set, as the pages do, so a default that only fills a blank and a set's own rates move.
export function previewChange(spine, rules, id, value, { limit = 2, scenario = null } = {}) {
  const after = { ...rules, get: (rid, y) => (rid === id ? value : rules.get(rid, y)), meta: (rid, y) => (rid === id ? { ...rules.meta(rid, y), value } : rules.meta(rid, y)) };
  const side = (r) => { const sp = scenario ? withScenario(applyDefaults(spine, r), r, scenario) : applyDefaults(spine, r); return { spine: sp, rules: r, s: summarize(sp, r, { flags: false }) }; };
  const a = side(rules), b = side(after);
  const moved = [];
  for (const m of METRICS) {
    let x = null, y = null;
    try { x = explainMetric(m.id, a); y = explainMetric(m.id, b); } catch { continue; }
    if (!x || !y) continue;
    if (JSON.stringify(x.value) !== JSON.stringify(y.value)) moved.push({ id: m.id, label: m.label, unit: m.unit, before: x.value, after: y.value });
    if (moved.length >= limit) break;
  }
  return moved;
}

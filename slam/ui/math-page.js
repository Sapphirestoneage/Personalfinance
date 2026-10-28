// All formulas (math.html, S-177), a Builder page (S-230): no tab is lit, and its Back goes to the Builder. Screen by
// screen: the top lists every number the app figures, each with today's value and a chevron; each one opens on its
// own screen (math.html#/netWorth) with its formula, the same formula with today's numbers, its inputs, its rules
// and the screens that show it. Everything comes from engine/math.js, so nothing here is written by hand. A rule
// opens on the Rules page (rules.html#/<id>), which lists every rule; this page no longer repeats that list.

import { startPage } from './shell.js';
import { summarize } from '../engine/summary.js';
import { METRICS, metricById, explainMetric, showNumber } from '../engine/math.js';
import { canMaxIt } from '../engine/maxit.js';
import { withScenario, SCENARIO_WORDS } from '../engine/scenarios.js';
import { pickedScenario, scenarioText } from './scenario.js';
import { rowById } from '../engine/assumptions.js';
import { h, chip, money, ledgerHref } from './view.js';

const TILE_WORDS = { networth: 'net worth', runway: 'cash runway', surplus: 'monthly surplus', savings: 'savings rate', cards: 'credit cards', fi: 'financial independence', tax: 'tax' };
// A Home card that is its own screen (dashboard.html#/networth) links there; the rest of Home, and a flag, link to Home.
const HOME_LEVELS = ['networth', 'surplus', 'savings', 'runway'];
const SCREEN_WORDS = (sc) => {
  if (sc.startsWith('dashboard#tile-')) { const id = sc.slice(15); return h('a', { href: 'dashboard.html' + (HOME_LEVELS.includes(id) ? '#/' + id : '') }, 'Home, ' + (TILE_WORDS[id] || id)); }
  if (sc.startsWith('flag:')) return h('a', { href: 'dashboard.html' }, 'Home');
  return sc === 'ledger' ? h('a', { href: 'ledger.html' }, 'Numbers') : sc === 'windfall' ? h('a', { href: 'windfall.html' }, 'Extra money') : sc === 'calendar' ? h('a', { href: 'calendar.html' }, 'Calendar') : sc === 'plan' ? h('a', { href: 'plan.html' }, 'Plan') : h('span', {}, 'this page');
};

// Units in words, not codes.
const UNIT_WORDS = { usd: 'dollars', 'usd/month': 'dollars a month', 'usd/year': 'dollars a year', ratio: 'percent', months: 'months', years: 'years', age: 'age', count: 'count' };
const ruleHref = (id) => 'rules.html#/' + encodeURIComponent(id);

// How much to max it (S-211): the first account's room, a month and lump sum for this year, as the family's sample.
function maxItSample(spine, rules) {
  const y = +spine.meta.asOf.slice(0, 4);
  const a = (spine.accounts || []).find((x) => canMaxIt(rules, x, y));
  return a ? ['room', 'lump', 'month'].map((w) => ['maxit' + (w === 'room' ? '' : '-' + w), 'maxit:' + a.id + ':' + y + ':' + w]) : [];
}

// Every screen this page has, in order: [level, metric id]. Numbers that come one per year or per account (S-210)
// show this year's, under the family's name.
const screens = (spine, rules) => [
  ...METRICS.map((m) => [m.id, m.id]),
  ['earned', 'earned:' + spine.meta.asOf.slice(0, 4)],
  ...maxItSample(spine, rules)
];
const metricAt = (level, spine, rules) => { const s = screens(spine, rules).find(([l]) => l === level); return s ? metricById(s[1]) : null; };

// The household with the Triple D set picked on Today (S-183), and what every explanation reads.
function figure(base, rules) {
  const spine = withScenario(base, rules, pickedScenario());
  return { spine, rules, s: summarize(spine, rules) };
}

// The top: one row per number, its value today, and a chevron that opens it. A summary row shows whole dollars
// (the cents are on the number's own screen); a number that is missing wears its chip alone.
const DOLLAR_UNITS = ['usd', 'usd/month', 'usd/year'];
const summaryWords = (e) => (e.kind !== 'notForMe' && DOLLAR_UNITS.includes(e.unit) && e.value !== null && e.value !== undefined ? money(e.value) : showNumber(e.value, e.unit, e.kind));
const summarySub = (e) => (e.kind !== 'notForMe' && (e.value === null || e.value === undefined) ? chip(e.kind === 'incomplete' ? 'incomplete' : 'missing')
  : [h('span', { class: 'go-total' }, summaryWords(e)), e.kind === 'rough' || e.kind === 'incomplete' ? chip(e.kind) : null]);
function list(base, rules) {
  const set = pickedScenario();
  const ctx = figure(base, rules);
  return [
    h('p', { class: 'lede' }, 'How every number is figured: its formula, then the same formula with today\'s numbers.'),
    h('p', { class: 'muted' }, 'FI numbers use the ' + SCENARIO_WORDS[set].toLowerCase() + ' assumption set (' + scenarioText(base, rules, set) + '); ', h('a', { href: 'profile.html#/goals' }, 'change it in Profile'), '.'),
    h('ul', { class: 'go-list', 'aria-label': 'Every number' }, screens(base, rules).map(([level, id]) => {
      const e = explainMetric(id, ctx);
      return h('li', {}, h('a', { class: 'go-row plain', href: '#/' + encodeURIComponent(level) },
        h('span', { class: 'go-name' }, e.label),
        h('span', { class: 'go-sub' }, summarySub(e))));
    }))
  ];
}

// One number on its own screen. An input that is another number opens that number's screen; an input from your
// numbers opens it in Numbers; a rule opens on the Rules page. An input with nowhere to go is plain text.
function one(level, base, rules) {
  const m = metricAt(level, base, rules);
  const ctx = figure(base, rules);
  const e = explainMetric(m.id, ctx);
  const levelOf = new Map(screens(base, rules).map(([l, id]) => [id, l]));
  const input = (t) => t.path ? h('a', { href: ledgerHref(t.path) }, t.label)
    : t.metric && levelOf.has(t.metric) ? h('a', { href: '#/' + encodeURIComponent(levelOf.get(t.metric)) }, t.label)
      : t.rule ? h('a', { href: ruleHref(t.rule) }, t.label) : t.label;
  return h('section', { class: 'card metric', 'aria-label': e.label },
    h('p', { class: 'muted' }, 'Unit: ' + (UNIT_WORDS[m.unit] || m.unit) + '.'),
    h('p', { class: 'math-formula' }, m.formula),
    h('p', { class: 'math-plugged' }, h('code', {}, e.plugged)),
    e.note ? h('p', { class: 'math-note' }, e.note) : null,
    e.roughBecause.length ? h('p', { class: 'math-why' }, 'Rough because: ' + e.roughBecause.join(', ') + '.') : null,
    // A flag sits on Home; when a Home card is already named, the flag adds nothing.
    h('p', { class: 'muted' }, 'Shown on: ', ...m.screens.filter((sc) => !(sc.startsWith('flag:') && m.screens.some((x) => x.startsWith('dashboard#')))).flatMap((sc, i) => [i ? ', ' : '', SCREEN_WORDS(sc)])),
    h('h2', {}, 'Inputs (' + e.terms.length + ')'),
    e.terms.length ? h('ul', { class: 'math-terms' }, e.terms.map((t) => h('li', { class: 'math-term' }, chip(t.kind), ' ', input(t),
      ' ', h('span', { class: 'math-value' }, (t.role === 'minus' ? '- ' : '') + showNumber(t.value, t.unit, t.kind))))) : h('p', { class: 'muted' }, 'None.'),
    // What it assumes (owner's ask, 2026-10-27): Eli's defaults open on the Assumptions page; the law on Rules.
    reads(e.rules, rules, 'Assumptions it reads: ', true),
    reads(e.rules, rules, 'Rules from the law it reads: ', false),
    reads(e.rules, rules, 'Assumptions it reads: ', true) || e.rules.some((r) => !isAssumption(r)) ? null : h('p', { class: 'muted' }, 'It reads no assumption: only your numbers.'));
}
const isAssumption = (id) => !!rowById(id);
function reads(ids, rules, words, assumed) {
  const list = ids.filter((r) => isAssumption(r) === assumed);
  if (!list.length) return null;
  const name = (r) => (assumed ? rowById(r).name : (() => { try { return rules.meta(r).rule || r; } catch { return r; } })());
  return h('p', { class: 'math-rules' }, words, ...list.flatMap((r, i) => [i ? ', ' : '', h('a', { href: assumed ? 'assumptions.html#/' + encodeURIComponent(r) : ruleHref(r) }, name(r))]));
}

// Old links still land: math.html#metric-netWorth (Show the math's "This formula on the math page") opens that
// number's screen; math.html#rule-K401_DEF and #rules open the Rules page.
const old = /^#(metric|rule)-(.+)$|^#rules$/.exec(location.hash);
if (old && old[1] !== 'metric') location.replace('rules.html' + (old[2] ? '#/' + old[2] : ''));
else {
  if (old) history.replaceState(history.state, '', '#/' + old[2]);
  startPage({
    tab: null, title: 'All formulas', parent: ['Builder', 'builder.html'],
    name: (levels, { spine, rules }) => (levels.length === 1 && metricAt(levels[0], spine, rules) ? metricAt(levels[0], spine, rules).label : null),
    render: ({ spine, rules, levels }) => (levels.length ? one(levels[0], spine, rules) : list(spine, rules))
  });
}

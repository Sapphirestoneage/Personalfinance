// math.html (S-177): every number the app computes, its formula, inputs,
// rules and the screens that show it, built at load from engine/math.js and
// the rules registry, with today's numbers for the loaded household. Nothing
// here is written by hand, so it cannot drift from the engines.

import { mountPage, whoseLine } from './page.js';
import { summarize } from '../engine/summary.js';
import { METRICS, metricById, explainMetric, showNumber } from '../engine/math.js';
import { canMaxIt } from '../engine/maxit.js';
import { loadAll } from './household.js';
import { withScenario, SCENARIO_WORDS } from '../engine/scenarios.js';
import { pickedScenario, scenarioText } from './scenario.js';
import { h, chip, ledgerHref, shortDate } from './view.js';

const app = document.getElementById('app');
mountPage({ app });
const TILE_WORDS = { networth: 'net worth', runway: 'cash runway', surplus: 'monthly surplus', savings: 'savings rate', cards: 'credit cards', fi: 'financial independence', tax: 'tax' };
const SCREEN_WORDS = (sc) => sc.startsWith('dashboard#') ? h('a', { href: 'dashboard.html#' + sc.slice(10) }, 'Dashboard, ' + (TILE_WORDS[sc.slice(15)] || sc.slice(10))) : sc.startsWith('flag:') ? h('a', { href: 'dashboard.html#flag-' + sc.slice(5) }, 'Dashboard flag') : sc === 'ledger' ? h('a', { href: 'ledger.html' }, 'Ledger') : sc === 'windfall' ? h('a', { href: 'windfall.html' }, 'Windfall') : sc === 'calendar' ? h('a', { href: 'calendar.html' }, 'Calendar') : sc === 'plan' ? h('a', { href: 'plan.html' }, 'Plan') : h('span', {}, 'this page');

// Units in words, not codes.
const UNIT_WORDS = { usd: 'dollars', 'usd/month': 'dollars a month', 'usd/year': 'dollars a year', ratio: 'percent', months: 'months', years: 'years', age: 'age', count: 'count' };

function metricCard(m, ctx, anchor = m.id) {
  const e = explainMetric(m.id, ctx);
  return h('section', { class: 'card metric', id: 'metric-' + anchor, 'aria-labelledby': 'mh-' + anchor },
    h('h2', { id: 'mh-' + anchor }, m.label, ' ', h('span', { class: 'unit' }, UNIT_WORDS[m.unit] || m.unit)),
    h('p', { class: 'math-formula' }, m.formula),
    h('p', { class: 'math-plugged' }, h('code', {}, e.plugged)),
    e.note ? h('p', { class: 'math-note' }, e.note) : null,
    e.roughBecause.length ? h('p', { class: 'math-why' }, 'Rough because: ' + e.roughBecause.join(', ') + '.') : null,
    h('p', { class: 'muted' }, 'Shown on: ', ...m.screens.flatMap((sc, i) => [i ? ', ' : '', SCREEN_WORDS(sc)])),
    h('details', { class: 'inputs' }, h('summary', {}, 'Inputs (' + e.terms.length + ')'),
      h('ul', { class: 'math-terms' }, e.terms.map((t) => h('li', { class: 'math-term' }, chip(t.kind), ' ',
        t.path ? h('a', { href: ledgerHref(t.path) }, t.label) : t.metric ? h('a', { href: '#metric-' + t.metric.split(':')[0] }, t.label) : t.rule ? h('a', { href: '#rule-' + t.rule }, t.label) : t.label,
        ' ', h('span', { class: 'math-value' }, (t.role === 'minus' ? '- ' : '') + showNumber(t.value, t.unit, t.kind)))))),
    e.rules.length ? h('p', { class: 'math-rules' }, 'Rules: ', ...e.rules.flatMap((r, i) => [i ? ', ' : '', h('a', { href: '#rule-' + r }, r)])) : null);
}

// How much to max it (S-211): the first account's room, a month and lump sum for this year, as the family's sample.
function maxItSample(spine, rules, s) {
  const y = +s.asOf.slice(0, 4);
  const a = (spine.accounts || []).find((x) => canMaxIt(rules, x, y));
  return a ? ['room', 'lump', 'month'].map((w) => ['maxit' + (w === 'room' ? '' : '-' + w), 'maxit:' + a.id + ':' + y + ':' + w]) : [];
}

function rulesTable(rules) {
  const year = rules.years().slice(-1)[0];
  return h('section', { class: 'card', id: 'rules', 'aria-labelledby': 'rules-h' },
    h('h2', { id: 'rules-h' }, 'Rules (data/rules-' + year + '.json)'),
    h('p', { class: 'muted' }, 'Every limit, rate and threshold, with its source and how sure it is.'),
    h('ul', { class: 'rule-list' }, rules.ids(year).map((id) => {
      const r = rules.meta(id, year);
      // Brackets are [top, rate] pairs; any other list (an order, two ages) reads as a list (S-211).
      const val = Array.isArray(r.value) && r.value.every((x) => Array.isArray(x)) ? r.value.map(([top, rate]) => (Math.round(rate * 10000) / 100) + '% to ' + (top === null ? 'the top' : '$' + top.toLocaleString('en-US'))).join('; ')
        : Array.isArray(r.value) ? r.value.join(', ')
          : String(r.value) + (r.yearOffset ? ' of the year after the tax year' : r.yearOffset === 0 ? ' of the tax year' : '');
      return h('li', { id: 'rule-' + id, class: 'rule' },
        h('p', { class: 'rule-head' }, h('code', {}, id), ' ', r.rule),
        h('p', { class: 'rule-body' }, 'Value: ', h('strong', {}, val), r.unit ? ' (' + r.unit + ')' : '', '. Year ' + r.year + '. Source: ' + r.source + '. Verified: ' + r.verified + '.'));
    })));
}

function boot({ spine: base, rules, source, problem }) {
  // The Triple D set picked on the Dashboard (S-183).
  const set = pickedScenario();
  const spine = withScenario(base, rules, set);
  const s = summarize(spine, rules);
  const ctx = { spine, rules, s };
  app.replaceChildren(
    h('nav', { class: 'page-links', 'aria-label': 'Pages' }, h('a', { href: 'dashboard.html' }, 'Dashboard'), h('a', { href: 'ledger.html' }, 'Ledger'), h('a', { href: 'calendar.html' }, 'Calendar'), h('a', { href: 'windfall.html' }, 'Windfall')),
    h('header', { class: 'top' },
      h('div', {}, h('h1', {}, 'How every number is figured'),
        whoseLine(base, source, { asOf: s.asOf, rules, reopen: boot }),
        h('p', { class: 'muted' }, 'FI numbers use the ' + SCENARIO_WORDS[set].toLowerCase() + ' assumption set (' + scenarioText(base, rules, set) + '); ', h('a', { href: 'dashboard.html' }, 'change it on the Dashboard'), '.')),
    ),
    h('p', { class: 'muted' }, 'Built from the engines when this page loads: ' + METRICS.length + ' numbers, plus one utilization number per card, one cost per expense, and one per Windfall step (shown on the Windfall page). Each formula is followed by the same formula with today\'s numbers.'),
    h('nav', { class: 'card jump', 'aria-label': 'Jump to a number' }, METRICS.map((m) => h('a', { href: '#metric-' + m.id }, m.label)), h('a', { href: '#rules' }, 'Rules')),
    ...METRICS.map((m) => metricCard(m, ctx)),
    // Numbers that come one per year or per account (S-210): this year's, under the family's name.
    ...[['earned', 'earned:' + s.asOf.slice(0, 4)], ...maxItSample(spine, rules, s)].map(([anchor, id]) => metricCard(metricById(id), ctx, anchor)),
    rulesTable(rules));
  if (problem) app.prepend(h('p', { class: 'card', role: 'alert' }, problem));
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
}
loadAll().then(boot).catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The math page could not load: ' + err.message)); });

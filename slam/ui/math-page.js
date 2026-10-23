// math.html (S-177): every number the app computes, its formula, inputs,
// rules and the screens that show it, built at load from engine/math.js and
// the rules registry, with today's numbers for the loaded household. Nothing
// here is written by hand, so it cannot drift from the engines.

import { summarize } from '../engine/summary.js';
import { METRICS, explainMetric, showNumber } from '../engine/math.js';
import { loadAll, SOURCE_WORDS } from './household.js';
import { h, chip, ledgerHref, shortDate } from './view.js';

const app = document.getElementById('app');
const SCREEN_WORDS = (sc) => sc.startsWith('dashboard#') ? h('a', { href: 'dashboard.html#' + sc.slice(10) }, 'Dashboard') : sc.startsWith('flag:') ? h('a', { href: 'dashboard.html#flag-' + sc.slice(5) }, 'Dashboard flag') : sc === 'ledger' ? h('a', { href: 'ledger.html' }, 'Ledger') : h('span', {}, 'this page');

function metricCard(m, ctx) {
  const e = explainMetric(m.id, ctx);
  return h('section', { class: 'card metric', id: 'metric-' + m.id, 'aria-labelledby': 'mh-' + m.id },
    h('h2', { id: 'mh-' + m.id }, m.label, ' ', h('span', { class: 'unit' }, m.unit)),
    h('p', { class: 'math-formula' }, m.formula),
    h('p', { class: 'math-plugged' }, h('code', {}, e.plugged)),
    e.note ? h('p', { class: 'math-note' }, e.note) : null,
    e.roughBecause.length ? h('p', { class: 'math-why' }, 'Rough because: ' + e.roughBecause.join(', ') + '.') : null,
    h('p', { class: 'muted' }, 'Shown on: ', ...m.screens.flatMap((sc, i) => [i ? ', ' : '', SCREEN_WORDS(sc)])),
    h('details', { class: 'inputs' }, h('summary', {}, 'Inputs (' + e.terms.length + ')'),
      h('ul', { class: 'math-terms' }, e.terms.map((t) => h('li', { class: 'math-term' }, chip(t.kind), ' ',
        t.path ? h('a', { href: ledgerHref(t.path) }, t.label) : t.metric ? h('a', { href: '#metric-' + t.metric.split(':')[0] }, t.label) : t.rule ? h('a', { href: '#rule-' + t.rule }, t.label) : t.label,
        ' ', h('span', { class: 'math-value' }, (t.role === 'minus' ? '- ' : '') + showNumber(t.value, t.unit)))))),
    e.rules.length ? h('p', { class: 'math-rules' }, 'Rules: ', ...e.rules.flatMap((r, i) => [i ? ', ' : '', h('a', { href: '#rule-' + r }, r)])) : null);
}

function rulesTable(rules) {
  const year = rules.years().slice(-1)[0];
  return h('section', { class: 'card', id: 'rules', 'aria-labelledby': 'rules-h' },
    h('h2', { id: 'rules-h' }, 'Rules (data/rules-' + year + '.json)'),
    h('p', { class: 'muted' }, 'Every limit, rate and threshold, with its source and how sure it is.'),
    h('ul', { class: 'rule-list' }, rules.ids(year).map((id) => {
      const r = rules.meta(id, year);
      const val = Array.isArray(r.value) ? r.value.map(([top, rate]) => (Math.round(rate * 10000) / 100) + '% to ' + (top === null ? 'the top' : '$' + top.toLocaleString('en-US'))).join('; ') : String(r.value);
      return h('li', { id: 'rule-' + id, class: 'rule' },
        h('p', { class: 'rule-head' }, h('code', {}, id), ' ', r.rule),
        h('p', { class: 'rule-body' }, 'Value: ', h('strong', {}, val), r.unit ? ' (' + r.unit + ')' : '', '. Year ' + r.year + '. Source: ' + r.source + '. Verified: ' + r.verified + '.'));
    })));
}

loadAll().then(({ spine, rules, source }) => {
  const s = summarize(spine, rules);
  const ctx = { spine, rules, s };
  app.replaceChildren(
    h('header', { class: 'top' },
      h('div', {}, h('h1', {}, 'How every number is figured'),
        h('p', { class: 'muted' }, spine.meta.name, ' · numbers as of ', shortDate(s.asOf), ' · ', SOURCE_WORDS[source])),
      h('nav', { class: 'top-actions' }, h('a', { class: 'btn', href: 'ledger.html' }, 'Ledger'), h('a', { class: 'btn primary', href: 'dashboard.html' }, 'Dashboard'))),
    h('p', { class: 'muted' }, 'Built from the engines when this page loads: ' + METRICS.length + ' numbers, plus one utilization number per card and one cost per expense. Each formula is followed by the same formula with today\'s numbers.'),
    h('nav', { class: 'card jump', 'aria-label': 'Jump to a number' }, METRICS.map((m) => h('a', { href: '#metric-' + m.id }, m.label)), h('a', { href: '#rules' }, 'Rules')),
    ...METRICS.map((m) => metricCard(m, ctx)),
    rulesTable(rules));
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' });
}).catch((err) => { app.replaceChildren(h('p', { class: 'card' }, 'The math page could not load: ' + err.message)); });

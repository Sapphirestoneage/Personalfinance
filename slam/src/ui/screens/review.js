// Analyze, Review and plan (S-076): a month's actuals next to the following
// month's plan, line by line, with % of income, % of spending, and happiness.
// Adjust the plan, keep / cut / change, tick each line off, carry it forward.
// Every number comes from calc (reviewSummary); estimates are only ever read here.

import { h, options } from '../dom.js';
import { money, signedMoney, pct, monthLabel } from '../format.js';
import { makeValue } from '../../store/value.js';
import { parseAmount } from '../components/value-input.js';
import { nameEdit } from '../components/name-edit.js';
import { reviewSummary, planStartValues, prevMonthKey } from '../../calc/plan.js';
import { startPlan, setPlanAmount, setPlanDecision, setPlanReviewed, setPlanStop, addPlanLine, addPlanCategory, planLineByLine, copyPlanForward, getPlan } from '../../store/plans.js';
import { nextMonthKey } from '../../store/months.js';
import { findCategory, renameLine } from '../../store/edits.js';

const SOURCES = [['last-plan', "Last month's plan"], ['actuals', "This month's actuals"], ['estimates', 'Estimates'], ['dreams', 'Dreams']];
const COLS = [
  ['name', 'Line'], ['actual', 'Actual'], ['pctIncome', '% of income'], ['pctSpending', '% of spending'], ['happy', 'Happiness'],
  ['estimate', 'Estimate'], ['dream', 'Dream'], ['plan', 'Plan'], ['decision', 'Keep / cut / change'], ['reviewed', 'Reviewed']
];
const narrow = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 759px)').matches;
const QUICK = [['drain', -1, 'Look at first (stress)'], ['pctIncome', -1, 'Biggest % of income'], ['per100', 1, 'Lowest joy per $100'], ['gap', -1, 'Biggest gap from estimate']];

function sortValue(r, key) {
  if (key === 'pctIncome') return r.pctIncome.actual;
  if (key === 'pctSpending') return r.pctSpending.actual;
  if (key === 'happy') return r.happiness ? r.happiness.share : null;
  if (key === 'per100') return r.happiness ? r.happiness.per100 : null;
  if (key === 'drain') return r.stress ? r.stress.drain : null;
  if (key === 'gap') return r.gapFromEstimate === null ? null : Math.abs(r.gapFromEstimate);
  if (key === 'decision') return r.decision || '';
  if (key === 'reviewed') return r.reviewed ? 1 : 0;
  return r[key];
}

function sorted(rows, sort) {
  if (!sort || !sort.key) return rows;
  return rows.slice().sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (x < y ? -1 : 1) * sort.dir;
  });
}

function joyCell(hp, st) {
  const stress = st ? h('div', { class: 'xs muted' }, 'stress ' + st.stress + '/10' + (st.lean ? ', ' + { more: 'more of', less: 'less of', even: 'about even' }[st.lean] : '')) : null;
  if (!hp) return h('span', {}, h('span', { class: 'xs muted' }, 'not rated'), stress);
  const per = hp.per100 !== null ? hp.per100.toFixed(2) + ' per $100' : hp.noCost ? 'no cost' : 'no amount';
  return h('span', {}, pct(hp.share), h('div', { class: 'xs muted' }, hp.rating + '/10, ' + per), stress);
}

function planInput(ctx, pm, r, sfx = '') {
  if (r.computed) return h('span', { class: 'num' }, money(r.plan), h('div', { class: 'xs muted' }, 'from debts'));
  return h('input', { type: 'text', inputmode: 'decimal', class: 'amount', style: 'width:6.5em', value: r.plan === null ? '' : String(Math.round(r.plan * 100) / 100), placeholder: '$',
    'aria-label': r.name + ' plan for ' + monthLabel(pm), 'data-key': 'plan:' + pm + ':' + r.key + sfx,
    onchange: (e) => {
      const a = parseAmount(e.target.value);
      if (a === undefined) { e.target.value = r.plan === null ? '' : r.plan; return; }
      ctx.update('Plan ' + r.name, (d) => setPlanAmount(d, pm, r.key, makeValue(a, { cadence: 'month' })));
    } });
}

function decisionCell(ctx, pm, r, sfx = '') {
  if (r.computed) return h('span', { class: 'xs muted' }, 'computed');
  if (r.decision === 'new') return h('span', { class: 'chip' }, 'New');
  const btn = (d, label) => h('button', { 'aria-pressed': r.decision === d ? 'true' : 'false', 'data-key': 'plan-dec:' + pm + ':' + r.key + ':' + d + sfx,
    onclick: () => ctx.update(label + ' ' + r.name, (doc) => setPlanDecision(doc, pm, r.key, d)) }, label);
  return h('div', {},
    h('div', { class: 'toggle', role: 'group', 'aria-label': 'Decision for ' + r.name }, btn('keep', 'Keep'), btn('cut', 'Cut'), btn('change', 'Change')),
    r.decision === 'cut' && !r.key.startsWith('cat:') ? h('label', { class: 'check xs' }, h('input', { type: 'checkbox', checked: r.stop, 'data-key': 'plan-stop:' + pm + ':' + r.key + sfx,
      onchange: (e) => ctx.update('Stop tracking ' + r.name, (doc) => setPlanStop(doc, pm, r.key, e.target.checked)) }), 'Stop tracking from ' + monthLabel(pm)) : null);
}

function nameCell(ctx, r, sfx = '') {
  return r.key.startsWith('cat:') || r.computed ? r.name
    : nameEdit(ctx, r.name, 'line:' + r.key + ':name' + sfx, (d, v) => renameLine(d, r.key, v), 'Line name');
}

function reviewedBox(ctx, pm, r, sfx = '') {
  return r.computed ? null : h('input', { type: 'checkbox', checked: r.reviewed, 'aria-label': 'Reviewed ' + r.name, 'data-key': 'plan-rev:' + pm + ':' + r.key + sfx,
    onchange: (e) => ctx.update(e.target.checked ? 'Reviewed ' + r.name : 'Not reviewed ' + r.name, (doc) => setPlanReviewed(doc, pm, r.key, e.target.checked)) });
}

function row(ctx, pm, r) {
  return h('tr', { class: r.reviewed ? 'line done' : 'line' },
    h('td', {}, nameCell(ctx, r)),
    h('td', { class: 'num' }, money(r.actual)),
    h('td', { class: 'num' }, pct(r.pctIncome.actual)),
    h('td', { class: 'num' }, r.savings ? h('span', { class: 'xs muted' }, 'saving') : pct(r.pctSpending.actual)),
    h('td', { class: 'num' }, joyCell(r.happiness, r.stress)),
    h('td', { class: 'num' }, r.estimate === null && r.addedInReview ? h('span', { class: 'xs muted' }, 'added in review') : money(r.estimate)),
    h('td', { class: 'num' }, money(r.dream)),
    h('td', { class: 'num' }, planInput(ctx, pm, r), r.plan !== null ? h('div', { class: 'xs muted' }, pct(r.pctIncome.plan) + ' of income') : null),
    h('td', {}, decisionCell(ctx, pm, r)),
    h('td', {}, reviewedBox(ctx, pm, r)));
}

// On a phone: one card per line, the same facts and controls stacked.
function lineCard(ctx, pm, r) {
  const sfx = ':card';
  return h('div', { class: 'review-card' + (r.reviewed ? ' done' : '') },
    h('div', { class: 'spread' }, h('div', { class: 'review-card-name' }, nameCell(ctx, r, sfx)),
      r.computed ? null : h('label', { class: 'check xs' }, reviewedBox(ctx, pm, r, sfx), 'Reviewed')),
    h('div', { class: 'small' }, 'Actual ', h('b', { class: 'num' }, money(r.actual)), ', ', pct(r.pctIncome.actual), ' of income',
      r.savings ? ', saving' : ', ' + pct(r.pctSpending.actual) + ' of spending'),
    h('div', { class: 'small' }, 'Happiness ', joyCell(r.happiness, r.stress)),
    h('div', { class: 'small muted' }, r.estimate === null && r.addedInReview ? 'Estimate: added in review' : 'Estimate ' + money(r.estimate), ', dream ' + money(r.dream)),
    h('div', { class: 'review-card-plan' }, h('span', { class: 'small' }, 'Plan'), planInput(ctx, pm, r, sfx),
      r.plan !== null ? h('span', { class: 'xs muted' }, pct(r.pctIncome.plan) + ' of income') : null),
    decisionCell(ctx, pm, r, sfx));
}

function groupTable(ctx, rv, g) {
  const pm = rv.planMonth;
  const sort = ctx.ui.reviewSort || { key: null, dir: -1 };
  const rows = sorted(ctx.ui.reviewFilter ? g.rows.filter((r) => !r.reviewed && !r.computed) : g.rows, sort);
  if (!rows.length && ctx.ui.reviewFilter) return null;
  const head = h('tr', {}, COLS.map(([k, l]) => h('th', { scope: 'col', 'aria-sort': sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : null,
    onclick: () => { ctx.ui.reviewSort = { key: k, dir: sort.key === k ? -sort.dir : (k === 'name' ? 1 : -1) }; ctx.rerender(); } }, l)));
  return h('div', { class: 'review-group' },
    h('div', { class: 'spread' },
      h('h3', { style: 'margin:0' }, g.isDebt ? g.name : nameEdit(ctx, g.name, 'cat:' + g.id + ':name', (d, v) => { findCategory(d, g.id).name = v; }, 'Category name')),
      h('span', { class: 'small muted num' }, 'actual ' + money(g.actual) + ', plan ' + money(g.plan))),
    h('div', { class: 'table-wrap review-wide' }, h('table', { class: 'budget review' }, h('thead', {}, head), h('tbody', {}, rows.map((r) => row(ctx, pm, r))))),
    h('div', { class: 'review-narrow' }, rows.map((r) => lineCard(ctx, pm, r))),
    g.isDebt || !rv.exists ? null : h('div', { class: 'row' },
      g.byCategory ? h('button', { class: 'btn small ghost', onclick: () => ctx.update('Plan line by line', (d) => planLineByLine(d, pm, g.id)) }, 'Plan line by line') : null,
      g.byCategory ? null : h('button', { class: 'btn small ghost', onclick: () => {
        let id;
        ctx.update('Add line', (d) => { id = addPlanLine(d, pm, g.id, 'New line').id; });
        if (id) { ctx.ui.focusKey = 'line:' + id + ':name' + (narrow() ? ':card' : ''); ctx.rerender(); }
      } }, '+ Add line')));
}

export function reviewCards(ctx, summary) {
  const doc = ctx.doc;
  const months = [...new Set([...summary.history.allKeys, doc.currentMonth])].sort();
  const rm = ctx.ui.reviewMonth && months.includes(ctx.ui.reviewMonth) ? ctx.ui.reviewMonth : doc.currentMonth;
  const planMonths = Array.from({ length: 12 }, (_, i) => i).reduce((acc) => [...acc, nextMonthKey(acc[acc.length - 1])], [rm]).slice(1);
  const pm = ctx.ui.planMonth && ctx.ui.planMonth > rm ? ctx.ui.planMonth : nextMonthKey(rm);
  const rv = reviewSummary(doc, summary, rm, pm);
  const t = rv.totals;
  const start = (src) => {
    const values = planStartValues(doc, summary.history, src, rm, pm);
    ctx.update('Start ' + monthLabel(pm) + ' plan', (d) => startPlan(d, pm, src, values));
  };
  const tile = (label, value, sub) => h('div', { class: 'tile' }, h('div', { class: 'label' }, label), h('div', { class: 'value num' }, value), sub ? h('div', { class: 'sub' }, sub) : null);
  const top = h('div', { class: 'card review-top', style: 'grid-column:1 / -1' },
    h('div', { class: 'row' },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Reviewing'), h('select', { 'data-key': 'review-month', onchange: (e) => { ctx.ui.reviewMonth = e.target.value; ctx.ui.planMonth = null; ctx.rerender(); } }, options(months.map((k) => [k, monthLabel(k)]), rm))),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Plan for'), h('select', { 'data-key': 'plan-month', onchange: (e) => { ctx.ui.planMonth = e.target.value; ctx.rerender(); } }, options(planMonths.map((k) => [k, monthLabel(k)]), pm)))),
    rv.exists ? null : h('div', {},
      h('p', { class: 'small' }, 'Start the ' + monthLabel(pm) + ' plan from:'),
      h('div', { class: 'row' }, SOURCES.filter(([k]) => k !== 'last-plan' || getPlan(doc, prevMonthKey(pm))).map(([k, l]) => h('button', { class: 'btn small', 'data-key': 'plan-start:' + k, onclick: () => start(k) }, l))),
      h('p', { class: 'xs muted' }, 'The plan is separate from the estimates; nothing here changes them.')),
    rv.exists ? h('div', { class: 'strip' },
      tile(monthLabel(pm) + ' plan', money(t.plan), 'a month, spending and saving'),
      tile('Plan vs take-home', signedMoney(t.planLeft), t.planLeft === null ? '' : t.planLeft >= 0 ? 'left over' : 'shortfall'),
      tile('Plan vs ' + monthLabel(rm) + ' actual', signedMoney(t.frees), 'freed up'),
      tile('Plan % of income', pct(t.planPctIncome), 'of take-home'),
      tile('Happiness spend', pct(t.happyPlan), t.happyChange === null ? 'rated 7 or above' : (t.happyChange >= 0 ? '+' : '') + (t.happyChange * 100).toFixed(1) + ' pts vs ' + pct(t.happyNow))) : null,
    rv.exists ? h('div', { class: 'spread' },
      h('b', { class: 'review-count' }, rv.checklist.reviewed + ' of ' + rv.checklist.total + ' lines reviewed'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!ctx.ui.reviewFilter, 'data-key': 'review-filter', onchange: (e) => { ctx.ui.reviewFilter = e.target.checked; ctx.rerender(); } }), 'Only not yet reviewed')) : null,
    rv.exists ? h('div', { class: 'row' }, h('span', { class: 'xs muted' }, 'Sort:'), QUICK.map(([k, dir, l]) => h('button', { class: 'tag-chip', 'aria-pressed': ctx.ui.reviewSort && ctx.ui.reviewSort.key === k ? 'true' : 'false',
      onclick: () => { ctx.ui.reviewSort = { key: k, dir }; ctx.rerender(); } }, l))) : null);
  const groups = rv.groups.map((g) => groupTable(ctx, rv, g)).filter(Boolean);
  const bottom = h('div', { class: 'card', style: 'grid-column:1 / -1' },
    h('p', { class: 'reading', 'data-key': 'review-reading' }, rv.reading),
    rv.exists ? h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => {
        let id;
        ctx.update('Add category', (d) => { id = addPlanCategory(d, 'New category').id; });
        if (id) { ctx.ui.focusKey = 'cat:' + id + ':name'; ctx.rerender(); }
      } }, '+ Add category'),
      getPlan(doc, nextMonthKey(pm)) ? h('span', { class: 'small muted' }, monthLabel(nextMonthKey(pm)) + ' already has a plan.')
        : h('button', { class: 'btn primary', onclick: () => { ctx.update('Copy plan forward', (d) => copyPlanForward(d, pm)); ctx.ui.reviewMonth = pm; ctx.ui.planMonth = nextMonthKey(pm); ctx.rerender(); } }, 'Start ' + monthLabel(nextMonthKey(pm)) + ' from this plan')) : null);
  return [top, h('div', { class: 'card', style: 'grid-column:1 / -1' }, groups), bottom];
}

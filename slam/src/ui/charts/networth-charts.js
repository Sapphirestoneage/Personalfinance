// Net worth charts (S-112, S-114): the net worth bridge as a waterfall (start to end, "not explained
// yet" drawn as an outline), for net worth or FI net worth and any month. Read-only; the month and
// which net worth are pickers. Also the three tiles for today, both net worths by month, have vs owe,
// what it is made of, and milestones. Data from src/engines/networth-bridge.js (netWorthBridge,
// netWorthBridgeRows) and src/engines/networth.js (netWorthAt, netWorthByMonth, milestones, seriesChange);
// the how panel reads engines/explain.js. Builds on dom, format, svg, catalog, jump, and how.

import { h, options } from '../dom.js';
import { money, signedMoney, monthLabel, todayIso } from '../format.js';
import { waterfall, lines, hbars } from './svg.js';
import { card, chartWidth } from './catalog.js';
import { netWorthBridge, netWorthBridgeRows } from '../../engines/networth-bridge.js';
import { balanceMonths, netWorthAt, netWorthByMonth, milestones, seriesChange, LABELS, EXPLAIN } from '../../engines/networth.js';
import { explain } from '../../engines/explain.js';
import { jumpLink } from '../components/jump.js';
import { howButton, howPanel } from '../components/how.js';

const LINK = { actual: ['Review', 'actual'], bridge: ['the cash bridge', 'bridge'], balances: ['Setup, Accounts', 'balances'] };

// The latest month whose net worth is complete at both ends, else the month being worked on.
export function defaultBridgeMonth(ctx, s) {
  const months = balanceMonths(ctx.doc).slice().reverse();
  return months.find((m) => netWorthBridge(ctx.doc, s.income, m).total.unexplained !== null) || ctx.doc.currentMonth;
}

export function netWorthBridgeCard(ctx, s) {
  const months = balanceMonths(ctx.doc).slice().reverse();
  const month = months.includes(ctx.ui.nwMonth) ? ctx.ui.nwMonth : defaultBridgeMonth(ctx, s);
  const which = ctx.ui.nwWhich === 'fi' ? 'fi' : 'total';
  const nb = netWorthBridge(ctx.doc, s.income, month);
  const b = nb[which];
  const pickers = h('div', { class: 'row' },
    h('select', { 'aria-label': 'Month', 'data-key': 'nw-month', 'data-picker': 'range', onchange: (e) => { ctx.ui.nwMonth = e.target.value; ctx.rerender(); } }, options(months.map((m) => [m, monthLabel(m)]), month)),
    h('div', { class: 'toggle', role: 'group', 'aria-label': 'Which net worth' }, [['total', 'Everything'], ['fi', 'FI']].map(([k, l]) =>
      h('button', { 'aria-pressed': which === k ? 'true' : 'false', 'data-key': 'nw-which-' + k, onclick: () => { ctx.ui.nwWhich = k; ctx.rerender(); } }, l))));
  const rows = netWorthBridgeRows(b);
  const list = h('ul', { class: 'plain', 'data-key': 'nw-bridge-lines' },
    h('li', { class: 'small' }, h('span', {}, 'Start'), h('b', { class: 'num', 'data-key': 'nwb-start' }, money(b.start))),
    b.lines.map((l) => h('li', { class: 'small', 'data-key': 'nwb-line:' + l.key },
      h('span', { style: 'flex:1 1 200px' }, l.label, h('div', { class: 'xs muted' }, l.from, ' ', LINK[l.link.to] ? jumpLink(ctx, LINK[l.link.to][1], LINK[l.link.to][0], 'nwb-go:' + l.key) : null)),
      h('b', { class: 'num' }, signedMoney(l.amount)))),
    h('li', { class: 'small' }, h('b', {}, 'Explained end'), h('b', { class: 'num', 'data-key': 'nwb-explained' }, money(b.explained))),
    h('li', { class: 'small' }, h('span', {}, 'Actual end'), h('b', { class: 'num', 'data-key': 'nwb-actual' }, money(b.actual))),
    // The sub-line gives the first reason that applies: stale balances, then a missing start or end, then a tie.
    h('li', { class: 'small' }, h('span', {}, 'Not explained yet', h('div', { class: 'xs muted' }, b.stale.length ? b.stale.map((x) => x.name + (x.last ? ' last updated ' + x.last : ' never updated')).join(', ') : b.unexplained === null ? 'Needs every cash and card balance at the start and end' : b.ties ? 'Ties: within ' + money(nb.within) : '')),
      h('b', { class: 'num', 'data-key': 'nwb-unexplained' }, signedMoney(b.unexplained))));
  return card(ctx, {
    id: 'nw-bridge', title: (which === 'fi' ? 'FI net worth bridge, ' : 'Net worth bridge, ') + monthLabel(month),
    svg: rows.length ? waterfall({ rows, width: chartWidth(false), fmt: money, label: 'From start to end net worth' }) : null,
    extra: h('div', {}, pickers, list),
    reading: which === 'fi' ? nb.fiReading : nb.reading
  });
}

// The three net worths today, each one opening how it was worked out (jump to source, S-108).
export function netWorthTiles(ctx, s) {
  const nw = netWorthAt(ctx.doc, todayIso());
  // One how panel at a time; ctx.ui.how names the tile that is open.
  const open = ['nwTotal', 'nwFI', 'nwLocked'].includes(ctx.ui.how) ? ctx.ui.how : null;
  const tile = (key, label, value, sub, dk) => h('div', { class: 'tile', 'data-key': dk }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, howButton(ctx, key, money(value))), h('div', { class: 'sub' }, sub));
  return h('div', { id: 'nw-tiles', style: 'grid-column:1 / -1' },
    h('div', { class: 'strip three' },
      tile('nwTotal', LABELS.total, nw.total, EXPLAIN.total, 'nw-total'),
      tile('nwFI', LABELS.fi, nw.fi, EXPLAIN.fi, 'nw-fi'),
      tile('nwLocked', LABELS.locked, nw.locked, EXPLAIN.locked, 'nw-locked')),
    nw.missing.length ? h('p', { class: 'xs muted' }, 'No balance yet for ' + nw.missing.join(', ') + '. ', jumpLink(ctx, 'balances', 'Add it in Setup', 'nw-missing-go')) : null,
    open ? howPanel(ctx, explain(s, open, null, nw)) : null);
}

const short = (m) => monthLabel(m).slice(0, 3) + " '" + m.slice(2, 4);

export function netWorthOverTimeCard(ctx, _s) {
  const series = netWorthByMonth(ctx.doc);
  const xs = series.map((x) => short(x.month));
  const lineSeries = [
    { name: LABELS.total, color: 'var(--series-actual)', values: series.map((x) => x.total) },
    { name: LABELS.fi, color: 'var(--series-estimate)', values: series.map((x) => x.fi) }
  ];
  const ch = seriesChange(series);
  return card(ctx, {
    id: 'nw-time', title: 'Both net worths, month by month',
    svg: series.length > 1 ? lines({ series: lineSeries, xs, width: chartWidth(true), fmt: money, label: 'Net worth and FI net worth by month' }) : null,
    legendItems: lineSeries.map((x) => [x.name, x.color]),
    reading: ch ? 'From ' + monthLabel(ch.from) + ' to ' + monthLabel(ch.to) + ': net worth ' + signedMoney(ch.total) + ', FI net worth ' + signedMoney(ch.fi) + '.' : 'Month-end balances for two months or more show this.'
  });
}

export function assetsDebtsCard(ctx) {
  const series = netWorthByMonth(ctx.doc).slice(-12);
  return card(ctx, {
    id: 'nw-assets-debts', title: 'What you have and what you owe, by month',
    // Debts are drawn negative so they run left on the diverging bars; the axis formatter drops the sign.
    svg: series.length ? hbars({ mode: 'diverging', rows: series.map((x) => ({ label: short(x.month), values: [{ v: x.assets, color: 'var(--good)', tip: 'Have ' + money(x.assets) }, { v: x.debts === null ? null : -x.debts, color: 'var(--bad)', tip: 'Owe ' + money(x.debts) }] })), width: chartWidth(true), fmt: (v) => money(Math.abs(v)) }) : null,
    legendItems: [['What you have', 'var(--good)'], ['What you owe', 'var(--bad)']],
    reading: series.length ? 'Last 12 month ends: what you have to the right, what you owe to the left.' : 'Add balances to see this.'
  });
}

const KIND = { cash: 'Cash', invested: 'Investments and retirement', valued: 'Things you own', prepaid: 'Paid ahead' };
export function compositionCard(ctx) {
  const nw = netWorthAt(ctx.doc, todayIso());
  const kinds = nw.byKind.filter((k) => nw.assets.some((a) => a.kind === k.kind));
  const tiers = [[1, 'Tier 1: cash now'], [2, 'Through tier 2: can sell within days'], [3, 'Through tier 3: with retirement'], [4, 'All, with things you own and paid ahead']];
  return card(ctx, {
    id: 'nw-mix', title: 'What it is made of',
    svg: kinds.length ? hbars({ rows: [...kinds.map((k) => ({ label: KIND[k.kind], values: [{ v: k.amount, color: 'var(--good)', tip: money(k.amount) }] })), ...nw.debtsByType.map((t) => ({ label: 'Owed: ' + DEBT_LABEL(t.type), values: [{ v: t.amount, color: 'var(--bad)', tip: money(t.amount) }] }))], width: chartWidth(true), fmt: money }) : null,
    extra: h('ul', { class: 'plain', 'data-key': 'nw-tiers' }, tiers.map(([n, label]) => h('li', { class: 'small' }, h('span', {}, label), h('b', { class: 'num' }, money(nw.byTier[n]))))),
    reading: 'By how fast it becomes cash: tier 1 is cash now; tier 2 can be sold within days; tier 3 is retirement money with a penalty or rules; tier 4 is not liquid.'
  });
}
const DEBT_LABEL = (t) => ({ 'credit-card': 'cards', mortgage: 'mortgage', 'car-loan': 'car loan', 'student-loan': 'student loans', 'personal-loan': 'personal loans', 'line-of-credit': 'lines of credit', medical: 'medical', bnpl: 'buy now, pay later', 'family-friend': 'family or friends' }[t] || 'other');

export function milestonesCard(ctx) {
  const m = milestones(netWorthByMonth(ctx.doc));
  return card(ctx, {
    id: 'nw-milestones', title: 'Milestones',
    extra: m.length ? h('ul', { class: 'plain', 'data-key': 'nw-milestone-list' }, m.map((x) => h('li', { class: 'small' + (x.celebrate ? ' celebrate' : '') }, h('span', {}, x.label), h('b', {}, monthLabel(x.month))))) : null,
    reading: m.length ? m.length + ' so far, each the month it first happened.' : 'None yet. The first one is often FI net worth crossing $0.'
  });
}

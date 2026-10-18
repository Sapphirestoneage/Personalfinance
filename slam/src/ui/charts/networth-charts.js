// Net worth charts (S-112, S-115): the net worth bridge as a waterfall (start to end, "not explained
// yet" drawn as an outline), for net worth or FI net worth and any month. Read-only; the month and
// which net worth are pickers. Data from calc/networth-bridge.js.

import { h, options } from '../dom.js';
import { money, signedMoney, monthLabel } from '../format.js';
import { waterfall } from './svg.js';
import { card, chartWidth } from './catalog.js';
import { netWorthBridge, netWorthBridgeRows } from '../../calc/networth-bridge.js';
import { balanceMonths } from '../../calc/networth.js';
import { jumpLink } from '../components/jump.js';

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
    h('li', { class: 'small' }, h('span', {}, 'Not explained yet', h('div', { class: 'xs muted' }, b.stale.length ? b.stale.map((x) => x.name + (x.last ? ' last updated ' + x.last : ' never updated')).join(', ') : b.unexplained === null ? 'Needs every cash and card balance at the start and end' : b.ties ? 'Ties: within ' + money(nb.within) : '')),
      h('b', { class: 'num', 'data-key': 'nwb-unexplained' }, signedMoney(b.unexplained))));
  return card(ctx, {
    id: 'nw-bridge', title: (which === 'fi' ? 'FI net worth bridge, ' : 'Net worth bridge, ') + monthLabel(month),
    svg: rows.length ? waterfall({ rows, width: chartWidth(false), fmt: money, label: 'From start to end net worth' }) : null,
    extra: h('div', {}, pickers, list),
    reading: which === 'fi' ? nb.fiReading : nb.reading
  });
}

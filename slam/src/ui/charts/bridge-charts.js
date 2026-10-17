// Analyze: the budget-to-cash bridge for one month (S-088). The waterfall runs
// from the budget surplus to the change in cash; every step lists its amount,
// where it came from, and a link to it. Data from src/calc/bridge.js.

import { h, options } from '../dom.js';
import { money, signedMoney, monthLabel } from '../format.js';
import { waterfall } from './svg.js';
import { card, chartWidth } from './catalog.js';
import { bridgeFor } from '../../calc/bridge.js';

const LINKS = { actual: ['Fill in, Actual', 'actual', null], balances: ['Accounts and balances', 'cashflow', 'accounts-card'], log: ['The log', 'cashflow', null] };

export function linkTo(ctx, to) {
  const [label, pass, anchor] = LINKS[to] || LINKS.log;
  return h('a', { href: '#fill', onclick: (e) => { e.preventDefault(); ctx.go('fill', { pass }); if (anchor) setTimeout(() => { const el = document.getElementById(anchor); if (el) el.scrollIntoView(); }, 60); } }, label);
}

// Months that can be bridged: any with a balance, plus the month being worked on.
export function bridgeMonths(doc) {
  return [...new Set([...Object.keys(doc.balances || {}), doc.currentMonth, ...doc.months.map((m) => m.key)])].sort().reverse();
}

export function bridgeRows(br) {
  const rows = [{ label: 'Budget surplus', from: 0, to: br.surplus, kind: 'total' }];
  let run = br.surplus;
  for (const s of br.steps) { rows.push({ label: s.short || s.label, from: run, to: run + s.amount, kind: 'step' }); run += s.amount; }
  rows.push({ label: 'Explained', from: 0, to: br.explained, kind: 'total' });
  if (br.unexplained !== null && Math.abs(br.unexplained) >= 0.005) rows.push({ label: 'Not explained yet', from: br.explained, to: br.actual, kind: 'unexplained' });
  if (br.actual !== null) rows.push({ label: 'Actual change in cash', from: 0, to: br.actual, kind: 'total' });
  return rows;
}

// How close counts as "ties" is the coach's setting (S-096), so the client view does not show it.
function materialityInput(ctx) {
  if (ctx.role === 'client') return null;
  const v = ctx.doc.settings.materiality;
  return h('label', { class: 'field small' }, h('span', { class: 'lbl' }, 'Ties when within (coach only)'),
    h('input', { type: 'text', inputmode: 'decimal', style: 'width:6em', 'data-key': 'materiality', value: v === undefined || v === null ? '' : String(v),
      onchange: (e) => {
        const t = e.target.value.trim().replace(/[$,]/g, '');
        const n = t === '' ? 25 : Number(t);
        if (!Number.isFinite(n) || n < 0) return ctx.toast('That needs a dollar amount, 0 or more');
        ctx.update('Materiality', (d) => { d.settings.materiality = n; });
      } }));
}

export function bridgeCard(ctx, s, month, opts = {}) {
  const br = bridgeFor(ctx.doc, s.income, month);
  const months = bridgeMonths(ctx.doc);
  const picker = opts.picker === false ? null : h('select', { 'aria-label': 'Month', 'data-key': 'bridge-month', onchange: (e) => { ctx.ui.bridgeMonth = e.target.value; ctx.rerender(); } }, options(months.map((m) => [m, monthLabel(m)]), month));
  if (br.surplus === null) return card(ctx, { id: 'bridge', title: 'Budget to cash', extra: picker, reading: br.reading });
  const list = h('ul', { class: 'plain', 'data-key': 'bridge-steps' },
    h('li', { class: 'small' }, h('span', {}, 'Budget surplus', h('div', { class: 'xs muted' }, 'Take-home ' + money(br.takeHome) + ' less spending and savings')), h('b', { class: 'num' }, signedMoney(br.surplus))),
    br.steps.map((x) => h('li', { class: 'small' }, h('span', { style: 'flex:1 1 200px' }, x.label, h('div', { class: 'xs muted' }, x.from, ' ', linkTo(ctx, x.link.to))), h('b', { class: 'num' }, signedMoney(x.amount)))),
    h('li', { class: 'small' }, h('b', {}, 'Explained change in cash'), h('b', { class: 'num', 'data-key': 'bridge-explained' }, signedMoney(br.explained))),
    br.actual === null ? h('li', { class: 'small' }, h('span', {}, 'Actual change in cash: missing ', br.missing.map((m) => m.name + ' ' + m.which).join(', '), ' ', linkTo(ctx, 'balances')), h('b', {}, '·'))
      : [h('li', { class: 'small' }, h('span', {}, 'Actual change in cash', h('div', { class: 'xs muted' }, 'Checking, savings, and cash: ' + money(br.cashStart) + ' to ' + money(br.cashEnd))), h('b', { class: 'num', 'data-key': 'bridge-actual' }, signedMoney(br.actual))),
        h('li', { class: 'small' }, h('span', {}, 'Not explained yet', h('div', { class: 'xs muted' }, br.ties ? 'Ties: within ' + money(br.within) : 'Off by ' + money(Math.abs(br.unexplained), true))), h('b', { class: 'num', 'data-key': 'bridge-unexplained' }, signedMoney(br.unexplained)))]);
  return card(ctx, {
    id: opts.id || 'bridge', title: opts.title || 'Budget to cash, ' + monthLabel(month),
    svg: waterfall({ rows: bridgeRows(br), width: chartWidth(opts.half !== false), fmt: money, label: 'From budget surplus to change in cash' }),
    extra: h('div', {}, picker, list, opts.id ? null : materialityInput(ctx)),
    reading: br.reading
  });
}

export function bridgeCards(ctx, s) {
  const months = bridgeMonths(ctx.doc);
  // Default: the latest month with every balance in (a month still running has no end yet).
  const complete = months.find((m) => bridgeFor(ctx.doc, s.income, m).actual !== null);
  const month = months.includes(ctx.ui.bridgeMonth) ? ctx.ui.bridgeMonth : complete || ctx.doc.currentMonth;
  return [bridgeCard(ctx, s, month)];
}

// How the federal tax estimate is worked out (S-101), opened from the Federal
// income tax line of the paycheck table: a Sankey of the year's gross pay into
// what is not taxed (pre-tax deductions, the standard deduction) and each
// bracket, then the same steps in words. Numbers come from taxWalk (engines/income.js), all dollars a year;
// rates are ratios. Builds on dom, format, the sankey in charts/svg.js, and chartWidth (charts/catalog.js).

import { h } from '../dom.js';
import { money, pct } from '../format.js';
import { sankey } from '../charts/svg.js';
import { chartWidth } from '../charts/catalog.js';

const BRACKET_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)'];
const FILING = { single: 'single', 'married-joint': 'married filing jointly', 'married-separate': 'married filing separately', 'head-of-household': 'head of household' };

export function taxWalkView(ctx, w) {
  const exact = (x) => money(x, true);
  // Pieces of zero (no pre-tax deductions, no self-employment) get no node and no step. Untaxed pieces take the
  // neutral colors; the brackets go through the chart palette in order, lowest bracket first.
  const right = [
    w.pretax > 0 ? { name: 'Pre-tax deductions', amount: w.pretax, color: 'var(--chart-other)' } : null,
    w.seHalf > 0 ? { name: 'Half of self-employment tax', amount: w.seHalf, color: 'var(--chart-other)' } : null,
    w.std > 0 ? { name: 'Standard deduction', amount: w.std, color: 'var(--chart-axis)' } : null,
    ...w.slices.map((s, i) => ({ name: pct(s.rate, 0) + ' bracket', amount: s.amount, color: BRACKET_COLORS[i % BRACKET_COLORS.length] }))
  ].filter(Boolean);
  // No filing status is taxed as single (estimateAnnualTax, engines/tax.js), so the wording says so.
  const filing = FILING[ctx.doc.household.filingStatus] || 'single';
  // A third element marks a subtotal row (adjusted gross, taxable, the tax) and is styled as a total.
  const steps = [
    ['Gross pay for the year', exact(w.gross)],
    w.pretax > 0 ? ['Less pre-tax deductions (not taxed)', '-' + exact(w.pretax)] : null,
    w.seHalf > 0 ? ['Less half of the self-employment tax', '-' + exact(w.seHalf)] : null,
    ['Adjusted gross income', exact(w.agi), true],
    ['Less the standard deduction (' + filing + ')', '-' + exact(w.std)],
    ['Taxable income', exact(w.taxable), true],
    ...w.slices.map((s, i) => [pct(s.rate, 0) + ' on the ' + (i === 0 ? 'first ' : 'next ') + exact(s.amount), exact(s.tax)]),
    ['Federal income tax for the year', exact(w.incomeTax), true]
  ].filter(Boolean);
  return h('div', { class: 'tax-walk', 'data-key': 'tax-walk' },
    h('p', { class: 'small' }, 'Where ' + exact(w.gross) + ' of gross pay goes for federal income tax, ' + w.taxYear + '. Only the part in each bracket is taxed at that rate.'),
    // Capped at 640px so the labels stay readable on a wide screen; chartWidth(false) is the full-width card.
    h('div', { class: 'chart', html: sankey({ left: [{ name: 'Gross pay', amount: w.gross }], right, width: Math.min(chartWidth(false), 640), fmt: money, label: 'Gross pay split into untaxed amounts and tax brackets' }) }),
    h('table', { class: 'budget tax-steps' }, h('tbody', {}, steps.map(([label, amount, bold]) =>
      h('tr', { class: bold ? 'total' : null }, h('td', {}, label), h('td', { class: 'num' }, amount))))),
    h('p', { class: 'small' }, 'That is ' + pct(w.effectiveRate, 1) + ' of gross pay. The last dollar earned is taxed at ' + pct(w.bracket, 0) + ', the bracket.'),
    // Social Security and Medicare only for W-2 wages (ficaBase); self-employment tax only for 1099 and side income.
    w.ficaBase > 0 ? h('p', { class: 'small' }, 'Social Security: ' + pct(w.ssRate, 1) + ' of ' + exact(w.ssBase) + ' = ' + exact(w.socialSecurity) +
      ' (wages up to ' + money(w.wageBase) + '). Medicare: ' + pct(w.medicareRate, 2) + ' of ' + exact(w.ficaBase) + ' = ' + exact(w.medicare) + '.') : null,
    w.seTax > 0 ? h('p', { class: 'small' }, 'Self-employment tax for the year: ' + exact(w.seTax) + '.') : null,
    h('p', { class: 'xs muted' }, 'Not included: state and local tax, credits (like the child tax credit), the 0.9% extra Medicare tax, and itemized deductions.'));
}

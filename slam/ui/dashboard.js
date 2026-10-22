// The Dashboard: the one-pager out. Every number comes from engine/summary.js
// and links to the Ledger fields it was built from. Formatting only.

import { summarize } from '../engine/summary.js';
import { labelFor } from '../engine/labels.js';
import { loadAll, SOURCE_WORDS } from './household.js';
import { h, chip, money, pct, shortDate, ledgerHref } from './view.js';

const app = document.getElementById('app');
const months = (x) => (x === null ? '' : x.toFixed(1));

// What a number was built from: a link per field, and a note when an input is rough or missing.
function provenance(spine, r) {
  const missing = [...new Set(r.missing || [])];
  const rough = [...new Set(r.rough || [])];
  const from = [...new Set(r.from || [])];
  const link = (p) => h('a', { href: ledgerHref(p) }, labelFor(spine, p));
  const note = missing.length
    ? h('p', { class: 'tile-note' }, chip(r.value === null ? 'missing' : 'incomplete'), ' Needs: ', ...missing.flatMap((p, i) => [i ? ', ' : '', link(p)]))
    : rough.length ? h('p', { class: 'tile-note' }, chip('rough'), ' Built on ' + rough.length + ' rough number' + (rough.length === 1 ? '' : 's')) : null;
  return [note, from.length ? h('details', { class: 'from' }, h('summary', {}, 'Built from ' + from.length + ' field' + (from.length === 1 ? '' : 's')), h('ul', {}, from.map((p) => h('li', {}, link(p))))) : null];
}

// One tile: a label, the big number (a link to its first field), lines under it.
function tile(spine, { id, label, result, shown, missingText, lines = [], extra = null }) {
  const first = (result.from || [])[0];
  const value = result.value === null
    ? h('p', { class: 'tile-value missing-text' }, missingText || 'Not enough to figure yet')
    : h('a', { class: 'tile-value', href: first ? ledgerHref(first) : '#' }, shown);
  return h('section', { class: 'tile', id: 'tile-' + id, 'aria-labelledby': 'tl-' + id },
    h('h2', { class: 'tile-label', id: 'tl-' + id }, label),
    value,
    ...lines.filter(Boolean).map((l) => h('p', { class: 'tile-sub' }, ...[].concat(l))),
    extra,
    ...provenance(spine, result));
}

function render(spine, rules, source) {
  const s = summarize(spine, rules);
  const cf = s.cashflow, sh = s.sheet, em = s.emergency, fi = s.fi, tx = s.tax, pr = s.debt.promo;
  const names = (ids) => ids.map((id) => spine.debts.find((d) => d.id === id)).map((d) => (d.name && d.name.value) || d.id);
  const promoBy = pr.items.length ? pr.items[pr.items.length - 1].promoEnds : null;

  const backstop = h('div', { class: 'backstop' },
    h('strong', {}, 'Roth backstop (not counted as cash)'),
    h('p', { class: 'tile-sub' }, money(em.backstop.contributions.value) + ' of contributions can come out any time with no tax or penalty.'),
    ...em.backstop.conversions.map((c) => h('p', { class: 'tile-sub' }, money(c.amount) + ' converted in ' + c.year + ': no tax on it; ' + (c.penaltyFree ? 'no penalty.' : 'a ' + pct(c.penaltyRate) + ' penalty if taken before ' + shortDate(c.clockOpens) + ' (its own five-year clock).'))));

  const tiles = [
    tile(spine, { id: 'networth', label: 'Net worth', result: sh.netWorth, shown: money(sh.netWorth.value), lines: ['Assets ' + money(sh.assets.value) + ' less debts ' + money(sh.debts.value) + '.'] }),
    tile(spine, {
      id: 'runway', label: 'Cash runway', result: em.tiers.full.runway, shown: months(em.tiers.full.runway.value) + ' months',
      lines: [
        money(sh.cash.value) + ' in cash at ' + money(em.tiers.full.burn.value) + ' a month (expenses plus minimum payments).',
        'Food, housing and transportation only: ' + months(em.tiers.fatOnly.runway.value) + ' months.',
        'Rule of 5 target: ' + em.targetMonths.value + ' months (' + money(em.targetDollars.value) + ').'
      ],
      extra: em.backstop.contributions.value || em.backstop.conversions.length ? backstop : null
    }),
    tile(spine, { id: 'surplus', label: 'Monthly surplus', result: cf.surplus, shown: money(cf.surplus.value), lines: ['Take-home ' + money(cf.income.takeHome.value) + ' less expenses ' + money(cf.expenses.total.value) + ' and minimum payments ' + money(cf.debtMinimums.total.value) + (cf.saving.afterTax.value ? ' and ' + money(cf.saving.afterTax.value) + ' saved from take-home' : '') + '.'] }),
    tile(spine, { id: 'savings', label: 'Savings rate', result: cf.savingsRate.gross, shown: pct(cf.savingsRate.gross.value, 1) + ' of gross', lines: [pct(cf.savingsRate.net.value, 1) + ' of take-home.'] }),
    tile(spine, {
      id: 'cards', label: 'Credit cards', result: sh.cards, shown: money(sh.cards.value),
      lines: [
        pr.items.length ? money(pr.total.value) + ' in promo balances due by ' + shortDate(promoBy) + '; about ' + money(pr.monthly.value, true) + ' a month clears them in time.' : 'No promo balances.',
        s.debt.avalancheCards.length > 1 ? 'Highest rate first: ' + names(s.debt.avalancheCards).join(', ') + '.' : null
      ]
    }),
    tile(spine, {
      id: 'fi', label: 'Financial independence', result: fi.fiPercent, shown: pct(fi.fiPercent.value, 1),
      lines: [
        'Of an FI number of ' + money(fi.fiNumber.value) + (fi.goalSource === 'direct' ? ' (your goal)' : fi.goalSource === 'spending' ? ' (goal spending at the withdrawal rate)' : ' (today\'s spending)') + '; invested ' + money(sh.invested.value) + '.',
        fi.goalSource ? 'Today\'s spending implies ' + money(fi.implied.value) + '.' : null,
        'Lean FI ' + money(fi.leanFi.value) + '. Coast FI by ' + fi.coastAge + ': ' + money(fi.coastFi.value) + '.'
      ]
    }),
    tile(spine, {
      id: 'tax', label: tx.year + ' tax balance due (estimate)', result: tx.balanceDue,
      shown: money(tx.balanceDue.value), missingText: tx.missingText ? tx.missingText.charAt(0).toUpperCase() + tx.missingText.slice(1) : null,
      lines: [
        tx.balanceDue.value === null && tx.partial ? 'At least ' + money(tx.partial.federalIncomeTax.value) + ' federal on the ' + tx.year + ' income known so far.' : null,
        'Next estimated payment date: ' + shortDate(tx.nextEstimated.date) + '.',
        tx.notModeled.length ? 'Not included: ' + tx.notModeled.join(', ') + '.' : null
      ]
    })
  ];

  app.replaceChildren(
    h('header', { class: 'top' },
      h('div', {}, h('h1', {}, 'Dashboard'), h('p', { class: 'muted' }, spine.meta.name, ' · numbers as of ', shortDate(s.asOf), ' · ', SOURCE_WORDS[source])),
      h('nav', { class: 'top-actions' }, h('a', { class: 'btn primary', href: 'ledger.html' }, 'Ledger'))),
    h('div', { class: 'tiles' }, tiles),
    h('section', { class: 'card', 'aria-labelledby': 'flags-h' },
      h('h2', { id: 'flags-h' }, 'Flags'),
      s.flags.length ? h('ul', { class: 'flags' }, s.flags.map((f) => h('li', { class: 'flag flag-' + f.level, id: 'flag-' + f.id },
        h('p', { class: 'flag-title' }, h('span', { class: 'level' }, f.level), f.title),
        h('p', { class: 'flag-detail' }, f.detail),
        f.from.length ? h('details', { class: 'from' }, h('summary', {}, 'From ' + f.from.length + ' field' + (f.from.length === 1 ? '' : 's')), h('ul', {}, [...new Set(f.from)].map((p) => h('li', {}, h('a', { href: ledgerHref(p) }, labelFor(spine, p)))))) : null)))
        : h('p', { class: 'muted' }, 'Nothing to flag.'))
  );
}

loadAll().then(({ spine, rules, source }) => render(spine, rules, source)).catch((err) => {
  app.replaceChildren(h('p', { class: 'card' }, 'The Dashboard could not load: ' + err.message));
});

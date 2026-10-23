// Cards: Next (Today), Biggest culprits, Proof of cash, and Rough and unknown
// (Insights, Compared), and the small extras (Insights, You). Text and layout only.
// The gut check and completion are charts in Insights (S-106: one copy each).
// Every number is read from buildSummary (engines/summary.js): next and smallStuff come from nextSteps and rough
// from roughList (engines/completion.js), culprits and proofOfCash from engines/compare.js, and the extras from
// totals, moveOut, nextStage, oneOffs, and sinceLast. Builds on dom, format, the status chip, and sourceLink (how.js).

import { h } from '../dom.js';
import { money, pct, times, signedMoney, STATUS_LABELS } from '../format.js';
import { statusChip } from './status.js';
import { sourceLink } from './how.js';

// extras: items from outside the picture, each { key, label, why, where }: balances not updated at month end (S-114),
// a card promo about to end, accounts with no specific type. Today's extras() builds them, labels already numbered from 2.
export function nextCard(ctx, summary, extras = []) {
  const [first, ...rest] = summary.next;
  const list = (extras || []).filter(Boolean);
  const extraRow = list.length ? list.map((x) => h('button', { 'data-key': 'next-extra' + (x.key ? ':' + x.key : ''), onclick: () => ctx.jump(x.where) }, x.label + ' ', h('span', { class: 'muted xs' }, x.why))) : null;
  // Nothing left to firm up. Extras still show: they sit outside the ranking.
  if (!first) {
    return h('div', { class: 'card next-1' }, h('h3', {}, 'Next'),
      h('p', { class: 'big' }, 'The picture is filled in.'),
      extraRow ? h('div', { class: 'next-list' }, extraRow) : null,
      h('div', { class: 'empty-state row' }, h('span', { class: 'small muted' }, 'Talk through the biggest culprits, then close the month when it ends.'),
        h('button', { class: 'btn small', 'data-key': 'next-culprits', onclick: () => ctx.jump('insights:compared') }, 'See the culprits')));
  }
  // Weight 3 is WEIGHTS.heavy in engines/completion.js: housing, the single total, take-home, the debts question, and an
  // unlinked debt's minimum payment.
  const why = (it) => (it.status === null ? 'Not answered yet' : STATUS_LABELS[it.status]) + (it.weight >= 3 ? ', a heavy number' : '');
  return h('div', { class: 'card next-1' },
    h('h3', {}, 'Next'),
    h('div', { class: 'spread' },
      h('div', {}, h('div', { class: 'big' }, '1. ' + first.label), h('div', { class: 'muted small' }, why(first))),
      h('button', { class: 'btn primary', onclick: () => ctx.goToField(first.path) }, 'Go')),
    // Extras come first, all of them, numbered from 2 by Today. Only the summary's own rows are capped: they fill what is left
    // of two slots after the extras, so two or more extras leave none.
    rest.length || extraRow ? h('div', { class: 'next-list' }, extraRow, rest.slice(0, Math.max(0, 2 - list.length)).map((it, i) => h('button', { onclick: () => ctx.goToField(it.path) },
      (i + 2 + list.length) + '. ' + it.label + ' ', h('span', { class: 'muted xs' }, why(it))))) : null,
    summary.smallStuff.length ? h('details', {}, h('summary', { class: 'xs muted' }, 'Small stuff, under $100 a year (' + summary.smallStuff.length + ')'),
      h('ul', { class: 'plain' }, summary.smallStuff.map((it) => h('li', { class: 'small' }, it.label, statusChip(it.status))))) : null);
}

// Culprits (engines/compare.js): categories over the client's own estimate, with the monthly and yearly cut back to it.
// The actual links to the category's row on Review and the estimate to its box (S-108). Two empty states: no actuals
// to compare yet (blindSpot.pct is null) or nothing over its estimate.
export function culpritsCard(ctx, summary) {
  const c = summary.culprits;
  return h('div', { class: 'card', id: 'culprits' },
    h('h3', {}, 'Biggest culprits'),
    c.length ? h('div', {},
      h('p', { class: 'muted small' }, 'Over your own estimate. Back to your own words means cutting this much:'),
      h('ul', { class: 'plain' }, c.map((x) => h('li', {},
        h('span', {}, h('b', {}, x.name), ' ', h('span', { class: 'muted small' }, sourceLink(ctx, money(x.actual), { where: 'actual', open: 'rv-cat:' + x.id }), ' vs your ', sourceLink(ctx, money(x.estimate), { path: ['categories', x.id, 'estimate'] }), '' + (x.ratio !== null ? ' (' + times(x.ratio) + ')' : ''))),
        h('span', { class: 'num' }, 'cut ', h('b', {}, money(x.cutMonthly)), ' / mo (' + money(x.cutYearly) + ' / yr)'))))
    ) : h('p', { class: 'muted small' }, summary.blindSpot.pct === null ? 'Shows up once there are actuals to compare.' : 'Nothing came in over the estimate.'));
}

// Shown only when proofOfCash (engines/compare.js) flags the month: the spending entered is further from what the
// paycheck implies than its threshold. The follow-up question depends on which side the gap is on.
export function proofCard(summary) {
  const p = summary.proofOfCash;
  if (!p.available || !p.flagged) return null;
  return h('div', { class: 'card flag' },
    h('h3', {}, 'Proof of cash: worth a second look'),
    h('p', { class: 'small' }, 'Take-home minus savings minus debt payments leaves ' + money(p.implied) + ' a month. The spending entered (without debt payments) is ' + money(p.entered) +
      ', ' + pct(p.pct) + ' ' + (p.diff < 0 ? 'lower' : 'higher') + '.'),
    h('p', { class: 'small muted' }, p.diff < 0 ? 'Is money building up in the account, or is some spending missing? Which one is right?' : 'Is savings or a card balance covering the gap? Which one is right?'));
}

// Rough and unknown (roughList, engines/completion.js). The amount is as typed, in its own cadence, so no "a month" is added.
export function roughCard(ctx, summary) {
  const r = summary.rough;
  return h('div', { class: 'card', id: 'rough-list' },
    h('h3', {}, 'Rough and unknown (' + r.length + ')'),
    r.length ? h('ul', { class: 'plain' }, r.map((x) => h('li', {},
      h('a', { href: '#', 'data-key': 'rough-go:' + x.label, onclick: (e) => { e.preventDefault(); ctx.goToField(x.path); } }, x.label),
      h('span', {}, x.amount !== null ? h('span', { class: 'num small' }, money(x.amount) + ' ') : null, statusChip(x.status)))))
      : h('p', { class: 'muted small' }, 'Nothing marked roughly, will email, or don\'t know.'));
}

// Next stage is a parked Future tool (S-105): named here only when Future tools are on.
// Each item appears only when its number exists: above 0 for the two sums from engines/totals.js (owed back, from lines on
// the reimbursable path; mistakes, from the mistake tag), not null for the rest (not entered is not zero). "Since" compares
// with the last saved snapshot (sinceLast, engines/summary.js) and is null until one exists.
export function extrasCard(summary, future) {
  const t = summary.totals;
  const items = [];
  if (t.owedBack > 0) items.push(['Owed back to you (not yet received)', money(t.owedBack)]);
  if (t.mistakeMonthly > 0) items.push(['Mistakes (tagged)', money(t.mistakeMonthly) + ' / mo, ' + money(t.mistakeYearly) + ' / yr']);
  if (summary.moveOut && summary.moveOut.guess) {
    items.push(['If you moved out of the family home', 'about ' + money(summary.moveOut.guess.amount) + ' a month for housing (Guess) vs ' + money(summary.moveOut.now) + ' now']);
  }
  if (future && summary.nextStage && summary.nextStage.cashNeeded !== null) {
    const n = summary.nextStage;
    items.push(['Next stage: ' + n.name, money(n.cashNeeded) + ' to make the switch' + (n.monthsToSaveWhole !== null ? ', about ' + n.monthsToSaveWhole + ' months of today\'s surplus' : '')]);
  }
  if (t.roommateWorstCase !== null) items.push(['If you paid the full rent', money(t.roommateWorstCase) + ' housing (' + pct(t.roommateWorstCaseShare) + ' of take-home)']);
  for (const o of summary.oneOffs) items.push(['One-off: ' + o.name + ' (' + o.which + ')', money(o.amount) + ', not in monthly totals']);
  if (summary.sinceLast) {
    const s = summary.sinceLast;
    items.push(['Since ' + new Date(s.date).toLocaleDateString(), 'surplus ' + signedMoney(s.surplus) + ', spending ' + signedMoney(s.spending)]);
  }
  if (!items.length) return null;
  return h('div', { class: 'card', id: 'extras' }, h('h3', {}, 'Also worth knowing'),
    h('ul', { class: 'plain' }, items.map(([a, b]) => h('li', { class: 'small' }, h('span', {}, a), h('b', { class: 'num' }, b)))));
}


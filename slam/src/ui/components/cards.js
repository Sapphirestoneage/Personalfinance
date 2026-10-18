// Budget screen cards: Next, Biggest culprits, Gut check, Proof of cash,
// Completion, Rough and unknown, and the small extras. Text and layout only.

import { h } from '../dom.js';
import { money, pct, times, signedMoney, STATUS_LABELS } from '../format.js';
import { statusChip } from './status.js';

export function nextCard(ctx, summary) {
  const [first, ...rest] = summary.next;
  if (!first) {
    return h('div', { class: 'card next-1' }, h('h3', {}, 'Next'),
      h('p', { class: 'big' }, 'The picture is filled in.'),
      h('p', { class: 'muted small' }, 'Talk through the biggest culprits, then close the month when it ends.'));
  }
  const why = (it) => (it.status === null ? 'Not answered yet' : STATUS_LABELS[it.status]) + (it.weight >= 3 ? ', a heavy number' : '');
  return h('div', { class: 'card next-1' },
    h('h3', {}, 'Next'),
    h('div', { class: 'spread' },
      h('div', {}, h('div', { class: 'big' }, '1. ' + first.label), h('div', { class: 'muted small' }, why(first))),
      h('button', { class: 'btn primary', onclick: () => ctx.goToField(first.path) }, 'Go')),
    rest.length ? h('div', { class: 'next-list' }, rest.map((it, i) => h('button', { onclick: () => ctx.goToField(it.path) },
      (i + 2) + '. ' + it.label + ' ', h('span', { class: 'muted xs' }, why(it))))) : null,
    summary.smallStuff.length ? h('details', {}, h('summary', { class: 'xs muted' }, 'Small stuff, under $100 a year (' + summary.smallStuff.length + ')'),
      h('ul', { class: 'plain' }, summary.smallStuff.map((it) => h('li', { class: 'small' }, it.label, statusChip(it.status))))) : null);
}

export function culpritsCard(summary) {
  const c = summary.culprits;
  return h('div', { class: 'card' },
    h('h3', {}, 'Biggest culprits'),
    c.length ? h('div', {},
      h('p', { class: 'muted small' }, 'Over your own estimate. Back to your own words means cutting this much:'),
      h('ul', { class: 'plain' }, c.map((x) => h('li', {},
        h('span', {}, h('b', {}, x.name), ' ', h('span', { class: 'muted small' }, money(x.actual) + ' vs your ' + money(x.estimate) + (x.ratio !== null ? ' (' + times(x.ratio) + ')' : ''))),
        h('span', { class: 'num' }, 'cut ', h('b', {}, money(x.cutMonthly)), ' / mo (' + money(x.cutYearly) + ' / yr)'))))
    ) : h('p', { class: 'muted small' }, summary.blindSpot.pct === null ? 'Shows up once there are actuals to compare.' : 'Nothing came in over the estimate.'));
}

export function gutCard(summary) {
  const g = summary.gutCheck;
  const row = (label, v, note) => h('li', {}, h('span', {}, label, note ? h('span', { class: 'muted xs' }, ' ' + note) : null), h('b', { class: 'num' }, money(v)));
  return h('div', { class: 'card' },
    h('h3', {}, 'Gut check'),
    h('ul', { class: 'plain' },
      row('Gut number', g.gut),
      row('Sum of estimates', g.estimates),
      row('Actual', g.actual, g.actualUsesEstimateFor.length ? '(estimates for ' + g.actualUsesEstimateFor.length + ' categories)' : null)),
    g.actualVsGutRatio !== null ? h('p', { class: 'reading' }, 'Actual spending is ' + times(g.actualVsGutRatio) + ' your gut number (' + signedMoney(g.actualVsGut) + ' a month).') : null);
}

export function proofCard(summary) {
  const p = summary.proofOfCash;
  if (!p.available || !p.flagged) return null;
  return h('div', { class: 'card flag' },
    h('h3', {}, 'Proof of cash: worth a second look'),
    h('p', { class: 'small' }, 'Take-home minus savings minus debt payments leaves ' + money(p.implied) + ' a month. The spending entered (without debt payments) is ' + money(p.entered) +
      ', ' + pct(p.pct) + ' ' + (p.diff < 0 ? 'lower' : 'higher') + '.'),
    h('p', { class: 'small muted' }, p.diff < 0 ? 'Is money building up in the account, or is some spending missing? Which one is right?' : 'Is savings or a card balance covering the gap? Which one is right?'));
}

export function completionCard(ctx, summary) {
  const c = summary.completion;
  return h('div', { class: 'card' },
    h('div', { class: 'spread' }, h('h3', {}, 'How filled in is the picture'), h('b', { class: 'num' }, pct(c.pct))),
    h('div', { class: 'meter', role: 'progressbar', 'aria-valuenow': Math.round(c.pct * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: 'width:' + (c.pct * 100).toFixed(1) + '%' })),
    h('p', { class: 'muted xs' }, c.answered + ' of ' + c.count + ' questions answered, heavy numbers weighted more. ' + ctx.say('completion-note')));
}

export function roughCard(ctx, summary) {
  const r = summary.rough;
  return h('div', { class: 'card' },
    h('h3', {}, 'Rough and unknown (' + r.length + ')'),
    r.length ? h('ul', { class: 'plain' }, r.map((x) => h('li', {},
      h('a', { href: '#fill', onclick: (e) => { e.preventDefault(); ctx.goToField(x.path); } }, x.label),
      h('span', {}, x.amount !== null ? h('span', { class: 'num small' }, money(x.amount) + ' ') : null, statusChip(x.status)))))
      : h('p', { class: 'muted small' }, 'Nothing marked roughly, will email, or don\'t know.'));
}

// Next stage is a parked Future tool (S-105): named here only when Future tools are on.
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
  return h('div', { class: 'card' }, h('h3', {}, 'Also worth knowing'),
    h('ul', { class: 'plain' }, items.map(([a, b]) => h('li', { class: 'small' }, h('span', {}, a), h('b', { class: 'num' }, b)))));
}


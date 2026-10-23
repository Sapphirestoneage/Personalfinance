// The monthly loop on screen (S-089): the Plan, Track, Review strip at the top
// of Today (the step for now highlighted, S-106), the month-end checklist that
// opens from "Close month" on Review, and the month in review card (right after
// closing, and for any closed month on Review, from the saved snapshot).
// Numbers come from engines/loop.js (loopStrip, loopStep, monthEndChecklist, monthReview); closing also uses
// engines/summary.js, calendar.js (the forecast), and store/cashflow.js; the net worth tiles read engines/networth-bridge.js and networth.js.

import { h } from '../dom.js';
import { money, signedMoney, pct, monthLabel, dayLabel, todayIso } from '../format.js';
import { loopStrip, loopStep, monthEndChecklist, monthReview } from '../../engines/loop.js';
import { closeMonthSnapshot, snapshotOf } from '../../engines/summary.js';
import { forecastFor } from '../../engines/calendar.js';
import { saveForecast } from '../../store/cashflow.js';
import { netWorthBridge } from '../../engines/networth-bridge.js';
import { milestones, netWorthByMonth } from '../../engines/networth.js';
import { incomeRowsList } from './income-month.js';

const link = (ctx, where, text) => h('a', { href: '#', 'data-key': 'go-' + where, onclick: (e) => { e.preventDefault(); ctx.jump(where); } }, text);

export function loopStripCard(ctx, summary) {
  const s = loopStrip(ctx.doc, summary, todayIso());
  const now = loopStep(s, todayIso());
  const step = (n, title, state, where, label) => h('div', { class: 'loop-step' + (now === title.toLowerCase() ? ' current' : ''), 'data-key': 'loop-' + title.toLowerCase(), 'aria-current': now === title.toLowerCase() ? 'step' : null },
    h('div', { class: 'loop-n' }, n), h('div', {}, h('b', {}, title), h('div', { class: 'small' }, state), link(ctx, where, label)));
  const r = s.review;
  const reviewState = [r.empty + ' line' + (r.empty === 1 ? '' : 's') + ' still empty', r.balancesTotal ? (r.balancesTotal - r.balancesMissing) + ' of ' + r.balancesTotal + ' balances in' : 'no accounts', r.ties === null ? 'bridge needs balances' : r.ties ? 'bridge ties' : 'bridge off by ' + money(Math.abs(r.unexplained))].join(', ');
  const t = s.track;
  return h('div', { class: 'card loop', id: 'loop-strip' },
    h('div', { class: 'spread' }, h('b', {}, monthLabel(s.month) + ': plan, track, review'),
      // The shortcut shows once a month has been closed and the open month has no plan of its own yet.
      ctx.doc.months.some((m) => m.key < s.month) && !(ctx.doc.plans || {})[s.month] ? h('button', { class: 'btn small primary', 'data-key': 'start-plan', onclick: () => ctx.jump('plan') }, 'Start next month\'s plan') : null),
    h('div', { class: 'loop-steps' },
      step('1', 'Plan', 'Plan: ' + s.plan.state, 'plan', 'Next month\'s plan'),
      step('2', 'Track', t.entries + ' entr' + (t.entries === 1 ? 'y' : 'ies') + (t.last ? ', last ' + dayLabel(t.last) : '') + ', scheduled ' + t.confirmed + ' of ' + t.scheduled + ' confirmed', 'track', 'Track'),
      step('3', 'Review', reviewState, 'actual', 'Fill gaps')));
}

// The month-end checklist, then close (open items are allowed and recorded).
export function checklistCard(ctx, summary) {
  const doc = ctx.doc;
  const c = monthEndChecklist(doc, summary, todayIso());
  const close = () => {
    // The review is worked out before the store closes the month, so it describes the month as it stood.
    const review = monthReview(doc, summary, todayIso());
    const snap = { ...closeMonthSnapshot(summary), review };
    const key = ctx.store.closeMonth(snap);
    ctx.update('Save snapshot', (d) => { d.snapshots.push(snapshotOf(summary, new Date().toISOString())); });
    // The new month's predicted end cash, as of its 1st (S-086); closeMonth has already moved currentMonth on.
    const next = ctx.doc.currentMonth;
    ctx.update('Save forecast', (d) => saveForecast(d, next, forecastFor(d, summary.income, next), new Date().toISOString()));
    ctx.ui.closing = false;
    ctx.ui.justClosed = key;
    ctx.toast(monthLabel(key) + ' closed. ' + c.summary + '.');
  };
  return h('div', { class: 'card', id: 'checklist' },
    h('div', { class: 'spread' }, h('h2', { style: 'margin:0' }, 'Before closing ' + monthLabel(c.month)), h('button', { class: 'btn small ghost', onclick: () => { ctx.ui.closing = false; ctx.rerender(); } }, 'Not now')),
    h('ul', { class: 'plain' }, c.items.map((i) => h('li', { class: 'small', 'data-key': 'check-' + i.key },
      // Chip colors borrow the value statuses (Done reads as known, Open as don't know). The owed item is
      // worded for whoever is looking, coach or client (ctx.say).
      h('span', { style: 'flex:1 1 220px' }, h('span', { class: 'chip ' + (i.open ? 'st-dont-know' : 'st-known') }, i.open ? 'Open' : 'Done'), ' ', i.key === 'owed' ? ctx.say('owed-label') : i.label,
        i.names && i.names.length ? h('div', { class: 'xs muted' }, i.names.slice(0, 6).join(', ') + (i.names.length > 6 ? ', and more' : '')) : null,
        i.stale && i.stale.length ? h('div', { class: 'xs muted', 'data-key': 'check-stale' }, 'Optional, not updated this month: ' + i.stale.map((x) => x.name + (x.last ? ' (since ' + dayLabel(x.last) + ')' : ' (never)')).join(', ')) : null),
      h('span', { class: 'row' }, h('b', { class: 'num' }, i.state || (i.amount ? i.count + ', ' + money(i.amount, true) : String(i.count))), link(ctx, i.fix, 'Fix'))))),
    h('p', { class: 'small', 'data-key': 'close-summary' }, c.summary + '.'),
    h('button', { class: 'btn primary', 'data-key': 'close-month', onclick: () => {
      if (!confirm('Close ' + monthLabel(c.month) + '? Its numbers and its review get locked. Late entries can still be added as revisions.')) return;
      close();
    } }, c.open ? 'Close with ' + c.open + ' open item' + (c.open === 1 ? '' : 's') : 'Close ' + monthLabel(c.month)));
}

const groupList = (title, rows, sign) => h('div', {}, h('h4', {}, title + ' (' + rows.length + ')'),
  rows.length ? h('ul', { class: 'plain' }, rows.slice(0, 8).map((r) => h('li', { class: 'small' }, h('span', {}, r.name), h('b', { class: 'num' }, sign(r))))) : h('p', { class: 'xs muted' }, 'None'));

// The month in review, from the saved snapshot. A revision added later shows next to it, never inside.
export function reviewCard(ctx, rec, opts = {}) {
  const r = rec.snapshot.review;
  if (!r) return h('div', { class: 'card' }, h('h3', {}, monthLabel(rec.key)), h('p', { class: 'muted small' }, 'Closed before month reviews were saved.'));
  // Past months start light (S-129); "See the full review" adds the month to ui.expanded.
  if (opts.compact && !ctx.ui.expanded.has('review-full:' + rec.key)) return reviewHeadline(ctx, rec, opts);
  const t = r.totals;
  const diff = (x) => (x.diff > 0 ? '+' : '-') + money(Math.abs(x.diff));
  const revised = Object.entries(rec.revised.lines || {});
  return h('div', { class: 'card', id: opts.id || 'review-' + rec.key },
    h('div', { class: 'spread' }, h('h2', { style: 'margin:0' }, monthLabel(rec.key) + ' in review'), opts.dismiss ? h('button', { class: 'btn small ghost', onclick: opts.dismiss }, 'Done') : null),
    h('p', { class: 'reading', 'data-key': 'review-readings' }, r.readings.join(' ')),
    h('div', { class: 'strip three' },
      h('div', { class: 'tile' }, h('div', { class: 'label' }, 'Spent'), h('div', { class: 'value' }, money(t.spent)), h('div', { class: 'sub' }, 'plan ' + money(t.plan) + ', estimate ' + money(t.estimate))),
      h('div', { class: 'tile' }, h('div', { class: 'label' }, 'Surplus'), h('div', { class: 'value' }, signedMoney(t.surplus)), h('div', { class: 'sub' }, 'savings rate ' + pct(t.savingsRate))),
      h('div', { class: 'tile' }, h('div', { class: 'label' }, 'Bridge'), h('div', { class: 'value', 'data-key': 'review-bridge' }, r.bridge.ties === null ? 'no balances' : r.bridge.ties ? 'Ties' : 'Off by ' + money(Math.abs(r.bridge.unexplained))), h('div', { class: 'sub' }, r.bridge.top ? (r.bridge.top.short || r.bridge.top.label) + ' ' + signedMoney(r.bridge.top.amount) : ''))),
    // Income first (S-118): saved with the month from then on.
    r.incomeRows ? incomeRowsList(r.incomeRows, t.income, 'review-income') : null,
    h('h3', {}, 'Vs your plan'),
    t.plan === null ? h('p', { class: 'small muted' }, 'No plan this month.')
      : h('div', { class: 'grid three', 'data-key': 'review-vs-plan' }, groupList('Better than planned', r.vsPlan.lines.better, diff), groupList('On plan', r.vsPlan.lines.onPlan, (x) => money(x.actual)), groupList('Worse than planned', r.vsPlan.lines.worse, diff)),
    h('h3', {}, 'Vs your own first guess'),
    h('div', { class: 'grid three' }, groupList('Under your estimate', r.vsEstimate.categories.better, diff), groupList('About right', r.vsEstimate.categories.onPlan, (x) => money(x.actual)), groupList('Over your estimate', r.vsEstimate.categories.worse, diff)),
    netWorthBlock(ctx, rec.key, opts.summary),
    h('ul', { class: 'plain' },
      h('li', { class: 'small' }, h('span', {}, 'Forecast check: predicted on the 1st'), h('b', { class: 'num' }, r.forecast.predicted === null ? 'not saved' : money(r.forecast.predicted) + ', ended ' + money(r.forecast.actual))),
      h('li', { class: 'small' }, h('span', {}, 'Tracking: spending from the log'), h('b', { class: 'num', 'data-key': 'review-tracking' }, pct(r.tracking.share) + ' (' + money(r.tracking.fromLog) + ' logged, ' + money(r.tracking.typed) + ' typed)')),
      h('li', { class: 'small' }, h('span', {}, 'Biggest changes from last month'), h('b', { class: 'num' }, r.changes.map((c) => c.name + ' ' + signedMoney(c.change)).join(', ') || 'none')),
      h('li', { class: 'small' }, h('span', {}, 'Top merchants'), h('b', {}, r.topMerchants.map((m) => m.merchant + ' ' + money(m.amount)).join(', ') || 'none in the log')),
      r.pareto ? h('li', { class: 'small' }, h('span', {}, '80/20'), h('b', {}, r.pareto.reading)) : null,
      h('li', { class: 'small' }, h('span', {}, 'Mistakes'), h('b', { class: 'num' }, money(r.mistakes))),
      h('li', { class: 'small' }, h('span', {}, 'Happiness share of spending (joy 7+)'), h('b', { class: 'num' }, pct(r.happyShare))),
      h('li', { class: 'small' }, h('span', {}, 'Open at close'), h('b', { 'data-key': 'review-open' }, r.openItems.summary))),
    revised.length ? h('div', { class: 'card flag', 'data-key': 'review-revisions' }, h('b', {}, 'Revised after close (not part of the saved review)'),
      h('ul', { class: 'plain' }, revised.map(([id, v]) => h('li', { class: 'small' }, h('span', {}, (rec.snapshot.lines[id] || { name: id }).name + ', ' + dayLabel(v.at.slice(0, 10))), h('b', { class: 'num' }, money(v.amount) + ' (was ' + money(rec.snapshot.lines[id] ? rec.snapshot.lines[id].actual : null) + ')'))))) : null);
}

// The month in review, lighter (S-129): its headline numbers only (spent vs plan, surplus, the bridge,
// the net worth change, open items), the readings, and a milestone if one was crossed. "See the full
// review" opens the rest in place.
function reviewHeadline(ctx, rec, opts) {
  const r = rec.snapshot.review;
  const t = r.totals;
  // Net worth is live from the balances, not from the snapshot (see netWorthBlock); a milestone crossed
  // this month gets its own card (milestones, engines/networth.js).
  const nw = opts.summary ? netWorthBridge(ctx.doc, opts.summary.income, rec.key) : null;
  const crossed = milestones(netWorthByMonth(ctx.doc)).filter((m) => m.celebrate && m.month === rec.key);
  const tile = (label, value, sub, key) => h('div', { class: 'tile' }, h('div', { class: 'label' }, label), h('div', { class: 'value', 'data-key': key }, value), h('div', { class: 'sub' }, sub));
  return h('div', { class: 'card', id: opts.id || 'review-' + rec.key },
    h('div', { class: 'spread' }, h('h2', { style: 'margin:0' }, monthLabel(rec.key) + ' in review'), opts.dismiss ? h('button', { class: 'btn small ghost', onclick: opts.dismiss }, 'Done') : null),
    h('p', { class: 'reading', 'data-key': 'review-readings' }, r.readings.join(' ')),
    crossed.map((m) => h('div', { class: 'card celebrate', 'data-key': 'celebrate-' + m.key }, h('b', {}, m.label + ' in ' + monthLabel(rec.key) + '.'))),
    h('div', { class: 'strip review-headline' },
      tile('Spent', money(t.spent), t.plan === null ? 'no plan' : 'plan ' + money(t.plan), 'review-spent'),
      tile('Surplus', signedMoney(t.surplus), 'savings rate ' + pct(t.savingsRate), 'review-surplus'),
      tile('Bridge', r.bridge.ties === null ? 'no balances' : r.bridge.ties ? 'Ties' : 'Off by ' + money(Math.abs(r.bridge.unexplained)), '', 'review-bridge'),
      nw && nw.total.change !== null ? tile('Net worth', signedMoney(nw.total.change), 'this month', 'review-nw-change') : null,
      tile('Open items', String(r.openItems.count), r.openItems.count ? 'at close' : 'none at close', 'review-open-count')),
    h('button', { class: 'btn small ghost', 'data-key': 'review-full', 'aria-expanded': 'false', onclick: () => { ctx.ui.expanded.add('review-full:' + rec.key); ctx.rerender(); } }, 'See the full review'));
}

// Net worth in the month in review (S-114): both net worths at the month's end, the change in each,
// and the bridge's top line. Worked out from the balances (they can be updated after close).
// The month FI net worth (or net worth) crosses $0 gets its own card; it stays in the milestones.
function netWorthBlock(ctx, month, summary) {
  if (!summary) return null;
  const b = netWorthBridge(ctx.doc, summary.income, month);
  if (b.total.actual === null && b.fi.actual === null) return null;
  const crossed = milestones(netWorthByMonth(ctx.doc)).filter((m) => m.celebrate && m.month === month);
  const tile = (label, end, change, key) => h('div', { class: 'tile' }, h('div', { class: 'label' }, label), h('div', { class: 'value', 'data-key': key }, money(end)), h('div', { class: 'sub' }, change === null ? '' : signedMoney(change) + ' this month'));
  return h('div', { 'data-key': 'review-networth' },
    crossed.map((m) => h('div', { class: 'card celebrate', 'data-key': 'celebrate-' + m.key }, h('b', {}, m.label + ' in ' + monthLabel(month) + '.'), h('div', { class: 'small' }, 'It stays in your milestones (Insights, Net worth).'))),
    h('div', { class: 'strip' }, tile('Net worth', b.total.actual, b.total.change, 'review-nw-total'), tile('FI net worth', b.fi.actual, b.fi.change, 'review-nw-fi')),
    h('p', { class: 'reading', 'data-key': 'review-nw-reading' }, b.reading));
}

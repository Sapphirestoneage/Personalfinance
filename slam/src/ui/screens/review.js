// Review (S-106): fill gaps (the Actual pass, S-087), close the month (the
// checklist and the bridge in one line), mistakes, and past months. A line with
// log entries this month has its actual from the log (with "see entries"); a
// yearly line shows its monthly share; anything still empty is listed first
// with three answers: add an entry, type an amount, or none this month.
// Line details, tags, and debts are set up in Setup.

import { h, options } from '../dom.js';
import { money } from '../format.js';
import { minimumAmount, linkedLine } from '../../calc/debts.js';
import { valueInput } from '../components/value-input.js';
import { statusChip } from '../components/status.js';
import { findCategory } from '../../store/edits.js';
import { coverageNote } from '../components/coverage.js';
import { incomeFillCard } from '../components/income-month.js';
import { PREMIUM_LINE_TYPES } from '../../calc/coverage.js';
import { checklistCard, reviewCard } from '../components/loop.js';
import { closedMonthTable } from '../components/budget-table.js';
import { monthRows } from '../../calc/history.js';
import { bridgeFor } from '../../calc/bridge.js';
import { mistakePicker } from '../charts/catalog.js';
import { jumpLink } from '../components/jump.js';
import { monthLabel } from '../format.js';
import { openQuickEntry } from '../components/quick-entry.js';
import { gapLines, reviewRows } from '../../calc/loop.js';
import { logEntriesFor, removeTransaction } from '../../store/edits.js';
import { editEntry } from '../../store/log.js';
import { makeValue } from '../../store/value.js';
import { parseAmount } from '../components/value-input.js';
import { dayLabel, todayIso } from '../format.js';

const modelLine = (summary, id) => summary.model.categories.flatMap((c) => c.lines).find((l) => l.id === id) || null;

// Entries for one line this month: amount editable, removable.
function entriesList(ctx, line) {
  const doc = ctx.doc;
  const list = logEntriesFor(doc, line.id, doc.currentMonth);
  return h('ul', { class: 'plain entries' }, list.map((t) => h('li', { class: 'small' },
    h('span', {}, dayLabel(t.date) + (t.description ? ', ' + t.description : '') + (t.note ? ' (' + t.note + ')' : ''), h('span', { class: 'src-chip' }, { manual: 'Logged', scheduled: 'Scheduled', import: 'Bank' }[t.source || 'import'])),
    h('span', { class: 'row' },
      h('input', { type: 'text', inputmode: 'decimal', class: 'amount', style: 'width:6.5em', 'aria-label': 'Entry amount', 'data-key': 'entry-amt:' + t.id, value: String(t.amount),
        onchange: (e) => { const a = parseAmount(e.target.value); if (a === null || a === undefined) { e.target.value = t.amount; return; } ctx.update('Edit entry', (d) => editEntry(d, t.id, { amount: a })); } }),
      h('button', { class: 'btn small ghost danger', 'aria-label': 'Remove entry', onclick: () => ctx.update('Remove entry', (d) => removeTransaction(d, t.id)) }, 'Remove')))));
}

// One line's actual: from the log, a yearly share, or typed (with none this month).
function actualCell(ctx, summary, line) {
  const m = modelLine(summary, line.id);
  const open = ctx.ui.expanded.has('entries:' + line.id);
  const toggle = () => { if (open) ctx.ui.expanded.delete('entries:' + line.id); else ctx.ui.expanded.add('entries:' + line.id); ctx.rerender(); };
  const add = h('button', { class: 'btn small ghost', 'data-key': 'add-entry:' + line.id, onclick: () => openQuickEntry(ctx, { lineId: line.id }) }, '+ Add entry');
  if (m && m.actualFrom === 'share') {
    return h('div', { class: 'value-input' }, h('b', { class: 'num' }, money(m.actual)), statusChip('computed'), h('span', { class: 'xs muted' }, 'monthly share of a yearly cost' + (m.logCount ? '; paid this month, see the bridge' : '')), add);
  }
  if (m && m.actualFrom === 'log') {
    const n = m.logCount;
    return h('div', { style: 'flex-basis:100%' }, h('div', { class: 'value-input' },
      h('b', { class: 'num', 'data-key': 'from-log:' + line.id, title: 'This comes from ' + n + (n === 1 ? ' entry' : ' entries') + '. Add one, or edit an entry.',
        onclick: () => ctx.toast('This comes from ' + n + (n === 1 ? ' entry' : ' entries') + '. Add one, or edit an entry.') }, money(m.actual, true)),
      statusChip('computed'), h('span', { class: 'xs muted' }, 'from your log, ' + n + (n === 1 ? ' entry' : ' entries')),
      h('button', { class: 'btn small ghost', 'data-key': 'see-entries:' + line.id, 'aria-expanded': open ? 'true' : 'false', onclick: toggle }, open ? 'Hide entries' : 'See entries'), add),
    open ? entriesList(ctx, line) : null);
  }
  return h('div', { class: 'value-input' }, valueInput(ctx, ['line', line.id, 'actual'], line.actual, { label: line.name + ' actual', parts: true }),
    line.actual.status === null ? noneButton(ctx, line) : null, add);
}

function noneButton(ctx, line) {
  return h('button', { class: 'btn small ghost', 'data-key': 'none:' + line.id, onclick: () => ctx.commit(['line', line.id, 'actual'], makeValue(0, { note: 'None this month', asOf: todayIso() }), 'None this month') }, 'None this month');
}

// Lines in the plan or with an estimate that have nothing yet this month: on top.
function gapsCard(ctx, summary) {
  // A gap: nothing this month, on a line (or in a category) that has a plan or an estimate (calc/loop.js).
  const gaps = gapLines(summary).map((g) => ({ c: summary.model.categories.find((x) => x.id === g.catId), l: modelLine(summary, g.id) }));
  const done = summary.model.categories.flatMap((c) => c.lines).filter((l) => l.actualFrom === 'log').length;
  return h('div', { class: 'card' + (gaps.length ? ' flag' : ''), id: 'gaps-card' },
    h('h3', {}, gaps.length ? 'Still empty (' + gaps.length + ')' : 'Nothing left to fill'),
    gaps.length ? h('p', { class: 'muted small' }, done + ' line' + (done === 1 ? ' is' : 's are') + ' already filled from the log. For each line below: add an entry, type an amount, or none this month.')
      : h('div', { class: 'empty-state row' }, h('span', { class: 'small' }, 'Every line with a plan or an estimate has an actual. Close the month when it ends.'),
        h('button', { class: 'btn small', 'data-key': 'gaps-close', onclick: () => { ctx.ui.closing = true; ctx.ui.anchor = 'checklist'; ctx.rerender(); } }, 'Close the month')),
    gaps.map(({ c, l }) => {
      const line = ctx.doc.categories.find((x) => x.id === c.id).lines.find((x) => x.id === l.id);
      return h('div', { class: 'qa' }, h('div', { class: 'q' }, h('div', {}, l.name), h('div', { class: 'hint' }, c.name + (l.estimate !== null ? ', estimate ' + money(l.estimate) : ''))),
        h('div', { class: 'row' }, h('button', { class: 'btn small primary', 'data-key': 'gap-entry:' + l.id, onclick: () => openQuickEntry(ctx, { lineId: l.id }) }, 'Add an entry'),
          h('button', { class: 'btn small', 'data-key': 'gap-type:' + l.id, onclick: () => { ctx.ui.focusPath = ['line', l.id, 'actual']; ctx.rerender(); } }, 'Type an amount'), noneButton(ctx, line)));
    }));
}

// One summary row per category ("Food: $412 from 18 entries", S-106) that opens on a tap
// to each line's actual: from the log, a yearly share, or typed. Names, types, and
// details are changed in Setup, Categories and lines.
function summaryText(r) {
  const rest = [];
  if (r.typed) rest.push(r.typed + ' typed');
  if (r.shares) rest.push(r.shares + ' yearly share' + (r.shares === 1 ? '' : 's'));
  if (r.empty) rest.push(r.empty + ' still empty');
  return r.name + ': ' + (r.actual === null ? 'nothing yet' : money(r.actual)) +
    (r.entries ? ' from ' + r.entries + ' entr' + (r.entries === 1 ? 'y' : 'ies') : '') + (rest.length ? ', ' + rest.join(', ') : '');
}

function categoryRow(ctx, summary, r) {
  const key = 'rv-cat:' + r.id;
  const open = ctx.ui.expanded.has(key);
  const toggle = () => { if (open) ctx.ui.expanded.delete(key); else ctx.ui.expanded.add(key); ctx.rerender(); };
  const head = h('button', { class: 'rv-row', 'data-key': key, 'aria-expanded': open ? 'true' : 'false', onclick: toggle },
    h('span', {}, (open ? '\u25be ' : '\u25b8 ') + summaryText(r)));
  if (!open) return h('div', { class: 'rv-cat', id: 'rv-cat-' + r.id }, head);
  if (r.isDebt) {
    const debts = ctx.doc.debts.filter((d) => d.state !== 'archived');
    return h('div', { class: 'rv-cat open', id: 'rv-cat-' + r.id }, head,
      h('ul', { class: 'plain' }, debts.map((d) => h('li', { class: 'small' }, h('span', {}, d.label), h('b', { class: 'num' }, money(minimumAmount(ctx.doc, d)) + (linkedLine(ctx.doc, d) ? ' (the ' + linkedLine(ctx.doc, d).name + ' line)' : ' minimum'))))),
      h('p', { class: 'xs' }, jumpLink(ctx, 'setup:debts', 'Change debts in Setup')));
  }
  const cat = ctx.doc.categories.find((c) => c.id === r.id);
  const live = cat.lines.filter((l) => l.state !== 'archived' && !(l.addedFor && l.addedFor > ctx.doc.currentMonth));
  return h('div', { class: 'rv-cat open', id: 'rv-cat-' + r.id }, head,
    live.map((line) => h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('div', {}, line.name, line.state === 'hidden' ? ' (hidden)' : '')),
      // A premium line follows health coverage (S-117): its summary, never a question.
      PREMIUM_LINE_TYPES.includes(line.type) ? coverageNote(ctx, 'coverage-summary-rv:' + line.id)
        // A typed interest line once every card's interest is computed (S-120).
        : (modelLine(summary, line.id) || {}).covered === 'computed-interest' ? h('span', { class: 'small muted', 'data-key': 'interest-replaced:' + line.id }, 'Replaced by computed interest (Debt payments)')
          : actualCell(ctx, summary, line))));
}

// Month end: close the month (the checklist first), with the bridge in one line.
function monthEnd(ctx, summary) {
  const doc = ctx.doc;
  const br = bridgeFor(doc, summary.income, doc.currentMonth);
  const state = br.surplus === null ? 'needs take-home and spending' : br.actual === null ? 'needs start and end balances' : br.ties ? 'ties' : 'off by ' + money(Math.abs(br.unexplained), true);
  return h('section', { id: 'month-end' }, h('h2', {}, 'Close the month'),
    h('div', { class: 'card spread' },
      h('span', { class: 'small' }, 'Budget to cash, ' + monthLabel(doc.currentMonth) + ': ', h('b', { 'data-key': 'bridge-line' }, state), ' ',
        h('a', { href: '#insights', 'data-key': 'go-bridge', onclick: (e) => { e.preventDefault(); ctx.jump('bridge', { ui: { bridgeMonth: doc.currentMonth } }); } }, 'See the bridge')),
      h('button', { class: 'btn small primary', 'data-key': 'open-checklist', onclick: () => { ctx.ui.closing = true; ctx.rerender(); } }, 'Close ' + monthLabel(doc.currentMonth))),
    ctx.ui.closing ? checklistCard(ctx, summary) : null);
}

function mistakesSection(ctx, summary) {
  return h('section', { id: 'mistakes' }, h('h2', {}, 'Mistakes this month'), h('div', { class: 'card' }, mistakePicker(ctx, summary)));
}

// Closed months: the saved review (never recomputed), and the lines with late entries.
function pastMonths(ctx, summary) {
  const closed = ctx.doc.months.slice().reverse();
  if (!closed.length) {
    return h('section', { id: 'past-months' }, h('h2', {}, 'Past months'), h('div', { class: 'card empty-state row' }, h('span', { class: 'small' }, 'Close a month to see its review here.'),
      h('button', { class: 'btn small', 'data-key': 'past-close', onclick: () => { ctx.ui.closing = true; ctx.ui.anchor = 'checklist'; ctx.rerender(); } }, 'Close ' + monthLabel(ctx.doc.currentMonth))));
  }
  const key = closed.some((m) => m.key === ctx.ui.monthsPick) ? ctx.ui.monthsPick : closed[0].key;
  const rec = closed.find((m) => m.key === key);
  return h('section', { id: 'past-months' }, h('h2', {}, 'Past months'),
    h('div', { class: 'card' }, h('label', { class: 'row' }, h('b', {}, 'Closed month'),
      h('select', { 'data-key': 'months-pick', onchange: (e) => { ctx.ui.monthsPick = e.target.value; ctx.rerender(); } }, options(closed.map((m) => [m.key, monthLabel(m.key)]), key)))),
    reviewCard(ctx, rec, { id: 'months-review', summary }),
    h('details', { class: 'card', id: 'closed-lines' }, h('summary', {}, 'Lines in ' + monthLabel(key) + ', and late entries'),
      closedMonthTable(ctx, monthRows(ctx.doc, summary.history, key), key)));
}

export function renderReview(ctx, summary) {
  const doc = ctx.doc;
  const justClosed = ctx.ui.justClosed ? doc.months.find((m) => m.key === ctx.ui.justClosed) : null;
  return h('div', {},
    h('h1', {}, 'Review'),
    justClosed ? reviewCard(ctx, justClosed, { id: 'just-closed', summary, dismiss: () => { ctx.ui.justClosed = null; ctx.rerender(); } }) : null,
    h('section', { id: 'fill-gaps' }, h('h2', {}, 'Fill gaps, ' + monthLabel(doc.currentMonth)),
      // Income first (S-118), then the spending lines still empty.
      incomeFillCard(ctx, summary),
      gapsCard(ctx, summary),
      h('div', { class: 'card', id: 'rv-rows' }, h('p', { class: 'muted small', style: 'margin-top:0' }, 'Already filled from the log or answered. Tap a category to see its lines.'),
        reviewRows(summary).map((r) => categoryRow(ctx, summary, r))),
      findCategory(doc, 'everything') && doc.settings.singleTotal ? h('p', { class: 'muted small' }, 'Categories with no estimate of their own sit inside the one total. Their actuals draw it down.') : null),
    monthEnd(ctx, summary),
    mistakesSection(ctx, summary),
    pastMonths(ctx, summary));
}

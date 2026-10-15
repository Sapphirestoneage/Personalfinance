// Fill in, pass 5 Actual: the line-by-line lap. Each line has its actual, and
// a detail drawer (kind, need, path, tag, joy, state). Debts live here too.

import { h, options } from '../dom.js';
import { money } from '../format.js';
import { valueInput, question } from '../components/value-input.js';
import { statusChip } from '../components/status.js';
import { addLine, addDebt, findLine, findCategory } from '../../store/edits.js';

const DEBT_TYPES = [['credit-card', 'Credit card'], ['student-loan', 'Student loan'], ['car-loan', 'Car loan'], ['personal-loan', 'Personal loan'], ['medical', 'Medical'], ['bnpl', 'Buy now, pay later'], ['mortgage', 'Mortgage'], ['other', 'Other']];
const STATES = [['active', 'Active'], ['hidden', 'Hidden (still counts)'], ['archived', 'Archived (stops counting)']];

function lineSelect(ctx, line, field, list, label) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label),
    h('select', { 'data-key': 'line:' + line.id + ':' + field, onchange: (e) => ctx.update(label, (d) => {
      let v = e.target.value;
      if (field === 'joy') v = v === '' ? null : Number(v);
      findLine(d, line.id).line[field] = v;
    }) }, options(list, line[field] === null ? '' : String(line[field]))));
}

function lineDetail(ctx, cat, line, catHasAnswer) {
  const doc = ctx.doc;
  return h('div', { class: 'line-detail' },
    h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Name'),
      h('input', { type: 'text', value: line.name, 'data-key': 'line:' + line.id + ':name', onchange: (e) => ctx.update('Rename line', (d) => { findLine(d, line.id).line.name = e.target.value || 'Line'; }) })),
    lineSelect(ctx, line, 'kind', [['fixed', 'Fixed'], ['variable', 'Variable']], 'Fixed or variable'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: line.need, 'data-key': 'line:' + line.id + ':need',
      onchange: (e) => ctx.update('Need or want', (d) => { findLine(d, line.id).line.need = e.target.checked; }) }), 'Need (food, housing, transportation)'),
    lineSelect(ctx, line, 'path', [['personal', 'Personal'], ['linked', 'Linked to an income source'], ['reimbursable', 'Someone pays me back']], 'Path'),
    line.path === 'linked' ? lineSelect(ctx, line, 'linkedIncomeId', [['', 'Pick income'], ...doc.income.map((i) => [i.id, i.label])], 'Linked income') : null,
    line.path === 'reimbursable' ? h('div', {}, question(ctx, 'Owed back to you', null, ['line', line.id, 'owedBack'], line.owedBack),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: line.owedBackReceived, 'data-key': 'line:' + line.id + ':recv',
        onchange: (e) => ctx.update('Owed back received', (d) => { findLine(d, line.id).line.owedBackReceived = e.target.checked; }) }), 'Received')) : null,
    lineSelect(ctx, line, 'tag', [['planned', 'Planned'], ['unavoidable', 'Unavoidable'], ['mistake', 'Mistake (late fee, ticket)']], 'Tag'),
    lineSelect(ctx, line, 'joy', [['', 'Not rated'], ...Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)])], 'Joy, 1 to 10: how much does this add to your life?'),
    lineSelect(ctx, line, 'state', STATES, 'State'),
    catHasAnswer ? h('p', { class: 'muted xs' }, 'Estimate and dream for this category were given as one number in the Rough pass.')
      : h('div', {}, question(ctx, 'Line estimate', null, ['line', line.id, 'estimate'], line.estimate),
        question(ctx, 'Line dream', null, ['line', line.id, 'dream'], line.dream)));
}

function categoryCard(ctx, summary, cat) {
  const row = summary.rows.find((r) => r.id === cat.id);
  if (!row) return null;
  if (row.notForMe) {
    return h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h3', {}, cat.name), statusChip('not-for-me')),
      h('button', { class: 'btn small ghost', onclick: () => ctx.goToField(['categories', cat.id, 'estimate']) }, 'Change in Rough pass'));
  }
  const catHasAnswer = cat.estimate.status !== null || cat.dream.status !== null;
  const live = cat.lines.filter((l) => l.state !== 'archived');
  const archived = cat.lines.filter((l) => l.state === 'archived');
  return h('div', { class: 'card' },
    h('div', { class: 'spread' }, h('h3', {}, cat.name),
      h('span', { class: 'small muted num' }, 'estimate ' + money(row.estimate) + ' / actual ' + money(row.actual) + (row.partial ? ' (partial)' : ''))),
    live.map((line) => {
      const open = ctx.ui.expanded.has('line:' + line.id);
      return h('div', { class: 'qa' },
        h('div', { class: 'q' }, h('div', {}, line.name, line.state === 'hidden' ? ' (hidden)' : '', line.tag === 'mistake' ? h('span', { class: 'chip st-dont-know', style: 'margin-left:6px' }, 'Mistake') : null),
          h('button', { class: 'btn small ghost', 'aria-expanded': open ? 'true' : 'false', onclick: () => {
            if (open) ctx.ui.expanded.delete('line:' + line.id); else ctx.ui.expanded.add('line:' + line.id);
            ctx.rerender();
          } }, open ? 'Less' : 'Details')),
        valueInput(ctx, ['line', line.id, 'actual'], line.actual, { label: line.name + ' actual' }),
        open ? h('div', { style: 'flex-basis:100%' }, lineDetail(ctx, cat, line, catHasAnswer)) : null);
    }),
    archived.length ? h('details', {}, h('summary', { class: 'xs muted' }, 'Archived (' + archived.length + ')'),
      archived.map((l) => h('div', { class: 'spread small' }, l.name, h('button', { class: 'btn small ghost', onclick: () => ctx.update('Restore line', (d) => { findLine(d, l.id).line.state = 'active'; }) }, 'Restore')))) : null,
    h('button', { class: 'btn small ghost', onclick: () => {
      let id;
      ctx.update('Add line', (d) => { id = addLine(d, cat.id, 'New line').id; });
      if (id) { ctx.ui.expanded.add('line:' + id); ctx.ui.focusPath = ['line', id, 'actual']; ctx.rerender(); }
    } }, '+ Add line'));
}

function debtCard(ctx, debt) {
  const p = (k) => ['debts', debt.id, k];
  const set = (k) => (e) => ctx.update('Debt ' + k, (d) => { d.debts.find((x) => x.id === debt.id)[k] = e.target.value; });
  return h('div', { class: 'card' },
    h('div', { class: 'grid two' },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Name'), h('input', { type: 'text', value: debt.label, 'data-key': JSON.stringify(p('label')), onchange: set('label') })),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Type'), h('select', { 'data-key': JSON.stringify(p('type')), onchange: set('type') }, options(DEBT_TYPES, debt.type))),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'State'), h('select', { 'data-key': JSON.stringify(p('state')), onchange: set('state') }, options(STATES, debt.state)))),
    question(ctx, 'Minimum payment', 'Flows into Debt payments automatically', p('minimum'), debt.minimum),
    question(ctx, 'Balance', null, p('balance'), debt.balance, { cadence: false }),
    question(ctx, 'APR (%)', null, p('apr'), debt.apr, { cadence: false, placeholder: '%' }),
    question(ctx, 'Due day of the month', null, p('dueDay'), debt.dueDay, { cadence: false, placeholder: 'day' }));
}

export function renderActual(ctx, summary) {
  const doc = ctx.doc;
  const cats = doc.categories.filter((c) => c.state !== 'archived' && c.id !== 'debt' && c.id !== 'everything');
  return h('div', {},
    h('div', { class: 'card' }, h('h2', {}, 'Actual: the line-by-line lap'),
      h('p', { class: 'muted small' }, 'What really went out in a typical month. Use any cadence; it becomes monthly. Open Details for fixed or variable, need, path, tag, and joy.')),
    cats.map((c) => categoryCard(ctx, summary, c)),
    h('h2', {}, 'Debts'),
    h('label', { class: 'check', 'data-path': JSON.stringify(['debts']) }, h('input', { type: 'checkbox', checked: doc.noDebts && !doc.debts.length, disabled: doc.debts.length > 0, 'data-key': 'no-debts',
      'data-path': JSON.stringify(['debts']), onchange: (e) => ctx.update('No debts', (d) => { d.noDebts = e.target.checked; }) }), 'No debts (counts as complete)'),
    doc.debts.map((d) => debtCard(ctx, d)),
    h('button', { class: 'btn', onclick: () => ctx.update('Add debt', (d) => { addDebt(d, { label: 'Debt ' + (d.debts.length + 1) }); }) }, '+ Add debt'),
    findCategory(doc, 'everything') && doc.settings.singleTotal ? h('p', { class: 'muted small' }, 'Categories with no estimate of their own sit inside the one total. Their actuals draw it down.') : null);
}

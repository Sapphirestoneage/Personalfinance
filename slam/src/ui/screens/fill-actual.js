// Fill in, pass 5 Actual: review and fill gaps (S-087). A line with log entries
// this month has its actual from the log (collapsed, with "see entries"); a
// yearly line shows its monthly share; anything still empty is listed first
// with three answers: add an entry, type an amount, or none this month.
// Each line also has a detail drawer (kind, need, path, tag, joy, state). Debts live here too.

import { h, options } from '../dom.js';
import { money } from '../format.js';
import { valueInput, question } from '../components/value-input.js';
import { statusChip } from '../components/status.js';
import { addLine, addDebt, findLine, findCategory, renameLine, addCategory, addTag, toggleLineTag, renameTag, removeTag } from '../../store/edits.js';
import { nameEdit } from '../components/name-edit.js';
import { parentsPlanToggle, coveredByParents, coveredNote } from '../components/parents-plan.js';
import { categoryTypeSelect, lineTypeSelect, typeHint } from '../components/type-select.js';
import { lineTypeLabel } from '../../store/types.js';
import { DEBT_TYPE_OPTIONS } from '../components/debt-quick.js';
import { monthPicker } from '../components/month-picker.js';
import { linkedCardBalance } from '../../calc/balances.js';
import { openQuickEntry } from '../components/quick-entry.js';
import { logEntriesFor, removeTransaction } from '../../store/edits.js';
import { editEntry } from '../../store/log.js';
import { makeValue } from '../../store/value.js';
import { parseAmount } from '../components/value-input.js';
import { dayLabel, todayIso } from '../format.js';

const STATES = [['active', 'Counts, shown'], ['hidden', 'Counts, hidden'], ['archived', 'Archived (stops counting)']];
const TAG_IDEAS = ['Subscription', 'Travel', 'Gifts', 'Work', 'Self-care', 'Kids', 'Pets', 'Date night'];

// The client's own tags on one line: chips that toggle, plus a box to make a new one.
function tagRow(ctx, line) {
  const doc = ctx.doc;
  const open = ctx.ui.expanded.has('tags:' + line.id);
  const mine = doc.tags.filter((t) => line.tags.includes(t.id));
  const toggle = () => { if (open) ctx.ui.expanded.delete('tags:' + line.id); else ctx.ui.expanded.add('tags:' + line.id); ctx.rerender(); };
  if (!open) {
    return h('div', { class: 'tags' }, mine.map((t) => h('span', { class: 'tag-chip', 'aria-pressed': 'true' }, '#' + t.name)),
      h('button', { class: 'tag-chip', 'data-key': 'tags:' + line.id + ':open', onclick: toggle }, mine.length ? 'Edit tags' : '+ Tag'));
  }
  const ideas = TAG_IDEAS.filter((n) => !doc.tags.some((t) => t.name.toLowerCase() === n.toLowerCase())).slice(0, 4);
  const make = (name) => ctx.update('Add tag', (d) => { toggleLineTag(d, line.id, addTag(d, name).id); });
  return h('div', { class: 'tags' },
    doc.tags.map((t) => h('button', { class: 'tag-chip', 'aria-pressed': line.tags.includes(t.id) ? 'true' : 'false', 'data-key': 'tags:' + line.id + ':' + t.id,
      onclick: () => ctx.update('Tag', (d) => toggleLineTag(d, line.id, t.id)) }, '#' + t.name)),
    ideas.map((n) => h('button', { class: 'tag-chip', onclick: () => make(n) }, '+ ' + n)),
    h('input', { type: 'text', placeholder: 'New tag', 'aria-label': 'New tag for ' + line.name, 'data-key': 'tags:' + line.id + ':new', style: 'width:9em;min-height:28px',
      onchange: (e) => { if (e.target.value.trim()) make(e.target.value); } }),
    h('button', { class: 'tag-chip', onclick: toggle }, 'Done'));
}

// Rename or delete tags (deleting takes it off every line).
function tagManager(ctx) {
  const doc = ctx.doc;
  if (!doc.tags.length) return null;
  return h('details', { class: 'card' }, h('summary', {}, 'Your tags (' + doc.tags.length + ')'),
    doc.tags.map((t) => h('div', { class: 'spread', style: 'margin-top:8px' },
      nameEdit(ctx, t.name, 'tag:' + t.id + ':name', (d, v) => renameTag(d, t.id, v), 'Tag name'),
      h('button', { class: 'btn small ghost danger', onclick: () => ctx.update('Delete tag', (d) => removeTag(d, t.id)) }, 'Delete'))));
}

function catName(ctx, cat) {
  return nameEdit(ctx, cat.name, 'cat:' + cat.id + ':name', (d, v) => { findCategory(d, cat.id).name = v; }, 'Category name');
}

function lineSelect(ctx, line, field, list, label) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label),
    h('select', { 'data-key': 'line:' + line.id + ':' + field, onchange: (e) => ctx.update(label, (d) => {
      let v = e.target.value;
      if (field === 'joy' || field === 'stress') v = v === '' ? null : Number(v);
      findLine(d, line.id).line[field] = v;
    }) }, options(list, line[field] === null ? '' : String(line[field]))));
}

function lineDetail(ctx, cat, line, catHasAnswer) {
  const doc = ctx.doc;
  return h('div', { class: 'line-detail' },
    lineTypeSelect(ctx, line),
    lineSelect(ctx, line, 'kind', [['fixed', 'Fixed'], ['variable', 'Variable']], 'Fixed or variable'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: line.need, 'data-key': 'line:' + line.id + ':need',
      onchange: (e) => ctx.update('Need or want', (d) => { findLine(d, line.id).line.need = e.target.checked; }) }), 'Need (your call; FAT is counted by category)'),
    lineSelect(ctx, line, 'path', [['personal', 'Personal'], ['linked', 'Linked to an income source'], ['reimbursable', 'Someone pays me back']], 'Path'),
    line.path === 'linked' ? lineSelect(ctx, line, 'linkedIncomeId', [['', 'Pick income'], ...doc.income.map((i) => [i.id, i.label])], 'Linked income') : null,
    line.path === 'reimbursable' ? h('div', {}, question(ctx, 'Owed back to you', null, ['line', line.id, 'owedBack'], line.owedBack),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: line.owedBackReceived, 'data-key': 'line:' + line.id + ':recv',
        onchange: (e) => ctx.update('Owed back received', (d) => { findLine(d, line.id).line.owedBackReceived = e.target.checked; }) }), 'Received')) : null,
    lineSelect(ctx, line, 'joy', [['', 'Not rated'], ...Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)])], 'Joy or purpose, 1 to 10: how much does this add to your life?'),
    lineSelect(ctx, line, 'stress', [['', 'Not rated'], ...Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)])], 'Stress, 1 to 10: how much does this drain you?'),
    lineSelect(ctx, line, 'state', STATES, 'State'),
    catHasAnswer ? h('p', { class: 'muted xs' }, 'Estimate and dream for this category were given as one number in the Rough pass.')
      : h('div', {}, question(ctx, 'Line estimate', null, ['line', line.id, 'estimate'], line.estimate, { parts: true }),
        question(ctx, 'Line dream, short term', null, ['line', line.id, 'dream'], line.dream, { parts: true }),
        question(ctx, 'Line dream, long term', null, ['line', line.id, 'dreamLong'], line.dreamLong, { parts: true })));
}

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
  const gaps = [];
  for (const c of summary.model.categories) {
    if (c.isDebt || c.notForMe || c.isEverything) continue;
    const pc = summary.plan ? summary.plan.cats[c.id] : null;
    // A gap: nothing this month, on a line (or in a category) that has a plan or an estimate.
    const expected = (l) => l.estimate !== null || c.estimate.amount !== null || (pc && (pc.byCategory ? pc.amount !== null : pc.lines[l.id] !== null && pc.lines[l.id] !== undefined));
    for (const l of c.lines) if (l.actual === null && l.status.actual === null && !l.covered && expected(l)) gaps.push({ c, l });
  }
  const done = summary.model.categories.flatMap((c) => c.lines).filter((l) => l.actualFrom === 'log').length;
  return h('div', { class: 'card' + (gaps.length ? ' flag' : ''), id: 'gaps-card' },
    h('h2', {}, gaps.length ? 'Still empty (' + gaps.length + ')' : 'Nothing left to fill'),
    h('p', { class: 'muted small' }, done + ' line' + (done === 1 ? ' is' : 's are') + ' already filled from the log. ' + (gaps.length ? 'For each line below: add an entry, type an amount, or none this month.' : 'Every line with a plan or an estimate has an actual.')),
    gaps.map(({ c, l }) => {
      const line = ctx.doc.categories.find((x) => x.id === c.id).lines.find((x) => x.id === l.id);
      return h('div', { class: 'qa' }, h('div', { class: 'q' }, h('div', {}, l.name), h('div', { class: 'hint' }, c.name + (l.estimate !== null ? ', estimate ' + money(l.estimate) : ''))),
        h('div', { class: 'row' }, h('button', { class: 'btn small primary', 'data-key': 'gap-entry:' + l.id, onclick: () => openQuickEntry(ctx, { lineId: l.id }) }, 'Add an entry'),
          h('button', { class: 'btn small', 'data-key': 'gap-type:' + l.id, onclick: () => { ctx.ui.focusPath = ['line', l.id, 'actual']; ctx.rerender(); } }, 'Type an amount'), noneButton(ctx, line)));
    }));
}

function categoryCard(ctx, summary, cat) {
  const row = summary.rows.find((r) => r.id === cat.id);
  if (!row) return null;
  if (row.notForMe) {
    return h('div', { class: 'card' }, h('div', { class: 'spread' }, h('h3', {}, catName(ctx, cat)), statusChip('not-for-me')),
      h('button', { class: 'btn small ghost', onclick: () => ctx.goToField(['categories', cat.id, 'estimate']) }, 'Change in Rough pass'));
  }
  const catHasAnswer = cat.estimate.status !== null || cat.dream.status !== null || cat.dreamLong.status !== null;
  const live = cat.lines.filter((l) => l.state !== 'archived' && !(l.addedFor && l.addedFor > ctx.doc.currentMonth));
  const archived = cat.lines.filter((l) => l.state === 'archived');
  return h('div', { class: 'card' },
    h('div', { class: 'spread' }, h('h3', {}, catName(ctx, cat)),
      categoryTypeSelect(ctx, cat),
      h('span', { class: 'small muted num' }, 'estimate ' + money(row.estimate) + ' / actual ' + money(row.actual) + (row.partial ? ' (partial)' : ''))),
    cat.type === 'health' ? parentsPlanToggle(ctx) : null,
    live.map((line) => {
      const open = ctx.ui.expanded.has('line:' + line.id);
      return h('div', { class: 'qa' },
        h('div', { class: 'q' }, h('div', {}, nameEdit(ctx, line.name, 'line:' + line.id + ':name', (d, v) => renameLine(d, line.id, v), 'Line name'),
          typeHint(lineTypeLabel(line.type), line.name),
          line.state === 'hidden' ? ' (hidden)' : ''),
          h('button', { class: 'btn small ghost', 'aria-expanded': open ? 'true' : 'false', onclick: () => {
            if (open) ctx.ui.expanded.delete('line:' + line.id); else ctx.ui.expanded.add('line:' + line.id);
            ctx.rerender();
          } }, open ? 'Less' : 'Details')),
        coveredByParents(ctx.doc, line) ? coveredNote() : actualCell(ctx, summary, line),
        tagRow(ctx, line),
        open ? h('div', { style: 'flex-basis:100%' }, lineDetail(ctx, cat, line, catHasAnswer)) : null);
    }),
    archived.length ? h('details', {}, h('summary', { class: 'xs muted' }, 'Archived (' + archived.length + ')'),
      archived.map((l) => h('div', { class: 'spread small' }, l.name, h('button', { class: 'btn small ghost', onclick: () => ctx.update('Restore line', (d) => { findLine(d, l.id).line.state = 'active'; }) }, 'Restore')))) : null,
    h('button', { class: 'btn small ghost', onclick: () => {
      let id;
      ctx.update('Add line', (d) => { id = addLine(d, cat.id, 'New line').id; });
      if (id) { ctx.ui.focusKey = 'line:' + id + ':name'; ctx.rerender(); }
    } }, '+ Add line'));
}

function debtCard(ctx, debt) {
  const linked = linkedCardBalance(ctx.doc, debt.id);
  const p = (k) => ['debts', debt.id, k];
  const set = (k) => (e) => ctx.update('Debt ' + k, (d) => { d.debts.find((x) => x.id === debt.id)[k] = e.target.value; });
  return h('div', { class: 'card' },
    h('div', { class: 'grid two' },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Name'), h('input', { type: 'text', value: debt.label, 'data-key': JSON.stringify(p('label')), onchange: set('label') })),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Type'), h('select', { 'data-key': JSON.stringify(p('type')), onchange: set('type') }, options(DEBT_TYPE_OPTIONS, debt.type))),
      h('div', { class: 'field' }, debt.state === 'archived'
        ? h('p', { class: 'small warn' }, 'Not counting (paid off or set aside). ', h('button', { class: 'btn small', onclick: () => ctx.update('Count debt again', (d) => { d.debts.find((x) => x.id === debt.id).state = 'active'; }) }, 'Count it again'))
        : h('button', { class: 'btn small ghost', 'data-key': 'stop-debt:' + debt.id, onclick: () => ctx.update('Stop counting debt', (d) => { d.debts.find((x) => x.id === debt.id).state = 'archived'; }) }, 'Paid off, stop counting'))),
    question(ctx, 'Minimum payment', 'Flows into Debt payments automatically', p('minimum'), debt.minimum),
    linked ? h('p', { class: 'small', 'data-key': 'debt-linked:' + debt.id }, 'Balance: ' + money(linked.amount) + ', from the account "' + linked.name + '" (Cash flow).')
      : question(ctx, 'Balance', null, p('balance'), debt.balance, { cadence: false }),
    question(ctx, 'APR (%)', null, p('apr'), debt.apr, { cadence: false, placeholder: '%' }),
    question(ctx, 'Due day of the month', null, p('dueDay'), debt.dueDay, { cadence: false, placeholder: 'day' }));
}

export function renderActual(ctx, summary) {
  const doc = ctx.doc;
  const cats = doc.categories.filter((c) => c.state !== 'archived' && c.id !== 'debt' && c.id !== 'everything');
  return h('div', {},
    h('div', { class: 'card' }, h('h2', {}, 'Actual: review and fill gaps'),
      h('p', { class: 'muted small' }, 'Lines with entries in the log are already filled (tap See entries). Only what is missing needs an answer. Typed amounts can use any cadence; it becomes monthly. Tap a name to rename it. Open Details for fixed or variable, need, path, and joy.')),
    monthPicker(ctx, summary, { copyFixed: true }),
    gapsCard(ctx, summary),
    tagManager(ctx),
    cats.map((c) => categoryCard(ctx, summary, c)),
    h('button', { class: 'btn', onclick: () => {
      let id;
      ctx.update('Add category', (d) => { id = addCategory(d, 'New category').id; });
      if (id) { ctx.ui.focusKey = 'cat:' + id + ':name'; ctx.rerender(); }
    } }, '+ Add category'),
    h('h2', {}, 'Debts'),
    h('label', { class: 'check', 'data-path': JSON.stringify(['debts']) }, h('input', { type: 'checkbox', checked: doc.noDebts && !doc.debts.length, disabled: doc.debts.length > 0, 'data-key': 'no-debts',
      'data-path': JSON.stringify(['debts']), onchange: (e) => ctx.update('No debts', (d) => { d.noDebts = e.target.checked; }) }), 'No debts (counts as complete)'),
    doc.debts.map((d) => debtCard(ctx, d)),
    h('button', { class: 'btn', onclick: () => ctx.update('Add debt', (d) => { addDebt(d, { label: 'Debt ' + (d.debts.length + 1) }); }) }, '+ Add debt'),
    findCategory(doc, 'everything') && doc.settings.singleTotal ? h('p', { class: 'muted small' }, 'Categories with no estimate of their own sit inside the one total. Their actuals draw it down.') : null);
}

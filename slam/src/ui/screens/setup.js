// Setup (S-106): one-time setup, never mixed with weekly use. A short list of
// sections; one is open at a time. Basics, Income and paychecks, Accounts,
// Debts, Bills and due dates, Categories and lines, Tags, Cushion and coach
// settings, Coach notes, and the parked Future tools switch.

import { h } from '../dom.js';
import { SETUP_SECTIONS } from '../nav.js';
import { renderProfile, incomeSection, coachNotesCard, futureToolsCard } from './setup-basics.js';
import { paydaysCard, billsCard } from '../components/cashflow.js';
import { materialityInput } from '../charts/bridge-charts.js';
import { setOwnReturn } from '../../store/accounts.js';
import { DEFAULT_OWN_RETURN } from '../../store/schema.js';
import { tagRow, tagManager, lineDetail, catName } from '../components/lines.js';
import { statusChip } from '../components/status.js';
import { nameEdit } from '../components/name-edit.js';
import { coverageSection, coverageNote } from '../components/coverage.js';
import { categoryTypeSelect, typeHint } from '../components/type-select.js';
import { lineTypeLabel } from '../../store/types.js';
import { addLine, addCategory, findLine, renameLine } from '../../store/edits.js';

// Every category and its lines: names, types, details (fixed or variable, need, path, joy, stress, state), and tags.
function categoryEditor(ctx, summary, cat) {
  const row = summary.rows.find((r) => r.id === cat.id);
  if (!row) return null;
  if (row.notForMe) {
    return h('div', { class: 'rv-cat spread', id: 'cat-' + cat.id }, h('span', { class: 'small' }, cat.name, ' ', statusChip('not-for-me')),
      h('button', { class: 'btn small ghost', onclick: () => ctx.goToField(['categories', cat.id, 'estimate']) }, 'Change in Your estimates'));
  }
  const catHasAnswer = cat.estimate.status !== null;
  const live = cat.lines.filter((l) => l.state !== 'archived' && !(l.addedFor && l.addedFor > ctx.doc.currentMonth));
  const archived = cat.lines.filter((l) => l.state === 'archived');
  // One row per category until tapped (S-106).
  const key = 'set-cat:' + cat.id;
  const open = ctx.ui.expanded.has(key) || live.some((l) => ctx.ui.expanded.has('line:' + l.id));
  const bar = h('button', { class: 'rv-row', 'data-key': key, 'aria-expanded': open ? 'true' : 'false', onclick: () => {
    if (open) { ctx.ui.expanded.delete(key); live.forEach((l) => ctx.ui.expanded.delete('line:' + l.id)); } else ctx.ui.expanded.add(key);
    ctx.rerender();
  } }, (open ? '\u25be ' : '\u25b8 ') + cat.name + ': ' + live.length + ' line' + (live.length === 1 ? '' : 's'));
  if (!open) return h('div', { class: 'rv-cat', id: 'cat-' + cat.id }, bar);
  return h('div', { class: 'card', id: 'cat-' + cat.id },
    bar,
    h('div', { class: 'spread' }, h('h3', {}, catName(ctx, cat)), categoryTypeSelect(ctx, cat)),
    cat.type === 'health' ? coverageNote(ctx, 'coverage-summary-cat') : null,
    live.map((line) => {
      const open = ctx.ui.expanded.has('line:' + line.id);
      return h('div', { class: 'qa' },
        h('div', { class: 'q' }, h('div', {}, nameEdit(ctx, line.name, 'line:' + line.id + ':name', (d, v) => renameLine(d, line.id, v), 'Line name'),
          typeHint(lineTypeLabel(line.type), line.name), line.state === 'hidden' ? ' (hidden)' : '')),
        h('button', { class: 'btn small ghost', 'data-key': 'details:' + line.id, 'aria-expanded': open ? 'true' : 'false', onclick: () => {
          if (open) ctx.ui.expanded.delete('line:' + line.id); else ctx.ui.expanded.add('line:' + line.id);
          ctx.rerender();
        } }, open ? 'Less' : 'Details'),
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

function categoriesSection(ctx, summary) {
  const cats = ctx.doc.categories.filter((c) => c.state !== 'archived' && c.id !== 'debt' && c.id !== 'everything');
  return h('div', { id: 'categories-setup' },
    h('div', { class: 'card' }, h('p', { class: 'muted small', style: 'margin-top:0' }, 'Tap a category to rename it, its lines, and their details (fixed or variable, need, path, joy, stress).'),
      cats.map((c) => categoryEditor(ctx, summary, c))),
    h('button', { class: 'btn', 'data-key': 'add-category', onclick: () => {
      let id;
      ctx.update('Add category', (d) => { id = addCategory(d, 'New category').id; });
      if (id) { ctx.ui.focusKey = 'cat:' + id + ':name'; ctx.rerender(); }
    } }, '+ Add category'));
}

function tagsSection(ctx) {
  if (!ctx.doc.tags.length) {
    return h('div', { class: 'card' }, h('p', { class: 'small' }, 'No tags yet. Add one from any line in Categories and lines.'),
      h('button', { class: 'btn small', 'data-key': 'go-tag-lines', onclick: () => ctx.jump('setup:categories') }, 'Go to Categories and lines'));
  }
  return tagManager(ctx);
}

function coachSection(ctx) {
  if (ctx.role === 'client') return h('div', { class: 'card' }, h('p', { class: 'small muted' }, 'These are the coach\'s settings.'));
  return h('div', { class: 'card', id: 'coach-settings' },
    h('div', { class: 'qa' }, h('div', { class: 'q' }, h('div', {}, 'Bridge: counts as tied when within'), h('div', { class: 'hint' }, 'The budget-to-cash bridge ties when the part not explained is this small. Default $25.')),
      materialityInput(ctx)),
    h('div', { class: 'qa', 'data-key': 'own-return-row' }, h('div', { class: 'q' }, h('div', {}, 'Assumption: what a home\'s equity could earn elsewhere'), h('div', { class: 'hint' }, 'A year, after inflation. Used in "Owning vs the alternative". Default 5%.')),
      h('input', { type: 'text', inputmode: 'decimal', style: 'width:5em', 'data-key': 'own-return', value: String(Math.round(((ctx.doc.settings.ownReturn === undefined ? DEFAULT_OWN_RETURN : ctx.doc.settings.ownReturn)) * 1000) / 10),
        onchange: (e) => {
          const n = Number(e.target.value.trim().replace('%', ''));
          if (!Number.isFinite(n)) return ctx.toast('That needs a percent, 0 to 20');
          ctx.update('Return assumption', (d) => setOwnReturn(d, n / 100));
        } }), h('span', { class: 'small' }, '%')));
}

const SECTIONS = {
  basics: (ctx, s) => renderProfile(ctx, s),
  coverage: (ctx, s) => coverageSection(ctx, s),
  income: (ctx, s) => h('div', {}, incomeSection(ctx, s), paydaysCard(ctx)),
  bills: (ctx, s) => h('div', {}, billsCard(ctx)),
  categories: categoriesSection,
  tags: tagsSection,
  coach: coachSection,
  notes: (ctx) => coachNotesCard(ctx) || h('div', { class: 'card' }, h('p', { class: 'small muted' }, 'Coach notes are hidden in the client view.')),
  future: (ctx) => futureToolsCard(ctx)
};

export function renderSetup(ctx, summary) {
  const id = SECTIONS[ctx.ui.setupSection] ? ctx.ui.setupSection : 'basics';
  const label = SETUP_SECTIONS.find(([k]) => k === id)[1];
  return h('div', {},
    h('h1', {}, 'Setup'),
    h('div', { class: 'passes setup-list', role: 'tablist', 'aria-label': 'Setup sections' }, SETUP_SECTIONS.map(([k, l]) => h('button', {
      role: 'tab', 'aria-selected': k === id ? 'true' : 'false', 'aria-current': k === id ? 'step' : null, 'data-key': 'setup-' + k,
      onclick: () => ctx.go('setup', { setupSection: k })
    }, l))),
    h('section', { id: 'setup-' + id, 'data-section': id }, h('h2', {}, label), SECTIONS[id](ctx, summary)));
}

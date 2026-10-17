// Fill in, pass 3 Rough, and Your dream life at the top of Eras (S-097): one number per top-level category.
// Rough also offers: one total instead, labeled guesses, last month's actual,
// the personal correction, and a blind-guess round for revisit sessions.

import { h } from '../dom.js';
import { money, pct, monthLabel } from '../format.js';
import { question } from '../components/value-input.js';
import { statusChip, statusPicker } from '../components/status.js';
import { makeValue } from '../../store/value.js';
import { useSingleTotal, findCategory, renameLine, startBlindRound, addCategory, addLine, addDebt, breakDown, useOneNumber } from '../../store/edits.js';
import { nameEdit } from '../components/name-edit.js';
import { parentsPlanToggle, coveredByParents, coveredNote } from '../components/parents-plan.js';
import { parentsPlan } from '../../calc/coverage.js';
import { categoryTypeSelect, lineTypeSelect, typeHint } from '../components/type-select.js';
import { categoryTypeLabel, lineTypeLabel } from '../../store/types.js';
import { debtQuick, debtTypeTotals } from '../components/debt-quick.js';
import { lastActual } from '../../calc/history.js';
import { toMonthly } from '../../calc/normalize.js';
import { setPlanAmount } from '../../store/plans.js';
import { nextMonthKey } from '../../store/months.js';

const parentsPlanOn = (doc) => parentsPlan(doc).on;

function addLineButton(ctx, catId) {
  return h('button', { class: 'btn small ghost', onclick: () => {
    let id;
    ctx.update('Add line', (d) => { id = addLine(d, catId, 'New line').id; });
    if (id) { ctx.ui.focusKey = 'line:' + id + ':name'; ctx.rerender(); }
  } }, '+ Add line');
}

// Only for a blank estimate (an app guess, labeled Guess): never over the client's own words.
function useAs(ctx, catId, key, value, label) {
  return h('button', { class: 'btn small ghost', onclick: () => ctx.update(label, (d) => {
    const cat = findCategory(d, catId);
    if (cat[key].amount !== null || cat[key].status !== null) throw new Error(ctx.say('estimate-own'));
    cat[key] = value;
  }) }, label);
}

// Last month's actual and the personal correction go into next month's plan (S-076), not the estimate.
function planAs(ctx, catId, value, label) {
  const next = nextMonthKey(ctx.doc.currentMonth);
  return h('button', { class: 'btn small ghost', onclick: () => ctx.update(label, (d) => setPlanAmount(d, next, 'cat:' + catId, value)) }, label + ' (' + monthLabel(next) + ' plan)');
}

function extrasFor(ctx, summary, row) {
  const out = [];
  const g = summary.guesses.find((x) => x.categoryId === row.id);
  if (g) out.push(h('span', { class: 'xs' }, statusChip('guess', g.value.note), ' ', money(g.value.amount), ' ', useAs(ctx, row.id, 'estimate', g.value, 'Use guess')));
  const last = lastActual(summary.history, row.id);
  if (last) {
    out.push(h('span', { class: 'xs muted' }, monthLabel(last.key) + ' actual ' + money(last.amount) + ' ',
      planAs(ctx, row.id, makeValue(last.amount, { source: 'coach', note: 'From ' + monthLabel(last.key) + ' actual' }), "Plan at last month's actual")));
  }
  const corr = summary.corrections.find((c) => c.id === row.id);
  if (corr && corr.worthOffering) {
    out.push(h('span', { class: 'xs muted' }, 'Your usual miss here: ' + corr.factor.toFixed(2) + 'x. Suggested ' + money(corr.suggested) + ' ',
      planAs(ctx, row.id, makeValue(corr.suggestedWhole, { source: 'coach', note: 'Personal correction ' + corr.factor.toFixed(2) + 'x' }), 'Use in the plan')));
  }
  return out.length ? h('div', { class: 'row' }, out) : null;
}

function blindSection(ctx, summary) {
  const doc = ctx.doc;
  const round = doc.blindRounds.find((r) => r.id === ctx.ui.blindRoundId);
  if (!round) return null;
  const cats = summary.rows.filter((r) => !r.isDebt && !r.notForMe && !r.isEverything);
  return h('div', { class: 'card' },
    h('h2', {}, 'Blind guess'),
    h('p', { class: 'muted small' }, 'Ask again without looking at the old numbers. Then compare.'),
    cats.map((r) => question(ctx, r.name, null, ['blindRounds', round.id, 'estimates', r.id], round.estimates[r.id] || makeValue())),
    h('button', { class: 'btn primary', onclick: () => { ctx.ui.blind = false; ctx.rerender(); } }, 'Done, compare'));
}

function blindResult(summary) {
  const b = summary.blind;
  if (!b || !b.rows.length) return null;
  return h('div', { class: 'card' },
    h('h3', {}, 'Blind guess vs first guess (' + new Date(b.date).toLocaleDateString() + ')'),
    h('ul', { class: 'plain' }, b.rows.map((r) => h('li', {},
      h('span', {}, r.name),
      h('span', { class: 'num small' }, 'first ' + money(r.original) + ', blind ' + money(r.blind) + ', actual ' + money(r.actual) +
        (r.closer ? ' (' + (r.closer === 'blind' ? 'blind was closer' : r.closer === 'original' ? 'first guess was closer' : 'tie') + ')' : ''))))));
}

export function renderEstimates(ctx, summary, key) {
  const doc = ctx.doc;
  const isRough = key === 'estimate';
  if (isRough && ctx.ui.blind) return blindSection(ctx, summary);
  // The dream entry reads its rows from the dream life (calc/dream-life.js), never from the budget.
  const rows = isRough ? summary.rows : summary.dreamLife.entry.rows;
  const ev = rows.find((r) => r.isEverything);

  const header = isRough
    ? h('div', { class: 'card' }, h('h2', {}, 'Rough: about how much a month for each?'),
      h('p', { class: 'muted small' }, 'About ten quick questions, not line by line. "Roughly" is fine. "Don\'t know" and "Doesn\'t apply" are answers too.'),
      h('div', { class: 'row' },
        doc.settings.singleTotal
          ? h('button', { class: 'btn small', onclick: () => ctx.update('Back to categories', (d) => { d.settings.singleTotal = false; findCategory(d, 'everything').state = 'archived'; }) }, 'Use categories instead of one total')
          : h('button', { class: 'btn small', onclick: () => ctx.update('One total instead', (d) => { useSingleTotal(d).state = 'active'; }) }, 'Give one total instead'),
        summary.guesses.length ? h('button', { class: 'btn small', onclick: () => ctx.update('Fill blanks with guesses', (d) => {
          // Guesses only ever fill blank estimates (availableGuesses skips answered ones).
          for (const g of summary.guesses) { const c = findCategory(d, g.categoryId); if (c.estimate.amount === null && c.estimate.status === null) c.estimate = g.value; }
        }) }, 'Fill ' + summary.guesses.length + ' blanks with guesses') : null,
        h('button', { class: 'btn small', onclick: () => {
          ctx.update('Start blind guess', (d) => startBlindRound(d, new Date().toISOString()));
          ctx.ui.blindRoundId = ctx.store.doc.blindRounds[ctx.store.doc.blindRounds.length - 1].id;
          ctx.ui.blind = true;
          ctx.rerender();
        } }, 'Blind guess (revisit)')))
    : h('div', { class: 'card', id: 'dream-entry' }, h('h2', {}, 'Your dream life: what would you like to spend?'),
      h('div', { class: 'toggle', role: 'group', 'aria-label': 'Dream term' },
        h('button', { 'aria-pressed': key === 'dream' ? 'true' : 'false', 'data-key': 'dream-short', onclick: () => { ctx.ui.dreamTerm = 'short'; ctx.rerender(); } }, 'Short term'),
        h('button', { 'aria-pressed': key === 'dreamLong' ? 'true' : 'false', 'data-key': 'dream-long', onclick: () => { ctx.ui.dreamTerm = 'long'; ctx.rerender(); } }, 'Long term')),
      h('p', { class: 'muted small' }, key === 'dream'
        ? 'Short term: this year, or the next step. No judgment. What would feel right for each?'
        : 'Long term: everything after the next step. The life you are building toward. No judgment.'));

  const total = ev && doc.settings.singleTotal ? h('div', { class: 'card' },
    question(ctx, 'One total for everything', ev.carved ? 'Split so far: ' + money(ev.carved) + '. Left in the total: ' + money(ev.estimate) + (ev.overSplit ? '. The split is bigger than the total.' : '') : 'Split into categories below any time; the total is kept.',
      ['categories', 'everything', key], findCategory(doc, 'everything')[key])) : null;

  const list = h('div', { class: 'card' }, rows.filter((r) => !r.isEverything).map((r) => {
    if (r.isDebt && isRough) {
      // Rough debts: one row per debt, by who or where it is owed.
      return h('div', { class: 'sub-lines' },
        h('div', { class: 'qa' }, h('div', { class: 'q' }, r.name, h('div', { class: 'hint' }, 'One row per debt: per card, bank, person, or line of credit. Adds up here and in the Actual pass.')),
          h('span', {}, statusChip('computed'), ' ', h('b', { class: 'num' }, money(r.estimate)))),
        doc.debts.filter((x) => x.state !== 'archived').map((x) => debtQuick(ctx, x)),
        debtTypeTotals(summary),
        h('div', { class: 'row' },
          h('button', { class: 'btn small ghost', onclick: () => {
            let id;
            ctx.update('Add debt', (d) => { id = addDebt(d, { label: 'Debt ' + (d.debts.length + 1) }).id; });
            if (id) { ctx.ui.focusKey = 'debt:' + id + ':label'; ctx.rerender(); }
          } }, '+ Add a debt'),
          doc.debts.length ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: doc.noDebts, 'data-key': 'rough-no-debts',
            onchange: (e) => ctx.update('No debts', (d) => { d.noDebts = e.target.checked; }) }), 'No debts')));
    }
    if (r.isDebt) {
      return h('div', { class: 'qa' }, h('div', { class: 'q' }, r.name, h('div', { class: 'hint' }, 'Comes from the debts list. Never asked twice.')),
        h('span', {}, statusChip('computed'), ' ', h('b', { class: 'num' }, money(r.estimate)),
          doc.debts.length || doc.noDebts ? null : h('button', { class: 'btn small ghost', onclick: () => ctx.goToField(['debts']) }, 'Add debts')));
    }
    const cat = findCategory(doc, r.id);
    // A category not yet typed asks what it counts as, so FAT and guesses add up right.
    const name = h('div', {}, nameEdit(ctx, cat.name, 'cat:' + cat.id + ':name', (d, v) => { findCategory(d, r.id).name = v; }, 'Category name'),
      cat.type === 'other' ? categoryTypeSelect(ctx, cat, { label: 'Counts as (so it adds up right)' }) : typeHint(categoryTypeLabel(cat.type), cat.name));
    if (r.notForMe) {
      // Doesn't apply: no amount box (lesson 12), just the answer and a way to change it.
      return h('div', { class: 'qa' }, h('div', { class: 'q' }, name),
        statusPicker(cat.estimate.status, (st) => ctx.update(r.name, (d) => { findCategory(d, r.id).estimate = makeValue(null, { status: st }); }), JSON.stringify(['categories', r.id, 'estimate'])));
    }
    const hint = isRough
      ? null
      : [r.estimate !== null ? 'Estimate ' + money(r.estimate) + (r.pctTakeHome.estimate !== null ? ' (' + pct(r.pctTakeHome.estimate) + ' of take-home)' : '') : null,
        key === 'dreamLong' && r.dream !== null ? 'Short-term dream ' + money(r.dream) : null].filter(Boolean).join('. ') || null;
    // Long term follows how the category is already given: line by line if its estimate or short-term dream is.
    const longByLines = key === 'dreamLong' && cat.dreamLong.amount === null && cat.dreamLong.status !== 'not-for-me' && (r.estimateFrom === 'lines' || r.dreamFrom === 'lines');
    const fromLines = longByLines || (isRough ? r.estimateFrom : r[key + 'From']) === 'lines' || (isRough && cat.split && cat.estimate.status !== 'not-for-me');
    if (fromLines) {
      // Already given line by line: show it, never ask it a second time.
      // Given line by line: each line is asked here (never a second category number).
      const live = cat.lines.filter((l) => l.state !== 'archived' && !(l.addedFor && l.addedFor > doc.currentMonth));
      // The client's own first number, kept as they said it (older files kept it as a note).
      const first = !isRough || !cat.split ? '' : cat.estimate.amount !== null ? 'First guess ' + money(toMonthly(cat.estimate, ctx.payFrequency)) + ' a month.'
        : cat.estimate.note && cat.estimate.note.startsWith('First guess') ? cat.estimate.note.replace(' / month', ' a month') + '.' : '';
      const ideas = isRough ? summary.lineIdeas[cat.id] || [] : [];
      return h('div', { class: 'sub-lines' },
        h('div', { class: 'qa' }, h('div', { class: 'q' }, name, h('div', { class: 'hint' }, [hint, 'Adds up from its sub-categories.', first].filter(Boolean).join(' '))),
          h('span', {}, statusChip(r.status[key]), ' ', h('b', { class: 'num' }, money(r[key])))),
        cat.type === 'health' ? parentsPlanToggle(ctx) : null,
        live.map((l) => {
          const nm = h('div', {}, nameEdit(ctx, l.name, 'line:' + l.id + ':name', (d, v) => renameLine(d, l.id, v), 'Sub-category name'),
            l.type === 'other' ? lineTypeSelect(ctx, l, { label: 'Type' }) : typeHint(lineTypeLabel(l.type), l.name));
          return coveredByParents(doc, l) ? h('div', { class: 'qa' }, h('div', { class: 'q' }, nm), coveredNote())
            : question(ctx, nm, null, ['line', l.id, key], l[key], { label: l.name, parts: true });
        }),
        ideas.length ? h('div', { class: 'tags' }, h('span', { class: 'xs muted' }, 'Ideas:'), ideas.map((n) => h('button', { class: 'tag-chip', onclick: () => {
          let id;
          ctx.update('Add ' + n, (d) => { id = addLine(d, cat.id, n).id; });
          if (id) { ctx.ui.focusPath = ['line', id, key]; ctx.rerender(); }
        } }, '+ ' + n))) : null,
        h('div', { class: 'row' }, addLineButton(ctx, cat.id),
          isRough ? h('button', { class: 'btn small ghost', onclick: () => ctx.update('Use one number', (d) => useOneNumber(d, cat.id, r.estimate)) }, 'Use one number instead') : null));
    }
    const fromPay = r.type === 'health' ? (summary.income.deductionsByKind.health || 0) + (summary.income.deductionsByKind.hsa || 0)
      : r.type === 'transport' ? summary.income.deductionsByKind.transportation : null;
    const payNote = fromPay ? 'Already taken out of the paycheck: ' + money(fromPay) + ' a month. Only count what is paid on top.' : null;
    const planNote = r.type === 'health' && parentsPlanOn(doc) ? 'On a parent\'s plan: count only what is paid out of pocket.' : null;
    return h('div', {},
      question(ctx, name, [hint, payNote, planNote].filter(Boolean).join(' ') || null, ['categories', r.id, key], cat[key], { label: r.name, parts: true }),
      r.type === 'health' ? parentsPlanToggle(ctx) : null,
      isRough && !r.isEverything ? h('div', { class: 'row' }, h('button', { class: 'btn small ghost', 'data-key': 'break:' + r.id, onclick: () => ctx.update('Break down ' + r.name, (d) => breakDown(d, r.id)) }, 'Break down into sub-categories')) : null,
      isRough ? extrasFor(ctx, summary, r) : null);
  }));

  const add = h('button', { class: 'btn', onclick: () => {
    let id;
    ctx.update('Add category', (d) => { id = addCategory(d, 'New category').id; });
    if (id) { ctx.ui.focusKey = 'cat:' + id + ':name'; ctx.rerender(); }
  } }, '+ Add category');
  return h('div', {}, header, isRough ? blindResult(summary) : null, total, list, add,
    h('p', { class: 'muted xs' }, 'Tap any name to rename it. "Break down" turns a category into sub-categories that carry into the Actual pass. Mark any guess "Roughly".'));
}

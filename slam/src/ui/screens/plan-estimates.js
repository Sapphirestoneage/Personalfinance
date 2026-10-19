// Plan, Your estimates (the Rough pass), and Your dream life at the top of Eras (S-097): one number per top-level category.
// Rough also offers: one total instead, labeled guesses, last month's actual,
// the personal correction, and a blind-guess round for revisit sessions.

import { h } from '../dom.js';
import { money, pct, monthLabel, signedMoney } from '../format.js';
import { question, valueInput } from '../components/value-input.js';
import { splitOf } from '../../calc/split.js';
import { statusChip, statusPicker } from '../components/status.js';
import { makeValue } from '../../store/value.js';
import { useSingleTotal, findCategory, findLine, renameLine, startBlindRound, addCategory, addLine, addLines, breakDown, useOneNumber, removeLine, addIncome } from '../../store/edits.js';
import { parseQuickLines } from '../../calc/quick-lines.js';
import { nameEdit } from '../components/name-edit.js';
import { coverageNote } from '../components/coverage.js';
import { parentsPlan, premiumFor, coverageSummary, PREMIUM_LINE_TYPES } from '../../calc/coverage.js';
import { categoryTypeSelect, lineTypeSelect, typeHint } from '../components/type-select.js';
import { categoryTypeLabel, lineTypeLabel } from '../../store/types.js';
import { jumpLink } from '../components/jump.js';
import { lastActual } from '../../calc/history.js';
import { toMonthly } from '../../calc/normalize.js';
import { setPlanAmount } from '../../store/plans.js';
import { nextMonthKey } from '../../store/months.js';

const parentsPlanOn = (doc) => parentsPlan(doc).on;

// Income comes first in Your estimates (S-123): take-home per paycheck is asked here, and only here.
// The pay schedule, gross, and paystub details stay in Setup, Income and paychecks.
function incomeCard(ctx, summary) {
  const incomes = ctx.doc.income.filter((i) => i.state !== 'archived');
  const rowOf = (inc) => summary.income.sources.find((x) => x.id === inc.id) || null;
  return h('div', { class: 'card', id: 'sec-income' }, h('div', { class: 'spread' }, h('h3', {}, 'Take-home pay'), jumpLink(ctx, 'setup:income', 'Pay details in Setup', 'est-income-go')),
    incomes.length ? incomes.map((inc) => {
      const row = rowOf(inc);
      const derived = row && (row.takeHomeStatus === 'guess' || row.takeHomeStatus === 'computed') && inc.takeHome.amount === null;
      return derived || inc.payBasis === 'hourly' || inc.type === 'unemployment'
        ? h('div', { class: 'qa', 'data-key': 'est-income:' + inc.id }, h('div', { class: 'q' }, 'Take-home, ' + inc.label, h('div', { class: 'hint' }, 'Worked out from the paycheck details in Setup.')),
          h('span', { class: 'row' }, statusChip(row ? row.takeHomeStatus : null), ' ', h('b', { class: 'num' }, money(row ? row.takeHomeMonthly : null)), ' a month'))
        : question(ctx, 'Take-home, ' + inc.label, 'Net pay, each paycheck (' + inc.payFrequency + ').',
          ['income', inc.id, 'takeHome'], inc.takeHome, { label: 'Take-home, ' + inc.label, compact: true, typed: 'roughly' });
    }) : h('p', { class: 'small' }, 'No income yet. ',
      h('button', { class: 'btn small', 'data-key': 'est-add-income', onclick: () => ctx.update('Add income', (d) => { addIncome(d, { type: 'w2', label: 'Paycheck' }); }) }, '+ Add a paycheck')));
}

// Surplus first, then allocate it (S-132): the surplus (take-home less spending), the Savings lines
// that allocate it (saving, investing, extra on debt), and what is not allocated yet. Numbers from
// calc/totals.js surplusAllocation; only the allocations are typed.
function surplusHead(ctx, summary) {
  const a = summary.allocation;
  return h('div', { class: 'qa', 'data-key': 'rough-surplus' },
    h('div', { class: 'q' }, 'Surplus', h('div', { class: 'hint' }, a.surplus === null
      ? 'Take-home less your spending estimates. Shows once take-home and a spending estimate are in.'
      : 'Take-home ' + money(a.takeHome) + ' less spending ' + money(a.spending) + '. It can go to saving, investing, or extra on debt.')),
    h('span', { class: 'row' }, a.surplus === null ? null : statusChip('computed'), ' ', h('b', { class: 'num', 'data-key': 'surplus-amount' }, signedMoney(a.surplus)),
      a.surplusRate === null ? null : h('span', { class: 'xs muted', 'data-key': 'surplus-rate-est' }, pct(a.surplusRate) + ' of take-home')));
}

function surplusFoot(ctx, summary) {
  const a = summary.allocation;
  if (a.surplus === null) return null;
  const parts = [['Saving', a.groups.saving], ['Investing', a.groups.investing], ['Extra on debt', a.groups.debt]].filter(([, x]) => x);
  return h('div', { class: 'qa', 'data-key': 'rough-unallocated' },
    h('div', { class: 'q' }, 'Not allocated yet', h('div', { class: 'hint' }, (parts.length ? 'Allocated: ' + parts.map(([k, x]) => k + ' ' + money(x)).join(', ') + '. ' : '') + 'Until it is allocated, it stays surplus.')),
    h('span', { class: 'row' }, statusChip('computed'), ' ', h('b', { class: 'num' + (a.unallocated < 0 ? ' bad' : ''), 'data-key': 'unallocated-amount' }, signedMoney(a.unallocated)),
      a.unallocatedRate === null ? null : h('span', { class: 'xs muted', 'data-key': 'unallocated-rate' }, pct(a.unallocatedRate) + ' of take-home')));
}

// A split line (S-134): with how many other people, and your share (blank = even). The line's amount is
// your part; the whole bill is worked out from it (calc/split.js).
function splitBox(ctx, l, r) {
  const row = r.lines.find((x) => x.id === l.id);
  const sp = splitOf(l, row ? row.estimate : null);
  const box = (field, label, placeholder) => valueInput({ ...ctx, preview: null }, ['line', l.id, field], l[field], { label, cadence: false, placeholder, compact: true });
  return h('div', { class: 'split-box', 'data-key': 'split-box:' + l.id },
    h('div', { class: 'row xs' }, h('span', {}, 'With'), box('splitPeople', l.name + ': how many other people', 'people'), h('span', {}, 'others. Your share'),
      box('splitShare', l.name + ': your share, percent', sp && sp.shareFrom === 'even' ? String(sp.share) : '%'), h('span', {}, '%')),
    sp && sp.share !== null ? h('div', { class: 'xs muted', 'data-key': 'split-hint:' + l.id },
      (sp.shareFrom === 'even' ? 'An even split: ' : 'Your share: ') + sp.share + '%' + (sp.whole !== null ? '. The whole bill is about ' + money(sp.whole, true) + ' a month; you pay ' + money(sp.yours, true) + '.' : '.')) : null);
}

// Health insurance is its own row, apart from Health (gym, therapy, out of pocket). Health coverage in
// Setup owns it (S-117), so here it is the premium and one line, with a link. Under 26 the link asks
// about a parent's plan.
function insuranceRow(ctx) {
  const doc = ctx.doc;
  const prem = premiumFor(doc, ctx.payFrequency);
  const p = parentsPlan(doc);
  const ask = !doc.coverage.how && p.eligible ? 'Under 26: on a parent\'s plan? Set it in Setup' : 'Change in Setup';
  return h('div', { class: 'qa', 'data-key': 'rough-insurance' },
    h('div', { class: 'q' }, 'Health insurance', h('div', { class: 'hint', 'data-key': 'coverage-summary-plan-text' }, coverageSummary(doc, ctx.payFrequency))),
    h('span', { class: 'row' }, prem.amount === null ? null : statusChip('computed'), ' ', h('b', { class: 'num' }, prem.amount === null ? '' : money(prem.amount)),
      jumpLink(ctx, 'setup:coverage', doc.coverage.how ? 'Change in Setup' : ask, 'coverage-summary-plan-go')));
}

// Several sub-categories at once (S-122): "claude 216 spotify 21 youtube 27", with "split" after an
// amount for one split with someone. Parsed in calc/quick-lines.js.
function quickLines(ctx, catId) {
  const add = (input) => {
    const items = parseQuickLines(input.value);
    if (!items.length) return ctx.toast('Type a name and an amount, like Spotify 12');
    ctx.update('Add ' + items.length + (items.length === 1 ? ' line' : ' lines'), (d) => addLines(d, catId, items));
    input.value = '';
    ctx.toast('Added ' + items.map((x) => x.name + (x.amount === null ? '' : ' ' + money(x.amount, true)) + (x.shared ? ' (split)' : '')).join(', '));
  };
  const box = h('input', { type: 'text', class: 'quick-lines', 'data-key': 'quick-lines:' + catId, 'aria-label': 'Add sub-categories: name and amount',
    placeholder: 'Add: claude 216 spotify 21 youtube 27', onkeydown: (e) => { if (e.key === 'Enter') add(e.target); } });
  return h('div', { class: 'row' }, box, h('button', { class: 'btn small', 'data-key': 'quick-lines-add:' + catId, onclick: () => add(box) }, 'Add'),
    h('span', { class: 'xs muted' }, 'Name, then amount a month. Add "split" after one shared with someone.'));
}

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
    ? h('div', { class: 'card' }, h('h2', {}, 'Your estimates: about how much a month?'),
      h('p', { class: 'muted small' }, 'About ten quick questions. One rough number each, a month. Tap a row (or "more") for "don\'t know", "doesn\'t apply", another cadence, or items.'),
      // Other ways to answer wait behind one tap (S-106).
      h('details', { class: 'more-ways' }, h('summary', { class: 'small' }, 'Other ways to answer'), h('div', { class: 'row' },
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
        } }, 'Blind guess (revisit)'))))
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

  // Debt payments is computed from Setup, so it comes last, after Savings (Eli, S-121).
  const ordered = [...rows.filter((r) => !r.isEverything && !r.isDebt), ...rows.filter((r) => r.isDebt)];
  const one = (r) => (r.type === 'health' && isRough ? [insuranceRow(ctx), rowFor(r)] : rowFor(r));
  // Rough (S-123): income first, then spending, and Personal and fun, Giving, and Saving each in a section
  // of its own. Debt payments (computed from Setup) stays last (S-121).
  const SECTIONS = [['fun', 'Personal and fun'], ['giving', 'Giving'], ['savings', 'Surplus']];
  const sectionOf = (r) => (r.isDebt ? 'debt' : r.savings ? 'savings' : r.type === 'fun' || r.type === 'giving' ? r.type : 'spending');
  const list = !isRough ? h('div', { class: 'card' }, ordered.map(one))
    : [incomeCard(ctx, summary), h('div', { class: 'card est-sections' },
      h('div', { id: 'sec-spending' }, h('h3', {}, 'Spending'), ordered.filter((r) => sectionOf(r) === 'spending').map(one)),
      ...SECTIONS.map(([id, title]) => {
        const these = ordered.filter((r) => sectionOf(r) === id);
        // A section of one row named like the section needs no second title.
        const titled = id !== 'savings' && (these.length > 1 || these[0] && these[0].name !== title);
        return these.length ? h('div', { class: 'est-section', id: 'sec-' + id }, titled ? h('h3', {}, title) : null,
          id === 'savings' ? [surplusHead(ctx, summary), these.map(one), surplusFoot(ctx, summary)] : these.map(one)) : null;
      }),
      h('div', { class: 'est-section', id: 'sec-debt' }, ordered.filter((r) => r.isDebt).map(one)))];
  function rowFor(r) {
    if (r.isDebt) {
      // Debts are set up once in Accounts, Credit and debt (S-106, S-137); here they are one line that adds up.
      return h('div', { class: 'qa', 'data-key': 'rough-debts' }, h('div', { class: 'q' }, r.name, h('div', { class: 'hint' }, 'Adds up from Credit and debt in Accounts. Never asked twice.')),
        h('span', { class: 'row' }, statusChip('computed'), ' ', h('b', { class: 'num' }, money(r.estimate)), jumpLink(ctx, 'setup:debts', doc.debts.length ? 'Change in Accounts' : 'Add debts in Accounts', 'rough-debts-go')));
    }
    const cat = findCategory(doc, r.id);
    // Rough (S-106): one amount box per row; the rest opens on a tap of the row or "more".
    const moreKey = 'rough:' + r.id;
    const open = !isRough || ctx.ui.expanded.has(moreKey);
    const toggle = () => { if (ctx.ui.expanded.has(moreKey)) ctx.ui.expanded.delete(moreKey); else ctx.ui.expanded.add(moreKey); ctx.rerender(); };
    const compact = isRough ? { compact: true, open, onMore: toggle, typed: 'roughly' } : {};
    // A category not yet typed asks what it counts as, so FAT and guesses add up right.
    const name = isRough
      ? h('div', { class: 'row-tap', 'data-key': 'rough-name:' + r.id, onclick: toggle }, cat.name,
        open && cat.type === 'other' ? categoryTypeSelect(ctx, cat, { label: 'Counts as (so it adds up right)' }) : null)
      : h('div', {}, nameEdit(ctx, cat.name, 'cat:' + cat.id + ':name', (d, v) => { findCategory(d, r.id).name = v; }, 'Category name'),
        cat.type === 'other' ? categoryTypeSelect(ctx, cat, { label: 'Counts as (so it adds up right)' }) : typeHint(categoryTypeLabel(cat.type), cat.name));
    if (r.notForMe) {
      // Doesn't apply: no amount box (lesson 12), just the answer and a way to change it.
      return h('div', { class: 'qa', 'data-key': isRough ? 'rough-row:' + r.id : null, id: isRough ? 'est-' + r.id : null }, h('div', { class: 'q' }, name),
        statusPicker(cat.estimate.status, (st) => ctx.update(r.name, (d) => { findCategory(d, r.id).estimate = makeValue(null, { status: st }); }), JSON.stringify(['categories', r.id, 'estimate'])));
    }
    const hint = isRough
      ? [r.type === 'health' ? 'Gym, therapy, out of pocket.' : null, r.pctTakeHome.estimate !== null ? pct(r.pctTakeHome.estimate) + ' of take-home.' : null].filter(Boolean).join(' ') || null
      : [r.estimate !== null ? 'Estimate ' + money(r.estimate) + (r.pctTakeHome.estimate !== null ? ' (' + pct(r.pctTakeHome.estimate) + ' of take-home)' : '') : null,
        key === 'dreamLong' && r.dream !== null ? 'Short-term dream ' + money(r.dream) : null].filter(Boolean).join('. ') || null;
    // Long term follows how the category is already given: line by line if its estimate or short-term dream is.
    const longByLines = key === 'dreamLong' && cat.dreamLong.amount === null && cat.dreamLong.status !== 'not-for-me' && (r.estimateFrom === 'lines' || r.dreamFrom === 'lines');
    const fromLines = longByLines || (isRough ? r.estimateFrom : r[key + 'From']) === 'lines' || (isRough && cat.split && cat.estimate.status !== 'not-for-me');
    if (fromLines) {
      // Already given line by line: show it, never ask it a second time.
      // Given line by line: each line is asked here (never a second category number).
      const live = cat.lines.filter((l) => l.state !== 'archived' && !(l.addedFor && l.addedFor > doc.currentMonth) && !(isRough && PREMIUM_LINE_TYPES.includes(l.type)));
      // The client's own first number, kept as they said it (older files kept it as a note).
      const first = !isRough || !cat.split ? '' : cat.estimate.amount !== null ? 'First guess ' + money(toMonthly(cat.estimate, ctx.payFrequency)) + ' a month.'
        : cat.estimate.note && cat.estimate.note.startsWith('First guess') ? cat.estimate.note.replace(' / month', ' a month') + '.' : '';
      const ideas = isRough ? summary.lineIdeas[cat.id] || [] : [];
      const lineMore = (l) => {
        const k = 'rough-line:' + l.id;
        return isRough ? { compact: true, open: ctx.ui.expanded.has(k), typed: 'roughly', onMore: () => { if (ctx.ui.expanded.has(k)) ctx.ui.expanded.delete(k); else ctx.ui.expanded.add(k); ctx.rerender(); } } : {};
      };
      return h('div', { class: 'sub-lines', id: isRough ? 'est-' + r.id : null },
        h('div', { class: 'qa' }, h('div', { class: 'q' }, name, h('div', { class: 'hint' }, [hint, 'Adds up from its sub-categories.', first].filter(Boolean).join(' '))),
          h('span', {}, statusChip(r.status[key]), ' ', h('b', { class: 'num' }, money(r[key])), isRough ? h('button', { class: 'btn small ghost more-ctl', 'data-key': 'rough-more:' + r.id, 'aria-expanded': open ? 'true' : 'false', onclick: toggle }, open ? 'less' : 'more') : null)),
        open && cat.type === 'health' && !isRough ? coverageNote(ctx, 'coverage-summary-plan') : null,
        live.map((l) => {
          const lineOpen = ctx.ui.expanded.has('rough-line:' + l.id);
          // The name is editable once the line is open ("more"), so a closed row stays one line tall.
          const nm = isRough ? h('div', {}, lineOpen ? nameEdit(ctx, l.name, 'line:' + l.id + ':name', (d, v) => renameLine(d, l.id, v), 'Sub-category name') : h('span', { 'data-key': 'line-name:' + l.id }, l.name),
            l.shared ? h('span', { class: 'tag-chip', 'data-key': 'split-tag:' + l.id }, 'split') : null,
            h('button', { class: 'btn small ghost remove-line', 'data-key': 'remove-line:' + l.id, title: 'Remove ' + l.name, 'aria-label': 'Remove ' + l.name, onclick: (e) => { e.stopPropagation(); ctx.update('Remove ' + l.name, (d) => removeLine(d, l.id)); } }, '\u00d7'),
            lineOpen ? h('label', { class: 'check xs' }, h('input', { type: 'checkbox', checked: !!l.shared, 'data-key': 'split:' + l.id, onchange: (e) => ctx.update('Split with someone', (d) => { findLine(d, l.id).line.shared = e.target.checked; }) }), 'Split with someone') : null,
            lineOpen && l.shared ? splitBox(ctx, l, r) : null,
            open && l.type === 'other' ? lineTypeSelect(ctx, l, { label: 'Type' }) : null)
            : h('div', {}, nameEdit(ctx, l.name, 'line:' + l.id + ':name', (d, v) => renameLine(d, l.id, v), 'Sub-category name'),
              l.type === 'other' ? lineTypeSelect(ctx, l, { label: 'Type' }) : typeHint(lineTypeLabel(l.type), l.name));
          // A premium line is owned by health coverage (S-117): its summary, never a question.
          return PREMIUM_LINE_TYPES.includes(l.type) ? h('div', { class: 'qa' }, h('div', { class: 'q' }, nm), h('span', { class: 'small muted' }, money(r.lines.find((x) => x.id === l.id) ? r.lines.find((x) => x.id === l.id)[key] : null), ' from health coverage'))
            : question(ctx, nm, null, ['line', l.id, key], l[key], { label: l.name, parts: true, ...lineMore(l) });
        }),
        !open ? null : ideas.length ? h('div', { class: 'tags' }, h('span', { class: 'xs muted' }, 'Ideas:'), ideas.map((n) => h('button', { class: 'tag-chip', onclick: () => {
          let id;
          ctx.update('Add ' + n, (d) => { id = addLine(d, cat.id, n).id; });
          if (id) { ctx.ui.focusPath = ['line', id, key]; ctx.rerender(); }
        } }, '+ ' + n))) : null,
        !open ? null : isRough ? quickLines(ctx, cat.id) : null,
        !open ? null : h('div', { class: 'row' }, isRough ? null : addLineButton(ctx, cat.id),
          isRough ? h('button', { class: 'btn small ghost', onclick: () => ctx.update('Use one number', (d) => useOneNumber(d, cat.id, r.estimate)) }, 'Use one number instead') : null));
    }
    const fromPay = r.type === 'health' ? (summary.income.deductionsByKind.health || 0) + (summary.income.deductionsByKind.hsa || 0)
      : r.type === 'transport' ? summary.income.deductionsByKind.transportation : null;
    const payNote = fromPay ? 'Already taken out of the paycheck: ' + money(fromPay) + ' a month. Only count what is paid on top.' : null;
    const planNote = r.type === 'health' && parentsPlanOn(doc) ? 'On a parent\'s plan: count only what is paid out of pocket.' : null;
    return h('div', { 'data-key': isRough ? 'rough-row:' + r.id : null, id: isRough ? 'est-' + r.id : null },
      question(ctx, name, [hint, payNote, planNote].filter(Boolean).join(' ') || null, ['categories', r.id, key], cat[key], { label: r.name, parts: true, ...compact }),
      open && r.type === 'health' && !isRough ? coverageNote(ctx, 'coverage-summary-plan') : null,
      open && isRough && !r.isEverything ? h('div', { class: 'row' }, h('button', { class: 'btn small ghost', 'data-key': 'break:' + r.id, onclick: () => ctx.update('Break down ' + r.name, (d) => breakDown(d, r.id)) }, 'Break down into sub-categories')) : null,
      open && isRough ? extrasFor(ctx, summary, r) : null);
  }

  // Categories are added and renamed in Setup, Categories and lines (S-106); the dream entry keeps its own button.
  const add = isRough ? h('p', { class: 'small' }, jumpLink(ctx, 'setup:categories', 'Add or change categories in Setup')) : h('button', { class: 'btn', onclick: () => {
    let id;
    ctx.update('Add category', (d) => { id = addCategory(d, 'New category').id; });
    if (id) { ctx.ui.focusKey = 'cat:' + id + ':name'; ctx.rerender(); }
  } }, '+ Add category');
  return h('div', {}, header, isRough ? blindResult(summary) : null, total, list, add,
    isRough ? null : h('p', { class: 'muted xs' }, 'Tap any name to rename it. Mark any guess "Roughly".'));
}

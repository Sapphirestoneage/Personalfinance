// Future, Eras (parked, S-105): it opens with Your dream life (S-097: the dream entry moved here from the budget
// as it was, then today vs each dream), then potential budgets as life chapters (school abroad, geo arbitrage, a
// sabbatical...) laid end to end like blocks after regular life. Numbers come from buildSummary: summary.dreamLife
// (engines/dream-life.js) and summary.eras (engines/eras.js eraTimeline). The dream entry is plan-estimates.js
// renderEstimates with a dream key; era templates are src/data/era-templates.json through ctx.refs; edits go
// through store/edits.js (addEra, moveEra, removeEra). This screen only asks and words it.

import { cashOnHandNote } from '../components/accounts.js';
import { cashOnHand } from '../../engines/balances.js';
import { h } from '../dom.js';
import { money, signedMoney, monthLabel } from '../format.js';
import { question } from '../components/value-input.js';
import { statusChip } from '../components/status.js';
import { nameEdit } from '../components/name-edit.js';
import { addEra, moveEra, removeEra } from '../../store/edits.js';
import { renderEstimates } from './plan-estimates.js';
import { pct } from '../format.js';

const findEra = (d, id) => d.eras.list.find((e) => e.id === id);
export const eraColor = (i) => 'var(--chart-' + ((i % 7) + 1) + ')';
// Years only for a whole number of years from two up; anything shorter or uneven reads in months.
const span = (n) => (n === 1 ? '1 month' : n < 24 || n % 12 ? n + ' months' : n / 12 + ' years');

function monthsField(ctx, label, era, key, min) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'lbl' }, label),
    h('input', {
      type: 'text',
      inputmode: 'numeric',
      value: String(era[key]),
      style: 'width:6em',
      'data-key': 'era:' + era.id + ':' + key,
      onchange: (e) => {
        const n = Number(e.target.value.trim());
        if (!Number.isInteger(n) || n < min || n > 600) {
          e.target.value = era[key];
          return ctx.toast('Use whole months, ' + min + ' to 600');
        }
        ctx.update(label, (d) => {
          findEra(d, era.id)[key] = n;
        });
      }
    })
  );
}

// The blocks: each era (and any regular life before it) as a width share of the whole span.
export function eraStrip(ctx, s, opts = {}) {
  const t = s.eras;
  if (!t.eras.length) return null;
  const total = t.totalMonths;
  const parts = [];
  t.eras.forEach((e, i) => {
    // A label only fits a wide enough block (8% of the span for regular life, 12% for an era); the title has it either way.
    if (e.gapMonths)
      parts.push(
        h(
          'div',
          { class: 'era-block regular', style: 'flex:' + e.gapMonths, title: 'Regular life, ' + span(e.gapMonths) },
          e.gapMonths / total > 0.08 ? 'Regular' : ''
        )
      );
    parts.push(
      h(
        'button',
        {
          class: 'era-block',
          style: 'flex:' + e.months + ';background:' + eraColor(i),
          title: e.name + ', ' + span(e.months),
          onclick: opts.jump
            ? () => {
                const el = document.getElementById('era-' + e.id);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            : null
        },
        e.months / total > 0.12 ? e.name : ''
      )
    );
  });
  return h(
    'div',
    {},
    h(
      'div',
      {
        class: 'era-strip',
        role: 'img',
        'aria-label': 'Timeline: ' + t.eras.map((e) => e.name + ' ' + span(e.months)).join(', ')
      },
      parts
    ),
    h('div', { class: 'spread xs muted' }, h('span', {}, monthLabel(s.month)), h('span', {}, monthLabel(t.endKey)))
  );
}

function eraCard(ctx, s, e, i, count) {
  const era = findEra(ctx.doc, e.id);
  const t = s.eras;
  const guessHint = (amount, isGuess, what) =>
    isGuess ? 'Blank uses a guess: ' + money(amount) + ' (' + what + ' of today). Type your own.' : null;
  // Both warnings read eraTimeline's fields: runsOut, shortBy, and saveFirstMonths exist only when cash on hand is known;
  // net is null until the era has take-home and spending (its own, or the budget's).
  const warn = [];
  if (e.runsOut)
    warn.push(
      'Cash runs out in ' +
        monthLabel(e.runsOut) +
        ' and dips ' +
        money(e.shortBy) +
        ' below zero.' +
        (e.saveFirstMonths ? ' About ' + span(e.saveFirstMonths) + ' more of regular life first would cover it.' : '')
    );
  if (e.net === null) warn.push('Add take-home and spending (or fill in the budget) to see the money.');
  return h(
    'div',
    { class: 'card era-card', id: 'era-' + e.id, style: 'border-left:6px solid ' + eraColor(i) },
    h(
      'div',
      { class: 'spread' },
      h(
        'h3',
        { style: 'margin:0;flex:1 1 12em' },
        nameEdit(
          ctx,
          era.name,
          'era:' + e.id + ':name',
          (d, v) => {
            findEra(d, e.id).name = v;
          },
          'Era name'
        )
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn small ghost',
            disabled: i === 0 ? true : null,
            'aria-label': 'Move ' + e.name + ' earlier',
            onclick: () => ctx.update('Move earlier', (d) => moveEra(d, e.id, -1))
          },
          'Earlier'
        ),
        h(
          'button',
          {
            class: 'btn small ghost',
            disabled: i === count - 1 ? true : null,
            'aria-label': 'Move ' + e.name + ' later',
            onclick: () => ctx.update('Move later', (d) => moveEra(d, e.id, 1))
          },
          'Later'
        ),
        h(
          'button',
          { class: 'btn small ghost danger', onclick: () => ctx.update('Remove era', (d) => removeEra(d, e.id)) },
          'Remove'
        )
      )
    ),
    h(
      'p',
      { class: 'small' },
      h('b', {}, monthLabel(e.start) + ' to ' + monthLabel(e.end)),
      ' (' + span(e.months) + ')',
      e.about ? h('span', { class: 'muted' }, '. ' + e.about) : null
    ),
    h(
      'div',
      { class: 'grid two' },
      monthsField(ctx, 'How long (months)', era, 'months', 1),
      monthsField(ctx, i === 0 ? 'Starts in (months from now)' : 'Regular life before it (months)', era, 'gapMonths', 0)
    ),
    question(
      ctx,
      'Take-home a month during it',
      guessHint(e.income, e.incomeGuess, 'a share'),
      ['eras', 'list', e.id, 'takeHome'],
      era.takeHome
    ),
    spendFromField(ctx, era, e, s.dreamLife),
    question(
      ctx,
      'Spending a month during it',
      e.spendGuess
        ? guessHint(e.spend, true, 'a share')
        : !e.spendTyped && e.spend !== null
          ? 'Blank starts from ' + SPEND_LABEL[e.spendFrom].toLowerCase() + ': ' + money(e.spend) + '. Type your own.'
          : null,
      ['eras', 'list', e.id, 'spending'],
      era.spending
    ),
    question(ctx, 'One-time costs', e.oneTimeHint || null, ['eras', 'list', e.id, 'oneTime'], era.oneTime, {
      cadence: false,
      parts: true
    }),
    e.net !== null
      ? h(
          'p',
          { class: 'small' },
          e.incomeGuess || e.spendGuess ? statusChip('guess') : null,
          ' ',
          h('b', { class: 'num' }, signedMoney(e.net)),
          ' a month, ',
          h('b', { class: 'num' }, signedMoney(e.total)),
          ' for the whole era' + (e.oneTimeBlank ? ' (one-time costs not entered yet)' : ' with one-time costs') + '. ',
          t.cashKnown
            ? 'Cash ' + money(e.cashStart) + ' at the start, ' + money(e.cashEnd) + ' at the end.'
            : 'Cash changes by ' + signedMoney(e.cashChange) + ' over it.'
        )
      : null,
    warn.map((w) => h('p', { class: 'small warn' }, w))
  );
}

const SPEND_LABEL = {
  template: "The template's share of today",
  today: "Today's budget",
  dream: 'Your short-term dream',
  dreamLong: 'Your long-term dream'
};

// Where the era's blank spending starts (S-097). The template's share is the default; the dream choices need a typed dream life.
function spendFromField(ctx, era, e, dl) {
  const opts = Object.entries(SPEND_LABEL).filter(([k]) => dl.any || (k !== 'dream' && k !== 'dreamLong'));
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'lbl' }, 'Start spending from'),
    h(
      'select',
      {
        'data-key': 'era:' + era.id + ':spendFrom',
        onchange: (ev) =>
          ctx.update('Start spending from', (d) => {
            findEra(d, era.id).spendFrom = ev.target.value;
          })
      },
      opts.map(([k, label]) => h('option', { value: k, selected: (era.spendFrom || 'template') === k }, label))
    )
  );
}

// Today (actual, else the estimate) next to each dream, per category, in dollars and % of take-home.
export function dreamCompare(ctx, dl, opts = {}) {
  if (!dl.any)
    return h(
      'p',
      { class: 'muted small', 'data-key': 'dream-none' },
      'No dream life yet. Type what you would like to spend above.'
    );
  // A dream left blank copies today (a long-term one copies the short term); the cell says "copied" in grey.
  const cell = (amt, share, from) => {
    const copied = from === 'today' || from === 'short';
    return h(
      'td',
      { class: 'num' + (copied ? ' muted' : '') },
      money(amt),
      h('div', { class: 'xs muted' }, copied ? 'copied' : share !== null ? pct(share) : '')
    );
  };
  // Long vs today: a positive gap means the dream spends more than today, the one direction marked bad. Null shows a dot.
  const diff = (x) => h('td', { class: 'num wide' + (x > 0 ? ' bad' : '') }, x === null ? '\u00b7' : signedMoney(x));
  return h(
    'div',
    { id: opts.id || 'dream-compare' },
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'budget tight' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            ['Category', 'Today', 'Short term', 'Long term', 'Long vs today'].map((x, i) =>
              h('th', { class: i === 4 ? 'wide' : null }, x)
            )
          )
        ),
        h(
          'tbody',
          {},
          dl.rows
            .filter((r) => !r.notForMe)
            .map((r) =>
              h(
                'tr',
                { 'data-key': 'dream-row:' + r.id },
                h(
                  'td',
                  {},
                  r.name,
                  r.savings ? h('div', { class: 'xs muted' }, 'savings, not added in') : null,
                  r.todayFrom === 'estimate' ? h('div', { class: 'xs st-guess' }, 'today is the estimate') : null
                ),
                cell(r.today, r.todayShare),
                cell(r.short, r.shortShare, r.shortFrom),
                cell(r.long, r.longShare, r.longFrom),
                r.savings ? h('td', { class: 'wide' }, '') : diff(r.longDiff)
              )
            )
        ),
        h(
          'tfoot',
          {},
          h(
            'tr',
            {},
            h('td', {}, 'Spending'),
            h('td', { class: 'num' }, money(dl.today)),
            h('td', { class: 'num', 'data-key': 'dream-short-total' }, money(dl.shortTotal)),
            h('td', { class: 'num', 'data-key': 'dream-long-total' }, money(dl.longTotal)),
            diff(dl.longDiff)
          )
        )
      )
    ),
    [dl.readings.long, dl.readings.short]
      .filter(Boolean)
      .map((t, i) => h('p', { class: 'small', 'data-key': i === 0 ? 'dream-reading' : null }, t)),
    dl.todayUsesEstimate.length
      ? h(
          'p',
          { class: 'xs muted' },
          'Today uses the estimate where there is no actual yet: ' + dl.todayUsesEstimate.join(', ') + '.'
        )
      : null,
    h(
      'p',
      { class: 'xs muted' },
      'Grey "copied" numbers were left blank: a blank short-term dream copies today, and a blank long-term dream copies the short term.' +
        (dl.hasLong ? '' : ' Switch to Long term above to add a long-term dream.')
    ),
    takesNote(dl)
  );
}

// The pay this dream needs, in short plain sentences: what it spends, what you save today,
// the take-home that covers both, and how that compares with now.
function takesNote(dl) {
  if (dl.pay.needed === null) return null;
  const which = dl.hasLong ? 'long-term' : 'short-term';
  const gap = dl.pay.short;
  return h(
    'div',
    { class: 'small', 'data-key': 'dream-takes' },
    h('b', {}, 'The pay this dream needs'),
    h(
      'p',
      {},
      'Your ' +
        which +
        ' dream spends ' +
        money(dl.longTotal) +
        ' a month. Today you save ' +
        pct(dl.savingsShare) +
        ' of what you bring home. ' +
        'To spend ' +
        money(dl.longTotal) +
        ' and still save ' +
        pct(dl.savingsShare) +
        ', you would need to bring home about ' +
        money(dl.pay.needed) +
        ' a month.'
    ),
    h(
      'p',
      {},
      'You bring home ' +
        money(dl.takeHome) +
        ' now, ' +
        (gap > 0 ? money(gap) + ' short of that.' : gap < 0 ? money(-gap) + ' more than it needs.' : 'exactly that.')
    )
  );
}

export function renderEras(ctx, summary) {
  const doc = ctx.doc;
  const t = summary.eras;
  const templates = (ctx.refs.eraTemplates && ctx.refs.eraTemplates.templates) || [];
  const add = (tpl) => {
    let id;
    ctx.update('Add ' + tpl.name, (d) => {
      id = addEra(d, tpl).id;
    });
    if (id) {
      ctx.ui.focusKey = 'era:' + id + ':name';
      ctx.rerender();
    }
  };
  const dl = summary.dreamLife;
  return h(
    'div',
    {},
    renderEstimates(ctx, summary, ctx.ui.dreamTerm === 'long' ? 'dreamLong' : 'dream'),
    h('div', { class: 'card' }, h('h2', {}, 'Your dream life next to today'), dreamCompare(ctx, dl)),
    h(
      'div',
      { class: 'card' },
      h('h2', {}, 'Eras: potential budgets'),
      h(
        'p',
        { class: 'muted small' },
        "Life in chapters. Today's budget is regular life (" +
          money(t.baseIncome) +
          ' in, ' +
          money(t.baseSpend) +
          ' spent, ' +
          signedMoney(t.baseNet) +
          " a month). Add eras, set how long and when, and move them like blocks. Each era's blanks start from a share of today's numbers, marked as guesses, or spending can start from today or your dream."
      ),
      cashOnHandNote(ctx, cashOnHand(doc)),
      eraStrip(ctx, summary, { jump: true }),
      t.eras.length && t.costVsRegular !== null
        ? h(
            'p',
            { class: 'small' },
            'By ' +
              monthLabel(t.endKey) +
              ' (' +
              span(t.totalMonths) +
              '): ' +
              (t.cashKnown ? 'cash ' + money(t.cashEnd) : signedMoney(t.cashEnd) + ' in cash') +
              ', against ' +
              (t.cashKnown ? money(t.regularEnd) : signedMoney(t.regularEnd)) +
              ' in regular life. ' +
              (t.costVsRegular > 0
                ? 'These eras cost ' + money(t.costVsRegular) + ' of savings.'
                : 'These eras come out ' + money(-t.costVsRegular) + ' ahead.')
          )
        : null
    ),
    t.eras.map((e, i) => eraCard(ctx, summary, e, i, t.eras.length)),
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'field-label' }, 'Add an era'),
      h(
        'div',
        { class: 'tags' },
        templates.map((tpl) =>
          h('button', { class: 'tag-chip', title: tpl.about || '', onclick: () => add(tpl) }, '+ ' + tpl.name)
        )
      )
    )
  );
}

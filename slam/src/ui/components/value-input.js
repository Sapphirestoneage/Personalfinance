// One amount question: number box, cadence picker, status picker, and the
// monthly equivalent. Commits on change; previews on every keystroke.
// Depends on dom.js (h, options), the status chip and picker in status.js,
// toMonthly from the normalize engine for the "= $x / month" line, money and
// cadence labels from format.js, and sumParts / PART_CADENCES from the store
// (re-exported from the engine) for an amount broken into items.

import { h, options } from '../dom.js';
import { statusPicker } from './status.js';
import { toMonthly } from '../../engines/normalize.js';
import { money, CADENCE_LABELS } from '../format.js';
import { sumParts, PART_CADENCES } from '../../store/value.js';

const CADENCES = ['month', 'week', 'paycheck', 'year', 'one-off'];
const CLEARS_AMOUNT = new Set(['not-for-me', 'dont-know']);

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Builds the next Value from a user edit. Typing a number marks it known (or `typed`,
// "roughly" in the Rough pass, S-106) unless the coach already chose "roughly";
// "doesn't apply" and "don't know" clear the number.
export function editValue(prev, change, typed = 'known') {
  const next = { ...prev, ...change, asOf: today() };
  if ('amount' in change) {
    if (change.amount === null) next.status = prev.status === 'roughly' || prev.status === 'known' ? null : prev.status;
    // Only a blank value takes `typed`; a number over a guess, a computed figure, or a non-answer is known.
    else if (
      !prev.status ||
      CLEARS_AMOUNT.has(prev.status) ||
      prev.status === 'guess' ||
      prev.status === 'computed' ||
      prev.status === 'will-email'
    )
      next.status = prev.status ? 'known' : typed;
    // A number typed over a Guess is the client's own: drop the app source and its note.
    if (prev.status === 'guess' && change.amount !== null) {
      next.source = 'client';
      next.note = '';
    }
  }
  if ('parts' in change) {
    if (!change.parts || !change.parts.length) delete next.parts;
    else {
      // Mixed item cadences need a week, month, or year total; anything else becomes a month.
      const mixed = change.parts.some((p) => p.cadence && p.cadence !== prev.cadence);
      const cadence = mixed && !PART_CADENCES[prev.cadence] ? 'month' : prev.cadence;
      return editValue({ ...prev, cadence, parts: change.parts }, { amount: sumParts(change.parts, cadence) });
    }
  }
  if ('cadence' in change && prev.parts && prev.parts.length && PART_CADENCES[change.cadence]) {
    // Items keep what they meant: an item with no cadence of its own was in the old one.
    const parts = prev.parts.map((p) =>
      p.cadence || !PART_CADENCES[prev.cadence] ? p : { ...p, cadence: prev.cadence }
    );
    return { ...next, parts, amount: sumParts(parts, change.cadence) };
  }
  if ('status' in change && CLEARS_AMOUNT.has(change.status)) {
    next.amount = null;
    delete next.parts;
  }
  return next;
}

// "12+30+8.50" adds up, like a calculator. Returns the pieces too.
// Two kinds of "no amount": null is an empty box (nothing entered); undefined is
// text that is not a number, which callers reject and revert.
export function parseAmounts(text) {
  const t = String(text).replace(/[$,\s]/g, '');
  if (t === '') return { amount: null, pieces: [] };
  const pieces = t.split('+').map((x) => (x === '' ? NaN : Number(x)));
  if (pieces.some((n) => !Number.isFinite(n))) return { amount: undefined, pieces: [] };
  return { amount: Math.round(pieces.reduce((a, n) => a + n, 0) * 100) / 100, pieces };
}

export function parseAmount(text) {
  return parseAmounts(text).amount;
}

// Items inside one amount: a name and a number each; the amount is the sum.
function partsEditor(ctx, path, value, label) {
  const key = JSON.stringify(path);
  const parts = value.parts || [];
  const commit = (next, what) => ctx.commit(path, editValue(value, { parts: next }), what || label);
  return h(
    'div',
    { class: 'parts' },
    parts.map((p, i) =>
      h(
        'div',
        { class: 'part' },
        h('input', {
          type: 'text',
          class: 'part-name',
          value: p.name,
          placeholder: 'What is it?',
          'aria-label': label + ' item ' + (i + 1) + ' name',
          'data-key': key + ':part:' + i + ':name',
          onchange: (e) =>
            commit(
              parts.map((x, j) => (j === i ? { ...x, name: e.target.value.trim() } : x)),
              label + ' item name'
            )
        }),
        h('input', {
          type: 'text',
          inputmode: 'decimal',
          class: 'amount part-amount',
          value: p.amount === null ? '' : String(p.amount),
          placeholder: '$',
          'aria-label': label + ' item ' + (i + 1) + ' amount',
          'data-key': key + ':part:' + i + ':amount',
          onchange: (e) => {
            const a = parseAmount(e.target.value);
            if (a === undefined) {
              e.target.value = p.amount === null ? '' : p.amount;
              return;
            }
            commit(
              parts.map((x, j) => (j === i ? { ...x, amount: a } : x)),
              label + ' item amount'
            );
          }
        }),
        h(
          'select',
          {
            class: 'part-cadence',
            'aria-label': label + ' item ' + (i + 1) + ' cadence',
            'data-key': key + ':part:' + i + ':cadence',
            onchange: (e) =>
              commit(
                parts.map((x, j) => (j === i ? { ...x, cadence: e.target.value } : x)),
                label + ' item cadence'
              )
          },
          options(
            [
              ['month', '/ mo'],
              ['year', '/ yr'],
              ['week', '/ wk']
            ],
            p.cadence || (PART_CADENCES[value.cadence] ? value.cadence : 'month')
          )
        ),
        h(
          'button',
          {
            class: 'btn small ghost',
            'aria-label': 'Remove item ' + (p.name || i + 1),
            title: 'Remove',
            onclick: () =>
              commit(
                parts.filter((x, j) => j !== i),
                'Remove item'
              )
          },
          '\u00d7'
        )
      )
    ),
    h(
      'button',
      {
        class: 'btn small ghost',
        'data-key': key + ':add-part',
        onclick: () => commit([...parts, { name: '', amount: null }], 'Add item')
      },
      '+ Add item'
    )
  );
}

// ctx: { commit(path, value, label), preview(path, value), payFrequency }
// opts.compact (S-106): one amount box, its status chip, and a small "more" that
// opens the cadence, status, and items. opts.typed: the status a first number gets.
export function valueInput(ctx, path, value, opts = {}) {
  const key = JSON.stringify(path);
  const label = opts.label || 'Amount';
  const monthly = h('span', { class: 'monthly num' });
  // The conversion is toMonthly (engines/normalize.js). The line stays blank for a monthly amount
  // (it would repeat the box), for a one-off (toMonthly gives 0 there, which would mislead), and
  // when toMonthly has no answer (a paycheck amount with no pay frequency).
  const showMonthly = (v) => {
    const m = toMonthly(v, ctx.payFrequency);
    monthly.textContent =
      v.cadence !== 'month' && m !== null && v.cadence !== 'one-off' ? '= ' + money(m) + ' / month' : '';
  };
  showMonthly(value);
  const split = opts.parts && value.parts && value.parts.length;
  const input = h('input', {
    type: 'text',
    inputmode: 'decimal',
    readonly: split ? true : null,
    title: split ? 'The sum of the items below' : null,
    class: 'amount' + (opts.big ? ' big' : ''),
    'aria-label': label,
    'data-key': key,
    'data-path': key,
    placeholder: opts.placeholder || '$',
    value: value.amount === null ? '' : String(value.amount),
    oninput: (e) => {
      const a = parseAmount(e.target.value);
      if (a === undefined) return;
      const v = editValue(value, { amount: a }, opts.typed);
      showMonthly(v);
      if (ctx.preview) ctx.preview(path, v);
    },
    onchange: (e) => {
      const { amount: a, pieces } = parseAmounts(e.target.value);
      if (a === undefined) {
        e.target.value = value.amount === null ? '' : value.amount;
        return;
      }
      // 12+30+8 in a box that can hold items keeps each number as its own item.
      if (opts.parts && pieces.length > 1)
        return ctx.commit(
          path,
          editValue(value, { parts: pieces.map((n) => ({ name: '', amount: n })) }, opts.typed),
          label
        );
      // Same number, no commit: every commit lands in undo history and restamps asOf.
      if (a === value.amount) return;
      ctx.commit(path, editValue(value, { amount: a }, opts.typed), label);
    }
  });
  const parts = [input];
  if (opts.compact && !opts.open) {
    // The status stays visible (lesson 2); everything else waits behind "more".
    // Tap the chip to change it (S-121): the same picker as under "more".
    parts.push(
      statusPicker(value.status, (s) => ctx.commit(path, editValue(value, { status: s }), label), key),
      monthly
    );
    if (split) parts.push(h('span', { class: 'xs muted' }, value.parts.length + ' items'));
    if (opts.onMore)
      parts.push(
        h(
          'button',
          {
            class: 'btn small ghost more-ctl',
            'data-key': key + ':more',
            'aria-expanded': 'false',
            'aria-label': 'More for ' + label,
            onclick: opts.onMore
          },
          'more'
        )
      );
    return h('div', { class: 'value-input' }, parts);
  }
  // Callers turn the cadence picker off for amounts that are not a rate (a balance, a price, an APR).
  // With items, only the cadences items can total (PART_CADENCES: week, month, year) are offered.
  if (opts.cadence !== false) {
    parts.push(
      h(
        'select',
        {
          class: 'cadence',
          'aria-label': label + ' cadence',
          'data-key': key + ':cadence',
          onchange: (e) => ctx.commit(path, editValue(value, { cadence: e.target.value }), label)
        },
        options(
          (split ? CADENCES.filter((c) => PART_CADENCES[c]) : CADENCES).map((c) => [c, CADENCE_LABELS[c]]),
          value.cadence
        )
      )
    );
  }
  parts.push(statusPicker(value.status, (s) => ctx.commit(path, editValue(value, { status: s }), label), key));
  parts.push(monthly);
  // A Guess carries where its figure came from in `note`; show it beside the chip.
  if (value.status === 'guess' && value.note) parts.push(h('span', { class: 'xs st-guess' }, value.note));
  if (opts.parts && !split && value.status !== 'not-for-me') {
    parts.push(
      h(
        'button',
        {
          class: 'btn small ghost',
          'data-key': key + ':split',
          onclick: () =>
            ctx.commit(
              path,
              editValue(value, {
                parts: [
                  { name: '', amount: value.amount },
                  { name: '', amount: null }
                ]
              }),
              'Break into items'
            )
        },
        '+ Items'
      )
    );
  }
  if (split) parts.push(partsEditor(ctx, path, value, label));
  if (opts.compact && opts.onMore)
    parts.push(
      h(
        'button',
        { class: 'btn small ghost more-ctl', 'data-key': key + ':more', 'aria-expanded': 'true', onclick: opts.onMore },
        'less'
      )
    );
  return h('div', { class: 'value-input' }, parts);
}

// A question row: words on the left, the value input on the right.
export function question(ctx, text, hint, path, value, opts) {
  return h(
    'div',
    { class: 'qa' },
    h('div', { class: 'q' }, h('div', {}, text), hint ? h('div', { class: 'hint' }, hint) : null),
    valueInput(ctx, path, value, { label: text, ...opts })
  );
}

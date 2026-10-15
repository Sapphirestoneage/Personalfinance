// One amount question: number box, cadence picker, status picker, and the
// monthly equivalent. Commits on change; previews on every keystroke.

import { h, options } from '../dom.js';
import { statusPicker } from './status.js';
import { toMonthly } from '../../calc/normalize.js';
import { money, CADENCE_LABELS } from '../format.js';

const CADENCES = ['month', 'week', 'paycheck', 'year', 'one-off'];
const CLEARS_AMOUNT = new Set(['not-for-me', 'dont-know']);

function today() { return new Date().toISOString().slice(0, 10); }

// Builds the next Value from a user edit. Typing a number marks it known unless
// the coach already chose "roughly"; "doesn't apply" and "don't know" clear the number.
export function editValue(prev, change) {
  const next = { ...prev, ...change, asOf: today() };
  if ('amount' in change) {
    if (change.amount === null) next.status = prev.status === 'roughly' || prev.status === 'known' ? null : prev.status;
    else if (!prev.status || CLEARS_AMOUNT.has(prev.status) || prev.status === 'guess' || prev.status === 'computed' || prev.status === 'will-email') next.status = 'known';
    if (prev.status === 'guess' && change.amount !== null) { next.source = 'client'; next.note = ''; }
  }
  if ('status' in change && CLEARS_AMOUNT.has(change.status)) next.amount = null;
  return next;
}

export function parseAmount(text) {
  const t = String(text).replace(/[$,\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

// ctx: { commit(path, value, label), preview(path, value), payFrequency }
export function valueInput(ctx, path, value, opts = {}) {
  const key = JSON.stringify(path);
  const label = opts.label || 'Amount';
  const monthly = h('span', { class: 'monthly num' });
  const showMonthly = (v) => {
    const m = toMonthly(v, ctx.payFrequency);
    monthly.textContent = v.cadence !== 'month' && m !== null && v.cadence !== 'one-off' ? '= ' + money(m) + ' / month' : '';
  };
  showMonthly(value);
  const input = h('input', {
    type: 'text', inputmode: 'decimal', class: 'amount' + (opts.big ? ' big' : ''), 'aria-label': label,
    'data-key': key, 'data-path': key, placeholder: opts.placeholder || '$',
    value: value.amount === null ? '' : String(value.amount),
    oninput: (e) => {
      const a = parseAmount(e.target.value);
      if (a === undefined) return;
      const v = editValue(value, { amount: a });
      showMonthly(v);
      if (ctx.preview) ctx.preview(path, v);
    },
    onchange: (e) => {
      const a = parseAmount(e.target.value);
      if (a === undefined) { e.target.value = value.amount === null ? '' : value.amount; return; }
      if (a === value.amount) return;
      ctx.commit(path, editValue(value, { amount: a }), label);
    }
  });
  const parts = [input];
  if (opts.cadence !== false) {
    parts.push(h('select', {
      class: 'cadence', 'aria-label': label + ' cadence', 'data-key': key + ':cadence',
      onchange: (e) => ctx.commit(path, editValue(value, { cadence: e.target.value }), label)
    }, options(CADENCES.map((c) => [c, CADENCE_LABELS[c]]), value.cadence)));
  }
  parts.push(statusPicker(value.status, (s) => ctx.commit(path, editValue(value, { status: s }), label), key));
  parts.push(monthly);
  if (value.status === 'guess' && value.note) parts.push(h('span', { class: 'xs st-guess' }, value.note));
  return h('div', { class: 'value-input' }, parts);
}

// A question row: words on the left, the value input on the right.
export function question(ctx, text, hint, path, value, opts) {
  return h('div', { class: 'qa' },
    h('div', { class: 'q' }, h('div', {}, text), hint ? h('div', { class: 'hint' }, hint) : null),
    valueInput(ctx, path, value, { label: text, ...opts }));
}

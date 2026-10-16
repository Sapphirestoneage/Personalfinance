// Fill in, pass 8 Eras: potential budgets as life chapters (school abroad,
// geo arbitrage, a sabbatical...) laid end to end like blocks after regular
// life. Numbers come from calc (summary.eras); this screen only asks and words it.

import { h } from '../dom.js';
import { money, signedMoney, monthLabel } from '../format.js';
import { question } from '../components/value-input.js';
import { statusChip } from '../components/status.js';
import { nameEdit } from '../components/name-edit.js';
import { addEra, moveEra, removeEra } from '../../store/edits.js';

const findEra = (d, id) => d.eras.list.find((e) => e.id === id);
export const eraColor = (i) => 'var(--chart-' + ((i % 7) + 1) + ')';
const span = (n) => (n === 1 ? '1 month' : n < 24 || n % 12 ? n + ' months' : n / 12 + ' years');

function monthsField(ctx, label, era, key, min) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label),
    h('input', { type: 'text', inputmode: 'numeric', value: String(era[key]), style: 'width:6em', 'data-key': 'era:' + era.id + ':' + key,
      onchange: (e) => {
        const n = Number(e.target.value.trim());
        if (!Number.isInteger(n) || n < min || n > 600) { e.target.value = era[key]; return ctx.toast('Use whole months, ' + min + ' to 600'); }
        ctx.update(label, (d) => { findEra(d, era.id)[key] = n; });
      } }));
}

// The blocks: each era (and any regular life before it) as a width share of the whole span.
export function eraStrip(ctx, s, opts = {}) {
  const t = s.eras;
  if (!t.eras.length) return null;
  const total = t.totalMonths;
  const parts = [];
  t.eras.forEach((e, i) => {
    if (e.gapMonths) parts.push(h('div', { class: 'era-block regular', style: 'flex:' + e.gapMonths, title: 'Regular life, ' + span(e.gapMonths) }, e.gapMonths / total > 0.08 ? 'Regular' : ''));
    parts.push(h('button', { class: 'era-block', style: 'flex:' + e.months + ';background:' + eraColor(i), title: e.name + ', ' + span(e.months),
      onclick: opts.jump ? () => { const el = document.getElementById('era-' + e.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } : null },
      e.months / total > 0.12 ? e.name : ''));
  });
  return h('div', {},
    h('div', { class: 'era-strip', role: 'img', 'aria-label': 'Timeline: ' + t.eras.map((e) => e.name + ' ' + span(e.months)).join(', ') }, parts),
    h('div', { class: 'spread xs muted' }, h('span', {}, monthLabel(s.month)), h('span', {}, monthLabel(t.endKey))));
}

function eraCard(ctx, s, e, i, count) {
  const era = findEra(ctx.doc, e.id);
  const t = s.eras;
  const guessHint = (amount, isGuess, what) => (isGuess ? 'Blank uses a guess: ' + money(amount) + ' (' + what + ' of today). Type your own.' : null);
  const warn = [];
  if (e.runsOut) warn.push('Cash runs out in ' + monthLabel(e.runsOut) + ' and dips ' + money(e.shortBy) + ' below zero.' +
    (e.saveFirstMonths ? ' About ' + span(e.saveFirstMonths) + ' more of regular life first would cover it.' : ''));
  if (e.net === null) warn.push('Add take-home and spending (or fill in the budget) to see the money.');
  return h('div', { class: 'card era-card', id: 'era-' + e.id, style: 'border-left:6px solid ' + eraColor(i) },
    h('div', { class: 'spread' },
      h('h3', { style: 'margin:0;flex:1 1 12em' }, nameEdit(ctx, era.name, 'era:' + e.id + ':name', (d, v) => { findEra(d, e.id).name = v; }, 'Era name')),
      h('div', { class: 'row' },
        h('button', { class: 'btn small ghost', disabled: i === 0 ? true : null, 'aria-label': 'Move ' + e.name + ' earlier', onclick: () => ctx.update('Move earlier', (d) => moveEra(d, e.id, -1)) }, 'Earlier'),
        h('button', { class: 'btn small ghost', disabled: i === count - 1 ? true : null, 'aria-label': 'Move ' + e.name + ' later', onclick: () => ctx.update('Move later', (d) => moveEra(d, e.id, 1)) }, 'Later'),
        h('button', { class: 'btn small ghost danger', onclick: () => ctx.update('Remove era', (d) => removeEra(d, e.id)) }, 'Remove'))),
    h('p', { class: 'small' }, h('b', {}, monthLabel(e.start) + ' to ' + monthLabel(e.end)), ' (' + span(e.months) + ')', e.about ? h('span', { class: 'muted' }, '. ' + e.about) : null),
    h('div', { class: 'grid two' },
      monthsField(ctx, 'How long (months)', era, 'months', 1),
      monthsField(ctx, i === 0 ? 'Starts in (months from now)' : 'Regular life before it (months)', era, 'gapMonths', 0)),
    question(ctx, 'Take-home a month during it', guessHint(e.income, e.incomeGuess, 'a share'), ['eras', 'list', e.id, 'takeHome'], era.takeHome),
    question(ctx, 'Spending a month during it', guessHint(e.spend, e.spendGuess, 'a share'), ['eras', 'list', e.id, 'spending'], era.spending),
    question(ctx, 'One-time costs', e.oneTimeHint || null, ['eras', 'list', e.id, 'oneTime'], era.oneTime, { cadence: false, parts: true }),
    e.net !== null ? h('p', { class: 'small' },
      (e.incomeGuess || e.spendGuess) ? statusChip('guess') : null, ' ',
      h('b', { class: 'num' }, signedMoney(e.net)), ' a month, ', h('b', { class: 'num' }, signedMoney(e.total)), ' for the whole era' + (e.oneTimeBlank ? ' (one-time costs not entered yet)' : ' with one-time costs') + '. ',
      t.cashKnown ? 'Cash ' + money(e.cashStart) + ' at the start, ' + money(e.cashEnd) + ' at the end.' : 'Cash changes by ' + signedMoney(e.cashEnd - e.cashStart) + ' over it.') : null,
    warn.map((w) => h('p', { class: 'small warn' }, w)));
}

export function renderEras(ctx, summary) {
  const doc = ctx.doc;
  const t = summary.eras;
  const templates = (ctx.refs.eraTemplates && ctx.refs.eraTemplates.templates) || [];
  const add = (tpl) => {
    let id;
    ctx.update('Add ' + tpl.name, (d) => { id = addEra(d, tpl).id; });
    if (id) { ctx.ui.focusKey = 'era:' + id + ':name'; ctx.rerender(); }
  };
  return h('div', {},
    h('div', { class: 'card' }, h('h2', {}, 'Eras: potential budgets'),
      h('p', { class: 'muted small' }, 'Life in chapters. Today\'s budget is regular life (' + money(t.baseIncome) + ' in, ' + money(t.baseSpend) + ' spent, ' + signedMoney(t.baseNet) +
        ' a month). Add eras, set how long and when, and move them like blocks. Each era\'s blanks start from a share of today\'s numbers, marked as guesses.'),
      question(ctx, 'Cash you could put toward these', 'Savings and anything you would use. Followed month by month through every era.', ['eras', 'cashNow'], doc.eras.cashNow, { cadence: false }),
      eraStrip(ctx, summary, { jump: true }),
      t.eras.length && t.costVsRegular !== null ? h('p', { class: 'small' },
        'By ' + monthLabel(t.endKey) + ' (' + span(t.totalMonths) + '): ' + (t.cashKnown ? 'cash ' + money(t.cashEnd) : signedMoney(t.cashEnd) + ' in cash') +
        ', against ' + (t.cashKnown ? money(t.regularEnd) : signedMoney(t.regularEnd)) + ' in regular life. ' +
        (t.costVsRegular > 0 ? 'These eras cost ' + money(t.costVsRegular) + ' of savings.' : 'These eras come out ' + money(-t.costVsRegular) + ' ahead.')) : null),
    t.eras.map((e, i) => eraCard(ctx, summary, e, i, t.eras.length)),
    h('div', { class: 'card' }, h('div', { class: 'field-label' }, 'Add an era'),
      h('div', { class: 'tags' }, templates.map((tpl) => h('button', { class: 'tag-chip', title: tpl.about || '', onclick: () => add(tpl) }, '+ ' + tpl.name)))));
}

// Future, Next stage (parked, S-105): one drastic change (a new job, school, a move)
// that costs money in the short term but is better on other measures.
// Results are in the charts under it on the Future screen.

import { cashOnHandNote } from '../components/accounts.js';
import { cashOnHand } from '../../calc/balances.js';
import { h, options } from '../dom.js';
import { money } from '../format.js';
import { makeValue } from '../../store/value.js';
import { parseAmount } from '../components/value-input.js';
import { question } from '../components/value-input.js';
import { startNextStage, addNextStageItem, removeNextStageItem } from '../../store/edits.js';
import { DEFAULT_METRICS } from '../../calc/next-stage.js';

function numberField(ctx, label, value, set, key) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label),
    h('input', { type: 'text', inputmode: 'decimal', value: value === null || value === undefined ? '' : String(value), 'data-key': key, style: 'width:7em',
      onchange: (e) => {
        const t = e.target.value.trim();
        const n = t === '' ? null : Number(t);
        if (n !== null && !Number.isFinite(n)) return ctx.toast('That needs a number');
        ctx.update(label, (d) => set(d.nextStage, n));
      } }));
}

// A compact box for the disaster or best case lens. Blank means "same as likely".
// The best case is stored under the key "dream" (cases.dream, item.dream): the old
// name, kept so files load unchanged (S-097). On screen "Dream" means only the dream life in Eras.
function lensBox(ctx, label, value, likelyText, onSet, key) {
  const isValue = value && typeof value === 'object';
  const shown = isValue ? value.amount : value;
  return h('input', {
    type: 'text', inputmode: 'decimal', class: 'amount lens', 'aria-label': label + (likelyText ? ' (likely ' + likelyText + ')' : ''), 'data-key': key,
    placeholder: 'same',
    value: shown === null || shown === undefined ? '' : String(shown),
    onchange: (e) => {
      const n = parseAmount(e.target.value);
      if (n === undefined) return ctx.toast('That needs a number');
      ctx.update(label, (d) => onSet(d.nextStage, isValue ? (n === null ? makeValue(null, { cadence: value.cadence }) : makeValue(n, { cadence: value.cadence })) : n));
    }
  });
}

function lensesCard(ctx, ns) {
  const fmt = (v) => (v && typeof v === 'object' ? (v.amount === null ? '' : money(v.amount)) : v === null || v === undefined ? '' : String(v));
  const rows = [
    ['Take-home after the change', 'takeHome'],
    ['Hours worked a week', 'hoursPerWeek'],
    ['Months of lower pay', 'transitionMonths'],
    ['Take-home during those months', 'transitionTakeHome'],
    ['Later pay could rise to', 'laterTakeHome'],
    ['...after this many months', 'laterAfterMonths']
  ];
  const cell = (c, k, label) => h('td', {}, lensBox(ctx, label + ' (' + (c === 'dream' ? 'best case' : c) + ')', ns.cases[c][k], fmt(ns[k]), (s, v) => { s.cases[c][k] = v; }, 'lens-' + c + '-' + k));
  return h('div', { class: 'card' },
    h('h3', {}, 'Three views: disaster, likely, best case'),
    h('p', { class: 'muted xs' }, 'Likely is what you entered above, the directionally correct middle. Fill in only what would be different if it goes badly or great; blanks follow likely.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'budget lenses' },
      h('thead', {}, h('tr', {}, ['', 'Disaster', 'Likely', 'Best case'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map(([label, k]) => h('tr', {}, h('td', {}, label), cell('disaster', k, label), h('td', { class: 'num' }, fmt(ns[k]) || '\u00b7'), cell('dream', k, label)))))));
}

function itemList(ctx, ns, list, title, hint, addLabel, amountLabel) {
  return h('div', { class: 'card' },
    h('h3', {}, title), h('p', { class: 'muted xs' }, hint),
    ns[list].map((it) => h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('input', { type: 'text', value: it.label, placeholder: 'What is it?', 'data-key': 'ns-' + it.id + ':label',
        onchange: (e) => ctx.update('Rename', (d) => { d.nextStage[list].find((x) => x.id === it.id).label = e.target.value; }) })),
      question(ctx, amountLabel, null, ['nextStage', list, it.id, 'amount'], it.amount, { cadence: list !== 'oneOffCosts' }).lastChild,
      h('div', { class: 'row xs muted' }, 'Disaster', lensBox(ctx, (it.label || 'Item') + ' disaster', it.disaster, it.amount.amount === null ? '' : money(it.amount.amount), (s, v) => { s[list].find((x) => x.id === it.id).disaster = v; }, 'lens-disaster-' + it.id),
        'Best case', lensBox(ctx, (it.label || 'Item') + ' best case', it.dream, it.amount.amount === null ? '' : money(it.amount.amount), (s, v) => { s[list].find((x) => x.id === it.id).dream = v; }, 'lens-dream-' + it.id)),
      h('button', { class: 'btn small ghost danger', onclick: () => ctx.update('Remove', (d) => removeNextStageItem(d, list, it.id)) }, 'Remove'))),
    h('button', { class: 'btn small', onclick: () => ctx.update('Add', (d) => { addNextStageItem(d, list); }) }, addLabel));
}

function metricsCard(ctx, ns, summary) {
  const rows = summary.nextStage ? summary.nextStage.metrics : [];
  return h('div', { class: 'card' },
    h('h3', {}, 'The other measures'), h('p', { class: 'muted xs' }, 'Why the change is worth it. Now vs after the change. Add your own.'),
    h('p', { class: 'small muted' }, 'Hours worked come from your income (Actual) and the hours above.'),
    ns.metrics.map((m) => {
      const r = rows.find((x) => x.id === m.id) || {};
      const set = (k) => (doc, v) => { doc.metrics.find((x) => x.id === m.id)[k] = v; };
      return h('div', { class: 'qa' },
        h('div', { class: 'q' }, h('input', { type: 'text', value: m.label, 'data-key': 'met-' + m.id + ':label', onchange: (e) => ctx.update('Rename measure', (d) => set('label')(d.nextStage, e.target.value)) })),
        numberField(ctx, 'Now', m.now, set('now'), 'met-' + m.id + ':now'),
        numberField(ctx, 'Next', m.next, set('next'), 'met-' + m.id + ':next'),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Better is'),
          h('select', { 'data-key': 'met-' + m.id + ':better', onchange: (e) => ctx.update('Measure direction', (d) => set('better')(d.nextStage, e.target.value)) },
            options([['higher', 'Higher'], ['lower', 'Lower']], m.better))),
        r.better === true ? h('span', { class: 'good small' }, 'Better') : r.better === false ? h('span', { class: 'bad small' }, 'Worse') : null,
        h('button', { class: 'btn small ghost danger', onclick: () => ctx.update('Remove measure', (d) => removeNextStageItem(d, 'metrics', m.id)) }, 'Remove'));
    }),
    h('button', { class: 'btn small', onclick: () => ctx.update('Add measure', (d) => { addNextStageItem(d, 'metrics'); }) }, '+ Add a measure'));
}

export function renderNextStage(ctx, summary) {
  const ns = ctx.doc.nextStage;
  if (!ns) {
    return h('div', { class: 'card' },
      h('h2', {}, 'Next stage'),
      h('p', { class: 'muted small' }, 'A big change that costs money in the short term but is better in other ways: a new job, going back to school, moving. Work out what it would take.'),
      h('button', { class: 'btn primary', onclick: () => ctx.update('Start next stage', (d) => { startNextStage(d, DEFAULT_METRICS); }) }, 'Plan a next stage'));
  }
  const n = summary.nextStage;
  return h('div', {},
    h('div', { class: 'card' },
      h('h2', {}, 'Next stage'),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'What is the change?'),
        h('input', { type: 'text', value: ns.name, placeholder: 'e.g. Leave the firm to teach', 'data-key': 'ns-name', style: 'width:100%',
          onchange: (e) => ctx.update('Name the change', (d) => { d.nextStage.name = e.target.value; }) })),
      question(ctx, 'Take-home after the change', 'What would land in the bank each month', ['nextStage', 'takeHome'], ns.takeHome),
      numberField(ctx, 'Hours worked a week after the change', ns.hoursPerWeek, (s, v) => { s.hoursPerWeek = v; }, 'ns-hours'),
      numberField(ctx, 'Months of lower pay while switching (0 if none)', ns.transitionMonths, (s, v) => { s.transitionMonths = v; }, 'ns-tmonths'),
      ns.transitionMonths > 0 ? question(ctx, 'Take-home during those months', '0 if nothing comes in', ['nextStage', 'transitionTakeHome'], ns.transitionTakeHome) : null,
      question(ctx, 'Later, pay could rise to (optional)', 'Take-home once the new path pays off', ['nextStage', 'laterTakeHome'], ns.laterTakeHome),
      ns.laterTakeHome.amount !== null ? numberField(ctx, '...after this many months', ns.laterAfterMonths, (s, v) => { s.laterAfterMonths = v; }, 'ns-later') : null,
      cashOnHandNote(ctx, cashOnHand(ctx.doc))),
    lensesCard(ctx, ns),
    itemList(ctx, ns, 'oneOffCosts', 'One-time costs to make the change', 'Courses, licenses, moving, a gap in benefits.', '+ Add a one-time cost', 'Amount'),
    itemList(ctx, ns, 'costChanges', 'Monthly costs that change', 'More (childcare, a loan) or less (commute, lunches out). Use a minus sign for costs that go down.', '+ Add a cost change', 'Change'),
    metricsCard(ctx, ns, summary),
    n ? h('p', { class: 'small' }, 'So far: needs ', h('b', { class: 'num' }, money(n.cases.disaster.cashNeeded) + ' / ' + money(n.cashNeeded) + ' / ' + money(n.cases.dream.cashNeeded)), ' (disaster / likely / best case) to make the switch. The full picture is in the charts below.') : null,
    h('button', { class: 'btn small ghost danger', onclick: () => { if (confirm('Clear the next stage plan? (Undo works.)')) ctx.update('Clear next stage', (d) => { d.nextStage = null; }); } }, 'Clear this plan'));
}

// Fill in, pass 7 Next stage: one drastic change (a new job, school, a move)
// that costs money in the short term but is better on other measures.
// Results are on Analyze, under Next stage.

import { h, options } from '../dom.js';
import { money } from '../format.js';
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

function itemList(ctx, ns, list, title, hint, addLabel, amountLabel) {
  return h('div', { class: 'card' },
    h('h3', {}, title), h('p', { class: 'muted xs' }, hint),
    ns[list].map((it) => h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('input', { type: 'text', value: it.label, placeholder: 'What is it?', 'data-key': 'ns-' + it.id + ':label',
        onchange: (e) => ctx.update('Rename', (d) => { d.nextStage[list].find((x) => x.id === it.id).label = e.target.value; }) })),
      question(ctx, amountLabel, null, ['nextStage', list, it.id, 'amount'], it.amount, { cadence: list !== 'oneOffCosts' }).lastChild,
      h('button', { class: 'btn small ghost danger', onclick: () => ctx.update('Remove', (d) => removeNextStageItem(d, list, it.id)) }, 'Remove'))),
    h('button', { class: 'btn small', onclick: () => ctx.update('Add', (d) => { addNextStageItem(d, list); }) }, addLabel));
}

function metricsCard(ctx, ns, summary) {
  const rows = summary.nextStage ? summary.nextStage.metrics : [];
  return h('div', { class: 'card' },
    h('h3', {}, 'The other measures'), h('p', { class: 'muted xs' }, 'Why the change is worth it. Now vs after the change. Add your own.'),
    h('p', { class: 'small muted' }, 'Hours worked come from Basics and the hours above.'),
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
      ns.laterTakeHome.amount !== null ? numberField(ctx, '...after this many months', ns.laterAfterMonths, (s, v) => { s.laterAfterMonths = v; }, 'ns-later') : null),
    itemList(ctx, ns, 'oneOffCosts', 'One-time costs to make the change', 'Courses, licenses, moving, a gap in benefits.', '+ Add a one-time cost', 'Amount'),
    itemList(ctx, ns, 'costChanges', 'Monthly costs that change', 'More (childcare, a loan) or less (commute, lunches out). Use a minus sign for costs that go down.', '+ Add a cost change', 'Change'),
    metricsCard(ctx, ns, summary),
    n ? h('p', { class: 'small' }, 'So far: needs ', h('b', { class: 'num' }, money(n.cashNeeded)), ' to make the switch. ',
      h('a', { href: '#analyze', onclick: (e) => { e.preventDefault(); ctx.go('analyze'); setTimeout(() => { const el = document.getElementById('sec-next'); if (el) el.scrollIntoView(); }, 60); } }, 'See the full picture on Analyze')) : null,
    h('button', { class: 'btn small ghost danger', onclick: () => { if (confirm('Clear the next stage plan? (Undo works.)')) ctx.update('Clear next stage', (d) => { d.nextStage = null; }); } }, 'Clear this plan'));
}

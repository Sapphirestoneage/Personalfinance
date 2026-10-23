/* The prep screen (Level 10, MR-053): before each session, in one place: the
   client, the session number and goal, her words, parked items, open loops,
   homework, the account checklist, what is still missing for this session's
   targets, and the proposed block list with anything moved in. Start begins
   the session; an urgent chip begins an urgent one. Coach view only. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { planSession, sessionCount, sessionDef } from '../../engine/curriculum.js';
import { programOf, nextSessionNumber, readiness, checklistFor, homework, parkDone } from '../../engine/program.js';
import { clientName } from '../app.js';
import { introduces } from '../../engine/curriculum.js';
import { headlineIds, lastSnapshot, textOf } from '../../engine/momentum.js';
import { trendLine, defOf } from '../scorebits.js';
import { metricLabel } from '../glossary.js';

export function mount(host, app) {
  const total = sessionCount(app.data);
  const n = app.route.params.id ? Math.max(1, Math.min(total, parseInt(app.route.params.id, 10) || 1)) : Math.min(total, nextSessionNumber(app.record));
  const def = sessionDef(app.data, n);
  host.appendChild(h('header', null, h('h1', null, 'Prepare'), h('span', { class: 'sub' }, (clientName(app.record) || 'Client') + ', session ' + n + ' of ' + total + ': ' + def.name + '.'), h('div', { class: 'actions' },
    h('a', { class: 'btn primary', href: '#/call/' + n }, 'Start the call'),
    h('details', { class: 'more-menu' }, h('summary', { class: 'btn' }, 'More'), h('div', { class: 'more-list' }, n > 1 ? h('a', { class: 'btn', href: '#/prep/' + (n - 1) }, 'Prepare session ' + (n - 1) + ' instead') : null, n < total ? h('a', { class: 'btn', href: '#/prep/' + (n + 1) }, 'Prepare session ' + (n + 1) + ' instead') : null, h('a', { class: 'btn', href: '#/program' }, 'The whole program'))))));
  const grid = h('div', { class: 'grid grid-2' }); const left = h('div', { class: 'stack' }); const right = h('div', { class: 'stack' }); grid.appendChild(left); grid.appendChild(right); host.appendChild(grid);
  function draw() {
    clear(left); clear(right);
    const P = programOf(app.record); const plan = planSession(app.record, app.result, app.data, n); const r = readiness(app.record, app.result, app.data, n); const prev = n > 1 ? readiness(app.record, app.result, app.data, n - 1) : null;
    const hw = homework(app.record, app.result, app.data, n); const list = checklistFor(app.record, app.result, app.data, n);
    /* MR-072: three things, in order: what they owe you, what is missing for today's targets, the open loop to answer first */
    const owed = hw.waiting.map(i => i.name); const missing = r.items.filter(i => !i.met).map(i => i.what); const loop = plan.parked[0] || null;
    left.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Today'), h('p', { class: 'big' }, def.goal), h('p', { class: 'small muted' }, 'Session ' + n + ' of ' + total + (P.nextDate ? ', booked for ' + F.dateLong(P.nextDate) : ''))));
    left.appendChild(h('section', { class: 'panel prep-three' }, h('h2', null, 'Three things'),
      h('ol', { class: 'prep-list' },
        h('li', null, h('strong', null, 'What they owe you: '), owed.length ? owed.join(', ') : 'nothing outstanding'),
        h('li', null, h('strong', null, 'Still missing for today: '), missing.length ? missing.slice(0, 3).join('; ') + (missing.length > 3 ? ' and ' + (missing.length - 3) + ' more' : '') : 'nothing; every target for this session has its facts'),
        h('li', null, h('strong', null, 'Open loop to answer first: '), loop ? h('span', null, loop.text, h('label', { class: 'small', style: { marginLeft: '8px' } }, h('input', { type: 'checkbox', 'aria-label': 'Done: ' + loop.text, onChange: () => { app.mutate(rec => { parkDone(rec, loop.id, true, { session: 's' + n }); }, 'program'); } }), ' done')) : 'none parked')),
      prev && prev.missing.length ? h('p', { class: 'small muted' }, 'Still open from session ' + (n - 1) + ': ' + prev.missing.join(', ') + '.') : null));
    const words = (app.record.discovery && app.record.discovery.words) || [];
    if (words.length) left.appendChild(h('section', { class: 'panel' }, h('h2', null, 'In their words'), h('ul', { class: 'small' }, words.slice(0, 3).map(w => h('li', null, h('em', null, w))))));
    /* the plan, then the counts, behind the three things */
    right.appendChild(h('section', { class: 'panel' }, h('h2', null, 'The plan', h('span', { class: 'tag' }, plan.blocks.length + ' parts, about ' + plan.blocks.reduce((s, b) => s + b.minutes.target, 0) + ' minutes')),
      h('ol', { class: 'plan-list' }, plan.blocks.map(b => h('li', { class: 'prio-' + b.priority + (b.movedIn ? ' moved-in' : '') }, h('span', { class: 'plan-name' }, b.name), h('span', { class: 'small muted' }, ' ' + b.minutes.target + ' min' + (b.movedIn ? ', from session ' + b.from : '') + (b.priority === 'could' ? ', if there is time' : b.priority === 'should' ? ', if we are on time' : ''))))),
      plan.movedOut.length ? h('p', { class: 'small muted' }, 'Not today: ' + plan.movedOut.map(m => m.block.name + ' (session ' + m.to + ')').join(', ') + '.') : null));
    const intro = introduces(app.data, n); const nNew = intro.metrics.length + intro.charts.length;
    const snap = lastSnapshot(app.record);
    right.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Also this session'),
      h('ul', { class: 'small' },
        list.length ? h('li', null, h('a', { href: '#/program' }, 'Accounts: ' + list.filter(i => i.finished).length + ' of ' + list.length + ' done')) : null,
        plan.parked.length > 1 ? h('li', null, (plan.parked.length - 1) + ' more parked ' + (plan.parked.length - 1 === 1 ? 'item' : 'items')) : null,
        nNew ? h('li', null, h('a', { href: '#/measure/unlocks' }, nNew + ' new ' + (nNew === 1 ? 'number or chart' : 'numbers and charts') + ' to show')) : null,
        h('li', null, h('a', { href: '#/scoreboard' }, 'The scoreboard' + (snap ? ', since ' + F.dateLocal(snap.ts) : ''))))));
  }
  draw();
  return { update() { draw(); } };
}

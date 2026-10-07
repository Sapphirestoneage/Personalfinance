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

export function mount(host, app) {
  const total = sessionCount(app.data);
  const n = app.route.params.id ? Math.max(1, Math.min(total, parseInt(app.route.params.id, 10) || 1)) : Math.min(total, nextSessionNumber(app.record));
  const def = sessionDef(app.data, n);
  host.appendChild(h('header', null, h('h1', null, 'Prepare session ' + n), h('span', { class: 'sub' }, (clientName(app.record) || 'Client') + ': ' + def.name + '.'), h('div', { class: 'actions' },
    h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'Which session' }, [n > 1 ? h('a', { class: 'btn small', href: '#/prep/' + (n - 1) }, 'Session ' + (n - 1)) : null, n < total ? h('a', { class: 'btn small', href: '#/prep/' + (n + 1) }, 'Session ' + (n + 1)) : null]),
    h('a', { class: 'btn primary', href: '#/call/' + n }, 'Start session ' + n),
    h('a', { class: 'btn', href: '#/program' }, 'Program'))));
  const grid = h('div', { class: 'grid grid-2' }); const left = h('div', { class: 'stack' }); const right = h('div', { class: 'stack' }); grid.appendChild(left); grid.appendChild(right); host.appendChild(grid);
  function draw() {
    clear(left); clear(right);
    const P = programOf(app.record); const plan = planSession(app.record, app.result, app.data, n); const r = readiness(app.record, app.result, app.data, n); const prev = n > 1 ? readiness(app.record, app.result, app.data, n - 1) : null;
    left.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Today'), h('p', { class: 'big' }, def.goal), h('p', { class: 'small muted' }, 'Session ' + n + ' of ' + total + (P.nextDate ? ', booked for ' + F.dateLong(P.nextDate) : ''))));
    const words = (app.record.discovery && app.record.discovery.words) || [];
    left.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Her words'), words.length ? h('ul', { class: 'small' }, words.slice(0, 5).map(w => h('li', null, h('em', null, w)))) : h('p', { class: 'muted small' }, 'Nothing saved from the first call yet.'), app.record.discovery && app.record.discovery.whyNow ? h('p', { class: 'small' }, 'Why now: ' + app.record.discovery.whyNow) : null));
    left.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Parked and open', h('span', { class: 'tag' }, plan.parked.length + ' parked')),
      plan.parked.length ? h('ul', { class: 'disc-list' }, plan.parked.map(p => h('li', null, h('label', null, h('input', { type: 'checkbox', 'aria-label': 'Done: ' + p.text, onChange: () => { app.mutate(rec => { parkDone(rec, p.id, true, { session: 's' + n }); }, 'program'); } }), ' ' + p.text), p.link ? h('a', { class: 'small', href: p.link, style: { marginLeft: '8px' } }, 'open') : null))) : h('p', { class: 'muted small' }, 'Nothing parked.'),
      prev && prev.missing.length ? h('p', { class: 'small' }, 'Still open from session ' + (n - 1) + ': ' + prev.missing.join(', ') + '.') : null));
    const hw = homework(app.record, app.result, app.data, n); const list = checklistFor(app.record, app.result, app.data, n);
    left.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Accounts', h('span', { class: 'tag' }, list.filter(i => i.finished).length + ' of ' + list.length + ' done')),
      list.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('tbody', null, list.map(i => h('tr', null, h('td', null, i.name, i.rolled ? h('span', { class: 'small muted' }, ' (from session ' + i.session + ')') : null), h('td', null, h('span', { class: 'chip ' + (i.finished ? 'state-known' : i.state.status === 'opened' ? 'state-rough' : 'state-unknown') }, (app.data.accountsChecklist.statuses.find(s => s[0] === i.state.status) || [])[1] || i.state.status)), h('td', { class: 'small muted' }, (app.data.accountsChecklist.who.find(w => w[0] === i.who) || [])[1] || i.who)))))) : h('p', { class: 'muted small' }, 'No account steps this session.'),
      hw.now.length ? h('p', { class: 'small' }, 'Homework out: ' + hw.now.map(i => i.name).join(', ') + (hw.waiting.length ? '; waiting: ' + hw.waiting.map(i => i.name).join(', ') : '') + '.') : null));
    right.appendChild(h('section', { class: 'panel' }, h('h2', null, 'What this session leaves known', h('span', { class: 'tag' }, r.met + ' of ' + r.total + ' already there')),
      r.items.length ? h('ul', { class: 'small readiness' }, r.items.map(i => h('li', { class: i.met ? 'met' : 'open' }, h('span', { class: 'chip ' + (i.met ? 'state-known' : 'state-unknown') }, i.met ? 'Known' : 'Open'), ' ' + i.what))) : h('p', { class: 'muted small' }, 'No targets listed for this session.')));
    right.appendChild(h('section', { class: 'panel' }, h('h2', null, 'The plan', h('span', { class: 'tag' }, plan.blocks.length + ' parts, about ' + plan.blocks.reduce((s, b) => s + b.minutes.target, 0) + ' minutes')),
      h('ol', { class: 'plan-list' }, plan.blocks.map(b => h('li', { class: 'prio-' + b.priority + (b.movedIn ? ' moved-in' : '') }, h('span', { class: 'plan-name' }, b.name), h('span', { class: 'small muted' }, ' ' + b.minutes.target + ' min' + (b.movedIn ? ', from session ' + b.from : '') + (b.priority === 'could' ? ', if there is time' : b.priority === 'should' ? ', if we are on time' : ''))))),
      plan.movedOut.length ? h('p', { class: 'small muted' }, 'Not today: ' + plan.movedOut.map(m => m.block.name + ' (session ' + m.to + ')').join(', ') + '.') : null));
  }
  draw();
  return { update() { draw(); } };
}

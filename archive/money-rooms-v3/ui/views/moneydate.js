/* The money date (Level 12, MR-065): a short call I run, about fifteen
   minutes, once a month, and the maintenance tier after graduation. This
   screen is the prep card and the record: what changed since last month,
   anything stale, the goal dates and promo cliffs coming up, past money
   dates with their one action, and the short summary for the email. Start
   opens the money date curriculum in the session runner. Coach view only;
   the client never has to open the app alone. Views never do math. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { programOf, programMode, moneyDates, moneyDateKey, isGraduated, nextSessionNumber } from '../../engine/program.js';
import { headlineIds, lastSnapshot, textOf, clientSummary } from '../../engine/momentum.js';
import { moneyDateDef } from '../../engine/curriculum.js';
import { moneyDateEmail } from '../../engine/email.js';
import { cachedSensitivity } from '../levers-bridge.js';
import { trendLine, defOf } from '../scorebits.js';
import { metricLabel } from '../glossary.js';
import { clientName } from '../app.js';

const STALE_DAYS = 45;

export function mount(host, app) {
  const name = (clientName(app.record) || 'Client').split(' ')[0]; const def = moneyDateDef(app.data);
  const key = moneyDateKey(app.result.today); const P = programOf(app.record); const running = P.sessions[key] && P.sessions[key].status === 'running';
  host.appendChild(h('header', null, h('h1', null, 'Money date'), h('span', { class: 'sub' }, (def ? def.goal : '') ), h('div', { class: 'actions' },
    h('a', { class: 'btn primary', href: '#/call/' + key }, running ? 'Back into the money date' : 'Start the money date'),
    h('a', { class: 'btn', href: '#/scoreboard' }, 'Scoreboard'),
    h('a', { class: 'btn', href: '#/program' }, 'Program'))));
  const grid = h('div', { class: 'grid grid-2 md-prep' }); host.appendChild(grid);
  const left = h('div', { class: 'stack' }); const right = h('div', { class: 'stack' }); grid.appendChild(left); grid.appendChild(right);
  function draw() {
    clear(left); clear(right);
    const mode = programMode(app.record); const n = nextSessionNumber(app.record);
    left.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Where ' + name + ' is'), h('p', { class: 'big' }, mode === 'maintenance' ? 'Graduated. Monthly money dates from here.' : 'In the program, session ' + Math.min(n, 12) + ' next. A money date fits between sessions when a month goes by.'), h('p', { class: 'small muted' }, def ? def.blocks.map(b => b.name + ' ' + b.minutes.target + ' min').join(' · ') : '')));
    /* what changed since last month */
    const snap = lastSnapshot(app.record); const ids = headlineIds(app.record, app.result, app.data);
    left.appendChild(h('section', { class: 'panel' }, h('h2', null, 'What changed', h('span', { class: 'tag' }, snap ? 'since ' + F.dateLocal(snap.ts) : 'no snapshot yet')),
      h('ul', { class: 'score-list' }, ids.map(id => { const m = app.result.metrics[id]; const ok = m && m.status === 'ok'; return h('li', { class: ok ? '' : 'locked' }, h('span', { class: 'row-label' }, metricLabel(app, defOf(app, id))), h('span', { class: 'row-value' }, ok ? textOf(m) : 'needs inputs'), ok ? h('span', { class: 'row-meta' }, trendLine(app, id)) : null); }))));
    /* stale facts and what is coming */
    const today = new Date(app.result.today); const stale = []; const willSend = [];
    Object.keys(app.record.planets).forEach(p => app.record.planets[p].rows.forEach(r => { Object.keys(r.f).forEach(fid => { const f = r.f[fid]; if (f && f.state === 'will-send') willSend.push((r.nickname || p) + ': ' + fid); }); if (r.asOf && (today - new Date(r.asOf + (r.asOf.length === 7 ? '-01' : ''))) / 86400000 > STALE_DAYS && ['debt', 'invest'].includes(p)) stale.push(r.nickname || p); }));
    const GP = app.result.goalPlan; const soon = []; const horizon = new Date(today); horizon.setMonth(horizon.getMonth() + 2);
    if (GP && GP.input) GP.input.items.forEach(i => { const a = GP.assessment[i.id]; if (i.targetMonth && new Date(i.targetMonth + '-01') <= horizon) soon.push(i.name + ' due ' + F.date(i.targetMonth) + (a && a.status ? ' (' + a.status.replace('-', ' ') + ')' : '')); });
    const cliffs = (app.result.debts || []).filter(d => d.promoEnd && new Date(d.promoEnd + '-01') <= new Date(new Date(today).setMonth(today.getMonth() + 3))).map(d => d.name + ': promo ends ' + F.date(d.promoEnd));
    left.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Before the call'),
      h('ul', { class: 'small' }, [stale.length ? h('li', null, 'Balances older than ' + STALE_DAYS + ' days: ' + stale.join(', ') + '. Ask for today\'s figures or refresh them in the call.') : null, willSend.length ? h('li', null, 'Still to be sent: ' + willSend.slice(0, 4).join(', ') + (willSend.length > 4 ? ' and ' + (willSend.length - 4) + ' more' : '') + '.') : null, soon.length ? h('li', null, 'Goal dates coming up: ' + soon.join('; ') + '.') : null, cliffs.length ? h('li', null, 'Promo cliffs: ' + cliffs.join('; ') + '.') : null].filter(Boolean)),
      !stale.length && !willSend.length && !soon.length && !cliffs.length ? h('p', { class: 'muted small' }, 'Nothing stale, nothing due in the next two months.') : null));
    /* past money dates and the last summary */
    const mds = moneyDates(app.record).slice().reverse();
    right.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Money dates', h('span', { class: 'tag' }, mds.length + (mds.length === 1 ? ' so far' : ' so far'))),
      mds.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Month'), h('th', null, 'Status'), h('th', null, 'The one action'))), h('tbody', null, mds.map(md => h('tr', null, h('td', null, F.date(md.month + '-01')), h('td', null, h('span', { class: 'chip ' + (md.status === 'closed' ? 'state-known' : 'amber') }, md.status === 'closed' ? 'Done' : 'In progress')), h('td', { class: 'wrap small' }, md.action || '')))))) : h('p', { class: 'muted small' }, 'The first money date lands here with its one action.'),
      P.nextDate ? h('p', { class: 'small' }, 'Next booked: ' + F.dateLong(P.nextDate) + '.') : null));
    const sum = clientSummary(app.record, app.result, app.data, cachedSensitivity(app));
    const mail = app.lastMoneyDateEmail || moneyDateEmail(app.record, sum, { nextDate: P.nextDate ? F.dateLong(P.nextDate) : null, action: (mds[0] && mds[0].action) || null });
    right.appendChild(h('section', { class: 'panel' }, h('h2', null, 'The short summary', h('span', { class: 'tag' }, 'for the email')), h('pre', { class: 'md-summary' }, mail), h('div', { class: 'row' }, h('button', { class: 'btn small', onClick: () => { navigator.clipboard && navigator.clipboard.writeText(mail); app.toast('Copied.'); } }, 'Copy'))));
    if (isGraduated(app.record)) right.appendChild(h('p', { class: 'small muted' }, 'Maintenance: snapshots and trends carry on from the program into the money dates; the scoreboard compares against the last one.'));
  }
  draw();
  return { update() { draw(); } };
}

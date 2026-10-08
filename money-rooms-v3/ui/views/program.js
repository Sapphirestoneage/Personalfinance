/* The program view (Level 10, MR-053): one row per session, discovery first,
   urgent sessions in between without breaking the numbering, Flex showing
   what it absorbed; the before-and-after scorecard (printable); the coach-only
   report of how long blocks really take, across clients. Coach view only.
   Views never do math: every figure comes from engine/program.js,
   engine/outcomes.js and engine/curriculum.js. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { programRows, programOf, nextSessionNumber, checklistProgress, programMode, moneyDates } from '../../engine/program.js';
import { beforeAfter, testimonialPrompt } from '../../engine/outcomes.js';
import { blockTimes, sessionCount } from '../../engine/curriculum.js';
import { clientName } from '../app.js';

export function mount(host, app) {
  const n = nextSessionNumber(app.record); const total = sessionCount(app.data); const maintenance = programMode(app.record) === 'maintenance';
  host.appendChild(h('header', { class: 'no-print' }, h('h1', null, maintenance ? 'Maintenance' : 'Program'), h('span', { class: 'sub' }, (clientName(app.record) || 'This client') + (maintenance ? ': graduated; monthly money dates' : ': session ' + Math.min(n, total) + ' of ' + total) + (programOf(app.record).nextDate ? ', next on ' + F.dateLong(programOf(app.record).nextDate) : '')), h('div', { class: 'actions' },
    maintenance ? h('a', { class: 'btn primary', href: '#/money-date' }, 'Prepare the money date') : h('a', { class: 'btn primary', href: '#/prep' }, 'Prepare session ' + n),
    h('button', { class: 'btn', onClick: () => window.print() }, 'Print before and after'))));
  const table = h('section', { class: 'panel no-print' }); const sheet = h('article', { class: 'onepager beforeafter' }); const report = h('section', { class: 'panel no-print' });
  host.appendChild(table); host.appendChild(sheet); host.appendChild(report);
  function draw() {
    clear(table); clear(sheet); clear(report);
    const rows = programRows(app.record, app.result, app.data);
    /* MR-065: after graduation the money dates lead; the numbered sessions stay as the record */
    const mds = rows.filter(r => r.moneyDate);
    if (maintenance || mds.length) table.appendChild(h('section', { class: 'md-list' }, h('h2', null, 'Money dates', h('span', { class: 'tag' }, mds.filter(r => r.status === 'closed').length + ' done')), mds.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data program' }, h('thead', null, h('tr', null, h('th', null, 'Month'), h('th', null, 'Status'), h('th', null, 'The one action'))), h('tbody', null, mds.slice().reverse().map(r => h('tr', { dataset: { session: r.key } }, h('td', null, F.date(r.key.slice(3) + '-01')), h('td', null, h('span', { class: 'chip ' + (r.status === 'closed' ? 'state-known' : 'amber') }, r.status === 'closed' ? 'Done' : 'In progress')), h('td', { class: 'wrap small' }, r.action || '')))))) : h('p', { class: 'muted small' }, 'The first money date lands here. ', h('a', { href: '#/money-date' }, 'Prepare it'))));
    const sessionRows = rows.filter(r => !r.moneyDate);
    table.appendChild(h('h2', null, 'Sessions', h('span', { class: 'tag' }, sessionRows.filter(r => r.n && r.status === 'closed').length + ' of ' + total + ' closed')));
    table.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data program' }, h('thead', null, h('tr', null, h('th', null, 'Session'), h('th', null, 'Name'), h('th', null, 'Status'), h('th', { class: 'hide-narrow' }, 'Date'), h('th', null, 'Targets met'), h('th', { class: 'hide-narrow' }, 'Accounts'), h('th', { class: 'hide-narrow' }, 'Homework done'), h('th', { class: 'num' }, 'Stress'))),
      h('tbody', null, sessionRows.map(r => h('tr', { class: (r.n === null ? 'urgent-row' : '') + (r.status === 'running' ? ' selected' : ''), dataset: { session: r.key } },
        h('td', null, r.label), h('td', { class: 'wrap' }, r.name, r.absorbed && r.absorbed.length ? h('div', { class: 'small muted' }, 'Absorbed: ' + r.absorbed.map(a => a.blockId + ' from session ' + a.from).join(', ')) : null, r.urgent ? h('div', { class: 'small muted' }, r.urgent.notes || '') : null),
        h('td', null, h('span', { class: 'chip ' + (r.status === 'closed' ? 'state-known' : r.status === 'running' ? 'amber' : 'src') }, r.status === 'closed' ? 'Done' : r.status === 'running' ? 'In progress' : 'Planned')),
        h('td', { class: 'small muted hide-narrow' }, r.date ? F.dateLong(r.date) : ''),
        h('td', { class: 'small' }, r.readiness && r.readiness.total ? r.readiness.met + ' of ' + r.readiness.total : ''),
        h('td', { class: 'small hide-narrow' }, r.checklist && r.checklist.total ? r.checklist.done + ' of ' + r.checklist.total : ''),
        h('td', { class: 'small hide-narrow' }, r.homeworkDone ? String(r.homeworkDone) : ''),
        h('td', { class: 'num' }, r.stress !== null && r.stress !== undefined ? String(r.stress) : '')))))));
    /* before and after */
    const rows2 = beforeAfter(app.record, app.result, { money: c => F.dollarsWhole(c), date: d => F.date(d) });
    sheet.appendChild(h('header', { class: 'op-head' }, h('div', null, h('h2', { class: 'op-title' }, (clientName(app.record) || 'Household') + ': before and after'), h('div', { class: 'muted small' }, 'Where things stood on the first call, and where they stand now.')), h('div', { class: 'op-meta' }, F.dateLong(app.result.today))));
    const base = programOf(app.record).baseline;
    if (!base) sheet.appendChild(h('p', { class: 'muted small' }, 'The first-call numbers get saved when the discovery call is saved or session 1 starts.'));
    sheet.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, 'First call'), h('th', { class: 'num' }, 'Now'), h('th', null, ''))), h('tbody', null, rows2.map(r => h('tr', null, h('td', { class: 'wrap' }, r.label), h('td', { class: 'num' }, r.beforeText), h('td', { class: 'num' }, r.nowText), h('td', { class: 'small ' + (r.direction === 'better' ? 'better' : 'muted') }, r.direction === 'better' ? 'better' : r.direction === 'worse' ? 'not yet' : r.direction === 'same' ? 'the same' : '')))))));
    const t = testimonialPrompt(app.record, app.result, (clientName(app.record) || 'you').split(' ')[0]);
    sheet.appendChild(h('section', { class: 'no-print' }, h('h3', null, 'In her words'), h('p', { class: 'small' }, t.ask), programOf(app.record).testimonial ? h('p', null, h('em', null, programOf(app.record).testimonial)) : null));
    /* block times across clients */
    const recs = app.store.list().map(c => app.store.load(c.id)).filter(Boolean);
    const times = blockTimes(recs, app.data);
    report.appendChild(h('h2', null, 'How long blocks really take', h('span', { class: 'tag' }, recs.length + (recs.length === 1 ? ' client' : ' clients'))));
    if (!times.length) report.appendChild(h('p', { class: 'muted small' }, 'Run a session and the minutes land here.'));
    else report.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Block'), h('th', { class: 'num' }, 'Runs'), h('th', { class: 'num' }, 'Median'), h('th', { class: 'num' }, 'Shortest'), h('th', { class: 'num' }, 'Longest'), h('th', { class: 'num' }, 'Planned'))), h('tbody', null, times.slice(0, 30).map(t => h('tr', null, h('td', null, t.name), h('td', { class: 'num' }, String(t.n)), h('td', { class: 'num' }, t.median + ' min'), h('td', { class: 'num' }, t.min + ' min'), h('td', { class: 'num' }, t.max + ' min'), h('td', { class: 'num' }, t.target !== null ? t.target + ' min' : '')))))));
  }
  draw();
  return { update() { draw(); } };
}

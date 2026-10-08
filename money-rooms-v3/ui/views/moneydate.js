/* The money date (Level 12, MR-063): a ten-minute monthly check in five
   steps, run alone or on a short call. How the month felt, the balances
   that changed, anything new, what moved, then a snapshot of every number
   with any rung crossed. Both views; the Client's words are gentle. Views
   never do math: each step reads the record and the computed result. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { recordStress } from '../../engine/program.js';
import { takeSnapshot, celebrate, seedCelebrations, headlineIds, lastSnapshot, textOf } from '../../engine/momentum.js';
import { nextActionCard, trendLine, isClient, defOf, needsOf } from '../scorebits.js';
import { metricLabel } from '../glossary.js';
import { clientName } from '../app.js';
import { PLANET_LABELS } from '../../engine/sun.js';

const STEPS = ['How it felt', 'Balances', 'Anything new', 'What moved', 'Done'];
const BALANCE_FIELDS = { debt: 'balance', invest: 'accountBalance' };

export function mount(host, app) {
  const client = isClient(app); const name = (clientName(app.record) || 'there').split(' ')[0];
  let step = 0; const startedAt = Date.now(); let finished = null;
  host.appendChild(h('header', null, h('h1', null, client ? 'Monthly check' : 'Money date'), h('span', { class: 'sub' }, client ? 'About ten minutes, once a month. Five steps.' : 'Ten minutes, five steps; ends in a snapshot and the one next action.'), h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/scoreboard' }, 'Scoreboard'))));
  const nav = h('ol', { class: 'md-steps', 'aria-label': 'Steps' }); const body = h('section', { class: 'panel md-body' }); const foot = h('div', { class: 'row md-foot' });
  host.appendChild(nav); host.appendChild(body); host.appendChild(foot);
  const monthKey = () => 'md-' + (app.result.today || new Date().toISOString().slice(0, 10)).slice(0, 7);
  function draw() {
    clear(nav); clear(body); clear(foot);
    STEPS.forEach((s, i) => nav.appendChild(h('li', { class: i === step ? 'current' : i < step ? 'done' : '', 'aria-current': i === step ? 'step' : null }, h('span', { class: 'md-num' }, String(i + 1)), ' ', s)));
    const mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    if (step === 0) drawFeel(); else if (step === 1) drawBalances(); else if (step === 2) drawNew(); else if (step === 3) drawMoved(); else drawDone();
    if (step < 4) { foot.appendChild(step > 0 ? h('button', { class: 'btn', onClick: () => { step--; draw(); } }, 'Back') : h('span')); foot.appendChild(h('span', { class: 'small muted' }, mins + (mins === 1 ? ' minute in' : ' minutes in'))); foot.appendChild(h('button', { class: 'btn primary', onClick: () => { step++; draw(); } }, step === 3 ? 'Finish and save' : 'Next')); }
  }
  function drawFeel() {
    const P = app.record.program || {}; const cur = (P.stress || []).find(s => s.session === monthKey());
    body.appendChild(h('h2', null, client ? 'How has money felt this month, ' + name + '?' : 'How has money felt this month?'));
    body.appendChild(h('p', { class: 'small muted' }, '1 is calm, 10 keeps you up at night.'));
    body.appendChild(h('div', { class: 'stress-scale md-scale', role: 'group', 'aria-label': 'Stress score' }, Array.from({ length: 10 }, (_, i) => i + 1).map(n => h('button', { class: 'btn' + (cur && cur.score === n ? ' primary' : ''), 'aria-pressed': String(!!(cur && cur.score === n)), onClick: () => { app.mutate(rec => { recordStress(rec, monthKey(), n, {}); }, 'program'); draw(); } }, String(n)))));
    const prev = (P.stress || []).filter(s => s.session !== monthKey()).slice(-1)[0];
    if (prev) body.appendChild(h('p', { class: 'small muted' }, 'Last time: ' + prev.score + ' of 10.'));
  }
  function drawBalances() {
    body.appendChild(h('h2', null, client ? 'Which balances changed?' : 'Update the balances'));
    body.appendChild(h('p', { class: 'small muted' }, client ? 'Type the number on the statement or the app home screen. Skip anything that did not move.' : 'Debts and accounts; type what the statement says. Each one is logged as a move, not a correction.'));
    const rows = [];
    Object.keys(BALANCE_FIELDS).forEach(p => app.record.planets[p].rows.forEach(r => { const f = r.f[BALANCE_FIELDS[p]]; if (!f || f.state === 'none' || f.state === 'not-applicable' || f.state === 'not-for-me') return; rows.push({ planet: p, row: r, field: BALANCE_FIELDS[p], f }); }));
    if (!rows.length) { body.appendChild(h('p', { class: 'muted' }, 'No debts or accounts with a balance yet. The Ledger is where they start.')); return; }
    body.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data md-balances' }, h('thead', null, h('tr', null, h('th', null, 'Account'), h('th', { class: 'num' }, 'Last'), h('th', null, 'Now'))), h('tbody', null, rows.map(x => {
      const cur = typeof x.f.v === 'number' ? x.f.v : null;
      const input = h('input', { class: 'input num', type: 'text', inputmode: 'decimal', 'aria-label': 'New balance for ' + (x.row.nickname || x.planet), title: 'Type the balance as of today', onChange: e => { const cents = F.parseMoney(e.target.value); if (cents === null || cents === undefined) return; app.setFieldWhy(x.row.id, x.field, cents, typeof cents === 'object' ? 'rough' : 'known', 'client', undefined, 'move'); e.target.value = ''; app.toast((x.row.nickname || 'Balance') + ' updated.'); } });
      return h('tr', null, h('td', null, x.row.nickname || PLANET_LABELS[x.planet], h('span', { class: 'small muted' }, ' ' + (x.row.institution || ''))), h('td', { class: 'num' }, cur !== null ? F.dollarsWhole(cur) : h('span', { class: 'empty-token' }, 'Not entered')), h('td', null, input));
    })))));
  }
  function drawNew() {
    body.appendChild(h('h2', null, client ? 'Anything new?' : 'Anything new this month?'));
    body.appendChild(h('p', { class: 'small muted' }, client ? 'A raise, a new bill, a trip coming up, a fee you noticed. One line is plenty.' : 'A note lands on my plate; a new row belongs in its room.'));
    const input = h('input', { class: 'input wide', type: 'text', 'aria-label': 'What is new' });
    body.appendChild(h('div', { class: 'row' }, input, h('button', { class: 'btn', onClick: () => { const t = input.value.trim(); if (!t) return; app.addQuickNote('Money date: ' + t); input.value = ''; app.toast('Noted.'); } }, 'Add')));
    const notes = (app.record.quickNotes || []).filter(n => /^Money date: /.test(n.text)).slice(-3).reverse();
    if (notes.length) body.appendChild(h('ul', { class: 'small' }, notes.map(n => h('li', null, n.text.replace(/^Money date: /, ''), h('span', { class: 'muted' }, ' ' + F.dateLocal(n.ts))))));
    body.appendChild(h('p', { class: 'small' }, h('a', { href: '#/ledger/spending/line' }, client ? 'Add a new bill in Spending' : 'Open Spending'), ' · ', h('a', { href: '#/ledger/income' }, client ? 'A change in pay' : 'Open Income')));
  }
  function drawMoved() {
    body.appendChild(h('h2', null, client ? 'What moved since last time' : 'What moved'));
    const last = lastSnapshot(app.record);
    body.appendChild(h('p', { class: 'small muted' }, last ? 'Compared with ' + F.dateLocal(last.ts) + '.' : (client ? 'This is your first check, so there is nothing to compare yet. Next month there will be.' : 'First snapshot: nothing to compare yet.')));
    const ids = headlineIds(app.record, app.result, app.data);
    body.appendChild(h('ul', { class: 'score-list md-moved' }, ids.map(id => { const def = defOf(app, id); const m = app.result.metrics[id]; const ok = m && m.status === 'ok'; return h('li', { class: ok ? '' : 'locked' }, h('span', { class: 'row-label' }, metricLabel(app, def)), h('span', { class: 'row-value' }, ok ? textOf(m) : (client ? 'not yet' : 'needs ' + needsOf(m)[0])), ok ? h('span', { class: 'row-meta' }, trendLine(app, id)) : null); })));
  }
  function drawDone() {
    if (!finished) {
      /* the flag is set before the save, because the save re-renders this step */
      const now = new Date().toISOString(); finished = { at: now, cheers: [], mins: Math.max(1, Math.round((Date.now() - startedAt) / 60000)) };
      app.mutate(rec => { const seeded = seedCelebrations(rec, app.result, app.data, { now, session: monthKey() }); finished.cheers = seeded.length ? [] : celebrate(rec, app.result, app.data, { now, session: monthKey() }); takeSnapshot(rec, app.result, 'money-date', { now, session: monthKey() }); }, 'snapshot');
      clear(body); /* the save redrew; draw once more with the crossings known */
    }
    body.appendChild(h('h2', null, client ? 'Done, ' + name + '.' : 'Saved.'));
    body.appendChild(h('p', { class: 'read-aloud' }, (client ? 'That took about ' : 'About ') + finished.mins + (finished.mins === 1 ? ' minute. ' : ' minutes. ') + (client ? 'Every number now has a fresh reading, and next month shows what moved.' : 'Every metric is snapshotted; the scoreboard compares against it from now.')));
    if (finished.cheers.length) body.appendChild(h('div', { class: 'cheer md-cheer' }, h('h3', null, client ? 'Worth marking' : 'Milestones crossed'), h('ul', null, finished.cheers.map(c => h('li', null, c.text)))));
    body.appendChild(nextActionCard(app));
    body.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } }, h('a', { class: 'btn primary', href: '#/scoreboard' }, client ? 'See your scoreboard' : 'Open the scoreboard'), h('a', { class: 'btn', href: '#/onepager' }, 'One-pager')));
  }
  draw();
  return { update() { draw(); } };
}

/* What matters, move money (MR-101): a from, a to, a slider, and a live preview of the FI date, hours of work, alignment and share of income. Saved as a scenario list or a planned change; the spending rows never change. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { segmented } from '../seg.js';
import * as Mt from '../../engine/matters.js';
import { money, pct, field, cellOf } from './matters-bits.js';

/* ---- move money ---- */
export function draw(ctx, R) {
  const { app, body, coach, listId, commit, M, draw } = ctx; const moveState = ctx.state.move;
  const panel = h('section', { class: 'panel matters-move' }); body.appendChild(panel);
  panel.appendChild(h('h2', null, 'Move money', h('span', { class: 'tag' }, 'a preview; the spending rows never change')));
  const froms = [['untied', Mt.UNTIED + (R.untied.cents !== null ? ', ' + money(R.untied.cents) : '')]].concat(R.priorities.filter(l => l.tied.cents > 0).map(l => [l.id, l.title + ', ' + money(l.tied.cents)]));
  const tos = R.positives.map(l => [l.id, l.title]).concat([['saved', 'Saved, not spent']]);
  if (!moveState.fromId) moveState.fromId = froms[0][0]; if (!moveState.toId) moveState.toId = tos.length ? tos[0][0] : 'saved';
  const fromTied = moveState.fromId === 'untied' ? (R.untied.cents || 0) : ((R.priorities.find(l => l.id === moveState.fromId) || { tied: { cents: 0 } }).tied.cents);
  if (moveState.cents > fromTied) moveState.cents = fromTied;
  const form = h('div', { class: 'move-form' },
    field('From', h('select', { class: 'select', 'aria-label': 'Move from', onChange: e => { moveState.fromId = e.target.value; moveState.cents = 0; draw(); } }, froms.map(([id, lab]) => h('option', { value: id, selected: id === moveState.fromId }, lab)))),
    field('To', h('select', { class: 'select', 'aria-label': 'Move to', onChange: e => { moveState.toId = e.target.value; draw(); } }, tos.map(([id, lab]) => h('option', { value: id, selected: id === moveState.toId }, lab)))),
    field('A month', h('span', { class: 'row' }, h('input', { type: 'range', class: 'slider', min: 0, max: Math.max(0, fromTied), step: 500, value: moveState.cents, 'aria-label': 'Amount to move a month', onInput: e => { moveState.cents = parseInt(e.target.value, 10); updatePreview(); } }), h('input', { class: 'input num', type: 'text', inputmode: 'decimal', 'aria-label': 'Amount to move a month, exact', value: F.dollars(moveState.cents, { plain: true }).replace('$', ''), onChange: e => { const v = F.parseMoney(e.target.value); if (v === null) return; moveState.cents = Math.max(0, Math.min(fromTied, v)); draw(); } }))));
  panel.appendChild(form);
  const previewHost = h('div', { class: 'move-preview' }); panel.appendChild(previewHost);
  function updatePreview() {
    clear(previewHost); const P = Mt.previewMove(app.record, app.result, app.data, { fromId: moveState.fromId, toId: moveState.toId, cents: moveState.cents }, { listId });
    if (P.needs) { previewHost.appendChild(h('p', { class: 'muted small' }, 'Needs ' + P.needs.join(', ') + '.')); return; }
    const line = (label, before, after) => h('tr', null, h('td', null, label), h('td', { class: 'num' }, before), h('td', { class: 'num' }, after));
    const sh = s => s === null ? '' : pct(s); const hrs = x => x === null ? '' : F.hours(x) + ' a month';
    previewHost.appendChild(h('table', { class: 'data preview' }, h('thead', null, h('tr', null, h('th', null, money(P.amount) + ' a month'), h('th', { class: 'num' }, 'Now'), h('th', { class: 'num' }, 'After'))), h('tbody', null,
      line(P.from.title + ', a month', money(P.from.before.tied), money(P.from.after.tied)), line(P.from.title + ', of take-home', sh(P.from.before.shareTake), sh(P.from.after.shareTake)), line(P.from.title + ', hours of work', hrs(P.from.before.hours), hrs(P.from.after.hours)),
      line(P.to.title + ', a month', money(P.to.before.tied), money(P.to.after.tied)), line(P.to.title + ', of take-home', sh(P.to.before.shareTake), sh(P.to.after.shareTake)), line(P.to.title + ', hours of work', hrs(P.to.before.hours), hrs(P.to.after.hours)),
      line('Alignment, top 5', P.alignment.before === null ? 'opens when ' + P.alignment.needs.join(' and ') : pct(P.alignment.before), P.alignment.after === null ? '' : pct(P.alignment.after)),
      line('FI date', '', P.fi.deltaMonths === null ? (P.fi.needs.length ? 'needs ' + P.fi.needs.join(', ') : '') : (P.fi.deltaMonths > 0 ? F.months(P.fi.deltaMonths) + ' sooner' : P.fi.deltaMonths < 0 ? F.months(-P.fi.deltaMonths) + ' later' : 'no change')))));
    if (P.fi.note) previewHost.appendChild(h('p', { class: 'small muted' }, P.fi.note));
    if (coach && P.amount > 0) previewHost.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn', onClick: () => { commit(Mx => { Mt.saveMove(Mx, { fromId: moveState.fromId, toId: moveState.toId, cents: P.amount, fromTitle: P.from.title, toTitle: P.to.title, at: app.result.today, name: P.from.title + ' to ' + P.to.title }, 'scenario'); }); app.toast('Saved as a scenario list.'); } }, 'Save as a scenario list'), h('button', { class: 'btn primary', onClick: () => { commit(Mx => { Mt.saveMove(Mx, { fromId: moveState.fromId, toId: moveState.toId, cents: P.amount, fromTitle: P.from.title, toTitle: P.to.title, at: app.result.today }, 'planned'); }); app.toast('Planned. The spending rows stay as they are.'); } }, 'Apply as a planned change')));
  }
  updatePreview();
  const moves = M().moves;
  panel.appendChild(h('h3', null, 'Planned and saved moves'));
  panel.appendChild(moves.length ? h('ul', { class: 'matters-list moves' }, moves.map(m => h('li', { dataset: { move: m.id } }, money(m.cents) + ' a month from ' + m.fromTitle + ' to ' + m.toTitle + (m.as === 'scenario' ? ' (scenario list)' : ' (planned)'), coach ? h('button', { class: 'btn small quiet', onClick: () => commit(Mx => { Mt.removeMove(Mx, m.id); }) }, 'Remove') : null))) : h('p', { class: 'muted small' }, 'None yet.'));
}


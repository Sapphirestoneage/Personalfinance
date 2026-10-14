/* What matters, the lists tab (MR-102): mine, a partner's, a future self, a scenario; any two side by side. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { segmented } from '../seg.js';
import * as Mt from '../../engine/matters.js';
import { money, pct, field, cellOf } from './matters-bits.js';

/* ---- lists ---- */
export function draw(ctx, R) {
  const { app, body, coach, listId, commit, M, draw } = ctx; let compareB = ctx.state.compareB;
  const panel = h('section', { class: 'panel matters-lists' }); body.appendChild(panel);
  const lists = M().lists;
  panel.appendChild(h('h2', null, 'Lists', h('span', { class: 'tag' }, lists.length + (lists.length === 1 ? ' list' : ' lists'))));
  panel.appendChild(h('ul', { class: 'matters-list' }, lists.map(l => h('li', { dataset: { list: l.id } }, h('a', { href: '#/matters/list/' + l.id }, l.name), h('span', { class: 'small muted' }, ' ' + Mt.LIST_KINDS.find(k => k[0] === l.kind)[1].toLowerCase() + (l.futureAge ? ', at ' + l.futureAge : '') + (l.linkedBlockId ? ', tied to a life block' : '') + (l.baseListId ? ', overrides on ' + ((lists.find(x => x.id === l.baseListId) || {}).name || 'the base') : '')), l.id !== 'mine' && coach ? h('button', { class: 'btn small quiet', onClick: () => { commit(Mx => { Mt.removeList(Mx, l.id); }); if (listId === l.id) app.go('#/matters/lists'); } }, 'Remove') : null))));
  if (coach) {
    let kind = 'partner'; let age = ''; let name = '';
    const ageBox = h('input', { class: 'input num', type: 'text', inputmode: 'numeric', 'aria-label': 'Future age', value: '', hidden: '', onChange: e => { age = e.target.value; } });
    panel.appendChild(h('div', { class: 'row add-list' }, h('select', { class: 'select', 'aria-label': 'List kind', onChange: e => { kind = e.target.value; ageBox.hidden = kind !== 'future'; } }, Mt.LIST_KINDS.filter(k => k[0] !== 'mine').map(([id, lab]) => h('option', { value: id }, lab))), h('input', { class: 'input', 'aria-label': 'List name', value: '', onChange: e => { name = e.target.value.trim(); } }), ageBox,
      h('button', { class: 'btn primary', onClick: () => { const a = parseInt(age, 10); let made = null; commit(Mx => { made = Mt.addList(Mx, kind, name || (kind === 'future' && Number.isFinite(a) ? 'Me at ' + a : null), { futureAge: Number.isFinite(a) ? a : null }).id; }); app.go('#/matters/list/' + made); } }, 'Add the list')));
  }
  if (lists.length > 1) {
    const B = compareB && lists.find(l => l.id === compareB) ? compareB : lists.find(l => l.id !== listId).id; compareB = B; ctx.state.compareB = B;
    panel.appendChild(h('h3', null, 'Side by side'));
    panel.appendChild(h('div', { class: 'row' }, h('span', null, R.list.name), h('span', { class: 'small muted' }, 'against'), segmented(lists.filter(l => l.id !== listId).map(l => [l.id, l.name]), B, id => { ctx.state.compareB = id; draw(); }, { label: 'Compare with', small: true })));
    const C = Mt.compareLists(M(), listId, B, R);
    panel.appendChild(h('p', { class: 'small muted' }, C.agree + ' agree, ' + C.disagree + ' far apart, ' + C.onlyA + ' only on ' + R.list.name + ', ' + C.onlyB + ' only on ' + lists.find(l => l.id === B).name + '.'));
    const cell = cellOf;
    panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data stack compare' }, h('thead', null, h('tr', null, h('th', null, 'Priority'), h('th', { class: 'num' }, R.list.name), h('th', { class: 'num' }, lists.find(l => l.id === B).name), h('th', null, 'Read'), h('th', { class: 'num' }, 'From shared money'))),
      h('tbody', null, C.rows.map(r => h('tr', { class: 'v-' + r.verdict.replace(' ', '-') }, cell('Priority', 'what', r.title), cell(R.list.name, 'num', r.rankA === null ? '' : '#' + r.rankA), cell(lists.find(l => l.id === B).name, 'num', r.rankB === null ? '' : '#' + r.rankB), cell('Read', '', r.verdict === 'agree' ? 'agree' : r.verdict === 'close' ? 'close' : r.verdict === 'disagree' ? 'far apart' : r.verdict), cell('From shared money', 'num', r.fromShared ? money(r.fromShared) : '')))))));
    if (C.sharedFunded.length) panel.appendChild(h('p', { class: 'small muted' }, 'Shared priorities funded by joint money: ' + C.sharedFunded.map(r => r.title + ' ' + money(r.fromShared)).join(', ') + '.'));
  }
}


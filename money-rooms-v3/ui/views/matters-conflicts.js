/* What matters, the conflicts tab (MR-100): declared, flagged by the numbers, suggested from the library; each resolved by picking one, sequencing them (which can become a life block), or keeping both. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { segmented } from '../seg.js';
import * as Mt from '../../engine/matters.js';
import { money, pct, field, cellOf } from './matters-bits.js';
import { newBlock } from '../../engine/scenarios.js';
/* ---- conflicts ---- */
export function draw(ctx, R) {
  const { app, body, coach, listId, commit, M, draw } = ctx;
  const panel = h('section', { class: 'panel matters-conflicts' }); body.appendChild(panel);
  const C = R.conflicts; const byId = {}; R.priorities.forEach(l => { byId[l.id] = l; });
  panel.appendChild(h('h2', null, 'Conflicts', h('span', { class: 'tag' }, (C.declared.length + C.flagged.length) + ' to resolve, ' + C.suggested.length + ' suggested')));
  const resolver = (key, res, ids) => {
    const choices = [['pick', 'Pick one'], ['sequence', 'Sequence them'], ['both', 'Keep both']];
    const box = h('div', { class: 'resolve' });
    box.appendChild(segmented(choices, res ? res.choice : null, v => commit(Mx => { Mt.resolveConflict(Mx, key, { choice: v, keepId: null, firstId: null, laterYear: null }); }), { label: 'How to resolve ' + key, small: true }));
    if (res && res.choice === 'pick') box.appendChild(h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Keep'), segmented(ids.map(id => [id, byId[id] ? byId[id].title : id]), res.keepId, id => commit(Mx => { Mt.resolveConflict(Mx, key, Object.assign({}, res, { keepId: id })); }), { label: 'Which to keep', small: true })));
    if (res && res.choice === 'sequence') {
      const year0 = app.result.projectionInputs ? app.result.projectionInputs.year + 1 : parseInt(app.result.today.slice(0, 4), 10) + 1;
      box.appendChild(h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'First'), segmented(ids.map(id => [id, byId[id] ? byId[id].title : id]), res.firstId, id => commit(Mx => { Mt.resolveConflict(Mx, key, Object.assign({}, res, { firstId: id })); }), { label: 'Which comes first', small: true })));
      box.appendChild(h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'The other one from'), h('input', { class: 'input num year', type: 'text', inputmode: 'numeric', 'aria-label': 'Year the later one starts', value: res.laterYear || year0 + 5, onChange: e => { const y = parseInt(e.target.value, 10); if (Number.isFinite(y)) commit(Mx => { Mt.resolveConflict(Mx, key, Object.assign({}, res, { laterYear: y })); }); } }),
        res.firstId && !res.blockId ? h('button', { class: 'btn small primary', onClick: () => makeBlock(key, res, ids) }, 'Make it a life block') : (res.blockId ? h('a', { class: 'btn small', href: '#/scenarios' }, 'See the block') : null)));
    }
    if (res && res.choice === 'both') box.appendChild(h('p', { class: 'small muted' }, 'Both stay. The cost shown stands: ' + ids.map(id => byId[id] ? byId[id].title + (byId[id].declaredMonthly !== null ? ' ' + money(byId[id].declaredMonthly) + ' a month' : '') : id).join(', ') + '.'));
    return box;
  };
  const makeBlock = (key, res, ids) => {
    const laterId = ids.find(id => id !== res.firstId); const later = byId[laterId]; if (!later) return;
    const defs = app.data.scenarioBlocks; const b = newBlock('priority', defs, res.laterYear || (app.result.projectionInputs ? app.result.projectionInputs.year + 6 : 2032));
    b.name = later.title + ', later'; b.answers.oneOff = later.oneTime || 0; b.answers.monthly = later.declaredMonthly || 0; b.answers.years = 10;
    app.mutate(rec => { rec.scenarios.push(b); }, 'scenarios');
    commit(Mx => { Mt.resolveConflict(Mx, key, Object.assign({}, res, { blockId: b.id })); });
    app.toast('A life block, ' + b.name + ', is on the simulator.');
  };
  const card = (c, ids, kindLabel, extra) => h('div', { class: 'conflict-card', dataset: { conflict: c.key } }, h('div', { class: 'row' }, h('strong', null, ids.map(id => byId[id] ? byId[id].title : id).join(' and ')), h('span', { class: 'chip src' }, kindLabel)), h('p', { class: 'small muted' }, c.why || ''), extra || null, coach ? resolver(c.key, c.resolution, ids) : (c.resolution ? h('p', { class: 'small' }, 'Decided: ' + c.resolution.choice + (c.resolution.keepId && byId[c.resolution.keepId] ? ', keep ' + byId[c.resolution.keepId].title : '') + '.') : null));
  const sec = (title, list, empty) => { panel.appendChild(h('h3', null, title)); if (!list.length) panel.appendChild(h('p', { class: 'muted small' }, empty)); list.forEach(x => panel.appendChild(x)); };
  sec('Declared', C.declared.map(c => card(c, [c.a, c.b], c.kind + (c.origin === 'client declared' ? '' : ', confirmed'), null)), 'None drawn yet. The Connect step draws them.');
  sec('Flagged by the numbers', C.flagged.map(c => card(c, c.ids, c.kind, h('p', { class: 'small' }, c.kind === 'money' ? 'Together these cost ' + money(c.total) + ' a month against a surplus of ' + money(c.surplus) + ': ' + money(c.over) + ' a month over.' : c.claimed + ' hours a week asked for, ' + c.available + ' available: ' + c.over + ' over.'))), C.needs.money.length && C.needs.time.length ? 'Opens when ' + C.needs.money.concat(C.needs.time).join(' and ') + '.' : 'Nothing over the line: the costed priorities fit the surplus and the hours fit the week.');
  sec('Suggested, for the client to confirm', C.suggested.map(s => h('div', { class: 'conflict-card suggested', dataset: { suggest: s.key } }, h('div', { class: 'row' }, h('strong', null, s.aTitle + ' and ' + s.bTitle), h('span', { class: 'chip src' }, s.kind + ', suggested')), h('p', { class: 'small muted' }, s.why), coach ? h('div', { class: 'row' }, h('button', { class: 'btn small primary', onClick: () => commit(Mx => { Mt.confirmSuggestion(Mx, s); }) }, 'Yes, that is one'), h('button', { class: 'btn small quiet', onClick: () => commit(Mx => { Mt.dismissSuggestion(Mx, s); }) }, 'No')) : null)), 'Nothing from the library matches these titles.');
}


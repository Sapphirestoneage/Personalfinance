/* What matters (MR-098): the values audit, in the Sun. One screen, six tabs:
   the priorities (five steps: dump, rank, price, tag, connect), the money,
   the conflicts, move money, the lists, the pictures. Every number comes
   from engine/matters.js; this file only draws and commits. Coach view edits;
   Client view reads the same in words. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import * as Charts from '../charts.js';
import { ALL_CHARTS as CHARTS } from '../../engine/charts-all.js';
import { segmented } from '../seg.js';
import { fold } from '../fold.js';
import * as Mt from '../../engine/matters.js';
import { money, pct, field } from './matters-bits.js';
import * as MoneyTab from './matters-money.js';
import * as ConflictsTab from './matters-conflicts.js';
import * as MoveTab from './matters-move.js';
import * as ListsTab from './matters-lists.js';

const TABS = [['list', 'Priorities'], ['money', 'The money'], ['conflicts', 'Conflicts'], ['move', 'Move money'], ['lists', 'Lists'], ['charts', 'Pictures']];
const STEP_LABELS = { dump: 'Say what matters', rank: 'Rank them', price: 'Put a price on each', tag: 'Tie the spending to them', connect: 'Connect them' };
const POL = [['positive', 'Want more of'], ['negative', 'Want gone']];

export function mount(host, app) {
  const coach = app.view === 'coach';
  const tab = TABS.some(t => t[0] === app.route.params.id) ? app.route.params.id : 'list';
  let listId = app.route.params.sub || 'mine';
  let dumpText = ''; let showAll = false; let openSplit = null; const state = { move: { fromId: null, toId: null, cents: 0 }, compareB: null }; /* what the tabs remember between redraws */
  const M = () => Mt.mattersOf(app.record);
  const commit = (fn, reason) => app.change(rec => Mt.changeMatters(rec, fn, { session: app.session }), { reason: reason || 'matters' });
  const report = () => Mt.mattersReport(app.record, app.result, app.data, { listId });
  host.appendChild(h('header', null, h('h1', null, coach ? 'What matters' : 'What matters to you'), h('span', { class: 'sub' }, coach ? 'A values audit with a price tag on every line: what they say matters, what the money says.' : 'What you said matters, and where the money goes.')));
  host.appendChild(h('nav', { class: 'mtabs matters-tabs', 'aria-label': 'What matters sections' }, TABS.filter(t => coach || ['list', 'money', 'charts'].includes(t[0])).map(([id, label]) => h('a', { href: '#/matters/' + id + (listId !== 'mine' ? '/' + listId : ''), 'aria-current': id === tab ? 'page' : null }, label))));
  const body = h('div', { class: 'matters' }); host.appendChild(body);

  function draw() {
    clear(body);
    if (!M().lists.find(l => l.id === listId)) listId = 'mine';
    const R = report(); const lists = M().lists;
    if (lists.length > 1) body.appendChild(h('div', { class: 'row matters-listpick' }, h('span', { class: 'small muted' }, 'List'), segmented(lists.map(l => [l.id, l.name]), listId, id => { listId = id; app.go('#/matters/' + tab + '/' + id); }, { label: 'Which list', small: true })));
    const ctx = { app, body, coach, listId, commit, M, draw, state };
    ({ list: drawList, money: R2 => MoneyTab.draw(ctx, R2), conflicts: R2 => ConflictsTab.draw(ctx, R2), move: R2 => MoveTab.draw(ctx, R2), lists: R2 => ListsTab.draw(ctx, R2), charts: drawCharts })[tab](R);
  }

  /* ---- the five steps ---- */
  function drawList(R) {
    const ps = Mt.prioritiesOf(M(), listId); const n = ps.length;
    if (!coach) { body.appendChild(clientList(R)); return; }
    const panel = h('section', { class: 'panel matters-steps' }); body.appendChild(panel);
    panel.appendChild(h('h2', null, R.list.name === 'Mine' ? 'Your priorities' : R.list.name, h('span', { class: 'tag' }, n ? n + (n === 1 ? ' priority' : ' priorities') : 'none yet')));
    /* 1 dump: built once, so typing never loses the box */
    const ta = h('textarea', { class: 'input dump', rows: 5, 'aria-label': 'What matters, one per line', onInput: e => { dumpText = e.target.value; } }); ta.value = dumpText;
    const addBtn = h('button', { class: 'btn primary', onClick: () => { const lines = ta.value.split('\n').map(s => s.trim()).filter(Boolean); if (!lines.length) return; commit(Mx => { Mt.addPriorities(Mx, listId, lines, 'positive'); }); dumpText = ''; ta.value = ''; app.toast(lines.length + (lines.length === 1 ? ' priority added' : ' priorities added') + '. Sort each one: more of it, or gone.'); } }, 'Add these');
    const recent = ps.slice(-8);
    panel.appendChild(fold('matters.dump', STEP_LABELS.dump, h('div', null, h('p', { class: 'small muted' }, 'Type fast, one per line, in their words. Then one tap sorts each: something they want more of, or a problem they want gone.'), ta, h('div', { class: 'row', style: { marginTop: '8px' } }, addBtn),
      recent.length ? h('ul', { class: 'matters-sort' }, recent.map(p => h('li', { dataset: { priority: p.id } }, h('span', { class: 'p-title' }, p.title), segmented(POL, p.polarity, v => commit(Mx => { Mt.updatePriority(Mx, listId, p.id, { polarity: v }); }), { label: p.title + ' is', small: true })))) : null), { open: n === 0, count: n }));
    /* 2 rank */
    const shown = showAll || n <= Mt.TOP ? ps : ps.slice(0, Mt.TOP);
    const rankList = h('ol', { class: 'matters-rank', 'aria-label': 'Priorities in rank order' }, shown.map(p => {
      const li = h('li', { draggable: 'true', dataset: { priority: p.id }, class: p.polarity }, h('span', { class: 'rank-num' }, String(p.rank)), h('span', { class: 'p-title' }, p.title, p.polarity === 'negative' ? h('span', { class: 'chip src' }, 'gone') : null),
        h('span', { class: 'rank-btns' }, h('button', { class: 'btn small quiet', 'aria-label': 'Move ' + p.title + ' up', disabled: p.rank === 1 ? '' : null, onClick: () => commit(Mx => { Mt.movePriority(Mx, listId, p.id, -1); }) }, 'Up'), h('button', { class: 'btn small quiet', 'aria-label': 'Move ' + p.title + ' down', disabled: p.rank === n ? '' : null, onClick: () => commit(Mx => { Mt.movePriority(Mx, listId, p.id, 1); }) }, 'Down'), h('button', { class: 'btn small quiet', 'aria-label': 'Remove ' + p.title, onClick: () => commit(Mx => { Mt.removePriority(Mx, listId, p.id); }) }, 'Remove')));
      li.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', p.id); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('over'); });
      li.addEventListener('dragleave', () => li.classList.remove('over'));
      li.addEventListener('drop', e => { e.preventDefault(); li.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (!id || id === p.id) return; const ids = ps.map(x => x.id); const i = ids.indexOf(id); ids.splice(i, 1); ids.splice(ids.indexOf(p.id), 0, id); commit(Mx => { Mt.reorder(Mx, listId, ids); }); });
      return li;
    }));
    panel.appendChild(fold('matters.rank', STEP_LABELS.rank, h('div', null, h('p', { class: 'small muted' }, n > Mt.TOP && !showAll ? 'The top five first, so it never stalls. Drag, or use Up and Down.' : 'Drag to reorder, or use Up and Down. Strict order: no ties.'), rankList,
      n > Mt.TOP ? h('button', { class: 'btn small', onClick: () => { showAll = !showAll; draw(); } }, showAll ? 'Show the top five' : 'Show all ' + n + ' and add more') : null), { open: n > 0 && !M().tags.length, count: n }));
    /* 3 price */
    panel.appendChild(fold('matters.price', STEP_LABELS.price, priceTable(ps), { open: false, count: ps.filter(p => Mt.declaredMonthly(p) !== null || Mt.problemMonthly(p) !== null).length + ' priced' }));
    /* 4 tag */
    panel.appendChild(fold('matters.tag', STEP_LABELS.tag, tagPanel(R, ps), { open: false, count: M().tags.length + (M().tags.length === 1 ? ' tag' : ' tags') }));
    /* 5 connect */
    panel.appendChild(fold('matters.connect', STEP_LABELS.connect, connectPanel(R, ps), { open: false, count: M().connections.length }));
  }

  function amountBox(label, amt, onCommit, opts) {
    const o = opts || {}; const a = amt || { v: null, state: 'unknown' };
    const input = h('input', { class: 'input num' + (a.v === null ? ' is-empty' : ''), type: 'text', inputmode: o.hours ? 'decimal' : 'decimal', 'aria-label': label, value: a.v === null ? '' : (o.hours ? String(a.v) : F.dollars(a.v, { plain: true }).replace('$', '')), onChange: e => { const t = e.target.value.trim(); if (t === '') { onCommit({ v: null, state: 'unknown' }); return; } const v = o.hours ? parseFloat(t) : F.parseMoney(t); if (v === null || !Number.isFinite(v)) { app.toast('A number, or leave it empty for Does not know.'); e.target.value = ''; return; } onCommit({ v: o.hours ? Math.round(v * 10) / 10 : v, state: a.state === 'unknown' ? 'known' : a.state }); } });
    const sel = h('select', { class: 'select small conf', 'aria-label': label + ', how sure', onChange: e => { const st = e.target.value; onCommit({ v: st === 'unknown' ? null : a.v, state: st }); if (st === 'unknown') input.value = ''; } }, Mt.CONFIDENCE.map(([id, lab]) => h('option', { value: id, selected: id === a.state }, lab)));
    return h('span', { class: 'amount-box' }, input, sel);
  }
  function priceTable(ps) {
    if (!ps.length) return h('p', { class: 'muted small' }, 'Add a priority first.');
    const wrap = h('div', { class: 'matters-price' });
    ps.forEach(p => {
      const upd = patch => commit(Mx => { Mt.updatePriority(Mx, listId, p.id, patch); });
      const rowsEl = [];
      if (p.polarity === 'positive') {
        rowsEl.push(field('A month', amountBox(p.title + ' cost a month', p.cost.monthly, a => upd({ cost: { monthly: a } }))));
        rowsEl.push(field('A year', amountBox(p.title + ' cost a year', p.cost.annual, a => upd({ cost: { annual: a } }))));
        rowsEl.push(field('One time', amountBox(p.title + ' one-time cost', p.cost.oneTime, a => upd({ cost: { oneTime: a } }))));
      } else {
        rowsEl.push(field('The problem costs, a month', amountBox(p.title + ' problem cost a month', p.problemCost.monthly, a => upd({ problemCost: { monthly: a } }))));
        rowsEl.push(field('The problem costs, a year', amountBox(p.title + ' problem cost a year', p.problemCost.annual, a => upd({ problemCost: { annual: a } }))));
        rowsEl.push(field('Fixing it, one time', amountBox(p.title + ' fix one-time cost', p.fixCost.oneTime, a => upd({ fixCost: { oneTime: a } }))));
        rowsEl.push(field('Fixing it, a month', amountBox(p.title + ' fix cost a month', p.fixCost.monthly, a => upd({ fixCost: { monthly: a } }))));
      }
      rowsEl.push(field('Hours a week', amountBox(p.title + ' hours a week', p.hoursPerWeek, a => upd({ hoursPerWeek: a }), { hours: true })));
      rowsEl.push(field('Whose value', h('select', { class: 'select small', 'aria-label': p.title + ', whose value', onChange: e => upd({ valueSource: e.target.value || null }) }, h('option', { value: '' }, 'Not asked'), Mt.VALUE_SOURCES.map(([id, lab]) => h('option', { value: id, selected: p.valueSource === id }, lab)))));
      rowsEl.push(field('Notes', h('input', { class: 'input', 'aria-label': p.title + ' notes', value: p.notes || '', onChange: e => upd({ notes: e.target.value.trim() }) })));
      wrap.appendChild(fold('matters.price.' + p.id, p.rank + '. ' + p.title + (p.polarity === 'negative' ? ' (gone)' : ''), h('div', { class: 'price-grid' }, rowsEl), { open: false, count: Mt.declaredMonthly(p) !== null ? money(Mt.declaredMonthly(p)) + ' a month' : (Mt.problemMonthly(p) !== null ? money(Mt.problemMonthly(p)) + ' a month, the problem' : 'no price yet') }));
    });
    return wrap;
  }

  function tagPanel(R, ps) {
    if (!ps.length) return h('p', { class: 'muted small' }, 'Add a priority first.');
    if (!R.sources.categories.length) return h('p', { class: 'muted small' }, 'Spending lines light this up. ', h('a', { href: '#/ledger/spending/line' }, 'Open Spending'));
    const wrap = h('div', { class: 'matters-tag' });
    wrap.appendChild(h('p', { class: 'small muted' }, 'Tap a priority under a category to tie that spending to it. All, most, half or some, or an exact share. Lines drill down inside each category. Anything left over is ' + Mt.UNTIED.toLowerCase() + '.'));
    const lineTagged = new Set(M().tags.filter(t => t.sourceType === 'line').map(t => t.sourceId));
    R.sources.categories.forEach(c => {
      const left = c.cents - c.lines.filter(l => lineTagged.has(l.id)).reduce((s, l) => s + l.cents, 0);
      const sec = h('div', { class: 'tag-cat', dataset: { category: c.id } }, h('div', { class: 'row tag-head' }, h('strong', null, c.label), h('span', { class: 'num small muted' }, money(c.cents) + ' a month' + (left !== c.cents ? ', ' + money(Math.max(0, left)) + ' not on a line tag' : ''))));
      sec.appendChild(chipRow('category', c.id, ps));
      if (c.lines.length) sec.appendChild(fold('matters.lines.' + c.id, 'Lines', h('div', null, c.lines.map(l => h('div', { class: 'tag-line', dataset: { line: l.id } }, h('div', { class: 'row' }, h('span', null, l.name), h('span', { class: 'num small muted' }, money(l.cents))), chipRow('line', l.id, ps)))), { open: false, count: c.lines.length }));
      wrap.appendChild(sec);
    });
    return wrap;
  }
  function chipRow(sourceType, sourceId, ps) {
    const tags = Mt.tagsOn(M(), sourceType, sourceId); const used = tags.reduce((s, t) => s + t.pct, 0);
    const row = h('div', { class: 'chips tag-chips' });
    ps.forEach(p => {
      const t = tags.find(x => x.priorityId === p.id); const key = sourceType + ':' + sourceId + ':' + p.id;
      row.appendChild(h('button', { type: 'button', class: 'chip toggle' + (t ? ' on' : ''), 'aria-pressed': String(!!t), 'aria-label': (t ? 'Change ' : 'Tie to ') + p.title, onClick: () => { openSplit = openSplit === key ? null : key; draw(); } }, p.title, t ? h('span', { class: 'chip-pct' }, ' ' + t.pct + '%') : null));
      if (openSplit === key) {
        const room = 100 - used + (t ? t.pct : 0);
        const set = pctV => { commit(Mx => { Mt.setTag(Mx, sourceType, sourceId, p.id, pctV); }); openSplit = null; };
        row.appendChild(h('div', { class: 'split-row', dataset: { split: key } }, h('span', { class: 'small muted' }, 'How much of it goes to ' + p.title + '? ' + room + '% free.'),
          h('div', { class: 'row' }, Mt.SPLITS.map(([lab, v]) => h('button', { type: 'button', class: 'btn small' + (t && t.pct === Math.min(v, room) ? ' primary' : ''), onClick: () => set(Math.min(v, room)) }, lab.charAt(0).toUpperCase() + lab.slice(1))),
            h('input', { class: 'input num pct', type: 'text', inputmode: 'numeric', 'aria-label': 'Exact share for ' + p.title, value: t ? String(t.pct) : '', onChange: e => { const v = parseInt(e.target.value, 10); if (!Number.isFinite(v)) return; set(Math.max(0, Math.min(room, v))); } }), h('span', { class: 'small muted' }, '%'),
            t ? h('button', { type: 'button', class: 'btn small quiet', onClick: () => set(null) }, 'Untie') : null)));
      }
    });
    if (used > 100) row.appendChild(h('span', { class: 'small', style: { color: 'var(--amber)' } }, 'Over 100%'));
    return row;
  }

  function connectPanel(R, ps) {
    if (ps.length < 2) return h('p', { class: 'muted small' }, 'Two priorities or more, then the lines between them.');
    const wrap = h('div', { class: 'matters-connect' });
    const opt = (sel, list) => list.map(p => h('option', { value: p.id, selected: sel === p.id }, p.title));
    let from = ps[0].id, type = 'supports', to = ps[1].id, kind = 'money';
    const kindSel = h('select', { class: 'select small', 'aria-label': 'Conflict kind', hidden: '', onChange: e => { kind = e.target.value; } }, Mt.CONFLICT_KINDS.map(([id, lab]) => h('option', { value: id }, lab)));
    wrap.appendChild(h('div', { class: 'row connect-form' },
      h('select', { class: 'select small', 'aria-label': 'From priority', onChange: e => { from = e.target.value; } }, opt(from, ps)),
      h('select', { class: 'select small', 'aria-label': 'Connection type', onChange: e => { type = e.target.value; kindSel.hidden = !(type === 'conflicts' || type === 'mutually exclusive'); } }, Mt.CONNECTION_TYPES.map(([id, lab]) => h('option', { value: id }, lab))),
      h('select', { class: 'select small', 'aria-label': 'To priority', onChange: e => { to = e.target.value; } }, opt(to, ps)), kindSel,
      h('button', { class: 'btn small primary', onClick: () => { if (from === to) { app.toast('Pick two different priorities.'); return; } commit(Mx => { Mt.addConnection(Mx, from, to, type, { conflictKind: kind, origin: 'client declared' }); }); } }, 'Draw the line')));
    const byId = {}; ps.forEach(p => { byId[p.id] = p; });
    const cs = M().connections.filter(c => byId[c.fromId] && byId[c.toId]);
    wrap.appendChild(cs.length ? h('ul', { class: 'connect-list' }, cs.map(c => h('li', { dataset: { connection: c.id } }, h('span', null, byId[c.fromId].title + ' ', h('em', null, Mt.CONNECTION_TYPES.find(t => t[0] === c.type)[1].toLowerCase()), ' ' + byId[c.toId].title + (c.conflictKind ? ' (' + c.conflictKind + ')' : '')), h('span', { class: 'small muted' }, c.origin), h('button', { class: 'btn small quiet', 'aria-label': 'Remove this line', onClick: () => commit(Mx => { Mt.removeConnection(Mx, c.id); }) }, 'Remove')))) : h('p', { class: 'muted small' }, 'No lines yet.'));
    const chartHost = h('div', { class: 'chart-body' }); wrap.appendChild(chartHost);
    const def = CHARTS.find(c => c.id === 'priorityMap'); setTimeout(() => Charts.render('priorityMap', chartHost, def.build(app.result, { listId }), { client: !coach }), 0);
    return wrap;
  }

  function clientList(R) {
    const sec = h('section', { class: 'panel' }, h('h2', null, 'What you said matters'));
    if (!R.priorities.length) { sec.appendChild(h('p', { class: 'muted small' }, 'Nothing listed yet. Your coach writes these down with you in a session.')); return sec; }
    sec.appendChild(h('ol', { class: 'matters-rank client' }, R.priorities.map(l => h('li', { class: l.polarity }, h('span', { class: 'rank-num' }, String(l.rank)), h('span', { class: 'p-title' }, l.title, l.polarity === 'negative' ? h('span', { class: 'chip src' }, 'want gone') : null), h('span', { class: 'num small muted' }, l.tied.cents ? money(l.tied.cents) + ' a month goes here' : 'no spending tied yet')))));
    return sec;
  }

/* ---- pictures ---- */
function drawCharts(R) {
  const ids = ['prioritySankey', 'priorityBars', 'priorityQuadrant', 'priorityMap'];
  ids.forEach(id => { const c = CHARTS.find(x => x.id === id); const sec = h('section', { class: 'panel chart-panel' }, h('h2', null, coach ? c.name : c.client)); const bodyEl = h('div', { class: 'chart-body' }); sec.appendChild(bodyEl); body.appendChild(sec); setTimeout(() => Charts.render(id, bodyEl, c.build(app.result, { listId }), { client: !coach }), 0); });
}

  draw();
  return { update() { draw(); } };
}

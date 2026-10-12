/* The checklist (MR-077): every piece of information the numbers need for
   this client on one screen, with what is on file and whether it counts as
   in. The household facts first, then each room with every row's facts, then
   the first call. A row is a door into the cell it names. Filters show only
   what is still needed or only the rough figures; optional facts stay hidden
   until asked for. Coach view only. The engine decides what counts. */
import { h, clear } from '../dom.js';
import { checklist, STATUS } from '../../engine/checklist.js';
import { unlockMap } from '../../engine/unlocks.js';
import { markTypeNone } from '../table.js';
import { segmented } from '../seg.js';
import { cellDoor, linkify } from '../doors.js';
import { clientName } from '../app.js';

const FILTERS = [['all', 'Everything'], ['open', 'Still needed'], ['rough', 'Rough']];

function remember(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* no storage: the pick lives for this screen */ } }
function recall(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; } }

export function mount(host, app) {
  let filter = recall('mr3.checklistFilter', 'all'); if (!FILTERS.some(f => f[0] === filter)) filter = 'all';
  let optional = recall('mr3.checklistOptional', 'yes') === 'yes'; /* the whole list by default; the toggle hides the optional facts */
  host.appendChild(h('header', null, h('h1', null, 'Checklist'), h('span', { class: 'sub' }, 'Everything the numbers need for ' + (clientName(app.record) || 'this client') + ': what is in, what is rough, what is still missing. Tap a line to open where it lives.')));
  const strip = h('section', { class: 'panel chk-strip' });
  const body = h('div', { class: 'stack chk-body' });
  host.appendChild(strip); host.appendChild(body);

  const show = it => {
    if (filter === 'open') return it.counts && !it.done;
    if (filter === 'rough') return it.status === 'rough';
    return it.counts || optional;
  };
  const doorAttrs = it => {
    if (it.rowId && it.field) { const cell = cellDoor(app, it.rowId, it.field); if (cell) return { cell }; }
    return { go: it.href };
  };

  function drawStrip(c) {
    clear(strip);
    const pct = c.total ? Math.round(c.done / c.total * 100) : 100;
    const words = [c.done + ' of ' + c.total + ' in'];
    if (c.open) words.push(c.open + ' still needed'); if (c.rough) words.push(c.rough + ' rough');
    strip.appendChild(h('div', { class: 'tracker' + (c.complete ? ' complete' : ''), role: 'status' },
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('div', { class: 'fill', style: { width: pct + '%' } })),
      h('div', { class: 'row tracker-row' },
        h('span', { class: 'count' }, words.join(', ')),
        c.next ? h('span', { class: 'next' }, 'Next: ' + (c.next.sub ? c.next.sub + ', ' : '') + c.next.label.toLowerCase() + '.') : h('span', { class: 'next' }, 'Everything the numbers need is in.'),
        c.next ? h('a', { class: 'btn small primary', href: c.next.href, onClick: () => { if (c.next.rowId && c.next.field) app.focusAfterRender = { rowId: c.next.rowId, field: c.next.field, details: c.next.rowId !== 'sun' }; } }, 'Go') : null)));
    strip.appendChild(h('div', { class: 'row chk-controls' },
      segmented(FILTERS, filter, v => { filter = v; remember('mr3.checklistFilter', v); draw(); }, { label: 'Show', small: true }),
      h('label', { class: 'small chk-optional' }, h('input', { type: 'checkbox', checked: optional, onChange: e => { optional = e.target.checked; remember('mr3.checklistOptional', optional ? 'yes' : 'no'); draw(); } }), ' Show optional facts')));
  }

  function groupHead(g, s) {
    const bits = [g.label];
    if (g.rows) bits.push(g.rows + (g.rows === 1 ? ' row' : ' rows'));
    else if (g.note) bits.push(g.note);
    const th = h('th', { colspan: 3 }, h('span', { class: 'chk-group-name' }, bits[0]), bits.length > 1 ? h('span', { class: 'small muted' }, ' ' + bits.slice(1).join(', ')) : null,
      g.total ? h('span', { class: 'small muted chk-group-count' }, g.done + ' of ' + g.total + ' in') : null,
      !g.rows && !g.single && !g.optional && !s.derived && g.items.some(i => i.status === 'add') ? h('button', { class: 'btn small quiet', title: 'None of these for this household', onClick: () => { markTypeNone(app, g.planet, g.type); } }, 'None') : null);
    return h('tr', { class: 'chk-group' }, th);
  }
  function itemRow(it) {
    const st = STATUS[it.status];
    const attrs = doorAttrs(it);
    const text = it.text ? h('span', { class: it.status === 'rough' ? 'rough' : null }, it.text) : h('span', { class: 'empty-token' }, it.status === 'add' ? 'No rows yet' : 'Not entered');
    return h('tr', { class: 'chk-item s-' + it.status + (it.primary ? ' primary' : ''), dataset: attrs.cell ? { cell: attrs.cell } : { go: attrs.go }, 'aria-label': (it.sub ? it.sub + ': ' : '') + it.label + ', ' + st.label },
      h('td', { 'data-label': 'Fact' }, it.sub ? h('span', { class: 'chk-sub' }, it.sub) : null, it.label),
      h('td', { 'data-label': 'On file' }, text),
      h('td', { 'data-label': 'State' }, h('span', { class: 'chk-state' }, st.label)));
  }
  /* what the facts feed (the worry "is everything connected"): how many numbers, charts and readings are open, and for each one still locked, the fact that opens it */
  function drawLocked() {
    const map = unlockMap(app.record, app.result, app.data);
    const t = map.totals;
    const locked = map.items.filter(it => it.state === 'locked' && !it.coachOnly && it.input);
    const line = t.metrics.open + ' of ' + t.metrics.total + ' numbers, ' + t.charts.open + ' of ' + t.charts.total + ' charts and ' + t.lenses.open + ' of ' + t.lenses.total + ' readings are open.';
    const byInput = [];
    locked.forEach(it => { const key = it.input.rowId ? it.input.rowId + '|' + it.input.field : it.input.href + '|' + it.input.label; let g = byInput.find(x => x.key === key); if (!g) { g = { key, input: it.input, items: [] }; byInput.push(g); } g.items.push(it); });
    byInput.sort((a, b) => b.items.length - a.items.length);
    return h('section', { class: 'panel chk-section chk-locked', id: 'chk-locked' },
      h('div', { class: 'row chk-head' }, h('h2', null, 'What the facts feed', h('span', { class: 'tag' }, locked.length ? locked.length + ' still locked' : 'all open')), h('span', { class: 'spacer' }), h('a', { class: 'small', href: '#/measure/unlocks' }, 'Open')),
      h('p', { class: 'small muted' }, line + (byInput.length ? ' Each line below is one missing fact and what it opens.' : '')),
      byInput.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data checklist' },
        h('thead', null, h('tr', null, h('th', null, 'Missing fact'), h('th', null, 'Opens'), h('th', null, 'Where'))),
        h('tbody', null, byInput.slice(0, 12).map(g => { const inp = g.input; const cell = inp.rowId && inp.field && inp.rowId !== 'sun' ? cellDoor(app, inp.rowId, inp.field) : (inp.rowId === 'sun' ? cellDoor(app, 'sun', inp.field) : null);
          return h('tr', { class: 'chk-item s-missing', dataset: cell ? { cell } : { go: inp.href }, 'aria-label': inp.label + ', opens ' + g.items.length },
            h('td', { 'data-label': 'Missing fact' }, inp.label + (inp.addRow ? ' (a first row)' : '')),
            h('td', { 'data-label': 'Opens' }, (names => names.slice(0, 3).join(', ') + (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : ''))(g.items.map(it => it.name).filter((n, i, a) => a.indexOf(n) === i))),
            h('td', { 'data-label': 'Where' }, h('span', { class: 'chk-state' }, inp.where))); })))) : null,
      byInput.length > 12 ? h('p', { class: 'small muted' }, 'And ' + (byInput.length - 12) + ' more on the Unlocks tab.') : null);
  }
  function draw() {
    const c = checklist(app.record, app.result, app.data);
    drawStrip(c);
    clear(body);
    let shown = 0;
    c.sections.forEach(s => {
      const groups = s.groups.map(g => ({ g, items: g.items.filter(show) })).filter(x => x.items.length);
      if (!groups.length) return;
      shown += groups.reduce((n, x) => n + x.items.length, 0);
      const tagText = s.derived && !s.total ? 'computed from Income' : s.done + ' of ' + s.total + ' in';
      body.appendChild(h('section', { class: 'panel chk-section', id: 'chk-' + s.id },
        h('div', { class: 'row chk-head' }, h('h2', null, s.label, h('span', { class: 'tag' }, tagText)), h('span', { class: 'spacer' }), h('a', { class: 'small', href: s.href }, 'Open')),
        h('div', { class: 'tablewrap' }, h('table', { class: 'data checklist' },
          h('thead', null, h('tr', null, h('th', null, 'Fact'), h('th', null, 'On file'), h('th', null, 'State'))),
          groups.map(x => h('tbody', null, s.groups.length > 1 ? groupHead(x.g, s) : null, x.items.map(itemRow)))))));
    });
    body.appendChild(drawLocked());
    if (!shown) body.appendChild(h('section', { class: 'panel empty chk-empty' }, h('p', { class: 'big' }, filter === 'rough' ? 'No rough figures.' : 'Everything the numbers need is in.'), h('p', { class: 'small muted' }, filter === 'all' ? 'Nothing on file yet: start with the household facts on the Plan.' : 'Switch to Everything to read the whole list.')));
    linkify(host);
  }
  draw();
  return { update() { draw(); } };
}

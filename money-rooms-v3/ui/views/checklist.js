/* The checklist (MR-077, MR-078): every piece of information the numbers need
   for this client on one screen, with what is on file and whether it counts
   as in. The household facts first, then each room with every row's facts,
   then the first call. Every fact is entered right here: the value cell holds
   the same control the room shows (the ledger's one cell editor, the
   household panel's one control), the state cell is the state chip, and the
   counts move the moment a value lands. Enter moves to the next line. The
   fact's name is a door into the room it lives in. A change patches the
   lines in place; the list is rebuilt only when a row is added or removed
   (D-034). Filters show only what is still needed or only the rough figures;
   optional facts sit behind a toggle. Coach view only. The engine decides
   what counts. */
import { h, clear } from '../dom.js';
import { checklist, STATUS } from '../../engine/checklist.js';
import { unlockMap } from '../../engine/unlocks.js';
import { fieldDef, primaryFieldOf } from '../../engine/fields.js';
import { ledgerTable, markTypeNone } from '../table.js';
import { sunControl } from '../sunpanel.js';
import { stateChip } from '../chips.js';
import { segmented } from '../seg.js';
import { cellDoor, linkify } from '../doors.js';
import { clientName } from '../app.js';

const FILTERS = [['all', 'Everything'], ['open', 'Still needed'], ['rough', 'Rough']];

function remember(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* no storage: the pick lives for this screen */ } }
function recall(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; } }

export function mount(host, app) {
  let filter = recall('mr3.checklistFilter', 'all'); if (!FILTERS.some(f => f[0] === filter)) filter = 'all';
  let optional = recall('mr3.checklistOptional', 'no') === 'yes';
  host.appendChild(h('header', null, h('h1', null, 'Checklist'), h('span', { class: 'sub' }, 'Everything the numbers need for ' + (clientName(app.record) || 'this client') + ': what is in, what is rough, what is still missing. Type into a line and the counts move; Enter goes to the next line. Tap a fact\'s name to open its room.')));
  const strip = h('section', { class: 'panel chk-strip' });
  const body = h('div', { class: 'stack chk-body' });
  host.appendChild(strip); host.appendChild(body);
  const tables = {};
  const tableFor = (planet, type) => { const k = planet + '/' + type; if (!tables[k]) tables[k] = ledgerTable(h('div'), app, planet, type, { formOnly: true }); return tables[k]; };
  const rowOf = it => (app.record.planets[it.planet] || { rows: [] }).rows.find(r => r.id === it.rowId) || null;

  const show = it => {
    if (filter === 'open') return it.counts && !it.done;
    if (filter === 'rough') return it.status === 'rough';
    return it.counts || optional;
  };
  const doorAttrs = it => {
    if (it.rowId && it.field) { const cell = cellDoor(app, it.rowId, it.field); if (cell) return { cell }; }
    return { go: it.href };
  };
  const editable = it => !!(it.rowId && it.field && (it.rowId === 'sun' || rowOf(it)));
  const liveField = it => it.rowId === 'sun' ? app.record.sun.f[it.field] : (rowOf(it) || { f: {} }).f[it.field];

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
        c.next ? h('button', { class: 'btn small primary', onClick: () => goNext(c.next) }, 'Go') : null)));
    strip.appendChild(h('div', { class: 'row chk-controls' },
      segmented(FILTERS, filter, v => { filter = v; remember('mr3.checklistFilter', v); draw(); }, { label: 'Show', small: true }),
      h('label', { class: 'small chk-optional' }, h('input', { type: 'checkbox', checked: optional, onChange: e => { optional = e.target.checked; remember('mr3.checklistOptional', optional ? 'yes' : 'no'); draw(); } }), ' Show optional facts'),
      h('span', { class: 'small muted chk-hint' }, '~ rough, ? unknown, v verified, 1500-2000 a range, send, n/a, 0 a real zero.')));
  }
  /* the next line to fill: its control when it is on this screen, else its room */
  function goNext(it) {
    const tr = body.querySelector('tr[data-id="' + it.id + '"]');
    const ctl = tr && tr.querySelector('.chk-value input, .chk-value select, .chk-value button');
    if (ctl) { ctl.focus(); if (ctl.scrollIntoView) ctl.scrollIntoView({ block: 'center' }); return; }
    if (it.rowId && it.field) app.focusAfterRender = { rowId: it.rowId, field: it.field, details: it.rowId !== 'sun' };
    location.hash = it.href;
  }

  function groupHead(g) {
    const bits = [g.label];
    if (g.rows) bits.push(g.rows + (g.rows === 1 ? ' row' : ' rows'));
    else if (g.note) bits.push(g.note);
    return h('tr', { class: 'chk-group' }, h('th', { colspan: 3 }, h('span', { class: 'chk-group-name' }, bits[0]), bits.length > 1 ? h('span', { class: 'small muted' }, ' ' + bits.slice(1).join(', ')) : null,
      g.total ? h('span', { class: 'small muted chk-group-count' }, g.done + ' of ' + g.total + ' in') : null));
  }
  /* the value cell: the room's own control for a fact, a first-row button for a type with none, or the words on file */
  function valueCell(it, s) {
    const td = h('td', { 'data-label': 'On file', class: 'chk-value' });
    if (it.rowId === 'sun' && it.field) { td.appendChild(sunControl(app, it.field)); return td; }
    const row = it.rowId && it.field ? rowOf(it) : null;
    if (row) {
      const d = fieldDef(app.data.fields, it.field); const t = tableFor(it.planet, it.type);
      td.appendChild(t.editor(row, d));
      if (d.cadence) td.appendChild(t.cadenceControl(row, d));
      return td;
    }
    if (it.addRow && it.planet && it.type && !s.derived) {
      const t = tableFor(it.planet, it.type); const prim = primaryFieldOf(app.data.fields, it.planet, it.type);
      td.appendChild(h('button', { class: 'btn small', onClick: () => { const r = t.addRow(); if (r && prim) focusLine('row:' + r.id + ':' + prim.id); } }, 'Add a row'));
      if (it.status === 'add') td.appendChild(h('button', { class: 'btn small quiet', title: 'None of these for this household', onClick: () => markTypeNone(app, it.planet, it.type) }, 'None'));
      return td;
    }
    td.appendChild(it.text ? h('span', { class: it.status === 'rough' ? 'rough' : null }, it.text) : h('span', { class: 'empty-token' }, 'Not entered'));
    return td;
  }
  function stateCell(it) {
    const td = h('td', { 'data-label': 'State', class: 'chk-statecell' });
    paintState(td, it);
    return td;
  }
  function paintState(td, it) {
    clear(td);
    if (editable(it)) {
      const f = liveField(it) || { v: null, state: 'unknown', source: 'client' };
      td.appendChild(h('span', { class: 'chk-state' }, stateChip(f, s => app.setField(it.rowId, it.field, f.v, s, f.source || 'client'), { label: 'State of ' + it.label.toLowerCase(), exclude: it.rowId === 'sun' ? ['not-for-me'] : [] })));
    } else td.appendChild(h('span', { class: 'chk-state' }, STATUS[it.status].label));
  }
  function itemRow(it, s) {
    const attrs = doorAttrs(it);
    return h('tr', { class: 'chk-item s-' + it.status + (it.primary ? ' primary' : ''), dataset: { id: it.id } },
      h('td', { 'data-label': 'Fact', class: 'chk-fact', dataset: attrs.cell ? { cell: attrs.cell } : { go: attrs.go }, 'aria-label': (it.sub ? it.sub + ': ' : '') + it.label + ', open its room' }, it.sub ? h('span', { class: 'chk-sub' }, it.sub) : null, it.label),
      valueCell(it, s),
      stateCell(it));
  }
  function focusLine(id) {
    const tr = body.querySelector('tr[data-id="' + id + '"]');
    const ctl = tr && tr.querySelector('.chk-value input, .chk-value select, .chk-value button');
    if (ctl) { ctl.focus(); if (ctl.scrollIntoView) ctl.scrollIntoView({ block: 'center' }); }
  }
  /* Enter: commit and move to the next line's control (the ledger's editor commits on its own; a household control gets the nudge here) */
  body.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const el = e.target; if (!el.matches('.chk-value input, .chk-value select')) return;
    if (el.tagName === 'INPUT' && el.dataset.field) el.dispatchEvent(new Event('change', { bubbles: true }));
    e.preventDefault();
    const all = Array.from(body.querySelectorAll('.chk-value input, .chk-value select, .chk-value button')).filter(x => !x.disabled);
    const i = all.indexOf(el);
    const next = all.slice(i + 1).find(x => x.closest('tr') !== el.closest('tr'));
    if (next) { next.focus(); if (next.scrollIntoView) next.scrollIntoView({ block: 'center' }); }
  });

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
        h('tbody', null, byInput.slice(0, 12).map(g => { const inp = g.input; const cell = inp.rowId && inp.field ? cellDoor(app, inp.rowId, inp.field) : null;
          return h('tr', { class: 'chk-item s-missing', dataset: cell ? { cell } : { go: inp.href }, 'aria-label': inp.label + ', opens ' + g.items.length },
            h('td', { 'data-label': 'Missing fact' }, inp.label + (inp.addRow ? ' (a first row)' : '')),
            h('td', { 'data-label': 'Opens' }, (names => names.slice(0, 3).join(', ') + (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : ''))(g.items.map(it => it.name).filter((n, i, a) => a.indexOf(n) === i))),
            h('td', { 'data-label': 'Where' }, h('span', { class: 'chk-state' }, inp.where))); })))) : null,
      byInput.length > 12 ? h('p', { class: 'small muted' }, 'And ' + (byInput.length - 12) + ' more on the Unlocks tab.') : null);
  }
  const visible = c => c.sections.map(s => ({ s, groups: s.groups.map(g => ({ g, items: g.items.filter(show) })).filter(x => x.items.length) })).filter(x => x.groups.length);
  const idsOf = vis => new Set(vis.flatMap(x => x.groups.flatMap(y => y.items.map(i => i.id))));
  let drawn = new Set();

  function draw() {
    const c = checklist(app.record, app.result, app.data);
    const vis = visible(c); drawn = idsOf(vis);
    drawStrip(c);
    clear(body);
    let shown = 0;
    vis.forEach(({ s, groups }) => {
      shown += groups.reduce((n, x) => n + x.items.length, 0);
      const tagText = s.derived && !s.total ? 'computed from Income' : s.done + ' of ' + s.total + ' in';
      body.appendChild(h('section', { class: 'panel chk-section', id: 'chk-' + s.id },
        h('div', { class: 'row chk-head' }, h('h2', null, s.label, h('span', { class: 'tag' }, tagText)), h('span', { class: 'spacer' }), h('a', { class: 'small', href: s.href }, 'Open')),
        h('div', { class: 'tablewrap' }, h('table', { class: 'data checklist' },
          h('thead', null, h('tr', null, h('th', null, 'Fact'), h('th', null, 'On file'), h('th', null, 'State'))),
          groups.map(x => h('tbody', null, s.groups.length > 1 ? groupHead(x.g) : null, x.items.map(it => itemRow(it, s))))))));
    });
    body.appendChild(drawLocked());
    if (!shown) body.appendChild(h('section', { class: 'panel empty chk-empty' }, h('p', { class: 'big' }, filter === 'rough' ? 'No rough figures.' : 'Everything the numbers need is in.'), h('p', { class: 'small muted' }, filter === 'all' ? 'Nothing on file yet: start with the household facts on the Plan.' : 'Switch to Everything to read the whole list.')));
    linkify(host);
  }
  /* after a value lands: the counts, the tags, the state chips and the plain-text lines change in place; the live controls stay (D-034) */
  function refresh() {
    const c = checklist(app.record, app.result, app.data);
    /* a line that was on screen stays until the next full draw, even when it no longer fits the filter: the cursor never loses its place; a line that is new to the screen, or gone from the record, rebuilds the list */
    const all = new Set(c.items.map(i => i.id)); const vis = visible(c);
    const needsDraw = Array.from(idsOf(vis)).some(id => !drawn.has(id)) || Array.from(drawn).some(id => !all.has(id));
    if (needsDraw) { draw(); return; }
    drawStrip(c);
    c.sections.map(s => ({ s, groups: s.groups.map(g => ({ g, items: g.items.filter(i => drawn.has(i.id)) })).filter(x => x.items.length) })).forEach(({ s, groups }) => {
      const sec = body.querySelector('#chk-' + s.id); const tag = sec && sec.querySelector('h2 .tag');
      if (tag) tag.textContent = s.derived && !s.total ? 'computed from Income' : s.done + ' of ' + s.total + ' in';
      groups.forEach(({ g, items }) => {
        const cnt = sec && Array.from(sec.querySelectorAll('.chk-group-count')).find(el => el.closest('tbody') && el.closest('tbody').querySelector('tr[data-id="' + items[0].id + '"]'));
        if (cnt) cnt.textContent = g.done + ' of ' + g.total + ' in';
        items.forEach(it => {
          const tr = body.querySelector('tr[data-id="' + it.id + '"]'); if (!tr) return;
          tr.className = 'chk-item s-' + it.status + (it.primary ? ' primary' : '');
          paintState(tr.querySelector('.chk-statecell'), it);
          if (!editable(it) && !it.addRow) { const v = tr.querySelector('.chk-value'); clear(v); v.appendChild(it.text ? h('span', { class: it.status === 'rough' ? 'rough' : null }, it.text) : h('span', { class: 'empty-token' }, 'Not entered')); }
        });
      });
    });
    const old = body.querySelector('#chk-locked'); if (old) old.replaceWith(drawLocked());
    linkify(host);
  }
  draw();
  return { update(reason) { if (reason === 'rows' || reason === 'clients') draw(); else refresh(); } };
}

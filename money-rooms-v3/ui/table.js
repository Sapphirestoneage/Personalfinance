/* The Ledger table: one row type of one planet. Inline editing in cells,
   every column sortable, filters by state, source and institution, keyboard
   flow (Enter down a column, Alt+N new row, Alt+Delete remove), a field bar
   that shows and sets the focused cell's state and source, and library
   prefill for cards and funds. Cells commit on change and update their own
   derived cells in place; the table is rebuilt only on sort, filter, add or
   remove, never while a cell is being typed in. */
import { closeOverlay } from './app.js';
import { h, clear } from './dom.js';
import { stateChip, sourceChip } from './chips.js';
import { parseTyped, rawOf } from './typed.js';
import * as F from '../engine/format.js';
import { confidenceOf, hasValue, isRough, STATES, SOURCES } from '../engine/states.js';
import { typeDef, fieldDef, primaryFieldOf, freshFacts, noneRow } from '../engine/fields.js';
import { createRow } from '../engine/record.js';
import { monthlyOf } from '../engine/compute.js';

const CADENCE_SHORT = { paycheck: 'pay', week: 'wk', month: 'mo', quarter: 'qtr', year: 'yr', oneoff: 'once' };

export function ledgerTable(host, app, planet, typeId, opts) {
  opts = opts || {};
  const fields = app.data.fields;
  const tdef = typeDef(fields, planet, typeId);
  const primary = primaryFieldOf(fields, planet, typeId);
  const coach = app.view === 'coach';
  const state = { sortKey: null, sortDir: 1, filters: { state: '', source: '', institution: '', category: '' }, selected: new Set() };
  const wrap = h('div', { class: 'ledger', dataset: { planet, type: typeId } });
  host.appendChild(wrap);

  function rows() {
    let list = app.record.planets[planet].rows.filter(r => r.type === typeId);
    const f = state.filters;
    if (f.state) list = list.filter(r => (r.f[primary.id] || {}).state === f.state);
    if (f.source) list = list.filter(r => (r.f[primary.id] || {}).source === f.source);
    if (f.institution) list = list.filter(r => r.institution === f.institution);
    if (f.category) list = list.filter(r => (r.f.category || {}).v === f.category);
    if (state.sortKey) {
      const k = state.sortKey;
      list = list.slice().sort((a, b) => cmp(sortValue(a, k), sortValue(b, k)) * state.sortDir);
    }
    return list;
  }
  function sortValue(r, k) {
    if (k === 'nickname' || k === 'institution' || k === 'asOf') return r[k] || '';
    if (k === 'state') return (r.f[primary.id] || {}).state || '';
    if (k === 'source') return (r.f[primary.id] || {}).source || '';
    if (k === 'confidence') return rowConfidence(r);
    if (k === 'stress') return r.stress === null ? -1 : r.stress;
    if (k === 'followUp') return r.followUp ? 1 : 0;
    const f = r.f[k];
    if (!f || !hasValue(f)) return null;
    if (f.v && typeof f.v === 'object' && 'low' in f.v) return (f.v.low + f.v.high) / 2;
    return f.v;
  }
  function cmp(a, b) {
    if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  }
  function rowConfidence(r) {
    const list = tdef.fields.map(id => r.f[id]).filter(f => f && f.state !== 'not-applicable' && f.state !== 'not-for-me');
    if (!list.length) return 0;
    return list.reduce((s, f) => s + confidenceOf(f), 0) / list.length;
  }

  function addRow(afterFocusCol) {
    if (tdef.single && app.record.planets[planet].rows.some(r => r.type === typeId)) return null;
    const row = createRow(planet, typeId, { f: freshFacts(fields, planet, typeId) });
    tdef.fields.forEach(id => { const d = fieldDef(fields, id); if (d.cadence) row.f[id].cad = d.defaultCadence; });
    app.addRow(row);
    render();
    const focusNew = () => { const target = wrap.querySelector('tr[data-row="' + row.id + '"] [data-col="' + (afterFocusCol || 'nickname') + '"]'); if (target && document.activeElement !== target) target.focus(); };
    focusNew();
    return row;
  }

  function render() {
    clear(wrap);
    const list = rows();
    const all = app.record.planets[planet].rows.filter(r => r.type === typeId);
    const institutions = Array.from(new Set(all.map(r => r.institution).filter(Boolean))).sort();
    const showFilters = all.length > 5;
    const catDef = tdef.fields.includes('category') ? fieldDef(fields, 'category') : null;
    state.selected.forEach(id => { if (!all.some(r => r.id === id)) state.selected.delete(id); });
    const nSel = state.selected.size;
    const toolbar = h('div', { class: 'toolbar' },
      all.length ? h('span', { class: 'small muted' }, all.length + (all.length === 1 ? ' row' : ' rows')) : null,
      coach && nSel ? h('button', { class: 'btn small', onClick: () => { const ids = Array.from(state.selected); state.selected.clear(); app.removeRows(ids); render(); } }, 'Delete ' + (nSel === 1 ? '1 row' : nSel + ' rows')) : null,
      showFilters ? filterSelect('State', 'state', Object.keys(STATES).map(id => [id, STATES[id].label])) : null,
      showFilters ? filterSelect('Source', 'source', Object.keys(SOURCES).map(id => [id, SOURCES[id].label])) : null,
      showFilters && catDef ? filterSelect('Category', 'category', catDef.options) : null,
      showFilters && !catDef && institutions.length ? filterSelect(fields.planets[planet].institutionLabel, 'institution', institutions.map(i => [i, i])) : null,
      h('span', { style: { flex: 1 } }),
      coach && all.length && !(tdef.single && all.length) ? h('span', { class: 'row' }, h('button', { class: 'btn small primary', onClick: () => addRow() }, 'Add row'), h('span', { class: 'kbd' }, 'Alt+N')) : null);
    const cols = columns();
    const thead = h('thead', null, h('tr', null, cols.map(c => h('th', {
      class: (c.num ? 'num' : '') + (c.sticky ? ' sticky' : ''), 'aria-sort': state.sortKey === c.key ? (state.sortDir === 1 ? 'ascending' : 'descending') : null,
      onClick: () => { if (!c.sortable) return; if (state.sortKey === c.key) state.sortDir = -state.sortDir; else { state.sortKey = c.key; state.sortDir = 1; } render(); },
      title: c.hint || null,
    }, c.label))));
    const tbody = h('tbody', null, list.map(r => renderRow(r, cols)));
    const table = h('table', { class: 'data ledger-table' }, thead, tbody, totalsRow(list, cols));
    const tableWrap = h('div', { class: 'tablewrap' }, table);
    wrap.appendChild(h('div', { class: 'panel ledger-panel', style: { padding: 0, overflow: 'hidden' } }, toolbar, list.length ? tableWrap : emptyState(all.length)));
    if (coach && all.length) wrap.appendChild(fieldBar());
  }

  function emptyState(total) {
    if (total) return h('div', { class: 'empty', style: { border: 0, borderRadius: 0 } }, h('p', null, 'No rows match these filters.'));
    return h('div', { class: 'empty', style: { border: 0, borderRadius: 0 } },
      h('h2', null, tdef.assumeNone ? 'None, unless there is one' : 'No ' + (tdef.plural || tdef.label).toLowerCase() + ' yet'),
      tdef.assumeNone ? h('p', null, 'Most households have no ' + (tdef.plural || tdef.label).toLowerCase() + ', so the planet counts this as answered. Add a row only if there is one.') : null,
      h('p', null, 'Start with ' + (tdef.nicknameLabel || 'a name').toLowerCase() + ' and ' + primary.label.toLowerCase() + '. Type ~ before a number for a rough figure, ? for unknown, a range like 1500-2000.'),
      coach ? h('p', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onClick: () => addRow() }, 'Add ' + (tdef.single ? 'it' : 'a row')), h('span', { class: 'kbd' }, 'Alt+N'),
        tdef.single ? null : h('button', { class: 'btn', title: 'Marks this as none, so the planet counts it as answered', onClick: () => markNone() }, 'No ' + (tdef.plural || tdef.label).toLowerCase()),
        (opts.emptyActions || [])) : null);
  }
  function markNone() {
    const n = noneRow(fields, planet, typeId);
    const row = createRow(planet, typeId, { nickname: n.nickname, f: n.f });
    app.addRow(row);
    app.toast('Marked as none. Add a row if that changes.');
  }

  /* Totals: every money column, normalised to a month when it has a cadence; balances otherwise. Two or more rows only. */
  function totalsRow(list, cols) {
    if (list.length < 2 || primary.kind !== 'money' || tdef.single) return null;
    const totals = {};
    cols.filter(c => c.kind === 'field' && c.def.kind === 'money').forEach(c => {
      let sum = 0, any = false, rough = false;
      list.forEach(r => {
        const f = r.f[c.def.id];
        if (!f || !hasValue(f)) return;
        const v = c.def.cadence ? monthlyOf(r, c.def.id) : (typeof f.v === 'object' ? Math.round((f.v.low + f.v.high) / 2) : f.v);
        if (v === null) return;
        sum += v; any = true; if (isRough(f)) rough = true;
      });
      if (any) totals[c.def.id] = { sum, rough };
    });
    if (!Object.keys(totals).length) return null;
    return h('tfoot', { class: 'totals' }, h('tr', null, cols.map((c, i) => {
      if (i === 0) return h('td', { class: 'sticky' }, primary.cadence ? 'Total a month' : 'Total');
      if (c.kind === 'field' && totals[c.def.id]) return h('td', { class: 'num' }, F.dollarsWhole(totals[c.def.id].sum, { rough: totals[c.def.id].rough }));
      return h('td', null, '');
    })));
  }

  function filterSelect(label, key, options) {
    return h('label', { class: 'filter' }, label,
      h('select', { class: 'select', 'aria-label': 'Filter by ' + label.toLowerCase(), onChange: e => { state.filters[key] = e.target.value; render(); } },
        h('option', { value: '' }, 'All'), options.map(o => h('option', { value: o[0], selected: state.filters[key] === o[0] }, o[1]))));
  }

  function columns() {
    const cols = [];
    cols.push({ key: 'nickname', label: tdef.nicknameLabel || 'Nickname', sortable: true, kind: 'column', sticky: true });
    const pushField = id => {
      const d = fieldDef(fields, id);
      cols.push({ key: id, label: d.label, sortable: true, kind: 'field', def: d, num: ['money', 'percent', 'int', 'hours'].includes(d.kind), hint: d.hint });
    };
    pushField(primary.id);
    (tdef.tableFields || []).filter(id => id !== primary.id).forEach(pushField);
    cols.push({ key: 'state', label: 'State', sortable: true, kind: 'state' });
    if (coach) cols.push({ key: 'source', label: 'Source', sortable: true, kind: 'source' });
    cols.push({ key: 'details', label: '', sortable: false, kind: 'details' });
    return cols;
  }
  /* Everything else about a row lives behind Details (MR-029): no sideways scrolling to reach a fact. */
  function detailColumns() {
    const cols = [];
    const shown = [primary.id].concat(tdef.tableFields || []);
    const pushField = id => {
      const d = fieldDef(fields, id);
      cols.push({ key: id, label: d.label, sortable: false, kind: 'field', def: d, num: ['money', 'percent', 'int', 'hours'].includes(d.kind), hint: d.hint });
    };
    cols.push({ key: 'institution', label: fields.planets[planet].institutionLabel, sortable: false, kind: 'column' });
    tdef.fields.filter(id => !shown.includes(id)).forEach(pushField);
    cols.push({ key: 'asOf', label: 'As of', sortable: false, kind: 'column' });
    if (coach) cols.push({ key: 'followUp', label: 'Flag for follow-up', sortable: false, kind: 'followUp' });
    if (tdef.stress) cols.push({ key: 'stress', label: 'Stress', sortable: false, kind: 'stress', hint: '1 calm to 5 keeps them up at night' });
    if (coach) cols.push({ key: 'notesPrivate', label: 'Private note', sortable: false, kind: 'column' });
    cols.push({ key: 'notesShared', label: 'Shared note', sortable: false, kind: 'column' });
    return cols;
  }
  function openDetails(rowId, focusCol) {
    const r = app.record.planets[planet].rows.find(x => x.id === rowId); if (!r) return;
    const body = h('div', { class: 'row-details', dataset: { row: r.id } });
    body.appendChild(h('h2', null, r.nickname || (tdef.nicknameLabel || 'Row'), h('span', { class: 'tag' }, tdef.label)));
    const live = () => app.record.planets[planet].rows.find(x => x.id === r.id) || r;
    const facts = h('div', { class: 'detail-group' }), about = h('div', { class: 'detail-group' });
    let anyFact = false;
    detailColumns().forEach(c => {
      const td = renderCell(r, c); if (!td) return;
      const control = h('div', { class: 'control' }); while (td.firstChild) control.appendChild(td.firstChild);
      const row = h('div', { class: 'fieldrow detail', dataset: { field: c.key } }, h('label', { title: c.hint || '' }, c.label), control);
      if (c.kind === 'field' && coach) {
        /* state and source beside every fact, patched in place after a change (D-034) */
        const st = h('span', { class: 'state' }), so = h('span', { class: 'src' });
        const paint = () => {
          const f = live().f[c.def.id] || { v: null, state: 'unknown', source: c.def.defaultSource || 'client' };
          clear(st); clear(so);
          st.appendChild(stateChip(f, s => { app.setField(r.id, c.def.id, f.v, s, f.source || 'client'); paint(); refreshDerived(r.id); }, { label: 'State of ' + c.def.label.toLowerCase(), exclude: c.def.id === primary.id ? [] : undefined }));
          so.appendChild(sourceChip(f, s => { app.setField(r.id, c.def.id, f.v, f.state || 'unknown', s); paint(); refreshDerived(r.id); }, { label: 'Source of ' + c.def.label.toLowerCase() }));
        };
        paint();
        control.querySelectorAll('input, select').forEach(el => el.addEventListener('change', () => setTimeout(paint, 0)));
        row.appendChild(st); row.appendChild(so);
        facts.appendChild(row); anyFact = true;
      } else if (c.kind === 'field') { facts.appendChild(row); anyFact = true; }
      else about.appendChild(row);
    });
    if (anyFact) { body.appendChild(h('h3', null, 'Facts')); body.appendChild(facts); }
    body.appendChild(h('h3', null, 'About this row')); body.appendChild(about);
    if (coach) body.appendChild(h('div', { class: 'row', style: { marginTop: '16px' } }, h('button', { class: 'btn quiet', onClick: () => { app.removeRow(r.id); closeOverlay(); render(); } }, 'Remove this row')));
    const back = wrap.querySelector('tr[data-row="' + r.id + '"] [data-col="details"]');
    app.openDrawer(body, { label: 'Details for ' + (r.nickname || tdef.label), onClose: () => { if (back && back.isConnected) back.focus(); } });
    const target = focusCol ? body.querySelector('[data-col="' + focusCol + '"]') : body.querySelector('input, select, button');
    if (target) target.focus();
  }

  function renderRow(r, cols) {
    const tr = h('tr', { dataset: { row: r.id } });
    cols.forEach(c => tr.appendChild(renderCell(r, c)));
    return tr;
  }

  function refreshDerived(rowId) {
    const r = app.record.planets[planet].rows.find(x => x.id === rowId);
    const tr = wrap.querySelector('tr[data-row="' + rowId + '"]');
    if (!r || !tr) return;
    const conf = tr.querySelector('[data-col="confidence"]');
    if (conf) conf.textContent = Math.round(rowConfidence(r) * 100) + '%';
    const st = tr.querySelector('td.cell-state'); if (st) { clear(st); st.appendChild(stateCell(r)); }
    const so = tr.querySelector('td.cell-source'); if (so) { clear(so); so.appendChild(sourceCell(r)); }
  }

  function stateCell(r) {
    const f = r.f[primary.id];
    if (!coach) return h('span', { class: 'chip state-' + ((f && f.state) || 'unknown') }, STATES[(f && f.state) || 'unknown'].label);
    return stateChip(f, s => { app.setField(r.id, primary.id, f ? f.v : null, s, (f && f.source) || primary.defaultSource || 'client'); refreshDerived(r.id); refreshCell(r.id, primary.id); }, { label: 'State of ' + primary.label.toLowerCase() });
  }
  function sourceCell(r) {
    const f = r.f[primary.id];
    if (!coach) return h('span', { class: 'chip src src-' + ((f && f.source) || 'client') }, SOURCES[(f && f.source) || 'client'].label);
    return sourceChip(f, s => { app.setField(r.id, primary.id, f ? f.v : null, (f && f.state) || 'unknown', s); refreshDerived(r.id); }, { label: 'Source of ' + primary.label.toLowerCase() });
  }

  function refreshCell(rowId, fieldId) {
    const r = app.record.planets[planet].rows.find(x => x.id === rowId);
    const el = wrap.querySelector('tr[data-row="' + rowId + '"] [data-col="' + fieldId + '"]');
    if (!r || !el || el === document.activeElement) return;
    const d = fieldDef(fields, fieldId);
    if (el.tagName === 'INPUT' && ['money', 'percent', 'int', 'hours', 'month', 'date'].includes(d.kind)) el.value = display(d, r.f[fieldId]);
  }

  function display(d, f) {
    if (!f || !hasValue(f)) {
      if (!f) return '';
      if (f.state === 'will-send') return 'Will send';
      if (f.state === 'not-applicable') return 'Not applicable';
      if (f.state === 'not-for-me') return 'Not for me';
      return '';
    }
    const rough = isRough(f);
    if (f.state === 'none') return d.kind === 'money' ? '$0' : d.kind === 'percent' ? '0.0%' : '0';
    switch (d.kind) {
      case 'money': return (f.v && typeof f.v === 'object') ? F.dollarsWhole(f.v.low, { rough: true }) + ' to ' + F.dollarsWhole(f.v.high) : F.dollarsWhole(f.v, { rough });
      case 'percent': return F.percent(f.v, { rough });
      case 'int': return F.integer(f.v, { rough });
      case 'hours': return F.hours(f.v, { rough });
      case 'month': return F.date(f.v, { rough });
      case 'date': return F.dateLong(f.v);
      default: return String(f.v);
    }
  }

  function renderCell(r, c) {
    if (c.kind === 'state') return h('td', { class: 'cell-state' }, stateCell(r));
    if (c.kind === 'source') return h('td', { class: 'cell-source' }, sourceCell(r));
    if (c.kind === 'cadence') return h('td', null, cadenceControl(r, c.def));
    if (c.kind === 'remove') return h('td', null, h('button', { class: 'btn small quiet', 'aria-label': 'Remove row', title: 'Remove row (Alt+Delete)', onClick: () => { app.removeRow(r.id); render(); } }, 'Remove'));
    if (c.kind === 'details') return h('td', { class: 'cell-details' }, h('button', { class: 'btn small quiet details-btn', dataset: { col: 'details' }, 'aria-label': 'Details for ' + (r.nickname || 'this row'), onClick: () => openDetails(r.id) }, h('span', { class: 'word' }, 'Details'), h('span', { class: 'glyph', 'aria-hidden': 'true' }, String.fromCharCode(0x203A))));
    if (c.kind === 'followUp') {
      const btn = h('button', { class: 'chip toggle' + (r.followUp ? ' amber' : ''), 'aria-pressed': String(!!r.followUp), 'aria-label': 'Follow up flag', dataset: { col: 'followUp' }, onClick: e => { const next = !r.followUp; app.setColumn(r.id, 'followUp', next); e.target.textContent = next ? 'Flagged' : 'Not flagged'; e.target.classList.toggle('amber', next); e.target.setAttribute('aria-pressed', String(next)); } }, r.followUp ? 'Flagged' : 'Not flagged');
      return h('td', null, keyFlow(btn, r, 'followUp'));
    }
    if (c.kind === 'stress') {
      const sel = h('select', { class: 'select', 'aria-label': 'Stress', dataset: { col: 'stress' }, onChange: e => app.setColumn(r.id, 'stress', e.target.value === '' ? null : parseInt(e.target.value, 10)) },
        h('option', { value: '' }, '-'), [1, 2, 3, 4, 5].map(n => h('option', { value: String(n), selected: r.stress === n }, String(n))));
      sel.style.width = '56px';
      return h('td', null, keyFlow(sel, r, 'stress'));
    }
    if (c.kind === 'column') {
      if (!coach && c.key === 'notesPrivate') return null;
      if (!coach) return h('td', { class: (c.key === 'asOf' ? 'small muted' : '') + (c.sticky ? ' sticky' : '') }, c.key === 'asOf' ? (r.asOf ? F.date(r.asOf) : h('span', { class: 'empty-token' }, 'Not entered')) : (r[c.key] || h('span', { class: 'empty-token' }, 'Not entered')));
      const input = h('input', { class: 'input' + (c.key === 'nickname' || c.key === 'notesPrivate' || c.key === 'notesShared' ? ' wide' : ''), type: 'text', value: c.key === 'asOf' ? (r.asOf ? F.date(r.asOf) : '') : (r[c.key] || ''), 'aria-label': c.label, dataset: { col: c.key },
        onChange: e => {
          if (c.key === 'asOf') {
            const t = e.target.value.trim();
            if (t === '') { app.setColumn(r.id, 'asOf', null); return; }
            const m = parseTyped('month', t);
            if (!m) return;
            app.setColumn(r.id, 'asOf', m.v); e.target.value = F.date(m.v);
          } else app.setColumn(r.id, c.key, e.target.value.trim());
        } });
      if (c.key === 'asOf') { input.style.width = '96px'; input.addEventListener('focus', () => { input.value = r.asOf || ''; }); input.addEventListener('blur', () => { const cur = app.record.planets[planet].rows.find(x => x.id === r.id); if (cur && cur.asOf) input.value = F.date(cur.asOf); }); }
      if (c.key === 'institution' && planet === 'debt' && typeId === 'card') input.setAttribute('list', 'mr3-issuers');
      if (c.sticky && coach && !tdef.single) {
        const box = h('input', { type: 'checkbox', class: 'pick', 'aria-label': 'Select row', checked: state.selected.has(r.id), onChange: e => { if (e.target.checked) state.selected.add(r.id); else state.selected.delete(r.id); render(); } });
        return h('td', { class: 'sticky with-pick' }, box, emptyWrap(input, keyFlow(input, r, c.key)));
      }
      return h('td', { class: c.sticky ? 'sticky' : null }, emptyWrap(input, keyFlow(input, r, c.key)));
    }
    /* a typed field */
    const d = c.def;
    const f = r.f[d.id];
    if (!coach) {
      if (f && f.state === 'not-applicable') return h('td', { class: c.num ? 'num' : null }, h('span', { class: 'empty-token', title: 'Not applicable' }, String.fromCharCode(0x2013)));
      if (f && f.state === 'will-send') return h('td', { class: c.num ? 'num' : null }, h('span', { class: 'empty-token' }, 'Will send'));
      const txt = display(d, f) || (f && f.state === 'unknown' ? 'Not entered' : '');
      if (d.kind === 'choice') { const o = (d.options || []).find(x => x[0] === (f && f.v)); return h('td', { class: c.num ? 'num' : null }, o ? o[1] : h('span', { class: 'empty-token' }, 'Not entered')); }
      if (d.kind === 'bool') return h('td', null, f && hasValue(f) ? (f.v ? 'Yes' : 'No') : h('span', { class: 'empty-token' }, 'Not entered'));
      if (d.kind === 'credits') return h('td', null, creditsSummary(r, f));
      return h('td', { class: c.num ? 'num' : null }, txt === 'Not entered' || txt === '' ? h('span', { class: 'empty-token' }, 'Not entered') : h('span', { class: isRough(f) ? 'rough-value' : null }, txt), d.cadence && f && hasValue(f) && f.cad ? h('span', { class: 'small muted cad-text' }, ' ' + CADENCE_SHORT[f.cad]) : null);
    }
    if (d.cadence) return h('td', { class: 'num' }, h('span', { class: 'cell-money' }, editor(r, d), cadenceControl(r, d)));
    return h('td', { class: c.num ? 'num' : null }, editor(r, d));
  }

  /* The cadence pill sits inside its amount cell: "$85 mo" reads as one fact. */
  function cadenceControl(r, d) {
    const f = r.f[d.id];
    if (!coach || (f && (f.state === 'not-applicable' || f.state === 'not-for-me'))) return h('span', { class: 'small muted cad-text' }, f && hasValue(f) && f.cad ? CADENCE_SHORT[f.cad] : '');
    const cad = h('select', { class: 'select cad', 'aria-label': d.label + ' cadence', dataset: { col: d.id + ':cad' }, onChange: e => {
      const cur = r.f[d.id] || { v: null, state: 'unknown', source: d.defaultSource || 'client' };
      app.setField(r.id, d.id, cur.v, cur.state, cur.source, e.target.value);
    } }, Object.keys(CADENCE_SHORT).map(k => h('option', { value: k, selected: (f && f.cad) === k || (!(f && f.cad) && d.defaultCadence === k) }, CADENCE_SHORT[k])));
    return keyFlow(cad, r, d.id + ':cad');
  }
  function creditsSummary(r, f) {
    const v = f && f.v && typeof f.v === 'object' ? f.v : null;
    if (!v) return h('span', { class: 'empty-token' }, 'Not entered');
    const names = Object.keys(v);
    const yes = names.filter(n => v[n] === 'yes').length, partly = names.filter(n => v[n] === 'partly').length;
    return h('span', null, yes + ' used' + (partly ? ', ' + partly + ' partly' : '') + ' of ' + names.length);
  }

  function editor(r, d) {
    const f = r.f[d.id];
    const commitTyped = (el, text) => {
      let parsed;
      try { parsed = parseTyped(d.kind, text); } catch (e) { app.toast(e.message); el.value = display(d, r.f[d.id]); return; }
      const cur = r.f[d.id] || { source: d.defaultSource || 'client' };
      if (!parsed) { app.setField(r.id, d.id, null, 'unknown', cur.source || 'client'); }
      else app.setField(r.id, d.id, parsed.v, parsed.state, cur.source || d.defaultSource || 'client');
      el.value = display(d, r.f[d.id]);
      refreshDerived(r.id);
      showFieldBar(r.id, d.id);
    };
    if (d.kind === 'choice') {
      const sel = h('select', { class: 'select' + (!f || !hasValue(f) ? ' is-empty' : '') + (d.id === 'category' || d.id === 'accountType' || d.id === 'loanType' || d.id === 'repaymentPlan' ? ' wide' : ''), 'aria-label': d.label, dataset: { col: d.id }, onChange: e => {
        const v = e.target.value;
        const cur = r.f[d.id] || {};
        if (v === '') app.setField(r.id, d.id, null, 'unknown', cur.source || 'client'); else app.setField(r.id, d.id, v, 'known', cur.source || 'client');
        e.target.classList.toggle('is-empty', v === ''); refreshDerived(r.id);
      } }, h('option', { value: '' }, 'Not entered'), (d.options || []).map(o => h('option', { value: o[0], selected: f && f.v === o[0] }, o[1])));
      return keyFlow(sel, r, d.id);
    }
    if (d.kind === 'bool') {
      const sel = h('select', { class: 'select' + (!f || !hasValue(f) ? ' is-empty' : ''), 'aria-label': d.label, dataset: { col: d.id }, onChange: e => {
        const v = e.target.value; const cur = r.f[d.id] || {};
        if (v === '') app.setField(r.id, d.id, null, 'unknown', cur.source || 'client'); else app.setField(r.id, d.id, v === 'yes', 'known', cur.source || 'client');
        e.target.classList.toggle('is-empty', v === ''); refreshDerived(r.id);
      } }, h('option', { value: '' }, 'Not entered'), h('option', { value: 'yes', selected: f && f.v === true }, 'Yes'), h('option', { value: 'no', selected: f && f.v === false }, 'No'));
      sel.style.width = '96px';
      return keyFlow(sel, r, d.id);
    }
    if (d.kind === 'credits') {
      const btn = h('button', { class: 'btn small', dataset: { col: d.id }, onClick: () => openCredits(r, d) }, creditsSummary(r, f).textContent || 'Credits');
      return keyFlow(btn, r, d.id);
    }
    const input = h('input', { class: 'input' + (['money', 'percent', 'int', 'hours'].includes(d.kind) ? ' num' : '') + (d.kind === 'text' ? ' wide' : ''), type: 'text', inputmode: ['money', 'percent', 'int', 'hours'].includes(d.kind) ? 'decimal' : null, value: display(d, f), 'aria-label': d.label, dataset: { col: d.id }, title: d.hint || null });
    if (d.kind === 'text') {
      input.addEventListener('change', e => {
        const t = e.target.value.trim(); const cur = r.f[d.id] || {};
        const word = parseTyped('text', t);
        if (t === '') app.setField(r.id, d.id, null, 'unknown', cur.source || 'client');
        else if (word && word.v === null) { app.setField(r.id, d.id, null, word.state, cur.source || 'client'); e.target.value = display(d, r.f[d.id]); }
        else { app.setField(r.id, d.id, t, 'known', cur.source || 'client'); libraryPrefill(r, d, t); }
        refreshDerived(r.id);
      });
      if (d.library === 'cards') input.setAttribute('list', 'mr3-cards');
      if (d.library === 'funds') { input.setAttribute('list', 'mr3-funds'); input.classList.remove('wide'); }
    } else {
      input.addEventListener('focus', () => { input.value = rawOf(d.kind, r.f[d.id]); input.select(); });
      input.addEventListener('blur', () => { const cur = r.f[d.id]; input.value = display(d, cur); input.classList.toggle('rough', !!cur && isRough(cur)); });
      if (f && isRough(f)) input.classList.add('rough');
      input.addEventListener('change', e => commitTyped(input, e.target.value));
    }
    if (d.kind === 'text') return emptyWrap(input, keyFlow(input, r, d.id));
    return keyFlow(input, r, d.id);
  }

  /* Library prefill: a card name or a ticker fills the row's lookup fields. */
  function libraryPrefill(r, d, text) {
    if (d.library === 'cards') {
      const card = app.data.cards.cards.find(c => (c.issuer + ' ' + c.name).toLowerCase() === text.toLowerCase() || c.name.toLowerCase() === text.toLowerCase());
      if (!card) return;
      app.setColumn(r.id, 'lib', card.id);
      app.setColumn(r.id, 'institution', card.issuer);
      app.setField(r.id, 'annualFee', card.annualFeeCents, card.annualFeeCents === 0 ? 'none' : 'known', 'lookup-verify', 'year');
      const credits = {};
      card.credits.forEach(c => { credits[c.name] = 'no'; });
      if (card.credits.length) app.setField(r.id, 'creditsUsed', credits, 'rough', 'lookup-verify');
      else app.setField(r.id, 'creditsUsed', null, 'none', 'lookup-verify');
      if (!r.nickname) app.setColumn(r.id, 'nickname', card.name);
      app.toast('Prefilled from the card library: ' + card.issuer + ' ' + card.name + ' (verify)');
      render();
    }
    if (d.library === 'funds') {
      const fund = app.data.funds.funds.find(fn => fn.ticker.toLowerCase() === text.toLowerCase());
      if (!fund) return;
      app.setColumn(r.id, 'lib', fund.ticker);
      app.setField(r.id, 'fundName', fund.name, 'known', 'lookup-verify');
      app.setField(r.id, 'expenseRatio', fund.expenseRatio, 'known', 'lookup-verify');
            if (!r.nickname) app.setColumn(r.id, 'nickname', fund.ticker);
      app.toast('Prefilled from the fund library: ' + fund.ticker + ' (verify)');
      render();
    }
  }

  function openCredits(r, d) {
    const card = r.lib ? app.data.cards.cards.find(c => c.id === r.lib) : null;
    const f = r.f[d.id];
    const current = f && f.v && typeof f.v === 'object' ? Object.assign({}, f.v) : {};
    if (!card || !card.credits.length) {
      app.openDrawer(h('div', null, h('h2', null, 'Statement credits'), h('p', { class: 'muted', style: { marginTop: '8px' } }, card ? 'This card has no statement credits in the library.' : 'Pick a card from the library in the Card column first; its credits appear here.')));
      return;
    }
    const body = h('div', null, h('h2', null, card.issuer + ' ' + card.name), h('p', { class: 'muted small', style: { margin: '4px 0 12px' } }, 'For each credit: does the client actually use it?'),
      h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Credit'), h('th', { class: 'num' }, 'Value a year'), h('th', null, 'Used'))),
        h('tbody', null, card.credits.map(c => h('tr', null, h('td', null, c.name), h('td', { class: 'num' }, F.dollars(c.annualValueCents)),
          h('td', null, h('select', { class: 'select', 'aria-label': 'Uses ' + c.name, onChange: e => { current[c.name] = e.target.value; app.setField(r.id, d.id, Object.assign({}, current), 'known', 'client'); const b = wrap.querySelector('tr[data-row="' + r.id + '"] [data-col="' + d.id + '"]'); if (b) b.textContent = creditsSummary(r, r.f[d.id]).textContent; refreshDerived(r.id); } },
            ['no', 'partly', 'yes'].map(o => h('option', { value: o, selected: (current[c.name] || 'no') === o }, o === 'no' ? 'No' : o === 'partly' ? 'Partly' : 'Yes')))))))));
    app.openDrawer(body);
  }

  /* Keyboard: Enter moves down the column (adds a row at the end), Alt+N adds, Alt+Delete removes. */
  function keyFlow(el, r, colKey) {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && el.tagName !== 'BUTTON') {
        e.preventDefault();
        if (el.tagName === 'INPUT') el.dispatchEvent(new Event('change', { bubbles: true }));
        const trs = Array.from(wrap.querySelectorAll('tbody tr'));
        const i = trs.findIndex(t => t.dataset.row === r.id);
        const next = trs[i + 1];
        if (next) { const t = next.querySelector('[data-col="' + colKey + '"]'); if (t) t.focus(); }
        else if (!tdef.single) addRow(colKey);
      }
      if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); addRow(); }
      if (e.altKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); openDetails(r.id); }
      if (e.altKey && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); app.removeRow(r.id); render(); }
      if (e.altKey && (e.key === 's' || e.key === 'S' || e.key === 'o' || e.key === 'O') && fields.fields[colKey]) {
        e.preventDefault();
        showFieldBar(r.id, colKey);
        const sel = wrap.querySelector('.fieldbar select[aria-label^="' + (e.key.toLowerCase() === 's' ? 'State of' : 'Source of') + '"]');
        if (sel) { sel.dataset.returnTo = r.id + '|' + colKey; sel.focus(); }
      }
    });
    el.addEventListener('focus', () => { if (fields.fields[colKey]) showFieldBar(r.id, colKey); });
    return el;
  }

  function fieldBar() {
    return h('div', { class: 'fieldbar', id: 'fieldbar-' + planet + '-' + typeId }, h('span', { class: 'muted small' }, 'Pick a cell for its state and source. ~ rough, ? unknown, 1500-2000 range, send, 0 is a real zero.'));
  }
  function showFieldBar(rowId, fieldId, colKey) {
    const bar = wrap.querySelector('.fieldbar');
    if (!bar) return;
    bar.classList.add('active');
    clear(bar);
    const r = app.record.planets[planet].rows.find(x => x.id === rowId);
    if (!r) return;
    if (!fieldId) { bar.appendChild(h('span', { class: 'small muted' }, colLabel(colKey) + ' is a row column: no state or source.')); return; }
    const d = fieldDef(fields, fieldId);
    const f = r.f[fieldId] || { v: null, state: 'unknown', source: d.defaultSource || 'client' };
    bar.appendChild(h('strong', null, d.label));
    bar.appendChild(h('span', { class: 'small muted', style: { flex: 1 } }, d.hint || ''));
    const back = () => { const cell = wrap.querySelector('tr[data-row="' + r.id + '"] [data-col="' + d.id + '"]') || document.querySelector('.row-details[data-row="' + r.id + '"] [data-col="' + d.id + '"]'); if (cell) cell.focus(); };
    bar.appendChild(stateChip(f, s => { app.setField(r.id, d.id, f.v, s, f.source); refreshDerived(r.id); refreshCell(r.id, d.id); showFieldBar(r.id, d.id); back(); }, { label: 'State of ' + d.label.toLowerCase() }));
    bar.appendChild(sourceChip(f, s => { app.setField(r.id, d.id, f.v, f.state, s); refreshDerived(r.id); showFieldBar(r.id, d.id); back(); }, { label: 'Source of ' + d.label.toLowerCase() }));
    bar.appendChild(h('span', { class: 'small muted' }, h('span', { class: 'kbd' }, 'Alt+S'), ' state ', h('span', { class: 'kbd' }, 'Alt+O'), ' source'));
    bar.appendChild(h('span', { class: 'small muted' }, 'conf. ' + Math.round(confidenceOf(f) * 100) + '%'));
  }
  function colLabel(k) { return { nickname: tdef.nicknameLabel || 'Nickname', institution: 'Institution', asOf: 'As of', notesPrivate: 'Private note', notesShared: 'Shared note', stress: 'Stress' }[k] || k; }

  ensureDatalists(app);
  render();
  /* Totals follow every keystroke without rebuilding the live inputs: only the footer is replaced. */
  function refreshTotals() {
    const table = wrap.querySelector('table.ledger-table, table.data');
    if (!table) return;
    const old = table.querySelector('tfoot.totals');
    const fresh = totalsRow(rows(), columns());
    if (old && fresh) old.replaceWith(fresh); else if (old) old.remove(); else if (fresh) table.appendChild(fresh);
  }

  return { render, addRow, refreshTotals, openDetails };
}

/* A text input shows "Not entered" while empty (no browser hint text). */
function emptyWrap(input, el) {
  const wrap = h('span', { class: 'control cellwrap' + (input.value === '' ? ' is-empty' : '') }, el);
  input.addEventListener('input', () => wrap.classList.toggle('is-empty', input.value === ''));
  input.addEventListener('change', () => wrap.classList.toggle('is-empty', input.value === ''));
  return wrap;
}

function ensureDatalists(app) {
  if (document.getElementById('mr3-cards')) return;
  const cards = h('datalist', { id: 'mr3-cards' }, app.data.cards.cards.map(c => h('option', { value: c.issuer + ' ' + c.name })));
  const issuers = h('datalist', { id: 'mr3-issuers' }, Array.from(new Set(app.data.cards.cards.map(c => c.issuer))).map(i => h('option', { value: i })));
  const funds = h('datalist', { id: 'mr3-funds' }, app.data.funds.funds.map(f => h('option', { value: f.ticker }, f.name)));
  document.body.appendChild(cards); document.body.appendChild(issuers); document.body.appendChild(funds);
}

/* Simulate: scenario blocks on a timeline over the real facts. Each block
   answers a few questions; the chart shows today's path, each block alone and
   all together; Promote is the only way a block reaches the Ledger (as a Life
   plan goal, through the record API). The editor is built once per selected
   block and patched in place (D-034). */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import * as Charts from '../charts.js';
import { compare, newBlock, blockCosts, costSentence, startLabel, parseStart, roommateOutcome } from '../../engine/scenarios.js';
import { createRow } from '../../engine/record.js';
import { freshFacts } from '../../engine/fields.js';
import { questionField, liveFigures, startPicker } from '../startingsoon.js';
import { setDateValue } from '../datepicker.js';

export function mount(host, app) {
  const defs = app.data.scenarioBlocks;
  const coach = app.view === 'coach';
  host.appendChild(h('header', null, h('h1', null, coach ? 'Simulate' : 'What if'),
    coach ? h('span', { class: 'sub' }, 'Each block runs on a copy of the real numbers. Only Add to Life plan writes one to the record.') : null));
  const body = h('div', { class: 'stack' }); host.appendChild(body);
  const emptyHost = h('div');
  const panel = h('section', { class: 'panel' });
  const headRow = h('h2', { class: 'row' }); const laneHost = h('div'); const noteHost = h('div'); const editorHost = h('div');
  panel.appendChild(headRow); panel.appendChild(laneHost); panel.appendChild(noteHost); panel.appendChild(editorHost);
  const cmpHost = h('div');
  body.appendChild(emptyHost); body.appendChild(panel); body.appendChild(cmpHost);
  let selected = null, editorFor = null, costLine = null, startInput = null, actionHost = null, roommateHost = null;

  const live = () => liveFigures(app);
  const cur = id => (app.record.scenarios || []).find(s => s.id === id);
  function draw() {
    clear(emptyHost); clear(laneHost); clear(noteHost); clear(headRow); clear(cmpHost);
    const inp = app.result.projectionInputs;
    const blocks = (app.record.scenarios || []).filter(b => defs.types[b.type]); /* a block whose type is gone is skipped */
    panel.style.display = 'none'; cmpHost.style.display = 'none';
    if (!inp) {
      emptyHost.appendChild(h('div', { class: 'empty' }, h('h2', null, coach ? 'Nothing to simulate yet' : 'Nothing to try yet'), h('p', null, 'Needs income, spending, account balances and a birth date.'),
        h('p', null, [['Income', '#/ledger/income'], ['Spending', '#/ledger/spending'], ['Investments', '#/ledger/invest'], ['Birth date', '#/home']].flatMap(([t, href], i) => [i ? ' ' : null, h('a', { class: 'next', href }, t)]))));
      return;
    }
    if (!coach && !blocks.length) {
      emptyHost.appendChild(h('div', { class: 'empty' }, h('h2', null, 'No what-ifs yet'), h('p', null, 'Your coach adds these in a session, for example a home, a child or a job change. Each one runs on a copy of your numbers.')));
      return;
    }
    panel.style.display = '';
    const year0 = inp.year + 1, yearN = inp.year + (inp.asm.projectionEndAge - inp.age);
    if (coach && selected && !cur(selected)) selected = null;
    if (coach && !selected && blocks.length) selected = blocks[0].id;
    headRow.appendChild(document.createTextNode('Timeline'));
    if (coach) headRow.appendChild(h('span', { class: 'tag hide-narrow' }, 'drag, or use the arrow keys'));
    if (coach) headRow.appendChild(h('select', { class: 'select add-block', 'aria-label': 'Add a block', onChange: e => { const t = e.target.value; e.target.value = ''; if (!t) return; const b = newBlock(t, defs, year0 + 3); selected = b.id; app.mutate(rec => { rec.scenarios.push(b); }, 'scenarios'); } },
      h('option', { value: '' }, 'Add a block'), Object.keys(defs.types).map(t => h('option', { value: t }, defs.types[t].label))));
    laneHost.appendChild(lane(blocks, inp, year0, yearN));
    if (coach && !blocks.length) noteHost.appendChild(h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'No blocks yet. Pick one from Add a block; it starts three years out.'));
    if (coach && selected) {
      if (editorFor !== selected || !editorHost.firstChild) { clear(editorHost); editorHost.appendChild(buildEditor(cur(selected), year0, yearN)); }
      refreshEditor();
    } else { clear(editorHost); editorFor = null; }
    if (blocks.length) { cmpHost.style.display = ''; comparison(blocks, inp); }
  }

  function lane(blocks, inp, year0, yearN) {
    const tl = h('div', { class: 'timeline', role: 'list', 'aria-label': 'Timeline' });
    const span = yearN - year0; const pct = y => ((y - year0) / span * 100);
    const endAge = inp.asm.projectionEndAge, firstAge = Math.ceil((inp.age + 1) / 10) * 10;
    for (let a = firstAge; a <= endAge; a += 10) {
      const y = inp.year + (a - inp.age);
      tl.appendChild(h('div', { class: 'tick', style: { left: pct(y) + '%' } }, h('span', null, a === firstAge ? 'age ' + a : String(a))));
    }
    const L = live();
    const sorted = blocks.slice().sort((a, b) => a.startYear - b.startYear);
    const laneEnd = []; const lanes = new Map();
    sorted.forEach(b => {
      const c = blockCosts(defs.types[b.type], b, L); const end = b.startYear + Math.max(1, c.duration);
      let k = laneEnd.findIndex(e => e <= b.startYear);
      if (k === -1) { k = laneEnd.length; laneEnd.push(end); } else laneEnd[k] = end;
      lanes.set(b.id, k);
    });
    tl.style.height = (blocks.length ? 8 + laneEnd.length * 32 + 24 : 40) + 'px';
    sorted.forEach(b => {
      const def = defs.types[b.type]; const c = blockCosts(def, b, L);
      const attrs = { class: 'block' + (selected === b.id ? ' selected' : '') + (b.promoted ? ' promoted' : ''), role: 'listitem', title: b.name + ' from ' + startLabel(b), dataset: { block: b.id },
        style: { left: pct(b.startYear) + '%', width: Math.max(4, pct(b.startYear + Math.max(1, c.duration)) - pct(b.startYear)) + '%', top: (8 + lanes.get(b.id) * 32) + 'px' } };
      if (coach) {
        attrs.tabindex = '0'; attrs.draggable = 'true';
        attrs.onClick = () => { selected = b.id; draw(); };
        attrs.onKeyDown = e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const d = e.key === 'ArrowLeft' ? -1 : 1; selected = b.id; app.mutate(rec => { const x = rec.scenarios.find(s => s.id === b.id); x.startYear = Math.min(yearN, Math.max(year0, x.startYear + d)); }, 'scenarios'); } };
      }
      const el = h('div', attrs);
      if (coach) el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', b.id); e.dataTransfer.effectAllowed = 'move'; });
      el.appendChild(h('span', { class: 'block-glyph' }, def.glyph));
      el.appendChild(h('span', { class: 'block-label' }, b.name + ', ' + startLabel(b)));
      tl.appendChild(el);
    });
    if (coach) {
      tl.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      tl.addEventListener('drop', e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); const rect = tl.getBoundingClientRect(); const year = Math.round(year0 + (e.clientX - rect.left) / rect.width * span); selected = id; app.mutate(rec => { const x = rec.scenarios.find(s => s.id === id); if (x) x.startYear = Math.min(yearN, Math.max(year0, year)); }, 'scenarios'); });
    }
    return tl;
  }

  /* LIVE-FORM: built once per selected block; draw() patches the cost line, start year and actions in place. */
  function buildEditor(b, year0, yearN) {
    editorFor = b.id;
    const def = defs.types[b.type];
    const ed = h('div', { class: 'block-editor' });
    ed.appendChild(h('h3', { title: def.note }, b.name, h('span', { class: 'tag' }, def.label)));
    ed.appendChild(h('div', { class: 'fieldrow' }, h('label', null, 'Name'), h('div', { class: 'control' }, h('input', { class: 'input', value: b.name, 'aria-label': 'Block name', onChange: e => app.mutate(rec => { rec.scenarios.find(s => s.id === b.id).name = e.target.value.trim() || def.label; }, 'scenarios') }))));
    startInput = startPicker(app, b, { label: 'Start year' });
    ed.appendChild(h('div', { class: 'fieldrow' }, h('label', null, 'Starts in'), h('div', { class: 'control' }, startInput)));
    def.questions.forEach(qd => ed.appendChild(h('div', { class: 'fieldrow' }, h('label', { title: qd.hint || '' }, qd.label), h('div', { class: 'control' }, questionField(app, b, qd)))));
    costLine = h('p', { class: 'hint', style: { marginTop: '8px' } });
    ed.appendChild(costLine);
    roommateHost = def.roommate ? h('div', { class: 'fallsonyou' }) : null;
    if (roommateHost) ed.appendChild(roommateHost);
    actionHost = h('div', { class: 'row', style: { marginTop: '8px' } });
    ed.appendChild(actionHost);
    return ed;
  }
  function refreshEditor() {
    const b = cur(editorFor); if (!b) return;
    const def = defs.types[b.type];
    costLine.textContent = costSentence(blockCosts(def, b, live()));
    if (roommateHost) { clear(roommateHost); roommateHost.appendChild(roommateCard(roommateOutcome(app.result, b, def))); }
    setDateValue(startInput, b.startYear + '-' + String(b.startMonth || 1).padStart(2, '0'));
    clear(actionHost);
    actionHost.appendChild(b.promoted ? h('span', { class: 'chip state-known' }, 'In the Life plan') : h('button', { class: 'btn primary', onClick: () => promote(b) }, 'Add to Life plan'));
    actionHost.appendChild(h('button', { class: 'btn quiet', onClick: () => { app.mutate(rec => { rec.scenarios = rec.scenarios.filter(s => s.id !== b.id); }, 'scenarios'); selected = null; app.toast('Block removed'); } }, 'Remove block'));
  }
  function promote(b) {
    const def = defs.types[b.type]; const c = blockCosts(def, b, live());
    if (c.needs) { app.toast('Needs ' + c.needs.join(' and ') + ' before this block can be promoted.'); return; }
    const row = createRow('life', 'goal', { nickname: b.name, notesShared: 'Promoted from a scenario block (' + def.label + ')', f: freshFacts(app.data.fields, 'life', 'goal') });
    row.f.goalCost = { v: Math.max(0, c.oneOff), state: 'rough', source: 'client' };
    row.f.targetDate = { v: String(b.startYear) + '-' + String(b.startMonth || 1).padStart(2, '0'), state: 'known', source: 'client' };
    row.f.priority = { v: '2', state: 'known', source: 'client' };
    app.addRow(row);
    app.mutate(rec => { const x = rec.scenarios.find(s => s.id === b.id); x.promoted = true; x.rowId = row.id; }, 'scenarios');
    app.toast('Promoted: a Life plan goal now carries the one-off cost and the year.');
  }

  /* If it all falls on you (MR-047): the roommate block's own card, from roommateOutcome; no math here. */
  function roommateCard(o) {
    const money = c => F.dollarsWhole(c); const months = m => m === null ? 'needs cash' : F.months(m);
    if (!o) return h('p', { class: 'muted small' }, 'Needs the real numbers first.');
    if (o.needs) return h('p', { class: 'muted small' }, 'Needs ' + o.needs.join(' and ') + '. Mark a spending line as shared in the Ledger.');
    return h('div', { class: 'fallsonyou-card' }, h('h4', null, 'If it all falls on you'),
      h('div', { class: 'kpis compact' },
        h('div', { class: 'kpi' }, h('div', { class: 'label' }, 'Shared bills become'), h('div', { class: 'value' }, money(o.newSharedMonthly) + ' a month'), h('div', { class: 'range' }, 'a jump of ' + money(o.jumpMonthly))),
        h('div', { class: 'kpi' }, h('div', { class: 'label' }, 'Bridge for ' + o.months + (o.months === 1 ? ' month' : ' months')), h('div', { class: 'value' }, money(o.bridge)), h('div', { class: 'range' }, o.oneTime ? 'includes ' + money(o.oneTime) + ' one-time' : 'the gap until someone new moves in')),
        h('div', { class: 'kpi' }, h('div', { class: 'label' }, 'Cash covers'), h('div', { class: 'value' }, months(o.cushionMonthsAtNewCost)), h('div', { class: 'range' }, 'now ' + months(o.cushionMonthsNow)))),
      o.permanent && o.newFiNumber ? h('p', { class: 'small' }, 'Keeping the place alone: savings rate ' + F.percent(o.oldSavingsRate, { places: 0 }) + ' becomes ' + F.percent(o.newSavingsRate, { places: 0 }) + '; FI number ' + F.dollarsCompact(o.oldFiNumber) + ' becomes ' + F.dollarsCompact(o.newFiNumber) + '.') : null,
      h('p', { class: 'small muted' }, o.leaseNote));
  }

  function comparison(blocks, inp) {
    const c = compare(inp, blocks, defs, live());
    const sec = h('section', { class: 'panel' }, h('h2', null, 'Each alone and together'));
    cmpHost.appendChild(sec);
    const chartHost = h('div'); sec.appendChild(chartHost);
    Charts.render('paths', chartHost, c, { client: !coach, title: 'Net worth paths' });
    const fmtAge = a => a === null ? 'never by 95' : 'age ' + a;
    const moved = (age, d) => d === null ? fmtAge(age) : fmtAge(age) + ', ' + (d === 0 ? 'same' : d > 0 ? d + (d === 1 ? ' year later' : ' years later') : (-d) + (d === -1 ? ' year earlier' : ' years earlier'));
    const worth = (v, d) => F.dollarsCompact(v) + (d === null || d === undefined ? '' : ' (' + (d >= 0 ? '+' : '-') + F.dollarsCompact(Math.abs(d)) + ')');
    const row = (name, age, worthText, cls) => h('tr', null, h('td', { class: cls || null }, name), h('td', null, age), h('td', { class: 'num' }, worthText));
    const rows = [row('Today\'s path', fmtAge(c.baseline.fiAge), worth(c.baseline.at95))].concat(c.alone.map(a => a.costs.needs
      ? row(a.name + ' alone', 'needs ' + a.costs.needs.join(' and '), 'needs')
      : row(a.name + ' alone', moved(a.fiAge, a.fiDelta), worth(a.at95, a.at95Delta))));
    const foot = h('tfoot', null, h('tr', null, h('td', null, 'All together'), h('td', null, moved(c.together.fiAge, c.together.fiDelta)), h('td', { class: 'num' }, worth(c.together.at95, c.together.at95Delta))));
    sec.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', null, 'Path'), h('th', null, coach ? 'FI age' : 'Could stop working at'), h('th', { class: 'num' }, 'Net worth at 95'))), h('tbody', null, rows), foot)));
    (c.notes || []).forEach(text => sec.appendChild(h('p', { class: 'hint compare-note', style: { marginTop: '8px' } }, text)));
  }

  draw();
  return { update() { draw(); } };
}

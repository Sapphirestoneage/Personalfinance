/* The goal timeline (Level 11, MR-051): one sentence, months across the top,
   one row per goal with the starter cushion first, the allocation table, the
   mode switch with the three-mode comparison, and the what-ifs (surplus up or
   down, a windfall, using the cushion, a new order) that never write to the
   record until Confirm. Views never do math: every number comes from
   engine/goals.js through the result or planGoals(). */
import { h, clear, download } from '../dom.js';
import * as F from '../../engine/format.js';
import { planGoals, finishChanges, finishMonths, MODES, MODE_LABELS, MODE_HELP } from '../../engine/goals.js';
import { addMonths, monthsBetween } from '../../engine/debtsim.js';
import { icsOf, goalEvents } from '../../engine/ics.js';
import { parseSaid } from '../../engine/parse.js';
import { clientName, closeOverlay } from '../app.js';

const ZOOMS = [['24', '2 years', 24], ['60', '5 years', 60], ['fi', 'Until FI', null]];

export function mount(host, app) {
  const coach = () => app.view === 'coach'; const gentle = () => (app.record.sessionMode || 'standard') === 'gentle';
  let zoom = '24'; let whatIf = { surplusDelta: 0, events: [], order: null, mode: null, splits: null, overrides: null };
  const header = h('header', null, h('h1', null, coach() ? 'Goals' : 'Your goals'), h('span', { class: 'sub' }, coach() ? 'Every goal funded at once from the monthly surplus; the starter cushion always first.' : 'Everything you are saving for, all at the same time.'), h('div', { class: 'actions' },
    h('div', { class: 'view-toggle', role: 'group', 'aria-label': 'How far to look' }, ZOOMS.map(([id, label]) => h('button', { 'aria-pressed': String(zoom === id), onClick: () => { zoom = id; draw(); } }, label))),
    h('button', { class: 'btn', onClick: () => addToCalendar() }, 'Add to calendar'),
    h('button', { class: 'btn coach-only', onClick: () => addGoal() }, 'Add a goal')));
  host.appendChild(header);
  const sentence = h('p', { class: 'gtl-sentence big' }); host.appendChild(sentence);
  const whatifPanel = h('section', { class: 'panel whatif' }); host.appendChild(whatifPanel);
  const tlPanel = h('section', { class: 'panel' }); host.appendChild(tlPanel);
  const grid = h('div', { class: 'grid grid-2' }); const allocPanel = h('section', { class: 'panel' }); const cmpPanel = h('section', { class: 'panel' }); grid.appendChild(allocPanel); grid.appendChild(cmpPanel); host.appendChild(grid);

  const isWhatIf = () => whatIf.surplusDelta !== 0 || whatIf.events.length > 0 || whatIf.order !== null || whatIf.mode !== null || whatIf.splits !== null || whatIf.overrides !== null;
  const plan = () => isWhatIf() ? planGoals(app.record, app.result, whatIf) : app.result.goalPlan;
  const money = c => F.dollarsWhole(c);
  const monthWord = ym => ym ? F.date(ym) : '';
  const nameOf = i => coach() ? i.name : (i.id === 'starter' ? 'Starter cushion' : i.id === 'full' ? 'Full cushion' : i.type === 'debt' ? 'Pay off ' + i.name : i.clientName || i.name);
  const lowerName = i => { const n = nameOf(i); if (i.type === 'debt') return 'paying off ' + i.name; return /^(Starter|Full) cushion$/.test(n) ? 'your ' + n.toLowerCase() : n; };

  function draw() {
    header.querySelectorAll('.view-toggle button').forEach((b, k) => b.setAttribute('aria-pressed', String(ZOOMS[k][0] === zoom)));
    const P = plan(); const base = app.result.goalPlan;
    drawSentence(P); drawWhatIf(P, base); drawTimeline(P); drawAlloc(P); drawCompare(P);
  }
  function drawSentence(P) {
    clear(sentence);
    if (!P.surplusKnown) { sentence.appendChild(h('span', null, 'This needs take-home, spending and debt minimums first. ')); sentence.appendChild(h('a', { class: 'next', href: '#/ledger/income' }, 'Open the Ledger')); return; }
    if (P.input.surplusMonthly <= 0) { sentence.textContent = gentle() ? 'Nothing is left over for goals yet; the picture comes first.' : 'Nothing is left over for goals yet: spending and minimums take all of take-home.'; return; }
    if (!P.next) { sentence.textContent = 'Every goal here is done.'; return; }
    const it = P.input.items.find(i => i.id === P.next.id);
    sentence.textContent = 'Your next win is ' + lowerName(it) + ', in ' + monthWord(P.next.month) + '.';
  }
  function drawWhatIf(P, base) {
    clear(whatifPanel);
    whatifPanel.appendChild(h('h2', null, coach() ? 'What if' : 'Try something', h('span', { class: 'tag' }, isWhatIf() ? 'trying; nothing is saved yet' : 'nothing changed')));
    const surplusNow = P.input.surplusMonthly; const surplusBase = base.input.surplusMonthly;
    whatifPanel.appendChild(h('div', { class: 'row whatif-row' },
      h('span', { class: 'small' }, (whatIf.surplusDelta ? 'Trying ' : 'Using ') + money(surplusNow) + ' a month' + (whatIf.surplusDelta ? ' (' + (whatIf.surplusDelta > 0 ? '+' : '') + money(whatIf.surplusDelta) + ')' : '')),
      h('button', { class: 'btn small', 'aria-label': 'Less: 100 dollars a month less', onClick: () => { whatIf.surplusDelta -= 10000; draw(); } }, '-$100 a month'),
      h('button', { class: 'btn small', 'aria-label': 'More: 100 dollars a month more', onClick: () => { whatIf.surplusDelta += 10000; draw(); } }, '+$100 a month'),
      eventControl('windfall', 'A windfall', 'Windfall amount', 'Add it'),
      eventControl('withdraw', 'Use the cushion', 'Amount used', 'Use it'),
      h('span', { class: 'spacer' }),
      isWhatIf() ? h('button', { class: 'btn', onClick: () => { whatIf = { surplusDelta: 0, events: [], order: null, mode: null, splits: null, overrides: null }; draw(); } }, 'Reset') : null,
      (whatIf.order || whatIf.mode || whatIf.splits || whatIf.overrides) ? h('button', { class: 'btn primary', onClick: confirm }, 'Confirm') : null));
    if (whatIf.events.length) whatifPanel.appendChild(h('div', { class: 'row small' }, whatIf.events.map((e, k) => h('span', { class: 'chip toggle' }, (e.kind === 'windfall' ? 'Windfall ' : 'Used ') + money(e.cents) + ' in ' + monthWord(e.month), ' ', h('button', { 'aria-label': 'Remove this what-if', onClick: () => { whatIf.events.splice(k, 1); draw(); } }, 'x')))));
    if (isWhatIf()) {
      const ch = finishChanges(finishMonths(base), finishMonths(P), P.input.items.map(i => Object.assign({}, i, { name: nameOf(i) })));
      whatifPanel.appendChild(h('p', { class: 'small whatif-moves' }, ch.length ? ch.slice(0, 4).map(c => c.text).join('. ') + '.' : 'No date moves.'));
    }
    whatifPanel.appendChild(h('p', { class: 'small muted' }, coach() ? 'Surplus, windfall and cushion what-ifs stay here. Confirm saves a new order, mode, split or locked amount to the record.' : 'Nothing here changes your plan until your coach confirms it.'));
  }
  function eventControl(kind, label, amountLabel, go) {
    const months = Array.from({ length: 24 }, (_, k) => addMonths((app.result.today || new Date().toISOString()).slice(0, 7), k));
    const sel = h('select', { class: 'select', 'aria-label': label + ' month' }, months.map(m => h('option', { value: m }, monthWord(m))));
    const amt = h('input', { class: 'input num', style: { width: '96px' }, 'aria-label': amountLabel, title: 'like 2,000' });
    const add = () => { const p = parseSaid(amt.value); if (!p || !(p.cents > 0)) { app.toast('A number first, like 2,000.'); return; } whatIf.events.push({ kind, month: sel.value, cents: p.cents }); draw(); };
    amt.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    return h('span', { class: 'row whatif-event' }, h('span', { class: 'small muted' }, label), sel, amt, h('button', { class: 'btn small', onClick: add }, go));
  }
  function confirm() {
    const patch = {};
    if (whatIf.order) patch.order = whatIf.order.filter(id => id !== 'starter');
    if (whatIf.mode) patch.mode = whatIf.mode;
    if (whatIf.splits) patch.splits = whatIf.splits;
    if (whatIf.overrides) patch.overrides = whatIf.overrides;
    app.goals(patch);
    whatIf.order = null; whatIf.mode = null; whatIf.splits = null; whatIf.overrides = null;
    app.toast('Saved to the plan.'); draw();
  }

  /* ---- the timeline ---- */
  function drawTimeline(P) {
    clear(tlPanel);
    const from = P.input.from; const months = P.run.months;
    const lastFinite = Object.values(P.run.goals).map(g => g.finishMonth).filter(Boolean).sort().pop();
    const lastLong = P.input.items.filter(i => i.type === 'long-term').map(i => (P.assessment[i.id] || {}).finishMonth).filter(Boolean).sort().pop();
    const want = zoom === '24' ? 24 : zoom === '60' ? 60 : Math.max(24, (lastLong ? monthsBetween(from, lastLong) : lastFinite ? monthsBetween(from, lastFinite) : 23) + 1);
    const n = Math.min(want, 600);
    const step = n <= 24 ? 1 : n <= 60 ? 3 : 12;
    tlPanel.appendChild(h('h2', null, coach() ? 'Timeline' : 'When each one lands', h('span', { class: 'tag' }, F.date(from) + ' to ' + F.date(addMonths(from, n - 1)))));
    const tl = h('div', { class: 'gtl', style: { '--cols': String(n) } });
    const head = h('div', { class: 'gtl-row gtl-head' }, h('div', { class: 'gtl-label' }, ''), h('div', { class: 'gtl-bar' }));
    for (let k = 0; k < n; k++) { const ym = addMonths(from, k); const show = k % step === 0; head.lastChild.appendChild(h('div', { class: 'gtl-cell gtl-month' + (ym.endsWith('-01') ? ' year' : ''), title: F.date(ym) }, show ? (n <= 24 ? F.date(ym).slice(0, 3) + (ym.endsWith('-01') || k === 0 ? ' ' + ym.slice(2, 4) : '') : n <= 60 ? F.date(ym).slice(0, 3) + ' ' + ym.slice(2, 4) : ym.slice(0, 4)) : '')); }
    tl.appendChild(head);
    const order = P.input.items;
    order.forEach((i, idx) => {
      const g = P.run.goals[i.id]; const a = P.assessment[i.id] || {};
      const label = h('div', { class: 'gtl-label' }, h('span', { class: 'gtl-name' }, nameOf(i)), h('span', { class: 'small muted gtl-sub' }, subOf(i, a)), reorderControls(i, idx, order));
      const bar = h('div', { class: 'gtl-bar' });
      if (i.type === 'long-term') {
        for (let k = 0; k < n; k++) bar.appendChild(h('div', { class: 'gtl-cell long' }));
        const txt = a.finishMonth ? (a.finishMonth <= addMonths(from, n - 1) ? monthWord(a.finishMonth) : monthWord(a.finishMonth) + ', past the edge') : (gentle() ? 'needs more of the picture' : 'needs ' + (i.needs || ['the ladder']).join(', '));
        bar.appendChild(h('div', { class: 'gtl-edge small' }, txt));
      } else if (!g) {
        for (let k = 0; k < n; k++) bar.appendChild(h('div', { class: 'gtl-cell' }));
        bar.appendChild(h('div', { class: 'gtl-edge small muted' }, 'Needs ' + (i.needs || []).join(', ')));
      } else {
        const fin = g.finishMonth; const finK = fin ? months.indexOf(fin) : -1;
        const firstRefill = g.refills.length ? months.indexOf(g.refills[0]) : -1;
        const fullAtStart = (g.balances[0] || 0) >= (i.targetCents || 0) && i.type !== 'debt' && (g.funded[0] || 0) === 0 && (firstRefill !== 0);
        for (let k = 0; k < n; k++) {
          const ym = addMonths(from, k); const funded = g.funded[k] || 0;
          const cls = ['gtl-cell'];
          if ((g.doneAtStart || fullAtStart) && (firstRefill < 0 || k < firstRefill)) cls.push('after');
          else if (finK >= 0 && k > finK) cls.push('after');
          else if (funded > 0) cls.push('fill');
          if (finK === k) cls.push('finish');
          if (i.targetDate === ym) cls.push('flag');
          if (g.refills.includes(ym)) cls.push('refill');
          const roll = P.run.rollovers.find(r => r.to === i.id && r.month === ym);
          if (roll) cls.push('roll');
          const title = [F.date(ym), funded ? money(funded) : '', finK === k ? 'done' : '', i.targetDate === ym ? 'target date' : '', roll ? 'money arrives from ' + nameOf(order.find(x => x.id === roll.from) || { name: roll.from }) : '', g.refills.includes(ym) ? 'refilling after you used it' : ''].filter(Boolean).join(', ');
          bar.appendChild(h('div', { class: cls.join(' '), title }, roll ? h('span', { class: 'glyph', 'aria-hidden': 'true' }, String.fromCharCode(0x21B3)) : null, i.targetDate === ym ? h('span', { class: 'glyph flagglyph', 'aria-hidden': 'true' }, String.fromCharCode(0x2691)) : null));
        }
        if (fin && finK >= n) bar.appendChild(h('div', { class: 'gtl-edge small' }, monthWord(fin)));
        if (!fin && !g.doneAtStart) bar.appendChild(h('div', { class: 'gtl-edge small muted' }, gentle() ? 'not yet' : 'not reached'));
      }
      tl.appendChild(h('div', { class: 'gtl-row type-' + i.type + (i.id === 'starter' ? ' starter' : ''), dataset: { goal: i.id } }, label, bar));
    });
    tlPanel.appendChild(h('div', { class: 'tablewrap gtl-wrap' }, tl));
    tlPanel.appendChild(h('p', { class: 'small muted' }, 'Filled months are funded. ' + String.fromCharCode(0x2691) + ' is the date you want it by. ' + String.fromCharCode(0x21B3) + ' is money arriving from a finished goal. A dashed month is the cushion refilling after you used it.'));
  }
  function subOf(i, a) {
    if (i.type === 'long-term') return typeof i.pct === 'number' ? Math.round(i.pct * 100) + '% there' : '';
    if (typeof i.targetCents !== 'number') return 'needs ' + (i.needs || []).join(', ');
    if (i.type === 'debt') return money(i.remainingCents) + ' at ' + F.percent(i.rate || 0, { places: 0 });
    return money(i.targetCents) + (i.targetDate ? ' by ' + monthWord(i.targetDate) : '');
  }
  function reorderControls(i, idx, order) {
    if (i.id === 'starter' || i.type === 'long-term') return null;
    const movable = order.filter(x => x.id !== 'starter' && x.type !== 'long-term'); const pos = movable.findIndex(x => x.id === i.id);
    const move = d => { const ids = movable.map(x => x.id); const j = pos + d; if (j < 0 || j >= ids.length) return; ids.splice(pos, 1); ids.splice(j, 0, i.id); whatIf.order = ids; draw(); };
    return h('span', { class: 'gtl-move' }, h('button', { class: 'btn small quiet', 'aria-label': 'Move ' + nameOf(i) + ' up', disabled: pos === 0, onClick: () => move(-1) }, String.fromCharCode(0x2191)), h('button', { class: 'btn small quiet', 'aria-label': 'Move ' + nameOf(i) + ' down', disabled: pos === movable.length - 1, onClick: () => move(1) }, String.fromCharCode(0x2193)));
  }

  /* ---- the allocation table and the mode switch ---- */
  function statusText(i, a) {
    if (!a) return '';
    switch (a.status) {
      case 'done': return 'Done';
      case 'needs': return 'Needs ' + (a.needs || i.needs || []).join(', ');
      case 'projected': return 'Projected ' + monthWord(a.finishMonth);
      case 'on-time': return 'On track for ' + monthWord(a.finishMonth);
      case 'on-track': return (i.type === 'debt' ? 'Paid off by ' : 'Done by ') + monthWord(a.finishMonth);
      case 'never': return gentle() ? 'Not yet reachable at this pace' : 'Not reached at this pace';
      case 'behind': {
        const name = lowerName(i);
        if (a.floorReason) return (gentle() ? 'Your starter cushion comes first, so ' : 'Your starter cushion comes first, so ') + name + ' needs ' + money(a.shortfallMonthly) + ' more a month after ' + monthWord(a.after) + (a.earliestMonth ? ', or lands ' + monthWord(a.earliestMonth) + ' as is' : '');
        return (gentle() ? 'A little more gets there on time: ' : 'Needs ') + money(a.shortfallMonthly) + ' more a month' + (a.earliestMonth ? ', or ' + monthWord(a.earliestMonth) + ' as is' : '');
      }
      default: return '';
    }
  }
  function drawAlloc(P) {
    clear(allocPanel);
    allocPanel.appendChild(h('h2', null, coach() ? 'Where the money goes' : 'Each month', h('span', { class: 'tag' }, money(P.input.surplusMonthly) + ' a month')));
    const mode = P.input.mode; const showSplit = mode === 'all-at-once'; const showLock = coach();
    const tb = h('tbody');
    P.input.items.forEach(i => {
      const g = P.run.goals[i.id]; const a = P.assessment[i.id];
      const lock = showLock && i.type !== 'long-term' && i.id !== 'starter' && typeof i.targetCents === 'number' ? h('input', { class: 'input num', style: { width: '84px' }, 'aria-label': 'Lock a monthly amount for ' + nameOf(i), title: 'A fixed amount each month; the rest flows around it', value: (P.input.overrides || {})[i.id] ? money((P.input.overrides || {})[i.id]) : '', onChange: e => { const p = parseSaid(e.target.value); const o = Object.assign({}, P.input.overrides || {}); if (p && p.cents > 0) o[i.id] = p.cents; else delete o[i.id]; whatIf.overrides = o; draw(); } }) : null;
      const split = showSplit && i.type !== 'long-term' && i.id !== 'starter' && typeof i.targetCents === 'number' ? h('input', { class: 'input num', style: { width: '64px' }, 'aria-label': 'Share for ' + nameOf(i), value: (P.input.splits || {})[i.id] !== undefined ? Math.round(P.input.splits[i.id] * 100) + '%' : '', title: 'Percent of the monthly money; blank means an even share', onChange: e => { const v = parseFloat(String(e.target.value).replace('%', '')); const sp = Object.assign({}, P.input.splits || {}); if (v > 0) sp[i.id] = v / 100; else delete sp[i.id]; whatIf.splits = sp; draw(); } }) : null;
      tb.appendChild(h('tr', { dataset: { goal: i.id } }, h('td', null, nameOf(i)), h('td', { class: 'num' }, g ? money(g.monthlyNow) : ''), h('td', null, a && a.finishMonth ? monthWord(a.finishMonth) : ''), h('td', { class: 'wrap small' }, statusText(i, a)), showLock ? h('td', null, lock) : null, showSplit ? h('td', null, split) : null));
    });
    allocPanel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data alloc' }, h('thead', null, h('tr', null, h('th', null, 'Goal'), h('th', { class: 'num' }, 'A month now'), h('th', null, 'Lands'), h('th', null, 'Where it stands'), showLock ? h('th', null, 'Locked') : null, showSplit ? h('th', null, 'Share') : null)), tb)));
  }
  function drawCompare(P) {
    clear(cmpPanel);
    cmpPanel.appendChild(h('h2', null, coach() ? 'Ways to split it' : 'Three ways to do it'));
    cmpPanel.appendChild(h('div', { class: 'view-toggle wrap mode-switch', role: 'group', 'aria-label': 'How to split the money' }, MODES.map(m => h('button', { 'aria-pressed': String(P.input.mode === m), title: MODE_HELP[m], onClick: () => { whatIf.mode = m; draw(); } }, MODE_LABELS[m]))));
    cmpPanel.appendChild(h('p', { class: 'small muted' }, MODE_HELP[P.input.mode] + ' The starter cushion comes first in all three.'));
    const dated = P.input.items.filter(i => i.type === 'dated' && i.targetDate && typeof i.targetCents === 'number');
    const debts = P.input.items.filter(i => i.type === 'debt');
    const rows = P.compare.map(c => h('tr', { class: c.mode === P.input.mode ? 'current' : null, dataset: { mode: c.mode } }, h('td', null, MODE_LABELS[c.mode]), h('td', { class: 'num' }, dated.length ? c.onTime + ' of ' + dated.length : 'no dates'), h('td', { class: 'small wrap' }, dated.slice(0, 3).map(i => nameOf(i) + ' ' + (c.finish[i.id] ? monthWord(c.finish[i.id]) : 'not reached')).join('; ')), h('td', { class: 'num' }, debts.length ? money(c.interest) : '')));
    cmpPanel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data compare' }, h('thead', null, h('tr', null, h('th', null, 'Way'), h('th', { class: 'num' }, 'On time'), h('th', null, 'Dated goals land'), h('th', { class: 'num' }, 'Interest paid'))), h('tbody', null, rows))));
  }

  /* ---- add a goal, add to calendar ---- */
  function addGoal() {
    const name = h('input', { class: 'input wide', 'aria-label': 'Goal, in their words' });
    const amount = h('input', { class: 'input num', 'aria-label': 'Amount', title: 'like 1,500' });
    const when = h('input', { class: 'input', 'aria-label': 'By when, optional (YYYY-MM)', title: '2027-04' });
    const save = () => { const p = parseSaid(amount.value); if (!name.value.trim() || !p || !(p.cents > 0)) { app.toast('A name and an amount first.'); return; } const extras = (app.record.goals.extras || []).concat([{ id: 'x' + Date.now().toString(36), name: name.value.trim(), targetCents: p.cents, targetDate: /^\d{4}-\d{2}$/.test(when.value.trim()) ? when.value.trim() : null }]); app.goals({ extras }); closeOverlay(); app.toast('Goal added'); draw(); };
    app.openDrawer(h('div', null, h('h2', null, 'Add a goal'), h('div', { class: 'stack' }, name, h('div', { class: 'row' }, amount, when), h('div', { class: 'row' }, h('button', { class: 'btn primary', onClick: save }, 'Add'), h('button', { class: 'btn', onClick: closeOverlay }, 'Cancel')))), { label: 'Add a goal' });
  }
  function addToCalendar() {
    const P = plan(); const words = {}; P.input.items.forEach(i => { words[i.id] = nameOf(i) + (i.type === 'debt' ? ' done' : ' complete'); });
    const text = icsOf(goalEvents(P, app.record.sessions || [], words), { name: (clientName(app.record) || 'Client') + ': goals' });
    download('money-rooms-goals-' + (clientName(app.record) || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.ics', text, 'text/calendar');
    app.toast('Calendar file ready');
  }
  draw();
  return { update() { draw(); } };
}

/* Compact rows for the one-pager and the Session page: the starter cushion first until it is full, then the next wins. */
export function nextWins(app, max) {
  const P = app.result.goalPlan; if (!P || !P.surplusKnown) return [];
  const coach = app.view === 'coach';
  const nameOf = i => coach ? i.name : (i.id === 'starter' ? 'Starter cushion' : i.id === 'full' ? 'Full cushion' : i.type === 'debt' ? 'Pay off ' + i.name : i.clientName || i.name);
  const rows = [];
  const starter = P.input.items.find(i => i.id === 'starter'); const sa = P.assessment.starter;
  if (starter && sa && sa.status !== 'done') rows.push({ id: 'starter', name: nameOf(starter), month: sa.finishMonth, text: sa.finishMonth ? 'Starter cushion full in ' + F.date(sa.finishMonth) : 'Starter cushion first' });
  P.input.items.filter(i => i.id !== 'starter' && P.assessment[i.id] && P.assessment[i.id].finishMonth && P.assessment[i.id].status !== 'done').sort((a, b) => P.assessment[a.id].finishMonth < P.assessment[b.id].finishMonth ? -1 : 1).slice(0, max || 3).forEach(i => rows.push({ id: i.id, name: nameOf(i), month: P.assessment[i.id].finishMonth, text: nameOf(i) + ' in ' + F.date(P.assessment[i.id].finishMonth) }));
  return rows.slice(0, (max || 3) + 1);
}

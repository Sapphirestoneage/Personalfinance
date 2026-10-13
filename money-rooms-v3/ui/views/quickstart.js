/* The quick start (MR-080): four questions. Birth year, then Income, Debt,
   Expenses, Assets: any? which kinds? about how much? Every answer lands in
   its room the moment it is typed, as a rough row, and the strip shows the
   numbers lighting up. No on a question marks each kind None. "See what is
   still needed" opens the Checklist on Still needed.
   Two ways to walk it (MR-085): all on one page, or one step at a time with
   Back and Next, which a phone gets by default; the steps end on the
   picture: take-home, spending, what is left over, the runway and the month
   a buffer is full, the earliest the job could be left. The birth year is
   optional and can be skipped. The form is built once and patched (D-034);
   only the strip and the picture redraw on an update. Coach view only. The
   engine decides what each answer becomes and does every sum. */
import { h, clear } from '../dom.js';
import { QUESTIONS, HEADLINE, applyQuick, readQuick, kindLabel, picture } from '../../engine/quickstart.js';
import { valueText } from '../../engine/unlocks.js';
import { parseSaid } from '../../engine/parse.js';
import { segmented } from '../seg.js';
import { clientName } from '../app.js';
import * as F from '../../engine/format.js';

function remember(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* no storage */ } }
function recall(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
const MODES = [['steps', 'One at a time'], ['page', 'All on one page']];

export function mount(host, app) {
  let mode = recall('mr3.quickMode') || (window.innerWidth <= 720 ? 'steps' : 'page');
  const modeSeg = segmented(MODES, mode, m => { mode = m; remember('mr3.quickMode', m); layout(); }, { label: 'How to walk the questions', repick: true }); /* repick: the segments are re-marked by layout(), so every click must reach the handler */
  host.appendChild(h('header', null, h('h1', null, 'Quick start'), h('span', { class: 'sub' }, 'Four questions, rough answers. Each one lands in its room as you type and the numbers light up as they can. Everything here firms up later, one line at a time.'), app.record ? h('div', { class: 'actions' }, modeSeg) : null));
  if (!app.record) { mountNew(host, app); return { update() {} }; }
  const progress = h('div', { class: 'qs-progress', hidden: true }); host.appendChild(progress);
  const strip = h('section', { class: 'panel qs-strip' }); host.appendChild(strip);
  const form = h('div', { class: 'stack qs-form' }); host.appendChild(form);
  const nav = h('div', { class: 'qs-nav', hidden: true }); host.appendChild(nav);
  const answers = readQuick(app.record, app.data);
  let pending = null; let step = 0; let buffer = 3;
  /* every change re-applies the whole answer set through the record API; typing is cheap, so this is one call per change */
  const commit = () => { app.change(rec => { applyQuick(rec, answers, app.data, { session: app.session, today: app.result.today }); return 'quick'; }); };
  const flush = () => { if (pending) { clearTimeout(pending); pending = null; } commit(); };
  const steps = []; /* { id, label, el, answered() } in step order: the four questions, the optional birth year, the picture */

  /* the birth year: optional, one fact the FI math needs */
  const birth = h('input', { class: 'input num', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', style: { width: '120px' }, 'aria-label': 'Birth year or age', value: answers.birth, title: 'A year (1999) or an age (27)' });
  birth.addEventListener('change', () => { answers.birth = birth.value.trim(); commit(); });
  const birthSec = h('section', { class: 'panel qs-step', id: 'qs-birth-step' }, h('h2', null, 'Birth year', h('span', { class: 'tag' }, 'optional, for the FI date')),
    h('div', { class: 'row qs-row' }, h('label', { class: 'qs-label', for: 'qs-birth' }, 'Birth year or age'), birth),
    h('p', { class: 'small muted' }, 'A year is enough; the exact date can come later. Skip it for now if you are only looking a year out.'));
  birth.id = 'qs-birth';

  const sections = {};
  QUESTIONS.forEach((q, i) => {
    const ans = answers[q.id];
    const sec = h('section', { class: 'panel qs-step', id: 'qs-' + q.id });
    const body = h('div', { class: 'qs-body' });
    sec.appendChild(h('h2', null, (i + 1) + '. ' + q.label, h('span', { class: 'tag' }, q.ask)));
    if (q.noneTypes) {
      const pick = segmented([[true, 'Yes'], [false, 'No, none']], ans.has, v => { ans.has = v; if (!v) Object.keys(ans.kinds).forEach(k => { ans.kinds[k].picked = false; }); drawBody(); commit(); }, { label: q.label + ': any?' });
      sec.appendChild(h('div', { class: 'row qs-row' }, pick));
    }
    sec.appendChild(body);
    form.appendChild(sec); sections[q.id] = sec;
    steps.push({ id: q.id, label: q.label, el: sec, answered: () => ans.has === false || !!ans.said || Object.keys(ans.kinds).some(k => ans.kinds[k].picked && ans.kinds[k].said) });
    function amountBox(label, value, hint, onSet, opts) {
      const input = h('input', { class: 'input num qs-amount', type: 'text', inputmode: 'decimal', enterkeyhint: 'next', 'aria-label': label, value: value || '', title: hint || '' });
      const heard = h('span', { class: 'small muted qs-heard' });
      const show = v => { const p = parseSaid(v, opts || {}); heard.textContent = !v ? '' : !p ? 'Did not catch a number' : p.unknown ? 'Unknown for now' : p.na ? 'Not applicable' : p.none ? 'None' : F.dollarsWhole(p.cents) + (p.cadence && p.cadence !== 'oneoff' && opts && opts.cadence ? ' ' + ({ paycheck: 'a paycheck', week: 'a week', month: 'a month', quarter: 'a quarter', year: 'a year' }[p.cadence] || '') : '') + ', rough'; };
      input.addEventListener('input', () => { show(input.value); onSet(input.value.trim()); if (mode === 'steps') layout(); if (pending) clearTimeout(pending); pending = setTimeout(() => { pending = null; commit(); }, 500); });
      input.addEventListener('change', () => { onSet(input.value.trim()); flush(); });
      show(value);
      return h('span', { class: 'qs-amountwrap' }, input, heard);
    }
    function drawBody() {
      clear(body);
      if (q.total) {
        body.appendChild(h('div', { class: 'row qs-row' }, h('span', { class: 'qs-label' }, 'All in, a month'), amountBox(q.label + ' a month', ans.said, q.amountHint, v => { ans.said = v; }, { kind: 'spending', defaultCadence: 'month', cadence: true })));
        body.appendChild(h('p', { class: 'small muted' }, 'Then, if it is easy, the big pieces. Anything left blank stays inside the total.'));
      } else if (ans.has !== true) { body.appendChild(h('p', { class: 'small muted' }, ans.has === false ? 'Marked as none. Change the answer above if that changes.' : 'Pick Yes or No to go on.')); return; }
      const chips = h('div', { class: 'row qs-kinds', role: 'group', 'aria-label': q.label + ' kinds' }, q.kinds.map(([kind, label]) => {
        const on = !!(ans.kinds[kind] && ans.kinds[kind].picked);
        return h('button', { type: 'button', class: 'chip toggle' + (on ? ' on' : ''), 'aria-pressed': String(on), onClick: () => { ans.kinds[kind] = ans.kinds[kind] || { picked: false, said: '', extras: {} }; ans.kinds[kind].picked = !ans.kinds[kind].picked; if (q.total) ans.has = true; drawBody(); commit(); const box = body.querySelector('[data-kind="' + kind + '"] input'); if (box) box.focus({ preventScroll: true }); } }, label);
      }));
      body.appendChild(chips);
      const picked = q.kinds.filter(([kind]) => ans.kinds[kind] && ans.kinds[kind].picked);
      if (!picked.length) { body.appendChild(h('p', { class: 'small muted' }, q.total ? '' : 'Tap each kind that applies, then type a rough figure for it.')); return; }
      const lines = h('div', { class: 'qs-lines' });
      picked.forEach(([kind]) => {
        const k = ans.kinds[kind]; const extras = (q.extras || {})[kind] || [];
        const line = h('div', { class: 'row qs-row', dataset: { kind } }, h('span', { class: 'qs-label' }, kindLabel(q, kind)),
          amountBox(kindLabel(q, kind) + ' amount', k.said, q.amountHint, v => { k.said = v; }, q.id === 'income' ? { kind: 'income', cadence: true, defaultCadence: kind === 'w2' ? 'paycheck' : 'month' } : { kind: 'money' }),
          extras.map(([fid, label]) => h('span', { class: 'qs-extra' }, h('label', { class: 'small muted' }, label), h('input', { class: 'input num', type: 'text', inputmode: 'decimal', enterkeyhint: 'next', style: { width: '96px' }, 'aria-label': kindLabel(q, kind) + ' ' + label.toLowerCase(), value: (k.extras || {})[fid] || '', onChange: e => { k.extras = k.extras || {}; k.extras[fid] = e.target.value.trim(); flush(); } }))));
        lines.appendChild(line);
      });
      body.appendChild(lines);
    }
    drawBody();
  });
  form.appendChild(birthSec);
  steps.push({ id: 'birth', label: 'Birth year', el: birthSec, answered: () => !!answers.birth });
  /* the picture: the steps end here; on one page it is the panel after the questions */
  const pictureSec = h('section', { class: 'panel qs-picture' }); form.appendChild(pictureSec);
  steps.push({ id: 'picture', label: 'The picture', el: pictureSec, answered: () => true });
  const done = h('section', { class: 'panel qs-done' }, h('h2', null, 'Then'),
    h('p', null, 'Everything above is rough on purpose. The Checklist walks the rest: each figure firms up one line at a time, and the counts move as you go.'),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/checklist', onClick: () => { flush(); remember('mr3.checklistFilter', 'open'); } }, 'See what is still needed'), h('a', { class: 'btn', href: '#/ledger', onClick: flush }, 'Open the Plan'), h('a', { class: 'btn', href: '#/scoreboard', onClick: flush }, 'The scoreboard')));
  form.appendChild(done);

  /* Enter in a box moves on in the steps; the phone keyboard shows Next */
  form.addEventListener('keydown', e => { if (e.key === 'Enter' && mode === 'steps' && e.target && /^INPUT$/.test(e.target.tagName)) { e.preventDefault(); e.target.blur(); flush(); go(1); } });

  function drawStrip() {
    clear(strip);
    const M = app.result.metrics || {}; const defs = app.data.metrics.metrics;
    const lit = HEADLINE.filter(id => M[id] && M[id].status === 'ok').length;
    strip.appendChild(h('div', { class: 'row qs-strip-head' }, h('h2', null, clientName(app.record) || 'This client', h('span', { class: 'tag' }, lit + ' of ' + HEADLINE.length + ' numbers lit')), h('span', { class: 'spacer' }), h('a', { class: 'small', href: '#/measure/unlocks' }, 'Everything that opens')));
    strip.appendChild(h('div', { class: 'grid grid-3 qs-kpis' }, HEADLINE.map(id => {
      const def = defs.find(d => d.id === id); const m = M[id]; const ok = m && m.status === 'ok';
      const waits = !ok && m && m.needs && m.needs.length ? m.needs[0] : null;
      return h('div', { class: 'kpi' + (ok ? ' lit' : ' dim'), dataset: ok ? { metric: id } : {}, role: ok ? 'button' : null },
        h('div', { class: 'label' }, def ? def.name : id),
        ok ? h('div', { class: 'value' }, valueText(m)) : h('div', { class: 'value needs' }, waits ? 'needs ' + waits.toLowerCase() : 'not yet'));
    })));
  }
  function drawPicture() {
    clear(pictureSec);
    const P = picture(app.result, buffer); const money = c => F.dollarsWhole(c);
    pictureSec.appendChild(h('h2', null, 'The picture', h('span', { class: 'tag' }, 'the next few months')));
    if (P.needs.length) pictureSec.appendChild(h('p', { class: 'small muted' }, 'Still needs ' + P.needs.join(', ') + ' for the whole picture.'));
    const kpi = (label, v, sub) => h('div', { class: 'kpi' + (v === null ? ' dim' : ' lit') }, h('div', { class: 'label' }, label), h('div', { class: 'value' + (v === null ? ' needs' : '') }, v === null ? 'not yet' : v), sub ? h('div', { class: 'small muted' }, sub) : null);
    pictureSec.appendChild(h('div', { class: 'grid grid-4 qs-pic-kpis' },
      kpi('Take-home a month', P.takeHome === null ? null : money(P.takeHome)),
      kpi('Out the door a month', P.spending === null ? null : money(P.spending)),
      kpi('Left over a month', P.surplus === null ? null : money(P.surplus)),
      kpi('Cash on hand', P.cash === null ? null : money(P.cash), P.runway !== null ? P.runway + (P.runway === 1 ? ' month of runway' : ' months of runway') : null)));
    const months = h('input', { class: 'input num', type: 'text', inputmode: 'numeric', style: { width: '64px' }, 'aria-label': 'Buffer in months of spending', value: String(buffer), title: 'like 3' });
    months.addEventListener('change', () => { const n = parseFloat(months.value); buffer = Number.isFinite(n) && n > 0 ? n : 3; drawPicture(); });
    const line = h('p', { class: 'big qs-quit' });
    if (P.target === null) line.textContent = 'Monthly expenses and cash on hand give the date the job could be left.';
    else if (P.cash === null) line.textContent = 'A buffer of ' + P.months + ' months is ' + money(P.target) + '. Cash on hand says how far along it is.';
    else if (P.there) line.textContent = 'The buffer of ' + P.months + ' months is already there: ' + money(P.cash) + ' on hand against ' + money(P.target) + '. Leaving the job is a choice, not a wait.';
    else if (P.stuck) line.textContent = money(P.shortBy) + ' short of a ' + P.months + '-month buffer, and nothing left over each month to close it. The moves come first.';
    else line.append(money(P.shortBy) + ' short of a ' + P.months + '-month buffer. At ' + money(P.surplus) + ' a month that is full by ', h('strong', null, F.date(P.by)), ', the earliest the job could be left.');
    pictureSec.appendChild(line);
    pictureSec.appendChild(h('div', { class: 'row qs-row' }, h('label', { class: 'small', for: 'qs-buffer' }, 'Buffer, in months of spending'), months)); months.id = 'qs-buffer';
    pictureSec.appendChild(h('p', { class: 'small muted' }, 'Rough is fine here. The Checklist firms it up; Goals carries the year with this buffer as the focus.'));
  }
  function go(d) { step = Math.max(0, Math.min(steps.length - 1, step + d)); layout(); window.scrollTo(0, 0); }
  function layout() {
    modeSeg.querySelectorAll('.seg-btn').forEach((b, k) => { b.setAttribute('aria-pressed', String(MODES[k][0] === mode)); b.classList.toggle('on', MODES[k][0] === mode); });
    const stepsMode = mode === 'steps';
    form.classList.toggle('qs-steps', stepsMode);
    steps.forEach((s, k) => { s.el.hidden = stepsMode && k !== step; });
    const last = step === steps.length - 1;
    strip.hidden = stepsMode && !last; done.hidden = stepsMode && !last; progress.hidden = !stepsMode; nav.hidden = !stepsMode;
    if (stepsMode) {
      clear(progress); clear(nav);
      progress.appendChild(h('span', { class: 'small' }, steps[step].label + ', ' + (step + 1) + ' of ' + steps.length));
      progress.appendChild(h('span', { class: 'qs-bar' }, h('span', { class: 'qs-bar-fill', style: { width: Math.round((step + 1) / steps.length * 100) + '%' } })));
      nav.appendChild(h('button', { class: 'btn', disabled: step === 0 ? 'disabled' : null, onClick: () => go(-1) }, 'Back'));
      nav.appendChild(h('span', { class: 'spacer' }));
      if (!last) nav.appendChild(h('button', { class: 'btn primary', onClick: () => { flush(); go(1); } }, steps[step].answered() ? 'Next' : 'Skip for now'));
      else nav.appendChild(h('a', { class: 'btn primary', href: '#/checklist', onClick: () => { flush(); remember('mr3.checklistFilter', 'open'); } }, 'See what is still needed'));
    }
  }
  drawStrip(); drawPicture(); layout();
  return { update() { drawStrip(); drawPicture(); if (mode === 'steps') layout(); } };
}

/* No client open yet: a name is enough to begin. */
function mountNew(host, app) {
  const name = h('input', { class: 'input', type: 'text', 'aria-label': 'New client name', style: { maxWidth: '320px' } });
  const go = () => { const n = name.value.trim(); if (!n) { name.focus(); return; } app.newClient(n); app.render(); };
  name.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  host.appendChild(h('section', { class: 'panel' }, h('h2', null, 'Who is this for?'), h('p', { class: 'small muted' }, 'A first name is enough. The four questions come next.'),
    h('div', { class: 'row', style: { marginTop: '8px' } }, name, h('button', { class: 'btn primary', onClick: go }, 'Begin'))));
  setTimeout(() => name.focus(), 0);
}

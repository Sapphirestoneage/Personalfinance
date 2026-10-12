/* The quick start (MR-080): four questions on one screen. Birth year, then
   Income, Debt, Expenses, Assets: any? which kinds? about how much? Every
   answer lands in its room the moment it is typed, as a rough row, and the
   strip on top shows the numbers lighting up. No on a question marks each
   kind None. "See what is still needed" opens the Checklist on Still needed.
   The form is built once and patched (D-034); only the strip redraws on an
   update. Coach view only. The engine decides what each answer becomes. */
import { h, clear } from '../dom.js';
import { QUESTIONS, HEADLINE, applyQuick, readQuick, kindLabel } from '../../engine/quickstart.js';
import { valueText } from '../../engine/unlocks.js';
import { parseSaid } from '../../engine/parse.js';
import { segmented } from '../seg.js';
import { clientName } from '../app.js';
import * as F from '../../engine/format.js';

function remember(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* no storage */ } }

export function mount(host, app) {
  host.appendChild(h('header', null, h('h1', null, 'Quick start'), h('span', { class: 'sub' }, 'Four questions, rough answers. Each one lands in its room as you type and the numbers light up as they can. Everything here firms up later, one line at a time.')));
  if (!app.record) { mountNew(host, app); return { update() {} }; }
  const strip = h('section', { class: 'panel qs-strip' }); host.appendChild(strip);
  const form = h('div', { class: 'stack qs-form' }); host.appendChild(form);
  const answers = readQuick(app.record, app.data);
  let pending = null;
  /* every change re-applies the whole answer set through the record API; typing is cheap, so this is one call per change */
  const commit = () => { app.change(rec => { applyQuick(rec, answers, app.data, { session: app.session, today: app.result.today }); return 'quick'; }); };
  const flush = () => { if (pending) { clearTimeout(pending); pending = null; } commit(); };

  /* the birth year */
  const birth = h('input', { class: 'input num', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', style: { width: '120px' }, 'aria-label': 'Birth year or age', value: answers.birth, title: 'A year (1999) or an age (27)' });
  birth.addEventListener('change', () => { answers.birth = birth.value.trim(); commit(); });
  form.appendChild(h('section', { class: 'panel qs-step' }, h('h2', null, 'First', h('span', { class: 'tag' }, 'one fact the FI math needs')),
    h('div', { class: 'row qs-row' }, h('label', { class: 'qs-label', for: 'qs-birth' }, 'Birth year or age'), birth),
    h('p', { class: 'small muted' }, 'A year is enough; the exact date can come later.')));
  birth.id = 'qs-birth';

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
    form.appendChild(sec);
    function amountBox(label, value, hint, onSet, opts) {
      const input = h('input', { class: 'input num qs-amount', type: 'text', inputmode: 'decimal', 'aria-label': label, value: value || '', title: hint || '' });
      const heard = h('span', { class: 'small muted qs-heard' });
      const show = v => { const p = parseSaid(v, opts || {}); heard.textContent = !v ? '' : !p ? 'Did not catch a number' : p.unknown ? 'Unknown for now' : p.na ? 'Not applicable' : p.none ? 'None' : F.dollarsWhole(p.cents) + (p.cadence && p.cadence !== 'oneoff' && opts && opts.cadence ? ' ' + ({ paycheck: 'a paycheck', week: 'a week', month: 'a month', quarter: 'a quarter', year: 'a year' }[p.cadence] || '') : '') + ', rough'; };
      input.addEventListener('input', () => { show(input.value); if (pending) clearTimeout(pending); pending = setTimeout(() => { pending = null; onSet(input.value.trim()); commit(); }, 500); });
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
        return h('button', { type: 'button', class: 'chip toggle' + (on ? ' on' : ''), 'aria-pressed': String(on), onClick: () => { ans.kinds[kind] = ans.kinds[kind] || { picked: false, said: '', extras: {} }; ans.kinds[kind].picked = !ans.kinds[kind].picked; if (q.total) ans.has = true; drawBody(); commit(); const box = body.querySelector('[data-kind="' + kind + '"] input'); if (box) box.focus(); } }, label);
      }));
      body.appendChild(chips);
      const picked = q.kinds.filter(([kind]) => ans.kinds[kind] && ans.kinds[kind].picked);
      if (!picked.length) { body.appendChild(h('p', { class: 'small muted' }, q.total ? '' : 'Tap each kind that applies, then type a rough figure for it.')); return; }
      const lines = h('div', { class: 'qs-lines' });
      picked.forEach(([kind]) => {
        const k = ans.kinds[kind]; const extras = (q.extras || {})[kind] || [];
        const line = h('div', { class: 'row qs-row', dataset: { kind } }, h('span', { class: 'qs-label' }, kindLabel(q, kind)),
          amountBox(kindLabel(q, kind) + ' amount', k.said, q.amountHint, v => { k.said = v; }, q.id === 'income' ? { kind: 'income', cadence: true, defaultCadence: kind === 'w2' ? 'paycheck' : 'month' } : { kind: 'money' }),
          extras.map(([fid, label]) => h('span', { class: 'qs-extra' }, h('label', { class: 'small muted' }, label), h('input', { class: 'input num', type: 'text', inputmode: 'decimal', style: { width: '96px' }, 'aria-label': kindLabel(q, kind) + ' ' + label.toLowerCase(), value: (k.extras || {})[fid] || '', onChange: e => { k.extras = k.extras || {}; k.extras[fid] = e.target.value.trim(); flush(); } }))));
        lines.appendChild(line);
      });
      body.appendChild(lines);
    }
    drawBody();
  });
  form.appendChild(h('section', { class: 'panel qs-done' }, h('h2', null, 'Then'),
    h('p', null, 'Everything above is rough on purpose. The Checklist walks the rest: each figure firms up one line at a time, and the counts move as you go.'),
    h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/checklist', onClick: () => { flush(); remember('mr3.checklistFilter', 'open'); } }, 'See what is still needed'), h('a', { class: 'btn', href: '#/ledger', onClick: flush }, 'Open the Plan'), h('a', { class: 'btn', href: '#/scoreboard', onClick: flush }, 'The scoreboard'))));

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
  drawStrip();
  return { update() { drawStrip(); } };
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

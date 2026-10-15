/* The quick snapshot (Level 15, MR-109) and the deep dive (MR-110): every
   base number on one screen, grouped by DAITE; a number, a range, Not for me
   or Don't know yet; the income field as salary or hourly with the hourly
   terms inline and the conversion in the open; any base number opens its
   rows with the four states, a Back to snapshot always in view, and nothing
   ever lost on leaving. Every figure comes from the result; this file only
   draws and commits through the record API. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { segmented } from '../seg.js';
import { fold } from '../fold.js';
import { BASE_NUMBERS, GROUPS, setBase, snapshotOf, guessFor, diveRows, summaryRowOf } from '../../engine/snapshot.js';
import { ROW_STATES, storedFor, REMAINDER_LABEL } from '../../engine/resolve.js';
import { weeksFromTimeOff, salaryAsHourly, DEFAULT_WEEKS, HOURS_PER } from '../../engine/hours.js';
import { createRow } from '../../engine/record.js';
import { freshFacts, typeDef, primaryFieldOf } from '../../engine/fields.js';
import { hasValue } from '../../engine/states.js';
import { PLANET_LABELS } from '../../engine/sun.js';
import { whatsLeft } from '../../engine/whatsleft.js';

const CONF = [['known', 'Knows'], ['rough', 'Roughly'], ['will-send', 'Will email'], ['unknown', "Doesn't know"]];
const PERIOD_WORD = { month: 'a month', year: 'a year', oneoff: '' };
const money = c => F.dollarsWhole(c); const pct = r => F.percent(r, { places: 0 });
export const FROM_KEY = 'mr3.fromSnapshot';
function rangeText(f) { if (!f || f.v === null || f.v === undefined) return ''; if (typeof f.v === 'object') return F.dollars(f.v.low, { plain: true }).replace('$', '') + ' to ' + F.dollars(f.v.high, { plain: true }).replace('$', ''); return F.dollars(f.v, { plain: true }).replace('$', ''); }

/* the stacked bar every base number shows: itemized known, itemized estimated, the unitemized remainder, and the overflow past the gut number */
export function coverageBar(r) {
  if (!r || r.status !== 'ok' || r.total === null) return h('div', { class: 'cov-bar empty' }, h('span', { class: 'small muted' }, 'nothing yet'));
  const base = Math.max(1, r.total + (r.overGut ? 0 : 0)); const knownC = r.counts.known ? Math.round(r.itemized * (r.counts.known / Math.max(1, r.counts.known + r.counts.estimated))) : 0; const estC = r.itemized - knownC;
  const seg = (cls, cents, title) => cents > 0 ? h('span', { class: 'cov-seg ' + cls, style: { width: (cents / base * 100) + '%' }, title }) : null;
  return h('div', { class: 'cov-bar', title: 'Itemized ' + money(r.itemized) + ', unitemized ' + money(r.remainder) + (r.overGut ? ', over the gut number by ' + money(r.overGut.gap) : '') },
    seg('known', knownC, 'Known rows'), seg('est', estC, 'Estimated rows'), seg('rem', r.remainder, REMAINDER_LABEL), r.overGut ? h('span', { class: 'cov-seg over', style: { width: Math.min(40, r.overGut.gap / base * 100) + '%' }, title: 'Over the gut number by ' + money(r.overGut.gap) }) : null);
}
export function coverageRing(coverage, size) {
  const s = size || 56; const r = (s - 8) / 2; const c = 2 * Math.PI * r; const v = Math.max(0, Math.min(1, coverage || 0));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 ' + s + ' ' + s); svg.setAttribute('width', s); svg.setAttribute('height', s); svg.setAttribute('class', 'cov-ring'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Coverage ' + Math.round(v * 100) + ' percent');
  svg.innerHTML = '<circle class="track" cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '"/><circle class="fill" cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - v)) + '" transform="rotate(-90 ' + s / 2 + ' ' + s / 2 + ')"/><text x="50%" y="50%" dy="0.35em" text-anchor="middle">' + Math.round(v * 100) + '%</text>';
  return svg;
}

export function mount(host, app) {
  const baseId = app.route.params.id; const def = baseId ? BASE_NUMBERS.find(b => b.id === baseId) : null;
  try { sessionStorage.removeItem(FROM_KEY); } catch (e) { /* no storage */ }
  if (def) return mountDive(host, app, def);
  const coach = app.view === 'coach';
  host.appendChild(h('header', null, h('h1', null, 'Quick snapshot'), h('span', { class: 'sub' }, 'Every base number on one screen. A number, a range like 1500-2000, Not for me, or Don\'t know yet. Fifteen minutes, then sharpen any one of them.')));
  const body = h('div', { class: 'snapshot' }); host.appendChild(body);
  let incomeMode = null; let incomeCad = 'month';
  function draw() {
    clear(body); const R = app.result; const snap = R.snapshot; const S = R.sun && R.sun.outputs;
    const top = h('section', { class: 'panel snap-top' });
    top.appendChild(h('div', { class: 'row snap-head' }, coverageRing(snap.coverage, 64), h('div', null, h('div', { class: 'big' }, snap.complete + ' of ' + snap.total + ' base numbers in'), h('div', { class: 'small muted' }, Math.round(snap.coverage * 100) + '% of the picture is itemized; the rest stands on the snapshot. ', h('a', { href: '#/whatsleft' }, 'What\'s left'))),
      h('div', { class: 'snap-wage small muted' }, R.hours && R.hours.wage ? 'Real hourly wage ' + F.dollars(R.hours.wage, { plain: true }) + ' an hour (' + R.hours.label.toLowerCase() + ')' : 'Add income to see hours')));
    body.appendChild(top);
    GROUPS.forEach(([gid, glabel]) => {
      const sec = h('section', { class: 'panel snap-group', dataset: { group: gid } }); sec.appendChild(h('h2', null, glabel));
      snap.list.filter(b => b.group === gid).forEach(b => sec.appendChild(b.id === 'debt' ? debtBlock(b, R) : b.id === 'incomeRegular' ? incomeBlock(b, R) : baseRow(b, R)));
      body.appendChild(sec);
    });
  }
  function commitBase(b, text, stateOverride) {
    const t = String(text || '').trim();
    if (stateOverride === 'unknown' || stateOverride === 'not-for-me') { app.change(rec => setBase(rec, app.data.fields, b, null, stateOverride, 'client', { session: app.session }), { reason: 'rows' }); return; }
    if (t === '') { if (b.field && b.field.v !== null) app.change(rec => setBase(rec, app.data.fields, b, null, 'unknown', 'client', { session: app.session }), { reason: 'rows' }); return; }
    let v; try { v = F.parseMoney(t); } catch (e) { app.toast('A number, or a range like 1500-2000.'); return; }
    const st = stateOverride || (b.field && ['known', 'rough', 'will-send'].includes(b.field.state) ? b.field.state : 'rough');
    app.change(rec => setBase(rec, app.data.fields, b, v, st === 'unknown' ? 'rough' : st, 'client', { session: app.session }), { reason: 'rows' });
  }
  function baseRow(b, R, extra) {
    const r = b.resolved; const guess = guessFor(b, R, app.record); const f = b.field;
    const input = h('input', { class: 'input num snap-input' + (!f || f.v === null ? ' is-empty' : ''), type: 'text', inputmode: 'decimal', 'aria-label': b.label, value: rangeText(f), placeholder: guess ? guess.label + ' ' + F.dollars(guess.cents, { plain: true }).replace('$', '') : '', onChange: e => commitBase(b, e.target.value) });
    const conf = h('select', { class: 'select small conf', 'aria-label': b.label + ', how sure', onChange: e => { const st = e.target.value; if (st === 'unknown') { input.value = ''; commitBase(b, '', 'unknown'); } else commitBase(b, input.value, st); } }, CONF.map(([id, lab]) => h('option', { value: id, selected: f ? f.state === id || (id === 'unknown' && !f) : id === 'rough' }, lab)));
    const notMe = h('button', { type: 'button', class: 'chip toggle' + (f && f.state === 'not-for-me' ? ' on' : ''), 'aria-pressed': String(!!(f && f.state === 'not-for-me')), onClick: () => { if (f && f.state === 'not-for-me') commitBase(b, '', 'unknown'); else { input.value = ''; commitBase(b, '', 'not-for-me'); } } }, 'Not for me');
    const dunno = h('button', { type: 'button', class: 'chip toggle' + (f && f.state === 'unknown' && f.v === null ? ' on' : ''), 'aria-pressed': String(!!(f && f.state === 'unknown')), onClick: () => { input.value = ''; commitBase(b, '', 'unknown'); } }, 'Don\'t know yet');
    const read = r && r.status === 'ok' ? h('div', { class: 'small muted snap-read' }, r.hasRows ? ('Itemized ' + money(r.itemized) + (r.remainder ? ' + ' + money(r.remainder) + ' unitemized' : '') + ' = ' + money(r.total) + (PERIOD_WORD[b.period] ? ' ' + PERIOD_WORD[b.period] : '') + ', ' + pct(r.coverage) + ' covered') : (f && f.state === 'not-for-me' ? 'Not for me' : 'From the snapshot; nothing itemized yet'), r.overGut ? h('span', { class: 'chip warn' }, 'over your gut number by ' + money(r.overGut.gap) + (r.overGut.pct !== null ? ' (' + pct(r.overGut.pct) + ')' : '')) : null) : h('div', { class: 'small muted snap-read' }, f && f.state === 'not-for-me' ? 'Not for me' : guess ? 'Blank. ' + (guess.label === 'What you said' ? 'The discovery call said ' : 'The rooms hold a guess for this area: ') + money(guess.cents) + '.' : 'Blank is the only incomplete state.');
    return h('div', { class: 'snap-base' + (b.complete ? ' complete' : ''), dataset: { base: b.id } },
      h('div', { class: 'snap-label' }, h('strong', null, b.label), h('span', { class: 'small muted' }, ' ' + b.ask), b.asOf ? h('span', { class: 'small muted' }, ' As of ' + F.dateLocal(b.asOf) + (b.supplier ? ', from ' + (b.supplier === 'client' ? 'the client' : b.supplier === 'discovery' ? 'the discovery call' : b.supplier) : '') + '.') : null),
      h('div', { class: 'snap-controls row' }, h('span', { class: 'amount-box' }, h('span', { class: 'muted small' }, '$'), input, b.period !== 'oneoff' ? h('span', { class: 'small muted' }, PERIOD_WORD[b.period]) : null), conf, dunno, notMe, h('a', { class: 'btn small', href: '#/snapshot/' + b.id, 'aria-label': 'Open the rows of ' + b.label }, r && r.hasRows ? 'Rows (' + b.rowCount + ')' : 'Itemize')),
      coverageBar(r), read, extra || null);
  }
  /* a salaried pay row the snapshot can write gross pay and hours a week to: the first W-2 row, made on first use (MR-116) */
  function salariedRow(make) {
    const have = app.record.planets.income.rows.find(r => r.type === 'w2' && !r.hourly && !(r.f.hourlyRate && hasValue(r.f.hourlyRate)));
    if (have || !make) return have || null;
    const row = createRow('income', 'w2', { nickname: 'Main job', f: freshFacts(app.data.fields, 'income', 'w2') }); row.f.grossPay.cad = 'month'; app.addRow(row); return row;
  }
  function incomeBlock(b, R) {
    const S = R.sun.outputs; const rows = app.record.planets.income.rows.filter(r => ['w2', 'c1099', 'side'].includes(r.type));
    const hourlyRows = rows.filter(r => r.hourly || (r.f.hourlyRate && hasValue(r.f.hourlyRate))); /* a row added as hourly stays in the hourly list while its rate is still blank */
    if (incomeMode === null) incomeMode = hourlyRows.length ? 'hourly' : 'salary';
    const seg = segmented([['salary', 'Salary'], ['hourly', 'Hourly']], incomeMode, v => { incomeMode = v; draw(); }, { label: 'Income is paid as', small: true });
    /* said per paycheck, a month or a year; as gross or as take-home (MR-116): take-home lands on the snapshot, gross on the pay row and the engine solves the rest */
    const CADS = [['paycheck', 'a paycheck'], ['month', 'a month'], ['year', 'a year']]; const sal = salariedRow(false);
    const cadSel = h('select', { class: 'select small', 'aria-label': 'Regular take-home is said per', onChange: e => { const cad = e.target.value; incomeCad = cad; if (b.field && b.field.v !== null) app.change(rec => setBase(rec, app.data.fields, b, b.field.v, b.field.state, 'client', { session: app.session, cad }), { reason: 'rows' }); } }, CADS.map(([id, lab]) => h('option', { value: id, selected: (b.field && b.field.cad ? b.field.cad : incomeCad) === id }, lab)));
    const grossBox = h('input', { class: 'input num snap-input', type: 'text', inputmode: 'decimal', 'aria-label': 'Gross pay, before tax', value: sal && sal.f.grossPay && hasValue(sal.f.grossPay) ? rangeText(sal.f.grossPay) : '', onChange: e => { const t = e.target.value.trim(); if (!t) return; let v; try { v = F.parseMoney(t); } catch (err) { app.toast('A number, or a range like 4000-4500.'); return; } const row = salariedRow(true); app.setField(row.id, 'grossPay', v, 'known', 'client', b.field && b.field.cad ? b.field.cad : incomeCad); } });
    const solved = S.income.takeHomeMonthly && S.income.takeHomeMonthly.status === 'ok' && sal && !(b.field && hasValue(b.field)) ? h('span', { class: 'small muted' }, 'Solved: about ' + F.dollarsWhole(S.income.takeHomeMonthly.cents) + ' a month take-home, from the gross with the one tax function.') : null;
    const wrap = h('div', { class: 'income-mode' }, h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Said per'), cadSel, h('span', { class: 'small muted' }, 'or as gross'), h('span', { class: 'amount-box' }, h('span', { class: 'muted small' }, '$'), grossBox), solved), h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Paid as'), seg));
    if (incomeMode === 'hourly') {
      wrap.appendChild(h('p', { class: 'small muted' }, 'Each job is its own row with its own rate and hours. A range like 30-33 hours gives a range of income.'));
      hourlyRows.forEach(r => wrap.appendChild(hourlyRow(r, R)));
      wrap.appendChild(h('button', { class: 'btn small', onClick: () => { const row = createRow('income', 'w2', { nickname: hourlyRows.length ? 'Second job' : 'Main job', f: freshFacts(app.data.fields, 'income', 'w2') }); row.f.grossPay.cad = 'paycheck'; row.hourly = true; app.addRow(row); } }, hourlyRows.length ? 'Add another job' : 'Add an hourly job'));
    } else {
      const salaried = rows.filter(r => !r.hourly && !(r.f.hourlyRate && hasValue(r.f.hourlyRate)) && r.f.grossPay && hasValue(r.f.grossPay));
      if (salaried.length && S.income.grossMonthly && S.income.grossMonthly.status === 'ok') {
        const first = salaried[0]; const hpf = first.f.hoursPaid; const hp = salaried.reduce((s2, r) => s2 + ((r.f.hoursPaid && hasValue(r.f.hoursPaid) ? Number(r.f.hoursPaid.v) : 0) || 0), 0) || 40;
        /* the salaried hours a week feed the real hourly wage (MR-116): editable here, a range allowed */
        wrap.appendChild(h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Hours a week'), h('input', { class: 'input num snap-input', type: 'text', inputmode: 'decimal', 'aria-label': 'Hours a week on the salaried job', placeholder: '40', value: hpf && hasValue(hpf) ? (typeof hpf.v === 'object' ? hpf.v.low + '-' + hpf.v.high : String(hpf.v)) : '', onChange: e => { const t = e.target.value.trim(); if (!t) { app.setField(first.id, 'hoursPaid', null, 'unknown', 'client'); return; } const m = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(t); const v = m ? { low: Math.min(+m[1], +m[2]), high: Math.max(+m[1], +m[2]) } : Number(t); if (typeof v === 'number' && !Number.isFinite(v)) { app.toast('A number, or a range like 38-42.'); return; } app.setField(first.id, 'hoursPaid', v, 'known', 'client'); } }), h('span', { class: 'small muted' }, 'The salary reads back as about ' + F.dollars(salaryAsHourly(S.income.grossMonthly.cents, hp, DEFAULT_WEEKS), { plain: true }) + ' an hour gross at ' + hp + ' hours a week.')));
      } else if (!salaried.length) wrap.appendChild(h('p', { class: 'small muted' }, 'Type the gross pay above, or the take-home, and the app solves the other.'));
    }
    return baseRow(b, R, wrap);
  }
  function hourlyRow(r, R) {
    const src = (R.sun.outputs.income.hourlySources || []).find(x => x.rowId === r.id);
    const f = id => r.f[id] || { v: null, state: 'unknown' }; const txt = id => { const x = f(id); if (x.v === null || x.v === undefined) return ''; if (typeof x.v === 'object') return x.v.low + '-' + x.v.high; return app.data.fields.fields[id].kind === 'money' ? F.dollars(x.v, { plain: true }).replace('$', '') : String(x.v); };
    const set = (id, raw, cad) => { const t = String(raw).trim(); const kind = app.data.fields.fields[id].kind; if (t === '') { app.setField(r.id, id, null, 'unknown', 'client'); return; } let v; try { v = kind === 'money' ? F.parseMoney(t) : (/^\d+(\.\d+)?\s*-\s*\d+(\.\d+)?$/.test(t) ? (() => { const [a, c] = t.split('-').map(Number); return { low: Math.min(a, c), high: Math.max(a, c) }; })() : Number(t)); } catch (e) { app.toast('A number, or a range like 30-33.'); return; } if (typeof v === 'number' && !Number.isFinite(v)) { app.toast('A number, or a range like 30-33.'); return; } app.setField(r.id, id, v, 'known', 'client', cad); };
    const box = (id, label, opts) => h('span', { class: 'term' }, h('label', { class: 'small muted' }, label), h('input', { class: 'input num', type: 'text', inputmode: 'decimal', 'aria-label': (r.nickname || 'Job') + ' ' + label.toLowerCase(), value: txt(id), onChange: e => set(id, e.target.value, opts && opts.cad) }));
    const sel = (id, label, options) => h('span', { class: 'term' }, h('label', { class: 'small muted' }, label), h('select', { class: 'select small', 'aria-label': (r.nickname || 'Job') + ' ' + label.toLowerCase(), onChange: e => app.setField(r.id, id, e.target.value, 'known', 'client') }, options.map(([v, lab]) => h('option', { value: v, selected: String(f(id).v) === String(v) }, lab))));
    const off = { holidays: '', sick: '', vacation: '', slowWeeks: '' };
    const helper = h('div', { class: 'row time-off' }, h('span', { class: 'small muted' }, 'Unpaid time off:'), ['holidays', 'sick', 'vacation'].map(k => h('input', { class: 'input num tiny', type: 'text', inputmode: 'numeric', 'aria-label': k + ' days a year', placeholder: k + ' days', onChange: e => { off[k] = e.target.value; } })), h('input', { class: 'input num tiny', type: 'text', inputmode: 'numeric', 'aria-label': 'slow weeks a year', placeholder: 'slow weeks', onChange: e => { off.slowWeeks = e.target.value; } }),
      h('button', { type: 'button', class: 'btn small', onClick: () => { const w = weeksFromTimeOff({ holidays: Number(off.holidays) || 0, sick: Number(off.sick) || 0, vacation: Number(off.vacation) || 0, slowWeeks: Number(off.slowWeeks) || 0 }); app.setField(r.id, 'weeksPerYear', w, 'known', 'client'); } }, 'Work out the weeks'));
    const conv = src ? h('p', { class: 'small conv', dataset: { conv: r.id } }, F.dollars(src.rate, { plain: true }) + ' an hour x ' + (src.hoursRange ? src.hoursRange.low + ' to ' + src.hoursRange.high : src.hours) + ' hours ' + HOURS_PER.find(p => p[0] === src.per)[1] + (src.per === 'week' ? ' x ' + src.weeks + ' weeks' : '') + (src.overtime ? ' + ' + src.overtime + ' overtime hours at ' + src.multiplier + 'x' : '') + (src.tipsMonthly ? ' + tips' : '') + ' = ' + F.dollarsWhole(src.grossAnnual, { plain: true }) + ' a year gross, about ' + F.dollarsWhole(src.takeHomeMonthly, { plain: true }) + ' a month take-home' + (src.takeHomeRange ? ' (' + F.dollarsWhole(src.takeHomeRange.low, { plain: true }) + ' to ' + F.dollarsWhole(src.takeHomeRange.high, { plain: true }) + ')' : '') + '.' + (src.unpaidWeeks ? ' Unpaid time off: ' + src.unpaidWeeks + ' weeks, ' + F.dollarsWhole(src.unpaidCostAnnual, { plain: true }) + ' a year.' : ''))
      : h('p', { class: 'small muted' }, 'A rate and hours light the conversion.');
    const chart = src ? hoursChart(src) : null;
    return h('div', { class: 'hourly-row', dataset: { row: r.id } }, h('div', { class: 'row' }, h('input', { class: 'input', 'aria-label': 'Job name', value: r.nickname || '', onChange: e => app.change(rec => { const x = rec.planets.income.rows.find(y => y.id === r.id); x.nickname = e.target.value.trim(); return true; }, { reason: 'rows' }) }), h('span', { class: 'chip src' }, typeDef(app.data.fields, 'income', r.type).label)),
      h('div', { class: 'terms' }, box('hourlyRate', 'Rate, gross'), box('hoursPaid', 'Hours'), sel('hoursPer', 'Per', HOURS_PER.map(p => [p[0], p[1].replace('a ', '')])), box('weeksPerYear', 'Weeks a year'), box('overtimeHours', 'Overtime hours a week'), sel('overtimeMultiplier', 'At', app.data.fields.fields.overtimeMultiplier.options), box('tips', 'Tips a week', { cad: 'week' }), sel('payFrequency', 'Paid', app.data.fields.fields.payFrequency.options), box('hoursCommute', 'Commute hours a week'), box('hoursUnpaid', 'Unpaid hours a week')),
      helper, conv, chart);
  }
  /* income across the hours range, and what unpaid time off costs: a small bar chart, no library */
  function hoursChart(src) {
    const lo = src.takeHomeRange ? src.takeHomeRange.low : src.takeHomeMonthly, hi = src.takeHomeRange ? src.takeHomeRange.high : src.takeHomeMonthly; const max = Math.max(hi, 1);
    const bar = (label, cents, cls) => h('div', { class: 'hbar' }, h('span', { class: 'small muted' }, label), h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill ' + cls, style: { width: Math.round(cents / max * 100) + '%' } })), h('span', { class: 'num small' }, F.dollarsWhole(cents)));
    return h('div', { class: 'hours-chart', dataset: { chart: 'hoursRange' } }, bar('Low', lo, 'low'), bar('Likely', src.takeHomeMonthly, 'likely'), bar('High', hi, 'high'), src.unpaidWeeks ? h('p', { class: 'small muted' }, 'Unpaid time off costs ' + F.dollarsWhole(src.unpaidCostAnnual) + ' a year (' + src.unpaidWeeks + ' weeks).') : null);
  }
  function debtBlock(b, R) {
    const rows = app.record.planets.debt.rows.filter(r => b.dive.types.includes(r.type)); const r = b.resolved;
    const list = h('div', { class: 'snap-debts' });
    rows.forEach(d => { const td = typeDef(app.data.fields, 'debt', d.type); const rate = d.type === 'card' ? 'apr' : 'rate'; const minF = d.type === 'card' || d.type === 'student' ? 'minimum' : d.type === 'mortgage' ? 'principalInterest' : 'payment';
      const cell = (fid, label, kind) => h('input', { class: 'input num', type: 'text', inputmode: 'decimal', 'aria-label': (d.nickname || td.label) + ' ' + label, value: d.f[fid] && hasValue(d.f[fid]) ? (kind === 'percent' ? String(Math.round(d.f[fid].v * 10000) / 100) : F.dollars(d.f[fid].v, { plain: true }).replace('$', '')) : '', placeholder: label, onChange: e => { const t = e.target.value.trim(); if (!t) { app.setField(d.id, fid, null, 'unknown', 'client'); return; } try { app.setField(d.id, fid, kind === 'percent' ? F.parsePercent(t) : F.parseMoney(t), 'known', 'client', kind === 'money' && fid !== 'balance' ? 'month' : undefined); } catch (err) { app.toast('A number.'); } } });
      list.appendChild(h('div', { class: 'row debt-line', dataset: { row: d.id } }, h('span', { class: 'chip src' }, td.label), h('input', { class: 'input', 'aria-label': 'Debt name', value: d.nickname || '', onChange: e => app.change(rec => { const x = rec.planets.debt.rows.find(y => y.id === d.id); x.nickname = e.target.value.trim(); return true; }, { reason: 'rows' }) }), cell('balance', 'Balance', 'money'), cell(rate, 'Rate %', 'percent'), cell(minF, 'Minimum a month', 'money'))); });
    const addSel = h('select', { class: 'select small', 'aria-label': 'Add a debt', onChange: e => { const t = e.target.value; e.target.value = ''; if (!t) return; const row = createRow('debt', t, { nickname: typeDef(app.data.fields, 'debt', t).label, f: freshFacts(app.data.fields, 'debt', t) }); app.addRow(row); } }, h('option', { value: '' }, 'Add a debt'), b.dive.types.map(t => h('option', { value: t }, typeDef(app.data.fields, 'debt', t).label)));
    const none = h('button', { type: 'button', class: 'chip toggle' + (b.field && b.field.state === 'none' ? ' on' : ''), 'aria-pressed': String(!!(b.field && b.field.state === 'none')), onClick: () => app.change(rec => setBase(rec, app.data.fields, b, 0, 'none', 'client', { session: app.session }), { reason: 'rows' }) }, 'No debt');
    const read = r && r.status === 'ok' ? h('div', { class: 'small muted snap-read' }, rows.length ? rows.length + (rows.length === 1 ? ' debt, ' : ' debts, ') + money(r.itemized) + (r.remainder ? ' + ' + money(r.remainder) + ' unitemized' : '') + ' = ' + money(r.total) : (b.field && b.field.state === 'none' ? 'No debt.' : 'From the rough total.')) : h('div', { class: 'small muted snap-read' }, 'Each debt with its balance, rate and minimum, because the rate drives the plan. Or No debt.');
    return h('div', { class: 'snap-base' + (b.complete ? ' complete' : ''), dataset: { base: b.id } }, h('div', { class: 'snap-label' }, h('strong', null, b.label), h('span', { class: 'small muted' }, ' ' + b.ask)), list, h('div', { class: 'row snap-controls' }, addSel, none, h('a', { class: 'btn small', href: '#/snapshot/debt' }, 'Rows (' + rows.length + ')')), coverageBar(r), read);
  }
  draw();
  return { update() { draw(); } };
}

/* ---- the deep dive ---- */
/* MR-117: the split preset on a spending line (blank is automatic) and, for Part fixed, the fixed share as a percent. */
function splitPick(app, x) {
  const row = app.record.planets.spending.rows.find(r => r.id === x.rowId); const def = app.data.fields.fields.splitKind;
  const cur = row && row.f.splitKind && hasValue(row.f.splitKind) ? row.f.splitKind.v : '';
  const sel = h('select', { class: 'select small', 'aria-label': x.name + ' split', onChange: e => { const v = e.target.value; app.setField(x.rowId, 'splitKind', v || null, v ? 'known' : 'unknown', 'client'); } }, h('option', { value: '', selected: cur === '' }, 'Automatic'), def.options.map(o => h('option', { value: o[0], selected: cur === o[0] }, o[1])));
  const share = row && row.f.fixedShare && hasValue(row.f.fixedShare) ? row.f.fixedShare.v : null;
  const pct = cur === 'mixed' ? h('span', { class: 'amount-box' }, h('input', { class: 'input num', type: 'text', inputmode: 'numeric', style: { width: '56px' }, 'aria-label': x.name + ' fixed share', placeholder: 'share', value: typeof share === 'number' ? String(Math.round(share * 100)) : '', onChange: e => { const t = e.target.value.trim(); if (!t) { app.setField(x.rowId, 'fixedShare', null, 'unknown', 'client'); return; } const n = Number(t.replace('%', '')); if (!Number.isFinite(n) || n < 0 || n > 100) { app.toast('A percent from 0 to 100.'); return; } app.setField(x.rowId, 'fixedShare', n / 100, 'known', 'client'); } }), h('span', { class: 'small muted' }, '% fixed')) : null;
  return h('span', { class: 'split-pick' }, sel, pct);
}
function mountDive(host, app, def) {
  const coach = app.view === 'coach';
  const bar = h('div', { class: 'dive-bar' }, h('a', { class: 'btn primary', href: '#/snapshot' }, 'Back to snapshot'), h('span', { class: 'small muted' }, 'Fill any of it and leave whenever; nothing is lost.'), h('a', { class: 'btn small', href: '#/ledger/' + def.dive.planet + '/' + def.dive.types[0], onClick: () => { try { sessionStorage.setItem(FROM_KEY, '1'); } catch (e) { /* no storage */ } } }, 'Open the full room'));
  host.appendChild(bar);
  host.appendChild(h('header', null, h('h1', null, def.label), h('span', { class: 'sub' }, 'The rows that itemize it. Known, Estimated, N/A, or Not yet on each.')));
  const body = h('div', { class: 'dive' }); host.appendChild(body);
  function draw() {
    clear(body); const R = app.result; const b = R.snapshot.list.find(x => x.id === def.id); const r = b.resolved;
    const top = h('section', { class: 'panel dive-top' });
    top.appendChild(h('div', { class: 'row' }, h('div', null, h('div', { class: 'big' }, r && r.status === 'ok' ? money(r.total) + (PERIOD_WORD[def.period] ? ' ' + PERIOD_WORD[def.period] : '') : 'nothing yet'), h('div', { class: 'small muted' }, r && r.status === 'ok' ? 'Itemized ' + money(r.itemized) + (r.remainder ? ' plus ' + money(r.remainder) + ' unitemized from the snapshot' : '') + ', ' + pct(r.coverage) + ' covered. ' + r.counts.known + ' known, ' + r.counts.estimated + ' estimated, ' + r.counts.na + ' N/A, ' + r.counts.notYet + ' not yet.' : 'Add a row, or a snapshot figure.')), r && r.overGut ? h('span', { class: 'chip warn' }, 'Rows run over the gut number by ' + money(r.overGut.gap)) : null));
    top.appendChild(coverageBar(r));
    /* gut against actual once the rows cover most of it (threshold: 60% of the total itemized, MR-111) */
    if (r && r.status === 'ok' && r.snapshot && r.coverage >= 0.6) { const max = Math.max(r.snapshot.cents, r.itemized, 1); const row = (label, cents, cls) => h('div', { class: 'hbar' }, h('span', { class: 'small muted' }, label), h('span', { class: 'hbar-track' }, h('span', { class: 'hbar-fill ' + cls, style: { width: Math.round(cents / max * 100) + '%' } })), h('span', { class: 'num small' }, money(cents))); top.appendChild(h('div', { class: 'hours-chart gut-chart', dataset: { chart: 'gutVsActual' } }, h('h3', null, 'Gut against actual'), row('Gut (the snapshot)', r.snapshot.cents, 'low'), row('Actual (the rows)', r.itemized, 'likely'))); }
    body.appendChild(top);
    const rows = diveRows(app.record, app.data.fields, def);
    const sec = h('section', { class: 'panel' }); body.appendChild(sec);
    sec.appendChild(h('h2', null, 'Rows', h('span', { class: 'tag' }, rows.length + (rows.length === 1 ? ' row' : ' rows'))));
    if (!rows.length) sec.appendChild(h('p', { class: 'muted small' }, 'No rows yet.'));
    rows.forEach(x => {
      const def2 = app.data.fields.fields[x.field]; const cadWord = def2.cadence ? (x.cad === 'paycheck' ? 'a paycheck' : x.cad === 'year' ? 'a year' : x.cad === 'week' ? 'a week' : 'a month') : '';
      const input = h('input', { class: 'input num', type: 'text', inputmode: 'decimal', 'aria-label': x.name + ' ' + x.fieldLabel, value: x.hasValue ? (typeof x.f.v === 'object' ? F.dollars(x.f.v.low, { plain: true }).replace('$', '') + '-' + F.dollars(x.f.v.high, { plain: true }).replace('$', '') : F.dollars(x.f.v, { plain: true }).replace('$', '')) : '', onChange: e => { const t = e.target.value.trim(); if (!t) { app.setField(x.rowId, x.field, null, 'unknown', 'client'); return; } try { app.setField(x.rowId, x.field, F.parseMoney(t), x.f && x.f.state === 'rough' ? 'rough' : 'known', 'client'); } catch (err) { app.toast('A number, or a range like 1500-2000.'); } } });
      const seg = segmented(ROW_STATES.map(s => [s[0], s[1]]), x.rowState === 'blank' ? null : x.rowState, v => { const st = storedFor(v, x.f && x.f.state === 'will-send' ? 'email' : 'know'); app.setField(x.rowId, x.field, v === 'na' || v === 'notYet' ? null : (x.hasValue ? x.f.v : null), st.state, 'client'); }, { label: x.name + ' state', small: true });
      const sub = x.rowState === 'notYet' ? segmented([['email', 'Will email'], ['know', "Doesn't know"]], x.f && x.f.state === 'will-send' ? 'email' : 'know', v => app.setField(x.rowId, x.field, null, storedFor('notYet', v).state, 'client'), { label: x.name + ' not yet because', small: true }) : null;
      const split = def.planet === 'spending' && x.type === 'line' ? splitPick(app, x) : null; /* MR-117: the split is selected on the line */
      sec.appendChild(h('div', { class: 'dive-row', dataset: { row: x.rowId } }, h('div', { class: 'dive-name' }, h('strong', null, x.name), h('span', { class: 'chip src' }, x.typeLabel)), h('div', { class: 'row' }, h('span', { class: 'amount-box' }, h('span', { class: 'muted small' }, '$'), input, cadWord ? h('span', { class: 'small muted' }, cadWord) : null), seg, sub, split)));
    });
    if (def.planet === 'spending' && rows.length) sec.appendChild(h('p', { class: 'small muted' }, 'Split: which base number a line belongs to. Automatic lets Need or Want and the category decide; Part fixed takes a fixed share and counts the rest as variable.'));
    if (coach) { const types = def.dive.types; const sel = h('select', { class: 'select small', 'aria-label': 'Add a row to ' + def.label, onChange: e => { const t = e.target.value; e.target.value = ''; if (!t) return; const row = createRow(def.dive.planet, t, { nickname: typeDef(app.data.fields, def.dive.planet, t).label, f: freshFacts(app.data.fields, def.dive.planet, t) }); const tdef = typeDef(app.data.fields, def.dive.planet, t); tdef.fields.forEach(id => { const d = app.data.fields.fields[id]; if (d.cadence) row.f[id].cad = d.defaultCadence; }); if (def.dive.planet === 'spending') { row.f.category.v = def.id === 'expensesAnnual' ? 'irregular' : 'other'; row.f.category.state = 'known'; row.f.needWant.v = def.id === 'expensesFixed' ? 'need' : 'want'; } app.addRow(row); } }, h('option', { value: '' }, 'Add a row'), types.map(t => h('option', { value: t }, typeDef(app.data.fields, def.dive.planet, t).label))); sec.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, sel)); }
  }
  draw();
  return { update() { draw(); } };
}

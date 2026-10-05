/* Assumptions: the engine defaults a coach can change for one client, stored on
   the Sun. Everything is in today's dollars. Three groups in one panel; a row
   shows its default only when the value here differs from it. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { parseTyped } from '../typed.js';

const GROUPS = [
  ['Growth', ['returnLikely', 'returnBest', 'returnWorst', 'cashRealReturn']],
  ['Retirement and independence', ['withdrawalRate', 'retirementAgeDefault', 'socialSecurityAge', 'socialSecurityScale', 'slowgoAge', 'nogoAge', 'projectionEndAge', 'fatFiMultiplier', 'baristaIncomeAnnualCents']],
  ['Flags', ['shelterHeavyShare', 'hiddenLeakShare', 'utilizationCardMax', 'utilizationTotalMax', 'feeDragEr', 'thinRunwayMonths', 'lockedLiquidityShare', 'realWageShare', 'noFeeBaselineRate']],
];
const KIND = k => /Cents$/.test(k) ? 'money' : /Age$|Months$|AgeDefault$|EndAge$/.test(k) ? 'int' : k === 'fatFiMultiplier' ? 'multiple' : 'percent';
const places = v => Math.abs(v * 1000 - Math.round(v * 1000)) > 1e-9 ? 2 : 1;
const fmt = (kind, v) => kind === 'money' ? F.dollarsWhole(v) : kind === 'percent' ? F.percent(v, { places: places(v) }) : kind === 'multiple' ? String(v) + 'x' : String(v);
const raw = (kind, v) => kind === 'money' ? String(v / 100) : kind === 'percent' ? String(Math.round(v * 10000) / 100) : String(v);

export function mount(host, app) {
  const defaults = app.data.assumptions.defaults; const labels = app.data.assumptions.labels;
  const resetBtn = h('button', { class: 'btn', onClick: () => { app.mutate(rec => { rec.sun.assumptions = {}; }, 'assumptions'); } }, 'Reset');
  host.appendChild(h('header', null, h('h1', null, 'Assumptions'), h('span', { class: 'sub' }, 'In today\'s dollars. A change here applies to this client only.'), h('div', { class: 'actions' }, resetBtn)));
  const panel = h('section', { class: 'panel assumptions' }); host.appendChild(panel);
  function draw() {
    clear(panel);
    const over = app.record.sun.assumptions || {};
    const n = Object.keys(over).filter(k => defaults[k] !== undefined).length;
    resetBtn.textContent = n ? 'Reset ' + n + (n === 1 ? ' change' : ' changes') : 'Reset';
    resetBtn.disabled = n === 0;
    GROUPS.forEach(([heading, keys]) => {
      panel.appendChild(h('h3', null, heading));
      if (heading === 'Retirement and independence') {
        const L = app.result.sun && app.result.sun.outputs && app.result.sun.outputs.life;
        const g = L && L.spendingShares ? L.spendingShares : { gogo: defaults.gogo, slowgo: defaults.slowgo, nogo: defaults.nogo };
        panel.appendChild(h('div', { class: 'fieldrow readonly' }, h('label', null, 'Spending in retirement'), h('div', { class: 'control' }, h('span', { class: 'value' }, [g.gogo, g.slowgo, g.nogo].map(x => String(Math.round(x * 100))).join(' / ') + '%')), h('span', { class: 'src small muted' }, 'from the ', h('a', { href: '#/ledger/life/retirement' }, 'Life plan'))));
      }
      keys.forEach(k => {
        const kind = KIND(k); const set = over[k] !== undefined; const v = set ? over[k] : defaults[k];
        const commit = val => app.mutate(rec => { if (val === null || val === defaults[k]) delete rec.sun.assumptions[k]; else rec.sun.assumptions[k] = val; }, 'assumptions');
        const control = h('input', { class: 'input num', value: fmt(kind, v), 'aria-label': labels[k] || k });
        control.addEventListener('focus', () => { control.value = raw(kind, v); control.select(); });
        control.addEventListener('change', e => { try { const p = parseTyped(kind === 'multiple' ? 'hours' : kind, e.target.value); commit(p ? p.v : null); } catch (err) { app.toast(err.message); } });
        control.addEventListener('blur', () => { const cur = (app.record.sun.assumptions || {})[k]; control.value = fmt(kind, cur !== undefined ? cur : defaults[k]); });
        panel.appendChild(h('div', { class: 'fieldrow', dataset: { field: k } }, h('label', null, labels[k] || k), h('div', { class: 'control' }, control),
          h('span', { class: 'src small muted' }, set ? ['Default ' + fmt(kind, defaults[k]) + ' ', h('button', { class: 'btn quiet small', onClick: () => commit(null) }, 'Use default')] : '')));
      });
    });
  }
  draw();
  return { update() { draw(); } };
}

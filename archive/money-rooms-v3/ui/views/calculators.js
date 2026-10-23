/* The Calculators hub (Level 13, MR-067): one card per calculator, each
   with a live number from the client's record, the four new tools first
   and every calculator-like screen that already existed after them. The
   registry is data/calculators.json; the live numbers come from
   engine/calculators.js and the computed metrics. Views never do math. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { liveNumbers } from '../../engine/calculators.js';
import { textOf } from '../../engine/momentum.js';
import { clientName } from '../app.js';
import { cachedSensitivity, getSensitivity } from '../levers-bridge.js';
import { fmtMonths } from '../../engine/sensitivity.js';
const leverWord = i => i.aggregate ? 'spending' : (i.row && i.row !== i.label ? i.row + ' ' + i.label.toLowerCase() : i.label.toLowerCase());

export function mount(host, app) {
  const client = app.view === 'client'; const name = (clientName(app.record) || 'Household').split(' ')[0];
  host.appendChild(h('header', null, h('h1', null, 'Calculators'), h('span', { class: 'sub' }, client ? 'Each one starts from your numbers.' : 'Each one starts from ' + name + '’s numbers.')));
  const grid = h('div', { class: 'calc-cards' }); const more = h('section', { class: 'panel' }); host.appendChild(grid); host.appendChild(more);
  function draw() {
    clear(grid); clear(more);
    const live = liveNumbers(app.record, app.result, app.data); const M = app.result.metrics;
    const text = c => {
      const ok = v => v !== null && v !== undefined;
      switch (c.id) {
        case 'calendar': return ok(live.safeToSpend) ? ['Safe to spend today', F.dollarsWhole(live.safeToSpend)] : ['Needs', 'a checking balance and an income'];
        case 'home-afford': return ok(live.homeComfortable) ? ['Comfortable home price', 'about ' + F.dollarsCompact(live.homeComfortable)] : ['Needs', 'gross and take-home pay'];
        case 'house': return ok(live.houseMonthly) ? ['Owning at that price, a month', F.dollarsWhole(live.houseMonthly)] : ['Needs', 'gross and take-home pay'];
        case 'car': return ok(live.carBest) ? [live.carBestLabel + ' costs least', F.dollarsWhole(live.carBest) + ' a month'] : ['Needs', 'a state'];
        case 'retire': return ok(live.retireNestEgg) ? ['By ' + live.retireAge + ', at today’s pace', F.dollarsCompact(live.retireNestEgg)] : ['Needs', 'a birth date, balances and contributions'];
        case 'levers': { const s = cachedSensitivity(app); const top = s && s.ranked && s.ranked.top; if (top) return ['Biggest lever', leverWord(top) + ', ' + fmtMonths(top.realistic && top.realistic.months !== null && top.realistic.months !== undefined ? top.realistic.months : top.impact)]; return M.fiDate && M.fiDate.status === 'ok' ? ['Biggest lever', 'working it out'] : ['Needs', 'a FI date']; }
        case 'fi-ladder': { const L = app.result.ladder; const next = L && L.rungs ? L.rungs.filter(r => r.number !== null && r.pct < 1).sort((a, b) => a.number - b.number)[0] : null; if (next) { const d = app.data.metrics.metrics.find(x => x.id === next.id); return ['Next rung', (client ? d.clientLabel : d.name.replace(' number', '').replace(' (ladder rung)', '')) + (next.date ? ', ' + F.date(next.date) : ', ' + F.percent(next.pct, { places: 0 }) + ' there')]; } return ['Needs', 'monthly spending']; }
        case 'cushion': { const GP = app.result.goalPlan; const steps = GP ? GP.input.items.filter(i => typeof i.step === 'number') : []; const done = steps.filter(i => GP.assessment[i.id] && GP.assessment[i.id].status === 'done').length; const nxt = steps.find(i => GP.assessment[i.id] && GP.assessment[i.id].status !== 'done'); return steps.length ? [done + ' of 3 steps covered', nxt && GP.assessment[nxt.id].finishMonth ? (client ? nxt.clientName : nxt.name) + ' by ' + F.date(GP.assessment[nxt.id].finishMonth) : done === 3 ? 'All three covered' : 'Next step needs a date'] : ['Needs', 'monthly spending']; }
        case 'debt-payoff': { const m = M.debtFree; return m && m.status === 'ok' ? ['Debt-free', F.date(m.value.value)] : M.totalDebt && M.totalDebt.status === 'ok' && M.totalDebt.value.cents === 0 ? ['Debt-free', 'already'] : ['Needs', 'debt balances and minimums']; }
        case 'simulate': { const blocks = (app.record.scenarios || []).length; return [blocks ? blocks + (blocks === 1 ? ' block on the table' : ' blocks on the table') : 'Nothing on the table yet', blocks ? (app.record.scenarios[0].name || 'a change') : 'Try a move or a new job']; }
        default: { const m = M[c.liveMetric]; const d = app.data.metrics.metrics.find(x => x.id === c.liveMetric); return m && m.status === 'ok' && d ? [client ? d.clientLabel : d.name, textOf(m)] : ['Needs', (m && m.needs && m.needs[0]) || 'more of the picture']; }
      }
    };
    /* MR-072: one grid, ordered by how often a coach reaches for each; every card's number answers the card's question */
    const ORDER = ['calendar', 'cushion', 'debt-payoff', 'levers', 'home-afford', 'house', 'car', 'retire', 'fi-ladder', 'simulate', 'real-wage'];
    const list = app.data.calculators.calculators.filter(c => !client || c.clientVisible).slice().sort((a, b) => (ORDER.indexOf(a.id) === -1 ? 99 : ORDER.indexOf(a.id)) - (ORDER.indexOf(b.id) === -1 ? 99 : ORDER.indexOf(b.id)));
    list.forEach(c => { const [label, value] = text(c); grid.appendChild(h('a', { class: 'calc-card' + (label === 'Needs' ? ' locked' : ''), href: c.route, dataset: { calc: c.id } }, h('div', { class: 'calc-card-name' }, client ? c.client : c.name), h('div', { class: 'calc-card-live' }, h('span', { class: 'small muted' }, label), h('strong', null, value)), h('p', { class: 'small' }, c.purpose))); });
    more.remove();
    if (M.fiDate && M.fiDate.status === 'ok' && !cachedSensitivity(app)) getSensitivity(app, () => setTimeout(draw, 0));
  }
  draw();
  return { update() { draw(); } };
}

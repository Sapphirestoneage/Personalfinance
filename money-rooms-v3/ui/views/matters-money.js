/* What matters, the money tab (MR-099): every metric per priority and for the whole list, each open or saying what it needs. Reads the report; no math here. */
import { h, clear } from '../dom.js';
import * as F from '../../engine/format.js';
import { segmented } from '../seg.js';
import * as Mt from '../../engine/matters.js';
import { money, pct, field, cellOf } from './matters-bits.js';

/* ---- the money ---- */
function locked(u, extra) { return h('p', { class: 'small muted locked', dataset: { unlock: u.id } }, 'Opens when ' + u.needs.join(' and ') + (extra ? '. ' + extra : '.')); }
export function draw(ctx, R) {
  const { app, body, coach, listId, commit, M, draw } = ctx;
  const panel = h('section', { class: 'panel matters-money' }); body.appendChild(panel);
  panel.appendChild(h('h2', null, coach ? 'Where the money goes against what matters' : 'Your money against what matters'));
  if (!R.priorities.length) { panel.appendChild(h('p', { class: 'muted small' }, 'No priorities yet. ', h('a', { href: '#/matters/list' }, 'Start the list'))); return; }
  const U = {}; R.unlocks.forEach(u => { U[u.id] = u; });
  const kpi = (label, value, sub, u, cls) => h('div', { class: 'kpi ' + (u && !u.ready ? 'dim' : 'lit') + (cls ? ' ' + cls : ''), dataset: u ? { unlock: u.id } : {} }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, u && !u.ready ? 'opens later' : value), h('div', { class: 'small muted' }, u && !u.ready ? 'needs ' + u.needs.join(' and ') : sub));
  panel.appendChild(h('div', { class: 'grid grid-4 matters-kpis' },
    kpi(Mt.UNTIED, R.untied.cents === null ? '' : money(R.untied.cents) + ' a month', R.untied.share === null ? '' : pct(R.untied.share) + ' of spending', U.untied, 'headline'),
    kpi('Alignment, top 5', R.alignment.top5 === null ? '' : pct(R.alignment.top5), 'of spending goes to the top five' + (R.alignment.top10 !== null ? '; ' + pct(R.alignment.top10) + ' to the top ten' : ''), U.alignment),
    kpi('Cost of the top 10', money(R.top10Cost.declared) + ' a month', (R.top10Cost.share !== null ? pct(R.top10Cost.share) + ' of spending' : '') + (R.top10Cost.missing ? ', ' + R.top10Cost.missing + ' unpriced' : ''), U.top10),
    kpi('Time check', R.time.claimed + ' of ' + R.time.available + ' hours a week', R.time.over > 0 ? R.time.over + ' hours over' : R.time.left + ' hours left' + (R.time.unknownHours ? ', ' + R.time.unknownHours + ' unknown' : ''), U.time)));
  const rows = R.positives;
  const cell = cellOf;
  panel.appendChild(h('h3', null, 'Each priority'));
  panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data stack matters-table' }, h('thead', null, h('tr', null, h('th', null, 'Rank'), h('th', null, 'Priority'), h('th', { class: 'num' }, 'A month'), h('th', { class: 'num' }, 'Of take-home'), h('th', { class: 'num' }, 'Of spending'), h('th', { class: 'num' }, 'Hours of work'), h('th', { class: 'num' }, 'FI date'), h('th', { class: 'num' }, 'By spending'))),
    h('tbody', null, rows.map(l => h('tr', { dataset: { priority: l.id }, class: l.rankGap !== null && l.rankGap < -2 ? 'mismatch' : (l.rankGap !== null && l.rankGap > 2 ? 'underfunded' : null) },
      cell('Rank', 'num', String(l.rank)), cell('Priority', 'what', l.title),
      cell('A month', 'num', l.tied.cents ? money(l.tied.cents) : h('span', { class: 'empty-token' }, 'nothing tied')),
      cell('Of take-home', 'num', l.tied.shareTake === null ? '' : pct(l.tied.shareTake)), cell('Of spending', 'num', l.tied.shareSpend === null ? '' : pct(l.tied.shareSpend)),
      cell('Hours of work', 'num', l.hours.perMonth === null ? (l.tied.cents ? h('span', { class: 'small muted' }, 'needs ' + l.hours.needs.join(', ')) : '') : F.hours(l.hours.perMonth) + ' a month'),
      cell('FI date', 'num', l.fi.deltaMonths === null ? (l.tied.cents ? h('span', { class: 'small muted' }, 'needs ' + l.fi.needs.join(', ')) : '') : (l.fi.deltaMonths > 0 ? F.months(l.fi.deltaMonths) + ' sooner without it' : 'no change')),
      cell('By spending', 'num', l.spendRank === null ? '' : '#' + l.spendRank + (l.rankGap ? (l.rankGap > 0 ? ', ' + l.rankGap + ' below its rank' : ', ' + (-l.rankGap) + ' above its rank') : ', in step'))))))));
  if (R.negatives.length) {
    panel.appendChild(h('h3', null, 'Problems to remove'));
    panel.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data stack matters-table' }, h('thead', null, h('tr', null, h('th', null, 'Problem'), h('th', { class: 'num' }, 'Costs a month'), h('th', { class: 'num' }, 'Fix, one time'), h('th', { class: 'num' }, 'Fix, a month'), h('th', { class: 'num' }, 'Pays back in'))),
      h('tbody', null, R.negatives.map(l => h('tr', { dataset: { priority: l.id } }, cell('Problem', 'what', l.title), cell('Costs a month', 'num', l.negative.problemMonthly === null ? h('span', { class: 'small muted' }, 'not known') : money(l.negative.problemMonthly)), cell('Fix, one time', 'num', l.negative.fixOneTime === null ? '' : money(l.negative.fixOneTime)), cell('Fix, a month', 'num', l.negative.fixMonthly === null ? '' : money(l.negative.fixMonthly)),
        cell('Pays back in', 'num', l.negative.paybackMonths === null ? (l.negative.needs.length ? h('span', { class: 'small muted' }, 'needs ' + l.negative.needs.join(', ')) : 'never, the fix costs more than the problem') : (l.negative.paybackMonths === 0 ? 'at once' : F.months(l.negative.paybackMonths)))))))));
  }
  const two = h('div', { class: 'grid grid-2' }); panel.appendChild(two);
  two.appendChild(h('div', null, h('h3', null, 'Cheap wins'), h('p', { class: 'small muted' }, 'High on the list, small to fund, and not getting the money yet.'), R.cheapWins.length ? h('ul', { class: 'matters-list' }, R.cheapWins.map(l => h('li', { dataset: { priority: l.id } }, h('strong', null, l.title), ' needs ' + money(l.declaredMonthly) + ' a month, gets ' + money(l.tied.cents) + '.'))) : h('p', { class: 'muted small' }, U.alignment.ready ? 'None right now.' : 'Opens when the top five carry a price and the spending is tied.')));
  two.appendChild(h('div', null, h('h3', null, 'Expensive low ranks'), h('p', { class: 'small muted' }, 'Low on the list, taking a tenth of spending or more.'), R.expensiveLowRanks.length ? h('ul', { class: 'matters-list' }, R.expensiveLowRanks.map(l => h('li', { dataset: { priority: l.id } }, h('strong', null, l.title), ' is #' + l.rank + ' and takes ' + money(l.tied.cents) + ' a month, ' + pct(l.tied.shareSpend) + ' of spending.'))) : h('p', { class: 'muted small' }, U.untied.ready ? 'None right now.' : 'Opens when the spending is tied.')));
  if (coach) panel.appendChild(h('details', { class: 'disclose' }, h('summary', null, h('span', { class: 'fold-caret' }), h('span', { class: 'fold-label' }, 'Hours in the week')), h('div', { class: 'fold-body hours-form' }, h('p', { class: 'small muted' }, 'A week is 168 hours. Sleep, work and the commute come off first; the rest is what the priorities can have. The Income room\'s hours win until set here.'),
    ['sleep', 'work', 'commute'].map(k => field(k.charAt(0).toUpperCase() + k.slice(1) + ' a week', h('input', { class: 'input num', type: 'text', inputmode: 'decimal', 'aria-label': k + ' hours a week', value: String(R.time.parts[k]), title: 'from ' + R.time.parts.source[k], onChange: e => { const v = parseFloat(e.target.value); commit(Mx => { Mt.setHours(Mx, { [k]: Number.isFinite(v) ? v : null }); }); } }))))));
}


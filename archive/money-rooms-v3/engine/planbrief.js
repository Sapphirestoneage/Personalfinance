/* The plan brief (MR-074): for every part of a session, what is already on
   file for it and what filling it would open. Read by the runner's "Today's
   plan" card. Pure: reads the record and the result, writes nothing. The
   "opens" half runs the unlock probes once per part, so callers ask for it
   separately and after the screen has painted. */
import { confirmItems } from './discovery.js';
import { getAnchor, AREAS } from './anchors.js';
import { homework } from './program.js';
import { probes, applyProbe, stateOf, unlocksBetween } from './unlocks.js';
import { compute } from './compute.js';
import { hasValue, numberOf } from './states.js';
import * as F from './format.js';

export const PRIORITY_WORDS = { must: 'Must', should: 'If time allows', could: 'If ahead', 'never-cut': 'Always' };

const money = c => F.dollarsWhole(c);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* What the record already holds for one part: one short line, or '' when nothing applies. */
export function haveFor(block, record, result, data, plan) {
  const hh = record.household || { roommates: [], partners: [] };
  const rows = p => (record.planets[p] && record.planets[p].rows) || [];
  switch (block.id) {
    case 'confirm': { const c = confirmItems(record, result, data); const parts = []; if (c.said.length) parts.push(plural(c.said.length, 'item', 'items') + ' from the first call to confirm'); if (c.guesses.length) parts.push(plural(c.guesses.length, 'average', 'averages') + ' standing in for her numbers'); return parts.join('; ') || 'everything from the first call is confirmed'; }
    case 'housing': { const rent = getAnchor(record, 'gut', 'spending:accommodation'); const g = (result.guesses && result.guesses.rows || []).find(r => r.category === 'accommodation'); const parts = []; parts.push(rent ? 'rent on file at ' + money(rent.cents) + ' a month' : g ? 'rent is an average (' + money(g.cents) + ')' : 'no rent figure yet'); if (hh.roommates && hh.roommates.length) parts.push(plural(hh.roommates.length, 'roommate', 'roommates') + ', lease ' + (hh.lease === 'none' ? 'not asked' : hh.lease)); const car = getAnchor(record, 'gut', 'spending:transportation'); if (car) parts.push('getting around ' + money(car.cents)); return parts.join('; '); }
    case 'gut': { const have = AREAS.filter(cat => getAnchor(record, 'gut', 'spending:' + cat)).length; return have ? have + ' of ' + AREAS.length + ' areas have her figure' : 'no gut figures yet; ' + (result.guesses ? plural(result.guesses.count, 'average fills', 'averages fill') + ' the gaps' : ''); }
    case 'dream': { const have = AREAS.filter(cat => getAnchor(record, 'dream', 'spending:' + cat)).length; return have ? have + ' of ' + AREAS.length + ' areas have a dream figure' : 'nothing yet; this is where the dream starts'; }
    case 'debtcheck': { const d = rows('debt'); if (!d.length) return 'no debts named'; const withBal = d.filter(r => r.f.balance && hasValue(r.f.balance)).length; const mins = d.filter(r => r.f.minPayment && hasValue(r.f.minPayment)).length; return plural(d.length, 'debt', 'debts') + ' named, ' + withBal + ' with a balance, ' + mins + ' with a minimum'; }
    case 'accounts1': { const bank = rows('invest').filter(r => r.type === 'bank').length; const inv = rows('invest').filter(r => r.type === 'account').length; return plural(bank, 'bank account', 'bank accounts') + ' and ' + plural(inv, 'investing account', 'investing accounts') + ' on file'; }
    case 'picture': { const M = result.metrics || {}; const ok = ['spending', 'ruleOf5Target', 'fiNumber'].filter(id => M[id] && M[id].status === 'ok'); return ok.length === 3 ? 'ready: ' + money(M.spending.value.cents) + ' a month, cushion ' + money(M.ruleOf5Target.value.cents) + ', FI number ' + money(M.fiNumber.value.cents) : ok.length + ' of 3 numbers ready'; }
    case 'match': { const ben = rows('income').find(r => r.type === 'benefits'); if (!ben) return 'no match on file'; return ben.f.matchRate && hasValue(ben.f.matchRate) ? 'match on file: ' + Math.round(numberOf(ben.f.matchRate) * 100) + '% up to ' + Math.round(numberOf(ben.f.matchUpTo) * 100) + '%' : 'a match was mentioned, terms not given'; }
    case 'roommateworst': return hh.roommates && hh.roommates.length ? plural(hh.roommates.length, 'roommate', 'roommates') + ' on file' : 'no roommates, so this part skips';
    case 'loops': { const hw = homework(record, result, data, plan.n); const parts = []; if (plan.parked && plan.parked.length) parts.push(plural(plan.parked.length, 'parked item', 'parked items')); if (hw.waiting.length) parts.push(plural(hw.waiting.length, 'homework item', 'homework items') + ' still out'); return parts.join(', ') || 'nothing open'; }
    case 'steps': { const hw = homework(record, result, data, plan.n); return hw.now.length ? plural(hw.now.length, 'candidate step', 'candidate steps') + ' already' : 'the steps come from today'; }
    case 'close': return (record.program && record.program.nextDate) ? 'next date on file: ' + record.program.nextDate : 'no next date yet';
    default: return '';
  }
}

/* Which unlock probes a part would fill, by planet and type. Parts that reveal or decide rather than fill return none. */
function probesFor(block, record, data) {
  const all = probes(record, data, 120);
  const byPlanet = (p, pred) => all.filter(x => x.planet === p && (!pred || pred(x)));
  const rowOf = x => x.rowId ? (record.planets[x.planet] || { rows: [] }).rows.find(r => r.id === x.rowId) : null;
  const cat = x => { const r = rowOf(x); return r && r.f.category ? r.f.category.v : null; };
  switch (block.id) {
    case 'confirm': return all.filter(x => x.kind === 'confirm');
    case 'housing': return byPlanet('spending', x => ['accommodation', 'transportation'].includes(cat(x)));
    case 'gut': return byPlanet('spending');
    case 'debtcheck': return byPlanet('debt');
    case 'accounts1': return byPlanet('invest');
    case 'match': return byPlanet('income', x => x.type === 'benefits');
    default: return [];
  }
}

/* planOpens(plan, record, result, data) -> { [blockId]: { count, items } }: what each part would open if its inputs landed. */
export function planOpens(plan, record, result, data) {
  const base = stateOf(result, data); const out = {};
  plan.blocks.forEach(b => {
    const ps = probesFor(b, record, data).slice(0, 24);
    if (!ps.length) { out[b.id] = { count: 0, items: [] }; return; }
    let rec = record; ps.forEach(p => { try { rec = applyProbe(rec, p, data); } catch (e) { /* a probe that no longer fits the record is skipped */ } });
    let R; try { R = compute(rec, data, { today: result.today, light: true }); } catch (e) { out[b.id] = { count: 0, items: [] }; return; }
    const u = unlocksBetween(base, stateOf(R, data), R, data);
    out[b.id] = { count: u.count, items: u.charts.concat(u.metrics, u.lenses) };
  });
  return out;
}

/* planBrief(plan, record, result, data) -> the cheap half: minutes, priorities and what is on file. */
export function planBrief(plan, record, result, data) {
  const total = plan.blocks.reduce((s, b) => s + b.minutes.target, 0);
  return {
    totalMinutes: total, closeAt: plan.markers.closeAt, behindAt: plan.markers.behindAt,
    blocks: plan.blocks.map(b => ({ id: b.id, name: b.name, minutes: b.minutes.target, priority: b.priority, priorityWord: PRIORITY_WORDS[b.priority] || b.priority, outputs: (b.outputs || []).join('; '), have: haveFor(b, record, result, data, plan), movedIn: !!b.movedIn, from: b.from })),
  };
}

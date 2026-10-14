/* What matters (MR-098): a values audit with a price tag on every line. The
   client ranks what matters, every dollar of spending is tied to those
   priorities, and the room shows where the money goes against what they say
   matters. Lives in the Sun. One section of the record (record.matters), set
   whole and journaled (setSection); the lists, the priorities, the tags, the
   connections, the hours, the resolutions and the planned moves all live
   there. Every number is read from the engine's finished result: spending by
   category and by line, take-home, the real hourly wage, the surplus, the FI
   path. Nothing is copied. Pure. */
import { setSection } from './record.js';
import { hasValue, numberOf } from './states.js';
import { cadenceToMonthly, isQ } from './units.js';
import { fiEffect } from './fieffect.js';

export const LIST_KINDS = Object.freeze([['mine', 'Mine'], ['partner', 'Partner'], ['future', 'Future self'], ['scenario', 'Scenario']]);
export const VALUE_SOURCES = Object.freeze([['mine', 'Mine'], ['family', 'Family'], ['community', 'Community'], ['social media', 'Social media'], ['not sure', 'Not sure']]);
/* the same four states the rooms use: known, rough, will-send, unknown; the labels are the client's words */
export const CONFIDENCE = Object.freeze([['known', 'Knows'], ['rough', 'Roughly'], ['will-send', 'Will email'], ['unknown', "Doesn't know"]]);
export const CONNECTION_TYPES = Object.freeze([['supports', 'Supports'], ['requires', 'Requires'], ['conflicts', 'Conflicts with'], ['mutually exclusive', 'Cannot both happen']]);
export const CONFLICT_KINDS = Object.freeze([['money', 'Money'], ['time', 'Time'], ['location', 'Location'], ['energy', 'Energy'], ['values', 'Values']]);
export const SPLITS = Object.freeze([['all', 100], ['most', 75], ['half', 50], ['some', 25]]);
export const TOP = 5; export const TOP_WIDE = 10;
export const DEFAULT_HOURS = Object.freeze({ sleep: 56, work: 40, commute: 5 }); /* a week: eight hours of sleep, a full-time week, an hour a day of commute */
const CAT_LABELS = { accommodation: 'Housing', utilities: 'Utilities and subscriptions', food: 'Food', transportation: 'Transportation', therapy: 'Health and therapy', wants: 'Wants', irregular: 'Irregular and annual', mistakes: 'Mistakes', other: 'Other' };
export const UNTIED = 'Not tied to a priority';

/* ---- the section ---- */
export function newId(prefix) { return (prefix || 'p') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
export function amount(v, state) { return { v: typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null, state: state || (typeof v === 'number' ? 'known' : 'unknown') }; }
export function defaultMatters() { return { lists: [{ id: 'mine', name: 'Mine', kind: 'mine', baseListId: null, futureAge: null, linkedBlockId: null, overrides: {} }], priorities: [], connections: [], tags: [], hours: { sleep: null, work: null, commute: null }, resolutions: {}, moves: [], suggestions: { confirmed: [], dismissed: [] } }; }
export function mattersOf(record) { const m = (record && record.matters) || null; return m ? Object.assign(defaultMatters(), JSON.parse(JSON.stringify(m))) : defaultMatters(); }
/* every change: clone, change, set whole, one journal line */
export function changeMatters(record, fn, meta) { const M = mattersOf(record); const r = fn(M); if (r === null) return null; return setSection(record, 'matters', M, meta); }

export function newPriority(listId, title, polarity, opts) {
  const o = opts || {};
  return { id: o.id || newId('p'), listId, polarity: polarity === 'negative' ? 'negative' : 'positive', title: String(title || '').trim(), rank: o.rank || null, valueSource: o.valueSource || null,
    cost: { oneTime: amount(o.oneTime), monthly: amount(o.monthly), annual: amount(o.annual) },
    problemCost: { monthly: amount(o.problemMonthly), annual: amount(o.problemAnnual) },
    fixCost: { oneTime: amount(o.fixOneTime), monthly: amount(o.fixMonthly) },
    hoursPerWeek: amount(o.hoursPerWeek), notes: o.notes || '' };
}
export function newList(kind, name, opts) { const o = opts || {}; return { id: o.id || newId('l'), name: name || LIST_KINDS.find(k => k[0] === kind)[1], kind, baseListId: kind === 'future' || kind === 'scenario' ? (o.baseListId || 'mine') : null, futureAge: kind === 'future' ? (o.futureAge || null) : null, linkedBlockId: kind === 'scenario' ? (o.linkedBlockId || null) : null, overrides: {} }; }
function listOf(M, id) { return M.lists.find(l => l.id === id) || null; }
function renumber(list) { list.forEach((p, i) => { p.rank = i + 1; }); return list; }

/* The priorities a list shows: a base list's own, in rank order; a future or scenario list's base with its overrides on top, plus its own additions. A removed base priority stays out. */
export function prioritiesOf(M, listId) {
  const list = listOf(M, listId); if (!list) return [];
  const own = M.priorities.filter(p => p.listId === listId);
  if (!list.baseListId) return renumber(own.slice().sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9)));
  const base = prioritiesOf(M, list.baseListId);
  const merged = base.filter(p => !(list.overrides[p.id] && list.overrides[p.id].removed)).map(p => { const o = list.overrides[p.id] || {}; const q = JSON.parse(JSON.stringify(p)); Object.keys(o).forEach(k => { if (k !== 'removed') q[k] = o[k]; }); q.inherited = true; return q; }).concat(own.map(p => Object.assign({}, p, { inherited: false })));
  return renumber(merged.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9)));
}
export function priorityOf(M, listId, id) { return prioritiesOf(M, listId).find(p => p.id === id) || null; }

/* ---- mutations (each takes the section and changes it in place) ---- */
export function addPriorities(M, listId, lines, polarity) {
  const list = listOf(M, listId); if (!list) return [];
  const n = prioritiesOf(M, listId).length; const made = [];
  lines.map(t => String(t || '').trim()).filter(Boolean).forEach((t, i) => { const p = newPriority(listId, t, polarity || 'positive', { rank: n + i + 1 }); M.priorities.push(p); made.push(p); });
  return made;
}
export function updatePriority(M, listId, id, patch) {
  const list = listOf(M, listId); const own = M.priorities.find(p => p.id === id && p.listId === listId);
  if (own) { deepPatch(own, patch); return own; }
  if (list && list.baseListId) { list.overrides[id] = deepPatch(Object.assign({}, list.overrides[id] || {}), patch); return list.overrides[id]; }
  return null;
}
function deepPatch(target, patch) { Object.keys(patch || {}).forEach(k => { const v = patch[k]; if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !('v' in v)) deepPatch(target[k], v); else target[k] = v; }); return target; }
export function removePriority(M, listId, id) {
  const list = listOf(M, listId); const i = M.priorities.findIndex(p => p.id === id && p.listId === listId);
  if (i !== -1) { M.priorities.splice(i, 1); M.connections = M.connections.filter(c => c.fromId !== id && c.toId !== id); M.tags = M.tags.filter(t => t.priorityId !== id); return true; }
  if (list && list.baseListId) { list.overrides[id] = Object.assign({}, list.overrides[id] || {}, { removed: true }); return true; }
  return false;
}
export function reorder(M, listId, orderedIds) {
  const list = listOf(M, listId); if (!list) return;
  orderedIds.forEach((id, i) => updatePriority(M, listId, id, { rank: i + 1 }));
}
export function movePriority(M, listId, id, dir) {
  const ids = prioritiesOf(M, listId).map(p => p.id); const i = ids.indexOf(id); const j = i + dir;
  if (i === -1 || j < 0 || j >= ids.length) return false;
  ids.splice(i, 1); ids.splice(j, 0, id); reorder(M, listId, ids); return true;
}
/* tags: one source (a category or a spending line) can split across priorities; the pcts on one source stay at 100 or less */
export function setTag(M, sourceType, sourceId, priorityId, pct) {
  const same = t => t.sourceType === sourceType && t.sourceId === sourceId;
  const i = M.tags.findIndex(t => same(t) && t.priorityId === priorityId);
  if (pct === null || pct === undefined || pct <= 0) { if (i !== -1) M.tags.splice(i, 1); return; }
  const others = M.tags.filter((t, k) => same(t) && k !== i).reduce((s, t) => s + t.pct, 0);
  const p = Math.max(0, Math.min(100 - others, Math.round(pct)));
  if (p <= 0) { if (i !== -1) M.tags.splice(i, 1); return; }
  if (i !== -1) M.tags[i].pct = p; else M.tags.push({ sourceType, sourceId, priorityId, pct: p }); /* in place, so the same tag again is no change */
}
export function tagsOn(M, sourceType, sourceId) { return M.tags.filter(t => t.sourceType === sourceType && t.sourceId === sourceId); }
export function addConnection(M, fromId, toId, type, opts) {
  const o = opts || {}; if (!fromId || !toId || fromId === toId) return null;
  const key = [fromId, toId].sort().join('|');
  M.connections = M.connections.filter(c => !([c.fromId, c.toId].sort().join('|') === key && c.type === type));
  const c = { id: o.id || newId('c'), fromId, toId, type, conflictKind: type === 'conflicts' || type === 'mutually exclusive' ? (o.conflictKind || 'values') : null, origin: o.origin || 'client declared' };
  M.connections.push(c); return c;
}
export function removeConnection(M, id) { M.connections = M.connections.filter(c => c.id !== id); }
export function setHours(M, patch) { M.hours = Object.assign({}, M.hours, patch); }
export function conflictKey(a, b) { return [a, b].sort().join('|'); }
export function resolveConflict(M, key, resolution) { if (!resolution) delete M.resolutions[key]; else M.resolutions[key] = Object.assign({ at: null }, resolution); }
export function confirmSuggestion(M, s) { M.suggestions.confirmed.push(conflictKey(s.a, s.b)); return addConnection(M, s.a, s.b, 'conflicts', { conflictKind: s.kind, origin: 'app suggested, client confirmed' }); }
export function dismissSuggestion(M, s) { M.suggestions.dismissed.push(conflictKey(s.a, s.b)); }
export function addList(M, kind, name, opts) { const l = newList(kind, name, opts); M.lists.push(l); return l; }
export function removeList(M, id) { if (id === 'mine') return false; M.lists = M.lists.filter(l => l.id !== id); M.priorities = M.priorities.filter(p => p.listId !== id); return true; }
export function saveMove(M, move, as) { const m = Object.assign({ id: newId('m') }, move, { as: as || 'planned', at: move.at || null }); if (as === 'scenario') { const l = addList(M, 'scenario', move.name || 'Move money'); l.moves = [m]; m.listId = l.id; } M.moves.push(m); return m; }
export function removeMove(M, id) { M.moves = M.moves.filter(m => m.id !== id); }

/* ---- the numbers ---- */
function known(a) { return a && typeof a.v === 'number' && a.state !== 'unknown'; }
export function declaredMonthly(p) { const c = p.cost || {}; const parts = [known(c.monthly) ? c.monthly.v : null, known(c.annual) ? Math.round(c.annual.v / 12) : null]; if (parts.every(x => x === null) && !known(c.oneTime)) return null; return parts.reduce((s, x) => s + (x || 0), 0); }
export function problemMonthly(p) { const c = p.problemCost || {}; if (!known(c.monthly) && !known(c.annual)) return null; return (known(c.monthly) ? c.monthly.v : 0) + (known(c.annual) ? Math.round(c.annual.v / 12) : 0); }
export function roughOf(p) { const all = [p.cost.oneTime, p.cost.monthly, p.cost.annual, p.problemCost.monthly, p.problemCost.annual, p.fixCost.oneTime, p.fixCost.monthly, p.hoursPerWeek]; return all.some(a => a && a.v !== null && (a.state === 'rough' || a.state === 'will-send')); }

/* The spending the tags can reach: each category's monthly figure from the Spending slot, and each line's own share of it. One rule for a shared line, the planet's (my share of the full bill). */
export function spendSources(record, result) {
  const S = result && result.sun && result.sun.outputs; const by = S && S.spending && S.spending.byCategory; const out = { categories: [], lines: [], total: null, totalQ: null };
  if (!by) return out;
  const hh = record.household || {}; const people = 1 + ((hh.roommates || []).length) + ((hh.partners || []).length);
  record.planets.spending.rows.filter(r => r.type === 'line' && !r.guess && r.f.amount && hasValue(r.f.amount)).forEach(r => {
    const n = numberOf(r.f.amount); if (n === null) return;
    let cents = cadenceToMonthly(n, r.f.amount.cad || 'month', 26);
    if (r.f.shared && r.f.shared.v === true) { const ms = r.f.myShare && hasValue(r.f.myShare) ? numberOf(r.f.myShare) : null; cents = Math.round(cents * (ms !== null && ms > 0 && ms <= 1 ? ms : 1 / Math.max(1, people))); }
    out.lines.push({ id: r.id, category: (r.f.category && r.f.category.v) || 'other', name: r.nickname || CAT_LABELS[(r.f.category && r.f.category.v) || 'other'], cents, shared: !!(r.f.shared && r.f.shared.v === true) });
  });
  let total = 0;
  Object.keys(by).forEach(c => { if (!isQ(by[c])) return; const cents = by[c].cents; if (cents <= 0) return; total += cents; out.categories.push({ id: c, label: CAT_LABELS[c] || c, cents, rough: !!by[c].rough, lines: out.lines.filter(l => l.category === c) }); });
  out.total = total; out.totalQ = S.spending.baselineMonthly;
  return out;
}
/* Tied money by priority: a line tag reaches the line's figure; a category tag reaches what is left of the category once its tagged lines are taken out. */
export function tiedByPriority(M, sources) {
  const tied = {}; const byShared = {}; const add = (pid, cents, shared) => { tied[pid] = (tied[pid] || 0) + cents; if (shared) byShared[pid] = (byShared[pid] || 0) + cents; };
  const lineTagged = new Set(M.tags.filter(t => t.sourceType === 'line').map(t => t.sourceId));
  sources.lines.forEach(l => { if (!lineTagged.has(l.id)) return; M.tags.filter(t => t.sourceType === 'line' && t.sourceId === l.id).forEach(t => add(t.priorityId, Math.round(l.cents * t.pct / 100), l.shared)); });
  sources.categories.forEach(c => { const left = Math.max(0, c.cents - c.lines.filter(l => lineTagged.has(l.id)).reduce((s, l) => s + l.cents, 0)); M.tags.filter(t => t.sourceType === 'category' && t.sourceId === c.id).forEach(t => add(t.priorityId, Math.round(left * t.pct / 100), false)); });
  const sum = Object.values(tied).reduce((s, v) => s + v, 0);
  return { tied, byShared, sum, untied: sources.total === null ? null : Math.max(0, sources.total - sum) };
}
/* Hours a week the household has for its priorities: a week less sleep, work and the commute; the record's own figures win, the Income room's hours next, the defaults last. */
export function availableHours(M, result) {
  const S = result && result.sun && result.sun.outputs; const inc = S && S.income;
  const h = M.hours || {}; const workFromRoom = inc && typeof inc.workHoursMonthly === 'number' && inc.workHoursMonthly > 0 ? Math.round(inc.workHoursMonthly * 12 / 52 * 10) / 10 : null;
  const sleep = typeof h.sleep === 'number' ? h.sleep : DEFAULT_HOURS.sleep;
  const work = typeof h.work === 'number' ? h.work : (workFromRoom !== null ? workFromRoom : DEFAULT_HOURS.work);
  const commute = typeof h.commute === 'number' ? h.commute : (workFromRoom !== null ? 0 : DEFAULT_HOURS.commute); /* the room's hours already carry the commute */
  return { sleep, work, commute, available: Math.max(0, 168 - sleep - work - commute), source: { sleep: typeof h.sleep === 'number' ? 'set' : 'default', work: typeof h.work === 'number' ? 'set' : (workFromRoom !== null ? 'income room' : 'default'), commute: typeof h.commute === 'number' ? 'set' : (workFromRoom !== null ? 'income room' : 'default') } };
}

/* The report: every number the room, the sun card, the charts and the one-pager show. Each figure is a value or a needs list, never an invented zero. */
export function mattersReport(record, result, data, opts) {
  const o = opts || {}; const M = o.matters || mattersOf(record); const listId = o.listId || 'mine';
  const list = listOf(M, listId); const ps = prioritiesOf(M, listId);
  const S = result && result.sun && result.sun.outputs; const Mx = (result && result.metrics) || {};
  const take = S && isQ(S.income.takeHomeMonthly) ? S.income.takeHomeMonthly.cents : null;
  const sources = spendSources(record, result); const spendTotal = sources.total && sources.total > 0 ? sources.total : null;
  const T = tiedByPriority(M, sources);
  const wage = Mx.realHourlyWage && Mx.realHourlyWage.status === 'ok' ? Mx.realHourlyWage.value.cents : null;
  const surplus = Mx.surplus && Mx.surplus.status === 'ok' ? Mx.surplus.value.cents : null;
  const horizon = result && result.projectionInputs ? result.projectionInputs.asm.projectionEndAge - result.projectionInputs.age : null;
  const positives = ps.filter(p => p.polarity === 'positive'); const negatives = ps.filter(p => p.polarity === 'negative');
  const spendOrder = positives.slice().sort((a, b) => (T.tied[b.id] || 0) - (T.tied[a.id] || 0)); const spendRank = {}; spendOrder.forEach((p, i) => { spendRank[p.id] = (T.tied[p.id] || 0) > 0 ? i + 1 : null; });
  const lines = ps.map(p => {
    const tied = T.tied[p.id] || 0; const decl = declaredMonthly(p);
    const row = { id: p.id, title: p.title, polarity: p.polarity, rank: p.rank, valueSource: p.valueSource, inherited: !!p.inherited, hoursPerWeek: known(p.hoursPerWeek) ? p.hoursPerWeek.v : null, declaredMonthly: decl, oneTime: known(p.cost.oneTime) ? p.cost.oneTime.v : null, rough: roughOf(p), tagged: !!M.tags.some(t => t.priorityId === p.id),
      tied: { cents: tied, shareTake: take ? tied / take : null, shareSpend: spendTotal ? tied / spendTotal : null, needs: spendTotal ? [] : ['monthly spending'] },
      hours: { perMonth: wage && wage > 0 ? Math.round(tied / wage * 10) / 10 : null, needs: wage ? [] : ['paid hours a week'] },
      fi: { deltaMonths: null, needs: [] }, spendRank: spendRank[p.id] === undefined ? null : spendRank[p.id], rankGap: null, fromShared: T.byShared[p.id] || 0 };
    if (p.polarity === 'positive') row.rankGap = row.spendRank === null ? null : p.rank - row.spendRank;
    if (tied > 0 && horizon !== null) { const e = fiEffect(result, { monthly: -tied, years: horizon, permanent: true }); row.fi = { deltaMonths: e.deltaMonths === null ? null : -e.deltaMonths, needs: e.deltaMonths === null ? ['a reachable FI date'] : [] }; }
    else if (tied > 0) row.fi.needs = ['income, spending, account balances and a birth date'];
    else row.fi.needs = ['spending tagged to this priority'];
    if (p.polarity === 'negative') {
      const prob = problemMonthly(p); const fixOne = known(p.fixCost.oneTime) ? p.fixCost.oneTime.v : null; const fixMo = known(p.fixCost.monthly) ? p.fixCost.monthly.v : null;
      const saves = prob !== null ? prob - (fixMo || 0) : null;
      row.negative = { problemMonthly: prob, fixOneTime: fixOne, fixMonthly: fixMo, savesMonthly: saves, paybackMonths: saves !== null && saves > 0 && fixOne !== null ? Math.round(fixOne / saves * 10) / 10 : (saves !== null && saves > 0 && fixOne === null ? 0 : null), needs: [].concat(prob === null ? ['what the problem costs a month'] : [], fixOne === null && fixMo === null ? ['what fixing it costs'] : []) };
    }
    return row;
  });
  const ranked = positives.length > 0; const anyTags = M.tags.length > 0;
  const topN = n => positives.filter(p => p.rank <= n).reduce((s, p) => s + (T.tied[p.id] || 0), 0);
  const alignNeeds = [].concat(ranked ? [] : ['ranked priorities'], anyTags ? [] : ['spending tagged to a priority'], spendTotal ? [] : ['monthly spending']);
  const alignment = { top5: alignNeeds.length ? null : topN(TOP) / spendTotal, top10: alignNeeds.length ? null : topN(TOP_WIDE) / spendTotal, top5Cents: topN(TOP), top10Cents: topN(TOP_WIDE), needs: alignNeeds };
  const untied = { cents: spendTotal ? T.untied : null, share: spendTotal ? T.untied / spendTotal : null, needs: spendTotal ? (anyTags ? [] : ['spending tagged to a priority']) : ['monthly spending'] };
  const top10 = positives.filter(p => p.rank <= TOP_WIDE); const top10Known = top10.filter(p => declaredMonthly(p) !== null);
  const top10Cost = { declared: top10Known.reduce((s, p) => s + declaredMonthly(p), 0), missing: top10.length - top10Known.length, share: spendTotal && top10Known.length ? top10Known.reduce((s, p) => s + declaredMonthly(p), 0) / spendTotal : null, needs: [].concat(ranked ? [] : ['ranked priorities'], spendTotal ? [] : ['monthly spending'], top10.length && !top10Known.length ? ['a cost on a priority'] : []) };
  const cheapLimit = take ? take * 0.05 : (spendTotal ? spendTotal * 0.05 : null);
  const cheapWins = lines.filter(l => l.polarity === 'positive' && l.rank <= TOP && l.declaredMonthly !== null && cheapLimit !== null && l.declaredMonthly <= cheapLimit && l.tied.cents < l.declaredMonthly).map(l => Object.assign({}, l, { gap: l.declaredMonthly - l.tied.cents })).sort((a, b) => b.gap - a.gap);
  const expensiveLowRanks = lines.filter(l => l.polarity === 'positive' && l.rank > TOP && spendTotal && l.tied.cents >= spendTotal * 0.10).sort((a, b) => b.tied.cents - a.tied.cents);
  const H = availableHours(M, result); const claimed = ps.reduce((s, p) => s + (known(p.hoursPerWeek) ? p.hoursPerWeek.v : 0), 0); const unknownHours = ps.filter(p => !known(p.hoursPerWeek)).length;
  const time = { claimed, available: H.available, over: Math.max(0, claimed - H.available), left: H.available - claimed, parts: H, unknownHours, needs: ps.length ? (ps.every(p => !known(p.hoursPerWeek)) ? ['hours a week on a priority'] : []) : ['a priority'] };
  const conflicts = conflictsOf(M, listId, ps, lines, { surplus, time, data });
  const blockDeltas = {}; M.lists.filter(l => l.kind === 'scenario' && l.linkedBlockId).forEach(l => { blockDeltas[l.linkedBlockId] = scenarioSpendDelta(M, l.id); });
  const unlocks = [
    { id: 'alignment', label: 'Alignment score', ready: !alignment.needs.length, needs: alignment.needs },
    { id: 'untied', label: UNTIED, ready: !untied.needs.length, needs: untied.needs },
    { id: 'hours', label: 'Hours of work', ready: !!wage && anyTags, needs: [].concat(wage ? [] : ['paid hours a week'], anyTags ? [] : ['spending tagged to a priority']) },
    { id: 'fi', label: 'FI date impact', ready: horizon !== null && anyTags, needs: [].concat(horizon !== null ? [] : ['income, spending, account balances and a birth date'], anyTags ? [] : ['spending tagged to a priority']) },
    { id: 'time', label: 'Time check', ready: !time.needs.length, needs: time.needs },
    { id: 'top10', label: 'Cost of the top 10', ready: !top10Cost.needs.length, needs: top10Cost.needs },
  ];
  return { listId, list, priorities: lines, positives: lines.filter(l => l.polarity === 'positive'), negatives: lines.filter(l => l.polarity === 'negative'), sources, take, spendTotal, tied: T, alignment, untied, top10Cost, cheapWins, expensiveLowRanks, time, conflicts, blockDeltas, unlocks, wage, surplus, counts: { priorities: ps.length, positives: positives.length, negatives: negatives.length, tags: M.tags.length, connections: M.connections.length } };
}

/* ---- conflicts: declared, flagged by the numbers, and suggested from the library ---- */
function titleMatches(title, words) { const t = String(title || '').toLowerCase(); return words.some(w => t.indexOf(String(w).toLowerCase()) !== -1); }
export function suggestConflicts(M, ps, data) {
  const lib = (data && data.conflictLibrary && data.conflictLibrary.pairs) || []; const out = [];
  const seen = new Set(M.suggestions.confirmed.concat(M.suggestions.dismissed)); const declared = new Set(M.connections.filter(c => c.type === 'conflicts' || c.type === 'mutually exclusive').map(c => conflictKey(c.fromId, c.toId)));
  lib.forEach(pair => {
    ps.forEach(a => ps.forEach(b => {
      if (a.id >= b.id) return;
      const ab = titleMatches(a.title, pair.a) && titleMatches(b.title, pair.b); const ba = titleMatches(a.title, pair.b) && titleMatches(b.title, pair.a);
      if (!ab && !ba) return;
      const key = conflictKey(a.id, b.id); if (seen.has(key) || declared.has(key) || out.some(s => s.key === key)) return;
      out.push({ key, a: a.id, b: b.id, aTitle: a.title, bTitle: b.title, kind: pair.kind, why: pair.why });
    }));
  });
  return out;
}
export function conflictsOf(M, listId, ps, lines, ctx) {
  const byId = {}; ps.forEach(p => { byId[p.id] = p; });
  const declared = M.connections.filter(c => (c.type === 'conflicts' || c.type === 'mutually exclusive') && byId[c.fromId] && byId[c.toId]).map(c => ({ key: conflictKey(c.fromId, c.toId), id: c.id, a: c.fromId, b: c.toId, aTitle: byId[c.fromId].title, bTitle: byId[c.toId].title, kind: c.conflictKind || 'values', type: c.type, origin: c.origin, resolution: M.resolutions[conflictKey(c.fromId, c.toId)] || null }));
  const flagged = [];
  /* money: funded in rank order until the surplus runs out; what is left over is the conflict */
  const positives = ps.filter(p => p.polarity === 'positive'); const costed = positives.filter(p => declaredMonthly(p) !== null);
  if (ctx.surplus !== null && costed.length) {
    let run = 0; const over = [];
    costed.forEach(p => { run += declaredMonthly(p); if (run > ctx.surplus) over.push(p); });
    if (over.length) flagged.push({ key: 'money', kind: 'money', ids: over.map(p => p.id), titles: over.map(p => p.title), over: run - ctx.surplus, surplus: ctx.surplus, total: run, why: 'The priorities with a cost add up to more than the monthly surplus; funded in rank order, these fall past it.', resolution: M.resolutions.money || null });
  }
  const moneyNeeds = ctx.surplus === null ? ['take-home, spending and debt minimums'] : (costed.length ? [] : ['a cost on a priority']);
  if (ctx.time && ctx.time.over > 0) flagged.push({ key: 'time', kind: 'time', ids: ps.filter(p => known(p.hoursPerWeek)).map(p => p.id), titles: ps.filter(p => known(p.hoursPerWeek)).map(p => p.title), over: ctx.time.over, claimed: ctx.time.claimed, available: ctx.time.available, why: 'The hours the priorities ask for are more than the hours in a week after sleep, work and the commute.', resolution: M.resolutions.time || null });
  const suggested = suggestConflicts(M, ps, ctx.data);
  return { declared, flagged, suggested, needs: { money: moneyNeeds, time: ctx.time ? ctx.time.needs : [] } };
}

/* ---- the move money panel: a preview that never touches the spending rows ---- */
export function previewMove(record, result, data, move, opts) {
  const base = mattersReport(record, result, data, opts); const cents = Math.max(0, Math.round(move.cents || 0));
  const byId = {}; base.priorities.forEach(l => { byId[l.id] = l; });
  const from = move.fromId === 'untied' ? { id: 'untied', title: UNTIED, tied: base.untied.cents || 0 } : (byId[move.fromId] ? { id: move.fromId, title: byId[move.fromId].title, tied: byId[move.fromId].tied.cents, rank: byId[move.fromId].rank } : null);
  const to = move.toId === 'saved' ? { id: 'saved', title: 'Saved, not spent', tied: 0 } : (byId[move.toId] ? { id: move.toId, title: byId[move.toId].title, tied: byId[move.toId].tied.cents, rank: byId[move.toId].rank } : null);
  if (!from || !to) return { needs: ['a from and a to'] };
  const amt = Math.min(cents, from.tied); const spendAfter = base.spendTotal === null ? null : base.spendTotal - (to.id === 'saved' ? amt : 0);
  const tiedAfter = Object.assign({}, base.tied.tied); if (from.id !== 'untied') tiedAfter[from.id] = (tiedAfter[from.id] || 0) - amt; if (to.id !== 'saved') tiedAfter[to.id] = (tiedAfter[to.id] || 0) + amt;
  const inTop = n => base.positives.filter(l => l.rank <= n).reduce((s, l) => s + (tiedAfter[l.id] || 0), 0);
  const untiedAfter = from.id === 'untied' ? (base.untied.cents || 0) - amt : base.untied.cents;
  const side = (x, tiedNow, tiedNext) => ({ id: x.id, title: x.title, before: { tied: tiedNow, shareTake: base.take ? tiedNow / base.take : null, hours: base.wage ? Math.round(tiedNow / base.wage * 10) / 10 : null }, after: { tied: tiedNext, shareTake: base.take ? tiedNext / base.take : null, hours: base.wage ? Math.round(tiedNext / base.wage * 10) / 10 : null } });
  const horizon = result && result.projectionInputs ? result.projectionInputs.asm.projectionEndAge - result.projectionInputs.age : null;
  const fi = to.id === 'saved' && amt > 0 && horizon !== null ? fiEffect(result, { monthly: -amt, years: horizon, permanent: true }) : null;
  return {
    amount: amt, capped: amt < cents, from: side(from, from.tied, from.tied - amt), to: side(to, to.tied, to.id === 'saved' ? amt : to.tied + amt),
    alignment: { before: base.alignment.top5, after: spendAfter && base.alignment.needs.length === 0 ? inTop(TOP) / spendAfter : null, needs: base.alignment.needs },
    untied: { before: base.untied.cents, after: untiedAfter },
    fi: { deltaMonths: fi ? (fi.deltaMonths === null ? null : -fi.deltaMonths) : (to.id === 'saved' ? null : 0), needs: to.id === 'saved' && !fi ? ['income, spending, account balances and a birth date'] : [], note: to.id === 'saved' ? null : 'Money moved between two priorities leaves the FI date where it is; only money saved moves it.' },
  };
}

/* ---- two lists side by side ---- */
function normTitle(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); }
export function compareLists(M, aId, bId, report) {
  const A = prioritiesOf(M, aId), B = prioritiesOf(M, bId); const rows = []; const seen = new Set();
  const tiedOf = id => report && report.tied ? (report.tied.tied[id] || 0) : 0; const sharedOf = id => report && report.tied ? (report.tied.byShared[id] || 0) : 0;
  A.forEach(a => { const key = a.id; const b = B.find(x => x.id === a.id) || B.find(x => normTitle(x.title) === normTitle(a.title)); seen.add(key); if (b) seen.add(b.id);
    rows.push({ title: a.title, polarity: a.polarity, rankA: a.rank, rankB: b ? b.rank : null, verdict: !b ? 'only A' : Math.abs(a.rank - b.rank) <= 1 ? 'agree' : Math.abs(a.rank - b.rank) <= 3 ? 'close' : 'disagree', tied: tiedOf(a.id), fromShared: sharedOf(a.id) }); });
  B.forEach(b => { if (seen.has(b.id)) return; rows.push({ title: b.title, polarity: b.polarity, rankA: null, rankB: b.rank, verdict: 'only B', tied: tiedOf(b.id), fromShared: sharedOf(b.id) }); });
  rows.sort((x, y) => Math.min(x.rankA || 99, x.rankB || 99) - Math.min(y.rankA || 99, y.rankB || 99));
  return { rows, agree: rows.filter(r => r.verdict === 'agree').length, disagree: rows.filter(r => r.verdict === 'disagree').length, onlyA: rows.filter(r => r.verdict === 'only A').length, onlyB: rows.filter(r => r.verdict === 'only B').length, sharedFunded: rows.filter(r => r.rankA !== null && r.rankB !== null && r.fromShared > 0) };
}

/* ---- the life simulator link: a scenario list's spending change against its base ---- */
export function scenarioSpendDelta(M, listId) {
  const list = listOf(M, listId); if (!list || !list.baseListId) return 0;
  const sum = ps => ps.filter(p => p.polarity === 'positive').reduce((s, p) => s + (declaredMonthly(p) || 0), 0);
  return sum(prioritiesOf(M, listId)) - sum(prioritiesOf(M, list.baseListId));
}
/* A block's scenario list: made once, from the block's priority template (the priorities that need money allocated), on top of the base list. */
export function listForBlock(M, block, def) {
  const have = M.lists.find(l => l.kind === 'scenario' && l.linkedBlockId === block.id); if (have) return have;
  const l = addList(M, 'scenario', block.name || (def && def.label) || 'Scenario', { linkedBlockId: block.id });
  const n = prioritiesOf(M, l.id).length;
  ((def && def.priorityTemplate) || []).forEach((t, i) => { M.priorities.push(newPriority(l.id, t.title, t.polarity || 'positive', { rank: n + i + 1, monthly: t.monthly, oneTime: t.oneTime, hoursPerWeek: t.hoursPerWeek, notes: t.note || '' })); });
  return l;
}

/* ---- the three registry numbers (MR-099): the same shapes engine/metrics.js uses, ok with the math or needs ---- */
export function mattersMetrics(report, data) {
  const reg = data.metrics.metrics; const def = id => reg.find(m => m.id === id); const out = {};
  const ok = (id, value, math) => { out[id] = { def: def(id), id, status: 'ok', value, math, rough: !!(value && value.rough), confidence: 1 }; };
  const need = (id, list) => { out[id] = { def: def(id), id, status: 'needs', needs: list, math: null, value: null }; };
  const R = report; const rough = R.priorities.some(l => l.rough);
  if (R.alignment.needs.length) need('alignmentTop5', R.alignment.needs);
  else ok('alignmentTop5', { status: 'ok', kind: 'ratio', value: R.alignment.top5, confidence: 1, range: null, rough }, { formula: 'spending tied to the top 5 priorities / total spending', inputs: [{ label: 'Tied to the top five', value: { status: 'ok', kind: 'money', cents: R.alignment.top5Cents } }, { label: 'Total spending', value: { status: 'ok', kind: 'money', cents: R.spendTotal } }], result: { status: 'ok', kind: 'ratio', value: R.alignment.top5 } });
  if (R.untied.needs.length) { need('untiedSpending', R.untied.needs); need('untiedShare', R.untied.needs); }
  else {
    ok('untiedSpending', { status: 'ok', kind: 'money', cents: R.untied.cents, period: 'monthly', basis: 'nominal', tax: 'aftertax', confidence: 1, rough }, { formula: 'total spending - spending tied to any priority', inputs: [{ label: 'Total spending', value: { status: 'ok', kind: 'money', cents: R.spendTotal } }, { label: 'Tied to a priority', value: { status: 'ok', kind: 'money', cents: R.tied.sum } }], result: { status: 'ok', kind: 'money', cents: R.untied.cents } });
    ok('untiedShare', { status: 'ok', kind: 'ratio', value: R.untied.share, confidence: 1, range: null, rough }, { formula: 'untied spending / total spending', inputs: [{ label: 'Not tied to a priority', value: { status: 'ok', kind: 'money', cents: R.untied.cents } }, { label: 'Total spending', value: { status: 'ok', kind: 'money', cents: R.spendTotal } }], result: { status: 'ok', kind: 'ratio', value: R.untied.share } });
  }
  return out;
}

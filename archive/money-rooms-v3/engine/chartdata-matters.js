/* The four pictures of What matters (MR-098), built from the report so the
   chart module only draws: categories to priorities as a sankey with the
   untied stream visible, rank against spending rank as paired bars, importance
   against cost as a quadrant, and the mind map of connections. Every builder
   returns what it needs when the inputs are missing. */
import { mattersReport, UNTIED, TOP } from './matters.js';

function reportOf(result, extra) { if (!result || !result.record) return null; return mattersReport(result.record, result, result.data, { listId: (extra && extra.listId) || 'mine' }); }

/* categories -> priorities, with "Not tied to a priority" as its own stream */
export function prioritySankey(result, extra) {
  const R = reportOf(result, extra); if (!R) return { needs: ['a client'] };
  if (!R.priorities.length) return { needs: ['ranked priorities'] };
  if (!R.spendTotal) return { needs: ['monthly spending'] };
  if (!R.counts.tags) return { needs: ['spending tagged to a priority'] };
  const nodes = []; const links = []; const id = name => { let i = nodes.findIndex(n => n.name === name); if (i === -1) { nodes.push({ name }); i = nodes.length - 1; } return i; };
  const link = (a, b, v, kind) => { if (v > 0) links.push({ source: id(a), target: id(b), value: v, kind }); };
  const M = result.record.matters || { tags: [] }; const lineTagged = new Set((M.tags || []).filter(t => t.sourceType === 'line').map(t => t.sourceId));
  const titles = {}; R.priorities.forEach(l => { titles[l.id] = l.title; });
  R.sources.categories.forEach(c => {
    let tiedHere = 0; const byP = {};
    c.lines.filter(l => lineTagged.has(l.id)).forEach(l => (M.tags || []).filter(t => t.sourceType === 'line' && t.sourceId === l.id).forEach(t => { const v = Math.round(l.cents * t.pct / 100); byP[t.priorityId] = (byP[t.priorityId] || 0) + v; tiedHere += v; }));
    const left = Math.max(0, c.cents - c.lines.filter(l => lineTagged.has(l.id)).reduce((s, l) => s + l.cents, 0));
    (M.tags || []).filter(t => t.sourceType === 'category' && t.sourceId === c.id).forEach(t => { const v = Math.round(left * t.pct / 100); byP[t.priorityId] = (byP[t.priorityId] || 0) + v; tiedHere += v; });
    Object.keys(byP).forEach(pid => link(c.label, titles[pid] || 'A priority', byP[pid], 'spend'));
    link(c.label, UNTIED, Math.max(0, c.cents - tiedHere), 'rest');
  });
  return { nodes, links, total: R.spendTotal, untied: R.untied.cents, rough: R.priorities.some(l => l.rough) };
}

/* rank by importance beside rank by spending */
export function priorityBars(result, extra) {
  const R = reportOf(result, extra); if (!R) return { needs: ['a client'] };
  if (!R.positives.length) return { needs: ['ranked priorities'] };
  if (!R.counts.tags || !R.spendTotal) return { needs: ['spending tagged to a priority'] };
  const n = R.positives.length;
  const rows = R.positives.map(l => ({ id: l.id, title: l.title, rank: l.rank, spendRank: l.spendRank, tied: l.tied.cents, share: l.tied.shareSpend, importance: (n + 1 - l.rank) / n, spendScore: l.spendRank === null ? 0 : (n + 1 - l.spendRank) / n, gap: l.rankGap }));
  return { rows, n, untied: R.untied.cents, total: R.spendTotal };
}

/* importance against cost: cheap wins sit top left */
export function priorityQuadrant(result, extra) {
  const R = reportOf(result, extra); if (!R) return { needs: ['a client'] };
  if (!R.positives.length) return { needs: ['ranked priorities'] };
  const priced = R.positives.filter(l => l.declaredMonthly !== null || l.tied.cents > 0);
  if (!priced.length) return { needs: ['a cost on a priority'] };
  const n = R.positives.length; const scale = R.take || R.spendTotal || Math.max(...priced.map(l => Math.max(l.declaredMonthly || 0, l.tied.cents))) || 1;
  const points = priced.map(l => ({ id: l.id, title: l.title, rank: l.rank, importance: (n + 1 - l.rank) / n, cost: l.declaredMonthly !== null ? l.declaredMonthly : l.tied.cents, costShare: (l.declaredMonthly !== null ? l.declaredMonthly : l.tied.cents) / scale, tied: l.tied.cents, priced: l.declaredMonthly !== null, cheapWin: R.cheapWins.some(w => w.id === l.id), mismatch: R.expensiveLowRanks.some(w => w.id === l.id) }));
  return { points, n, cheapShare: 0.05, topShare: 1 - (TOP - 0.5) / n, scaleLabel: R.take ? 'of take-home' : 'of spending' };
}

/* the mind map: priorities and their lines, conflicts in their own style */
export function priorityMap(result, extra) {
  const R = reportOf(result, extra); if (!R) return { needs: ['a client'] };
  if (!R.priorities.length) return { needs: ['ranked priorities'] };
  const M = result.record.matters || { connections: [] }; const ids = new Set(R.priorities.map(l => l.id));
  const nodes = R.priorities.map(l => ({ id: l.id, title: l.title, rank: l.rank, polarity: l.polarity, tied: l.tied.cents }));
  const links = (M.connections || []).filter(c => ids.has(c.fromId) && ids.has(c.toId)).map(c => ({ source: c.fromId, target: c.toId, type: c.type, conflict: c.type === 'conflicts' || c.type === 'mutually exclusive', kind: c.conflictKind, origin: c.origin }));
  R.conflicts.flagged.forEach(f => { for (let i = 1; i < f.ids.length; i++) links.push({ source: f.ids[0], target: f.ids[i], type: 'conflicts', conflict: true, kind: f.kind, origin: 'flagged' }); });
  return { nodes, links, connections: links.length };
}

export const MATTERS_CHARTS = [
  { id: 'prioritySankey', name: 'Spending to priorities', client: 'Where each dollar goes against what matters', planet: 'spending', stage: 1, metrics: ['untiedShare'], build: prioritySankey },
  { id: 'priorityBars', name: 'Rank against spending rank', client: 'What you rank first, and what the money ranks first', planet: 'spending', stage: 1, metrics: ['alignmentTop5'], build: priorityBars },
  { id: 'priorityQuadrant', name: 'Importance against cost', client: 'What matters most and costs least', planet: 'spending', stage: 1, metrics: ['alignmentTop5'], build: priorityQuadrant },
  { id: 'priorityMap', name: 'Priority map', client: 'How your priorities connect', planet: 'life', stage: 1, metrics: [], build: priorityMap },
];

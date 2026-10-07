/* The dependency graph (Level 9, MR-041): every root input (field, Sun fact,
   assumption), every planet slot, every metric, the projection and the FI
   date as nodes; edges carry a sign. Metric edges are generated from
   data/metrics.json inputs; field-to-slot and slot-to-slot edges are hand
   listed in data/graph.json because the contracts name keys, not sources.
   Pure: build once from the data libraries, then ask it questions. */
import { CONTRACT, PLANETS, SUN_FIELDS } from './sun.js';

export const FAMILIES = Object.freeze(['spend', 'earn', 'keep', 'grow', 'protect', 'assume']);

export function buildGraph(data) {
  const G = data.graph; const fields = data.fields; const metrics = data.metrics.metrics; const asm = data.assumptions.defaults;
  const nodes = new Map(); const edges = []; const seen = new Set();
  const addNode = (id, kind, extra) => { if (!nodes.has(id)) nodes.set(id, Object.assign({ id, kind, label: id }, extra || {})); return nodes.get(id); };
  const addEdge = (from, to, sign) => { const k = from + '>' + to; if (seen.has(k) || from === to) return; seen.add(k); edges.push({ from, to, sign: sign || (G.negativeEdges.indexOf(k) !== -1 ? -1 : 1) }); };
  const familyOf = id => G.familyOverrides[id] || (id.startsWith('asm.') ? 'assume' : id.startsWith('sun.') ? 'assume' : G.familyByPlanet[(fields.fields[id] || {}).owner] || 'assume');
  /* roots */
  Object.keys(fields.fields).forEach(id => { const d = fields.fields[id]; addNode(id, 'field', { label: d.label, planet: d.owner, family: familyOf(id), kindOf: d.kind, tag: !!d.tag, optional: !!d.optional, noFiEffect: G.noFiEffect[id] || null }); });
  SUN_FIELDS.forEach(id => addNode('sun.' + id, 'sun', { label: id === 'birthDate' ? 'Birth date' : id === 'workSituation' ? 'Work situation' : id === 'filingStatus' ? 'Filing status' : id === 'bigGoal' ? 'Big goal' : id.charAt(0).toUpperCase() + id.slice(1), planet: 'sun', family: 'assume', noFiEffect: G.noFiEffect['sun.' + id] || null }));
  Object.keys(asm).forEach(k => addNode('asm.' + k, 'asm', { label: (data.assumptions.labels || {})[k] || k, planet: 'asm', family: familyOf('asm.' + k), noFiEffect: G.noFiEffect['asm.' + k] || null }));
  /* slots */
  PLANETS.forEach(p => CONTRACT[p].forEach(k => addNode(p + '.' + k, 'slot', { label: k, planet: p, noFiEffect: G.noFiEffect[p + '.' + k] || null })));
  addNode('projection', 'projection', { label: 'Projection to 95' });
  addNode('tags', 'sink', { label: 'Labels, notes and filters' });
  /* metrics */
  metrics.forEach(m => addNode('m.' + m.id, 'metric', { label: m.name, clientLabel: m.clientLabel, group: m.group, direction: m.direction, coachOnly: !!m.coachOnly }));
  /* edges: hand-listed into slots and the projection */
  Object.keys(G.slotInputs).forEach(slot => G.slotInputs[slot].forEach(src => { if (nodes.has(src)) addEdge(src, slot); }));
  G.projectionInputs.forEach(src => { if (nodes.has(src)) addEdge(src, 'projection'); });
  /* edges: generated from metric inputs */
  metrics.forEach(m => (m.inputs || []).forEach(inp => {
    const to = 'm.' + m.id;
    if (inp === 'projection') addEdge('projection', to);
    else if (inp === 'assumptions') return; /* an old catch-all; the specific keys are listed instead */
    else if (nodes.has(inp)) addEdge(inp, to);
  }));
  /* hand-listed extras: flag lines into the metric their lens reads, notes and names into the sink */
  Object.keys(G.extraEdges || {}).forEach(to => G.extraEdges[to].forEach(src => { if (nodes.has(src) && nodes.has(to)) addEdge(src, to); }));
  /* labels with no number behind them sit under one sink so nothing is an orphan */
  nodes.forEach(n => { if (n.kind === 'field' && n.tag) addEdge(n.id, 'tags'); });
  const out = new Map(); const inn = new Map();
  nodes.forEach((n, id) => { out.set(id, []); inn.set(id, []); });
  edges.forEach(e => { out.get(e.from).push(e); inn.get(e.to).push(e); });
  return { nodes, edges, out, in: inn, families: G.families };
}

function walk(g, id, dir) {
  const seen = new Set(); const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    (dir === 'up' ? g.in.get(cur) : g.out.get(cur) || []).forEach(e => { const nx = dir === 'up' ? e.from : e.to; if (!seen.has(nx)) { seen.add(nx); stack.push(nx); } });
  }
  seen.delete(id);
  return seen;
}
export function upstream(g, id) { return walk(g, id, 'up'); }
export function downstream(g, id) { return walk(g, id, 'down'); }
export function isRoot(n) { return n.kind === 'field' || n.kind === 'sun' || n.kind === 'asm'; }
export function rootsOf(g, metricId) {
  const id = metricId.startsWith('m.') ? metricId : 'm.' + metricId;
  return Array.from(upstream(g, id)).filter(x => isRoot(g.nodes.get(x))).map(x => g.nodes.get(x));
}
export function metricsFed(g, rootId) { return Array.from(downstream(g, rootId)).filter(x => g.nodes.get(x).kind === 'metric').map(x => g.nodes.get(x)); }

/* Every simple path from a root to the FI date, with the product of the signs along it. Capped. */
export function pathsToFiDate(g, rootId, cap) {
  const target = 'm.fiDate'; const out = []; const limit = cap || 12;
  const dfs = (cur, path, sign) => {
    if (out.length >= limit) return;
    if (cur === target) { out.push({ nodes: path.slice(), sign }); return; }
    (g.out.get(cur) || []).forEach(e => { if (path.indexOf(e.to) === -1) { path.push(e.to); dfs(e.to, path, sign * e.sign); path.pop(); } });
  };
  if (g.nodes.has(rootId)) dfs(rootId, [rootId], 1);
  return out;
}
/* The net sign from a root to a node: +1 raises, -1 lowers, 0 mixed, null unreachable. */
export function netSign(g, from, to) {
  const paths = []; const dfs = (cur, path, sign) => { if (paths.length > 24) return; if (cur === to) { paths.push(sign); return; } (g.out.get(cur) || []).forEach(e => { if (path.indexOf(e.to) === -1) { path.push(e.to); dfs(e.to, path, sign * e.sign); path.pop(); } }); };
  if (g.nodes.has(from)) dfs(from, [from], 1);
  if (!paths.length) return null;
  const plus = paths.filter(s => s > 0).length, minus = paths.length - plus;
  return plus && minus ? 0 : (plus ? 1 : -1);
}
export function reachesFiDate(g, rootId) { return downstream(g, rootId).has('m.fiDate'); }

/* Cycles, by depth-first search; an empty list is what the test expects. */
export function cycles(g) {
  const state = new Map(); const found = [];
  const visit = (id, path) => {
    state.set(id, 1); path.push(id);
    (g.out.get(id) || []).forEach(e => { const s = state.get(e.to); if (s === 1) found.push(path.slice(path.indexOf(e.to)).concat([e.to])); else if (!s) visit(e.to, path); });
    path.pop(); state.set(id, 2);
  };
  g.nodes.forEach((n, id) => { if (!state.get(id)) visit(id, []); });
  return found;
}
export function orphans(g) { return Array.from(g.nodes.values()).filter(n => !(g.out.get(n.id) || []).length && !(g.in.get(n.id) || []).length).map(n => n.id); }

/* Layers for the drawing: roots, slots, projection, metrics, the ladder, the FI date. */
export function layerOf(n) {
  if (isRoot(n)) return 0;
  if (n.kind === 'slot') return 1;
  if (n.kind === 'projection' || n.kind === 'sink') return 2;
  if (n.kind === 'metric') { if (n.id === 'm.fiDate') return 5; if (['m.leanFi', 'm.baristaLeanFi', 'm.baristaRegularFi', 'm.regularFi', 'm.fatFi', 'm.coastFi', 'm.fiNumber'].indexOf(n.id) !== -1) return 4; return 3; }
  return 3;
}

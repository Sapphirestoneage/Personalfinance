/* The program's curricula (Level 10, MR-053): a discovery call and twelve
   sessions as data (data/curricula.json), each a list of blocks with a
   priority, a time range and the questions it asks. This module plans a
   session for one client (skip rules, blocks moved in from earlier
   sessions), bends it as the clock runs (protect the close at the second
   marker, move the should blocks at the first, offer one could block when
   ahead, swap a should block for a deeper dive), switches to urgent mode,
   and builds the three steps. Pure; the record API in engine/program.js
   does the writing. */
import { programOf, blockKey } from './program.js';

export const PRIORITIES = Object.freeze(['must', 'should', 'could', 'never-cut']);
export const OPENING = Object.freeze(['checkin', 'loops', 'plan']);
export const CLOSING = Object.freeze(['steps', 'close']);

export function sessionDef(data, n) {
  const list = data.curricula.sessions;
  return list.find(s => (n === 0 || n === 'discovery') ? s.id === 'discovery' : s.n === Number(n)) || null;
}
export function sessionCount(data) { return data.curricula.sessions.filter(s => s.n > 0).length; }

/* Shape checks for the library, used by the tests and the lint. */
export function validateCurricula(data) {
  const out = []; const C = data.curricula;
  if (!C || !Array.isArray(C.sessions)) return ['curricula.sessions missing'];
  const nums = C.sessions.map(s => s.n).sort((a, b) => a - b);
  for (let n = 0; n <= 12; n++) if (!nums.includes(n)) out.push('session ' + n + ' missing');
  C.sessions.forEach(s => {
    const ids = new Set();
    if (!s.name || !s.goal) out.push(s.id + ': name or goal missing');
    if (!s.markers || typeof s.markers.behindAt !== 'number' || typeof s.markers.closeAt !== 'number') out.push(s.id + ': markers missing');
    (s.blocks || []).forEach(b => {
      if (ids.has(b.id)) out.push(s.id + ': duplicate block ' + b.id); ids.add(b.id);
      if (!PRIORITIES.includes(b.priority)) out.push(s.id + '.' + b.id + ': bad priority');
      const m = b.minutes || {}; if (!(m.min <= m.target && m.target <= m.max && m.min > 0)) out.push(s.id + '.' + b.id + ': bad minutes');
      if (b.movesTo !== undefined && b.movesTo !== null && !C.sessions.some(x => x.n === b.movesTo)) out.push(s.id + '.' + b.id + ': movesTo unknown session');
      if (b.skipRule && !C.skipRules[b.skipRule]) out.push(s.id + '.' + b.id + ': unknown skipRule');
      (b.questions || []).forEach(q => { if (!q.text || !q.fills) out.push(s.id + '.' + b.id + ': question without text or fills'); });
    });
    if (s.n > 0) {
      const first = (s.blocks || []).slice(0, 2).map(b => b.id); if (first[0] !== 'checkin' || first[1] !== 'loops') out.push(s.id + ': must open with check-in and open loops');
      const last = (s.blocks || []).slice(-2).map(b => b.id); if (last[0] !== 'steps' || last[1] !== 'close') out.push(s.id + ': must end with three steps and close');
      (s.blocks || []).filter(b => CLOSING.includes(b.id)).forEach(b => { if (b.priority !== 'never-cut') out.push(s.id + '.' + b.id + ': the close is never cut'); });
    }
  });
  return out;
}

/* Does a block apply to this client? */
export function applies(block, ctx) {
  if (!block.skipRule) return true;
  if (block.skipRule === 'noDebt') return ctx.hasDebt;
  if (block.skipRule === 'noRoommate') return ctx.hasRoommate;
  if (block.skipRule === 'noCards') return ctx.hasCards;
  return true;
}
export function contextOf(record, result) {
  const debts = (result && result.debts) || [];
  /* a debt row with an unknown balance still needs the debt check; only a client with no debt rows at all skips it */
  return { hasDebt: record.planets.debt.rows.length > 0 || debts.some(d => d.balance > 0), hasRoommate: !!(record.household && record.household.roommates && record.household.roommates.length), hasCards: record.planets.debt.rows.some(r => r.type === 'card') };
}

/* The plan for session n: its own blocks that apply, blocks moved in from earlier sessions, skipped blocks sent on to their movesTo. */
export function planSession(record, result, data, n) {
  const def = sessionDef(data, n); if (!def) return null;
  const P = programOf(record); const ctx = contextOf(record, result);
  const state = P.sessions[String(n)] || null;
  const blocks = []; const movedOut = [];
  def.blocks.forEach(b => {
    const key = blockKey(n, b.id); const mv = P.moved[key];
    if (mv && mv.to !== Number(n)) { movedOut.push({ block: b, to: mv.to, reason: mv.reason || 'moved' }); return; }
    if (!applies(b, ctx)) { if (b.movesTo && b.priority !== 'never-cut' && !OPENING.includes(b.id)) movedOut.push({ block: b, to: b.movesTo, reason: 'skip' }); return; }
    blocks.push(Object.assign({}, b, { from: Number(n) === 0 ? 0 : def.n, key }));
  });
  /* blocks earlier sessions moved here, placed before the close */
  const movedIn = Object.keys(P.moved).map(k => Object.assign({ key: k }, P.moved[k])).filter(m => m.to === Number(n) && m.from !== Number(n)).sort((a, b) => (a.at || '') < (b.at || '') ? -1 : 1)
    .map(m => { const src = sessionDef(data, m.from); const b = src && src.blocks.find(x => x.id === m.blockId); return b ? Object.assign({}, b, { from: m.from, key: m.key, movedIn: true }) : null; }).filter(Boolean)
    .filter(b => applies(b, ctx) && !blocks.some(x => x.id === b.id));
  const closeAt = blocks.findIndex(b => CLOSING.includes(b.id));
  const ordered = closeAt >= 0 ? blocks.slice(0, closeAt).concat(movedIn, blocks.slice(closeAt)) : blocks.concat(movedIn);
  ordered.forEach(b => { const st = state && state.blocks && state.blocks[b.key || blockKey(b.from, b.id)]; b.status = st ? st.status : 'planned'; b.minutesActual = st ? st.minutes : null; });
  return { n: Number(n), id: def.id, name: def.name, goal: def.goal, markers: def.markers || data.curricula.defaultMarkers, blocks: ordered, movedOut, parked: P.parked.filter(p => !p.done), state };
}

export function targetMinutes(blocks, upTo) { let s = 0; for (const b of blocks) { if (b.id === upTo) break; s += b.minutes.target; } return s; }
export function totalTarget(blocks) { return blocks.reduce((s, b) => s + b.minutes.target, 0); }

/* Pick one could block when the session is ahead: her goals and the leverage engine decide. */
export function pickCould(plan, record, leverageTop) {
  const coulds = plan.blocks.filter(b => b.priority === 'could' && b.status === 'planned');
  if (!coulds.length) return null;
  const goals = ((record.discovery && record.discovery.goals) || []).map(g => (g.text || g.goal || '').toLowerCase()).join(' ');
  const topPlanet = leverageTop && leverageTop.planet;
  const score = b => {
    let s = 0;
    if (b.id === 'dream' && /want|dream|different|life/.test(goals)) s += 3;
    if (b.id === 'match' && topPlanet === 'income') s += 3;
    if (b.id === 'roommateworst' && record.household && record.household.roommates.length) s += 2;
    if (b.id === 'forgotten' && /old|forgot/.test(JSON.stringify(record.discovery && record.discovery.form && record.discovery.form.money || {}).toLowerCase())) s += 3;
    if (b.id === 'testimonial') s += 1;
    return s;
  };
  return coulds.slice().sort((a, b) => score(b) - score(a))[0];
}

/* Bend the session at a given minute. state: { current, done: [ids], started: [ids] }. Returns the action and what moved; writes nothing. */
export function bend(plan, state, minute, opts) {
  const o = opts || {}; const M = plan.markers; const next = plan.n + 1;
  const notStarted = b => !(state.started || []).includes(b.id) && !(state.done || []).includes(b.id) && b.status === 'planned';
  const words = o.words || {};
  if (minute >= M.closeAt && !CLOSING.includes(state.current)) {
    const moved = plan.blocks.filter(b => notStarted(b) && !CLOSING.includes(b.id) && !OPENING.includes(b.id) && b.priority !== 'never-cut').map(b => ({ id: b.id, key: b.key, to: b.movesTo || next, reason: 'protect' }));
    return { action: 'protect', jumpTo: 'steps', moved, note: words.protect || 'Time to land it: on to your three steps' };
  }
  if (minute >= M.behindAt) {
    const expected = targetMinutes(plan.blocks, state.current);
    if (minute > expected) {
      const moved = plan.blocks.filter(b => b.priority === 'should' && notStarted(b)).map(b => ({ id: b.id, key: b.key, to: b.movesTo || next, reason: 'behind' }));
      const skipped = plan.blocks.filter(b => b.priority === 'could' && notStarted(b)).map(b => ({ id: b.id, key: b.key }));
      if (moved.length) return { action: 'behind', moved, skipped, note: moved.map(m => (words.moved || '{block} moved to next time').replace('{block}', plan.blocks.find(b => b.id === m.id).name)).join('. ') };
    }
  }
  const expectedNow = targetMinutes(plan.blocks, state.current);
  if (minute < M.behindAt && expectedNow - minute >= (o.aheadBy || 5) && minute > 0) {
    const pick = pickCould(plan, o.record || { discovery: null, household: { roommates: [] } }, o.leverageTop);
    if (pick) return { action: 'ahead', offer: pick.id, moved: [], note: (words.ahead || 'There is room for one more: {block}').replace('{block}', pick.name) };
  }
  return { action: 'none', moved: [], note: '' };
}

/* Go deeper here: the next should block not yet started moves on; a must block never does. */
export function goDeeper(plan, state, blockId, words) {
  const idx = plan.blocks.findIndex(b => b.id === blockId);
  const victim = plan.blocks.slice(idx + 1).find(b => b.priority === 'should' && b.status === 'planned' && !(state.started || []).includes(b.id) && !(state.done || []).includes(b.id));
  if (!victim) return { moved: [], note: 'Going deeper here; nothing else has to move' };
  return { moved: [{ id: victim.id, key: victim.key, to: victim.movesTo || plan.n + 1, reason: 'deeper' }], note: ((words && words.deeper) || 'Going deeper here; {block} moved to next time').replace('{block}', victim.name) };
}

/* Urgent mode: check-in, the urgent thing, three steps, close. Everything else moves to the next session in order. */
export function urgentPlan(plan, data, kind) {
  const C = data.curricula; const keep = C.urgentBlocks; const next = plan.n + 1;
  const kindLabel = (C.urgentKinds.find(k => k[0] === kind) || [kind, kind])[1];
  const blocks = plan.blocks.filter(b => keep.includes(b.id));
  const urgent = Object.assign({}, C.urgentBlock, { from: plan.n, key: blockKey(plan.n, 'urgent'), status: 'planned', kindLabel });
  const at = blocks.findIndex(b => b.id === 'steps'); blocks.splice(at < 0 ? blocks.length : at, 0, urgent);
  const moved = plan.blocks.filter(b => !keep.includes(b.id) && b.status === 'planned').map(b => ({ id: b.id, key: b.key, to: next, reason: 'urgent' }));
  return { blocks, moved, note: (C.words.urgent || 'Today is about {thing}; everything else moves to next time').replace('{thing}', kindLabel.toLowerCase()) };
}

/* Three steps: what she already did today (shown done) and at most three open items. */
export function threeSteps(input) {
  const done = (input.doneToday || []).slice(0, 3);
  const open = (input.candidates || []).filter(Boolean).slice(0, 3);
  return { done, open, text: done.length ? 'Today you ' + done.map(d => d.text.charAt(0).toLowerCase() + d.text.slice(1)).join(', ') + '.' : '' };
}

/* The coach-only report: how long blocks really take, across clients. records: an array. */
export function blockTimes(records, data) {
  const acc = {};
  records.forEach(rec => { const P = programOf(rec); Object.keys(P.sessions).forEach(n => { const s = P.sessions[n]; Object.keys(s.blocks || {}).forEach(k => { const b = s.blocks[k]; if (typeof b.minutes !== 'number') return; const id = k.split(':')[1]; acc[id] = acc[id] || { id, samples: [] }; acc[id].samples.push(b.minutes); }); }); });
  return Object.values(acc).map(a => { const s = a.samples.slice().sort((x, y) => x - y); const def = data.curricula.sessions.flatMap(x => x.blocks).find(b => b.id === a.id); return { id: a.id, name: def ? def.name : a.id, n: s.length, median: s[Math.floor(s.length / 2)], min: s[0], max: s[s.length - 1], target: def ? def.minutes.target : null }; }).sort((a, b) => b.n - a.n);
}

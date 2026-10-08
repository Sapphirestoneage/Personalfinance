/* The program's state on the record (Level 10, MR-053 and MR-054):
   record.program holds sessions (status, dates, blocks done or moved with
   their minutes), blocks moved between sessions, the parking lot, the
   account checklist, stress scores, CSV column mappers, merchant overrides
   and the discovery baseline. Every write journals kind "program". The
   readiness check reads data/knowledge-targets.json. Pure helpers plus the
   record API; views never do math. */
import { append } from './journal.js';
import { hasValue, numberOf } from './states.js';
import { AREAS } from './anchors.js';
import { isGuessRow } from './guesses.js';

export const HIGH_APR = 0.10;

export function defaultProgram() { return { sessions: {}, moved: {}, parked: [], checklist: {}, stress: [], mappers: {}, merchantOverrides: {}, notes: {}, baseline: null, blindSpot: {}, urgentCount: 0, flexAbsorbed: [], homeworkSent: {}, routine: '', testimonial: '' }; }
export function programOf(record) { return Object.assign(defaultProgram(), record.program || {}); }
export function blockKey(n, blockId) { return String(n) + ':' + blockId; }
function touch(record, now) { record.updatedAt = now || new Date().toISOString(); }

/* One write path: patch a slice of the program and journal it. */
export function setProgram(record, fn, meta) {
  const m = meta || {};
  const before = programOf(record); const next = JSON.parse(JSON.stringify(before));
  const field = fn(next) || 'program';
  if (JSON.stringify(before) === JSON.stringify(next)) return null;
  record.program = next;
  const line = append(record.journal, { kind: 'program', planet: 'sun', rowId: 'program', field, owner: 'sun', old: null, new: null, source: 'client', state: 'known', session: m.session || null, why: m.why === undefined ? null : m.why }, m.now);
  touch(record, m.now);
  return line;
}

/* ---- sessions ---- */
export function nextSessionNumber(record) { const P = programOf(record); const closed = Object.keys(P.sessions).filter(k => /^\d+$/.test(k) && P.sessions[k].status === 'closed').map(Number); return closed.length ? Math.max(...closed) + 1 : 1; }
export function startSession(record, n, meta) {
  const m = meta || {};
  return setProgram(record, P => { const k = String(n); P.sessions[k] = Object.assign({ status: 'running', startedAt: m.now || new Date().toISOString(), blocks: {}, urgent: null, countsAsSession: !/^u/.test(k), notes: '' }, P.sessions[k] || {}, { status: 'running' }); return 'sessions.' + k; }, m);
}
export function blockStatus(record, n, blockKeyOrId, status, minutes, meta) {
  const m = meta || {}; const key = blockKeyOrId.indexOf(':') >= 0 ? blockKeyOrId : blockKey(n, blockKeyOrId);
  return setProgram(record, P => { const s = P.sessions[String(n)] = P.sessions[String(n)] || { status: 'running', blocks: {} }; s.blocks[key] = Object.assign({}, s.blocks[key] || {}, { status, minutes: typeof minutes === 'number' ? Math.round(minutes * 10) / 10 : (s.blocks[key] || {}).minutes || null, at: m.now || new Date().toISOString() }); return 'sessions.' + n + '.' + key; }, m);
}
export function moveBlock(record, fromN, blockId, toN, reason, meta) {
  const m = meta || {};
  return setProgram(record, P => { P.moved[blockKey(fromN, blockId)] = { from: Number(fromN), blockId, to: Number(toN), reason: reason || 'moved', at: m.now || new Date().toISOString() }; if (Number(toN) === 11 && !P.flexAbsorbed.some(x => x.key === blockKey(fromN, blockId))) P.flexAbsorbed.push({ key: blockKey(fromN, blockId), from: Number(fromN), blockId, reason: reason || 'moved' }); return 'moved.' + blockKey(fromN, blockId); }, m);
}
export function closeSession(record, n, opts, meta) {
  const o = opts || {}; const m = meta || {};
  return setProgram(record, P => { const s = P.sessions[String(n)] = P.sessions[String(n)] || { blocks: {} }; s.status = 'closed'; s.closedAt = m.now || new Date().toISOString(); s.date = s.date || s.closedAt.slice(0, 10); if (o.nextDate) P.nextDate = o.nextDate; if (o.note !== undefined) s.notes = o.note; if (o.readiness) s.readiness = o.readiness; return 'sessions.' + n; }, m);
}
export function setNextDate(record, date, meta) { return setProgram(record, P => { P.nextDate = date || null; return 'nextDate'; }, meta); }
/* An urgent session: stored as u1, u2... and never takes a program number unless the coach says so. */
export function startUrgent(record, kind, notes, countsAsSession, meta) {
  const m = meta || {};
  return setProgram(record, P => { P.urgentCount = (P.urgentCount || 0) + 1; const k = 'u' + P.urgentCount; P.sessions[k] = { status: 'running', startedAt: m.now || new Date().toISOString(), blocks: {}, urgent: { kind, notes: notes || '' }, countsAsSession: !!countsAsSession, afterSession: nextSessionNumber(record) - 1 }; return 'sessions.' + k; }, m);
}
export function setUrgentNotes(record, key, notes, meta) { return setProgram(record, P => { const s = P.sessions[key]; if (s && s.urgent) s.urgent.notes = notes; return 'sessions.' + key + '.urgent'; }, meta); }

/* ---- the parking lot ---- */
export function park(record, text, link, meta) {
  const m = meta || {}; let id = null;
  setProgram(record, P => { id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); P.parked.push({ id, text: String(text).trim(), link: link || null, at: m.now || new Date().toISOString(), session: m.session || null, done: false }); return 'parked'; }, m);
  return id;
}
export function parkDone(record, id, done, meta) { return setProgram(record, P => { const p = P.parked.find(x => x.id === id); if (p) p.done = done !== false; return 'parked.' + id; }, meta); }

/* ---- stress ---- */
export function recordStress(record, session, score, meta) {
  const m = meta || {}; const s = Math.max(1, Math.min(10, Math.round(score)));
  return setProgram(record, P => { P.stress = P.stress.filter(x => x.session !== session); P.stress.push({ session, score: s, date: (m.now || new Date().toISOString()).slice(0, 10) }); P.stress.sort((a, b) => order(a.session) - order(b.session)); return 'stress'; }, m);
}
const order = s => s === 'discovery' ? 0 : /^s?\d+$/.test(String(s)) ? Number(String(s).replace(/^s/, '')) : 999;
export function stressScores(record) { return programOf(record).stress.slice(); }

/* ---- the account checklist ---- */
export function triggers(record, result) {
  const D = record.discovery || {}; const mind = D.mindset || {}; const form = D.form || {};
  const words = JSON.stringify(form.money || {}).toLowerCase() + ' ' + (D.words || []).join(' ').toLowerCase();
  const sun = record.sun.f; const work = sun.workSituation && sun.workSituation.v;
  const emp = form.snapshot && form.snapshot.employerType;
  const hsa = record.planets.income.rows.some(r => r.f.hsaPayroll && hasValue(r.f.hsaPayroll) && (numberOf(r.f.hsaPayroll) || 0) > 0);
  const side = record.planets.income.rows.some(r => r.type === 'c1099' || r.type === 'side');
  const movedStates = !!(record.program && record.program.notes && record.program.notes.movedStates) || /moved|another state/.test(words);
  const forgotten = /old |forgot|forgotten|haven't looked|have not looked/.test(words);
  return { always: true, timingStruggle: (mind.struggles || []).some(s => /timing|organ|structure|consisten/.test(s)) || (mind.stuck || []).some(s => /organ|structure/.test(s)), hsaEligible: hsa, employerBenefits: emp === 'company' || emp === 'nonprofit' || emp === 'government', movedOrForgotten: movedStates || forgotten, taxOrSelfEmployed: work === 'self-employed' || work === 'mixed' || side || /owe|refund/.test(words) };
}
/* Which card fits: a balance transfer when a card carries a balance at a high rate, a rewards card when nothing is carried. */
export function cardVariant(result) {
  const cards = (result.debts || []).filter(d => d.type === 'card');
  const carried = cards.filter(d => d.balance > 0 && !d.full);
  if (carried.some(d => d.rate >= HIGH_APR)) { const top = carried.slice().sort((a, b) => b.rate - a.rate)[0]; return { variant: 'balanceTransfer', apr: top.rate, balance: top.balance }; }
  if (carried.length) return { variant: 'none' };
  return { variant: 'rewards' };
}
export function setChecklist(record, itemId, patch, meta) {
  const m = meta || {};
  return setProgram(record, P => { P.checklist[itemId] = Object.assign({ status: 'not-started', who: null, notes: '', provider: '', session: m.session || null }, P.checklist[itemId] || {}, patch, { at: m.now || new Date().toISOString() }); return 'checklist.' + itemId; }, m);
}
const DONE = ['done', 'not-for-me', 'linked']; /* linked is the end state for the tracking app */
/* The checklist for session n: every item due by n and not finished (session 1 leftovers roll to 2), triggered items only when true, in order, with the card variant and gates. */
export function checklistFor(record, result, data, n) {
  const P = programOf(record); const T = triggers(record, result); const card = cardVariant(result);
  const items = data.accountsChecklist.items.filter(it => it.session <= Number(n)).filter(it => !it.trigger || T[it.trigger]).map(it => {
    const st = P.checklist[it.id] || { status: 'not-started', who: null, notes: '' };
    const rolled = it.session < Number(n) && !DONE.includes(st.status);
    return Object.assign({}, it, { state: st, rolled, finished: DONE.includes(st.status), linked: st.status === 'linked', variant: it.id === 'card' ? card : null, who: st.who || it.who });
  }).filter(it => it.session === Number(n) || !it.finished).sort((a, b) => a.order - b.order);
  return items;
}
/* Homework: at most homeworkMax items a session; the rest wait. */
export function homework(record, result, data, n) {
  const max = data.accountsChecklist.homeworkMax || 3;
  const items = checklistFor(record, result, data, n).filter(it => it.who === 'homework' && !it.finished);
  return { now: items.slice(0, max), waiting: items.slice(max) };
}
export function checklistProgress(record, data, n) {
  const P = programOf(record); const due = data.accountsChecklist.items.filter(it => it.session <= Number(n) && !it.optional);
  const done = due.filter(it => DONE.includes((P.checklist[it.id] || {}).status));
  return { done: done.length, total: due.length };
}

/* ---- knowledge targets and readiness ---- */
function anchorsFor(record, set) { const a = (record.anchors && record.anchors[set]) || {}; return AREAS.filter(c => a['spending:' + c]); }
export function readiness(record, result, data, n) {
  const def = data.knowledgeTargets.sessions[String(n === 0 ? 'discovery' : n)]; if (!def) return { met: 0, total: 0, items: [], missing: [], label: '' };
  const S = result.sun && result.sun.outputs; const P = programOf(record); const R = record;
  const stateOk = (f, states) => f && hasValue(f) && (states || ['known', 'verified']).includes(f.state);
  const items = def.targets.map(t => {
    let met = false;
    switch (t.kind) {
      case 'field': { const [p, fid] = t.field.split('.'); met = R.planets[p].rows.some(r => r.f[fid] && hasValue(r.f[fid])); break; }
      case 'areas': met = AREAS.every(c => (S && S.spending.byCategory[c] && S.spending.byCategory[c].cents > 0) || anchorsFor(R, 'gut').includes(c)); break;
      case 'goals': met = R.planets.life.rows.some(r => r.type === 'goal') || !!(R.discovery && (R.discovery.goals || []).length); break;
      case 'crosscheck': met = !!(S && S.income.takeHomeMonthly.status === 'ok' && S.income.grossMonthly.status === 'ok'); break;
      case 'household': met = !!(R.household && (R.household.roommates.length || R.household.lease === 'none' || R.household.partner || (R.discovery && R.discovery.confirmed && R.discovery.confirmed.household))); break;
      case 'anchors': met = anchorsFor(R, t.set).length >= AREAS.length; break;
      case 'anchorOrSlot': met = !!(R.anchors && R.anchors.gut && R.anchors.gut[t.anchor]) || !!(S && S.debt.totalDebt.status === 'ok'); break;
      case 'checklist': met = t.status.includes((P.checklist[t.item] || {}).status); break;
      case 'fieldState': met = R.planets[t.planet].rows.filter(r => r.type === t.type).some(r => stateOk(r.f[t.field], t.state)); break;
      case 'categoryState': met = R.planets.spending.rows.some(r => r.f.category && r.f.category.v === t.category && !isGuessRow(r) && stateOk(r.f.amount, t.state)); break;
      case 'debtsKnown': { const rows = R.planets.debt.rows.filter(r => r.f.balance); met = rows.length === 0 || rows.every(r => stateOk(r.f.balance) && stateOk(r.f.apr || r.f.rate || { v: 0, state: 'known' })); break; }
      case 'balancesKnown': { const rows = R.planets.invest.rows.filter(r => r.type === 'account'); met = rows.length > 0 && rows.every(r => stateOk(r.f.accountBalance)); break; }
      case 'accountTypeKnown': met = R.planets.invest.rows.some(r => r.f.accountType && r.f.accountType.v === t.accountType && stateOk(r.f.accountBalance)); break;
      case 'noGuesses': met = !R.planets.spending.rows.some(isGuessRow); break;
      case 'transactions': met = !!(P.transactions && P.transactions.recurringVerified); break;
      case 'allVerified': { const rows = R.planets.spending.rows.filter(r => r.type === 'line' && !isGuessRow(r)); met = rows.length > 0 && rows.every(r => r.f.amount && r.f.amount.state === 'verified'); break; }
      case 'blindSpot': met = typeof (P.blindSpot.s4 && P.blindSpot.s4.pct) === 'number'; break;
      case 'stress': met = P.stress.some(s => s.session === t.session); break;
      case 'targets': met = Object.keys(R.targets || {}).length > 0; break;
      case 'goalsPlan': met = !!(result.goalPlan && result.goalPlan.surplusKnown); break;
      case 'metricOk': met = !!(result.metrics && result.metrics[t.metric] && result.metrics[t.metric].status === 'ok') && (!t.noGuesses || !R.planets.spending.rows.some(isGuessRow)); break;
      case 'program': met = !!P.notes[t.key] || !!P[t.key]; break;
      case 'scenarios': met = (R.scenarios || []).length > 0; break;
      default: met = false;
    }
    return { id: t.id, what: t.what, met };
  });
  const met = items.filter(i => i.met).length;
  return { met, total: items.length, items, missing: items.filter(i => !i.met).map(i => i.what), label: def.label, text: (n === 0 ? 'Discovery' : 'Session ' + n) + ' targets: ' + met + ' of ' + items.length + ' met' };
}

/* ---- the program view ---- */
export function programRows(record, result, data) {
  const P = programOf(record); const rows = [];
  const pushSession = (key, label, n) => {
    const s = P.sessions[key] || null; const def = data.curricula.sessions.find(x => x.n === n);
    const r = readiness(record, result, data, n); const cp = n > 0 ? checklistProgress(record, data, n) : null;
    const stress = P.stress.find(x => x.session === (n === 0 ? 'discovery' : n));
    const homeworkDone = Object.keys(P.checklist).filter(id => { const it = data.accountsChecklist.items.find(x => x.id === id); return it && (P.checklist[id].who || it.who) === 'homework' && (P.checklist[id].status === 'done' || P.checklist[id].status === 'not-for-me') && P.checklist[id].session === n; }).length;
    rows.push({ key, n, label, name: def ? def.name : label, status: s ? s.status : (n === 0 ? (record.discovery ? 'closed' : 'planned') : 'planned'), date: s && (s.date || (s.startedAt || '').slice(0, 10)) || (n === 0 && record.discovery ? (record.discovery.at || '').slice(0, 10) : null), readiness: r, checklist: cp, homeworkDone, stress: stress ? stress.score : null, urgent: s && s.urgent ? s.urgent : null, absorbed: n === (data.curricula.flexSession || 11) ? P.flexAbsorbed : [] });
  };
  pushSession('discovery', 'Discovery', 0);
  const urgents = Object.keys(P.sessions).filter(k => /^u/.test(k)).map(k => Object.assign({ key: k }, P.sessions[k]));
  for (let n = 1; n <= 12; n++) { pushSession(String(n), 'Session ' + n, n); urgents.filter(u => (u.afterSession || 0) === n).forEach(u => rows.push({ key: u.key, n: null, label: 'Urgent', name: 'Urgent: ' + ((data.curricula.urgentKinds.find(k => k[0] === u.urgent.kind) || [])[1] || u.urgent.kind), status: u.status, date: (u.startedAt || '').slice(0, 10), readiness: null, checklist: null, homeworkDone: 0, stress: null, urgent: u.urgent, absorbed: [] })); }
  return rows;
}

/* The baseline for the scorecard: captured once, at the start of the program. */
export function captureBaseline(record, values, meta) { return setProgram(record, P => { if (P.baseline) return null; P.baseline = Object.assign({ at: (meta && meta.now) || new Date().toISOString() }, values); return 'baseline'; }, meta); }
export function setNote(record, key, value, meta) { return setProgram(record, P => { P.notes[key] = value; return 'notes.' + key; }, meta); }

/* The goal timeline (Level 11, MR-051): when each goal is reached, all of
   them funded at once from the monthly surplus. Pure. goalsOf() derives the
   goals from the record and the result (two cushions, every debt, every Life
   plan goal, the hand-typed extras, three long-term rungs) and lays the
   stored settings over them; allocate() runs month by month; planGoals()
   does both plus the three-mode comparison. Nothing here writes.

   The floor: until the starter cushion is full, every goal dollar goes to
   it, in every mode. If the cushion is used, refilling it comes first again.
   Rollover: a finished goal's money flows by the mode's rules the next
   month. Debt goals step through engine/debtsim.js; a paid-off debt's
   minimum joins the surplus the month after. */
import { addMonths, monthsBetween, stepDebt } from './debtsim.js';
import { defaultGoals } from './record.js';

export const MODES = Object.freeze(['deadlines-first', 'one-at-a-time', 'all-at-once']);
export const MODE_LABELS = Object.freeze({ 'deadlines-first': 'Dates first', 'one-at-a-time': 'One at a time', 'all-at-once': 'All at once' });
export const MODE_HELP = Object.freeze({
  'deadlines-first': 'Each dated goal gets what it needs to land on its date; the rest goes down the list.',
  'one-at-a-time': 'Everything goes to the first goal until it is done, then the next.',
  'all-at-once': 'Every goal gets a slice each month.',
});
export const LONG_RUNGS = Object.freeze([['leanFi', 'Lean FI', 'The floor for life'], ['coastFi', 'Coast FI', 'Coasting'], ['regularFi', 'FI', 'Enough']]);
export const HIGH_APR = 0.10;
const HORIZON = 600;

const okCents = x => x && x.status === 'ok' ? x.cents : null;
const pos = c => Math.max(0, Math.round(c || 0));

/* The starter cushion's target: a fixed amount for this client, else months of spending (asm.starterCushionMonths). */
export function starterTarget(record, result) {
  const g = record.goals || defaultGoals(); const asm = result.asm || {};
  if (g.starter && typeof g.starter.fixedCents === 'number' && g.starter.fixedCents > 0) return g.starter.fixedCents;
  const S = result.sun && result.sun.outputs;
  const spend = S ? (okCents(S.safety.spendingWithPremiums) !== null ? okCents(S.safety.spendingWithPremiums) : okCents(S.spending.baselineMonthly)) : null;
  if (spend === null) return null;
  const months = g.starter && typeof g.starter.months === 'number' ? g.starter.months : (asm.starterCushionMonths === undefined ? 1 : asm.starterCushionMonths);
  return Math.round(spend * months);
}

/* Derive the goals and lay the stored settings over them. */
export function goalsOf(record, result) {
  const G = Object.assign(defaultGoals(), record.goals || {});
  const S = result.sun && result.sun.outputs; const M = result.metrics || {};
  const cash = S ? okCents(S.invest.cashBalances) : null;
  const sTarget = starterTarget(record, result);
  const items = [];
  const starterBal = sTarget !== null ? Math.min(cash || 0, sTarget) : 0;
  items.push({ id: 'starter', type: 'floor', name: 'Starter cushion', targetCents: sTarget, balanceCents: starterBal, targetDate: null, locked: true, needs: sTarget === null ? ['monthly spending'] : [] });
  const rule5 = S ? okCents(S.safety.ruleOf5Target) : null;
  const fullTarget = rule5 !== null && sTarget !== null ? pos(rule5 - sTarget) : null;
  items.push({ id: 'full', type: 'amount', name: 'Full cushion', targetCents: fullTarget, balanceCents: fullTarget !== null ? Math.min(pos((cash || 0) - (sTarget || 0)), fullTarget) : 0, targetDate: null, needs: fullTarget === null ? ['monthly spending and a birth date'] : [], cushion: true });
  (result.debts || []).forEach(d => {
    if (d.full || !(d.balance > 0)) return;
    items.push({ id: 'debt:' + d.id, type: 'debt', name: d.name || 'Debt', targetCents: d.balance, balanceCents: 0, remainingCents: d.balance, targetDate: null, rate: d.rate || 0, promoApr: d.promoApr, promoEnd: d.promoEnd, minimum: d.minimum || 0, highInterest: (d.rate || 0) >= HIGH_APR, needs: [] });
  });
  const links = G.links || {};
  const balanceOfRow = rowId => { const r = record.planets.invest.rows.find(x => x.id === rowId); const f = r && r.f.accountBalance; return f && typeof f.v === 'number' ? f.v : 0; };
  ((S && S.life.goals) || []).forEach(g => {
    const td = g.targetDate ? String(g.targetDate).slice(0, 7) : null;
    items.push({ id: 'life:' + g.id, type: td ? 'dated' : 'amount', name: g.name || 'Goal', targetCents: g.cents, balanceCents: links['life:' + g.id] ? balanceOfRow(links['life:' + g.id]) : 0, targetDate: td, rowId: g.id, needs: g.cents === null ? ['a cost'] : [] });
  });
  (G.extras || []).forEach(x => items.push({ id: x.id, type: x.targetDate ? 'dated' : 'amount', name: x.name, targetCents: x.targetCents, balanceCents: links[x.id] ? balanceOfRow(links[x.id]) : (x.balanceCents || 0), targetDate: x.targetDate ? String(x.targetDate).slice(0, 7) : null, extra: true, needs: typeof x.targetCents === 'number' ? [] : ['a cost'] }));
  const L = result.ladder;
  LONG_RUNGS.forEach(([id, label, client]) => {
    const r = id === 'coastFi' ? (L && L.coast) : (L && L.rungs ? L.rungs.find(x => x.id === id) : null);
    items.push({ id: 'rung:' + id, type: 'long-term', name: label, clientName: client, targetCents: r ? r.number : null, pct: r ? r.pct : null, monthsAway: r && r.months !== null && r.months !== undefined ? r.months : null, needs: r && r.number !== null ? [] : ['the FI ladder'] });
  });
  const visible = items.filter(i => !(G.hidden || []).includes(i.id));
  /* order: the stored order first, then the default order of operations for anything new */
  const rank = i => i.type === 'floor' ? 0 : i.type === 'debt' && i.highInterest ? 1 : i.id === 'full' ? 2 : i.type === 'dated' ? 3 : i.type === 'amount' ? 4 : i.type === 'debt' ? 5 : 6;
  const dflt = visible.slice().sort((a, b) => rank(a) - rank(b) || (a.type === 'debt' && b.type === 'debt' ? (b.rate || 0) - (a.rate || 0) : 0) || (a.type === 'dated' && b.type === 'dated' ? (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0) : 0));
  const stored = (G.order || []).filter(id => visible.some(i => i.id === id) && id !== 'starter');
  const ordered = [visible.find(i => i.id === 'starter')].concat(stored.map(id => visible.find(i => i.id === id)), dflt.filter(i => i.id !== 'starter' && !stored.includes(i.id)));
  ordered.forEach((it, k) => { it.priority = k + 1; });
  const surplus = okCents(M.surplus && M.surplus.status === 'ok' ? { status: 'ok', cents: M.surplus.value.cents } : null);
  return { items: ordered, mode: MODES.includes(G.mode) ? G.mode : 'deadlines-first', splits: G.splits || {}, overrides: G.overrides || {}, starterTarget: sTarget, cash, cashKnown: cash !== null, surplus, surplusKnown: surplus !== null };
}

/* The allocation, month by month. input: { from, surplusMonthly, items, mode, splits, overrides, starterTarget, events: [{ month, kind: 'windfall' | 'withdraw', cents }], maxMonths, minMonths }. */
export function allocate(input) {
  const from = input.from; const mode = MODES.includes(input.mode) ? input.mode : 'deadlines-first';
  const overrides = input.overrides || {}; const splits = input.splits || {}; const events = input.events || [];
  const maxMonths = input.maxMonths || HORIZON; const minMonths = input.minMonths || 24;
  const st = {};
  const finite = input.items.filter(i => i.type !== 'long-term' && typeof i.targetCents === 'number' && i.targetCents >= 0);
  finite.forEach(i => { st[i.id] = { bal: i.type === 'debt' ? 0 : Math.min(i.balanceCents || 0, i.targetCents), remaining: i.type === 'debt' ? i.remainingCents : null, done: false, finish: null, funded: [], balances: [], interest: 0, refills: [], doneAtStart: false, runaway: false }; });
  finite.forEach(i => { const s = st[i.id]; if (input.skipFloor && i.type === 'floor') { s.bal = i.targetCents; } if (i.type !== 'debt' && s.bal >= i.targetCents) { s.done = true; s.doneAtStart = true; s.finish = null; } if (i.type === 'debt' && !(i.remainingCents > 0)) { s.done = true; s.doneAtStart = true; } });
  const starter = finite.find(i => i.type === 'floor'); const full = finite.find(i => i.id === 'full');
  const months = []; let freed = 0; let freedNext = 0; const rollovers = []; const flow = [];
  const remainingOf = (i, s) => i.type === 'debt' ? s.remaining : i.targetCents - s.bal;
  const give = (i, s, cents, m) => { if (cents <= 0) return 0; const r = remainingOf(i, s); const pay = Math.min(cents, Math.max(0, r)); if (i.type === 'debt') s.remaining -= pay; else s.bal += pay; s.funded[m] += pay; return pay; };
  const fin = (i, s, ym) => { if (!s.done && remainingOf(i, s) <= 0) { s.done = true; s.finish = ym; if (i.type === 'debt') freedNext += i.minimum || 0; flow.push({ id: i.id, month: ym }); } };
  let m = 0; let ym;
  for (m = 0; m < maxMonths; m++) {
    ym = addMonths(from, m); months.push(ym);
    finite.forEach(i => { st[i.id].funded[m] = 0; });
    freed += freedNext; freedNext = 0;
    let available = Math.max(0, (input.surplusMonthly || 0) + freed);
    events.filter(e => e.month === ym && e.kind === 'windfall').forEach(e => { available += Math.max(0, e.cents || 0); });
    /* she used the cushion: the pot shrinks, the floor comes first again */
    events.filter(e => e.month === ym && e.kind === 'withdraw').forEach(e => {
      if (!starter) return; const ss = st[starter.id]; const fs = full ? st[full.id] : null;
      let pot = ss.bal + (fs ? fs.bal : 0); pot = Math.max(0, pot - Math.max(0, e.cents || 0));
      ss.bal = Math.min(pot, starter.targetCents); if (fs) fs.bal = Math.min(pot - ss.bal, full.targetCents);
      if (ss.done && ss.bal < starter.targetCents && !input.skipFloor) { ss.done = false; ss.doneAtStart = false; ss.finish = null; ss.refills.push(ym); }
      if (fs && fs.done && fs.bal < full.targetCents) { fs.done = false; fs.doneAtStart = false; fs.finish = null; fs.refills.push(ym); }
    });
    /* debts: interest and the minimum, which spending already pays */
    finite.filter(i => i.type === 'debt' && !st[i.id].done && !st[i.id].runaway).forEach(i => { const s = st[i.id]; const r = stepDebt(i, s.remaining, ym, 0); s.interest += r.interest; s.remaining = r.balance; if (r.paid) { s.remaining = 0; fin(i, s, ym); } else if (s.remaining > i.remainingCents * 3) { s.runaway = true; } /* the minimum does not cover the interest and nothing extra arrives: the balance runs away; stop counting */ });
    /* 1. the floor */
    if (starter && !st[starter.id].done) { available -= give(starter, st[starter.id], available, m); fin(starter, st[starter.id], ym); }
    const open = () => finite.filter(i => i.type !== 'floor' && !st[i.id].done);
    const floorOpen = starter && !st[starter.id].done;
    if (!floorOpen) {
      /* 2. locked amounts, never on the floor */
      open().filter(i => overrides[i.id] > 0).forEach(i => { available -= give(i, st[i.id], Math.min(available, overrides[i.id]), m); });
      const free = () => open().filter(i => !(overrides[i.id] > 0));
      /* 3. the mode */
      if (mode === 'deadlines-first') {
        free().filter(i => i.type === 'dated' && i.targetDate).forEach(i => { const left = monthsBetween(ym, i.targetDate) + 1; const r = remainingOf(i, st[i.id]); const need = left <= 1 ? r : Math.ceil(r / left); available -= give(i, st[i.id], Math.min(available, need), m); });
        free().forEach(i => { if (available > 0) available -= give(i, st[i.id], available, m); });
      } else if (mode === 'one-at-a-time') {
        free().forEach(i => { if (available > 0) available -= give(i, st[i.id], available, m); });
      } else {
        let pool = available; let guard = 0;
        while (pool > 0 && guard++ < 10) {
          const el = free().filter(i => remainingOf(i, st[i.id]) > 0); if (!el.length) break;
          const w = el.map(i => typeof splits[i.id] === 'number' && splits[i.id] > 0 ? splits[i.id] : null);
          const total = w.reduce((s, x, k) => s + (x === null ? 1 / el.length : x), 0);
          const before = pool;
          el.forEach((i, k) => { const share = Math.floor(before * ((w[k] === null ? 1 / el.length : w[k]) / total)); pool -= give(i, st[i.id], Math.min(share, pool), m); });
          if (pool === before) { pool -= give(el[0], st[el[0].id], pool, m); }
        }
        available = pool;
      }
      open().forEach(i => fin(i, st[i.id], ym));
    }
    finite.forEach(i => { const s = st[i.id]; s.balances[m] = i.type === 'debt' ? s.remaining : s.bal; });
    const allDone = finite.every(i => st[i.id].done);
    if (allDone && m + 1 >= minMonths) break;
  }
  /* rollover marks: the goal whose money grew the most the month after another finished */
  flow.forEach(f => { const k = months.indexOf(f.month); if (k < 0 || k + 1 >= months.length) return; let best = null, gain = 0; finite.forEach(i => { if (i.id === f.id) return; const s = st[i.id]; const d = (s.funded[k + 1] || 0) - (s.funded[k] || 0); if (d > gain) { gain = d; best = i.id; } }); if (best) rollovers.push({ from: f.id, to: best, month: months[k + 1], cents: gain }); });
  const out = { from, months, mode, goals: {}, rollovers, starterFills: starter && st[starter.id].finish ? st[starter.id].finish : null, starterFullAtStart: !!(starter && st[starter.id].doneAtStart), totalInterest: 0 };
  finite.forEach(i => { const s = st[i.id]; out.goals[i.id] = { id: i.id, funded: s.funded, balances: s.balances, finishMonth: s.finish, doneAtStart: s.doneAtStart, interest: s.interest, refills: s.refills, monthlyNow: s.funded[0] || 0, runaway: s.runaway }; out.totalInterest += s.interest; });
  return out;
}

/* Which month a goal lands when the floor and this goal are the only two things funded. */
function earliestFor(input, item) {
  const items = input.items.filter(i => i.type === 'floor' || i.id === item.id);
  const r = allocate(Object.assign({}, input, { items, mode: 'one-at-a-time', overrides: {}, splits: {} }));
  return r.goals[item.id] ? r.goals[item.id].finishMonth : null;
}

/* Status, shortfall and the earliest date per goal; the floor is named when it is the reason. */
export function assess(input, run) {
  const out = {};
  input.items.forEach(i => {
    const g = run.goals[i.id];
    if (i.type === 'long-term') { out[i.id] = { status: i.monthsAway === null || i.monthsAway === undefined ? 'needs' : 'projected', finishMonth: i.monthsAway !== null && i.monthsAway !== undefined ? addMonths(input.from, Math.round(i.monthsAway)) : null }; return; }
    if (!g) { out[i.id] = { status: 'needs', finishMonth: null }; return; }
    if (g.doneAtStart) { out[i.id] = { status: 'done', finishMonth: null }; return; }
    const a = { status: g.finishMonth ? 'on-track' : 'never', finishMonth: g.finishMonth, monthlyNow: g.monthlyNow };
    if (i.type === 'dated' && i.targetDate) {
      const k = run.months.indexOf(i.targetDate);
      const late = !g.finishMonth || g.finishMonth > i.targetDate;
      if (late) {
        a.status = 'behind';
        const balAtDate = k >= 0 ? g.balances[k] : (g.balances[g.balances.length - 1] || 0);
        const gap = Math.max(0, i.targetCents - balAtDate);
        const floorTookMoney = (g.funded && run.goals.starter && run.goals.starter.funded.some((c, kk) => c > 0 && run.months[kk] <= i.targetDate));
        let floorReason = false;
        if (floorTookMoney) { const r2 = allocate(Object.assign({}, input, { skipFloor: true })); const f2 = r2.goals[i.id] ? r2.goals[i.id].finishMonth : null; floorReason = !!(f2 && f2 <= i.targetDate); }
        const lastFloorMonth = floorReason ? run.months.filter((mm, kk) => (run.goals.starter.funded[kk] || 0) > 0 && mm <= i.targetDate).pop() : null;
        const after = lastFloorMonth ? addMonths(lastFloorMonth, 1) : input.from;
        const left = Math.max(1, monthsBetween(after, i.targetDate) + 1);
        a.shortfallMonthly = Math.ceil(gap / left); a.floorReason = floorReason; a.after = after; a.gapAtDate = gap;
        a.earliestMonth = g.finishMonth || earliestFor(input, i);
      } else a.status = 'on-time';
    }
    out[i.id] = a;
  });
  return out;
}

export function nextWin(input, run, assessment) {
  if (!input.items.some(i => assessment[i.id] && assessment[i.id].finishMonth)) return null;
  const cands = input.items.filter(i => { const a = assessment[i.id]; return a && a.finishMonth && a.status !== 'done' && i.type !== 'long-term'; }).sort((x, y) => assessment[x.id].finishMonth < assessment[y.id].finishMonth ? -1 : 1);
  if (cands.length) return { id: cands[0].id, month: assessment[cands[0].id].finishMonth };
  const lt = input.items.filter(i => i.type === 'long-term' && assessment[i.id] && assessment[i.id].finishMonth).sort((x, y) => assessment[x.id].finishMonth < assessment[y.id].finishMonth ? -1 : 1);
  return lt.length ? { id: lt[0].id, month: assessment[lt[0].id].finishMonth } : null;
}

/* The whole plan for a record: goals, the run in the chosen mode, the assessment and the three-mode comparison. whatIf: { surplusDelta, events, order, mode, splits, overrides }. */
export function planGoals(record, result, whatIf) {
  const w = whatIf || {};
  const base = goalsOf(record, result);
  let items = base.items;
  if (w.order && w.order.length) { const byId = {}; items.forEach(i => { byId[i.id] = i; }); const picked = w.order.filter(id => byId[id] && id !== 'starter').map(id => byId[id]); items = [byId.starter].concat(picked, items.filter(i => i.id !== 'starter' && !w.order.includes(i.id))); items.forEach((it, k) => { it.priority = k + 1; }); }
  const from = (result.today || new Date().toISOString()).slice(0, 7);
  const surplus = (base.surplus || 0) + (w.surplusDelta || 0);
  const input = { from, surplusMonthly: surplus, items, mode: w.mode || base.mode, splits: w.splits || base.splits, overrides: w.overrides || base.overrides, starterTarget: base.starterTarget, events: w.events || [] };
  const run = allocate(input);
  const assessment = assess(input, run);
  if (!base.surplusKnown) Object.keys(assessment).forEach(id => { const it = items.find(i => i.id === id); if (it && it.type !== 'long-term' && assessment[id].status !== 'done') assessment[id] = { status: 'needs', finishMonth: null, needs: ['take-home, spending and debt minimums'] }; });
  const compare = MODES.map(mode => { const r = mode === input.mode ? run : allocate(Object.assign({}, input, { mode })); const a = mode === input.mode ? assessment : assess(Object.assign({}, input, { mode }), r); const dated = items.filter(i => i.type === 'dated' && i.targetDate && typeof i.targetCents === 'number'); return { mode, onTime: dated.filter(i => a[i.id] && a[i.id].status === 'on-time').length, dated: dated.length, finish: Object.fromEntries(items.map(i => [i.id, a[i.id] ? a[i.id].finishMonth : null])), interest: r.totalInterest, starterFills: r.starterFills }; });
  return { input, base, run, assessment, compare, next: nextWin(input, run, assessment), surplusKnown: base.surplusKnown, cashKnown: base.cashKnown };
}

/* The finish months as a flat map, for the session snapshot and "since last time". */
export function finishMonths(plan) { const out = {}; plan.input.items.forEach(i => { const a = plan.assessment[i.id]; out[i.id] = a ? a.finishMonth : null; }); return out; }

/* What moved between two finish maps, in words. */
export function finishChanges(before, after, items) {
  const out = [];
  Object.keys(after).forEach(id => {
    const a = after[id], b = before ? before[id] : undefined; if (b === undefined || a === b) return;
    const it = items.find(i => i.id === id); const name = it ? (it.name) : id;
    if (a && b) { const d = monthsBetween(a, b); out.push({ id, name, from: b, to: a, months: d, text: name + (d > 0 ? ' moved up ' : ' moved back ') + (Math.abs(d) === 1 ? 'a month' : Math.abs(d) + ' months') }); }
    else if (a && !b) out.push({ id, name, from: b, to: a, months: null, text: name + ' now has a date' });
    else out.push({ id, name, from: b, to: a, months: null, text: name + ' lost its date' });
  });
  return out;
}

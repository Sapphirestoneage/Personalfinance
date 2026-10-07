/* The goal timeline (Level 11, MR-051 and MR-052): when each goal is reached,
   all of them funded at once from the monthly surplus. Pure. goalsOf()
   derives the goals from the record and the result (three cushion steps on
   one pot, every debt, every Life plan goal, the hand-typed extras, three
   long-term rungs) and lays the stored settings over them; allocate() runs
   month by month; planGoals() does both plus the three-mode comparison.
   Nothing here writes.

   The cushion is one pot filled in three steps: a lean month (one month of
   food, housing and getting around), a full month (one month of everything),
   then the Rule of 5 cushion. Steps 1 and 2 are floors: until both are full,
   every goal dollar goes to them in order, in every mode. If the pot is used,
   refilling the open step comes first again. Step 3 waits its turn in the
   order like any goal. Rollover: a finished goal's money flows by the mode's
   rules the next month. Debt goals step through engine/debtsim.js; a
   paid-off debt's minimum joins the surplus the month after. */
import { addMonths, monthsBetween, stepDebt } from './debtsim.js';
import { defaultGoals } from './record.js';

export const MODES = Object.freeze(['deadlines-first', 'one-at-a-time', 'all-at-once']);
export const MODE_LABELS = Object.freeze({ 'deadlines-first': 'Dates first', 'one-at-a-time': 'One at a time', 'all-at-once': 'All at once' });
export const MODE_HELP = Object.freeze({
  'deadlines-first': 'Each dated goal gets what it needs to land on its date; the rest goes down the list.',
  'one-at-a-time': 'Everything goes to the first goal until it is done, then the next.',
  'all-at-once': 'Every goal gets a slice each month.',
});
export const LONG_RUNGS = Object.freeze([['leanFi', 'Lean FI', 'Enough for the basics'], ['coastFi', 'Coast FI', 'Coasting'], ['regularFi', 'FI', 'Enough']]);
export const CUSHION = Object.freeze([
  { id: 'lean', step: 1, type: 'floor', name: 'Lean month', clientName: 'Lean month covered', doneWord: 'a lean month' },
  { id: 'fullmonth', step: 2, type: 'floor', name: 'Full month', clientName: 'Full month covered', doneWord: 'a full month' },
  { id: 'full', step: 3, type: 'amount', name: 'Full cushion', clientName: 'Full cushion', doneWord: 'the full cushion' },
]);
export const FLOOR_IDS = Object.freeze(['lean', 'fullmonth']);
export const HIGH_APR = 0.10;
const HORIZON = 600;
const FAT_CATEGORIES = ['food', 'accommodation', 'transportation'];

const okCents = x => x && x.status === 'ok' ? x.cents : null;
const pos = c => Math.max(0, Math.round(c || 0));
const isCushion = i => typeof i.step === 'number';
const isFloor = i => i.type === 'floor';

/* The three cushion targets: step 1 one month of food, housing and getting around (the flagged lines, else the three categories, marked rough) or a fixed amount; step 2 one month of all spending times the months setting; step 3 the Rule of 5 target with the roommate gap. Never decreasing. */
export function cushionTargets(record, result) {
  const G = Object.assign(defaultGoals(), record.goals || {}); const asm = result.asm || {};
  const S = result.sun && result.sun.outputs; const out = { step1: null, step2: null, step3: null, step1Rough: false, step1Source: null };
  if (!S) return out;
  const fixed = G.cushion && typeof G.cushion.step1Cents === 'number' && G.cushion.step1Cents > 0 ? G.cushion.step1Cents : null;
  if (asm.cushionStep1 === 'fixed' && fixed !== null) { out.step1 = fixed; out.step1Source = 'fixed'; }
  else {
    const fat = okCents(S.spending.fatFloorMonthly);
    if (fat !== null && fat > 0) { out.step1 = fat; out.step1Source = 'fatFloor'; }
    else { const cats = FAT_CATEGORIES.reduce((s, c) => s + (S.spending.byCategory && S.spending.byCategory[c] ? S.spending.byCategory[c].cents : 0), 0); if (cats > 0) { out.step1 = cats; out.step1Rough = true; out.step1Source = 'categories'; } }
  }
  const spend = okCents(S.safety.spendingWithPremiums) !== null ? okCents(S.safety.spendingWithPremiums) : okCents(S.spending.baselineMonthly);
  const months = G.cushion && typeof G.cushion.step2Months === 'number' ? G.cushion.step2Months : (asm.cushionStep2Months === undefined ? 1 : asm.cushionStep2Months);
  if (spend !== null) out.step2 = Math.round(spend * months);
  out.step3 = okCents(S.safety.ruleOf5Target);
  if (out.step1 !== null && out.step2 !== null) out.step2 = Math.max(out.step2, out.step1);
  if (out.step2 !== null && out.step3 !== null) out.step3 = Math.max(out.step3, out.step2);
  return out;
}

/* Derive the goals and lay the stored settings over them. */
export function goalsOf(record, result) {
  const G = Object.assign(defaultGoals(), record.goals || {});
  const S = result.sun && result.sun.outputs; const M = result.metrics || {};
  const links = G.links || {};
  const balanceOfRow = rowId => { const r = record.planets.invest.rows.find(x => x.id === rowId); const f = r && r.f.accountBalance; return f && typeof f.v === 'number' ? f.v : 0; };
  const cash = S ? okCents(S.invest.cashBalances) : null;
  const pot = links.cushion ? balanceOfRow(links.cushion) : (cash || 0);
  const T = cushionTargets(record, result);
  const items = [];
  CUSHION.forEach(c => {
    const target = c.step === 1 ? T.step1 : c.step === 2 ? T.step2 : T.step3;
    const below = c.step === 1 ? 0 : c.step === 2 ? T.step1 : T.step2;
    items.push(Object.assign({}, c, { targetCents: target, balanceCents: target !== null ? Math.min(pot, target) : 0, aboveCents: target !== null && below !== null ? pos(target - below) : null, targetDate: null, locked: c.type === 'floor', rough: c.step === 1 && T.step1Rough, needs: target === null ? (c.step === 1 ? ['spending lines for food, housing and getting around'] : c.step === 2 ? ['monthly spending'] : ['monthly spending and a birth date']) : [] }));
  });
  (result.debts || []).forEach(d => {
    if (d.full || !(d.balance > 0)) return;
    items.push({ id: 'debt:' + d.id, type: 'debt', name: d.name || 'Debt', targetCents: d.balance, balanceCents: 0, remainingCents: d.balance, targetDate: null, rate: d.rate || 0, promoApr: d.promoApr, promoEnd: d.promoEnd, minimum: d.minimum || 0, highInterest: (d.rate || 0) >= HIGH_APR, needs: [] });
  });
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
  /* order: the two floors, then the stored order, then the default order of operations for anything new */
  const rank = i => isFloor(i) ? 0 : i.type === 'debt' && i.highInterest ? 1 : i.id === 'full' ? 2 : i.type === 'dated' ? 3 : i.type === 'amount' ? 4 : i.type === 'debt' ? 5 : 6;
  const dflt = visible.slice().sort((a, b) => rank(a) - rank(b) || (a.type === 'debt' && b.type === 'debt' ? (b.rate || 0) - (a.rate || 0) : 0) || (a.type === 'dated' && b.type === 'dated' ? (a.targetDate < b.targetDate ? -1 : a.targetDate > b.targetDate ? 1 : 0) : 0));
  const stored = (G.order || []).filter(id => visible.some(i => i.id === id) && !FLOOR_IDS.includes(id));
  const floors = FLOOR_IDS.map(id => visible.find(i => i.id === id)).filter(Boolean);
  const ordered = floors.concat(stored.map(id => visible.find(i => i.id === id)), dflt.filter(i => !isFloor(i) && !stored.includes(i.id)));
  ordered.forEach((it, k) => { it.priority = k + 1; });
  const surplus = M.surplus && M.surplus.status === 'ok' ? M.surplus.value.cents : null;
  return { items: ordered, mode: MODES.includes(G.mode) ? G.mode : 'deadlines-first', splits: G.splits || {}, overrides: G.overrides || {}, targets: T, pot, cash, cashKnown: cash !== null, surplus, surplusKnown: surplus !== null };
}

/* The allocation, month by month. input: { from, surplusMonthly, items, mode, splits, overrides, events: [{ month, kind: 'windfall' | 'withdraw', cents }], maxMonths, minMonths, skipFloor }. */
export function allocate(input) {
  const from = input.from; const mode = MODES.includes(input.mode) ? input.mode : 'deadlines-first';
  const overrides = input.overrides || {}; const splits = input.splits || {}; const events = input.events || [];
  const maxMonths = input.maxMonths || HORIZON; const minMonths = input.minMonths || 24;
  const st = {};
  const finite = input.items.filter(i => i.type !== 'long-term' && typeof i.targetCents === 'number' && i.targetCents >= 0);
  const cushions = finite.filter(isCushion).sort((a, b) => a.step - b.step);
  /* the cushion is one pot; each step's balance is the pot capped at its target */
  let pot = cushions.length ? Math.min(...cushions.map(c => c.balanceCents !== undefined ? c.balanceCents : 0).concat([Infinity])) : 0;
  if (cushions.length) { const top = cushions[cushions.length - 1]; pot = Math.min(top.balanceCents || 0, top.targetCents); cushions.forEach(c => { if ((c.balanceCents || 0) > pot) pot = Math.min(c.balanceCents, c.targetCents); }); }
  if (input.skipFloor) { const floors = cushions.filter(isFloor); if (floors.length) pot = Math.max(pot, Math.max(...floors.map(f => f.targetCents))); }
  finite.forEach(i => { st[i.id] = { bal: isCushion(i) ? Math.min(pot, i.targetCents) : i.type === 'debt' ? 0 : Math.min(i.balanceCents || 0, i.targetCents), remaining: i.type === 'debt' ? i.remainingCents : null, done: false, finish: null, funded: [], balances: [], interest: 0, refills: [], doneAtStart: false, runaway: false }; });
  finite.forEach(i => { const s = st[i.id]; if (i.type !== 'debt' && s.bal >= i.targetCents) { s.done = true; s.doneAtStart = true; } if (i.type === 'debt' && !(i.remainingCents > 0)) { s.done = true; s.doneAtStart = true; } });
  const months = []; let freed = 0; let freedNext = 0; const rollovers = []; const flow = [];
  const remainingOf = (i, s) => i.type === 'debt' ? s.remaining : isCushion(i) ? i.targetCents - pot : i.targetCents - s.bal;
  const give = (i, s, cents, m) => { if (cents <= 0) return 0; const r = remainingOf(i, s); const pay = Math.min(cents, Math.max(0, r)); if (i.type === 'debt') s.remaining -= pay; else if (isCushion(i)) pot += pay; else s.bal += pay; s.funded[m] += pay; return pay; };
  const fin = (i, s, ym) => { if (!s.done && remainingOf(i, s) <= 0) { s.done = true; s.finish = ym; if (i.type === 'debt') freedNext += i.minimum || 0; flow.push({ id: i.id, month: ym }); } };
  const floors = cushions.filter(isFloor);
  let m = 0; let ym;
  for (m = 0; m < maxMonths; m++) {
    ym = addMonths(from, m); months.push(ym);
    finite.forEach(i => { st[i.id].funded[m] = 0; });
    freed += freedNext; freedNext = 0;
    let available = Math.max(0, (input.surplusMonthly || 0) + freed);
    events.filter(e => e.month === ym && e.kind === 'windfall').forEach(e => { available += Math.max(0, e.cents || 0); });
    /* she used the cushion: the pot shrinks and every step above it reopens; the floors come first again */
    events.filter(e => e.month === ym && e.kind === 'withdraw').forEach(e => {
      if (!cushions.length) return;
      pot = Math.max(0, pot - Math.max(0, e.cents || 0));
      cushions.forEach(c => { const s = st[c.id]; if (s.done && pot < c.targetCents && !(input.skipFloor && isFloor(c))) { s.done = false; s.doneAtStart = false; s.finish = null; s.refills.push(ym); } });
    });
    /* debts: interest and the minimum, which spending already pays */
    finite.filter(i => i.type === 'debt' && !st[i.id].done && !st[i.id].runaway).forEach(i => { const s = st[i.id]; const r = stepDebt(i, s.remaining, ym, 0); s.interest += r.interest; s.remaining = r.balance; if (r.paid) { s.remaining = 0; fin(i, s, ym); } else if (s.remaining > i.remainingCents * 3) { s.runaway = true; } /* the minimum does not cover the interest and nothing extra arrives: the balance runs away; stop counting */ });
    /* 1. the floors, in order */
    floors.forEach(f => { if (!st[f.id].done && available > 0) { available -= give(f, st[f.id], available, m); fin(f, st[f.id], ym); } });
    const floorOpen = floors.some(f => !st[f.id].done);
    const open = () => finite.filter(i => !isFloor(i) && !st[i.id].done);
    if (!floorOpen) {
      /* 2. locked amounts, never on a floor */
      open().filter(i => overrides[i.id] > 0).forEach(i => { available -= give(i, st[i.id], Math.min(available, overrides[i.id]), m); });
      const free = () => open().filter(i => !(overrides[i.id] > 0));
      /* 3. the mode */
      if (mode === 'deadlines-first') {
        free().filter(i => i.type === 'dated' && i.targetDate).forEach(i => { const left = monthsBetween(ym, i.targetDate) + 1; const r = remainingOf(i, st[i.id]); const need = left <= 1 ? r : Math.ceil(r / left); available -= give(i, st[i.id], Math.min(available, need), m); });
        free().forEach(i => { if (available > 0) available -= give(i, st[i.id], available, m); });
      } else if (mode === 'one-at-a-time') {
        free().forEach(i => { if (available > 0) available -= give(i, st[i.id], available, m); });
      } else {
        let poolLeft = available; let guard = 0;
        while (poolLeft > 0 && guard++ < 10) {
          const el = free().filter(i => remainingOf(i, st[i.id]) > 0); if (!el.length) break;
          const w = el.map(i => typeof splits[i.id] === 'number' && splits[i.id] > 0 ? splits[i.id] : null);
          const total = w.reduce((s, x) => s + (x === null ? 1 / el.length : x), 0);
          const before = poolLeft;
          el.forEach((i, k) => { const share = Math.floor(before * ((w[k] === null ? 1 / el.length : w[k]) / total)); poolLeft -= give(i, st[i.id], Math.min(share, poolLeft), m); });
          if (poolLeft === before) { poolLeft -= give(el[0], st[el[0].id], poolLeft, m); }
        }
        available = poolLeft;
      }
      open().forEach(i => fin(i, st[i.id], ym));
    }
    finite.forEach(i => { const s = st[i.id]; s.balances[m] = i.type === 'debt' ? s.remaining : isCushion(i) ? Math.min(pot, i.targetCents) : s.bal; });
    const allDone = finite.every(i => st[i.id].done);
    if (allDone && m + 1 >= minMonths) break;
  }
  /* rollover marks: when a goal fills part way through a month, the rest of its money already moved on that month; otherwise the jump shows the month after */
  const gainer = (f, k) => { let best = null, gain = 0; finite.forEach(i => { if (i.id === f.id) return; const s = st[i.id]; const d = (s.funded[k] || 0) - (k > 0 ? (s.funded[k - 1] || 0) : 0); if (d > gain) { gain = d; best = i.id; } }); return { best, gain }; };
  flow.forEach(f => { const k = months.indexOf(f.month); if (k < 0) return; const s = st[f.id]; const capped = k > 0 && (s.funded[k] || 0) < (s.funded[k - 1] || 0); const same = capped ? gainer(f, k) : { best: null, gain: 0 }; if (same.best) { rollovers.push({ from: f.id, to: same.best, month: months[k], cents: same.gain }); return; } if (k + 1 >= months.length) return; const next = gainer(f, k + 1); if (next.best) rollovers.push({ from: f.id, to: next.best, month: months[k + 1], cents: next.gain }); });
  const floorsFull = floors.length ? floors.map(f => st[f.id].finish).filter(Boolean).sort().pop() || null : null;
  const out = { from, months, mode, goals: {}, rollovers, floorsFull, floorsFullAtStart: floors.length ? floors.every(f => st[f.id].doneAtStart) : true, totalInterest: 0, potAtStart: cushions.length ? Math.min(pot, Infinity) : 0 };
  finite.forEach(i => { const s = st[i.id]; out.goals[i.id] = { id: i.id, funded: s.funded, balances: s.balances, finishMonth: s.finish, doneAtStart: s.doneAtStart, interest: s.interest, refills: s.refills, monthlyNow: s.funded[0] || 0, runaway: s.runaway }; out.totalInterest += s.interest; });
  return out;
}

/* Which month a goal lands when the floors and this goal are the only things funded. */
function earliestFor(input, item) {
  const items = input.items.filter(i => isFloor(i) || i.id === item.id);
  const r = allocate(Object.assign({}, input, { items, mode: 'one-at-a-time', overrides: {}, splits: {} }));
  return r.goals[item.id] ? r.goals[item.id].finishMonth : null;
}

/* Status, shortfall and the earliest date per goal; a cushion step is named when it is the reason. */
export function assess(input, run) {
  const out = {};
  const floors = input.items.filter(isFloor);
  input.items.forEach(i => {
    const g = run.goals[i.id];
    if (i.type === 'long-term') { out[i.id] = { status: i.monthsAway === null || i.monthsAway === undefined ? 'needs' : 'projected', finishMonth: i.monthsAway !== null && i.monthsAway !== undefined ? addMonths(input.from, Math.round(i.monthsAway)) : null }; return; }
    if (!g) { out[i.id] = { status: 'needs', finishMonth: null }; return; }
    if (g.doneAtStart) { out[i.id] = { status: 'done', finishMonth: null, alreadyMet: true }; return; }
    const a = { status: g.finishMonth ? 'on-track' : 'never', finishMonth: g.finishMonth, monthlyNow: g.monthlyNow };
    if (i.type === 'dated' && i.targetDate) {
      const k = run.months.indexOf(i.targetDate);
      const late = !g.finishMonth || g.finishMonth > i.targetDate;
      if (late) {
        a.status = 'behind';
        const balAtDate = k >= 0 ? g.balances[k] : (g.balances[g.balances.length - 1] || 0);
        const gap = Math.max(0, i.targetCents - balAtDate);
        /* the floor months before the date, and the step that took the last of them */
        let lastFloorMonth = null, lastFloorId = null;
        floors.forEach(f => { const fg = run.goals[f.id]; if (!fg) return; fg.funded.forEach((c, kk) => { if (c > 0 && run.months[kk] <= i.targetDate && (!lastFloorMonth || run.months[kk] >= lastFloorMonth)) { lastFloorMonth = run.months[kk]; lastFloorId = f.id; } }); });
        let floorReason = false;
        if (lastFloorMonth) { const r2 = allocate(Object.assign({}, input, { skipFloor: true })); const f2 = r2.goals[i.id] ? r2.goals[i.id].finishMonth : null; floorReason = !!(f2 && f2 <= i.targetDate); }
        const after = floorReason ? addMonths(lastFloorMonth, 1) : input.from;
        const left = Math.max(1, monthsBetween(after, i.targetDate) + 1);
        a.shortfallMonthly = Math.ceil(gap / left); a.floorReason = floorReason; a.floorStep = floorReason ? lastFloorId : null; a.after = after; a.gapAtDate = gap;
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
  if (w.order && w.order.length) { const byId = {}; items.forEach(i => { byId[i.id] = i; }); const picked = w.order.filter(id => byId[id] && !FLOOR_IDS.includes(id)).map(id => byId[id]); const floors = items.filter(isFloor); items = floors.concat(picked, items.filter(i => !isFloor(i) && !w.order.includes(i.id))); items.forEach((it, k) => { it.priority = k + 1; }); }
  const from = (result.today || new Date().toISOString()).slice(0, 7);
  const surplus = (base.surplus || 0) + (w.surplusDelta || 0);
  const input = { from, surplusMonthly: surplus, items, mode: w.mode || base.mode, splits: w.splits || base.splits, overrides: w.overrides || base.overrides, events: w.events || [] };
  const run = allocate(input);
  const assessment = assess(input, run);
  if (!base.surplusKnown) Object.keys(assessment).forEach(id => { const it = items.find(i => i.id === id); if (it && it.type !== 'long-term' && assessment[id].status !== 'done') assessment[id] = { status: 'needs', finishMonth: null, needs: ['take-home, spending and debt minimums'] }; });
  const compare = MODES.map(mode => { const r = mode === input.mode ? run : allocate(Object.assign({}, input, { mode })); const a = mode === input.mode ? assessment : assess(Object.assign({}, input, { mode }), r); const dated = items.filter(i => i.type === 'dated' && i.targetDate && typeof i.targetCents === 'number'); return { mode, onTime: dated.filter(i => a[i.id] && a[i.id].status === 'on-time').length, dated: dated.length, finish: Object.fromEntries(items.map(i => [i.id, a[i.id] ? a[i.id].finishMonth : null])), interest: r.totalInterest, floorsFull: r.floorsFull }; });
  return { input, base, run, assessment, compare, next: nextWin(input, run, assessment), surplusKnown: base.surplusKnown, cashKnown: base.cashKnown, alreadyMet: items.filter(i => isCushion(i) && assessment[i.id] && assessment[i.id].alreadyMet).map(i => i.id) };
}

/* Cushion steps already covered that have not yet had their celebration (record.goals.celebrated). */
export function celebrations(plan, record) {
  const seen = (record.goals && record.goals.celebrated) || {};
  return (plan.alreadyMet || []).filter(id => !seen[id]).map(id => plan.input.items.find(i => i.id === id));
}

/* The finish months as a flat map, for the session snapshot and "since last time"; done steps carry 'done'. */
export function finishMonths(plan) { const out = {}; plan.input.items.forEach(i => { const a = plan.assessment[i.id]; out[i.id] = a ? (a.status === 'done' ? 'done' : a.finishMonth) : null; }); return out; }

/* What moved between two finish maps, in words: a covered step, a date that moved, a date that appeared or vanished. */
export function finishChanges(before, after, items) {
  const out = [];
  Object.keys(after).forEach(id => {
    const a = after[id], b = before ? before[id] : undefined; if (b === undefined || a === b) return;
    const it = items.find(i => i.id === id); const name = it ? it.name : id;
    if (a === 'done') { out.push({ id, name, from: b, to: a, months: null, text: it && it.doneWord ? 'you covered ' + it.doneWord : name + ' is done' }); return; }
    if (b === 'done') { out.push({ id, name, from: b, to: a, months: null, text: it && it.doneWord ? it.doneWord.charAt(0).toUpperCase() + it.doneWord.slice(1) + ' needs refilling' : name + ' reopened' }); return; }
    if (a && b) { const d = monthsBetween(a, b); out.push({ id, name, from: b, to: a, months: d, text: name + (d > 0 ? ' moved up ' : ' moved back ') + (Math.abs(d) === 1 ? 'a month' : Math.abs(d) + ' months') }); }
    else if (a && !b) out.push({ id, name, from: b, to: a, months: null, text: name + ' now has a date' });
    else out.push({ id, name, from: b, to: a, months: null, text: name + ' lost its date' });
  });
  return out;
}

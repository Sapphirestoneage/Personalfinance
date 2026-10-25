// The Plan page (S-208, Batch F): the FOO ladder, the paycheck allocator, the
// solvers, the real hourly wage and hours of life, the DRAFTT scorecard, the
// fixed floor, goals and sinking funds, the outlook, an income shock, life
// event templates, a diff between two households, export and import. Every
// number comes from the summary, the one day-by-day run (engine/cashsim.js),
// the monthly plan (engine/debt.js), the FI engine or the waterfall
// (engine/windfall.js). Views only format what comes back.

import { valueOf as v, tracker, round2, monthKey, addMonths, addDays, daysBetween, fact, ageOn } from './spine.js';
// Rounded up to the cent (a month that fills a limit by its deadline).
const c2 = (x) => Math.ceil(Math.round(x * 1000) / 10) / 100;
import { yearsToTarget } from './fi.js';
import { payoffPlan, rateOn, paidInFull } from './debt.js';
import { windfall } from './windfall.js';
import { maxIt, longDay, steadyMonth } from './maxit.js';
import { paysAfter } from './contrib.js';
import { paychecks } from './calendar-views.js';
import { FAT, PRESETS } from './schema.js';
import { upgradeSpine } from './normalize.js';
import { validate } from './schema.js';
import { cashsim } from './cashsim.js';
import * as C from './vendor/cashcal.js';

const dollars = (c) => (c === null || c === undefined ? null : round2(c / 100));
const cents = (d) => Math.round(d * 100);
const sameDayLater = (iso, months) => { const ym = addMonths(monthKey(iso), months); const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(); return ym + '-' + String(Math.min(+iso.slice(8, 10), last)).padStart(2, '0'); };
const monthsToFill = (need, perMonth) => (need <= 0 ? 0 : perMonth > 0 ? Math.ceil(need / perMonth) : null);

// ---------------------------------------------------------------- the surplus waterfall (E008)
// The same function as the Windfall room, run on the monthly surplus: one order, one formula.
export function surplusWaterfall(spine, rules, s) {
  const surplus = s.cashflow.surplus.value;
  const w = windfall(spine, rules, s, { amount: Math.max(0, surplus ?? 0), taxed: true, monthly: true });
  // Each step's months to fill at this pace: null when one month fills it or it takes nothing.
  const steps = w.steps.map((st) => ({ ...st, months: st.amount > 0 && st.need > st.amount ? Math.ceil(st.need / st.amount) : null }));
  return { ...w, steps, surplus, note: surplus === null ? 'The monthly surplus is not known yet.' : surplus <= 0 ? 'There is no monthly surplus to assign: ' + Math.abs(surplus) + ' dollars more goes out than comes in.' : null };
}

// ---------------------------------------------------------------- the FOO ladder (E007)
// Nine rungs funded by the monthly surplus, each with what it still needs and the
// month it completes if the surplus goes to it after the rungs before it. Setup is
// three questions: the biggest deductible, the employer match (on the account), the
// reserve months (the Rule of 5 target already answers that).
export const RUNG_LABELS = {
  deductibles: 'Deductibles covered', employerMatch: 'The employer match', highInterest: 'High-interest debt', reserves: 'Emergency reserves',
  rothHsa: 'Roth and HSA room', maxRetirement: 'Retirement maxed', hyper: 'Hyper-accumulation', prepaid: 'Prepaid future expenses', lowInterest: 'Low-interest debt'
};
// sim (optional): the day-by-day run "How much to max it?" reads (maxItSim), so the rungs read the same rows as its card.
export function fooLadder(spine, rules, s, { asOf = spine.meta.asOf, sim = null } = {}) {
  const year = +asOf.slice(0, 4);
  const all = tracker();
  const order = all.rule(rules, 'FOO_RUNGS', year);
  const surplus = Math.max(0, s.cashflow.surplus.value ?? 0);
  all.absorb({ ...s.cashflow.surplus, value: undefined });
  const w = windfall(spine, rules, s, { amount: 0, taxed: true, monthly: true });
  let mxMemo = null;
  const mx = () => mxMemo || (mxMemo = maxIt(spine, rules, { asOf, sim }));
  const step = (id) => w.steps.find((x) => x.id === id) || null;
  const cash = s.sheet.cash.value;
  const hi = rules.get('APP_HI_RATE', year);
  const rungs = [];
  let monthsSoFar = 0, afterAll = true;
  const push = (id, t, { need, flow = false, why, path = null, done = null }) => {
    const snap = t.snapshot();
    const n = need === null ? null : Math.max(0, round2(need));
    const isDone = done !== null ? done : n !== null ? n <= 0 : null;
    // A flow rung (a monthly amount) takes from the surplus for good; a stock rung is filled once.
    const months = n === null ? null : isDone ? 0 : flow ? 0 : monthsToFill(n, surplus);
    // A flow rung after one that never finishes has no date either.
    const completes = n === null ? null : isDone ? asOf : months === null || (flow && !afterAll) ? null : sameDayLater(asOf, monthsSoFar + months);
    if (n !== null && !isDone) { if (months === null) afterAll = false; else monthsSoFar += months; }
    rungs.push({ id, rung: rungs.length + 1, label: RUNG_LABELS[id], need: n, flow, done: isDone, months, completes, why, path, kind: n === null ? 'missing' : snap.missing.length ? 'incomplete' : snap.rough.length ? 'rough' : 'computed', from: snap.from, rough: snap.rough, missing: snap.missing, rules: snap.rules });
    all.absorb({ value: 0, ...snap });
  };
  for (const id of order) {
    const t = tracker();
    if (id === 'deductibles') { const d = t.useFact('household.deductible', spine.household.deductible); t.absorb({ ...s.sheet.cash, value: undefined }); push(id, t, d === null ? { need: null, why: 'Needs the biggest insurance deductible (health, car, home), under Filing in My numbers.', path: 'household.deductible' } : { need: cash === null ? null : d - cash, why: (cash === null ? 'Needs cash on hand.' : cash >= d ? 'Cash (' + money(cash) + ') covers the biggest deductible (' + money(d) + ').' : money(d - cash) + ' more cash covers the biggest deductible (' + money(d) + ').') + (cash !== null && s.sheet.setAsideNote ? ' ' + s.sheet.setAsideNote : ''), path: 'household.deductible' }); }
    else if (id === 'employerMatch') { const st = step('employerMatch'); t.absorb({ ...st, value: undefined }); push(id, t, { need: st.need, flow: true, why: st.why, path: st.path, done: st.need === null ? null : st.need <= 0 }); }
    else if (id === 'highInterest') { const list = (spine.debts || []).filter((d) => { const r = rateOn(d, asOf).rate; const b = t.useFact('debts.' + d.id + '.balance', d.balance); return r !== null && r >= hi && b > 0 && !paidInFull(spine, d); }); const need = list.reduce((a, d) => a + (v(d.balance) || 0), 0); t.rule(rules, 'APP_HI_RATE', year); push(id, t, { need, why: list.length ? list.map((d) => (v(d.name) || d.id) + ' ' + money(v(d.balance))).join(', ') + ' at or above ' + Math.round(hi * 100) + '%.' : 'Nothing at or above ' + Math.round(hi * 100) + '%.', path: list.length ? 'debts.' + list[0].id + '.balance' : null }); }
    else if (id === 'reserves') { const gap = s.emergency.gap; t.absorb({ ...gap, value: undefined }); push(id, t, { need: gap.value, why: gap.value === null ? 'The Rule of 5 target needs a birth date and monthly spending.' : gap.value > 0 ? money(gap.value) + ' to the Rule of 5 target (' + money(s.emergency.targetDollars.value) + ').' : 'Cash reaches the Rule of 5 target.', path: gap.missing[0] || s.sheet.cash.from[0] || null }); }
    // Roth and HSA room, and retirement maxed (S-211): both read "How much to max it?" (engine/maxit.js), each shared
    // limit once, for every tax year still open: the new money a month that fills the room by each deadline, on top of
    // what already goes in (the surplus already pays that). A limit whose deadline passes before the surplus reaches
    // the rung is sized by its steady month instead (a whole year's room less what already goes in, a twelfth).
    else if (id === 'rothHsa' || id === 'maxRetirement') {
      const want = id === 'rothHsa' ? /^(ira|hsa|hsa55):/ : /^(deferral|k457b|employer):/;
      const m = mx();
      // The surplus reaches this rung on `start`; when a rung before it never finishes, it has no date.
      const start = afterAll ? sameDayLater(asOf, monthsSoFar) : null;
      const from = start || asOf;
      const mine = m.rows.filter((r) => r.pools.some((k) => want.test(k)));
      for (const r of mine) t.absorb({ ...r, value: undefined });
      const miss = mine.filter((r) => r.applies && !r.passed && (r.room === null || r.blankLabel));
      const off = mine.filter((r) => !r.applies);
      const over = mine.filter((r) => r.over || r.overSoon);
      // A payroll-only limit with no paycheck left counts as closed while its owner still has a payday after its
      // deadline and after the surplus reaches the rung (next year's room); a line that pays $0 or never pays again does
      // not count.
      const payFrom = (r) => (start && start > r.deadline.date ? start : r.deadline.date);
      const paysOn = (r) => paysAfter(spine, r.person, payFrom(r));
      const shut = mine.filter((r) => r.applies && r.room !== null && !r.passed && !r.fillable);
      // Each limit counted from the rung's start: its dates left from then; none left means its deadline passes first.
      // A payroll pool counts the months that still hold a paycheck (any payday in the month, not only the first).
      const monthsLeft = (p) => (p.row.deadline.payrollOnly && p.row.paychecks ? new Set(p.row.paychecks.dates.filter((d) => d >= from).map((d) => d.slice(0, 7))).size : p.row.months.dates.filter((d) => d >= from).length);
      // Each rung counts what the Plan counts, so following the rungs in turn never uses the same pay twice. The Plan and the
      // ladder follow one order (answer 63): the 401(k) up to the match, then the IRA, then the rest; the line says why an
      // account counts less. A plan filled from pay is capped at what its paychecks from the rung's start hold (answer
      // 59), one person's paychecks shared by their plans from pay; the line says so.
      const heldFrom = new Map();
      const sized = m.pools.filter((p) => want.test(p.key)).map((p) => {
        const n = monthsLeft(p), pc = p.row.paychecks;
        let fill = p.fill, capFrom = false;
        if (p.row.deadline.payrollOnly && pc && pc.each && start && start > asOf) {
          const used = heldFrom.get(p.row.person) || 0;
          const holds = round2(Math.max(0, pc.each.filter((e) => e.date >= from).reduce((x, e) => x + e.landed, 0) - used));
          if (fill > holds + 0.005) { fill = holds; capFrom = true; }
          heldFrom.set(p.row.person, round2(used + fill));
        }
        return { ...p, fill, capFrom, left: n, perMonth: n ? c2(fill / n) : null };
      });
      const open = sized.filter((p) => p.left > 0);
      const closed = [...sized.filter((p) => p.left === 0), ...shut.filter((r) => paysOn(r)).map((r) => ({ key: r.pools[0], year: r.year, room: r.room, row: r, deadline: r.deadline.date }))];
      // A limit whose deadline passes first: its steady month, once per pool (a later year still open sizes it instead).
      // A plan filled from pay whose owner has no payday after its deadline takes nothing once the surplus gets there.
      const gone = closed.filter((p) => p.row.deadline.payrollOnly && !paysOn(p.row));
      const later = closed.filter((p, i) => !gone.includes(p) && !open.some((o) => o.key === p.key) && closed.findIndex((c) => c.key === p.key) === i).map((p) => ({ ...p, perMonth: steadyMonth(spine, p), steady: true }));
      if (!sized.length && !later.length && !miss.length && !over.length) push(id, t, { need: 0, why: off.length ? off.map((r) => r.name + ': ' + r.why).join(' ') : shut.length ? shut.map((r) => r.name + ' ' + r.year + ' cannot be filled: no paycheck before ' + longDay(r.deadline.date) + '.').join(' ') : id === 'rothHsa' ? 'No IRA or HSA in your numbers.' : 'No workplace or self-employed retirement account in your numbers.', done: true });
      else {
        // The Plan's count, with why it is less than the account alone could take (another limit or rung uses the pay first).
        const line = (p) => p.steady ? p.row.name + ': about ' + money(p.perMonth) + ' a month in a whole year at ' + p.year + ' limits, on top of what already goes in' : p.row.name + ' ' + p.year + ': ' + money(p.perMonth) + ' a month to ' + longDay(p.deadline) + (p.still ? ', on top of the ' + money(p.still) + ' already set to go in' : '') + (p.capFrom ? ' (only what its paychecks from ' + longDay(from) + ' hold)' : '') + (p.row.counted && !p.spill && !(p.capFrom && p.row.counted.why === 'paycheck') ? ' (less than the account alone could take: ' + p.row.counted.words + ')' : '');
        const need = round2([...open, ...later].reduce((x, p) => x + (p.perMonth || 0), 0));
        const when = start ? 'before the surplus reaches this rung (about ' + longDay(start) + ')' : 'before the surplus reaches this rung';
        // A payroll pool whose deadline is after the start closes on its last payday, not on the deadline.
        const lastPay = (p) => (p.row.deadline.payrollOnly && p.row.paychecks && p.deadline >= from ? p.row.paychecks.dates.filter((d) => d < from).pop() || null : null);
        const why = [
          miss.length ? miss.map((r) => r.name + ' ' + r.year + ': ' + (r.missingLabel || r.blankLabel)).join('; ') + '.' : '',
          over.length ? over.map((r) => r.name + ' ' + r.year + ': ' + (r.over ? 'over the limit by ' + money(r.over) + (r.overByYearEnd ? ', ' + money(r.overByYearEnd) + ' by December 31 if nothing changes' : '') : 'set to go over the limit by ' + money(r.overSoon))).join('; ') + '.' : '',
          [...open, ...later].map(line).join('; ') + (open.length || later.length ? '.' : ''),
          closed.some((p) => !gone.includes(p)) ? closed.filter((p) => !gone.includes(p)).map((p) => p.row.name + ' ' + p.year + (!p.row.fillable ? ' has no paycheck left before ' + longDay(p.deadline) : lastPay(p) ? ': its last payday before ' + longDay(p.deadline) + ' is ' + longDay(lastPay(p)) + ', ' + when : ' closes on ' + longDay(p.deadline) + ', ' + when)).join('; ') + '.' : '',
          gone.map((p) => p.row.name + ' ' + p.year + ': no paycheck after ' + longDay(payFrom(p.row)) + ', so nothing goes in once the surplus reaches this rung.').join(' '),
          shut.filter((r) => !paysOn(r)).map((r) => r.name + ' ' + r.year + ' cannot be filled: no paycheck before ' + longDay(r.deadline.date) + '.').join(' ')
        ].filter(Boolean).join(' ');
        const first = miss[0] || over[0] || (sized[0] && sized[0].row);
        push(id, t, { need: miss.length ? null : need, flow: true, why: why.trim(), path: (miss[0] && ((miss[0].ei && miss[0].ei.missing[0]) || (miss[0].paychecks && miss[0].paychecks.blank && miss[0].paychecks.blank.path))) || (first ? 'accounts.' + first.accountId + '.contributions' : null), done: miss.length ? null : over.length ? false : need <= 0 });
      }
    }
    else if (id === 'hyper') { const rate = t.rule(rules, 'FOO_HYPER_RATE', year); const g = s.cashflow.savingsRate.gross; t.absorb({ ...g, value: undefined }); const gross = s.cashflow.income.gross.value; push(id, t, { need: g.value === null || gross === null ? null : Math.max(0, (rate - g.value) * gross), flow: true, why: g.value === null ? 'Needs the gross savings rate.' : g.value >= rate ? 'Saving ' + Math.round(g.value * 100) + '% of gross, past the ' + Math.round(rate * 100) + '% mark.' : 'Saving ' + Math.round(g.value * 100) + '% of gross; ' + money(Math.max(0, (rate - g.value) * gross)) + ' a month more reaches ' + Math.round(rate * 100) + '%.', path: g.missing[0] || s.cashflow.income.gross.from[0] || null }); }
    else if (id === 'prepaid') { const goals = (spine.goals || []).filter((g) => g.type !== 'fi' && g.target); let need = 0, miss = false; for (const g of goals) { const tg = t.useFact('goals.' + g.id + '.target', g.target); if (tg === null) miss = true; else need += tg; } push(id, t, { need: miss ? null : need, why: goals.length ? (miss ? 'A goal has no target.' : money(need) + ' across ' + goals.length + ' goal' + (goals.length === 1 ? '' : 's') + '.') : 'No goals beyond financial independence.', path: goals.length ? 'goals.' + goals[0].id + '.target' : null, done: goals.length ? null : true }); }
    else if (id === 'lowInterest') { const list = (spine.debts || []).filter((d) => { const r = rateOn(d, asOf).rate; const b = t.useFact('debts.' + d.id + '.balance', d.balance); return r !== null && r < hi && b > 0 && !paidInFull(spine, d); }); const need = list.reduce((a, d) => a + (v(d.balance) || 0), 0); push(id, t, { need, why: list.length ? list.map((d) => (v(d.name) || d.id) + ' ' + money(v(d.balance))).join(', ') + ' under ' + Math.round(hi * 100) + '%.' : 'Nothing under ' + Math.round(hi * 100) + '%.', path: list.length ? 'debts.' + list[0].id + '.balance' : null }); }
  }
  const current = rungs.find((r) => r.done === false) || null;
  const out = all.out(surplus);
  return { rungs, current: current ? current.id : null, surplus, setup: { deductible: spine.household.deductible ? v(spine.household.deductible) : null, match: (spine.accounts || []).some((a) => a.matchRate), reserveMonths: s.emergency.targetMonths.value }, allDated: afterAll, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}
const money = (x) => (x === null || x === undefined ? 'missing' : '$' + Math.round(x).toLocaleString('en-US'));

// ---------------------------------------------------------------- the paycheck allocator (R006)
// Each paycheck: what it covers by due date until the next one (envelopes), the
// tax set-aside on a 1099 deposit, and what is free; a third biweekly or fifth
// weekly paycheck is the bonus the waterfall's first step could take.
export function allocator(spine, rules, sim, s) {
  const list = paychecks(spine, rules, sim, s);
  const rate = s.cashflow.taxSetAside;
  const seRate = s.tax && s.tax.lines && s.tax.lines.marginalSe ? s.tax.lines.marginalSe.value : null;
  const marginal = s.tax && s.tax.lines && s.tax.lines.marginal ? s.tax.lines.marginal.value : null;
  const out = list.map((p) => {
    const stream = (spine.income || []).find((x) => x.id === p.streamId) || null;
    const is1099 = stream && (stream.type === '1099' || stream.type === 'tips');
    const setAsideRate = is1099 ? round2(((marginal ?? 0) + (seRate ?? 0)) * 10000) / 10000 : 0;
    const setAside = is1099 ? round2(p.amount * setAsideRate) : 0;
    const envelopes = p.bills.filter((b) => b.kind !== 'everyday').map((b) => ({ date: b.date, label: b.label, amount: b.amount, kind: b.kind }));
    const everyday = p.bills.filter((b) => b.kind === 'everyday').reduce((a, b) => a + b.amount, 0);
    const committed = round2(envelopes.reduce((a, b) => a + b.amount, 0));
    const free = round2(p.amount - setAside - committed - everyday);
    return { ...p, is1099: !!is1099, setAside, setAsideRate, setAsideMissing: is1099 && (marginal === null || seRate === null), envelopes, everyday: round2(everyday), committed, free, short: free < 0 };
  });
  const bonusMonths = [...new Set(out.filter((p) => p.bonus).map((p) => p.ym))];
  return { paychecks: out, bonusMonths, kind: sim.kind, from: sim.from, rough: sim.rough, missing: sim.missing, rules: [...(sim.rules || []), ...(rate.rules || [])] };
}

// ---------------------------------------------------------------- the solvers (E014)
// What it takes to reach the FI number by an age: the savings rate, the spending
// level, the income, or the return; each found by halving on the FI engine's own
// years-to-target, never a second formula.
function bisect(f, lo, hi, target, steps = 40) {
  let a = lo, b = hi;
  const fa = f(a);
  if (fa === null) return null;
  const rising = (f(b) ?? Infinity) > fa;
  for (let i = 0; i < steps; i++) { const m = (a + b) / 2; const y = f(m); if (y === null) { if (rising) b = m; else a = m; continue; } if ((y < target) === rising) a = m; else b = m; }
  return (a + b) / 2;
}
export function solvers(spine, rules, s, { byAge = null, asOf = spine.meta.asOf } = {}) {
  const t = tracker();
  const fi = s.fi;
  const person = spine.household.people[0];
  const birth = t.useFact('household.people.' + person.id + '.birthDate', person.birthDate);
  const age = birth ? ageOn(birth, asOf) : null;
  const F = fi.fiNumber.value, P = s.sheet.invested.value, r = v(spine.assumptions.realReturn);
  t.absorb({ ...fi.fiNumber, value: undefined }); t.absorb({ ...s.sheet.invested, value: undefined }); t.read(spine, 'assumptions.realReturn');
  const gross = s.cashflow.income.gross.value, takeHome = s.cashflow.income.takeHome.value, spending = s.cashflow.expenses.total.value, minimums = s.cashflow.debtMinimums.total.value ?? 0;
  const saving = s.cashflow.surplus.value === null ? null : round2(s.cashflow.surplus.value + (s.cashflow.saving.payroll.value ?? 0) + (s.cashflow.saving.afterTax.value ?? 0));
  t.absorb({ ...s.cashflow.income.gross, value: undefined }); t.absorb({ ...s.cashflow.expenses.total, value: undefined });
  const targetAge = byAge ?? (rules.get('APP_COAST_AGE', +asOf.slice(0, 4)) + 15);
  const years = age === null ? null : Math.max(0.5, targetAge - age);
  const base = { targetAge, age, years, fiNumber: F, invested: P, realReturn: r, savingNow: saving, grossNow: gross, spendingNow: spending };
  if (F === null || P === null || r === null || years === null || gross === null || takeHome === null || spending === null) return { ...base, rows: [], ...t.out(null), note: 'Needs the FI number, what is invested, the real return, a birth date, income and spending.' };
  // No income this month: there is no share of gross to solve for (a rate of $0 is not a number).
  if (gross <= 0) return { ...base, rows: [], ...t.out(null), note: 'No income comes in this month, so there is nothing to solve a savings rate or spending level from.' };
  const yearsNow = yearsToTarget(P, saving === null ? 0 : saving * 12, F, r);
  const rows = [];
  // 1. The savings rate of gross that gets there by the age.
  const needC = bisect((c) => yearsToTarget(P, c, F, r), 0, gross * 12, years);
  rows.push({ id: 'savingsRate', label: 'Savings rate needed', value: needC === null ? null : round2(needC / (gross * 12) * 10000) / 10000, unit: 'ratio', now: round2((saving ?? 0) / gross * 10000) / 10000, words: needC === null ? 'cannot be reached by then at this return' : 'save ' + Math.round(needC / 12) + ' dollars a month (' + Math.round(needC / (gross * 12) * 100) + '% of gross) against ' + Math.round(saving ?? 0) + ' now' });
  // 2. The spending level: what take-home less spending less minimums must be, holding income.
  const needSpend = needC === null ? null : round2(takeHome - minimums - needC / 12);
  rows.push({ id: 'spending', label: 'Spending level needed', value: needSpend, unit: 'usd/month', now: spending, words: needSpend === null ? 'cannot be reached by then' : needSpend < 0 ? 'spending would have to go below zero: income has to rise too' : 'spend ' + Math.round(needSpend) + ' a month against ' + Math.round(spending) + ' now' });
  // 3. The income: take-home needed holding spending (saving = take-home - spending - minimums).
  const needTakeHome = needC === null ? null : round2(spending + minimums + needC / 12);
  rows.push({ id: 'income', label: 'Take-home needed', value: needTakeHome, unit: 'usd/month', now: takeHome, words: needTakeHome === null ? 'cannot be reached by then' : 'take home ' + Math.round(needTakeHome) + ' a month against ' + Math.round(takeHome) + ' now' });
  // 4. The real return that gets there with the saving as it is.
  const needR = saving !== null && saving > 0 ? bisect((x) => yearsToTarget(P, saving * 12, F, x), 0, 0.3, years) : null;
  rows.push({ id: 'return', label: 'Real return needed', value: needR === null ? null : round2(needR * 10000) / 10000, unit: 'ratio', now: r, words: needR === null ? 'no saving to grow' : needR >= 0.299 ? 'more than 30% a year: not a plan' : Math.round(needR * 1000) / 10 + '% real a year against ' + Math.round(r * 1000) / 10 + '% assumed' });
  const out = t.out(yearsNow);
  return { ...base, yearsNow, rows, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}

// ---------------------------------------------------------------- real hourly wage (E016, R033) and hours of life (L001)
// Take-home less the costs of working, over hours worked plus the commute.
export function realHourlyWage(spine, rules, s, { asOf = spine.meta.asOf } = {}) {
  const year = +asOf.slice(0, 4);
  const t = tracker();
  const hours = t.useFact('household.workHoursPerWeek', spine.household.workHoursPerWeek);
  const commute = spine.household.commuteHoursPerWeek ? t.useFact('household.commuteHoursPerWeek', spine.household.commuteHoursPerWeek) : (t.addRough('household.commuteHoursPerWeek'), 0);
  const weeks = t.rule(rules, 'APP_WEEKS_PER_MONTH', year);
  const takeHome = s.cashflow.income.takeHome.value;
  t.absorb({ ...s.cashflow.income.takeHome, value: undefined });
  const costs = s.cashflow.expenses.items.filter((i) => { const e = (spine.expenses || []).find((x) => x.id === i.id); return e && e.workRelated && v(e.workRelated) === true && !i.covered; });
  for (const i of costs) t.useFact('expenses.' + i.id + '.workRelated', (spine.expenses.find((x) => x.id === i.id) || {}).workRelated);
  const costMonthly = round2(costs.reduce((a, i) => a + (i.amount ?? 0), 0));
  const hoursMonthly = hours === null ? null : round2((hours + (commute || 0)) * weeks);
  const wage = hours === null || takeHome === null || !hoursMonthly ? null : round2((takeHome - costMonthly) / hoursMonthly);
  const naive = hours === null || takeHome === null ? null : round2(takeHome / (hours * weeks));
  const out = t.out(wage);
  return { wage, naive, takeHome, costMonthly, costs: costs.map((i) => ({ id: i.id, label: i.label, amount: i.amount, path: 'expenses.' + i.id + '.amount' })), hoursWeek: hours, commuteWeek: commute, hoursMonthly, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}
export const hoursOf = (amount, wage) => (amount === null || amount === undefined || !wage ? null : Math.round(amount / wage * 10) / 10);

// ---------------------------------------------------------------- DRAFTT (L002)
// Debt, Retirement, Accommodation, Food, Transportation, Therapy as shares of the
// base (take-home plus pre-tax retirement); the housing letter gets a reference
// line at APP_HOUSING_REF of take-home. Shares only, never a verdict.
export function draftt(spine, rules, s, { asOf = spine.meta.asOf } = {}) {
  const year = +asOf.slice(0, 4);
  const t = tracker();
  const cf = s.cashflow;
  const ref = t.rule(rules, 'APP_HOUSING_REF', year);
  t.absorb({ ...cf.income.takeHome, value: undefined }); t.absorb({ ...cf.saving.payroll, value: undefined }); t.absorb({ ...cf.expenses.total, value: undefined }); t.absorb({ ...cf.debtMinimums.total, value: undefined });
  const takeHome = cf.income.takeHome.value, pretax = cf.saving.payroll.value ?? 0;
  const base = takeHome === null ? null : round2(takeHome + pretax);
  // A line that pays a debt (answer 35) is shown in its own category (a car payment under transportation), not under D.
  const linked = cf.expenses.linked || [], linkedSum = round2(linked.reduce((a, i) => a + i.amount, 0));
  const byTag = (tag) => round2([...cf.expenses.items, ...linked].filter((i) => i.fat === tag && !i.covered).reduce((a, i) => a + (i.amount ?? 0), 0));
  const therapy = cf.expenses.items.filter((i) => /therap|counsel/i.test(i.label) && !i.covered);
  const rows = [
    { key: 'debt', letter: 'D', label: 'Debt', amount: round2((cf.debtMinimums.total.value ?? 0) - linkedSum) },
    { key: 'retirement', letter: 'R', label: 'Retirement', amount: round2(pretax + (cf.saving.afterTax.value ?? 0)) },
    { key: 'accommodation', letter: 'A', label: 'Accommodation', amount: byTag('accommodation'), reference: ref, referenceAmount: takeHome === null ? null : round2(takeHome * ref) },
    { key: 'food', letter: 'F', label: 'Food', amount: byTag('food') },
    { key: 'transportation', letter: 'T', label: 'Transportation', amount: byTag('transportation') },
    ...(therapy.length ? [{ key: 'therapy', letter: 'Th', label: 'Therapy', amount: round2(therapy.reduce((a, i) => a + (i.amount ?? 0), 0)) }] : [])
  ].map((r) => ({ ...r, share: base ? round2(r.amount / base * 10000) / 10000 : null, shareOfTakeHome: takeHome ? round2(r.amount / takeHome * 10000) / 10000 : null }));
  const total = round2(rows.reduce((a, r) => a + r.amount, 0));
  const spentElse = round2((cf.expenses.total.value ?? 0) + linkedSum - byTag('accommodation') - byTag('food') - byTag('transportation') - rows.filter((r) => r.key === 'therapy').reduce((a, r) => a + r.amount, 0));
  const leftOver = base === null ? null : round2(base - total - spentElse - (cf.taxSetAside.total.value ?? 0));
  const out = t.out(base ? round2(total / base * 10000) / 10000 : null);
  return { rows, total, totalShare: out.value, everythingElse: spentElse, leftOver, base: { amount: base, takeHome, pretax, label: pretax > 0 ? 'take-home plus pre-tax retirement' : 'take-home' }, housingReference: ref, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}

// ---------------------------------------------------------------- the fixed floor (L018)
// Every fixed commitment a month (lines marked fixed, plus minimums), the runway
// on cash at that floor, and what the day-by-day run says if income stopped.
export function fixedFloor(spine, rules, s, sim, { months = null, asOf = spine.meta.asOf } = {}) {
  const year = +asOf.slice(0, 4);
  const t = tracker();
  const cf = s.cashflow;
  const fixed = cf.expenses.items.filter((i) => i.fixed === true && !i.covered);
  const anyMissing = fixed.some((i) => i.amount === null);
  for (const i of fixed) t.useFact('expenses.' + i.id + '.amount', (spine.expenses.find((x) => x.id === i.id) || {}).amount);
  t.absorb({ ...cf.debtMinimums.total, value: undefined }); t.absorb({ ...s.sheet.cash, value: undefined });
  const floor = anyMissing ? null : round2(fixed.reduce((a, i) => a + i.amount, 0) + (cf.debtMinimums.total.value ?? 0));
  const cash = s.sheet.cash.value;
  const runwayMonths = floor === null || cash === null ? null : floor > 0 ? round2(cash / floor * 10) / 10 : null;
  const shockMonths = months ?? t.rule(rules, 'APP_SHOCK_MONTHS', year);
  const shock = sim ? incomeShock(spine, rules, sim, { months: shockMonths }) : null;
  const out = t.out(floor);
  return { floor, items: fixed.map((i) => ({ id: i.id, label: i.label, amount: i.amount, path: 'expenses.' + i.id + '.amount' })), minimums: cf.debtMinimums.total.value, cash, setAsideNote: s.sheet.setAsideNote, runwayMonths, shock, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
}

// An income shock on the run: every paycheck stops for N months from a date.
export function incomeShock(spine, rules, sim, { from = null, months = null } = {}) {
  const year = +sim.start.slice(0, 4);
  const n = months ?? rules.get('APP_SHOCK_MONTHS', year);
  const r = C.incomeShock(sim.model, { from: from || sim.start, months: n }, { maybeMode: sim.mode, penaltyMonths: rules.get('CARD_PENALTY_MONTHS', year) });
  return { from: r.from, months: r.months, runwayDays: r.runwayDays, firstBad: r.firstBad, low: { date: r.low.date, amount: dollars(r.low.cents) }, atRisk: r.atRisk.map((x) => ({ date: x.date, label: x.label, amount: dollars(x.cents) })), shortfalls: r.shortfalls.length, kind: sim.kind, rules: ['APP_SHOCK_MONTHS'] };
}

// ---------------------------------------------------------------- the outlook (batch 4)
// Many runs with wobble on every amount and day: bad, typical and good cash, the interest range, the share of runs under the floor.
export function outlook(spine, rules, sim, { runs = null, wobble = null } = {}) {
  const year = +sim.start.slice(0, 4);
  const o = C.outlook(sim.model, { runs: runs ?? rules.get('APP_OUTLOOK_RUNS', year), wobble: wobble ?? rules.get('APP_OUTLOOK_WOBBLE', year), maybeMode: sim.mode, penaltyMonths: rules.get('CARD_PENALTY_MONTHS', year) });
  return { runs: o.runs, wobble: o.wobble, low: { bad: dollars(o.low.worst), typical: dollars(o.low.typical), good: dollars(o.low.best) }, end: { bad: dollars(o.end.worst), typical: dollars(o.end.typical), good: dollars(o.end.best) }, interest: { low: dollars(o.interest.low), typical: dollars(o.interest.typical), high: dollars(o.interest.high) }, shareBelowFloor: o.shareBelowFloor, floor: sim.floor.amount, kind: sim.kind, rules: ['APP_OUTLOOK_RUNS', 'APP_OUTLOOK_WOBBLE'] };
}

// ---------------------------------------------------------------- goals and sinking funds (F009)
// Each goal: target, set aside a month, the account it lives in, by when, what is
// there, the month it is reached at the set-aside, and what it costs the FI date.
export function goalsView(spine, rules, s, { asOf = spine.meta.asOf } = {}) {
  const fi = s.fi;
  const F = fi.fiNumber.value, P = s.sheet.invested.value, r = v(spine.assumptions.realReturn);
  const saving = s.cashflow.surplus.value === null ? null : round2(s.cashflow.surplus.value + (s.cashflow.saving.payroll.value ?? 0) + (s.cashflow.saving.afterTax.value ?? 0));
  const yearsNow = F !== null && P !== null && r !== null && saving !== null ? yearsToTarget(P, saving * 12, F, r) : null;
  const rows = (spine.goals || []).filter((g) => g.type !== 'fi').map((g) => {
    const t = tracker();
    const p = 'goals.' + g.id;
    const target = t.useFact(p + '.target', g.target);
    const monthly = g.monthly ? t.useFact(p + '.monthly', g.monthly) : null;
    const acct = g.linkedAccount ? t.useFact(p + '.linkedAccount', g.linkedAccount) : null;
    const held = acct ? v(((spine.accounts || []).find((a) => a.id === acct) || {}).balance) : null;
    if (acct) t.useFact('accounts.' + acct + '.balance', ((spine.accounts || []).find((a) => a.id === acct) || {}).balance);
    const sinking = g.sinkingFund ? t.useFact(p + '.sinkingFund', g.sinkingFund) === true : false;
    const priority = g.priority ? t.useFact(p + '.priority', g.priority) : null;
    const spendOn = g.spendOn ? t.useFact(p + '.spendOn', g.spendOn) : null;
    const repeat = g.repeatYearly ? t.useFact(p + '.repeatYearly', g.repeatYearly) === true : false;
    const toGo = target === null ? null : Math.max(0, round2(target - (held ?? 0)));
    const months = toGo === null ? null : toGo <= 0 ? 0 : monthly ? Math.ceil(toGo / monthly) : null;
    const reached = months === null ? null : sameDayLater(asOf, months);
    const by = g.by || spendOn || null;
    const onTime = by && reached ? reached <= by : null;
    const neededMonthly = by && toGo !== null && toGo > 0 ? round2(toGo / Math.max(1, Math.round(daysBetween(asOf, by) / 30.44))) : null;
    // The FI date cost: the same saving less this goal's set-aside, on the FI engine.
    const yearsWith = monthly && yearsNow !== null && saving !== null ? yearsToTarget(P, Math.max(0, saving - monthly) * 12, F, r) : null;
    const fiCostMonths = yearsWith === null || yearsNow === null ? null : Math.round((yearsWith - yearsNow) * 12);
    const out = t.out(toGo);
    return { id: g.id, label: g.label, type: g.type, path: p + '.target', target, held, toGo, monthly, linkedAccount: acct, sinking, priority, by, spendOn, repeat, months, reached, onTime, neededMonthly, fiCostMonths, kind: out.kind, from: out.from, rough: out.rough, missing: out.missing, rules: out.rules };
  }).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || String(a.by || '9999').localeCompare(String(b.by || '9999')));
  return { rows, yearsToFiNow: yearsNow, setAsideTotal: round2(rows.reduce((a, g) => a + (g.monthly ?? 0), 0)) };
}

// ---------------------------------------------------------------- life events (batch 4)
// A template's items land on the household from a date as rough lines (an income
// stream for money in, an expense for money out), with an end after the count.
export function applyLifeEvent(spine, template, date, { today = spine.meta.asOf } = {}) {
  let income = [...(spine.income || [])], expenses = [...(spine.expenses || [])];
  const stamp = { asOf: today, source: 'life-event:' + template.id, kind: 'rough' };
  const cadence = (c) => ({ once: 'once', month: 'monthly', biweekly: 'biweekly', weekly: 'weekly', year: 'yearly' }[c] || 'monthly');
  const endOf = (start, c, count) => (!count ? null : c === 'biweekly' ? addDays(start, 14 * (count - 1)) : c === 'weekly' ? addDays(start, 7 * (count - 1)) : sameDayLater(start, count - 1));
  const added = [];
  template.items.forEach((it, i) => {
    const start = addDays(date, it.offsetDays || 0);
    const id = 'ev_' + template.id.replace(/-/g, '_') + '_' + (i + 1);
    const amount = round2(it.cents / 100);
    if (it.direction === 'in') {
      income = income.filter((x) => x.id !== id);
      income.push({ id, type: 'other', label: it.label, cadence: cadence(it.cadence), amount: fact(amount, stamp), start, end: endOf(start, it.cadence, it.count), likelihood: it.likelihood !== undefined ? fact(it.likelihood, stamp) : undefined, withholding: { federal: fact(0, stamp), state: fact(0, stamp) }, lifeEvent: template.id });
    } else {
      expenses = expenses.filter((x) => x.id !== id);
      expenses.push({ id, label: it.label, cadence: cadence(it.cadence), amount: fact(amount, stamp), fat: null, fixed: null, need: fact(null, { asOf: today, source: stamp.source }), start, end: endOf(start, it.cadence, it.count), lifeEvent: template.id });
    }
    added.push({ id, label: it.label, direction: it.direction, amount, start });
  });
  return { spine: { ...spine, income, expenses }, added, shockMonths: template.shock ? template.shock.months : null };
}
export function removeLifeEvent(spine, templateId) {
  return { ...spine, income: (spine.income || []).filter((x) => x.lifeEvent !== templateId), expenses: (spine.expenses || []).filter((x) => x.lifeEvent !== templateId) };
}

// ---------------------------------------------------------------- scenarios: a diff between two households
// Every Fact path whose value differs, plus items added or removed.
export function diffSpines(a, b) {
  const flat = (s) => { const out = new Map(); const walk = (node, path) => { if (node && typeof node === 'object') { if ('value' in node && 'kind' in node && 'asOf' in node) { out.set(path, node); return; } if (Array.isArray(node)) { for (const x of node) if (x && x.id !== undefined) walk(x, path + '.' + x.id); else walk(x, path); } else for (const [k, x] of Object.entries(node)) if (k !== 'meta') walk(x, path ? path + '.' + k : k); } }; walk(s, ''); return out; };
  const fa = flat(a), fb = flat(b);
  const rows = [];
  for (const [p, fx] of fb) { const fy = fa.get(p); if (!fy) rows.push({ path: p, change: 'added', before: null, after: fx.value }); else if (JSON.stringify(fy.value) !== JSON.stringify(fx.value) || fy.kind !== fx.kind) rows.push({ path: p, change: 'changed', before: fy.value, after: fx.value, kindBefore: fy.kind, kindAfter: fx.kind }); }
  for (const [p, fy] of fa) if (!fb.has(p)) rows.push({ path: p, change: 'removed', before: fy.value, after: null });
  return rows.sort((x, y) => x.path.localeCompare(y.path));
}

// ---------------------------------------------------------------- export and import (F018)
export const EXPORT_FORMAT = 'slam-export/1';
export function exportJson(spine, { exportedAt = null } = {}) {
  return JSON.stringify({ format: EXPORT_FORMAT, exportedAt: exportedAt || spine.meta.asOf, schema: spine.schema, spine }, null, 2);
}
// Reads a file of our own export, or a bare spine; upgrades it; validates it. Never applies by itself.
export function importJson(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('Not a JSON file.'); }
  const body = raw && raw.format === EXPORT_FORMAT ? raw.spine : raw;
  if (!body || body.schema !== 'slam-spine/1') throw new Error('Not a SLAM household file: this file is something else, so nothing was read.');
  const up = upgradeSpine(body);
  const check = validate(up);
  if (!check.ok) throw new Error('The file does not validate: ' + check.errors[0].path + ' ' + check.errors[0].message);
  return { spine: up, exportedAt: raw.exportedAt || null, migrated: JSON.stringify(up) !== JSON.stringify(body) };
}
const csvCell = (x) => { const s = x === null || x === undefined ? '' : String(x); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function exportCsv(spine, what = 'log') {
  if (what === 'log') return ['date,kind,amount,tag,line,merchant,note,paidWith,source', ...(spine.log || []).map((e) => [e.date, e.kind, e.amount, e.tag || '', e.expenseId ? ((spine.expenses || []).find((x) => x.id === e.expenseId) || {}).label || e.expenseId : '', e.merchant || '', e.note || '', e.paidWith || '', e.source].map(csvCell).join(','))].join('\n') + '\n';
  if (what === 'lines') return [['collection', 'id', 'label', 'type', 'amount', 'cadence', 'kind'], ...(spine.expenses || []).map((e) => ['expenses', e.id, e.label, e.fat || '', v(e.amount), e.cadence, e.amount ? e.amount.kind : 'missing']), ...(spine.income || []).map((s) => ['income', s.id, s.label, s.type, v(s.amount), s.cadence, s.amount ? s.amount.kind : 'missing']), ...(spine.debts || []).map((d) => ['debts', d.id, v(d.name), d.type, v(d.balance), '', d.balance ? d.balance.kind : 'missing']), ...(spine.accounts || []).map((a) => ['accounts', a.id, v(a.name), a.type, v(a.balance), '', a.balance ? a.balance.kind : 'missing'])].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
  throw new Error('Export the log or the lines.');
}

// FOO ghost chips (row 60): the surplus the current rung takes, as a plan event on the last day of each month in the window.
export function fooGhosts(spine, rules, s, months, { sim = null } = {}) {
  const f = fooLadder(spine, rules, s, { sim });
  const cur = f.rungs.find((r) => r.id === f.current) || null;
  if (!cur || !(f.surplus > 0)) return [];
  return months.map((ym) => { const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(); return { id: 'foo:' + ym, kind: 'foo', label: 'Plan: ' + money(Math.min(f.surplus, cur.need)) + ' to ' + cur.label.toLowerCase(), date: ym + '-' + String(last).padStart(2, '0'), amount: Math.round(Math.min(f.surplus, cur.need)), direction: 'out', counted: false, rough: true, note: 'the step your plan puts this month\'s surplus toward (a plan, not a bill)', path: cur.path, plan: true, pills: ['plan'], movable: false, repeats: true }; });
}

// The spine's FAT tags, for the pages that need them.
export { FAT };

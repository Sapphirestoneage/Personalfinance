// What every chart draws (overnight Track C): the numbers behind each chart, figured here from the engines the screens
// already read, so a chart never figures money of its own (ui/chart.js only places marks) and a chart's number is the
// same number its screen shows. Each builder is pure: the household and rules in, plain rows out. "rough" on a row means
// a guessed or missing input sits under it; the chart draws it hatched or dashed.

import { valueOf as v, round2, monthKey, addMonths, ageOn } from './spine.js';
import { FAMILIES } from './schema.js';
import { payoffPlan } from './debt.js';
import { project } from './projection.js';
import { yearsToTarget } from './fi.js';
import { budgetView } from './budget.js';
import { statusRuleId } from './rules.js';
import { withScenario, SCENARIO_WORDS } from './scenarios.js';

const roughOf = (r) => !!r && (r.kind === 'rough' || r.kind === 'incomplete' || r.kind === 'missing');

// ---------------------------------------------------------------- My numbers
// Net worth as a waterfall: each kind of thing owned adds, each kind of debt takes away, and the last bar is net worth
// (the balance sheet's own total, so it agrees with every screen). [{ label, v, total?, rough }].
export function netWorthSteps(sheet, spine) {
  const steps = [];
  const order = ['cash', 'fixedTerm', 'employerRetirement', 'ira', 'hsaFsa', 'taxable', 'education', 'otherAssets'];
  const fams = Object.keys(sheet.byFamily || {}).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
  for (const f of fams) { const r = sheet.byFamily[f]; if (r && r.value) steps.push({ label: (FAMILIES[f] && FAMILIES[f].label) || 'Other things you own', v: r.value, rough: roughOf(r) }); }
  if (sheet.owed) steps.push({ label: 'Owed to you', v: sheet.owed, rough: false });
  const cards = sheet.cards.value || 0, loans = round2((sheet.debts.value || 0) - cards);
  if (cards) steps.push({ label: 'Cards', v: -cards, rough: roughOf(sheet.cards) });
  if (loans) steps.push({ label: 'Loans', v: -loans, rough: roughOf(sheet.debts) });
  // Anything the families do not cover (an account with no family) closes the gap, so the bars end at net worth.
  const sum = round2(steps.reduce((a, x) => a + x.v, 0));
  if (sheet.netWorth.value !== null && Math.abs(sum - sheet.netWorth.value) >= 1) steps.splice(steps.length - (cards ? 1 : 0) - (loans ? 1 : 0), 0, { label: 'Other things you own', v: round2(sheet.netWorth.value - sum), rough: true });
  steps.push({ label: 'Net worth', v: sheet.netWorth.value, total: true, rough: roughOf(sheet.netWorth) });
  return steps;
}

// Net worth over time: the points kept so far (a date and a value each, newest last) and the projection's months ahead,
// cut to the range picked ('1y', '5y', 'all'). Past points are known; the months ahead are a projection, so rough.
// { past: [[t, value]], ahead: [[t, value]], enough } with t in years (2026.5 is about July 2026).
const tOf = (iso) => +iso.slice(0, 4) + (+iso.slice(5, 7) - 1) / 12 + (iso.length > 7 ? (+iso.slice(8, 10) - 1) / 365 : 0);
export function netWorthPath(points, months, { asOf, range = '1y' } = {}) {
  const now = tOf(asOf), span = range === '1y' ? 1 : range === '5y' ? 5 : 30;
  const past = (points || []).filter((p) => p && typeof p.value === 'number' && tOf(p.date) >= now - span && p.date <= asOf).map((p) => [round2(tOf(p.date)), p.value]);
  const ahead = (months || []).filter((m) => tOf(m.ym) <= now + span).map((m) => [round2(tOf(m.ym)), m.netWorth]);
  return { past, ahead, enough: past.length >= 2 };
}
// Keep one point a day: today's net worth replaces an earlier one of the same day. Points stay in date order.
export function addNetWorthPoint(points, date, value) {
  if (value === null || value === undefined) return points || [];
  const rest = (points || []).filter((p) => p.date !== date);
  return [...rest, { date, value: round2(value) }].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-400);
}

// ---------------------------------------------------------------- Income
// A paycheck as a waterfall, from the money flow's own links (engine/flow.js): what one income stream pays, less taxes
// withheld, less saving taken out of pay, landing as take-home in its account. [{ label, v, total?, rough }].
export function paycheckSteps(flow, streamId) {
  const from = 'in:' + streamId;
  const out = flow.links.filter((l) => l.from === from);
  if (!out.length) return [];
  const node = (id) => flow.nodes.find((n) => n.id === id) || { label: id };
  const gross = round2(out.reduce((a, l) => a + l.amount, 0));
  const steps = [{ label: 'Pay before tax', v: gross, total: true }];
  let home = 0, rough = false;
  for (const l of out) {
    if (l.to.startsWith('acct:')) { home += l.amount; rough = rough || l.rough; continue; }
    steps.push({ label: l.to === 'tax:withheld' ? 'Taxes taken out' : node(l.to).label, v: -l.amount, rough: l.rough });
  }
  steps.push({ label: 'Lands in your account', v: round2(home), total: true, rough, share: gross ? round2(home / gross) : null });
  return steps;
}
// The month's money as a waterfall (the One-pager's flow table): everything in, each place it goes, what is left.
export function monthSteps(table) {
  const ins = table.filter((r) => r.side === 'in'), outs = table.filter((r) => r.side === 'out');
  const total = round2(ins.reduce((a, r) => a + r.amount, 0));
  const left = outs.find((r) => /left/i.test(r.label));
  return [{ label: 'Coming in', v: total, total: true, rough: ins.some((r) => r.rough) },
    ...outs.filter((r) => r !== left).map((r) => ({ label: r.label, v: -r.amount, rough: r.rough })),
    { label: left ? left.label : 'Left', v: round2(total - outs.filter((r) => r !== left).reduce((a, r) => a + r.amount, 0)), total: true, rough: left ? left.rough : false }];
}

// ---------------------------------------------------------------- Budget
// Plan against spent for each section of the Budget view: { rows: [{ key, label, plan, actual, diff, over }], ym }.
export function budgetRows(view) {
  return { ym: view.ym, partial: view.partial, rows: view.cats.map((c) => ({ key: c.key, label: c.label, plan: c.plan, actual: c.actual, diff: c.diff, over: c.diff > 0 })) };
}
// Each line's plan for the treemap: [{ key, label, cat, v }], biggest first.
export function planShares(view) {
  return view.cats.flatMap((c) => c.lines.map((l) => ({ key: l.id, label: l.label, cat: c.key, catLabel: c.label, v: l.plan || 0 }))).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
}
// What was spent each day of a month (the log's spending, not income): [{ date, v, n }].
export function spendByDay(spine, ym) {
  const by = new Map();
  for (const e of spine.log || []) {
    if (e.kind !== 'spend' || !e.date || e.date.slice(0, 7) !== ym) continue;
    const x = by.get(e.date) || { date: e.date, v: 0, n: 0 };
    x.v = round2(x.v + (e.amount || 0)); x.n++;
    by.set(e.date, x);
  }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
// Spent by section, month by month, for the months given (the Budget view's own actuals, one month at a time).
export function monthlySpent(spine, rules, yms) {
  return yms.map((ym) => { const b = budgetView(spine, rules, { ym }); return { ym, cats: b.cats.map((c) => ({ key: c.key, label: c.label, v: c.actual || 0 })), plan: b.plannedSpend, logged: b.anyLogged }; });
}
// The months before and including ym, oldest first.
export const monthsBack = (ym, n) => Array.from({ length: n }, (_, i) => addMonths(ym, i - n + 1));

// ---------------------------------------------------------------- Debt
// Each debt's balance month by month on one method, stacked to zero: { months: [ym], debts: [{ id, name, points }],
// interest, principal by year }.
export function debtPath(spine, rules, { strategy = 'avalanche', extra = 0, asOf = spine.meta.asOf } = {}) {
  const p = payoffPlan(spine, rules, { strategy, extra, asOf, trace: true, maxMonths: 360 });
  const ids = p.debts.map((d) => d.id);
  const start = Object.fromEntries((spine.debts || []).map((d) => [d.id, v(d.balance) ?? 0]));
  const months = [monthKey(asOf), ...p.schedule.map((r) => r.ym)];
  const debts = ids.map((id) => ({ id, name: (p.debts.find((d) => d.id === id) || {}).name || id, points: [start[id] ?? 0, ...p.schedule.map((r) => r.balances[id] ?? 0)] }));
  // Stacked: each debt's line sits on the ones before it, for the area chart.
  let run = months.map(() => 0);
  for (const d of debts) { run = run.map((x, j) => round2(x + d.points[j])); d.stacked = run; }
  const years = new Map();
  for (const r of p.schedule) { const y = +r.ym.slice(0, 4), x = years.get(y) || { year: y, interest: 0, principal: 0, paid: 0 }; x.interest = round2(x.interest + r.interest); x.principal = round2(x.principal + r.paid - r.interest); x.paid = round2(x.paid + r.paid); years.set(y, x); }
  return { strategy, months, debts, byYear: [...years.values()], debtFreeYm: p.debtFreeYm, totalInterest: p.totalInterest.value, neverPaysOff: p.neverPaysOff, rough: roughOf(p.totalInterest) };
}
export const METHOD_WORDS = { avalanche: 'Highest rate first', snowball: 'Smallest balance first', stress: 'Most stressful first' };
// The three methods side by side: each one's total owed month by month, debt-free month, interest, and first debt
// cleared. { methods: [{ id, words, months, totals, debtFreeYm, interest, first: { name, ym } }] }.
// Most stressful first only when some debt has a stress score (without one it is the same as highest rate first).
export function methodPaths(spine, rules, { extra = 0, asOf = spine.meta.asOf } = {}) {
  const scored = (spine.debts || []).some((d) => v(d.stress) !== null && v(d.stress) !== undefined);
  return Object.keys(METHOD_WORDS).filter((id) => id !== 'stress' || scored).map((id) => {
    const p = payoffPlan(spine, rules, { strategy: id, extra, asOf, trace: true, maxMonths: 360 });
    const startTotal = round2((spine.debts || []).reduce((a, d) => a + (v(d.balance) ?? 0), 0));
    const first = p.debts.filter((d) => d.payoffYm).sort((a, b) => (a.payoffYm < b.payoffYm ? -1 : a.payoffYm > b.payoffYm ? 1 : 0))[0] || null;
    return { id, words: METHOD_WORDS[id], months: [monthKey(asOf), ...p.schedule.map((r) => r.ym)], totals: [startTotal, ...p.schedule.map((r) => round2(Object.values(r.balances).reduce((a, x) => a + x, 0)))], debtFreeYm: p.debtFreeYm, interest: p.totalInterest.value, neverPaysOff: p.neverPaysOff, first: first ? { name: first.name, ym: first.payoffYm } : null, order: p.order };
  });
}

// ---------------------------------------------------------------- Plan and FI
// Invested money year by year (the projection the FI year comes from, with the surplus invested) against the FI
// numbers: lean, standard, fat as flat lines and coast as a curve rising to the FI number at the coast age.
export function fiPath(spine, rules, s, { years = 40 } = {}) {
  const asOf = s.asOf, y0 = +asOf.slice(0, 4), fi = s.fi, F = fi.fiNumber.value, r = v(spine.assumptions.realReturn);
  const p = project(spine, rules, { asOf, mode: 'expected', investSurplus: true, endYm: (y0 + years) + '-12' });
  const invested = [[y0, s.sheet.invested.value], ...p.years.filter((x) => x.year > y0 && x.year <= y0 + years).map((x) => [x.year, x.invested])].filter((x) => typeof x[1] === 'number');
  const person = (spine.household.people || [])[0] || {};
  const birth = v(person.birthDate), age = birth ? ageOn(birth, asOf) : null;
  const coast = F && r !== null && age !== null ? invested.map(([y]) => [y, round2(F / Math.pow(1 + r, Math.max(0, fi.coastAge - (age + y - y0))))]).filter(([y]) => age + y - y0 <= fi.coastAge) : [];
  const crossed = F ? invested.find(([, x]) => x >= F) : null;
  // Shown to a few years past the crossing (the line keeps climbing; the question is when it crosses).
  const stop = crossed ? crossed[0] + Math.max(5, Math.round((crossed[0] - y0) * 0.25)) : Infinity;
  return { invested: invested.filter(([y]) => y <= stop), lines: { lean: fi.leanFi.value, standard: F, fat: fi.fatFi.value }, coast: coast.filter(([y]) => y <= stop), coastAge: fi.coastAge, crossYear: crossed ? crossed[0] : null, rough: true, yearsToFi: fi.yearsToFi.value };
}
// Years to FI at each savings rate (of gross, the Plan's "what it takes" math: steady saving, the real return assumed),
// with you are here and the rate the target age needs. { points: [[rate, years]], here: { rate, years }, target }.
export function savingsCurve(sv) {
  const F = sv.fiNumber, P = sv.invested, r = sv.realReturn, gross = sv.grossNow;
  if (!F || P === null || r === null || !gross) return null;
  const points = [];
  for (let rate = 0.05; rate <= 0.705; rate += 0.025) { const y = yearsToTarget(P, rate * gross * 12, F, r); if (y !== null && y <= 60) points.push([round2(rate), round2(y)]); }
  const row = sv.rows.find((x) => x.id === 'savingsRate');
  const here = { rate: row ? row.now : null, years: sv.yearsNow === null ? null : Math.round(sv.yearsNow * 10) / 10 };
  const target = row && row.value !== null && row.value >= 0.005 ? { rate: row.value, years: sv.years, age: sv.targetAge } : null;
  return { points, here, target };
}

// ---------------------------------------------------------------- Taxes
// The federal brackets as one bar, each band's width its size, with taxable income marked: { bands: [{ from, to, rate,
// filled }], taxable, marginal, top }. The last band is shown up to a bit past taxable income.
export function bracketBar(tax, rules) {
  const fs = tax.inputs.filingStatus || 'single', year = tax.year;
  const list = rules.get(statusRuleId('FED_BRK', fs), year) || [];
  const taxable = tax.lines.taxable.value;
  if (taxable === null || taxable === undefined || !list.length) return null;
  const bands = [];
  let from = 0;
  for (const [top, rate] of list) {
    const to = top === null || top === undefined || !Number.isFinite(top) ? null : top;
    bands.push({ from, to, rate, filled: round2(Math.max(0, Math.min(taxable, to ?? Infinity) - from)) });
    if (to === null || to > taxable * 1.25) break;
    from = to;
  }
  const last = bands[bands.length - 1];
  const top = Math.max(taxable * 1.15, last.to ?? taxable * 1.15, bands.length > 1 ? bands[bands.length - 2].to : 0);
  if (last.to === null || last.to > top) last.to = round2(top);
  return { bands, taxable, top: last.to, marginal: tax.lines.marginalFederal.value, rough: roughOf(tax.lines.taxable) };
}

// ---------------------------------------------------------------- Scenarios
// Net worth a year ahead for each assumption set and each saved scenario: [{ id, words, points: [[year, value]] }].
export function scenarioLines(spine, rules, { years = 30, saved = [] } = {}) {
  const asOf = spine.meta.asOf, y0 = +asOf.slice(0, 4), endYm = (y0 + years) + '-12';
  // The surplus invested, as the FI chart reads it (round 2: two charts of one future agree).
  const run = (sp) => project(sp, rules, { asOf, mode: 'expected', endYm, investSurplus: true }).years.filter((x) => x.year <= y0 + years).map((x) => [x.year, x.netWorth]);
  const out = ['worst', 'likely', 'optimistic'].map((id) => ({ id, words: SCENARIO_WORDS[id] + ' returns', points: run(withScenario(spine, rules, id)) }));
  for (const x of saved.slice(0, 2)) out.push({ id: 'saved:' + x.id, words: 'Saved: ' + x.name, points: run({ ...x.spine, meta: { ...x.spine.meta, asOf } }) });
  return out;
}

// ---------------------------------------------------------------- Goals
// Each goal as a progress bar: what is held of the target, the month it is reached at the pace set, and the date set.
export function goalBars(gv) {
  return gv.rows.filter((g) => g.target).map((g) => ({ id: g.id, label: g.label, path: g.path, target: g.target, held: g.held ?? 0, share: g.target ? Math.min(1, (g.held ?? 0) / g.target) : 0, reached: g.reached, by: g.by, onTime: g.onTime, rough: roughOf(g) }));
}

// The projection's months ahead, for net worth over time and Today's sparkline: [{ ym, netWorth }].
export function netWorthAhead(spine, rules, { years = 5 } = {}) {
  const asOf = spine.meta.asOf, endYm = (+asOf.slice(0, 4) + years) + asOf.slice(4, 7);
  return project(spine, rules, { asOf, mode: 'expected', endYm }).months.map((m) => ({ ym: m.ym, netWorth: m.netWorth }));
}

// The app's pick between the two orders the plan can run (overnight Track E): highest rate first, unless smallest
// balance first costs no more than the "too small to matter" amount in interest and clears its first debt at least a
// month sooner (a quick win for about the same money). { id, words }.
export function recommendOrder(methods, { materiality = 100 } = {}) {
  const a = methods.find((x) => x.id === 'avalanche'), sb = methods.find((x) => x.id === 'snowball');
  if (!a || !sb) return null;
  if (a.neverPaysOff && sb.neverPaysOff) return { id: 'avalanche', words: 'Neither order pays it all off at this pace; highest rate first costs the least while you work on it.' };
  if (sb.neverPaysOff) return { id: 'avalanche', words: 'Smallest balance first never pays it all off at this pace.' };
  const more = round2((sb.interest ?? 0) - (a.interest ?? 0));
  const sooner = a.first && sb.first ? monthsBetween(sb.first.ym, a.first.ym) : 0;
  if (more <= materiality && sooner >= 1) return { id: 'snowball', words: 'Smallest balance first clears ' + sb.first.name + ' ' + sooner + (sooner === 1 ? ' month' : ' months') + ' sooner for ' + (more <= 0 ? 'no more interest' : 'only $' + Math.round(more).toLocaleString('en-US') + ' more interest') + ': a quick win for about the same money.' };
  if (more >= 1) return { id: 'avalanche', words: 'Highest rate first saves $' + Math.round(more).toLocaleString('en-US') + ' in interest.' };
  return { id: 'avalanche', words: 'Both orders cost the same and finish the same month; highest rate first is the default.' };
}
// Months from one year-month to a later one (negative when it is earlier).
const monthsBetween = (from, to) => (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7));

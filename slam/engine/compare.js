// Estimated vs actual (S-207, R004): the plan from the spine (the cash flow
// month by month) against what the log says happened, per line and per tag,
// over a window of months ending with the as-of month; income planned against
// income logged; the savings rate from the real ledger. The log is a record;
// a month with nothing logged is said so, never read as zero spending.

import { valueOf as v, tracker, round2, monthKey, addMonths } from './spine.js';
import { cashflow } from './cashflow.js';
import { FAT } from './schema.js';
import { TAG_WORDS } from './spending.js';

const TAGS = [...FAT, 'other'];
const tagOfEntry = (spine, e) => { if (e.tag) return e.tag; const x = e.expenseId ? (spine.expenses || []).find((y) => y.id === e.expenseId) : null; return x ? x.fat || 'other' : 'other'; };

export function estimatedVsActual(spine, rules, { months = 1, asOf = spine.meta.asOf } = {}) {
  const t = tracker();
  const last = monthKey(asOf);
  const yms = Array.from({ length: Math.max(1, months) }, (_, i) => addMonths(last, i - (Math.max(1, months) - 1)));
  const log = (spine.log || []).filter((e) => yms.includes(e.date.slice(0, 7)));
  const logged = new Set(log.map((e) => e.date.slice(0, 7)));
  const lines = new Map();
  const tags = Object.fromEntries(TAGS.map((tag) => [tag, { tag, label: TAG_WORDS[tag], planned: 0, actual: 0, unassigned: 0, missing: false }]));
  let incomePlanned = 0, incomeMissing = false, spendPlanned = 0;
  const taxCache = new Map();
  for (const ym of yms) {
    const cf = cashflow(spine, rules, ym, { mode: 'expected', taxCache });
    t.absorb({ ...cf.expenses.total, value: undefined }); t.absorb({ ...cf.income.takeHome, value: undefined });
    if (cf.income.takeHome.value === null) incomeMissing = true; else incomePlanned = round2(incomePlanned + cf.income.takeHome.value);
    for (const i of cf.expenses.items) {
      if (i.covered) continue;
      const tag = i.fat || 'other';
      const row = lines.get(i.id) || { id: i.id, label: i.label, tag, path: 'expenses.' + i.id + '.amount', planned: 0, actual: 0, entries: 0, missing: false };
      if (i.amount === null) { row.missing = true; tags[tag].missing = true; } else { row.planned = round2(row.planned + i.amount); tags[tag].planned = round2(tags[tag].planned + i.amount); spendPlanned = round2(spendPlanned + i.amount); }
      lines.set(i.id, row);
    }
  }
  let incomeActual = 0, spendActual = 0, incomeEntries = 0;
  for (const e of log) {
    if (e.kind === 'income') { incomeActual = round2(incomeActual + e.amount); incomeEntries++; continue; }
    const signed = e.kind === 'refund' ? -e.amount : e.amount;
    spendActual = round2(spendActual + signed);
    const tag = tagOfEntry(spine, e);
    tags[tag].actual = round2(tags[tag].actual + signed);
    const row = e.expenseId ? lines.get(e.expenseId) : null;
    if (row) { row.actual = round2(row.actual + signed); row.entries++; } else tags[tag].unassigned = round2(tags[tag].unassigned + signed);
  }
  const lineRows = [...lines.values()].map((r) => ({ ...r, diff: r.missing ? null : round2(r.actual - r.planned), kind: r.missing ? 'missing' : 'computed' })).sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0));
  const tagRows = TAGS.map((tag) => { const r = tags[tag]; return { ...r, diff: r.missing ? null : round2(r.actual - r.planned), kind: r.missing ? 'missing' : 'computed' }; });
  const spendMissing = lineRows.some((r) => r.missing);
  // The savings rate from the real ledger: income logged less spending logged, over income logged.
  const realRate = incomeEntries && incomeActual > 0 ? Math.round((incomeActual - spendActual) / incomeActual * 10000) / 10000 : null;
  const planRate = incomePlanned > 0 && !incomeMissing && !spendMissing ? Math.round((incomePlanned - spendPlanned) / incomePlanned * 10000) / 10000 : null;
  const out = t.out(spendMissing ? null : round2(spendActual - spendPlanned));
  return {
    from: yms[0], to: last, months: yms, monthsLogged: yms.filter((ym) => logged.has(ym)), monthsSilent: yms.filter((ym) => !logged.has(ym)),
    lines: lineRows, tags: tagRows,
    spend: { planned: spendMissing ? null : spendPlanned, actual: spendActual, diff: out.value, entries: log.filter((e) => e.kind !== 'income').length },
    income: { planned: incomeMissing ? null : incomePlanned, actual: incomeEntries ? incomeActual : null, entries: incomeEntries, diff: incomeMissing || !incomeEntries ? null : round2(incomeActual - incomePlanned) },
    savingsRate: { real: realRate, plan: planRate, note: !incomeEntries ? 'No income logged in the window, so no real savings rate yet; log a paycheck when it lands.' : null },
    kind: out.kind, from_: out.from, rough: out.rough, missing: out.missing, rules: out.rules
  };
}

// So far and expected by month end (S-209, the Budget's S-128 open-month reading on the spine):
//   so far   = income logged this month up to today - spending logged this month up to today (less refunds)
//   expected = so far + paychecks still to come this month - bills and loan payments still to come from cash
//              - what is left of each spread line's plan (its month less what is logged to it, never below 0)
// "Still to come" is the one day-by-day run after today; a card payment is left out (the charges were
// spending when they were logged), and so are saving transfers. A month with nothing logged is said so.
export function monthOutlook(spine, rules, sim, { asOf = spine.meta.asOf, today = asOf } = {}) {
  const ym = monthKey(today);
  const t = tracker();
  const month = (spine.log || []).filter((e) => e.date.slice(0, 7) === ym);
  const log = month.filter((e) => e.date <= today);
  const incomeSoFar = round2(log.filter((e) => e.kind === 'income').reduce((a, e) => a + e.amount, 0));
  const spentSoFar = round2(log.filter((e) => e.kind !== 'income').reduce((a, e) => a + (e.kind === 'refund' ? -e.amount : e.amount), 0));
  const soFar = round2(incomeSoFar - spentSoFar);
  // From the as-of day on: the as-of balance does not hold that day's items yet (the run moves them on day 0).
  const later = sim.daily.filter((d) => d.date >= asOf && d.date.slice(0, 7) === ym);
  // A bill charged to a card still counts: it is spending this month when it is logged. Card payments
  // and card interest are not in this list (the charges were the spending).
  const run = later.flatMap((d) => d.events.filter((e) => (e.kind === 'income' || ['bill', 'loan-payment', 'paylater'].includes(e.kind)) && e.amount).map((e) => ({ date: d.date, label: e.label, kind: e.kind, amount: e.amount, card: e.card || null })));
  // A payment the floor held back is still owed this month: its unpaid part goes back with it.
  for (const s of sim.shortfalls || []) {
    if (s.date < asOf || s.date.slice(0, 7) !== ym || !['bill', 'loan-payment', 'paylater'].includes(s.kind)) continue;
    const same = run.find((r) => r.date === s.date && r.label === s.label && r.kind === s.kind);
    if (same) same.amount = round2(same.amount - s.amount); else run.push({ date: s.date, label: s.label, kind: s.kind, amount: round2(-s.amount), card: null });
  }
  // What the log put in the run and is already in so far (the run's own claims, engine/cashsim.js logIntoRun):
  // a paycheck or bill logged as happened, or claimed by a typed entry, and typed income. Not still to come.
  const fromLog = [...(sim.claims || []).filter((c) => c.inRun), ...(sim.fromLog || []).filter((x) => x.kind === 'income')].filter((x) => x.date <= today);
  const taken = new Set();
  for (const c of fromLog) {
    const i = run.findIndex((r, n) => !taken.has(n) && r.label === c.label && r.date === c.date);
    if (i >= 0) taken.add(i);
  }
  const items = run.filter((r, n) => !taken.has(n));
  const claimed = run.filter((r, n) => taken.has(n));
  const paychecks = round2(items.filter((i) => i.amount > 0).reduce((a, i) => a + i.amount, 0));
  const bills = round2(items.filter((i) => i.amount < 0).reduce((a, i) => a - i.amount, 0));
  // What is left of the spread lines (expenses with no day), per tag as the Budget's category bars had it:
  // the tag's spread plan for the month, less what is logged in that tag up to today, never below zero.
  // An entry on a dated bill line is that bill, not everyday spending, so it never eats the spread.
  const cf = sim.cf;
  t.absorb({ ...cf.expenses.total, value: undefined });
  const spreadIds = new Set(sim.model.bills.filter((b) => b.cadence === 'spread').map((b) => String(b.id).split(':')[0]));
  // A line the run had to leave out (no amount, no share, no pay date) makes month end unknown, never a smaller number.
  const gaps = (sim.needs || []).filter((n) => n.path && !n.path.startsWith('accounts.'));
  for (const g of gaps) t.addMissing(g.path);
  const gapIds = new Set(gaps.filter((g) => g.path.startsWith('expenses.')).map((g) => g.path.split('.')[1]));
  const spreadLines = cf.expenses.items.filter((i) => (spreadIds.has(i.id) || gapIds.has(i.id)) && !i.covered);
  const rest = TAGS.map((tag) => {
    const its = spreadLines.filter((i) => (i.fat || 'other') === tag);
    if (!its.length) return null;
    const plan = its.some((i) => i.amount === null || gapIds.has(i.id)) ? null : round2(its.reduce((a, i) => a + i.amount, 0));
    const logged = round2(log.filter((e) => e.kind !== 'income' && tagOfEntry(spine, e) === tag && (!e.expenseId || spreadIds.has(e.expenseId))).reduce((a, e) => a + (e.kind === 'refund' ? -e.amount : e.amount), 0));
    return { id: tag, label: TAG_WORDS[tag], lines: its.map((i) => i.label), plan, logged, left: plan === null ? null : Math.max(0, round2(plan - logged)), path: 'expenses.' + (its.find((i) => i.amount === null || gapIds.has(i.id)) || its[0]).id + '.amount' };
  }).filter(Boolean);
  // No checking balance: the run cannot take bills from checking, so what is still to come is not known (empty is not zero).
  const noChecking = !!(sim.checking && !sim.checking.known);
  if (noChecking && sim.checking.path) t.addMissing(sim.checking.path);
  const anyMissing = noChecking || gaps.length > 0 || rest.some((r) => r.left === null);
  const planLeft = round2(rest.reduce((a, r) => a + (r.left ?? 0), 0));
  // Incomes the run cannot date are left out of paychecks still to come; ones on a guessed day are in, and named.
  const noPayDate = [...new Set((sim.needs || []).filter((n) => /: first pay date$/.test(n.what)).map((n) => n.what.replace(/: first pay date$/, '')))];
  const guessedPayDay = (spine.income || []).filter((s) => s.cadence !== 'once' && s.cadence !== 'weekly' && s.cadence !== 'biweekly' && (!s.end || s.end >= asOf) && (!s.payDay || s.payDay.kind === 'rough' || v(s.payDay) === null) && !noPayDate.includes(s.label)).map((s) => s.label);
  // The run starts at the as-of balance; once the month has moved on, a check-in is needed before this reads true.
  const stale = monthKey(asOf) !== ym || today < asOf;
  const out = t.out(anyMissing ? null : round2(soFar + paychecks - bills - planLeft));
  return { ym, asOf, today, stale, guessedPayDay, claimed, incomeSoFar, spentSoFar, soFar, logged: log.length, paychecks, bills, planLeft, items, rest, noPayDate, expected: out.value, kind: anyMissing ? 'missing' : sim.kind === 'computed' && out.kind === 'computed' ? 'computed' : 'rough', from: out.from, rough: [...new Set([...(items.length ? (sim.rough || []).filter((x) => !x.startsWith('accounts.')) : []), ...out.rough])], missing: out.missing, rules: out.rules };
}

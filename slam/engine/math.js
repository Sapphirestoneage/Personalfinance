// Show the math (S-177): one registry of every number the app computes, so
// the Dashboard, the Ledger, math.html and the self-audit read the same thing.
//
// A metric: { id, label, unit, screens, formula, op, explain(ctx) }.
//   formula: the formula in plain words.
//   op: how the terms combine: sum (plus and minus terms), ratio (num terms over
//   den terms, times factor), or custom (the metric's own recompute).
//   explain(ctx) -> { value, kind, terms, rules, note? }, ctx = { spine, rules, s }.
// A term: { label, value, unit, kind, role, path? (a Ledger field), metric? (another
//   metric, to drill into), group (DAITE letter, or null for a computed number) }.
// explainMetric(id, ctx) adds the numbers plugged into the formula, the terms grouped
// by DAITE with subtotals, why the number is rough, and a recompute from the terms.

import { getAt, valueOf } from './spine.js';
import { labelFor, groupFor, GROUPS } from './labels.js';
import { INVESTED_FAMILIES } from './schema.js';
import { project } from './projection.js';
import { money } from '../src/ui/format.js';
import { expenseRow } from './ledger.js';
import { monthlyAmount } from './cashflow.js';

const v = valueOf;
export const UNITS = ['usd', 'usd/month', 'usd/year', 'months', 'years', 'ratio', 'age', 'count'];
const kindOf = (spine, path) => { const f = getAt(spine, path); return f && f.kind ? f.kind : 'missing'; };
const field = (spine, path, value, unit, role = 'plus', label = null) => ({ label: label || labelFor(spine, path), value, unit, kind: kindOf(spine, path), role, path, group: groupFor(path) });
const metric = (id, label, r, unit, role = 'plus') => ({ label, value: r ? r.value : null, unit, kind: r ? r.kind : 'missing', role, metric: id, group: null });
const ruleTerm = (rules, id, year, role, label, unit = 'ratio') => ({ label: label + ' (rule ' + id + ')', value: rules.get(id, year), unit, kind: 'known', role, rule: id, group: null });
const out = (r, terms, rules = [], extra = {}) => ({ value: r ? r.value : null, kind: r ? r.kind : 'missing', terms, rules: [...new Set([...(r && r.rules) || [], ...rules])], rough: r ? r.rough || [] : [], missing: r ? r.missing || [] : [], ...extra });

// ---------------------------------------------------------------- the metrics
const M = [];
const def = (m) => { M.push(m); return m; };

def({ id: 'assets', label: 'Total assets', unit: 'usd', op: 'sum', screens: ['dashboard#tile-networth'], formula: 'Total assets = every account and asset balance added up',
  explain: ({ spine, s }) => out(s.sheet.assets, (spine.accounts || []).map((a) => field(spine, 'accounts.' + a.id + '.balance', v(a.balance), 'usd', 'plus', v(a.name) || a.id))) });
def({ id: 'debts', label: 'Total debts', unit: 'usd', op: 'sum', screens: ['dashboard#tile-networth'], formula: 'Total debts = every debt balance added up',
  explain: ({ spine, s }) => out(s.sheet.debts, (spine.debts || []).map((d) => field(spine, 'debts.' + d.id + '.balance', v(d.balance), 'usd', 'plus', v(d.name) || d.id))) });
def({ id: 'netWorth', label: 'Net worth', unit: 'usd', op: 'sum', screens: ['dashboard#tile-networth'], formula: 'Net worth = total assets - total debts',
  explain: ({ s }) => out(s.sheet.netWorth, [metric('assets', 'Total assets', s.sheet.assets, 'usd'), metric('debts', 'Total debts', s.sheet.debts, 'usd', 'minus')]) });
def({ id: 'cash', label: 'Cash', unit: 'usd', op: 'sum', screens: ['dashboard#tile-runway'], formula: 'Cash = checking, savings and other cash accounts added up (the Roth backstop is not cash)',
  explain: ({ spine, s }) => out(s.sheet.cash, (spine.accounts || []).filter((a) => a.family === 'cash').map((a) => field(spine, 'accounts.' + a.id + '.balance', v(a.balance), 'usd', 'plus', v(a.name) || a.id))) });
def({ id: 'invested', label: 'Invested assets', unit: 'usd', op: 'sum', screens: ['dashboard#tile-fi'], formula: 'Invested = retirement, IRA, HSA and taxable investing balances added up',
  explain: ({ spine, s }) => out(s.sheet.invested, (spine.accounts || []).filter((a) => INVESTED_FAMILIES.includes(a.family)).map((a) => field(spine, 'accounts.' + a.id + '.balance', v(a.balance), 'usd', 'plus', v(a.name) || a.id))) });

def({ id: 'gross', label: 'Gross income this month', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-savings'], formula: 'Gross income = each income stream\'s amount for this month (certain income only)',
  explain: ({ spine, s }) => out(s.cashflow.income.gross, s.cashflow.income.streams.filter((x) => x.included).map((x) => field(spine, 'income.' + x.id + '.amount', x.gross, 'usd/month', 'plus', x.label))) });
def({ id: 'takeHome', label: 'Take-home this month', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-surplus'], formula: 'Take-home = gross income - tax withheld - Social Security and Medicare - payroll saving',
  explain: ({ s }) => { const c = s.cashflow; return out(c.income.takeHome, [metric('gross', 'Gross income', c.income.gross, 'usd/month'), { label: 'Tax withheld', value: c.income.withheld.value, unit: 'usd/month', kind: c.income.withheld.kind, role: 'minus', group: 'T' }, { label: 'Social Security and Medicare', value: c.income.fica.value, unit: 'usd/month', kind: c.income.fica.kind, role: 'minus', group: 'T' }, { label: 'Saved from pay before take-home', value: c.saving.payroll.value, unit: 'usd/month', kind: c.saving.payroll.kind, role: 'minus', group: 'A' }]); } });
def({ id: 'expenses', label: 'Spending this month', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-surplus', 'dashboard#tile-fi'], formula: 'Spending = each expense this month (your share of a shared bill; $0 when someone else covers it)',
  explain: ({ spine, s }) => out(s.cashflow.expenses.total, s.cashflow.expenses.items.map((i) => field(spine, 'expenses.' + i.id + '.amount', i.amount, 'usd/month', 'plus', i.label + (i.covered ? ' (covered: $0 to you)' : i.shared ? ' (your share of ' + money(i.full) + ')' : '')))) });
def({ id: 'leanSpending', label: 'Lean spending this month', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-fi'], formula: 'Lean spending = food, housing and transportation that are needs (a want such as eating out is left out)',
  explain: ({ spine, s }) => out(s.cashflow.expenses.lean, s.cashflow.expenses.items.filter((i) => i.fat && i.need !== false && !i.covered).map((i) => field(spine, 'expenses.' + i.id + '.amount', i.amount, 'usd/month', 'plus', i.label))) });
def({ id: 'minimums', label: 'Minimum payments this month', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-surplus', 'dashboard#tile-runway'], formula: 'Minimum payments = each debt\'s minimum this month (a rough default when none is entered)',
  explain: ({ spine, s }) => out(s.cashflow.debtMinimums.total, s.cashflow.debtMinimums.items.map((i) => field(spine, 'debts.' + i.id + '.minimum', i.amount, 'usd/month', 'plus', (i.name || i.id) + (i.estimated ? ' (house default)' : '')))) });
def({ id: 'taxSetAside', label: 'Tax set-aside this month', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-surplus'], formula: 'Tax set-aside = income with no tax withheld x (federal + state marginal rate, + self-employment for 1099) + this year\'s Roth conversion tax spread to the return',
  explain: ({ spine, s }) => out(s.cashflow.taxSetAside.total, s.cashflow.taxSetAside.lines.map((l) => ({ label: l.label + ': ' + money(l.base) + ' x ' + (Math.round(l.rate * 1000) / 10) + '%' + (l.months ? ' / ' + l.months + ' months' : ''), value: l.amount, unit: 'usd/month', kind: kindOf(spine, l.kind === 'income' ? 'income.' + l.id + '.amount' : 'accounts.' + l.id + '.conversions'), role: 'plus', path: l.kind === 'income' ? 'income.' + l.id + '.amount' : 'accounts.' + l.id + '.conversions', group: 'T' }))) });
def({ id: 'surplus', label: 'Monthly surplus', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-surplus'], formula: 'Surplus = take-home - spending - minimum payments - saving from take-home - tax set-aside',
  explain: ({ s }) => { const c = s.cashflow; return out(c.surplus, [metric('takeHome', 'Take-home', c.income.takeHome, 'usd/month'), metric('expenses', 'Spending', c.expenses.total, 'usd/month', 'minus'), metric('minimums', 'Minimum payments', c.debtMinimums.total, 'usd/month', 'minus'), { label: 'Saved from take-home', value: c.saving.afterTax.value, unit: 'usd/month', kind: c.saving.afterTax.kind, role: 'minus', group: 'A' }, metric('taxSetAside', 'Tax set-aside', c.taxSetAside.total, 'usd/month', 'minus')]); } });
def({ id: 'savingsRateGross', label: 'Savings rate (of gross)', unit: 'ratio', op: 'ratio', screens: ['dashboard#tile-savings'], formula: 'Savings rate = (surplus + payroll saving + saving from take-home) / gross income',
  explain: ({ s }) => { const c = s.cashflow; return out(c.savingsRate.gross, [metric('surplus', 'Surplus', c.surplus, 'usd/month', 'num'), { label: 'Payroll saving', value: c.saving.payroll.value, unit: 'usd/month', kind: c.saving.payroll.kind, role: 'num', group: 'A' }, { label: 'Saved from take-home', value: c.saving.afterTax.value, unit: 'usd/month', kind: c.saving.afterTax.kind, role: 'num', group: 'A' }, metric('gross', 'Gross income', c.income.gross, 'usd/month', 'den')]); } });
def({ id: 'savingsRateNet', label: 'Savings rate (of take-home)', unit: 'ratio', op: 'ratio', screens: ['dashboard#tile-savings'], formula: 'Savings rate = (surplus + saving from take-home) / take-home',
  explain: ({ s }) => { const c = s.cashflow; return out(c.savingsRate.net, [metric('surplus', 'Surplus', c.surplus, 'usd/month', 'num'), { label: 'Saved from take-home', value: c.saving.afterTax.value, unit: 'usd/month', kind: c.saving.afterTax.kind, role: 'num', group: 'A' }, metric('takeHome', 'Take-home', c.income.takeHome, 'usd/month', 'den')]); } });

def({ id: 'runway', label: 'Cash runway', unit: 'months', op: 'ratio', screens: ['dashboard#tile-runway', 'flag:runway'], formula: 'Runway = cash / (monthly spending + minimum payments)',
  explain: ({ s }) => out(s.emergency.tiers.full.runway, [metric('cash', 'Cash', s.sheet.cash, 'usd', 'num'), metric('expenses', 'Spending', s.cashflow.expenses.total, 'usd/month', 'den'), metric('minimums', 'Minimum payments', s.cashflow.debtMinimums.total, 'usd/month', 'den')]) });
def({ id: 'runwayFat', label: 'Runway on food, housing and transportation', unit: 'months', op: 'ratio', screens: ['dashboard#tile-runway'], formula: 'FAT runway = cash / (food, housing and transportation spending + minimum payments)',
  explain: ({ s }) => out(s.emergency.tiers.fatOnly.runway, [metric('cash', 'Cash', s.sheet.cash, 'usd', 'num'), { label: 'Food, housing and transportation', value: s.cashflow.expenses.fat.value, unit: 'usd/month', kind: s.cashflow.expenses.fat.kind, role: 'den', group: 'E' }, metric('minimums', 'Minimum payments', s.cashflow.debtMinimums.total, 'usd/month', 'den')]) });
def({ id: 'ruleOf5Months', label: 'Rule of 5 target (months)', unit: 'months', op: 'custom', screens: ['dashboard#tile-runway'], formula: 'Months to keep = age / 5',
  explain: ({ spine, rules, s }) => { const p = spine.household.people[0]; return out(s.emergency.targetMonths, [{ ...field(spine, 'household.people.' + p.id + '.birthDate', s.emergency.age, 'age', 'arg', 'Age today (from ' + labelFor(spine, 'household.people.' + p.id + '.birthDate') + ')') }, ruleTerm(rules, 'APP_RULE_OF_5', +s.asOf.slice(0, 4), 'arg', 'Divide by', 'count')], ['APP_RULE_OF_5']); },
  recompute: (t) => (t[0].value === null ? null : t[0].value / t[1].value) });
def({ id: 'ruleOf5Dollars', label: 'Rule of 5 target (dollars)', unit: 'usd', op: 'custom', screens: ['dashboard#tile-runway', 'flag:runway'], formula: 'Target = months to keep x monthly spending and minimums, rounded up to whole dollars',
  explain: ({ s }) => out(s.emergency.targetDollars, [metric('ruleOf5Months', 'Months to keep', s.emergency.targetMonths, 'months', 'arg'), { label: 'Spending and minimums a month, rounded up', value: s.emergency.monthlyNeed, unit: 'usd/month', kind: s.emergency.tiers.full.burn.kind, role: 'arg', group: null }]),
  recompute: (t) => (t[0].value === null || t[1].value === null ? null : Math.ceil(t[0].value * t[1].value)) });

def({ id: 'cards', label: 'Credit card balances', unit: 'usd', op: 'sum', screens: ['dashboard#tile-cards'], formula: 'Cards = every credit card balance added up',
  explain: ({ spine, s }) => out(s.sheet.cards, (spine.debts || []).filter((d) => d.type === 'credit_card').map((d) => field(spine, 'debts.' + d.id + '.balance', v(d.balance), 'usd', 'plus', v(d.name) || d.id))) });
def({ id: 'promoTotal', label: 'Promo balances due', unit: 'usd', op: 'sum', screens: ['dashboard#tile-cards', 'flag:promo-deadlines'], formula: 'Promo balances = each balance still on a 0% intro rate',
  explain: ({ spine, s }) => out(s.debt.promo.total, s.debt.promo.items.map((x) => field(spine, 'debts.' + x.id + '.balance', x.balance, 'usd', 'plus', x.name))) });
def({ id: 'promoMonthly', label: 'Monthly amount that clears the promos', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-cards', 'flag:promo-deadlines'], formula: 'Monthly to clear the promos = each promo balance / the payments left before its intro ends, added up',
  explain: ({ spine, s }) => out(s.debt.promo.monthly, s.debt.promo.items.map((x) => ({ ...field(spine, 'debts.' + x.id + '.balance', x.monthlyNeeded, 'usd/month', 'plus', x.name + ': ' + money(x.balance) + ' / ' + x.paymentsLeft + ' payments') }))) });
def({ id: 'personalUtil', label: 'Personal card utilization', unit: 'ratio', op: 'ratio', screens: ['dashboard#tile-cards', 'flag:utilization-personal'], formula: 'Personal utilization = balances / limits on the cards that report to personal credit',
  explain: ({ spine, s }) => { const items = s.debt.utilization.items.filter((c) => c.reports === true); return out(s.debt.utilization.personal, [...items.map((c) => field(spine, 'debts.' + c.id + '.balance', c.balance, 'usd', 'num', c.name + ' balance')), ...items.map((c) => field(spine, 'debts.' + c.id + '.limit', c.limit, 'usd', 'den', c.name + ' limit'))]); } });
def({ id: 'overallUtil', label: 'All-card utilization', unit: 'ratio', op: 'ratio', screens: ['dashboard#tile-cards'], formula: 'Overall utilization = balances / limits on every card, business cards included',
  explain: ({ spine, s }) => { const items = s.debt.utilization.items; return out(s.debt.utilization.overall, [...items.map((c) => field(spine, 'debts.' + c.id + '.balance', c.balance, 'usd', 'num', c.name + ' balance')), ...items.map((c) => field(spine, 'debts.' + c.id + '.limit', c.limit, 'usd', 'den', c.name + ' limit'))]); } });

def({ id: 'impliedFi', label: 'FI number from today\'s spending', unit: 'usd', op: 'ratio', factor: 12, screens: ['dashboard#tile-fi', 'flag:fi-goal-gap'], formula: 'FI number from spending = monthly spending x 12 / withdrawal rate',
  explain: ({ spine, s }) => out(s.fi.implied, [metric('expenses', 'Spending a month', s.cashflow.expenses.total, 'usd/month', 'num'), field(spine, 'assumptions.withdrawalRate', v(spine.assumptions.withdrawalRate), 'ratio', 'den', 'Withdrawal rate')]) });
def({ id: 'fiNumber', label: 'FI number', unit: 'usd', op: 'custom', screens: ['dashboard#tile-fi', 'flag:fi-goal-gap'], formula: 'FI number = your FI goal if you set one; else goal spending a year / withdrawal rate; else the FI number from today\'s spending',
  explain: ({ spine, s }) => { const g = (spine.goals || []).find((x) => x.type === 'fi'); const t = s.fi.goalSource === 'direct' ? [field(spine, 'goals.' + g.id + '.fiNumber', s.fi.goal.value, 'usd', 'arg', 'Your FI goal')] : s.fi.goalSource === 'spending' ? [field(spine, 'goals.' + g.id + '.annualSpending', v(g.annualSpending), 'usd/year', 'arg', 'Goal spending a year'), field(spine, 'assumptions.withdrawalRate', v(spine.assumptions.withdrawalRate), 'ratio', 'arg', 'Withdrawal rate')] : [metric('impliedFi', 'FI number from spending', s.fi.implied, 'usd', 'arg')]; return out(s.fi.fiNumber, t); },
  recompute: (t) => (t.length === 2 ? (t[0].value === null || !t[1].value ? null : Math.round(t[0].value / t[1].value * 100) / 100) : t[0].value) });
def({ id: 'fiPercent', label: 'FI percent', unit: 'ratio', op: 'ratio', screens: ['dashboard#tile-fi'], formula: 'FI percent = invested assets / FI number',
  explain: ({ s }) => out(s.fi.fiPercent, [metric('invested', 'Invested', s.sheet.invested, 'usd', 'num'), metric('fiNumber', 'FI number', s.fi.fiNumber, 'usd', 'den')]) });
def({ id: 'leanFi', label: 'Lean FI', unit: 'usd', op: 'ratio', factor: 12, screens: ['dashboard#tile-fi'], formula: 'Lean FI = lean spending a month x 12 / withdrawal rate',
  explain: ({ spine, s }) => out(s.fi.leanFi, [metric('leanSpending', 'Lean spending a month', s.cashflow.expenses.lean, 'usd/month', 'num'), field(spine, 'assumptions.withdrawalRate', v(spine.assumptions.withdrawalRate), 'ratio', 'den', 'Withdrawal rate')]) });
def({ id: 'coastFi', label: 'Coast FI', unit: 'usd', op: 'custom', screens: ['dashboard#tile-fi'], formula: 'Coast FI = FI number / (1 + real return) ^ (coast age - age today)',
  explain: ({ spine, rules, s }) => out(s.fi.coastFi, [metric('fiNumber', 'FI number', s.fi.fiNumber, 'usd', 'arg'), field(spine, 'assumptions.realReturn', v(spine.assumptions.realReturn), 'ratio', 'arg', 'Real return'), { label: 'Coast age', value: s.fi.coastAge, unit: 'age', kind: spine.assumptions.coastAge ? kindOf(spine, 'assumptions.coastAge') : 'rough', role: 'arg', path: spine.assumptions.coastAge ? 'assumptions.coastAge' : null, rule: spine.assumptions.coastAge ? null : 'APP_COAST_AGE', group: 'G' }, { label: 'Age today', value: s.emergency.age, unit: 'age', kind: kindOf(spine, 'household.people.' + spine.household.people[0].id + '.birthDate'), role: 'arg', path: 'household.people.' + spine.household.people[0].id + '.birthDate', group: 'T' }], spine.assumptions.coastAge ? [] : ['APP_COAST_AGE']),
  recompute: (t) => (t.some((x) => x.value === null) ? null : Math.round(t[0].value / Math.pow(1 + t[1].value, Math.max(0, t[2].value - t[3].value)) * 100) / 100) });
def({ id: 'yearsToFi', label: 'Years to FI', unit: 'years', op: 'custom', screens: ['math'], formula: 'Years to FI = months, run month by month (income starting and ending, debts paid off, tax set aside, each month\'s surplus invested), until invested money reaches the FI number',
  explain: ({ s }) => out(s.fi.yearsToFi, [metric('invested', 'Invested today', s.sheet.invested, 'usd', 'arg'), metric('fiNumber', 'FI number', s.fi.fiNumber, 'usd', 'arg')], [], { note: s.fi.yearsToFi.note || null }),
  recompute: (t, ctx) => { if (t[1].value === null) return null; if (t[0].value >= t[1].value) return 0; const p = project(ctx.spine, ctx.rules, { asOf: ctx.s.asOf, mode: 'expected', investSurplus: true, stopAt: t[1].value }); if (!p.reached) return null; const [y, m] = p.reached.split('-').map(Number); const [y0, m0] = ctx.s.asOf.slice(0, 7).split('-').map(Number); return Math.round(((y - y0) * 12 + (m - m0)) / 12 * 10) / 10; } });

def({ id: 'taxBalanceDue', label: 'Tax balance due', unit: 'usd', op: 'sum', blockOnMissing: true, screens: ['dashboard#tile-tax', 'flag:tax'], formula: 'Balance due = federal and state tax for the year - tax withheld - estimated payments made',
  explain: ({ s }) => { const L = s.tax.lines; return out(s.tax.balanceDue, [{ label: 'Tax for the year', value: s.tax.owed.value, unit: 'usd', kind: s.tax.owed.kind, role: 'plus', group: 'T' }, { label: 'Tax withheld', value: s.tax.withheld.value, unit: 'usd', kind: s.tax.withheld.kind, role: 'minus', group: 'T' }, { label: 'Estimated payments made', value: L.estimatedPaid ? L.estimatedPaid.value : null, unit: 'usd', kind: L.estimatedPaid ? L.estimatedPaid.kind : 'missing', role: 'minus', group: 'T' }], [], { note: s.tax.missingText ? s.tax.missingText.charAt(0).toUpperCase() + s.tax.missingText.slice(1) + '.' : null }); } });
def({ id: 'rothBasis', label: 'Roth backstop (contributions)', unit: 'usd', op: 'sum', screens: ['dashboard#tile-runway'], formula: 'Roth backstop = Roth IRA contribution basis (comes out any time with no tax or penalty; never counted as cash)',
  explain: ({ spine, s }) => out(s.emergency.backstop.contributions, (spine.accounts || []).filter((a) => a.type === 'roth_ira' || a.type === 'custodial_roth').filter((a) => a.basis || a.contributions).map((a) => field(spine, 'accounts.' + a.id + (a.basis ? '.basis' : '.contributions'), a.basis ? v(a.basis) : (v(a.contributions) || []).reduce((x, c) => x + c.amount, 0), 'usd', 'plus', (v(a.name) || a.id) + ' contributions'))) });
def({ id: 'cliffCosts', label: 'Costs once certain income stops', unit: 'usd/month', op: 'sum', screens: ['flag:income-cliff'], formula: 'Costs = spending + minimum payments + tax set-aside in the first month certain income is $0',
  explain: ({ s }) => { const c = s.cliff; if (!c) return out(null, []); return out({ value: Math.round(c.costs * 100) / 100, kind: c.spending.kind === 'computed' && c.minimums.kind === 'computed' ? 'computed' : 'rough', rules: [], rough: [], missing: [] }, [{ label: 'Spending', value: c.spending.value, unit: 'usd/month', kind: c.spending.kind, role: 'plus', group: 'E' }, { label: 'Minimum payments', value: c.minimums.value, unit: 'usd/month', kind: c.minimums.kind, role: 'plus', group: 'D' }, { label: 'Tax set-aside', value: c.setAside.value, unit: 'usd/month', kind: c.setAside.kind, role: 'plus', group: 'T' }]); } });

export const METRICS = M;
export const metricById = (id) => M.find((m) => m.id === id) || cardUtilMetric(id) || expenseCostMetric(id);

// One expense's monthly cost to you ("expenseCost:<id>"): the bill a month x your share (S-177).
function expenseCostMetric(id) {
  if (!id || !id.startsWith('expenseCost:')) return null;
  const eid = id.slice(12);
  return { id, label: 'Your cost a month', unit: 'usd/month', op: 'custom', screens: ['ledger'], formula: 'Your cost = the bill a month x your share ($0 when someone else covers it)',
    explain: ({ spine }) => {
      const e = (spine.expenses || []).find((x) => x.id === eid);
      const row = e ? expenseRow(spine, e) : null;
      const val = row && row.fact.value;
      const bill = val && val.amount !== null ? monthlyAmount(val.amount, val.cadence === 'total' || val.cadence === 'once' ? 'monthly' : val.cadence, null, null, '2001-01') : null;
      const share = val ? (val.covered ? 0 : val.shared ? val.share : 1) : null;
      const shareTerm = val && val.covered ? { label: 'Covered by ' + (val.coveredBy || 'someone else'), value: 0, unit: 'ratio', kind: kindOf(spine, 'expenses.' + eid + '.coveredBy'), role: 'arg', path: 'expenses.' + eid + '.amount', group: 'E' }
        : { label: val && val.shared ? 'Your share (' + (val.people || '?') + ' people)' : 'Your share (not shared)', value: share, unit: 'ratio', kind: val && val.shared ? 'known' : 'known', role: 'arg', path: 'expenses.' + eid + '.amount', group: 'E' };
      return out({ value: val ? val.yourMonthly === null ? null : Math.round(val.yourMonthly * 100) / 100 : null, kind: row ? row.fact.kind : 'missing', rules: [], rough: [], missing: [] },
        [field(spine, 'expenses.' + eid + '.amount', bill === null ? null : Math.round(bill * 100) / 100, 'usd/month', 'arg', 'The bill a month'), shareTerm]);
    },
    recompute: (t) => (t[0].value === null || t[1].value === null ? null : Math.round(t[0].value * t[1].value * 100) / 100) };
}

// Per-card utilization, one metric per card ("cardUtil:<id>").
function cardUtilMetric(id) {
  if (!id || !id.startsWith('cardUtil:')) return null;
  const card = id.slice(9);
  return { id, label: 'Card utilization', unit: 'ratio', op: 'ratio', screens: ['flag:utilization-' + card], formula: 'Utilization = balance / credit limit',
    explain: ({ spine, s }) => { const c = s.debt.utilization.items.find((x) => x.id === card); return c ? out(c.util, [field(spine, 'debts.' + card + '.balance', c.balance, 'usd', 'num', c.name + ' balance'), field(spine, 'debts.' + card + '.limit', c.limit, 'usd', 'den', c.name + ' limit')]) : out(null, []); } };
}

// The metric(s) behind each Dashboard tile and flag.
export const DASHBOARD_MATH = {
  'tile-networth': ['netWorth'], 'tile-runway': ['runway', 'runwayFat', 'ruleOf5Dollars', 'rothBasis'], 'tile-surplus': ['surplus'],
  'tile-savings': ['savingsRateGross', 'savingsRateNet'], 'tile-cards': ['cards', 'promoTotal', 'promoMonthly', 'personalUtil', 'overallUtil'],
  'tile-fi': ['fiPercent', 'fiNumber', 'impliedFi', 'leanFi', 'coastFi'], 'tile-tax': ['taxBalanceDue']
};
export function flagMath(flag) {
  const id = flag.id;
  if (id === 'runway') return ['runway', 'ruleOf5Dollars'];
  if (id === 'utilization-personal') return ['personalUtil'];
  if (id.startsWith('utilization-')) return ['cardUtil:' + id.slice(12)];
  if (id === 'promo-deadlines') return ['promoTotal', 'promoMonthly'];
  if (id === 'fi-goal-gap') return ['fiNumber', 'impliedFi'];
  if (id.startsWith('tax-') || id.startsWith('roth-conversion-') || id.startsWith('unemployment-withholding-')) return ['taxBalanceDue', 'taxSetAside'];
  if (id === 'income-cliff') return ['cliffCosts'];
  if (id.startsWith('income-ends-')) return ['gross'];
  if (id === 'input-tax') return ['taxBalanceDue'];
  if (id === 'input-takehome') return ['takeHome'];
  if (id === 'input-surplus') return ['surplus'];
  if (id === 'input-utilization') return ['personalUtil'];
  if (id === 'input-networth') return ['netWorth'];
  if (id === 'input-fi') return ['fiPercent'];
  if (id === 'input-runway') return ['runway'];
  if (id.startsWith('health-26-')) return ['expenses'];
  return [];
}

// ---------------------------------------------------------------- explain, plug in, recompute
const UNIT_FMT = { usd: (x) => money(x, true), 'usd/month': (x) => money(x, true), 'usd/year': (x) => money(x, true), months: (x) => (Math.round(x * 100) / 100) + ' months', years: (x) => (Math.round(x * 10) / 10) + ' years', ratio: (x) => (Math.round(x * 10000) / 100) + '%', age: (x) => String(x), count: (x) => String(x) };
// One number in its unit; a missing one reads "missing", never $0.
export const showNumber = (x, unit) => (x === null || x === undefined ? 'missing' : (UNIT_FMT[unit] || String)(x));

export function recompute(m, terms, ctx) {
  const val = (t) => t.value;
  if (m.op === 'sum') {
    // Nothing known, or a number that is not given while any input is missing: missing, never $0.
    if (!terms.length || terms.every((t) => t.value === null)) return null;
    if (m.blockOnMissing && terms.some((t) => t.value === null)) return null;
    if (terms.some((t) => t.value === null && t.kind === 'missing')) {
      // Built from the rest: missing terms are named, never counted as $0.
      const known = terms.filter((t) => t.value !== null);
      return Math.round(known.reduce((a, t) => a + (t.role === 'minus' ? -1 : 1) * t.value, 0) * 100) / 100;
    }
    return Math.round(terms.reduce((a, t) => a + (t.role === 'minus' ? -1 : 1) * (val(t) ?? 0), 0) * 100) / 100;
  }
  if (m.op === 'ratio') {
    const num = terms.filter((t) => t.role === 'num'), den = terms.filter((t) => t.role === 'den');
    if (num.some((t) => t.value === null) || den.some((t) => t.value === null)) return null;
    const d = den.reduce((a, t) => a + t.value, 0);
    return d ? num.reduce((a, t) => a + t.value, 0) * (m.factor || 1) / d : null;
  }
  return m.recompute ? m.recompute(terms, ctx) : null;
}

function plugged(m, terms, value) {
  const f = (t) => showNumber(t.value, t.unit);
  let left;
  if (m.op === 'sum') left = terms.map((t, i) => (i === 0 ? (t.role === 'minus' ? '- ' : '') : t.role === 'minus' ? ' - ' : ' + ') + f(t)).join('') || '0';
  else if (m.op === 'ratio') {
    const num = terms.filter((t) => t.role === 'num').map(f), den = terms.filter((t) => t.role === 'den').map(f);
    left = (num.length > 1 ? '(' + num.join(' + ') + ')' : num[0]) + (m.factor ? ' x ' + m.factor : '') + ' / ' + (den.length > 1 ? '(' + den.join(' + ') + ')' : den[0]);
  } else left = terms.map((t) => t.label + ' ' + f(t)).join(', ');
  return left + ' = ' + showNumber(value, m.unit);
}

export function explainMetric(id, ctx) {
  const m = metricById(id);
  if (!m) return null;
  const e = m.explain(ctx);
  const terms = e.terms;
  // Inputs grouped by DAITE with signed subtotals (computed numbers in their own group).
  const groups = [...GROUPS.map((g) => g.id), null].map((g) => {
    const list = terms.filter((t) => t.group === g);
    if (!list.length) return null;
    const subtotal = m.op === 'sum' && list.every((t) => t.value !== null) ? Math.round(list.reduce((a, t) => a + (t.role === 'minus' ? -1 : 1) * t.value, 0) * 100) / 100 : null;
    return { group: g, label: g ? GROUPS.find((x) => x.id === g).label : 'Computed numbers', terms: list, subtotal };
  }).filter(Boolean);
  const roughBecause = [...new Set([...terms.filter((t) => t.kind === 'rough').map((t) => t.label), ...(e.rough || []).map((p) => labelFor(ctx.spine, p))])];
  const missingBecause = [...new Set([...terms.filter((t) => t.kind === 'missing' || t.kind === 'incomplete').map((t) => t.label), ...(e.missing || []).map((p) => labelFor(ctx.spine, p))])];
  return {
    id: m.id, label: m.label, unit: m.unit, formula: m.formula, op: m.op, factor: m.factor || null, screens: m.screens,
    value: e.value, kind: e.kind, terms, groups, rules: e.rules, note: e.note || null,
    plugged: plugged(m, terms, e.value),
    roughBecause, missingBecause,
    recomputed: recompute(m, terms, ctx)
  };
}

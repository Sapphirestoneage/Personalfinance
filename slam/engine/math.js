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
import { scenarioRule } from './scenarios.js';
import { labelFor, groupFor, GROUPS } from './labels.js';
import { INVESTED_FAMILIES } from './schema.js';
import { project } from './projection.js';
import { money } from '../src/ui/format.js';
import { expenseRow } from './ledger.js';
import { monthlyAmount } from './cashflow.js';
import { minimumTrap, solvePayoff } from './debtview.js';
import { canISpend } from './spending.js';
import { solvers as solveAgain, outlook as outlookAgain } from './plan.js';

const v = valueOf;
export const UNITS = ['usd', 'usd/month', 'usd/year', 'months', 'years', 'ratio', 'age', 'count'];
const kindOf = (spine, path) => { const f = getAt(spine, path); return f && f.kind ? f.kind : 'missing'; };
// An assumption a Triple D set put in place links to its rule, not the Ledger field (S-183).
const field = (spine, path, value, unit, role = 'plus', label = null) => {
  const rule = path.startsWith('assumptions.') ? scenarioRule(getAt(spine, path)) : null;
  if (rule) return { label: (label || labelFor(spine, path)) + ' (' + (rule.includes('WORST') ? 'worst' : 'likely') + ' set)', value, unit, kind: 'known', role, rule, group: groupFor(path) };
  return { label: label || labelFor(spine, path), value, unit, kind: kindOf(spine, path), role, path, group: groupFor(path) };
};
const metric = (id, label, r, unit, role = 'plus') => ({ label, value: r ? r.value : null, unit, kind: r ? r.kind : 'missing', role, metric: id, group: null });
const ruleTerm = (rules, id, year, role, label, unit = 'ratio') => ({ label: label + ' (rule ' + id + ')', value: rules.get(id, year), unit, kind: 'known', role, rule: id, group: null });
const out = (r, terms, rules = [], extra = {}) => ({ value: r ? r.value : null, kind: r ? r.kind : 'missing', terms, rules: [...new Set([...(r && r.rules) || [], ...rules, ...terms.filter((t) => t.rule).map((t) => t.rule)])], rough: r ? r.rough || [] : [], missing: r ? r.missing || [] : [], ...extra });

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
def({ id: 'subscriptions', label: 'Subscriptions a month', unit: 'usd/month', op: 'sum', screens: ['flag:subscriptions'], formula: 'Subscriptions = each subscription\'s cost to you a month',
  explain: ({ spine, s }) => out(s.subs.monthly, s.subs.items.map((i) => field(spine, 'expenses.' + i.id + '.amount', i.monthly, 'usd/month', 'plus', i.label))) });
def({ id: 'leanSpending', label: 'Lean spending this month', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-fi'], formula: 'Lean spending = food, housing and transportation that are needs (a want such as eating out is left out)',
  explain: ({ spine, s }) => out(s.cashflow.expenses.lean, s.cashflow.expenses.items.filter((i) => i.fat && i.need !== false && !i.covered).map((i) => field(spine, 'expenses.' + i.id + '.amount', i.amount, 'usd/month', 'plus', i.label))) });
def({ id: 'minimums', label: 'Minimum payments this month', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-surplus', 'dashboard#tile-runway'], formula: 'Minimum payments = each debt\'s minimum this month (a rough default when none is entered)',
  explain: ({ spine, s }) => out(s.cashflow.debtMinimums.total, s.cashflow.debtMinimums.items.map((i) => field(spine, 'debts.' + i.id + '.minimum', i.amount, 'usd/month', 'plus', (i.name || i.id) + (i.estimated ? ' (house default)' : '')))) });
def({ id: 'taxSetAside', label: 'Tax set-aside this month', unit: 'usd/month', op: 'sum', screens: ['dashboard#tile-surplus'], formula: 'Tax set-aside = the year\'s tax still due (tax - withholding - estimated payments - already set aside) / months until the return is due; while the tax cannot be figured, untaxed income x the marginal rate',
  explain: ({ spine, s }) => out(s.cashflow.taxSetAside.total, s.cashflow.taxSetAside.lines.map((l) => ({ label: l.kind === 'balance' ? l.label + ': (' + money(l.base) + (l.held ? ' - ' + money(l.held) + ' set aside' : '') + ') / ' + l.months + ' months' : l.label + ': ' + money(l.base) + ' x ' + (Math.round(l.rate * 1000) / 10) + '%' + (l.months ? ' / ' + l.months + ' months' : ''), value: l.amount, unit: 'usd/month', kind: l.kind === 'balance' ? s.tax.balanceDue.kind : kindOf(spine, l.kind === 'income' ? 'income.' + l.id + '.amount' : 'accounts.' + l.id + '.conversions'), role: 'plus', path: l.kind === 'balance' ? null : l.kind === 'income' ? 'income.' + l.id + '.amount' : 'accounts.' + l.id + '.conversions', metric: l.kind === 'balance' && l.taxYear === +s.asOf.slice(0, 4) ? 'taxBalanceDue' : undefined, group: 'T' }))) });
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
export const metricById = (id) => M.find((m) => m.id === id) || cardUtilMetric(id) || expenseCostMetric(id) || windfallMetric(id) || calendarMetric(id) || debtMetric(id) || spendMetric(id) || compareMetric(id) || planMetric(id);

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

// One Windfall step ("windfall:<step>", S-201): what the step takes is the
// smaller of what it needs and what is left of the windfall before it. The
// terms show both, then the inputs behind the need, each a link. The windfall
// itself is in ctx.windfall (the page and the tests put it there).
const WINDFALL_FORMULAS = {
  taxOnIt: 'Tax on the windfall = the windfall x the marginal rate (federal + state), when tax is still owed on it',
  taxBill: 'Tax bill step = the year\'s balance due - money already set aside, capped at what is left of the windfall',
  cashFloor: 'Cash floor step = (stage 1 months x monthly spending and minimums, rounded up) - cash, capped at what is left',
  promos: 'Promo step = what, paid now, brings the monthly amount that clears the promos down to the monthly surplus, capped at what is left',
  employerMatch: 'Employer match step = for each workplace account with a match, (the match cap x W-2 gross a month - what goes in a month) for the months left this year, capped at what is left; skipped when no account has a match',
  cards: 'Cards step = every card balance charging interest today, highest rate first, capped at what is left',
  cushion: 'Cushion step = the Rule of 5 target - (cash + the floor step), capped at what is left',
  roth: 'Roth step = this year\'s IRA limit - put in so far, reduced by the income phase-out, capped at what is left',
  left: 'Left over = the windfall - every step before it'
};
function windfallMetric(id) {
  if (!id || !id.startsWith('windfall:')) return null;
  const stepId = id.slice(9);
  if (!WINDFALL_FORMULAS[stepId]) return null;
  return { id, label: 'Windfall: ' + stepId.replace(/([A-Z])/g, ' $1').toLowerCase(), unit: 'usd', op: stepId === 'left' ? 'sum' : 'custom', screens: ['windfall'], formula: WINDFALL_FORMULAS[stepId],
    explain: ({ spine, s, rules, windfall: w }) => {
      const st = w && w.steps.find((x) => x.id === stepId);
      if (!st) return out(null, []);
      const r = { value: st.amount, kind: st.kind, from: st.from, rough: st.rough, missing: st.missing, rules: st.rules };
      if (stepId === 'left') return out(r, [{ label: 'The windfall', value: w.amount, unit: 'usd', kind: 'known', role: 'plus', group: null }, ...w.steps.filter((x) => x.id !== 'left').map((x) => ({ label: x.label, value: x.amount, unit: 'usd', kind: x.kind === 'missing' ? 'computed' : x.kind, role: 'minus', metric: 'windfall:' + x.id, group: null }))]);
      const terms = [
        { label: 'What this step needs', value: st.need, unit: 'usd', kind: st.kind === 'missing' ? 'missing' : st.kind, role: 'arg', group: null },
        { label: 'Left of the windfall before this step', value: st.before, unit: 'usd', kind: 'computed', role: 'arg', group: null }
      ];
      const year = +s.asOf.slice(0, 4);
      if (stepId === 'taxOnIt' && st.rate !== undefined) terms.push({ label: 'Marginal rate (federal + state)', value: st.rate, unit: 'ratio', kind: s.tax.marginal.value !== null ? s.tax.marginal.kind : 'rough', role: 'arg', metric: 'taxBalanceDue', group: 'T' });
      if (stepId === 'taxBill') terms.push(metric('taxBalanceDue', 'Tax balance due', s.tax.balanceDue, 'usd', 'arg'), { label: 'Already set aside', value: st.held ?? 0, unit: 'usd', kind: st.path && st.path.startsWith('taxYears.') ? kindOf(spine, st.path) : 'known', role: 'arg', path: st.path && st.path.startsWith('taxYears.') ? st.path : null, group: 'T' });
      if (stepId === 'cashFloor') terms.push(metric('cash', 'Cash today', s.sheet.cash, 'usd', 'arg'), { label: 'Spending and minimums a month, rounded up', value: s.emergency.monthlyNeed, unit: 'usd/month', kind: s.emergency.tiers.full.burn.kind, role: 'arg', group: null }, ruleTerm(rules, 'STAGE_RUNWAY_RED_MONTHS', year, 'arg', 'Stage 1 floor', 'months'));
      if (stepId === 'promos') terms.push(metric('promoMonthly', 'Monthly amount that clears the promos', s.debt.promo.monthly, 'usd/month', 'arg'), metric('surplus', 'Monthly surplus', s.cashflow.surplus, 'usd/month', 'arg'), ...st.items.map((x) => field(spine, x.path, x.balance, 'usd', 'arg', x.name + ' balance (' + x.paymentsLeft + ' payments left)')));
      if (stepId === 'cards') terms.push(...st.items.map((x) => field(spine, x.path, x.pay, 'usd', 'arg', x.name + ' at ' + (Math.round(x.rate * 10000) / 100) + '%')));
      if (stepId === 'cushion') terms.push(metric('ruleOf5Dollars', 'Rule of 5 target', s.emergency.targetDollars, 'usd', 'arg'), metric('cash', 'Cash today', s.sheet.cash, 'usd', 'arg'), { label: 'The floor step', value: w.steps.find((x) => x.id === 'cashFloor').amount ?? 0, unit: 'usd', kind: 'computed', role: 'arg', metric: 'windfall:cashFloor', group: null });
      if (stepId === 'roth') { const acct = (spine.accounts || []).find((a) => a.type === 'roth_ira'); if (acct) terms.push(ruleTerm(rules, 'IRA_LIMIT', year, 'arg', 'IRA limit', 'usd'), { label: 'Put in so far this year', value: st.soFar ?? null, unit: 'usd', kind: st.rough.includes('accounts.' + acct.id + '.contributions') ? 'rough' : 'known', role: 'arg', path: 'accounts.' + acct.id + '.contributions', group: 'A' }); }
      return out(r, terms);
    },
    recompute: (t) => (t[0].value === null ? null : Math.round(Math.max(0, Math.min(t[0].value, Math.max(0, t[1].value))) * 100) / 100) };
}

// The calendar's month-end cash ("calendar:monthCash", S-203): checking at the end of
// the month = checking at the start + every event on the account in the month, by kind,
// from the day-by-day simulation. ctx.month is the calendar month (the page puts it there).
function calendarMetric(id) {
  if (id === 'calendar:paycheckLeft') return { id, label: 'Left after this paycheck', unit: 'usd', op: 'sum', screens: ['calendar'], formula: 'Left = the paycheck - every bill, payment and everyday spending it covers until the next paycheck',
    explain: ({ paycheck: p }) => (p ? out({ value: p.left, kind: 'computed', from: [], rough: [], missing: [], rules: [] }, [{ label: 'The paycheck (what lands)', value: p.amount, unit: 'usd', kind: 'computed', role: 'plus', path: p.path || null, group: 'I' }, ...p.bills.map((b) => ({ label: b.label + (b.date ? ' (' + b.date + ')' : ''), value: b.amount, unit: 'usd', kind: 'computed', role: 'minus', group: null }))]) : out(null, [])) };
  if (id !== 'calendar:monthCash' && id !== 'calendar:rangeCash') return null;
  const range = id === 'calendar:rangeCash';
  return { id, label: range ? 'Checking at the end of the period' : 'Checking at the end of the month', unit: 'usd', op: 'sum', screens: ['calendar'], formula: (range ? 'Checking at the end = checking at the start' : 'Checking at month end = checking at the start of the month') + ' + pay in - bills - card and loan payments - everyday spending - saving and the set-aside + top-ups from the cushion',
    explain: ({ month, range: rg, s }) => {
      const t = range ? rg && rg.terms : month && month.monthCash;
      if (!t) return out(null, []);
      const kind = range ? (rg.kind || 'computed') : month.cash.kind === 'computed' ? 'computed' : month.cash.kind;
      return out({ value: t.end, kind, from: [], rough: [], missing: [], rules: [] }, [
        { label: 'Checking at the start (' + t.startDate + ')', value: t.start, unit: 'usd', kind: s.sheet.cash.kind === 'computed' ? 'known' : s.sheet.cash.kind, role: 'plus', group: 'A' },
        ...t.groups.map((g) => ({ label: g.label, value: Math.abs(g.amount), unit: 'usd', kind: 'computed', role: g.amount < 0 ? 'minus' : 'plus', group: null }))
      ]);
    } };
}

// Per-card utilization, one metric per card ("cardUtil:<id>").
function cardUtilMetric(id) {
  if (!id || !id.startsWith('cardUtil:')) return null;
  const card = id.slice(9);
  return { id, label: 'Card utilization', unit: 'ratio', op: 'ratio', screens: ['flag:utilization-' + card], formula: 'Utilization = balance / credit limit',
    explain: ({ spine, s }) => { const c = s.debt.utilization.items.find((x) => x.id === card); return c ? out(c.util, [field(spine, 'debts.' + card + '.balance', c.balance, 'usd', 'num', c.name + ' balance'), field(spine, 'debts.' + card + '.limit', c.limit, 'usd', 'den', c.name + ' limit')]) : out(null, []); } };
}

// The Debt tab (S-205): one family, "debt:<what>[:<id>]", read from ctx.debt (the
// debtView result), ctx.bt, ctx.solve and ctx.which (the tab's tool results).
const DEBT_SCREENS = ['calendar#debt'];
const resOf = (x, value) => (x ? { value, kind: x.kind, from: x.from || [], rough: x.rough || [], missing: x.missing || [], rules: x.rules || [] } : null);
const term = (label, value, unit, kind, role, extra = {}) => ({ label, value, unit, kind, role, group: null, ...extra });
const ruleOrMissing = (rules, id, year, label, unit) => (rules.has(id, year) ? ruleTerm(rules, id, year, 'arg', label, unit) : term(label + ' (rule ' + id + ', not in the registry)', null, unit, 'missing', 'arg', { rule: id }));
function debtMetric(id) {
  if (!id || !id.startsWith('debt:')) return null;
  const [, what, key] = id.split(':');
  const cardOf = (d) => d && d.cards.find((c) => c.id === key);
  if (what === 'interestWindow') return { id, label: 'Card interest inside the window', unit: 'usd', op: 'sum', screens: DEBT_SCREENS, formula: 'Card interest in the window = what each card charges at its statement closes, added up',
    explain: ({ debt: d }) => (d ? out(resOf(d, d.interest.total), d.interest.debts.map((x) => term(x.name + ' interest', x.total, 'usd', 'computed', 'plus', { path: (d.cards.find((c) => c.id === x.id) || {}).path || null }))) : out(null, [])) };
  if (what === 'interestMonth') return { id, label: 'A month of interest today', unit: 'usd/month', op: 'custom', screens: DEBT_SCREENS, formula: 'A month of interest = balance x the rate charged today / 12',
    explain: ({ spine, debt: d }) => { const t = cardOf(d) && cardOf(d).trap; return t ? out(resOf(t, t.interestNow), [field(spine, 'debts.' + key + '.balance', t.balance, 'usd', 'arg', t.name + ' balance'), field(spine, 'debts.' + key + '.apr', t.rate, 'ratio', 'arg', t.name + ' rate today' + (t.promo ? ' (intro)' : ''))]) : out(null, []); },
    recompute: (t) => (t[0].value === null || t[1].value === null ? null : Math.round(t[0].value * t[1].value / 12 * 100) / 100) };
  if (what === 'minOnly') return { id, label: 'Interest paying only the minimum', unit: 'usd', op: 'custom', screens: DEBT_SCREENS, formula: 'Interest at the minimum only = the monthly plan on this one debt with no extra: each month adds interest at the rate in force and takes the minimum, until the balance is gone (or never, when the minimum does not cover the interest)',
    explain: ({ spine, rules, debt: d }) => { const t = cardOf(d) && cardOf(d).trap; if (!t) return out(null, []); const r = resOf(t, t.interest); return out(r, [field(spine, 'debts.' + key + '.balance', t.balance, 'usd', 'arg', t.name + ' balance'), field(spine, 'debts.' + key + '.apr', t.rate, 'ratio', 'arg', t.name + ' rate today'), term('Minimum today', t.minimumNow, 'usd/month', t.minimumNow === null ? 'missing' : 'computed', 'arg', { path: 'debts.' + key + '.minimum' }), term('Months at the minimum only', t.months, 'months', t.months === null ? 'computed' : 'computed', 'arg')], [], t.neverPaysOff ? { note: 'The minimum never clears it, so there is no total.' } : {}); },
    recompute: (t, ctx) => { const d = (ctx.spine.debts || []).find((x) => x.id === key); if (!d || t[0].value === null) return null; return minimumTrap(ctx.spine, ctx.rules, d, ctx.s.asOf).interest; } };
  if (what === 'utilReport') return { id, label: 'Utilization at the report day', unit: 'ratio', op: 'ratio', screens: DEBT_SCREENS, formula: 'Utilization at the report day = the peak balance before the card reports / credit limit',
    explain: ({ spine, debt: d }) => { const c = cardOf(d) && cardOf(d).util; return c ? out(c.util, [term(c.name + ' peak before day ' + c.reportDay + (c.reportDayRough ? ' (the close day standing in)' : ''), c.peak, 'usd', c.reportDayRough ? 'rough' : 'computed', 'num', { path: c.balancePath }), field(spine, c.path, c.limit, 'usd', 'den', c.name + ' limit')]) : out(null, []); } };
  if (what === 'utilPersonal' || what === 'utilOverall') { const personal = what === 'utilPersonal'; return { id, label: personal ? 'Personal utilization at the report day' : 'Overall utilization at the report day', unit: 'ratio', op: 'ratio', screens: DEBT_SCREENS, formula: (personal ? 'Personal utilization' : 'Overall utilization') + ' at the report day = the peaks before each card reports, added up / the limits added up' + (personal ? ', over the cards that report to personal credit' : ', over every card'),
    explain: ({ spine, debt: d }) => { if (!d) return out(null, []); const items = d.utilization.items.filter((c) => !personal || c.reports === true); const r = personal ? d.utilization.personal : d.utilization.overall; return out(r, items.flatMap((c) => [term(c.name + ' peak', c.peak, 'usd', c.reportDayRough ? 'rough' : 'computed', 'num', { path: c.balancePath }), field(spine, c.path, c.limit, 'usd', 'den', c.name + ' limit')])); } }; }
  if (what === 'feeRoi') return { id, label: 'Annual fee against what the card gives back', unit: 'usd', op: 'sum', screens: DEBT_SCREENS, formula: 'Net = what the card gives back a year - its annual fee',
    explain: ({ spine, debt: d }) => { const f = cardOf(d) && cardOf(d).fee; return f ? out(resOf(f, f.net), [field(spine, 'debts.' + key + '.annualValue', f.value, 'usd', 'plus'), field(spine, 'debts.' + key + '.annualFee', f.fee, 'usd', 'minus')]) : out(null, []); } };
  if (what === 'bonus') return { id, label: 'Signup bonus: still to spend', unit: 'usd', op: 'sum', screens: DEBT_SCREENS, formula: 'Still to spend = the spend required - what is spent so far (below zero means the target is passed)',
    explain: ({ spine, debt: d }) => { const b = cardOf(d) && cardOf(d).bonus; return b ? out(resOf(b, b.toGo), [field(spine, 'debts.' + key + '.bonusSpend', b.required, 'usd', 'plus'), field(spine, 'debts.' + key + '.bonusSpent', b.spent, 'usd', 'minus')]) : out(null, []); } };
  if (what === 'idr') return { id, label: 'Income-driven payment', unit: 'usd/month', op: 'custom', screens: DEBT_SCREENS, formula: 'Income-driven payment = share x (income - multiple x the poverty line for the household) / 12; the poverty line = the line for one + the amount for each extra person',
    explain: ({ spine, rules, s, debt: d }) => { const l = d && d.loans.find((x) => x.id === key); if (!l || l.federal === false) return out(null, []); const year = +s.asOf.slice(0, 4); return out(resOf(l, l.payment), [term(l.agiSource === 'tax' ? 'Adjusted gross income this year' : 'A year of this month\'s gross income', l.agi, 'usd', l.agi === null ? 'missing' : l.agiSource === 'tax' ? s.tax.lines.agi.kind : 'rough', 'arg'), field(spine, 'household.householdSize', l.householdSize, 'count', 'arg', 'People in the household'), ruleOrMissing(rules, 'POVERTY_LINE_1', year, 'Poverty line for one', 'usd'), ruleOrMissing(rules, 'POVERTY_LINE_EACH', year, 'Added for each extra person', 'usd'), ruleOrMissing(rules, 'IDR_POVERTY_MULTIPLE', year, 'Multiple of the poverty line', 'ratio'), ruleOrMissing(rules, 'IDR_PAYMENT_SHARE', year, 'Share of discretionary income', 'ratio')]); },
    recompute: (t) => { if (t.some((x) => x.value === null)) return null; const [agi, size, p1, each, mult, share] = t.map((x) => x.value); const poverty = p1 + each * Math.max(0, size - 1); return Math.round(share * Math.max(0, agi - mult * poverty) / 12 * 100) / 100; } };
  if (what === 'bt') return { id, label: 'Balance transfer: net saving', unit: 'usd', op: 'sum', screens: DEBT_SCREENS, formula: 'Net saving = the interest skipped during the 0% window - the transfer fee',
    explain: ({ bt: b }) => (b && b.value !== null ? out(resOf(b, b.netSaving), [term('Interest skipped over ' + b.promoMonths + ' months at ' + Math.round(b.apr * 10000) / 100 + '%', b.interestSkipped, 'usd', 'computed', 'plus', { path: b.path }), term('Transfer fee (' + Math.round(b.feeShare * 10000) / 100 + '% of ' + money(b.balance) + ')', b.fee, 'usd', 'computed', 'minus', b.rules.includes('BT_FEE_SHARE') ? { rule: 'BT_FEE_SHARE' } : {})]) : out(null, [])) };
  if (what === 'solve') return { id, label: 'Extra a month to clear it by the date', unit: 'usd/month', op: 'custom', screens: DEBT_SCREENS, formula: 'The smallest extra a month, found by halving between the extra now and the balance, that clears the debt by the date on the same day-by-day run',
    explain: ({ spine, solve: x, sim }) => { if (!x || x.impossible) return out(null, []); const bal = sim ? (sim.model.cards.find((c) => c.id === x.target) || sim.model.loans.find((l) => l.id === x.target) || {}).balance : null; return out({ value: x.need, kind: sim ? sim.kind : 'computed', from: [], rough: [], missing: [], rules: [] }, [field(spine, 'debts.' + x.target + '.balance', bal === null || bal === undefined ? null : Math.round(bal) / 100, 'usd', 'arg', x.name + ' balance'), term('The extra now', x.extraNow, 'usd/month', 'computed', 'arg', { path: spine.debtPlan && spine.debtPlan.extra ? 'debtPlan.extra' : null }), term('Days until ' + x.byDate, Math.max(0, Math.round((new Date(x.byDate + 'T00:00:00Z') - new Date(sim ? sim.start + 'T00:00:00Z' : x.byDate + 'T00:00:00Z')) / 86400000)), 'count', 'computed', 'arg')]); },
    recompute: (t, ctx) => (ctx.solve && ctx.sim && !ctx.solve.impossible ? (solvePayoff(ctx.spine, ctx.rules, ctx.sim, { target: ctx.solve.target, byDate: ctx.solve.byDate }) || {}).need ?? null : null) };
  if (what === 'whichCard') return { id, label: 'Which card: rewards minus interest', unit: 'usd', op: 'sum', screens: DEBT_SCREENS, formula: 'Net = rewards on the purchase - a month of interest on it (only on a card that is revolving)',
    explain: ({ which: w }) => { const r = w && w.rows.find((x) => x.id === key); return r ? out({ value: r.net, kind: w.kind, from: w.from, rough: w.rough, missing: w.missing, rules: w.rules }, [term(r.name + ' rewards at ' + Math.round(r.rate * 10000) / 100 + '%', r.rewards, 'usd', w.rough.includes('debts.' + key + '.rewardsRate') ? 'rough' : 'known', 'plus', w.rough.includes('debts.' + key + '.rewardsRate') ? { rule: 'APP_REWARDS_RATE' } : { path: 'debts.' + key + '.rewardsRate' }), term('A month of interest on it' + (r.revolving ? '' : ' (paid in full: none)'), r.interest, 'usd', 'computed', 'minus', { path: 'debts.' + key + '.apr' })]) : out(null, []); } };
  return null;
}

// Spending (S-206): one family, "spend:<what>[:<id>]", read from ctx.spend (the
// spendingView result), ctx.tiers, ctx.cut and ctx.ask (the page's tool results).
const SPEND_SCREENS = ['spending', 'dashboard#tile-cash'];
function spendMetric(id) {
  if (!id || !id.startsWith('spend:')) return null;
  const [, what, key] = id.split(':');
  const tagOf = (sp) => sp && sp.tags.rows.find((r) => r.tag === key);
  if (what === 'safeToday') return { id, label: 'Safe to spend today', unit: 'usd', op: 'sum', screens: SPEND_SCREENS, formula: 'Safe to spend = the lower of (cash outside the cushion - what is committed before the next paycheck - the floor on checking) and (the lowest cash outside the cushion in the window - the floor on checking)',
    explain: ({ spend: sp }) => {
      if (!sp) return out(null, []);
      const f = sp.safe;
      const other = f.binding === 'low' ? 'Until the next paycheck it would be ' + money(f.byPaycheck) + '; the lowest point ahead is lower, so it wins.' : f.byLow === null ? null : 'The lowest point ahead less the floor is ' + money(f.byLow) + ', no lower, so the paycheck reading stands.';
      const terms = f.binding === 'low'
        ? [term('Cash outside the cushion on ' + f.low.date + ', as the run left it', f.low.asRun, 'usd', 'computed', 'plus'), ...(f.low.covered ? [term('Topped up from the cushion by then', f.low.covered, 'usd', 'computed', 'minus')] : []), ...(f.low.held ? [term('Payments the floor held back by then', f.low.held, 'usd', 'computed', 'minus')] : []), term('The floor on checking', f.floor, 'usd', 'computed', 'minus', { rule: 'STAGE_RUNWAY_RED_MONTHS' })]
        : [term('Cash outside the cushion today', f.cash, 'usd', 'computed', 'plus', f.cashPath ? { path: f.cashPath } : {}), term('Committed before ' + (f.nextIncome ? f.nextIncome : 'the end of the window'), f.committed, 'usd', 'computed', 'minus'), term('The floor on checking', f.floor, 'usd', 'computed', 'minus', { rule: 'STAGE_RUNWAY_RED_MONTHS' })];
      return out(resOf(f, f.today), terms, [], other ? { note: other } : {});
    } };
  if (what === 'safePerDay') return { id, label: 'Safe to spend a day', unit: 'usd', op: 'custom', screens: SPEND_SCREENS, formula: 'A day = safe to spend today / days until the next paycheck',
    explain: ({ spend: sp }) => (sp && sp.safe.daysUntil ? out(resOf(sp.safe, sp.safe.perDay), [metric('spend:safeToday', 'Safe to spend today', { value: sp.safe.today, kind: sp.safe.kind }, 'usd', 'arg'), term('Days until the next paycheck', sp.safe.daysUntil, 'count', 'computed', 'arg')]) : out(null, [])),
    recompute: (t) => (t[0].value === null || !t[1].value ? null : Math.round(t[0].value / t[1].value * 100) / 100) };
  if (what === 'tagBudget') return { id, label: 'Budget for the tag a month', unit: 'usd/month', op: 'sum', blockOnMissing: true, screens: SPEND_SCREENS, formula: 'Budget = every line with this tag, a month, added up',
    explain: ({ spine, spend: sp }) => { const r = tagOf(sp); return r ? out({ value: r.budget, kind: r.kind, from: r.items.map((i) => i.path), rough: sp.tags.rough, missing: r.budget === null ? r.items.filter((i) => i.amount === null).map((i) => i.path) : [], rules: [] }, r.items.map((i) => field(spine, i.path, i.amount, 'usd/month', 'plus', i.label + ' (a month)'))) : out(null, []); } };
  if (what === 'tagSpent') return { id, label: 'Spent on the tag this month', unit: 'usd', op: 'sum', screens: SPEND_SCREENS, formula: 'Spent = every logged spend with this tag this month, less refunds',
    explain: ({ spine, spend: sp }) => { const r = tagOf(sp); if (!r) return out(null, []); const entries = sp.log.filter((e) => e.kind !== 'income' && ((e.tag || ((spine.expenses || []).find((x) => x.id === e.expenseId) || {}).fat || 'other') === key)); return out({ value: r.spent, kind: 'known', from: [], rough: [], missing: [], rules: [] }, entries.length ? entries.map((e) => term((e.merchant || e.note || (e.kind === 'refund' ? 'Refund' : 'Spend')) + ' on ' + e.date, e.amount, 'usd', 'known', e.kind === 'refund' ? 'minus' : 'plus')) : [term('Nothing logged this month', 0, 'usd', 'known', 'plus')]); } };
  if (what === 'pace') return { id, label: 'Where the month runs to at this pace', unit: 'usd', op: 'custom', screens: SPEND_SCREENS, formula: 'Pace = spent so far / (the day of the month / days in the month)',
    explain: ({ spend: sp }) => { const r = tagOf(sp); return r && r.pace !== null ? out({ value: r.pace, kind: 'known', from: [], rough: [], missing: [], rules: [] }, [metric('spend:tagSpent:' + key, 'Spent so far', { value: r.spent, kind: 'known' }, 'usd', 'arg'), term('Day of the month', sp.tags.day ?? sp.tags.daysInMonth, 'count', 'known', 'arg'), term('Days in the month', sp.tags.daysInMonth, 'count', 'known', 'arg')]) : out(null, []); },
    recompute: (t) => (t[0].value === null || !t[1].value ? null : Math.round(t[0].value / (t[1].value / t[2].value) * 100) / 100) };
  if (what === 'tier') return { id, label: 'Burn tier', unit: 'usd/month', op: 'sum', screens: SPEND_SCREENS, formula: { core: 'Core burn = food, housing and transportation lines a month, added up', rest: 'Everything else = every other spending line a month, not debt', minimums: 'Minimums = every debt at its minimum a month', extra: 'Extra = after-tax saving + the tax set-aside + the extra at the debt' }[key] || 'A burn tier',
    explain: ({ spine, s, tiers }) => { const tier = tiers && tiers.tiers.find((x) => x.id === key); if (!tier) return out(null, []); const items = s.cashflow.expenses.items.filter((i) => !i.covered && (key === 'core' ? i.fat : key === 'rest' ? !i.fat : false)); const terms = key === 'core' || key === 'rest' ? items.map((i) => field(spine, 'expenses.' + i.id + '.amount', i.amount, 'usd/month', 'plus', i.label + ' (a month)')) : key === 'minimums' ? s.cashflow.debtMinimums.items.map((i) => field(spine, 'debts.' + i.id + '.minimum', i.amount, 'usd/month', 'plus', (i.label || i.name || i.id) + ' minimum')) : [metric('savingAfterTax', 'After-tax saving', s.cashflow.saving.afterTax, 'usd/month'), metric('taxSetAside', 'Tax set-aside', s.cashflow.taxSetAside.total, 'usd/month'), term('The extra at the debt', tiers.extra ?? 0, 'usd/month', 'known', 'plus', { path: spine.debtPlan && spine.debtPlan.extra ? 'debtPlan.extra' : null })]; return out({ value: tier.amount, kind: tiers.kind === 'incomplete' ? 'incomplete' : tiers.kind, from: tiers.takeHome.from, rough: tiers.takeHome.rough, missing: tiers.missing, rules: [] }, terms); } };
  if (what === 'cut') return { id, label: 'Saved a month by the cuts', unit: 'usd/month', op: 'sum', screens: SPEND_SCREENS, formula: 'Saved = the dropped lines a month, added up',
    explain: ({ spine, cut }) => (cut ? out(resOf(cut, cut.saved), cut.dropped.map((i) => field(spine, i.path, i.amount, 'usd/month', 'plus', i.label + ' (a month)'))) : out(null, [])) };
  if (what === 'cutDebt') return { id, label: 'Interest saved by aiming the cuts at the debt', unit: 'usd', op: 'sum', screens: SPEND_SCREENS, formula: 'Interest saved = interest on the monthly plan as it is - interest with the saving added to the extra',
    explain: ({ cut }) => (cut && cut.debt && cut.debt.interestSaved !== null ? out(resOf(cut, cut.debt.interestSaved), [term('Interest on the plan as it is (extra ' + money(cut.debt.extraNow) + ' a month)', cut.debt.interestBefore, 'usd', 'computed', 'plus'), term('Interest with the extra at ' + money(cut.debt.extraAfter) + ' a month', cut.debt.interestAfter, 'usd', 'computed', 'minus')]) : out(null, [])) };
  if (what === 'ask') return { id, label: 'Safe to spend after this purchase', unit: 'usd', op: 'custom', screens: SPEND_SCREENS, formula: 'The same day-by-day run with the purchase added on its day; safe to spend after it, the new low point, a month of interest on a revolving card, hours of life at take-home per hour worked',
    explain: ({ ask }) => (ask && ask.verdict ? out(resOf(ask, ask.safeAfter), [term('Safe to spend before', ask.safeBefore, 'usd', 'computed', 'arg'), term('The purchase', ask.amount, 'usd', 'known', 'arg'), term('Hours of life' + (ask.hourlyWage !== null ? ' at ' + money(ask.hourlyWage) + ' an hour' : ''), ask.hours, 'count', ask.hours === null ? 'missing' : 'computed', 'arg', ask.hours === null ? { path: 'household.workHoursPerWeek' } : {})]) : out(null, [])),
    recompute: (t, ctx) => (ctx.ask && ctx.sim ? canISpend(ctx.spine, ctx.rules, ctx.sim, { amount: ctx.ask.amount, date: ctx.ask.date, paidWith: ctx.ask.paidWith }).safeAfter : null) };
  if (what === 'autopsy') return { id, label: 'What it costs a year', unit: 'usd/year', op: 'custom', screens: SPEND_SCREENS, formula: 'A year = the amount a month x 12',
    explain: ({ spine, spend: sp }) => { const r = sp && sp.autopsy.rows.find((x) => x.id === key); return r ? out({ value: r.yearly, kind: 'computed', from: [r.path], rough: [], missing: [], rules: [] }, [field(spine, r.path, r.monthly, 'usd/month', 'arg', r.label + ' (a month)')]) : out(null, []); },
    recompute: (t) => (t[0].value === null ? null : Math.round(t[0].value * 12 * 100) / 100) };
  if (what === 'priceChange') return { id, label: 'Price change against the plan', unit: 'ratio', op: 'custom', screens: SPEND_SCREENS, formula: 'Change = (the last logged charge - the planned amount) / the planned amount',
    explain: ({ spine, spend: sp }) => { const r = sp && sp.prices.rows.find((x) => x.id === key); return r ? out({ value: r.change, kind: 'known', from: [r.path], rough: [], missing: [], rules: ['APP_PRICE_DRIFT'] }, [term('Last logged charge, ' + r.date, r.logged, 'usd', 'known', 'arg'), field(spine, r.path, r.planned, 'usd', 'arg', r.label + ' as planned')]) : out(null, []); },
    recompute: (t) => (t[0].value === null || !t[1].value ? null : Math.round((t[0].value - t[1].value) / t[1].value * 10000) / 10000) };
  if (what === 'drift') return { id, label: 'Drift: the mean miss across check-ins', unit: 'usd', op: 'custom', screens: SPEND_SCREENS, formula: 'Mean miss = (real balances - the forecast) at each check-in, averaged; bias when the mean is bigger than the spread, else noise',
    explain: ({ spend: sp }) => (sp && sp.drift.count ? out({ value: sp.drift.mean, kind: 'known', from: [], rough: [], missing: [], rules: [] }, sp.drift.checkins.map((c) => term('Check-in ' + c.date + ': real less forecast', c.miss, 'usd', 'known', 'arg'))) : out(null, [])),
    recompute: (t) => (t.length && t.every((x) => x.value !== null) ? Math.round(t.reduce((a, x) => a + x.value, 0) / t.length) : null) };
  if (what === 'momentum') return { id, label: 'Momentum: cash a month across check-ins', unit: 'usd/month', op: 'custom', screens: SPEND_SCREENS, formula: 'A month = (cash at the last check-in - cash at the first) / days between x 30.44',
    explain: ({ spend: sp }) => (sp && sp.momentum.perMonth !== null ? out({ value: sp.momentum.perMonth, kind: 'known', from: [], rough: [], missing: [], rules: ['APP_MOMENTUM_FLAT'] }, [term('Cash at the last check-in, ' + sp.momentum.to, sp.momentum.points[sp.momentum.points.length - 1].cash, 'usd', 'known', 'arg'), term('Cash at the first check-in, ' + sp.momentum.from, sp.momentum.points[0].cash, 'usd', 'known', 'arg'), term('Days between', Math.max(1, Math.round((new Date(sp.momentum.to + 'T00:00:00Z') - new Date(sp.momentum.from + 'T00:00:00Z')) / 86400000)), 'count', 'known', 'arg')]) : out(null, [])),
    recompute: (t) => (t.some((x) => x.value === null) ? null : Math.round((t[0].value - t[1].value) / t[2].value * 30.44 * 100) / 100) };
  if (what === 'sweep') return { id, label: 'Swept at month ends inside the window', unit: 'usd', op: 'sum', screens: SPEND_SCREENS, formula: 'Swept = at each month end, what checking holds above the floor and the keep amount, moved to the account picked, added up',
    explain: ({ spend: sp }) => (sp && sp.sweep.on ? out({ value: sp.sweep.total, kind: 'computed', from: [], rough: [], missing: [], rules: [] }, sp.sweep.moves.map((m) => term('Swept ' + m.date + (m.toName ? ' to ' + m.toName : ''), m.amount, 'usd', 'computed', 'plus'))) : out(null, [])) };
  return null;
}

// Estimated vs actual (S-207): one family, "compare:<what>[:<id>]", read from ctx.compare.
const COMPARE_SCREENS = ['dashboard#tile-compare', 'spending'];
function compareMetric(id) {
  if (!id || !id.startsWith('compare:')) return null;
  const [, what, key] = id.split(':');
  const win = (c) => monthWordsShort(c.from) + (c.from === c.to ? '' : ' to ' + monthWordsShort(c.to));
  if (what === 'line') return { id, label: 'Actual against the plan for the line', unit: 'usd', op: 'sum', blockOnMissing: true, screens: COMPARE_SCREENS, formula: 'Difference = what the log shows for the line in the window - what the plan has for it month by month',
    explain: ({ spine, compare: c }) => { const r = c && c.lines.find((x) => x.id === key); return r ? out({ value: r.diff, kind: r.kind, from: [r.path], rough: [], missing: r.missing ? [r.path] : [], rules: [] }, [term('Logged to ' + r.label + ', ' + win(c) + ' (' + r.entries + ' entr' + (r.entries === 1 ? 'y' : 'ies') + ')', r.actual, 'usd', 'known', 'plus'), field(spine, r.path, r.missing ? null : r.planned, 'usd', 'minus', r.label + ' planned, ' + win(c))]) : out(null, []); } };
  if (what === 'tag') return { id, label: 'Actual against the plan for the tag', unit: 'usd', op: 'sum', blockOnMissing: true, screens: COMPARE_SCREENS, formula: 'Difference = everything logged under the tag in the window (lines and loose entries) - the plan for its lines month by month',
    explain: ({ compare: c }) => { const r = c && c.tags.find((x) => x.tag === key); return r ? out({ value: r.diff, kind: r.kind, from: [], rough: [], missing: [], rules: [] }, [term('Logged under ' + r.label + ', ' + win(c) + (r.unassigned ? ' (' + money(r.unassigned) + ' not on a line)' : ''), r.actual, 'usd', 'known', 'plus'), term(r.label + ' planned, ' + win(c), r.missing ? null : r.planned, 'usd', r.missing ? 'missing' : 'computed', 'minus')]) : out(null, []); } };
  if (what === 'spend') return { id, label: 'Spending logged against the plan', unit: 'usd', op: 'sum', blockOnMissing: true, screens: COMPARE_SCREENS, formula: 'Difference = everything logged as spending in the window, less refunds - every planned line month by month',
    explain: ({ compare: c }) => (c ? out({ value: c.spend.diff, kind: c.kind, from: c.from_, rough: c.rough, missing: c.missing, rules: c.rules }, [term('Spending logged, ' + win(c) + ' (' + c.spend.entries + ' entries)', c.spend.actual, 'usd', 'known', 'plus'), term('Spending planned, ' + win(c), c.spend.planned, 'usd', c.spend.planned === null ? 'missing' : 'computed', 'minus')]) : out(null, [])) };
  if (what === 'income') return { id, label: 'Income logged against the plan', unit: 'usd', op: 'sum', blockOnMissing: true, screens: COMPARE_SCREENS, formula: 'Difference = income logged in the window - take-home planned month by month',
    explain: ({ compare: c }) => (c ? out({ value: c.income.diff, kind: c.income.diff === null ? 'missing' : c.kind, from: c.from_, rough: c.rough, missing: c.income.actual === null ? [] : c.missing, rules: c.rules }, [term('Income logged, ' + win(c) + (c.income.entries ? ' (' + c.income.entries + ' entries)' : ' (none)'), c.income.actual, 'usd', c.income.actual === null ? 'missing' : 'known', 'plus'), term('Take-home planned, ' + win(c), c.income.planned, 'usd', c.income.planned === null ? 'missing' : 'computed', 'minus')]) : out(null, [])) };
  if (what === 'soFar') return { id, label: 'So far this month', unit: 'usd', op: 'sum', screens: COMPARE_SCREENS, formula: 'So far = income logged this month up to today - spending logged this month up to today (less refunds)',
    explain: ({ monthOut: o }) => (o ? out({ value: o.soFar, kind: 'known', from: [], rough: [], missing: [], rules: [] }, [term('Income logged up to today', o.incomeSoFar, 'usd', 'known', 'plus'), term('Spending logged up to today, less refunds', o.spentSoFar, 'usd', 'known', 'minus')]) : out(null, [])) };
  if (what === 'expected') return { id, label: 'Expected by month end', unit: 'usd', op: 'sum', blockOnMissing: true, screens: COMPARE_SCREENS, formula: 'Expected = so far + paychecks still to come this month - bills and loan payments still to come from cash - what is left of the spread lines in each tag (the month planned for the tag less what is logged in it, never below zero)',
    explain: ({ monthOut: o }) => (o ? out({ value: o.expected, kind: o.kind, from: o.from, rough: o.rough, missing: o.missing, rules: o.rules }, [metric('compare:soFar', 'So far this month', { value: o.soFar, kind: 'known' }, 'usd', 'plus'), ...o.items.map((i) => term(i.label + ' on ' + i.date + (i.card ? ' (on the card)' : ''), Math.abs(i.amount), 'usd', 'computed', i.amount > 0 ? 'plus' : 'minus')), ...o.rest.map((r) => term(r.label + ' (' + r.lines.join(', ') + '): ' + (r.plan === null ? 'a line has no amount' : money(r.plan) + ' planned less ' + money(r.logged) + ' logged'), r.left, 'usd', r.left === null ? 'missing' : 'computed', 'minus', { path: r.path }))]) : out(null, [])) };
  if (what === 'savingsReal') return { id, label: 'Savings rate from the real ledger', unit: 'ratio', op: 'custom', screens: COMPARE_SCREENS, formula: 'Real savings rate = (income logged - spending logged) / income logged, over the window',
    explain: ({ compare: c }) => (c ? out({ value: c.savingsRate.real, kind: c.savingsRate.real === null ? 'missing' : 'known', from: [], rough: [], missing: [], rules: [] }, [term('Income logged, ' + win(c), c.income.actual, 'usd', c.income.actual === null ? 'missing' : 'known', 'arg'), term('Spending logged, ' + win(c), c.spend.actual, 'usd', 'known', 'arg')]) : out(null, [])),
    recompute: (t) => (t[0].value === null || !t[0].value ? null : Math.round((t[0].value - t[1].value) / t[0].value * 10000) / 10000) };
  return null;
}
const monthWordsShort = (ym) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);

// The Plan page (S-208): one family, "plan:<what>[:<id>]", read from ctx.plan (foo, wage, draftt, floor, goals, alloc), ctx.solvers and ctx.outlook.
const PLAN_SCREENS = ['plan'];
function planMetric(id) {
  if (!id || !id.startsWith('plan:')) return null;
  const parts = id.split(':');
  const what = parts[1], key = parts.slice(2).join(':');
  if (what === 'foo') return { id, label: 'FOO rung: what it still needs', unit: 'usd', op: 'custom', screens: PLAN_SCREENS, formula: 'What the rung needs = the gap the rung names (a balance to clear, cash to reach a target, or an amount a month), from the engine that owns it; the month it completes = today + the months the rungs before it take + this gap / the monthly surplus',
    explain: ({ plan }) => { const r = plan && plan.foo.rungs.find((x) => x.id === key); return r ? out(resOf(r, r.need), [term(r.label + (r.flow ? ' (a month)' : ''), r.need, 'usd', r.kind === 'missing' ? 'missing' : 'computed', 'arg', r.path ? { path: r.path } : {}), term('Monthly surplus', plan.foo.surplus, 'usd/month', 'computed', 'arg'), term('Months to fill it', r.months, 'months', r.months === null ? 'missing' : 'computed', 'arg')]) : out(null, []); },
    recompute: (t) => t[0].value };
  if (what === 'pay') { const [date, streamId] = key.split(':'); return { id, label: 'Free after this paycheck', unit: 'usd', op: 'sum', screens: PLAN_SCREENS, formula: 'Free = the paycheck - the tax set aside on a 1099 deposit - every envelope due before the next paycheck - everyday spending until then',
    explain: ({ plan }) => { const p = plan && plan.alloc.paychecks.find((x) => x.date === date && String(x.streamId) === streamId); return p ? out({ value: p.free, kind: 'computed', from: [], rough: [], missing: [], rules: [] }, [term('The paycheck ' + p.label + ' on ' + p.date, p.amount, 'usd', 'computed', 'plus', p.path ? { path: p.path } : {}), ...(p.is1099 ? [term('Tax set aside (' + Math.round(p.setAsideRate * 10000) / 100 + '%)', p.setAside, 'usd', p.setAsideMissing ? 'rough' : 'computed', 'minus')] : []), ...p.envelopes.map((e) => term(e.label + ' on ' + e.date, e.amount, 'usd', 'computed', 'minus')), term('Everyday spending until the next paycheck', p.everyday, 'usd', 'computed', 'minus')]) : out(null, []); } }; }
  if (what === 'solve') return { id, label: 'What it takes to reach FI by the age', unit: key === 'savingsRate' || key === 'return' ? 'ratio' : 'usd/month', op: 'custom', screens: PLAN_SCREENS, formula: { savingsRate: 'Savings rate needed = the saving a year that reaches the FI number by the age (found by halving on years-to-target) / gross a year', spending: 'Spending level needed = take-home - minimums - the saving a month that reaches the FI number by the age', income: 'Take-home needed = spending + minimums + the saving a month that reaches the FI number by the age', return: 'Real return needed = the return at which the saving as it is reaches the FI number by the age (found by halving)' }[key] || 'A solver',
    explain: ({ solvers: x }) => { const r = x && x.rows.find((y) => y.id === key); return r && r.value !== null ? out({ value: r.value, kind: x.kind, from: x.from, rough: x.rough, missing: x.missing, rules: x.rules }, [term('FI number', x.fiNumber, 'usd', 'computed', 'arg', { metric: 'fiNumber' }), term('Invested today', x.invested, 'usd', 'computed', 'arg', { metric: 'invested' }), term('Years to the age', x.years, 'years', 'computed', 'arg'), term('Real return assumed', x.realReturn, 'ratio', 'known', 'arg', { path: 'assumptions.realReturn' }), term('Target age', x.targetAge, 'age', 'known', 'arg')]) : out(null, []); },
    recompute: (t, ctx) => { const x = solveAgain(ctx.spine, ctx.rules, ctx.s, { byAge: ctx.solvers ? ctx.solvers.targetAge : null }); const r = x.rows.find((y) => y.id === key); return r ? r.value : null; } };
  if (what === 'wage') return { id, label: 'Real hourly wage', unit: 'usd', op: 'custom', screens: PLAN_SCREENS, formula: 'Real hourly wage = (take-home a month - the costs of working a month) / ((hours worked + commute hours a week) x weeks in a month)',
    explain: ({ spine, rules, plan }) => (plan && plan.wage.wage !== null ? out(resOf(plan.wage, plan.wage.wage), [term('Take-home a month', plan.wage.takeHome, 'usd/month', 'computed', 'arg', { metric: 'takeHome' }), term('Costs of working a month', plan.wage.costMonthly, 'usd/month', 'computed', 'arg'), field(spine, 'household.workHoursPerWeek', plan.wage.hoursWeek, 'count', 'arg'), term('Commute hours a week', plan.wage.commuteWeek, 'count', plan.wage.rough.includes('household.commuteHoursPerWeek') ? 'rough' : 'known', 'arg', { path: 'household.commuteHoursPerWeek' }), ruleTerm(rules, 'APP_WEEKS_PER_MONTH', +spine.meta.asOf.slice(0, 4), 'arg', 'Weeks in a month', 'count')]) : out(null, [])),
    recompute: (t) => (t.some((x) => x.value === null) ? null : Math.round((t[0].value - t[1].value) / ((t[2].value + t[3].value) * t[4].value) * 100) / 100) };
  if (what === 'draftt') return { id, label: 'DRAFTT letter as a share of the base', unit: 'ratio', op: 'ratio', screens: PLAN_SCREENS, formula: 'Share = the letter\'s amount a month / (take-home + pre-tax retirement)',
    explain: ({ plan }) => { const r = plan && plan.draftt.rows.find((x) => x.key === key); return r ? out({ value: r.share, kind: plan.draftt.kind, from: plan.draftt.from, rough: plan.draftt.rough, missing: plan.draftt.missing, rules: plan.draftt.rules }, [term(r.label + ' a month', r.amount, 'usd/month', 'computed', 'num'), term('Take-home plus pre-tax retirement', plan.draftt.base.amount, 'usd/month', 'computed', 'den')]) : out(null, []); } };
  if (what === 'floor') return { id, label: 'The fixed floor a month', unit: 'usd/month', op: 'sum', blockOnMissing: true, screens: PLAN_SCREENS, formula: 'Fixed floor = every line marked fixed, a month, added up + every debt at its minimum',
    explain: ({ spine, plan }) => (plan ? out(resOf(plan.floor, plan.floor.floor), [...plan.floor.items.map((i) => field(spine, i.path, i.amount, 'usd/month', 'plus', i.label + ' (a month)')), term('Debt minimums', plan.floor.minimums, 'usd/month', plan.floor.minimums === null ? 'missing' : 'computed', 'plus', { metric: 'debtMinimums' })]) : out(null, [])) };
  if (what === 'goal') return { id, label: 'Goal: still to go', unit: 'usd', op: 'custom', screens: PLAN_SCREENS, formula: 'To go = the target - what the linked account holds (zero when nothing is linked), never below zero',
    explain: ({ spine, plan }) => { const g = plan && plan.goals.rows.find((x) => x.id === key); return g ? out(resOf(g, g.toGo), [field(spine, g.path, g.target, 'usd', 'plus', g.label + ' target'), term('In ' + (g.linkedAccount ? labelFor(spine, 'accounts.' + g.linkedAccount + '.name') || g.linkedAccount : 'no linked account'), g.held ?? 0, 'usd', g.linkedAccount ? 'known' : 'computed', 'minus', g.linkedAccount ? { path: 'accounts.' + g.linkedAccount + '.balance' } : {})]) : out(null, []); },
    recompute: (t) => (t[0].value === null ? null : Math.max(0, Math.round((t[0].value - (t[1].value ?? 0)) * 100) / 100)) };
  if (what === 'outlook') return { id, label: 'Outlook: the typical lowest day', unit: 'usd', op: 'custom', screens: PLAN_SCREENS, formula: 'Typical lowest day = the median of the lowest day over every run, each run the same window with every amount wobbled and days shifted (a fixed seed, so it repeats)',
    explain: ({ outlook: o }) => (o ? out({ value: o.low.typical, kind: o.kind, from: [], rough: [], missing: [], rules: o.rules }, [term('Runs', o.runs, 'count', 'known', 'arg', { rule: 'APP_OUTLOOK_RUNS' }), term('Wobble on every amount', o.wobble, 'ratio', 'known', 'arg', { rule: 'APP_OUTLOOK_WOBBLE' }), term('Lowest day in a bad run (tenth percentile)', o.low.bad, 'usd', 'computed', 'arg'), term('Lowest day in a good run (ninetieth)', o.low.good, 'usd', 'computed', 'arg')]) : out(null, [])),
    recompute: (t, ctx) => (ctx.outlook && ctx.sim ? outlookAgain(ctx.spine, ctx.rules, ctx.sim, { runs: ctx.outlook.runs, wobble: ctx.outlook.wobble }).low.typical : null) };
  return null;
}

// The metric(s) behind each Dashboard tile and flag.
export const DASHBOARD_MATH = {
  'tile-networth': ['netWorth'], 'tile-runway': ['runway', 'runwayFat', 'ruleOf5Dollars', 'rothBasis'], 'tile-surplus': ['surplus'],
  'tile-savings': ['savingsRateGross', 'savingsRateNet'], 'tile-cards': ['cards', 'promoTotal', 'promoMonthly', 'personalUtil', 'overallUtil'],
  'tile-fi': ['fiPercent', 'fiNumber', 'impliedFi', 'leanFi', 'coastFi'], 'tile-tax': ['taxBalanceDue'], 'tile-compare': ['compare:spend', 'compare:income', 'compare:savingsReal', 'compare:soFar', 'compare:expected'], 'tile-cash': ['spend:safeToday']
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
  if (id === 'subscriptions') return ['subscriptions'];
  return [];
}

// ---------------------------------------------------------------- explain, plug in, recompute
const UNIT_FMT = { usd: (x) => money(x, true), 'usd/month': (x) => money(x, true), 'usd/year': (x) => money(x, true), months: (x) => (Math.round(x * 100) / 100) + ' months', years: (x) => (Math.round(x * 10) / 10) + ' years', ratio: (x) => (Math.round(x * 10000) / 100) + '%', age: (x) => String(x), count: (x) => String(x) };
// One number in its unit; a missing one reads "missing" and one marked not for
// me reads "does not apply", never $0.
export const showNumber = (x, unit, kind = null) => (kind === 'notForMe' ? 'does not apply' : x === null || x === undefined ? 'missing' : (UNIT_FMT[unit] || String)(x));

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
  const f = (t) => showNumber(t.value, t.unit, t.kind);
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

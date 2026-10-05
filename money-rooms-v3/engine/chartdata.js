/* Data for the eight charts, built from the computed result so the chart
   module only draws. Every builder returns null when its inputs are missing,
   and says what it needs. The Sankey balances to the cent: inflows equal
   outflows, with a "Not yet placed" node carrying any remainder. */
import { isQ } from './units.js';

const CAT_LABELS = { accommodation: 'Housing', utilities: 'Utilities and subscriptions', food: 'Food', transportation: 'Transportation', therapy: 'Health and therapy', wants: 'Wants', irregular: 'Irregular and annual', mistakes: 'Mistakes', other: 'Other' };

/* 1 Cash flow Sankey: gross -> taxes and deductions -> take-home -> categories, debt, savings. */
export function sankey(result) {
  const S = result.sun && result.sun.outputs; if (!S) return { needs: ['income'] };
  const inc = S.income, sp = S.spending, dt = S.debt, sf = S.safety;
  if (!isQ(inc.grossMonthly) || !isQ(inc.takeHomeMonthly)) return { needs: ['gross pay', 'take-home pay'] };
  const nodes = []; const links = [];
  const id = name => { let i = nodes.findIndex(n => n.name === name); if (i === -1) { nodes.push({ name }); i = nodes.length - 1; } return i; };
  const link = (a, b, v, kind) => { if (v > 0) links.push({ source: id(a), target: id(b), value: v, kind }); };
  const gross = inc.grossMonthly.cents, take = inc.takeHomeMonthly.cents;
  const pre = (isQ(inc.pretaxContribMonthly) ? inc.pretaxContribMonthly.cents : 0), roth = (isQ(inc.rothContribMonthly) ? inc.rothContribMonthly.cents : 0), hsa = (isQ(inc.hsaPayrollMonthly) ? inc.hsaPayrollMonthly.cents : 0), other = (isQ(inc.pretaxOtherMonthly) ? inc.pretaxOtherMonthly.cents : 0);
  const diff = gross - take - pre - roth - hsa - other;
  const taxes = Math.max(0, diff);
  link('Gross pay', 'Taxes', taxes, 'tax');
  /* take-home above what gross explains (a typed figure, refunds, support) enters as its own inflow */
  if (diff < 0) link('Other inflows', 'Take-home', -diff, 'flow');
  link('Gross pay', 'Retirement from pay', pre + roth, 'saving');
  link('Gross pay', 'HSA from pay', hsa, 'saving');
  link('Gross pay', 'Benefits from pay', other, 'spend');
  link('Gross pay', 'Take-home', take - (diff < 0 ? -diff : 0), 'flow');
  let placed = 0; let smaller = 0;
  if (sp.byCategory) Object.keys(sp.byCategory).forEach(c => { const v = isQ(sp.byCategory[c]) ? sp.byCategory[c].cents : 0; if (v > 0 && v < take * 0.02) { smaller += v; placed += v; return; } link('Take-home', CAT_LABELS[c] || c, v, 'spend'); placed += v; });
  if (smaller > 0) link('Take-home', 'Smaller lines', smaller, 'spend');
  const prem = sf && isQ(sf.premiumsMonthly) ? sf.premiumsMonthly.cents : 0; link('Take-home', 'Insurance', prem, 'spend'); placed += prem;
  const service = dt && isQ(dt.debtServiceMonthly) ? dt.debtServiceMonthly.cents : 0; link('Take-home', 'Debt payments', service, 'debt'); placed += service;
  const landing = sp && isQ(sp.savingsLandingMonthly) ? sp.savingsLandingMonthly.cents : 0; link('Take-home', 'Savings transfers', landing, 'saving'); placed += landing;
  const rest = take - placed;
  if (rest > 0) link('Take-home', 'Not yet placed', rest, 'rest');
  if (rest < 0) link('Short this month', 'Take-home', -rest, 'short');
  const inflow = gross + (diff < 0 ? -diff : 0) + (rest < 0 ? -rest : 0);
  const outflow = taxes + pre + roth + hsa + other + placed + (rest > 0 ? rest : 0);
  return { nodes, links, inflow, outflow, gross, take, rest };
}

/* 2 Net worth projection to 95 with the Triple D band and the FI date. */
export function netWorthProjection(result) {
  const pj = result.projection; if (!pj) return { needs: ['income, spending, account balances and a birth date'] };
  const years = pj.likely.path.map((p, i) => ({ year: p.year, age: p.age, likely: p.netWorth, best: pj.best.path[i].netWorth, worst: pj.worst.path[i].netWorth, working: p.working }));
  const fi = result.metrics.fiNumber && result.metrics.fiNumber.status === 'ok' ? result.metrics.fiNumber.value.cents : null;
  return { years, fiNumber: fi, fiAges: { likely: pj.likely.fiAge, best: pj.best.fiAge, worst: pj.worst.fiAge }, retirementAge: result.sun.outputs.life.retirementAge || result.asm.retirementAgeDefault, asm: { returnLikely: result.asm.returnLikely, returnBest: result.asm.returnBest, returnWorst: result.asm.returnWorst } };
}

/* 3 Balance sheet: assets by bucket and liquidity tier against debts. */
export function balanceSheet(result) {
  const S = result.sun && result.sun.outputs; if (!S || !isQ(S.invest.totalAssets)) return { needs: ['account balances'] };
  const b = S.invest.balancesByBucket, t = S.invest.balancesByLiquidity;
  const debts = (result.debts || []).map(d => ({ name: d.name, cents: d.balance, type: d.type }));
  return { buckets: Object.keys(b).map(k => ({ key: k, label: { pretax: 'Pre-tax', roth: 'Roth', taxable: 'Taxable', hsa: 'HSA', cash: 'Cash', other: 'Other' }[k], cents: b[k] })).filter(x => x.cents > 0), tiers: Object.keys(t).map(k => ({ key: k, label: { liquid: 'Reachable now', semi: 'Reachable with care', locked: 'Locked until 59.5' }[k], cents: t[k] })), debts, totalAssets: S.invest.totalAssets.cents, totalDebt: isQ(S.debt.totalDebt) ? S.debt.totalDebt.cents : 0 };
}

/* 4 Debt payoff race: each debt's balance by month under the avalanche order. */
export function debtRace(result) {
  const series = result.payoffSeries || []; if (!series.length) return { needs: ['debt balances, rates and minimums'] };
  const debts = result.debts.map(d => ({ id: d.id, name: d.name }));
  const step = Math.max(1, Math.floor(series.length / 120));
  const months = series.filter((m, i) => i % step === 0 || i === series.length - 1).map(m => ({ month: m.month, balances: m.balances }));
  return { debts, months, debtFree: result.sun.outputs.debt.debtFreeDate };
}

/* 5 Runway ladder: cash against months at three spending levels and the Rule of 5 target. */
export function runwayLadder(result) {
  const S = result.sun && result.sun.outputs; if (!S || !S.safety.runway || S.safety.runway.full === null) return { needs: ['cash accounts and monthly spending'] };
  const cash = S.invest.cashBalances.cents; const spend = S.safety.spendingWithPremiums.cents; const fixed = result.metrics.fixedRate.fixedMonthly ? result.metrics.fixedRate.fixedMonthly.cents : null; const fat = isQ(S.spending.fatFloorMonthly) ? S.spending.fatFloorMonthly.cents : null;
  const rungs = [{ key: 'full', label: 'Full spending', monthly: spend, months: S.safety.runway.full }];
  if (fixed) rungs.push({ key: 'draftt', label: 'Needs only', monthly: fixed, months: S.safety.runway.draftt });
  if (fat) rungs.push({ key: 'fat', label: 'FAT floor', monthly: fat, months: S.safety.runway.fat });
  return { cash, rungs, targetMonths: S.safety.ruleOf5Months, targetCents: isQ(S.safety.ruleOf5Target) ? S.safety.ruleOf5Target.cents : null };
}

/* 6 DRAFTT band chart: each share against its band. */
export function drafttBands(result) {
  const m = result.metrics && result.metrics.draftt; if (!m || m.status !== 'ok') return { needs: (m && m.needs) || ['take-home and spending lines'] };
  const v = m.value.value;
  const bands = { debt: [0, 0.15], retirement: [0.10, 0.20], accommodation: [0.25, 0.35], food: [0.08, 0.15], transportation: [0.05, 0.15], therapy: [0.02, 0.10] };
  return { lines: ['debt', 'retirement', 'accommodation', 'food', 'transportation', 'therapy'].map(k => ({ key: k, label: { debt: 'Debt', retirement: 'Retirement', accommodation: 'Accommodation', food: 'Food', transportation: 'Transportation', therapy: 'Therapy' }[k], share: v[k], band: bands[k] })), rough: m.value.rough };
}

/* 7 FI progress gauge. */
export function fiGauge(result) {
  const M = result.metrics; if (!M || M.pctToFi.status !== 'ok') return { needs: (M && M.pctToFi.needs) || ['net worth and spending'] };
  return { pct: M.pctToFi.value.value, coastPct: M.coastFi.status === 'ok' ? M.coastFi.coastPct : null, levels: M.fiLevels.status === 'ok' ? M.fiLevels.value.value : null, netWorth: M.netWorth.value.cents, fiNumber: M.fiNumber.value.cents, rough: M.fiNumber.value.rough };
}

/* 8 Contribution waterfall: match, HSA, Roth or IRA, 401k to the limit, taxable, with tax saved. */
export function contributionWaterfall(result) {
  const S = result.sun && result.sun.outputs; if (!S || !isQ(S.income.grossMonthly)) return { needs: ['income'] };
  const inv = S.invest, inc = S.income, tx = S.taxes;
  const steps = [];
  const marginal = tx && typeof tx.marginalRate === 'number' ? tx.marginalRate : 0;
  const match = isQ(inc.matchMonthly) ? inc.matchMonthly.cents * 12 : 0; const matchMax = inc.matchFormula ? inc.matchFormula.maxMonthly * 12 : 0;
  steps.push({ key: 'match', label: 'Employer match', done: match, room: Math.max(0, matchMax - match), taxSaved: 0 });
  const hsaRoom = (inv.roomLeft || []).find(r => r.limitId === 'hsa-self'); steps.push({ key: 'hsa', label: 'HSA', done: hsaRoom ? hsaRoom.used : (isQ(inc.hsaPayrollMonthly) ? inc.hsaPayrollMonthly.cents * 12 : 0), room: hsaRoom ? Math.max(0, hsaRoom.left) : 0, taxSaved: Math.round((hsaRoom ? hsaRoom.used : 0) * (marginal + 0.0765)) });
  const ira = (inv.roomLeft || []).find(r => r.limitId === 'ira'); steps.push({ key: 'ira', label: 'Roth or IRA', done: ira ? ira.used : 0, room: ira ? Math.max(0, ira.left) : 0, taxSaved: 0 });
  const k = (inv.roomLeft || []).find(r => r.limitId === '401k'); steps.push({ key: '401k', label: '401k to the limit', done: k ? k.used : 0, room: k ? Math.max(0, k.left) : 0, taxSaved: Math.round((isQ(inc.pretaxContribMonthly) ? inc.pretaxContribMonthly.cents * 12 : 0) * marginal) });
  const taxable = inv.annualContributions ? Math.max(0, inv.annualContributions.bank - (ira ? ira.used : 0) - (hsaRoom ? Math.max(0, hsaRoom.used - (isQ(inc.hsaPayrollMonthly) ? inc.hsaPayrollMonthly.cents * 12 : 0)) : 0)) : 0;
  steps.push({ key: 'taxable', label: 'Taxable', done: taxable, room: null, taxSaved: 0 });
  return { steps, marginal };
}

/* 9 Tax ladder: salary, less pre-tax deductions and the standard deduction, taxed by bracket; FICA beside it. */
export function taxLadder(result) {
  const S = result.sun && result.sun.outputs; const T = S && S.taxes; const I = S && S.income; const table = result.taxTable;
  if (!T || !I || !table || !T.taxable || T.taxable.status !== 'ok' || !I.grossMonthly || I.grossMonthly.status !== 'ok') return { needs: ['gross pay and a filing status'] };
  const status = (result.record && result.record.sun && result.record.sun.f.filingStatus && result.record.sun.f.filingStatus.v) || 'single';
  const gross = I.grossMonthly.cents * 12;
  const pretax = (['pretaxContribMonthly', 'hsaPayrollMonthly', 'pretaxOtherMonthly'].reduce((s, k) => s + (I[k] && I[k].status === 'ok' ? I[k].cents : 0), 0)) * 12;
  const std = T.standardDeduction; const taxable = T.taxable.cents;
  const brackets = (table.brackets[status] || table.brackets.single); let lower = 0; const steps = [];
  for (const [rate, upper] of brackets) {
    if (taxable <= lower) break;
    const top = upper === null ? taxable : Math.min(taxable, upper);
    steps.push({ rate, from: lower, to: top, amount: top - lower, tax: Math.round((top - lower) * rate) });
    lower = upper; if (upper === null || taxable <= upper) break;
  }
  const fed = steps.reduce((s, b) => s + b.tax, 0);
  const fica = T.ficaParts || { socialSecurity: 0, medicare: 0, total: 0 };
  const se = T.selfEmployment ? T.selfEmployment.tax : 0;
  return { gross, pretax, standardDeduction: std, taxable, brackets: steps, federal: fed, fica, selfEmployment: se, takeHome: gross - pretax - fed - fica.total - se, marginal: T.marginalRate, effective: T.effectiveRate, rough: !!I.grossMonthly.rough };
}

export const CHARTS = [
  { id: 'sankey', name: 'Cash flow', client: 'Where the money goes each month', build: sankey },
  { id: 'netWorth', name: 'Net worth to 95', client: 'What you could have over time', build: netWorthProjection },
  { id: 'balanceSheet', name: 'Balance sheet', client: 'What you own and owe', build: balanceSheet },
  { id: 'debtRace', name: 'Debt payoff', client: 'When each debt is gone', build: debtRace },
  { id: 'runway', name: 'Runway ladder', client: 'How long your cash lasts', build: runwayLadder },
  { id: 'draftt', name: 'DRAFTT bands', client: 'Each share of your pay against a healthy range', build: drafttBands },
  { id: 'fiGauge', name: 'FI progress', client: 'How far along you are', build: fiGauge },
  { id: 'waterfall', name: 'Contribution waterfall', client: 'Where new savings go first', build: contributionWaterfall },
  { id: 'taxes', name: 'Tax ladder', client: 'Where your pay goes before you see it', build: taxLadder },
];

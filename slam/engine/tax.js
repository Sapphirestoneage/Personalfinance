// Tax engine: one household's federal and New York income tax for a year.
// Federal brackets, standard deduction, FICA per person, self-employment tax
// (net x 92.35% x 15.3%, half deductible), unemployment (taxable, no SE tax),
// long-term gains and qualified dividends stacked on top of ordinary income,
// Roth conversion income, and NY State tax. Every line names the rules it used.
// marginal is federal plus state on the next ordinary dollar; marginalSe is
// the extra self-employment tax on the next dollar of 1099 profit.
// Bracket arithmetic is reused from the Budget's src/calc/tax.js.

import { bracketTax, marginalRate } from '../src/calc/tax.js';
import { statusRuleId } from './rules.js';
import { valueOf, tracker, round2, monthKey, addMonths } from './spine.js';
import { PRESETS } from './schema.js';
import { paidBetween, streamWeight } from './cashflow.js';

const v = valueOf;
const line = (value, rules = []) => ({ value: value === null ? null : round2(value), rules });
const rateLine = (value, rules = []) => ({ value, rules });

// computeTax(inputs, rules, year): numbers in, lines out. No spine here.
// inputs: { filingStatus, state, wages, ficaWages, seNet, unemployment,
//   otherOrdinary, conversions, ltcg, qualifiedDividends,
//   withheldFederal, withheldState, estimatedFederal, estimatedState }
export function computeTax(inp, R, year) {
  const fs = inp.filingStatus;
  const id = (p) => statusRuleId(p, fs);
  const g = (rid) => R.get(rid, year);
  const n = (x) => x || 0;

  // FICA per person on wages (withheld by the employer; not part of the balance due).
  const ssRate = g('FICA_SS_RATE'), medRate = g('FICA_MED_RATE'), wageBase = g('SS_WAGE');
  const ficaWages = inp.ficaWages ?? inp.wages ?? 0;
  const fica = line(Math.min(ficaWages, wageBase) * ssRate + ficaWages * medRate, ['FICA_SS_RATE', 'FICA_MED_RATE', 'SS_WAGE']);

  // Self-employment tax.
  const seBase = n(inp.seNet) * g('SE_FACTOR');
  let seTax = 0;
  if (seBase >= g('SE_MIN')) seTax = Math.min(seBase, Math.max(0, wageBase - ficaWages)) * g('SE_SS_RATE') + seBase * g('SE_MED_RATE');
  const se = line(seTax, ['SE_FACTOR', 'SE_MIN', 'SE_SS_RATE', 'SE_MED_RATE', 'SS_WAGE']);
  const seDeduction = line(seTax * g('SE_DEDUCT_SHARE'), ['SE_DEDUCT_SHARE']);

  const pref = n(inp.ltcg) + n(inp.qualifiedDividends);
  const grossIncome = n(inp.wages) + n(inp.seNet) + n(inp.unemployment) + n(inp.otherOrdinary) + n(inp.conversions) + pref;
  const agi = grossIncome - seDeduction.value;
  const std = g(id('STD'));
  const taxable = Math.max(0, agi - std);
  const ordinaryTaxable = Math.max(0, taxable - pref);
  const brackets = g(id('FED_BRK'));
  const ordinaryTax = bracketTax(ordinaryTaxable, brackets);

  // Gains stack on top of ordinary income: the part under the 0% top pays 0,
  // the part under the 15% top pays 15%, the rest 20%.
  const top0 = g(id('LTCG0')), top15 = g(id('LTCG15'));
  const in0 = Math.max(0, Math.min(taxable, top0) - ordinaryTaxable);
  const in15 = Math.max(0, Math.min(taxable, top15) - Math.max(ordinaryTaxable, top0));
  const in20 = Math.max(0, taxable - Math.max(ordinaryTaxable, top15));
  const prefTax = in0 * g('LTCG_RATE_0') + in15 * g('LTCG_RATE_15') + in20 * g('LTCG_RATE_20');

  const medWages = ficaWages + seBase;
  const addMed = Math.max(0, medWages - g(id('ADD_MED'))) * g('ADD_MED_RATE');

  const federalIncomeTax = ordinaryTax + prefTax;
  const federalTotal = federalIncomeTax + seTax + addMed;

  // New York State: NY AGI taken as federal AGI (no NY subtractions modeled).
  let stateTax = null, stateTaxable = null, stateMarginal = null, stateRules = [];
  if (inp.state === 'NY') {
    stateRules = [id('NY_BRK'), id('NY_STD')];
    stateTaxable = Math.max(0, agi - g(id('NY_STD')));
    stateTax = bracketTax(stateTaxable, g(id('NY_BRK')));
    stateMarginal = marginalRate(stateTaxable, g(id('NY_BRK')));
  }
  const total = stateTax === null ? null : federalTotal + stateTax;
  const withheld = n(inp.withheldFederal) + n(inp.withheldState);
  const paid = n(inp.estimatedFederal) + n(inp.estimatedState);
  const fedMarginal = marginalRate(ordinaryTaxable, brackets);
  const seMarginal = seBase >= g('SE_MIN') ? g('SE_FACTOR') * (g('SE_MED_RATE') + (seBase + ficaWages < wageBase ? g('SE_SS_RATE') : 0)) : 0;

  return {
    year, filingStatus: fs,
    lines: {
      grossIncome: line(grossIncome),
      fica, seTax: se, seDeduction,
      agi: line(agi, ['SE_DEDUCT_SHARE']),
      standardDeduction: line(std, [id('STD')]),
      taxable: line(taxable, [id('STD')]),
      ordinaryTax: line(ordinaryTax, [id('FED_BRK')]),
      gainsTax: line(prefTax, [id('LTCG0'), id('LTCG15'), 'LTCG_RATE_0', 'LTCG_RATE_15', 'LTCG_RATE_20']),
      additionalMedicare: line(addMed, ['ADD_MED_RATE', id('ADD_MED')]),
      federalIncomeTax: line(federalIncomeTax, [id('FED_BRK'), id('LTCG0'), id('LTCG15')]),
      federalTotal: line(federalTotal, [id('FED_BRK'), 'SE_FACTOR', 'ADD_MED_RATE']),
      stateTaxable: line(stateTaxable, stateRules),
      stateTax: line(stateTax, stateRules),
      total: line(total, [id('FED_BRK'), ...stateRules]),
      withheld: line(withheld),
      estimatedPaid: line(paid),
      balanceDue: line(total === null ? null : total - withheld - paid, [id('FED_BRK'), ...stateRules]),
      marginalFederal: rateLine(fedMarginal, [id('FED_BRK')]),
      marginalState: rateLine(stateMarginal, stateRules.slice(0, 1)),
      marginalSe: rateLine(seMarginal, ['SE_FACTOR', 'SE_SS_RATE', 'SE_MED_RATE']),
      marginal: rateLine(stateMarginal === null ? null : fedMarginal + stateMarginal, [id('FED_BRK'), ...stateRules.slice(0, 1)]),
      effective: rateLine(total === null || grossIncome <= 0 ? null : total / grossIncome, [id('FED_BRK'), ...stateRules])
    }
  };
}

// The next estimated tax due date on or after asOf (EST_Q1..EST_Q4).
export function nextEstimatedDate(asOf, R) {
  const y = +asOf.slice(0, 4);
  const cands = [];
  for (const ty of [y - 1, y, y + 1]) {
    for (const [q, rid] of [[1, 'EST_Q1'], [2, 'EST_Q2'], [3, 'EST_Q3']]) cands.push({ date: ty + '-' + R.get(rid, ty), taxYear: ty, quarter: q, rule: rid });
    cands.push({ date: ty + 1 + '-' + R.get('EST_Q4', ty), taxYear: ty, quarter: 4, rule: 'EST_Q4' });
  }
  return cands.filter((c) => c.date >= asOf).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
}

// Gather a year's tax inputs from the spine. Streams count in committed mode
// (maybe money only at likelihood 1) unless mode is expected (weighted). Returns the inputs, which fields were
// read, and which were missing (income amounts and withholding separately).
export function taxInputs(spine, R, year, mode = 'committed') {
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const t = tracker();
  const miss = { wages: [], income: [], withholding: [], other: [] };
  const notModeled = [];
  const known = { wages: 0, ficaWages: 0, seNet: 0, unemployment: 0, otherOrdinary: 0, conversions: 0, ltcg: 0, qualifiedDividends: 0, withheldFederal: 0, withheldState: 0, estimatedFederal: 0, estimatedState: 0 };
  const status = t.read(spine, 'household.filingStatus');
  if (status === null) miss.other.push('household.filingStatus');
  const state = t.read(spine, 'household.state');
  if (state !== null && state !== 'NY') notModeled.push('State tax for ' + state);
  if (state === null) miss.other.push('household.state');
  if (v(spine.household.nycResident) === true) notModeled.push('New York City income tax');
  t.read(spine, 'household.nycResident');

  let w2Months = 0;
  for (const s of spine.income || []) {
    if ((s.start && s.start > to) || (s.end && s.end < from)) continue;
    if (s.cadence === 'once' && !(s.start >= from && s.start <= to)) continue;
    const w = streamWeight(s, mode, t);
    if (w === 0) continue;
    const base = 'income.' + s.id;
    if (s.type === 'ss') { notModeled.push('Social Security benefits (' + s.label + ')'); continue; }
    const amt = t.useFact(base + '.amount', s.amount);
    const paid = amt === null ? null : paidBetween(amt, s.cadence, s.start, s.end, from, to) * (w ?? 1);
    if (amt === null) (s.type === 'w2' || s.type === 'tips' ? miss.wages : miss.income).push(base + '.amount');
    else if (s.type === 'w2' || s.type === 'tips') { known.wages += paid; known.ficaWages += paid; }
    else if (s.type === '1099') known.seNet += paid;
    else if (s.type === 'unemployment') known.unemployment += paid;
    else known.otherOrdinary += paid;
    if (s.type === 'w2' || s.type === 'tips') {
      const a = s.start && s.start > from ? s.start : from, b = s.end && s.end < to ? s.end : to;
      w2Months = Math.max(w2Months, (+b.slice(5, 7)) - (+a.slice(5, 7)) + 1);
    }
    for (const [k, key] of [['federal', 'withheldFederal'], ['state', 'withheldState']]) {
      const f = s.withholding && s.withholding[k];
      const x = t.useFact(base + '.withholding.' + k, f);
      if (x === null) miss.withholding.push(base + '.withholding.' + k);
      else known[key] += paidBetween(x, s.cadence, s.start, s.end, from, to) * (w ?? 1);
    }
  }
  // Pre-tax payroll contributions lower W-2 wages (not FICA wages) while a paycheck runs.
  for (const a of spine.accounts || []) {
    const pre = PRESETS[a.type] && PRESETS[a.type].taxTreatment === 'pretax' && (a.family === 'employerRetirement' || a.family === 'hsaFsa');
    if (!pre || !a.monthlyContribution || !w2Months) continue;
    const c = t.useFact('accounts.' + a.id + '.monthlyContribution', a.monthlyContribution);
    if (c !== null) known.wages -= c * w2Months;
  }
  // Roth conversions in the year are ordinary income.
  for (const a of spine.accounts || []) {
    const list = a.conversions ? t.useFact('accounts.' + a.id + '.conversions', a.conversions) : null;
    for (const c of list || []) if (c.year === year) {
      if (typeof c.taxable === 'number') known.conversions += c.taxable;
      else miss.income.push('accounts.' + a.id + '.conversions');
    }
  }
  // The tax year's own entries: estimated payments, gains, dividends.
  const ty = (spine.taxYears || []).find((x) => x.year === year);
  const notes = [];
  if (!ty) notes.push('No ' + year + ' estimated payments, capital gains or dividends entered; counted as none.');
  else {
    const base = 'taxYears.' + ty.id;
    for (const [k, key] of [['estimatedPaidFederal', 'estimatedFederal'], ['estimatedPaidState', 'estimatedState'], ['capitalGainsLong', 'ltcg'], ['qualifiedDividends', 'qualifiedDividends'], ['otherIncome', 'otherOrdinary']]) {
      if (!ty[k]) continue;
      const x = t.useFact(base + '.' + k, ty[k]);
      if (x === null) (k.startsWith('estimated') ? miss.withholding : miss.income).push(base + '.' + k);
      else known[key] += x;
    }
  }
  return { inputs: { filingStatus: status, state, ...known }, tracker: t, missing: miss, notModeled, notes };
}

// Words for what is missing: "2026 W-2 wages and withholding".
function missingWords(year, miss) {
  const parts = [];
  if (miss.wages.length) parts.push('W-2 wages');
  if (miss.income.length) parts.push(miss.wages.length ? 'other income' : 'income amounts');
  if (miss.withholding.length) parts.push('withholding');
  if (miss.other.length) parts.push('filing details');
  if (!parts.length) return null;
  const last = parts.pop();
  return 'missing: ' + year + ' ' + (parts.length ? parts.join(', ') + ' and ' + last : last);
}

// The household's tax for a year. When an income amount is missing the tax is
// not a number: owed and balanceDue are null and missingText names what is
// needed. `partial` is the tax on the income that is known, a floor.
export function taxForYear(spine, R, year, { asOf = spine.meta.asOf, mode = 'committed' } = {}) {
  const { inputs, tracker: t, missing, notModeled, notes } = taxInputs(spine, R, year, mode);
  const snap = t.snapshot();
  const incomeMissing = missing.wages.length + missing.income.length + missing.other.length > 0;
  const withholdingMissing = missing.withholding.length > 0;
  const canCompute = inputs.filingStatus !== null;
  const calc = canCompute ? computeTax(inputs, R, year) : null;
  const wrap = (lineObj, blockedBy) => {
    const blocked = blockedBy.some((x) => x);
    const base = { from: snap.from, rough: snap.rough, missing: blocked ? snap.missing : [], rules: lineObj ? lineObj.rules : [] };
    const value = !lineObj || blocked ? null : lineObj.value;
    const out = { value, kind: value === null ? 'missing' : base.rough.length || notModeled.length || notes.length ? 'rough' : 'computed', ...base };
    return out;
  };
  const L = calc ? calc.lines : {};
  const lines = {};
  for (const k of Object.keys(L)) lines[k] = wrap(L[k], [incomeMissing || (k === 'stateTax' && L[k].value === null)]);
  lines.withheld = wrap(L.withheld, [withholdingMissing]);
  lines.estimatedPaid = wrap(L.estimatedPaid, [withholdingMissing]);
  lines.balanceDue = wrap(L.balanceDue, [incomeMissing, withholdingMissing, L.total && L.total.value === null]);
  const partial = canCompute ? computeTax(inputs, R, year) : null;
  return {
    year,
    owed: lines.total || wrap(null, [true]),
    withheld: lines.withheld || wrap(null, [true]),
    balanceDue: lines.balanceDue || wrap(null, [true]),
    marginal: lines.marginal || wrap(null, [true]),
    effective: lines.effective || wrap(null, [true]),
    lines,
    inputs,
    missingText: missingWords(year, missing),
    missingPaths: { ...missing },
    notModeled,
    notes,
    // Tax on the known income only: a floor while something is missing.
    partial: partial && { federalIncomeTax: partial.lines.federalIncomeTax, federalTotal: partial.lines.federalTotal, stateTax: partial.lines.stateTax, total: partial.lines.total, marginalFederal: partial.lines.marginalFederal, marginalState: partial.lines.marginalState, marginalSe: partial.lines.marginalSe },
    nextEstimated: nextEstimatedDate(asOf, R)
  };
}

// ---------------------------------------------------------------- monthly tax set-aside (S-172)
// Money that should go aside each month for tax nobody withholds: income with
// no federal withholding (unemployment, 1099; 1099 adds self-employment tax)
// at the marginal federal plus state rate, and a Roth conversion's tax spread
// over the months from max(as-of month, January of its year) through
// TAX_RETURN_DUE the next year. The rates come from the year's tax; when an
// input is missing they come from the income known so far (a floor), and the
// result names what is missing.
const taxMemo = new WeakMap();
export function yearTax(spine, R, year, mode = 'committed', cache = null) {
  let c = cache;
  if (!c) { c = taxMemo.get(spine); if (!c) { c = new Map(); taxMemo.set(spine, c); } }
  const key = year + ':' + mode;
  if (!c.has(key)) c.set(key, taxForYear(spine, R, year, { mode }));
  return c.get(key);
}

function marginalFor(tx, t) {
  const L = tx.lines, P = tx.partial;
  const full = L.marginalFederal && L.marginalFederal.value !== null && tx.owed.value !== null;
  const src = full ? { f: L.marginalFederal, s: L.marginalState, e: L.marginalSe } : P ? { f: P.marginalFederal, s: P.marginalState, e: P.marginalSe } : null;
  if (!src) return null;
  if (!full) for (const p of tx.balanceDue.missing) t.addMissing(p);
  for (const l of [src.f, src.s, src.e]) for (const r of (l && l.rules) || []) t.rule(R0, r);
  return { federal: src.f.value ?? 0, state: src.s ? src.s.value ?? 0 : 0, se: src.e ? src.e.value ?? 0 : 0 };
}
let R0 = null;

export function taxSetAside(spine, R, ym, { mode = 'committed', streams = [], cache = null } = {}) {
  R0 = R;
  const year = +ym.slice(0, 4);
  const t = tracker();
  const lines = [];
  let total = 0;
  const tx = yearTax(spine, R, year, mode, cache);
  const rate = marginalFor(tx, t);
  for (const st of streams) {
    if (!st.included || !st.gross) continue;
    const src = (spine.income || []).find((x) => x.id === st.id);
    if (!src || src.type === 'w2' || src.type === 'tips' || valueOf(src.withholding && src.withholding.federal) !== 0) continue;
    if (!rate) { t.addMissing('household.filingStatus'); continue; }
    t.useFact('income.' + st.id + '.amount', src.amount);
    t.useFact('income.' + st.id + '.withholding.federal', src.withholding.federal);
    const r = rate.federal + rate.state + (src.type === '1099' ? rate.se : 0);
    const amount = st.gross * r;
    total += amount;
    lines.push({ kind: 'income', id: st.id, label: st.label, base: round2(st.gross), rate: r, amount: round2(amount), taxYear: year });
  }
  // Roth conversions of this tax year or last (their tax is still being set aside until the return is due).
  const due = R.get('TAX_RETURN_DUE', year);
  const asOfYm = monthKey(spine.meta.asOf);
  for (const ty of [year, year - 1]) {
    const endYm = (ty + 1) + '-' + due.slice(0, 2);
    const startYm = asOfYm > ty + '-01' ? asOfYm : ty + '-01';
    if (ym < startYm || ym > endYm) continue;
    const months = (+endYm.slice(0, 4) - +startYm.slice(0, 4)) * 12 + (+endYm.slice(5) - +startYm.slice(5)) + 1;
    const txY = ty === year ? tx : yearTax(spine, R, ty, mode, cache);
    const rY = ty === year ? rate : marginalFor(txY, t);
    for (const a of spine.accounts || []) for (const c of valueOf(a.conversions) || []) {
      if (c.year !== ty || typeof c.taxable !== 'number' || !rY) continue;
      t.useFact('accounts.' + a.id + '.conversions', a.conversions);
      const r = rY.federal + rY.state;
      const amount = c.taxable * r / months;
      total += amount;
      lines.push({ kind: 'conversion', id: a.id, label: 'Roth conversion ' + ty, base: c.taxable, rate: r, months, amount: round2(amount), taxYear: ty });
    }
  }
  t.rule(R, 'TAX_RETURN_DUE', year);
  return { total: t.out(round2(total)), lines, rate };
}

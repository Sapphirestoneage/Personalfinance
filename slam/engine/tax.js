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
import { valueOf, tracker, round2, monthKey, addMonths, accountOwner, incomeOwner } from './spine.js';
import { PRESETS } from './schema.js';
import { paidBetween, streamWeight } from './cashflow.js';
import { yearAmount, hasTotal, hsaLimit, familyHsa, hsaEligible, counts, payAmount, hasPay, fromPayIn } from './contrib.js';

const v = valueOf;
const line = (value, rules = []) => ({ value: value === null ? null : round2(value), rules });
const rateLine = (value, rules = []) => ({ value, rules });

// Self-employment tax on a year's 1099 profit: net x SE_FACTOR, Social Security
// up to what is left of the wage base after W-2 wages, Medicare on all of it,
// nothing under SE_MIN; half is deductible. One formula, used by the tax and
// by earned income.
export const SE_RULES = ['SE_FACTOR', 'SE_MIN', 'SE_SS_RATE', 'SE_MED_RATE', 'SS_WAGE', 'SE_DEDUCT_SHARE'];
export function seTaxFor(seNet, ficaWages, R, year) {
  const g = (rid) => R.get(rid, year);
  const base = (seNet || 0) * g('SE_FACTOR');
  const tax = base >= g('SE_MIN') ? Math.min(base, Math.max(0, g('SS_WAGE') - (ficaWages || 0))) * g('SE_SS_RATE') + base * g('SE_MED_RATE') : 0;
  return { base, tax, deduction: tax * g('SE_DEDUCT_SHARE') };
}

// computeTax(inputs, rules, year): numbers in, lines out. No spine here.
// inputs: { filingStatus, state, wages, ficaWages, seNet, unemployment,
//   otherOrdinary, conversions, ltcg, qualifiedDividends, hsaDeduction, sePeople: [{ seNet, ficaWages }],
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
  const per = inp.sePeople && inp.sePeople.length ? inp.sePeople.map((p) => seTaxFor(p.seNet, p.ficaWages, R, year)) : [seTaxFor(inp.seNet, ficaWages, R, year)];
  const seBase = per.reduce((x, p) => x + p.base, 0), seTax = per.reduce((x, p) => x + p.tax, 0), seDed = per.reduce((x, p) => x + p.deduction, 0);
  const se = line(seTax, ['SE_FACTOR', 'SE_MIN', 'SE_SS_RATE', 'SE_MED_RATE', 'SS_WAGE']);
  const seDeduction = line(seDed, ['SE_DEDUCT_SHARE']);

  const pref = n(inp.ltcg) + n(inp.qualifiedDividends);
  const grossIncome = n(inp.wages) + n(inp.seNet) + n(inp.unemployment) + n(inp.otherOrdinary) + n(inp.conversions) + pref;
  // Money put into an HSA directly is deducted above the line (Form 8889); through payroll it never reached wages.
  const hsaDeduction = line(n(inp.hsaDeduction));
  const agi = grossIncome - seDeduction.value - hsaDeduction.value;
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
      fica, seTax: se, seDeduction, hsaDeduction,
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
  const known = { wages: 0, ficaWages: 0, seNet: 0, unemployment: 0, otherOrdinary: 0, conversions: 0, ltcg: 0, qualifiedDividends: 0, hsaDeduction: 0, withheldFederal: 0, withheldState: 0, estimatedFederal: 0, estimatedState: 0 };
  // The earning lines (W-2, tips, 1099) and the pre-tax payroll saving taken off them, for earnedIncome.
  const earned = { lines: [], pretax: [] };
  const status = t.read(spine, 'household.filingStatus');
  if (status === null) miss.other.push('household.filingStatus');
  const state = t.read(spine, 'household.state');
  if (state !== null && state !== 'NY') notModeled.push('State tax for ' + state);
  if (state === null) miss.other.push('household.state');
  if (v(spine.household.nycResident) === true) notModeled.push('New York City income tax');
  t.read(spine, 'household.nycResident');

  let w2Months = 0;
  // Each person's months of pay, wages, FICA wages and self-employment profit (S-213, S-214).
  const payMonths = {}, payByMonth = {}, wagesBy = {}, ficaBy = {}, seBy = {};
  const add = (o, k, x) => { o[k] = (o[k] || 0) + x; };
  for (const s of spine.income || []) {
    if ((s.start && s.start > to) || (s.end && s.end < from)) continue;
    if (s.cadence === 'once' && !(s.start >= from && s.start <= to)) continue;
    const w = streamWeight(s, mode, t);
    if (w === 0) continue;
    const base = 'income.' + s.id;
    if (s.type === 'ss') { notModeled.push('Social Security benefits (' + s.label + ')'); continue; }
    const amt = t.useFact(base + '.amount', s.amount);
    const paid = amt === null ? null : paidBetween(amt, s.cadence, s.start, s.end, from, to) * (w ?? 1);
    let beLine = null;
    if (amt === null) (s.type === 'w2' || s.type === 'tips' ? miss.wages : miss.income).push(base + '.amount');
    else if (s.type === 'w2' || s.type === 'tips') { known.wages += paid; known.ficaWages += paid; add(wagesBy, incomeOwner(spine, s), paid); add(ficaBy, incomeOwner(spine, s), paid); }
    else if (s.type === '1099') {
      // Profit = gross less business expenses (S-179); none entered means none.
      const be = s.businessExpenses ? t.useFact(base + '.businessExpenses', s.businessExpenses) : null;
      const beYear = be === null ? 0 : paidBetween(be, s.cadence, s.start, s.end, from, to) * (w ?? 1);
      known.seNet += paid - beYear;
      add(seBy, incomeOwner(spine, s), paid - beYear);
      if (be !== null) beLine = { id: s.id, type: 'be', label: s.label + ': business expenses', path: base + '.businessExpenses', amount: -beYear, personId: s.personId || null, reads: [] };
    }
    else if (s.type === 'unemployment') known.unemployment += paid;
    else known.otherOrdinary += paid;
    if (s.type === 'w2' || s.type === 'tips' || s.type === '1099') {
      // Each line keeps whose it is and, for pay, the months of the year it runs (pre-tax saving comes out of those).
      const a = s.start && s.start > from ? s.start : from, b = s.end && s.end < to ? s.end : to;
      earned.lines.push({ id: s.id, type: s.type, label: s.label, path: base + '.amount', amount: paid, personId: s.personId || null, months: amt === 0 ? 0 : (+b.slice(5, 7)) - (+a.slice(5, 7)) + 1, reads: [base + '.amount', ...(s.likelihood ? [base + '.likelihood'] : []), ...(s.type === '1099' && s.businessExpenses ? [base + '.businessExpenses'] : [])] }, ...(beLine ? [beLine] : []));
    }
    // A line known to pay $0 has no months of pay: nothing comes out of it.
    if ((s.type === 'w2' || s.type === 'tips') && amt !== 0) {
      const a = s.start && s.start > from ? s.start : from, b = s.end && s.end < to ? s.end : to;
      const months = (+b.slice(5, 7)) - (+a.slice(5, 7)) + 1;
      w2Months = Math.max(w2Months, months);
      // Each person's pay by month: certain, and likely (in full and as counted, in the expected mode). Payroll saving
      // comes out of its owner's pay (S-211).
      const who = incomeOwner(spine, s);
      payByMonth[who] = payByMonth[who] || Array.from({ length: 12 }, () => ({ sure: 0, full: 0, counted: 0, sureUsed: 0, likelyUsed: 0 }));
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0'), g = paidBetween(amt, s.cadence, s.start, s.end, year + '-' + mm + '-01', year + '-' + mm + '-' + String(new Date(Date.UTC(year, m, 0)).getUTCDate()).padStart(2, '0'));
        const x = payByMonth[who][m - 1];
        if (g && (w ?? 1) === 1) x.sure += g; else if (g) { x.full += g; x.counted += g * w; }
      }
      // Months of pay: a month with certain pay counts whole (a part month too; a one-time line is its own month), one
      // with only likely pay as likely as it is.
      payMonths[who] = Math.round(payByMonth[who].reduce((n, x) => n + (x.sure ? 1 : x.full ? x.counted / x.full : 0), 0) * 10000) / 10000;
    }
    for (const [k, key] of [['federal', 'withheldFederal'], ['state', 'withheldState']]) {
      const f = s.withholding && s.withholding[k];
      const x = t.useFact(base + '.withholding.' + k, f);
      if (x === null) miss.withholding.push(base + '.withholding.' + k);
      else known[key] += paidBetween(x, s.cadence, s.start, s.end, from, to) * (w ?? 1);
    }
  }
  // Pre-tax payroll saving lowers its owner's W-2 wages (never below $0): the recorded total for the year when there
  // is one (plus what the monthly amount still puts in), else the monthly amount for the owner's months of pay. An HSA
  // or FSA through payroll is a cafeteria plan, so it lowers FICA wages too (Publication 969; a 401(k) deferral does
  // not). An HSA put in directly is a deduction on the return (Form 8889). HSA money, through pay or not, counts only up
  // to the HSA limit less employer money (S-212, S-214).
  const asOf = spine.meta && spine.meta.asOf ? spine.meta.asOf : to;
  const ownerOf = (a) => (accountOwner(spine, a) || {}).id;
  const takeOff = (a, owner, amount, cafeteria, months) => {
    const x = round2(Math.max(0, Math.min(amount, wagesBy[owner] || 0)));
    wagesBy[owner] = (wagesBy[owner] || 0) - x;
    known.wages -= x;
    if (cafeteria) { known.ficaWages -= x; add(ficaBy, owner, -x); }
    earned.pretax.push({ id: a.id, name: v(a.name) || a.id, path: 'accounts.' + a.id + (months ? '.monthlyContribution' : '.contributions'), yearly: x, months, ownerId: owner, cafeteria });
    return x;
  };
  // A monthly amount from pay, when every pay line of the owner counts in full or not at all in this mode (always in the
  // committed mode, which the Plan and the pay an IRA can count read): what engine/contrib.js counts for the year, in so
  // far and still to come (27 biweekly paydays hold more than 12 months), the same count a recorded total uses, so
  // recording the Plan's own money never changes the pay. With a likely pay line in the expected mode: month by month,
  // as certain as that month's pay and never more than it (adding pay never lowers what is left).
  const inYear = (s) => !(s.start && s.start > to) && !(s.end && s.end < from) && (s.cadence !== 'once' || (s.start >= from && s.start <= to));
  const firm = (owner) => (spine.income || []).filter((s) => (s.type === 'w2' || s.type === 'tips') && incomeOwner(spine, s) === owner && inYear(s) && !(s.amount && valueOf(s.amount) === 0)).every((s) => [0, 1].includes(streamWeight(s, mode)));
  // A month's saving: what its certain pay covers, then the rest as likely as its likely pay, never more than the pay left
  // that month after the owner's other saving from pay.
  const byMonths = (owner, c) => round2((payByMonth[owner] || []).reduce((n, x) => {
    const sure = Math.min(c, round2(x.sure - x.sureUsed)), likely = x.full ? Math.min((c - sure) * x.counted / x.full, round2(x.counted - x.likelyUsed)) : 0;
    x.sureUsed = round2(x.sureUsed + sure); x.likelyUsed = round2(x.likelyUsed + likely);
    return n + sure + likely;
  }, 0));
  const payPart = (a, owner, c, om) => {
    if (!firm(owner)) return { value: byMonths(owner, c), months: om };
    // A plan the Plan counts (from pay that year): its count. Its guesses are the Plan's (rough there); here the monthly
    // amount read above is the fact. Anything else from pay (an FSA): paycheck by paycheck, else month by month.
    if (!fromPayIn(spine, a, owner, year)) return { value: (hasPay(spine, owner) ? payAmount(spine, owner, year, c, () => true) : null) ?? byMonths(owner, c), months: om };
    const y = yearAmount(spine, a, year, asOf, tracker(), 'own'), n = (y.in.months || 0) + ((y.still && y.still.months) || 0);
    return { value: y.value, months: n ? Math.max(0.1, Math.round(n * 10) / 10) : om };
  };
  // One account's pre-tax money: the recorded total for the year, else its monthly amount as amountOf counts it.
  const preTax = (a, owner, om, cafeteria, amountOf) => {
    if (hasTotal(a, year)) return takeOff(a, owner, yearAmount(spine, a, year, asOf, t, 'own').value, cafeteria, null);
    if (!a.monthlyContribution) return;
    const c = t.useFact('accounts.' + a.id + '.monthlyContribution', a.monthlyContribution);
    if (c !== null) { const x = amountOf(a, owner, c, om); takeOff(a, owner, x.value, cafeteria, x.months); }
    else earned.pretax.push({ id: a.id, name: v(a.name) || a.id, path: 'accounts.' + a.id + '.monthlyContribution', yearly: null, months: om, ownerId: owner, cafeteria });
  };
  // A Solo 401(k) is filled from take-home, not from the W-2 pay: it comes off the wages last, after every amount that
  // does come out of pay, so it never crowds one out (engine/maxit.js adds back what it took, for the pay an IRA counts).
  const hsas = [], solos = [];
  // In a fixed order (by id), so what comes off the wages never turns on the order the accounts are listed in.
  for (const a of [...(spine.accounts || [])].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
    const pretax = PRESETS[a.type] && PRESETS[a.type].taxTreatment === 'pretax';
    const cafeteria = a.family === 'hsaFsa' && (a.type === 'hsa' || pretax);
    const pre = cafeteria || (pretax && a.family === 'employerRetirement');
    const owner = ownerOf(a);
    const om = payMonths[owner] || 0;
    const fromPay = !!(om && a.monthlyContribution);
    if (a.type === 'hsa') {
      // An HSA on a plan that is not HSA-eligible has a $0 limit: its money is all excess, so it stays in wages and
      // is never deducted (Form 8889).
      if (!hsaEligible(a)) { t.useFact('accounts.' + a.id + '.planEligible', a.planEligible); continue; }
      // HSA money for the year: the recorded total and what the monthly amount still adds, else the monthly forecast.
      // Employer money (a recorded employer total, else the yearly employer amount) comes off the limit, not off pay.
      const y = hasTotal(a, year) || !fromPay ? yearAmount(spine, a, year, asOf, t, 'own') : null;
      if (y && y.in.kind === 'missing') t.addRough('accounts.' + a.id + '.monthlyContribution');
      const c = fromPay && !y ? t.useFact('accounts.' + a.id + '.monthlyContribution', a.monthlyContribution) : null;
      const list = a.contributions ? v(a.contributions) || [] : [];
      const emp = list.filter((x) => counts(x, year) && x.kind === 'employer');
      const seed = emp.length ? (t.read(spine, 'accounts.' + a.id + '.contributions'), emp.reduce((s, x) => s + x.amount, 0))
        : a.employerSeed && year <= +asOf.slice(0, 4) ? t.useFact('accounts.' + a.id + '.employerSeed', a.employerSeed) || 0 : 0;
      if (fromPay && !y && c === null) earned.pretax.push({ id: a.id, name: v(a.name) || a.id, path: 'accounts.' + a.id + '.monthlyContribution', yearly: null, months: om, ownerId: owner, cafeteria: true });
      else { const x = y ? null : payPart(a, owner, c, om); hsas.push({ a, owner, fromPay, amount: y ? y.value : x.value, months: y ? null : x.months, seed }); }
      continue;
    }
    if (!pre || !om) continue;
    if (a.type === 'solo_k401') { solos.push({ a, owner, om }); continue; }
    preTax(a, owner, om, cafeteria, payPart);
  }
  // The HSA limit: per owner for self-only coverage, one family limit plus each owner's catch-up for family coverage.
  // Money through pay counts first; employer money comes off the limit.
  const fam = familyHsa(spine);
  for (const key of [...new Set(hsas.map((x) => (fam ? 'family' : x.owner)))]) {
    const group = hsas.filter((x) => (fam ? 'family' : x.owner) === key);
    const L = group.map((x) => ({ ...hsaLimit(spine, R, x.a, year, t), owner: x.owner }));
    const owners = [...new Set(L.map((l) => l.owner))];
    const limit = fam ? Math.max(...L.map((l) => l.base * l.share)) + owners.reduce((s, o) => s + Math.max(...L.filter((l) => l.owner === o).map((l) => l.catchUp * l.share)), 0) : Math.max(...L.map((l) => l.value));
    const seed = group.reduce((s, x) => s + x.seed, 0);
    let left = Math.max(0, round2(limit - seed));
    for (const x of [...group.filter((g) => g.fromPay), ...group.filter((g) => !g.fromPay)]) {
      const amt = round2(Math.max(0, Math.min(x.amount, left)));
      // Money from pay its owner's wages cannot hold does not use the shared limit.
      if (x.fromPay) left = round2(left - takeOff(x.a, x.owner, amt, true, x.months));
      else { left = round2(left - amt); known.hsaDeduction += amt; }
    }
  }
  for (const x of solos) preTax(x.a, x.owner, x.om, false, (a, owner, c, om) => ({ value: c * om, months: om }));
  // Self-employment tax is each person's own (Schedule SE), against their own W-2 and tips FICA wages.
  known.sePeople = Object.keys(seBy).map((o) => ({ seNet: seBy[o], ficaWages: Math.max(0, ficaBy[o] || 0) }));
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
  return { inputs: { filingStatus: status, state, ...known }, tracker: t, missing: miss, notModeled, notes, earned };
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

// ---------------------------------------------------------------- earned income (S-210)
// A year's earned income, what IRA room is capped at: W-2 and tips wages for
// the part of the year each line runs, less pre-tax payroll saving (the wages
// a W-2 shows), plus 1099 profit less half its self-employment tax.
// Unemployment, rental, pensions, Social Security and other income are not
// earned, and a 1099 loss never lowers wages. Committed mode by default: maybe
// money counts only at likelihood 1. With a personId, only that person's lines
// (a line with no person is the first person's) and the pre-tax saving of the
// accounts they own (S-211). An earning line in the year with no amount makes
// it missing, naming that line's amount; a household with no income lines at
// all is missing too, named "<year> earned income". Never a bare collection path.
// earnedIncome(spine, R, year, { mode, personId }) -> Result + { year, label, lines: [{ label, path, amount }], seDeduction, wages, seNet, seEarnings }
export function earnedIncome(spine, R, year, { mode = 'committed', personId = null } = {}) {
  const { earned } = taxInputs(spine, R, year, mode);
  const t = tracker();
  const people = spine.household.people || [];
  const first = people[0] ? people[0].id : null, partner = people[1] ? people[1].id : null;
  const whose = (pid) => pid || first;
  const mine = (pid) => personId === null || whose(pid) === personId;
  const own = earned.lines.filter((l) => mine(l.personId));
  const pre = earned.pretax.filter((p) => mine(p.ownerId));
  for (const l of own) for (const p of l.reads) t.read(spine, p);
  const person = personId && people.length > 1 ? people.find((x) => x.id === personId) : null;
  const label = year + ' earned income' + (person ? ', ' + person.name : '');
  // Pre-tax saving comes off the owner's pay for the months their W-2 or tips run.
  const lines = own.map((l) => ({ label: l.label, path: l.path, amount: l.amount === null ? null : round2(l.amount), type: l.type }));
  // What the tax engine took off each owner's wages (capped at those wages): the same amount here.
  for (const p of pre) {
    t.read(spine, p.path);
    lines.push({ label: p.name + ': pre-tax saving from pay' + (p.months ? ' (' + p.months + ' month' + (p.months === 1 ? '' : 's') + ')' : ' (recorded for ' + year + ')'), path: p.path, amount: p.yearly === null ? null : round2(-p.yearly), type: 'pretax', cafeteria: p.cafeteria });
  }
  const base = { year, label, personId, seDeduction: null, wages: null, seNet: null, seEarnings: null };
  if (!(spine.income || []).length) return { ...t.out(null), ...base, lines, none: true };
  if (t.snapshot().missing.length) return { ...t.out(null), ...base, lines };
  const sum = (types) => round2(lines.filter((l) => types.includes(l.type)).reduce((a, l) => a + (l.amount || 0), 0));
  const gross = sum(['w2', 'tips']), seNet = sum(['1099', 'be']);
  let seDeduction = 0;
  if (seNet > 0) {
    for (const r of SE_RULES) t.rule(R, r, year);
    // FICA wages: the W-2 and tips pay less what a cafeteria plan (an HSA or FSA through pay) took off.
    const fica = round2(gross + lines.filter((l) => l.cafeteria).reduce((a, l) => a + (l.amount || 0), 0));
    seDeduction = round2(seTaxFor(seNet, fica, R, year).deduction);
  }
  if (seDeduction) lines.push({ label: 'Half the self-employment tax (deductible)', path: null, amount: -seDeduction, type: 'seTax' });
  // A self-employment loss never lowers wages (Publication 590-A): the 1099 part counts at no less than $0.
  const sePart = round2(seNet - seDeduction);
  if (sePart < 0) lines.push({ label: 'A 1099 loss is left out (it never lowers wages)', path: null, amount: -sePart, type: 'seLoss' });
  const value = round2(lines.reduce((a, l) => a + (l.amount || 0), 0));
  return { ...t.out(Math.max(0, value)), ...base, lines: lines.map(({ type, ...l }) => l), seDeduction, wages: round2(gross + sum(['pretax'])), seNet, seEarnings: Math.max(0, sePart) };
}

// ---------------------------------------------------------------- monthly tax set-aside (S-172, S-180)
// Money that should go aside each month for tax that withholding will not
// cover. When a year's tax can be figured, it is the balance due (tax less
// withholding and estimated payments) less what is already set aside, spread
// over the months from the later of the as-of month and January of the year
// through TAX_RETURN_DUE the next year. When it cannot be figured yet, it falls
// back to the marginal federal plus state rate (a floor, from the income known
// so far) on income with no withholding (1099 adds self-employment tax) and on
// the year's Roth conversions, and names what is missing.
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
  let total = 0, rate = null;
  const dueMd = R.get('TAX_RETURN_DUE', year);
  const asOfYm = monthKey(spine.meta.asOf);
  // A tax year is set aside for from the later of the as-of month and its
  // January, through the month its return is due.
  for (const ty of [year, year - 1]) {
    const endYm = (ty + 1) + '-' + dueMd.slice(0, 2);
    const startYm = asOfYm > ty + '-01' ? asOfYm : ty + '-01';
    if (ym < startYm || ym > endYm) continue;
    const months = (+endYm.slice(0, 4) - +startYm.slice(0, 4)) * 12 + (+endYm.slice(5) - +startYm.slice(5)) + 1;
    const txY = yearTax(spine, R, ty, mode, cache);
    const due = txY.balanceDue.value;
    if (due !== null) {
      // The year's tax can be figured: set aside what is still due, less what is
      // already set aside, evenly over the months left (S-180). A refund sets aside nothing.
      t.absorb({ ...txY.balanceDue, value: undefined });
      const tyRec = (spine.taxYears || []).find((x) => x.year === ty);
      const held = tyRec && tyRec.setAside ? t.useFact('taxYears.' + tyRec.id + '.setAside', tyRec.setAside) ?? 0 : 0;
      const left = Math.max(0, due - held);
      const amount = left / months;
      total += amount;
      lines.push({ kind: 'balance', id: String(ty), label: ty + ' tax still due', base: round2(due), held: round2(held), months, rate: null, amount: round2(amount), taxYear: ty });
      continue;
    }
    // The year's tax cannot be figured yet: fall back to the marginal rate on the
    // income known so far (a floor), on unwithheld income this month and on the
    // year's Roth conversions spread to the return.
    for (const p of txY.balanceDue.missing || []) t.addMissing(p);
    const r = marginalFor(txY, t);
    if (ty === year) rate = r;
    if (ty === year) for (const st of streams) {
      if (!st.included || !st.gross) continue;
      const src = (spine.income || []).find((x) => x.id === st.id);
      if (!src || src.type === 'w2' || src.type === 'tips' || valueOf(src.withholding && src.withholding.federal) !== 0) continue;
      if (!r) { t.addMissing('household.filingStatus'); continue; }
      t.useFact('income.' + st.id + '.amount', src.amount);
      t.useFact('income.' + st.id + '.withholding.federal', src.withholding.federal);
      const rr = r.federal + r.state + (src.type === '1099' ? r.se : 0);
      total += st.gross * rr;
      lines.push({ kind: 'income', id: st.id, label: st.label, base: round2(st.gross), rate: rr, amount: round2(st.gross * rr), taxYear: ty });
    }
    for (const acc of spine.accounts || []) for (const c of valueOf(acc.conversions) || []) {
      if (c.year !== ty || typeof c.taxable !== 'number' || !r) continue;
      t.useFact('accounts.' + acc.id + '.conversions', acc.conversions);
      const rr = r.federal + r.state;
      total += c.taxable * rr / months;
      lines.push({ kind: 'conversion', id: acc.id, label: 'Roth conversion ' + ty, base: c.taxable, rate: rr, months, amount: round2(c.taxable * rr / months), taxYear: ty });
    }
  }
  t.rule(R, 'TAX_RETURN_DUE', year);
  // Lines are rounded to the cent; the total is their sum, so it adds up on screen.
  return { total: t.out(round2(lines.reduce((x, l) => x + l.amount, 0))), lines, rate };
}

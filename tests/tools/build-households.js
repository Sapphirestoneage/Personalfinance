#!/usr/bin/env node
/* ==========================================================================
   tests/tools/build-households.js - writes the synthetic household corpus.
   --------------------------------------------------------------------------
   Lane 2, section 1 (DECISIONS.md L-1). Every fixture under
   fixtures/households/ is generated from the compact specs below through
   shared/schema.js, so each file is in the current spine v2 shape without
   a single field typed by hand. The `known` block is NOT produced by any
   engine: it is the hand arithmetic below (the standard deduction off,
   the bracket ladder walked slice by slice, the employee's payroll tax,
   spending times twelve, and so on) with every step written out in
   `working` so a reviewer can check it with a pencil. Where the engine
   disagrees, tests/corpus.test.js writes the disagreement into
   docs/lane2-findings.md and the fixture stays as it is.

   Run:  node tests/tools/build-households.js
   Every figure is invented. This repo is public; nothing here is anyone's
   real money.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const Money = require(path.join(ROOT, 'shared/money.js'));
const DefaultSchema = require(path.join(ROOT, 'shared/schema.js'));

const OUT = path.join(ROOT, 'fixtures', 'households');
const EDGE = path.join(OUT, 'edge');
const AS_OF = '2026-09-10';
const TAX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tax_brackets.json'), 'utf8'));
const TAX_YEAR = '2026';

const c = (dollars) => (dollars === null || dollars === undefined) ? null : Math.round(dollars * 100);
const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/* ---- The hand arithmetic ------------------------------------------------
   Inputs in dollars. Returns the `known` block with the working shown.
   The tax is done by hand from data/tax_brackets.json (D-210): gross less
   the standard deduction, each bracket slice at its rate, then the
   employee's 6.2% Social Security up to the wage base, 1.45% Medicare,
   and 0.9% more above the additional-Medicare threshold. Federal only.  */
function handTax(gross, fs, w) {
  const y = TAX.years[TAX_YEAR];
  const sd = y.standardDeduction[fs].value;
  const taxable = Math.max(0, gross - sd);
  let income = 0, prev = 0;
  const parts = [];
  for (const row of y.brackets[fs].value) {
    const top = row.upTo === null ? Infinity : row.upTo;
    const width = Math.max(0, Math.min(top, taxable) - prev);
    if (width > 0) { income += width * row.rate; parts.push(`${fmt(width)} x ${row.rate}`); }
    prev = top;
    if (taxable <= top) break;
  }
  const f = y.fica;
  const ss = Math.min(gross, f.socialSecurityWageBase.value) * f.socialSecurityRate.value;
  const med = gross * f.medicareRate.value;
  const thr = f.additionalMedicareThresholds.value[fs];
  const addl = gross > thr ? (gross - thr) * f.additionalMedicareRate.value : 0;
  w.push(`taxable = ${fmt(gross)} - standard deduction ${fmt(sd)} (${fs}) = ${fmt(taxable)}`);
  w.push(`federal income tax = ${parts.length ? parts.join(' + ') : 'nothing in the ladder'} = ${fmt(income)}`);
  w.push(`payroll tax = ${fmt(Math.min(gross, f.socialSecurityWageBase.value))} x ${f.socialSecurityRate.value} + ${fmt(gross)} x ${f.medicareRate.value}` + (addl ? ` + ${fmt(gross - thr)} x ${f.additionalMedicareRate.value}` : '') + ` = ${fmt(ss + med + addl)}`);
  return income + ss + med + addl;
}
function known(spec) {
  const w = [];
  const k = { asOf: AS_OF, tolerance: 0.01 };
  const fat = spec.fat;
  const spend = fat ? (fat.food + fat.accommodation + fat.transportation + fat.wants + (fat.therapy || 0)) : null;
  if (fat) {
    w.push(`monthly spending = food ${fmt(fat.food)} + accommodation ${fmt(fat.accommodation)} + transportation ${fmt(fat.transportation)} + everything else ${fmt(fat.wants)}` + (fat.therapy ? ` + therapy ${fmt(fat.therapy)}` : '') + ` = ${fmt(spend)}`);
    k.monthlySpendingCents = c(spend);
    k.fiTargetCents = c(spend * 12 / 0.04);
    w.push(`FI target = ${fmt(spend)} x 12 / 0.04 = ${fmt(spend * 12)} / 0.04 = ${fmt(spend * 12 / 0.04)}`);
  } else {
    k.monthlySpendingCents = null; k.fiTargetCents = null;
    w.push('monthly spending: nothing typed, so incomplete (empty is not zero)');
  }
  const gross = spec.grossTotal;
  if (gross !== null && gross !== undefined) {
    k.grossAnnualCents = c(gross);
    const tax = handTax(gross, spec.filingStatus, w);
    const rate = gross > 0 ? tax / gross : 0;
    k.effectiveRate = rate;
    const takeHome = gross - tax;
    k.estimatedTaxCents = c(tax);
    k.takeHomeAnnualCents = c(takeHome);
    k.takeHomeMonthlyCents = Math.round(c(takeHome) / 12);
    w.push(`estimated tax = ${fmt(tax)}, an effective ${(rate * 100).toFixed(2)}% of ${fmt(gross)}; take-home = ${fmt(gross)} - ${fmt(tax)} = ${fmt(takeHome)} a year, ${fmt(takeHome / 12)} a month`);
    if (fat && gross > 0) {
      const saved = takeHome - spend * 12;
      k.savingsRate = saved / gross;
      w.push(`savings rate (excluding match) = (${fmt(takeHome)} - ${fmt(spend * 12)}) / ${fmt(gross)} = ${fmt(saved)} / ${fmt(gross)} = ${(saved / gross).toFixed(4)}`);
    } else if (fat && gross === 0) {
      k.savingsRate = null;
      w.push('savings rate: gross is zero, so no rate (a ratio with a zero denominator is incomplete, never 0)');
    } else {
      k.savingsRate = null;
    }
  } else {
    k.grossAnnualCents = null; k.effectiveRate = null; k.estimatedTaxCents = null;
    k.takeHomeAnnualCents = null; k.takeHomeMonthlyCents = null; k.savingsRate = null;
    w.push('gross income: no income source, so take-home and the savings rate are incomplete');
  }
  if (spec.cash !== null && spec.cash !== undefined && fat && spend > 0) {
    k.runwayMonths = spec.cash / spend;
    k.runwayWholeMonths = Math.min(60, Math.floor(spec.cash / spend));
    w.push(`runway = cash ${fmt(spec.cash)} / ${fmt(spend)} a month = ${(spec.cash / spend).toFixed(4)} months (${Math.floor(spec.cash / spend)} whole months; Runway.project stops at 60)`);
  } else {
    k.runwayMonths = null; k.runwayWholeMonths = null;
    w.push('runway: ' + (fat ? 'no cash balance entered' : 'no spending entered') + ', so incomplete');
  }
  if (spec.nw !== undefined) {
    k.netWorthCents = c(spec.nw.value);
    w.push(`net worth = ${spec.nw.working}`);
  }
  k.working = w;
  return k;
}

/* ---- Builders ------------------------------------------------------------ */
let seq = 0;
function person(p, Schema) {
  Schema = Schema || DefaultSchema;
  const id = p.id || ('p_' + (++seq));
  const out = Schema.createPerson({
    id, label: p.label, role: p.role || 'adult', dob: p.dob, employmentStatus: p.status === undefined ? null : p.status,
    unemployment: p.unemployment, work: p.work
  });
  (p.income || []).forEach((s, i) => {
    out.incomeSources.push(Schema.createIncomeSource({
      id: s.id || (id + '_inc' + i), personId: id, source: s.source, grossAnnualIncomeCents: c(s.gross), type: s.type || 'w2',
      frequency: s.frequency, rateCents: s.rate === undefined ? null : c(s.rate), hoursPerWeek: s.hoursPerWeek,
      variableLowCents: s.low === undefined ? null : c(s.low), variableHighCents: s.high === undefined ? null : c(s.high),
      employerMatch: s.match ? { matchPercent: s.match.pct, matchCapPercentOfSalary: s.match.cap } : undefined
    }));
  });
  return out;
}
function asset(a, i, Schema) {
  Schema = Schema || DefaultSchema;
  return Schema.createAsset({ id: a.id || ('a_' + i), label: a.label, category: a.category, valueCents: c(a.value), liquid: a.liquid === undefined ? a.category === 'cash' : a.liquid, ownerIds: a.owners || [], taxCharacter: a.taxCharacter === undefined ? null : a.taxCharacter, costBasisCents: a.basis === undefined ? null : c(a.basis) });
}
function debt(d, i, Schema) {
  Schema = Schema || DefaultSchema;
  return Schema.createDebt({ id: d.id || ('d_' + i), label: d.label, balanceCents: c(d.balance), rate: d.rate, minPaymentCents: c(d.min), type: d.type, ownerIds: d.owners || [], creditLimitCents: d.limit === undefined ? null : c(d.limit), interestFree: d.interestFree });
}
function fatBlock(fat) {
  if (!fat) return { needs: { food: {}, accommodation: {}, transportation: {} }, wants: { totalCents: null, therapy: null }, entries: [] };
  return {
    needs: { food: { monthlyCents: c(fat.food) }, accommodation: { monthlyCents: c(fat.accommodation) }, transportation: { monthlyCents: c(fat.transportation) } },
    wants: { totalCents: c(fat.wants), therapy: fat.therapy ? { monthlyCents: c(fat.therapy) } : null },
    entries: []
  };
}
function build(spec, SchemaOverride) {
  const Schema = SchemaOverride || DefaultSchema;
  seq = 0;
  const people = (spec.people || []).map((p) => person(p, Schema));
  const h = Schema.createHousehold(Object.assign({
    people,
    filingStatus: spec.filingStatus === undefined ? null : spec.filingStatus,
    state: spec.state === undefined ? null : spec.state,
    assets: (spec.assets || []).map((a, i) => asset(a, i, Schema)),
    debts: (spec.debts || []).map((d, i) => debt(d, i, Schema)),
    expenses: fatBlock(spec.fat),
    dependents: spec.dependents === undefined ? null : spec.dependents,
    capturingFullMatch: spec.capturingFullMatch === undefined ? null : spec.capturingFullMatch,
    retirement: spec.retirement, insurance: spec.insurance,
    meta: Object.assign({ isDemo: true, hasDebt: spec.hasDebt === undefined ? null : spec.hasDebt }, {
      name: spec.name, story: spec.story, sphere: spec.sphere, sphereNote: 'DECIDE: the sphere is a guess at the depth these rows reach under section 19 of the master prompt; spheres.json does not exist yet.',
      lane: 'lane2 section 1 (L-1)', known: known(spec)
    })
  }, spec.extra || {}));
  return h;
}

/* ---- The archetypes ------------------------------------------------------
   Ages as of 2026-09. `band` is the row read by hand from the 2026 table.  */
const ARCHETYPES = [
  {
    id: 'grad-broke', name: 'Grad, broke', sphere: 2,
    story: '24, $48k, $32k of student debt, no savings, renting with roommates.',
    people: [{ id: 'p_grad', label: 'Sam', dob: '2002-05-14', status: 'employed', income: [{ source: 'First job', gross: 48000 }] }],
    filingStatus: 'single', state: 'NC', grossTotal: 48000,
    assets: [{ label: 'Checking', category: 'cash', value: 0 }], cash: 0,
    debts: [{ label: 'Federal student loans', balance: 32000, rate: 0.055, min: 340, type: 'student_loan' }], hasDebt: true,
    fat: { food: 450, accommodation: 750, transportation: 180, wants: 900 },
    nw: { value: -32000, working: '$0 cash - $32,000 loans = -$32,000' }
  },
  {
    id: 'grad-frugal', name: 'Grad, frugal', sphere: 3,
    story: '25, $62k, a 45% savings rate on purpose, $15k invested already.',
    people: [{ id: 'p_frugal', label: 'Priya', dob: '2001-02-20', status: 'employed', income: [{ source: 'Analyst job', gross: 62000, match: { pct: 1, cap: 0.03 } }] }],
    filingStatus: 'single', state: 'WI', grossTotal: 62000,
    assets: [{ label: 'Savings', category: 'cash', value: 6000 }, { label: 'Roth IRA', category: 'retirement', value: 15000, taxCharacter: 'roth' }], cash: 6000,
    debts: [], hasDebt: false, capturingFullMatch: true,
    retirement: { contributionPercent: 15, rothContributedCents: 350000, onHdhp: false, has401k: true },
    fat: { food: 350, accommodation: 900, transportation: 110, wants: 500 },
    nw: { value: 21000, working: '$6,000 + $15,000 - $0 = $21,000' }
  },
  {
    id: 'dink-highearn', name: 'Two incomes, no kids, high earners', sphere: 5,
    story: '33 and 31, $210k combined, $400k invested, renting in a high cost state.',
    people: [
      { id: 'p_dink_a', label: 'Jordan', dob: '1993-03-02', status: 'employed', income: [{ source: 'Product job', gross: 120000, match: { pct: 1, cap: 0.04 } }] },
      { id: 'p_dink_b', label: 'Casey', dob: '1995-07-19', status: 'employed', income: [{ source: 'Nursing', gross: 90000, match: { pct: 0.5, cap: 0.06 } }] }
    ],
    filingStatus: 'married_joint', state: 'CA', grossTotal: 210000,
    assets: [{ label: 'High-yield savings', category: 'cash', value: 40000 }, { label: 'Brokerage', category: 'investment', value: 250000, taxCharacter: 'taxable', basis: 180000 }, { label: '401(k)s', category: 'retirement', value: 150000, taxCharacter: 'pretax' }], cash: 40000,
    debts: [], hasDebt: false, dependents: false, capturingFullMatch: true,
    retirement: { contributionPercent: 12, rothContributedCents: 0, onHdhp: true, hsaFamilyPlan: true, hsaContributedCents: 400000, has401k: true },
    fat: { food: 1200, accommodation: 3800, transportation: 500, wants: 2500 },
    nw: { value: 440000, working: '$40,000 + $250,000 + $150,000 - $0 = $440,000' }
  },
  {
    id: 'single-parent', name: 'Single parent', sphere: 3,
    story: '38, $58k, one child, a $6k credit card at 24%, a $9k emergency fund.',
    people: [{ id: 'p_parent', label: 'Dana', dob: '1988-01-25', status: 'employed', income: [{ source: 'Office manager', gross: 58000, match: { pct: 0.5, cap: 0.04 } }] }],
    filingStatus: 'head_of_household', state: 'OH', grossTotal: 58000,
    assets: [{ label: 'Emergency fund', category: 'cash', value: 9000 }, { label: '403(b)', category: 'retirement', value: 31000, taxCharacter: 'pretax' }], cash: 9000,
    debts: [{ label: 'Credit card', balance: 6000, rate: 0.24, min: 180, type: 'credit_card', limit: 8500 }], hasDebt: true,
    dependents: [{ age: 7 }], capturingFullMatch: true,
    retirement: { contributionPercent: 4, rothContributedCents: 0, onHdhp: false, has401k: true },
    fat: { food: 700, accommodation: 1350, transportation: 320, wants: 900 },
    nw: { value: 34000, working: '$9,000 + $31,000 - $6,000 = $34,000' }
  },
  {
    id: 'self-employed-lumpy', name: 'Self-employed, lumpy months', sphere: 4,
    story: '41, 1099 income that swings from $3k to $14k a month, quarterly estimates, a SEP IRA.',
    people: [{ id: 'p_se', label: 'Morgan', dob: '1985-06-30', status: 'selfEmployed', income: [{ source: 'Consulting', gross: 84000, type: '1099', frequency: 'monthly', rate: 7000, low: 3000, high: 14000 }] }],
    filingStatus: 'single', state: 'CO', grossTotal: 84000,
    assets: [{ label: 'Business + personal cash', category: 'cash', value: 30000 }, { label: 'SEP IRA', category: 'retirement', value: 95000, taxCharacter: 'pretax' }], cash: 30000,
    debts: [], hasDebt: false,
    extra: { variableIncome: { bufferMonths: 3, windowMonths: 6 } },
    fat: { food: 600, accommodation: 1600, transportation: 300, wants: 1200 },
    nw: { value: 125000, working: '$30,000 + $95,000 - $0 = $125,000' }
  },
  {
    id: 'house-hacker', name: 'House hacker', sphere: 6,
    story: '29, owns a fourplex and lives in one unit, three units rented, W-2 plus rental income.',
    people: [{ id: 'p_hh', label: 'Alex', dob: '1997-02-11', status: 'both', income: [{ source: 'Day job', gross: 78000, match: { pct: 1, cap: 0.03 } }, { id: 'p_hh_rent', source: 'Fourplex rents', gross: 30000, type: '1099' }] }],
    filingStatus: 'single', state: 'TX', grossTotal: 108000,
    assets: [{ label: 'Checking + reserves', category: 'cash', value: 18000 }, { label: '401(k)', category: 'retirement', value: 40000, taxCharacter: 'pretax' }, { id: 'a_fourplex', label: 'Fourplex', category: 'real_estate', value: 520000 }], cash: 18000,
    debts: [{ id: 'd_fourplex', label: 'Fourplex mortgage', balance: 400000, rate: 0.065, min: 2800, type: 'mortgage' }], hasDebt: true, capturingFullMatch: true,
    extra: { property: [{ id: 'prop_fourplex', assetId: 'a_fourplex', mortgageId: 'd_fourplex', rentMonthlyCents: 250000, pitiMonthlyCents: 280000, opexMonthlyCents: 60000, vacancyRate: 0.05 }] },
    fat: { food: 550, accommodation: 2800, transportation: 350, wants: 900 },
    nw: { value: 178000, working: '$18,000 + $40,000 + $520,000 - $400,000 = $178,000' }
  },
  {
    id: 'equity-engineer', name: 'Engineer with equity', sphere: 6,
    story: '34, $180k base, RSUs vesting quarterly, an ESPP.',
    people: [{ id: 'p_eng', label: 'Taylor', dob: '1992-09-05', status: 'employed', income: [{ source: 'Base salary', gross: 180000, match: { pct: 0.5, cap: 0.06 } }, { id: 'p_eng_rsu', source: 'RSU vesting (quarterly)', gross: 60000 }] }],
    filingStatus: 'single', state: 'WA', grossTotal: 240000,
    assets: [{ label: 'Cash', category: 'cash', value: 35000 }, { label: 'Brokerage incl. vested RSUs and ESPP', category: 'investment', value: 210000, taxCharacter: 'taxable', basis: 165000 }, { label: '401(k)', category: 'retirement', value: 160000, taxCharacter: 'pretax' }], cash: 35000,
    debts: [], hasDebt: false, capturingFullMatch: true,
    retirement: { contributionPercent: 10, rothContributedCents: 0, onHdhp: true, hsaFamilyPlan: false, hsaContributedCents: 200000, has401k: true },
    fat: { food: 900, accommodation: 2900, transportation: 400, wants: 2200 },
    nw: { value: 405000, working: '$35,000 + $210,000 + $160,000 - $0 = $405,000' }
  },
  {
    id: 'near-retiree', name: 'Near retiree', sphere: 7,
    story: '61, $900k mostly pretax, a pension at 65, a Social Security estimate at 67.',
    people: [
      { id: 'p_nr_a', label: 'Chris', dob: '1965-04-18', status: 'employed', income: [{ source: 'Engineering job', gross: 105000, match: { pct: 1, cap: 0.05 } }] },
      { id: 'p_nr_b', label: 'Lee', dob: '1966-08-03', status: 'notWorking' }
    ],
    filingStatus: 'married_joint', state: 'PA', grossTotal: 105000,
    assets: [{ label: 'Savings', category: 'cash', value: 40000 }, { label: 'Brokerage', category: 'investment', value: 80000, taxCharacter: 'taxable' }, { label: '401(k) + rollover IRA', category: 'retirement', value: 780000, taxCharacter: 'pretax' }], cash: 40000,
    debts: [], hasDebt: false, dependents: false, capturingFullMatch: true,
    retirement: { contributionPercent: 20, rothContributedCents: 0, onHdhp: false, has401k: true },
    extra: {
      futureIncome: [
        { id: 'fi_pension', label: 'Pension', kind: 'benefit', monthlyCents: 180000, startsAtAge: 65 },
        { id: 'fi_ss', label: 'Social Security (estimate)', kind: 'benefit', monthlyCents: 260000, startsAtAge: 67 }
      ],
      targets: { retireAge: 65 }
    },
    fat: { food: 800, accommodation: 1900, transportation: 450, wants: 1700 },
    nw: { value: 900000, working: '$40,000 + $80,000 + $780,000 - $0 = $900,000' }
  },
  {
    id: 'coast-fi', name: 'Coast FI', sphere: 6,
    story: '37, $350k invested, deliberately part-time at $40k.',
    people: [{ id: 'p_coast', label: 'Robin', dob: '1989-08-22', status: 'employed', income: [{ source: 'Part-time library job', gross: 40000, frequency: 'hourly', rate: 32.05, hoursPerWeek: 24 }], work: { contractedHoursPerWeek: 24, weeksPerYear: 52 } }],
    filingStatus: 'single', state: 'OR', grossTotal: 40000,
    assets: [{ label: 'Savings', category: 'cash', value: 15000 }, { label: 'Brokerage', category: 'investment', value: 50000, taxCharacter: 'taxable' }, { label: 'Old 401(k)s', category: 'retirement', value: 300000, taxCharacter: 'pretax' }], cash: 15000,
    debts: [], hasDebt: false,
    extra: { targets: { coastAge: 37, retireAge: 60 } },
    fat: { food: 450, accommodation: 1250, transportation: 150, wants: 800 },
    nw: { value: 365000, working: '$15,000 + $50,000 + $300,000 - $0 = $365,000' }
  },
  {
    id: 'negative-nw', name: 'Negative net worth', sphere: 2,
    story: '30, $90k, $140k of combined debt, a car loan worth more than the car.',
    people: [{ id: 'p_neg', label: 'Jamie', dob: '1996-05-03', status: 'employed', income: [{ source: 'Sales job', gross: 90000, match: { pct: 0.5, cap: 0.06 } }] }],
    filingStatus: 'single', state: 'GA', grossTotal: 90000,
    assets: [{ label: 'Checking', category: 'cash', value: 4000 }, { label: '401(k)', category: 'retirement', value: 12000, taxCharacter: 'pretax' }, { label: 'Car (private sale value)', category: 'vehicle', value: 26000 }], cash: 4000,
    debts: [
      { label: 'Student loans', balance: 85000, rate: 0.062, min: 950, type: 'student_loan' },
      { label: 'Car loan (underwater)', balance: 38000, rate: 0.095, min: 780, type: 'auto' },
      { label: 'Credit cards', balance: 17000, rate: 0.27, min: 510, type: 'credit_card', limit: 20000 }
    ], hasDebt: true, capturingFullMatch: false,
    retirement: { contributionPercent: 3, rothContributedCents: 0, onHdhp: false, has401k: true },
    fat: { food: 650, accommodation: 1700, transportation: 450, wants: 1300 },
    nw: { value: -98000, working: '$4,000 + $12,000 + $26,000 - ($85,000 + $38,000 + $17,000) = $42,000 - $140,000 = -$98,000' }
  },
  {
    id: 'between-jobs', name: 'Between jobs', sphere: 5,
    story: '44, laid off two months ago, severance gone, 26 weeks of unemployment insurance, COBRA.',
    people: [{ id: 'p_bj', label: 'Pat', dob: '1982-02-09', status: 'unemployed', unemployment: { since: '2026-07-10', benefitStatus: 'receiving', benefitWeeklyCents: 70000, benefitWeeksLeft: 18, severanceCents: 0, lastGrossAnnualCents: 8800000, expectedSearchMonths: 5, floorMonthlyCents: 260000 } }],
    filingStatus: 'single', state: 'IL', grossTotal: null,
    assets: [{ label: 'Savings', category: 'cash', value: 22000 }, { label: 'Old 401(k)', category: 'retirement', value: 140000, taxCharacter: 'pretax' }], cash: 22000,
    debts: [], hasDebt: false,
    insurance: { highestDeductibleCents: 350000, health: { type: 'cobra', monthlyCents: 72000 } },
    fat: { food: 600, accommodation: 1650, transportation: 300, wants: 900 },
    nw: { value: 162000, working: '$22,000 + $140,000 - $0 = $162,000' }
  },
  {
    id: 'geo-arb', name: 'Geographic arbitrage', sphere: 4,
    story: '36, remote at $120k, just moved from California to a state with no income tax.',
    people: [{ id: 'p_geo', label: 'Sasha', dob: '1990-10-30', status: 'employed', income: [{ source: 'Remote job', gross: 120000, match: { pct: 1, cap: 0.04 } }] }],
    filingStatus: 'single', state: 'TX', grossTotal: 120000,
    assets: [{ label: 'Savings', category: 'cash', value: 28000 }, { label: 'Brokerage', category: 'investment', value: 95000, taxCharacter: 'taxable' }, { label: '401(k)', category: 'retirement', value: 130000, taxCharacter: 'pretax' }], cash: 28000,
    debts: [], hasDebt: false, capturingFullMatch: true,
    fat: { food: 700, accommodation: 1900, transportation: 350, wants: 1500 },
    nw: { value: 253000, working: '$28,000 + $95,000 + $130,000 - $0 = $253,000' }
  },
  {
    id: 'student', name: 'Student', sphere: 1,
    story: '21, part-time at $14k, federal loans in deferment.',
    people: [{ id: 'p_stu', label: 'Kai', dob: '2005-03-08', status: 'employed', income: [{ source: 'Campus job', gross: 14000, frequency: 'hourly', rate: 14, hoursPerWeek: 20 }] }],
    filingStatus: 'single', state: 'MI', grossTotal: 14000,
    assets: [{ label: 'Checking', category: 'cash', value: 1200 }], cash: 1200,
    debts: [{ label: 'Federal loans (in deferment, $0 due)', balance: 22000, rate: 0.053, min: 0, type: 'student_loan' }], hasDebt: true,
    fat: { food: 300, accommodation: 600, transportation: 80, wants: 250 },
    nw: { value: -20800, working: '$1,200 - $22,000 = -$20,800' }
  },
  {
    id: 'retired-early', name: 'Retired early', sphere: 8,
    story: '52, $1.6M, no earned income, bridging to 59 and a half.',
    people: [{ id: 'p_re', label: 'Drew', dob: '1974-07-15', status: 'notWorking' }],
    filingStatus: 'single', state: 'NM', grossTotal: null,
    assets: [{ label: 'Cash bucket', category: 'cash', value: 80000 }, { label: 'Taxable brokerage (the bridge)', category: 'investment', value: 420000, taxCharacter: 'taxable', basis: 300000 }, { label: 'IRA + 401(k)', category: 'retirement', value: 1100000, taxCharacter: 'pretax' }], cash: 80000,
    debts: [], hasDebt: false, dependents: false,
    extra: { decumulation: { stockShare: 0.6 }, targets: { retireAge: 52 } },
    fat: { food: 800, accommodation: 2200, transportation: 400, wants: 1600 },
    nw: { value: 1600000, working: '$80,000 + $420,000 + $1,100,000 - $0 = $1,600,000' }
  },
  {
    id: 'married-one-income', name: 'Married, one income', sphere: 4,
    story: '40 and 39, one W-2 at $95k, one at home, two kids.',
    people: [
      { id: 'p_moi_a', label: 'Sam', dob: '1986-05-20', status: 'employed', income: [{ source: 'Logistics manager', gross: 95000, match: { pct: 0.5, cap: 0.06 } }] },
      { id: 'p_moi_b', label: 'Ari', dob: '1987-11-02', status: 'notWorking' }
    ],
    filingStatus: 'married_joint', state: 'MO', grossTotal: 95000,
    assets: [{ label: 'Savings', category: 'cash', value: 14000 }, { label: '401(k)', category: 'retirement', value: 110000, taxCharacter: 'pretax' }, { id: 'a_home', label: 'Home', category: 'real_estate', value: 290000 }], cash: 14000,
    debts: [{ id: 'd_home', label: 'Mortgage', balance: 210000, rate: 0.059, min: 1650, type: 'mortgage' }], hasDebt: true,
    dependents: [{ age: 9 }, { age: 6 }], capturingFullMatch: true,
    retirement: { contributionPercent: 6, rothContributedCents: 0, onHdhp: false, has401k: true },
    fat: { food: 1100, accommodation: 1950, transportation: 500, wants: 1400 },
    nw: { value: 204000, working: '$14,000 + $110,000 + $290,000 - $210,000 = $204,000' }
  },
  {
    id: 'aging-parent', name: 'Supporting a parent', sphere: 8,
    story: '47, $110k, sends $800 a month to a parent (inside everything else).',
    people: [{ id: 'p_ap', label: 'Noor', dob: '1979-01-12', status: 'employed', income: [{ source: 'Pharmacist', gross: 110000, match: { pct: 1, cap: 0.04 } }] }],
    filingStatus: 'single', state: 'NJ', grossTotal: 110000,
    assets: [{ label: 'Savings', category: 'cash', value: 25000 }, { label: 'Brokerage', category: 'investment', value: 30000, taxCharacter: 'taxable' }, { label: '401(k)', category: 'retirement', value: 210000, taxCharacter: 'pretax' }], cash: 25000,
    debts: [], hasDebt: false, capturingFullMatch: true, dependents: [{ age: 74 }],
    extra: { giving: { annualTargetCents: 960000 } },
    fat: { food: 650, accommodation: 2100, transportation: 400, wants: 2100 },
    nw: { value: 265000, working: '$25,000 + $30,000 + $210,000 - $0 = $265,000' }
  },
  {
    id: 'inheritance-pending', name: 'Inheritance pending', sphere: 8,
    story: '35, $70k, expecting a $300k traditional IRA inheritance that is not an asset yet, so it is not in the assets.',
    people: [{ id: 'p_inh', label: 'Eli', dob: '1991-06-06', status: 'employed', income: [{ source: 'Teacher', gross: 70000, match: { pct: 0.5, cap: 0.05 } }] }],
    filingStatus: 'single', state: 'MN', grossTotal: 70000,
    assets: [{ label: 'Savings', category: 'cash', value: 12000 }, { label: '403(b)', category: 'retirement', value: 60000, taxCharacter: 'pretax' }], cash: 12000,
    debts: [], hasDebt: false, capturingFullMatch: true,
    fat: { food: 550, accommodation: 1500, transportation: 300, wants: 1100 },
    nw: { value: 72000, working: '$12,000 + $60,000 - $0 = $72,000 (the expected $300,000 inherited IRA is a block, not a fact)' }
  },
  {
    id: 'pslf-track', name: 'On the PSLF track', sphere: 5,
    story: '31, public sector at $68k, 84 of 120 PSLF payments made on an income-driven plan.',
    people: [{ id: 'p_pslf', label: 'Rowan', dob: '1995-04-01', status: 'employed', income: [{ source: 'County social worker', gross: 68000, match: { pct: 1, cap: 0.05 } }] }],
    filingStatus: 'single', state: 'VA', grossTotal: 68000,
    assets: [{ label: 'Savings', category: 'cash', value: 9000 }, { label: '457(b)', category: 'retirement', value: 38000, taxCharacter: 'pretax' }], cash: 9000,
    debts: [{ label: 'Federal student loans (PSLF, 84 of 120 payments)', balance: 61000, rate: 0.058, min: 310, type: 'student_loan' }], hasDebt: true, capturingFullMatch: true,
    extra: { studentLoans: { plan: 'income_driven', idrShare: 0.10, forgivenessYears: 10 } },
    fat: { food: 500, accommodation: 1400, transportation: 250, wants: 950 },
    nw: { value: -14000, working: '$9,000 + $38,000 - $61,000 = -$14,000' }
  },
  {
    id: 'high-debt-high-income', name: 'High debt, high income', sphere: 5,
    story: '39, physician at $310k, $280k of student loans at 6.8%.',
    people: [{ id: 'p_doc', label: 'Avery', dob: '1987-08-14', status: 'employed', income: [{ source: 'Hospitalist', gross: 310000, match: { pct: 1, cap: 0.04 } }] }],
    filingStatus: 'single', state: 'MD', grossTotal: 310000,
    assets: [{ label: 'Savings', category: 'cash', value: 30000 }, { label: 'Brokerage', category: 'investment', value: 40000, taxCharacter: 'taxable' }, { label: '403(b)', category: 'retirement', value: 120000, taxCharacter: 'pretax' }], cash: 30000,
    debts: [{ label: 'Medical school loans', balance: 280000, rate: 0.068, min: 3220, type: 'student_loan' }], hasDebt: true, capturingFullMatch: true,
    extra: { studentLoans: { plan: 'aggressive', extraMonthlyCents: 150000 } },
    fat: { food: 1000, accommodation: 3500, transportation: 700, wants: 3000 },
    nw: { value: -90000, working: '$30,000 + $40,000 + $120,000 - $280,000 = -$90,000' }
  },
  {
    id: 'variable-hustle', name: 'W-2 plus a variable side income', sphere: 4,
    story: '27, $52k W-2 plus $400 to $1,500 a month on the side (about $950 a month, $11,400 a year).',
    people: [{ id: 'p_vh', label: 'Quinn', dob: '1999-09-18', status: 'both', income: [{ source: 'Day job', gross: 52000, match: { pct: 0.5, cap: 0.06 } }, { id: 'p_vh_side', source: 'Weekend photography', gross: 11400, type: '1099', frequency: 'monthly', rate: 950, low: 400, high: 1500 }] }],
    filingStatus: 'single', state: 'AZ', grossTotal: 63400,
    assets: [{ label: 'Savings', category: 'cash', value: 7000 }, { label: '401(k)', category: 'retirement', value: 22000, taxCharacter: 'pretax' }], cash: 7000,
    debts: [], hasDebt: false, capturingFullMatch: true,
    extra: { variableIncome: { bufferMonths: 2, windowMonths: 3 } },
    fat: { food: 500, accommodation: 1300, transportation: 250, wants: 1000 },
    nw: { value: 29000, working: '$7,000 + $22,000 - $0 = $29,000' }
  },
  {
    id: 'homeowner-pmi', name: 'Homeowner with PMI', sphere: 7,
    story: '32, bought with 8% down, so PMI, plus an HOA; accommodation is principal, interest, tax, insurance, PMI and HOA in one line.',
    people: [
      { id: 'p_pmi_a', label: 'Blake', dob: '1994-01-27', status: 'employed', income: [{ source: 'IT support', gross: 76000, match: { pct: 1, cap: 0.03 } }] },
      { id: 'p_pmi_b', label: 'Remy', dob: '1994-11-15', status: 'employed', income: [{ source: 'Dental hygienist', gross: 42000 }] }
    ],
    filingStatus: 'married_joint', state: 'NC', grossTotal: 118000,
    assets: [{ label: 'Savings', category: 'cash', value: 11000 }, { label: '401(k)', category: 'retirement', value: 64000, taxCharacter: 'pretax' }, { id: 'a_house', label: 'House', category: 'real_estate', value: 380000 }], cash: 11000,
    debts: [{ id: 'd_house', label: 'Mortgage (92% loan to value)', balance: 349600, rate: 0.064, min: 2187, type: 'mortgage' }], hasDebt: true, capturingFullMatch: true, dependents: false,
    extra: { housing: { priceCents: 38000000, downPct: 0.08, rate: 0.064 } },
    fat: { food: 850, accommodation: 3072, transportation: 500, wants: 1300 },
    nw: { value: 105400, working: '$11,000 + $64,000 + $380,000 - $349,600 = $105,400' }
  },
  {
    id: 'zero-everything', name: 'Zero everything', sphere: 1,
    story: '19, no income, no debt, no assets, first job starts next month.',
    people: [{ id: 'p_zero', label: 'Ash', dob: '2007-06-21', status: 'notWorking' }],
    filingStatus: 'single', state: 'FL', grossTotal: null,
    assets: [], cash: null,
    debts: [], hasDebt: false,
    extra: { futureIncome: [{ id: 'fi_first_job', label: 'First job', kind: 'job', monthlyCents: 290000, startsOn: '2026-10-01' }] },
    fat: { food: 250, accommodation: 0, transportation: 60, wants: 150 },
    nw: { value: null, working: 'no assets entered, so incomplete (an empty list is not zero; only the debt was answered as none)' }
  },
  {
    id: 'two-cars-two-kids', name: 'Two cars, two kids', sphere: 4,
    story: '42 and 40, $140k combined, two car loans, childcare at $2,200 a month inside everything else.',
    people: [
      { id: 'p_tc_a', label: 'Jesse', dob: '1984-03-09', status: 'employed', income: [{ source: 'Project manager', gross: 85000, match: { pct: 0.5, cap: 0.06 } }] },
      { id: 'p_tc_b', label: 'Harper', dob: '1986-08-27', status: 'employed', income: [{ source: 'Teacher', gross: 55000 }] }
    ],
    filingStatus: 'married_joint', state: 'TX', grossTotal: 140000,
    assets: [{ label: 'Savings', category: 'cash', value: 16000 }, { label: '401(k) + 403(b)', category: 'retirement', value: 150000, taxCharacter: 'pretax' }, { id: 'a_home2', label: 'House', category: 'real_estate', value: 360000 }, { label: 'SUV', category: 'vehicle', value: 27000 }, { label: 'Sedan', category: 'vehicle', value: 21000 }], cash: 16000,
    debts: [
      { id: 'd_home2', label: 'Mortgage', balance: 260000, rate: 0.055, min: 1900, type: 'mortgage' },
      { label: 'SUV loan', balance: 24000, rate: 0.079, min: 520, type: 'auto' },
      { label: 'Sedan loan', balance: 19000, rate: 0.065, min: 410, type: 'auto' }
    ], hasDebt: true, capturingFullMatch: true, dependents: [{ age: 4 }, { age: 2 }],
    fat: { food: 1300, accommodation: 2350, transportation: 700, wants: 3400 },
    nw: { value: 271000, working: '$16,000 + $150,000 + $360,000 + $27,000 + $21,000 - ($260,000 + $24,000 + $19,000) = $574,000 - $303,000 = $271,000' }
  },
  {
    id: 'max-savers', name: 'Max savers', sphere: 7,
    story: '45 and 44, $260k combined, maxing every bucket: 401(k)s, HSA, backdoor Roth.',
    people: [
      { id: 'p_ms_a', label: 'Reese', dob: '1981-02-14', status: 'employed', income: [{ source: 'Director', gross: 150000, match: { pct: 1, cap: 0.06 } }] },
      { id: 'p_ms_b', label: 'Val', dob: '1982-12-01', status: 'employed', income: [{ source: 'Architect', gross: 110000, match: { pct: 0.5, cap: 0.06 } }] }
    ],
    filingStatus: 'married_joint', state: 'MA', grossTotal: 260000,
    assets: [{ label: 'Savings', category: 'cash', value: 45000 }, { label: 'Brokerage', category: 'investment', value: 310000, taxCharacter: 'taxable', basis: 220000 }, { label: '401(k)s + HSA + Roth IRAs', category: 'retirement', value: 820000, taxCharacter: 'pretax' }], cash: 45000,
    debts: [], hasDebt: false, dependents: false, capturingFullMatch: true,
    retirement: { contributionPercent: 16, rothContributedCents: 1400000, hsaContributedCents: 875000, onHdhp: true, hsaFamilyPlan: true, has401k: true },
    fat: { food: 1100, accommodation: 3200, transportation: 600, wants: 2300 },
    nw: { value: 1175000, working: '$45,000 + $310,000 + $820,000 - $0 = $1,175,000' }
  }
];

/* ---- Edge cases ------------------------------------------------------------ */
const fortyDebts = [];
for (let i = 0; i < 40; i++) {
  fortyDebts.push({ id: 'd_' + String(i + 1).padStart(2, '0'), label: 'Debt ' + (i + 1), balance: 500 + 250 * i, rate: 0.03 + 0.005 * i, min: 25 + 5 * i, type: ['credit_card', 'personal', 'medical', 'other'][i % 4] });
}
const EDGES = [
  {
    id: 'negative-net-worth', name: 'Edge: negative net worth', sphere: 2,
    story: '28, $55k, $90k owed against $5k owned.',
    people: [{ id: 'p_e1', label: 'Edge One', dob: '1998-04-04', status: 'employed', income: [{ source: 'Job', gross: 55000 }] }],
    filingStatus: 'single', state: 'NV', grossTotal: 55000,
    assets: [{ label: 'Cash', category: 'cash', value: 5000 }], cash: 5000,
    debts: [{ label: 'Loans', balance: 90000, rate: 0.07, min: 1000, type: 'personal' }], hasDebt: true,
    fat: { food: 500, accommodation: 1200, transportation: 300, wants: 700 },
    nw: { value: -85000, working: '$5,000 - $90,000 = -$85,000' }
  },
  {
    id: 'zero-income', name: 'Edge: zero income', sphere: 1,
    story: 'An income source typed as $0 (a real zero, not a blank); $3k of cash.',
    people: [{ id: 'p_e2', label: 'Edge Two', dob: '1990-01-01', status: 'notWorking', income: [{ source: 'Nothing coming in', gross: 0 }] }],
    filingStatus: 'single', state: 'KS', grossTotal: 0,
    assets: [{ label: 'Cash', category: 'cash', value: 3000 }], cash: 3000,
    debts: [], hasDebt: false,
    fat: { food: 400, accommodation: 900, transportation: 100, wants: 300 },
    nw: { value: 3000, working: '$3,000 - $0 = $3,000' }
  },
  {
    id: 'income-under-1k', name: 'Edge: income under $1k', sphere: 1,
    story: '$800 a year, accommodation typed as $0, $200 of cash.',
    people: [{ id: 'p_e3', label: 'Edge Three', dob: '2004-12-12', status: 'employed', income: [{ source: 'Odd jobs', gross: 800 }] }],
    filingStatus: 'single', state: 'ME', grossTotal: 800,
    assets: [{ label: 'Cash', category: 'cash', value: 200 }], cash: 200,
    debts: [], hasDebt: false,
    fat: { food: 300, accommodation: 0, transportation: 50, wants: 100 },
    nw: { value: 200, working: '$200 - $0 = $200' }
  },
  {
    id: 'over-50m', name: 'Edge: values over $50M', sphere: 9,
    story: '58 and 57, $2.4M of income, $60.5M of assets; integer cents past 6 billion.',
    people: [
      { id: 'p_e4a', label: 'Edge Four', dob: '1968-06-01', status: 'employed', income: [{ source: 'Founder salary + distributions', gross: 2400000 }] },
      { id: 'p_e4b', label: 'Edge Four B', dob: '1969-09-09', status: 'notWorking' }
    ],
    filingStatus: 'married_joint', state: 'CT', grossTotal: 2400000,
    assets: [{ label: 'Cash', category: 'cash', value: 1500000 }, { label: 'Brokerage', category: 'investment', value: 38000000, taxCharacter: 'taxable' }, { label: 'Retirement', category: 'retirement', value: 9000000, taxCharacter: 'pretax' }, { label: 'Property', category: 'real_estate', value: 12000000 }], cash: 1500000,
    debts: [], hasDebt: false, dependents: false,
    fat: { food: 5000, accommodation: 25000, transportation: 3000, wants: 40000 },
    nw: { value: 60500000, working: '$1,500,000 + $38,000,000 + $9,000,000 + $12,000,000 - $0 = $60,500,000' }
  },
  {
    id: 'forty-debts', name: 'Edge: forty debts', sphere: 2,
    story: '35, $75k (exactly on a band boundary), forty separate debts from $500 to $10,250.',
    people: [{ id: 'p_e5', label: 'Edge Five', dob: '1991-07-07', status: 'employed', income: [{ source: 'Job', gross: 75000 }] }],
    filingStatus: 'single', state: 'UT', grossTotal: 75000,
    assets: [{ label: 'Cash', category: 'cash', value: 2500 }], cash: 2500,
    debts: fortyDebts, hasDebt: true,
    fat: { food: 500, accommodation: 1400, transportation: 300, wants: 800 },
    nw: { value: -212500, working: '$2,500 - (40 x $500 + $250 x (0+1+...+39)) = $2,500 - ($20,000 + $250 x 780) = $2,500 - $215,000 = -$212,500; minimums = 40 x $25 + $5 x 780 = $4,900 a month' }
  },
  {
    id: 'all-null', name: 'Edge: every optional field null', sphere: 0,
    story: 'Schema.createHousehold({}) with nothing typed: every engine must come back incomplete, never a number.',
    people: [], filingStatus: null, state: null, grossTotal: null,
    assets: [], cash: null, debts: [], hasDebt: null, fat: null,
    nw: { value: null, working: 'nothing entered, so incomplete' }
  }
];

function write(dir, spec) {
  const h = build(spec);
  const file = path.join(dir, spec.id + '.json');
  fs.writeFileSync(file, JSON.stringify(h, null, 2) + '\n');
  return file;
}
/* The specs and the builder are shared with tests/tools/build-exports.js
   (section 5), which builds the same households through OLDER versions of
   shared/schema.js: `build(spec, SchemaAtThatCommit)`. */
module.exports = { ARCHETYPES, EDGES, build, known, AS_OF };
if (require.main === module) {
  fs.mkdirSync(EDGE, { recursive: true });
  const written = ARCHETYPES.map((s) => write(OUT, s)).concat(EDGES.map((s) => write(EDGE, s)));
  console.log('wrote ' + written.length + ' fixtures (' + ARCHETYPES.length + ' archetypes, ' + EDGES.length + ' edge cases)');
}

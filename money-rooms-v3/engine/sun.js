/* The Sun: the hub. It owns the household facts that belong to no planet and
   holds one slot per planet for that planet's published outputs. Planets read
   the Sun, publish to the Sun, and never read each other. The CONTRACT table
   mirrors CONTRACTS.md; a test keeps the two in step. */

export const PLANETS = Object.freeze(['income', 'spending', 'debt', 'safety', 'invest', 'taxes', 'life']);

export const PLANET_LABELS = Object.freeze({
  income: 'Income', spending: 'Spending', debt: 'Debt and credit', safety: 'Safety net',
  invest: 'Investments and accounts', taxes: 'Taxes', life: 'Life plan',
});

export const PLANET_SHORT = Object.freeze({ income: 'Income', spending: 'Spending', debt: 'Debt', safety: 'Safety net', invest: 'Investments', taxes: 'Taxes', life: 'Life plan' });

export const SUN_FIELDS = Object.freeze(['name', 'birthDate', 'state', 'city', 'workSituation', 'dependents', 'filingStatus', 'bigGoal']);
/* Onboarding asks four facts (MR-025); name, dependents and the big goal sit behind "More facts"; city is stored but not asked. */
export const SUN_ASKED = Object.freeze(['birthDate', 'state', 'workSituation', 'filingStatus']);
export const SUN_MORE = Object.freeze(['name', 'dependents', 'bigGoal']);
export const FILING_STATUSES = Object.freeze([['single', 'Single'], ['mfj', 'Married filing jointly'], ['hoh', 'Head of household']]);

export const WORK_SITUATIONS = Object.freeze(['employed', 'self-employed', 'between-jobs', 'student', 'retired', 'mixed']);

export const CONTRACT = Object.freeze({
  income: Object.freeze(['grossMonthly', 'takeHomeMonthly', 'pretaxContribMonthly', 'rothContribMonthly', 'hsaPayrollMonthly', 'pretaxOtherMonthly', 'matchMonthly', 'matchFormula', 'byType', 'stability', 'workHoursMonthly', 'workCostsMonthly']),
  spending: Object.freeze(['baselineMonthly', 'summaryTotalMonthly', 'detailGapMonthly', 'byCategory', 'drafttShares', 'fatFloorMonthly', 'fixedMonthly', 'mistakesAnnual', 'savingsLandingMonthly', 'cardSpendByCategory', 'sharedFullMonthly', 'sharedShareMonthly', 'standIns', 'anchorGapByCategory']),
  debt: Object.freeze(['totalDebt', 'debtServiceMonthly', 'weightedApr', 'annualInterest', 'utilization', 'promoCliffs', 'payoffOrders', 'debtFreeDate', 'freedCashByMonth', 'wallet', 'creditScore', 'byType']),
  safety: Object.freeze(['ruleOf5Months', 'ruleOf5Target', 'runway', 'gap', 'monthlyToClose', 'insurance', 'premiumsMonthly', 'unemploymentMonthly', 'cutAbilityMonthly', 'spendingWithPremiums', 'roommateGap']),
  invest: Object.freeze(['balancesByBucket', 'balancesByLiquidity', 'cashBalances', 'totalAssets', 'investedAssets', 'annualContributions', 'roomLeft', 'allocation', 'weightedExpenseRatio', 'feeDragAnnual', 'matchCapture', 'beneficiariesMissing']),
  taxes: Object.freeze(['federalAnnual', 'ficaAnnual', 'effectiveRate', 'marginalRate', 'savedPer1000Pretax', 'impliedRate', 'taxable', 'standardDeduction', 'ficaParts', 'selfEmployment']),
  life: Object.freeze(['goals', 'events', 'retirementMultipliers', 'retirementAge', 'baristaIncomeMonthly', 'dreamFiAge', 'dreamSpendingMonthly', 'gutSpendingMonthly']),
});

/* Which Sun slots each planet may read (CONTRACTS.md "Reads"). Enforced by
   the read proxy handed to each planet's stations. */
export const READS = Object.freeze({
  income: Object.freeze({ sun: ['workSituation', 'birthDate'], slots: [] }),
  spending: Object.freeze({ sun: ['dependents'], slots: ['income.takeHomeMonthly', 'income.grossMonthly'] }),
  debt: Object.freeze({ sun: [], slots: ['income.takeHomeMonthly', 'income.grossMonthly', 'spending.cardSpendByCategory'] }),
  invest: Object.freeze({ sun: ['birthDate'], slots: ['income.grossMonthly', 'income.matchMonthly', 'income.matchFormula', 'income.pretaxContribMonthly', 'income.rothContribMonthly', 'income.hsaPayrollMonthly'] }),
  safety: Object.freeze({ sun: ['birthDate', 'workSituation'], slots: ['spending.baselineMonthly', 'spending.fatFloorMonthly', 'spending.fixedMonthly', 'spending.byCategory', 'invest.cashBalances', 'income.takeHomeMonthly', 'spending.sharedFullMonthly', 'spending.sharedShareMonthly'] }),
  taxes: Object.freeze({ sun: ['filingStatus'], slots: ['income.grossMonthly', 'income.pretaxContribMonthly', 'income.hsaPayrollMonthly', 'income.pretaxOtherMonthly', 'income.byType', 'income.takeHomeMonthly'] }),
  life: Object.freeze({ sun: ['birthDate'], slots: ['spending.baselineMonthly'] }),
});

export function createSun() {
  const f = {};
  SUN_FIELDS.forEach(id => { f[id] = { v: null, state: 'unknown', source: 'client' }; });
  return { f, outputs: {}, assumptions: {}, clientPicks: [], onepager: {} };
}

export class ContractError extends Error {
  constructor(m) { super(m); this.name = 'ContractError'; }
}

/* Publish a planet's outputs. Keys must match the contract exactly. */
export function publish(sun, planet, outputs) {
  if (!CONTRACT[planet]) throw new ContractError('no such planet ' + planet);
  const allowed = CONTRACT[planet];
  const keys = Object.keys(outputs);
  keys.forEach(k => { if (allowed.indexOf(k) === -1) throw new ContractError(planet + ' may not publish ' + k); });
  allowed.forEach(k => { if (!(k in outputs)) throw new ContractError(planet + ' must publish ' + k); });
  sun.outputs[planet] = Object.freeze(Object.assign({}, outputs));
  return sun.outputs[planet];
}

/* A read-only view for one planet: only its allowed Sun facts and slots. */
export function readerFor(sun, planet) {
  const r = READS[planet];
  if (!r) throw new ContractError('no such planet ' + planet);
  return Object.freeze({
    fact(id) {
      if (r.sun.indexOf(id) === -1) throw new ContractError(planet + ' may not read Sun.' + id);
      return sun.f[id];
    },
    slot(path) {
      if (r.slots.indexOf(path) === -1) throw new ContractError(planet + ' may not read ' + path);
      const [p, key] = path.split('.');
      const out = sun.outputs[p];
      return out ? out[key] : undefined;
    },
    assumption(id) { return sun.assumptions[id]; },
  });
}

// Paycheck deductions: retirement (as a % of gross or a dollar amount), health
// insurance, HSA or FSA, transportation, Roth, and anything else. Each one is
// worked out per paycheck, month, and year, with its tax treatment.

import { toMonthly, PAYCHECKS_PER_YEAR } from './normalize.js';

// incomeTax: lowers income tax. fica: lowers Social Security and Medicare too.
export const DEDUCTION_KINDS = {
  retirement: { label: 'Retirement 401(k) or 403(b)', incomeTax: true, fica: false, retirement: true },
  roth: { label: 'Roth retirement (after tax)', incomeTax: false, fica: false, retirement: true },
  health: { label: 'Health insurance', incomeTax: true, fica: true, retirement: false },
  hsa: { label: 'HSA or FSA', incomeTax: true, fica: true, retirement: false },
  transportation: { label: 'Transportation or transit', incomeTax: true, fica: true, retirement: false },
  dental: { label: 'Dental insurance', incomeTax: true, fica: true, retirement: false },
  vision: { label: 'Vision insurance', incomeTax: true, fica: true, retirement: false },
  life: { label: 'Life insurance', incomeTax: false, fica: false, retirement: false },
  disability: { label: 'Disability insurance', incomeTax: false, fica: false, retirement: false },
  union: { label: 'Union dues', incomeTax: false, fica: false, retirement: false },
  garnishment: { label: 'Garnishment or child support', incomeTax: false, fica: false, retirement: false },
  other: { label: 'Other', incomeTax: null, fica: null, retirement: false }
};

function treatment(d) {
  const k = DEDUCTION_KINDS[d.kind] || DEDUCTION_KINDS.other;
  if (d.kind === 'other') return { incomeTax: !!d.pretax, fica: !!d.pretax, retirement: false };
  return k;
}

// Monthly amount: % of gross pay, or the typed amount in any cadence.
// Empty stays empty: a % with no gross pay, or a blank amount, is null.
export function deductionRows(inc, grossMonthly) {
  const freq = inc.payFrequency;
  const n = PAYCHECKS_PER_YEAR[freq] || null;
  return (inc.deductions || []).map((d) => {
    let monthly;
    if (d.mode === 'percent') monthly = d.percent === null || d.percent === undefined || grossMonthly === null ? null : (grossMonthly * d.percent) / 100;
    else monthly = toMonthly(d.amount, freq);
    const t = treatment(d);
    return {
      id: d.id, kind: d.kind, label: d.label || (DEDUCTION_KINDS[d.kind] || DEDUCTION_KINDS.other).label,
      mode: d.mode, percent: d.mode === 'percent' ? d.percent : null,
      monthly, annual: monthly === null ? null : monthly * 12, perPaycheck: monthly === null || !n ? null : (monthly * 12) / n,
      status: d.mode === 'percent' ? (monthly === null ? null : 'computed') : d.amount.status,
      lowersIncomeTax: t.incomeTax, lowersFica: t.fica, retirement: t.retirement
    };
  });
}

// Totals used by the tax estimate and the budget. Missing amounts are counted, not zeroed.
export function deductionTotals(rows) {
  const add = (test) => rows.filter((r) => r.monthly !== null && test(r)).reduce((a, r) => a + r.monthly, 0);
  return {
    all: add(() => true),
    retirement: add((r) => r.retirement),
    incomeTaxFree: add((r) => r.lowersIncomeTax),
    ficaFree: add((r) => r.lowersFica),
    missing: rows.filter((r) => r.monthly === null).length
  };
}

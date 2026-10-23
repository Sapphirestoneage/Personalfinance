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

// Estimate history on screen (S-090): for one category, the estimate at each
// close, the plan each month, and the actual each month, so guesses and plans
// can be seen moving toward reality. Plus the list of estimate changes.

import { planView } from './plan.js';
import { toMonthly } from './normalize.js';
import { primaryPayFrequency } from './model.js';

export function estimateHistory(doc, history, catId) {
  const keys = history.allKeys;
  const pts = history.byCategory[catId] || [];
  const at = (k) => pts.find((p) => p.key === k) || null;
  const rows = keys.map((k) => {
    const p = at(k);
    const rec = (doc.months || []).find((m) => m.key === k);
    const plan = planView(doc, k);
    return {
      key: k, closed: !!rec,
      estimate: rec && rec.snapshot.categories[catId] ? rec.snapshot.categories[catId].estimate : null,
      plan: plan && plan.cats[catId] ? plan.cats[catId].amount : null,
      actual: p ? p.actual : null
    };
  });
  const freq = primaryPayFrequency(doc);
  const cat = doc.categories.find((c) => c.id === catId);
  const lineIds = new Set(cat ? cat.lines.map((l) => l.id) : []);
  const changes = (doc.estimateLog || []).filter((e) => e.categoryId === catId || lineIds.has(e.lineId)).map((e) => ({
    at: e.at, month: e.month, what: e.categoryId ? (cat ? cat.name : catId) : ((cat && cat.lines.find((l) => l.id === e.lineId)) || { name: e.lineId }).name,
    from: e.from ? toMonthly(e.from, freq) : null, to: e.to ? toMonthly(e.to, freq) : null
  }));
  return { catId, rows, changes };
}

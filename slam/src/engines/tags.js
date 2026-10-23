// Totals by the client's own tags: estimate and actual a month for every line
// carrying the tag. A line can carry several tags, so tags can overlap.
// Depends on money.js (sumKnown). Dollars a month, read from the budget model.

import { sumKnown } from './money.js';

/**
 * One total per tag.
 * @param {object} doc the household file (doc.tags).
 * @param {object} model what budgetModel returns.
 * @returns {Array<{id: string, name: string, count: number, lines: string[], estimate: ?number, actual: ?number,
 *   actualMissing: number}>} dollars a month; a total is null when no tagged line has that number; actualMissing counts
 *   the tagged lines with no actual yet.
 */
export function tagTotals(doc, model) {
  return (doc.tags || []).map((t) => {
    const lines = model.categories.flatMap((c) => c.lines.filter((l) => l.tags && l.tags.includes(t.id)).map((l) => ({ ...l, category: c.name })));
    const est = sumKnown(lines.map((l) => l.estimate));
    const act = sumKnown(lines.map((l) => l.actual));
    return {
      id: t.id, name: t.name, count: lines.length, lines: lines.map((l) => l.name),
      estimate: est.total, actual: act.total, actualMissing: act.missing
    };
  });
}

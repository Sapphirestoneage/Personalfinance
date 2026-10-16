// Totals by the client's own tags: estimate and actual a month for every line
// carrying the tag. A line can carry several tags, so tags can overlap.

import { sumKnown } from './money.js';

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

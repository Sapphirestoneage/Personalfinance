// App-supplied averages for blank category estimates. Always status "guess",
// always labeled with their source: the national average for the household size.

import { hasAnswer } from './normalize.js';

const NO_GUESS = new Set(['debt', 'savings', 'fees', 'everything']);

// You, a spouse on a joint return, and dependents. Roommates keep their own budgets.
export function householdSize(doc) {
  const deps = doc.household.dependents.count || 0;
  const spouse = doc.household.filingStatus === 'married-joint' ? 1 : 0;
  return Math.min(5, 1 + spouse + deps);
}

export function guessFor(doc, catId, refs) {
  if (NO_GUESS.has(catId)) return null;
  const size = householdSize(doc);
  const row = refs.averages.byHouseholdSize[String(size)];
  if (!row || row[catId] === undefined) return null;
  return {
    amount: Math.round(row[catId]), cadence: 'month', status: 'guess', source: 'app', asOf: null,
    note: 'Guess: national average, household of ' + size + ', source ' + (refs.averages.placeholder ? 'placeholder ' : '') +
      'BLS Consumer Expenditure Survey ' + refs.averages.year
  };
}

// Blank category estimates that a guess could fill (not single-total mode).
export function availableGuesses(doc, refs) {
  if (doc.settings.singleTotal) return [];
  const out = [];
  // Guesses follow what a category counts as (S-068), once per type: a second
  // Food category gets none, and none if another category of that type has an answer.
  const answered = (c) => hasAnswer(c.estimate) || c.lines.some((l) => l.state !== 'archived' && hasAnswer(l.estimate));
  const offered = new Set();
  for (const c of doc.categories) {
    if (c.state === 'archived' || answered(c) || c.id === 'everything' || offered.has(c.type)) continue;
    if (doc.categories.some((o) => o !== c && o.state !== 'archived' && o.type === c.type && answered(o))) continue;
    offered.add(c.type);
    const g = guessFor(doc, c.type, refs);
    if (g) out.push({ categoryId: c.id, name: c.name, value: g });
  }
  return out;
}

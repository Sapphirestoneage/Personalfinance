// App-supplied averages for blank category estimates. Always status "guess",
// always labeled with their source: the national average for the household size.
// Depends on normalize.js (hasAnswer) and the averages table src/data/spending-averages.json,
// handed in as refs.averages (ui/refs.js loads it). Dollars a month, rounded to the dollar.

import { hasAnswer } from './normalize.js';

// No guess for debt payments (they come from the debts), savings (the client's own surplus allocation),
// fees, or the single-total "everything" category.
const NO_GUESS = new Set(['debt', 'savings', 'fees', 'everything']);

/**
 * Household size for the averages table: you, a spouse on a joint return, and dependents, capped at 5
 * (the table's last row). Roommates keep their own budgets.
 * @param {object} doc the household file.
 * @returns {number} 1 to 5.
 */
export function householdSize(doc) {
  // A blank dependents count reads as none here: a guess needs a size, and 1 is the smallest row.
  const deps = doc.household.dependents.count || 0;
  const spouse = doc.household.filingStatus === 'married-joint' ? 1 : 0;
  return Math.min(5, 1 + spouse + deps);
}

/**
 * The app's guess for one category type, or null where none is offered.
 * @param {object} doc the household file.
 * @param {string} catId the category type (what it counts as, S-068; callers pass c.type): housing, food, transport, and so on.
 * @param {{averages: object}} refs reference data; averages is spending-averages.json.
 * @returns {?object} a Value in dollars a month: { amount, cadence: 'month', status: 'guess', source: 'app', asOf: null, note },
 *   the note naming the survey, its year and the household size; null for a type with no guess or no table row.
 */
export function guessFor(doc, catId, refs) {
  if (NO_GUESS.has(catId)) return null;
  const size = householdSize(doc);
  const row = refs.averages.byHouseholdSize[String(size)];
  if (!row || row[catId] === undefined) return null;
  // Whole dollars: a guess with cents would look measured. The table says when its figures are a
  // placeholder, and the note repeats that so the label stays honest.
  return {
    amount: Math.round(row[catId]),
    cadence: 'month',
    status: 'guess',
    source: 'app',
    asOf: null,
    note:
      'Guess: national average, household of ' +
      size +
      ', source ' +
      (refs.averages.placeholder ? 'placeholder ' : '') +
      'BLS Consumer Expenditure Survey ' +
      refs.averages.year
  };
}

/**
 * Blank category estimates that a guess could fill (not in single-total mode).
 * @param {object} doc the household file.
 * @param {{averages: object}} refs reference data (spending-averages.json).
 * @returns {Array<{categoryId: string, name: string, value: object}>} one per category; value is a guess Value in dollars a month.
 */
export function availableGuesses(doc, refs) {
  if (doc.settings.singleTotal) return [];
  const out = [];
  // Guesses follow what a category counts as (S-068), once per type: a second
  // Food category gets none, and none if another category of that type has an answer.
  // A typed 0 or "doesn't apply" is an answer (hasAnswer), so no guess is offered over it.
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

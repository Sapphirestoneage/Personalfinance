// One list of open questions (morning answer 10, S-252): every number still missing, and every guess worth checking now
// (the Still guessing ranking's check-now rule, engine/ledger.js checkNow), each with its My numbers section. My
// numbers (its To fill in counts and the Taxes screen's), the Session's steps, Still guessing and the Profile all read
// this list, so their counts agree. A missing number nothing reads yet still counts: it is a question until answered.
// Pure: the ranking is passed in (it takes about a second, so pages figure it in slices, ui/urgency.js).

import { groupFor } from './labels.js';
import { rowPathFor } from './ledger.js';

export const SECTION_OF = { D: 'debt', A: 'assets', T: 'taxes', I: 'income', E: 'needs', G: 'goals' };
export const SECTION_WORDS = { debt: 'Debt', assets: 'Assets', taxes: 'Taxes', income: 'Income', needs: 'Needs', goals: 'Goals', profile: 'Profile' };

// Open: a missing number (unless set to check later) or a guess worth checking now. The one rule; ui/urgency.js
// worthNow (every row's mark) reads it too.
export const isOpenItem = (x) => x.urgency === 'now' || (x.kind === 'missing' && x.urgency !== 'later');

// [{ path, row, label, kind: 'missing'|'checkNow', section, why }] in the ranking's order.
export function openQuestions(spine, guess) {
  if (!guess) return null;
  // A Profile answer is asked on the Profile, not here.
  return guess.items.filter((x) => isOpenItem(x) && !x.path.startsWith('profile.')).map((x) => ({
    path: x.path, row: rowPathFor(spine, x.path), label: x.label, kind: x.kind === 'missing' ? 'missing' : 'checkNow',
    section: x.path.startsWith('profile.') || x.path.startsWith('assumptions.') ? 'profile' : SECTION_OF[groupFor(x.path)] || 'goals', why: x.why || null
  }));
}

// How many in all and in each section: { total, debt, assets, taxes, income, needs, goals, profile }.
export function openCounts(list) {
  if (!list) return null;
  const c = { total: list.length };
  for (const k of Object.keys(SECTION_WORDS)) c[k] = 0;
  for (const q of list) c[q.section]++;
  return c;
}

// The paths a row of My numbers can carry (its own and its Fact's), for "is this row an open question?".
export const openPaths = (list) => new Set((list || []).flatMap((q) => [q.path, q.row]));

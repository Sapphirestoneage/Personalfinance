// On a parent's health plan: in the US a child can stay on a parent's plan
// until 26, so the option exists only while the client is 25 or younger.
// Age is the working month's year minus the birth year (birthdays are not asked).

export const PARENTS_PLAN_MAX_AGE = 25;

export function ageThisYear(doc) {
  const by = doc.profile && doc.profile.birthYear;
  if (!by || !doc.currentMonth) return null;
  return Number(doc.currentMonth.slice(0, 4)) - by;
}

export function parentsPlan(doc) {
  const age = ageThisYear(doc);
  const eligible = age !== null && age <= PARENTS_PLAN_MAX_AGE;
  const chosen = !!(doc.household && doc.household.parentsPlan);
  return { age, eligible, chosen, on: chosen && eligible, agedOut: chosen && age !== null && !eligible };
}

// Lines a parent's plan pays for: health insurance premiums.
export const PARENTS_PLAN_LINE_TYPES = ['health-insurance'];

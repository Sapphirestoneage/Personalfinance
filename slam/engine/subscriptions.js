// Subscriptions (S-191): expenses marked as renewing on their own. Each has its
// cost to you a month and a year, its next charge date (rolled forward past
// today by how often it is charged), and when it was last reviewed. One is due
// a look when it renews within SUB_RENEW_SOON_DAYS or has not been reviewed in
// SUB_REVIEW_DAYS.

import { tracker, valueOf as v, round2, daysBetween, addMonths, dayIn } from './spine.js';
import { hiddenLine } from './profile.js';

const STEP_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

// The next charge on or after asOf: a past date moves forward by its cadence.
export function nextCharge(date, cadence, asOf) {
  if (!date) return null;
  const step = STEP_MONTHS[cadence];
  let d = date;
  if (step) while (d < asOf) d = dayIn(addMonths(d.slice(0, 7), step), +date.slice(8, 10));
  return d;
}

export const isSubscription = (e) => !!e.subscription && v(e.subscription) === true;

export function subscriptions(spine, rules, cf, asOf) {
  const year = +asOf.slice(0, 4);
  const reviewDays = rules.get('SUB_REVIEW_DAYS', year), soonDays = rules.get('SUB_RENEW_SOON_DAYS', year);
  const t = tracker();
  const items = [];
  for (const e of spine.expenses || []) {
    if (!isSubscription(e) || hiddenLine(spine, e)) continue;
    const base = 'expenses.' + e.id;
    t.useFact(base + '.amount', e.amount);
    const line = cf.expenses.items.find((i) => i.id === e.id);
    const monthly = line ? line.amount : null;
    const renews = nextCharge(e.renews ? t.useFact(base + '.renews', e.renews) : null, e.cadence, asOf);
    const reviewed = e.reviewed ? t.useFact(base + '.reviewed', e.reviewed) : null;
    const daysToCharge = renews ? daysBetween(asOf, renews) : null;
    const sinceReview = reviewed ? daysBetween(reviewed, asOf) : null;
    items.push({
      id: e.id, label: e.label, monthly: round2(monthly), yearly: monthly === null ? null : round2(monthly * 12), cadence: e.cadence,
      renews, daysToCharge, reviewed, sinceReview,
      soon: daysToCharge !== null && daysToCharge <= soonDays,
      due: reviewed === null || sinceReview > reviewDays
    });
  }
  // Soonest charge first, then the ones never reviewed.
  items.sort((a, b) => (a.daysToCharge ?? 1e9) - (b.daysToCharge ?? 1e9) || a.label.localeCompare(b.label));
  const known = items.filter((i) => i.monthly !== null);
  const monthly = round2(known.reduce((x, i) => x + i.monthly, 0));
  t.rule(rules, 'SUB_REVIEW_DAYS', year); t.rule(rules, 'SUB_RENEW_SOON_DAYS', year);
  return {
    items, reviewDays, soonDays,
    monthly: t.out(items.length ? monthly : null),
    yearly: items.length ? round2(monthly * 12) : null,
    toLook: items.filter((i) => i.soon || i.due)
  };
}

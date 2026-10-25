// Date helpers and the pay schedule (S-209): what the Budget app keeps of its
// retired cash calendar. payDates (the real pay dates in a month, S-117) feeds
// the income month; forecastCheck reads forecasts the old calendar saved so
// closed months keep their predicted-vs-actual line. Nothing here draws a
// calendar: that lives in SLAM (calendar.html).

const DAY = 86400000;
const STEP_DAYS = { weekly: 7, biweekly: 14 };
const r2 = (x) => Math.round(x * 100) / 100 + 0;
const inCalendar = (a) => a.type === 'checking';
export function addDays(iso, n) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const dateIn = (month, day) => month + '-' + String(Math.min(day, daysInMonth(month))).padStart(2, '0');

export function payDates(inc, month) {
  const first = month + '-01';
  const last = dateIn(month, 31);
  const dates = [];
  if (inc.payFrequency === 'semimonthly') {
    const days = inc.payDays && inc.payDays.length === 2 ? inc.payDays : [1, 15];
    for (const d of days) dates.push(dateIn(month, d));
    return dates.sort();
  }
  const d0 = inc.nextPayDate && inc.nextPayDate.date;
  if (!d0) return null;
  if (inc.payFrequency === 'monthly') dates.push(dateIn(month, Number(d0.slice(8))));
  else {
    const step = STEP_DAYS[inc.payFrequency];
    if (!step) return null;
    let d = addDays(d0, -step * Math.ceil(Math.max(0, daysBetween(first, d0)) / step));
    while (d < first) d = addDays(d, step);
    for (; d <= last; d = addDays(d, step)) dates.push(d);
  }
  // Unemployment stops when the weeks left run out, counted from the next pay date.
  if (inc.type === 'unemployment' && inc.benefitWeeksLeft !== null && inc.benefitWeeksLeft !== undefined) {
    const end = addDays(d0, inc.benefitWeeksLeft * 7);
    for (let i = dates.length - 1; i >= 0; i--) if (dates[i] >= end) dates.splice(i, 1);
  }
  return dates.sort();
}

export function forecastCheck(doc, month) {
  const saved = ((doc.cashflow || {}).forecasts || {})[month];
  const accts = (doc.accounts || []).filter((a) => a.state !== 'archived' && inCalendar(a));
  const ends = accts.map((a) => (((doc.balances[month] || {})[a.id] || {}).end || {}).amount);
  const actual = accts.length && ends.every((x) => x !== null && x !== undefined) ? r2(ends.reduce((a, x) => a + x, 0)) : null;
  const predicted = saved ? saved.predicted : null;
  return { month, predicted, actual, diff: predicted === null || actual === null ? null : r2(actual - predicted) };
}

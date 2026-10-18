// What owning really costs (S-113): a read-only lens on each home and vehicle. Its monthly cost you
// never get back, next to the alternative the coach entered. The client's own budget lines come
// first; a Guess (with its source) only fills a number that is missing; anything else missing is
// named, never counted as 0.
//
// Every budget amount is a typical month: the line's estimate, else its actual.
//
// Home, a month:
//   never back = mortgage interest (the linked debt: balance x APR / 12) + property tax (Housing lines
//   of type Taxes) + home insurance (lines of type Home & Renters Insurance) + maintenance (Housing
//   lines of type Home & Garden; else Guess: 1% of the value a year) + the return the equity could
//   earn elsewhere (equity x the return assumption / 12; an assumption, 5% real a year unless the
//   coach changes it in Setup).
//   Also: what the home costs to hold (every Housing line) and the part of the payment that builds
//   equity (the principal: the payment less the interest).
//   Compared with: rent for a similar place (entered by the coach, or not set).
// Vehicle, a month:
//   never back = depreciation (from its dated values over the last year; else Guess: 15% of the
//   value a year) + insurance + interest on the linked loan + maintenance + parking and tolls + gas
//   (each from the budget lines of that type).
//   Compared with: rideshare + transit + an occasional rental, a month (entered by the coach).
//
// When there is more than one home (or vehicle), the budget lines go with the first one.

import { observations, balanceAt } from './balances.js';
import { kindOf } from './balances.js';
import { DEFAULT_OWN_RETURN } from '../store/schema.js';
import { minimumAmount } from './debts.js';

const r2 = (x) => Math.round(x * 100) / 100 + 0;
const add = (xs) => r2(xs.reduce((a, x) => a + x, 0));
export const DEFAULT_RETURN = DEFAULT_OWN_RETURN;
export const GUESS = {
  homeMaintenance: { rate: 0.01, source: 'Guess: 1% of the value a year, a common rule of thumb for upkeep' },
  vehicleDepreciation: { rate: 0.15, source: 'Guess: 15% of the value a year, typical for a used car' }
};
const typed = (v) => !!v && v.amount !== null && v.amount !== undefined;

// A typical month: the estimate, else the budget's own amount (the actual). A month still in
// progress has only part of its actual (S-115).
const monthly = (x) => (x.estimate !== null && x.estimate !== undefined ? x.estimate : x.basis);

// The budget lines of some types (in categories of some types), a typical month. Null when there are none.
function fromBudget(summary, lineTypes, catTypes) {
  const rows = summary.rows.filter((r) => !catTypes || catTypes.includes(r.type));
  const lines = rows.flatMap((r) => r.lines.filter((l) => lineTypes.includes(l.lineType || l.type) && monthly(l) !== null));
  return lines.length ? { amount: add(lines.map(monthly)), lines: lines.map((l) => l.name) } : null;
}

// Depreciation from dated values: the fall from the earliest value in the last 12 months to the
// latest, per month. Null when there are not two values at least a month apart.
export function depreciationFromValues(obs, date) {
  const from = new Date(Date.parse(date + 'T00:00:00Z') - 365 * 86400000).toISOString().slice(0, 10);
  const inYear = obs.filter((o) => o.date <= date && o.date >= from);
  if (inYear.length < 2) return null;
  const a = inYear[0];
  const b = inYear[inYear.length - 1];
  // Month end to month end counts whole months; any other pair of days, days / 30.4375.
  const isEnd = (d) => new Date(Date.parse(d + 'T00:00:00Z') + 86400000).getUTCDate() === 1;
  const [y1, m1] = a.date.split('-').map(Number);
  const [y2, m2] = b.date.split('-').map(Number);
  const months = isEnd(a.date) && isEnd(b.date) ? (y2 - y1) * 12 + (m2 - m1) : (Date.parse(b.date) - Date.parse(a.date)) / (86400000 * 30.4375);
  if (months < 1) return null;
  return { amount: r2((a.amount - b.amount) / months), from: a, to: b, months: r2(months) };
}

export function owningCosts(doc, summary, date) {
  const accts = (doc.accounts || []).filter((a) => a.state !== 'archived' && (a.type === 'home' || a.type === 'vehicle'));
  const rate = typeof (doc.settings || {}).ownReturn === 'number' ? doc.settings.ownReturn : DEFAULT_RETURN;
  const firstOf = (type) => accts.find((a) => a.type === type);
  return accts.map((a) => {
    const v = balanceAt(doc, a.id, date);
    const value = v ? v.amount : null;
    const debt = a.securedDebtId ? (doc.debts || []).find((d) => d.id === a.securedDebtId) : null;
    const owed = debt ? balanceAt(doc, debt.id, date) : null;
    const balance = debt ? (owed ? owed.amount : null) : 0;
    const apr = debt && typed(debt.apr) ? debt.apr.amount : null;
    const interest = !debt ? 0 : balance === null || apr === null ? null : r2((balance * apr) / 100 / 12);
    const payment = debt ? minimumAmount(doc, debt) : null;
    const equity = value === null || balance === null ? null : r2(value - balance);
    const ownsLines = firstOf(a.type) === a;
    const parts = [];
    const part = (key, label, amount, from, note) => parts.push({ key, label, amount: amount === null ? null : r2(amount), from, note: note || '' });
    const budget = (key, label, lineTypes, catTypes, guess) => {
      const b = ownsLines ? fromBudget(summary, lineTypes, catTypes) : null;
      if (b) return part(key, label, b.amount, 'budget', b.lines.join(', '));
      if (guess) return part(key, label, guess.amount, 'guess', guess.source);
      part(key, label, null, null, 'Not in the budget');
    };
    if (debt) part('interest', a.type === 'home' ? 'Mortgage interest' : 'Loan interest', interest, 'debt', debt.label + (apr === null ? ': needs its APR' : balance === null ? ': needs its balance' : ': ' + apr + '% on ' + balance));
    let alternative;
    if (a.type === 'home') {
      budget('tax', 'Property tax', ['taxes'], ['housing']);
      budget('insurance', 'Home insurance', ['home-insurance'], ['housing']);
      budget('maintenance', 'Maintenance', ['home-garden'], ['housing'], value === null ? null : { amount: (value * GUESS.homeMaintenance.rate) / 12, source: GUESS.homeMaintenance.source });
      part('opportunity', 'What the equity could earn elsewhere', equity === null ? null : (Math.max(0, equity) * rate) / 12, 'assumption', 'Assumption: ' + (rate * 100).toFixed(1).replace(/\.0$/, '') + '% a year, after inflation (Setup, Cushion and coach settings)');
      const rent = a.rentAlt && typed(a.rentAlt) ? a.rentAlt.amount : null;
      alternative = { amount: rent, parts: [{ key: 'rent', label: 'Rent for a similar place', amount: rent }], set: rent !== null };
    } else {
      const dep = depreciationFromValues(observations(doc, a.id), date);
      if (dep) part('depreciation', 'Depreciation', dep.amount, 'values', 'From ' + dep.from.amount + ' on ' + dep.from.date + ' to ' + dep.to.amount + ' on ' + dep.to.date);
      else part('depreciation', 'Depreciation', value === null ? null : (value * GUESS.vehicleDepreciation.rate) / 12, value === null ? null : 'guess', GUESS.vehicleDepreciation.source);
      budget('insurance', 'Insurance', ['auto-insurance']);
      budget('maintenance', 'Maintenance', ['auto-maintenance']);
      budget('parking', 'Parking and tolls', ['parking-tolls']);
      budget('gas', 'Gas', ['gas']);
      const alt = [['rideshare', 'Rideshare', a.rideshareAlt], ['transit', 'Transit', a.transitAlt], ['rental', 'An occasional rental', a.rentalAlt]]
        .map(([key, label, val]) => ({ key, label, amount: typed(val) ? val.amount : null }));
      const set = alt.filter((x) => x.amount !== null);
      alternative = { amount: set.length ? add(set.map((x) => x.amount)) : null, parts: alt, set: set.length > 0 };
    }
    const known = parts.filter((p) => p.amount !== null);
    const neverBack = known.length ? add(known.map((p) => p.amount)) : null;
    const housing = a.type === 'home' && ownsLines ? summary.rows.find((r) => r.type === 'housing') : null;
    return {
      id: a.id, name: a.name, type: a.type, value, valueAsOf: v ? v.date : null, valueStatus: v ? v.status : null,
      debt: debt ? { id: debt.id, name: debt.label, balance, apr, interest, payment, principal: payment === null || interest === null ? null : r2(payment - interest) } : null,
      equity, rate, parts, neverBack, missing: parts.filter((p) => p.amount === null).map((p) => p.label),
      // What the home costs to hold: every Housing line, plus the mortgage payment (it sits in Debt payments).
      hold: housing ? { lines: monthly(housing), payment, total: monthly(housing) === null || (debt && payment === null) ? null : r2(monthly(housing) + (payment || 0)) } : null,
      alternative,
      notes: a.notes || ''
    };
  }).map((x) => ({ ...x, reading: owningReading(x) }));
}

const whole = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');

// Descriptive, never a verdict.
export function owningReading(x) {
  if (x.neverBack === null) return 'Needs a value and the costs of holding it first.';
  const head = (x.type === 'home' ? 'Owning costs you about ' : 'The ' + (x.name.toLowerCase().includes('car') ? 'car' : 'vehicle') + ' costs about ') + whole(x.neverBack) + ' a month you\'ll never get back' + (x.missing.length ? ' (not counting ' + x.missing.join(', ').toLowerCase() + ')' : '') + '.';
  if (!x.alternative.set) return head + (x.type === 'home' ? ' Rent for a similar place is not set yet.' : ' The cost of your trips without it is not set yet.');
  if (x.type === 'home') return head + ' Renting a similar place would be about ' + whole(x.alternative.amount) + '.';
  const names = x.alternative.parts.filter((p) => p.amount !== null).map((p) => (p.key === 'rideshare' ? 'Uber' : p.key === 'transit' ? 'transit' : 'a rental'));
  return head + ' Your trips by ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0]) + ' would be about ' + whole(x.alternative.amount) + '.';
}

export const lockedIn = (doc) => (doc.accounts || []).filter((a) => a.state !== 'archived' && kindOf(a) === 'valued');

/* G12..G18: the named helpers. */
import { describe, it } from 'vitest';
import { arcPlan, clientsFromEvents, powerCurve, subscriberOfferLift, valueStack } from '@/engine/formulas';
import { aggregateMonth } from '@/engine/aggregate';
import { canonicalCalls, canonicalContent, canonicalRegulars, canonicalInPerson, canonicalShared } from '@/content/canonical';
import { withValues } from '@/engine/reader';
import { $, unwrap, within, withinDollars } from '../helpers';

describe('G12 clients from events', () => {
  it('2 events x 10 conversations x 5% = 1.0', () => within(clientsFromEvents(2, 10, 0.05), 1.0, 1e-9));
  it('3 x 15 x 7% = 3.15', () => within(clientsFromEvents(3, 15, 0.07), 3.15, 1e-9));
});

describe('G13 power curve b = 0.65', () => {
  it('fitted to 10 posts = 50 people, 1,000 posts gives about 1,000 (+/-1%)', () => {
    const people = powerCurve(0.65, 10, 50);
    within(people(1000), 1000, 10, 'people at 1,000 posts');
    within(people(10), 50, 1e-9, 'the fitted point holds');
  });
});

describe('G14 offer to subscribers', () => {
  it('400 subs x 3% take, $30 credit, 6 would book anyway, $375 GP: +$1,890', () => {
    withinDollars(subscriberOfferLift({ subscribers: 400, takeRate: 0.03, creditCents: $(30), wouldBookAnyway: 6, gpPerBookingCents: $(375) }), 1890, 0.01);
  });
});

describe('G15 the stack: 150 subs, 10 customs, 8 calls, 6 sessions, 4 regulars', () => {
  it('is $8,090 gross profit at canonical prices', () => {
    /* 6 sessions from the funnel: 60 x .5 x .4 x .85 x 1.3 = 13.26, so set inquiries for 6 */
    const inPerson = canonicalInPerson();
    const inquiriesForSix = 6 / (0.5 * 0.4 * 0.85 * 1.3);
    inPerson.inputs = withValues(inPerson.inputs, { inquiriesPerMonth: inquiriesForSix });
    const t = unwrap(
      aggregateMonth({
        businesses: [inPerson, canonicalContent(), canonicalCalls(), canonicalRegulars()],
        shared: canonicalShared(),
      }),
    );
    withinDollars(t.grossProfitCents, 8090, 1, 'gross profit');
    const by = Object.fromEntries(t.businesses.map((b) => [b.type, b.month.grossProfitCents]));
    withinDollars(by.content!, 2600, 0.01, 'content: 150 x $15 x 80% + 10 x $100 x 80%');
    withinDollars(by.calls!, 1440, 0.01, 'calls: 8 x $200 x 90%');
    withinDollars(by.inPerson!, 2250, 0.5, 'sessions: 6 x $375');
    withinDollars(by.regulars!, 1800, 0.01, 'regulars: 4 x $500 x 90%');
  });
});

describe('G16 $2,000 arc, 5% fees, $400 variable, 14 hours, $10,000 goal', () => {
  it('is $1,500 GP each, 6.67 clients, 93.3 hours', () => {
    const r = arcPlan({ priceCents: $(2000), feeRate: 0.05, variableCostCents: $(400), allInHours: 14, goalCents: $(10_000) })!;
    withinDollars(r.gpPerClientCents, 1500, 0.01);
    within(r.clientsNeeded, 6.67, 0.005, 'clients');
    within(r.hoursNeeded, 93.3, 0.05, 'hours');
  });
});

describe('G17 $3,000 arc, same', () => {
  it('is $2,450 GP each, 4.08 clients, 57.1 hours', () => {
    const r = arcPlan({ priceCents: $(3000), feeRate: 0.05, variableCostCents: $(400), allInHours: 14, goalCents: $(10_000) })!;
    withinDollars(r.gpPerClientCents, 2450, 0.01);
    within(r.clientsNeeded, 4.08, 0.005, 'clients');
    within(r.hoursNeeded, 57.1, 0.05, 'hours');
  });
});

describe('G18 arc value stack', () => {
  it('$150 + $2,000 + $600 + $200 + $100 + $75 + $100 = $3,225, above the $3,000 price', () => {
    const items = [150, 2000, 600, 200, 100, 75, 100].map((v, i) => ({ name: `item ${i + 1}`, valueCents: $(v) }));
    const r = valueStack(items, $(3000));
    withinDollars(r.totalCents, 3225, 0.01);
    within(r.aboveprice ? 1 : 0, 1, 0, 'above price');
  });
});

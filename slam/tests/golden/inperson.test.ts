/* G1..G11: the canonical in-person business. */
import { describe, it } from 'vitest';
import { inPersonMonth, type InPersonMonth } from '@/engine/businesses';
import { aggregateMonth } from '@/engine/aggregate';
import { inquiriesForGoal } from '@/engine/reverse';
import { sensitivity } from '@/engine/sensitivity';
import { throughputPerHour } from '@/engine/formulas';
import { withValues } from '@/engine/reader';
import { canonicalInPerson, canonicalShared } from '@/content/canonical';
import { $, unwrap, within, withinDollars } from '../helpers';

const NO_HOURS = { sellableHours: null };

function month(mix: Parameters<typeof canonicalInPerson>[0] = {}, patch: Record<string, number> = {}): InPersonMonth {
  const b = canonicalInPerson(mix);
  return unwrap(inPersonMonth(withValues(b.inputs, patch), b.offers, NO_HOURS));
}

describe('G1 baseline (canonical in-person)', () => {
  it('is $4,972.50 gross profit and 13.26 sessions', () => {
    const m = month();
    withinDollars(m.grossProfitCents, 4972.5, 1, 'gross profit');
    within(m.sessions, 13.26, 0.005, 'sessions');
    within(m.newClients, 10.2, 0.001, 'new clients');
  });
});

describe('G2 price $600', () => {
  it('adds $1,259.70', () => {
    const b = canonicalInPerson();
    const pricier = unwrap(inPersonMonth(b.inputs, { single: withValues(b.offers.single!, { priceCents: $(600) }) }, NO_HOURS));
    withinDollars(pricier.grossProfitCents - month().grossProfitCents, 1259.7, 1, 'delta');
  });
});

describe('G3 rebook 60%', () => {
  it('adds $1,147.50', () => {
    withinDollars(month({}, { rebookRate: 0.6 }).grossProfitCents - month().grossProfitCents, 1147.5, 1, 'delta');
  });
});

describe('G4 screening pass 60%', () => {
  it('adds $994.50', () => {
    withinDollars(month({}, { passRate: 0.6 }).grossProfitCents - month().grossProfitCents, 994.5, 1, 'delta');
  });
});

describe('G5 double inquiries, capacity 18', () => {
  it('adds $1,777.50 because the cap binds at 18 sessions', () => {
    const m = month({}, { inquiriesPerMonth: 120 });
    within(m.sessions, 18, 1e-9, 'sessions at cap');
    withinDollars(m.grossProfitCents - month().grossProfitCents, 1777.5, 1, 'delta');
    within(m.demandSessions, 26.52, 0.005, 'demand before the cap');
  });
});

describe('G6 per 10 inquiries, single session only', () => {
  it('is $828.75 and 2.21 sessions', () => {
    const m = month({}, { inquiriesPerMonth: 10 });
    withinDollars(m.grossProfitCents, 828.75, 1, 'gross profit');
    within(m.sessions, 2.21, 0.005, 'sessions');
  });
});

describe('G7 per 10 inquiries, plus add-on and retainer', () => {
  it('is $1,723.38 and 3.52 sessions', () => {
    const m = month({ addon: true, retainer: true }, { inquiriesPerMonth: 10 });
    withinDollars(m.grossProfitCents, 1723.38, 2, 'gross profit');
    within(m.sessions, 3.52, 0.01, 'sessions');
  });
});

describe('G8 per 10 inquiries, $3,000 arc at 40% close', () => {
  it('is $1,666', () => {
    const m = month({ arc: true }, { inquiriesPerMonth: 10 });
    withinDollars(m.grossProfitCents, 1666, 1, 'gross profit');
    within(m.newClients, 0.68, 0.001, 'arc clients');
  });
});

describe('G9 reverse solve for $6,000 profit with the G7 offer', () => {
  it('needs 44 inquiries and about 15.5 sessions', () => {
    const b = canonicalInPerson({ addon: true, retainer: true });
    const r = unwrap(inquiriesForGoal(b, canonicalShared(), $(6000)));
    within(r.inquiriesNeeded, 44, 0, 'inquiries');
    within(r.sessionsNeeded, 15.5, 0.1, 'sessions');
    within(r.withinCapacity ? 1 : 0, 1, 0, 'within the 18-session capacity');
  });
});

describe('G10 throughput', () => {
  it('$500 price, $125 cost, 4 hours is $93.75 per hour', () => {
    withinDollars(throughputPerHour($(500), $(125), 4)!, 93.75, 0.01, 'throughput');
  });
});

describe('G11 sensitivity: +1 point booking rate', () => {
  it('adds $124.31', () => {
    const b = canonicalInPerson();
    const rows = sensitivity(b, null);
    const booking = rows.find((r) => r.key === 'inputs.bookingRate')!;
    withinDollars(booking.deltaCents, 124.31, 0.5, 'delta');
  });
  it('lists the moves biggest first', () => {
    const rows = sensitivity(canonicalInPerson(), null);
    for (let i = 1; i < rows.length; i++) within(Math.abs(rows[i - 1]!.deltaCents) >= Math.abs(rows[i]!.deltaCents) ? 1 : 0, 1, 0, 'sorted');
  });
});

describe('F23 the aggregate keeps the same numbers for one business', () => {
  it('matches G1 through the aggregate', () => {
    const t = unwrap(aggregateMonth({ businesses: [canonicalInPerson()], shared: canonicalShared() }));
    withinDollars(t.grossProfitCents, 4972.5, 1, 'gross profit');
  });
});

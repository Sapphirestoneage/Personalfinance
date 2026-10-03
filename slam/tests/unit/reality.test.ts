import { describe, expect, it } from 'vitest';
import { checkInsVsModel, funnelFromLog, milestoneState, LOG_MIN_CONTACTS } from '@/engine/reality';
import { canonicalInPerson } from '@/content/canonical';
import { sampleRows } from '@/content/samples';
import type { ClientRecord, WeekLog } from '@/data/schemas';
import { yours } from '@/data/assumptions';
import { within } from '../helpers';

const today = new Date('2026-09-25T12:00:00Z');
const client = (i: number, stage: ClientRecord['stage'], screening: ClientRecord['screeningResult'], daysAgo = 10): ClientRecord => ({
  id: `c${i}`,
  profileId: 'p',
  alias: `A${i}`,
  businessId: 'b',
  stage,
  keyDates: { firstContact: new Date(today.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10) },
  screeningResult: screening,
  depositStatus: 'none',
  offersBought: [],
  contactConsent: true,
  agreedBudgetCents: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

describe('rates from the client log', () => {
  it('counts the funnel from stages and screening results', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => client(i, 'lost', 'fail')),
      ...Array.from({ length: 2 }, (_, i) => client(10 + i, 'screening', 'pending')),
      client(20, 'booked', 'pass'),
      client(21, 'showed', 'pass'),
      client(22, 'client', 'pass'),
      client(23, 'lost', 'pass'),
      client(24, 'inquiry', 'pending', 200),
    ];
    const f = funnelFromLog(rows, 'b', today);
    expect(f.contacts).toBe(10);
    expect(f.passed).toBe(4);
    expect(f.booked).toBe(3);
    expect(f.showed).toBe(2);
    within(f.passRate!, 0.4, 1e-9);
    within(f.bookingRate!, 0.75, 1e-9);
    within(f.showRate!, 2 / 3, 1e-9);
    expect(f.enough).toBe(true);
    within(f.contactsPerMonth!, 10 / (90 / 30.4), 1e-9);
  });
  it('is not enough under the minimum, and never divides by zero', () => {
    const f = funnelFromLog([client(1, 'inquiry', 'pending')], 'b', today);
    expect(f.enough).toBe(false);
    expect(f.bookingRate).toBeNull();
    expect(LOG_MIN_CONTACTS).toBe(10);
    expect(funnelFromLog([], 'b', today).passRate).toBeNull();
  });
});

describe('check-ins against the model', () => {
  const log = (weekStart: string, inquiries: number | null, checkedIn = true): WeekLog => ({ id: weekStart, profileId: 'p', weekStart, inquiries, bookings: 2, sessionsHeld: 1, reachActions: 20, revenueCents: null, hours: null, energy: null, checkedIn, loggedAt: '2026-09-01T00:00:00.000Z' });
  it('scales the last four saved check-ins to a month and reads the gap', () => {
    const logs = [log('2026-09-21', 12), log('2026-09-14', 10), log('2026-09-07', 11), log('2026-08-31', 11), log('2026-08-24', 30), log('2026-08-17', 5, false)];
    const r = checkInsVsModel(logs, canonicalInPerson());
    expect(r.weeks).toBe(4);
    within(r.contactsPerMonth!, 11 * (52 / 12), 1e-9);
    within(r.contactsGap!, (11 * (52 / 12) - 60) / 60, 1e-9);
    within(r.reachPerWeek!, 20, 1e-9);
  });
  it('ignores unsaved logs and copes with nothing logged', () => {
    const r = checkInsVsModel([log('2026-09-21', 12, false)], canonicalInPerson());
    expect(r.weeks).toBe(0);
    expect(r.contactsPerMonth).toBeNull();
  });
});

describe('milestones', () => {
  it('follow what she has done, in order', () => {
    const rows = sampleRows('sample-inperson');
    const model = rows.businesses.map((b) => ({ id: b.id, type: b.type, name: b.name, active: b.active, priority: b.priority, inputs: b.inputs, offers: {} }));
    const fresh = milestoneState({ ...rows.profile, checkInCount: 0 }, model, [], []);
    expect(fresh.achieved).toEqual(['first_business']);
    expect(fresh.next!.key).toBe('first_yours');
    const first = model[0]!;
    first.inputs = { ...first.inputs, inquiriesPerMonth: yours('inquiriesPerMonth', 40) };
    const later = milestoneState({ ...rows.profile, checkInCount: 4, pathway: { ...rows.profile.pathway, completedSteps: [`${first.id}:Diagnose`] } }, model, [], []);
    expect(later.achieved).toEqual(['first_business', 'first_yours', 'diagnosed', 'first_checkin', 'four_checkins']);
    expect(later.latest!.key).toBe('four_checkins');
    expect(later.next!.key).toBe('goal_set');
  });
});

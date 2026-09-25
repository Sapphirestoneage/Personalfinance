import { describe, expect, it } from 'vitest';
import { nextStep, pathwayPlan } from '@/engine/pathway';
import { diagnose } from '@/engine/diagnose';
import { benchmarksFor, freshRows, SAMPLES, sampleRows } from '@/content/samples';
import { BusinessSchema, OfferSchema, ProfileSchema } from '@/data/schemas';
import { buildSnapshot } from '@/data/snapshot';
import { canonicalInPerson, canonicalContent } from '@/content/canonical';
import { withValues } from '@/engine/reader';
import { stepKey } from '@/content/stages';
import { $, within } from '../helpers';

describe('the pathway', () => {
  it('business #1 goes through every stage, then #2 starts at Diagnose', () => {
    const a = canonicalInPerson({}, 'a', 1);
    const b = canonicalContent('b', 2);
    const plan = pathwayPlan([a, b]);
    expect(plan[0]).toMatchObject({ businessId: null, stage: { stage: 'Setup' } });
    expect(plan.filter((p) => p.businessId === 'a').map((p) => p.stage.stage)).toEqual(['Diagnose', 'Offer', 'Presence', 'Conversations', 'Bookings', 'Money per client', 'Plan', 'Strategy']);
    expect(plan.filter((p) => p.businessId === 'b')[0]!.stage.stage).toBe('Diagnose');
    expect(plan.length).toBe(17);
  });
  it('the next step skips what is done and reports progress', () => {
    const a = canonicalInPerson({}, 'a', 1);
    const first = nextStep([a], []);
    expect(first.stage.stage).toBe('Diagnose');
    expect(first.done).toBe(1);
    const later = nextStep([a], [stepKey('a', 'Diagnose'), stepKey('a', 'Offer')]);
    expect(later.stage.stage).toBe('Presence');
    within(later.progress, 3 / 9, 1e-9);
    expect(later.business).toEqual({ done: 2, total: 8 });
  });
  it('with nothing ticked the next step is Setup', () => {
    const a = canonicalInPerson({}, 'a', 1);
    a.active = false;
    expect(nextStep([a], []).stage.stage).toBe('Setup');
  });
});

describe('quick diagnosis', () => {
  it('finds the booking rate when it is the step furthest below typical', () => {
    const b = canonicalInPerson();
    b.inputs = withValues(b.inputs, { bookingRate: 0.2 });
    const d = diagnose(b, benchmarksFor('inPerson'), null)!;
    expect(d.kind).toBe('bookings');
    expect(d.key).toBe('inputs.bookingRate');
    within(d.gainCents, $(4972.5) / 2, 1);
  });
  it('never names screening, even when the pass rate is low', () => {
    const b = canonicalInPerson();
    b.inputs = withValues(b.inputs, { passRate: 0.1 });
    const d = diagnose(b, benchmarksFor('inPerson'), null)!;
    expect(d.kind).toBe('contacts');
    expect(d.candidates.some((c) => c.key.includes('passRate'))).toBe(false);
  });
  it('says capacity when the cap binds', () => {
    const b = canonicalInPerson();
    b.inputs = withValues(b.inputs, { inquiriesPerMonth: 200 });
    expect(diagnose(b, benchmarksFor('inPerson'), null)!.kind).toBe('capacity');
  });
  it('says price when the price is the weak spot', () => {
    const b = canonicalInPerson();
    b.offers.single = withValues(b.offers.single!, { priceCents: $(300) });
    expect(diagnose(b, benchmarksFor('inPerson'), null)!.kind).toBe('price');
  });
});

describe('samples and the fresh profile', () => {
  it('every sample validates and is marked demo; the fresh profile is not', () => {
    for (const s of SAMPLES) {
      const rows = sampleRows(s.id);
      expect(ProfileSchema.parse(rows.profile).demo).toBe(true);
      for (const b of rows.businesses) BusinessSchema.parse(b);
      for (const o of rows.offers) OfferSchema.parse(o);
      expect(rows.businesses.some((b) => b.active)).toBe(true);
    }
    const fresh = freshRows();
    expect(fresh.profile.demo).toBe(false);
    expect(fresh.businesses.every((b) => !b.active)).toBe(true);
    expect(fresh.profile.settings.recoveryDaysPerWeek?.value).toBeGreaterThanOrEqual(1);
  });
});

describe('the snapshot for Sapphire', () => {
  it('carries numbers and week logs, never client records', () => {
    const rows = sampleRows('sample-inperson');
    const snap = buildSnapshot(rows.profile, rows.businesses, rows.offers, [], []);
    const text = JSON.stringify(snap);
    expect(snap.format).toBe('slam-snapshot');
    expect(text).not.toMatch(/"clients"|"sales"|"agreedBudget|"screeningResult/);
    expect((snap.thisMonth as { ok: boolean }).ok).toBe(true);
  });
});

describe('missing keys become words and a place to fix them', async () => {
  const { describeMissing } = await import('@/features/shared/missing');
  const rows = sampleRows('sample-inperson');
  it('names the business and the field, and links to the tab', () => {
    const m = describeMissing('sample-inperson-inPerson.bookingRate', rows.businesses, 'plain');
    expect(m.text).toBe('In person: Share of screened people who book');
    expect(m.to).toBe('businesses/sample-inperson-inPerson');
  });
  it('handles offers, shared settings, and keys from inside one business', () => {
    expect(describeMissing('sample-inperson-inPerson.single.priceCents', rows.businesses, 'domme').text).toBe('In-person, Single session: Price');
    expect(describeMissing('shared.fixedCostsCents', rows.businesses, 'plain').to).toBe('businesses/settings');
    expect(describeMissing('single.priceCents', rows.businesses, 'pro', 'sample-inperson-inPerson').text).toBe('In-person sessions, Single session (core offer): Price');
  });
});

/* Properties that must hold for any inputs, not just the golden ones. */
import { describe, expect, it } from 'vitest';
import { computeBusinessMonth } from '@/engine/businesses';
import { aggregateMonth } from '@/engine/aggregate';
import { applyScenario, SCENARIO_PRESETS } from '@/engine/scenarios';
import { canonicalInPerson, canonicalContent, canonicalCalls, canonicalRegulars, canonicalShared } from '@/content/canonical';
import { withValues } from '@/engine/reader';
import { snapshotMarkdown } from '@/data/snapshot';
import { sampleRows } from '@/content/samples';
import { unwrap } from '../helpers';

/* a small deterministic generator so a failure is reproducible */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

describe('engine invariants over random inputs', () => {
  const rand = rng(7);
  const cases = Array.from({ length: 60 }, (_, i) => ({
    inquiries: Math.round(rand() * 200),
    passRate: rand(),
    bookingRate: rand(),
    showRate: rand(),
    rebookRate: rand() * 2,
    capacity: 1 + Math.round(rand() * 40),
    mix: { addon: i % 2 === 0, retainer: i % 3 === 0 },
  }));

  it('more contacts never mean less gross profit, and the cap is never exceeded', () => {
    for (const c of cases) {
      const b = canonicalInPerson(c.mix);
      const inputs = withValues(b.inputs, { inquiriesPerMonth: c.inquiries, passRate: c.passRate, bookingRate: c.bookingRate, showRate: c.showRate, rebookRate: c.rebookRate, capacitySessions: c.capacity });
      const m1 = unwrap(computeBusinessMonth('inPerson', inputs, b.offers, { sellableHours: null }));
      const m2 = unwrap(computeBusinessMonth('inPerson', withValues(inputs, { inquiriesPerMonth: c.inquiries + 5 }), b.offers, { sellableHours: null }));
      expect(m2.grossProfitCents).toBeGreaterThanOrEqual(m1.grossProfitCents - 1e-6);
      expect(m1.volumes.sessions!).toBeLessThanOrEqual(c.capacity + 1e-9);
      expect(Number.isFinite(m1.grossProfitCents)).toBe(true);
      expect(m1.hoursUsed).toBeGreaterThanOrEqual(0);
    }
  });

  it('a null anywhere gives an incomplete result naming the key, never a number', () => {
    const keys = ['inquiriesPerMonth', 'passRate', 'bookingRate', 'showRate', 'rebookRate'];
    for (const k of keys) {
      const b = canonicalInPerson({ addon: true, retainer: true });
      const r = computeBusinessMonth('inPerson', withValues(b.inputs, { [k]: null }), b.offers, { sellableHours: null });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.missing).toEqual([k]);
    }
    for (const [type, model] of [['content', canonicalContent()], ['calls', canonicalCalls()], ['regulars', canonicalRegulars()]] as const) {
      for (const k of Object.keys(model.inputs)) {
        const r = computeBusinessMonth(type, withValues(model.inputs, { [k]: null }), model.offers, { sellableHours: null });
        expect(r.ok).toBe(false);
      }
    }
  });

  it('Dream is never below Normal and Disaster never above it, with no events on', () => {
    for (const c of cases.slice(0, 20)) {
      const b = canonicalInPerson(c.mix);
      b.inputs = withValues(b.inputs, { inquiriesPerMonth: c.inquiries, passRate: c.passRate, bookingRate: c.bookingRate, showRate: c.showRate, rebookRate: c.rebookRate, capacitySessions: c.capacity });
      const model = { businesses: [b, canonicalContent(), canonicalCalls(), canonicalRegulars()], shared: canonicalShared() };
      const n = unwrap(applyScenario(model, { kind: 'Normal', multipliers: SCENARIO_PRESETS.Normal, events: [] })).totals.profitCents;
      const d = unwrap(applyScenario(model, { kind: 'Dream', multipliers: SCENARIO_PRESETS.Dream, events: [] })).totals.profitCents;
      const x = unwrap(applyScenario(model, { kind: 'Disaster', multipliers: SCENARIO_PRESETS.Disaster, events: [] })).totals.profitCents;
      expect(d).toBeGreaterThanOrEqual(n - 1e-6);
      expect(x).toBeLessThanOrEqual(n + 1e-6);
    }
  });

  it('the total is the sum of its parts and shares add to one', () => {
    const t = unwrap(aggregateMonth({ businesses: [canonicalInPerson({ addon: true }), canonicalContent(), canonicalCalls(), canonicalRegulars()], shared: canonicalShared({ availableHoursPerWeek: 35 }) }));
    const sum = t.businesses.reduce((s, b) => s + b.month.grossProfitCents, 0);
    expect(Math.abs(sum - t.grossProfitCents)).toBeLessThan(1e-6);
    expect(Math.abs(t.businesses.reduce((s, b) => s + b.shareOfGp, 0) - 1)).toBeLessThan(1e-9);
  });
});

describe('the readable snapshot', () => {
  it('holds the month, the futures, each business and no client data', () => {
    const rows = sampleRows('sample-inperson');
    const md = snapshotMarkdown(rows.profile, rows.businesses, rows.offers, [], new Date('2026-09-25T00:00:00Z'));
    expect(md).toContain('# Numbers snapshot, 2026-09-25');
    expect(md).toContain('## This month');
    expect(md).toContain('- Disaster:');
    expect(md).toContain('## #1 In-person');
    expect(md).toContain('Biggest levers');
    expect(md).not.toMatch(/alias|agreedBudget|screening/i);
  });
});

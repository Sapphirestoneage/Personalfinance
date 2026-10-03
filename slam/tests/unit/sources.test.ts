import { describe, expect, it } from 'vitest';
import { applyEvent, EVENT_DEFAULTS } from '@/engine/scenarios';
import { sourceShare } from '@/engine/model';
import { explainMonth } from '@/engine/explain';
import { computeBusinessMonth } from '@/engine/businesses';
import { businessToModel } from '@/data/model';
import { sampleRows } from '@/content/samples';
import { canonicalContent, canonicalInPerson } from '@/content/canonical';
import { yours } from '@/data/assumptions';
import type { Source } from '@/data/schemas';
import { $, unwrap, within } from '../helpers';

const src = (over: Partial<Source>): Source => ({
  id: 's',
  profileId: 'p',
  businessId: 'b-inperson',
  type: 'platform',
  name: 'x',
  owned: false,
  costCents: yours('costCents', 0),
  shareOfInquiries: yours('shareOfInquiries', null),
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

describe('sources of contacts', () => {
  it('her own shares replace the event defaults', () => {
    const b = canonicalInPerson();
    b.sources = [
      { id: '1', type: 'house', owned: false, share: 0.3, followers: null, costCents: null },
      { id: '2', type: 'platform', owned: false, share: 0.2, followers: null, costCents: null },
      { id: '3', type: 'referral', owned: true, share: 0.5, followers: null, costCents: null },
    ];
    within(sourceShare(b, (s) => s.type === 'house')!, 0.3, 1e-9);
    const house = applyEvent(b, 'house_stops', EVENT_DEFAULTS, null);
    within(house.business.inputs.inquiriesPerMonth!.value!, 60 * 0.7, 1e-9);
    const ban = applyEvent(b, 'platform_ban', EVENT_DEFAULTS, null);
    within(ban.business.inputs.inquiriesPerMonth!.value!, 60 * 0.8, 1e-9);
  });
  it('without sources the defaults stand', () => {
    const b = canonicalInPerson();
    within(applyEvent(b, 'house_stops', EVENT_DEFAULTS, null).business.inputs.inquiriesPerMonth!.value!, 0, 1e-9);
    within(applyEvent(b, 'platform_ban', EVENT_DEFAULTS, null).business.inputs.inquiriesPerMonth!.value!, 30, 1e-9);
  });
  it('a platform ban on an audience business takes the biggest rented platform', () => {
    const c = canonicalContent();
    c.sources = [
      { id: '1', type: 'platform', owned: false, share: null, followers: 3000, costCents: null },
      { id: '2', type: 'platform', owned: false, share: null, followers: 1000, costCents: null },
      { id: '3', type: 'own_site', owned: true, share: null, followers: 1000, costCents: null },
    ];
    const r = applyEvent(c, 'platform_ban', EVENT_DEFAULTS, null);
    within(r.business.inputs.followers!.value!, 5000 * 0.25, 1e-9);
    within(r.business.inputs.subscribers!.value!, 150 * 0.25, 1e-9);
  });
  it('rows to model carries sources and their followers', () => {
    const rows = sampleRows('sample-inperson');
    const biz = rows.businesses.find((b) => b.type === 'inPerson')!;
    const m = businessToModel(biz, rows.offers, [src({ businessId: biz.id, type: 'house', shareOfInquiries: yours('shareOfInquiries', 0.4) })]);
    expect(m.sources).toHaveLength(1);
    expect(m.sources![0]!.share).toBe(0.4);
    expect(businessToModel(biz, rows.offers, []).sources).toBeUndefined();
  });
});

describe('the math, spelled out', () => {
  it('names the formulas with her numbers in them', () => {
    const b = canonicalInPerson({ addon: true, retainer: true });
    const m = unwrap(computeBusinessMonth(b.type, b.inputs, b.offers, { sellableHours: null }));
    const lines = explainMonth(b, m);
    expect(lines.map((l) => l.formula)).toEqual(['F01', 'F02', 'F03', 'F04', 'Sum', 'Hours']);
    expect(lines[0]!.text).toContain('60 × 50% × 40% × 85%');
    expect(lines[1]!.text).toContain('$375');
    expect(lines[4]!.text).toContain(`$${(Math.round(m.grossProfitCents) / 100).toLocaleString('en-US')}`);
  });
  it('covers every business type', () => {
    for (const type of ['content', 'calls', 'regulars'] as const) {
      const rows = sampleRows('sample-inperson');
      const biz = rows.businesses.find((b) => b.type === type)!;
      const model = businessToModel(biz, rows.offers);
      const m = unwrap(computeBusinessMonth(type, model.inputs, model.offers, { sellableHours: null }));
      expect(explainMonth(model, m).length).toBeGreaterThanOrEqual(4);
    }
  });
  it('a capped month says so', () => {
    const b = canonicalInPerson();
    b.inputs = { ...b.inputs, inquiriesPerMonth: yours('inquiriesPerMonth', 120) };
    const m = unwrap(computeBusinessMonth(b.type, b.inputs, b.offers, { sellableHours: null }));
    expect(explainMonth(b, m).find((l) => l.formula === 'F04')!.text).toContain('capped by your session cap');
    within(m.grossProfitCents, $(6750), 1);
  });
});

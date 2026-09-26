import { describe, expect, it } from 'vitest';
import { levelsOverview, type Facts } from '@/engine/levels';
import { BANDS, levelsFor, PLANETS, READINGS } from '@/content/levels';
import { sampleRows } from '@/content/samples';
import { profileToModel } from '@/data/model';
import { yours } from '@/data/assumptions';
import { withValues } from '@/engine/reader';

function factsFor(id = 'sample-inperson', type: 'inPerson' | 'content' | 'calls' | 'regulars' = 'inPerson'): Facts {
  const rows = sampleRows(id);
  const model = profileToModel(rows.profile, rows.businesses, rows.offers, []);
  const business = model.businesses.find((b) => b.type === type)!;
  return { profile: rows.profile, business, shared: model.shared, clients: [], weekLogs: [] };
}

describe('levels', () => {
  it('every business type has a level on every planet in bands 1, 2, 4 and 5, and every reading names real levels', () => {
    for (const type of ['inPerson', 'content', 'calls', 'regulars'] as const) {
      const ids = new Set(levelsFor(type).map((l) => l.id));
      for (const b of [1, 2, 4, 5] as const) for (const p of PLANETS) if (!(b === 1 && (p.id === 'time' || p.id === 'money'))) expect(ids.has(`${p.id}-${b}`), `${type} ${p.id}-${b}`).toBe(true);
      /* every reading's needs exist on the fullest type; a type without that level simply does not wait on it */
      if (type === 'inPerson') for (const r of READINGS) for (const need of r.needs) expect(ids.has(need), `reading ${r.id} needs ${need}`).toBe(true);
    }
    expect(BANDS.map((b) => b.band)).toEqual([1, 2, 3, 4, 5]);
  });

  it('a fresh sample has every level open and every reading an estimate', () => {
    const o = levelsOverview(factsFor());
    expect(o.doneCount).toBe(0);
    expect(o.readings.every((r) => r.status === 'estimate')).toBe(true);
    expect(o.rounds[0]!.complete).toBe(false);
    /* never past band 2 until round 1 is complete */
    expect(o.next.every((l) => l.level.band <= 2)).toBe(true);
    expect(o.next[0]!.level.id).toBe('contacts-1');
  });

  it('typed numbers complete levels, then bands, then rounds, and readings become hers', () => {
    const f = factsFor();
    f.business.inputs = withValues(f.business.inputs, {});
    f.business.inputs = { ...f.business.inputs, inquiriesPerMonth: yours('inquiriesPerMonth', 40), bookingRate: yours('bookingRate', 0.3) };
    f.business.offers = { ...f.business.offers, single: { ...f.business.offers.single!, priceCents: yours('priceCents', 45_000) } };
    const o = levelsOverview(f);
    expect(o.rounds[0]).toMatchObject({ band: 1, planetsDone: 3, planetsTotal: 3, complete: true });
    expect(o.readings.find((r) => r.reading.id === 'bottleneck')!.status).toBe('yours');
    expect(o.readings.find((r) => r.reading.id === 'profit')!.status).toBe('estimate');
    expect(o.readings.find((r) => r.reading.id === 'profit')!.waitingOn.map((l) => l.id)).toEqual(['money-2']);
    /* after round 1, band 3 may be suggested */
    expect(o.next.some((l) => l.level.band === 3)).toBe(true);
    expect(o.next[0]!.level.id).toBe('contacts-2');
  });

  it('a partly answered level, a confirmed estimate, and a band with no level', () => {
    const f = factsFor();
    f.business.inputs = { ...f.business.inputs, showRate: yours('showRate', 0.9) };
    const o = levelsOverview(f);
    const b2 = o.levels.find((l) => l.level.id === 'bookings-2')!;
    expect(b2.status).toBe('partly');
    expect(b2.remaining).toBe(1);
    const calls = levelsOverview(factsFor('sample-regulars', 'calls'));
    const cell = calls.grid.find((g) => g.band === 3 && g.planet === 'contacts')!;
    expect(cell.levels).toHaveLength(0);
    expect(cell.complete).toBe(true);
  });

  it('read levels follow her records and the pathway', () => {
    const f = factsFor();
    f.profile = { ...f.profile, checkInCount: 4, pathway: { ...f.profile.pathway, completedSteps: [`${f.business.id}:Offer`] } };
    const o = levelsOverview(f);
    expect(o.levels.find((l) => l.level.id === 'bookings-4')!.status).toBe('done');
    expect(o.levels.find((l) => l.level.id === 'offers-4')!.status).toBe('done');
    expect(o.levels.find((l) => l.level.id === 'contacts-4')!.status).toBe('open');
  });
});

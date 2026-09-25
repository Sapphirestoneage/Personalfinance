/* G19..G21: profit, the three scenarios, the only source stopping. */
import { describe, it } from 'vitest';
import { aggregateMonth } from '@/engine/aggregate';
import { applyScenario, compareScenarios, defaultScenarios, SCENARIO_PRESETS } from '@/engine/scenarios';
import { canonicalInPerson, canonicalShared } from '@/content/canonical';
import { $, unwrap, within, withinDollars } from '../helpers';

const model = () => ({ businesses: [canonicalInPerson()], shared: canonicalShared() });

describe('G19 Normal profit', () => {
  it('is G1 minus $1,500 fixed: $3,472.50', () => {
    const t = unwrap(aggregateMonth(model()));
    withinDollars(t.profitCents, 3472.5, 1, 'profit');
  });
});

describe('G20 Dream and Disaster', () => {
  it('Dream (78 inquiries): $4,964.25 profit, 17.24 sessions', () => {
    const r = unwrap(applyScenario(model(), { kind: 'Dream', multipliers: SCENARIO_PRESETS.Dream, events: [] }));
    withinDollars(r.totals.profitCents, 4964.25, 1, 'profit');
    within(r.totals.businesses[0]!.month.volumes.sessions!, 17.24, 0.005, 'sessions');
    within(r.totals.businesses[0]!.month.volumes.newClients! / 0.17, 78, 0.01, 'inquiries scaled to 78');
  });
  it('Disaster (36 inquiries): $1,483.50 profit', () => {
    const r = unwrap(applyScenario(model(), { kind: 'Disaster', multipliers: SCENARIO_PRESETS.Disaster, events: [] }));
    withinDollars(r.totals.profitCents, 1483.5, 1, 'profit');
  });
  it('all three side by side, each business with its share', () => {
    const all = compareScenarios(model(), defaultScenarios());
    const normal = unwrap(all.Normal);
    const dream = unwrap(all.Dream);
    const disaster = unwrap(all.Disaster);
    withinDollars(normal.totals.profitCents, 3472.5, 1);
    withinDollars(dream.totals.profitCents, 4964.25, 1);
    withinDollars(disaster.totals.profitCents, 1483.5, 1);
    within(normal.totals.businesses[0]!.shareOfGp, 1, 1e-9, 'one business has the whole share');
  });
  it('runway in Disaster = cash / shortfall against the income goal', () => {
    const m = model();
    m.shared = canonicalShared({ cashOnHandCents: $(9033), incomeGoalCents: $(6000) });
    const r = unwrap(applyScenario(m, { kind: 'Disaster', multipliers: SCENARIO_PRESETS.Disaster, events: [] }));
    /* shortfall = 6000 - 1483.50 = 4516.50; 9033 / 4516.50 = 2.0 months */
    within(r.runway!.months!, 2, 0.001, 'runway months');
  });
  it('runway is incomplete, never a number, without cash on hand', () => {
    const r = unwrap(applyScenario(model(), { kind: 'Disaster', multipliers: SCENARIO_PRESETS.Disaster, events: [] }));
    within(r.runway === null ? 1 : 0, 1, 0, 'no runway');
    within(r.runwayMissing.includes('shared.cashOnHandCents') ? 1 : 0, 1, 0, 'names the missing input');
  });
});

describe('G21 the only source stops sending clients', () => {
  it('profit is -$1,500: the fixed costs with nothing coming in', () => {
    const r = unwrap(applyScenario(model(), { kind: 'Normal', multipliers: SCENARIO_PRESETS.Normal, events: ['house_stops'] }));
    withinDollars(r.totals.profitCents, -1500, 0.01, 'profit');
    within(r.eventsApplied.length, 1, 0, 'one event applied');
  });
});

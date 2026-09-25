import { describe, expect, it } from 'vitest';
import { aggregateMonth, toKeepAfterSetAside } from '@/engine/aggregate';
import { applyEvent, applyScenario, EVENT_DEFAULTS, SCENARIO_PRESETS } from '@/engine/scenarios';
import { budgetCheck } from '@/engine/budgets';
import { rankMoves } from '@/engine/leverage';
import { capacityCap, costToAcquire, leverageScore, ltgpToCac, runwayMonths, sensitivityDelta, sellableHoursPerMonth } from '@/engine/formulas';
import { inPersonMonth } from '@/engine/businesses';
import { bookOf, reader, withValues } from '@/engine/reader';
import { canonicalCalls, canonicalContent, canonicalRegulars, canonicalInPerson, canonicalShared } from '@/content/canonical';
import { $, unwrap, within } from '../helpers';

describe('the reader', () => {
  it('reports null and absent keys as missing and returns NaN, never 0', () => {
    const r = reader(bookOf({ a: 1, b: null }));
    expect(r.req('a')).toBe(1);
    expect(Number.isNaN(r.req('b'))).toBe(true);
    expect(Number.isNaN(r.req('c'))).toBe(true);
    expect(r.missing).toEqual(['b', 'c']);
  });
  it('tracks the weakest label', () => {
    const book = { ...bookOf({ a: 1 }, 'Yours'), ...bookOf({ b: 2 }, 'Placeholder') };
    const r = reader(book);
    r.req('a');
    r.req('b');
    expect(r.basedOn()).toEqual({ keys: ['a', 'b'], weakest: 'Placeholder', allYours: false });
  });
});

describe('incomplete states', () => {
  it('a missing offer price makes the month incomplete, not zero', () => {
    const b = canonicalInPerson();
    const r = inPersonMonth(b.inputs, { single: withValues(b.offers.single!, { priceCents: null }) }, { sellableHours: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(['single.priceCents']);
  });
  it('capacity not entered means no cap, and the result says the cap is unknown', () => {
    const b = canonicalInPerson();
    const m = unwrap(inPersonMonth(withValues(b.inputs, { inquiriesPerMonth: 120, capacitySessions: null }), b.offers, { sellableHours: null }));
    within(m.sessions, 26.52, 0.005);
    expect(m.cap?.capacity).toBeNull();
  });
});

describe('F23 only active businesses enter a total; hours go in priority order', () => {
  it('an inactive business adds nothing', () => {
    const content = canonicalContent();
    content.active = false;
    const t = unwrap(aggregateMonth({ businesses: [canonicalInPerson(), content], shared: canonicalShared() }));
    expect(t.businesses.map((b) => b.type)).toEqual(['inPerson']);
    within(t.grossProfitCents, $(4972.5), 1);
  });
  it('shares add up to one across active businesses', () => {
    const t = unwrap(aggregateMonth({ businesses: [canonicalInPerson(), canonicalContent(), canonicalCalls(), canonicalRegulars()], shared: canonicalShared() }));
    within(t.businesses.reduce((s, b) => s + b.shareOfGp, 0), 1, 1e-9);
    expect(t.businesses.map((b) => b.priority)).toEqual([1, 2, 3, 4]);
  });
  it('business #1 gets its hours first; a later flat-hour business is scaled and flagged', () => {
    /* 13.26 sessions x 4 hours = 53.04 hours for in-person; give 60 hours a month total */
    const shared = canonicalShared({ availableHoursPerWeek: (60 * 12) / 52 });
    const t = unwrap(aggregateMonth({ businesses: [canonicalInPerson(), canonicalContent()], shared }));
    const [first, second] = t.businesses;
    expect(first!.month.hoursLimited).toBe(false);
    within(first!.month.hoursUsed, 53.04, 0.01);
    expect(second!.month.hoursLimited).toBe(true);
    within(second!.month.hoursUsed, 60 - 53.04, 0.01);
    within(second!.hoursAllocated!, 60 - 53.04, 0.01);
    /* content asked for 50 hours (40 + 10 customs x 1); it got 6.96, so its GP scales by that share */
    within(second!.month.grossProfitCents, $(2600) * ((60 - 53.04) / 50), 1);
  });
  it('in-person under an hour cap is capped by hours (F04), not scaled after the fact', () => {
    const shared = canonicalShared({ availableHoursPerWeek: (40 * 12) / 52 });
    const t = unwrap(aggregateMonth({ businesses: [canonicalInPerson()], shared }));
    const m = t.businesses[0]!.month;
    within(m.volumes.sessions!, 10, 1e-9);
    expect(m.cap?.cappedBy).toBe('hours');
    expect(m.hoursLimited).toBe(true);
  });
  it('the tax set-aside is a reminder line, never inside profit', () => {
    const k = toKeepAfterSetAside($(4000), 0.25);
    within(k.setAsideCents, $(1000), 0);
    within(k.toKeepCents, $(3000), 0);
    within(toKeepAfterSetAside($(-500), 0.25).setAsideCents, 0, 0);
  });
});

describe('formulas at the edges', () => {
  it('no clients means no cost to acquire, not Infinity', () => {
    expect(costToAcquire($(100), 2, $(50), 0)).toBeNull();
    expect(ltgpToCac($(1000), null, $(200)).ratio).toBeNull();
  });
  it('LTGP:CAC and payback', () => {
    const r = ltgpToCac($(1500), $(300), $(375));
    within(r.ratio!, 5, 1e-9);
    within(r.paybackDays!, 24, 1e-9);
  });
  it('capacity cap chooses the tighter of sessions and hours', () => {
    expect(capacityCap({ demandSessions: 20, capacitySessions: 18, sellableHours: 100, allInHoursPerSession: 4 })).toMatchObject({ sessions: 18, cappedBy: 'sessions' });
    expect(capacityCap({ demandSessions: 20, capacitySessions: 18, sellableHours: 40, allInHoursPerSession: 4 })).toMatchObject({ sessions: 10, cappedBy: 'hours' });
    expect(capacityCap({ demandSessions: 5, capacitySessions: 18 })).toMatchObject({ sessions: 5, cappedBy: 'none', factor: 1 });
  });
  it('sellable hours per month', () => within(sellableHoursPerMonth(30), 130, 1e-9));
  it('runway with no shortfall is not a number', () => {
    expect(runwayMonths($(5000), $(3000), $(3500)).months).toBeNull();
    within(runwayMonths($(5000), $(3000), $(500)).months!, 2, 1e-9);
  });
  it('leverage discounts by weeks to money and refuses a free move', () => {
    const base = { addedAnnualProfitCents: $(12_000), cashCostCents: $(1000), hours: 10, hourlyValueCents: $(100), learningCostCents: 0 };
    within(leverageScore({ ...base, weeksToMoney: 0 })!, 6, 1e-9);
    within(leverageScore({ ...base, weeksToMoney: 52 })!, 3, 1e-9);
    expect(leverageScore({ ...base, cashCostCents: 0, hours: 0, weeksToMoney: 0 })).toBeNull();
    const ranked = rankMoves([
      { id: 'a', name: 'slow', ...base, weeksToMoney: 52 },
      { id: 'b', name: 'fast', ...base, weeksToMoney: 0 },
      { id: 'c', name: 'free', ...base, cashCostCents: 0, hours: 0, weeksToMoney: 0 },
    ]);
    expect(ranked.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });
  it('sensitivityDelta returns null when the profit function cannot compute', () => {
    expect(sensitivityDelta(() => null, { x: 1 }, { key: 'x', kind: 'point', amount: 1 })).toBeNull();
    within(sensitivityDelta((v) => v.x! * 10, { x: 1 }, { key: 'x', kind: 'percent', amount: 0.1 })!, 1, 1e-9);
  });
});

describe('events', () => {
  const model = () => ({ businesses: [canonicalInPerson(), canonicalContent(), canonicalCalls(), canonicalRegulars()], shared: canonicalShared() });
  const normal = () => unwrap(aggregateMonth(model()));

  it('a platform ban zeroes an audience business and half of in-person inquiries by default', () => {
    const r = unwrap(applyScenario(model(), { kind: 'Normal', multipliers: SCENARIO_PRESETS.Normal, events: ['platform_ban'] }));
    const by = Object.fromEntries(r.totals.businesses.map((b) => [b.type, b.month.grossProfitCents]));
    within(by.content!, 0, 1e-9);
    within(by.calls!, 0, 1e-9);
    within(by.regulars!, 0, 1e-9);
    within(by.inPerson!, $(4972.5) / 2, 1);
  });
  it('a top regular leaving takes one regular at the average', () => {
    const eff = applyEvent(canonicalRegulars(), 'top_regular_leaves', EVENT_DEFAULTS, null);
    expect(eff.business.inputs.activeRegulars?.value).toBe(3);
    within(eff.business.offers.tribute!.priceCents!.value!, 50_000, 1e-9);
  });
  it('a processor hold ties up a month of revenue and shortens runway, not profit', () => {
    const m = model();
    m.shared = canonicalShared({ cashOnHandCents: $(20_000), incomeGoalCents: $(12_000) });
    const held = unwrap(applyScenario(m, { kind: 'Normal', multipliers: SCENARIO_PRESETS.Normal, events: ['processor_hold'] }));
    const plain = unwrap(applyScenario(m, { kind: 'Normal', multipliers: SCENARIO_PRESETS.Normal, events: [] }));
    within(held.totals.profitCents, plain.totals.profitCents, 1e-6);
    expect(held.heldCashCents).toBeGreaterThan(0);
    expect(held.runway!.months!).toBeLessThan(plain.runway!.months!);
  });
  it('a price war cuts every price 15%', () => {
    const r = unwrap(applyScenario(model(), { kind: 'Normal', multipliers: SCENARIO_PRESETS.Normal, events: ['price_war'] }));
    const cut = unwrap(aggregateMonth(model())).revenueCents * 0.85;
    within(r.totals.revenueCents, cut, 1);
  });
  it('a waitlist fills in-person to capacity', () => {
    const r = unwrap(applyScenario(model(), { kind: 'Normal', multipliers: SCENARIO_PRESETS.Normal, events: ['waitlist'] }));
    within(r.totals.businesses[0]!.month.volumes.sessions!, 18, 1e-6);
  });
  it('a month off sick keeps subscriptions and regulars', () => {
    const r = unwrap(applyScenario(model(), { kind: 'Normal', multipliers: SCENARIO_PRESETS.Normal, events: ['month_off_sick'] }));
    const by = Object.fromEntries(r.totals.businesses.map((b) => [b.type, b.month.grossProfitCents]));
    within(by.inPerson!, 0, 1e-9);
    within(by.calls!, 0, 1e-9);
    within(by.content!, $(1800), 1e-6);
    within(by.regulars!, $(1800), 1e-6);
  });
  it('per-business overrides win over the scenario', () => {
    const m = model();
    m.businesses[0]!.scenarioOverrides = { Dream: { multipliers: { audience: 1 }, events: [] } };
    const r = unwrap(applyScenario(m, { kind: 'Dream', multipliers: SCENARIO_PRESETS.Dream, events: ['viral_post'] }));
    within(r.totals.businesses[0]!.month.grossProfitCents, $(4972.5), 1);
    expect(r.eventsApplied.some((e) => e.businessId === 'b-inperson')).toBe(false);
    expect(r.eventsApplied.some((e) => e.businessId === 'b-content')).toBe(true);
  });
  it('the Dream conversion lift never pushes a rate above 1', () => {
    const b = canonicalRegulars();
    b.inputs = withValues(b.inputs, { followerToTributeRate: 0.9 });
    const r = unwrap(applyScenario({ businesses: [b], shared: canonicalShared() }, { kind: 'Dream', multipliers: { audience: 1, conversion: 1.2 }, events: [] }));
    within(r.totals.businesses[0]!.month.volumes.newTributes!, 2_000, 1e-6);
  });
  it('the whole demo in Normal is the sum of its parts', () => {
    const t = normal();
    within(t.grossProfitCents, t.businesses.reduce((s, b) => s + b.month.grossProfitCents, 0), 1e-6);
  });
});

describe('agreed budgets', () => {
  it('flags a regular whose month went past their agreed budget', () => {
    const client = {
      id: 'c1',
      profileId: 'demo',
      alias: 'Blue',
      stage: 'regular' as const,
      keyDates: {},
      screeningResult: 'pass' as const,
      depositStatus: 'none' as const,
      offersBought: [],
      contactConsent: true,
      agreedBudgetCents: $(500),
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const sale = (id: string, date: string, amount: number) => ({ id, profileId: 'demo', businessId: 'b-regulars', clientId: 'c1', date, amountCents: $(amount), feeCents: 0, variableCostCents: 0, createdAt: date + 'T00:00:00.000Z' });
    const flags = budgetCheck([client], [sale('s1', '2026-09-02', 300), sale('s2', '2026-09-20', 300), sale('s3', '2026-08-20', 900)], '2026-09');
    expect(flags).toHaveLength(1);
    within(flags[0]!.overByCents, $(100), 0);
    expect(budgetCheck([{ ...client, agreedBudgetCents: null }], [sale('s1', '2026-09-02', 9000)], '2026-09')).toHaveLength(0);
  });
});

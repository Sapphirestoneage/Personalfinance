/* ==========================================================================
   The canonical sample assumptions. Every example, every golden test and
   the demo profile use exactly these numbers. Money in cents, rates as
   fractions. Label: Preset, source: "SLAM sample".
   ========================================================================== */
import type { Business, Offer, Profile, Scenario } from '@/data/schemas';
import { CANONICAL_STAMP, assume, mapOf } from '@/data/assumptions';
import type { BusinessModel, ProfileModel } from '@/engine/model';
import type { Book } from '@/engine/reader';
import type { OfferBooks } from '@/engine/businesses/shared';
import { SCENARIO_PRESETS } from '@/engine/scenarios';

export const SAMPLE = 'SLAM sample';

export const CANON = {
  inquiriesPerMonth: 60,
  passRate: 0.5,
  bookingRate: 0.4,
  showRate: 0.85,
  closeRate: 0.4,
  rebookRate: 0.3,
  sessionFeeRate: 0.05,
  deliveryCostCents: 10_000,
  single: { priceCents: 50_000, minutes: 90, allInHours: 4 },
  addon: { priceCents: 20_000, takeRate: 0.25 },
  retainer: { priceCents: 150_000, sessionsPerMonth: 2, takeRate: 0.1, monthsRetained: 4 },
  arc: { priceCents: 300_000, sessionsIncluded: 4, weeks: 8, variableCostCents: 40_000, feeRate: 0.05, allInHours: 14 },
  capacitySessions: 18,
  fixedCostsCents: 150_000,
  subscription: { priceCents: 1_500, keptRate: 0.8 },
  custom: { priceCents: 10_000, keptRate: 0.8 },
  digital: { priceCents: 15_000, keptCents: 14_000 },
  call: { priceCents: 20_000, minutes: 30, keptRate: 0.9 },
  regular: { priceCents: 50_000, keptRate: 0.9, monthsRetained: 6 },
} as const;

const p = (key: string, value: number | null) => assume(key, value, 'Preset', SAMPLE);
const ph = (key: string, value: number | null) => assume(key, value, 'Placeholder', 'needs your number');

/* ---------- Engine-level books (tests and the sandbox) ----------------------- */

export function canonicalShared(overrides: Record<string, number | null> = {}): Book {
  const book = mapOf(
    ph('availableHoursPerWeek', null),
    p('recoveryDaysPerWeek', 2),
    p('fixedCostsCents', CANON.fixedCostsCents),
    ph('incomeGoalCents', 600_000),
    p('taxSetAsideRate', 0.25),
    ph('cashOnHandCents', null),
    ph('hourlyValueCents', 10_000),
    p('acquisitionSpendCents', 0),
    p('acquisitionHoursPerMonth', 0),
  );
  for (const [k, v] of Object.entries(overrides)) {
    const prev = book[k];
    book[k] = prev ? { ...prev, value: v } : p(k, v);
  }
  return book;
}

export function inPersonInputs(): Book {
  return mapOf(
    p('inquiriesPerMonth', CANON.inquiriesPerMonth),
    p('passRate', CANON.passRate),
    p('bookingRate', CANON.bookingRate),
    p('showRate', CANON.showRate),
    p('rebookRate', CANON.rebookRate),
    p('capacitySessions', CANON.capacitySessions),
    p('spaceCostCents', 0),
  );
}

export function singleOffer(): Book {
  return mapOf(
    p('priceCents', CANON.single.priceCents),
    p('feeRate', CANON.sessionFeeRate),
    p('variableCostCents', CANON.deliveryCostCents),
    p('allInHours', CANON.single.allInHours),
    p('minutes', CANON.single.minutes),
  );
}
export function addonOffer(): Book {
  return mapOf(
    p('priceCents', CANON.addon.priceCents),
    p('feeRate', CANON.sessionFeeRate),
    p('variableCostCents', 0),
    p('allInHours', 0),
    p('takeRate', CANON.addon.takeRate),
  );
}
export function retainerOffer(): Book {
  return mapOf(
    p('priceCents', CANON.retainer.priceCents),
    p('feeRate', CANON.sessionFeeRate),
    p('variableCostCents', CANON.deliveryCostCents),
    p('allInHours', CANON.single.allInHours),
    p('takeRate', CANON.retainer.takeRate),
    p('sessionsPerMonth', CANON.retainer.sessionsPerMonth),
    p('monthsRetained', CANON.retainer.monthsRetained),
  );
}
export function arcOffer(): Book {
  return mapOf(
    p('priceCents', CANON.arc.priceCents),
    p('feeRate', CANON.arc.feeRate),
    p('variableCostCents', CANON.arc.variableCostCents),
    p('allInHours', CANON.arc.allInHours),
    p('sessionsIncluded', CANON.arc.sessionsIncluded),
    p('weeks', CANON.arc.weeks),
    p('closeRate', CANON.closeRate),
  );
}

export type InPersonMix = { addon?: boolean; retainer?: boolean; arc?: boolean };

export function canonicalInPerson(mix: InPersonMix = {}, id = 'b-inperson', priority = 1): BusinessModel {
  const offers: OfferBooks = mix.arc ? { arc: arcOffer() } : { single: singleOffer() };
  if (!mix.arc && mix.addon) offers.addon = addonOffer();
  if (!mix.arc && mix.retainer) offers.retainer = retainerOffer();
  return { id, type: 'inPerson', name: 'In-person', active: true, priority, inputs: inPersonInputs(), offers };
}

export function contentInputs(): Book {
  return mapOf(
    p('followers', 5_000),
    p('followerToSubRate', 0.01),
    p('subscribers', 150),
    p('churnRate', 0.2),
    p('ppvSalesPerMonth', 0),
    p('customsPerMonth', 10),
    p('digitalSalesPerMonth', 0),
    p('hoursPerMonth', 40),
    p('toolsCostCents', 0),
  );
}
export function contentOffers(): OfferBooks {
  return {
    subscription: mapOf(p('priceCents', CANON.subscription.priceCents), p('feeRate', 1 - CANON.subscription.keptRate), p('variableCostCents', 0), p('allInHours', 0)),
    custom: mapOf(p('priceCents', CANON.custom.priceCents), p('feeRate', 1 - CANON.custom.keptRate), p('variableCostCents', 0), p('allInHours', 1)),
    digital: mapOf(p('priceCents', CANON.digital.priceCents), p('feeRate', 1 - CANON.digital.keptCents / CANON.digital.priceCents), p('variableCostCents', 0), p('allInHours', 0)),
    ppv: mapOf(p('priceCents', 2_000), p('feeRate', 1 - CANON.subscription.keptRate), p('variableCostCents', 0), p('allInHours', 0)),
  };
}
export function canonicalContent(id = 'b-content', priority = 2): BusinessModel {
  return { id, type: 'content', name: 'Content', active: true, priority, inputs: contentInputs(), offers: contentOffers() };
}

export function callsInputs(): Book {
  return mapOf(p('callsPerMonth', 8), p('noShowRate', 0), p('depositCoversNoShow', 0), p('rebookRate', 0), p('toolsCostCents', 0));
}
export function callsOffers(): OfferBooks {
  return {
    call: mapOf(p('priceCents', CANON.call.priceCents), p('feeRate', 1 - CANON.call.keptRate), p('variableCostCents', 0), p('allInHours', 1), p('minutes', CANON.call.minutes)),
  };
}
export function canonicalCalls(id = 'b-calls', priority = 3): BusinessModel {
  return { id, type: 'calls', name: 'Calls', active: true, priority, inputs: callsInputs(), offers: callsOffers() };
}

export function regularsInputs(): Book {
  return mapOf(
    p('activeRegulars', 4),
    p('followers', 2_000),
    p('followerToTributeRate', 0),
    p('oneOffTributeAvgCents', 5_000),
    p('chargebackRate', 0),
    p('hoursPerMonth', 10),
    p('toolsCostCents', 0),
  );
}
export function regularsOffers(): OfferBooks {
  return {
    tribute: mapOf(
      p('priceCents', CANON.regular.priceCents),
      p('feeRate', 1 - CANON.regular.keptRate),
      p('variableCostCents', 0),
      p('allInHours', 1),
      p('monthsRetained', CANON.regular.monthsRetained),
    ),
  };
}
export function canonicalRegulars(id = 'b-regulars', priority = 4): BusinessModel {
  return { id, type: 'regulars', name: 'Regulars', active: true, priority, inputs: regularsInputs(), offers: regularsOffers() };
}

/** The whole demo as the engine sees it. */
export function canonicalProfileModel(mix: InPersonMix = {}): ProfileModel {
  return {
    businesses: [canonicalInPerson(mix), canonicalContent(), canonicalCalls(), canonicalRegulars()],
    shared: canonicalShared(),
  };
}

/* ---------- Storage rows (the demo profile in Dexie) ------------------------ */

export const DEMO_PROFILE_ID = 'demo';

function offerRow(businessId: string, type: Offer['type'], name: string, book: Book, recurring: boolean, active = true): Offer {
  const row: Offer = {
    id: `${businessId}-${type}`,
    businessId,
    type,
    name,
    active,
    recurring,
    priceCents: book.priceCents!,
    variableCostCents: book.variableCostCents!,
    feeRate: book.feeRate!,
    allInHours: book.allInHours!,
  };
  for (const k of ['takeRate', 'monthsRetained', 'sessionsIncluded', 'sessionsPerMonth', 'weeks', 'closeRate', 'minutes'] as const) {
    const a = book[k];
    if (a) row[k] = a;
  }
  return row;
}

export interface DemoRows {
  profile: Profile;
  businesses: Business[];
  offers: Offer[];
  scenarios: Scenario[];
}

/** The demo profile as rows. In-person is #1 with add-on and retainer on, the arc off. */
export function demoRows(now: string = CANONICAL_STAMP): DemoRows {
  const pid = DEMO_PROFILE_ID;
  const business = (id: string, type: Business['type'], name: string, priority: number, inputs: Book): Business => ({
    id,
    profileId: pid,
    type,
    name,
    active: true,
    priority,
    inputs,
    scenarioOverrides: {},
    createdAt: now,
    updatedAt: now,
  });
  const businesses: Business[] = [
    business('b-inperson', 'inPerson', 'In-person', 1, inPersonInputs()),
    business('b-content', 'content', 'Content', 2, contentInputs()),
    business('b-calls', 'calls', 'Calls', 3, callsInputs()),
    business('b-regulars', 'regulars', 'Regulars', 4, regularsInputs()),
  ];
  const c = contentOffers();
  const offers: Offer[] = [
    offerRow('b-inperson', 'single', 'Single session', singleOffer(), false),
    offerRow('b-inperson', 'addon', 'Add-on', addonOffer(), false),
    offerRow('b-inperson', 'retainer', 'Retainer', retainerOffer(), true),
    offerRow('b-inperson', 'arc', 'Discipline Arc', arcOffer(), false, false),
    offerRow('b-content', 'subscription', 'Subscription', c.subscription!, true),
    offerRow('b-content', 'custom', 'Custom', c.custom!, false),
    offerRow('b-content', 'digital', 'Digital product', c.digital!, false),
    offerRow('b-content', 'ppv', 'Pay-per-view', c.ppv!, false),
    offerRow('b-calls', 'call', 'Video call', callsOffers().call!, false),
    offerRow('b-regulars', 'tribute', 'Regular', regularsOffers().tribute!, true),
  ];
  const scenarios: Scenario[] = (['Normal', 'Dream', 'Disaster'] as const).map((kind) => ({
    id: `${pid}-${kind}`,
    profileId: pid,
    kind,
    multipliers: { ...SCENARIO_PRESETS[kind] },
    events: [],
    updatedAt: now,
  }));
  const profile: Profile = {
    id: pid,
    alias: 'Sample',
    demo: true,
    labelMode: 'plain',
    settings: canonicalShared(),
    pathway: { businessId: 'b-inperson', stage: 'Setup', completedSteps: [] },
    checkInCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  return { profile, businesses, offers, scenarios };
}

/* ==========================================================================
   F24: scenarios. Apply multipliers and events per active business, then
   aggregate; runway = cash / monthly shortfall.

   Multipliers: "audience" scales the people counts of each business;
   "conversion" scales only the sales conversion step (consult close,
   follower to subscriber, follower to tribute). It never touches
   screening, booking or show rates (screening is not a sales lever), which
   is also what keeps G20 exact.

   Events are named transforms with default sizes (EVENT_DEFAULTS), each
   editable. See docs/OPEN-QUESTIONS.md item 10.
   ========================================================================== */
import type { BusinessType, EventId, Multipliers, ScenarioKind } from '@/data/schemas';
import { aggregateMonth, type MonthTotals } from './aggregate';
import { computeBusinessMonth, type OfferBooks } from './businesses';
import { runwayMonths, type RunwayResult } from './formulas';
import { type BusinessModel, type ProfileModel, activeInPriorityOrder, overrideFor, sourceShare } from './model';
import { type Book, reader, scaled, withValues } from './reader';
import { type Result, incomplete, ok } from './types';

export interface ScenarioSpec {
  kind: ScenarioKind;
  multipliers: Multipliers;
  events: EventId[];
}

export const SCENARIO_PRESETS: Record<ScenarioKind, Multipliers> = {
  Normal: { audience: 1, conversion: 1 },
  Dream: { audience: 1.3, conversion: 1.2 },
  Disaster: { audience: 0.6, conversion: 0.75 },
};

export const DREAM_EVENTS: EventId[] = ['viral_post', 'press_feature', 'waitlist', 'regular_upgrades_to_retainer'];
export const DISASTER_EVENTS: EventId[] = ['platform_ban', 'house_stops', 'top_regular_leaves', 'month_off_sick', 'processor_hold', 'price_war'];

/** The knobs behind each event. Sizes are defaults; the UI lets her edit them. */
export interface EventParams {
  /** share of in-person inquiries that came through the banned platform */
  platformShareOfInquiries: number;
  /** share of in-person inquiries the house sends (1 = it is the only source) */
  houseShareOfInquiries: number;
  /** the leaving regular's monthly, as a multiple of the average */
  topRegularMultiple: number;
  /** price cut in a price war */
  priceWarCut: number;
  viralAudienceLift: number;
  pressInquiryLift: number;
  /** the upgraded regular's monthly, as a multiple of the average */
  retainerUpgradeMultiple: number;
}
export const EVENT_DEFAULTS: EventParams = {
  platformShareOfInquiries: 0.5,
  houseShareOfInquiries: 1,
  topRegularMultiple: 1,
  priceWarCut: 0.15,
  viralAudienceLift: 0.5,
  pressInquiryLift: 0.3,
  retainerUpgradeMultiple: 2,
};

const AUDIENCE_KEYS: Record<BusinessType, string[]> = {
  inPerson: ['inquiriesPerMonth'],
  content: ['followers', 'subscribers', 'ppvSalesPerMonth', 'customsPerMonth', 'digitalSalesPerMonth'],
  calls: ['callsPerMonth'],
  regulars: ['followers', 'activeRegulars'],
};
const CONVERSION_INPUT_KEYS: Record<BusinessType, string[]> = {
  inPerson: [],
  content: ['followerToSubRate'],
  calls: [],
  regulars: ['followerToTributeRate'],
};
const CONVERSION_OFFER_KEYS: Record<BusinessType, Array<[keyof OfferBooks, string]>> = {
  inPerson: [['arc', 'closeRate']],
  content: [],
  calls: [],
  regulars: [],
};

function factors(keys: string[], f: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = f;
  return out;
}

/** Rates stay rates: never above 1 after a lift. */
function clampRates(book: Book, keys: string[]): Book {
  const patch: Record<string, number> = {};
  for (const k of keys) {
    const v = book[k]?.value;
    if (v !== null && v !== undefined && v > 1) patch[k] = 1;
  }
  return Object.keys(patch).length ? withValues(book, patch) : book;
}

export function applyMultipliers(b: BusinessModel, m: Multipliers): BusinessModel {
  let inputs = scaled(b.inputs, factors(AUDIENCE_KEYS[b.type], m.audience));
  inputs = scaled(inputs, factors(CONVERSION_INPUT_KEYS[b.type], m.conversion));
  inputs = clampRates(inputs, CONVERSION_INPUT_KEYS[b.type]);
  const offers: OfferBooks = { ...b.offers };
  for (const [type, key] of CONVERSION_OFFER_KEYS[b.type]) {
    const book = offers[type];
    if (book) offers[type] = clampRates(scaled(book, { [key]: m.conversion }), [key]);
  }
  return { ...b, inputs, offers };
}

function scaleOfferPrices(offers: OfferBooks, factor: number): OfferBooks {
  const out: OfferBooks = {};
  for (const [type, book] of Object.entries(offers) as Array<[keyof OfferBooks, Book]>) out[type] = scaled(book, { priceCents: factor });
  return out;
}

export interface EventEffect {
  business: BusinessModel;
  /** cash the event ties up this month (processor hold); hits runway, not profit */
  heldCashCents: number;
}

/** One event on one business. Events that do not apply to a type leave it unchanged. */
export function applyEvent(b: BusinessModel, event: EventId, p: EventParams, sharedSellableHours: number | null): EventEffect {
  const none: EventEffect = { business: b, heldCashCents: 0 };
  const t = b.type;
  switch (event) {
    case 'platform_ban': {
      /* her own sources say how much rides on rented platforms; the default stands in until then */
      const rented = sourceShare(b, (s) => !s.owned && (s.type === 'platform' || s.type === 'directory' || s.type === 'ads'));
      if (t === 'inPerson') return { ...none, business: { ...b, inputs: scaled(b.inputs, { inquiriesPerMonth: 1 - (rented ?? p.platformShareOfInquiries) }) } };
      /* audience businesses: the biggest rented platform goes, or everything when she has not said */
      const platforms = (b.sources ?? []).filter((s) => !s.owned && s.followers !== null);
      const total = platforms.reduce((x, s) => x + (s.followers ?? 0), 0);
      const biggest = platforms.reduce((x, s) => Math.max(x, s.followers ?? 0), 0);
      const keep = total > 0 ? 1 - biggest / total : 0;
      return { ...none, business: { ...b, inputs: scaled(b.inputs, factors(AUDIENCE_KEYS[t], keep)) } };
    }
    case 'house_stops': {
      if (t !== 'inPerson') return none;
      const house = sourceShare(b, (s) => s.type === 'house');
      return { ...none, business: { ...b, inputs: scaled(b.inputs, { inquiriesPerMonth: 1 - (house ?? p.houseShareOfInquiries) }) } };
    }
    case 'top_regular_leaves': {
      if (t !== 'regulars') return none;
      const n = b.inputs.activeRegulars?.value;
      if (n === null || n === undefined || n <= 0) return none;
      /* one regular leaves; when they paid more than average, the rest average the same */
      const remaining = n - 1;
      const tribute = b.offers.tribute;
      if (!tribute || remaining <= 0) return { ...none, business: { ...b, inputs: withValues(b.inputs, { activeRegulars: Math.max(0, remaining) }) } };
      const avg = tribute.priceCents?.value ?? null;
      if (avg === null) return none;
      const newAvg = (n * avg - p.topRegularMultiple * avg) / remaining;
      return {
        ...none,
        business: { ...b, inputs: withValues(b.inputs, { activeRegulars: remaining }), offers: { ...b.offers, tribute: withValues(tribute, { priceCents: Math.max(0, newAvg) }) } },
      };
    }
    case 'month_off_sick':
      if (t === 'inPerson') return { ...none, business: { ...b, inputs: scaled(b.inputs, { inquiriesPerMonth: 0 }) } };
      if (t === 'calls') return { ...none, business: { ...b, inputs: scaled(b.inputs, { callsPerMonth: 0 }) } };
      if (t === 'content') return { ...none, business: { ...b, inputs: scaled(b.inputs, { ppvSalesPerMonth: 0, customsPerMonth: 0, digitalSalesPerMonth: 0 }) } };
      return { ...none, business: { ...b, inputs: scaled(b.inputs, { followerToTributeRate: 0 }) } };
    case 'processor_hold': {
      const m = computeBusinessMonth(b.type, b.inputs, b.offers, { sellableHours: sharedSellableHours });
      return { business: b, heldCashCents: m.ok ? m.value.revenueCents : 0 };
    }
    case 'price_war':
      return { ...none, business: { ...b, offers: scaleOfferPrices(b.offers, 1 - p.priceWarCut) } };
    case 'viral_post':
      return { ...none, business: { ...b, inputs: scaled(b.inputs, factors(AUDIENCE_KEYS[t], 1 + p.viralAudienceLift)) } };
    case 'press_feature':
      return { ...none, business: { ...b, inputs: scaled(b.inputs, factors(AUDIENCE_KEYS[t], 1 + p.pressInquiryLift)) } };
    case 'waitlist': {
      if (t !== 'inPerson') return none;
      const m = computeBusinessMonth(b.type, b.inputs, b.offers, { sellableHours: sharedSellableHours });
      if (!m.ok || !m.value.cap || m.value.cap.capacity === null) return none;
      const demand = m.value.volumes.sessions ?? 0;
      if (demand <= 0 || demand >= m.value.cap.capacity) return none;
      return { ...none, business: { ...b, inputs: scaled(b.inputs, { inquiriesPerMonth: m.value.cap.capacity / demand }) } };
    }
    case 'regular_upgrades_to_retainer': {
      if (t !== 'regulars') return none;
      const n = b.inputs.activeRegulars?.value;
      const tribute = b.offers.tribute;
      const avg = tribute?.priceCents?.value ?? null;
      if (!tribute || n === null || n === undefined || n <= 0 || avg === null) return none;
      const newAvg = (n * avg + (p.retainerUpgradeMultiple - 1) * avg) / n;
      return { ...none, business: { ...b, offers: { ...b.offers, tribute: withValues(tribute, { priceCents: newAvg }) } } };
    }
  }
}

export interface ScenarioOutcome {
  kind: ScenarioKind;
  totals: MonthTotals;
  eventsApplied: Array<{ businessId: string; event: EventId }>;
  heldCashCents: number;
  runway: RunwayResult | null;
  /** null when cash on hand or the income goal is not entered */
  runwayMissing: string[];
}

export function applyScenario(model: ProfileModel, scenario: ScenarioSpec, params: EventParams = EVENT_DEFAULTS): Result<ScenarioOutcome> {
  const hoursRaw = model.shared.availableHoursPerWeek?.value;
  const sellable = hoursRaw === null || hoursRaw === undefined ? null : (hoursRaw * 52) / 12;
  let heldCashCents = 0;
  const eventsApplied: ScenarioOutcome['eventsApplied'] = [];
  const businesses = model.businesses.map((b) => {
    if (!b.active) return b;
    const o = overrideFor(b, scenario.kind);
    const m: Multipliers = { ...scenario.multipliers, ...(o?.multipliers ?? {}) };
    const events = o?.events ?? scenario.events;
    let next = applyMultipliers(b, m);
    for (const e of events) {
      const eff = applyEvent(next, e, params, sellable);
      if (eff.business !== next || eff.heldCashCents > 0) eventsApplied.push({ businessId: b.id, event: e });
      next = eff.business;
      heldCashCents += eff.heldCashCents;
    }
    return next;
  });
  const totals = aggregateMonth({ businesses, shared: model.shared });
  if (!totals.ok) return incomplete(totals.missing);

  const s = reader(model.shared, 'shared.');
  const cashKnown = model.shared.cashOnHandCents?.value !== null && model.shared.cashOnHandCents !== undefined;
  const goalKnown = model.shared.incomeGoalCents?.value !== null && model.shared.incomeGoalCents !== undefined;
  const cash = cashKnown ? s.req('cashOnHandCents') : Number.NaN;
  const goal = goalKnown ? s.req('incomeGoalCents') : Number.NaN;
  const runwayMissing = [...(cashKnown ? [] : ['shared.cashOnHandCents']), ...(goalKnown ? [] : ['shared.incomeGoalCents'])];
  const runway = runwayMissing.length ? null : runwayMonths(cash - heldCashCents, goal, totals.value.profitCents);
  return ok({ kind: scenario.kind, totals: totals.value, eventsApplied, heldCashCents, runway, runwayMissing }, totals.basedOn);
}

/** All three side by side, each with every business's share (F24). */
export function compareScenarios(model: ProfileModel, scenarios: ScenarioSpec[], params: EventParams = EVENT_DEFAULTS): Record<ScenarioKind, Result<ScenarioOutcome>> {
  const out = {} as Record<ScenarioKind, Result<ScenarioOutcome>>;
  for (const sc of scenarios) out[sc.kind] = applyScenario(model, sc, params);
  return out;
}

export function defaultScenarios(): ScenarioSpec[] {
  return [
    { kind: 'Normal', multipliers: SCENARIO_PRESETS.Normal, events: [] },
    { kind: 'Dream', multipliers: SCENARIO_PRESETS.Dream, events: [] },
    { kind: 'Disaster', multipliers: SCENARIO_PRESETS.Disaster, events: [] },
  ];
}

export { activeInPriorityOrder };

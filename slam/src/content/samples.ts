/* ==========================================================================
   Sample profiles for demo mode, and the fresh profile a first-time user
   starts from. All numbers are Presets (the canonical sample) or
   Placeholders; nothing here is anyone's real data.
   ========================================================================== */
import type { Business, BusinessType, Offer, Profile, Scenario } from '@/data/schemas';
import type { Book } from '@/engine/reader';
import { withValues } from '@/engine/reader';
import { CANONICAL_STAMP } from '@/data/assumptions';
import { SCENARIO_PRESETS } from '@/engine/scenarios';
import {
  addonOffer,
  arcOffer,
  callsInputs,
  callsOffers,
  canonicalShared,

  contentInputs,
  contentOffers,
  inPersonInputs,
  regularsInputs,
  regularsOffers,
  retainerOffer,
  singleOffer,
} from './canonical';
import type { OfferBooks } from '@/engine/businesses/shared';

export interface SampleMeta {
  id: string;
  title: string;
  blurb: string;
}

export const SAMPLES: SampleMeta[] = [
  { id: 'sample-inperson', title: 'Established, in-person first', blurb: 'Four businesses, in-person #1 with an add-on and a retainer. The canonical numbers.' },
  { id: 'sample-online', title: 'Starting out online', blurb: 'Content #1 and calls #2, small numbers, nothing in person yet.' },
  { id: 'sample-regulars', title: 'Regulars first', blurb: 'Eight regulars carry the month; calls and content on the side.' },
];

export const FRESH_PROFILE_ID = 'you';

interface BusinessSpec {
  type: BusinessType;
  active: boolean;
  priority: number;
  inputs?: Record<string, number | null>;
  /** which offers are on; others exist but are off */
  offersOn?: string[];
  offerPatches?: Partial<Record<keyof OfferBooks, Record<string, number | null>>>;
}

interface ProfileSpec {
  id: string;
  alias: string;
  demo: boolean;
  shared?: Record<string, number | null>;
  businesses: BusinessSpec[];
}

export interface Rows {
  profile: Profile;
  businesses: Business[];
  offers: Offer[];
  scenarios: Scenario[];
}

const NAMES: Record<BusinessType, string> = { inPerson: 'In-person', content: 'Content', calls: 'Calls', regulars: 'Regulars' };

const DEFAULT_ON: Record<BusinessType, string[]> = {
  inPerson: ['single', 'addon', 'retainer'],
  content: ['subscription', 'custom', 'digital', 'ppv'],
  calls: ['call'],
  regulars: ['tribute'],
};

function baseInputs(type: BusinessType): Book {
  return { inPerson: inPersonInputs, content: contentInputs, calls: callsInputs, regulars: regularsInputs }[type]();
}

function baseOffers(type: BusinessType): OfferBooks {
  switch (type) {
    case 'inPerson':
      return { single: singleOffer(), addon: addonOffer(), retainer: retainerOffer(), arc: arcOffer() };
    case 'content':
      return contentOffers();
    case 'calls':
      return callsOffers();
    case 'regulars':
      return regularsOffers();
  }
}

const OFFER_NAMES: Record<string, string> = {
  single: 'Single session',
  addon: 'Add-on',
  retainer: 'Retainer',
  arc: 'Discipline Arc',
  subscription: 'Subscription',
  custom: 'Custom',
  digital: 'Digital product',
  ppv: 'Pay-per-view',
  call: 'Video call',
  tribute: 'Regular',
};
const RECURRING = new Set(['retainer', 'subscription', 'tribute']);

function offerRow(businessId: string, type: Offer['type'], book: Book, active: boolean): Offer {
  const row: Offer = {
    id: `${businessId}-${type}`,
    businessId,
    type,
    name: OFFER_NAMES[type] ?? type,
    active,
    recurring: RECURRING.has(type),
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

export function buildRows(spec: ProfileSpec, now: string = CANONICAL_STAMP): Rows {
  const pid = spec.id;
  const businesses: Business[] = [];
  const offers: Offer[] = [];
  for (const b of spec.businesses) {
    const id = `${pid}-${b.type}`;
    let inputs = baseInputs(b.type);
    if (b.inputs) inputs = withValues(inputs, b.inputs);
    businesses.push({ id, profileId: pid, type: b.type, name: NAMES[b.type], active: b.active, priority: b.priority, inputs, scenarioOverrides: {}, createdAt: now, updatedAt: now });
    const on = new Set(b.offersOn ?? DEFAULT_ON[b.type]);
    const books = baseOffers(b.type);
    for (const [type, book] of Object.entries(books) as Array<[keyof OfferBooks, Book]>) {
      const patched = b.offerPatches?.[type] ? withValues(book, b.offerPatches[type]!) : book;
      offers.push(offerRow(id, type, patched, on.has(type)));
    }
  }
  const scenarios: Scenario[] = (['Normal', 'Dream', 'Disaster'] as const).map((kind) => ({
    id: `${pid}-${kind}`,
    profileId: pid,
    kind,
    multipliers: { ...SCENARIO_PRESETS[kind] },
    events: [],
    updatedAt: now,
  }));
  const first = [...spec.businesses].filter((b) => b.active).sort((a, b) => a.priority - b.priority)[0];
  const profile: Profile = {
    id: pid,
    alias: spec.alias,
    demo: spec.demo,
    labelMode: 'plain',
    settings: canonicalShared(spec.shared ?? {}),
    pathway: { businessId: first ? `${pid}-${first.type}` : undefined, stage: 'Setup', completedSteps: [] },
    checkInCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  return { profile, businesses, offers, scenarios };
}

/** A first-time user: nothing ticked yet, every number a labeled preset she can fix. */
export function freshRows(now?: string): Rows {
  return buildRows(
    {
      id: FRESH_PROFILE_ID,
      alias: 'You',
      demo: false,
      businesses: [
        { type: 'inPerson', active: false, priority: 1 },
        { type: 'content', active: false, priority: 2 },
        { type: 'calls', active: false, priority: 3 },
        { type: 'regulars', active: false, priority: 4 },
      ],
    },
    now,
  );
}

export function sampleRows(id: string, now?: string): Rows {
  switch (id) {
    case 'sample-online':
      return buildRows(
        {
          id,
          alias: 'Sample: online',
          demo: true,
          shared: { availableHoursPerWeek: 20, fixedCostsCents: 40_000, incomeGoalCents: 300_000, cashOnHandCents: 200_000 },
          businesses: [
            { type: 'content', active: true, priority: 1, inputs: { followers: 1_200, subscribers: 40, customsPerMonth: 3, hoursPerMonth: 30 } },
            { type: 'calls', active: true, priority: 2, inputs: { callsPerMonth: 4 } },
            { type: 'inPerson', active: false, priority: 3, inputs: { inquiriesPerMonth: 10 } },
            { type: 'regulars', active: false, priority: 4, inputs: { activeRegulars: 0 } },
          ],
        },
        now,
      );
    case 'sample-regulars':
      return buildRows(
        {
          id,
          alias: 'Sample: regulars',
          demo: true,
          shared: { availableHoursPerWeek: 25, fixedCostsCents: 80_000, incomeGoalCents: 500_000, cashOnHandCents: 600_000 },
          businesses: [
            { type: 'regulars', active: true, priority: 1, inputs: { activeRegulars: 8, followers: 6_000, followerToTributeRate: 0.002, hoursPerMonth: 20 } },
            { type: 'calls', active: true, priority: 2, inputs: { callsPerMonth: 12 } },
            { type: 'content', active: true, priority: 3, inputs: { followers: 6_000, subscribers: 60, customsPerMonth: 4, hoursPerMonth: 25 } },
            { type: 'inPerson', active: false, priority: 4 },
          ],
        },
        now,
      );
    case 'sample-inperson':
    default:
      return buildRows(
        {
          id: 'sample-inperson',
          alias: 'Sample: in-person',
          demo: true,
          shared: { availableHoursPerWeek: 40, incomeGoalCents: 1_000_000, cashOnHandCents: 900_000 },
          businesses: [
            { type: 'inPerson', active: true, priority: 1 },
            { type: 'content', active: true, priority: 2 },
            { type: 'calls', active: true, priority: 3 },
            { type: 'regulars', active: true, priority: 4 },
          ],
        },
        now,
      );
  }
}

/** The preset books a type starts from; the diagnosis compares her numbers to these. */
export function benchmarksFor(type: BusinessType): { inputs: Book; offers: OfferBooks } {
  return { inputs: baseInputs(type), offers: baseOffers(type) };
}

/** The typical number for a field, from the presets; null when none. */
export function typicalFor(type: BusinessType, where: string, key: string): number | null {
  if (where === 'shared') return canonicalShared()[key]?.value ?? null;
  if (where === 'inputs') return baseInputs(type)[key]?.value ?? null;
  const book = baseOffers(type)[where as keyof OfferBooks];
  return book?.[key]?.value ?? null;
}

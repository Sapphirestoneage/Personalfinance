/* ==========================================================================
   Rows to engine model. The engine never sees Dexie rows; this is the seam.
   ========================================================================== */
import type { BusinessModel, ProfileModel } from '@/engine/model';
import type { OfferBooks } from '@/engine/businesses/shared';
import type { Book } from '@/engine/reader';
import type { Business, Offer, Profile, Source } from './schemas';

const OFFER_NUMBER_FIELDS = [
  'priceCents',
  'variableCostCents',
  'feeRate',
  'allInHours',
  'takeRate',
  'monthsRetained',
  'sessionsIncluded',
  'sessionsPerMonth',
  'weeks',
  'closeRate',
  'minutes',
] as const;

export function offerToBook(o: Offer): Book {
  const book: Book = {};
  for (const f of OFFER_NUMBER_FIELDS) {
    const a = o[f];
    if (a) book[f] = a;
  }
  return book;
}

export function businessToModel(b: Business, offers: Offer[], sources: Source[] = []): BusinessModel {
  const books: OfferBooks = {};
  for (const o of offers) if (o.businessId === b.id && o.active) books[o.type] = offerToBook(o);
  const mine = sources.filter((s) => s.businessId === b.id);
  return {
    id: b.id,
    type: b.type,
    name: b.name,
    active: b.active,
    priority: b.priority,
    inputs: b.inputs,
    offers: books,
    scenarioOverrides: b.scenarioOverrides,
    ...(mine.length
      ? { sources: mine.map((s) => ({ id: s.id, type: s.type, owned: s.owned, share: s.shareOfInquiries.value, followers: s.followers?.value ?? null, costCents: s.costCents.value })) }
      : {}),
  };
}

export function profileToModel(profile: Profile, businesses: Business[], offers: Offer[], sources: Source[] = []): ProfileModel {
  return {
    businesses: businesses.filter((b) => b.profileId === profile.id).map((b) => businessToModel(b, offers, sources)),
    shared: profile.settings,
  };
}

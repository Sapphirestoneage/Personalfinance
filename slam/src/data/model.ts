/* ==========================================================================
   Rows to engine model. The engine never sees Dexie rows; this is the seam.
   ========================================================================== */
import type { BusinessModel, ProfileModel } from '@/engine/model';
import type { OfferBooks } from '@/engine/businesses/shared';
import type { Book } from '@/engine/reader';
import type { Business, Offer, Profile } from './schemas';

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

export function businessToModel(b: Business, offers: Offer[]): BusinessModel {
  const books: OfferBooks = {};
  for (const o of offers) if (o.businessId === b.id && o.active) books[o.type] = offerToBook(o);
  return { id: b.id, type: b.type, name: b.name, active: b.active, priority: b.priority, inputs: b.inputs, offers: books, scenarioOverrides: b.scenarioOverrides };
}

export function profileToModel(profile: Profile, businesses: Business[], offers: Offer[]): ProfileModel {
  return {
    businesses: businesses.filter((b) => b.profileId === profile.id).map((b) => businessToModel(b, offers)),
    shared: profile.settings,
  };
}

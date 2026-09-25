/* Turn an engine "missing" key into words and a place to fix it. Keys
   look like "<businessId>.<field>", "<businessId>.<offerType>.<field>",
   "shared.<field>", or, from a single business, "<offerType>.<field>". */
import type { Business, LabelMode, OfferType } from '@/data/schemas';
import { BUSINESS_FIELDS, BUSINESS_NAMES, OFFER_FIELDS, OFFER_NAMES, SHARED_FIELDS } from '@/content/fields';
import { OFFER_TYPES } from '@/data/schemas';

export interface MissingItem {
  key: string;
  text: string;
  to: string;
}

const OFFER_SET = new Set<string>(OFFER_TYPES);

export function describeMissing(key: string, businesses: Business[], mode: LabelMode, currentBusinessId?: string): MissingItem {
  const parts = key.split('.');
  if (parts[0] === 'shared' && parts[1]) {
    const f = SHARED_FIELDS.find((x) => x.key === parts[1]);
    return { key, text: `Settings: ${f ? f.labels[mode] : parts[1]}`, to: 'businesses/settings' };
  }
  let business = businesses.find((b) => b.id === parts[0]);
  let rest = parts.slice(1);
  if (!business && currentBusinessId) {
    business = businesses.find((b) => b.id === currentBusinessId);
    rest = parts;
  }
  if (!business) return { key, text: key, to: 'businesses' };
  const name = BUSINESS_NAMES[business.type][mode];
  if (rest.length === 2 && OFFER_SET.has(rest[0]!)) {
    const type = rest[0] as OfferType;
    const f = OFFER_FIELDS[type].find((x) => x.key === rest[1]);
    return { key, text: `${name}, ${OFFER_NAMES[type][mode]}: ${f ? f.labels[mode] : rest[1]}`, to: `businesses/${business.id}` };
  }
  const f = BUSINESS_FIELDS[business.type].find((x) => x.key === rest[0]);
  return { key, text: `${name}: ${f ? f.labels[mode] : rest.join('.')}`, to: `businesses/${business.id}` };
}

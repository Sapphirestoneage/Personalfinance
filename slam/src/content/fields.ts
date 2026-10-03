/* ==========================================================================
   Every typed field, with its label in the three modes, its unit and a
   line of help. Plain and Domme are the defaults; Pro carries the jargon.
   Copy is non-explicit. One meaning per term (see CLAUDE.md glossary).
   ========================================================================== */
import type { BusinessType, LabelMode, OfferType } from '@/data/schemas';

export type Unit = 'count' | 'dollars' | 'percent' | 'hours' | 'months' | 'flag' | 'minutes' | 'rating';

export interface FieldMeta {
  key: string;
  unit: Unit;
  labels: Record<LabelMode, string>;
  help?: string;
  min?: number;
  max?: number;
  /** 'more' fields sit behind "More detail" in Plain and Domme modes; Pro shows everything */
  tier?: 'core' | 'more';
}

const f = (key: string, unit: Unit, plain: string, domme: string, pro: string, help?: string, extra: Partial<FieldMeta> = {}): FieldMeta => ({
  key,
  unit,
  labels: { plain, domme, pro },
  help,
  ...extra,
});
const more = (meta: FieldMeta): FieldMeta => ({ ...meta, tier: 'more' });

export const SHARED_FIELDS: FieldMeta[] = [
  f('availableHoursPerWeek', 'hours', 'Hours a week you can work', 'Working hours a week', 'Available hours / week', 'All of it: sessions, admin, content, travel.'),
  f('recoveryDaysPerWeek', 'count', 'Days off a week (at least 1)', 'Recovery days a week', 'Recovery days / week', 'Never zero. The app will not save less than one.', { min: 1, max: 6 }),
  f('fixedCostsCents', 'dollars', 'Monthly costs that do not change', 'Fixed costs a month', 'Fixed costs / month', 'Rent, subscriptions, insurance, tools.'),
  f('incomeGoalCents', 'dollars', 'What you want to take home a month', 'Monthly income goal', 'Income goal / month (profit target)'),
  f('taxSetAsideRate', 'percent', 'Share to put aside for tax', 'Tax set-aside', 'Tax set-aside rate', 'A reminder line only. For the right number, ask a professional.'),
  f('cashOnHandCents', 'dollars', 'Cash you could live on', 'Cash on hand', 'Cash reserve', 'Used for runway in Disaster.'),
  more(f('hourlyValueCents', 'dollars', 'What an hour of yours is worth', 'Hourly value', 'Hourly value (opportunity cost)', 'Used to price the time a move costs.')),
  more(f('acquisitionSpendCents', 'dollars', 'Money spent finding clients a month', 'Acquisition spend a month', 'Acquisition spend / month', 'Ads, listings, promo.')),
  more(f('acquisitionHoursPerMonth', 'hours', 'Hours spent finding clients a month', 'Acquisition hours a month', 'Acquisition hours / month')),
];

export const BUSINESS_FIELDS: Record<BusinessType, FieldMeta[]> = {
  inPerson: [
    f('inquiriesPerMonth', 'count', 'People who contacted you last month', 'Inquiries last month', 'Inquiries / month'),
    f('passRate', 'percent', 'Share who pass your screening', 'Screening pass rate', 'Screening pass rate', 'Your screening is yours. This app never suggests loosening it.'),
    f('bookingRate', 'percent', 'Share of screened people who book', 'Booking rate', 'Booking rate (screened to booked)'),
    f('showRate', 'percent', 'Share of bookings who turn up', 'Show rate', 'Show rate'),
    f('rebookRate', 'percent', 'Extra sessions per new client', 'Rebook rate', 'Rebook rate (repeat sessions per new client)', '30% means every 10 new clients bring 3 more sessions over time.'),
    f('capacitySessions', 'count', 'Most sessions you want in a month', 'Session capacity a month', 'Capacity (sessions / month)', 'Leave empty if you have not decided; the hours cap still applies.'),
    more(f('spaceCostCents', 'dollars', 'Space cost a month', 'Space cost a month', 'Space cost / month (fixed)', 'Leave at 0 if it is already inside fixed costs.')),
  ],
  content: [
    f('followers', 'count', 'Followers, all platforms together', 'Followers', 'Audience (followers, all platforms)'),
    f('followerToSubRate', 'percent', 'Share of followers who subscribe each month', 'Follower to subscriber rate', 'Follower to subscriber conversion / month'),
    f('subscribers', 'count', 'Paying subscribers right now', 'Subscribers', 'Active subscribers'),
    f('churnRate', 'percent', 'Share of subscribers who leave each month', 'Churn a month', 'Monthly churn'),
    f('customsPerMonth', 'count', 'Customs a month', 'Customs a month', 'Custom orders / month'),
    more(f('ppvSalesPerMonth', 'count', 'Pay-per-view sales a month', 'PPV sales a month', 'PPV units / month')),
    more(f('digitalSalesPerMonth', 'count', 'Digital product sales a month', 'Digital sales a month', 'Digital product units / month')),
    f('hoursPerMonth', 'hours', 'Hours a month on content', 'Content hours a month', 'Content hours / month'),
    more(f('toolsCostCents', 'dollars', 'Tools and apps a month', 'Tools cost a month', 'Tools cost / month (fixed)')),
  ],
  calls: [
    f('callsPerMonth', 'count', 'Calls a month', 'Calls a month', 'Booked calls / month'),
    f('noShowRate', 'percent', 'Share who do not show', 'No-show rate', 'No-show rate'),
    more(f('depositCoversNoShow', 'flag', 'Paid even when they do not show', 'Deposit covers no-shows', 'Deposit forfeits on no-show')),
    f('rebookRate', 'percent', 'Share who book again', 'Rebook rate', 'Rebook rate'),
    more(f('toolsCostCents', 'dollars', 'Tools and apps a month', 'Tools cost a month', 'Tools cost / month (fixed)')),
  ],
  regulars: [
    f('activeRegulars', 'count', 'Regulars paying right now', 'Active regulars', 'Active regulars'),
    f('followers', 'count', 'Followers, all platforms together', 'Followers', 'Audience (followers)'),
    f('followerToTributeRate', 'percent', 'Share of followers who send a tribute each month', 'Follower to tribute rate', 'Follower to tribute conversion / month'),
    more(f('oneOffTributeAvgCents', 'dollars', 'Typical one-off tribute', 'Average one-off tribute', 'Average one-off tribute')),
    more(f('chargebackRate', 'percent', 'Share lost to chargebacks', 'Chargeback rate', 'Chargeback rate')),
    f('hoursPerMonth', 'hours', 'Hours a month on this', 'Hours a month', 'Hours / month'),
    more(f('toolsCostCents', 'dollars', 'Tools and apps a month', 'Tools cost a month', 'Tools cost / month (fixed)')),
  ],
};

const price = f('priceCents', 'dollars', 'Price', 'Price', 'Price');
const fee = more(f('feeRate', 'percent', 'Cut the platform or processor takes', 'Platform cut', 'Fee rate'));
const variable = f('variableCostCents', 'dollars', 'What one costs you to deliver', 'Delivery cost', 'Variable cost / unit');
const allIn = f('allInHours', 'hours', 'Hours one really takes, all in', 'All-in hours', 'All-in hours / unit', 'Prep, travel, the thing itself, recovery, admin.');
const take = f('takeRate', 'percent', 'Share of new clients who take it', 'Take rate', 'Take rate (attach rate)');

export const OFFER_FIELDS: Record<OfferType, FieldMeta[]> = {
  single: [price, more(f('minutes', 'minutes', 'Minutes', 'Minutes', 'Duration (min)')), fee, variable, allIn],
  addon: [price, fee, variable, allIn, take],
  retainer: [
    f('priceCents', 'dollars', 'Price a month', 'Monthly price', 'Retainer price / month'),
    f('sessionsPerMonth', 'count', 'Sessions a month it includes', 'Sessions a month', 'Sessions / month included'),
    f('monthsRetained', 'months', 'Months a client usually keeps it', 'Months kept', 'Retention (months)'),
    fee,
    variable,
    allIn,
    take,
  ],
  arc: [
    price,
    f('sessionsIncluded', 'count', 'Sessions it includes', 'Sessions included', 'Sessions included'),
    f('weeks', 'count', 'Weeks it runs', 'Weeks', 'Program length (weeks)'),
    f('closeRate', 'percent', 'Share of consultations that say yes', 'Close rate', 'Consult close rate'),
    fee,
    f('variableCostCents', 'dollars', 'What the whole program costs you to deliver', 'Delivery cost, whole program', 'Variable cost / program'),
    f('allInHours', 'hours', 'Hours the whole program takes, all in', 'All-in hours, whole program', 'All-in hours / program'),
  ],
  subscription: [f('priceCents', 'dollars', 'Price a month', 'Monthly price', 'Subscription price / month'), fee, variable, allIn],
  ppv: [price, fee, variable, allIn],
  custom: [price, fee, variable, allIn],
  digital: [price, fee, variable, allIn],
  call: [f('priceCents', 'dollars', 'Price per block', 'Price per block', 'Price / block'), more(f('minutes', 'minutes', 'Minutes per block', 'Block length', 'Block (min)')), fee, variable, allIn],
  tribute: [
    f('priceCents', 'dollars', 'What a regular sends a month, on average', 'Average monthly', 'Average monthly tribute'),
    f('monthsRetained', 'months', 'Months a regular usually stays', 'Months kept', 'Retention (months)'),
    fee,
    variable,
    allIn,
  ],
};

export const OFFER_NAMES: Record<OfferType, Record<LabelMode, string>> = {
  single: { plain: 'One session', domme: 'Single session', pro: 'Single session (core offer)' },
  addon: { plain: 'Something extra with a session', domme: 'Add-on', pro: 'Add-on (upsell)' },
  retainer: { plain: 'A monthly arrangement', domme: 'Retainer', pro: 'Retainer (recurring)' },
  arc: { plain: 'A program over several weeks', domme: 'Arc', pro: 'Program (consult offer)' },
  subscription: { plain: 'Subscription', domme: 'Subscription', pro: 'Subscription (MRR)' },
  ppv: { plain: 'Pay-per-view', domme: 'PPV', pro: 'PPV unit' },
  custom: { plain: 'Custom', domme: 'Custom', pro: 'Custom order' },
  digital: { plain: 'Digital product', domme: 'Digital product', pro: 'Digital product' },
  call: { plain: 'Call', domme: 'Call', pro: 'Call block' },
  tribute: { plain: 'Regular', domme: 'Regular', pro: 'Recurring regular' },
};

export const BUSINESS_NAMES: Record<BusinessType, Record<LabelMode, string>> = {
  inPerson: { plain: 'In person', domme: 'In-person', pro: 'In-person sessions' },
  content: { plain: 'Content', domme: 'Content', pro: 'Content (subs, PPV, customs)' },
  calls: { plain: 'Calls', domme: 'Calls', pro: 'Calls (video, voice)' },
  regulars: { plain: 'Regulars', domme: 'Findom and regulars', pro: 'Findom and regulars (recurring)' },
};

export const BUSINESS_BLURBS: Record<BusinessType, string> = {
  inPerson: 'Sessions in a space: the funnel from contact to session, and what each one is worth.',
  content: 'Subscribers, pay-per-view, customs and digital products.',
  calls: 'Calls sold by the block.',
  regulars: 'People who send regularly, with an agreed budget each.',
};

export const OFFER_TYPES_BY_BUSINESS: Record<BusinessType, OfferType[]> = {
  inPerson: ['single', 'addon', 'retainer', 'arc'],
  content: ['subscription', 'ppv', 'custom', 'digital'],
  calls: ['call'],
  regulars: ['tribute'],
};

export function fieldLabel(meta: FieldMeta, mode: LabelMode): string {
  return meta.labels[mode];
}

export const SOURCE_TYPE_WORDS: Record<string, Record<LabelMode, string>> = {
  platform: { plain: 'A platform or app', domme: 'Platform', pro: 'Platform (rented audience)' },
  house: { plain: 'A house or studio that sends people', domme: 'House', pro: 'House (referral partner)' },
  referral: { plain: 'People sent by clients or friends', domme: 'Referrals', pro: 'Referrals (earned)' },
  ads: { plain: 'Paid listings or ads', domme: 'Ads and listings', pro: 'Paid (ads, listings)' },
  own_site: { plain: 'Your own site or list', domme: 'Own site or list', pro: 'Owned (site, list)' },
  directory: { plain: 'A directory', domme: 'Directory', pro: 'Directory (rented)' },
  other: { plain: 'Somewhere else', domme: 'Other', pro: 'Other' },
};
export const SOURCE_OWNED_DEFAULT: Record<string, boolean> = { platform: false, house: false, referral: true, ads: false, own_site: true, directory: false, other: false };

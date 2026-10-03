/* ==========================================================================
   Planets, bands and levels: the leveling system for getting her numbers in.

   Five planets are the parts of her chain: Contacts, Bookings, Offers,
   Time, Money. Five bands mean the same depth on every planet: Sketch,
   Basics, Detail, Read, Power. A level is one short sitting (one to three
   numbers, or one confirmation) that ends in a payoff card. Nothing is
   locked: every reading exists from the first minute as an estimate, and
   becomes hers as the levels that feed it are done. A round is a band
   finished on every planet.

   Round 1 is the three-number diagnosis. Band 4 confirms against her own
   records. Band 5 is the pathway's power tools.
   ========================================================================== */
import type { BusinessType, OfferType, PathwayStage } from '@/data/schemas';

export const PLANETS = [
  { id: 'contacts', name: 'Contacts', blurb: 'Who reaches out, and from where.' },
  { id: 'bookings', name: 'Bookings', blurb: 'Who books, shows, and comes back.' },
  { id: 'offers', name: 'Offers', blurb: 'What you sell and what each one leaves you.' },
  { id: 'time', name: 'Time', blurb: 'The hours you can sell and the cap on them.' },
  { id: 'money', name: 'Money', blurb: 'Costs, the goal, and the cash behind you.' },
] as const;
export type PlanetId = (typeof PLANETS)[number]['id'];

export const BANDS = [
  { band: 1, name: 'Sketch', payoff: 'reveal', blurb: 'Three numbers. The bottleneck appears.' },
  { band: 2, name: 'Basics', payoff: 'reveal', blurb: 'A handful more. Sessions, gross profit and per-hour become yours.' },
  { band: 3, name: 'Detail', payoff: 'certainty', blurb: 'Fees, plans, sources, cash. Profit, runway and the futures firm up.' },
  { band: 4, name: 'Read', payoff: 'certainty', blurb: 'Your own records check the model.' },
  { band: 5, name: 'Power', payoff: 'power', blurb: 'The tools that change the numbers.' },
] as const;
export type Band = (typeof BANDS)[number]['band'];
export type Payoff = (typeof BANDS)[number]['payoff'];

export interface FieldRef {
  where: 'inputs' | 'shared' | OfferType;
  key: string;
}

export type LevelKind =
  | { kind: 'fields'; fields: FieldRef[] }
  /** done when at least one source (or platform) is entered */
  | { kind: 'sources' }
  /** done when the client log has fed the rates, or the log holds enough contacts */
  | { kind: 'log' }
  /** done when four check-ins are saved */
  | { kind: 'checkins' }
  /** done when the pathway stage is complete */
  | { kind: 'stage'; stage: PathwayStage };

export interface Level {
  id: string;
  planet: PlanetId;
  band: Band;
  title: string;
  question: string;
  minutes: number;
  what: LevelKind;
}

const F = (where: FieldRef['where'], key: string): FieldRef => ({ where, key });
const fields = (...refs: FieldRef[]): LevelKind => ({ kind: 'fields', fields: refs });

/* Bands 4 and 5 are the same on every business type. */
const READ_AND_POWER: Level[] = [
  { id: 'contacts-4', planet: 'contacts', band: 4, title: 'Contacts from your log', question: 'Do your logged contacts say what the model says?', minutes: 1, what: { kind: 'log' } },
  { id: 'bookings-4', planet: 'bookings', band: 4, title: 'Four check-ins', question: 'Do four real weeks agree with the model?', minutes: 1, what: { kind: 'checkins' } },
  { id: 'offers-4', planet: 'offers', band: 4, title: 'Your offer, read back', question: 'Is what you sell worth more than it costs, per hour?', minutes: 5, what: { kind: 'stage', stage: 'Offer' } },
  { id: 'time-4', planet: 'time', band: 4, title: 'The plan against your hours', question: 'Does the goal fit inside your capacity?', minutes: 2, what: { kind: 'stage', stage: 'Plan' } },
  { id: 'money-4', planet: 'money', band: 4, title: 'What a client is worth', question: 'What is a client worth over time, and what did they cost to find?', minutes: 4, what: { kind: 'stage', stage: 'Money per client' } },
  { id: 'contacts-5', planet: 'contacts', band: 5, title: 'Being seen', question: 'How many posts reach the people you need?', minutes: 3, what: { kind: 'stage', stage: 'Presence' } },
  { id: 'bookings-5', planet: 'bookings', band: 5, title: 'Conversations', question: 'How many conversations turn into clients?', minutes: 2, what: { kind: 'stage', stage: 'Conversations' } },
  { id: 'offers-5', planet: 'offers', band: 5, title: 'The funnel', question: 'Which step of the funnel moves profit most?', minutes: 3, what: { kind: 'stage', stage: 'Bookings' } },
  { id: 'time-5', planet: 'time', band: 5, title: 'Strategy', question: 'Which move pays best for what it costs?', minutes: 5, what: { kind: 'stage', stage: 'Strategy' } },
  { id: 'money-5', planet: 'money', band: 5, title: 'The plan', question: 'How many contacts does your goal need?', minutes: 2, what: { kind: 'stage', stage: 'Plan' } },
];

/* Band 1 is the diagnosis run; its three fields are what that tool writes. */
const LEVELS_BY_TYPE: Record<BusinessType, Level[]> = {
  inPerson: [
    { id: 'contacts-1', planet: 'contacts', band: 1, title: 'Contacts last month', question: 'How many people contacted you last month?', minutes: 1, what: fields(F('inputs', 'inquiriesPerMonth')) },
    { id: 'bookings-1', planet: 'bookings', band: 1, title: 'Bookings last month', question: 'How many of them booked?', minutes: 1, what: fields(F('inputs', 'bookingRate')) },
    { id: 'offers-1', planet: 'offers', band: 1, title: 'Your price', question: 'What does a session cost?', minutes: 1, what: fields(F('single', 'priceCents')) },
    { id: 'contacts-2', planet: 'contacts', band: 2, title: 'Screening', question: 'What share of contacts pass your screening?', minutes: 1, what: fields(F('inputs', 'passRate')) },
    { id: 'bookings-2', planet: 'bookings', band: 2, title: 'Show and rebook', question: 'Who turns up, and who comes back?', minutes: 1, what: fields(F('inputs', 'showRate'), F('inputs', 'rebookRate')) },
    { id: 'offers-2', planet: 'offers', band: 2, title: 'What a session costs you', question: 'What does one really cost to deliver, in money and in hours?', minutes: 2, what: fields(F('single', 'variableCostCents'), F('single', 'allInHours')) },
    { id: 'time-2', planet: 'time', band: 2, title: 'Your hours', question: 'How many hours a week can you work, and how many sessions a month do you want at most?', minutes: 1, what: fields(F('shared', 'availableHoursPerWeek'), F('inputs', 'capacitySessions')) },
    { id: 'money-2', planet: 'money', band: 2, title: 'Costs and goal', question: 'What do you pay every month no matter what, and what do you want to take home?', minutes: 1, what: fields(F('shared', 'fixedCostsCents'), F('shared', 'incomeGoalCents')) },
    { id: 'contacts-3', planet: 'contacts', band: 3, title: 'Where they come from', question: 'Which sources send your contacts, and which of them do you own?', minutes: 2, what: { kind: 'sources' } },
    { id: 'bookings-3', planet: 'bookings', band: 3, title: 'Who stays on a plan', question: 'What share of new clients take the retainer, and for how long?', minutes: 1, what: fields(F('retainer', 'takeRate'), F('retainer', 'monthsRetained')) },
    { id: 'offers-3', planet: 'offers', band: 3, title: 'Fees and extras', question: 'What cut is taken, and what does the add-on sell for?', minutes: 2, what: fields(F('single', 'feeRate'), F('addon', 'priceCents'), F('addon', 'takeRate')) },
    { id: 'time-3', planet: 'time', band: 3, title: 'Recovery', question: 'How many days a week are off, no matter what?', minutes: 1, what: fields(F('shared', 'recoveryDaysPerWeek')) },
    { id: 'money-3', planet: 'money', band: 3, title: 'Tax and cash', question: 'What share goes aside for tax, and how much cash could you live on?', minutes: 1, what: fields(F('shared', 'taxSetAsideRate'), F('shared', 'cashOnHandCents')) },
    ...READ_AND_POWER,
  ],
  content: [
    { id: 'contacts-1', planet: 'contacts', band: 1, title: 'Followers', question: 'How many followers, all platforms together?', minutes: 1, what: fields(F('inputs', 'followers')) },
    { id: 'bookings-1', planet: 'bookings', band: 1, title: 'Subscribers', question: 'How many paying subscribers right now?', minutes: 1, what: fields(F('inputs', 'subscribers')) },
    { id: 'offers-1', planet: 'offers', band: 1, title: 'Your price', question: 'What does a subscription cost a month?', minutes: 1, what: fields(F('subscription', 'priceCents')) },
    { id: 'contacts-2', planet: 'contacts', band: 2, title: 'Follower to subscriber', question: 'What share of followers subscribe each month?', minutes: 1, what: fields(F('inputs', 'followerToSubRate')) },
    { id: 'bookings-2', planet: 'bookings', band: 2, title: 'Churn', question: 'What share of subscribers leave each month?', minutes: 1, what: fields(F('inputs', 'churnRate')) },
    { id: 'offers-2', planet: 'offers', band: 2, title: 'Customs', question: 'How many customs a month, at what price?', minutes: 1, what: fields(F('inputs', 'customsPerMonth'), F('custom', 'priceCents')) },
    { id: 'time-2', planet: 'time', band: 2, title: 'Your hours', question: 'How many hours a week can you work, and how many a month go on content?', minutes: 1, what: fields(F('shared', 'availableHoursPerWeek'), F('inputs', 'hoursPerMonth')) },
    { id: 'money-2', planet: 'money', band: 2, title: 'Costs and goal', question: 'What do you pay every month no matter what, and what do you want to take home?', minutes: 1, what: fields(F('shared', 'fixedCostsCents'), F('shared', 'incomeGoalCents')) },
    { id: 'contacts-3', planet: 'contacts', band: 3, title: 'Your platforms', question: 'Which platforms, with how many followers on each?', minutes: 2, what: { kind: 'sources' } },
    { id: 'bookings-3', planet: 'bookings', band: 3, title: 'Extras', question: 'How many pay-per-view and digital sales a month?', minutes: 1, what: fields(F('inputs', 'ppvSalesPerMonth'), F('inputs', 'digitalSalesPerMonth')) },
    { id: 'offers-3', planet: 'offers', band: 3, title: 'Platform cuts', question: 'What cut does each platform take?', minutes: 1, what: fields(F('subscription', 'feeRate'), F('custom', 'feeRate')) },
    { id: 'time-3', planet: 'time', band: 3, title: 'Recovery', question: 'How many days a week are off, no matter what?', minutes: 1, what: fields(F('shared', 'recoveryDaysPerWeek')) },
    { id: 'money-3', planet: 'money', band: 3, title: 'Tax and cash', question: 'What share goes aside for tax, and how much cash could you live on?', minutes: 1, what: fields(F('shared', 'taxSetAsideRate'), F('shared', 'cashOnHandCents')) },
    ...READ_AND_POWER,
  ],
  calls: [
    { id: 'contacts-1', planet: 'contacts', band: 1, title: 'Calls a month', question: 'How many calls a month?', minutes: 1, what: fields(F('inputs', 'callsPerMonth')) },
    { id: 'bookings-1', planet: 'bookings', band: 1, title: 'No-shows', question: 'What share do not show?', minutes: 1, what: fields(F('inputs', 'noShowRate')) },
    { id: 'offers-1', planet: 'offers', band: 1, title: 'Your price', question: 'What does a block cost?', minutes: 1, what: fields(F('call', 'priceCents')) },
    { id: 'contacts-2', planet: 'contacts', band: 2, title: 'Who books again', question: 'What share book again?', minutes: 1, what: fields(F('inputs', 'rebookRate')) },
    { id: 'bookings-2', planet: 'bookings', band: 2, title: 'Deposits', question: 'Are you paid even when they do not show?', minutes: 1, what: fields(F('inputs', 'depositCoversNoShow')) },
    { id: 'offers-2', planet: 'offers', band: 2, title: 'What a call takes', question: 'How long is a block, and how many hours does one really take?', minutes: 1, what: fields(F('call', 'minutes'), F('call', 'allInHours')) },
    { id: 'time-2', planet: 'time', band: 2, title: 'Your hours', question: 'How many hours a week can you work?', minutes: 1, what: fields(F('shared', 'availableHoursPerWeek')) },
    { id: 'money-2', planet: 'money', band: 2, title: 'Costs and goal', question: 'What do you pay every month no matter what, and what do you want to take home?', minutes: 1, what: fields(F('shared', 'fixedCostsCents'), F('shared', 'incomeGoalCents')) },
    { id: 'offers-3', planet: 'offers', band: 3, title: 'Platform cut', question: 'What cut does the platform take?', minutes: 1, what: fields(F('call', 'feeRate')) },
    { id: 'time-3', planet: 'time', band: 3, title: 'Recovery', question: 'How many days a week are off, no matter what?', minutes: 1, what: fields(F('shared', 'recoveryDaysPerWeek')) },
    { id: 'money-3', planet: 'money', band: 3, title: 'Tax and cash', question: 'What share goes aside for tax, and how much cash could you live on?', minutes: 1, what: fields(F('shared', 'taxSetAsideRate'), F('shared', 'cashOnHandCents')) },
    ...READ_AND_POWER,
  ],
  regulars: [
    { id: 'contacts-1', planet: 'contacts', band: 1, title: 'Followers', question: 'How many followers, all platforms together?', minutes: 1, what: fields(F('inputs', 'followers')) },
    { id: 'bookings-1', planet: 'bookings', band: 1, title: 'Regulars', question: 'How many regulars are paying right now?', minutes: 1, what: fields(F('inputs', 'activeRegulars')) },
    { id: 'offers-1', planet: 'offers', band: 1, title: 'Average monthly', question: 'What does a regular send a month, on average?', minutes: 1, what: fields(F('tribute', 'priceCents')) },
    { id: 'contacts-2', planet: 'contacts', band: 2, title: 'Follower to tribute', question: 'What share of followers send a tribute each month?', minutes: 1, what: fields(F('inputs', 'followerToTributeRate')) },
    { id: 'bookings-2', planet: 'bookings', band: 2, title: 'How long they stay', question: 'How many months does a regular usually stay?', minutes: 1, what: fields(F('tribute', 'monthsRetained')) },
    { id: 'offers-2', planet: 'offers', band: 2, title: 'One-off tributes', question: 'What is a typical one-off tribute?', minutes: 1, what: fields(F('inputs', 'oneOffTributeAvgCents')) },
    { id: 'time-2', planet: 'time', band: 2, title: 'Your hours', question: 'How many hours a week can you work, and how many a month go on this?', minutes: 1, what: fields(F('shared', 'availableHoursPerWeek'), F('inputs', 'hoursPerMonth')) },
    { id: 'money-2', planet: 'money', band: 2, title: 'Costs and goal', question: 'What do you pay every month no matter what, and what do you want to take home?', minutes: 1, what: fields(F('shared', 'fixedCostsCents'), F('shared', 'incomeGoalCents')) },
    { id: 'contacts-3', planet: 'contacts', band: 3, title: 'Your platforms', question: 'Which platforms, with how many followers on each?', minutes: 2, what: { kind: 'sources' } },
    { id: 'bookings-3', planet: 'bookings', band: 3, title: 'Chargebacks', question: 'What share is lost to chargebacks?', minutes: 1, what: fields(F('inputs', 'chargebackRate')) },
    { id: 'offers-3', planet: 'offers', band: 3, title: 'Processor cut', question: 'What cut does the processor take?', minutes: 1, what: fields(F('tribute', 'feeRate')) },
    { id: 'time-3', planet: 'time', band: 3, title: 'Recovery', question: 'How many days a week are off, no matter what?', minutes: 1, what: fields(F('shared', 'recoveryDaysPerWeek')) },
    { id: 'money-3', planet: 'money', band: 3, title: 'Tax and cash', question: 'What share goes aside for tax, and how much cash could you live on?', minutes: 1, what: fields(F('shared', 'taxSetAsideRate'), F('shared', 'cashOnHandCents')) },
    ...READ_AND_POWER,
  ],
};

export function levelsFor(type: BusinessType): Level[] {
  return LEVELS_BY_TYPE[type];
}

/* Readings: what the levels unlock. Each names the levels it rests on;
   it is "yours" when all of them are done, an estimate until then, and
   "not yet" only when an input is empty. */
export interface Reading {
  id: string;
  tier: Band;
  label: string;
  needs: string[];
  /** where to see it */
  to: string;
}

export const READINGS: Reading[] = [
  { id: 'bottleneck', tier: 1, label: 'The bottleneck', needs: ['contacts-1', 'bookings-1', 'offers-1'], to: 'toolbox/diagnose' },
  { id: 'volume', tier: 1, label: 'Sessions or sales a month', needs: ['contacts-1', 'bookings-1'], to: 'businesses' },
  { id: 'grossProfit', tier: 1, label: 'Gross profit a month', needs: ['contacts-1', 'bookings-1', 'offers-1'], to: 'numbers' },
  { id: 'perHour', tier: 2, label: 'Gross profit per hour of you', needs: ['offers-1', 'offers-2'], to: 'toolbox/offer' },
  { id: 'capacity', tier: 2, label: 'Headroom before capacity', needs: ['contacts-1', 'bookings-1', 'bookings-2', 'time-2'], to: 'businesses' },
  { id: 'profit', tier: 2, label: 'Profit after fixed costs', needs: ['contacts-1', 'bookings-1', 'offers-1', 'money-2'], to: 'numbers' },
  { id: 'levers', tier: 2, label: 'The three biggest levers', needs: ['contacts-2', 'bookings-2', 'offers-2'], to: 'numbers' },
  { id: 'runway', tier: 3, label: 'Runway in Disaster', needs: ['money-2', 'money-3'], to: 'hypotheticals' },
  { id: 'futures', tier: 3, label: 'The three futures with events', needs: ['contacts-3', 'offers-3'], to: 'hypotheticals' },
  { id: 'toKeep', tier: 3, label: 'What is yours to keep after set-aside', needs: ['money-2', 'money-3'], to: 'numbers' },
  { id: 'reality', tier: 4, label: 'The model against your own records', needs: ['contacts-4', 'bookings-4'], to: 'numbers' },
  { id: 'worth', tier: 4, label: 'Worth to cost of a client', needs: ['money-4'], to: 'toolbox/money' },
  { id: 'plan', tier: 5, label: 'Contacts your goal needs', needs: ['money-5', 'time-4'], to: 'toolbox/plan' },
  { id: 'strategy', tier: 5, label: 'The move that pays best', needs: ['time-5'], to: 'toolbox/strategy' },
];

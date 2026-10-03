/* ==========================================================================
   "Not sure?" for every field: what counts, where to look, and what to do
   when she has no idea. Written for someone who has never done this and
   does not like numbers. Short sentences. No jargon. Keyed by
   "<where>.<key>"; "*.<key>" is the fallback for a key shared by types.
   ========================================================================== */
export interface FieldHelp {
  /** what to count, in one or two sentences */
  what: string;
  /** where the number usually is */
  where: string;
  /** what to do with no idea */
  unsure: string;
}

export const HELP: Record<string, FieldHelp> = {
  /* ---- shared ---- */
  'shared.availableHoursPerWeek': {
    what: 'All the hours in a normal week you could put into work: sessions, messages, posting, travel, admin. Not just the paid part.',
    where: 'Think of last week. Add up the days you worked and roughly how many hours each.',
    unsure: 'Most people land between 20 and 40. Pick the one that feels closest; you can change it any time.',
  },
  'shared.recoveryDaysPerWeek': {
    what: 'Days each week with no client work at all. Rest is part of the plan, not a gap in it.',
    where: 'Look at your last two weeks. How many days were fully off?',
    unsure: 'Two is a common answer. It can never be zero here.',
  },
  'shared.fixedCostsCents': {
    what: 'Money that leaves every month whether you work or not: rent for a space, subscriptions, phone, insurance, tools, ads you pay monthly.',
    where: 'Your bank or card statement for last month. Add the amounts that repeat every month.',
    unsure: 'Guess low rather than skip: a rough total beats nothing. You can sharpen it later.',
  },
  'shared.incomeGoalCents': {
    what: 'What you want left for yourself each month after the business costs. Not sales, not turnover: what you keep.',
    where: 'Your rent and bills plus what you want on top. That sum is a fine first goal.',
    unsure: 'Start with what you need to feel safe this month. Bigger goals come later.',
  },
  'shared.taxSetAsideRate': {
    what: 'The share of profit you set aside for tax so it is there when the bill comes. Only a reminder line; it never changes your profit here.',
    where: 'Ask an accountant for your rate. Until then, a quarter is a common placeholder.',
    unsure: 'Leave 25% for now. This app gives no tax advice; a professional will give you the real number.',
  },
  'shared.cashOnHandCents': {
    what: 'Money you could live on if nothing came in: savings you could reach this week.',
    where: 'Your savings account balance, plus anything in the business account you would not need for bills.',
    unsure: 'Leave it empty. Runway will say "not yet" instead of pretending.',
  },
  'shared.hourlyValueCents': {
    what: 'What an hour of your time is worth to you. Used to price the time a move costs, so hours and money can be compared.',
    where: 'Your profit last month divided by the hours you worked is a good start.',
    unsure: 'Use $100 for now; the answer only changes which move ranks first.',
  },
  'shared.acquisitionSpendCents': {
    what: 'Money spent finding new clients each month: ads, listings, promotions, a directory fee.',
    where: 'Card statement: anything paid to a platform, directory or ad network.',
    unsure: 'If you pay nothing to be found, 0 is right.',
  },
  'shared.acquisitionHoursPerMonth': {
    what: 'Hours a month spent finding clients: posting, replying to messages, updating listings.',
    where: 'Think of a normal week and multiply by four.',
    unsure: 'Ten hours a month is a fair start for most.',
  },

  /* ---- in person ---- */
  'inputs.inquiriesPerMonth': {
    what: 'Every person who reached out about a booking last month, counted once each, before you screened anyone.',
    where: 'Your inbox, DMs and booking form. Count the new names, not the messages.',
    unsure: 'Count last week and multiply by four. Close is fine.',
  },
  'inputs.passRate': {
    what: 'Of the people who reached out, the share who passed your screening. Your screening is yours; this app never suggests changing it.',
    where: 'Of the last 10 people who contacted you, how many passed? That number times 10 is the percent.',
    unsure: 'Half is common. Keep the estimate and let your client log replace it.',
  },
  'inputs.bookingRate': {
    what: 'Of the people who passed screening, the share who actually booked a date.',
    where: 'Of the last 10 who passed, how many booked?',
    unsure: 'Four in ten is typical. Keep the estimate for now.',
  },
  'inputs.showRate': {
    what: 'Of the people who booked, the share who turned up.',
    where: 'Of your last 10 bookings, how many happened?',
    unsure: 'Most people see 8 or 9 in 10 with a deposit, fewer without.',
  },
  'inputs.rebookRate': {
    what: 'How many extra sessions each new client brings over time. 30% means every 10 new clients come back for 3 more sessions between them.',
    where: 'Think of your last 10 new clients. How many booked again? That count, times 10, is the percent.',
    unsure: 'Three in ten is typical for a first pass.',
  },
  'inputs.capacitySessions': {
    what: 'The most sessions you want in a month, whatever the demand. Your ceiling, not a target.',
    where: 'How many sessions was your busiest month you would happily repeat?',
    unsure: 'Leave it empty; your hours will cap it instead.',
  },
  'inputs.spaceCostCents': {
    what: 'What the space costs a month, if you pay for one and it is not already in fixed costs.',
    where: 'Your rent or hourly hire, added up for a month.',
    unsure: 'If it is already inside fixed costs, leave 0.',
  },

  /* ---- content ---- */
  'inputs.followers': {
    what: 'Followers across all your platforms, added together. Roughly is fine.',
    where: 'Each app shows the number on your profile.',
    unsure: 'Add the two biggest platforms and stop there.',
  },
  'inputs.followerToSubRate': {
    what: 'Of your followers, the share who become paying subscribers in a month.',
    where: 'New subscribers last month divided by followers. 50 new from 5,000 followers is 1%.',
    unsure: 'One percent is typical. Keep the estimate.',
  },
  'inputs.subscribers': {
    what: 'People paying you a subscription right now.',
    where: 'The subscribers count in the app you sell through.',
    unsure: 'The app knows; open it and copy the number.',
  },
  'inputs.churnRate': {
    what: 'The share of subscribers who leave each month.',
    where: 'The app usually shows cancelled or expired this month. Divide by your subscribers.',
    unsure: 'One in five a month is common. Keep the estimate.',
  },
  'inputs.ppvSalesPerMonth': {
    what: 'Pay-per-view items sold in a month, all buyers together.',
    where: 'The sales or earnings tab in the app.',
    unsure: '0 if you do not sell these.',
  },
  'inputs.customsPerMonth': {
    what: 'Custom pieces made and paid for in a month.',
    where: 'Your messages or order list from last month.',
    unsure: '0 if you do not do customs.',
  },
  'inputs.digitalSalesPerMonth': {
    what: 'Digital products sold in a month: guides, sets, files.',
    where: 'The store or app you sell them through.',
    unsure: '0 if you do not sell these.',
  },
  'inputs.hoursPerMonth': {
    what: 'Hours a month this business takes, all in: making, posting, replying, admin.',
    where: 'A normal week, times four.',
    unsure: 'Guess. It only shapes how your hours are shared between businesses.',
  },
  'inputs.toolsCostCents': {
    what: 'Apps and tools you pay for monthly just for this business, if not already in fixed costs.',
    where: 'Card statement.',
    unsure: 'If it is already in fixed costs, leave 0.',
  },

  /* ---- calls ---- */
  'inputs.callsPerMonth': {
    what: 'Calls booked in a month, including people who book again.',
    where: 'Your calendar or the platform you take calls on.',
    unsure: 'Count last week and multiply by four.',
  },
  'inputs.noShowRate': {
    what: 'Of booked calls, the share where the person never turned up.',
    where: 'Of your last 10 calls, how many did not happen?',
    unsure: 'One in ten is common without a deposit.',
  },
  'inputs.depositCoversNoShow': {
    what: 'Whether you still get paid when someone does not show, because they paid up front.',
    where: 'How you take payment: before the call, or after.',
    unsure: 'If people pay before the call, switch this on.',
  },

  /* ---- regulars ---- */
  'inputs.activeRegulars': {
    what: 'People who send you something every month right now.',
    where: 'Your list, or last month\'s payments grouped by person.',
    unsure: 'Count the ones you would name without thinking.',
  },
  'inputs.followerToTributeRate': {
    what: 'Of your followers, the share who send a one-off tribute in a month.',
    where: 'New senders last month divided by followers.',
    unsure: 'Small numbers are normal here; keep the estimate.',
  },
  'inputs.oneOffTributeAvgCents': {
    what: 'What a typical one-off tribute is worth.',
    where: 'Look at last month\'s one-off amounts and pick the middle one.',
    unsure: 'Keep the estimate; it only shapes the one-off line.',
  },
  'inputs.chargebackRate': {
    what: 'The share of money lost when a payment is reversed after the fact.',
    where: 'Your processor\'s disputes or chargebacks page.',
    unsure: 'If it has not happened, 0 is right.',
  },

  /* ---- offers ---- */
  '*.priceCents': {
    what: 'What you charge for one, before any cut is taken.',
    where: 'Your rate card or the last one you sold.',
    unsure: 'Use what you charged last time.',
  },
  'retainer.priceCents': {
    what: 'What a retainer client pays you each month.',
    where: 'Your arrangement with them.',
    unsure: 'Keep the estimate if you do not offer one yet.',
  },
  'subscription.priceCents': {
    what: 'The monthly subscription price, before the platform cut.',
    where: 'Your profile shows it.',
    unsure: 'Open the app and copy it.',
  },
  'tribute.priceCents': {
    what: 'What a regular sends a month, on average.',
    where: 'Add last month\'s payments from regulars and divide by how many regulars.',
    unsure: 'Pick the middle of what they send.',
  },
  '*.feeRate': {
    what: 'The cut a platform or payment processor keeps from each sale. 20% means you keep 80.',
    where: 'The app\'s payouts page, or the difference between the price and what lands in your account.',
    unsure: 'Keep the estimate; it is the usual cut for that kind of platform.',
  },
  '*.variableCostCents': {
    what: 'What one costs you to deliver, in cash: the space for that session, travel, supplies, a payout to someone else.',
    where: 'Think of your last one and what you paid out to make it happen.',
    unsure: 'Guess low; it only lowers your profit, never your price.',
  },
  '*.allInHours': {
    what: 'Hours one really takes, start to finish: getting ready, travel, the thing itself, recovery, messages after.',
    where: 'Think of your last one, from first prep to feeling done.',
    unsure: 'Most people undercount. Double what the session itself takes.',
  },
  '*.takeRate': {
    what: 'Of new clients, the share who add this on.',
    where: 'Of your last 10 new clients, how many took it?',
    unsure: 'One in four for an add-on, one in ten for a retainer, are common starts.',
  },
  '*.monthsRetained': {
    what: 'How many months a client usually keeps this going.',
    where: 'Think of the last few who had it. How long did they stay?',
    unsure: 'Four months for a retainer, six for a regular, are common.',
  },
  '*.sessionsPerMonth': {
    what: 'How many sessions the monthly price includes.',
    where: 'Your arrangement.',
    unsure: 'Two is common.',
  },
  '*.sessionsIncluded': {
    what: 'How many sessions the program includes.',
    where: 'Your program outline.',
    unsure: 'Four is common.',
  },
  '*.weeks': {
    what: 'How many weeks the program runs.',
    where: 'Your program outline.',
    unsure: 'Eight is common.',
  },
  '*.closeRate': {
    what: 'Of the people who have a first conversation about the program, the share who say yes.',
    where: 'Of your last 10 conversations, how many went ahead?',
    unsure: 'Four in ten is a fair start.',
  },
  '*.minutes': {
    what: 'How long one lasts, as advertised.',
    where: 'Your rate card.',
    unsure: 'Use your usual length.',
  },
};

export function helpFor(where: string, key: string): FieldHelp | undefined {
  return HELP[`${where}.${key}`] ?? HELP[`*.${key}`] ?? (where !== 'inputs' && where !== 'shared' ? HELP[`inputs.${key}`] : undefined);
}

/* ==========================================================================
   The eight tools, as data: fields (prefixed keys), a compute, and what
   "Save to my business" writes. Prefixes: inputs.<key> (business inputs),
   <offerType>.<key> (an offer), shared.<key> (profile settings), tool.<key>
   (lives only in the tool). The shell resolves initial values by prefix
   and turns them back into a ValuePatch by prefix.
   ========================================================================== */
import type { Assumption, LabelMode, OfferType } from '@/data/schemas';
import type { ToolId } from '@/content/stages';
import type { Unit } from '@/content/fields';
import { OFFER_FIELDS, SHARED_FIELDS, BUSINESS_FIELDS } from '@/content/fields';
import { benchmarksFor } from '@/content/samples';
import type { BusinessModel } from '@/engine/model';
import type { Book } from '@/engine/reader';
import { withValues } from '@/engine/reader';
import { computeBusinessMonth, type OfferBooks } from '@/engine/businesses';
import { diagnose } from '@/engine/diagnose';
import { arcPlan, clientsFromEvents, costToAcquire, grossProfitPerSale, lifetimeGrossProfit, ltgpToCac, LTGP_TO_CAC_TARGET, powerCurve, STACK_TO_PRICE_TARGET, subscriberOfferLift, throughputPerHour, valueEquation, valueStack, WEEKS_PER_MONTH } from '@/engine/formulas';
import { inquiriesForGoal } from '@/engine/reverse';
import { sourceShare } from '@/engine/model';
import { sensitivity } from '@/engine/sensitivity';
import { rankMoves } from '@/engine/leverage';
import { count, money, percent } from '../shared/format';

export interface ToolField {
  key: string;
  label: string;
  unit: Unit;
  help?: string;
  /** default for tool-local keys */
  fallback?: number | null;
  min?: number;
  max?: number;
  /** a heading shown when the section changes (standalone) or as the question's eyebrow (guided) */
  section?: string;
}

export interface ToolLine {
  label: string;
  value: string;
  tone?: 'plain' | 'good' | 'warn';
}

export interface ToolResult {
  ok: boolean;
  lines: ToolLine[];
  summary: string;
  missing?: string[];
  /** which published framework the tool leans on, with the non-affiliation */
  credit?: string;
  /** the formulas behind the answer, named for Pro mode */
  formulas?: string[];
}

export const FORMULA_TEXT: Record<string, string> = {
  F01: 'clients = contacts × pass × booking × show (× close for a consult offer)',
  F02: 'gross profit per sale = price × (1 − fee) − delivery cost',
  F03: 'sessions = new clients × (1 + rebook) + continuity sessions',
  F04: 'sessions never exceed capacity (sessions cap, or sellable hours ÷ all-in hours)',
  F05: 'profit = gross profit − acquisition spend − fixed costs',
  F06: 'lifetime gross profit = gross profit a month × months kept',
  F07: 'cost to acquire = (spend + hours × hourly value) ÷ new clients',
  F08: 'worth : cost = lifetime gross profit ÷ cost to acquire; payback = cost ÷ daily gross profit',
  F09: 'per hour = (price − delivery cost) ÷ all-in hours',
  F10: 'contacts needed = (goal + fixed + spend) ÷ gross profit per contact, then the capacity check',
  F11: 'leverage = added yearly profit ÷ (cash + hours × hourly value + learning) × 52 ÷ (52 + weeks to money)',
  F12: 'sensitivity = profit change from one small move of one input',
  G12: 'clients from events = events × conversations × close rate',
  G13: 'reach = a × posts^b, a fitted from what you have',
  G14: 'lift = (takers − would-book-anyway) × gross profit − takers × credit',
  VE: 'value = (outcome × likelihood) ÷ (delay × effort)',
};

export const CREDIT_OFFERS = 'Value equation and value stack after Alex Hormozi ($100M Offers). SLAM is independent; no book text is reproduced.';
export const CREDIT_LEADS = 'Volume, owned vs rented audiences and the lead math after Alex Hormozi ($100M Leads). SLAM is independent.';
export const CREDIT_LTGP = 'Worth-to-cost (LTGP : CAC) after Alex Hormozi. SLAM is independent.';

export interface ToolCtx {
  business: BusinessModel;
  shared: Book;
  mode: LabelMode;
  sellableHours: number | null;
}

export type Values = Record<string, Assumption>;

export interface ToolDef {
  id: ToolId;
  fields(ctx: ToolCtx): ToolField[];
  /** turn tool-local answers into real inputs before compute and save */
  derive?(values: Values, ctx: ToolCtx): Values;
  compute(values: Values, ctx: ToolCtx): ToolResult;
  /** keys with these prefixes are written on save; default: everything but tool.* */
  saves: boolean;
}

/* ---------- helpers ---------- */

const v = (values: Values, key: string): number | null => values[key]?.value ?? null;

function label(where: 'inputs' | 'shared' | OfferType, key: string, mode: LabelMode, ctx: ToolCtx): string {
  const list = where === 'inputs' ? BUSINESS_FIELDS[ctx.business.type] : where === 'shared' ? SHARED_FIELDS : OFFER_FIELDS[where];
  return list.find((f) => f.key === key)?.labels[mode] ?? key;
}
function unitOf(where: 'inputs' | 'shared' | OfferType, key: string, ctx: ToolCtx): Unit {
  const list = where === 'inputs' ? BUSINESS_FIELDS[ctx.business.type] : where === 'shared' ? SHARED_FIELDS : OFFER_FIELDS[where];
  return list.find((f) => f.key === key)?.unit ?? 'count';
}
const F = (where: 'inputs' | 'shared' | OfferType, key: string, ctx: ToolCtx, help?: string, section?: string): ToolField => ({ key: `${where}.${key}`, label: label(where, key, ctx.mode, ctx), unit: unitOf(where, key, ctx), help, section });
const T = (key: string, label: string, unit: Unit, fallback: number | null, help?: string, section?: string): ToolField => ({ key: `tool.${key}`, label, unit, fallback, help, section });

/** the business with the tool's values laid over it */
export function applied(values: Values, ctx: ToolCtx): BusinessModel {
  let inputs = ctx.business.inputs;
  const offers: OfferBooks = { ...ctx.business.offers };
  for (const [key, a] of Object.entries(values)) {
    const [where, field] = key.split('.') as [string, string];
    if (where === 'inputs') inputs = { ...inputs, [field]: a };
    else if (where !== 'tool' && where !== 'shared') {
      const book = offers[where as OfferType];
      if (book) offers[where as OfferType] = { ...book, [field]: a };
    }
  }
  return { ...ctx.business, inputs, offers };
}
export function appliedShared(values: Values, ctx: ToolCtx): Book {
  let shared = ctx.shared;
  for (const [key, a] of Object.entries(values)) {
    const [where, field] = key.split('.') as [string, string];
    if (where === 'shared') shared = { ...shared, [field]: a };
  }
  return shared;
}

function mainOffer(ctx: ToolCtx): OfferType {
  if (ctx.business.type === 'inPerson') return ctx.business.offers.arc ? 'arc' : 'single';
  const main: Record<BusinessModel['type'], OfferType> = { content: 'subscription', calls: 'call', regulars: 'tribute', inPerson: 'single' };
  return main[ctx.business.type];
}

const missingResult = (missing: string[]): ToolResult => ({ ok: false, lines: [], summary: `Not enough to compute yet: ${missing.join(', ')}.`, missing });

/* ---------- 1. Quick diagnosis ---------- */

const diagnoseTool: ToolDef = {
  id: 'diagnose',
  saves: true,
  fields(ctx) {
    const t = ctx.business.type;
    const main = mainOffer(ctx);
    if (t === 'inPerson') {
      const b = ctx.business.inputs;
      const est = (b.inquiriesPerMonth?.value ?? 0) * (b.passRate?.value ?? 0) * (b.bookingRate?.value ?? 0);
      return [
        F('inputs', 'inquiriesPerMonth', ctx, 'Everyone who reached out, before screening.'),
        T('bookingsLastMonth', 'Bookings last month', 'count', Math.round(est * 10) / 10, 'Booked, whether or not they showed.'),
        F(main, 'priceCents', ctx),
      ];
    }
    if (t === 'content') return [F('inputs', 'followers', ctx), F('inputs', 'subscribers', ctx), F('subscription', 'priceCents', ctx)];
    if (t === 'calls') return [F('inputs', 'callsPerMonth', ctx), F('inputs', 'noShowRate', ctx), F('call', 'priceCents', ctx)];
    return [F('inputs', 'followers', ctx), F('inputs', 'activeRegulars', ctx), F('tribute', 'priceCents', ctx)];
  },
  derive(values, ctx) {
    if (ctx.business.type !== 'inPerson') return values;
    const contacts = v(values, 'inputs.inquiriesPerMonth');
    const bookings = v(values, 'tool.bookingsLastMonth');
    const pass = ctx.business.inputs.passRate?.value ?? null;
    if (contacts === null || bookings === null || pass === null || contacts <= 0 || pass <= 0) return values;
    const rate = Math.min(1, bookings / (contacts * pass));
    const src = values['tool.bookingsLastMonth']!;
    return { ...values, 'inputs.bookingRate': { key: 'bookingRate', value: rate, label: src.label, source: 'from your contacts and bookings', updated: src.updated } };
  },
  compute(values, ctx) {
    const b = applied(values, ctx);
    const m = computeBusinessMonth(b.type, b.inputs, b.offers, { sellableHours: ctx.sellableHours });
    if (!m.ok) return missingResult(m.missing);
    const d = diagnose(b, benchmarksFor(b.type), ctx.sellableHours);
    if (!d) return missingResult(['numbers']);
    const lines: ToolLine[] = [
      { label: 'Gross profit a month, as it stands', value: money(m.value.grossProfitCents, { whole: true }) },
      { label: 'The bottleneck', value: d.headline, tone: 'warn' },
    ];
    if (d.current !== null && d.benchmark !== null) {
      const isMoney = d.key?.endsWith('Cents');
      lines.push({ label: 'Yours vs typical', value: `${isMoney ? money(d.current, { whole: true }) : percent(d.current)} vs ${isMoney ? money(d.benchmark, { whole: true }) : percent(d.benchmark)}` });
      lines.push({ label: 'Worth, at typical', value: `${money(d.gainCents, { sign: true, whole: true })} a month`, tone: 'good' });
    }
    lines.push({ label: 'Do this next', value: d.next });
    let summary = d.kind === 'capacity' ? 'Fix this before chasing more contacts; the app will not advise volume past capacity.' : d.gainCents > 0 ? `Fix this first: at a typical rate it is worth ${money(d.gainCents, { sign: true, whole: true })} a month, more than any other single move.` : 'Fix this first; the plan tool says how many contacts the goal needs.';
    if (d.kind === 'contacts' || d.kind === 'audience') {
      const goal = ctx.shared.incomeGoalCents?.value ?? null;
      const have = b.inputs.inquiriesPerMonth?.value ?? b.inputs.followers?.value ?? null;
      const r = goal === null ? null : inquiriesForGoal(b, ctx.shared, goal);
      if (r && r.ok && have !== null) {
        const unit = r.value.unit === 'inquiry' ? 'contacts' : `${r.value.unit}s`;
        lines.push({ label: `${unit[0]!.toUpperCase() + unit.slice(1)} a month for ${money(goal!, { whole: true })}`, value: `${count(r.value.inquiriesNeeded, 0)} (you have ${count(have, 0)})`, tone: r.value.withinCapacity ? 'plain' : 'warn' });
        summary = r.value.withinCapacity
          ? `The funnel works; it needs more people in it. ${count(r.value.inquiriesNeeded, 0)} ${unit} a month reach your goal; you have ${count(have, 0)}. Volume is the job now.`
          : `The goal needs more than you can deliver at these prices; raise price or add an offer before chasing volume.`;
      } else if (goal === null) {
        lines.push({ label: 'For your goal', value: 'Set an income goal in Shared settings to see how many contacts it needs.' });
      }
    }
    return { ok: true, lines, summary, formulas: ['F01', 'F02', 'F03', 'F04', 'F12', 'F10'] };
  },
};

/* ---------- 2. Offer ---------- */

const STACK_ITEMS: Array<[string, string]> = [
  ['v1', 'The core result: what the time itself is worth to them'],
  ['v2', 'Preparation done for them before they arrive'],
  ['v3', 'Aftercare and follow-up'],
  ['v4', 'Priority access or a guaranteed date'],
  ['v5', 'Something only you do'],
  ['v6', 'A bonus that costs you little and means a lot'],
];

const VALUE_EQ: Array<[keyof import('@/engine/formulas').ValueEquationInput, string, string]> = [
  ['outcome', 'How clearly can a new client picture the result?', '1 = vague, 5 = they can see it'],
  ['likelihood', 'How sure are they it happens with you?', '1 = a gamble, 5 = reputation, reviews, a clear process'],
  ['speed', 'How soon do they get it?', '1 = weeks of waiting, 5 = a date this week'],
  ['ease', 'How easy is it for them, after screening?', '1 = many steps, 5 = one message, one deposit, one date. Screening itself stays as it is.'],
];
const LEVER_ADVICE: Record<keyof import('@/engine/formulas').ValueEquationInput, string> = {
  outcome: 'Name the result in the offer and on the page: what a first session gives them, in their words.',
  likelihood: 'Show the process and the proof: how a booking goes, what others say, what you never do.',
  speed: 'Offer the first available date in the same message; a waitlist raises price, not delay.',
  ease: 'After screening, one reply with the deposit link and two dates. Never shorten screening to make it easier.',
};

const offerTool: ToolDef = {
  id: 'offer',
  saves: true,
  fields(ctx) {
    const main = mainOffer(ctx);
    const fields = [F(main, 'priceCents', ctx, undefined, 'Your offer'), F(main, 'feeRate', ctx, undefined, 'Your offer'), F(main, 'variableCostCents', ctx, undefined, 'Your offer'), F(main, 'allInHours', ctx, undefined, 'Your offer')];
    for (const [k, q, help] of VALUE_EQ) fields.push({ key: `tool.${k}`, label: q, unit: 'rating', fallback: 3, help, min: 1, max: 5, section: 'The value equation: rate each 1 to 5' });
    STACK_ITEMS.forEach(([k, l], i) => fields.push(T(k, l, 'dollars', null, i === 0 ? 'What each piece alone would be worth to them. Leave a piece empty if it does not apply.' : undefined, 'The value stack: what they get, in dollars')));
    fields.push(F('shared', 'incomeGoalCents', ctx, undefined, 'Your goal'));
    return fields;
  },
  compute(values, ctx) {
    const main = mainOffer(ctx);
    const price = v(values, `${main}.priceCents`);
    const fee = v(values, `${main}.feeRate`);
    const variable = v(values, `${main}.variableCostCents`);
    const hours = v(values, `${main}.allInHours`);
    if (price === null || fee === null || variable === null || hours === null) return missingResult(['price, fee, cost and hours']);
    const gp = grossProfitPerSale({ priceCents: price, feeRate: fee, variableCostCents: variable });
    const tp = throughputPerHour(price, variable, hours);
    const items = STACK_ITEMS.map(([k, l]) => ({ name: l, valueCents: v(values, `tool.${k}`) ?? 0 })).filter((i) => i.valueCents > 0);
    const stack = valueStack(items, price);
    const eq = valueEquation({ outcome: v(values, 'tool.outcome') ?? 3, likelihood: v(values, 'tool.likelihood') ?? 3, speed: v(values, 'tool.speed') ?? 3, ease: v(values, 'tool.ease') ?? 3 });
    const lines: ToolLine[] = [
      { label: 'Gross profit per sale', value: money(gp, { whole: true }), tone: gp > 0 ? 'good' : 'warn' },
      { label: 'Per all-in hour', value: tp === null ? 'not yet' : `${money(tp, { whole: true })} an hour` },
      { label: 'Value equation', value: `${eq.index} of 100`, tone: eq.index >= 70 ? 'good' : eq.index >= 45 ? 'plain' : 'warn' },
      { label: 'Weakest lever', value: LEVER_ADVICE[eq.weakest], tone: 'warn' },
    ];
    if (items.length) {
      lines.push({ label: 'Value stack vs price', value: `${money(stack.totalCents, { whole: true })} vs ${money(price, { whole: true })}`, tone: stack.aboveprice ? 'good' : 'warn' });
      if (stack.ratio !== null) lines.push({ label: 'Stack to price', value: `${count(stack.ratio, 1)}x (aim for ${STACK_TO_PRICE_TARGET}x or more)`, tone: stack.ratio >= STACK_TO_PRICE_TARGET ? 'good' : 'plain' });
      const supported = stack.totalCents / STACK_TO_PRICE_TARGET;
      lines.push({ label: `Price the stack supports at ${STACK_TO_PRICE_TARGET}x`, value: money(supported, { whole: true }), tone: supported > price ? 'good' : 'plain' });
    }
    const goal = v(values, 'shared.incomeGoalCents');
    if (goal !== null) {
      const plan = arcPlan({ priceCents: price, feeRate: fee, variableCostCents: variable, allInHours: hours, goalCents: goal });
      if (plan) lines.push({ label: `Sales a month for ${money(goal, { whole: true })}`, value: `${count(plan.clientsNeeded, 2)} sales, ${count(plan.hoursNeeded, 1)} hours` });
    }
    const stackWord = !items.length
      ? 'Fill in the stack to see whether the price looks small next to what they get.'
      : stack.ratio !== null && stack.ratio >= STACK_TO_PRICE_TARGET
        ? 'The stack is worth several times the price: room to raise it, and easy to explain.'
        : stack.aboveprice
          ? 'The stack is worth more than the price, but not by much: add a piece that costs you little before raising price.'
          : 'The stack is worth less than the price: add value or say it better before raising price.';
    const summary = `${money(gp, { whole: true })} of gross profit per sale${tp === null ? '' : `, ${money(tp, { whole: true })} per all-in hour`}. ${stackWord} Weakest lever: ${eq.weakest === 'ease' ? 'ease after screening' : eq.weakest}.`;
    return { ok: true, lines, summary, credit: CREDIT_OFFERS, formulas: ['F02', 'F09', 'VE'] };
  },
};

/* ---------- 3. Presence ---------- */

const presenceTool: ToolDef = {
  id: 'presence',
  saves: false,
  fields: () => [
    T('postsDone', 'Posts so far', 'count', 10),
    T('peopleReached', 'People those posts reached', 'count', 50),
    T('curveB', 'Curve steepness (0.65 is typical)', 'count', 0.65, 'How reach compounds. Leave it unless you know better.'),
    T('postsPlanned', 'Posts you could do', 'count', 100),
    T('peopleWanted', 'People you want to reach', 'count', 500),
  ],
  compute(values, ctx) {
    const done = v(values, 'tool.postsDone');
    const reached = v(values, 'tool.peopleReached');
    const b = v(values, 'tool.curveB');
    const planned = v(values, 'tool.postsPlanned');
    const wanted = v(values, 'tool.peopleWanted');
    if (done === null || reached === null || b === null || done <= 0 || reached <= 0) return missingResult(['posts so far and people reached']);
    const curve = powerCurve(b, done, reached);
    const lines: ToolLine[] = [];
    if (planned !== null) lines.push({ label: `People from ${count(planned, 0)} posts`, value: count(curve(planned), 0) });
    if (wanted !== null) {
      const a = reached / Math.pow(done, b);
      const posts = Math.pow(wanted / a, 1 / b);
      lines.push({ label: `Posts to reach ${count(wanted, 0)} people`, value: count(posts, 0) });
    }
    const rented = sourceShare(ctx.business, (s) => !s.owned);
    if (rented !== null) lines.push({ label: 'Contacts through rented sources', value: percent(rented), tone: rented > 0.7 ? 'warn' : 'plain' });
    const rentedWord = rented === null ? ' Add your sources on the business tab to see how much rides on platforms you do not own.' : rented > 0.7 ? ` ${percent(rented)} of your contacts come through sources you do not own; build one you do (a list, a site) alongside.` : ` ${percent(1 - rented)} of your contacts come through sources you own, which no ban can take.`;
    return { ok: true, lines, summary: `Reach compounds: at this curve, ${count(planned ?? 0, 0)} posts reach about ${count(curve(planned ?? 0), 0)} people. Consistency beats volume in any one week.${rentedWord}`, credit: CREDIT_LEADS, formulas: ['G13'] };
  },
};

/* ---------- 4. Conversations ---------- */

const conversationsTool: ToolDef = {
  id: 'conversations',
  saves: false,
  fields: () => [
    T('reachPerDay', 'Reach actions a day (posts, messages, replies)', 'count', 10, 'The daily volume. Consistency beats bursts.', 'Daily reach'),
    T('replyRate', 'Share of reach actions that turn into a contact', 'percent', 0.03, undefined, 'Daily reach'),
    T('events', 'Events or outings a month', 'count', 2, undefined, 'In person'),
    T('conversations', 'Real conversations per event', 'count', 10, undefined, 'In person'),
    T('closeRate', 'Share of conversations that become a contact', 'percent', 0.05, undefined, 'In person'),
    T('wanted', 'New contacts you want a month', 'count', 20, undefined, 'Your target'),
  ],
  compute(values) {
    const reach = v(values, 'tool.reachPerDay');
    const reply = v(values, 'tool.replyRate');
    const e = v(values, 'tool.events');
    const c = v(values, 'tool.conversations');
    const r = v(values, 'tool.closeRate');
    const wanted = v(values, 'tool.wanted');
    if (e === null || c === null || r === null) return missingResult(['events, conversations and share']);
    const fromEvents = clientsFromEvents(e, c, r);
    const workDays = 5 * WEEKS_PER_MONTH;
    const fromReach = reach !== null && reply !== null ? reach * reply * workDays : null;
    const lines: ToolLine[] = [];
    if (fromReach !== null) lines.push({ label: 'Contacts a month from daily reach', value: count(fromReach, 1) });
    lines.push({ label: 'Contacts a month from events', value: count(fromEvents, 2) });
    if (wanted !== null) {
      if (reply !== null && reply > 0) lines.push({ label: `Reach actions a day for ${count(wanted, 0)} contacts`, value: count(wanted / reply / workDays, 0) });
      if (r > 0 && c > 0) lines.push({ label: `Or conversations a month for ${count(wanted, 0)}`, value: count(wanted / r, 0) });
    }
    const total = (fromReach ?? 0) + fromEvents;
    return { ok: true, lines, summary: `About ${count(total, 1)} contacts a month at this volume${wanted !== null ? total >= wanted ? ', enough for your target.' : `, short of the ${count(wanted, 0)} you want: the fix is more reach actions, not a cleverer message.` : '.'}`, credit: CREDIT_LEADS, formulas: ['G12'] };
  },
};

/* ---------- 5. Bookings ---------- */

const bookingsTool: ToolDef = {
  id: 'bookings',
  saves: true,
  fields(ctx) {
    const t = ctx.business.type;
    if (t === 'inPerson') return [F('inputs', 'bookingRate', ctx), F('inputs', 'showRate', ctx), F('inputs', 'rebookRate', ctx), F('inputs', 'passRate', ctx, 'Shown so the numbers add up. The app never treats screening as a lever.')];
    if (t === 'content') return [F('inputs', 'followerToSubRate', ctx), F('inputs', 'churnRate', ctx)];
    if (t === 'calls') return [F('inputs', 'noShowRate', ctx), F('inputs', 'depositCoversNoShow', ctx), F('inputs', 'rebookRate', ctx)];
    return [F('inputs', 'followerToTributeRate', ctx), F('inputs', 'chargebackRate', ctx)];
  },
  compute(values, ctx) {
    const b = applied(values, ctx);
    const m = computeBusinessMonth(b.type, b.inputs, b.offers, { sellableHours: ctx.sellableHours });
    if (!m.ok) return missingResult(m.missing);
    const rows = sensitivity(b, ctx.sellableHours).filter((r) => !r.key.endsWith('passRate')).slice(0, 4);
    const lines: ToolLine[] = [{ label: 'Gross profit a month', value: money(m.value.grossProfitCents, { whole: true }) }, ...rows.map((r) => ({ label: `${r.label} ${r.move}`, value: `${money(r.deltaCents, { sign: true, whole: true })} a month`, tone: 'good' as const }))];
    return { ok: true, lines, summary: rows[0] ? `${rows[0].label} is the step that moves profit most: ${rows[0].move} is worth ${money(rows[0].deltaCents, { sign: true, whole: true })} a month.` : 'Nothing to move yet.', formulas: ['F01', 'F03', 'F12'] };
  },
};

/* ---------- 6. Money per client ---------- */

const moneyTool: ToolDef = {
  id: 'money',
  saves: true,
  fields(ctx) {
    return [
      F('shared', 'acquisitionSpendCents', ctx, undefined, 'What finding a client costs'),
      F('shared', 'acquisitionHoursPerMonth', ctx, undefined, 'What finding a client costs'),
      F('shared', 'hourlyValueCents', ctx, undefined, 'What finding a client costs'),
      T('subscribers', 'Subscribers or followers you could make an offer to', 'count', null, 'Optional: an offer with a credit, to people who already follow you.', 'An offer to people who already follow you'),
      T('takeRate', 'Share who would take it', 'percent', 0.03, undefined, 'An offer to people who already follow you'),
      T('creditCents', 'Credit you would give each', 'dollars', 3_000, undefined, 'An offer to people who already follow you'),
      T('wouldBookAnyway', 'How many would have booked anyway', 'count', 0, undefined, 'An offer to people who already follow you'),
    ];
  },
  compute(values, ctx) {
    const b = applied(values, ctx);
    const shared = appliedShared(values, ctx);
    const m = computeBusinessMonth(b.type, b.inputs, b.offers, { sellableHours: ctx.sellableHours });
    if (!m.ok) return missingResult(m.missing);
    const per = m.value.perUnit;
    const main = mainOffer(ctx);
    const offer = b.offers[main];
    const gpSale = offer ? grossProfitPerSale({ priceCents: offer.priceCents?.value ?? 0, feeRate: offer.feeRate?.value ?? 0, variableCostCents: offer.variableCostCents?.value ?? 0 }) : 0;
    const newClients = m.value.volumes.newClients ?? m.value.volumes.newSubscribers ?? m.value.volumes.paidCalls ?? m.value.volumes.activeRegulars ?? 0;
    const rebook = b.inputs.rebookRate?.value ?? 0;
    const months = offer?.monthsRetained?.value ?? null;
    const ltgp = months !== null ? lifetimeGrossProfit(gpSale, months) : gpSale * (1 + rebook);
    const spend = shared.acquisitionSpendCents?.value ?? null;
    const hours = shared.acquisitionHoursPerMonth?.value ?? null;
    const hourly = shared.hourlyValueCents?.value ?? null;
    const lines: ToolLine[] = [{ label: 'Gross profit per sale', value: money(gpSale, { whole: true }) }, { label: 'Lifetime gross profit per client', value: money(ltgp, { whole: true }) }];
    let summary = `A client is worth about ${money(ltgp, { whole: true })} over their time with you.`;
    if (spend !== null && hours !== null && hourly !== null) {
      const cac = costToAcquire(spend, hours, hourly, newClients);
      const r = ltgpToCac(ltgp, cac, months !== null ? gpSale : gpSale * (1 + rebook));
      lines.push({ label: 'Cost to acquire one', value: cac === null ? 'no new clients yet' : money(cac, { whole: true }) });
      if (r.ratio !== null) lines.push({ label: 'Worth : cost', value: `${count(r.ratio, 1)} : 1 (aim for ${LTGP_TO_CAC_TARGET} : 1 or better)`, tone: r.ratio >= LTGP_TO_CAC_TARGET ? 'good' : 'warn' });
      if (r.paybackDays !== null) lines.push({ label: 'Days to pay back', value: count(r.paybackDays, 0) });
      if (r.ratio !== null) summary += r.ratio >= LTGP_TO_CAC_TARGET ? ` For every dollar and hour spent finding one, ${count(r.ratio, 1)} come back: spend more on finding clients, not less.` : ` Only ${count(r.ratio, 1)} comes back per dollar and hour spent finding one; raise what a client is worth (price, rebooks, a retainer) before spending more on finding them.`;
    } else {
      lines.push({ label: 'Cost to find one', value: 'Fill in spend, hours and your hourly value to see it.' });
    }
    const subs = v(values, 'tool.subscribers');
    if (subs !== null && subs > 0) {
      const lift = subscriberOfferLift({ subscribers: subs, takeRate: v(values, 'tool.takeRate') ?? 0, creditCents: v(values, 'tool.creditCents') ?? 0, wouldBookAnyway: v(values, 'tool.wouldBookAnyway') ?? 0, gpPerBookingCents: per?.grossProfitCents && b.type !== 'inPerson' ? per.grossProfitCents : gpSale });
      lines.push({ label: 'An offer to them would add', value: `${money(lift, { sign: true, whole: true })}`, tone: lift > 0 ? 'good' : 'warn' });
    }
    return { ok: true, lines, summary, credit: CREDIT_LTGP, formulas: ['F06', 'F07', 'F08', 'G14'] };
  },
};

/* ---------- 7. Plan ---------- */

const planTool: ToolDef = {
  id: 'plan',
  saves: true,
  fields: (ctx) => [F('shared', 'incomeGoalCents', ctx), F('shared', 'fixedCostsCents', ctx), F('inputs', ctx.business.type === 'inPerson' ? 'capacitySessions' : ctx.business.type === 'calls' ? 'callsPerMonth' : ctx.business.type === 'content' ? 'hoursPerMonth' : 'hoursPerMonth', ctx)],
  compute(values, ctx) {
    const b = applied(values, ctx);
    const shared = appliedShared(values, ctx);
    const goal = shared.incomeGoalCents?.value ?? null;
    if (goal === null) return missingResult(['income goal']);
    const r = inquiriesForGoal(b, shared, goal);
    if (!r.ok) return missingResult(r.missing);
    const x = r.value;
    const unitWord = x.unit === 'inquiry' ? 'contacts' : x.unit + 's';
    const lines: ToolLine[] = [
      { label: `${unitWord[0]!.toUpperCase() + unitWord.slice(1)} a month for ${money(goal, { whole: true })}`, value: count(x.inquiriesNeeded, 0) },
    ];
    if (x.unit === 'inquiry') lines.push({ label: 'That is, sessions a month', value: count(x.sessionsNeeded, 1) });
    lines.push({ label: 'Within capacity?', value: x.withinCapacity ? 'Yes' : `No: at capacity the most is ${money(x.maxProfitAtCapacityCents ?? 0, { whole: true })} profit`, tone: x.withinCapacity ? 'good' : 'warn' });
    const summary = x.withinCapacity
      ? `${count(x.inquiriesNeeded, 0)} ${unitWord} a month gets you to ${money(goal, { whole: true })} after fixed costs, within what you can deliver.`
      : `The goal needs more than you can deliver at these prices. Raise price or add an offer before chasing more ${unitWord}; the app will not advise volume past capacity.`;
    return { ok: true, lines, summary, formulas: ['F10', 'F04'] };
  },
};

/* ---------- 8. Strategy ---------- */

const MOVES = ['A', 'B', 'C'] as const;
const strategyTool: ToolDef = {
  id: 'strategy',
  saves: false,
  fields(ctx) {
    const f: ToolField[] = [F('shared', 'hourlyValueCents', ctx)];
    for (const m of MOVES) {
      const sec = `Move ${m}`;
      f.push(T(`${m}_profit`, 'Profit it adds a year', 'dollars', m === 'A' ? 600_000 : null, undefined, sec), T(`${m}_cash`, 'Cash it costs', 'dollars', m === 'A' ? 50_000 : null, undefined, sec), T(`${m}_hours`, 'Hours it costs', 'hours', m === 'A' ? 20 : null, undefined, sec), T(`${m}_weeks`, 'Weeks until the money', 'count', m === 'A' ? 4 : null, undefined, sec));
    }
    return f;
  },
  compute(values, ctx) {
    const hourly = appliedShared(values, ctx).hourlyValueCents?.value ?? null;
    if (hourly === null) return missingResult(['hourly value']);
    const moves = MOVES.map((m) => ({ id: m, name: `Move ${m}`, addedAnnualProfitCents: v(values, `tool.${m}_profit`), cashCostCents: v(values, `tool.${m}_cash`), hours: v(values, `tool.${m}_hours`), weeksToMoney: v(values, `tool.${m}_weeks`) }))
      .filter((m) => m.addedAnnualProfitCents !== null)
      .map((m) => ({ id: m.id, name: m.name, addedAnnualProfitCents: m.addedAnnualProfitCents!, cashCostCents: m.cashCostCents ?? 0, hours: m.hours ?? 0, hourlyValueCents: hourly, learningCostCents: 0, weeksToMoney: m.weeksToMoney ?? 0 }));
    if (!moves.length) return missingResult(['at least one move']);
    const ranked = rankMoves(moves);
    const lines = ranked.map((m, i) => ({ label: `${i + 1}. ${m.name}`, value: m.score === null ? 'no cost given' : `${count(m.score, 1)}x back`, tone: i === 0 ? ('good' as const) : ('plain' as const) }));
    return { ok: true, lines, summary: `${ranked[0]!.name} pays best for what it costs${ranked[0]!.score !== null ? `: about ${count(ranked[0]!.score, 1)} dollars of yearly profit per dollar of cost, after the wait` : ''}.`, credit: 'Leverage as output per unit of input, after Alex Hormozi. SLAM is independent.', formulas: ['F11'] };
  },
};

export const TOOLS: Record<Exclude<ToolId, 'setup'>, ToolDef> = {
  diagnose: diagnoseTool,
  offer: offerTool,
  presence: presenceTool,
  conversations: conversationsTool,
  bookings: bookingsTool,
  money: moneyTool,
  plan: planTool,
  strategy: strategyTool,
};

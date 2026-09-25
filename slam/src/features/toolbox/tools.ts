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
import { arcPlan, clientsFromEvents, costToAcquire, grossProfitPerSale, lifetimeGrossProfit, ltgpToCac, powerCurve, subscriberOfferLift, throughputPerHour, valueStack } from '@/engine/formulas';
import { sensitivity } from '@/engine/sensitivity';
import { inquiriesForGoal } from '@/engine/reverse';
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
}

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
const F = (where: 'inputs' | 'shared' | OfferType, key: string, ctx: ToolCtx, help?: string): ToolField => ({ key: `${where}.${key}`, label: label(where, key, ctx.mode, ctx), unit: unitOf(where, key, ctx), help });
const T = (key: string, label: string, unit: Unit, fallback: number | null, help?: string): ToolField => ({ key: `tool.${key}`, label, unit, fallback, help });

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
    return [F('inputs', 'activeRegulars', ctx), F('tribute', 'priceCents', ctx), F('inputs', 'chargebackRate', ctx)];
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
    const summary = d.kind === 'capacity' ? 'Fix this before chasing more contacts; the app will not advise volume past capacity.' : d.gainCents > 0 ? `Fix this first: at a typical rate it is worth ${money(d.gainCents, { sign: true, whole: true })} a month, more than any other single move.` : 'Fix this first; the plan tool says how many contacts the goal needs.';
    return { ok: true, lines, summary };
  },
};

/* ---------- 2. Offer ---------- */

const STACK_ITEMS: Array<[string, string]> = [
  ['v1', 'What the time itself would cost elsewhere'],
  ['v2', 'Preparation done for them'],
  ['v3', 'Aftercare and follow-up'],
  ['v4', 'Priority access'],
  ['v5', 'Something only you do'],
];

const offerTool: ToolDef = {
  id: 'offer',
  saves: true,
  fields(ctx) {
    const main = mainOffer(ctx);
    const fields = [F(main, 'priceCents', ctx), F(main, 'feeRate', ctx), F(main, 'variableCostCents', ctx), F(main, 'allInHours', ctx)];
    for (const [k, l] of STACK_ITEMS) fields.push(T(k, `Worth: ${l}`, 'dollars', null, 'What this piece alone is worth to them, in dollars. Leave empty if it does not apply.'));
    fields.push(F('shared', 'incomeGoalCents', ctx));
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
    const lines: ToolLine[] = [
      { label: 'Gross profit per sale', value: money(gp, { whole: true }), tone: gp > 0 ? 'good' : 'warn' },
      { label: 'Per all-in hour', value: tp === null ? 'not yet' : `${money(tp, { whole: true })} an hour` },
    ];
    if (items.length) lines.push({ label: 'Value stack vs price', value: `${money(stack.totalCents, { whole: true })} vs ${money(price, { whole: true })}`, tone: stack.aboveprice ? 'good' : 'warn' });
    const goal = v(values, 'shared.incomeGoalCents');
    if (goal !== null) {
      const plan = arcPlan({ priceCents: price, feeRate: fee, variableCostCents: variable, allInHours: hours, goalCents: goal });
      if (plan) lines.push({ label: `Sales a month for ${money(goal, { whole: true })}`, value: `${count(plan.clientsNeeded, 2)} sales, ${count(plan.hoursNeeded, 1)} hours` });
    }
    const summary = `${money(gp, { whole: true })} of gross profit per sale, ${tp === null ? '' : money(tp, { whole: true }) + ' per all-in hour'}${items.length ? (stack.aboveprice ? '; the stack is worth more than the price, which is where a price should sit.' : '; the stack is worth less than the price, so add value or explain it better before raising price.') : '.'}`;
    return { ok: true, lines, summary };
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
  compute(values) {
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
    return { ok: true, lines, summary: `Reach compounds: at this curve, ${count(planned ?? 0, 0)} posts reach about ${count(curve(planned ?? 0), 0)} people. Consistency beats volume in any one week.` };
  },
};

/* ---------- 4. Conversations ---------- */

const conversationsTool: ToolDef = {
  id: 'conversations',
  saves: false,
  fields: () => [
    T('events', 'Events or outings a month', 'count', 2),
    T('conversations', 'Real conversations per event', 'count', 10),
    T('closeRate', 'Share that become a contact', 'percent', 0.05),
    T('wanted', 'New clients you want a month', 'count', 3),
  ],
  compute(values) {
    const e = v(values, 'tool.events');
    const c = v(values, 'tool.conversations');
    const r = v(values, 'tool.closeRate');
    const wanted = v(values, 'tool.wanted');
    if (e === null || c === null || r === null) return missingResult(['events, conversations and share']);
    const clients = clientsFromEvents(e, c, r);
    const lines: ToolLine[] = [{ label: 'Clients a month from conversations', value: count(clients, 2) }];
    if (wanted !== null && r > 0 && c > 0) lines.push({ label: `Conversations a month for ${count(wanted, 0)}`, value: count(wanted / r, 0) }, { label: 'That is, events a month', value: count(wanted / r / c, 1) });
    return { ok: true, lines, summary: `${count(e, 0)} events with ${count(c, 0)} conversations each at ${percent(r)} is ${count(clients, 2)} clients a month.` };
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
    return { ok: true, lines, summary: rows[0] ? `${rows[0].label} is the step that moves profit most: ${rows[0].move} is worth ${money(rows[0].deltaCents, { sign: true, whole: true })} a month.` : 'Nothing to move yet.' };
  },
};

/* ---------- 6. Money per client ---------- */

const moneyTool: ToolDef = {
  id: 'money',
  saves: true,
  fields(ctx) {
    return [
      F('shared', 'acquisitionSpendCents', ctx),
      F('shared', 'acquisitionHoursPerMonth', ctx),
      F('shared', 'hourlyValueCents', ctx),
      T('subscribers', 'Subscribers or followers you could make an offer to', 'count', null, 'Optional: an offer with a credit, to people who already follow you.'),
      T('takeRate', 'Share who would take it', 'percent', 0.03),
      T('creditCents', 'Credit you would give each', 'dollars', 3_000),
      T('wouldBookAnyway', 'How many would have booked anyway', 'count', 0),
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
      if (r.ratio !== null) lines.push({ label: 'Worth : cost', value: `${count(r.ratio, 1)} : 1`, tone: r.ratio >= 3 ? 'good' : 'warn' });
      if (r.paybackDays !== null) lines.push({ label: 'Days to pay back', value: count(r.paybackDays, 0) });
      if (r.ratio !== null) summary += ` For every dollar and hour spent finding one, ${count(r.ratio, 1)} come back.`;
    }
    const subs = v(values, 'tool.subscribers');
    if (subs !== null && subs > 0) {
      const lift = subscriberOfferLift({ subscribers: subs, takeRate: v(values, 'tool.takeRate') ?? 0, creditCents: v(values, 'tool.creditCents') ?? 0, wouldBookAnyway: v(values, 'tool.wouldBookAnyway') ?? 0, gpPerBookingCents: per?.grossProfitCents && b.type !== 'inPerson' ? per.grossProfitCents : gpSale });
      lines.push({ label: 'An offer to them would add', value: `${money(lift, { sign: true, whole: true })}`, tone: lift > 0 ? 'good' : 'warn' });
    }
    return { ok: true, lines, summary };
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
    return { ok: true, lines, summary };
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
      f.push(T(`${m}_profit`, `Move ${m}: profit it adds a year`, 'dollars', m === 'A' ? 600_000 : null), T(`${m}_cash`, `Move ${m}: cash it costs`, 'dollars', m === 'A' ? 50_000 : null), T(`${m}_hours`, `Move ${m}: hours it costs`, 'hours', m === 'A' ? 20 : null), T(`${m}_weeks`, `Move ${m}: weeks until money`, 'count', m === 'A' ? 4 : null));
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
    return { ok: true, lines, summary: `${ranked[0]!.name} pays best for what it costs${ranked[0]!.score !== null ? `: about ${count(ranked[0]!.score, 1)} dollars of yearly profit per dollar of cost, after the wait` : ''}.` };
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

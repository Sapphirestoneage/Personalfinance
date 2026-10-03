/* ==========================================================================
   Content business: subscriptions, pay-per-view, customs, digital products.

   Inputs (keys): followers, followerToSubRate, subscribers, churnRate,
   ppvSalesPerMonth, customsPerMonth, digitalSalesPerMonth, hoursPerMonth,
   toolsCostCents.
   Offers: subscription, ppv, custom, digital: each {priceCents, feeRate,
   variableCostCents, allInHours}. feeRate is the platform cut (kept = 1 - fee).

   `subscribers` is this month's paying subscribers, as she knows it. The
   follower-to-subscriber rate drives the growth line (new subscribers per
   month); months retained = 1 / churn (F06).
   ========================================================================== */
import { type Book, reader } from '../reader';
import { grossProfitPerSale, lifetimeGrossProfit } from '../formulas';
import { type Result, incomplete, mergeBasedOn, ok } from '../types';
import { type BusinessMonth, type GpLine, type MonthContext, type OfferBooks, sumLines } from './shared';

export interface ContentMonth extends BusinessMonth {
  newSubscribersPerMonth: number;
  /** subscribers x (1 - churn) + new subscribers */
  subscribersNextMonth: number;
  monthsRetained: number | null;
  ltgpPerSubscriberCents: number | null;
}

export function contentMonth(inputs: Book, offers: OfferBooks, _ctx: MonthContext): Result<ContentMonth> {
  const r = reader(inputs);
  const followers = r.req('followers');
  const followerToSubRate = r.req('followerToSubRate');
  const subscribers = r.req('subscribers');
  const churnRate = r.req('churnRate');
  const ppvSales = r.req('ppvSalesPerMonth');
  const customs = r.req('customsPerMonth');
  const digitalSales = r.req('digitalSalesPerMonth');
  const hoursPerMonth = r.req('hoursPerMonth');
  const toolsCostCents = r.req('toolsCostCents');
  const parts = [r];

  const lines: GpLine[] = [];
  let gpPerSubMonth = 0;
  let hours = hoursPerMonth;
  const line = (type: 'subscription' | 'ppv' | 'custom' | 'digital', label: string, units: number) => {
    const book = offers[type];
    if (!book) return;
    const o = reader(book, type + '.');
    const price = o.req('priceCents');
    const fee = o.req('feeRate');
    const variable = o.req('variableCostCents');
    const allIn = o.req('allInHours');
    parts.push(o);
    const gp = grossProfitPerSale({ priceCents: price, feeRate: fee, variableCostCents: variable });
    if (type === 'subscription') gpPerSubMonth = gp;
    hours += units * allIn;
    lines.push({ key: type, label, units, revenueCents: units * price, grossProfitCents: units * gp });
  };
  line('subscription', 'Subscriptions', subscribers);
  line('ppv', 'Pay-per-view', ppvSales);
  line('custom', 'Customs', customs);
  line('digital', 'Digital products', digitalSales);

  const missing = parts.flatMap((p) => p.missing);
  if (missing.length) return incomplete(missing);

  const newSubscribersPerMonth = followers * followerToSubRate;
  const subscribersNextMonth = subscribers * (1 - churnRate) + newSubscribersPerMonth;
  const monthsRetained = churnRate > 0 ? 1 / churnRate : null;
  const sums = sumLines(lines);
  /* levers move next month's number, so churn and follower-to-subscriber count for something */
  const leverBasisCents = sums.grossProfitCents + (subscribersNextMonth - subscribers) * gpPerSubMonth;
  return ok(
    {
      type: 'content',
      ...sums,
      leverBasisCents,
      fixedCostsCents: toolsCostCents,
      hoursNeeded: hours,
      hoursUsed: hours,
      hoursLimited: false,
      cap: null,
      volumes: { subscribers, newSubscribers: newSubscribersPerMonth, ppvSales, customs, digitalSales, followers },
      lines,
      perUnit: subscribers > 0 ? { unit: 'subscriber', grossProfitCents: gpPerSubMonth, sessions: 0 } : null,
      newSubscribersPerMonth,
      subscribersNextMonth,
      monthsRetained,
      ltgpPerSubscriberCents: monthsRetained === null ? null : lifetimeGrossProfit(gpPerSubMonth, monthsRetained),
    },
    mergeBasedOn(parts.map((p) => p.basedOn())),
  );
}

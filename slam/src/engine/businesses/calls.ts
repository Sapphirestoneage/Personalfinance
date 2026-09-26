/* ==========================================================================
   Calls business: video or voice calls sold by the block.

   Inputs (keys): callsPerMonth (booked calls, rebooks included), noShowRate,
   depositCoversNoShow (1 = paid anyway, 0 = unpaid), rebookRate,
   toolsCostCents.
   Offer: call {priceCents, feeRate, variableCostCents, allInHours, minutes}.

   Paid calls = booked x (1 - no-show x (1 - deposit cover)). Booked calls
   still cost the hours. The rebook rate feeds the reverse solve: new
   callers needed = calls / (1 + rebook).
   ========================================================================== */
import { type Book, reader } from '../reader';
import { grossProfitPerSale } from '../formulas';
import { type Result, incomplete, mergeBasedOn, ok } from '../types';
import { type BusinessMonth, type GpLine, type MonthContext, type OfferBooks, sumLines } from './shared';

export interface CallsMonth extends BusinessMonth {
  paidCalls: number;
  newCallersNeeded: number;
}

export function callsMonth(inputs: Book, offers: OfferBooks, _ctx: MonthContext): Result<CallsMonth> {
  const r = reader(inputs);
  const calls = r.req('callsPerMonth');
  const noShowRate = r.req('noShowRate');
  const depositCovers = r.req('depositCoversNoShow');
  const rebookRate = r.req('rebookRate');
  const toolsCostCents = r.req('toolsCostCents');
  const book = offers.call;
  if (!book) return incomplete([...r.missing, 'call.priceCents']);
  const o = reader(book, 'call.');
  const price = o.req('priceCents');
  const fee = o.req('feeRate');
  const variable = o.req('variableCostCents');
  const allIn = o.req('allInHours');
  const missing = [...r.missing, ...o.missing];
  if (missing.length) return incomplete(missing);

  const paidCalls = calls * (1 - noShowRate * (1 - depositCovers));
  const gp = grossProfitPerSale({ priceCents: price, feeRate: fee, variableCostCents: variable });
  const lines: GpLine[] = [{ key: 'call', label: 'Calls', units: paidCalls, revenueCents: paidCalls * price, grossProfitCents: paidCalls * gp }];
  const hours = calls * allIn;
  const sums = sumLines(lines);
  return ok(
    {
      type: 'calls',
      ...sums,
      fixedCostsCents: toolsCostCents,
      hoursNeeded: hours,
      hoursUsed: hours,
      hoursLimited: false,
      cap: null,
      volumes: { calls, paidCalls },
      lines,
      perUnit: { unit: 'call', grossProfitCents: gp * (1 - noShowRate * (1 - depositCovers)), sessions: 0 },
      paidCalls,
      newCallersNeeded: calls / (1 + rebookRate),
    },
    mergeBasedOn([r.basedOn(), o.basedOn()]),
  );
}

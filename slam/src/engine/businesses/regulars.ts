/* ==========================================================================
   Regulars (the findom tab): recurring regulars plus one-off tributes.

   Inputs (keys): activeRegulars, followers, followerToTributeRate,
   oneOffTributeAvgCents, chargebackRate, hoursPerMonth, toolsCostCents.
   Offer: tribute (the regular): {priceCents = average monthly, feeRate,
   variableCostCents, allInHours, monthsRetained}.

   Chargebacks come off gross before the processor fee. Agreed budgets are
   checked per client in ../budgets.ts, not here.
   ========================================================================== */
import { type Book, reader } from '../reader';
import { grossProfitPerSale, lifetimeGrossProfit } from '../formulas';
import { type Result, incomplete, mergeBasedOn, ok } from '../types';
import { type BusinessMonth, type GpLine, type MonthContext, type OfferBooks, sumLines } from './shared';

export interface RegularsMonth extends BusinessMonth {
  newTributesPerMonth: number;
  ltgpPerRegularCents: number;
}

export function regularsMonth(inputs: Book, offers: OfferBooks, _ctx: MonthContext): Result<RegularsMonth> {
  const r = reader(inputs);
  const activeRegulars = r.req('activeRegulars');
  const followers = r.req('followers');
  const followerToTributeRate = r.req('followerToTributeRate');
  const oneOffAvg = r.req('oneOffTributeAvgCents');
  const chargebackRate = r.req('chargebackRate');
  const hoursPerMonth = r.req('hoursPerMonth');
  const toolsCostCents = r.req('toolsCostCents');
  const book = offers.tribute;
  if (!book) return incomplete([...r.missing, 'tribute.priceCents']);
  const o = reader(book, 'tribute.');
  const price = o.req('priceCents');
  const fee = o.req('feeRate');
  const variable = o.req('variableCostCents');
  const allIn = o.req('allInHours');
  const months = o.req('monthsRetained');
  const missing = [...r.missing, ...o.missing];
  if (missing.length) return incomplete(missing);

  const keep = 1 - chargebackRate;
  const gpRegular = grossProfitPerSale({ priceCents: price * keep, feeRate: fee, variableCostCents: variable });
  const newTributes = followers * followerToTributeRate;
  const gpOneOff = grossProfitPerSale({ priceCents: oneOffAvg * keep, feeRate: fee, variableCostCents: 0 });
  const lines: GpLine[] = [
    { key: 'regulars', label: 'Regulars', units: activeRegulars, revenueCents: activeRegulars * price, grossProfitCents: activeRegulars * gpRegular },
    { key: 'oneOff', label: 'New tributes', units: newTributes, revenueCents: newTributes * oneOffAvg, grossProfitCents: newTributes * gpOneOff },
  ];
  const hours = hoursPerMonth + activeRegulars * allIn;
  const sums = sumLines(lines);
  return ok(
    {
      type: 'regulars',
      ...sums,
      fixedCostsCents: toolsCostCents,
      hoursNeeded: hours,
      hoursUsed: hours,
      hoursLimited: false,
      cap: null,
      volumes: { activeRegulars, newTributes, followers },
      lines,
      perUnit: { unit: 'regular', grossProfitCents: gpRegular, sessions: 0 },
      newTributesPerMonth: newTributes,
      ltgpPerRegularCents: lifetimeGrossProfit(gpRegular, months),
    },
    mergeBasedOn([r.basedOn(), o.basedOn()]),
  );
}

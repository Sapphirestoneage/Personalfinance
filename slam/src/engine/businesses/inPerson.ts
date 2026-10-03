/* ==========================================================================
   In-person business: the funnel (F01), the offer mix, sessions (F03),
   the capacity cap (F04), gross profit (F02).

   Offer model (pinned by G1, G7, G8; see CLAUDE.md and docs/OPEN-QUESTIONS.md):
   - single main offer: every new client has one single session; clients who
     do not take the retainer rebook at the rebook rate; retainer clients
     (take rate x new clients) get sessions per month x months kept and do
     not rebook as singles; the add-on is bought by take rate x new clients,
     carries the fee, has no delivery cost.
   - arc main offer (a consult offer): clients = funnel x close, sessions =
     clients x sessions included, no rebook, add-on or retainer.
   - when capacity binds, every volume scales by cap / demand.

   Business inputs (keys): inquiriesPerMonth, passRate, bookingRate,
   showRate, rebookRate, capacitySessions, spaceCostCents.
   Offers: single {priceCents, feeRate, variableCostCents, allInHours},
   addon {priceCents, feeRate, variableCostCents, allInHours, takeRate},
   retainer {priceCents, feeRate, variableCostCents, allInHours,
   sessionsPerMonth, takeRate, monthsRetained},
   arc {priceCents, feeRate, variableCostCents, allInHours,
   sessionsIncluded, weeks, closeRate}.
   ========================================================================== */
import { type Book, reader } from '../reader';
import { capacityCap, clientsFromFunnel, grossProfitPerSale, sessionsFromClients } from '../formulas';
import { type Result, incomplete, mergeBasedOn, ok } from '../types';
import { type BusinessMonth, type GpLine, type MonthContext, type OfferBooks, scaleMonth, sumLines } from './shared';

export interface InPersonMonth extends BusinessMonth {
  mainOffer: 'single' | 'arc';
  newClients: number;
  retainerClients: number;
  singleSessions: number;
  continuitySessions: number;
  demandSessions: number;
  sessions: number;
}

export function inPersonMonth(inputs: Book, offers: OfferBooks, ctx: MonthContext): Result<InPersonMonth> {
  const r = reader(inputs);
  const inquiries = r.req('inquiriesPerMonth');
  const passRate = r.req('passRate');
  const bookingRate = r.req('bookingRate');
  const showRate = r.req('showRate');
  const capacitySessions = r.has('capacitySessions') && inputs.capacitySessions?.value !== null ? r.req('capacitySessions') : null;
  const spaceCostCents = r.req('spaceCostCents');

  const arc = offers.arc;
  if (arc) {
    const a = reader(arc, 'arc.');
    const price = a.req('priceCents');
    const fee = a.req('feeRate');
    const variable = a.req('variableCostCents');
    const allIn = a.req('allInHours');
    const included = a.req('sessionsIncluded');
    const close = a.req('closeRate');
    const missing = [...r.missing, ...a.missing];
    if (missing.length) return incomplete(missing);

    const newClients = clientsFromFunnel({ inquiries, passRate, bookingRate, showRate, closeRate: close });
    const demandSessions = newClients * included;
    const cap = capacityCap({
      demandSessions,
      capacitySessions,
      sellableHours: ctx.sellableHours,
      allInHoursPerSession: included > 0 ? allIn / included : null,
    });
    const gpEach = grossProfitPerSale({ priceCents: price, feeRate: fee, variableCostCents: variable });
    const lines: GpLine[] = [
      { key: 'arc', label: 'Program', units: newClients, revenueCents: newClients * price, grossProfitCents: newClients * gpEach },
    ];
    const base: InPersonMonth = {
      type: 'inPerson',
      mainOffer: 'arc',
      ...sumLines(lines),
      fixedCostsCents: spaceCostCents,
      hoursNeeded: newClients * allIn,
      hoursUsed: newClients * allIn,
      hoursLimited: cap.cappedBy === 'hours',
      cap,
      volumes: { newClients, sessions: demandSessions },
      lines,
      perUnit: inquiries > 0 ? { unit: 'inquiry', grossProfitCents: (newClients * gpEach) / inquiries, sessions: demandSessions / inquiries } : null,
      newClients,
      retainerClients: 0,
      singleSessions: 0,
      continuitySessions: 0,
      demandSessions,
      sessions: cap.sessions,
    };
    const scaledMonth = scaleMonth(base, cap.factor) as InPersonMonth;
    return ok(
      {
        ...scaledMonth,
        newClients: newClients * cap.factor,
        sessions: cap.sessions,
        demandSessions,
      },
      mergeBasedOn([r.basedOn(), a.basedOn()]),
    );
  }

  const single = offers.single;
  if (!single) return incomplete(['single.priceCents']);
  const s = reader(single, 'single.');
  const singlePrice = s.req('priceCents');
  const singleFee = s.req('feeRate');
  const singleVariable = s.req('variableCostCents');
  const singleAllIn = s.req('allInHours');
  const rebookRate = r.req('rebookRate');

  const parts = [r, s];
  let retainerTake = 0;
  let retainerPrice = 0;
  let retainerFee = 0;
  let retainerVariable = 0;
  let retainerAllIn = 0;
  let retainerSessionsPerMonth = 0;
  let retainerMonths = 0;
  const retainer = offers.retainer;
  let rr: ReturnType<typeof reader> | null = null;
  if (retainer) {
    rr = reader(retainer, 'retainer.');
    retainerTake = rr.req('takeRate');
    retainerPrice = rr.req('priceCents');
    retainerFee = rr.req('feeRate');
    retainerVariable = rr.req('variableCostCents');
    retainerAllIn = rr.req('allInHours');
    retainerSessionsPerMonth = rr.req('sessionsPerMonth');
    retainerMonths = rr.req('monthsRetained');
    parts.push(rr);
  }
  let addonTake = 0;
  let addonPrice = 0;
  let addonFee = 0;
  let addonVariable = 0;
  let addonAllIn = 0;
  const addon = offers.addon;
  let ar: ReturnType<typeof reader> | null = null;
  if (addon) {
    ar = reader(addon, 'addon.');
    addonTake = ar.req('takeRate');
    addonPrice = ar.req('priceCents');
    addonFee = ar.req('feeRate');
    addonVariable = ar.req('variableCostCents');
    addonAllIn = ar.req('allInHours');
    parts.push(ar);
  }
  const missing = parts.flatMap((p) => p.missing);
  if (missing.length) return incomplete(missing);

  /* F01 */
  const newClients = clientsFromFunnel({ inquiries, passRate, bookingRate, showRate });
  const retainerClients = newClients * retainerTake;
  /* F03: singles rebook; retainer clients have their first single then continuity */
  const singleSessions = sessionsFromClients(newClients - retainerClients, rebookRate) + retainerClients;
  const continuitySessions = retainerClients * retainerSessionsPerMonth * retainerMonths;
  const demandSessions = singleSessions + continuitySessions;
  const addonUnits = newClients * addonTake;

  /* F04 */
  const cap = capacityCap({
    demandSessions,
    capacitySessions,
    sellableHours: ctx.sellableHours,
    allInHoursPerSession: singleAllIn,
  });

  /* F02 on each line */
  const gpSingle = grossProfitPerSale({ priceCents: singlePrice, feeRate: singleFee, variableCostCents: singleVariable });
  const lines: GpLine[] = [
    { key: 'single', label: 'Sessions', units: singleSessions, revenueCents: singleSessions * singlePrice, grossProfitCents: singleSessions * gpSingle },
  ];
  if (addon) {
    const gpAddon = grossProfitPerSale({ priceCents: addonPrice, feeRate: addonFee, variableCostCents: addonVariable });
    lines.push({ key: 'addon', label: 'Add-on', units: addonUnits, revenueCents: addonUnits * addonPrice, grossProfitCents: addonUnits * gpAddon });
  }
  if (retainer) {
    const retainerMonthsSold = retainerClients * retainerMonths;
    const gpRetainerMonth = grossProfitPerSale({
      priceCents: retainerPrice,
      feeRate: retainerFee,
      variableCostCents: retainerSessionsPerMonth * retainerVariable,
    });
    lines.push({
      key: 'retainer',
      label: 'Retainer months',
      units: retainerMonthsSold,
      revenueCents: retainerMonthsSold * retainerPrice,
      grossProfitCents: retainerMonthsSold * gpRetainerMonth,
    });
  }
  const sums = sumLines(lines);
  const hoursNeeded = singleSessions * singleAllIn + continuitySessions * retainerAllIn + addonUnits * addonAllIn;

  const base: InPersonMonth = {
    type: 'inPerson',
    mainOffer: 'single',
    ...sums,
    fixedCostsCents: spaceCostCents,
    hoursNeeded,
    hoursUsed: hoursNeeded,
    hoursLimited: cap.cappedBy === 'hours',
    cap,
    volumes: { newClients, retainerClients, singleSessions, continuitySessions, sessions: demandSessions, addons: addonUnits },
    lines,
    perUnit: inquiries > 0 ? { unit: 'inquiry', grossProfitCents: sums.grossProfitCents / inquiries, sessions: demandSessions / inquiries } : null,
    newClients,
    retainerClients,
    singleSessions,
    continuitySessions,
    demandSessions,
    sessions: cap.sessions,
  };
  const scaledMonth = scaleMonth(base, cap.factor) as InPersonMonth;
  return ok(
    {
      ...scaledMonth,
      newClients: newClients * cap.factor,
      retainerClients: retainerClients * cap.factor,
      singleSessions: singleSessions * cap.factor,
      continuitySessions: continuitySessions * cap.factor,
      demandSessions,
      sessions: cap.sessions,
    },
    mergeBasedOn(parts.map((p) => p.basedOn())),
  );
}

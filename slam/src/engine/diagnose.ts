/* ==========================================================================
   Quick diagnosis: where the money leaks. For each sales step below its
   benchmark, the gain from reaching the benchmark is computed with the
   real model; the biggest gain is the bottleneck. Screening is never a
   candidate (it is not a sales step). If nothing is below benchmark, the
   bottleneck is capacity when the cap binds, otherwise contacts.
   ========================================================================== */
import type { BusinessType } from '@/data/schemas';
import { computeBusinessMonth, type OfferBooks } from './businesses';
import type { BusinessModel } from './model';
import { type Book, withValues } from './reader';

export type BottleneckKind = 'contacts' | 'bookings' | 'show' | 'rebook' | 'price' | 'capacity' | 'churn' | 'noshow' | 'chargebacks' | 'audience';

export interface Diagnosis {
  kind: BottleneckKind;
  /** the field that moves it, "inputs.bookingRate" or "single.priceCents" */
  key: string | null;
  current: number | null;
  benchmark: number | null;
  gainCents: number;
  headline: string;
  next: string;
  /** every candidate, biggest gain first, for the "why" */
  candidates: Array<{ kind: BottleneckKind; key: string; gainCents: number; current: number; benchmark: number }>;
}

type Candidate = { kind: BottleneckKind; where: 'inputs' | keyof OfferBooks; key: string; direction: 'up' | 'down' };

const CANDIDATES: Record<BusinessType, Candidate[]> = {
  inPerson: [
    { kind: 'bookings', where: 'inputs', key: 'bookingRate', direction: 'up' },
    { kind: 'show', where: 'inputs', key: 'showRate', direction: 'up' },
    { kind: 'rebook', where: 'inputs', key: 'rebookRate', direction: 'up' },
    { kind: 'price', where: 'single', key: 'priceCents', direction: 'up' },
    { kind: 'price', where: 'arc', key: 'priceCents', direction: 'up' },
  ],
  content: [
    { kind: 'churn', where: 'inputs', key: 'churnRate', direction: 'down' },
    { kind: 'price', where: 'subscription', key: 'priceCents', direction: 'up' },
    { kind: 'audience', where: 'inputs', key: 'followerToSubRate', direction: 'up' },
  ],
  calls: [
    { kind: 'noshow', where: 'inputs', key: 'noShowRate', direction: 'down' },
    { kind: 'price', where: 'call', key: 'priceCents', direction: 'up' },
    { kind: 'rebook', where: 'inputs', key: 'rebookRate', direction: 'up' },
  ],
  regulars: [
    { kind: 'chargebacks', where: 'inputs', key: 'chargebackRate', direction: 'down' },
    { kind: 'price', where: 'tribute', key: 'priceCents', direction: 'up' },
    { kind: 'audience', where: 'inputs', key: 'followerToTributeRate', direction: 'up' },
  ],
};

const HEADLINES: Record<BottleneckKind, [string, string]> = {
  contacts: ['Not enough people are contacting you.', 'Work on being seen and on conversations; the plan tool says how many contacts the goal needs.'],
  bookings: ['People who pass screening are not booking.', 'Look at the reply that goes out after screening: deposit, dates offered, clarity of the offer.'],
  show: ['Too many bookings do not turn up.', 'A deposit and a confirmation the day before are the usual fixes.'],
  rebook: ['New clients are not coming back.', 'Aftercare, a next-date offer at the end, and a retainer for the right people.'],
  price: ['Your price is below what the offer is worth.', 'Build the value stack in the offer tool and test a higher price on new inquiries first.'],
  capacity: ['You are at capacity: more contacts would not become more money.', 'Raise price, add a retainer or a program, or free up hours.'],
  churn: ['Subscribers are leaving faster than they should.', 'A posting rhythm and a reason to stay each month.'],
  noshow: ['No-shows are eating the calendar.', 'Take a deposit that covers the block.'],
  chargebacks: ['Chargebacks are taking too much.', 'Agreed budgets and a check-in when someone goes past theirs.'],
  audience: ['Followers are not turning into paying people.', 'A clear ask, a clear link, and one offer at a time.'],
};

export function diagnose(b: BusinessModel, benchmarks: { inputs: Book; offers: OfferBooks }, sellableHours: number | null): Diagnosis | null {
  const ctx = { sellableHours };
  const base = computeBusinessMonth(b.type, b.inputs, b.offers, ctx);
  if (!base.ok) return null;
  const candidates: Diagnosis['candidates'] = [];
  for (const c of CANDIDATES[b.type]) {
    const book = c.where === 'inputs' ? b.inputs : b.offers[c.where];
    const bench = c.where === 'inputs' ? benchmarks.inputs : benchmarks.offers[c.where];
    if (!book || !bench) continue;
    const current = book[c.key]?.value;
    const benchmark = bench[c.key]?.value;
    if (current === null || current === undefined || benchmark === null || benchmark === undefined) continue;
    const below = c.direction === 'up' ? current < benchmark : current > benchmark;
    if (!below) continue;
    const moved = withValues(book, { [c.key]: benchmark });
    const after =
      c.where === 'inputs'
        ? computeBusinessMonth(b.type, moved, b.offers, ctx)
        : computeBusinessMonth(b.type, b.inputs, { ...b.offers, [c.where]: moved }, ctx);
    if (!after.ok) continue;
    const gainCents = after.value.grossProfitCents - base.value.grossProfitCents;
    if (gainCents > 0) candidates.push({ kind: c.kind, key: `${c.where}.${c.key}`, gainCents, current, benchmark });
  }
  candidates.sort((x, y) => y.gainCents - x.gainCents);
  const capped = base.value.cap && base.value.cap.cappedBy !== 'none';
  let kind: BottleneckKind;
  let key: string | null = null;
  let current: number | null = null;
  let benchmark: number | null = null;
  let gainCents = 0;
  if (capped) {
    kind = 'capacity';
  } else if (candidates.length) {
    const top = candidates[0]!;
    kind = top.kind;
    key = top.key;
    current = top.current;
    benchmark = top.benchmark;
    gainCents = top.gainCents;
  } else {
    kind = b.type === 'inPerson' || b.type === 'calls' ? 'contacts' : 'audience';
  }
  const [headline, next] = HEADLINES[kind];
  return { kind, key, current, benchmark, gainCents, headline, next, candidates };
}

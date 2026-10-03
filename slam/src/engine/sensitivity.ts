/* ==========================================================================
   F12: profit change from +1 point on each rate, +1% price, +1% inquiries
   (or audience), -1% cost. Runs the business model with one input moved
   and reports the difference. Fixed costs cancel, so the delta on gross
   profit is the delta on profit.
   ========================================================================== */
import type { OfferType } from '@/data/schemas';
import { computeBusinessMonth, type OfferBooks } from './businesses';
import type { BusinessModel } from './model';
import { type Book, withValues } from './reader';

export interface SensitivityRow {
  /** "inputs.bookingRate" or "single.priceCents" */
  key: string;
  label: string;
  move: string;
  deltaCents: number;
}

/** what the delta is measured on, for the caption */
export function leverBasisWord(type: BusinessModel['type']): string {
  return type === 'content' ? "next month's gross profit" : 'gross profit a month';
}

type Target = { where: 'inputs' | OfferType; key: string; label: string; kind: 'point' | 'percent'; amount: number };

const RATE = (where: Target['where'], key: string, label: string): Target => ({ where, key, label, kind: 'point', amount: 0.01 });
const PCT = (where: Target['where'], key: string, label: string, amount: number): Target => ({ where, key, label, kind: 'percent', amount });

const TARGETS: Record<BusinessModel['type'], Target[]> = {
  inPerson: [
    RATE('inputs', 'passRate', 'Screening pass rate'),
    RATE('inputs', 'bookingRate', 'Booking rate'),
    RATE('inputs', 'showRate', 'Show rate'),
    RATE('inputs', 'rebookRate', 'Rebook rate'),
    RATE('arc', 'closeRate', 'Close rate'),
    RATE('addon', 'takeRate', 'Add-on take rate'),
    RATE('retainer', 'takeRate', 'Retainer take rate'),
    PCT('single', 'priceCents', 'Session price', 0.01),
    PCT('arc', 'priceCents', 'Program price', 0.01),
    PCT('inputs', 'inquiriesPerMonth', 'Inquiries', 0.01),
    PCT('single', 'variableCostCents', 'Delivery cost', -0.01),
    PCT('arc', 'variableCostCents', 'Program delivery cost', -0.01),
  ],
  content: [
    RATE('inputs', 'followerToSubRate', 'Follower to subscriber rate'),
    RATE('inputs', 'churnRate', 'Churn'),
    PCT('subscription', 'priceCents', 'Subscription price', 0.01),
    PCT('custom', 'priceCents', 'Custom price', 0.01),
    PCT('inputs', 'subscribers', 'Subscribers', 0.01),
    PCT('inputs', 'followers', 'Followers', 0.01),
    PCT('custom', 'variableCostCents', 'Custom cost', -0.01),
  ],
  calls: [
    RATE('inputs', 'noShowRate', 'No-show rate'),
    RATE('inputs', 'rebookRate', 'Rebook rate'),
    PCT('call', 'priceCents', 'Call price', 0.01),
    PCT('inputs', 'callsPerMonth', 'Calls', 0.01),
    PCT('call', 'variableCostCents', 'Call cost', -0.01),
  ],
  regulars: [
    RATE('inputs', 'followerToTributeRate', 'Follower to tribute rate'),
    RATE('inputs', 'chargebackRate', 'Chargebacks'),
    PCT('tribute', 'priceCents', 'Average monthly', 0.01),
    PCT('inputs', 'activeRegulars', 'Regulars', 0.01),
    PCT('inputs', 'followers', 'Followers', 0.01),
  ],
};

function moved(book: Book, key: string, t: Target): Book | null {
  const v = book[key]?.value;
  if (v === null || v === undefined) return null;
  const next = t.kind === 'point' ? v + t.amount : v * (1 + t.amount);
  return withValues(book, { [key]: next });
}

export function sensitivity(b: BusinessModel, sellableHours: number | null): SensitivityRow[] {
  const ctx = { sellableHours };
  const base = computeBusinessMonth(b.type, b.inputs, b.offers, ctx);
  if (!base.ok) return [];
  const rows: SensitivityRow[] = [];
  for (const t of TARGETS[b.type]) {
    let inputs = b.inputs;
    let offers: OfferBooks = b.offers;
    if (t.where === 'inputs') {
      const m = moved(b.inputs, t.key, t);
      if (!m) continue;
      inputs = m;
    } else {
      const book = b.offers[t.where];
      if (!book) continue;
      const m = moved(book, t.key, t);
      if (!m) continue;
      offers = { ...b.offers, [t.where]: m };
    }
    const after = computeBusinessMonth(b.type, inputs, offers, ctx);
    if (!after.ok) continue;
    const move = t.kind === 'point' ? '+1 point' : `${t.amount > 0 ? '+' : '-'}1%`;
    const basis = (m: typeof base.value) => m.leverBasisCents ?? m.grossProfitCents;
    rows.push({ key: `${t.where}.${t.key}`, label: t.label, move, deltaCents: basis(after.value) - basis(base.value) });
  }
  return rows.sort((x, y) => Math.abs(y.deltaCents) - Math.abs(x.deltaCents));
}

/* ==========================================================================
   "The math", spelled out: one line per formula with her numbers in it.
   Shown in Pro mode so the tool is never a black box. Pure.
   ========================================================================== */
import type { BusinessMonth, InPersonMonth } from './businesses';
import type { BusinessModel } from './model';

export interface MathLine {
  formula: string;
  text: string;
}

const pct = (r: number | null | undefined) => (r === null || r === undefined ? '?' : `${Math.round(r * 1000) / 10}%`);
const usd = (c: number | null | undefined) => (c === null || c === undefined ? '?' : `$${(Math.round(c) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const n = (x: number | null | undefined, d = 2) => (x === null || x === undefined ? '?' : `${Math.round(x * 10 ** d) / 10 ** d}`);

export function explainMonth(b: BusinessModel, m: BusinessMonth): MathLine[] {
  const i = (k: string) => b.inputs[k]?.value ?? null;
  const o = (t: keyof BusinessModel['offers'], k: string) => b.offers[t]?.[k]?.value ?? null;
  const lines: MathLine[] = [];
  if (b.type === 'inPerson') {
    const ip = m as InPersonMonth;
    if (ip.mainOffer === 'arc') {
      lines.push({ formula: 'F01', text: `Clients = contacts × pass × booking × show × close = ${n(i('inquiriesPerMonth'), 0)} × ${pct(i('passRate'))} × ${pct(i('bookingRate'))} × ${pct(i('showRate'))} × ${pct(o('arc', 'closeRate'))} = ${n(ip.newClients)}` });
      lines.push({ formula: 'F02', text: `Gross profit per program = price × (1 − fee) − delivery = ${usd(o('arc', 'priceCents'))} × (1 − ${pct(o('arc', 'feeRate'))}) − ${usd(o('arc', 'variableCostCents'))} = ${usd((o('arc', 'priceCents') ?? 0) * (1 - (o('arc', 'feeRate') ?? 0)) - (o('arc', 'variableCostCents') ?? 0))}` });
      lines.push({ formula: 'F03', text: `Sessions = clients × sessions included = ${n(ip.newClients)} × ${n(o('arc', 'sessionsIncluded'), 0)} = ${n(ip.demandSessions)}` });
    } else {
      lines.push({ formula: 'F01', text: `New clients = contacts × pass × booking × show = ${n(i('inquiriesPerMonth'), 0)} × ${pct(i('passRate'))} × ${pct(i('bookingRate'))} × ${pct(i('showRate'))} = ${n(ip.newClients / (ip.cap?.factor || 1))}` });
      const gp = (o('single', 'priceCents') ?? 0) * (1 - (o('single', 'feeRate') ?? 0)) - (o('single', 'variableCostCents') ?? 0);
      lines.push({ formula: 'F02', text: `Gross profit per session = price × (1 − fee) − delivery = ${usd(o('single', 'priceCents'))} × (1 − ${pct(o('single', 'feeRate'))}) − ${usd(o('single', 'variableCostCents'))} = ${usd(gp)}` });
      const retainerTake = o('retainer', 'takeRate');
      if (retainerTake !== null) {
        lines.push({ formula: 'F03', text: `Sessions = first sessions + rebooks of non-retainer clients + retainer sessions = ${n(ip.demandSessions)} (rebook ${pct(i('rebookRate'))}; retainer ${pct(retainerTake)} of clients × ${n(o('retainer', 'sessionsPerMonth'), 0)} a month × ${n(o('retainer', 'monthsRetained'), 0)} months)` });
      } else {
        lines.push({ formula: 'F03', text: `Sessions = new clients × (1 + rebook) = ${n(ip.newClients / (ip.cap?.factor || 1))} × (1 + ${pct(i('rebookRate'))}) = ${n(ip.demandSessions)}` });
      }
    }
    if (ip.cap && ip.cap.capacity !== null) {
      lines.push({ formula: 'F04', text: `Capacity: sessions = min(demand ${n(ip.demandSessions)}, capacity ${n(ip.cap.capacity, 1)}) = ${n(ip.sessions)}${ip.cap.cappedBy !== 'none' ? ` (capped by ${ip.cap.cappedBy === 'hours' ? 'your hours' : 'your session cap'}; everything scales by ${n(ip.cap.factor, 3)})` : ''}` });
    }
  } else if (b.type === 'content') {
    lines.push({ formula: 'F02', text: `Per subscriber a month = price × (1 − cut) = ${usd(o('subscription', 'priceCents'))} × (1 − ${pct(o('subscription', 'feeRate'))}) = ${usd((o('subscription', 'priceCents') ?? 0) * (1 - (o('subscription', 'feeRate') ?? 0)))}` });
    lines.push({ formula: 'F06', text: `Months a subscriber stays = 1 / churn = 1 / ${pct(i('churnRate'))} = ${n(i('churnRate') ? 1 / (i('churnRate') as number) : null, 1)}` });
    lines.push({ formula: 'F01', text: `New subscribers a month = followers × follower-to-subscriber rate = ${n(i('followers'), 0)} × ${pct(i('followerToSubRate'))} = ${n((i('followers') ?? 0) * (i('followerToSubRate') ?? 0), 1)}` });
  } else if (b.type === 'calls') {
    lines.push({ formula: 'F02', text: `Per paid call = price × (1 − cut) − cost = ${usd(o('call', 'priceCents'))} × (1 − ${pct(o('call', 'feeRate'))}) − ${usd(o('call', 'variableCostCents'))}` });
    lines.push({ formula: 'F03', text: `Paid calls = booked × (1 − no-shows that go unpaid) = ${n(i('callsPerMonth'), 0)} × (1 − ${pct(i('noShowRate'))} × (1 − ${n(i('depositCoversNoShow'), 0)})) = ${n(m.volumes.paidCalls, 1)}` });
  } else {
    lines.push({ formula: 'F02', text: `Per regular a month = average × (1 − chargebacks) × (1 − fee) = ${usd(o('tribute', 'priceCents'))} × (1 − ${pct(i('chargebackRate'))}) × (1 − ${pct(o('tribute', 'feeRate'))})` });
    lines.push({ formula: 'F01', text: `New tributes a month = followers × follower-to-tribute rate = ${n(i('followers'), 0)} × ${pct(i('followerToTributeRate'))} = ${n(m.volumes.newTributes, 1)}` });
    lines.push({ formula: 'F06', text: `A regular over their stay = monthly × months kept = ${n(o('tribute', 'monthsRetained'), 0)} months` });
  }
  lines.push({ formula: 'Sum', text: `Gross profit a month = ${m.lines.map((l) => `${l.label} ${usd(l.grossProfitCents)}`).join(' + ')} = ${usd(m.grossProfitCents)}` });
  lines.push({ formula: 'Hours', text: `Hours a month = ${n(m.hoursUsed, 1)}${m.hoursLimited ? ' (limited by the hours left after higher-priority businesses)' : ''}` });
  return lines;
}

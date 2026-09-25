/* ==========================================================================
   The snapshot she can send to Sapphire: her settings, businesses, offers,
   week logs and milestones, plus this month's numbers as the engine sees
   them today. Never client records or sales. Plain JSON, neutral name.
   ========================================================================== */
import { aggregateMonth } from '@/engine/aggregate';
import { sensitivity } from '@/engine/sensitivity';
import { LABEL_WORDS } from './assumptions';
import { compareScenarios, defaultScenarios } from '@/engine/scenarios';
import { profileToModel } from './model';
import type { Business, Milestone, Offer, Profile, WeekLog } from './schemas';

export const SNAPSHOT_FORMAT = 'slam-snapshot';

export interface Snapshot {
  format: typeof SNAPSHOT_FORMAT;
  version: 1;
  createdAt: string;
  note: string;
  profile: Profile;
  businesses: Business[];
  offers: Offer[];
  weekLogs: WeekLog[];
  milestones: Milestone[];
  /** computed today, for reading only; the engine recomputes from the rows */
  thisMonth: unknown;
  scenarios: unknown;
}

export function buildSnapshot(profile: Profile, businesses: Business[], offers: Offer[], weekLogs: WeekLog[], milestones: Milestone[], now: Date = new Date()): Snapshot {
  const model = profileToModel(profile, businesses, offers);
  return {
    format: SNAPSHOT_FORMAT,
    version: 1,
    createdAt: now.toISOString(),
    note: 'Numbers only. No client records are included.',
    profile,
    businesses,
    offers,
    weekLogs,
    milestones,
    thisMonth: aggregateMonth(model),
    scenarios: compareScenarios(model, defaultScenarios()),
  };
}

const usd = (c: number) => `$${(Math.round(c) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

/** The same snapshot as words a person can read on a phone. Never client records. */
export function snapshotMarkdown(profile: Profile, businesses: Business[], offers: Offer[], weekLogs: WeekLog[], now: Date = new Date()): string {
  const model = profileToModel(profile, businesses, offers);
  const totals = aggregateMonth(model);
  const futures = compareScenarios(model, defaultScenarios());
  const lines: string[] = [];
  lines.push(`# Numbers snapshot, ${now.toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('Numbers only; no client records. Every figure says whether it is hers or an estimate.');
  lines.push('');
  lines.push('## This month');
  if (totals.ok) {
    const t = totals.value;
    lines.push(`- Profit: ${usd(t.profitCents)} (gross profit ${usd(t.grossProfitCents)}, fixed costs ${usd(t.fixedCostsCents)})`);
    lines.push(`- Hours used: ${Math.round(t.hoursUsed)}${t.sellableHours !== null ? ` of ${Math.round(t.sellableHours)}` : ''}`);
    lines.push(`- Basis: ${totals.basedOn.allYours ? 'all her own numbers' : `weakest input is ${LABEL_WORDS[totals.basedOn.weakest]}`}`);
  } else {
    lines.push(`- Not computable yet; missing: ${totals.missing.join(', ')}`);
  }
  lines.push('');
  lines.push('## Three futures (profit a month)');
  for (const k of ['Disaster', 'Normal', 'Dream'] as const) {
    const r = futures[k];
    lines.push(`- ${k}: ${r.ok ? usd(r.value.totals.profitCents) : 'not yet'}${k === 'Disaster' && r.ok && r.value.runway?.months !== null && r.value.runway ? ` (runway ${r.value.runway.months.toFixed(1)} months)` : ''}`);
  }
  lines.push('');
  const active = model.businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority);
  for (const b of active) {
    lines.push(`## #${b.priority} ${b.name}`);
    const share = totals.ok ? totals.value.businesses.find((x) => x.id === b.id) : null;
    if (share) lines.push(`- Gross profit ${usd(share.month.grossProfitCents)} (${Math.round(share.shareOfGp * 100)}% of the total), ${Math.round(share.month.hoursUsed)} hours${share.month.cap && share.month.cap.cappedBy !== 'none' ? ', at capacity' : ''}`);
    for (const [key, a] of Object.entries(b.inputs)) {
      const v = a.value === null ? 'not entered' : key.endsWith('Cents') ? usd(a.value) : key.endsWith('Rate') ? pct(a.value) : String(Math.round(a.value * 100) / 100);
      lines.push(`- ${key}: ${v} (${a.label === 'Yours' ? 'hers' : LABEL_WORDS[a.label]})`);
    }
    const levers = sensitivity(b, null).slice(0, 3);
    if (levers.length) lines.push(`- Biggest levers: ${levers.map((l) => `${l.label} ${l.move} = ${l.deltaCents >= 0 ? '+' : ''}${usd(l.deltaCents)}`).join('; ')}`);
    lines.push('');
  }
  const saved = weekLogs.filter((w) => w.checkedIn).slice(0, 8);
  if (saved.length) {
    lines.push('## Recent check-ins');
    lines.push('| Week | Contacts | Bookings | Held | Reach | Energy |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const w of saved) lines.push(`| ${w.weekStart} | ${w.inquiries ?? ''} | ${w.bookings ?? ''} | ${w.sessionsHeld ?? ''} | ${w.reachActions ?? ''} | ${w.energy ?? ''} |`);
    lines.push('');
  }
  lines.push(`Pathway: ${profile.pathway.completedSteps.length} steps done. Check-ins saved: ${profile.checkInCount}.`);
  return lines.join('\n');
}

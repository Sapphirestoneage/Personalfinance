/* ==========================================================================
   The reality loop: what her own records say, next to what the model
   assumes. Pure functions over client records and week logs.
   ========================================================================== */
import type { ClientRecord, Milestone, Profile, WeekLog } from '@/data/schemas';
import type { BusinessModel } from './model';

/* ---------- rates from the client log ------------------------------------- */

export interface LogFunnel {
  contacts: number;
  passed: number;
  booked: number;
  showed: number;
  passRate: number | null;
  bookingRate: number | null;
  showRate: number | null;
  /** contacts a month over the window */
  contactsPerMonth: number | null;
  /** days the records span, at least 30 */
  windowDays: number;
  enough: boolean;
}

const PAST_SCREENING = new Set<ClientRecord['stage']>(['booked', 'showed', 'client', 'regular']);
const SHOWED = new Set<ClientRecord['stage']>(['showed', 'client', 'regular']);

export const LOG_MIN_CONTACTS = 10;

/** Rates from records whose first contact falls inside the window (default: last 90 days). */
export function funnelFromLog(clients: ClientRecord[], businessId: string | null, today: Date = new Date(), windowDays = 90): LogFunnel {
  const since = new Date(today.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const rows = clients.filter((c) => (businessId === null || c.businessId === businessId || !c.businessId) && (c.keyDates.firstContact ?? c.createdAt.slice(0, 10)) >= since);
  const contacts = rows.length;
  const passed = rows.filter((c) => c.screeningResult === 'pass' || PAST_SCREENING.has(c.stage)).length;
  const booked = rows.filter((c) => PAST_SCREENING.has(c.stage) || !!c.keyDates.firstBooking).length;
  const showed = rows.filter((c) => SHOWED.has(c.stage) || !!c.keyDates.lastSession).length;
  const enough = contacts >= LOG_MIN_CONTACTS;
  return {
    contacts,
    passed,
    booked,
    showed,
    passRate: contacts > 0 ? passed / contacts : null,
    bookingRate: passed > 0 ? booked / passed : null,
    showRate: booked > 0 ? showed / booked : null,
    contactsPerMonth: contacts > 0 ? contacts / (windowDays / 30.4) : null,
    windowDays,
    enough,
  };
}

/* ---------- check-ins against the model ------------------------------------ */

export interface CheckInsVsModel {
  weeks: number;
  contactsPerMonth: number | null;
  bookingsPerMonth: number | null;
  sessionsPerMonth: number | null;
  reachPerWeek: number | null;
  modelContactsPerMonth: number | null;
  /** (logged - model) / model */
  contactsGap: number | null;
}

const WEEKS_PER_MONTH = 52 / 12;

/** The last `n` saved check-ins, scaled to a month, next to the #1 business's contacts. */
export function checkInsVsModel(weekLogs: WeekLog[], first: BusinessModel | null, n = 4): CheckInsVsModel {
  const logs = weekLogs.filter((w) => w.checkedIn && !w.businessId).slice(0, n);
  const avg = (pick: (w: WeekLog) => number | null) => {
    const xs = logs.map(pick).filter((x): x is number => x !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const contactsWeek = avg((w) => w.inquiries);
  const modelKey = first?.type === 'inPerson' ? 'inquiriesPerMonth' : first?.type === 'calls' ? 'callsPerMonth' : null;
  const model = first && modelKey ? (first.inputs[modelKey]?.value ?? null) : null;
  const contactsPerMonth = contactsWeek === null ? null : contactsWeek * WEEKS_PER_MONTH;
  return {
    weeks: logs.length,
    contactsPerMonth,
    bookingsPerMonth: (() => {
      const b = avg((w) => w.bookings);
      return b === null ? null : b * WEEKS_PER_MONTH;
    })(),
    sessionsPerMonth: (() => {
      const s = avg((w) => w.sessionsHeld);
      return s === null ? null : s * WEEKS_PER_MONTH;
    })(),
    reachPerWeek: avg((w) => w.reachActions),
    modelContactsPerMonth: model,
    contactsGap: contactsPerMonth !== null && model !== null && model > 0 ? (contactsPerMonth - model) / model : null,
  };
}

/* ---------- milestones ------------------------------------------------------ */

export const MILESTONES = [
  { key: 'first_business', title: 'Ticked a business', next: 'Tick what you run in Setup.' },
  { key: 'first_yours', title: 'First number of your own', next: 'Replace one estimate with your number.' },
  { key: 'diagnosed', title: 'Found the bottleneck', next: 'Run the quick diagnosis.' },
  { key: 'goal_set', title: 'Set an income goal', next: 'Set your income goal in Shared settings.' },
  { key: 'first_checkin', title: 'First check-in', next: 'Save your first 60-second check-in.' },
  { key: 'first_client', title: 'First contact logged', next: 'Log a contact on the Clients screen.' },
  { key: 'four_checkins', title: 'Four check-ins: momentum unlocked', next: 'Four saved check-ins unlock momentum.' },
  { key: 'half_yours', title: 'Half your numbers are yours', next: 'Replace estimates until half of #1 is yours.' },
] as const;
export type MilestoneKey = (typeof MILESTONES)[number]['key'];

export interface MilestoneState {
  achieved: MilestoneKey[];
  latest: (typeof MILESTONES)[number] | null;
  next: (typeof MILESTONES)[number] | null;
}

export function milestoneState(profile: Profile, businesses: BusinessModel[], clients: ClientRecord[], stored: Milestone[]): MilestoneState {
  const first = businesses.filter((b) => b.active).sort((a, b) => a.priority - b.priority)[0] ?? null;
  const yoursShare = first ? Object.values(first.inputs).filter((a) => a.label === 'Yours').length / Math.max(1, Object.keys(first.inputs).length) : 0;
  const goal = profile.settings.incomeGoalCents;
  const achieved: MilestoneKey[] = [];
  if (first) achieved.push('first_business');
  if (businesses.some((b) => Object.values(b.inputs).some((a) => a.label === 'Yours'))) achieved.push('first_yours');
  if (profile.pathway.completedSteps.some((s) => s.endsWith(':Diagnose'))) achieved.push('diagnosed');
  if (goal && goal.label === 'Yours' && goal.value !== null) achieved.push('goal_set');
  if (profile.checkInCount >= 1) achieved.push('first_checkin');
  if (clients.length > 0) achieved.push('first_client');
  if (profile.checkInCount >= 4) achieved.push('four_checkins');
  if (yoursShare >= 0.5) achieved.push('half_yours');
  for (const m of stored) if ((MILESTONES as readonly { key: string }[]).some((x) => x.key === m.key) && !achieved.includes(m.key as MilestoneKey)) achieved.push(m.key as MilestoneKey);
  const order = MILESTONES.map((m) => m.key);
  achieved.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const latest = achieved.length ? MILESTONES.find((m) => m.key === achieved[achieved.length - 1]) ?? null : null;
  const next = MILESTONES.find((m) => !achieved.includes(m.key)) ?? null;
  return { achieved, latest, next };
}

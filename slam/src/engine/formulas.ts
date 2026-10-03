/* ==========================================================================
   F01..F12, F23, F24 and the small helpers the golden tests name.

   Pure functions on plain numbers. Money is in cents (fractions allowed
   inside the engine; round only at display). Rates are fractions. Where a
   denominator can be zero the function returns null rather than Infinity,
   and the caller shows an incomplete state.

   One formula, one function: the business models in ./businesses call
   these; nothing re-implements them.
   ========================================================================== */

/* ---------- F01 ------------------------------------------------------------ */
export interface FunnelInput {
  inquiries: number;
  passRate: number;
  bookingRate: number;
  showRate: number;
  /** only for consult offers; 1 otherwise */
  closeRate?: number;
}
/** F01 clients = inquiries x pass x booking x show (x close for consult offers) */
export function clientsFromFunnel(f: FunnelInput): number {
  return f.inquiries * f.passRate * f.bookingRate * f.showRate * (f.closeRate ?? 1);
}

/* ---------- F02 ------------------------------------------------------------ */
export interface SaleInput {
  priceCents: number;
  feeRate: number;
  variableCostCents: number;
}
/** F02 gross profit per sale = price x (1 - fee) - variable cost */
export function grossProfitPerSale(s: SaleInput): number {
  return s.priceCents * (1 - s.feeRate) - s.variableCostCents;
}

/* ---------- F03 ------------------------------------------------------------ */
/** F03 sessions = new clients x (1 + rebook), plus continuity sessions */
export function sessionsFromClients(newClients: number, rebookRate: number, continuitySessions = 0): number {
  return newClients * (1 + rebookRate) + continuitySessions;
}

/* ---------- F04 ------------------------------------------------------------ */
export interface CapacityInput {
  demandSessions: number;
  /** a hard sessions-per-month cap, if she set one */
  capacitySessions?: number | null;
  /** hours she can sell this month, if known */
  sellableHours?: number | null;
  /** all-in hours one session costs, needed with sellableHours */
  allInHoursPerSession?: number | null;
}
export interface CapacityResult {
  sessions: number;
  /** sessions / demand; 1 when nothing binds */
  factor: number;
  cappedBy: 'none' | 'sessions' | 'hours';
  capacity: number | null;
}
/** F04 capacity cap: sessions = min(demand, sessions cap, sellable hours / all-in hours) */
export function capacityCap(c: CapacityInput): CapacityResult {
  let capacity: number | null = null;
  let cappedBy: CapacityResult['cappedBy'] = 'none';
  if (c.capacitySessions !== null && c.capacitySessions !== undefined) {
    capacity = c.capacitySessions;
    cappedBy = 'sessions';
  }
  if (
    c.sellableHours !== null &&
    c.sellableHours !== undefined &&
    c.allInHoursPerSession !== null &&
    c.allInHoursPerSession !== undefined &&
    c.allInHoursPerSession > 0
  ) {
    const byHours = c.sellableHours / c.allInHoursPerSession;
    if (capacity === null || byHours < capacity) {
      capacity = byHours;
      cappedBy = 'hours';
    }
  }
  if (capacity === null || c.demandSessions <= capacity) {
    return { sessions: c.demandSessions, factor: 1, cappedBy: 'none', capacity };
  }
  const factor = c.demandSessions > 0 ? capacity / c.demandSessions : 1;
  return { sessions: capacity, factor, cappedBy, capacity };
}

/* ---------- F05 ------------------------------------------------------------ */
/** F05 monthly profit = total gross profit - acquisition spend - fixed costs */
export function monthlyProfit(grossProfitCents: number, acquisitionSpendCents: number, fixedCostsCents: number): number {
  return grossProfitCents - acquisitionSpendCents - fixedCostsCents;
}

/* ---------- F06 ------------------------------------------------------------ */
/** F06 lifetime gross profit = gross profit per month x months retained */
export function lifetimeGrossProfit(gpPerMonthCents: number, monthsRetained: number): number {
  return gpPerMonthCents * monthsRetained;
}

/* ---------- F07 ------------------------------------------------------------ */
/** F07 cost to acquire = (acquisition spend + acquisition hours x hourly value) / new clients; null with no clients */
export function costToAcquire(
  acquisitionSpendCents: number,
  acquisitionHours: number,
  hourlyValueCents: number,
  newClients: number,
): number | null {
  if (newClients <= 0) return null;
  return (acquisitionSpendCents + acquisitionHours * hourlyValueCents) / newClients;
}

/* ---------- F08 ------------------------------------------------------------ */
export interface LtgpToCacResult {
  ratio: number | null;
  paybackDays: number | null;
}
/** F08 LTGP:CAC ratio, and payback days = CAC / (monthly GP per client / 30) */
export function ltgpToCac(ltgpCents: number, cacCents: number | null, gpPerClientPerMonthCents: number): LtgpToCacResult {
  if (cacCents === null) return { ratio: null, paybackDays: null };
  const ratio = cacCents > 0 ? ltgpCents / cacCents : null;
  const paybackDays = gpPerClientPerMonthCents > 0 ? cacCents / (gpPerClientPerMonthCents / 30) : null;
  return { ratio, paybackDays };
}

/* ---------- F09 ------------------------------------------------------------ */
/** F09 throughput per hour = (price - variable cost) / all-in hours; null with no hours */
export function throughputPerHour(priceCents: number, variableCostCents: number, allInHours: number): number | null {
  if (allInHours <= 0) return null;
  return (priceCents - variableCostCents) / allInHours;
}

/* ---------- F10 ------------------------------------------------------------ */
export interface ReverseSolveInput {
  goalCents: number;
  fixedCostsCents: number;
  acquisitionSpendCents: number;
  /** gross profit one inquiry brings, before any cap */
  gpPerInquiryCents: number;
  sessionsPerInquiry: number;
  capacitySessions: number | null;
}
export interface ReverseSolveResult {
  grossProfitNeededCents: number;
  /** whole inquiries; she cannot get half a contact */
  inquiriesNeeded: number;
  sessionsNeeded: number;
  withinCapacity: boolean;
  /** the most profit the capacity allows, when the ask is beyond it */
  maxProfitAtCapacityCents: number | null;
}
/** F10 reverse solve: inquiries needed = ceil((goal + fixed + acquisition spend) / GP per inquiry), then capacity check */
export function reverseSolve(r: ReverseSolveInput): ReverseSolveResult | null {
  if (r.gpPerInquiryCents <= 0) return null;
  const needed = r.goalCents + r.fixedCostsCents + r.acquisitionSpendCents;
  const exact = needed / r.gpPerInquiryCents;
  const inquiriesNeeded = Math.ceil(exact - 1e-9);
  /* sessions at the whole-inquiry count, the number she will actually be working */
  const sessionsNeeded = inquiriesNeeded * r.sessionsPerInquiry;
  const cap = r.capacitySessions;
  const withinCapacity = cap === null || sessionsNeeded <= cap + 1e-9;
  let maxProfitAtCapacityCents: number | null = null;
  if (!withinCapacity && cap !== null && r.sessionsPerInquiry > 0) {
    const inquiriesAtCap = cap / r.sessionsPerInquiry;
    maxProfitAtCapacityCents = inquiriesAtCap * r.gpPerInquiryCents - r.fixedCostsCents - r.acquisitionSpendCents;
  }
  return { grossProfitNeededCents: needed, inquiriesNeeded, sessionsNeeded, withinCapacity, maxProfitAtCapacityCents };
}

/* ---------- F11 ------------------------------------------------------------ */
export interface LeverageInput {
  addedAnnualProfitCents: number;
  cashCostCents: number;
  hours: number;
  hourlyValueCents: number;
  learningCostCents: number;
  weeksToMoney: number;
}
/** F11 leverage score = added annual profit / (cash + hours x hourly value + learning) x 52 / (52 + weeks to money) */
export function leverageScore(l: LeverageInput): number | null {
  const cost = l.cashCostCents + l.hours * l.hourlyValueCents + l.learningCostCents;
  if (cost <= 0) return null;
  const discount = 52 / (52 + Math.max(0, l.weeksToMoney));
  return (l.addedAnnualProfitCents / cost) * discount;
}

/* ---------- F12 ------------------------------------------------------------ */
export type Perturbation =
  | { key: string; kind: 'point'; amount: number }
  | { key: string; kind: 'percent'; amount: number };
/** F12: one delta. The caller supplies the profit function over a value map. */
export function sensitivityDelta(
  profitOf: (values: Record<string, number>) => number | null,
  base: Record<string, number>,
  p: Perturbation,
): number | null {
  const before = profitOf(base);
  if (before === null) return null;
  const current = base[p.key];
  if (current === undefined) return null;
  const next = p.kind === 'point' ? current + p.amount : current * (1 + p.amount);
  const after = profitOf({ ...base, [p.key]: next });
  if (after === null) return null;
  return after - before;
}

/* ---------- Shared time ------------------------------------------------------ */
export const WEEKS_PER_MONTH = 52 / 12;
/** sellable hours per month from available hours per week (already net of recovery days) */
export function sellableHoursPerMonth(availableHoursPerWeek: number): number {
  return availableHoursPerWeek * WEEKS_PER_MONTH;
}
/** recovery days are never zero; the app refuses to store less than one */
export const MIN_RECOVERY_DAYS = 1;

/* ---------- F24 runway ------------------------------------------------------- */
export interface RunwayResult {
  shortfallCents: number;
  /** months the cash lasts; null when there is no shortfall */
  months: number | null;
}
/** F24 runway = cash / monthly shortfall, shortfall = max(0, income goal - profit) */
export function runwayMonths(cashCents: number, incomeGoalCents: number, monthlyProfitCents: number): RunwayResult {
  const shortfallCents = Math.max(0, incomeGoalCents - monthlyProfitCents);
  if (shortfallCents <= 0) return { shortfallCents: 0, months: null };
  return { shortfallCents, months: cashCents / shortfallCents };
}

/* ---------- Named helpers the golden tests pin --------------------------------- */

/** G12 clients from events = events x conversations per event x close rate */
export function clientsFromEvents(events: number, conversationsPerEvent: number, closeRate: number): number {
  return events * conversationsPerEvent * closeRate;
}

/** G13 a power curve people = a x posts^b, with a fitted from one known point */
export function powerCurve(b: number, fittedPosts: number, fittedPeople: number): (posts: number) => number {
  const a = fittedPeople / Math.pow(fittedPosts, b);
  return (posts: number) => a * Math.pow(posts, b);
}

export interface SubscriberOfferInput {
  subscribers: number;
  takeRate: number;
  creditCents: number;
  wouldBookAnyway: number;
  gpPerBookingCents: number;
}
/** G14 added profit from an offer to subscribers = (takers - would book anyway) x GP - takers x credit */
export function subscriberOfferLift(s: SubscriberOfferInput): number {
  const takers = s.subscribers * s.takeRate;
  return (takers - s.wouldBookAnyway) * s.gpPerBookingCents - takers * s.creditCents;
}

export interface ArcPlanInput {
  priceCents: number;
  feeRate: number;
  variableCostCents: number;
  allInHours: number;
  goalCents: number;
}
export interface ArcPlanResult {
  gpPerClientCents: number;
  clientsNeeded: number;
  hoursNeeded: number;
}
/** G16, G17: what a goal needs from a program offer */
export function arcPlan(a: ArcPlanInput): ArcPlanResult | null {
  const gpPerClientCents = grossProfitPerSale(a);
  if (gpPerClientCents <= 0) return null;
  const clientsNeeded = a.goalCents / gpPerClientCents;
  return { gpPerClientCents, clientsNeeded, hoursNeeded: clientsNeeded * a.allInHours };
}

export interface ValueStackItem {
  name: string;
  valueCents: number;
}
/** G18 a value stack: the sum of what the pieces are worth, against the price */
export function valueStack(items: ValueStackItem[], priceCents: number): { totalCents: number; aboveprice: boolean; ratio: number | null } {
  const totalCents = items.reduce((s, i) => s + i.valueCents, 0);
  return { totalCents, aboveprice: totalCents > priceCents, ratio: priceCents > 0 ? totalCents / priceCents : null };
}

/** Round to whole cents at the display boundary only. */
export function roundCents(cents: number): number {
  return Math.round(cents);
}

/* ---------- The value equation (after Hormozi; SLAM is not affiliated) --------------- */
export interface ValueEquationInput {
  /** how clearly a new client can picture the result, 1..5 */
  outcome: number;
  /** how sure they are it happens with her, 1..5 */
  likelihood: number;
  /** how soon they get it, 1..5 (5 = right away) */
  speed: number;
  /** how easy it is for them, 1..5 (5 = effortless) */
  ease: number;
}
export interface ValueEquationResult {
  /** 0..100 */
  index: number;
  /** the lever furthest from 5 */
  weakest: keyof ValueEquationInput;
}
/** value = (outcome x likelihood) / (delay x effort); on 1..5 scales, delay = 6 - speed and effort = 6 - ease */
export function valueEquation(v: ValueEquationInput): ValueEquationResult {
  const clamp = (x: number) => Math.min(5, Math.max(1, x));
  const o = clamp(v.outcome);
  const l = clamp(v.likelihood);
  const d = 6 - clamp(v.speed);
  const e = 6 - clamp(v.ease);
  const raw = (o * l) / (d * e);
  /* raw runs from 1/25 to 25; map its log to 0..100 so each step matters the same */
  const index = Math.round(((Math.log(raw) - Math.log(1 / 25)) / (Math.log(25) - Math.log(1 / 25))) * 100);
  const entries: Array<[keyof ValueEquationInput, number]> = [
    ['outcome', o],
    ['likelihood', l],
    ['speed', clamp(v.speed)],
    ['ease', clamp(v.ease)],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  return { index, weakest: entries[0]![0] };
}

/** Hormozi's rule of thumb for LTGP:CAC; a preset she can question. */
export const LTGP_TO_CAC_TARGET = 3;
/** a value stack worth this many times the price makes the price feel small */
export const STACK_TO_PRICE_TARGET = 3;

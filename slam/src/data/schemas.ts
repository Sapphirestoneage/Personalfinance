/* ==========================================================================
   Zod schemas: the only place a stored shape is defined.

   Rules baked in here:
   - Every stored number is an Assumption with a label saying where it came
     from. `value: null` means "not entered"; it is never read as 0.
   - Money is integer cents in storage (keys end in `Cents`); rates are
     fractions (0.5, not 50).
   - Computed values are never stored: no schema has a profit, sessions or
     ratio field.
   - Every object schema is `.strict()`, so a legal name, an address, a
     photo or a screening document cannot be stored even by accident.
   ========================================================================== */
import { z } from 'zod';

/* ---------- Assumptions and labels ---------------------------------------- */

export const LABELS = ['Book', 'Preset', 'Placeholder', 'Cohort', 'Yours'] as const;
export const LabelSchema = z.enum(LABELS);
export type Label = z.infer<typeof LabelSchema>;

/* Strength order: a number is "hers" only when every input is Yours. */
export const LABEL_STRENGTH: Record<Label, number> = {
  Placeholder: 0,
  Preset: 1,
  Book: 2,
  Cohort: 3,
  Yours: 4,
};

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
  message: 'expected an ISO date-time',
});
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const id = z.string().min(1).max(64);
const shortText = z.string().max(200);
const longText = z.string().max(4000);

export const AssumptionSchema = z
  .object({
    key: z.string().min(1).max(80),
    value: z.number().finite().nullable(),
    label: LabelSchema,
    source: shortText,
    updated: isoDateTime,
  })
  .strict();
export type Assumption = z.infer<typeof AssumptionSchema>;

/* A book is a map of assumptions keyed by their own key. */
export const AssumptionMapSchema = z.record(z.string(), AssumptionSchema);
export type AssumptionMap = z.infer<typeof AssumptionMapSchema>;

/* ---------- Businesses ------------------------------------------------------ */

export const BUSINESS_TYPES = ['inPerson', 'content', 'calls', 'regulars'] as const;
export const BusinessTypeSchema = z.enum(BUSINESS_TYPES);
export type BusinessType = z.infer<typeof BusinessTypeSchema>;

export const SCENARIO_KINDS = ['Normal', 'Dream', 'Disaster'] as const;
export const ScenarioKindSchema = z.enum(SCENARIO_KINDS);
export type ScenarioKind = z.infer<typeof ScenarioKindSchema>;

export const EVENT_IDS = [
  'platform_ban',
  'house_stops',
  'top_regular_leaves',
  'month_off_sick',
  'processor_hold',
  'price_war',
  'viral_post',
  'press_feature',
  'waitlist',
  'regular_upgrades_to_retainer',
] as const;
export const EventIdSchema = z.enum(EVENT_IDS);
export type EventId = z.infer<typeof EventIdSchema>;

export const MultipliersSchema = z
  .object({
    audience: z.number().finite().nonnegative(),
    conversion: z.number().finite().nonnegative(),
  })
  .strict();
export type Multipliers = z.infer<typeof MultipliersSchema>;

/* Per-business override of a scenario: any multiplier, any event list. */
export const ScenarioOverrideSchema = z
  .object({
    multipliers: MultipliersSchema.partial().optional(),
    events: z.array(EventIdSchema).optional(),
  })
  .strict();
export type ScenarioOverride = z.infer<typeof ScenarioOverrideSchema>;

export const BusinessSchema = z
  .object({
    id,
    profileId: id,
    type: BusinessTypeSchema,
    name: shortText,
    active: z.boolean(),
    priority: z.number().int().min(1),
    inputs: AssumptionMapSchema,
    scenarioOverrides: z
      .object({
        Normal: ScenarioOverrideSchema.optional(),
        Dream: ScenarioOverrideSchema.optional(),
        Disaster: ScenarioOverrideSchema.optional(),
      })
      .strict(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict();
export type Business = z.infer<typeof BusinessSchema>;

/* ---------- Offers ---------------------------------------------------------- */

export const OFFER_TYPES = [
  'single',
  'addon',
  'retainer',
  'arc',
  'subscription',
  'ppv',
  'custom',
  'digital',
  'call',
  'tribute',
] as const;
export const OfferTypeSchema = z.enum(OFFER_TYPES);
export type OfferType = z.infer<typeof OfferTypeSchema>;

/* Every numeric field on an offer is an Assumption, so the engine still
   reads numbers only through Assumptions. Fields that do not apply to a
   type are simply absent. */
export const OfferSchema = z
  .object({
    id,
    businessId: id,
    type: OfferTypeSchema,
    name: shortText,
    active: z.boolean(),
    recurring: z.boolean(),
    priceCents: AssumptionSchema,
    variableCostCents: AssumptionSchema,
    feeRate: AssumptionSchema,
    allInHours: AssumptionSchema,
    takeRate: AssumptionSchema.optional(),
    monthsRetained: AssumptionSchema.optional(),
    sessionsIncluded: AssumptionSchema.optional(),
    sessionsPerMonth: AssumptionSchema.optional(),
    weeks: AssumptionSchema.optional(),
    closeRate: AssumptionSchema.optional(),
    minutes: AssumptionSchema.optional(),
  })
  .strict();
export type Offer = z.infer<typeof OfferSchema>;

/* ---------- Scenarios ------------------------------------------------------- */

export const ScenarioSchema = z
  .object({
    id,
    profileId: id,
    kind: ScenarioKindSchema,
    multipliers: MultipliersSchema,
    events: z.array(EventIdSchema),
    updatedAt: isoDateTime,
  })
  .strict();
export type Scenario = z.infer<typeof ScenarioSchema>;

/* ---------- Sources --------------------------------------------------------- */

export const SOURCE_TYPES = ['platform', 'house', 'referral', 'ads', 'own_site', 'directory', 'other'] as const;
export const SourceTypeSchema = z.enum(SOURCE_TYPES);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceSchema = z
  .object({
    id,
    profileId: id,
    businessId: id.optional(),
    type: SourceTypeSchema,
    name: shortText,
    owned: z.boolean(),
    costCents: AssumptionSchema,
    /** share of this business's contacts that arrive through it, 0..1 */
    shareOfInquiries: AssumptionSchema,
    /** for a platform: followers there */
    followers: AssumptionSchema.optional(),
    updatedAt: isoDateTime,
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;

/* ---------- Clients (aliases only, ever) ------------------------------------ */

export const CLIENT_STAGES = ['inquiry', 'screening', 'booked', 'showed', 'client', 'regular', 'lost'] as const;
export const ClientStageSchema = z.enum(CLIENT_STAGES);
export const SCREENING_RESULTS = ['pending', 'pass', 'fail', 'withdrawn'] as const;
export const ScreeningResultSchema = z.enum(SCREENING_RESULTS);
export const DEPOSIT_STATUSES = ['none', 'requested', 'paid', 'refunded', 'forfeited'] as const;
export const DepositStatusSchema = z.enum(DEPOSIT_STATUSES);
export const LOST_REASONS = ['no_reply', 'screening', 'price', 'timing', 'no_show', 'boundaries', 'other'] as const;
export const LostReasonSchema = z.enum(LOST_REASONS);

export const ClientRecordSchema = z
  .object({
    id,
    profileId: id,
    alias: shortText,
    businessId: id.optional(),
    sourceId: id.optional(),
    stage: ClientStageSchema,
    keyDates: z
      .object({
        firstContact: isoDate.optional(),
        screened: isoDate.optional(),
        firstBooking: isoDate.optional(),
        lastSession: isoDate.optional(),
        nextActionDue: isoDate.optional(),
      })
      .strict(),
    screeningResult: ScreeningResultSchema,
    depositStatus: DepositStatusSchema,
    offersBought: z.array(id),
    referredBy: id.optional(),
    contactConsent: z.boolean(),
    nextAction: shortText.optional(),
    lostReason: LostReasonSchema.optional(),
    agreedBudgetCents: z.number().int().nonnegative().nullable(),
    notes: longText.optional(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict();
export type ClientRecord = z.infer<typeof ClientRecordSchema>;

/* Names that must never appear on any stored record. Tested. */
export const FORBIDDEN_FIELDS = [
  'legalName',
  'realName',
  'fullName',
  'address',
  'street',
  'idDocument',
  'idNumber',
  'passport',
  'licence',
  'license',
  'photo',
  'image',
  'screeningDocument',
  'screeningNotes',
  'phone',
  'email',
] as const;

/* ---------- Sales ----------------------------------------------------------- */

export const SaleSchema = z
  .object({
    id,
    profileId: id,
    businessId: id,
    offerId: id.optional(),
    clientId: id.optional(),
    date: isoDate,
    amountCents: z.number().int().nonnegative(),
    feeCents: z.number().int().nonnegative(),
    variableCostCents: z.number().int().nonnegative(),
    note: shortText.optional(),
    createdAt: isoDateTime,
  })
  .strict();
export type Sale = z.infer<typeof SaleSchema>;

/* ---------- Week logs (the check-in) ---------------------------------------- */

const count = z.number().int().nonnegative().nullable();

export const WeekLogSchema = z
  .object({
    id,
    profileId: id,
    businessId: id.optional(),
    weekStart: isoDate,
    inquiries: count,
    bookings: count,
    sessionsHeld: count,
    revenueCents: count,
    hours: z.number().finite().nonnegative().nullable(),
    energy: z.number().int().min(1).max(5).nullable(),
    note: shortText.optional(),
    /** true once she pressed Save on the check-in; a "+1 contact" tap alone does not count */
    checkedIn: z.boolean(),
    loggedAt: isoDateTime,
  })
  .strict();
export type WeekLog = z.infer<typeof WeekLogSchema>;

/* ---------- Milestones ------------------------------------------------------ */

export const MilestoneSchema = z
  .object({
    id,
    profileId: id,
    key: z.string().min(1).max(80),
    businessId: id.optional(),
    achievedAt: isoDateTime,
  })
  .strict();
export type Milestone = z.infer<typeof MilestoneSchema>;

/* ---------- Profile --------------------------------------------------------- */

export const LABEL_MODES = ['plain', 'domme', 'pro'] as const;
export const LabelModeSchema = z.enum(LABEL_MODES);
export type LabelMode = z.infer<typeof LabelModeSchema>;

export const PATHWAY_STAGES = [
  'Setup',
  'Diagnose',
  'Offer',
  'Presence',
  'Conversations',
  'Bookings',
  'Money per client',
  'Plan',
  'Strategy',
] as const;
export const PathwayStageSchema = z.enum(PATHWAY_STAGES);
export type PathwayStage = z.infer<typeof PathwayStageSchema>;

export const ProfileSchema = z
  .object({
    id,
    alias: shortText,
    demo: z.boolean(),
    labelMode: LabelModeSchema,
    settings: AssumptionMapSchema,
    pathway: z
      .object({
        businessId: id.optional(),
        stage: PathwayStageSchema,
        completedSteps: z.array(z.string().max(80)),
      })
      .strict(),
    checkInCount: z.number().int().nonnegative(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict();
export type Profile = z.infer<typeof ProfileSchema>;

/* ---------- The export file -------------------------------------------------- */

export const EXPORT_FORMAT = 'slam-backup';
export const SCHEMA_VERSION = 1;

export const ExportSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    schemaVersion: z.literal(SCHEMA_VERSION),
    exportedAt: isoDateTime,
    profiles: z.array(ProfileSchema),
    businesses: z.array(BusinessSchema),
    offers: z.array(OfferSchema),
    scenarios: z.array(ScenarioSchema),
    sources: z.array(SourceSchema),
    clients: z.array(ClientRecordSchema),
    sales: z.array(SaleSchema),
    weekLogs: z.array(WeekLogSchema),
    milestones: z.array(MilestoneSchema),
  })
  .strict();
export type ExportFile = z.infer<typeof ExportSchema>;

/* Names of the fields a computed result would carry. No stored schema may
   declare any of them; tested in tests/unit/schemas.test.ts. */
export const NEVER_STORED = [
  'profit',
  'grossProfit',
  'grossProfitCents',
  'sessions',
  'newClients',
  'ratio',
  'runway',
  'throughput',
  'score',
] as const;

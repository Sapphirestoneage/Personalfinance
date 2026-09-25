import { describe, expect, it } from 'vitest';
import {
  AssumptionSchema,
  BusinessSchema,
  ClientRecordSchema,
  ExportSchema,
  FORBIDDEN_FIELDS,
  NEVER_STORED,
  OfferSchema,
  ProfileSchema,
  SaleSchema,
  ScenarioSchema,
  SourceSchema,
  WeekLogSchema,
  MilestoneSchema,
} from '@/data/schemas';
import { sampleRows } from '@/content/samples';
const demoRows = () => sampleRows('sample-inperson');

const STAMP = '2026-09-01T00:00:00.000Z';

const baseClient = {
  id: 'c1',
  profileId: 'demo',
  alias: 'Blue',
  stage: 'client' as const,
  keyDates: {},
  screeningResult: 'pass' as const,
  depositStatus: 'paid' as const,
  offersBought: [],
  contactConsent: true,
  agreedBudgetCents: null,
  createdAt: STAMP,
  updatedAt: STAMP,
};

describe('Assumption', () => {
  it('accepts null as not entered', () => {
    expect(AssumptionSchema.parse({ key: 'x', value: null, label: 'Placeholder', source: '', updated: STAMP }).value).toBeNull();
  });
  it('rejects NaN and Infinity', () => {
    expect(AssumptionSchema.safeParse({ key: 'x', value: Number.NaN, label: 'Yours', source: '', updated: STAMP }).success).toBe(false);
    expect(AssumptionSchema.safeParse({ key: 'x', value: Number.POSITIVE_INFINITY, label: 'Yours', source: '', updated: STAMP }).success).toBe(false);
  });
  it('rejects an unknown label', () => {
    expect(AssumptionSchema.safeParse({ key: 'x', value: 1, label: 'Guess', source: '', updated: STAMP }).success).toBe(false);
  });
});

describe('ClientRecord never holds identifying data', () => {
  it('accepts an alias-only record', () => {
    expect(ClientRecordSchema.parse(baseClient).alias).toBe('Blue');
  });
  it.each(FORBIDDEN_FIELDS)('rejects a record carrying %s', (field) => {
    expect(ClientRecordSchema.safeParse({ ...baseClient, [field]: 'x' }).success).toBe(false);
  });
  it('keeps a screening result only, never a reason or a document', () => {
    expect(ClientRecordSchema.safeParse({ ...baseClient, screeningResult: 'pass', screeningReason: 'x' }).success).toBe(false);
    expect(ClientRecordSchema.safeParse({ ...baseClient, screeningResult: 'looked fine' }).success).toBe(false);
  });
});

describe('every stored schema is strict and stores nothing computed', () => {
  const schemas = { BusinessSchema, OfferSchema, ProfileSchema, SaleSchema, ScenarioSchema, SourceSchema, WeekLogSchema, MilestoneSchema, ClientRecordSchema };
  for (const [name, schema] of Object.entries(schemas)) {
    it(`${name} declares none of ${NEVER_STORED.join(', ')}`, () => {
      const keys = Object.keys(schema.shape);
      for (const k of NEVER_STORED) expect(keys, `${name} has ${k}`).not.toContain(k);
    });
  }
  it('the demo rows all validate', () => {
    const rows = demoRows();
    expect(ProfileSchema.parse(rows.profile).id).toBe('sample-inperson');
    for (const b of rows.businesses) expect(BusinessSchema.parse(b).id).toBe(b.id);
    for (const o of rows.offers) expect(OfferSchema.parse(o).id).toBe(o.id);
    for (const s of rows.scenarios) expect(ScenarioSchema.parse(s).id).toBe(s.id);
  });
  it('a Business with a stored profit field is rejected', () => {
    const b = demoRows().businesses[0]!;
    expect(BusinessSchema.safeParse({ ...b, profit: 1 }).success).toBe(false);
  });
  it('the export file rejects an unknown format', () => {
    expect(ExportSchema.safeParse({ format: 'other', schemaVersion: 1, exportedAt: STAMP }).success).toBe(false);
  });
});

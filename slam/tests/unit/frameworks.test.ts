import { describe, expect, it } from 'vitest';
import { valueEquation, LTGP_TO_CAC_TARGET, STACK_TO_PRICE_TARGET } from '@/engine/formulas';
import { TOOLS, type ToolCtx } from '@/features/toolbox/tools';
import { canonicalInPerson, canonicalShared } from '@/content/canonical';
import { withValues } from '@/engine/reader';
import { yours } from '@/data/assumptions';
import { $, within } from '../helpers';

const ctxFor = (over: Record<string, number | null> = {}, goalCents = $(6000)): ToolCtx => {
  const b = canonicalInPerson();
  b.inputs = withValues(b.inputs, over);
  return { business: b, shared: canonicalShared({ incomeGoalCents: goalCents }), mode: 'plain', sellableHours: null };
};
const vals = (o: Record<string, number | null>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, yours(k.split('.')[1]!, v)]));

describe('the value equation', () => {
  it('runs 0..100 and names the weakest lever', () => {
    expect(valueEquation({ outcome: 5, likelihood: 5, speed: 5, ease: 5 }).index).toBe(100);
    expect(valueEquation({ outcome: 1, likelihood: 1, speed: 1, ease: 1 }).index).toBe(0);
    const mid = valueEquation({ outcome: 3, likelihood: 3, speed: 3, ease: 3 });
    expect(mid.index).toBe(50);
    expect(valueEquation({ outcome: 5, likelihood: 5, speed: 2, ease: 5 }).weakest).toBe('speed');
    expect(valueEquation({ outcome: 5, likelihood: 5, speed: 5, ease: 1 }).weakest).toBe('ease');
  });
  it('the presets are the published rules of thumb', () => {
    expect(LTGP_TO_CAC_TARGET).toBe(3);
    expect(STACK_TO_PRICE_TARGET).toBe(3);
  });
});

describe('the offer tool', () => {
  it('scores the equation, compares the stack to the price, and credits the framework', () => {
    const ctx = ctxFor();
    const r = TOOLS.offer.compute(vals({ 'single.priceCents': $(500), 'single.feeRate': 0.05, 'single.variableCostCents': $(100), 'single.allInHours': 4, 'tool.outcome': 4, 'tool.likelihood': 5, 'tool.speed': 2, 'tool.ease': 4, 'tool.v1': $(800), 'tool.v2': $(200), 'tool.v3': $(150), 'tool.v4': $(300), 'tool.v5': $(400), 'tool.v6': $(100) }), ctx);
    expect(r.ok).toBe(true);
    expect(r.lines.find((l) => l.label === 'Gross profit per sale')!.value).toBe('$375.00'.replace('.00', ''));
    expect(r.lines.find((l) => l.label === 'Weakest lever')!.value).toContain('first available date');
    expect(r.lines.find((l) => l.label === 'Stack to price')!.value).toContain('3.9x');
    expect(r.credit).toContain('not affiliated'.replace('not affiliated', 'independent'));
    expect(r.summary).toContain('several times the price');
  });
  it('never advises shortening screening', () => {
    const ctx = ctxFor();
    const r = TOOLS.offer.compute(vals({ 'single.priceCents': $(500), 'single.feeRate': 0.05, 'single.variableCostCents': $(100), 'single.allInHours': 4, 'tool.outcome': 5, 'tool.likelihood': 5, 'tool.speed': 5, 'tool.ease': 1 }), ctx);
    const lever = r.lines.find((l) => l.label === 'Weakest lever')!.value;
    expect(lever).toContain('Never shorten screening');
  });
});

describe('the diagnosis says how many contacts the goal needs', () => {
  it('when nothing is below typical, it is a volume problem with a number attached', () => {
    /* single sessions only: $4,000 after $1,500 fixed needs 67 contacts, within the 18-session cap */
    const ctx = ctxFor({ inquiriesPerMonth: 20 }, $(4000));
    const r = TOOLS.diagnose.compute(vals({ 'inputs.inquiriesPerMonth': 20, 'tool.bookingsLastMonth': 4, 'single.priceCents': $(500) }), ctx);
    expect(r.ok).toBe(true);
    const line = r.lines.find((l) => l.label.startsWith('Contacts a month for'))!;
    expect(line.value).toContain('(you have 20)');
    expect(line.value).toContain('67');
    expect(r.summary).toContain('Volume is the job now');
  });
  it('and refuses to advise volume past capacity', () => {
    const ctx = ctxFor({ inquiriesPerMonth: 20 }, $(6000));
    const r = TOOLS.diagnose.compute(vals({ 'inputs.inquiriesPerMonth': 20, 'tool.bookingsLastMonth': 4, 'single.priceCents': $(500) }), ctx);
    expect(r.summary).toContain('raise price or add an offer');
  });
});

describe('the money tool', () => {
  it('states the 3 : 1 rule and reads the ratio against it', () => {
    const ctx = ctxFor();
    const r = TOOLS.money.compute(vals({ 'shared.acquisitionSpendCents': $(300), 'shared.acquisitionHoursPerMonth': 10, 'shared.hourlyValueCents': $(50), 'tool.subscribers': null, 'tool.takeRate': 0.03, 'tool.creditCents': $(30), 'tool.wouldBookAnyway': 0 }), ctx);
    expect(r.ok).toBe(true);
    expect(r.lines.find((l) => l.label === 'Worth : cost')!.value).toContain('aim for 3 : 1');
    expect(r.credit).toBeDefined();
  });
});

describe('conversations count daily reach', () => {
  it('turns reach actions into contacts a month', () => {
    const ctx = ctxFor();
    const r = TOOLS.conversations.compute(vals({ 'tool.reachPerDay': 10, 'tool.replyRate': 0.03, 'tool.events': 2, 'tool.conversations': 10, 'tool.closeRate': 0.05, 'tool.wanted': 20 }), ctx);
    const reach = r.lines.find((l) => l.label.startsWith('Contacts a month from daily reach'))!;
    within(Number(reach.value), 10 * 0.03 * 5 * (52 / 12), 0.1);
    expect(r.summary).toContain('more reach actions');
  });
});

/* ==========================================================================
   The guided pathway: business #1 goes through every stage, then #2 starts
   at Diagnose, and so on. Pure: takes the profile's completed steps and
   the active businesses, returns the next step.
   ========================================================================== */
import type { PathwayStage } from '@/data/schemas';
import { STAGES, stepKey, type StageMeta } from '@/content/stages';
import { activeInPriorityOrder, type BusinessModel } from './model';

export interface NextStep {
  stage: StageMeta;
  businessId: string | null;
  /** 0..1 across the whole pathway */
  progress: number;
  done: number;
  total: number;
  /** progress within the business the next step belongs to */
  business: { done: number; total: number } | null;
}

export function pathwayPlan(businesses: BusinessModel[]): Array<{ businessId: string | null; stage: StageMeta }> {
  const plan: Array<{ businessId: string | null; stage: StageMeta }> = [{ businessId: null, stage: STAGES[0]! }];
  const active = activeInPriorityOrder(businesses);
  active.forEach((b, i) => {
    for (const s of STAGES.slice(1)) {
      if (i > 0 && s.stage === 'Setup') continue;
      plan.push({ businessId: b.id, stage: s });
    }
  });
  return plan;
}

export function nextStep(businesses: BusinessModel[], completedSteps: string[]): NextStep {
  const plan = pathwayPlan(businesses);
  const done = new Set(completedSteps);
  const isDone = (p: { businessId: string | null; stage: StageMeta }) =>
    p.businessId === null ? businesses.some((b) => b.active) : done.has(stepKey(p.businessId, p.stage.stage));
  const doneCount = plan.filter(isDone).length;
  const next = plan.find((p) => !isDone(p)) ?? plan[plan.length - 1]!;
  const mine = next.businessId ? plan.filter((p) => p.businessId === next.businessId) : [];
  const business = next.businessId ? { done: mine.filter(isDone).length, total: mine.length } : null;
  return { stage: next.stage, businessId: next.businessId, progress: plan.length ? doneCount / plan.length : 0, done: doneCount, total: plan.length, business };
}

export function stageIndex(stage: PathwayStage): number {
  return STAGES.findIndex((s) => s.stage === stage);
}

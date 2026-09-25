/* The pathway: nine stages, each answered by one tool. */
import type { PathwayStage } from '@/data/schemas';

export type ToolId = 'setup' | 'diagnose' | 'offer' | 'presence' | 'conversations' | 'bookings' | 'money' | 'plan' | 'strategy';

export interface StageMeta {
  stage: PathwayStage;
  tool: ToolId;
  title: string;
  question: string;
  minutes: number;
}

export const STAGES: StageMeta[] = [
  { stage: 'Setup', tool: 'setup', title: 'Setup', question: 'Which businesses do you run, and which is #1?', minutes: 2 },
  { stage: 'Diagnose', tool: 'diagnose', title: 'Quick diagnosis', question: 'Where is the money leaking: contacts, bookings, price or capacity?', minutes: 3 },
  { stage: 'Offer', tool: 'offer', title: 'Your offer', question: 'Is what you sell worth more than it costs, per hour of you?', minutes: 5 },
  { stage: 'Presence', tool: 'presence', title: 'Being seen', question: 'How many posts does it take to reach the people you need?', minutes: 3 },
  { stage: 'Conversations', tool: 'conversations', title: 'Conversations', question: 'How many conversations turn into clients?', minutes: 2 },
  { stage: 'Bookings', tool: 'bookings', title: 'Bookings', question: 'Which step of the funnel moves profit most?', minutes: 3 },
  { stage: 'Money per client', tool: 'money', title: 'Money per client', question: 'What is a client worth over time, and what did they cost to find?', minutes: 4 },
  { stage: 'Plan', tool: 'plan', title: 'The plan', question: 'How many contacts does your goal need, and is that within capacity?', minutes: 2 },
  { stage: 'Strategy', tool: 'strategy', title: 'Strategy', question: 'Of the moves you could make, which pays best for its cost?', minutes: 5 },
];

export const STAGE_BY_TOOL: Record<ToolId, StageMeta> = Object.fromEntries(STAGES.map((s) => [s.tool, s])) as Record<ToolId, StageMeta>;

export function stepKey(businessId: string, stage: PathwayStage): string {
  return `${businessId}:${stage}`;
}

// Employer plan memory (S-267), in this browser: plan rules by employer, outside any household (engine/employer-plans.js
// keeps only plan rules, never client data). The example household is never remembered.

import { rememberFrom, employerKey } from '../engine/employer-plans.js';

const KEY = 'slam-employer-plans:v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
let memo = null;
export function rememberPlans(spine) {
  if (!spine || (spine.meta && spine.meta.demo === true)) return;
  const before = read(), after = rememberFrom(spine, before);
  if (JSON.stringify(after) === JSON.stringify(before)) return;
  try { localStorage.setItem(KEY, JSON.stringify(after)); } catch { /* storage off: nothing remembered */ }
  memo = null;
}
// The template for an employer's name, or null.
export function planFor(name) { const k = employerKey(name); if (!k) return null; memo = memo || read(); return memo[k] || null; }
// The employers remembered, by the name they were last seen under (for the picker, S-284).
export function knownEmployers() { memo = memo || read(); return Object.values(memo).map((t) => t && t.employer).filter(Boolean); }

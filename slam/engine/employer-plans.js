// Employer plan memory (S-267): a workplace plan's rules (its match tiers, vesting and what it allows), kept by employer
// name outside any household, so the next client at the same employer starts with them as guesses. Only plan rules are
// kept: never a balance, a contribution, a name or anything else about the client.

import { getAt, setAt, valueOf as v } from './spine.js';
import { putFact } from './edits.js';

export const PLAN_FIELDS = ['matchTiers', 'trueUp', 'vestingType', 'vestingYears', 'employerNonElective', 'allowsAfterTax', 'allowsInPlanRoth', 'autoIncrease'];
export const FROM_MEMORY = 'from another client at this employer';
// "Acme Health, Inc." and "acme health" are the same employer.
export const employerKey = (name) => String(name || '').toLowerCase().replace(/[.,]/g, ' ').replace(/\b(inc|llc|ltd|corp|co|company|corporation)\b/g, '').replace(/\s+/g, ' ').trim();

// A plan's rules as a template: { employer, fields: { field: value } }, from what was typed (known or rough, never a
// value that itself came from memory); null when there is no employer or nothing to keep.
export function planTemplateOf(a) {
  if (!a || a.family !== 'employerRetirement') return null;
  const name = a.employerName ? v(a.employerName) : null;
  if (!employerKey(name)) return null;
  const fields = {};
  for (const k of PLAN_FIELDS) {
    const f = a[k];
    if (!f || f.value === null || f.value === undefined || f.kind === 'missing' || f.kind === 'notForMe' || f.source === FROM_MEMORY) continue;
    fields[k] = f.value;
  }
  return Object.keys(fields).length ? { employer: String(name).trim(), fields } : null;
}
// Every plan in a household, merged over what the store already holds: { key: template }.
export function rememberFrom(spine, store = {}) {
  const out = { ...store };
  for (const a of spine.accounts || []) { const t = planTemplateOf(a); if (t) out[employerKey(t.employer)] = { employer: t.employer, fields: { ...((store[employerKey(t.employer)] || {}).fields || {}), ...t.fields } }; }
  return out;
}
// Fills what the account at `base` is missing from the template, each as a guess, said where it came from.
export function applyTemplate(spine, base, tpl, today) {
  let s = spine;
  for (const [k, value] of Object.entries((tpl && tpl.fields) || {})) {
    if (!PLAN_FIELDS.includes(k)) continue;
    const f = getAt(s, base + '.' + k);
    if (f && f.value !== null && f.value !== undefined && f.kind !== 'missing') continue;
    s = putFact(s, base + '.' + k, value, 'rough', today);
    s = setAt(s, base + '.' + k, { ...getAt(s, base + '.' + k), source: FROM_MEMORY });
  }
  return s;
}
// What a template would fill on this account (the fields it is missing).
export const wouldFill = (a, tpl) => Object.keys((tpl && tpl.fields) || {}).filter((k) => PLAN_FIELDS.includes(k) && (!a[k] || a[k].value === null || a[k].value === undefined || a[k].kind === 'missing'));

// Who sees what (S-096), decided in this one map. Every record type and field
// is shared with the client unless it is listed here as coach-only. A future
// sign-in uses the same map for permissions; today "View as client" uses it to
// show what the client would see.

export const COACH_ONLY = {
  coachNotes: 'The coach\'s notes about the client (Fill in, Basics).',
  'plans.*.lines.*.note': 'Internal decision notes in the monthly plan.',
  'line.tag=mistake': 'A mistake tag, until the coach shares it (line.mistakeShared).',
  'cashflow.cushion': 'The coach\'s cushion setting (the calendar still uses it).',
  'settings.materiality': 'The coach\'s materiality: how close the bridge must be to "tie".'
};

// Every record type in records.js, and whether the client sees it.
export const RECORDS = {
  category: 'shared', line: 'shared', income: 'shared', deduction: 'shared', debt: 'shared', account: 'shared',
  entry: 'shared', tag: 'shared', era: 'shared', 'estimate-change': 'shared', 'balance-check': 'shared',
  'next-cost': 'shared', 'next-change': 'shared', 'next-measure': 'shared', balance: 'shared', 'plan-line': 'shared'
};

export function canSee(field, role) {
  return role === 'coach' || !(field in COACH_ONLY);
}

const clone = (x) => JSON.parse(JSON.stringify(x));

// The document as someone in this role sees it. Edits still go to the real document.
export function viewFor(doc, role) {
  if (!doc || role === 'coach') return doc;
  const d = clone(doc);
  d.coachNotes = '';
  for (const p of Object.values(d.plans || {})) for (const e of Object.values(p.lines || {})) if (e && e.note) e.note = '';
  for (const c of d.categories || []) for (const l of c.lines || []) if (l.tag === 'mistake' && !l.mistakeShared) l.tag = 'planned';
  return d;
}

// Words that differ for the coach and the client. Everything else reads the same to both.
const WORDS = {
  'owed-label': ['Reimbursements still owed to the client', 'Reimbursements still owed to you'],
  'completion-note': ['This is about the data, not how the client is doing.', 'This is about the data, not how you are doing.'],
  'estimate-own': ['That estimate is the client\'s own; it is never overwritten', 'That estimate is your own; it is never overwritten'],
  'view-toggle': ['View as client', 'Back to the coach view']
};

export function say(key, role) {
  const w = WORDS[key];
  if (!w) return key;
  return role === 'client' ? w[1] : w[0];
}

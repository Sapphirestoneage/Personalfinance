// Checks a household document and returns a list of problems (empty = valid).
// The store refuses to save a document that fails validation.

import { valueErrors } from './value.js';
import {
  SCHEMA_VERSION, SITUATIONS, FILING_STATUSES, INCOME_TYPES, PAY_FREQUENCIES,
  ITEM_STATES, LINE_KINDS, LINE_PATHS, LINE_TAGS, DEBT_TYPES, COL_TIERS
} from './schema.js';

function oneOf(errs, list, val, where, allowNull = false) {
  if (allowNull && (val === null || val === undefined)) return;
  if (!list.includes(val)) errs.push(where + ': "' + val + '" is not one of ' + list.join(', '));
}

export function validateHousehold(doc) {
  const errs = [];
  if (!doc || typeof doc !== 'object') return ['not an object'];
  if (doc.schemaVersion !== SCHEMA_VERSION) errs.push('schemaVersion must be ' + SCHEMA_VERSION);
  if (!doc.id) errs.push('id is missing');
  if (!doc.profile || typeof doc.profile.name !== 'string') errs.push('profile.name is missing');
  oneOf(errs, COL_TIERS, doc.profile && doc.profile.colTier, 'profile.colTier', true);
  for (const s of doc.situation || []) oneOf(errs, SITUATIONS, s, 'situation');
  oneOf(errs, FILING_STATUSES, doc.household && doc.household.filingStatus, 'household.filingStatus');
  errs.push(...valueErrors(doc.gut, 'gut'));

  const ids = new Set();
  const seen = (id, where) => { if (ids.has(id)) errs.push(where + ': duplicate id ' + id); ids.add(id); };

  (doc.income || []).forEach((inc, i) => {
    const w = 'income[' + i + ']';
    seen(inc.id, w);
    oneOf(errs, INCOME_TYPES, inc.type, w + '.type');
    oneOf(errs, PAY_FREQUENCIES, inc.payFrequency, w + '.payFrequency');
    oneOf(errs, ITEM_STATES, inc.state, w + '.state');
    for (const k of ['takeHome', 'gross', 'pretaxRetirement']) errs.push(...valueErrors(inc[k], w + '.' + k));
  });
  (doc.debts || []).forEach((d, i) => {
    const w = 'debts[' + i + ']';
    seen(d.id, w);
    oneOf(errs, DEBT_TYPES, d.type, w + '.type');
    for (const k of ['balance', 'apr', 'minimum', 'dueDay']) errs.push(...valueErrors(d[k], w + '.' + k));
  });
  (doc.categories || []).forEach((c, i) => {
    const w = 'categories[' + i + '] ' + c.id;
    seen(c.id, w);
    oneOf(errs, ITEM_STATES, c.state, w + '.state');
    errs.push(...valueErrors(c.estimate, w + '.estimate'), ...valueErrors(c.dream, w + '.dream'));
    (c.lines || []).forEach((l, j) => {
      const lw = w + '.lines[' + j + '] ' + l.id;
      seen(l.id, lw);
      oneOf(errs, LINE_KINDS, l.kind, lw + '.kind');
      oneOf(errs, LINE_PATHS, l.path, lw + '.path');
      oneOf(errs, LINE_TAGS, l.tag, lw + '.tag');
      oneOf(errs, ITEM_STATES, l.state, lw + '.state');
      if (l.joy !== null && !(Number.isInteger(l.joy) && l.joy >= 1 && l.joy <= 10)) errs.push(lw + '.joy must be 1 to 10 or empty');
      for (const k of ['estimate', 'dream', 'actual', 'owedBack']) errs.push(...valueErrors(l[k], lw + '.' + k));
    });
  });
  (doc.blindRounds || []).forEach((r, i) => {
    if (!r.id) errs.push('blindRounds[' + i + '].id is missing');
    for (const [k, v] of Object.entries(r.estimates || {})) errs.push(...valueErrors(v, 'blindRounds[' + i + '].' + k));
  });
  const KINDS = ['spend', 'transfer', 'card-payment', 'refund', 'reimbursement', 'income', 'fee'];
  (doc.transactions || []).forEach((t, i) => {
    const w = 'transactions[' + i + ']';
    if (!t.id || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '') || typeof t.amount !== 'number') errs.push(w + ': needs id, date, and amount');
    if (!KINDS.includes(t.kind)) errs.push(w + '.kind: "' + t.kind + '" is not one of ' + KINDS.join(', '));
  });
  if (!/^\d{4}-\d{2}$/.test(doc.currentMonth || '')) errs.push('currentMonth must be YYYY-MM');
  (doc.months || []).forEach((m, i) => {
    if (!/^\d{4}-\d{2}$/.test(m.key || '')) errs.push('months[' + i + '].key must be YYYY-MM');
    if (!m.snapshot) errs.push('months[' + i + '].snapshot is missing');
  });
  return errs;
}

// Checks a household document and returns a list of problems (empty = valid).
// The store refuses to save a document that fails validation.

import { valueErrors } from './value.js';
import { CATEGORY_TYPE_IDS, LINE_TYPE_IDS } from './types.js';
import {
  SCHEMA_VERSION, LIVING_WITH, SITUATIONS, FILING_STATUSES, INCOME_TYPES, PAY_FREQUENCIES, PAY_BASES, WITHHOLDING, DEDUCTION_KIND_IDS,
  ITEM_STATES, LINE_KINDS, LINE_PATHS, LINE_TAGS, DEBT_TYPES
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
  for (const s of doc.situation || []) oneOf(errs, SITUATIONS, s, 'situation');
  oneOf(errs, FILING_STATUSES, doc.household && doc.household.filingStatus, 'household.filingStatus');
  oneOf(errs, LIVING_WITH, doc.household && doc.household.livingWith, 'household.livingWith', true);
  errs.push(...valueErrors(doc.gut, 'gut'));

  const ids = new Set();
  const seen = (id, where) => { if (ids.has(id)) errs.push(where + ': duplicate id ' + id); ids.add(id); };

  const tagIds = new Set();
  (doc.tags || []).forEach((t, i) => {
    if (!t.id || tagIds.has(t.id)) errs.push('tags[' + i + ']: missing or duplicate id');
    if (typeof t.name !== 'string' || !t.name.trim()) errs.push('tags[' + i + ']: name is empty');
    tagIds.add(t.id);
  });
  (doc.income || []).forEach((inc, i) => {
    const w = 'income[' + i + ']';
    seen(inc.id, w);
    oneOf(errs, INCOME_TYPES, inc.type, w + '.type');
    oneOf(errs, PAY_FREQUENCIES, inc.payFrequency, w + '.payFrequency');
    oneOf(errs, ITEM_STATES, inc.state, w + '.state');
    oneOf(errs, PAY_BASES, inc.payBasis, w + '.payBasis');
    if (inc.withholding !== undefined) oneOf(errs, WITHHOLDING, inc.withholding, w + '.withholding');
    if (inc.benefitWeeksLeft !== undefined && inc.benefitWeeksLeft !== null && !(typeof inc.benefitWeeksLeft === 'number' && inc.benefitWeeksLeft >= 0)) errs.push(w + '.benefitWeeksLeft must be 0 or more, or empty');
    for (const k of ['takeHome', 'gross', 'hourlyRate']) errs.push(...valueErrors(inc[k], w + '.' + k));
    for (const [k, v] of Object.entries(inc.withheld || {})) errs.push(...valueErrors(v, w + '.withheld.' + k));
    (inc.deductions || []).forEach((d, j) => {
      const dw = w + '.deductions[' + j + ']';
      seen(d.id, dw);
      oneOf(errs, DEDUCTION_KIND_IDS, d.kind, dw + '.kind');
      oneOf(errs, ['percent', 'amount'], d.mode, dw + '.mode');
      if (d.percent !== null && !(typeof d.percent === 'number' && d.percent >= 0 && d.percent <= 100)) errs.push(dw + '.percent must be 0 to 100 or empty');
      errs.push(...valueErrors(d.amount, dw + '.amount'));
    });
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
    if (c.split !== undefined && typeof c.split !== 'boolean') errs.push(w + '.split must be true or false');
    if (c.type !== undefined) oneOf(errs, CATEGORY_TYPE_IDS, c.type, w + '.type');
    errs.push(...valueErrors(c.estimate, w + '.estimate'), ...valueErrors(c.dream, w + '.dream'));
    (c.lines || []).forEach((l, j) => {
      const lw = w + '.lines[' + j + '] ' + l.id;
      seen(l.id, lw);
      oneOf(errs, LINE_KINDS, l.kind, lw + '.kind');
      if (l.type !== undefined) oneOf(errs, LINE_TYPE_IDS, l.type, lw + '.type');
      oneOf(errs, LINE_PATHS, l.path, lw + '.path');
      oneOf(errs, LINE_TAGS, l.tag, lw + '.tag');
      oneOf(errs, ITEM_STATES, l.state, lw + '.state');
      if (l.joy !== null && !(Number.isInteger(l.joy) && l.joy >= 1 && l.joy <= 10)) errs.push(lw + '.joy must be 1 to 10 or empty');
      for (const k of ['estimate', 'dream', 'actual', 'owedBack']) errs.push(...valueErrors(l[k], lw + '.' + k));
      (l.tags || []).forEach((t) => { if (!tagIds.has(t)) errs.push(lw + '.tags: unknown tag ' + t); });
    });
  });
  (doc.blindRounds || []).forEach((r, i) => {
    if (!r.id) errs.push('blindRounds[' + i + '].id is missing');
    for (const [k, v] of Object.entries(r.estimates || {})) errs.push(...valueErrors(v, 'blindRounds[' + i + '].' + k));
  });
  if (doc.eras) {
    errs.push(...valueErrors(doc.eras.cashNow, 'eras.cashNow'));
    (doc.eras.list || []).forEach((e, i) => {
      const w = 'eras[' + i + ']';
      seen(e.id, w);
      if (!(Number.isInteger(e.months) && e.months >= 1 && e.months <= 600)) errs.push(w + '.months must be 1 to 600');
      if (!(Number.isInteger(e.gapMonths) && e.gapMonths >= 0 && e.gapMonths <= 600)) errs.push(w + '.gapMonths must be 0 to 600');
      for (const k of ['takeHome', 'spending', 'oneTime']) errs.push(...valueErrors(e[k], w + '.' + k));
    });
  }
  if (doc.nextStage) {
    const ns = doc.nextStage;
    for (const k of ['takeHome', 'transitionTakeHome', 'laterTakeHome', 'cashOnHand']) errs.push(...valueErrors(ns[k], 'nextStage.' + k));
    for (const c of ['disaster', 'dream']) {
      const o = (ns.cases || {})[c] || {};
      for (const k of ['takeHome', 'transitionTakeHome', 'laterTakeHome']) errs.push(...valueErrors(o[k], 'nextStage.cases.' + c + '.' + k));
      for (const k of ['hoursPerWeek', 'transitionMonths', 'laterAfterMonths']) if (o[k] !== null && o[k] !== undefined && !(typeof o[k] === 'number' && o[k] >= 0)) errs.push('nextStage.cases.' + c + '.' + k + ' must be a number 0 or more, or empty');
    }
    for (const list of ['oneOffCosts', 'costChanges']) (ns[list] || []).forEach((c, i) => errs.push(...valueErrors(c.amount, 'nextStage.' + list + '[' + i + ']')));
    for (const k of ['hoursPerWeek', 'transitionMonths', 'laterAfterMonths']) if (ns[k] !== null && !(typeof ns[k] === 'number' && ns[k] >= 0)) errs.push('nextStage.' + k + ' must be a number 0 or more, or empty');
  }
  const KINDS = ['spend', 'transfer', 'card-payment', 'refund', 'reimbursement', 'income', 'fee'];
  (doc.transactions || []).forEach((t, i) => {
    const w = 'transactions[' + i + ']';
    if (!t.id || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '') || typeof t.amount !== 'number') errs.push(w + ': needs id, date, and amount');
    if (!KINDS.includes(t.kind)) errs.push(w + '.kind: "' + t.kind + '" is not one of ' + KINDS.join(', '));
  });
  if (!/^\d{4}-\d{2}$/.test(doc.currentMonth || '')) errs.push('currentMonth must be YYYY-MM');
  for (const [k, lines] of Object.entries(doc.monthActuals || {})) {
    if (!/^\d{4}-\d{2}$/.test(k)) errs.push('monthActuals key ' + k + ' must be YYYY-MM');
    if (k === doc.currentMonth) errs.push('monthActuals must not hold the month being worked on (' + k + ')');
    for (const [id, v] of Object.entries(lines)) errs.push(...valueErrors(v, 'monthActuals.' + k + '.' + id));
  }
  (doc.months || []).forEach((m, i) => {
    if (!/^\d{4}-\d{2}$/.test(m.key || '')) errs.push('months[' + i + '].key must be YYYY-MM');
    if (!m.snapshot) errs.push('months[' + i + '].snapshot is missing');
  });
  return errs;
}

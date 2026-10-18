// Checks a household document and returns a list of problems (empty = valid).
// The store refuses to save a document that fails validation.

import { valueErrors, STATUSES } from './value.js';
import { CATEGORY_TYPE_IDS, LINE_TYPE_IDS } from './types.js';
import { PLAN_DECISIONS } from './plans.js';
import { ENTRY_KINDS, ENTRY_SOURCES } from './log.js';
import {
  SCHEMA_VERSION, LIVING_WITH, SITUATIONS, FILING_STATUSES, INCOME_TYPES, PAY_FREQUENCIES, PAY_BASES, WITHHOLDING, DEDUCTION_KIND_IDS,
  ITEM_STATES, LINE_KINDS, LINE_PATHS, LINE_TAGS, DEBT_TYPES, ACCOUNT_TYPES, ACCOUNT_STATES, ERA_SPEND_FROM
} from './schema.js';

// A date with a status (S-086).
function dateErrors(v, where) {
  const errs = [];
  if (v.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) errs.push(where + ': date must be YYYY-MM-DD or empty');
  if (v.status !== null && !STATUSES.includes(v.status)) errs.push(where + ': unknown status ' + v.status);
  return errs;
}

function dayErrors(errs, v, max, where) {
  if (!v) return;
  errs.push(...valueErrors(v, where));
  if (v.amount !== null && !(Number.isInteger(v.amount) && v.amount >= 1 && v.amount <= max)) errs.push(where + ' must be a whole number, 1 to ' + max);
}

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

  if (doc.household && doc.household.parentsPlan !== undefined && typeof doc.household.parentsPlan !== 'boolean') errs.push('household.parentsPlan must be true or false');
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
    if (inc.nextPayDate) errs.push(...dateErrors(inc.nextPayDate, w + '.nextPayDate'));
    if (inc.payDays !== undefined && !(Array.isArray(inc.payDays) && inc.payDays.length === 2 && inc.payDays.every((d) => Number.isInteger(d) && d >= 1 && d <= 31))) errs.push(w + '.payDays must be two days, 1 to 31');
    for (const [k, v] of Object.entries(inc.withheld || {})) errs.push(...valueErrors(v, w + '.withheld.' + k));
    if (inc.extraWithholding !== undefined) errs.push(...valueErrors(inc.extraWithholding, w + '.extraWithholding'));
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
    if (d.payWith !== undefined) oneOf(errs, ['minimum', 'statement'], d.payWith, w + '.payWith');
  });
  (doc.categories || []).forEach((c, i) => {
    const w = 'categories[' + i + '] ' + c.id;
    seen(c.id, w);
    oneOf(errs, ITEM_STATES, c.state, w + '.state');
    if (c.split !== undefined && typeof c.split !== 'boolean') errs.push(w + '.split must be true or false');
    if (c.type !== undefined) oneOf(errs, CATEGORY_TYPE_IDS, c.type, w + '.type');
    errs.push(...valueErrors(c.estimate, w + '.estimate'), ...valueErrors(c.dream, w + '.dream'));
    if (c.dreamLong !== undefined) errs.push(...valueErrors(c.dreamLong, w + '.dreamLong'));
    (c.lines || []).forEach((l, j) => {
      const lw = w + '.lines[' + j + '] ' + l.id;
      seen(l.id, lw);
      oneOf(errs, LINE_KINDS, l.kind, lw + '.kind');
      if (l.type !== undefined) oneOf(errs, LINE_TYPE_IDS, l.type, lw + '.type');
      oneOf(errs, LINE_PATHS, l.path, lw + '.path');
      oneOf(errs, LINE_TAGS, l.tag, lw + '.tag');
      oneOf(errs, ITEM_STATES, l.state, lw + '.state');
      if (l.joy !== null && !(Number.isInteger(l.joy) && l.joy >= 1 && l.joy <= 10)) errs.push(lw + '.joy must be 1 to 10 or empty');
      if (l.stress !== undefined && l.stress !== null && !(Number.isInteger(l.stress) && l.stress >= 1 && l.stress <= 10)) errs.push(lw + '.stress must be 1 to 10 or empty');
      for (const k of ['estimate', 'dream', 'actual', 'owedBack']) errs.push(...valueErrors(l[k], lw + '.' + k));
      if (l.dreamLong !== undefined) errs.push(...valueErrors(l.dreamLong, lw + '.dreamLong'));
      dayErrors(errs, l.dueDay, 31, lw + '.dueDay');
      dayErrors(errs, l.dueMonth, 12, lw + '.dueMonth');
      (l.tags || []).forEach((t) => { if (!tagIds.has(t)) errs.push(lw + '.tags: unknown tag ' + t); });
    });
  });
  (doc.blindRounds || []).forEach((r, i) => {
    if (!r.id) errs.push('blindRounds[' + i + '].id is missing');
    for (const [k, v] of Object.entries(r.estimates || {})) errs.push(...valueErrors(v, 'blindRounds[' + i + '].' + k));
  });
  const acctIds = new Set();
  (doc.accounts || []).forEach((a, i) => {
    const w = 'accounts[' + i + ']';
    seen(a.id, w);
    acctIds.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim()) errs.push(w + ': name is empty');
    oneOf(errs, ACCOUNT_TYPES, a.type, w + '.type');
    oneOf(errs, ACCOUNT_STATES, a.state, w + '.state');
    if (a.debtId && !(doc.debts || []).some((d) => d.id === a.debtId)) errs.push(w + '.debtId: unknown debt ' + a.debtId);
  });
  for (const [m, accts] of Object.entries(doc.balances || {})) {
    if (!/^\d{4}-\d{2}$/.test(m)) errs.push('balances key ' + m + ' must be YYYY-MM');
    for (const [id, b] of Object.entries(accts)) {
      if (!acctIds.has(id)) errs.push('balances.' + m + ': unknown account ' + id);
      errs.push(...valueErrors(b.start, 'balances.' + m + '.' + id + '.start'), ...valueErrors(b.end, 'balances.' + m + '.' + id + '.end'));
      for (const k of ['startOn', 'endOn']) if (b[k] !== undefined && !(typeof b[k] === 'string' && b[k].slice(0, 7) === m && /^\d{4}-\d{2}-\d{2}$/.test(b[k]))) errs.push('balances.' + m + '.' + id + '.' + k + ' must be a day in ' + m);
    }
  }
  if (doc.cashflow) {
    const cf = doc.cashflow;
    errs.push(...valueErrors(cf.cushion, 'cashflow.cushion'));
    for (const [k, mv] of Object.entries(cf.moves || {})) if (mv.to !== null && !/^\d{4}-\d{2}-\d{2}$/.test(mv.to || '')) errs.push('cashflow.moves.' + k + ': the new date must be YYYY-MM-DD, or none to skip');
    (cf.checks || []).forEach((c, i) => {
      if (!acctIds.has(c.accountId)) errs.push('cashflow.checks[' + i + ']: unknown account ' + c.accountId);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) errs.push('cashflow.checks[' + i + ']: needs a date');
      errs.push(...valueErrors(c.amount, 'cashflow.checks[' + i + '].amount'));
    });
    for (const [m, f] of Object.entries(cf.forecasts || {})) if (!/^\d{4}-\d{2}$/.test(m) || typeof f.predicted !== 'number') errs.push('cashflow.forecasts.' + m + ' needs a month and a number');
  }
  if (doc.eras) {
    (doc.eras.list || []).forEach((e, i) => {
      const w = 'eras[' + i + ']';
      seen(e.id, w);
      if (!(Number.isInteger(e.months) && e.months >= 1 && e.months <= 600)) errs.push(w + '.months must be 1 to 600');
      if (!(Number.isInteger(e.gapMonths) && e.gapMonths >= 0 && e.gapMonths <= 600)) errs.push(w + '.gapMonths must be 0 to 600');
      for (const k of ['takeHome', 'spending', 'oneTime']) errs.push(...valueErrors(e[k], w + '.' + k));
      // Where blank spending starts (S-097); absent means the template's share.
      if (e.spendFrom !== undefined && !ERA_SPEND_FROM.includes(e.spendFrom)) errs.push(w + '.spendFrom is unknown');
    });
  }
  const lineIds = new Set((doc.categories || []).flatMap((c) => (c.lines || []).map((l) => l.id)));
  const catIds = new Set((doc.categories || []).map((c) => c.id));
  for (const [m, p] of Object.entries(doc.plans || {})) {
    const w = 'plans.' + m;
    if (!/^\d{4}-\d{2}$/.test(m)) errs.push(w + ': the month must be YYYY-MM');
    for (const [k, e] of Object.entries(p.lines || {})) {
      const known = k.startsWith('cat:') ? catIds.has(k.slice(4)) : lineIds.has(k);
      if (!known) errs.push(w + ': unknown line ' + k);
      oneOf(errs, PLAN_DECISIONS, e.decision, w + '.' + k + '.decision');
      errs.push(...valueErrors(e.amount, w + '.' + k + '.amount'), ...valueErrors(e.start, w + '.' + k + '.start'));
      if (typeof e.reviewed !== 'boolean') errs.push(w + '.' + k + '.reviewed must be true or false');
    }
  }
  if (doc.nextStage) {
    const ns = doc.nextStage;
    for (const k of ['takeHome', 'transitionTakeHome', 'laterTakeHome']) errs.push(...valueErrors(ns[k], 'nextStage.' + k));
    for (const c of ['disaster', 'dream']) {
      const o = (ns.cases || {})[c] || {};
      for (const k of ['takeHome', 'transitionTakeHome', 'laterTakeHome']) errs.push(...valueErrors(o[k], 'nextStage.cases.' + c + '.' + k));
      for (const k of ['hoursPerWeek', 'transitionMonths', 'laterAfterMonths']) if (o[k] !== null && o[k] !== undefined && !(typeof o[k] === 'number' && o[k] >= 0)) errs.push('nextStage.cases.' + c + '.' + k + ' must be a number 0 or more, or empty');
    }
    for (const list of ['oneOffCosts', 'costChanges']) (ns[list] || []).forEach((c, i) => errs.push(...valueErrors(c.amount, 'nextStage.' + list + '[' + i + ']')));
    for (const k of ['hoursPerWeek', 'transitionMonths', 'laterAfterMonths']) if (ns[k] !== null && !(typeof ns[k] === 'number' && ns[k] >= 0)) errs.push('nextStage.' + k + ' must be a number 0 or more, or empty');
  }
  const txIds = new Set((doc.transactions || []).map((t) => t.id));
  if (txIds.size !== (doc.transactions || []).length) errs.push('transactions: duplicate id');
  (doc.transactions || []).forEach((t, i) => {
    const w = 'transactions[' + i + ']';
    if (!t.id || !/^\d{4}-\d{2}-\d{2}$/.test(t.date || '') || typeof t.amount !== 'number' || !Number.isFinite(t.amount)) errs.push(w + ': needs id, date, and amount');
    oneOf(errs, ENTRY_KINDS, t.kind, w + '.kind');
    oneOf(errs, ENTRY_SOURCES, t.source, w + '.source');
    if (t.account && !acctIds.has(t.account)) errs.push(w + '.account: unknown account ' + t.account);
    if (t.lineId && !lineIds.has(t.lineId)) errs.push(w + '.lineId: unknown line ' + t.lineId);
    (t.possible || []).forEach((id) => { if (!txIds.has(id)) errs.push(w + '.possible: unknown entry ' + id); });
    if (t.owed !== undefined && !(typeof t.owed === 'number' && t.owed > 0 && t.owed <= Math.abs(t.amount))) errs.push(w + '.owed must be more than 0 and no more than the amount');
    if (t.settles !== undefined && !txIds.has(t.settles)) errs.push(w + '.settles: unknown entry ' + t.settles);
  });
  if (!/^\d{4}-\d{2}$/.test(doc.currentMonth || '')) errs.push('currentMonth must be YYYY-MM');
  if (doc.settings && doc.settings.materiality !== undefined && !(typeof doc.settings.materiality === 'number' && doc.settings.materiality >= 0)) errs.push('settings.materiality must be 0 or more');
  if (doc.coachNotes !== undefined && typeof doc.coachNotes !== 'string') errs.push('coachNotes must be text');
  (doc.estimateLog || []).forEach((e, i) => {
    const w = 'estimateLog[' + i + ']';
    if (!e.lineId === !e.categoryId) errs.push(w + ': needs a lineId or a categoryId');
    if (!e.at || !/^\d{4}-\d{2}$/.test(e.month || '')) errs.push(w + ': needs at and month');
    if (e.to) errs.push(...valueErrors(e.to, w + '.to'));
    if (e.from) errs.push(...valueErrors(e.from, w + '.from'));
  });
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

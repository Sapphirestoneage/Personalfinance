/* The engine's front door. Takes a record and the data libraries, runs every
   planet's five stations against the Sun, then the projection, metrics,
   lenses and leverage. Returns one frozen result that views read from.
   Level 1 publishes fills (confidence) per planet and per row type, the
   needs list per planet, and the summary-or-detail reconciliation. */

import { PLANETS, SUN_FIELDS } from './sun.js';
import { confidenceOf, hasValue, numberOf } from './states.js';
import { cadenceToMonthly } from './units.js';

export function fillOf(fields) {
  const list = fields.filter(f => f && f.state !== 'not-applicable' && f.state !== 'not-for-me');
  if (!list.length) return 0;
  const total = list.reduce((s, f) => s + confidenceOf(f), 0);
  return Math.round((total / list.length) * 1000) / 1000;
}

const PAYCHECKS = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

export function paychecksPerYear(row) {
  const pf = row.f.payFrequency && hasValue(row.f.payFrequency) ? row.f.payFrequency.v : 'biweekly';
  return PAYCHECKS[pf] || 26;
}

/* Monthly cents of a money field on a row, or null when it has no value. */
export function monthlyOf(row, fieldId) {
  const f = row.f[fieldId];
  if (!f || !hasValue(f)) return null;
  const n = numberOf(f);
  if (n === null) return null;
  return cadenceToMonthly(n, f.cad || 'month', paychecksPerYear(row));
}

const SUMMARY_TYPES = { spending: { summary: 'summaryTotal', detail: ['line'], field: 'amount' }, debt: { summary: 'debtSummaryTotal', detailAll: true, field: 'balance' }, invest: { summary: 'investSummaryTotal', detail: ['account'], field: 'accountBalance' } };

export function compute(record, data) {
  const fills = {};
  const typeFills = {};
  const needs = {};
  const rowCounts = {};
  const fieldsData = data && data.fields;
  fills.sun = fillOf(SUN_FIELDS.map(id => record.sun.f[id]));
  PLANETS.forEach(p => {
    const rows = record.planets[p].rows;
    rowCounts[p] = rows.length;
    const all = [];
    typeFills[p] = {};
    needs[p] = [];
    const byType = {};
    rows.forEach(r => { (byType[r.type] = byType[r.type] || []).push(r); Object.keys(r.f).forEach(k => all.push(r.f[k])); });
    fills[p] = all.length ? fillOf(all) : null;
    if (fieldsData && fieldsData.planets[p]) {
      Object.keys(fieldsData.planets[p].types).forEach(tid => {
        const list = byType[tid] || [];
        const fs = [];
        list.forEach(r => Object.keys(r.f).forEach(k => fs.push(r.f[k])));
        typeFills[p][tid] = list.length ? fillOf(fs) : null;
        const tdef = fieldsData.planets[p].types[tid];
        const primId = tdef.fields.find(fid => fieldsData.fields[fid].primary) || tdef.fields.find(fid => fieldsData.fields[fid].kind === 'money') || tdef.fields[0];
        list.forEach(r => {
          const f = r.f[primId];
          if (!f || f.state === 'unknown' || f.state === 'will-send') needs[p].push({ type: tid, rowId: r.id, field: primId, label: (r.nickname ? r.nickname + ': ' : '') + fieldsData.fields[primId].label });
        });
      });
    }
  });
  /* Summary or detail: a rough total entered once; detail overrides when lines exist. */
  const summaries = {};
  Object.keys(SUMMARY_TYPES).forEach(p => {
    const cfg = SUMMARY_TYPES[p];
    const rows = record.planets[p].rows;
    const summaryRow = rows.find(r => r.type === 'summary');
    const totalCents = summaryRow && summaryRow.f[cfg.summary] && hasValue(summaryRow.f[cfg.summary]) ? (p === 'spending' ? monthlyOf(summaryRow, cfg.summary) : numberOf(summaryRow.f[cfg.summary])) : null;
    const detailRows = rows.filter(r => r.type !== 'summary' && r.type !== 'score' && r.type !== 'holding' && (cfg.detailAll || cfg.detail.includes(r.type)));
    let detailCents = null;
    detailRows.forEach(r => {
      const fid = r.f[cfg.field] ? cfg.field : Object.keys(r.f).find(k => fieldsData && fieldsData.fields[k] && fieldsData.fields[k].primary && fieldsData.fields[k].kind === 'money');
      if (!fid) return;
      const v = p === 'spending' ? monthlyOf(r, fid) : (r.f[fid] && hasValue(r.f[fid]) ? numberOf(r.f[fid]) : null);
      if (v !== null) detailCents = (detailCents || 0) + v;
    });
    summaries[p] = { totalCents, detailCents, effectiveCents: detailCents !== null ? detailCents : totalCents, source: detailCents !== null ? 'detail' : (totalCents !== null ? 'summary' : null) };
  });
  return Object.freeze({
    computedAt: new Date().toISOString(),
    fills: Object.freeze(fills),
    typeFills: Object.freeze(typeFills),
    needs: Object.freeze(needs),
    rowCounts: Object.freeze(rowCounts),
    summaries: Object.freeze(summaries),
  });
}

/* The engine's front door. Takes a record and the data libraries, runs every
   planet's five stations against the Sun in order (Income, Spending, Debt,
   Investments, Safety Net, Taxes, Life Plan), then the projection, the 48
   metrics, the 19 lenses and the leverage ranking. Returns one frozen result;
   views read from it and never do math. */

import { PLANETS, SUN_FIELDS, createSun, publish, readerFor } from './sun.js';
import { confidenceOf, hasValue, numberOf } from './states.js';
import { cadenceToMonthly, isNeeds, isQ } from './units.js';
import { ageAt } from './format.js';
import * as Income from './planets/income.js';
import * as Spending from './planets/spending.js';
import * as Debt from './planets/debt.js';
import * as Invest from './planets/invest.js';
import * as Safety from './planets/safety.js';
import * as Taxes from './planets/taxes.js';
import * as Life from './planets/life.js';
import { computeMetrics } from './metrics.js';
import { computeLenses } from './lenses.js';
import { tripleD, project, socialSecurityMonthly } from './projection.js';

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
export function monthlyOf(row, fieldId) {
  const f = row.f[fieldId];
  if (!f || !hasValue(f)) return null;
  const n = numberOf(f);
  if (n === null) return null;
  return cadenceToMonthly(n, f.cad || 'month', paychecksPerYear(row));
}

const SUMMARY_TYPES = { spending: { summary: 'summaryTotal', detail: ['line'], field: 'amount' }, debt: { summary: 'debtSummaryTotal', detailAll: true, field: 'balance' }, invest: { summary: 'investSummaryTotal', detail: ['account'], field: 'accountBalance' } };
const RUNNERS = { income: Income, spending: Spending, debt: Debt, invest: Invest, safety: Safety, taxes: Taxes, life: Life };
const ORDER = ['income', 'spending', 'debt', 'invest', 'safety', 'taxes', 'life'];

export function assumptionsFor(record, data) {
  const base = data && data.assumptions ? data.assumptions.defaults : {};
  return Object.assign({}, base, (record.sun && record.sun.assumptions) || {});
}

export function compute(record, data, opts) {
  const today = (opts && opts.today) || new Date().toISOString().slice(0, 10);
  const fills = {}; const typeFills = {}; const needs = {}; const rowCounts = {};
  const fieldsData = data && data.fields;
  fills.sun = fillOf(SUN_FIELDS.map(id => record.sun.f[id]));
  PLANETS.forEach(p => {
    const rows = record.planets[p].rows;
    rowCounts[p] = rows.length;
    const all = []; typeFills[p] = {}; needs[p] = [];
    const byType = {};
    rows.forEach(r => { (byType[r.type] = byType[r.type] || []).push(r); Object.keys(r.f).forEach(k => all.push(r.f[k])); });
    fills[p] = all.length ? fillOf(all) : null;
    if (fieldsData && fieldsData.planets[p]) {
      Object.keys(fieldsData.planets[p].types).forEach(tid => {
        const list = byType[tid] || []; const fs = [];
        list.forEach(r => Object.keys(r.f).forEach(k => fs.push(r.f[k])));
        typeFills[p][tid] = list.length ? fillOf(fs) : null;
        const tdef = fieldsData.planets[p].types[tid];
        const primId = tdef.fields.find(fid => fieldsData.fields[fid].primary) || tdef.fields.find(fid => fieldsData.fields[fid].kind === 'money') || tdef.fields[0];
        list.forEach(r => { const f = r.f[primId]; if (!f || f.state === 'unknown' || f.state === 'will-send') needs[p].push({ type: tid, rowId: r.id, field: primId, label: (r.nickname ? r.nickname + ': ' : '') + fieldsData.fields[primId].label }); });
      });
    }
  });
  const summaries = {};
  Object.keys(SUMMARY_TYPES).forEach(p => {
    const cfg = SUMMARY_TYPES[p]; const rows = record.planets[p].rows;
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

  /* The planets, hub and spoke. */
  const result = { computedAt: new Date().toISOString(), today, fills, typeFills, needs, rowCounts, summaries, sun: null, metrics: null, lenses: [], projection: null, enriched: {}, debts: [] };
  if (!data || !data.metrics) return Object.freeze(result);
  const asm = assumptionsFor(record, data);
  const sun = createSun(); sun.f = record.sun.f; sun.assumptions = asm;
  const facts = record.sun.f;
  const filing = facts.filingStatus && hasValue(facts.filingStatus) ? facts.filingStatus.v : 'single';
  let debts = [], interestParts = [];
  ORDER.forEach(p => {
    const ctx = { rows: record.planets[p].rows, reader: readerFor(sun, p), data, asm, today, record, filingStatus: filing };
    const r = RUNNERS[p].run(ctx);
    publish(sun, p, r.outputs);
    result.enriched[p] = r.enriched || [];
    if (p === 'debt') { debts = r.debts || []; interestParts = r.interestParts || []; result.payoffSeries = r.payoffSeries || []; }
  });
  const birth = facts.birthDate && hasValue(facts.birthDate) ? facts.birthDate.v : null;
  const age = birth ? ageAt(birth, today) : null;
  const S = sun.outputs;

  /* Projection inputs from the slots. */
  let projection = null, oneMorePoint = null, contribAnnual = 0, ssMonthly = 0;
  const take = isQ(S.income.takeHomeMonthly) ? S.income.takeHomeMonthly : null;
  const spending = isQ(S.safety.spendingWithPremiums) ? S.safety.spendingWithPremiums : null;
  const invested = isQ(S.invest.investedAssets) ? S.invest.investedAssets : null;
  const cash = isQ(S.invest.cashBalances) ? S.invest.cashBalances : null;
  if (age !== null && take && spending && invested && cash && isQ(S.income.grossMonthly) && isQ(S.debt.debtServiceMonthly)) {
    const service = S.debt.debtServiceMonthly.cents;
    const landing = isQ(S.spending.savingsLandingMonthly) ? S.spending.savingsLandingMonthly.cents : 0;
    const surplus = take.cents - spending.cents - service;
    const leak = surplus - landing;
    ssMonthly = socialSecurityMonthly(S.income.grossMonthly.cents, data.limits2026, asm.socialSecurityScale);
    const inp = {
      age, year: parseInt(today.slice(0, 4), 10), today, invested: invested.cents, cash: cash.cents, debts, debtOrder: S.debt.payoffOrders.orders.avalanche,
      annualSpend: spending.cents * 12, employeeAnnual: S.invest.annualContributions.employee, employerAnnual: S.invest.annualContributions.employer,
      leakAnnual: leak * 12, debtServiceAnnual: service * 12, retirementAge: S.life.retirementAge || asm.retirementAgeDefault, ssMonthly, asm, mult: S.life.retirementMultipliers,
    };
    contribAnnual = inp.employeeAnnual + inp.employerAnnual;
    projection = tripleD(inp);
    if (projection.likely.fiAge !== null) {
      const more = Math.round(take.cents * 0.01);
      const alt = project(Object.assign({}, inp, { extraContribAnnual: more * 12, leakAnnual: inp.leakAnnual - more * 12 }), asm.returnLikely);
      oneMorePoint = { monthly: more, fiAge: alt.fiAge, months: alt.fiAge === null ? 0 : (projection.likely.fiAge - alt.fiAge) * 12 };
    }
    projection.ssMonthly = ssMonthly;
    result.projectionInputs = inp;
  }
  const metrics = computeMetrics({ sun, facts, asm, data, today, age, birthMonth: birth ? birth.slice(5, 7) : '01', projection, debts, interestParts, oneMorePoint, contribAnnual });
  const lenses = computeLenses({ metrics, sun, asm, data, age, debts, today });
  result.sun = sun; result.metrics = metrics; result.lenses = lenses; result.projection = projection; result.debts = debts; result.asm = asm; result.age = age;
  return Object.freeze(result);
}

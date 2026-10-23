// The Ledger's model: every Fact in the spine as a row, grouped by DAITE, and
// the "still guessing" list (rough and missing fields, ordered by how much
// they change the results). No DOM here.

import { listFacts, getAt, setAt, addMonths, result, valueOf } from './spine.js';
import { fieldsFor, FILING_STATUSES, SITUATIONS, COVERAGES, PLAN_TYPES } from './schema.js';
import { labelFor, groupFor, GROUPS } from './labels.js';
import { summarize } from './summary.js';
import { project } from './projection.js';

// The field type of a path, from the schema: money, rate, date, int, text, bool, choice:a|b, list.
export function typeFor(spine, path) {
  const s = path.split('.');
  if (s[0] === 'household') {
    if (s[1] === 'people') return 'date';
    if (s[1] === 'filingStatus') return 'choice:' + FILING_STATUSES.join('|');
    if (s[1] === 'nycResident') return 'bool';
    if (s[1] === 'situation') return 'choice:' + SITUATIONS.join('|');
    if (s[1] === 'healthCoverage') return s[3] === 'planType' ? 'choice:' + PLAN_TYPES.join('|') : s[3] === 'enrolled' ? 'bool' : s[3] === 'setAside' ? 'money' : 'choice:' + COVERAGES.join('|');
    return 'text';
  }
  if (s[0] === 'income') return s[2] === 'likelihood' ? 'rate' : 'money';
  if (s[0] === 'expenses' || s[0] === 'taxYears') return 'money';
  if (s[0] === 'accounts' || s[0] === 'debts') {
    const item = getAt(spine, s[0] + '.' + s[1]);
    return (item && fieldsFor(item.family)[s[2]]) || 'text';
  }
  if (s[0] === 'goals') return 'money';
  if (s[0] === 'assumptions') return s[1] === 'lifeExpectancy' || s[1] === 'coastAge' ? 'int' : 'rate';
  return 'text';
}

// A card's APR, intro rate and intro end are one Ledger row, "Interest rate"
// (S-161). The row sits at the APR's path; its value is { apr, intro }.
const CARD_RATE = ['apr', 'promoApr', 'promoEnds'];
const isCard = (spine, id) => { const d = getAt(spine, 'debts.' + id); return !!d && d.type === 'credit_card'; };

export function hasIntro(card) {
  const on = (f) => !!f && f.kind !== 'notForMe';
  return on(card.promoEnds) && (valueOf(card.promoEnds) !== null || on(card.promoApr));
}

// Kinds of several Facts as one chip: missing wins, then not for me (on the
// APR), then rough, then known.
function combinedKind(facts) {
  if (facts.some((f) => !f || f.kind === 'missing')) return 'missing';
  if (facts[0].kind === 'notForMe') return 'notForMe';
  if (facts.some((f) => f.kind === 'rough')) return 'rough';
  return facts.every((f) => f.kind === 'computed') ? 'computed' : 'known';
}

export function cardRateRow(spine, card) {
  const path = 'debts.' + card.id + '.apr';
  const intro = hasIntro(card);
  const parts = intro ? [card.apr, card.promoApr, card.promoEnds] : [card.apr];
  const kind = combinedKind(parts);
  const value = card.apr.kind === 'notForMe' ? null : { apr: valueOf(card.apr), intro: intro ? { rate: valueOf(card.promoApr), ends: valueOf(card.promoEnds) } : null };
  return { path, label: labelFor(spine, path), group: 'D', type: 'cardRate', fact: { value: value && (value.apr !== null || value.intro) ? value : null, kind }, members: CARD_RATE.map((k) => 'debts.' + card.id + '.' + k) };
}

// The Ledger row a field lives on (a card's intro fields live on its rate row).
export function rowPathFor(spine, path) {
  const s = path.split('.');
  return s[0] === 'debts' && isCard(spine, s[1]) && CARD_RATE.includes(s[2]) ? 'debts.' + s[1] + '.apr' : path;
}

export function ledgerRows(spine) {
  const rows = [];
  for (const { path, fact } of listFacts(spine)) {
    const s = path.split('.');
    if (s[0] === 'debts' && isCard(spine, s[1]) && CARD_RATE.includes(s[2])) {
      if (s[2] === 'apr') rows.push(cardRateRow(spine, getAt(spine, 'debts.' + s[1])));
      continue;
    }
    rows.push({ path, label: labelFor(spine, path), group: groupFor(path), type: typeFor(spine, path), fact });
  }
  return GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.group === g.id) }));
}

// The headline numbers a guess is measured against, each with a scale so a
// dollar of surplus and a month of runway can be added up. outlook is cash
// in APP_PROJ_MONTHS months (expected mode), which catches dated changes
// that have not started yet (a contract, a health cost).
const METRICS = [
  ['netWorth', (s) => s.sheet.netWorth, 1000],
  ['surplus', (s) => s.cashflow.surplus, 100],
  ['runway', (s) => s.emergency.tiers.full.runway, 0.5],
  ['fiPercent', (s) => s.fi.fiPercent, 0.01],
  ['fiNumber', (s) => s.fi.fiNumber, 10000],
  ['fiImplied', (s) => s.fi.implied, 10000],
  ['yearsToFi', (s) => s.fi.yearsToFi, 1],
  ['taxDue', (s) => s.tax.balanceDue, 500],
  ['promoMonthly', (s) => s.debt.promo.monthly, 100],
  ['utilization', (s) => s.debt.utilization.personal, 0.05],
  ['outlook', (s) => s.outlook, 1000]
];

function measure(spine, rules) {
  const s = summarize(spine, rules, { flags: false });
  const months = rules.get('APP_PROJ_MONTHS', +s.asOf.slice(0, 4));
  const p = project(spine, rules, { endYm: addMonths(s.ym, months) });
  const last = p.months[p.months.length - 1];
  s.outlook = result(last ? last.cash : null, { from: p.from, rough: p.rough, missing: p.missing, rules: p.rules });
  return s;
}

// Which headline results a path blocks (its result names it as missing).
function blockedBy(sum) {
  const out = new Map();
  for (const [name, get] of METRICS) for (const p of get(sum).missing || []) { if (!out.has(p)) out.set(p, []); out.get(p).push(name); }
  for (const list of Object.values(sum.tax.missingPaths)) for (const p of list) { if (!out.has(p)) out.set(p, []); if (!out.get(p).includes('taxDue')) out.get(p).push('taxDue'); }
  return out;
}

// Rough and missing fields, ranked. Missing first, by how many headline
// results each one blocks. Then rough numbers, by how far the results move
// when the number moves by APP_GUESS_SWING. Each item carries the moves in
// dollars (surplus a month, net worth) so the list can say why it ranks.
export function stillGuessing(spine, rules) {
  const sum = measure(spine, rules);
  const swing = rules.get('APP_GUESS_SWING', +sum.asOf.slice(0, 4));
  const blocks = blockedBy(sum);
  const items = [];
  for (const { path, fact } of listFacts(spine)) {
    if (fact.kind !== 'rough' && fact.kind !== 'missing') continue;
    const item = { path, label: labelFor(spine, path), kind: fact.kind, group: groupFor(path), blocks: blocks.get(path) || [], score: 0, moves: {} };
    if (fact.kind === 'rough' && typeof fact.value === 'number' && fact.value !== 0) {
      const moved = setAt(spine, path, { ...fact, value: fact.value * (1 + swing) });
      const alt = measure(moved, rules);
      for (const [name, get, scale] of METRICS) {
        const a = get(sum).value, b = get(alt).value;
        if (typeof a === 'number' && typeof b === 'number') { const d = b - a; item.moves[name] = d; item.score += Math.abs(d) / scale; }
      }
    }
    items.push(item);
  }
  items.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'missing' ? -1 : 1) : a.kind === 'missing' ? b.blocks.length - a.blocks.length || a.path.localeCompare(b.path) : b.score - a.score));
  return { swing, items };
}


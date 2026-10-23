// The Ledger as a tree (S-169): DAITE group > section > (institution) > item >
// fields, so a card's facts sit together under its issuer under "Credit
// cards", and a Roth IRA's under "IRA > Roth IRA". Built from ledgerRows, so a
// field shows exactly once. Each node says what can be added there.

import { valueOf } from './spine.js';
import { PRESETS, FAMILIES, INCOME_TYPES, FAT } from './schema.js';
import { ledgerRows } from './ledger.js';

const v = valueOf;
const PLURAL = { 'Credit card': 'Credit cards', 'Federal student loan': 'Federal student loans', 'Private student loan': 'Private student loans', 'Auto loan': 'Auto loans', 'Personal loan': 'Personal loans', Mortgage: 'Mortgages', 'Medical debt': 'Medical debt', 'Family IOU': 'Family IOUs' };
const INCOME_LABEL = { w2: 'Paychecks (W-2)', '1099': 'Self-employed (1099)', unemployment: 'Unemployment', tips: 'Tips', rental: 'Rental income', pension: 'Pension', ss: 'Social Security', maybeMoney: 'Maybe money', other: 'Other income' };
const FAT_LABEL = { food: 'Food', accommodation: 'Housing', transportation: 'Transportation', other: 'Everything else' };

// The institution a name starts with, from data/institutions.json (display only).
export function institutionOf(item, inst) {
  const typed = v(item.institution);
  const name = typed || v(item.name) || item.label || '';
  for (const n of inst.names) if (name.toLowerCase().startsWith(n.toLowerCase())) return inst.aliases[n] || n;
  return typed || null;
}

// The field's own words inside its item: "Chase Freedom: minimum payment" -> "minimum payment".
const short = (label) => (label.includes(': ') ? label.slice(label.indexOf(': ') + 2) : label);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function counts(rows) {
  const c = { missing: 0, rough: 0, known: 0, notForMe: 0, computed: 0 };
  for (const r of rows) c[r.fact.kind] = (c[r.fact.kind] || 0) + 1;
  return c;
}

const node = (key, label, children, extra = {}) => {
  const rows = children.flatMap((ch) => ch.rows || ch.allRows || []);
  return { key, label, children, allRows: rows, counts: counts(rows), ...extra };
};
const item = (key, label, rows, extra = {}) => ({ key, label, rows: rows.map((r) => ({ ...r, field: capital(short(r.label)) })), counts: counts(rows), item: true, ...extra });

// The headline number shown on a folded item.
function summaryOf(spine, path, rows) {
  const main = rows.find((r) => /\.(balance|amount|target|fiNumber)$/.test(r.path));
  return main ? main.path : null;
}

export function ledgerTree(spine, inst) {
  const rows = ledgerRows(spine).flatMap((g) => g.rows);
  const byPrefix = (prefix) => rows.filter((r) => r.path === prefix || r.path.startsWith(prefix + '.'));
  const used = new Set();
  const take = (list) => { for (const r of list) used.add(r.path); return list; };

  // Debt: type > (institution for cards) > each debt
  const debtTypes = [...new Set((spine.debts || []).map((d) => d.type))];
  const debtSections = debtTypes.map((t) => {
    const label = PLURAL[PRESETS[t].label] || PRESETS[t].label + 's';
    const ds = spine.debts.filter((d) => d.type === t);
    const itemOf = (d) => { const r = take(byPrefix('debts.' + d.id)); return item('debts.' + d.id, v(d.name) || d.id, r, { collection: 'debts', id: d.id, summary: summaryOf(spine, 'debts.' + d.id, r) }); };
    let children;
    if (t === 'credit_card') {
      const names = [...new Set(ds.map((d) => institutionOf(d, inst) || 'Other'))];
      children = names.map((n) => node('D:' + t + ':' + n, n, ds.filter((d) => (institutionOf(d, inst) || 'Other') === n).map(itemOf)));
    } else children = ds.map(itemOf);
    return node('D:' + t, label, children, { add: { collection: 'debts', types: [t] } });
  });

  // Assets: family > type > each account
  const families = [...new Set((spine.accounts || []).map((a) => a.family))];
  const assetSections = families.map((f) => {
    const types = [...new Set(spine.accounts.filter((a) => a.family === f).map((a) => a.type))];
    const typeNodes = types.map((t) => node('A:' + f + ':' + t, PRESETS[t] ? PRESETS[t].label : t,
      spine.accounts.filter((a) => a.type === t).map((a) => { const r = take(byPrefix('accounts.' + a.id)); return item('accounts.' + a.id, v(a.name) || a.id, r, { collection: 'accounts', id: a.id, summary: summaryOf(spine, '', r) }); }),
      { add: { collection: 'accounts', types: [t] } }));
    return node('A:' + f, FAMILIES[f] ? FAMILIES[f].label : f, typeNodes, { add: { collection: 'accounts', types: Object.keys(PRESETS).filter((k) => PRESETS[k].family === f) } });
  });

  // Income: type > each stream (amount, how likely); the situation timeline
  const incomeTypes = [...new Set((spine.income || []).map((s) => s.type))];
  const incomeSections = incomeTypes.map((t) => node('I:' + t, INCOME_LABEL[t] || t,
    spine.income.filter((s) => s.type === t).map((s) => { const r = take(byPrefix('income.' + s.id).filter((x) => !x.path.includes('.withholding.'))); return item('income.' + s.id, s.label, r, { collection: 'income', id: s.id, summary: 'income.' + s.id + '.amount' }); }),
    { add: { collection: 'income', types: [t] } }));
  const situation = take(byPrefix('household.situation'));
  if (situation.length) incomeSections.push(node('I:situation', 'Your situation', [item('household.situation', 'Situation over time', situation)]));

  // Taxes: filing and you; withholding per stream; each tax year
  const filing = take(rows.filter((r) => ['household.filingStatus', 'household.state', 'household.county', 'household.nycResident'].includes(r.path) || r.path.startsWith('household.people.')));
  const taxSections = [node('T:filing', 'Filing', [item('household.filing', 'You and where you file', filing)])];
  const wh = (spine.income || []).map((s) => item('withholding.' + s.id, s.label, take(byPrefix('income.' + s.id + '.withholding')))).filter((x) => x.rows.length);
  if (wh.length) taxSections.push(node('T:withholding', 'Tax withheld', wh));
  const years = (spine.taxYears || []).map((y) => item('taxYears.' + y.id, y.year + ' tax year', take(byPrefix('taxYears.' + y.id))));
  if (years.length) taxSections.push(node('T:years', 'Tax years', years));

  // Expenses: FAT tag > each expense (one row each); health coverage
  const expSections = [...FAT, 'other'].map((tag) => {
    const list = (spine.expenses || []).filter((e) => (e.fat || 'other') === tag);
    return list.length ? node('E:' + tag, FAT_LABEL[tag], list.map((e) => { const r = take(byPrefix('expenses.' + e.id)); return item('expenses.' + e.id, e.label, r, { collection: 'expenses', id: e.id, single: true, summary: 'expenses.' + e.id + '.amount' }); }), { add: { collection: 'expenses', fat: tag === 'other' ? null : tag } }) : null;
  }).filter(Boolean);
  const health = take(byPrefix('household.healthCoverage'));
  if (health.length) expSections.push(node('E:health', 'Health coverage', [item('household.healthCoverage', 'Health coverage over time', health)]));

  // Goals and assumptions
  const goalItems = (spine.goals || []).map((g) => { const r = take(byPrefix('goals.' + g.id)); return item('goals.' + g.id, g.label, r, { collection: 'goals', id: g.id }); });
  const gSections = [node('G:goals', 'Goals', goalItems, { add: { collection: 'goals', types: ['savings', 'payoff', 'fi', 'other'] } }), node('G:assumptions', 'Assumptions', [item('assumptions', 'Assumptions', take(byPrefix('assumptions')))])];

  // Anything not placed above still shows (nothing is ever hidden by the tree).
  const rest = rows.filter((r) => !used.has(r.path));
  const tree = [
    node('D', 'Debt', debtSections, { add: { collection: 'debts', types: Object.keys(PRESETS).filter((k) => PRESETS[k].family === 'debt') } }),
    node('A', 'Assets', assetSections, { add: { collection: 'accounts', types: Object.keys(PRESETS).filter((k) => PRESETS[k].family !== 'debt') } }),
    node('I', 'Income', incomeSections, { add: { collection: 'income', types: INCOME_TYPES } }),
    node('T', 'Taxes', taxSections),
    node('E', 'Expenses', expSections, { add: { collection: 'expenses', fat: null } }),
    node('G', 'Goals and assumptions', gSections)
  ];
  if (rest.length) tree.push(node('X', 'Other fields', [item('other', 'Other fields', rest)]));
  return tree;
}

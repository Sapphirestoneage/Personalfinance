// My numbers as a tree (S-169): DATING section > group > (institution) > item >
// fields, so a card's facts sit together under its issuer under "Credit
// cards", and a Roth IRA's under "IRA > Roth IRA". Built from ledgerRows, so a
// field shows exactly once. Each node says what can be added there.
// DATING (S-231): D Debt, A Assets, T Taxes, I Income, N Needs, G Goals. Needs holds every expense (the stored key
// stays expenses), each tagged need or want; Goals holds the goals and the assumptions.
// numbersScreens, screenAt and levelsFor give My numbers its screens: a section (debt), a group in it
// (credit-cards), an item (visa), each its own address (ledger.html#/debt/credit-cards/visa).

import { valueOf } from './spine.js';
import { hiddenLine } from './profile.js';
import { PRESETS, FAMILIES, INCOME_TYPES, FAT, isEarmarked, SECTION_WORDS } from './schema.js';
import { setAsideFor, setAsideWords } from './networth.js';
import { ledgerRows, rowPathFor } from './ledger.js';
import { UNNAMED } from './labels.js';

const v = valueOf;
const PLURAL = { 'Credit card': 'Credit cards', 'Federal student loan': 'Federal student loans', 'Private student loan': 'Private student loans', 'Auto loan': 'Auto loans', 'Personal loan': 'Personal loans', Mortgage: 'Mortgages', 'Medical debt': 'Medical debt', 'Family IOU': 'Family IOUs' };
const INCOME_LABEL = { w2: 'Paychecks (W-2)', '1099': 'Self-employed (1099)', unemployment: 'Unemployment', tips: 'Tips', rental: 'Rental income', pension: 'Pension', ss: 'Social Security', maybeMoney: 'Maybe money', other: 'Other income', side: 'Side money (not 1099)', person: 'Money from a person' };
const FAT_LABEL = SECTION_WORDS;

// The institution a name starts with, from data/institutions.json (display only).
const SS = /^household\.people\.[^.]+\.ss/;
export function institutionOf(item, inst) {
  const typed = v(item.institution);
  const name = typed || v(item.name) || item.label || '';
  for (const n of inst.names) if (name.toLowerCase().startsWith(n.toLowerCase())) return inst.aliases[n] || n;
  return typed || null;
}

// The field's own words inside its item: "Chase Freedom: minimum payment" -> "minimum payment".
const short = (label) => (label.includes(': ') ? label.slice(label.indexOf(': ') + 2) : label);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// How many of each kind; filled: entered (known, rough or worked out); asked: all but the not-for-me ones.
function counts(rows) {
  const c = { missing: 0, rough: 0, known: 0, notForMe: 0, computed: 0 };
  for (const r of rows) c[r.fact.kind] = (c[r.fact.kind] || 0) + 1;
  c.filled = c.known + c.rough + c.computed;
  c.asked = rows.length - c.notForMe;
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
      // By bank, and under each bank its business cards as a sub-group (owner's ask, 2026-10-27).
      const bankOf = (d) => institutionOf(d, inst) || 'No bank given yet';
      const biz = (d) => v(d.business) === true;
      children = [...new Set(ds.map(bankOf))].flatMap((n) => {
        const mine = ds.filter((d) => bankOf(d) === n);
        const personal = mine.filter((d) => !biz(d)), business = mine.filter(biz);
        return [node('D:' + t + ':' + n, n, personal.map(itemOf), { bank: n }),
          ...(business.length ? [node('D:' + t + ':' + n + ':biz', 'Business', business.map(itemOf), { bank: n, business: true, sub: true })] : [])];
      });
      // The pay setting every card follows unless it says otherwise (S-189) leads the cards.
      const every = take(byPrefix('household.cardPayPolicy'));
      if (every.length) children.unshift(item('household.cardPayPolicy', 'Every card', every));
    } else children = ds.map(itemOf);
    return node('D:' + t, label, children, { add: { collection: 'debts', types: [t] } });
  });

  // Assets: family > type > each account
  const families = [...new Set((spine.accounts || []).map((a) => a.family))];
  const assetSections = families.map((f) => {
    const types = [...new Set(spine.accounts.filter((a) => a.family === f).map((a) => a.type))];
    const typeNodes = types.map((t) => node('A:' + f + ':' + t, PRESETS[t] ? PRESETS[t].label : t,
      spine.accounts.filter((a) => a.type === t).map((a) => { const r = take(byPrefix('accounts.' + a.id)); return item('accounts.' + a.id, v(a.name) || a.id, r, { collection: 'accounts', id: a.id, summary: summaryOf(spine, '', r), note: isEarmarked(a) ? capital(setAsideWords(setAsideFor(spine, a))) + ', so it is not counted as cash.' : null }); }),
      { add: { collection: 'accounts', types: [t] } }));
    return node('A:' + f, FAMILIES[f] ? FAMILIES[f].label : f, typeNodes, { add: { collection: 'accounts', types: Object.keys(PRESETS).filter((k) => PRESETS[k].family === f) } });
  });

  // Income: type > each stream (amount, how likely); the situation timeline
  const incomeTypes = [...new Set((spine.income || []).map((s) => s.type))];
  const incomeSections = incomeTypes.map((t) => node('I:' + t, INCOME_LABEL[t] || t,
    spine.income.filter((s) => s.type === t).map((s) => { const r = take(byPrefix('income.' + s.id).filter((x) => !x.path.includes('.withholding.'))); return item('income.' + s.id, s.label || UNNAMED, r, { collection: 'income', id: s.id, summary: 'income.' + s.id + '.amount' }); }),
    { add: { collection: 'income', types: [t] } }));
  const situation = take(byPrefix('household.situation'));
  if (situation.length) incomeSections.push(node('I:situation', 'Your situation', [item('household.situation', 'Situation over time', situation)]));

  // Owed to you (shared bills brief): money lent, one item per loan; My numbers shows it person by person (ui/owed.js).
  const lentItems = (spine.lent || []).map((l) => item('lent.' + l.id, l.person + ', lent ' + l.date, take(byPrefix('lent.' + l.id)), { collection: 'lent', id: l.id }));
  assetSections.push(node('A:owed', 'Owed to you', lentItems));

  // Taxes: filing and you; withholding per stream; each tax year
  const filing = take(rows.filter((r) => ['household.filingStatus', 'household.state', 'household.county', 'household.nycResident', 'household.householdSize', 'household.workHoursPerWeek'].includes(r.path) || (r.path.startsWith('household.people.') && !SS.test(r.path))));
  const taxSections = [node('T:filing', 'Filing', [item('household.filing', 'You and where you file', filing)])];
  const wh = (spine.income || []).map((s) => item('withholding.' + s.id, s.label || UNNAMED, take(byPrefix('income.' + s.id + '.withholding')))).filter((x) => x.rows.length);
  if (wh.length) taxSections.push(node('T:withholding', 'Tax withheld', wh));
  const years = (spine.taxYears || []).map((y) => item('taxYears.' + y.id, y.year + ' tax year', take(byPrefix('taxYears.' + y.id))));
  if (years.length) taxSections.push(node('T:years', 'Tax years', years));

  // Expenses: FAT tag > each expense (one row each); health coverage
  const expSections = [...FAT, 'other'].map((tag) => {
    const list = (spine.expenses || []).filter((e) => (e.fat || 'other') === tag && !hiddenLine(spine, e));
    return list.length ? node('N:' + tag, FAT_LABEL[tag], list.map((e) => { const r = take(byPrefix('expenses.' + e.id)); return item('expenses.' + e.id, e.label || UNNAMED, r, { collection: 'expenses', id: e.id, summary: 'expenses.' + e.id + '.amount', need: e.need ? v(e.need) : null }); }), { add: { collection: 'expenses', fat: tag === 'other' ? null : tag } }) : null;
  }).filter(Boolean);
  // Lines the Profile hides (renting, then living with family): kept with what was typed, not counted, shown apart.
  const kept = (spine.expenses || []).filter((e) => hiddenLine(spine, e));
  if (kept.length) expSections.push(node('N:hidden', 'Kept, not counted (hidden by the Profile)', kept.map((e) => { const r = take(byPrefix('expenses.' + e.id)); return item('expenses.' + e.id, e.label || UNNAMED, r, { collection: 'expenses', id: e.id, summary: 'expenses.' + e.id + '.amount', note: 'Hidden by the Profile. It comes back, with what was typed, if the answer changes back.' }); })));
  // The gut number from before the call (Profile Level 1): a guess to hold the real spending against.
  // Needs is expenses only (owner's ask, 2026-10-27): the spending guess and health coverage live under Profile.
  const pSections = [];
  const gut = take(byPrefix('household.gutSpending'));
  const health = take(byPrefix('household.healthCoverage'));

  // Goals and assumptions
  const goalItems = (spine.goals || []).map((g) => { const r = take(byPrefix('goals.' + g.id)); return item('goals.' + g.id, g.label || UNNAMED, r, { collection: 'goals', id: g.id }); });
  // Goals is goals only (owner's ask): the assumptions and the debt plan live under Profile, at the end.
  const gSections = [node('G:goals', 'Your goals', goalItems, { add: { collection: 'goals', types: ['savings', 'payoff', 'fi', 'other'] } })];
  pSections.push(node('P:assumptions', 'FI assumptions', [item('assumptions', 'FI assumptions', take(byPrefix('assumptions')))]));
  const plan = take(byPrefix('debtPlan'));
  if (plan.length) pSections.push(node('P:debtPlan', 'Debt plan', [item('debtPlan', 'The extra at the debt', plan)]));
  if (health.length) pSections.push(node('P:health', 'Health coverage', [item('household.healthCoverage', 'Health coverage over time', health)]));
  // A Social Security estimate (S-267): recorded on the Profile, not counted in the FI math yet.
  const ss = take(rows.filter((r) => SS.test(r.path)));
  if (ss.length) pSections.push(node('P:ss', 'Social Security estimate', [item('household.ss', 'Social Security estimate', ss)]));
  if (gut.length) pSections.push(node('P:gut', 'Your guess before we started', [item('household.gutSpending', 'Spending a month, your guess', gut)]));

  // Anything not placed above still shows (nothing is ever hidden by the tree).
  const rest = rows.filter((r) => !used.has(r.path));
  // DATING order: Debt, Assets, Taxes, Income, Needs, Goals (S-231). slug: the section's address in My numbers; letter:
  // its DATING letter.
  const tree = [
    node('D', 'Debt', debtSections, { slug: 'debt', letter: 'D', add: { collection: 'debts', types: Object.keys(PRESETS).filter((k) => PRESETS[k].family === 'debt') } }),
    node('A', 'Assets', assetSections, { slug: 'assets', letter: 'A', add: { collection: 'accounts', types: Object.keys(PRESETS).filter((k) => PRESETS[k].family !== 'debt') } }),
    node('T', 'Taxes', taxSections, { slug: 'taxes', letter: 'T' }),
    node('I', 'Income', incomeSections, { slug: 'income', letter: 'I', add: { collection: 'income', types: INCOME_TYPES } }),
    node('N', 'Needs', expSections, { slug: 'needs', letter: 'N', add: { collection: 'expenses', fat: null } }),
    node('G', 'Goals', gSections, { slug: 'goals', letter: 'G' }),
    // Profile (owner's ask): the settings that shape every number, after the six DATING sections, with no letter.
    node('P', 'Profile', pSections, { slug: 'profile' })
  ];
  if (rest.length) tree.push(node('X', 'Other', [item('other', 'Other', rest)], { slug: 'other' }));
  return tree;
}

// ------------------------------------------------------------------ screen by screen (S-231)
export const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
// Addresses that stay apart within one list: a second "Other" is other-2.
function uniqueSlugs(list, slugFor) {
  const seen = new Set();
  return list.map((x) => { const s = slugFor(x); let k = s, n = 2; while (seen.has(k)) k = s + '-' + n++; seen.add(k); return k; });
}
const itemsUnder = (n) => (n.item ? [n] : n.children.flatMap(itemsUnder));
// An item's address: its id (stable when it is renamed), else its own words.
const itemSlug = (it) => it.id || (/^(withholding|taxYears)\./.test(it.key) ? slugOf(it.key.split('.')[1]) : slugOf(it.label));

// The screens of My numbers, from ledgerTree: each section's groups, each group's items in order with the sub-group
// they sit in (an issuer, an account type) as a heading. A group of one item with nothing to add opens that item
// straight away (Filing, Assumptions). rowLevels and itemLevels: where each field and each item opens.
export function numbersScreens(tree) {
  const rowLevels = new Map(), itemLevels = new Map();
  for (const sec of tree) {
    const slugs = uniqueSlugs(sec.children, (c) => slugOf(c.label));
    sec.groups = sec.children.map((c, i) => {
      const parts = [];
      if (!c.item) {
        for (const ch of c.children) {
          const last = parts[parts.length - 1];
          if (!ch.item) parts.push({ heading: ch.label, node: ch, items: itemsUnder(ch) });
          else if (last && !last.node) last.items.push(ch);
          else parts.push({ heading: null, node: null, items: [ch] });
        }
      }
      const items = c.item ? [c] : parts.flatMap((p) => p.items);
      const only = c.item ? c : !c.add && c.children.length === 1 && c.children[0].item ? c.children[0] : null;
      return { slug: slugs[i], label: c.label, node: c, counts: c.counts, item: only, parts, items, slugs: uniqueSlugs(items, itemSlug) };
    });
    for (const g of sec.groups) g.items.forEach((it, k) => {
      const levels = g.item ? [sec.slug, g.slug] : [sec.slug, g.slug, g.slugs[k]];
      itemLevels.set(it.key, levels);
      for (const r of it.rows) rowLevels.set(r.path, levels);
    });
  }
  return { sections: tree, rowLevels, itemLevels };
}

// The screen at these levels: {} for the top, { section }, { section, group, item } (item null on a group's own
// screen); null when a level is not there (deleted, renamed away, or a bad link).
export function screenAt(screens, levels) {
  if (!levels.length) return {};
  if (levels.length > 3) return null;
  const section = screens.sections.find((x) => x.slug === levels[0]);
  if (!section) return null;
  if (levels.length === 1) return { section };
  const group = section.groups.find((x) => x.slug === levels[1]);
  if (!group) return null;
  if (levels.length === 2) return { section, group, item: group.item };
  if (group.item) return null;
  const k = group.slugs.indexOf(levels[2]);
  return k < 0 ? null : { section, group, item: group.items[k] };
}

// Where a link opens (an old ledger.html#<field> link, a field named by another page, an item, or a whole list):
// { levels, row }, row the field to open there, or null.
const LIST_SECTION = { debts: 'debt', accounts: 'assets', taxYears: 'taxes', income: 'income', expenses: 'needs', goals: 'goals', assumptions: 'goals', debtPlan: 'goals' };
export function levelsFor(screens, spine, path) {
  const p = String(path || '');
  const row = p ? rowPathFor(spine, p) : p;
  if (screens.rowLevels.has(row)) return { levels: screens.rowLevels.get(row), row };
  const own = screens.itemLevels.get(p) || screens.itemLevels.get(p.split('.').slice(0, 2).join('.'));
  if (own) return { levels: own, row: null };
  const sec = LIST_SECTION[p.split('.')[0]];
  return { levels: sec && screens.sections.some((x) => x.slug === sec) ? [sec] : [], row: null };
}

// ---------------------------------------------------------------- the statement (Batch 4)
// My numbers reads like a financial statement: each item's amount (a debt's or an account's balance, a bill's
// monthly cost to you, an income line's monthly gross this month, a goal's target), each group's total, and the
// groups and items of Debt, Assets, Income, Needs and Goals biggest first. An item with a blank amount makes its
// group's total incomplete (never smaller), and sorts last. Taxes keep their order. s: summary.js summarize().
const MONEY_SECTIONS = ['debt', 'assets', 'income', 'needs', 'goals'];
export function statementOrder(screens, spine, s) {
  const exp = new Map(s.cashflow.expenses.items.map((x) => [x.id, x.amount]));
  const inc = new Map(s.cashflow.income.streams.filter((x) => x.included).map((x) => [x.id, x.gross]));
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const amountOf = (it) => {
    if (!it.collection || !it.id) return undefined;
    const x = (spine[it.collection] || []).find((y) => y.id === it.id);
    if (!x) return undefined;
    if (it.collection === 'expenses') return exp.has(it.id) ? num(exp.get(it.id)) : undefined;
    if (it.collection === 'income') return inc.has(it.id) ? num(inc.get(it.id)) : undefined;
    if (it.collection === 'goals') return x.type === 'fi' ? undefined : num(valueOf(x.target));
    return num(valueOf(x.balance));
  };
  const byAmount = (a, b) => (b.amount ?? -Infinity) - (a.amount ?? -Infinity);
  for (const sec of screens.sections) {
    if (!MONEY_SECTIONS.includes(sec.slug)) continue;
    for (const g of sec.groups) {
      for (const it of g.items) it.amount = amountOf(it);
      const counted = g.items.filter((it) => it.amount !== undefined);
      // Only the lines with a number add up; with none, the total is missing, never $0.
      const known = counted.filter((it) => it.amount !== null);
      g.total = known.length ? Math.round(known.reduce((a, it) => a + it.amount, 0) * 100) / 100 : null;
      g.totalIncomplete = counted.some((it) => it.amount === null);
      // Items biggest first, inside each part, keeping each item's address with it.
      const slugOf = new Map(g.items.map((it, k) => [it, g.slugs[k]]));
      for (const p of g.parts) p.items.sort(byAmount);
      // Largest first; a bank's parts (its cards, then its business cards) stay together, ranked by its largest card.
      const top = (p) => (p.items[0] ? p.items[0].amount ?? -Infinity : -Infinity);
      const rank = (p) => (p.node && p.node.bank ? Math.max(...g.parts.filter((x) => x.node && x.node.bank === p.node.bank).map(top)) : top(p));
      if (g.parts.length > 1) g.parts.sort((a, b) => rank(b) - rank(a) || (a.node && a.node.bank && b.node && a.node.bank === b.node.bank ? (a.node.sub ? 1 : 0) - (b.node.sub ? 1 : 0) : 0));
      if (g.parts.length) g.items = g.parts.flatMap((p) => p.items);
      g.slugs = g.items.map((it) => slugOf.get(it));
    }
    sec.groups.sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity));
  }
  return screens;
}

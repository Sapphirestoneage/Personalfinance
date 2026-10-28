// The Ledger's model: every Fact in the spine as a row, grouped by DAITE, and
// the "still guessing" list (rough and missing fields, ordered by how much
// they change the results). No DOM here.

import { listFacts, getAt, setAt, addMonths, result, valueOf, round2, tracker } from './spine.js';
import { fieldsFor, FILING_STATUSES, SITUATIONS, COVERAGES, PLAN_TYPES, LOAN_PLANS, PAY_POLICIES, PERSON_PURPOSES, ALLOWANCE_MODES, PAY_BASES, SS_FIELDS, INCOME_DEPTH } from './schema.js';
import { labelFor, groupFor, GROUPS } from './labels.js';
import { summarize } from './summary.js';
import { project } from './projection.js';
import { shareOf, yourCost, coverOf, SHARE_FIELDS } from './sharing.js';
import { monthlyAmount } from './cashflow.js';
import { basisOf, basisFromList } from './networth.js';
import { isSubscription } from './subscriptions.js';
import { lineFor, paysDebtOf, linkNote, lineMonthly } from './debt.js';

// The field type of a path, from the schema: money, rate, date, int, text, bool,
// choice:a|b (pick one), suggest:a|b (pick one or type another), list.
const LINK_TO = { loanDebt: 'debt', linkedDebt: 'debt', securedBy: 'asset', fromAccount: 'asset' };
export function typeFor(spine, path) {
  const s = path.split('.');
  if (s[0] === 'household') {
    if (s[1] === 'people') return SS_FIELDS[s[3]] || 'date';
    if (s[1] === 'filingStatus') return 'choice:' + FILING_STATUSES.join('|');
    if (s[1] === 'nycResident') return 'bool';
    if (s[1] === 'cardPayPolicy') return 'choice:' + PAY_POLICIES.join('|');
    if (s[1] === 'situation') return 'choice:' + SITUATIONS.join('|');
    if (s[1] === 'lastRefund') return 'money';
    if (s[1] === 'goalOrder') return 'choice:oneAtATime|byDeadline';
    if (s[1] === 'gutSpending') return 'money';
    if (s[1] === 'healthCoverage') return s[3] === 'planType' ? 'choice:' + PLAN_TYPES.join('|') : s[3] === 'enrolled' ? 'bool' : s[3] === 'setAside' ? 'money' : 'choice:' + COVERAGES.join('|');
    return 'text';
  }
  if (s[0] === 'income' && s[2] === 'purpose') return 'choice:' + PERSON_PURPOSES.join('|');
  if (s[0] === 'income' && s[2] === 'allowanceMode') return 'choice:' + ALLOWANCE_MODES.join('|');
  if (s[0] === 'income' && s[2] === 'from') return 'text';
  if (s[0] === 'income' && s[2] === 'payBasis') return 'choice:' + PAY_BASES.join('|');
  if (s[0] === 'income' && s[2] === 'hoursPerWeek') return 'int';
  if (s[0] === 'income' && s[2] === 'decreeYear') return 'int';
  if (s[0] === 'income' && INCOME_DEPTH[s[2]]) return INCOME_DEPTH[s[2]];
  if (s[0] === 'income') return s[2] === 'likelihood' ? 'rate' : s[2] === 'depositTo' ? 'link:cash' : s[2] === 'payDay' || s[2] === 'payDay2' ? 'int' : 'money';
  if (s[0] === 'expenses') return s[2] === 'need' || s[2] === 'covered' || s[2] === 'subscription' ? 'bool' : s[2] === 'payDay' ? 'int' : s[2] === 'paidFrom' ? 'link:cash|card' : s[2] === 'paysDebt' ? 'link:debt' : s[2] === 'renews' || s[2] === 'reviewed' ? 'date' : 'money';
  if (s[0] === 'taxYears') return 'money';
  if (s[0] === 'lent') return s[2] === 'due' ? 'date' : 'money';
  if (s[0] === 'accounts' || s[0] === 'debts') {
    const item = getAt(spine, s[0] + '.' + s[1]);
    // A federal loan's plan: pick from the plans, or type another (S-181).
    if (s[2] === 'plan' && item && item.type === 'student_loan') return 'suggest:' + LOAN_PLANS.join('|');
    // Links (S-189): a debt is paid from cash; money is paid into an account from cash or the paycheck.
    if (s[2] === 'paidFrom') return 'link:cash';
    if (s[2] === 'fundedFrom') return 'link:cash|paycheck';
    // The job a plan from pay is paid through (S-227).
    if (s[2] === 'paidThrough') return 'link:job';
    // The type catalog's links (S-267): a plan loan or a mortgage points at a debt; a debt at what secures it.
    if (LINK_TO[s[2]]) return 'link:' + LINK_TO[s[2]];
    return (item && fieldsFor(item.family)[s[2]]) || 'text';
  }
  if (s[0] === 'goals') return 'money';
  if (s[0] === 'assumptions') return s[1] === 'lifeExpectancy' || s[1] === 'coastAge' ? 'int' : 'rate';
  if (s[0] === 'debtPlan') return s[1] === 'extra' ? 'money' : s[1] === 'day' ? 'int' : s[1] === 'strategy' ? 'choice:avalanche|snowball' : s[1] === 'hiRate' ? 'rate' : 'bool';
  return 'text';
}

// A card's APR, intro rate and intro end are one Ledger row, "Interest rate"
// (S-161). The row sits at the APR's path; its value is { apr, intro }.
// Deferred interest only matters on an intro rate, so it sits in the same row (owner's ask, 2026-10-27).
const CARD_RATE = ['apr', 'promoApr', 'promoEnds', 'deferredInterest'];
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
  const value = card.apr.kind === 'notForMe' ? null : { apr: valueOf(card.apr), intro: intro ? { rate: valueOf(card.promoApr), ends: valueOf(card.promoEnds), deferred: card.deferredInterest ? valueOf(card.deferredInterest) : null } : null };
  return { path, label: labelFor(spine, path), group: 'D', type: 'cardRate', fact: { value: value && (value.apr !== null || value.intro) ? value : null, kind }, members: CARD_RATE.map((k) => 'debts.' + card.id + '.' + k) };
}

// An expense's amount, how often, and how it is shared are one row (S-175).
// Its value: { amount, cadence, shared, people, share, whoPays, fromDefault, yourMonthly }.
export function expenseRow(spine, e) {
  const path = 'expenses.' + e.id + '.amount';
  const sh = shareOf(spine, e);
  const own = SHARE_FIELDS.map((k) => e[k]).filter(Boolean);
  const kind = combinedKind([e.amount, ...own]);
  const amount = valueOf(e.amount);
  const monthly = amount === null ? null : monthlyAmount(amount, e.cadence === 'total' || e.cadence === 'once' ? 'monthly' : e.cadence, null, null, '2001-01');
  const cover = coverOf(e);
  return {
    path, label: labelFor(spine, path), group: 'E', type: 'expense',
    fact: { value: amount === null && e.amount.kind !== 'notForMe' && !cover.covered ? null : { amount, cadence: e.cadence, covered: cover.covered, coveredBy: cover.by, shared: !cover.covered && sh.shared, people: sh.people, share: sh.share, whoPays: sh.whoPays, fromDefault: sh.fromDefault, yourMonthly: cover.covered ? 0 : sh.shared ? yourCost(monthly, sh.share) : monthly, subscription: isSubscription(e), paysDebt: paysDebtOf(spine, e) ? linkName(spine, valueOf(e.paysDebt)) : null }, kind: e.amount.kind === 'notForMe' ? 'notForMe' : kind },
    members: [path, ...SHARE_FIELDS.map((k) => 'expenses.' + e.id + '.' + k)]
  };
}

// An income stream's amount, how often, when it starts and ends, and the day
// it is paid are one row (S-199): "$6,000 a month, since Jan 1, 2024, on the 15th".
// Its value: { amount, cadence, start, end, payDay, payDay2 } (payDay2: twice a month, the second day, S-226).
export function incomeRow(spine, x) {
  const path = 'income.' + x.id + '.amount';
  const kind = combinedKind([x.amount, ...(x.payDay ? [x.payDay] : []), ...(x.payDay2 ? [x.payDay2] : [])]);
  const amount = valueOf(x.amount);
  return {
    path, label: labelFor(spine, path), group: 'I', type: 'income',
    fact: { value: amount === null && x.amount.kind !== 'notForMe' ? null : { amount, cadence: x.cadence, start: x.start || null, end: x.end || null, payDay: x.payDay ? valueOf(x.payDay) : null, payDay2: x.payDay2 ? valueOf(x.payDay2) : null }, kind: x.amount.kind === 'notForMe' ? 'notForMe' : kind },
    members: [path, 'income.' + x.id + '.payDay', 'income.' + x.id + '.payDay2']
  };
}

// A month amount for a typed amount and how often (the expense panel's preview).
export function previewCost(amount, cadence, shared, people, share) {
  if (amount === null) return null;
  const m = monthlyAmount(amount, cadence === 'total' || cadence === 'once' ? 'monthly' : cadence, null, null, '2001-01');
  return shared ? yourCost(m, share ?? (people ? 1 / people : null)) : m;
}

const PAY_PARTS = ['payBasis', 'salary', 'hourlyRate', 'hoursPerWeek', 'yearTotal'];
// The Ledger row a field lives on (a card's intro fields live on its rate row;
// an expense's sharing fields on its amount row).
export function rowPathFor(spine, path) {
  const s = path.split('.');
  if (s[0] === 'expenses' && (s[2] === 'payDay' || s[2] === 'paysDebt')) return 'expenses.' + s[1] + '.paidFrom';
  if (s[0] === 'income' && (s[2] === 'payDay' || s[2] === 'payDay2' || s[2] === 'personId' || PAY_PARTS.includes(s[2]))) return 'income.' + s[1] + '.amount';
  if (s[0] === 'debts' && isCard(spine, s[1]) && CARD_RATE.includes(s[2])) return 'debts.' + s[1] + '.apr';
  if (s[0] === 'expenses' && (SHARE_FIELDS.includes(s[2]) || s[2] === 'subscription')) return 'expenses.' + s[1] + '.amount';
  return path;
}

// Fully covered by someone else (a parent, an employer, a partner) or marked Not for me: nothing leaves your account.
export const othersPay = (e) => !!e && ((e.covered && valueOf(e.covered) === true) || (e.amount && e.amount.kind === 'notForMe'));
const NOT_ASKED = ['paidFrom', 'payDay', 'paysDebt', 'renews', 'reviewed', 'trialEnds'];
export function ledgerRows(spine) {
  const rows = [];
  for (const { path, fact } of listFacts(spine)) {
    const s = path.split('.');
    if (s[0] === 'debts' && isCard(spine, s[1]) && CARD_RATE.includes(s[2])) {
      if (s[2] === 'apr') rows.push(cardRateRow(spine, getAt(spine, 'debts.' + s[1])));
      continue;
    }
    if (s[0] === 'expenses' && (s[2] === 'amount' || s[2] === 'subscription' || SHARE_FIELDS.includes(s[2]))) {
      if (s[2] === 'amount') rows.push(expenseRow(spine, getAt(spine, 'expenses.' + s[1])));
      continue;
    }
    // An income stream's amount, how often, dates and pay day are one row (S-199).
    // How the pay is figured (a salary, hours) is set in the Session, where the amount follows from it: no row of its own.
    if (s[0] === 'income' && PAY_PARTS.includes(s[2])) continue;
    if (s[0] === 'income' && (s[2] === 'amount' || s[2] === 'payDay' || s[2] === 'payDay2')) {
      if (s[2] === 'amount') rows.push(incomeRow(spine, getAt(spine, 'income.' + s[1])));
      continue;
    }
    // A line someone else pays in full, or marked Not for me (bug sweep): its name, real cost, who covers it and need or
    // want stay; how and when it is paid are not asked, so they are never missing or rough.
    if (s[0] === 'expenses' && NOT_ASKED.includes(s[2]) && othersPay(getAt(spine, 'expenses.' + s[1]))) continue;
    // When a subscription was last reviewed is the quarterly review's (Profile), never a field to fill in (owner's ask).
    if (s[0] === 'expenses' && s[2] === 'reviewed') continue;
    // An expense's account and day are one row: "Main checking, on the 5th" (S-189).
    if (s[0] === 'expenses' && (s[2] === 'paidFrom' || s[2] === 'payDay' || s[2] === 'paysDebt')) {
      if (s[2] === 'paidFrom') rows.push(paymentRow(spine, getAt(spine, 'expenses.' + s[1])));
      continue;
    }
    // A section's sharing default is set on the section, not as a row. Profile answers live on the Profile page.
    if ((s[0] === 'household' && s[1] === 'expenseDefaults') || s[0] === 'profile') continue;
    // A coach note (S-267) is never a row to fill in: the item screen shows it apart, and nothing prints it.
    if (s[2] === 'coachNote') continue;
    const type = typeFor(spine, path);
    rows.push(linkedDebtRow(spine, { path, label: labelFor(spine, path), group: groupFor(path), type, fact, ...(type.startsWith('link:') && fact.value !== null ? { display: linkName(spine, fact.value) } : {}) }));  }
  return GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => r.group === g.id) }));
}

// ---------------------------------------------------------------- links (S-189)
// What a link may point at: cash accounts, cards, or the paycheck.
export function linkOptions(spine, type) {
  const want = type.slice(5).split('|');
  const out = [];
  // Checking and every card, grouped by bank (bug sweep); one with no bank given sits under Accounts or Cards.
  const bank = (x, none) => (x.institution && valueOf(x.institution) ? String(valueOf(x.institution)).trim() : none);
  const money = [];
  if (want.includes('cash')) for (const a of spine.accounts || []) if (a.family === 'cash') money.push({ value: a.id, label: valueOf(a.name) || a.id, group: bank(a, 'Accounts') });
  if (want.includes('card')) for (const d of spine.debts || []) if (d.type === 'credit_card') money.push({ value: d.id, label: valueOf(d.name) || d.id, group: bank(d, 'Cards') });
  const order = [...new Set(money.map((o) => o.group))];
  out.push(...order.flatMap((g) => money.filter((o) => o.group === g)));
  if (want.includes('debt')) for (const d of spine.debts || []) out.push({ value: d.id, label: valueOf(d.name) || d.id, group: 'Debts' });
  if (want.includes('asset')) for (const a of spine.accounts || []) if (a.family !== 'cash') out.push({ value: a.id, label: valueOf(a.name) || a.id, group: 'Assets' });
  if (want.includes('paycheck')) out.push({ value: 'paycheck', label: 'Taken from my paycheck', group: 'Paycheck' });
  if (want.includes('job')) for (const s of spine.income || []) if (s.type === 'w2' && s.cadence !== 'once') out.push({ value: s.id, label: s.label, group: 'Jobs' });
  return out;
}
// The name of what a link points at; an id that is gone says so.
export function linkName(spine, id) {
  if (id === 'paycheck') return 'Taken from the paycheck';
  const x = (spine.accounts || []).find((a) => a.id === id) || (spine.debts || []).find((d) => d.id === id);
  if (!x) { const s = (spine.income || []).find((i) => i.id === id); if (s) return s.label; }
  return x ? valueOf(x.name) || id : 'an account no longer here (' + id + ')';
}
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
// An expense's payment row: the account or card, the day when it is known, and the debt it pays (S-226).
export function paymentRow(spine, e) {
  const path = 'expenses.' + e.id + '.paidFrom';
  const from = e.paidFrom ? e.paidFrom.value : null, day = e.payDay ? e.payDay.value : null;
  // The debt it names stays picked in the editor even while it counts as a bill (linkNote says why).
  const named = e.paysDebt && (spine.debts || []).some((d) => d.id === valueOf(e.paysDebt)) ? valueOf(e.paysDebt) : null;
  const note = linkNote(spine, e);
  const kind = !e.paidFrom ? 'missing' : e.paidFrom.kind;
  return {
    path, label: labelFor(spine, path), group: 'E', type: 'payment',
    fact: { value: from === null ? null : { from, day, paysDebt: named }, kind },
    display: from === null ? null : linkName(spine, from) + (day ? ', on the ' + ordinal(day) : '') + (named ? '; pays ' + linkName(spine, named) + (note ? ' (' + note + ')' : '') : ''),
    members: [path, 'expenses.' + e.id + '.payDay', 'expenses.' + e.id + '.paysDebt']
  };
}
// A debt a budget line pays (S-226): its payment row says so, whatever the minimum holds (the line's amount is paid).
function linkedDebtRow(spine, row) {
  const s = row.path.split('.');
  if (s[0] !== 'debts' || s[2] !== 'minimum') return row;
  const d = getAt(spine, 'debts.' + s[1]);
  const e = d ? lineFor(spine, d) : null;
  return e ? { ...row, display: 'Paid by the ' + e.label + ' line, counted once', linked: true, linePath: 'expenses.' + e.id + '.paidFrom' } : row;
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
// The same ranking a field at a time (S-184): the Ledger runs it in short
// slices between taps, so a Save never waits on it. Yields after each field it
// moves; returns { swing, items }.
export function* stillGuessingSteps(spine, rules) {
  const sum = measure(spine, rules);
  const swing = rules.get('APP_GUESS_SWING', +sum.asOf.slice(0, 4));
  const blocks = blockedBy(sum);
  const items = [];
  for (const { path, fact } of listFacts(spine)) {
    if (fact.kind !== 'rough' && fact.kind !== 'missing') continue;
    // A line someone else pays is never a guess to firm up (bug sweep): its payment fields are not asked.
    const p = path.split('.');
    if (p[0] === 'expenses' && ((NOT_ASKED.includes(p[2]) && othersPay(getAt(spine, 'expenses.' + p[1]))) || p[2] === 'reviewed')) continue;
    const item = { path, label: labelFor(spine, path), kind: fact.kind, group: groupFor(path), blocks: blocks.get(path) || [], score: 0, moves: {}, was: {} };
    if (fact.kind === 'rough' && typeof fact.value === 'number' && fact.value !== 0) {
      const moved = setAt(spine, path, { ...fact, value: fact.value * (1 + swing) });
      const alt = measure(moved, rules);
      for (const [name, get, scale] of METRICS) {
        const a = get(sum).value, b = get(alt).value;
        if (typeof a === 'number' && typeof b === 'number') { const d = b - a; item.moves[name] = d; item.was[name] = a; item.score += Math.abs(d) / scale; }
      }
      items.push(item);
      yield;
      continue;
    }
    items.push(item);
  }
  // By impact on a result only (Krug pass): a missing number a result waits on, then guesses by how far a miss moves
  // the results, then guesses that move little, and last what no result needs yet.
  const tier = (x) => (x.kind === 'missing' ? (x.blocks.length ? 0 : 3) : x.score > 0 ? 1 : 2);
  items.sort((a, b) => tier(a) - tier(b) || b.blocks.length - a.blocks.length || b.score - a.score || a.path.localeCompare(b.path));
  // Rough now and rough later: whether each guess matters now (checkNow), beside how sure it is (its kind).
  const ctx = urgencyContext(spine, rules, sum);
  for (const it of items) Object.assign(it, checkNow(it, getAt(spine, it.path), ctx));
  return { swing, items, materiality: ctx.materiality };
}

export function stillGuessing(spine, rules) {
  const it = stillGuessingSteps(spine, rules);
  let r;
  while (!(r = it.next()).done);
  return r.value;
}

// What is charged to a card (owner's ask, 2026-10-27): the expenses whose Paid from is it, each a month, and the total
// of those with an amount (missing when none has one).
export function cardCharges(spine, cardId) {
  const items = (spine.expenses || []).filter((e) => e.paidFrom && valueOf(e.paidFrom) === cardId).map((e) => ({ id: e.id, label: e.label, monthly: lineMonthly(e), path: 'expenses.' + e.id + '.amount' }));
  const known = items.filter((x) => x.monthly !== null);
  return { items, total: known.length ? round2(known.reduce((a, x) => a + x.monthly, 0)) : null };
}

// Covered by others (bug sweep): every line someone else pays in full, its real cost a month and who covers it. Needs
// shows the total as one line that opens this list. A line with no amount still lists, with its cost not given.
export function coveredByOthers(spine) {
  const items = (spine.expenses || []).filter((e) => coverOf(e).covered).map((e) => ({ id: e.id, label: e.label, by: coverOf(e).by, monthly: lineMonthly(e), path: 'expenses.' + e.id + '.amount' }));
  const known = items.filter((i) => i.monthly !== null);
  return { items, monthly: items.length ? round2(known.reduce((x, i) => x + i.monthly, 0)) : null };
}

// A basis row whose account has contributions by year (owner's ask): the total of the years, else null (the row shows
// its own typed value).
export function basisFromYears(spine, path) {
  const m = /^accounts\.([^.]+)\.(basis|costBasis)$/.exec(path);
  const a = m && (spine.accounts || []).find((x) => x.id === m[1]);
  return a && basisFromList(a) ? basisOf(tracker(), a) : null;
}

// ---------------------------------------------------------------- rough now and rough later
// Whether a rough or missing number is worth checking now (one rule, Show the math "checkNow"). How sure a number is
// (known, rough, missing, not for me) stays its kind; this is separate.
//   check now: getting it APP_GUESS_SWING (20%) wrong moves monthly surplus by APP_MATERIALITY ($100) or more, or
//     cash runway by that much of cushion (months x monthly spending), or net worth, the FI number or cash 24 months
//     out by twelve times that, or changes the FI year; a missing number counts when a result waits on it.
//   fine for now: everything else (a missing number nothing reads yet included).
//   An override on the Fact wins: check { mode: 'later', until } until that date passes (then it is check now, and
//   homework), or check { mode: 'now' }.
export const URGENCY_METRICS = [['surplus', 'month'], ['runway', 'cushion'], ['netWorth', 'year'], ['fiNumber', 'year'], ['fiImplied', 'year'], ['outlook', 'year']];
export function urgencyContext(spine, rules, sum) {
  const year = +sum.asOf.slice(0, 4);
  const materiality = rules.get('APP_MATERIALITY', year);
  const monthlySpend = (sum.cashflow.expenses.total.value ?? 0) + (sum.cashflow.debtMinimums.total.value ?? 0);
  return { materiality, monthlySpend, asOf: sum.asOf, year };
}
export function checkNow(item, fact, ctx) {
  const o = fact && fact.check;
  if (o && o.mode === 'later' && o.until && o.until > ctx.asOf) return { urgency: 'later', until: o.until, why: 'Check again ' + o.until };
  if (o && o.mode === 'later') return { urgency: 'now', due: true, why: 'Its check-again date has come' };
  if (o && o.mode === 'now') return { urgency: 'now', why: 'Marked to check now' };
  if (item.kind === 'missing') return item.blocks.length ? { urgency: 'now', why: 'A result waits on it' } : { urgency: 'fine', why: 'Not needed by a result yet' };
  const m = ctx.materiality, d = item.moves || {};
  const over = [];
  if (Math.abs(d.surplus || 0) >= m) over.push(['surplus', d.surplus]);
  if (Math.abs((d.runway || 0) * ctx.monthlySpend) >= m) over.push(['runway', d.runway * ctx.monthlySpend]);
  for (const k of ['netWorth', 'fiNumber', 'fiImplied', 'outlook']) if (Math.abs(d[k] || 0) >= 12 * m) over.push([k, d[k]]);
  const was = item.was || {};
  if (typeof d.yearsToFi === 'number' && typeof was.yearsToFi === 'number' && Math.floor(ctx.year + was.yearsToFi) !== Math.floor(ctx.year + was.yearsToFi + d.yearsToFi)) over.push(['yearsToFi', d.yearsToFi]);
  if (!over.length) return { urgency: 'fine', why: 'A 20% miss moves no result by ' + money0(m) + ' a month' };
  over.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return { urgency: 'now', top: over[0], why: null };
}
const money0 = (x) => '$' + Math.round(Math.abs(x)).toLocaleString('en-US');

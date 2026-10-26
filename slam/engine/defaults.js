// House defaults: values filled in when a field is blank, stored in the spine
// as rough Facts so they show yellow and land in the still-guessing list.
// Run after loading a household and after every Ledger edit (S-160, S-163).

import { fact, setAt, valueOf, getAt, whoSupplies } from './spine.js';
import { estimateCardMinimum, DEFAULT_MIN_SOURCE } from './debt.js';
import { isEarmarked, fromPaycheck } from './schema.js';

// Blank: nothing typed. A guess this file put in from a house default (its source is that default's id) counts as
// blank too, so changing a house default on the Builder changes every guess that used it, and nothing typed.
const blank = (f, id = null) => !f || f.kind === 'missing' || (id !== null && f.kind === 'rough' && f.source === id && whoSupplies(f) === 'default');
// The words a client sees beside a number Eli's default filled in.
export const DEFAULT_WORDS = "using Eli's default";

// A credit card with no APR gets DEFAULT_CARD_APR. That covers an intro rate
// with no rate after it too: the APR is the rate after the intro.
// A card with no minimum gets the house default minimum (S-166).
// Every debt with no due day gets DEFAULT_DUE_DAY (an IOU only when it has a
// payment). A card's statement close day is never filled in.
const HOUSE_IDS = new Set(['DEFAULT_CARD_APR', 'DEFAULT_DUE_DAY', 'DEFAULT_APY', 'DEFAULT_VEHICLE_DEPRECIATION', 'DEFAULT_PHONE_PLAN_1']);
export function applyDefaults(spine, rules) {
  const asOf = spine.meta.asOf;
  const year = +asOf.slice(0, 4);
  const rough = (value, rule, note) => fact(value, { kind: 'rough', asOf, source: rule, note, by: HOUSE_IDS.has(rule) ? 'default' : undefined });
  let out = spine;
  for (const d of spine.debts || []) {
    const base = 'debts.' + d.id;
    if (d.type === 'credit_card' && blank(d.apr, 'DEFAULT_CARD_APR')) out = setAt(out, base + '.apr', rough(rules.get('DEFAULT_CARD_APR', year), 'DEFAULT_CARD_APR', DEFAULT_WORDS + ' until the real rate is entered'));
    // A card with no minimum gets the house default for today's balance (S-166).
    if (d.type === 'credit_card' && blank(d.minimum, DEFAULT_MIN_SOURCE) && valueOf(d.balance) !== null) {
      const card = getAt(out, base);
      out = setAt(out, base + '.minimum', fact(estimateCardMinimum(card, rules, asOf, valueOf(d.balance)), { kind: 'rough', asOf, source: DEFAULT_MIN_SOURCE, by: 'default', note: DEFAULT_WORDS + ': the larger of $40 or 1% of the balance plus a month of interest; follows the balance' }));
    }
    const paysSomething = d.type !== 'family_iou' || (valueOf(d.minimum) ?? 0) > 0;
    if (paysSomething && blank(d.dueDay, 'DEFAULT_DUE_DAY')) out = setAt(out, base + '.dueDay', rough(rules.get('DEFAULT_DUE_DAY', year), 'DEFAULT_DUE_DAY', DEFAULT_WORDS + ' until the real due day is entered'));
  }
  // Links (S-189): until said otherwise, money comes in and goes out through
  // the main checking account, as a guess. A covered expense is paid by
  // someone else, so it has no link. Pre-tax retirement is paid in from the
  // paycheck. Every card follows one pay setting, the minimum to start.
  const main = mainChecking(spine);
  const via = (note) => rough(main, 'mainChecking', note);
  if (main) {
    for (const e of spine.expenses || []) if (!(e.covered && valueOf(e.covered) === true) && blank(e.paidFrom)) out = setAt(out, 'expenses.' + e.id + '.paidFrom', via('assumed paid from the main checking account'));
    for (const s of spine.income || []) if (blank(s.depositTo)) out = setAt(out, 'income.' + s.id + '.depositTo', via('assumed paid into the main checking account'));
    for (const d of spine.debts || []) if (blank(d.paidFrom) && (d.type !== 'family_iou' || (valueOf(d.minimum) ?? 0) > 0)) out = setAt(out, 'debts.' + d.id + '.paidFrom', via('assumed paid from the main checking account'));
    // Where saving is paid in from follows the cash flow's one rule (engine/schema.js fromPaycheck): an HSA comes from
    // take-home unless it is through payroll (answer 47). A house guess that no longer matches it is guessed again.
    for (const a of spine.accounts || []) {
      if (a.family === 'cash' || !a.monthlyContribution || valueOf(a.monthlyContribution) === null) continue;
      const f = a.fundedFrom, guess = f && f.kind === 'rough' && f.source === 'mainChecking';
      if (!blank(f) && !(guess && (valueOf(f) === 'paycheck') !== fromPaycheck(a))) continue;
      out = setAt(out, 'accounts.' + a.id + '.fundedFrom', fromPaycheck(a) ? rough('paycheck', 'mainChecking', 'assumed taken from the paycheck') : via('assumed paid in from the main checking account'));
    }
  }
  if ((spine.debts || []).some((d) => d.type === 'credit_card') && blank(spine.household.cardPayPolicy)) out = setAt(out, 'household.cardPayPolicy', rough('minimum', 'cardPayPolicy', 'assumed: new charges plus the minimum on the balance carried'));
  // A cash account with no APY earns DEFAULT_APY (0.01%), unless it is
  // high-yield savings, which asks for its real rate (S-185).
  for (const a of spine.accounts || []) {
    if (a.family === 'cash' && a.type !== 'hysa' && blank(a.apy, 'DEFAULT_APY')) out = setAt(out, 'accounts.' + a.id + '.apy', rough(rules.get('DEFAULT_APY', year), 'DEFAULT_APY', DEFAULT_WORDS + ': a regular account pays about 0.01%'));
  }
  // A car with no rate of change loses DEFAULT_VEHICLE_DEPRECIATION (15%) a year,
  // which the net worth projection uses (S-196).
  for (const x of spine.accounts || []) {
    if (x.family === 'otherAssets' && x.type === 'car' && blank(x.appreciationRate, 'DEFAULT_VEHICLE_DEPRECIATION')) out = setAt(out, 'accounts.' + x.id + '.appreciationRate', rough(rules.get('DEFAULT_VEHICLE_DEPRECIATION', year), 'DEFAULT_VEHICLE_DEPRECIATION', DEFAULT_WORDS + ': a car loses about 15% of its value a year'));
  }
  // A phone with no amount costs a standard plan for one line, covered or not
  // (for a covered phone it is what it would cost you) (S-186).
  for (const e of spine.expenses || []) {
    if (isPhone(e) && blank(e.amount, 'DEFAULT_PHONE_PLAN_1')) out = setAt(out, 'expenses.' + e.id + '.amount', rough(rules.get('DEFAULT_PHONE_PLAN_1', year), 'DEFAULT_PHONE_PLAN_1', DEFAULT_WORDS + ': a standard plan for one line'));
  }
  return out;
}

// The main checking account: the first checking account, else the first cash account; never one set aside for a goal (S-228).
export function mainChecking(spine) {
  const cash = (spine.accounts || []).filter((a) => a.family === 'cash' && !isEarmarked(a));
  const c = cash.find((a) => a.type === 'checking') || cash[0];
  return c ? c.id : null;
}

// A phone bill, by its name.
export const isPhone = (e) => /\b(phone|cell|mobile|wireless)\b/i.test((e.label || '') + ' ' + (e.id || ''));

// Starting guesses (docs/DATA_LAYERS.md): a field's first value comes from, in order, the client's own number, then a
// guess from their profile, then reference data (typical amounts), then Eli's house default. Each guess says which.
// Each source is { value, source? } or null; a null value is not a guess. Returns a Fact, or a missing one.
export const GUESS_ORDER = [
  ['own', null, 'client', 'your number'],
  ['profile', 'profile', 'client', 'a guess from your profile'],
  ['reference', 'typical', 'lookedUp', 'typical for people like you'],
  ['house', 'house', 'default', DEFAULT_WORDS]
];
export function startingGuess(from = {}, { asOf = null } = {}) {
  for (const [key, prefix, by, words] of GUESS_ORDER) {
    const x = from[key];
    if (!x || x.value === null || x.value === undefined) continue;
    if (key === 'own') return fact(x.value, { kind: x.kind || 'known', asOf, source: x.source || 'typed', by: x.by || 'client' });
    return fact(x.value, { kind: 'rough', asOf, source: x.source || prefix, by, note: words });
  }
  return fact(null, { asOf });
}

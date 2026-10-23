// House defaults: values filled in when a field is blank, stored in the spine
// as rough Facts so they show yellow and land in the still-guessing list.
// Run after loading a household and after every Ledger edit (S-160, S-163).

import { fact, setAt, valueOf, getAt } from './spine.js';
import { estimateCardMinimum, DEFAULT_MIN_SOURCE } from './debt.js';

const blank = (f) => !f || f.kind === 'missing';

// A credit card with no APR gets DEFAULT_CARD_APR. That covers an intro rate
// with no rate after it too: the APR is the rate after the intro.
// A card with no minimum gets the house default minimum (S-166).
// Every debt with no due day gets DEFAULT_DUE_DAY (an IOU only when it has a
// payment). A card's statement close day is never filled in.
export function applyDefaults(spine, rules) {
  const asOf = spine.meta.asOf;
  const year = +asOf.slice(0, 4);
  const rough = (value, rule, note) => fact(value, { kind: 'rough', asOf, source: rule, note });
  let out = spine;
  for (const d of spine.debts || []) {
    const base = 'debts.' + d.id;
    if (d.type === 'credit_card' && blank(d.apr)) out = setAt(out, base + '.apr', rough(rules.get('DEFAULT_CARD_APR', year), 'DEFAULT_CARD_APR', 'house assumption until the real rate is entered'));
    // A card with no minimum gets the house default for today's balance (S-166).
    if (d.type === 'credit_card' && blank(d.minimum) && valueOf(d.balance) !== null) {
      const card = getAt(out, base);
      out = setAt(out, base + '.minimum', fact(estimateCardMinimum(card, rules, asOf, valueOf(d.balance)), { kind: 'rough', asOf, source: DEFAULT_MIN_SOURCE, note: 'house default: the larger of $40 or 1% of the balance plus a month of interest; follows the balance' }));
    }
    const paysSomething = d.type !== 'family_iou' || (valueOf(d.minimum) ?? 0) > 0;
    if (paysSomething && blank(d.dueDay)) out = setAt(out, base + '.dueDay', rough(rules.get('DEFAULT_DUE_DAY', year), 'DEFAULT_DUE_DAY', 'house assumption until the real due day is entered'));
  }
  // A cash account with no APY earns DEFAULT_APY (0.01%), unless it is
  // high-yield savings, which asks for its real rate (S-185).
  for (const a of spine.accounts || []) {
    if (a.family === 'cash' && a.type !== 'hysa' && blank(a.apy)) out = setAt(out, 'accounts.' + a.id + '.apy', rough(rules.get('DEFAULT_APY', year), 'DEFAULT_APY', 'house assumption: a regular account pays about 0.01%'));
  }
  // A phone with no amount costs a standard plan for one line, covered or not
  // (for a covered phone it is what it would cost you) (S-186).
  for (const e of spine.expenses || []) {
    if (isPhone(e) && blank(e.amount)) out = setAt(out, 'expenses.' + e.id + '.amount', rough(rules.get('DEFAULT_PHONE_PLAN_1', year), 'DEFAULT_PHONE_PLAN_1', 'house assumption: a standard plan for one line'));
  }
  return out;
}

// A phone bill, by its name.
export const isPhone = (e) => /\b(phone|cell|mobile|wireless)\b/i.test((e.label || '') + ' ' + (e.id || ''));
